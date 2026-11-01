async (page) => {
  const fs = require('node:fs');
  const source = fs.readFileSync('aaa.user.js', 'utf8')
    .replace('  function scan() {', '  function scan() { globalThis.__scans++;');
  await page.setContent('<main role="main"><ms-prompt-input><textarea></textarea>' +
    '<button class="run-button">Run</button></ms-prompt-input><div id="list"></div></main>');
  await page.evaluate(() => {
    const list = document.getElementById('list');
    for (let i = 0; i < 60; i++) {
      const article = document.createElement('article');
      article.setAttribute('data-turn-role', 'model');
      article.style.display = 'block';
      article.style.minHeight = '400px';
      const host = document.createElement('ms-cmark-node');
      const paragraph = document.createElement('p');
      paragraph.textContent = '턴 ' + i + ' **굵게 ' + i + '** 끝.';
      host.append(paragraph);
      article.append(host);
      list.append(article);
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  const visible = await page.evaluate(() => {
    const articles = Array.from(document.querySelectorAll('#list article'));
    const height = window.innerHeight;
    return articles
      .map((article, index) => ({ index, rect: article.getBoundingClientRect() }))
      .filter(({ rect }) => rect.bottom >= 0 && rect.top <= height)
      .map(({ index }) => index);
  });
  if (!visible.length) throw new Error('FAIL_FIXTURE');
  await page.evaluate(() => {
    globalThis.__scans = 0;
    globalThis.__order = [];
    globalThis.__done = new Map();
    globalThis.__batch = 0;
    globalThis.__t0 = performance.now();
    const list = document.getElementById('list');
    const articles = Array.from(list.querySelectorAll('article'));
    const observer = new MutationObserver(() => {
      __batch += 1;
      articles.forEach((article, index) => {
        if (__done.has(index)) return;
        if (!article.querySelector('strong')) return;
        __done.set(index, { at: performance.now() - __t0, batch: __batch });
        __order.push(index);
      });
    });
    observer.observe(list, { childList: true, subtree: true, characterData: true });
  });
  await page.addScriptTag({ path: 'node_modules/katex/dist/katex.min.js' });
  await page.addScriptTag({ content: source });
  await page.waitForFunction(() => {
    const articles = Array.from(document.querySelectorAll('#list article'));
    return articles.length === 60 && articles.every(article => article.querySelector('strong'));
  }, null, { timeout: 8000 });
  const result = await page.evaluate((visibleIndices) => {
    const done = new Map(__done);
    const order = __order.slice();
    const visibleSet = new Set(visibleIndices);
    let lastVisibleAt = 0;
    let lastVisibleBatch = 0;
    for (const index of visibleIndices) {
      const entry = done.get(index) || { at: 0, batch: 0 };
      lastVisibleAt = Math.max(lastVisibleAt, entry.at);
      lastVisibleBatch = Math.max(lastVisibleBatch, entry.batch);
    }
    // Same-batch repairs land in one paint, so only an earlier batch counts as
    // "repaired before the visible ones".
    const nonVisibleBeforeVisibleDone = order
      .filter(index => !visibleSet.has(index))
      .filter(index => (done.get(index) || { batch: Infinity }).batch < lastVisibleBatch)
      .length;
    const allDoneMs = Math.max(...Array.from(done.values()).map(entry => entry.at));
    return {
      visible: visibleIndices,
      visibleDoneMs: Math.round(lastVisibleAt),
      allDoneMs: Math.round(allDoneMs),
      nonVisibleBeforeVisibleDone,
      repairedRoots: order.length,
      batches: Math.max(...Array.from(done.values()).map(entry => entry.batch))
    };
  }, visible);
  result.visibleCount = visible.length;
  if (process.env.AISTUDIO_LATENCY_BASELINE) return result;
  if (
    result.nonVisibleBeforeVisibleDone > 10 ||
    result.visibleDoneMs > 600 ||
    result.allDoneMs > 3000
  ) throw new Error(JSON.stringify(result));
  return result;
}
