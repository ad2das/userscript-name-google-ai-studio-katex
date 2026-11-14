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
    // A renderer that drops the row breaks delivers prose, header, delimiter row and body rows as
    // one flat text run. Nothing starts with a pipe, so the table must be found from the pipes.
    const gluedOne = '영업권은 사업결합에서 넘겨받은 순자산의 공정가치를 넘는 금액입니다. ' +
      '| 항목 | 차변 | 대변 | | :---: | :--- | :--- | | 20X1. 1. 1. | <strong>현금</strong> 50,000 | 자본금 50,000 |';
    const gluedTwo = '다음 해 분개는 이자와 원금을 나누어 적습니다. ' +
      '| 항목 | 금액 | 비고 | | :--- | ---: | :---: | | 20X1. 12. 31. | 12,000 | 이자 | | 〃 | 20,744 | 원금 |' +
      ' (두 번째 행은 상계 후 금액입니다.)';
    const glued = make('raw-table-glued', '<ms-cmark-node><span>' + gluedOne + '</span></ms-cmark-node>');
    const gluedNodes = [];
    const gluedWalker = document.createTreeWalker(glued, NodeFilter.SHOW_ALL);
    while (gluedWalker.nextNode()) gluedNodes.push(gluedWalker.currentNode);
    const gluedText = glued.textContent;
    __rawTable.repairRoot(glued);
    const gluedVisual = glued.querySelector('.aistudio-raw-table-visual');
    const gluedRows = Array.from(gluedVisual?.querySelectorAll('.aistudio-raw-table-row') || []);
    const gluedRead = cell => cell ? Array.from(cell.querySelectorAll('[data-aistudio-raw-table-text]')).map(n => n.getAttribute('data-aistudio-raw-table-text')).join('') : null;
    checks.gluedTable = !!gluedVisual && gluedRows.length === 2 && gluedRows.every(row => row.children.length === 3);
    checks.gluedCells = gluedRead(gluedRows[1]?.children[1]) === '현금 50,000' && gluedRead(gluedRows[1]?.children[2]) === '자본금 50,000';
    checks.gluedAlign = !!gluedRows[0]?.children[0] && getComputedStyle(gluedRows[0].children[0]).textAlign === 'center';
    const attrText = node => Array.from(node?.querySelectorAll('[data-aistudio-raw-table-text]') || [])
      .map(n => n.getAttribute('data-aistudio-raw-table-text')).join('');
    checks.gluedProse = attrText(gluedVisual?.querySelector('.aistudio-raw-table-caption')) ===
      '영업권은 사업결합에서 넘겨받은 순자산의 공정가치를 넘는 금액입니다.';
    checks.gluedBold = !!gluedRows[1]?.children[1]?.firstChild && Number(getComputedStyle(gluedRows[1].children[1].firstChild).fontWeight) >= 600;
    checks.gluedPreserved = gluedNodes.every(node => node.isConnected) && glued.textContent === gluedText;
    const gluedBefore = glued.innerHTML;
    __rawTable.repairRoot(glued);
    checks.gluedIdempotent = glued.innerHTML === gluedBefore;
    const foot = make('raw-table-glued-foot', '<ms-cmark-node><span>' + gluedTwo + '</span></ms-cmark-node>');
    __rawTable.repairRoot(foot);
    const footVisual = foot.querySelector('.aistudio-raw-table-visual');
    const footRows = Array.from(footVisual?.querySelectorAll('.aistudio-raw-table-row') || []);
    checks.gluedFoot = !!footVisual && footRows.length === 3 &&
      !!footRows[0]?.children[2] && getComputedStyle(footRows[0].children[2]).textAlign === 'center' &&
      !!footRows[0]?.children[1] && getComputedStyle(footRows[0].children[1]).textAlign === 'right' &&
      attrText(footVisual.querySelector('.aistudio-raw-table-foot')) === '(두 번째 행은 상계 후 금액입니다.)';
    // An empty cell inside a glued row is a cell, not the end of the grid.
    const emptyCellText = '매출원가는 기초재고와 당기매입에서 기말재고를 뺀 값입니다. ' +
      '| 항목 | 금액 | 비고 | | :--- | ---: | :---: | | 기초재고 | 300 | 정상 | | 당기매입 | | 확정 | | 기말재고 | 120 | 추정 |';
    const emptyCell = make('raw-table-glued-empty-cell', '<ms-cmark-node><span>' + emptyCellText + '</span></ms-cmark-node>');
    __rawTable.repairRoot(emptyCell);
    const emptyCellVisual = emptyCell.querySelector('.aistudio-raw-table-visual');
    const emptyCellRows = Array.from(emptyCellVisual?.querySelectorAll('.aistudio-raw-table-row') || []);
    checks.gluedEmptyCell = !!emptyCellVisual && emptyCellRows.length === 4 &&
      emptyCellRows.every(row => row.children.length === 3) &&
      attrText(emptyCellRows[2]?.children[0]) === '당기매입' &&
      attrText(emptyCellRows[2]?.children[1]) === '' &&
      attrText(emptyCellRows[2]?.children[2]) === '확정' &&
      attrText(emptyCellRows[3]?.children[2]) === '추정' &&
      !attrText(emptyCellVisual).includes('|') &&
      !emptyCellVisual.querySelector('.aistudio-raw-table-foot');
    const emptyHeaderText = '재고 자산은 두 기준으로 적습니다. | | 원가 | 매가 | | :--- | ---: | ---: | | 상품 | 900 | 1,200 |';
    const emptyHeader = make('raw-table-glued-empty-header', '<ms-cmark-node><span>' + emptyHeaderText + '</span></ms-cmark-node>');
    __rawTable.repairRoot(emptyHeader);
    const emptyHeaderVisual = emptyHeader.querySelector('.aistudio-raw-table-visual');
    const emptyHeaderRows = Array.from(emptyHeaderVisual?.querySelectorAll('.aistudio-raw-table-row') || []);
    checks.gluedEmptyHeaderCell = !!emptyHeaderVisual && emptyHeaderRows.length === 2 &&
      emptyHeaderRows.every(row => row.children.length === 3) &&
      attrText(emptyHeaderRows[0]?.children[0]) === '' &&
      attrText(emptyHeaderRows[0]?.children[1]) === '원가' &&
      attrText(emptyHeaderRows[1]?.children[0]) === '상품' &&
      attrText(emptyHeaderVisual.querySelector('.aistudio-raw-table-caption')) === '재고 자산은 두 기준으로 적습니다.';
    const allBlankText = '분개는 차변과 대변으로 나눕니다. | 차변 | 금액 | 대변 | | :--- | ---: | :--- | | 현금 | 500 | 자본금 | | | | | | 잔액 | 500 | 비고 |';
    const allBlank = make('raw-table-glued-all-blank', '<ms-cmark-node><span>' + allBlankText + '</span></ms-cmark-node>');
    __rawTable.repairRoot(allBlank);
    const allBlankVisual = allBlank.querySelector('.aistudio-raw-table-visual');
    const allBlankRows = Array.from(allBlankVisual?.querySelectorAll('.aistudio-raw-table-row') || []);
    checks.gluedAllBlankRow = !!allBlankVisual && allBlankRows.length === 2 &&
      allBlankRows.every(row => row.children.length === 3) &&
      attrText(allBlankRows[1]?.children[0]) === '현금' &&
      attrText(allBlankVisual.querySelector('.aistudio-raw-table-foot')).replace(/\s+/g, ' ').trim() === '잔액 | 500 | 비고';
    const stay = [
      '<ms-cmark-node><span>교재 1000제 | 고난도 300 | 모의고사 순서로 풉니다.</span></ms-cmark-node>',
      '<ms-cmark-node><span>표식은 </span><span class="inline-code">a | b</span><span> 처럼 씁니다.</span></ms-cmark-node>',
      '<ms-cmark-node><span>값은 | 하나 | 뿐이고 구분선은 없습니다.</span></ms-cmark-node>',
      '<ms-cmark-node><span>| 항목 | 금액 |</span><br><ms-cmark-node></ms-cmark-node><span>| --- | --- |</span></ms-cmark-node>'
    ];
    checks.gluedMustStay = stay.every((html, i) => {
      const q = make('stay-' + i, html);
      const before = q.innerHTML;
      __rawTable.repairRoot(q);
      return q.innerHTML === before && !q.querySelector('.aistudio-raw-table-visual');
    });
    const realTable = make('stay-real-table', '<table><thead><tr><th>항목</th><th>금액</th></tr></thead>' +
      '<tbody><tr><td>기초</td><td>100</td></tr></tbody></table>');
    __rawTable.repairRoot(realTable);
    // A real <table> must never be re-projected as a pipe table; the mobile-table pass may still
    // wrap it in its scroller, which is existing behaviour from another pass.
    checks.gluedRealTable = !!realTable.querySelector('table') &&
      !realTable.querySelector('.aistudio-raw-table-visual') &&
      !realTable.querySelector('.aistudio-raw-table-source') && realTable.textContent === '항목금액기초100';
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
