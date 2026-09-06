const fs = require('node:fs');
const path = require('node:path');
const { firefox } = require('playwright');

// No signed-in profile or live AI Studio requests: all resources are fixtures.
const root = path.resolve(__dirname, '..');
process.chdir(root);
const origin = 'https://aistudio.google.com';
const run = async () => {
  const browser = await firefox.launch({ headless: true });
  const results = {};
  try {
    const suites = process.argv.includes('--photo') ? ['photo-regression.test.js'] : process.argv.includes('--audit')
      ? ['audit-browser.test.js']
      : ['firefox-browser.test.js', 'audit-browser.test.js', 'photo-regression.test.js'];
    for (const suite of suites) {
      const page = await browser.newPage({ viewport: {
        width: process.argv.includes('--mobile') ? 412 : 1280, height: 915
      } });
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        let file;
        if (url.origin === origin && url.pathname === '/tests/fixtures/aistudio.html') {
          file = 'tests/fixtures/aistudio.html';
        } else if (url.pathname.includes('/katex/') || url.pathname.includes('/katex@0.18.1/')) {
          const suffix = url.pathname.split('/dist/')[1];
          if (suffix && !suffix.includes('..')) file = 'node_modules/katex/dist/' + suffix;
        }
        if (file && fs.existsSync(path.join(root, file))) {
          await route.fulfill({ path: path.join(root, file) });
        } else {
          await route.abort();
        }
      });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(origin + '/tests/fixtures/aistudio.html');
      // Existing CLI-compatible test functions are executed without a test framework.
      const check = eval(fs.readFileSync(path.join(__dirname, suite), 'utf8'));
      try {
        results[suite] = await check(page);
      } catch (error) {
        fs.mkdirSync('output/playwright', { recursive: true });
        fs.writeFileSync('output/playwright/failure.html', await page.content());
        throw error;
      }
      if (errors.length) throw new Error(errors.join('\n'));
      await page.close();
    }
    fs.mkdirSync('output/playwright', { recursive: true });
    const mode = process.argv.includes('--mobile') ? 'mobile' : 'desktop';
    fs.writeFileSync(`output/playwright/results-${mode}.json`, JSON.stringify(results, null, 2));
    console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([suite, result]) => [
      suite, suite !== 'firefox-browser.test.js' ? result : {
        version: result.rendering.version, nativeRun: result.nativeRun, promptTyping: result.promptTyping
      }
    ])), null, 2));
  } finally {
    await browser.close();
  }
};
run().catch((error) => { console.error(error); process.exitCode = 1; });
