async (page) => {
  const fs = require('node:fs');
  const source = fs.readFileSync('aaa.user.js', 'utf8')
    .replace('  function repairRoot(root) {',
      '  function repairRoot(root) { if (root && root.id === \'perf-turn\') globalThis.__perfRootCalls = (globalThis.__perfRootCalls || 0) + 1;')
    .replace('  function repairRawMath(root, rootText = \'\') {',
      '  function repairRawMath(root, rootText = \'\') { if (root && root.id === \'perf-turn\') globalThis.__perfRawMathCalls = (globalThis.__perfRawMathCalls || 0) + 1;')
    .replace('  function scanResponses() {',
      '  function scanResponses() { globalThis.__scanResponseCalls = (globalThis.__scanResponseCalls || 0) + 1;')
    .replace('    if (!roots) {',
      '    if (!roots) { globalThis.__rootsFilterRuns = (globalThis.__rootsFilterRuns || 0) + 1;')
    .replace(/\n  if \(document\.readyState === 'loading'\)/,
      '\n  globalThis.__perf = { handleMutations, repairRoot, scan, collectRoots, schedule };\n  if (document.readyState === \'loading\')');
  await page.evaluate(() => {
    globalThis.__perfRootCalls = 0;
    globalThis.__perfRawMathCalls = 0;
    globalThis.__scanResponseCalls = 0;
    globalThis.__rootsFilterRuns = 0;
  });
  await page.addScriptTag({ path: 'node_modules/katex/dist/katex.min.js' });
  await page.addScriptTag({ content: source });
  await page.waitForFunction(() => !!globalThis.__perf);
  await page.evaluate(() => {
    // A finished model turn: twenty display formulas whose KaTeX annotation
    // nodes still carry the TeX source, plus one genuinely repairable bold run.
    const turn = document.createElement('ms-chat-turn');
    turn.id = 'perf-turn';
    turn.setAttribute('data-turn-role', 'model');
    for (let i = 0; i < 20; i++) {
      const p = document.createElement('p');
      const slot = document.createElement('span');
      p.append(slot);
      turn.append(p);
      window.katex.render(
        String.raw`\text{rendered formula ${i}} + x_{${i}}`,
        slot,
        { displayMode: true, throwOnError: false, strict: 'ignore' }
      );
    }
    const target = document.createElement('p');
    target.id = 'perf-paragraph';
    const bold = document.createElement('p');
    bold.id = 'perf-bold';
    bold.textContent = '**perf bold**';
    turn.append(target, bold);
    document.body.append(turn);
  });
  await page.waitForTimeout(700);
  const result = await page.evaluate(() => {
    const target = document.getElementById('perf-paragraph');
    const observer = new MutationObserver(() => {});
    observer.observe(target, { childList: true, subtree: true, characterData: true });
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 3000; i++) {
      const span = document.createElement('span');
      span.textContent = 'w' + i;
      fragment.append(span);
    }
    target.append(fragment);
    const records = observer.takeRecords();
    observer.disconnect();
    globalThis.__perfRootCalls = 0;
    const started = performance.now();
    __perf.handleMutations(records);
    return { records: records.length, ms: performance.now() - started };
  });
  await page.waitForTimeout(2000);
  result.rootCalls = await page.evaluate(() => __perfRootCalls);
  // A direct repair of the finished turn must not scan for raw TeX: every
  // backslash lives inside rendered KaTeX annotation nodes.
  result.rawMathCalls = await page.evaluate(() => {
    __perf.repairRoot(document.getElementById('perf-turn'));
    return __perfRawMathCalls;
  });

  // (a) Fast scrolling must defer scans until the user stops.
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    document.dispatchEvent(new Event('scroll'));
    __perf.schedule(0, true);
    globalThis.__scanResponseCalls = 0;
    globalThis.__scrollTimer = setInterval(() => {
      document.dispatchEvent(new Event('scroll'));
      __perf.schedule(0, true);
    }, 30);
  });
  await page.waitForTimeout(600);
  result.scansDuringScroll = await page.evaluate(() => {
    clearInterval(globalThis.__scrollTimer);
    return globalThis.__scanResponseCalls;
  });
  const scansBeforeStop = result.scansDuringScroll;
  await page.waitForFunction(
    (before) => (globalThis.__scanResponseCalls || 0) > before,
    scansBeforeStop,
    { timeout: 400 }
  ).then(() => { result.scanResumedAfterScroll = true; }, () => { result.scanResumedAfterScroll = false; });
  result.resumedCalls = await page.evaluate(() => globalThis.__scanResponseCalls);

  // (b) Two scans with no mutations between them run the expensive root
  // filter only once: the second reuses the cached filtered/sorted list.
  await page.evaluate(() => {
    const turn = document.createElement('ms-chat-turn');
    turn.id = 'perf-plain';
    turn.setAttribute('data-turn-role', 'model');
    const p = document.createElement('p');
    p.textContent = 'plain paragraph text';
    turn.append(p);
    document.body.append(turn);
  });
  await page.waitForTimeout(1200);
  result.filterRunsForTwoScans = await page.evaluate(() => {
    const turn = document.getElementById('perf-plain');
    const observer = new MutationObserver(() => {});
    observer.observe(turn, { childList: true, subtree: true });
    const span = document.createElement('span');
    span.textContent = 'z';
    turn.querySelector('p').append(span);
    __perf.handleMutations(observer.takeRecords());
    observer.disconnect();
    const before = globalThis.__rootsFilterRuns;
    __perf.collectRoots();
    __perf.collectRoots();
    return globalThis.__rootsFilterRuns - before;
  });

  result.slowCall = result.ms >= 150;
  result.repairedTooOften = result.rootCalls > 3;
  result.rawMathInvoked = result.rawMathCalls !== 0;
  result.recordsCoalesced = result.records > 0;
  result.scrolledWithoutScanning = result.scansDuringScroll === 0;
  result.filterReused = result.filterRunsForTwoScans === 1;
  if (result.slowCall || result.repairedTooOften || result.rawMathInvoked ||
      !result.recordsCoalesced || !result.scrolledWithoutScanning ||
      !result.scanResumedAfterScroll || !result.filterReused) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}
