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

  const fixtureOrigin = await page.evaluate(() => window.location.origin);
  await page.addStyleTag({
    url: `${fixtureOrigin}/node_modules/katex/dist/katex.min.css`
  });
  await page.addScriptTag({ path: 'node_modules/katex/dist/katex.min.js' });
  await page.evaluate(() => {
    const options = {
      displayMode: true,
      output: 'htmlAndMathml',
      throwOnError: true,
      strict: 'ignore'
    };
    window.katex.render(
      String.raw`\mathbf{+10,000\text{원 (처분이익)}}`,
      document.getElementById('native-bold-math'),
      options
    );
    window.katex.render(
      String.raw`\mathbf{25,000\text{원}}`,
      document.getElementById('partial-katex-slot'),
      { ...options, displayMode: false }
    );
    window.katex.render(
      String.raw`\mathbf{사용자\text{원문}}`,
      document.getElementById('user-native-bold-math'),
      options
    );
    window.__unexpectedBarrierMathSources = [];
    const originalKatexRender = window.katex.render.bind(window.katex);
    window.katex.render = (source, element, renderOptions) => {
      if (String(source).includes('{aistudio-dom-barrier')) {
        window.__unexpectedBarrierMathSources.push(String(source));
      }

      return originalKatexRender(source, element, renderOptions);
    };
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
    const rawMathIds = [
      'raw-accounting-array',
      'raw-aligned-equation',
      'raw-cases',
      'raw-matrix',
      'raw-display-bold',
      'raw-markdown-bold',
      'raw-standalone-bold',
      'mixed-partial-math',
      'modern-raw-math',
      'embedded-acquisition-math',
      'structured-development-response'
    ];
    const rawMathNodes = rawMathIds.map((id) => document.getElementById(id));
    const sourceOf = (id) => document
      .getElementById(id)
      .querySelector('annotation[encoding="application/x-tex"]')
      ?.textContent;
    const fontWeightOf = (element) => element
      ? Number(getComputedStyle(element).fontWeight)
      : 0;
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
      mixedSource: sourceOf('mixed-partial-math'),
      modernSource: sourceOf('modern-raw-math'),
      embeddedSource: sourceOf('embedded-acquisition-math'),
      embeddedHeadingPreserved: document
        .getElementById('embedded-acquisition-math')
        .textContent.includes('최종 합체! (3개 더하기)'),
      embeddedRepairCount: document
        .getElementById('embedded-acquisition-math')
        .getAttribute('data-aistudio-embedded-raw-math-repaired'),
      embeddedBoldWeight: Number(getComputedStyle(
        Array.from(document.querySelectorAll(
          '#embedded-acquisition-math .hangul_fallback'
        )).find((element) => element.textContent.includes('쌩'))
      ).fontWeight),
      embeddedCircledBoldWeight: Number(getComputedStyle(
        Array.from(document.querySelectorAll(
          '#embedded-acquisition-math .aistudio-katex-bold-glyph-fallback'
        )).find((element) => element.textContent.includes('①'))
      ).fontWeight),
      developmentSource: sourceOf('structured-development-response'),
      developmentHeadingPreserved:
        document.getElementById('development-heading')?.textContent ===
        '계산 및 정답',
      developmentExplanationPreserved:
        document.getElementById('development-explanation')?.textContent ===
        '개발비(무형자산)로 인식할 금액은 위 표에서 🛠️ 개발로 분류된 4가지의 합계입니다.',
      developmentTablePreserved:
        document.querySelectorAll('#development-table td').length === 2 &&
        document.getElementById('development-table').textContent.includes(
          '4개 항목'
        ),
      developmentAnswerPreserved:
        document.getElementById('development-answer')?.textContent ===
        '정답: ② ₩332,000',
      developmentWonBoldWeight: fontWeightOf(
        Array.from(document.querySelectorAll(
          '#structured-development-response ' +
          '.aistudio-katex-bold-glyph-fallback'
        )).find((element) => element.textContent.includes('₩'))
      ),
      developmentNormalCircledFallbackCount: Array.from(
        document.querySelectorAll(
          '#structured-development-response ' +
          '.aistudio-katex-bold-glyph-fallback'
        )
      ).filter((element) => /[③④⑦⑨]/.test(element.textContent)).length,
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
      alignedNestedBoldWeight: Number(getComputedStyle(
        Array.from(document.querySelectorAll(
          '#raw-aligned-equation .hangul_fallback'
        )).find((element) => element.textContent.includes('처분이익'))
      ).fontWeight),
      nativeBoldRepaired: document.querySelector(
        '#native-bold-math .aistudio-rendered-math-bold-repaired'
      ) !== null,
      nativeBoldSource: sourceOf('native-bold-math'),
      nativeBoldWeight: Number(getComputedStyle(
        Array.from(document.querySelectorAll(
          '#native-bold-math .hangul_fallback'
        )).find((element) => element.textContent.includes('처분이익'))
      ).fontWeight),
      invalidMathPreserved:
        document.getElementById('invalid-raw-math').textContent ===
        'begin{array}{cc}a&b\\end{matrix}',
      mixedMissingSourcePreserved:
        document.querySelector(
          '#mixed-missing-source .aistudio-raw-math-repaired'
        ) === null &&
        document.getElementById('mixed-missing-source').textContent ===
          'begin{aligned}x&=unknown sourceend{aligned}',
      existingMathPreserved:
        document.querySelector(
          '#existing-rendered-math > .katex:not(.aistudio-raw-math-repaired)'
        )?.textContent === 'already rendered',
      userMathPreserved:
        document.getElementById('user-raw-math').textContent ===
        'begin{aligned}x&=\\mathbf{y}\\end{aligned}',
      userNativeMathPreserved:
        document.querySelector(
          '#user-native-bold-math .aistudio-rendered-math-bold-repaired'
        ) === null &&
        sourceOf('user-native-bold-math') ===
          String.raw`\mathbf{사용자\text{원문}}`,
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
      fencedMathPreserved:
        document.querySelector(
          '#fenced-raw-math .aistudio-raw-math-repaired'
        ) === null &&
        document.getElementById('fenced-raw-math').textContent.includes(
          String.raw`\begin{aligned}`
        ),
      unexpectedBarrierMathSources:
        window.__unexpectedBarrierMathSources.slice(),
      version: document.documentElement.getAttribute(
        'data-aistudio-mobile-safe-181'
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
    rendering.rawMathCount !== 11 ||
    rendering.rawMathKatexCount !== 11 ||
    rendering.rawMathMathmlCount !== 11 ||
    rendering.rawMathErrorCount !== 0 ||
    !rendering.arraySource?.startsWith('\\begin{array}{ll|ll}') ||
    !rendering.arraySource?.includes('\\\\') ||
    !rendering.alignedSource?.startsWith('\\begin{aligned}') ||
    !rendering.alignedSource?.includes('\\mathbf{+10,000') ||
    !rendering.alignedSource?.includes('\\text{\\bf 원 (처분이익)}') ||
    !rendering.casesSource?.startsWith('\\begin{cases}') ||
    !rendering.matrixSource?.startsWith('\\begin{pmatrix}') ||
    !rendering.standaloneSource?.includes('\\boldsymbol{x}') ||
    !rendering.mixedSource?.includes('\\text{\\bf 원}') ||
    !rendering.modernSource?.includes('\\text{\\bf 원}') ||
    !rendering.embeddedSource?.includes('\\text{\\bf ① 쌩 공사비}') ||
    !rendering.embeddedSource?.includes('\\text{\\bf ② 특정이자}') ||
    !rendering.embeddedSource?.includes('\\text{\\bf ③ 일반이자}') ||
    !rendering.embeddedHeadingPreserved ||
    rendering.embeddedRepairCount !== '1' ||
    rendering.embeddedBoldWeight < 600 ||
    rendering.embeddedCircledBoldWeight < 600 ||
    !rendering.developmentSource?.includes('\\text{\\bf ₩}') ||
    !rendering.developmentHeadingPreserved ||
    !rendering.developmentExplanationPreserved ||
    !rendering.developmentTablePreserved ||
    !rendering.developmentAnswerPreserved ||
    rendering.developmentWonBoldWeight < 600 ||
    rendering.developmentNormalCircledFallbackCount !== 0 ||
    rendering.alignedBoldCount < 3 ||
    rendering.matrixBoldCount < 1 ||
    !rendering.markdownMathBold ||
    !rendering.displayMathClass ||
    !rendering.inlineMathClass ||
    rendering.alignedNestedBoldWeight < 600 ||
    !rendering.nativeBoldRepaired ||
    !rendering.nativeBoldSource?.includes('\\text{\\bf 원 (처분이익)}') ||
    rendering.nativeBoldWeight < 600 ||
    !rendering.invalidMathPreserved ||
    !rendering.mixedMissingSourcePreserved ||
    !rendering.existingMathPreserved ||
    !rendering.userMathPreserved ||
    !rendering.userNativeMathPreserved ||
    rendering.katexVersion !== '0.18.1' ||
    !rendering.katexStylesheetInstalled ||
    rendering.text.includes('<br>') ||
    rendering.text.includes('**') ||
    !rendering.preservedBlockBoundary ||
    !rendering.preservedCode ||
    !rendering.preservedLinkBoundary ||
    !rendering.preservedCodeBoundary ||
    !rendering.preservedLinkBoundaryBold ||
    !rendering.fencedMathPreserved ||
    rendering.unexpectedBarrierMathSources.length !== 0 ||
    rendering.version !== '1.8.1'
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
