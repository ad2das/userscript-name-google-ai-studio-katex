async (page) => {
  await page.evaluate(() => {
    const realDateNow = Date.now.bind(Date);
    window.__timeOffset = 0;
    Date.now = () => realDateNow() + window.__timeOffset;
    window.__fetchCalls = 0;
    window.__authReloadCalls = 0;
    window.__appRunCount = 0;

    window.fetch = async () => {
      window.__fetchCalls += 1;
      return new Response('', { status: 200 });
    };

    window.gapi = {
      auth2: {
        getAuthInstance: () => ({
          currentUser: {
            get: () => ({
              getAuthResponse: () => ({ expires_at: Date.now() + 1000 }),
              reloadAuthResponse: async () => {
                window.__authReloadCalls += 1;
              }
            })
          }
        })
      }
    };

    document.querySelector('button').addEventListener('click', () => {
      window.__appRunCount += 1;
    });
  });

  await page.addScriptTag({ path: 'aaa.user.js' });
  await page.waitForTimeout(4000);

  const rendering = await page.evaluate(() => {
    const cell = document.getElementById('literal-break-cell');
    const literalCode = document.getElementById('literal-code');
    const blockBoundary = document.getElementById('block-boundary');
    const linkBoundary = document.getElementById('link-boundary');
    return {
      boldCount: cell.querySelectorAll('strong.aistudio-md-repaired').length,
      boldText: cell.querySelector('strong.aistudio-md-repaired')?.textContent,
      breakCount: cell.querySelectorAll('br.aistudio-table-br-repaired').length,
      html: cell.innerHTML,
      text: cell.textContent,
      preservedBlockBoundary: blockBoundary.querySelectorAll('br').length === 0,
      preservedCode: literalCode.textContent === '<br>',
      preservedLinkBoundary: linkBoundary.querySelectorAll('br').length === 0,
      version: document.documentElement.getAttribute(
        'data-aistudio-mobile-safe-162'
      )
    };
  });

  if (
    rendering.breakCount !== 2 ||
    rendering.boldCount !== 1 ||
    rendering.boldText !== 'bold' ||
    rendering.text.includes('<br>') ||
    rendering.text.includes('**') ||
    !rendering.preservedBlockBoundary ||
    !rendering.preservedCode ||
    !rendering.preservedLinkBoundary ||
    rendering.version !== '1.6.2'
  ) {
    throw new Error(`Firefox rendering regression: ${JSON.stringify(rendering)}`);
  }

  await page.evaluate(() => {
    window.__timeOffset += 100000;
  });
  await page.getByRole('button', { name: 'Run' }).click();
  await page.waitForTimeout(250);

  const preflight = await page.evaluate(() => ({
    appRunCount: window.__appRunCount,
    authReloadCalls: window.__authReloadCalls,
    fetchCalls: window.__fetchCalls
  }));

  if (
    preflight.appRunCount !== 1 ||
    preflight.authReloadCalls !== 2 ||
    preflight.fetchCalls !== 2
  ) {
    throw new Error(`Firefox preflight regression: ${JSON.stringify(preflight)}`);
  }

  return { rendering, preflight };
}
