async (page) => {
  const fs = require('node:fs');
  const source = fs.readFileSync('aaa.user.js', 'utf8').replace(/\n  if \(document\.readyState === 'loading'\)/,
    '\n  globalThis.__rawTable = { repairRoot, scan };\n  if (document.readyState === \'loading\')');
  await page.setContent('<main><ms-prompt-input><textarea></textarea><button class="run-button">Run</button></ms-prompt-input><article data-turn-role="model" id="response"></article><article data-turn-role="user" id="user"></article></main>');
  await page.addStyleTag({ path: 'node_modules/katex/dist/katex.min.css' });
  await page.addStyleTag({ content: 'ms-cmark-node { display: contents; }' });
  await page.addScriptTag({ path: 'node_modules/katex/dist/katex.min.js' });
  await page.addScriptTag({ content: source });
  const result = await page.evaluate(() => {
    const lines = [
      '<strong>2단계: 쌍둥이 T계정 작성</strong>',
      '| 항목 | [원가] | [매가] | | 대변 (창고에서 나간 것) | [매가] |',
      '|---|---:|---:|---|---|---:|',
      '| <strong>기초</strong> | 360,000 | 400,000 | | <strong>순매출액</strong> | 2,100,000 |',
      '| <strong>당기순매입</strong> | 1,630,000 | 2,020,000 | | <strong>정상파손</strong> (대변차감)| 120,000 |',
      '| <strong>순인상</strong> | | + 120,000 | | <strong>종업원할인</strong> (대변차감)| 100,000 |',
      '| <strong><em>순인하</em></strong> | | - 40,000 | | | |',
      '| <strong>🔥비정상파손| - 70,000 | - 100,000</strong> | | | |',
      '| <strong>합계(차변)| 1,920,000| 2,400,000| | 합계(대변) | 2,320,000</strong>|'
    ];
    const markup = '<ms-cmark-node>' + lines.map(line => '<span>' + line + '</span>').join('<!--anchor--><br><ms-cmark-node><!--anchor--></ms-cmark-node>') .replaceAll('<!--anchor-->', '<!--anchor-->'.repeat(100)) + '</ms-cmark-node>';
    const make = (id, html, owner = document.getElementById('response')) => {
      const wrapper = document.createElement('ms-cmark-node');
      const p = document.createElement('p'); p.id = id; p.innerHTML = html; wrapper.append(p); owner.append(wrapper); return p;
    };
    const p = make('raw-table', markup);
    const originalText = p.textContent;
    const originalNodes = [];
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_ALL);
    while (walker.nextNode()) originalNodes.push(walker.currentNode);
    let clicks = 0;
    p.querySelector('strong').addEventListener('click', () => clicks++);
    __rawTable.repairRoot(p);
    const visual = p.querySelector('.aistudio-raw-table-visual');
    const checks = { visual: !!visual };
    if (!visual) return { checks };
    p.querySelector('strong').click();
    checks.nativePreserved = originalNodes.every(node => node.isConnected) && p.textContent === originalText && clicks === 1;
    const rows = Array.from(visual.querySelectorAll('.aistudio-raw-table-row'));
    const read = cell => Array.from(cell.querySelectorAll('[data-aistudio-raw-table-text]')).map(n => n.getAttribute('data-aistudio-raw-table-text')).join('');
    checks.dimensions = rows.length === 7 && rows.every(row => row.children.length === 6);
    checks.blankColumn = rows.every(row => read(row.children[3]) === '');
    checks.totals = read(rows[6].children[1]) === '1,920,000' && read(rows[6].children[2]) === '2,400,000' && read(rows[6].children[5]) === '2,320,000';
    checks.alignment = getComputedStyle(rows[0].children[1]).textAlign === 'right';
    checks.boldPreserved = Array.from(rows[6].querySelectorAll('[data-aistudio-raw-table-text]')).filter(n => n.getAttribute('data-aistudio-raw-table-text').trim()).every(n => Number(getComputedStyle(n).fontWeight) >= 600);
    checks.italicPreserved = getComputedStyle(rows[4].children[0].firstChild).fontStyle === 'italic';
    const before = p.innerHTML;
    __rawTable.repairRoot(p);
    checks.idempotent = p.innerHTML === before;
    const selection = getSelection(), range = document.createRange();
    range.selectNode(visual); selection.removeAllRanges(); selection.addRange(range);
    const copyEvent = new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() });
    p.dispatchEvent(copyEvent);
    const copied = copyEvent.clipboardData;
    checks.copy = copied.getData('text/plain').includes('|---|---:|---:|---|---|---:|') && copied.getData('text/plain').includes('2단계: 쌍둥이 T계정 작성\n');
    selection.removeAllRanges();
    range.selectNode(visual.firstChild); selection.addRange(range);
    const partialCopy = new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() });
    p.dispatchEvent(partialCopy);
    checks.partialCopyPreserved = !partialCopy.defaultPrevented;
    selection.removeAllRanges();
    const bad = [
      markup.replace('|---|---:|---:|---|---|---:|', '|bad|delimiter|'),
      markup.replace('2,100,000 |', '2,100,000 | extra |'),
      markup.replace('360,000', '<a href="#">360,000</a>'),
      markup.replace('360,000', '`literal`'),
      markup.replace('360,000', 'a\\|b')
    ];
    checks.rejected = bad.every((html, i) => { const q = make('reject-' + i, html); __rawTable.repairRoot(q); return !q.querySelector('.aistudio-raw-table-visual'); });
    const user = make('protected-user', markup, document.getElementById('user'));
    const code = make('protected-code', '<code>' + markup + '</code>');
    const editor = make('protected-editor', '<span contenteditable="true">' + markup + '</span>');
    const originals = [user, code, editor].map(q => q.innerHTML);
    [user, code, editor].forEach(q => __rawTable.repairRoot(q));
    checks.protected = [user, code, editor].every((q, i) => q.innerHTML === originals[i]);
    const scroller = visual.querySelector('.aistudio-raw-table-scroll');
    checks.visibleStyles = getComputedStyle(p.firstElementChild).position === 'absolute' &&
      getComputedStyle(p.firstElementChild).display === 'block' &&
      getComputedStyle(visual.querySelector('.aistudio-raw-table-grid')).display === 'table' &&
      getComputedStyle(rows[0].children[0]).display === 'table-cell' &&
      getComputedStyle(rows[0].children[0].firstChild, '::before').content.includes('항목');
    scroller.scrollLeft = scroller.scrollWidth;
    checks.contained = scroller.clientWidth <= innerWidth && document.documentElement.scrollWidth <= innerWidth;
    checks.reachable = Math.abs(scroller.scrollLeft - (scroller.scrollWidth - scroller.clientWidth)) < 2;
    window.__rawSource = p.firstElementChild;
    window.__rawMarkup = markup;
    const codeMarkup = '<ms-cmark-node><span>기계를 사용할 권리(</span><span class="inline-code">사용권자산 ₩110,000</span><span>)가 생겼고(자산 증가 → 차변), 미래 리스료 지급의무(</span><span class="inline-code">리스부채 ₩100,000</span><span>)가 생겼으며(부채 증가 → 대변), 리스개설직접원가로 현금 </span><span class="inline-code">₩10,000</span><span>이 나갔습니다(자산 감소 → 대변).</span><br><ms-cmark-node></ms-cmark-node><span>| 일자 | 차변 (계정·금액) | 대변 (계정·금액) |</span><br><ms-cmark-node></ms-cmark-node><span>| :---: | :--- | :--- |</span><br><ms-cmark-node></ms-cmark-node><span>| 20X1. 1. 1. | 사용권자산 110,000 | 리스부채 100,000</span><br><ms-cmark-node></ms-cmark-node><span>현금 10,000 |</span></ms-cmark-node>';
    const codeParagraph = make('raw-table-code', codeMarkup);
    const codeText = codeParagraph.textContent;
    const codeNodes = [];
    const codeWalker = document.createTreeWalker(codeParagraph, NodeFilter.SHOW_ALL);
    while (codeWalker.nextNode()) codeNodes.push(codeWalker.currentNode);
    __rawTable.repairRoot(codeParagraph);
    const codeVisual = codeParagraph.querySelector('.aistudio-raw-table-visual');
    const codeRead = cell => Array.from(cell.querySelectorAll('[data-aistudio-raw-table-text]')).map(n => n.getAttribute('data-aistudio-raw-table-text')).join('');
    const codeRows = Array.from(codeVisual?.querySelectorAll('.aistudio-raw-table-row') || []);
    checks.codeTable = !!codeVisual && codeRows.length === 2 &&
      codeRows.every(row => row.children.length === 3) &&
      codeRead(codeRows[1].children[2]) === '리스부채 100,000\n현금 10,000' &&
      getComputedStyle(codeRows[1].children[2]).whiteSpace === 'pre-line' &&
      getComputedStyle(codeRows[0].children[0]).textAlign === 'center';
    checks.codeCaption = Array.from(codeVisual?.querySelectorAll('.aistudio-raw-table-caption .aistudio-raw-table-code') || [])
      .map(node => node.getAttribute('data-aistudio-raw-table-text')).join('') === '사용권자산 ₩110,000리스부채 ₩100,000₩10,000';
    checks.codePreserved = codeNodes.every(node => node.isConnected) && codeParagraph.textContent === codeText;
    const codeCopy = (() => {
      const selection = getSelection(), range = document.createRange();
      range.selectNode(codeVisual); selection.removeAllRanges(); selection.addRange(range);
      const event = new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() });
      codeParagraph.dispatchEvent(event);
      selection.removeAllRanges();
      return event.clipboardData.getData('text/plain');
    })();
    checks.codeCopy = codeCopy.replace(/\n/g, '') === codeText.replace(/\n/g, '') &&
      codeCopy.includes('리스부채 100,000\n현금 10,000');
    const mismatched = make('reject-wrapped', codeMarkup.replace('현금 10,000 |', '현금 10,000 | extra |'));
    __rawTable.repairRoot(mismatched);
    checks.codeMismatchRejected = !mismatched.querySelector('.aistudio-raw-table-visual');
    return { checks, copied: copied.getData('text/plain'), rows: rows.map(row => Array.from(row.children).map(read)) };
  });
  if (!result.checks.visual) throw new Error(JSON.stringify(result));
  await page.locator('#raw-table').screenshot({ path: `output/playwright/raw-table-${page.viewportSize().width}.png` });
  // Let the production observer settle the fixture insertions before testing a
  // later native streaming mutation; direct repairRoot above is synchronous.
  await page.waitForTimeout(2800);
  await page.waitForFunction(() => !!document.querySelector('#raw-table .aistudio-raw-table-visual'));
  await page.evaluate(() => {
    document.querySelector('.run-button').textContent = 'Stop';
    __rawSource.querySelectorAll('span')[3].textContent = '| 기초 | 999,000 | 400,000 | | 순매출액 | 2,100,000 |';
    __rawTable.scan();
  });
  result.checks.streamingGuard = await page.evaluate(() => !!document.querySelector('#raw-table .aistudio-raw-table-visual'));
  await page.evaluate(() => { document.querySelector('.run-button').textContent = 'Run'; __rawTable.scan(); });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('#raw-table [data-aistudio-raw-table-text]')).some(n => n.getAttribute('data-aistudio-raw-table-text').includes('999,000')));
  result.checks.updated = true;
  await page.evaluate(() => { document.getElementById('raw-table').innerHTML = '<ms-cmark-node>새 일반 문장</ms-cmark-node>'; __rawTable.scan(); });
  await page.waitForFunction(() => !document.querySelector('#raw-table .aistudio-raw-table-visual'));
  result.checks.replaced = await page.locator('#raw-table').innerText() === '새 일반 문장';
  if (Object.values(result.checks).some(ok => !ok)) throw new Error(JSON.stringify(result));
  return result;
}
