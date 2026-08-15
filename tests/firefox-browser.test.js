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

  await page.addStyleTag({
    url: `${new URL(page.url()).origin}/node_modules/katex/dist/katex.min.css`
  });
  await page.addScriptTag({ path: 'node_modules/katex/dist/katex.min.js' });
  await page.addScriptTag({ path: 'aaa.user.js' });
  await page.waitForTimeout(4000);

  const rendering = await page.evaluate(() => {
    const cell = document.getElementById('literal-break-cell');
    const literalCode = document.getElementById('literal-code');
    const blockBoundary = document.getElementById('block-boundary');
    const linkBoundary = document.getElementById('link-boundary');
    const splitBold = document.getElementById('split-bold');
    const multipleBold = document.getElementById('multiple-bold');
    const splitBoldItalic = document.getElementById('split-bold-italic');
    const mathAdjacentBold = document.getElementById('math-adjacent-bold');
    const rawMathIds = [
      'raw-accounting-array',
      'raw-aligned-equation',
      'raw-cases',
      'raw-matrix',
      'raw-display-bold',
      'raw-markdown-bold',
      'raw-standalone-bold'
    ];
    const rawMathNodes = rawMathIds.map((id) => document.getElementById(id));
    const sourceOf = (id) => document
      .getElementById(id)
      .querySelector('annotation[encoding="application/x-tex"]')
      ?.textContent;
    const codeBoundaryBold = document.getElementById('code-boundary-bold');
    const linkBoundaryBold = document.getElementById('link-boundary-bold');
    return {
      boldCount: cell.querySelectorAll('strong.aistudio-md-repaired').length,
      boldText: cell.querySelector('strong.aistudio-md-repaired')?.textContent,
      breakCount: cell.querySelectorAll('br.aistudio-table-br-repaired').length,
      html: cell.innerHTML,
      text: cell.textContent,
      preservedBlockBoundary: blockBoundary.querySelectorAll('br').length === 0,
      preservedCode: literalCode.textContent === '<br>',
      preservedLinkBoundary: linkBoundary.querySelectorAll('br').length === 0,
      splitBoldCount: splitBold.querySelectorAll(
        'strong.aistudio-md-repaired'
      ).length,
      splitBoldText: splitBold.textContent,
      multipleBoldCount: multipleBold.querySelectorAll(
        'strong.aistudio-md-repaired'
      ).length,
      multipleBoldText: multipleBold.textContent,
      splitBoldItalicCount: splitBoldItalic.querySelectorAll(
        'strong.aistudio-md-bold-italic'
      ).length,
      splitBoldItalicText: splitBoldItalic.textContent,
      splitBoldItalicStyle: getComputedStyle(
        splitBoldItalic.querySelector('strong.aistudio-md-bold-italic')
      ).fontStyle,
      mathAdjacentBoldCount: mathAdjacentBold.querySelectorAll(
        'strong.aistudio-md-repaired'
      ).length,
      mathAdjacentBoldText: mathAdjacentBold.querySelector(
        'strong.aistudio-md-repaired'
      )?.textContent,
      rawMathCount: rawMathNodes.filter((node) => (
        node.querySelector('.aistudio-raw-math-repaired')
      )).length,
      rawMathKatexCount: rawMathNodes.filter((node) => (
        node.querySelector('.aistudio-raw-math-repaired .katex')
      )).length,
      rawMathMathmlCount: rawMathNodes.filter((node) => (
        node.querySelector('.aistudio-raw-math-repaired math')
      )).length,
      rawMathErrorCount: rawMathNodes.reduce((count, node) => (
        count + node.querySelectorAll('.katex-error').length
      ), 0),
      arraySource: sourceOf('raw-accounting-array'),
      alignedSource: sourceOf('raw-aligned-equation'),
      casesSource: sourceOf('raw-cases'),
      matrixSource: sourceOf('raw-matrix'),
      standaloneSource: sourceOf('raw-standalone-bold'),
      alignedBoldCount: document.querySelectorAll(
        '#raw-aligned-equation .katex-html .mathbf'
      ).length,
      matrixBoldCount: document.querySelectorAll(
        '#raw-matrix .katex-html .mathbf'
      ).length,
      markdownMathBold: document.querySelector(
        '#raw-markdown-bold .aistudio-raw-math-bold'
      ) !== null,
      displayMathClass: document.querySelector(
        '#raw-display-bold .aistudio-raw-math-display'
      ) !== null,
      inlineMathClass: document.querySelector(
        '#raw-standalone-bold .aistudio-raw-math-inline'
      ) !== null,
      invalidMathPreserved:
        document.getElementById('invalid-raw-math').textContent ===
        'begin{array}{cc}a&b\\end{matrix}',
      existingMathPreserved:
        document.querySelector(
          '#existing-rendered-math > .katex:not(.aistudio-raw-math-repaired)'
        )?.textContent === 'already rendered',
      userMathPreserved:
        document.getElementById('user-raw-math').textContent ===
        'begin{aligned}x&=\\mathbf{y}\\end{aligned}',
      katexVersion: window.katex?.version,
      katexStylesheetInstalled:
        document.getElementById('aistudio-katex-0181-css')?.href.includes(
          'katex@0.18.1/dist/katex.min.css'
        ),
      preservedCodeBoundary:
        codeBoundaryBold.querySelectorAll('strong').length === 0 &&
        codeBoundaryBold.textContent.includes('**'),
      preservedLinkBoundaryBold:
        linkBoundaryBold.querySelectorAll('strong').length === 0 &&
        linkBoundaryBold.textContent.includes('**'),
      version: document.documentElement.getAttribute(
        'data-aistudio-mobile-safe-170'
      )
    };
  });

  if (
    rendering.breakCount !== 2 ||
    rendering.boldCount !== 1 ||
    rendering.boldText !== 'bold' ||
    rendering.splitBoldCount !== 2 ||
    rendering.splitBoldText !== 'split bold' ||
    rendering.multipleBoldCount !== 3 ||
    rendering.multipleBoldText !== 'first and second' ||
    rendering.splitBoldItalicCount !== 1 ||
    rendering.splitBoldItalicText !== 'very important' ||
    rendering.splitBoldItalicStyle !== 'italic' ||
    rendering.mathAdjacentBoldCount !== 1 ||
    rendering.mathAdjacentBoldText !== 'this is bold' ||
    rendering.rawMathCount !== 7 ||
    rendering.rawMathKatexCount !== 7 ||
    rendering.rawMathMathmlCount !== 7 ||
    rendering.rawMathErrorCount !== 0 ||
    !rendering.arraySource?.startsWith('\\begin{array}{ll|ll}') ||
    !rendering.arraySource?.includes('\\\\') ||
    !rendering.alignedSource?.startsWith('\\begin{aligned}') ||
    !rendering.alignedSource?.includes('\\mathbf{+10,000') ||
    !rendering.casesSource?.startsWith('\\begin{cases}') ||
    !rendering.matrixSource?.startsWith('\\begin{pmatrix}') ||
    !rendering.standaloneSource?.includes('\\boldsymbol{x}') ||
    rendering.alignedBoldCount < 3 ||
    rendering.matrixBoldCount < 1 ||
    !rendering.markdownMathBold ||
    !rendering.displayMathClass ||
    !rendering.inlineMathClass ||
    !rendering.invalidMathPreserved ||
    !rendering.existingMathPreserved ||
    !rendering.userMathPreserved ||
    rendering.katexVersion !== '0.18.1' ||
    !rendering.katexStylesheetInstalled ||
    rendering.text.includes('<br>') ||
    rendering.text.includes('**') ||
    !rendering.preservedBlockBoundary ||
    !rendering.preservedCode ||
    !rendering.preservedLinkBoundary ||
    !rendering.preservedCodeBoundary ||
    !rendering.preservedLinkBoundaryBold ||
    rendering.version !== '1.7.0'
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
