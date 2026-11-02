async (page) => {
  // Phone diag 2026-11-02 (1.13.31): 14 raw `**` stayed 1-3 s after a generation
  // while the scroll gate fired 50 times with nobody touching the page. Scroll
  // events without user input (anchoring after our own repairs, AI Studio's
  // autoscroll) must not pause repairs; a finger or wheel still must.
  const fs = require('node:fs');
  const source = fs.readFileSync(process.env.AISTUDIO_SOURCE || 'aaa.user.js', 'utf8');
  const paras = Array.from({ length: 40 }, (_, i) => `<p>문단 ${i}: 리스부채와 사용권자산을 정리합니다.</p>`).join('');
  await page.setContent('<!doctype html><html><body style="margin:0"><main role="main">' +
    '<div id="sc" style="height:600px;overflow:auto"><article data-turn-role="model"><ms-cmark-node id="response">' + paras +
    '</ms-cmark-node></article><div style="height:1200px"></div></div>' +
    '<ms-prompt-input><textarea></textarea><button class="run-button">Run</button></ms-prompt-input></main></body></html>');
  await page.addScriptTag({ path: 'node_modules/katex/dist/katex.min.js' });
  await page.addScriptTag({ content: source });
  await page.waitForTimeout(1500);

  // Keeps scrolling by script for `ms`; `pointer` wraps it in a pointer press.
  const run = (id, ms, pointer) => page.evaluate(({ id, ms, pointer }) => new Promise((resolve) => {
    const sc = document.getElementById('sc');
    sc.scrollTop = 300;
    if (pointer) sc.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    const p = document.createElement('p');
    p.id = id;
    p.textContent = '결론은 **' + id + ' 강조**입니다.';
    document.getElementById('response').prepend(p);
    const started = performance.now();
    let repairedAt = null;
    let during = null;
    let dir = 1;
    const tick = setInterval(() => {
      const t = performance.now() - started;
      if (repairedAt === null && p.querySelector('strong')) repairedAt = t;
      if (t < ms) { sc.scrollTop += dir; dir = -dir; return; }
      if (during === null) {
        during = !!p.querySelector('strong');
        if (pointer) sc.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }));
      }
      if (repairedAt !== null || t > ms + 3000) {
        clearInterval(tick);
        resolve({ repairedAt: repairedAt === null ? null : Math.round(repairedAt), repairedWhileScrolling: during });
      }
    }, 40);
  }), { id, ms, pointer });

  const checks = {};
  // 1. Script-only scrolling for 2.5 s: the repair must not wait for it to stop.
  const script = await run('script', 2500, false);
  checks.scriptMs = script.repairedAt;
  checks.scriptNotGated = script.repairedAt !== null && script.repairedAt <= 700;
  await page.waitForTimeout(1600);
  // 2. The same scrolling under a pressed pointer is the user's: repairs wait,
  //    then land soon after the gesture (and its 1.5 s momentum window) ends.
  const user = await run('user', 1200, true);
  checks.userMs = user.repairedAt;
  checks.userGated = user.repairedWhileScrolling === false;
  checks.userAfter = user.repairedAt !== null && user.repairedAt <= 1200 + 1500 + 700;
  const failed = Object.entries(checks).filter(([, ok]) => ok === false).map(([key]) => key);
  if (failed.length) throw new Error(JSON.stringify({ failed, checks }));
  return { checks };
}
