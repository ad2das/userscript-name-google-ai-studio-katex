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
      '\n  globalThis.__perf = { handleMutations, repairRoot, scan, collectRoots, schedule, ' +
      'flushPendingCleanup, pendingCleanup, pendingMathInvalidation, containWideInlineMath };\n' +
      '  if (document.readyState === \'loading\')');
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

  // (d) A large lazy-render batch must not block the mutation callback, and
  // the queued work must still land.
  await page.waitForTimeout(1500);
  result.bigBatchMs = await page.evaluate(() => {
    const turn = document.createElement('ms-chat-turn');
    turn.id = 'perf-big';
    turn.setAttribute('data-turn-role', 'model');
    const p = document.createElement('p');
    p.id = 'perf-big-bold';
    p.textContent = '**big batch bold**';
    turn.append(p);
    document.body.append(turn);
    const blocks = [];
    for (let i = 0; i < 400; i++) {
      const block = document.createElement('p');
      block.textContent = 'block ' + i;
      blocks.push(block);
    }
    const observer = new MutationObserver(() => {});
    observer.observe(turn, { childList: true, subtree: true, characterData: true });
    for (const block of blocks) turn.append(block);
    const records = observer.takeRecords();
    observer.disconnect();
    const started = performance.now();
    __perf.handleMutations(records);
    return { ms: performance.now() - started, records: records.length };
  });
  await page.waitForTimeout(2000);
  result.bigBatchRepaired = await page.evaluate(() =>
    !!document.querySelector('#perf-big-bold strong'));
  result.bigBatchQueued = result.bigBatchMs.records > 300;

  // (e) Budgeted cleanup: 2,000 elements must not finish in one task.
  result.cleanup = await page.evaluate(async () => {
    const turn = document.createElement('ms-chat-turn');
    turn.setAttribute('data-turn-role', 'model');
    const ids = [];
    for (let i = 0; i < 2000; i++) {
      const p = document.createElement('p');
      p.id = 'cleanup-' + i;
      p.textContent = 'cleanup ' + i;
      turn.append(p);
      ids.push(p);
    }
    document.body.append(turn);
    for (const p of ids) __perf.pendingCleanup.add(p);
    const display = document.createElement('ms-katex');
    display.className = 'display';
    turn.append(display);
    __perf.pendingMathInvalidation.add(display);
    const firstResult = __perf.flushPendingCleanup();
    const remainingAfterFirst = __perf.pendingCleanup.size;
    let guard = 0;
    while (__perf.pendingCleanup.size && guard++ < 200) {
      __perf.flushPendingCleanup();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return {
      firstResult,
      remainingAfterFirst,
      remaining: __perf.pendingCleanup.size,
      mathInvalidationPending: __perf.pendingMathInvalidation.size
    };
  });
  result.cleanupBudgeted = result.cleanup.firstResult === false &&
    result.cleanup.remainingAfterFirst > 0;

  // (f) 150 inline hosts, 10 overflowing a 300 px list item.
  result.inline = await page.evaluate(async () => {
    const turn = document.createElement('ms-chat-turn');
    turn.setAttribute('data-turn-role', 'model');
    turn.id = 'perf-inline-turn';
    const root = document.createElement('ms-cmark-node');
    turn.append(root);
    for (let i = 0; i < 150; i++) {
      const ul = document.createElement('ul');
      ul.style.width = '300px';
      ul.style.maxWidth = '100%';
      const li = document.createElement('li');
      const host = document.createElement('ms-katex');
      host.id = 'inline-' + i;
      li.append(host);
      ul.append(li);
      root.append(ul);
      const wide = i < 10;
      window.katex.render(
        wide
          ? String.raw`\text{긴 인라인 수식 ${i}} = (\text{계약금액} \times \text{진행률}) - \text{이익}`
          : 'x_{' + i + '}',
        host,
        { displayMode: false, throwOnError: false, strict: 'ignore' }
      );
    }
    document.body.append(turn);
    let guard = 0;
    while (guard++ < 60) {
      __perf.containWideInlineMath(false);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const hosts = Array.from(turn.querySelectorAll('ms-katex'));
    return {
      checked: hosts.filter((host) =>
        host.getAttribute('data-aistudio-inline-math-checked') === '1').length,
      contained: hosts.slice(0, 10).filter((host) =>
        host.classList.contains('aistudio-inline-math-wrap') ||
        host.parentElement?.classList.contains('aistudio-inline-math-scroll')).length,
      overflowingAfter: hosts.slice(0, 10).filter((host) =>
        host.scrollWidth > host.parentElement.clientWidth + 1).length,
      narrowContained: hosts.slice(10).filter((host) =>
        host.classList.contains('aistudio-inline-math-wrap') ||
        host.parentElement?.classList.contains('aistudio-inline-math-scroll')).length,
      total: hosts.length
    };
  });
  result.inlineAllChecked = result.inline.checked === result.inline.total;
  result.inlineOverflowContained = result.inline.contained === 10 &&
    result.inline.overflowingAfter === 0 && result.inline.narrowContained === 0;

  result.slowCall = result.ms >= 150;
  result.repairedTooOften = result.rootCalls > 3;
  result.rawMathInvoked = result.rawMathCalls !== 0;
  result.recordsCoalesced = result.records > 0;
  result.scrolledWithoutScanning = result.scansDuringScroll === 0;
  result.filterReused = result.filterRunsForTwoScans === 1;
  result.largeBatchFast = result.bigBatchMs.ms < 20;
  result.cleanupCleared = result.cleanup.remaining === 0 &&
    result.cleanup.mathInvalidationPending === 0;
  if (result.slowCall || result.repairedTooOften || result.rawMathInvoked ||
      !result.recordsCoalesced || !result.scrolledWithoutScanning ||
      !result.scanResumedAfterScroll || !result.filterReused ||
      !result.largeBatchFast || !result.bigBatchQueued || !result.bigBatchRepaired ||
      !result.cleanupBudgeted || !result.cleanupCleared ||
      !result.inlineAllChecked || !result.inlineOverflowContained) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}
