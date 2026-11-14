async (page) => {
  // W-R4C (2026-11-13). Four raw-Markdown shapes survive AI Studio's renderer and, before this fix,
  // also survived every repair pass. The fixtures reproduce the captured native DOM shape with
  // made-up text; the shapes are:
  //   (1) bold whose entire content is one link — AI Studio wraps the link in a barrier element, so
  //       the two `**` runs never meet.
  //   (2) bold inside italic where the renderer took one star of the inner `**` to close the outer
  //       italic, leaving `*A **B*` literal plus a native italic tail.
  //   (3) a later single-star italic in the same leaf (`*…*이`) — legal Markdown the old matcher
  //       refused on principle.
  //   (4) a `$$` display block split at an inner `$…$` inside `\text{}`: the delimiters vanish, the
  //       environment stays as literal text, each inner formula becomes its own inline atom.
  const fs = require('node:fs');
  const source = fs.readFileSync(process.env.AISTUDIO_SOURCE || 'aaa.user.js', 'utf8');

  const SHELL = '<!doctype html><html data-aisfix-r4-off><head><style>ms-cmark-node{display:contents}' +
    'ms-katex{display:inline-block}ms-katex.display{display:block}</style></head>' +
    '<body style="margin:0;width:412px"><main role="main"><div id="turns"></div></main></body></html>';

  const FIXTURES = {
    // (1) link swallowed by a barrier element
    'link-whole': '근거는 **[지침(제1호)](https://example.com/a)**를 따릅니다. 그리고 **[보충(부록)]**도 봅니다.',
    // Negative: a pair that spans text + link + text must stay raw (a link rule may only cover a
    // link that is the ENTIRE content between the two `**`).
    'link-boundary': '여기서는 **이 문장을 [건너뛰지](https://example.com/b) 마세요** 라고 적습니다.',
    // (2) bold inside italic, star stolen by the outer italic
    'stolen-star': '*바깥 기울임 안의 **안쪽 굵게(가)*은 어떻게 보이는가* 를 확인합니다.',
    // (3) a later single-star italic in the same leaf
    'later-italic': '*첫 강조(나)*와 *둘째 강조(다)*이 한 문단에 섞입니다.',
    // (4) display block split at an inner inline formula
    'split-environment': '$$\\begin{array}{ll}\\text{항목 (기초 $\\rightarrow$ 기말)} & 100 \\\\ \\text{합계} & 100\\end{array}$$',
    // Negative: a valid inline `$a$` next to text stays untouched.
    'inline-math': '값은 $a$ 이고 표시는 바뀌지 않습니다.',
    // Negative: an italic that the renderer already handles stays as it is.
    'native-italic': '이미 *기울임*으로 렌더된 문장입니다.',
    // Negative: the same split shape inside a plain-text Markdown fence is example text the
    // reader must see verbatim; no split repair may fire.
    'fenced-split-raw': '```latex\n\\begin{array}{l} \\text{가 $\\rightarrow$ 나} \\end{array}\n```',
    // Negative: footnote-style literal stars around parentheses are not italic.
    'footnote-stars': '금액(*)은 비용(*)과 다릅니다',
    // (5) the live chat A `<td>` leaf: math atoms and a line break precede the shape and one
    // inline-code atom sits inside B, so both must count as ordinary content.
    'stolen-star-td': '(두 번째 줄의 \u20A91,234\uACFC \uC77C\uCE58!)'
  };

  // Builds the captured native DOM shape for each fixture, by hand: no parser, so the shapes are
  // exactly the ones the live renderer produces.
  const installHarness = (FIXTURES) => {
    const T = window.__t = {};
    const C = () => document.createComment('');
    const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
    const span = (text) => { const s = el('span', 'ng-star-inserted'); s.append(document.createTextNode(text)); return s; };
    const leaf = (id, children) => {
      const p = el('p', 'ng-star-inserted');
      p.id = id;
      const host = el('ms-cmark-node');
      p.append(host);
      for (const child of children) host.append(C(), child);
      host.append(C());
      return p;
    };
    const katexAtom = (tex) => {
      const k = el('ms-katex', 'inline ng-star-inserted');
      if (tex) k.setAttribute('data-tex', tex);
      return k;
    };
    const italicSpan = (text) => {
      const s = el('span', 'ng-star-inserted');
      s.style.fontStyle = 'italic';
      const h = el('ms-cmark-node');
      const inner = span(text);
      h.append(inner);
      s.append(h);
      return s;
    };
    const link = (text, href) => {
      const a = el('a', 'ng-star-inserted');
      a.setAttribute('href', href);
      a.setAttribute('target', '_blank');
      a.append(span(text));
      return a;
    };
    T.build = () => {
      const turns = document.getElementById('turns');
      const turn = el('ms-chat-turn');
      turn.id = 'turn-model';
      const box = el('div', 'chat-turn-container model render');
      const vs = el('div', 'virtual-scroll-container model-prompt-container');
      vs.setAttribute('data-turn-role', 'Model');
      const content = el('div', 'turn-content');
      const chunk = el('ms-prompt-chunk', 'text-chunk');
      const tc = el('ms-text-chunk');
      const div = el('div');
      const root = el('ms-cmark-node', 'cmark-node');
      div.append(root); tc.append(div); chunk.append(tc); content.append(chunk); vs.append(content); box.append(vs); turn.append(box);
      turns.append(turn);
      root.append(
        C(),
        leaf('fx-link-whole', [
          span('근거는 **'),
          link('지침(제1호)', 'https://example.com/a'),
          span('**를 따릅니다. 그리고 '),
          // the same paragraph repairs its sibling pair already: proves the matcher works on text
          span('**[보충(부록)]**도 봅니다.')
        ]),
        C(),
        leaf('fx-link-boundary', [
          span('여기서는 **이 문장을 '),
          link('건너뛰지', 'https://example.com/b'),
          span(' 마세요** 라고 적습니다.')
        ]),
        C(),
        leaf('fx-stolen-star', [
          span('*바깥 기울임 안의 **안쪽 굵게(가)*'),
          italicSpan('은 어떻게 보이는가'),
          span(' 를 확인합니다.')
        ]),
        C(),
        leaf('fx-later-italic', [span('*첫 강조(나)*와 *둘째 강조(다)*이 한 문단에 섞입니다.')]),
        C(),
        leaf('fx-split-environment', [
          span('분개표:'),
          el('br'),
          el('ms-cmark-node'),
          katexAtom(''),
          span('\\begin{array}{ll}'),
          el('br'),
          el('ms-cmark-node'),
          span('\\text{항목 (기초 '),
          katexAtom('\\rightarrow'),
          span(' 기말)} & 100 \\\\'),
          el('br'),
          el('ms-cmark-node'),
          span('\\text{합계} & 100'),
          el('br'),
          el('ms-cmark-node'),
          span('\\end{array}'),
          katexAtom('')
        ]),
        C(),
        leaf('fx-inline-math', [
          span('값은 '),
          (() => { const k = katexAtom('a'); return k; })(),
          span(' 이고 표시는 바뀌지 않습니다.')
        ]),
        C(),
        leaf('fx-native-italic', [
          span('이미 '),
          italicSpan('기울임'),
          span('으로 렌더된 문장입니다.')
        ]),
        C(),
        leaf('fx-fenced-split-raw', [
          span('```latex'),
          el('br'),
          span('\\begin{array}{l} \\text{가 '),
          katexAtom('\\rightarrow'),
          span(' 나} \\end{array}'),
          el('br'),
          span('```')
        ]),
        C(),
        leaf('fx-footnote-stars', [span('금액(*)은 비용(*)과 다릅니다')]),
        C(),
        (() => {
          const tr = el('tr');
          const td = el('td', 'ng-star-inserted');
          td.id = 'fx-stolen-star-td';
          const host = el('ms-cmark-node');
          const code = el('span', 'inline-code');
          code.append(document.createTextNode('\u20A91,234'));
          host.append(C(), katexAtom(''), el('br'), katexAtom(''), el('br'),
            span('*(두 번째 줄의 **가치 '), code, span('*'), italicSpan('과 일치!)'), C());
          td.append(host);
          tr.append(td);
          return tr;
        })()
      );
      T.model = { turn, root };
    };
    // KaTeX fill for the inline atoms, as the live renderer does ~100 ms later.
    T.fillMath = () => {
      for (const k of T.model.root.querySelectorAll('ms-katex')) {
        const tex = k.getAttribute('data-tex');
        if (!tex) continue;
        const pre = el('pre');
        const code = el('code', 'rendered');
        pre.append(code);
        k.append(pre);
        code.innerHTML = katex.renderToString(tex, { throwOnError: false });
      }
    };
    // What the reader SEES: the mirror when R4 built one, else AI Studio's own nodes.
    T.visibleText = (L) => {
      const scope = L.querySelector('.aisfix-m') || L;
      const range = document.createRange();
      let s = '';
      const w = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) {
        const t = w.currentNode;
        if (!t.data || (t.parentElement && t.parentElement.closest('.katex-mathml'))) continue;
        range.selectNodeContents(t);
        if (range.getClientRects().length) s += t.data;
      }
      return s;
    };
    T.byId = (id) => document.getElementById(id);
    T.gate = (L) => (window.__r4 ? window.__r4.mirrorable(L) : null);
  };

  // Exposes the mirror entry points the user script keeps private, so this suite can drive the
  // same r4Build path the live page uses and read the intermediate decisions.
  const hookSource = (src) => src.replace(/\n  if \(document\.readyState === 'loading'\) \{[\s\S]*?\n\}\(\)\);\s*$/, `
  globalThis.__r4 = { r4Build, repairContent };
})();
`);

  await page.setContent(SHELL);
  await page.addScriptTag({ path: 'node_modules/katex/dist/katex.min.js' });
  await page.evaluate(installHarness, FIXTURES);
  await page.evaluate(() => window.__t.build());
  await page.evaluate(() => window.__t.fillMath());
  await page.addScriptTag({ content: hookSource(source.replace(/\r\n/g, '\n')) });
  await page.waitForTimeout(200);

  const before = await page.evaluate(() => {
    const T = window.__t;
    const out = {};
    for (const L of T.model.root.querySelectorAll('p')) out[L.id] = T.visibleText(L);
    return out;
  });

  // The fix runs on the mirror, exactly as on the live page.
  const after = await page.evaluate(() => {
    const T = window.__t;
    const out = {};
    for (const L of T.model.root.querySelectorAll('p')) {
      const built = window.__r4.r4Build(L);
      const mirror = L.querySelector('.aisfix-m') || L;
      out[L.id] = {
        built,
        text: T.visibleText(L),
        bold: Array.from(mirror.querySelectorAll('strong')).map((s) => (s.textContent || '').trim()),
        italic: Array.from(mirror.querySelectorAll('em')).map((s) => (s.textContent || '').trim()),
        linkBold: !!mirror.querySelector('strong > a, strong a'),
        katexDisplay: mirror.querySelectorAll('.katex-display, ms-katex.display').length,
        katexAll: mirror.querySelectorAll('.katex').length,
        rawTex: /\\\\(?:begin|end|text|rightarrow)\b/.test(mirror.textContent || ''),
        nativeItalics: mirror.querySelectorAll('span[style*="italic"], em, i').length,
        html: mirror.innerHTML.replace(/<!--[\s\S]*?-->/g, '').slice(0, 400)
      };
    }
    return out;
  });

  // The R4 path calls repairContent on the mirror clone of the p/li/td itself, so a pass that only
  // walks querySelectorAll never sees the root. That is exactly how the split-`$$` case first
  // regressed live: prove the cloned root is repaired here too.
  const rootIsRepaired = await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'mirror-root-probe';
    // repairContent only accepts a root inside a model turn.
    document.querySelector('.chat-turn-container.model').append(host);
    const p = document.createElement('p');
    const inner = document.createElement('ms-cmark-node');
    const span = (text) => { const s = document.createElement('span'); s.append(document.createTextNode(text)); return s; };
    const atom = (tex) => {
      const k = document.createElement('ms-katex');
      k.className = 'inline';
      k.setAttribute('data-tex', tex);
      return k;
    };
    inner.append(
      span('합계표:'), document.createElement('br'), document.createElement('ms-cmark-node'), atom(''),
      span('\\begin{array}{ll}\\text{줄 (기초 '), atom('\\rightarrow'), span(' 기말)} & 100 \\\\'), document.createElement('br'),
      document.createElement('ms-cmark-node'), span('\\text{합계} & 100'), document.createElement('br'),
      document.createElement('ms-cmark-node'), span('\\end{array}'), atom('')
    );
    p.append(inner);
    host.append(p);
    const clone = p.cloneNode(true);
    clone.querySelectorAll('ms-katex').forEach((k) => k.removeAttribute('id'));
    host.append(clone);
    const repaired = window.__r4.repairContent(clone);
    // Raw TeX still visible = literal text outside the rendered KaTeX (its own annotation node
    // carries the source by design, so textContent alone would always look raw).
    let visible = '';
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const t = walker.currentNode;
      if (t.parentElement && t.parentElement.closest('.katex-mathml, .katex-html')) continue;
      visible += t.nodeValue;
    }
    const out = {
      repaired,
      display: clone.querySelectorAll('.katex-display').length,
      rawTex: /\\(?:begin|end|text|rightarrow)\b/.test(visible),
      head: visible.slice(0, 90)
    };
    host.remove();
    return out;
  });
  // (5) the live chat A `<td>` leaf: `repairContent` runs on the td itself, and the inline-code
  // atom in B plus the math atoms and `br` before the leading star must survive as content.
  const stolenStarTd = await page.evaluate(() => {
    const td = window.__t.byId('fx-stolen-star-td');
    if (!td) return { ok: false, reason: 'missing' };
    const before = window.__t.visibleText(td);
    const repairedCount = window.__r4.repairContent(td);
    const text = window.__t.visibleText(td);
    const strong = td.querySelector('em strong');
    const em = td.querySelector('em[data-aistudio-note-tail]');
    const tail = td.querySelector('span[style*="italic"]');
    const once = td.innerHTML;
    window.__r4.repairContent(td);
    return {
      repairedCount,
      ok: !!strong &&
        (strong.textContent || '').includes('가치') &&
        (strong.textContent || '').includes('₩1,234') &&
        !(text || '').includes('*') &&
        td.querySelectorAll('ms-katex').length === 2 &&
        td.querySelectorAll('br').length === 2 &&
        !!em && em.nextElementSibling === tail &&
        once === td.innerHTML,
      text: (text || '').slice(0, 120),
      before: (before || '').slice(0, 120)
    };
  });
  const checks = {};
  checks.mirrorRootSplitRepaired = rootIsRepaired.display >= 1 && rootIsRepaired.rawTex === false;

  // (1) bold around a whole link: a <strong> wrapping the link, no `**` left.
  checks.linkWholeBold = after['fx-link-whole'].linkBold === true;
  checks.linkWholeClean = !/\*\*/.test(after['fx-link-whole'].text);
  checks.linkWholeSiblingRepaired = before['fx-link-whole'].includes('**[보충(부록)]**도') &&
    after['fx-link-whole'].bold.some((t) => t.includes('보충(부록)'));
  // Negative: a pair spanning text + link + text stays raw.
  checks.linkBoundaryRaw = /\*\*/.test(after['fx-link-boundary'].text) &&
    !after['fx-link-boundary'].linkBold;
  // (2) stolen star: bold and italic both applied, no stray star.
  checks.stolenStarBold = after['fx-stolen-star'].bold.some((t) => t.includes('안쪽 굵게(가)'));
  checks.stolenStarItalic = after['fx-stolen-star'].italic.some((t) => t.includes('바깥 기울임 안의'));
  checks.stolenStarClean = !/\*/.test(after['fx-stolen-star'].text);
  // (3) a later single-star italic in the same leaf still repaired.
  checks.laterItalicA = after['fx-later-italic'].italic.some((t) => t.includes('첫 강조(나)'));
  checks.laterItalicB = after['fx-later-italic'].italic.some((t) => t.includes('둘째 강조(다)'));
  checks.laterItalicClean = !/\*/.test(after['fx-later-italic'].text);
  // (4) split `$$` array: one rendered display formula, no raw TeX left.
  checks.splitEnvironmentRendered = after['fx-split-environment'].katexDisplay >= 1;
  checks.splitEnvironmentClean = !after['fx-split-environment'].rawTex;
  // Negatives: inline `$a$` and an already-rendered italic are unchanged.
  checks.inlineMathUnchanged = after['fx-inline-math'].built === 0 &&
    after['fx-inline-math'].katexAll === 1;
  checks.inlineMathTextSame = after['fx-inline-math'].text === before['fx-inline-math'];
  // The renderer's own italic is a fontStyle span; the fix must not wrap it again.
  checks.nativeItalicUnchanged = after['fx-native-italic'].built === 0 &&
    after['fx-native-italic'].nativeItalics === 1 &&
    after['fx-native-italic'].text === before['fx-native-italic'];
  // Negative: a split `$$` shape inside a plain-text fence stays literal — no split repair.
  checks.fencedSplitRaw = after['fx-fenced-split-raw'].katexDisplay === 0 &&
    after['fx-fenced-split-raw'].text.includes('\\begin{array}') &&
    after['fx-fenced-split-raw'].built === 0;
  // Negative: `(*)` footnote marks are literal stars; both survive and no `em` appears.
  checks.footnoteStarsRaw = after['fx-footnote-stars'].text === before['fx-footnote-stars'] &&
    after['fx-footnote-stars'].italic.length === 0 &&
    (after['fx-footnote-stars'].text.match(/\*/g) || []).length === 2;

  // (5) the `<td>` leaf: an inline-code atom in B and math atoms plus a line break before the
  // leading star are ordinary content; the shape repairs without losing the katex or the br.
  checks.stolenStarTd = stolenStarTd.ok;

  const summary = { before, after: Object.fromEntries(Object.entries(after).map(([k, v]) => [k, {
    built: v.built, text: v.text, bold: v.bold, italic: v.italic, katexDisplay: v.katexDisplay, rawTex: v.rawTex
  }])) };
  const failed = Object.entries(checks).filter(([, ok]) => ok !== true).map(([key]) => key);
  if (failed.length) throw new Error(JSON.stringify({ failed, checks, summary }));
  return { checks, summary };
}
