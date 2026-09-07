async (page) => {
  const fs = require('node:fs');
  const source = fs.readFileSync('aaa.user.js', 'utf8')
    .replace('const ENABLE_LIVE_EMPHASIS = true;', 'const ENABLE_LIVE_EMPHASIS = false;')
    .replace(/\n  if \(document\.readyState === 'loading'\)/,
    '\n  globalThis.__liveParse = findMatches; globalThis.createLiveEmphasisController = createLiveEmphasisController;\n  if (document.readyState === \'loading\')');
  await page.setContent('<!doctype html><html><body><main><ms-prompt-input><textarea></textarea><button class="run-button">Stop</button></ms-prompt-input><article data-turn-role="user">**사용자 원문**</article><article id="model" data-turn-role="model"><p>**첫 문단** 끝</p><p>**둘째 문단** 끝</p><p>**셋째 문단** 끝</p></article></main></body></html>');
  await page.addScriptTag({ content: source });
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
  await page.waitForFunction(() => __controller.stats().draining);
  checks.completionKeepsPaintUntilNativeRepair = await page.evaluate(() =>
    __controller.stats().ranges === 3 && __controller.stats().layerConnected &&
    document.querySelector('#model p').textContent === '**바뀐 문단** 끝');
  const transition = await page.evaluate(async () => {
    const start = performance.now();
    let uncoveredFrames = 0;
    let frames = 0;
    while (document.getElementById('model').textContent.includes('**') && performance.now() - start < 4000) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      frames++;
      if (document.getElementById('model').textContent.includes('**') && __controller.stats().ranges === 0) uncoveredFrames++;
    }
    return { frames, uncoveredFrames };
  });
  checks.noObservedGapDuringCompletion = transition.frames > 0 && transition.uncoveredFrames === 0;
  await page.waitForFunction(() => !__controller.stats().layerConnected);
  checks.legacyCompletionRepairResumes = await page.evaluate(() =>
    document.querySelectorAll('#model strong').length === 3 &&
    !document.getElementById('model').textContent.includes('**'));
  await page.evaluate(() => {
    document.querySelector('button').textContent = 'Stop';
    document.getElementById('model').innerHTML = '<p>일반 본문만 먼저 도착했습니다.</p>';
  });
  await page.waitForFunction(() => __controller.stats().layerConnected);
  await page.evaluate(() => { document.querySelector('button').textContent = 'Run'; });
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    const p = document.createElement('p');
    p.id = 'late-render';
    p.textContent = "뒤늦게 **'도착한 강조";
    document.getElementById('model').append(p);
  });
  await page.waitForTimeout(100);
  checks.postRunPendingTextPaints = await page.evaluate(() =>
    __controller.stats().ranges === 1 && document.getElementById('late-render').textContent === "뒤늦게 **'도착한 강조");
  await page.evaluate(() => { document.getElementById('late-render').firstChild.nodeValue += "'** 끝"; });
  await page.waitForTimeout(100);
  checks.postRunSourceRetained = await page.evaluate(() =>
    __controller.stats().ranges === 1 && document.getElementById('late-render').textContent === "뒤늦게 **'도착한 강조'** 끝");
  await page.evaluate(() => { __typing = true; __controller.invalidate(); });
  checks.typingEndsPostRunBridge = await page.evaluate(() => !__controller.stats().layerConnected && __controller.stats().ranges === 0);
  await page.evaluate(() => { __typing = false; });
  await page.waitForFunction(() => !__controller.stats().layerConnected);
  await page.evaluate(() => {
    document.querySelector('button').textContent = 'Stop';
    document.getElementById('model').innerHTML = '<p>늦은 네이티브 출력을 기다리는 본문입니다.</p>';
  });
  await page.waitForFunction(() => __controller.stats().layerConnected);
  await page.evaluate(() => { document.querySelector('button').textContent = 'Run'; });
  // Entering the completion phase can precede the already-queued animation
  // frame. Start the no-poll measurement only after that work has drained.
  await page.waitForFunction(() => {
    const stats = __controller.stats();
    return stats.draining && stats.queued === 0 && !stats.discovering;
  });
  const idleRenders = await page.evaluate(() => __controller.stats().renderedBlocks);
  await page.waitForTimeout(5500);
  checks.postRunPauseDoesNotPoll = await page.evaluate(before =>
    __controller.stats().renderedBlocks === before, idleRenders);
  await page.evaluate(() => {
    const p = document.createElement('p');
    p.id = 'paused-render';
    p.textContent = "공백 뒤 다시 도착한 **'강조";
    document.getElementById('model').append(p);
  });
  await page.waitForFunction(() => __controller.stats().ranges === 1, null, { timeout: 3000 });
  checks.postRunLongPauseStillPaints = await page.evaluate(() =>
    __controller.stats().ranges === 1 &&
    document.getElementById('paused-render').textContent === "공백 뒤 다시 도착한 **'강조");
  await page.evaluate(() => {
    let revision = 0;
    globalThis.__lateMutationTimer = setInterval(() => {
      document.getElementById('paused-render').firstChild.nodeValue = `계속 도착한 **'강조 ${++revision}`;
    }, 200);
  });
  await page.waitForTimeout(25000);
  checks.postRunBridgeHasHardDeadline = await page.evaluate(() =>
    !__controller.stats().draining && !__controller.stats().layerConnected);
  await page.evaluate(() => clearInterval(__lateMutationTimer));
  await page.evaluate(() => {
    document.querySelector('button').textContent = 'Stop';
    document.getElementById('model').innerHTML = '<p>**다음 생성** 끝</p>';
  });
  await page.waitForFunction(() => __controller.stats().ranges === 1);
  checks.nextGenerationStartsClean = await page.evaluate(() =>
    __controller.stats().blocks === 1 && document.querySelectorAll('.aistudio-live-preview-layer').length === 1);
  await page.evaluate(() => {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 130; i++) {
      const p = document.createElement('p');
      p.textContent = `**문단 ${i}** 끝`;
      fragment.append(p);
    }
    document.getElementById('model').replaceChildren(fragment);
  });
  await page.waitForFunction(() => __controller.stats().blocks === 130 && !__controller.stats().discovering && __controller.stats().queued === 0);
  checks.discoveryContinuesBeyond64Paragraphs = await page.evaluate(() =>
    __controller.stats().blocks === 130 && document.querySelectorAll('#model p').length === 130 &&
    document.querySelector('#model p').textContent === '**문단 0** 끝');
  await page.evaluate(() => __controller.stop());
  checks.teardown = await page.evaluate(() => !document.querySelector('.aistudio-live-preview-layer') && !CSS.highlights.has('aistudio-live-emphasis'));
  if (Object.values(checks).some(x=>!x)) throw new Error(JSON.stringify(checks));
  return { checks, transition };
}
