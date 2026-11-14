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
  const path = require('node:path');
  const source = fs.readFileSync(process.env.AISTUDIO_SOURCE || 'aaa.user.js', 'utf8');

  const SHELL = '<!doctype html><html data-aisfix-r4-debug><head><style>ms-cmark-node{display:contents}</style></head>' +
    '<body style="margin:0"><main role="main">' +
    '<ms-autoscroll-container id="sc" style="display:block;height:800px;overflow:auto">' +
    '<div id="turns"></div></ms-autoscroll-container></main></body></html>';

  /*
   * Every fixture starts by RESETTING THE JS REALM, not just the DOM.
   *
   * `page.setContent` replaces the document but keeps the window, so the userscript instance a
   * previous fixture injected stays alive with its observers attached to the old body. This suite
   * injects the script once per fixture, so without a reload N instances run at once - a state the
   * real page never reaches. They then fight: an idle instance's legacy scan repairs a later
   * fixture's native text in place (`<strong class="aistudio-md-repaired">` inside a leaf whose raw
   * `**` markers are gone), so R4's `hasRepairableContent` is false for every leaf and the page can
   * never reach the all-mirrored precondition.
   *
   * `page.goto` to the routed fixture URL creates a fresh realm (the runner installs the route on
   * this same page), so each fixture gets exactly the one instance production has.
   */
  const FIXTURE_URL = 'https://aistudio.google.com/tests/fixtures/aistudio.html';
  const resetPage = async () => {
    await page.goto(FIXTURE_URL);
    await page.setContent(SHELL);
  };

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
    // A leaf with one span per text node, so one leaf can carry many independently
    // editable text nodes (the characterData shape below needs ~2000 distinct nodes).
    // The text the leaf shows when its native children are visible: everything the driver
    // itself did not add. `**` is the only marker these fixtures use.
    T.mixedNative = (L) => {
      let s = '';
      for (const c of L.childNodes) {
        if (c.nodeType === 1 && c.classList.contains('aisfix-m')) continue;
        if (c.nodeType === 1 || c.nodeType === 3) s += c.textContent || '';
      }
      return s;
    };
    // I2: a mirror may never show text other than the repaired native text.
    T.stale = (leaves) => leaves.filter((L) => {
      if (!L.querySelector('.aisfix-m')) return false;
      return T.visible(L).replace(/\s+/g, ' ').trim() !==
        T.mixedNative(L).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
    });
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
    await resetPage();
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

  // ---- recreateBatch (W-R4J) ----
  // The production re-create is ONE observer callback carrying >= 3000 mutation records and a
  // whole turn's markdown (a few hundred leaves), with the viewport in the middle of that turn.
  // Two things must hold: at the first frame after the callback every in-view leaf is mirrored,
  // and once the queue drains every leaf is mirrored with the same output the base build produced.
  //
  // Shape, measured not assumed: leaves are appended one at a time into the connected root, so
  // every append is its own childList record; the padding text edits supply the characterData
  // records. Tall inert spacer divs between groups keep the in-view set small (~10-15 of 320, as
  // on chat A) while the turn stays several screens tall - a `div` is not a leaf, so it can never
  // enter the in-view set. Leaf text is the same shape the passing `small`/`large` fixtures use.
  const GROUP = 20;
  const recreateText = (i) => '새 문단 ' + i + ': **굵게(' + i + ')** 그리고 끝.';
  const recreateTexts = Array.from({ length: 320 }, (_, i) => recreateText(i));

  const recreateBatch = async ({ padding, group }) => {
    await resetPage();
    await page.evaluate((texts) => { globalThis.__recreateTexts = texts; }, recreateTexts);
    await page.addScriptTag({ path: 'node_modules/katex/dist/katex.min.js' });
    await page.evaluate(installHarness);
    await page.evaluate(() => {
      const turns = document.getElementById('turns');
      for (let t = 0; t < 8; t++) {
        const turn = window.__t.turn('above-' + t, 'model');
        window.__t.fill(turn, 14, 'a' + t);
        turns.append(turn.turn);
      }
      window.__t.target = window.__t.turn('target', 'model');
      window.__t.fill(window.__t.target, 40, 'old');
      turns.append(window.__t.target.turn);
      for (let t = 0; t < 8; t++) {
        const turn = window.__t.turn('below-' + t, 'model');
        window.__t.fill(turn, 14, 'b' + t);
        turns.append(turn.turn);
      }
      window.__t.texts = globalThis.__recreateTexts;
    });
    await page.evaluate((count) => window.__t.makePadding(count), padding);
    await page.addScriptTag({ content: source });

    const result = await page.evaluate(async ({ group }) => {
      const T = window.__t;
      const sc = document.getElementById('sc');
      const settleUntil = performance.now() + 20000;
      for (;;) {
        const owned = T.ownedLeaves(T.target.turn);
        if (owned.length === 40 && T.mirroredCount(owned) === 40) break;
        if (performance.now() > settleUntil) {
          const diag = {
            hosts: document.querySelectorAll('[data-aisfix-host]').length,
            mirrors: document.querySelectorAll('.aisfix-m').length,
            styles: document.querySelectorAll('style[data-aisfix-r4]').length,
            r4: globalThis.__aisfixR4 ? JSON.parse(JSON.stringify(globalThis.__aisfixR4.stats)) : null,
            docLeaves: document.querySelectorAll(
              'ms-chat-turn .chat-turn-container.model ms-cmark-node.cmark-node :is(p,h1,h2,h3,h4,h5,h6,td,th)').length,
            sample: (() => {
              const L = T.ownedLeaves(T.target.turn)[0];
              if (!L) return null;
              const directText = Array.from(L.childNodes)
                .filter((c) => c.nodeType === 3 && c.nodeValue.trim()).map((c) => c.nodeValue.slice(0, 40));
              return { html: L.outerHTML.slice(0, 400), directText,
                innerLeaves: L.querySelectorAll(
                  'p,h1,h2,h3,h4,h5,h6,td,th').length };
            })()
          };
          throw new Error('fixture did not settle: leaves=' + owned.length + ' mirrored=' + T.mirroredCount(owned) +
            ' diag=' + JSON.stringify(diag));
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const before = { leaves: T.ownedLeaves(T.target.turn).length, mirrored: T.mirroredCount(T.ownedLeaves(T.target.turn)) };
      const counts = { records: 0, callbacks: 0, childList: 0, characterData: 0 };
      const counter = new MutationObserver((recs) => {
        counts.callbacks += 1;
        counts.records += recs.length;
        for (const r of recs) { if (r.type === 'childList') counts.childList += 1; else if (r.type === 'characterData') counts.characterData += 1; }
      });
      counter.observe(document.body, { childList: true, characterData: true, subtree: true });

      const t0 = performance.now();
      const frame = new Promise((resolve) => requestAnimationFrame(() => resolve(performance.now())));
      // Replace the root with an empty one (one record), then append each leaf and spacer while
      // connected, so every append is its own childList record in this same task.
      const fresh = document.createElement('ms-cmark-node');
      fresh.className = 'cmark-node';
      T.target.root.replaceWith(fresh);
      T.target.root = fresh;
      for (let i = 0; i < T.texts.length; i++) {
        T.leaf(fresh, T.texts[i], 'r' + i);
        if ((i + 1) % group === 0) {
          const spacer = document.createElement('div');
          spacer.style.height = '600px';
          fresh.append(spacer);
        }
      }
      // Viewport in the middle of the re-created turn.
      sc.scrollTop = Math.max(0, T.target.turn.offsetTop - Math.round((sc.clientHeight - T.target.turn.offsetHeight) / 2));
      for (const node of T.padding) node.data = 'q' + node.data;
      const taskMs = performance.now() - t0;
      const frameAt = await frame;
      counter.disconnect();
      const owned = T.ownedLeaves(T.target.turn);
      const inView = T.inView(owned);
      const first = {
        owned: owned.length, inView: inView.length,
        inViewRaw: T.rawCount(inView), inViewMirrored: T.mirroredCount(inView),
        raw: T.rawCount(owned), mirrored: T.mirroredCount(owned)
      };
      const drainUntil = performance.now() + 40000;
      for (;;) {
        const now = T.ownedLeaves(T.target.turn);
        if (T.rawCount(now) === 0 && T.mirroredCount(now) === T.texts.length) break;
        if (performance.now() > drainUntil) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const owned2 = T.ownedLeaves(T.target.turn);
      const settled = { owned: owned2.length, raw: T.rawCount(owned2), mirrored: T.mirroredCount(owned2), inViewRaw: T.rawCount(T.inView(owned2)) };
      const mirrors = owned2.map((L) => {
        const m = L.querySelector('.aisfix-m');
        return { text: T.visible(L).replace(/\s+/g, ' ').trim(), html: m ? m.outerHTML : null };
      });
      return { before, counts, first, settled, mirrors, taskMs: Math.round(taskMs), frameDelay: Math.round(frameAt - t0) };
    }, { group });

    return result;
  };


  const recreate = await recreateBatch({ padding: 6000, group: GROUP });

  // ---- bulkMixedEdit (W-R4M) ----
  // The invariant W-R4J's leaf sweep lost: no stale mirror (I2). ONE mutation task re-creates
  // turn A (so the batch takes the bulk path and its added subtree supplies the sweep's scopes)
  // AND, in already-mirrored leaves of turn B - a different root, which the batch adds nothing
  // to - (i) rewrites a text node's data, (ii) replaces a text node, (iii) appends raw
  // `**굵게**` markers. A sweep of A's added subtree cannot see any of those three, so a build
  // that re-checks only its own scopes leaves B's mirrors showing the old text.
  //
  // Variant 2 is the same gap without any added element: 2423 characterData records, 2401 of them
  // in turn A and the last 22 in turn B. That split is not arbitrary - the removed sampling read
  // `stride = floor(2423/24) = 100`, so every sampled index (0, 100, ... 2400) lands inside turn
  // A, the sampler "proves" A is the common root, and B is never looked at. final1's exact walk
  // and the fix both catch all 2423.
  const MIXED_B = ['oldB2', 'oldB3', 'oldB4'];
  const bulkMixedEdit = async ({ padding, leavesA, variant }) => {
    await resetPage();
    await page.addScriptTag({ path: 'node_modules/katex/dist/katex.min.js' });
    await page.evaluate(installHarness);
    await page.evaluate(() => {
      const T = window.__t;
      const turns = document.getElementById('turns');
      for (let t = 0; t < 4; t++) {
        const turn = T.turn('above-' + t, 'model');
        T.fill(turn, 10, 'a' + t);
        turns.append(turn.turn);
      }
      window.__t.a = window.__t.turn('mixed-a', 'model');
      window.__t.fill(window.__t.a, 30, 'oldA');
      turns.append(window.__t.a.turn);
      window.__t.b = window.__t.turn('mixed-b', 'model');
      window.__t.fill(window.__t.b, 30, 'oldB');
      turns.append(window.__t.b.turn);
      for (let t = 0; t < 4; t++) {
        const turn = T.turn('below-' + t, 'model');
        T.fill(turn, 10, 'b' + t);
        turns.append(turn.turn);
      }
    });
    await page.evaluate((count) => { if (count) window.__t.makePadding(count); }, padding);
    await page.addScriptTag({ content: source });

    const result = await page.evaluate(async ({ leavesA, variant, bIds }) => {
      const T = window.__t;
      const all = () => T.ownedLeaves();
      const settle = async (predicate, ms) => {
        const until = performance.now() + ms;
        for (;;) {
          if (predicate()) return true;
          if (performance.now() > until) return false;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      };
      // Fixture precondition: both turns fully mirrored before the measured task.
      const ready = await settle(() => {
        const a = T.ownedLeaves(T.a.turn); const b = T.ownedLeaves(T.b.turn);
        return a.length === 30 && T.mirroredCount(a) === 30 && b.length === 30 && T.mirroredCount(b) === 30;
      }, 20000);
      const before = {
        ready,
        a: { leaves: T.ownedLeaves(T.a.turn).length, mirrored: T.mirroredCount(T.ownedLeaves(T.a.turn)) },
        b: { leaves: T.ownedLeaves(T.b.turn).length, mirrored: T.mirroredCount(T.ownedLeaves(T.b.turn)) },
        stale: T.stale(all()).length
      };
      const counter = new MutationObserver(() => {});
      counter.observe(document.body, { childList: true, characterData: true, subtree: true });

      const t0 = performance.now();
      const frame = new Promise((resolve) => requestAnimationFrame(() => resolve(performance.now())));
      if (variant === 'add') {
        // Turn A: re-create the whole Markdown root, one append per leaf.
        const fresh = document.createElement('ms-cmark-node');
        fresh.className = 'cmark-node';
        T.a.root.replaceWith(fresh);
        T.a.root = fresh;
        for (let i = 0; i < leavesA; i++) {
          T.leaf(fresh, '새 문단 ' + i + ': **굵게(' + i + ')** 그리고 끝.', 'r' + i);
        }
      } else {
        // Turn A: 2401 in-place text edits, round-robin over its leaves.
        const nodes = [];
        for (const leaf of T.ownedLeaves(T.a.turn)) {
          for (const span of leaf.querySelectorAll('span')) {
            if (span.firstChild && span.firstChild.nodeType === 3) nodes.push(span.firstChild);
          }
        }
        for (let i = 0; i < 2401; i++) {
          const node = nodes[i % nodes.length];
          const base = node.__base || (node.__base = node.data);
          node.data = base + (i % 2 ? ' 가' : ' 나');
        }
      }
      if (variant === 'add') {
        for (const node of T.padding) node.data = 'q' + node.data;
        // Turn B: the three in-place edits, in mirrored leaves of a root this batch never re-created.
        const one = document.getElementById('leaf-' + bIds[0]);
        const two = document.getElementById('leaf-' + bIds[1]);
        const three = document.getElementById('leaf-' + bIds[2]);
        const oneText = one.querySelector('span').firstChild;
        oneText.data = 'B 하나: **바뀐(1)** 끝';
        const twoSpan = two.querySelector('span');
        twoSpan.replaceChild(document.createTextNode('B 둘: **바뀐(2)** 끝'), twoSpan.firstChild);
        three.querySelector('span').append(document.createTextNode('**굵게**'));
      } else {
        // Turn B: the last 22 records, all beyond the removed sampler's last index (2400).
        const nodes = [];
        for (const leaf of T.ownedLeaves(T.b.turn)) {
          for (const span of leaf.querySelectorAll('span')) {
            if (span.firstChild && span.firstChild.nodeType === 3) nodes.push(span.firstChild);
          }
        }
        for (let i = 0; i < 22; i++) {
          const node = nodes[i % nodes.length];
          const base = node.__base || (node.__base = node.data);
          node.data = base + (i % 2 ? ' 다' : ' 라');
        }
      }
      // Exact record count of this task: drained before the mutation checkpoint runs any observer.
      const own = counter.takeRecords();
      counter.disconnect();
      let childList = 0; let characterData = 0;
      for (const record of own) {
        if (record.type === 'childList') childList += 1;
        else if (record.type === 'characterData') characterData += 1;
      }
      const counts = { records: own.length, childList, characterData };
      const taskMs = performance.now() - t0;
      const frameAt = await frame;

      const bState = () => bIds.map((id) => {
        const leaf = document.getElementById('leaf-' + id);
        const mirror = leaf && leaf.querySelector('.aisfix-m');
        return {
          id,
          mirror: !!mirror,
          text: leaf ? T.visible(leaf).replace(/\s+/g, ' ').trim() : null,
          native: leaf ? T.mixedNative(leaf).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim() : null,
          raw: leaf ? /\*\*/.test(T.visible(leaf)) : null,
          bold: mirror ? Array.from(mirror.querySelectorAll('strong')).map((s) => s.textContent) : []
        };
      });
      const firstFrame = { stale: T.stale(all()).length, b: bState() };
      // After idle: every mirror must agree with its own native text, and B's three must exist.
      const converged = await settle(() => {
        if (T.stale(all()).length) return false;
        return bState().every((entry) => entry.mirror && entry.text === entry.native);
      }, 30000);
      const after = { stale: T.stale(all()).length, b: bState(), converged };
      return {
        before, counts, firstFrame, after,
        taskMs: Math.round(taskMs), frameDelay: Math.round(frameAt - t0),
        leaves: { a: T.ownedLeaves(T.a.turn).length, b: T.ownedLeaves(T.b.turn).length }
      };
    }, { leavesA, variant, bIds: MIXED_B });

    return result;
  };

  const mixedAdd = await bulkMixedEdit({ padding: 2200, leavesA: 120, variant: 'add' });
  const mixedNoAdd = await bulkMixedEdit({ padding: 0, leavesA: 0, variant: 'noAdd' });
  const mixed = { add: mixedAdd, noAdd: mixedNoAdd };

  // Golden: the mirror output the base build produces for these exact leaves. Written once by
  // R4_RECREATE_GOLDEN_OUT=<path> against base-final1, then compared on every run.
  const goldenPath = path.join(__dirname, 'fixtures/r4-recreate-golden.json');
  const goldenOut = process.env.R4_RECREATE_GOLDEN_OUT;
  let goldenMismatch = null;
  if (goldenOut) {
    fs.writeFileSync(goldenOut, JSON.stringify(recreate.mirrors, null, 1));
    goldenMismatch = null;
  } else {
    const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
    if (golden.length !== recreate.mirrors.length) {
      goldenMismatch = { count: golden.length, got: recreate.mirrors.length };
    } else {
      for (let i = 0; i < golden.length; i++) {
        if (golden[i].html !== recreate.mirrors[i].html || golden[i].text !== recreate.mirrors[i].text) {
          goldenMismatch = {
            index: i, text: recreate.mirrors[i].text.slice(0, 80),
            goldenHtml: (golden[i].html || '').slice(0, 400), runHtml: (recreate.mirrors[i].html || '').slice(0, 400)
          };
          break;
        }
      }
    }
  }

  checks.fixtureRecreateBefore = recreate.before.leaves === 40 && recreate.before.mirrored === 40;
  checks.fixtureRecreateShape = recreate.counts.records >= 3000 && recreate.counts.childList >= 300 &&
    recreate.counts.characterData >= 3000 && recreate.settled.owned === recreateTexts.length;
  checks.fixtureRecreateInView = recreate.first.inView >= 6 && recreate.first.inView < 60;
  checks.recreateFirstFrameInViewMirrored = recreate.first.inViewMirrored === recreate.first.inView && recreate.first.inViewRaw === 0;
  checks.recreateSettled = recreate.settled.raw === 0 && recreate.settled.mirrored === recreateTexts.length &&
    recreate.settled.inViewRaw === 0;
  checks.recreateMirrorMatchesGolden = goldenMismatch === null;

  // ---- bulkMixedEdit (W-R4M) ----
  // Both variants must see every record of the batch. The three turn-B leaves were edited in place
  // in a root the batch added nothing to; after idle their mirrors must show the new native text,
  // the appended `**굵게**` must be repaired, and no mirror anywhere may disagree with its leaf.
  const mixedOk = (run, hasAppendedBold) => {
    const b = run.after.b;
    const checksForRun = {
      fixtureReady: run.before.ready === true && run.before.stale === 0 &&
        run.before.a.mirrored === 30 && run.before.b.mirrored === 30,
      fixtureBulk: run.counts.records >= 2000,
      aSettled: run.after.stale === 0 && run.after.converged === true,
      bTextUpdated: b.every((entry) => entry.mirror && entry.text === entry.native),
      bRawRepaired: b.every((entry) => entry.raw === false)
    };
    // (iii) is an add-variant edit: the no-add variant only rewrites text nodes, so it has no
    // appended `**굵게**` to repair and asserting one there would test the fixture, not the fix.
    if (hasAppendedBold) checksForRun.bAppendedBoldRepaired = b[2].bold.includes('굵게');
    return checksForRun;
  };
  const mixedChecks = { add: mixedOk(mixedAdd, true), noAdd: mixedOk(mixedNoAdd, false) };
  checks.mixedAddAllRecords = Object.values(mixedChecks.add).every(Boolean);
  checks.mixedNoAddAllRecords = Object.values(mixedChecks.noAdd).every(Boolean);
  // The shape has to be the gap: variant 1 must carry added elements, variant 2 none at all.
  checks.mixedAddBulkShape = mixedAdd.counts.childList >= 120 && mixedAdd.counts.characterData >= 2000;
  checks.mixedNoAddBulkShape = mixedNoAdd.counts.childList === 0 && mixedNoAdd.counts.characterData >= 2000;
  const summary = { small, large,
    recreate: { before: recreate.before, counts: recreate.counts, first: recreate.first, settled: recreate.settled, taskMs: recreate.taskMs, frameDelay: recreate.frameDelay, golden: goldenMismatch },
    mixed: {
      add: { counts: mixedAdd.counts, before: mixedAdd.before, firstFrame: mixedAdd.firstFrame, after: mixedAdd.after, taskMs: mixedAdd.taskMs, leaves: mixedAdd.leaves },
      noAdd: { counts: mixedNoAdd.counts, before: mixedNoAdd.before, firstFrame: mixedNoAdd.firstFrame, after: mixedNoAdd.after, taskMs: mixedNoAdd.taskMs, leaves: mixedNoAdd.leaves },
      checks: mixedChecks
    } };
  const failed = Object.entries(checks).filter(([, ok]) => ok !== true).map(([key]) => key);
  if (failed.length) {
    fs.mkdirSync('output/playwright', { recursive: true });
    fs.writeFileSync('output/playwright/recreate-failure.json', JSON.stringify({ failed, checks, summary }, null, 1));
    throw new Error(JSON.stringify({ failed, checks, summary }));
  }
  return { checks, summary };
}
