async (page) => {
  const fs = require('node:fs');
  const source = fs.readFileSync('aaa.user.js', 'utf8').replace(/\n  if \(document\.readyState === 'loading'\)/,
    '\n  globalThis.__contract = { repairRoot, scan };\n  if (document.readyState === \'loading\')');
  await page.setContent('<!doctype html><html><body><main><ms-prompt-input><textarea></textarea><button class="run-button">Run</button></ms-prompt-input><article data-turn-role="model" id="response"></article></main></body></html>');
  await page.addStyleTag({ path: 'node_modules/katex/dist/katex.min.css' });
  await page.addScriptTag({ path: 'node_modules/katex/dist/katex.min.js' });
  await page.addScriptTag({ content: source });
  const result = await page.evaluate(() => {
    const cases = [
      ['nested-bold', '**바깥 __안쪽__ 바깥**', '바깥 안쪽 바깥'],
      ['nested-quote', '**바깥 *"인용"* 바깥**', '바깥 "인용" 바깥'],
      ['underline-bold', '<u>**굵은 밑줄**</u>', '굵은 밑줄'],
      ['bold-underline', '**<u>굵은 밑줄</u>**', '굵은 밑줄'],
      ['literal-underline', '`<u>문법 예시</u>`', '`<u>문법 예시</u>`'],
      ['literal-fence', '```\n<u>문법 예시</u>\n```', '```\n<u>문법 예시</u>\n```'],
      ['adjacent', '**가** **나** __다__', '가 나 다'],
      ['quoted', '**"체계적인 방법"**으로', '"체계적인 방법"으로'],
      ['escaped', '\\**원문**', '\\**원문**'],
      ['identifier', 'foo__bar__baz', 'foo__bar__baz'],
      ['literal-backticks', '`` **원문** ` 예시 ``', '`` **원문** ` 예시 ``']
    ];
    cases.push(['unmatched-inner', '**__한글**', '__한글']);
    cases.push(
      ['photo-foundation', '재무제표의 숫자 하나만 보면 회사가 좋은지 나쁜지 알 수 없으므로, **"서로 짝이 맞는 숫자끼리 나누어(비율) 회사의 체력과 속도를 측정하는 진단 도구"**입니다.', '재무제표의 숫자 하나만 보면 회사가 좋은지 나쁜지 알 수 없으므로, "서로 짝이 맞는 숫자끼리 나누어(비율) 회사의 체력과 속도를 측정하는 진단 도구"입니다.'],
      ['photo-cycle', '영업순환주기는 **"물건 사서 창고에 둔 기간(재고보유기간) + 외상으로 팔아서 돈 받아낸 기간(채권회수기간)"**의 단순 합입니다.', '영업순환주기는 "물건 사서 창고에 둔 기간(재고보유기간) + 외상으로 팔아서 돈 받아낸 기간(채권회수기간)"의 단순 합입니다.']
    );
    const checks = {};
    const failures = [];
    const response = document.getElementById('response');
    // Text segmentation and neutral/native inline wrappers must not change output.
    for (const [name, input, expected] of cases) {
      for (const mode of ['text', 'chars', 'spans', 'native']) {
        const p = document.createElement('p');
        p.dataset.case = `${name}:${mode}`;
        if (mode === 'text') p.textContent = input;
        else for (let i = 0; i < input.length; i++) {
          const node = mode === 'chars' ? document.createTextNode(input[i])
            : document.createElement(mode === 'native' && i % 4 === 2 ? 'strong' : 'span');
          if (mode !== 'chars') node.textContent = input[i];
          p.append(node);
        }
        response.append(p);
        __contract.repairRoot(p);
        const actual = p.textContent;
        checks[`${name}:${mode}`] = actual === expected;
        if (actual !== expected) failures.push({ name, mode, input, expected, actual });
      }
    }
    const nativeUnderline = document.createElement('p');
    nativeUnderline.innerHTML = '**앞 <u>밑줄</u> 뒤**';
    response.append(nativeUnderline);
    const original = nativeUnderline.querySelector('u');
    __contract.repairRoot(nativeUnderline);
    checks.nativeUnderline = nativeUnderline.textContent === '앞 밑줄 뒤' && original.isConnected;
    const hardBreak = document.createElement('p');
    hardBreak.innerHTML = '**"서로 짝이 맞는 숫자끼리 나누어(비율)<br>회사의 체력과 속도를 측정하는 진단 도구"**입니다.';
    response.append(hardBreak);
    const originalBreak = hardBreak.querySelector('br');
    __contract.repairRoot(hardBreak);
    checks.hardBreakEmphasis = !hardBreak.textContent.includes('**') && originalBreak.isConnected &&
      !!hardBreak.querySelector('strong br');
    const table = document.createElement('table');
    table.innerHTML = '<tbody><tr><td>`&lt;br&gt;`</td></tr></tbody>';
    response.append(table);
    __contract.repairRoot(table);
    checks.literalTableBreak = table.querySelector('td').textContent === '`<br>`';
    const nativeCodeLiteral = document.createElement('p');
    nativeCodeLiteral.innerHTML = '<span class="inline-code">**literal** &lt;u&gt;sample&lt;/u&gt;</span>';
    response.append(nativeCodeLiteral);
    const nativeCodeBefore = nativeCodeLiteral.innerHTML;
    __contract.repairRoot(nativeCodeLiteral);
    checks.nativeInlineCodeLiteral = nativeCodeLiteral.innerHTML === nativeCodeBefore;
    const nativeCodeEmphasis = document.createElement('p');
    nativeCodeEmphasis.innerHTML = '<span>앞 **</span><!--anchor--><span class="inline-code" id="native-code-atom">**literal**</span><!--anchor--><span>** 뒤</span>';
    response.append(nativeCodeEmphasis);
    const nativeCodeAtom = nativeCodeEmphasis.querySelector('.inline-code');
    nativeCodeAtom.style.fontFamily = 'monospace';
    let nativeCodeClicks = 0;
    nativeCodeAtom.addEventListener('click', () => nativeCodeClicks++);
    __contract.repairRoot(nativeCodeEmphasis);
    nativeCodeAtom.click();
    checks.boldAroundNativeCode = nativeCodeEmphasis.textContent === '앞 **literal** 뒤' &&
      !!nativeCodeAtom.closest('strong') && !nativeCodeAtom.querySelector('strong');
    checks.nativeInlineCodeIdentity = nativeCodeAtom.isConnected && nativeCodeClicks === 1;
    checks.nativeInlineCodeTypography = getComputedStyle(nativeCodeAtom).fontFamily.includes('monospace') &&
      Number(getComputedStyle(nativeCodeAtom).fontWeight) >= 600;
    const plainTex = document.createElement('p');
    plainTex.textContent = '\\text{기본 텍스트}';
    response.append(plainTex);
    __contract.repairRoot(plainTex);
    checks.standaloneTextMath = !!plainTex.querySelector('.katex');
    const guarded = document.createElement('section');
    guarded.innerHTML = '<p><span data-turn-role="user">\\begin{aligned}x&amp;=y\\end{aligned}</span></p>' +
      '<div contenteditable="plaintext-only"><table><tr><td>원문</td></tr></table><pre><code>이 내용은 **중요한 설명**입니다.</code></pre></div>' +
      '<pre><code>  ┌─ 자본금\n자본 ┤ <span data-turn-role="user">자본잉여금</span>\n  └─ 자본조정</code></pre>';
    response.append(guarded);
    const guardBefore = guarded.innerHTML;
    __contract.repairRoot(guarded);
    checks.protectedSubtrees = guarded.innerHTML === guardBefore;
    const rawGuard = document.createElement('div');
    rawGuard.innerHTML = '<p>\\begin{aligned}x&amp;=<span data-turn-role="user">y</span>\\end{aligned}</p>' +
      '<p>\\begin{aligned}x&amp;=y\\end{aligned}<img alt="keep"></p>' +
      '<table><tr><td>&lt;b<button></button>r&gt;</td></tr></table>' +
      '<pre><code>이것은 **중요한 내용**입니다.</code></pre>' +
      '<section>**첫 블록</section><section>둘째 블록**</section>';
    response.append(rawGuard);
    const image = rawGuard.querySelector('img');
    const emptyButton = rawGuard.querySelector('button');
    const rawUser = rawGuard.querySelector('[data-turn-role="user"]');
    __contract.repairRoot(rawGuard);
    checks.emptyNativeBoundaries = image.isConnected && emptyButton.isConnected && rawUser.isConnected;
    checks.unlabeledCodePreserved = rawGuard.querySelector('code').textContent === '이것은 **중요한 내용**입니다.';
    checks.semanticBlocksPreserved = rawGuard.querySelector('section').textContent === '**첫 블록';
    const protectedStyle = document.createElement('div');
    protectedStyle.className = 'markdown';
    protectedStyle.innerHTML = '<div data-turn-role="user"><strong style="font-weight:900">사용자</strong>' +
      '<table><tr><td style="white-space:normal">사용자 표</td></tr></table></div>' +
      '<div contenteditable="true"><strong style="font-weight:900">편집기</strong></div>';
    response.append(protectedStyle);
    checks.protectedStyles = Array.from(protectedStyle.querySelectorAll('strong')).every(el => getComputedStyle(el).fontWeight === '900') &&
      getComputedStyle(protectedStyle.querySelector('td')).whiteSpace === 'normal';
    const nativeControl = document.createElement('p');
    nativeControl.innerHTML = '<ms-katex></ms-katex>';
    const controlHost = nativeControl.firstElementChild;
    katex.render('\\mathbf{10\\text{원}}', controlHost);
    const button = document.createElement('button');
    controlHost.append(button);
    response.append(nativeControl);
    __contract.repairRoot(nativeControl);
    checks.nativeMathControl = button.isConnected && controlHost.contains(button);
    const partial = document.createElement('p');
    partial.innerHTML = '<span id="partial-native">앞 **굵게 __중첩__</span> 이어서** 뒤';
    const partialHost = partial.firstElementChild;
    let clicks = 0;
    partialHost.addEventListener('click', () => clicks++);
    response.append(partial);
    __contract.repairRoot(partial);
    partialHost.querySelector('strong')?.click();
    checks.partialNativeIdentity = partialHost.isConnected && document.querySelectorAll('#partial-native').length === 1 &&
      partial.textContent === '앞 굵게 중첩 이어서 뒤' && clicks === 1;
    const fallback = document.createElement('div');
    fallback.className = 'markdown';
    fallback.style.width = '180px';
    fallback.innerHTML = '<p></p>';
    fallback.firstElementChild.textContent = '\\begin{array}{ll}\\multicolumn{2}{l}{' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(3) + '}\\\\a&b\\end{array}';
    response.append(fallback);
    __contract.repairRoot(fallback);
    const fallbackScroller = fallback.querySelector('.aistudio-fallback-math-scroll');
    checks.fallbackMathContained = !!fallbackScroller && fallbackScroller.clientWidth <= 180 &&
      fallbackScroller.scrollWidth > fallbackScroller.clientWidth && fallback.scrollWidth <= 180;
    const pageRanges = document.createElement('h3');
    pageRanges.innerHTML = '집중 강의 (교재 p.381<s>385 / PDF 45</s>49페이지 전수 해부)';
    response.append(pageRanges);
    const strikeHost = pageRanges.querySelector('s');
    __contract.repairRoot(pageRanges);
    checks.pageRanges = pageRanges.textContent === '집중 강의 (교재 p.381~385 / PDF 45~49페이지 전수 해부)' &&
      strikeHost.isConnected && getComputedStyle(strikeHost).textDecorationLine === 'none';
    const deliberate = document.createElement('p');
    deliberate.innerHTML = '<s>삭제한 원문</s>과 p.381<s>385 / PDF 45</s>60페이지';
    response.append(deliberate);
    const deliberateBefore = deliberate.innerHTML;
    __contract.repairRoot(deliberate);
    checks.intentionalStrikePreserved = deliberate.innerHTML === deliberateBefore;
    const wrappedRange = document.createElement('h3');
    wrappedRange.innerHTML = '<ms-cmark-node><!--anchor--><span id="page-left">교재 p.381</span><!--anchor--><s id="page-strike"><ms-cmark-node><!--anchor--><span id="page-middle">385 / PDF 45</span><!--anchor--></ms-cmark-node></s><!--anchor--><span id="page-right">49페이지)</span><!--anchor--></ms-cmark-node>';
    response.append(wrappedRange);
    const rangeNodes = Array.from(wrappedRange.querySelectorAll('*'));
    let rangeClicks = 0;
    wrappedRange.querySelector('#page-middle').addEventListener('click', () => rangeClicks++);
    __contract.repairRoot(wrappedRange);
    wrappedRange.querySelector('#page-middle').click();
    checks.nativeWrappedPageRange = wrappedRange.textContent === '교재 p.381~385 / PDF 45~49페이지)' &&
      getComputedStyle(wrappedRange.querySelector('s')).textDecorationLine === 'none';
    checks.nativeRangeNodesPreserved = rangeNodes.every(node => node.isConnected) && rangeClicks === 1;
    const rangeOnce = wrappedRange.innerHTML;
    __contract.repairRoot(wrappedRange);
    checks.nativeRangeIdempotent = wrappedRange.innerHTML === rangeOnce;
    const pdfPrefixRange = document.createElement('p');
    pdfPrefixRange.innerHTML = '<span>교재 p.372</span><s><span>375 / PDF p.36</span></s><span>39)</span>';
    response.append(pdfPrefixRange);
    const pdfPrefixNodes = Array.from(pdfPrefixRange.querySelectorAll('*'));
    __contract.repairRoot(pdfPrefixRange);
    checks.pdfPagePrefixRange = pdfPrefixRange.textContent === '교재 p.372~375 / PDF p.36~39)' &&
      getComputedStyle(pdfPrefixRange.querySelector('s')).textDecorationLine === 'none' &&
      pdfPrefixNodes.every(node => node.isConnected);
    for (const [key, markup, expected] of [
      ['separatePageRanges', '문제 (p.390<s>395: OX 풀이 + p.396</s>402: 객관식 1~10번)', '문제 (p.390~395: OX 풀이 + p.396~402: 객관식 1~10번)'],
      ['pageAndLevelRange', '측정 (p.386<s>389: 개념, 서열체계 Level 1</s>3)', '측정 (p.386~389: 개념, 서열체계 Level 1~3)']
    ]) {
      const outline = document.createElement('p');
      outline.innerHTML = markup;
      response.append(outline);
      const native = outline.querySelector('s');
      __contract.repairRoot(outline);
      checks[key] = outline.textContent === expected && native.isConnected && getComputedStyle(native).textDecorationLine === 'none';
    }
    const rejectedOutlines = document.createElement('div');
    rejectedOutlines.innerHTML = '<p>p.390<s>389: 설명 + p.396</s>402)</p><p>p.386<s>389: Level 1</s>9)</p><p>p.386<s>389: 삭제한 문장</s>3)</p>';
    response.append(rejectedOutlines);
    const rejectedBefore = rejectedOutlines.innerHTML;
    __contract.repairRoot(rejectedOutlines);
    checks.invalidOutlineRangesPreserved = rejectedOutlines.innerHTML === rejectedBefore;
    const blockedRange = document.createElement('h3');
    blockedRange.innerHTML = '<span>교재 p.381</span><!--anchor--><s><a href="#">385 / PDF 45</a></s><span>49페이지)</span>';
    response.append(blockedRange);
    const blockedRangeBefore = blockedRange.innerHTML;
    __contract.repairRoot(blockedRange);
    checks.nativeRangeLinkPreserved = blockedRange.innerHTML === blockedRangeBefore;
    const updated = document.createElement('p');
    updated.id = 'reuse-emphasis';
    updated.textContent = '**첫 강조**';
    response.append(updated);
    __contract.repairRoot(updated);
    const math = document.createElement('div');
    math.className = 'markdown';
    math.id = 'container-resize';
    math.style.width = '160px';
    const host = document.createElement('span');
    math.append(host);
    response.append(math);
    katex.render('a+b+c+d+e+f+g+h+i+j+k', host, { displayMode: true });
    const reused = document.createElement('article');
    reused.dataset.turnRole = 'model';
    reused.id = 'reinserted-article';
    reused.innerHTML = '<p>아직 일반 문장</p>';
    document.querySelector('main').append(reused);
    window.__reinsertedArticle = reused;
    const streaming = document.createElement('pre');
    streaming.id = 'streaming-cleanup';
    streaming.innerHTML = '<code>  ┌─ 자본금\n자본 ┤ 자본잉여금\n  └─ 자본조정</code>';
    response.append(streaming);
    const cold = document.createElement('article');
    cold.dataset.turnRole = 'model';
    cold.id = 'cold-marked-root';
    for (let i = 0; i < 600; i++) {
      const p = document.createElement('p');
      p.textContent = `**항목${i}**`;
      cold.append(p);
    }
    document.querySelector('main').append(cold);
    const coldStart = performance.now();
    __contract.repairRoot(cold);
    const coldFirstPassMs = performance.now() - coldStart;
    checks.coldWorkBounded = cold.querySelectorAll('strong').length > 0 && cold.querySelectorAll('strong').length < 600;
    return { checks, failures, coldFirstPassMs };
  });
  await page.waitForTimeout(2800);
  await page.evaluate(() => {
    __reinsertedArticle.remove();
    window.__streamingVisual = document.querySelector('#streaming-cleanup .aistudio-ascii-tree-visual');
    document.querySelector('.run-button').textContent = 'Stop';
    document.querySelector('#streaming-cleanup code').textContent = '  ┌─ 새 자본금\n자본 ┤ 새 잉여금\n  └─ 새 조정';
  });
  await page.waitForTimeout(650);
  result.checks.streamingCleanupDeferred = await page.evaluate(() => !!__streamingVisual?.isConnected);
  await page.evaluate(() => {
    document.querySelector('.run-button').textContent = 'Run';
    __reinsertedArticle.innerHTML = '<p>**분리 후 재사용**</p>';
    document.querySelector('main').append(__reinsertedArticle);
    const table = document.querySelector('#response > .aistudio-table-scroll > table');
    if (table) {
      table.id = 'rewrap-table';
      table.parentElement.replaceWith(table);
    }
    const strong = document.querySelector('#reuse-emphasis strong');
    strong.textContent = '**새 강조**';
    const plain = document.createElement('p');
    plain.id = 'reuse-plain';
    plain.textContent = '**처음 강조**';
    document.getElementById('response').append(plain);
    __contract.repairRoot(plain);
    const plainStrong = plain.querySelector('strong');
    const retained = document.createTextNode('이제 일반 문장');
    const anchor = document.createComment('framework anchor');
    plainStrong.replaceChildren(anchor, retained);
    window.__plainReuse = { retained, anchor };
    const math = document.getElementById('container-resize');
    window.__oldFitFont = math.querySelector('.katex').style.fontSize;
    math.style.width = '650px';
  });
  await page.waitForTimeout(3000);
  Object.assign(result.checks, await page.evaluate(() => ({
    reusedEmphasis: document.getElementById('reuse-emphasis').textContent === '새 강조',
    reusedPlainNotBold: !document.querySelector('#reuse-plain strong, #reuse-plain em') &&
      getComputedStyle(__plainReuse.retained.parentElement).fontWeight ===
        getComputedStyle(document.getElementById('reuse-plain')).fontWeight,
    reusedPlainNodesPreserved: __plainReuse.anchor.parentNode === document.getElementById('reuse-plain') &&
      __plainReuse.anchor.nextSibling === __plainReuse.retained && __plainReuse.retained.nodeValue === '이제 일반 문장',
    containerResizeRefit: document.querySelector('#container-resize .katex').style.fontSize !== __oldFitFont,
    reinsertedRoot: document.getElementById('reinserted-article').textContent === '분리 후 재사용',
    tableRewrapped: !!document.querySelector('#rewrap-table')?.parentElement.classList.contains('aistudio-table-scroll'),
    coldWorkCompletes: document.querySelectorAll('#cold-marked-root strong').length === 600,
    streamingCleanupResumed: !!document.querySelector('#streaming-cleanup .aistudio-ascii-tree-visual') && !__streamingVisual.isConnected
  })));
  await page.evaluate(() => {
    const editor = document.querySelector('textarea');
    editor.focus();
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    const p = document.createElement('p');
    p.id = 'focus-retained';
    p.textContent = '**입력이 끝난 뒤 자동 복구**';
    document.getElementById('response').append(p);
    __contract.scan();
  });
  result.checks.typingDefers = await page.evaluate(() => document.getElementById('focus-retained').textContent.includes('**'));
  await page.waitForTimeout(4500);
  result.checks.idleFocusResumes = await page.evaluate(() =>
    document.activeElement === document.querySelector('textarea') &&
    document.getElementById('focus-retained').textContent === '입력이 끝난 뒤 자동 복구');
  await page.evaluate(() => {
    document.querySelector('textarea').dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const p = document.createElement('p');
    p.id = 'ime-pending';
    p.textContent = '**한글 조합 완료 후 복구**';
    document.getElementById('response').append(p);
  });
  await page.waitForTimeout(2100);
  result.checks.imeDefers = await page.evaluate(() => {
    __contract.scan();
    return document.getElementById('ime-pending').textContent.includes('**');
  });
  await page.evaluate(() => document.querySelector('textarea').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await page.waitForTimeout(4500);
  result.checks.imeResumes = await page.evaluate(() => document.getElementById('ime-pending').textContent === '한글 조합 완료 후 복구');
  await page.evaluate(() => document.querySelector('textarea').blur());
  console.log(JSON.stringify(result));
  fs.mkdirSync('output/playwright', { recursive: true });
  fs.writeFileSync(`output/playwright/contract-${page.viewportSize().width}.json`, JSON.stringify(result, null, 2));
  await page.locator('[data-case="photo-foundation:text"]').screenshot({ path: `output/playwright/foundation-${page.viewportSize().width}.png` });
  await page.locator('[data-case="photo-cycle:text"]').screenshot({ path: `output/playwright/cycle-${page.viewportSize().width}.png` });
  if (!process.env.AISTUDIO_AUDIT_BASELINE && Object.values(result.checks).some(ok => !ok)) {
    throw new Error('Rendering contract: ' + JSON.stringify(result));
  }
  return result;
}
