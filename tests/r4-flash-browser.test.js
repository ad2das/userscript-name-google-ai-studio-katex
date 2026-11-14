async (page) => {
  // R4 flash (2026-11-13). AI Studio re-creates a whole turn on scroll in ONE mutation
  // task: tens of thousands of records plus a few hundred Markdown leaves, ~20 of them
  // inside the viewport. The driver builds in-view leaves synchronously, but it measured
  // its 50 ms budget from the observer callback's START, and the record walk alone costs
  // 120-170 ms on such a batch (measured chat A: records 67809, dirty 396, syncMs 168).
  // The budget was therefore spent before the first build: exactly one leaf was built,
  // the rest of the in-view leaves were queued, and the paint that follows the mutation
  // task showed them raw - the flash this suite pins.
  //
  // The fixture reproduces the shape without a real chat: one task replaces a turn's
  // Markdown root with many raw-Markdown leaves (all inside the viewport) and, in the
  // same task, edits a large number of unrelated text nodes so the observer's record
  // walk costs what it costs on a real re-create. The assertion is the brief's
  // constraint, measured at the first animation frame after that task: a leaf in view at
  // paint time must already be mirrored, i.e. must not show a raw `**` pair.
  const fs = require('node:fs');
  const source = fs.readFileSync(process.env.AISTUDIO_SOURCE || 'aaa.user.js', 'utf8');

  const SHELL = '<!doctype html><html><head><style>ms-cmark-node{display:contents}</style></head>' +
    '<body style="margin:0"><main role="main">' +
    '<ms-autoscroll-container id="sc" style="display:block;height:800px;overflow:auto">' +
    '<div id="turns"></div></ms-autoscroll-container></main></body></html>';

  const installHarness = () => {
    const T = window.__t = {};
    const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
    const C = () => document.createComment('');
    const add = (parent, node) => {
      const tail = parent.__tail || (parent.__tail = parent.appendChild(C()));
      parent.insertBefore(C(), tail); parent.insertBefore(node, tail); return node;
    };
    // Same nesting as the production DOM: turn > container.model > chunk > div >
    // ms-cmark-node.cmark-node > p > ms-cmark-node > span with the raw text.
    T.turn = (id, role) => {
      const turn = el('ms-chat-turn'); turn.id = id;
      const box = el('div', 'chat-turn-container ' + role + ' render');
      const vs = el('div', 'virtual-scroll-container ' + role + '-prompt-container');
      const content = el('div', 'turn-content');
      const chunk = el('ms-prompt-chunk', 'text-chunk');
      const tc = el('ms-text-chunk');
      const div = el('div');
      const root = el('ms-cmark-node', 'cmark-node');
      div.append(root); tc.append(div); chunk.append(tc); content.append(chunk); vs.append(content);
      box.append(vs); turn.append(box);
      return { turn, box, root };
    };
    // One leaf: `<p><ms-cmark-node><span>…raw **pair**…</span></ms-cmark-node></p>`. The
    // wrapper carries the text (no direct text child on the leaf, as in production) so
    // r4Mirrorable accepts it and r4FlattenMirror can flatten it.
    T.leaf = (parent, md, index) => {
      const p = add(parent, el('p'));
      p.id = 'leaf-' + index;
      const host = el('ms-cmark-node'); const span = el('span');
      span.append(document.createTextNode(md)); host.append(C(), span, C());
      p.append(C(), host, C());
      return p;
    };
    T.fill = (turnObj, count, label) => {
      for (let i = 0; i < count; i++) T.leaf(turnObj.root, label + ' ' + i + ': **항목(' + i + ')**은 확인합니다.', label + i);
    };
    const PAIR = /\*\*[^*\n]+?\*\*/;
    const range = document.createRange();
    // Visible text of a leaf (mirror included): a raw pair here means the leaf painted raw.
    T.visible = (L) => {
      let s = ''; const w = document.createTreeWalker(L, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) {
        const t = w.currentNode;
        if (!t.data || t.parentElement.closest('.katex-mathml')) continue;
        range.selectNodeContents(t);
        if (range.getClientRects().length) s += t.data;
      }
      return s;
    };
    T.ownedLeaves = (scope = document) => Array.from(scope.querySelectorAll(
      'ms-chat-turn .chat-turn-container.model ms-cmark-node.cmark-node :is(p,h1,h2,h3,h4,h5,h6,td,th)'))
      .filter((L) => !L.closest('.aisfix-m'));
    T.rawCount = (leaves) => leaves.filter((L) => PAIR.test(T.visible(L))).length;
    T.mirroredCount = (leaves) => leaves.filter((L) => !!L.querySelector('.aisfix-m')).length;
    T.inView = (leaves) => leaves.filter((L) => {
      const r = L.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight && r.height > 0;
    });
    // The unrelated text nodes whose edits pad the mutation task. Built here, during
    // setup, so their own insertion records drain long before the measured task.
    T.makePadding = (count) => {
      const pad = document.createElement('div');
      pad.style.display = 'none';
      const spots = [];
      for (let i = 0; i < count; i++) {
        const s = document.createElement('span');
        s.append(document.createTextNode('p'));
        pad.append(s);
        spots.push(s.firstChild);
      }
      document.body.append(pad);
      T.padding = spots;
    };
  };

  const run = async ({ padding, leaves, seed }) => {
    await page.setContent(SHELL);
    await page.addScriptTag({ path: 'node_modules/katex/dist/katex.min.js' });
    await page.evaluate(installHarness);
    // A long chat above the target turn, plus the target turn itself, seeded with the
    // same kind of raw leaves.
    await page.evaluate(({ seed }) => {
      const turns = document.getElementById('turns');
      for (let t = 0; t < 6; t++) {
        const turn = window.__t.turn('above-' + t, 'model');
        window.__t.fill(turn, 12, 'a' + t);
        turns.append(turn.turn);
      }
      window.__t.target = window.__t.turn('target', 'model');
      window.__t.fill(window.__t.target, seed, 'old');
      turns.append(window.__t.target.turn);
    }, { seed });
    // The padding nodes exist before the script boots, so their insertion never reaches the
    // driver: only the characterData edits inside the measured task do.
    await page.evaluate((count) => window.__t.makePadding(count), padding);
    await page.addScriptTag({ content: source });

    // One mutation task: replace the target root with `leaves` raw leaves (the turn was
    // re-created by scrolling) and edit every padding text node.
    const result = await page.evaluate(async ({ leaves }) => {
      const T = window.__t;
      const sc = document.getElementById('sc');
      // Fixture precondition, taken at the instant the measured task starts: the seeded
      // turn is fully mirrored, so the flash below can only come from the re-create. The
      // driver settles on its own schedule (boot walk, then queue slices), and a leaf that
      // is re-queued drops its mirror while it waits, so wait for a converged instant here
      // rather than a fixed delay earlier.
      const settleUntil = performance.now() + 20000;
      for (;;) {
        const owned = T.ownedLeaves(T.target.turn);
        if (owned.length === leaves && T.mirroredCount(owned) === leaves) break;
        if (performance.now() > settleUntil) {
          throw new Error('fixture did not settle: leaves=' + owned.length +
            ' mirrored=' + T.mirroredCount(owned));
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const owned0 = T.ownedLeaves(T.target.turn);
      const before = { leaves: owned0.length, mirrored: T.mirroredCount(owned0) };
      const fresh = document.createElement('ms-cmark-node');
      fresh.className = 'cmark-node';
      for (let i = 0; i < leaves; i++) {
        T.leaf(fresh, '새 문단 ' + i + ': **굵게(' + i + ')** 그리고 끝.', 'n' + i);
      }
      const t0 = performance.now();
      const frame = new Promise((resolve) => requestAnimationFrame(() => resolve(performance.now())));
      T.target.root.replaceWith(fresh);
      T.target.root = fresh;
      sc.scrollTop = T.target.turn.offsetTop;
      for (const node of T.padding) node.data = 'q' + node.data;
      const taskMs = performance.now() - t0;
      const frameAt = await frame;
      // First frame after the mutation task: whatever is still raw here paints raw.
      const owned = T.ownedLeaves(T.target.turn);
      const inView = T.inView(owned);
      const first = {
        owned: owned.length,
        inView: inView.length,
        inViewRaw: T.rawCount(inView),
        inViewMirrored: T.mirroredCount(inView),
        raw: T.rawCount(owned),
        mirrored: T.mirroredCount(owned)
      };
      await new Promise((resolve) => setTimeout(resolve, 1800));
      const owned2 = T.ownedLeaves(T.target.turn);
      const settled = {
        owned: owned2.length,
        raw: T.rawCount(owned2),
        mirrored: T.mirroredCount(owned2),
        inViewRaw: T.rawCount(T.inView(owned2))
      };
      return { before, first, settled, taskMs: Math.round(taskMs), frameDelay: Math.round(frameAt - t0) };
    }, { leaves });
    return result;
  };

  // Two shapes. All `leaves` land inside the viewport after the scroll, so every one is
  // an in-view leaf the driver should have built inside the mutation callback.
  const small = await run({ padding: 40000, leaves: 12, seed: 12 });
  const large = await run({ padding: 40000, leaves: 24, seed: 24 });

  const checks = {};
  // Self-check: the fixture is what the test claims - the target turn was fully mirrored
  // before the re-create, and the re-create put the leaves in view.
  checks.fixtureSettledBefore = small.before.leaves === 12 && small.before.mirrored === 12 &&
    large.before.leaves === 24 && large.before.mirrored === 24;
  checks.fixtureLeavesInView = small.first.inView === 12 && large.first.inView >= 20;
  // The baseline builds exactly one leaf per synchronous batch, so this is what makes the
  // first-frame assertion discriminate a real shape from a toy one.
  checks.fixtureEnoughInView = small.first.inView >= 8 && large.first.inView >= 8;
  // The constraint: no leaf in view at the paint after the mutation task may be raw.
  checks.smallFirstFrameNoRaw = small.first.inViewRaw === 0;
  checks.largeFirstFrameNoRaw = large.first.inViewRaw === 0;
  // ... and the queue still drains.
  checks.smallSettled = small.settled.raw === 0;
  checks.largeSettled = large.settled.raw === 0;

  const summary = { small, large };
  const failed = Object.entries(checks).filter(([, ok]) => ok !== true).map(([key]) => key);
  if (failed.length) throw new Error(JSON.stringify({ failed, checks, summary }));
  return { checks, summary };
}
