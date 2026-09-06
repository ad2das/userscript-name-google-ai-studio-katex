async (page) => {
  const fs = require('node:fs');
  const source = fs.readFileSync('aaa.user.js', 'utf8')
    .replace('  function scan() {', '  function scan() { globalThis.__scanCalls++;')
    .replace(/\n  if \(document\.readyState === 'loading'\)/,
      '\n  globalThis.__scheduler = { schedule, lastModelTurn, retryDelay };\n  if (document.readyState === \'loading\')');
  await page.setContent('<!doctype html><html><body><main><ms-prompt-input><textarea></textarea><button class="run-button">Run</button></ms-prompt-input><article data-turn-role="model"><p>**untouched while busy**</p></article></main></body></html>');
  await page.evaluate(() => {
    globalThis.__scanCalls = 0;
    globalThis.__idleCalls = 0;
    globalThis.__cancelledIdle = 0;
    globalThis.__heldIdle = new Map();
    window.requestIdleCallback = (callback) => {
      const id = ++__idleCalls;
      __heldIdle.set(id, callback);
      return id;
    };
    window.cancelIdleCallback = (id) => {
      if (__heldIdle.delete(id)) __cancelledIdle++;
    };
  });
  await page.addScriptTag({ content: source });
  await page.waitForFunction(() => __heldIdle.size > 0);
  const before = await page.evaluate(() => __scanCalls);
  await page.evaluate(() => __scheduler.schedule(0, true));
  await page.waitForFunction((n) => __scanCalls > n, before, { timeout: 700 });
  const preemption = await page.evaluate(() => __cancelledIdle > 0);
  await page.focus('textarea');
  const typingBefore = await page.evaluate(() => __scanCalls);
  await page.evaluate(() => __scheduler.schedule(0, true));
  await page.waitForFunction((n) => __scanCalls > n, typingBefore, { timeout: 700 });
  const typingSafe = await page.evaluate(() => !document.querySelector('article strong'));
  await page.evaluate(() => {
    document.querySelector('textarea').blur();
    document.querySelector('button').textContent = 'Stop';
  });
  await page.waitForTimeout(1800);
  const streamingBefore = await page.evaluate(() => __scanCalls);
  await page.evaluate(() => __scheduler.schedule(0, true));
  await page.waitForFunction((n) => __scanCalls > n, streamingBefore, { timeout: 700 });
  const streamingSafe = await page.evaluate(() =>
    !document.querySelector('article strong') &&
    document.documentElement.getAttribute('data-aistudio-mobile-fix-generating') === 'true');
  const ordering = await page.evaluate(() => {
    const oldTurn = document.querySelector('article');
    const latest = document.createElement('article');
    latest.setAttribute('data-turn-role', 'model');
    latest.innerHTML = '<p>latest</p>';
    oldTurn.after(latest);
    const newest = __scheduler.lastModelTurn([latest.firstElementChild, oldTurn]);
    latest.remove();
    return newest === latest && __scheduler.lastModelTurn([]) === null;
  });
  const backoff = await page.evaluate(() =>
    JSON.stringify([1, 2, 3, 4, 5, 99].map(__scheduler.retryDelay)) ===
    JSON.stringify([2000, 4000, 8000, 16000, 30000, 30000]));
  const checks = { urgentPreemptsStarvedIdle: preemption, urgentRespectsTyping: typingSafe, urgentRespectsStreaming: streamingSafe,
    newestTurnIndependentOfWorkQueue: ordering, retryBackoffNotShadowedByMaximum: backoff };
  if (Object.values(checks).some(value => !value)) throw new Error(JSON.stringify(checks));
  return { checks };
}
