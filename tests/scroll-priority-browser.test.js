async (page) => {
  const fs = require('node:fs');
  const source = fs.readFileSync('aaa.user.js', 'utf8')
    .replace('  function repairInlineEmphasisInContainer(container, depth = 0, nested = false) {',
      '  function repairInlineEmphasisInContainer(container, depth = 0, nested = false) { if (container?.id) globalThis.__repairOrder.push(container.id);')
    .replace(/\n  if \(document\.readyState === 'loading'\)/,
      '\n  globalThis.__scrollTest = { states, inlineCursors };\n  if (document.readyState === \'loading\')');
  await page.setContent('<main><div id="scroller" style="height:500px;overflow:auto"><article data-turn-role="model" id="long"><p id="head">**처음 강조**</p></article></div><ms-prompt-input><textarea></textarea><button class="run-button">Run</button></ms-prompt-input></main>');
  await page.evaluate(() => {
    const root = document.getElementById('long');
    for (let i = 0; i < 450; i++) {
      const p = document.createElement('p');
      p.textContent = '설명 문단 ' + i + ' 내용은 그대로 보존합니다.';
      root.append(p);
    }
    const tail = document.createElement('p');
    tail.id = 'tail';
    tail.textContent = '**마지막 강조**';
    root.append(tail);
    globalThis.__repairOrder = [];
    globalThis.__hitTests = 0;
    globalThis.__scrollEvents = 0;
    document.addEventListener('scroll', () => __scrollEvents++, { capture: true, passive: true });
    const nativeHitTest = document.elementFromPoint.bind(document);
    document.elementFromPoint = (...args) => { __hitTests++; return nativeHitTest(...args); };
    globalThis.__idleId = 0;
    window.requestIdleCallback = () => ++__idleId; // Simulate a busy app's idle starvation.
    window.cancelIdleCallback = () => {};
  });
  await page.addScriptTag({ content: source });
  await page.waitForFunction(() => __idleId > 0);
  await page.evaluate(() => {
    const root = document.getElementById('long');
    __scrollTest.states.set(root, { text: root.textContent, since: Date.now() - 5000, attempted: null, attempts: 0, lastAttemptAt: null });
    __scrollTest.inlineCursors.set(root, 0);
    globalThis.__scrollStarted = performance.now();
    document.getElementById('scroller').scrollTop = 1e6;
  });
  await page.waitForFunction(() => !!document.querySelector('#tail strong'), null, { timeout: 3000 });
  const result = await page.evaluate(() => ({
    tailLatency: performance.now() - __scrollStarted,
    hitTests: __hitTests,
    scrollEvents: __scrollEvents,
    tailBeforeHead: __repairOrder.indexOf('tail') >= 0 &&
      (__repairOrder.indexOf('head') < 0 || __repairOrder.indexOf('tail') < __repairOrder.indexOf('head')),
    tailText: document.getElementById('tail').textContent
  }));
  await page.focus('textarea');
  const hitsBeforeTyping = await page.evaluate(() => __hitTests);
  await page.evaluate(() => {
    document.getElementById('tail').textContent = '**입력 중 보존**';
    document.getElementById('scroller').dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(300);
  result.typingProtected = await page.evaluate(() => document.getElementById('tail').textContent === '**입력 중 보존**' && !document.querySelector('#tail strong'));
  result.typingDoesNotHitTest = await page.evaluate(before => __hitTests === before, hitsBeforeTyping);
  await page.evaluate(() => {
    document.querySelector('textarea').blur();
    document.querySelector('button').textContent = 'Stop';
  });
  await page.waitForTimeout(1700);
  await page.evaluate(() => {
    document.getElementById('tail').textContent = '**생성 중 원문**';
    document.getElementById('scroller').dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(300);
  result.generationSourceProtected = await page.evaluate(() => document.getElementById('tail').textContent === '**생성 중 원문**' && !document.querySelector('#tail strong'));
  if (!result.tailBeforeHead || result.tailText !== '마지막 강조' || !result.typingProtected || !result.typingDoesNotHitTest || !result.generationSourceProtected || result.hitTests > 21 * result.scrollEvents) throw new Error(JSON.stringify(result));
  return result;
}
