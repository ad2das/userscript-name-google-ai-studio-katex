async (page) => {
  const fs = require('node:fs');
  const source = fs.readFileSync('aaa.user.js', 'utf8').replace(/\n  if \(document\.readyState === 'loading'\)/,
    '\n  globalThis.__note = { repairRoot, scan };\n  if (document.readyState === \'loading\')');
  await page.setContent('<!doctype html><html><body><main role="main"><ms-prompt-input><textarea></textarea><button class="run-button">Run</button></ms-prompt-input><article data-turn-role="model" tabindex="-1"><ms-cmark-node id="response"></ms-cmark-node></article><article data-turn-role="user" id="user"></article></main></body></html>');
  await page.addScriptTag({ path: 'node_modules/katex/dist/katex.min.js' });
  await page.addScriptTag({ content: source });
  const result = await page.evaluate(() => {
    const markup = '<ms-cmark-node><!--anchor--><span>*(※ 원문 수치 대신, **"원가에 25%의 이익을 가산하였다."*</span><!--anchor--><span style="font-style:italic"><ms-cmark-node><span>라고 가정한 추가 비교입니다.)</span></ms-cmark-node></span><!--anchor--></ms-cmark-node>';
    const make = (id, html, owner = document.getElementById('response')) => {
      const p = document.createElement('p'); p.id = id; p.innerHTML = html.replaceAll('<!--anchor-->', '<!--anchor-->'.repeat(30)); owner.append(p); return p;
    };
    const p = make('note', markup), lead = p.querySelector('span'), tail = lead.nextElementSibling;
    const nodes = []; const walker = document.createTreeWalker(p, NodeFilter.SHOW_ALL); while (walker.nextNode()) nodes.push(walker.currentNode);
    let clicks = 0; lead.addEventListener('click', () => clicks++);
    __note.repairRoot(p); lead.click();
    const before = p.innerHTML; __note.repairRoot(p);
    const checks = {
      text: p.textContent === '(※ 원문 수치 대신, "원가에 25%의 이익을 가산하였다."라고 가정한 추가 비교입니다.)',
      emphasis: p.querySelector('em strong')?.textContent === '"원가에 25%의 이익을 가산하였다."',
      italic: getComputedStyle(p.querySelector('em')).fontStyle === 'italic',
      identity: nodes.every(n => n.isConnected) && p.querySelector('em').nextElementSibling === tail && clicks === 1,
      idempotent: p.innerHTML === before
    };
    const invalid = [markup.replace('※', '일반'), markup.replace('font-style:italic', ''), markup.replace('비교입니다.)','비교입니다.'), markup.replace('<span>라고', '<span role="button">라고'), markup.replace('<span>*(', '<span tabindex="0">*('), markup.replace('25%', '25*%'), '<code>' + markup + '</code>', '<a>' + markup + '</a>'];
    checks.excluded = invalid.every((html, i) => { const bad = make('bad' + i, html); const before = bad.innerHTML; __note.repairRoot(bad); return bad.innerHTML === before; });
    const user = make('user-note', markup, document.getElementById('user')); const userBefore = user.innerHTML; __note.repairRoot(user); checks.user = user.innerHTML === userBefore;
    const live = {
      d: '<ms-cmark-node><!--anchor--><span>*(※ 20X3년 말 기초 리스부채가 </span><span class="inline-code">328,906원</span><span>이고 현금 지급액이 </span><span class="inline-code">361,798원</span><span>이므로, 단수차이 1원까지 정확히 맞추면 이자비용이 </span><span class="inline-code">32,892원</span><span>이 되지만, 교재는 </span><span class="inline-code">328,906 × 10% = 32,890.6</span><span>을 단순 반올림한 **</span><span class="inline-code">₩32,891</span><span>*</span><span style="font-style: italic;"><ms-cmark-node><span>을 그대로 기재하고 기말 잔액을 </span><span class="inline-code">0</span><span>으로 표시했습니다. 객관식 시험에서도 1~2원의 단수차이는 근사치로 선택하게 됩니다.)</span></ms-cmark-node></span></ms-cmark-node>',
      e: '<ms-cmark-node><!--anchor--><span>*(※ 앞선 632쪽 [예제 16-1]에서 정기리스료 </span><span class="inline-code">32,744.449원</span><span>을 반올림하여 </span><span class="inline-code">32,744원</span><span>으로 문제에 제시했기 때문에 약 1원의 단수차이가 나며, 교재는 원금인 **</span><span class="inline-code">₩100,000</span><span>*</span><span style="font-style: italic;"><ms-cmark-node><span>으로 맞추어 계산합니다.)</span></ms-cmark-node></span></ms-cmark-node>'
    };
    const expectBold = { d: '₩32,891', e: '₩100,000' };
    for (const id of ['d', 'e']) {
      const node = make('live-' + id, live[id]);
      const sourceText = node.textContent;
      const em = node.querySelector('em');
      const tail = node.firstElementChild.lastElementChild;
      const all = []; const walker = document.createTreeWalker(node, NodeFilter.SHOW_ALL); while (walker.nextNode()) all.push(walker.currentNode);
      __note.repairRoot(node);
      const once = node.innerHTML;
      __note.repairRoot(node);
      checks[id + 'Text'] = node.textContent ===
        sourceText.replace('*(※', '(※').replace('**', '').replace('*', '');
      checks[id + 'Bold'] = node.querySelector('em strong')?.textContent === expectBold[id];
      checks[id + 'Italic'] = getComputedStyle(node.querySelector('em')).fontStyle === 'italic';
      checks[id + 'Identity'] = all.every(n => n.isConnected) && !em && node.firstElementChild.lastElementChild === tail;
      checks[id + 'Idempotent'] = once === node.innerHTML;
      const tailSpan = node.querySelector('em').nextElementSibling.querySelector('span');
      tailSpan.textContent = '새 일반 문장';
      __note.scan();
    }
    checks.liveCleanup = ['live-d', 'live-e'].every(id => {
      const node = document.getElementById(id);
      return !node.querySelector('em') && node.textContent.includes('새 일반 문장');
    });
    const noteH = '<span>*(※ 검산: 전체 리스채권 </span><span class="inline-code">435,453</span><span>에서 무보증잔존가치 현가 </span><span class="inline-code">15,026</span><span>을 뺀 금액 </span><span class="inline-code">435,453 - 15,026 = 420,427</span><span>과 정확히 일치합니다! 공정가치 500,000원보다 작으므로 매출액은 **</span><span class="inline-code">₩420,427</span><span>*</span><span style="font-style: italic;"><ms-cmark-node><span>입니다.)</span></ms-cmark-node></span>';
    const prefixH = '<strong><ms-cmark-node><span>매출액</span></ms-cmark-node></strong><span>: 공정가치(</span><span class="inline-code">₩500,000</span><span>)와 … 중 작은 금액</span><br><ms-cmark-node></ms-cmark-node><ms-katex class="display"></ms-katex><br><ms-cmark-node></ms-cmark-node>';
    const hostFor = (id, body) => {
      const node = make(id, '<ms-cmark-node>' + body + '</ms-cmark-node>');
      const katexHost = node.querySelector('ms-katex.display');
      if (katexHost) {
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.className = 'rendered';
        pre.append(code);
        katexHost.append(pre);
        katex.render('500{,}000', code, { displayMode: true, throwOnError: false });
      }
      return node;
    };
    const h = hostFor('h', prefixH + noteH);
    const host = h.firstElementChild;
    const prefixStrong = host.querySelector('strong');
    const displayMath = host.querySelector('ms-katex.display');
    const breaks = Array.from(host.children).filter(node => node.tagName === 'BR');
    const tailH = host.lastElementChild;
    const allH = []; const walkerH = document.createTreeWalker(h, NodeFilter.SHOW_ALL); while (walkerH.nextNode()) allH.push(walkerH.currentNode);
    let clicksH = 0;
    prefixStrong.addEventListener('click', () => clicksH++);
    __note.repairRoot(h);
    const onceH = h.innerHTML;
    __note.repairRoot(h);
    prefixStrong.click();
    const emH = host.querySelector('em');
    checks.hText = h.textContent.startsWith('매출액: 공정가치(₩500,000)와 … 중 작은 금액') &&
      h.textContent.includes('(※ 검산: 전체 리스채권') && h.textContent.includes('₩420,427입니다.)') &&
      !h.textContent.includes('**') && h.textContent.indexOf('(※') > h.textContent.indexOf('작은 금액');
    checks.hBold = emH?.querySelector('strong')?.textContent === '₩420,427';
    checks.hEmText = (emH?.textContent || '').startsWith('(※ 검산');
    checks.hIdentity = allH.every(n => n.isConnected) && clicksH === 1 &&
      host.querySelector('strong') === prefixStrong && host.querySelector('ms-katex.display') === displayMath &&
      breaks.every(br => host.contains(br)) && breaks[0].compareDocumentPosition(emH) & Node.DOCUMENT_POSITION_FOLLOWING &&
      breaks[1].compareDocumentPosition(emH) & Node.DOCUMENT_POSITION_FOLLOWING &&
      emH.nextElementSibling === tailH;
    checks.hIdempotent = onceH === h.innerHTML;
    tailH.querySelector('span').textContent = '새 일반 문장';
    __note.scan();
    checks.hCleanup = !host.querySelector('em') &&
      h.textContent.startsWith('매출액: 공정가치') && h.textContent.includes('새 일반 문장');
    const noBreak = hostFor('h-no-break', '<span>: 공정가치</span>' + noteH);
    const noBreakBefore = noBreak.innerHTML;
    __note.repairRoot(noBreak);
    checks.hNoBreakRejected = noBreak.innerHTML === noBreakBefore && !noBreak.querySelector('em');
    const trailing = hostFor('h-trailing', prefixH + noteH + '<span>끝.</span>');
    const trailingBefore = trailing.innerHTML;
    __note.repairRoot(trailing);
    checks.hTrailingRejected = trailing.innerHTML === trailingBefore && !trailing.querySelector('em');
    globalThis.__noteMarkup = markup;
    return { checks };
  });
  await page.waitForTimeout(2800);
  await page.evaluate(() => {
    document.querySelector('.run-button').textContent = 'Stop';
    document.getElementById('note').innerHTML = __noteMarkup;
    __note.scan();
  });
  result.checks.streamingDeferred = await page.locator('#note').evaluate(n => n.textContent.startsWith('*(※') && !n.querySelector('.aistudio-md-repaired'));
  await page.evaluate(() => { document.querySelector('.run-button').textContent = 'Run'; __note.scan(); });
  await page.waitForFunction(() => !!document.querySelector('#note em strong'));
  result.checks.resumed = true;
  await page.evaluate(() => {
    document.querySelector('#note em').nextElementSibling.querySelector('span').textContent = '새 일반 문장';
    __note.scan();
  });
  await page.waitForFunction(() => !document.querySelector('#note em'));
  result.checks.cleanup = true;
  if (Object.values(result.checks).some(ok => !ok)) throw new Error(JSON.stringify(result));
  return result;
}
