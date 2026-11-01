async (page) => {
  const fs = require('node:fs');
  const source = fs.readFileSync(process.env.AISTUDIO_SOURCE || 'aaa.user.js', 'utf8')
    .replace('  function scan() {', '  function scan() { globalThis.__scans++;');
  const TURNS = 6;
  const PARAGRAPHS = 30;
  const MATH = String.raw`\begin{aligned} x &= \mathbf{1} \\ y &= 2 \end{aligned}`;
  await page.setContent('<main role="main"><ms-prompt-input><textarea></textarea>' +
    '<button class="run-button">Run</button></ms-prompt-input><div id="list"></div></main>');
  await page.evaluate(({ turns, paragraphs, math }) => {
    globalThis.__scans = 0;
    globalThis.__walk = { on: false, picks: 0, visits: 0 };
    // Count only the fallback discovery walker (its reject filter names dialogs).
    const createTreeWalker = Document.prototype.createTreeWalker;
    Document.prototype.createTreeWalker = function (root, whatToShow, filter) {
      const walker = createTreeWalker.call(this, root, whatToShow, filter);
      if (filter && typeof filter.acceptNode === 'function' &&
          String(filter.acceptNode).includes('[role="dialog"]')) {
        if (globalThis.__walk.on) globalThis.__walk.picks += 1;
        const nextNode = walker.nextNode.bind(walker);
        walker.nextNode = () => {
          const node = nextNode();
          if (node && globalThis.__walk.on) globalThis.__walk.visits += 1;
          return node;
        };
      }
      return walker;
    };
    const list = document.getElementById('list');
    for (let i = 0; i < turns; i++) {
      const article = document.createElement('article');
      article.setAttribute('data-turn-role', 'model');
      const host = document.createElement('ms-cmark-node');
      for (let k = 0; k < paragraphs; k++) {
        const paragraph = document.createElement('p');
        paragraph.textContent = '턴 ' + i + ' 문단 ' + k + ' **굵게 ' + k + '** 끝.';
        host.append(paragraph);
      }
      const renderer = document.createElement('new-response-renderer');
      const mathHost = document.createElement('div');
      mathHost.textContent = math;
      renderer.append(mathHost);
      article.append(host, renderer);
      list.append(article);
    }
  }, { turns: TURNS, paragraphs: PARAGRAPHS, math: MATH });
  await page.addScriptTag({ path: 'node_modules/katex/dist/katex.min.js' });
  await page.addScriptTag({ content: source });
  const allRepaired = ({ turns, paragraphs }) => {
    const articles = Array.from(document.querySelectorAll('#list article'));
    return articles.length === turns && articles.every(article =>
      article.querySelectorAll('ms-cmark-node p strong').length === paragraphs &&
      article.querySelector('new-response-renderer .aistudio-aligned-repaired, new-response-renderer .aistudio-raw-math-repaired') && !article.querySelector('new-response-renderer').textContent.includes('begin{'));
  };
  await page.waitForFunction(allRepaired, { turns: TURNS, paragraphs: PARAGRAPHS }, { timeout: 8000 });
  await page.waitForTimeout(600);

  // AI Studio re-renders a scrolled turn top-down: each element is attached
  // first and filled afterwards, so one batch reports nested scopes.
  const rerender = await page.evaluate(({ turns, paragraphs, math }) => new Promise((resolve) => {
    const articles = Array.from(document.querySelectorAll('#list article'));
    globalThis.__walk.on = true;
    const t0 = performance.now();
    let nodes = 0;
    for (let i = 0; i < turns; i++) {
      const article = articles[i];
      article.replaceChildren();
      const host = document.createElement('ms-cmark-node');
      const renderer = document.createElement('new-response-renderer');
      article.append(host, renderer);
      nodes += 2;
      for (let k = 0; k < paragraphs; k++) {
        const paragraph = document.createElement('p');
        host.append(paragraph);
        const outer = document.createElement('span');
        paragraph.append(outer);
        const inner = document.createElement('span');
        outer.append(inner);
        inner.append(document.createTextNode('턴 ' + i + ' 문단 ' + k + ' **굵게 ' + k + '** 끝.'));
        nodes += 4;
      }
      const mathHost = document.createElement('div');
      renderer.append(mathHost);
      mathHost.append(document.createTextNode(math));
      nodes += 2;
    }
    const finish = (repairedMs) => resolve({
      repairedMs,
      rerenderedNodes: nodes,
      walkPicks: globalThis.__walk.picks,
      walkVisits: globalThis.__walk.visits
    });
    const poll = () => {
      const articles = Array.from(document.querySelectorAll('#list article'));
      const done = articles.length === turns && articles.every(article =>
        article.querySelectorAll('ms-cmark-node p strong').length === paragraphs &&
        article.querySelector('new-response-renderer .aistudio-aligned-repaired, new-response-renderer .aistudio-raw-math-repaired') && !article.querySelector('new-response-renderer').textContent.includes('begin{'));
      if (done) {
        const repairedMs = Math.round(performance.now() - t0);
        // Late duplicate walks after the repair still count.
        window.setTimeout(() => finish(repairedMs), 1000);
        return;
      }
      if (performance.now() - t0 > 8000) return finish(-1);
      window.setTimeout(poll, 10);
    };
    poll();
  }), { turns: TURNS, paragraphs: PARAGRAPHS, math: MATH });

  const state = await page.evaluate(async ({ turns, paragraphs }) => {
    globalThis.__walk.on = false;
    const before = globalThis.__scans;
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const articles = Array.from(document.querySelectorAll('#list article'));
    return {
      idleScansIn2s: globalThis.__scans - before,
      strong: articles.map(article => article.querySelectorAll('ms-cmark-node p strong').length),
      rawMath: articles.filter(article =>
        article.querySelector('new-response-renderer .aistudio-aligned-repaired, new-response-renderer .aistudio-raw-math-repaired') && !article.querySelector('new-response-renderer').textContent.includes('begin{')).length,
      literalStars: articles.filter(article => article.textContent.includes('**')).length,
      expectedStrong: paragraphs,
      turns
    };
  }, { turns: TURNS, paragraphs: PARAGRAPHS });

  const result = { ...rerender, ...state };
  if (process.env.AISTUDIO_LATENCY_BASELINE) return result;
  if (
    result.repairedMs < 0 ||
    result.repairedMs > 600 ||
    // One walk per re-rendered node (1.13.29: 1290 visits / 382 walks for 744 nodes).
    result.walkVisits > result.rerenderedNodes ||
    result.walkPicks > TURNS * 4 ||
    result.idleScansIn2s > 2 ||
    result.rawMath !== TURNS ||
    result.literalStars !== 0 ||
    result.strong.some(count => count !== PARAGRAPHS)
  ) throw new Error(JSON.stringify(result));
  return result;
}
