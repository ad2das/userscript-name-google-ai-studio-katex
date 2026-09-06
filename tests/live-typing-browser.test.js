async (page) => {
  const fs = require('node:fs');
  const source = fs.readFileSync('aaa.user.js', 'utf8')
    .replace('const ENABLE_SAFE_OUTPUT_REPAIR = true;', 'const ENABLE_SAFE_OUTPUT_REPAIR = false;')
    .replace(/\n  if \(document\.readyState === 'loading'\)/,
      '\n  globalThis.__createController = createLiveEmphasisController;\n  if (document.readyState === \'loading\')');
  await page.setContent('<html><body><ms-prompt-input id="composer"></ms-prompt-input><article id="model"><p>**원문 보존** 끝</p></article></body></html>');
  await page.evaluate(() => {
    const composer = document.getElementById('composer');
    for (let i = 0; i < 1500; i++) {
      const span = document.createElement('span');
      span.textContent = '입력 상태';
      composer.append(span);
    }
  });
  await page.addScriptTag({content:source});
  await page.evaluate(() => {
    globalThis.__typingController = __createController({getRoot:()=>document.getElementById('model'),parse:()=>[],active:()=>false,typing:()=>true});
    globalThis.__originalClosest = Element.prototype.closest;
    globalThis.__closestCalls = 0;
    Element.prototype.closest = function (...args) { __closestCalls++; return __originalClosest.apply(this,args); };
    globalThis.__batchStart = performance.now();
    for (const span of document.querySelectorAll('#composer span')) span.firstChild.nodeValue += ' 변경';
  });
  await page.waitForTimeout(50);
  const result = await page.evaluate(() => {
    const result = { records:1500, closestCalls:__closestCalls,
      sourceUnchanged:document.querySelector('#model p').textContent==='**원문 보존** 끝' };
    Element.prototype.closest = __originalClosest;
    __typingController.stop();
    return result;
  });
  if (result.closestCalls > 20 || !result.sourceUnchanged) throw new Error(JSON.stringify(result));
  return result;
}
