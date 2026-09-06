async (page) => {
  const fs = require('node:fs');
  const source = fs.readFileSync('aaa.user.js', 'utf8');
  const instrumented = source.replace('function collectInlineText(container) {',
    'function collectInlineText(container) { globalThis.__projectionCount = (globalThis.__projectionCount || 0) + 1;')
    .replace('function fitDisplayMath(display, force = false) {',
    'function fitDisplayMath(display, force = false) { globalThis.__fitCount = (globalThis.__fitCount || 0) + 1;')
    .replace(/\n  if \(document\.readyState === 'loading'\)/,
    '\n  globalThis.__audit = {findMatches, collectInlineText, repairRoot, collectRoots, scan, generating, mappedRawMathSource, sourceFromMixedMathDom};\n  if (document.readyState === \'loading\')');
  await page.setContent('<!doctype html><html><body><main><ms-prompt-input><textarea></textarea><button class="run-button">Run</button></ms-prompt-input><section id="responses"></section></main></body></html>');
  await page.addStyleTag({ path: 'node_modules/katex/dist/katex.min.css' });
  await page.addScriptTag({ path: 'node_modules/katex/dist/katex.min.js' });
  await page.evaluate(() => {
    const mount = (id, html) => {
      const turn = document.createElement('article');
      turn.dataset.turnRole = 'model';
      turn.id = id;
      turn.innerHTML = html;
      document.getElementById('responses').append(turn);
    };
    mount('math-only', '<p>목표 잔액은 **<span class="math-inline"></span>**입니다.</p>');
    mount('math-suffix', '<blockquote>**20×2년 보증비는 <span class="math-inline"></span>**이 됩니다.</blockquote>');
    mount('multi-math', '<p>**<span class="math-inline"></span>**와 **<span class="math-inline"></span>**</p>');
    mount('protected', '<p>**앞 <a href="#">링크</a> 뒤** / <code>**코드**</code></p>');
    mount('plain', '<p>*불완전 표시 이후 **정상 볼드**입니다.</p>');
    mount('raw-controls', '<p>\\begin{aligned}a&amp;=b\\end{aligned}<input value="preserved"><button>Keep</button></p>');
    mount('grid', '<pre><code>  ┌─ 자본금\n자본 ┤ 자본잉여금\n  └─ 자본조정</code></pre>');
    mount('batch-a', '<p><code>**첫째**</code></p>');
    mount('batch-b', '<p><code>**둘째**</code></p>');
    mount('native', '<p><ms-katex display="false"></ms-katex></p>');
    mount('fit', '<div class="markdown" style="width:180px"><span id="fit-host"></span></div>');
    mount('nested-protected', '<p>\\begin{aligned}x&amp;=y\\end{aligned}<span data-turn-role="user">**사용자 원문**</span><span contenteditable="plaintext-only">**편집 원문**</span></p>');
    const unknown = document.createElement('ms-chat-turn');
    unknown.id = 'role-arrival';
    unknown.innerHTML = '<ms-cmark-node><p>**작성자 확인 후 복구**</p></ms-cmark-node>';
    document.getElementById('responses').append(unknown);
    const user = unknown.cloneNode(true);
    user.id = 'user-arrival';
    document.getElementById('responses').append(user);
    const classArrival = unknown.cloneNode(true);
    classArrival.id = 'class-arrival';
    document.getElementById('responses').append(classArrival);
    window.__nativeHost = document.querySelector('#native ms-katex');
    katex.render('\\mathbf{10{,}000\\text{원}}%SECRET_COMMENT\n+x', __nativeHost);
    katex.render('x', document.getElementById('fit-host'), { displayMode: true });
    window.__nestedProtected = Array.from(document.querySelectorAll('#nested-protected [data-turn-role], #nested-protected [contenteditable]'));
    window.__nestedText = __nestedProtected.map((el) => el.innerHTML);
    window.__editorStyle = getComputedStyle(document.querySelector('textarea')).fontFamily;
    window.__originalMath = Array.from(document.querySelectorAll('.math-inline'));
    window.__originalMath.forEach((host, i) => katex.render(i === 1 ? '15{,}000\\text{원}' : '6{,}000\\text{원}', host));
    window.__protected = document.getElementById('protected').innerHTML;
    window.__controls = Array.from(document.querySelectorAll('#raw-controls input, #raw-controls button'));
  });
  await page.addScriptTag({ content: instrumented });
  await page.waitForTimeout(3200);
  const result = await page.evaluate(() => {
    const text = (id) => document.getElementById(id).textContent;
    const tests = {
      mathOnly: !text('math-only').includes('**'),
      mathSuffix: !text('math-suffix').includes('**'),
      multiMath: !text('multi-math').includes('**'),
      mathIdentity: __originalMath.every((el) => el.isConnected && document.querySelectorAll('.math-inline').length === 4),
      protectedContent: document.getElementById('protected').innerHTML === __protected,
      unmatchedMarker: !!document.querySelector('#plain strong'),
      parserRecovery: __audit.findMatches('*oops **정상 볼드**').some((m) => m.inner === '정상 볼드')
    };
    tests.unknownOwnershipPreserved = !document.querySelector('#role-arrival strong, #user-arrival strong');
    tests.promptStyleUnchanged = getComputedStyle(document.querySelector('textarea')).fontFamily === __editorStyle;
    tests.nestedProtectedPreserved = __nestedProtected.every((node, i) => node.isConnected && node.innerHTML === __nestedText[i]);
    tests.nativeHostIdentity = document.querySelector('#native ms-katex') === __nativeHost;
    tests.nativeInlinePreserved = !__nativeHost.querySelector('.katex-display');
    tests.nativeCommentPreserved = __nativeHost.querySelector('annotation').textContent.includes('%SECRET_COMMENT') &&
      !__nativeHost.querySelector('.katex-html').textContent.includes('SECRET_COMMENT');
    tests.rawControlsPreserved = __controls.every((node) => node.isConnected);
    const codeRun = document.createElement('button');
    codeRun.textContent = 'Run';
    document.getElementById('plain').append(codeRun);
    const composer = document.querySelector('.run-button');
    composer.textContent = 'Stop';
    tests.responseRunDoesNotOverrideStop = __audit.generating();
    composer.textContent = 'Run';
    codeRun.remove();
    const aside = document.createElement('aside');
    aside.innerHTML = '<button>Run</button>';
    document.body.append(aside);
    composer.hidden = true;
    const busy = document.createElement('div');
    busy.setAttribute('role', 'progressbar');
    busy.style.cssText = 'width:10px;height:10px';
    document.getElementById('plain').append(busy);
    tests.unrelatedRunDoesNotOverrideActivity = __audit.generating();
    composer.hidden = false;
    busy.setAttribute('aria-busy', 'true');
    tests.busyOverridesRun = __audit.generating();
    busy.remove();
    aside.remove();
    const deep = document.createElement('div');
    let leaf = deep;
    for (let i = 0; i < 100; i++) leaf = leaf.appendChild(document.createElement('span'));
    leaf.textContent = '$x$';
    tests.deepProjectionBounded = __audit.mappedRawMathSource(deep).overflow && __audit.sourceFromMixedMathDom(deep) === '';
    return tests;
  });
  await page.evaluate(() => {
    // Both same-text structural edits arrive in ONE MutationObserver batch.
    document.querySelector('#batch-a p').innerHTML = '<span>**첫째**</span>';
    document.querySelector('#batch-b p').innerHTML = '<span>**둘째**</span>';
    document.querySelector('#grid code').textContent = '  ┌─ 변경된 자본금\n자본 ┤ 변경된 잉여금\n  └─ 변경된 조정';
    document.getElementById('role-arrival').dataset.turnRole = 'model';
    document.getElementById('user-arrival').dataset.turnRole = 'user';
    document.getElementById('class-arrival').className = 'chat-turn-container model';
    katex.render('\\mathbf{20{,}000\\text{원}}', __nativeHost);
    // Reuse the same display host, replacing only its KaTeX children.
    const holder = document.createElement('span');
    katex.render('x+'.repeat(90) + 'x', holder, { displayMode: true });
    const display = document.querySelector('#fit .katex-display');
    display.replaceChildren(...holder.querySelector('.katex-display').childNodes);
  });
  await page.waitForTimeout(2600);
  Object.assign(result, await page.evaluate(() => {
    const pre = document.querySelector('#grid pre');
    const visual = pre.querySelector('[aria-hidden="true"]');
    const viewText = visual ? Array.from(visual.querySelectorAll('[data-aistudio-ascii-cell]'))
      .map((el) => el.getAttribute('data-aistudio-ascii-cell')).join('') : '';
    const checks = {
      batchA: document.querySelector('#batch-a strong')?.textContent === '첫째',
      batchB: document.querySelector('#batch-b strong')?.textContent === '둘째',
      gridRefresh: viewText.includes('변경된'),
      singleGrid: pre.querySelectorAll('[aria-hidden="true"]').length === 1
    };
    checks.roleArrivalRepaired = document.querySelector('#role-arrival strong')?.textContent === '작성자 확인 후 복구';
    checks.classArrivalRepaired = document.querySelector('#class-arrival strong')?.textContent === '작성자 확인 후 복구';
    checks.nativeHostUpdateRepaired = __nativeHost.classList.contains('aistudio-rendered-math-bold-repaired') &&
      __nativeHost.querySelector('annotation').textContent.includes('\\text{\\bf ');
    checks.userRoleArrivalPreserved = !document.querySelector('#user-arrival strong') &&
      document.getElementById('user-arrival').textContent.includes('**');
    checks.sameHostMathRefitted = Number(document.querySelector('#fit .katex').getAttribute('data-aistudio-math-fit-scale')) > 0;
    const mathScroller = document.querySelector('#fit .aistudio-math-scroll');
    checks.extremeMathContained = !!mathScroller && mathScroller.clientWidth <= 180 &&
      mathScroller.scrollWidth > mathScroller.clientWidth && getComputedStyle(mathScroller).overflowX === 'auto';
    const range = document.createRange();
    range.selectNode(visual || pre.firstChild);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const data = new DataTransfer();
    const copyEvent = new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: data });
    pre.dispatchEvent(copyEvent);
    checks.currentCopy = copyEvent.clipboardData.getData('text/plain') === pre.querySelector('code').textContent;
    selection.removeAllRanges();
    range.selectNode(visual.firstChild);
    selection.addRange(range);
    const partialCopy = new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() });
    pre.dispatchEvent(partialCopy);
    checks.partialCopyNotOverridden = !partialCopy.defaultPrevented;
    selection.removeAllRanges();
    // Hundreds of matches must not rebuild a snapshot for every pair.
    const many = document.createElement('p');
    many.dataset.turnRole = 'model';
    for (let i = 0; i < 200; i++) {
      const span = document.createElement('span');
      span.textContent = `**항목${i}** `;
      many.append(span);
    }
    document.getElementById('responses').append(many);
    const before = window.__projectionCount;
    __audit.repairRoot(many);
    checks.manyMatches = many.querySelectorAll('strong').length === 200;
    checks.boundedProjection = window.__projectionCount - before <= 10;
    const manyUnderlines = document.createElement('p');
    manyUnderlines.dataset.turnRole = 'model';
    for (let i = 0; i < 200; i++) {
      const span = document.createElement('span');
      span.textContent = `<u>밑줄${i}</u> `;
      manyUnderlines.append(span);
    }
    document.getElementById('responses').append(manyUnderlines);
    const underlineBefore = window.__projectionCount;
    __audit.repairRoot(manyUnderlines);
    checks.manyUnderlines = manyUnderlines.querySelectorAll('u').length === 200;
    checks.boundedUnderlineProjection = window.__projectionCount - underlineBefore <= 10;
    // Exercise replacement of the code node, not only its text descendants.
    const replacement = document.createElement('code');
    replacement.textContent = '  ┌─ 교체된 자본금\n자본 ┤ 교체된 잉여금\n  └─ 교체된 조정';
    pre.querySelector('code').replaceWith(replacement);
    return checks;
  }));
  await page.waitForTimeout(2400);
  Object.assign(result, await page.evaluate(() => {
    const pre = document.querySelector('#grid pre');
    const checks = {
      replacedCodeSingleGrid: pre.querySelectorAll('.aistudio-ascii-tree-visual').length === 1 &&
        Array.from(pre.querySelectorAll('[data-aistudio-ascii-cell]')).some((el) => el.dataset.aistudioAsciiCell.includes('교체된'))
    };
    const count = window.__fitCount;
    document.fonts.dispatchEvent(new Event('loadingdone'));
    __audit.scan();
    checks.fontLoadRefitsMath = window.__fitCount > count;
    return checks;
  }));
  fs.mkdirSync('output/playwright', { recursive: true });
  await page.screenshot({ path: `output/playwright/audit-${page.viewportSize().width}.png`, fullPage: false });
  await page.evaluate(() => {
    const responses = document.getElementById('responses');
    responses.replaceChildren();
    for (let i = 0; i < 180; i++) {
      const turn = document.createElement('ms-chat-turn');
      turn.dataset.turnRole = 'model';
      turn.innerHTML = '<ms-cmark-node>' + '<p>완료된 설명입니다. 수식과 표를 검토합니다.</p>'.repeat(20) + '</ms-cmark-node>';
      responses.append(turn);
    }
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(2200);
  const perf = await page.evaluate(async () => {
    let bodyWalkers = 0;
    let styleReads = 0;
    const originalWalker = document.createTreeWalker.bind(document);
    const originalStyle = window.getComputedStyle;
    document.createTreeWalker = (root, ...rest) => {
      if (root === document.body) bodyWalkers++;
      return originalWalker(root, ...rest);
    };
    window.getComputedStyle = (...args) => { styleReads++; return originalStyle(...args); };
    const timings = [];
    for (let i = 0; i < 6; i++) {
      const start = performance.now();
      __audit.scan();
      timings.push(performance.now() - start);
    }
    // A scan already queued before focusing the editor must also yield to typing.
    const editor = document.querySelector('textarea');
    editor.focus();
    bodyWalkers = 0;
    styleReads = 0;
    __audit.scan();
    const typing = { bodyWalkers, styleReads };
    editor.blur();
    document.createTreeWalker = originalWalker;
    window.getComputedStyle = originalStyle;
    return { turns: 180, paragraphs: 3600, scanMs: timings, typing };
  });
  console.log(JSON.stringify({ checks: result, performance: perf }));
  result.typingIdle = perf.typing.bodyWalkers === 0 && perf.typing.styleReads === 0;
  if (!process.env.AISTUDIO_AUDIT_BASELINE && Object.values(result).some((ok) => !ok)) {
    throw new Error('Audit regression: ' + JSON.stringify(result));
  }
  return { checks: result, performance: perf };
}
