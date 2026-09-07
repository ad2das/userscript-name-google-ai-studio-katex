async (page) => {
  const fs = require('node:fs');
  const source = fs.readFileSync('aaa.user.js', 'utf8').replace(/\n  if \(document\.readyState === 'loading'\)/,
    '\n  globalThis.__note = { repairRoot, scan };\n  if (document.readyState === \'loading\')');
  await page.setContent('<main role="main"><ms-prompt-input><textarea></textarea><button class="run-button">Run</button></ms-prompt-input><article data-turn-role="model" tabindex="-1"><ms-cmark-node id="response"></ms-cmark-node></article><article data-turn-role="user" id="user"></article></main>');
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
      emphasis: lead.querySelector('em strong')?.textContent === '"원가에 25%의 이익을 가산하였다."',
      italic: getComputedStyle(lead.querySelector('em')).fontStyle === 'italic',
      identity: nodes.every(n => n.isConnected) && lead.nextElementSibling === tail && clicks === 1,
      idempotent: p.innerHTML === before
    };
    const invalid = [markup.replace('※', '일반'), markup.replace('font-style:italic', ''), markup.replace('비교입니다.)','비교입니다.'), markup.replace('<span>라고', '<span role="button">라고'), markup.replace('<span>*(', '<span tabindex="0">*('), markup.replace('25%', '25*%'), '<code>' + markup + '</code>', '<a>' + markup + '</a>'];
    checks.excluded = invalid.every((html, i) => { const bad = make('bad' + i, html); const before = bad.innerHTML; __note.repairRoot(bad); return bad.innerHTML === before; });
    const user = make('user-note', markup, document.getElementById('user')); const userBefore = user.innerHTML; __note.repairRoot(user); checks.user = user.innerHTML === userBefore;
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
  await page.evaluate(() => { document.querySelector('#note em').firstChild.nodeValue = '새 일반 문장'; __note.scan(); });
  await page.waitForFunction(() => !document.querySelector('#note em'));
  result.checks.cleanup = true;
  if (Object.values(result.checks).some(ok => !ok)) throw new Error(JSON.stringify(result));
  return result;
}
