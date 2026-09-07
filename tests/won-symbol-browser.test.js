async (page) => {
  const fs = require('node:fs');
  const source = fs.readFileSync('aaa.user.js', 'utf8').replace(/\n  if \(document\.readyState === 'loading'\)/,
    '\n  globalThis.__won = { repairRoot, scan };\n  if (document.readyState === \'loading\')');
  await page.setContent('<main role="main"><ms-prompt-input><textarea></textarea><button class="run-button">Run</button></ms-prompt-input><article data-turn-role="model" tabindex="-1"><ms-cmark-node id="response"></ms-cmark-node></article><article data-turn-role="user" id="user"></article></main>');
  await page.addScriptTag({path:'node_modules/katex/dist/katex.min.js'});
  await page.addScriptTag({content:source});
  const result = await page.evaluate(() => {
    const root = document.getElementById('response');
    const make = (id, text, owner = root) => {
      const p = document.createElement('p'); p.id = id;
      const host = document.createElement('ms-cmark-node'), span = document.createElement('span');
      span.textContent = text; host.append(document.createComment('native anchor'),span); p.append(host); owner.append(p); return p;
    };
    const text = '단위당 취득원가: \\1,000 / 예상판매가격: \\1,200 / 예상판매비: \\120';
    const p = make('won', text), native = p.querySelector('span'), original = native.firstChild;
    let clicks = 0; native.addEventListener('click', () => clicks++);
    __won.repairRoot(p); native.click();
    const firstHTML = p.innerHTML; __won.repairRoot(p);
    const symbols = [...p.querySelectorAll('.aistudio-won-symbol')];
    const checks = {
      count: symbols.length === 3,
      originalText: p.textContent === text && original.isConnected,
      nativeIdentity: native.isConnected && clicks === 1,
      projected: symbols.every(s => getComputedStyle(s,'::after').content.includes('₩') && getComputedStyle(s.firstElementChild).visibility === 'hidden'),
      idempotent: firstHTML === p.innerHTML,
      noOverflow: p.scrollWidth <= p.clientWidth + 1
    };
    const invalid = ['원가 C:\\1,000\\data', '원가 \\12,34', '원가 \\12.345', '원가 \\100USD', '원가 \\\\100', '원가 \\100/abc', '금액 정규식 \\1', '파일 원가 \\100', '일반 설명 \\100', '원가 ₩1,000'];
    checks.invalid = invalid.every((v,i) => { const e=make('bad'+i,v); __won.repairRoot(e); return !e.querySelector('.aistudio-won-symbol') && e.textContent===v; });
    checks.protected = ['code','pre','a','math'].every((tag,i) => { const e=make('protected'+i,''); e.innerHTML='<'+tag+'>원가 \\1,000</'+tag+'>'; __won.repairRoot(e); return !e.querySelector('.aistudio-won-symbol'); });
    const user = make('user-won',text,document.getElementById('user')); __won.repairRoot(user);
    checks.user = !user.querySelector('.aistudio-won-symbol');
    const quote=document.createElement('blockquote'); root.append(quote);
    make('context','재고자산평가손실을 구하시오',quote);
    const options=make('options','① \\1,800 ② \\2,000 ③ \\3,000',quote); __won.repairRoot(quote);
    checks.options=options.querySelectorAll('.aistudio-won-symbol').length===3;
    options.style.width='145px';
    checks.amountsStayTogether=[...options.querySelectorAll('.aistudio-won-amount')].every(e=>{
      const range=document.createRange(); range.selectNodeContents(e);
      const rects=[...range.getClientRects()];
      return getComputedStyle(e).whiteSpace==='nowrap' && Math.max(...rects.map(r=>r.top))-Math.min(...rects.map(r=>r.top))<4;
    });
    globalThis.__makeWon=make;
    return {checks};
  });
  await page.waitForTimeout(2800);
  await page.evaluate(() => { document.getElementById('won').setAttribute('data-turn-role','model'); __won.scan(); });
  await page.waitForTimeout(400);
  result.checks.attributeRefreshStable = await page.locator('#won .aistudio-won-symbol').count() === 3;
  await page.evaluate(() => document.getElementById('won').removeAttribute('data-turn-role'));
  await page.evaluate(() => { document.querySelector('.run-button').textContent='Stop'; __makeWon('stream','원가 \\900'); __won.scan(); });
  result.checks.streamingDeferred = await page.locator('#stream').evaluate(e=>!e.querySelector('.aistudio-won-symbol'));
  await page.evaluate(() => { document.querySelector('.run-button').textContent='Run'; __won.scan(); });
  await page.waitForFunction(()=>!!document.querySelector('#stream .aistudio-won-symbol'));
  result.checks.resumed=true;
  await page.evaluate(() => { document.querySelector('.run-button').textContent='Stop'; document.querySelector('#stream .aistudio-won-source').firstChild.nodeValue='Y'; __won.scan(); });
  await page.waitForTimeout(300);
  result.checks.streamingCleanupDeferred = await page.locator('#stream').evaluate(e=>!!e.querySelector('.aistudio-won-symbol'));
  await page.evaluate(() => { document.querySelector('.run-button').textContent='Run'; __won.scan(); });
  await page.waitForFunction(()=>!document.querySelector('#stream .aistudio-won-symbol'));
  await page.evaluate(() => { document.getElementById('stream').textContent='원가 \\900'; __won.scan(); });
  await page.waitForFunction(()=>!!document.querySelector('#stream .aistudio-won-symbol'));
  await page.evaluate(() => { document.querySelector('#stream .aistudio-won-source').firstChild.nodeValue='X'; __won.scan(); });
  await page.waitForFunction(()=>!document.querySelector('#stream .aistudio-won-symbol'));
  result.checks.cleanup = await page.locator('#stream').textContent() === '원가 X900';
  await page.evaluate(() => { document.getElementById('user').append(document.getElementById('won')); __won.scan(); });
  await page.waitForFunction(()=>!document.querySelector('#won .aistudio-won-symbol'));
  result.checks.roleCleanup=true;
  if(Object.values(result.checks).some(v=>!v)) throw new Error(JSON.stringify(result));
  return result;
}
