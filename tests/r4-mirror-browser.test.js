async (page) => {
  // R4 (2026-11-12). AI Studio rewrites its own Markdown nodes in place ~60 times a second while
  // it streams (typewriter + @for track $index), and re-creates whole turns on scroll. Repairs
  // inside its Markdown roots (ms-cmark-node.cmark-node in a model turn) must be visible in the
  // same frame the raw text appears, must never change AI Studio's own nodes, and must end in the
  // same visible result as the in-place engine. The fake renderer below copies the production
  // shape (r4-domdump 2026-11-12): hosts are display:contents, comment anchors, in-place text
  // updates, branch swaps when a pair closes, KaTeX filled ~100 ms after ms-katex appears.
  const fs = require('node:fs');
  const source = fs.readFileSync(process.env.AISTUDIO_SOURCE || 'aaa.user.js', 'utf8');

  const DOC = [
    { kind: 'p', md: '첫 문단입니다. **굵은 글씨(괄호)**은 조사 앞에서 깨집니다. 그리고 정상 **굵게** 도 있습니다. **두 번째(괄호)**도 깨집니다.' },
    { kind: 'h2', md: '소제목 **제목 안(괄호)**도' },
    { kind: 'ul', items: ['항목 하나: **손상차손(당기비용)**은 얼마인가?', '항목 둘: 수식 $x = 3{,}000 \\times 2.4868$ 과 **리스부채(현재가치)**를 봅니다.'] },
    { kind: 'table', rows: [['구분', '금액'], ['**리스부채(PV)**는', '**₩7,460,400**'], ['사용권자산', '설명 **셀 안(괄호)**도 깨짐']] },
    { kind: 'quote', md: '인용문 안의 **강조(인용)**도 확인합니다.' },
    { kind: 'p', md: '마지막 문단: 그리고 **끝(마침)**입니다. 긴 꼬리 문장을 덧붙여 스트리밍 시간을 늘립니다.' }
  ];

  const SHELL = '<!doctype html><html><head><style>ms-cmark-node{display:contents}</style></head>' +
    '<body style="margin:0"><main role="main"><ms-autoscroll-container id="sc" style="display:block;height:800px;overflow:auto">' +
    '<div id="turns"></div></ms-autoscroll-container>' +
    '<ms-prompt-box><textarea></textarea><button class="run-button">Run</button></ms-prompt-box></main></body></html>';

  const installHarness = (DOC) => {
    const T = window.__t = {};
    const C = () => document.createComment('');
    const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
    const ws = (c) => c === undefined || /\s/.test(c);
    const punct = (c) => c !== undefined && /[\p{P}\p{S}]/u.test(c);
    // CommonMark-like: `**` pairs by flanking rules with an opener stack; `$..$` inline math.
    T.parse = (s) => {
      const math = [];
      for (let i = 0; i < s.length; i++) {
        if (s[i] !== '$') continue;
        const j = s.indexOf('$', i + 1);
        if (j > i + 1) { math.push([i, j + 1]); i = j; } else break;
      }
      const inMath = (k) => math.some(([a, b]) => k >= a && k < b);
      const pairs = []; const stack = [];
      for (let d = 0; d < s.length - 1; d++) {
        if (s[d] !== '*' || s[d + 1] !== '*' || inMath(d)) continue;
        const prev = s[d - 1], next = s[d + 2];
        const left = !ws(next) && (!punct(next) || ws(prev) || punct(prev));
        const right = !ws(prev) && (!punct(prev) || ws(next) || punct(next));
        if (right && stack.length) pairs.push([stack.pop(), d]);
        else if (left) stack.push(d);
        d++;
      }
      const runs = []; let buf = '';
      const flush = () => { if (buf) { runs.push({ type: 'text', text: buf }); buf = ''; } };
      for (let i = 0; i < s.length;) {
        const m = math.find(([a]) => a === i);
        if (m) { flush(); runs.push({ type: 'katex', text: s.slice(m[0] + 1, m[1] - 1) }); i = m[1]; continue; }
        const p = pairs.find(([a]) => a === i);
        if (p) { flush(); runs.push({ type: 'strong', text: s.slice(p[0] + 2, p[1]) }); i = p[1] + 2; continue; }
        buf += s[i]; i++;
      }
      flush();
      return runs;
    };
    const makeRun = (run) => {
      if (run.type === 'text') { const s = el('span'); s.append(document.createTextNode(run.text)); return s; }
      if (run.type === 'strong') {
        const st = el('strong'); const h = el('ms-cmark-node'); const s = el('span');
        s.append(document.createTextNode(run.text)); h.append(C(), s, C()); st.append(h); return st;
      }
      const k = el('ms-katex', 'inline'); const pre = el('pre'); const code = el('code', 'rendered');
      pre.append(code); k.append(pre);
      setTimeout(() => { code.innerHTML = katex.renderToString(run.text, { throwOnError: false }); }, 100);
      return k;
    };
    const textNodeOf = (v) => (v.type === 'strong' ? v.node.querySelector('span').firstChild : v.node.firstChild);
    // In-place reconcile by index (Angular @for track $index): same type -> characterData update,
    // other type -> branch swap (remove old view, insert new one at the same anchor).
    T.renderRuns = (H, runs) => {
      const views = H.__views || (H.__views = []);
      const tail = H.__tail || (H.__tail = H.appendChild(C()));
      runs.forEach((run, j) => {
        const v = views[j];
        if (v && v.type === run.type && (run.type !== 'katex' || v.text === run.text)) {
          if (run.type !== 'katex') { const t = textNodeOf(v); if (t.data !== run.text) t.data = run.text; }
          v.text = run.text;
          return;
        }
        const node = makeRun(run); const anchor = C();
        if (v) { H.insertBefore(anchor, v.anchor); H.insertBefore(node, v.anchor); v.anchor.remove(); v.node.remove(); }
        else { H.insertBefore(anchor, tail); H.insertBefore(node, tail); }
        views[j] = { type: run.type, text: run.text, node, anchor };
      });
      while (views.length > runs.length) { const v = views.pop(); v.anchor.remove(); v.node.remove(); }
    };
    const add = (parent, node) => {
      const tail = parent.__tail || (parent.__tail = parent.appendChild(C()));
      parent.insertBefore(C(), tail); parent.insertBefore(node, tail); return node;
    };
    const leafHost = (leaf) => { const H = el('ms-cmark-node'); leaf.append(C(), H, C()); return H; };
    T.segments = () => {
      const out = [];
      DOC.forEach((b, i) => {
        if (b.kind === 'ul') b.items.forEach((md, k) => out.push({ b: i, k, md }));
        else if (b.kind === 'table') b.rows.forEach((row, r) => row.forEach((md, c) => out.push({ b: i, k: r * 100 + c, md })));
        else out.push({ b: i, k: 0, md: b.md });
      });
      return out;
    };
    T.total = () => T.segments().reduce((n, s) => n + s.md.length, 0);
    // Renders the first `revealed` characters of DOC into `root` (ms-cmark-node.cmark-node).
    T.render = (root, revealed) => {
      const st = root.__st || (root.__st = { blocks: {}, leaves: {} });
      let left = revealed;
      for (const seg of T.segments()) {
        if (left <= 0) break;
        const text = seg.md.slice(0, left); left -= seg.md.length;
        const b = DOC[seg.b];
        let block = st.blocks[seg.b];
        if (!block) {
          if (b.kind === 'p' || b.kind === 'h2') block = { el: add(root, el(b.kind)) };
          else if (b.kind === 'quote') { const q = el('blockquote'); const inner = el('ms-cmark-node'); q.append(inner); block = { el: add(root, q), inner }; }
          else if (b.kind === 'ul') { const u = el('ul'); const inner = el('ms-cmark-node'); u.append(inner); block = { el: add(root, u), inner }; }
          else { const tc = el('div', 'table-container'); const t = el('table'); const inner = el('ms-cmark-node'); t.append(inner); tc.append(t); block = { el: add(root, tc), inner, rows: {} }; }
          st.blocks[seg.b] = block;
        }
        const key = seg.b + ':' + seg.k;
        let H = st.leaves[key];
        if (!H) {
          let leaf;
          if (b.kind === 'p' || b.kind === 'h2') leaf = block.el;
          else if (b.kind === 'quote') leaf = add(block.inner, el('p'));
          else if (b.kind === 'ul') { const li = el('li'); const lih = el('ms-cmark-node'); li.append(lih); add(block.inner, li); leaf = add(lih, el('p')); }
          else {
            const r = Math.floor(seg.k / 100);
            if (!block.rows[r]) { const tr = el('tr', r === 0 ? 'table-header' : ''); const trh = el('ms-cmark-node'); tr.append(trh); add(block.inner, tr); block.rows[r] = trh; }
            leaf = add(block.rows[r], el('td'));
          }
          H = st.leaves[key] = leafHost(leaf);
        }
        T.renderRuns(H, T.parse(text));
      }
    };
    T.turn = (id, role, rootClass = 'cmark-node') => {
      const turn = el('ms-chat-turn'); turn.id = id;
      const box = el('div', 'chat-turn-container ' + role + ' render');
      const vs = el('div', 'virtual-scroll-container ' + role + '-prompt-container');
      vs.setAttribute('data-turn-role', role === 'model' ? 'Model' : 'User');
      const content = el('div', 'turn-content'); const chunk = el('ms-prompt-chunk', 'text-chunk');
      const tc = el('ms-text-chunk'); const div = el('div'); const root = el('ms-cmark-node', rootClass);
      div.append(root); tc.append(div); chunk.append(tc); content.append(chunk); vs.append(content); box.append(vs); turn.append(box);
      return { turn, box, root };
    };
    T.addTurns = () => {
      const turns = document.getElementById('turns');
      const user = T.turn('turn-user', 'user');
      const up = add(user.root, el('p')); T.renderRuns(leafHost(up), T.parse('사용자 **입력(원문)**은 그대로'));
      up.id = 'user-leaf';
      const legacy = T.turn('turn-legacy', 'model', '');
      const lp = add(legacy.root, el('p')); T.renderRuns(leafHost(lp), T.parse('레거시 **모양(구조)**은 그대로 수리'));
      lp.id = 'legacy-leaf';
      const model = T.turn('turn-model', 'model');
      const g1 = add(model.root, el('p')); g1.id = 'guard-button'; g1.setAttribute('data-guard', '');
      const gh = leafHost(g1); T.renderRuns(gh, T.parse('버튼 **안전(확인)**은 '));
      const btn = el('button'); btn.textContent = 'x'; gh.insertBefore(btn, gh.__tail);
      const g2 = add(model.root, el('p')); g2.id = 'guard-text'; g2.setAttribute('data-guard', '');
      g2.append(document.createTextNode('직접 **텍스트(노드)**는 그대로'));
      turns.append(user.turn, legacy.turn, model.turn);
      T.model = model;
    };
    T.stream = (perStep) => new Promise((resolve) => {
      const total = T.total(); let n = 0;
      T.model.box.setAttribute('aria-busy', 'true');
      const step = () => {
        n = Math.min(total, n + perStep);
        T.render(T.model.root, n);
        if (n < total) setTimeout(step, 16);
        else setTimeout(() => { T.model.box.removeAttribute('aria-busy'); resolve(); }, 50);
      };
      setTimeout(step, 16);
    });
    // ---- observation (read-only) ----
    const PAIR = /\*\*[^*\n]+?\*\*/;
    const norm = (s) => s.replace(/\*/g, '').replace(/\s+/g, '');
    const range = document.createRange();
    T.visibleText = (L) => {
      let s = ''; const w = document.createTreeWalker(L, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) { const t = w.currentNode; if (!t.data || t.parentElement.closest('.katex-mathml')) continue; range.selectNodeContents(t); if (range.getClientRects().length) s += t.data; }
      return s;
    };
    T.nativeText = (L) => {
      let s = ''; const w = document.createTreeWalker(L, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) { const t = w.currentNode; if (!t.parentElement.closest('.aisfix-m, .katex-mathml')) s += t.data; }
      return s;
    };
    T.ownedLeaves = (scope = document) => Array.from(scope.querySelectorAll(
      'ms-chat-turn .chat-turn-container.model ms-cmark-node.cmark-node :is(p,h1,h2,h3,h4,h5,h6,td,th)'))
      .filter((L) => !L.closest('.aisfix-m'));
    T.leafCheck = (L) => {
      const vis = T.visibleText(L);
      return { raw: !L.hasAttribute('data-guard') && PAIR.test(vis), lost: norm(vis) !== norm(T.nativeText(L)), vis };
    };
    T.signature = () => T.ownedLeaves(T.model.turn).filter((L) => !L.hasAttribute('data-guard')).map((L) => ({
      text: T.visibleText(L).replace(/\s+/g, ' ').trim(),
      bold: Array.from(L.querySelectorAll('strong, b')).filter((b) => b.getClientRects().length && !b.parentElement.closest('strong, b'))
        .map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim())
    }));
    T.serialize = (root) => {
      const c = root.cloneNode(true);
      c.querySelectorAll('.aisfix-m').forEach((m) => m.remove());
      c.querySelectorAll('.aistudio-table-scroll').forEach((w) => w.replaceWith(...w.childNodes));
      for (const e of [c, ...c.querySelectorAll('*')]) {
        for (const a of Array.from(e.attributes)) if (/^data-(aistudio|aisfix)/.test(a.name)) e.removeAttribute(a.name);
        for (const k of Array.from(e.classList)) if (/^aistudio-/.test(k)) e.classList.remove(k);
        if (e.hasAttribute('class') && !e.getAttribute('class').trim()) e.removeAttribute('class');
      }
      return c.innerHTML;
    };
    const P = T.probe = { frames: 0, rawFrames: 0, lostFrames: 0, firstRaw: null, firstLost: null, hostsMax: 0, gaps: [],
      highlightFrames: 0, guardHosted: 0, userHosted: 0, phase: 'boot', byPhase: {}, on: false, last: 0, scope: null };
    const frame = (ts) => {
      if (!P.on) return;
      if (P.last) P.gaps.push(Math.round(ts - P.last));
      P.last = ts; P.frames++;
      const ph = P.byPhase[P.phase] || (P.byPhase[P.phase] = { frames: 0, raw: 0, lost: 0 });
      ph.frames++;
      let raw = false, lost = false;
      for (const L of T.ownedLeaves(P.scope || document)) {
        const r = T.leafCheck(L);
        if (r.raw && !raw) { raw = true; if (!P.firstRaw) P.firstRaw = { phase: P.phase, text: r.vis.slice(0, 60) }; }
        if (r.lost && !lost) { lost = true; if (!P.firstLost) P.firstLost = { phase: P.phase, vis: r.vis.slice(0, 60), nat: T.nativeText(L).slice(0, 60) }; }
      }
      if (raw) { P.rawFrames++; ph.raw++; }
      if (lost) { P.lostFrames++; ph.lost++; }
      P.hostsMax = Math.max(P.hostsMax, document.querySelectorAll('[data-aisfix-host]').length);
      if (document.querySelector('[data-guard][data-aisfix-host]')) P.guardHosted++;
      if (document.querySelector('.chat-turn-container.user [data-aisfix-host], .chat-turn-container.user .aisfix-m')) P.userHosted++;
      if (globalThis.CSS?.highlights?.get?.('aistudio-live-emphasis')?.size) P.highlightFrames++;
      requestAnimationFrame(frame);
    };
    T.startProbe = () => { P.on = true; P.last = 0; requestAnimationFrame(frame); };
    T.stopProbe = () => { P.on = false; };
    T.recreate = () => {
      const fresh = el('ms-cmark-node', 'cmark-node');
      for (const g of T.model.root.querySelectorAll(':scope > [data-guard]')) add(fresh, g.cloneNode(true));
      T.render(fresh, T.total());
      T.model.root.replaceWith(fresh);
      T.model.root = fresh;
    };
    // A long turn inserted at once (AI Studio re-creating a turn on scroll): leaves in view must be
    // repaired in the first frame; the rest soon, without one long task.
    T.bigTurn = (n) => new Promise((resolve) => {
      const big = T.turn('turn-big', 'model');
      for (let i = 0; i < n; i++) T.renderRuns(leafHost(add(big.root, el('p'))), T.parse('문단 ' + i + ': **항목(' + i + ')**은 확인합니다.'));
      const sc = document.getElementById('sc');
      const t0 = performance.now();
      document.getElementById('turns').append(big.turn);
      sc.scrollTop = big.turn.offsetTop + 200;
      const view = sc.getBoundingClientRect();
      requestAnimationFrame(() => {
        const delay = performance.now() - t0;
        let inView = 0, inViewRaw = 0, inViewLost = 0;
        for (const L of T.ownedLeaves(big.turn)) {
          const r = L.getBoundingClientRect();
          if (r.bottom < view.top || r.top > view.bottom) continue;
          inView++;
          const c = T.leafCheck(L); if (c.raw) inViewRaw++; if (c.lost) inViewLost++;
        }
        const gaps = []; let last = performance.now();
        const tick = () => {
          const now = performance.now(); gaps.push(Math.round(now - last)); last = now;
          if (now - t0 < 1500) { requestAnimationFrame(tick); return; }
          let raw = 0, lost = 0;
          for (const L of T.ownedLeaves(big.turn)) { const c = T.leafCheck(L); if (c.raw) raw++; if (c.lost) lost++; }
          resolve({ delay: Math.round(delay), inView, inViewRaw, inViewLost, raw, lost, maxGap: Math.max(...gaps), leaves: T.ownedLeaves(big.turn).length });
        };
        requestAnimationFrame(tick);
      });
    });
  };

  const runMode = async (mode) => {
    await page.setContent(SHELL);
    await page.addScriptTag({ path: 'node_modules/katex/dist/katex.min.js' });
    await page.evaluate(installHarness, DOC);
    await page.evaluate(() => window.__t.addTurns());
    if (mode === 'legacy') await page.evaluate(() => document.documentElement.setAttribute('data-aisfix-r4-off', ''));
    if (mode !== 'none') await page.addScriptTag({ content: source });
    await page.waitForTimeout(700);
    await page.evaluate(() => { window.__t.probe.phase = 'stream'; window.__t.probe.scope = window.__t.model.turn; window.__t.startProbe(); });
    await page.evaluate(() => window.__t.stream(4));
    await page.evaluate(() => { window.__t.probe.phase = 'settle'; });
    await page.waitForTimeout(2500);
    const settled = await page.evaluate(() => {
      const T = window.__t;
      const table = T.model.root.querySelector('table');
      const user = document.getElementById('user-leaf');
      const legacy = document.getElementById('legacy-leaf');
      return {
        serial: T.serialize(T.model.root),
        signature: T.signature(),
        tableWrapped: !!table?.parentElement?.matches('.aistudio-table-scroll'),
        userText: T.visibleText(user),
        legacyHosted: !!document.querySelector('#turn-legacy [data-aisfix-host], #turn-legacy .aisfix-m'),
        legacyRaw: /\*\*[^*\n]+?\*\*/.test(T.visibleText(legacy)),
        guardsHosted: document.querySelectorAll('[data-guard][data-aisfix-host]').length,
        hosts: document.querySelectorAll('[data-aisfix-host]').length
      };
    });
    let recreate = null, big = null;
    if (mode !== 'none') {
      await page.evaluate(() => { window.__t.probe.phase = 'recreate'; window.__t.recreate(); });
      await page.waitForTimeout(1200);
      recreate = await page.evaluate(() => window.__t.probe.byPhase.recreate || null);
    }
    if (mode === 'r4') {
      await page.evaluate(() => { window.__t.probe.phase = 'big'; window.__t.probe.scope = window.__t.model.turn; });
      big = await page.evaluate(() => window.__t.bigTurn(400));
    }
    const probe = await page.evaluate(() => { window.__t.stopProbe(); const P = window.__t.probe; return { ...P, gaps: undefined, maxGap: Math.max(0, ...P.gaps), gapsOver50: P.gaps.filter((g) => g > 50).length }; });
    return { settled, recreate, big, probe };
  };

  const none = await runMode('none');
  const r4 = await runMode('r4');
  const legacy = await runMode('legacy');

  const checks = {};
  // Self-check: the fake renderer really shows raw pairs without the script.
  checks.controlShowsRaw = none.probe.rawFrames > 0;
  // I1: no frame with a complete raw pair in an owned leaf, while streaming or after.
  checks.streamNoRaw = r4.probe.byPhase.stream?.raw === 0 && r4.probe.byPhase.settle?.raw === 0;
  // No content lost or stale: what is visible equals AI Studio's own text (pair markers aside).
  checks.noLostContent = r4.probe.lostFrames === 0;
  checks.mirrorsUsed = r4.probe.hostsMax > 0;
  // I4: AI Studio's own nodes are unchanged (structural wrappers of the in-place engine aside).
  checks.nativeUntouched = r4.settled.serial === none.settled.serial;
  // I3: final visible result equals the in-place engine on the same content.
  checks.sameAsLegacy = JSON.stringify(r4.settled.signature) === JSON.stringify(legacy.settled.signature);
  // Re-created turn (scroll): repaired in its first frame.
  checks.recreateNoRaw = !!r4.recreate && r4.recreate.frames > 0 && r4.recreate.raw === 0 && r4.recreate.lost === 0;
  // Long turn inserted at once: in-view leaves in the first frame, all leaves within 1.5 s, no long task.
  checks.bigFirstFrame = !!r4.big && r4.big.inView > 0 && r4.big.inViewRaw === 0 && r4.big.inViewLost === 0;
  checks.bigDelay = !!r4.big && r4.big.delay < 60;
  checks.bigAllRepaired = !!r4.big && r4.big.raw === 0 && r4.big.lost === 0 && r4.big.leaves === 400;
  checks.bigNoLongFrame = !!r4.big && r4.big.maxGap < 100;
  checks.streamNoLongFrame = r4.probe.maxGap < 100;
  // Guards: interactive or text-direct leaves, user turns and non-owned roots are never mirrored.
  checks.guardsNotHosted = r4.probe.guardHosted === 0 && r4.settled.guardsHosted === 0;
  checks.userUntouched = r4.probe.userHosted === 0 && /\*\*입력\(원문\)\*\*/.test(r4.settled.userText);
  checks.legacyShapeStillRepaired = !r4.settled.legacyHosted && !r4.settled.legacyRaw;
  // Structural pass still runs on owned roots.
  checks.tableWrapped = r4.settled.tableWrapped;
  // The live canvas/highlight layer stays idle for owned turns.
  checks.liveLayerIdle = r4.probe.highlightFrames === 0;
  // Kill switch: data-aisfix-r4-off keeps the in-place engine only.
  checks.killSwitch = legacy.probe.hostsMax === 0 && !legacy.settled.legacyRaw;

  const summary = {
    none: { rawFrames: none.probe.rawFrames, frames: none.probe.frames },
    r4: { byPhase: r4.probe.byPhase, firstRaw: r4.probe.firstRaw, firstLost: r4.probe.firstLost, hostsMax: r4.probe.hostsMax,
      maxGap: r4.probe.maxGap, gapsOver50: r4.probe.gapsOver50, recreate: r4.recreate, big: r4.big, settledHosts: r4.settled.hosts },
    legacy: { hostsMax: legacy.probe.hostsMax, byPhase: legacy.probe.byPhase },
    signatureDiff: checks.sameAsLegacy ? null : { r4: r4.settled.signature, legacy: legacy.settled.signature }
  };
  const failed = Object.entries(checks).filter(([, ok]) => ok !== true).map(([key]) => key);
  if (failed.length) throw new Error(JSON.stringify({ failed, checks, summary }));
  return { checks, summary };
}
