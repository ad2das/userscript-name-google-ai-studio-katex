async (page) => {
  const fs = require('node:fs');
  const source = fs.readFileSync('aaa.user.js', 'utf8')
    .replace('  function repairRoot(root) {',
      '  function repairRoot(root) { if (root && root.id === \'perf-turn\') globalThis.__perfRootCalls = (globalThis.__perfRootCalls || 0) + 1;')
    .replace('  function repairRawMath(root, rootText = \'\') {',
      '  function repairRawMath(root, rootText = \'\') { if (root && root.id === \'perf-turn\') globalThis.__perfRawMathCalls = (globalThis.__perfRawMathCalls || 0) + 1;')
    .replace(/\n  if \(document\.readyState === 'loading'\)/,
      '\n  globalThis.__perf = { handleMutations, repairRoot, scan };\n  if (document.readyState === \'loading\')');
  await page.evaluate(() => {
    globalThis.__perfRootCalls = 0;
    globalThis.__perfRawMathCalls = 0;
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
  result.slowCall = result.ms >= 150;
  result.repairedTooOften = result.rootCalls > 3;
  result.rawMathInvoked = result.rawMathCalls !== 0;
  result.recordsCoalesced = result.records > 0;
  if (result.slowCall || result.repairedTooOften || result.rawMathInvoked || !result.recordsCoalesced) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}
