async (page) => {
  const fs = require('node:fs');
  const source = fs.readFileSync('aaa.user.js', 'utf8').replace(/\n  if \(document\.readyState === 'loading'\)/,
    '\n  globalThis.__liveParse = findMatches;\n  if (document.readyState === \'loading\')');
  await page.setContent('<!doctype html><html><body><main><ms-prompt-input><textarea></textarea><button class="run-button">Stop</button></ms-prompt-input><article data-turn-role="user">**사용자 원문**</article><article id="model" data-turn-role="model"><p>**첫 문단** 끝</p><p>**둘째 문단** 끝</p><p>**셋째 문단** 끝</p></article></main></body></html>');
  await page.addScriptTag({ content: source });
  await page.addScriptTag({ path: 'tests/fixtures/live-emphasis-prototype.js' });
  await page.addScriptTag({ path: 'tests/fixtures/live-emphasis-controller.js' });
  await page.evaluate(() => {
    globalThis.__typing = false;
    globalThis.__sourceNodes = Array.from(document.querySelectorAll('#model p')).map(p=>p.firstChild);
    globalThis.__controller = createLiveEmphasisController({
      getRoot: () => document.getElementById('model'), parse: __liveParse,
      active: () => document.querySelector('button').textContent === 'Stop', typing: () => __typing
    });
  });
  await page.waitForFunction(() => __controller.stats().ranges === 3);
  const checks = await page.evaluate(() => ({
    threeParagraphsOneLayer: __controller.stats().ranges === 3 && document.querySelectorAll('.aistudio-live-preview-layer').length === 1,
    originalNodesPreserved: __sourceNodes.every((n,i)=>document.querySelectorAll('#model p')[i].firstChild===n),
    userSourceUntouched: document.querySelector('[data-turn-role="user"]').textContent === '**사용자 원문**'
  }));
  await page.evaluate(() => {
    globalThis.__oldGroups = Array.from(document.querySelectorAll('.aistudio-live-preview-block'));
    globalThis.__beforeRenders = __controller.stats().renderedBlocks;
    document.querySelector('#model p').firstChild.nodeValue = '**바뀐 문단** 끝';
  });
  await page.waitForFunction(() => __controller.stats().renderedBlocks > __beforeRenders);
  checks.unrelatedParagraphsNotRepainted = await page.evaluate(() =>
    __controller.stats().renderedBlocks === __beforeRenders + 1 &&
    __oldGroups[1].isConnected && __oldGroups[2].isConnected && __controller.stats().ranges === 3);
  await page.evaluate(() => { __typing = true; __controller.invalidate(); });
  checks.typingClearsAll = await page.evaluate(() => !__controller.stats().layerConnected && __controller.stats().ranges === 0);
  await page.evaluate(() => { __typing = false; __controller.invalidate(); });
  await page.waitForFunction(() => __controller.stats().ranges === 3);
  await page.evaluate(() => { document.querySelector('button').textContent = 'Run'; });
  await page.waitForFunction(() => !__controller.stats().layerConnected);
  checks.completionReleasesSource = await page.evaluate(() =>
    __controller.stats().ranges === 0 && !CSS.highlights.has('aistudio-live-prototype') &&
    document.querySelector('#model p').textContent === '**바뀐 문단** 끝');
  await page.waitForTimeout(2800);
  checks.legacyCompletionRepairResumes = await page.evaluate(() =>
    document.querySelectorAll('#model strong').length === 3 &&
    !document.getElementById('model').textContent.includes('**'));
  await page.evaluate(() => {
    document.querySelector('button').textContent = 'Stop';
    document.getElementById('model').innerHTML = '<p>**다음 생성** 끝</p>';
  });
  await page.waitForFunction(() => __controller.stats().ranges === 1);
  checks.nextGenerationStartsClean = await page.evaluate(() =>
    __controller.stats().blocks === 1 && document.querySelectorAll('.aistudio-live-preview-layer').length === 1);
  await page.evaluate(() => __controller.stop());
  checks.teardown = await page.evaluate(() => !document.querySelector('.aistudio-live-preview-layer') && !CSS.highlights.has('aistudio-live-prototype'));
  if (Object.values(checks).some(x=>!x)) throw new Error(JSON.stringify(checks));
  return { checks };
}
