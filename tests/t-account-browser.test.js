async (page) => {
  const fs = require('node:fs');
  const source = [
    '[매출채권] (자산: 차변 계정)                    [매입채무] (부채: 대변 계정)',
    '─────────────────────────────────────         ─────────────────────────────────────',
    '★기초잔액★ (왼쪽!) │ 당기 회수액 (감소)           당기 지급액 (감소) │ ★기초잔액★ (오른쪽!)',
    '당기 외상매출 (증가) │ ★기말잔액★ (오른쪽!)        ★기말잔액★ (왼쪽!) │ 당기 외상매입 (증가)',
    '─────────────────────────────────────         ─────────────────────────────────────',
    '차변합계           │ 대변합계                    차변합계           │ 대변합계'
  ].join('\n');
  await page.setContent('<html><body><article data-turn-role="model"><pre><code></code></pre></article></body></html>');
  await page.evaluate(text => { document.querySelector('code').textContent = text; globalThis.__originalCode = document.querySelector('code'); }, source);
  await page.addScriptTag({ content:fs.readFileSync('aaa.user.js','utf8') });
  await page.waitForFunction(() => !!document.querySelector('.aistudio-ascii-tree-visual'));
  const result = await page.evaluate(text => {
    const axes = [0,1].map(panel => Array.from(document.querySelectorAll(`[data-aistudio-ascii-panel="${panel}"]`))
      .filter(e=>/[|│]/.test(e.getAttribute('data-aistudio-ascii-cell'))).map(e=>e.getBoundingClientRect().left));
    return { sourcePreserved:document.querySelector('code')===__originalCode && __originalCode.textContent===text,
      axes, aligned:axes.every(xs=>xs.length===3 && Math.max(...xs)-Math.min(...xs)<1),
      oneVisual:document.querySelectorAll('.aistudio-ascii-tree-visual').length===1 };
  }, source);
  const singleSource = [
    '매출채권 (자산)', '─────────────────────────────────────────────',
    '기초잔액        60,000 │ 회수액        250,000',
    '★당기외상매출★ 【295,000】│ 기말잔액      105,000',
    '─────────────────────────────────────────────',
    '차변합계       355,000 │ 대변합계      355,000'
  ].join('\n');
  await page.evaluate(text => {
    const pre = document.createElement('pre');
    pre.id = 'single-account';
    const code = document.createElement('code');
    code.textContent = text;
    pre.append(code);
    document.querySelector('article').append(pre);
    globalThis.__singleCode = code;
  }, singleSource);
  await page.waitForFunction(() => !!document.querySelector('#single-account .aistudio-ascii-tree-visual'));
  result.single = await page.evaluate(text => {
    const pre = document.getElementById('single-account');
    const axes = Array.from(pre.querySelectorAll('.aistudio-ascii-delimited-separator')).map(e=>e.getBoundingClientRect().left);
    const overflow = pre.scrollWidth > pre.clientWidth + 1;
    const overflowMode = getComputedStyle(pre).overflowX;
    pre.scrollLeft = pre.scrollWidth;
    const reachable = !overflow || (['auto','scroll'].includes(overflowMode) && pre.scrollLeft > 0);
    pre.scrollLeft = 0;
    return { axes, aligned:axes.length===3 && Math.max(...axes)-Math.min(...axes)<1,
      horizontalContentReachable: reachable,
      sourcePreserved:pre.querySelector('code')===__singleCode && __singleCode.textContent===text,
      wrappedAmountPreserved:!!pre.querySelector('[data-aistudio-ascii-cell="【295,000】"]') };
  }, singleSource);
  await page.screenshot({path:'output/playwright/t-account-alignment.png'});
  if (!result.sourcePreserved || !result.aligned || !result.oneVisual) throw new Error(JSON.stringify(result));
  if (!result.single.aligned || !result.single.sourcePreserved || !result.single.wrappedAmountPreserved || !result.single.horizontalContentReachable) throw new Error(JSON.stringify(result.single));
  return result;
}
