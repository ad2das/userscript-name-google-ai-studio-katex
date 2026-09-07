async (page) => {
  const fs = require('node:fs');
  const source = fs.readFileSync('aaa.user.js', 'utf8').replace(/\n  if \(document\.readyState === 'loading'\)/,
    '\n  globalThis.__amount = { repairRoot, scan };\n  if (document.readyState === \'loading\')');
  await page.setContent('<main><ms-prompt-input><textarea></textarea><button class="run-button">Run</button></ms-prompt-input><article data-turn-role="model"><ms-cmark-node id="response"><p id="line">매가 합계 <strong id="amount"><ms-cmark-node><span>10,000원</span><!--anchor--></ms-cmark-node></strong></p><p><strong id="small">800원</strong></p><p><strong id="long">10,000원 금액을 설명하는 긴 문장</strong><code><strong id="code">800원</strong></code><a><strong id="link">800원</strong></a><strong id="bad">10,00원</strong><strong role="button" id="role">800원</strong><strong id="large">12345678901234567원</strong></p></ms-cmark-node></article><article data-turn-role="user"><ms-cmark-node><strong id="user">800원</strong></ms-cmark-node></article></main>');
  await page.evaluate(() => {
    document.querySelector('main').setAttribute('role', 'main');
    document.querySelector('article').setAttribute('tabindex', '-1');
  });
  await page.addStyleTag({ content: 'ms-cmark-node {display:contents} #line {width:125px;font:16px sans-serif;overflow-wrap:break-word}' });
  await page.addScriptTag({ path: 'node_modules/katex/dist/katex.min.js' });
  await page.addScriptTag({ content: source });
  const checks = await page.evaluate(() => {
    const root = document.getElementById('response'), amount = document.getElementById('amount');
    const span = amount.querySelector('span'), original = amount.textContent;
    let clicks = 0; span.addEventListener('click', () => clicks++);
    __amount.repairRoot(root); span.click();
    const charTop = offset => { const range = document.createRange(); range.setStart(span.firstChild, offset); range.setEnd(span.firstChild, offset + 1); return range.getBoundingClientRect().top; };
    const html = root.innerHTML; __amount.repairRoot(root);
    return {
      marked: amount.classList.contains('aistudio-amount-token') && document.getElementById('small').classList.contains('aistudio-amount-token'),
      sameLine: charTop(0) === charTop(6),
      identity: amount.querySelector('span') === span && amount.textContent === original && clicks === 1,
      idempotent: root.innerHTML === html,
      excluded: ['long','code','link','bad','role','large','user'].every(id => !document.getElementById(id).classList.contains('aistudio-amount-token'))
    };
  });
  await page.waitForTimeout(2800);
  await page.evaluate(() => {
    document.querySelector('.run-button').textContent = 'Stop';
    document.querySelector('#amount span').textContent = '길게 변경된 일반 회계학 설명입니다';
    __amount.scan();
  });
  checks.streamingDeferred = await page.locator('#amount').evaluate(n => n.classList.contains('aistudio-amount-token'));
  await page.evaluate(() => { document.querySelector('.run-button').textContent = 'Run'; __amount.scan(); });
  await page.waitForFunction(() => !document.querySelector('#amount').classList.contains('aistudio-amount-token'));
  checks.cleaned = true;
  await page.evaluate(() => { document.querySelector('article').setAttribute('data-turn-role', 'user'); __amount.scan(); });
  await page.waitForFunction(() => !document.querySelector('#small').classList.contains('aistudio-amount-token'));
  checks.roleCleanup = true;
  if (Object.values(checks).some(ok => !ok)) throw new Error(JSON.stringify(checks));
  return checks;
}
