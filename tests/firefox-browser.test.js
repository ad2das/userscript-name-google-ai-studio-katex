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
    const splitBold = document.getElementById('split-bold');
    const multipleBold = document.getElementById('multiple-bold');
    const splitBoldItalic = document.getElementById('split-bold-italic');
    const mathAdjacentBold = document.getElementById('math-adjacent-bold');
    const rawAccountingArray = document.getElementById('raw-accounting-array');
    const rawAlignedEquation = document.getElementById('raw-aligned-equation');
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
      arrayRowCount: rawAccountingArray.querySelectorAll(
        '.aistudio-array-row'
      ).length,
      arrayCellCount: rawAccountingArray.querySelectorAll(
        '.aistudio-array-cell'
      ).length,
      arrayText: rawAccountingArray.textContent.replace(/\s+/g, ' ').trim(),
      arrayDividerCount: rawAccountingArray.querySelectorAll(
        '.aistudio-array-divider'
      ).length,
      alignedRowCount: rawAlignedEquation.querySelectorAll(
        '.aistudio-aligned-row'
      ).length,
      alignedCellCount: rawAlignedEquation.querySelectorAll(
        '.aistudio-aligned-cell'
      ).length,
      alignedText: rawAlignedEquation.textContent.replace(/\s+/g, ' ').trim(),
      alignedBoldText: Array.from(
        rawAlignedEquation.querySelectorAll('strong.aistudio-tex-bold'),
        (element) => element.textContent
      ),
      preservedCodeBoundary:
        codeBoundaryBold.querySelectorAll('strong').length === 0 &&
        codeBoundaryBold.textContent.includes('**'),
      preservedLinkBoundaryBold:
        linkBoundaryBold.querySelectorAll('strong').length === 0 &&
        linkBoundaryBold.textContent.includes('**'),
      version: document.documentElement.getAttribute(
        'data-aistudio-mobile-safe-165'
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
    rendering.arrayRowCount !== 3 ||
    rendering.arrayCellCount !== 12 ||
    rendering.arrayDividerCount !== 3 ||
    rendering.arrayText.includes('begin{array}') ||
    !rendering.arrayText.includes('(차) 기계장치(신)') ||
    !rendering.arrayText.includes('(대) 기계장치(구)') ||
    rendering.alignedRowCount !== 3 ||
    rendering.alignedCellCount !== 6 ||
    rendering.alignedText.includes('begin{aligned}') ||
    rendering.alignedText.includes('\\text') ||
    !rendering.alignedText.includes('기계장치 처분손익') ||
    !rendering.alignedText.includes('+10,000원 (처분이익)') ||
    rendering.alignedBoldText.join('|') !==
      '[기계장치]의 공정가치(시세)|' +
      '[기계장치]의 장부원가(장부금액)|' +
      '+10,000원 (처분이익)' ||
    rendering.text.includes('<br>') ||
    rendering.text.includes('**') ||
    !rendering.preservedBlockBoundary ||
    !rendering.preservedCode ||
    !rendering.preservedLinkBoundary ||
    !rendering.preservedCodeBoundary ||
    !rendering.preservedLinkBoundaryBold ||
    rendering.version !== '1.6.5'
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
