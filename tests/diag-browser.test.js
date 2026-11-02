// W-AS9: the opt-in on-device timeline badge, and its total inertness when off.
async (page) => {
  const fs = require('node:fs');
  const path = require('node:path');
  const origin = 'https://aistudio.google.com';
  const root = process.cwd();

  const source = fs.readFileSync(process.env.AISTUDIO_SOURCE || 'aaa.user.js', 'utf8')
    .replace('  function scan() {', '  function scan() { globalThis.__scans++;')
    .replace(
      /\n  if \(document\.readyState === 'loading'\)/,
      "\n  globalThis.__hashAtBoot = location.hash;\n  if (document.readyState === 'loading')"
    );

  const fixture = '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
    '<main role="main">' +
    '<ms-prompt-input><textarea></textarea><button class="run-button">Run</button></ms-prompt-input>' +
    '<article data-turn-role="model" tabindex="-1"><ms-cmark-node id="response"></ms-cmark-node></article>' +
    '</main></body></html>';

  const load = async (hash) => {
    await page.goto(origin + '/tests/fixtures/aistudio.html' + hash);
    await page.setContent(fixture);
    await page.evaluate(() => { globalThis.__scans = 0; });
    await page.addScriptTag({ path: path.join(root, 'node_modules/katex/dist/katex.min.js') });
    await page.addScriptTag({ content: source });
  };

  const badgeText = () => page.evaluate(() => {
    const host = document.getElementById('aisfix-diag');
    if (!host || !host.shadowRoot) return null;
    const body = host.shadowRoot.querySelector('div');
    return body ? body.textContent : null;
  });

  const storage = () => page.evaluate(() => {
    try { return localStorage.getItem('aistudio-fix-diag'); } catch (_) { return 'error'; }
  });

  const repaired = () => page.evaluate(() => {
    const node = document.getElementById('gen');
    return node ? node.innerHTML : null;
  });

  const startGeneration = async () => {
    await page.evaluate(() => {
      document.querySelector('.run-button').textContent = 'Stop';
      const paragraph = document.createElement('p');
      paragraph.id = 'gen';
      paragraph.innerHTML = '결론은 **굵게** 입니다.';
      document.getElementById('response').append(paragraph);
    });
    await page.waitForTimeout(1000);
    await page.evaluate(() => { document.querySelector('.run-button').textContent = 'Run'; });
  };

  const result = {};

  // --- 1. Off by default: no badge, no storage write, repair unchanged. ---
  await load('');
  await startGeneration();
  await page.waitForTimeout(2000);
  result.offNoBadge = (await page.evaluate(() => !!document.getElementById('aisfix-diag'))) === false;
  result.offStorageNull = (await storage()) === null;
  const offRepaired = await repaired();

  // --- 2. Armed by the hash: boot sees it, storage records it. ---
  await load('#aisfix-diag');
  result.hashSeen = (await page.evaluate(() => globalThis.__hashAtBoot)) === '#aisfix-diag';
  result.onStored = (await storage()) === '1';

  // --- 3. Badge carries the first episode timeline. ---
  await startGeneration();
  await page.waitForTimeout(1500);
  const badgeEarly = await badgeText();
  result.onBadge = !!badgeEarly &&
    badgeEarly.includes('diag #1') &&
    badgeEarly.includes('end->genFalse +') &&
    badgeEarly.includes('repair1 +');

  // --- 4. The 1 s raw-marker sample lands as the episode ages. ---
  await page.waitForTimeout(2500);
  const badgeRaw = await badgeText();
  result.onRaw = !!badgeRaw && badgeRaw.includes('raw 1s **0');

  // --- 5. The badge tick is not a scan loop. ---
  await page.waitForTimeout(9000);
  const scansBefore = await page.evaluate(() => globalThis.__scans);
  await page.waitForTimeout(2000);
  result.idleScansIn2s = (await page.evaluate(() => globalThis.__scans)) - scansBefore;
  result.idle = result.idleScansIn2s <= 2;

  const onRepaired = await repaired();

  // --- 6. The off hash clears the stored flag through hashchange. ---
  await page.evaluate(() => { location.hash = '#aisfix-diag-off'; });
  await page.waitForTimeout(400);
  result.offAgain = (await storage()) === null;

  // --- 7. Diagnostics never change what the repair produces. ---
  result.sameRepairs = !!offRepaired && offRepaired === onRepaired;
  result.badgeText = badgeRaw;
  const failed = Object.entries(result).filter(([, ok]) => ok === false).map(([key]) => key);
  if (failed.length) throw new Error(JSON.stringify({ failed, result }));
  return result;
}
