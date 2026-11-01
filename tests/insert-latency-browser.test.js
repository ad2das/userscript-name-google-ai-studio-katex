async (page) => {
  const fs = require('node:fs');
  const source = fs.readFileSync('aaa.user.js', 'utf8')
    .replace('  function scan() {', '  function scan() { globalThis.__scans++;');
  const composer = '<main role="main"><ms-prompt-input><textarea></textarea>' +
    '<button class="run-button">Run</button></ms-prompt-input><div id="list"></div></main>';

  // A lazy-inserted historical turn must be repaired shortly after the scroll
  // stops, and a settled page must not keep scanning.
  const runOnce = async (fallbackPath) => {
    await page.setContent(composer);
    await page.evaluate((fallback) => {
      globalThis.__scans = 0;
      if (fallback) window.MessageChannel = undefined;
      const list = document.getElementById('list');
      for (let i = 0; i < 20; i++) {
        const article = document.createElement('article');
        article.setAttribute('data-turn-role', 'model');
        const host = document.createElement('ms-cmark-node');
        const paragraph = document.createElement('p');
        paragraph.textContent = '턴 ' + i + ' 본문 **굵게 ' + i + '** 입니다.';
        host.append(paragraph);
        article.append(host);
        list.append(article);
      }
    }, fallbackPath);
    await page.addScriptTag({ path: 'node_modules/katex/dist/katex.min.js' });
    await page.addScriptTag({ content: source });
    await page.waitForFunction(() => {
      const articles = Array.from(document.querySelectorAll('#list article'));
      return articles.length === 20 &&
        articles.every(article => article.querySelectorAll('strong').length >= 1);
    }, null, { timeout: 5000 });

    const insert = await page.evaluate(() => new Promise((resolve) => {
      const list = document.getElementById('list');
      let inserted = false;
      let settled = false;
      let tLast = performance.now();
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const observer = new MutationObserver(() => {
        const article = document.getElementById('inserted');
        if (!article || article.querySelectorAll('strong').length < 10) return;
        observer.disconnect();
        finish({
          insertAfterScrollMs: Math.round(performance.now() - tLast),
          repaired: article.querySelectorAll('strong').length
        });
      });
      observer.observe(list, { childList: true, subtree: true, characterData: true });
      const insertArticle = () => {
        if (inserted) return;
        inserted = true;
        const article = document.createElement('article');
        article.id = 'inserted';
        article.setAttribute('data-turn-role', 'model');
        const host = document.createElement('ms-cmark-node');
        for (let k = 0; k < 10; k++) {
          const paragraph = document.createElement('p');
          paragraph.textContent = '삽입 문단 ' + k + ' **삽입 ' + k + '** 확인.';
          host.append(paragraph);
        }
        article.append(host);
        list.insertBefore(article, list.firstElementChild);
      };
      let events = 0;
      const wheel = setInterval(() => {
        document.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true }));
        tLast = performance.now();
        events += 1;
        // 150 ms after the first wheel event: old turn, not the newest one.
        if (events === 6) insertArticle();
        if (events >= 11) clearInterval(wheel);
      }, 30);
      window.setTimeout(() => finish({
        insertAfterScrollMs: -1,
        repaired: document.getElementById('inserted')?.querySelectorAll('strong').length || 0
      }), 5000);
    }));
    const idleScansIn2s = await page.evaluate(async () => {
      const before = globalThis.__scans;
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return globalThis.__scans - before;
    });

    return {
      fallbackPath,
      insertAfterScrollMs: insert.insertAfterScrollMs,
      idleScansIn2s,
      scans: await page.evaluate(() => globalThis.__scans)
    };
  };

  const primary = await runOnce(false);
  const fallback = await runOnce(true);
  const result = { primary, fallback };
  if (process.env.AISTUDIO_LATENCY_BASELINE) return result;
  if (
    primary.insertAfterScrollMs > 300 ||
    primary.idleScansIn2s > 2 ||
    fallback.insertAfterScrollMs > 300 ||
    fallback.idleScansIn2s > 2
  ) throw new Error(JSON.stringify(result));
  return result;
}
