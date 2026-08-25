async (page) => {
  await page.evaluate(() => {
    const realDateNow = Date.now.bind(Date);
    window.__timeOffset = 0;
    Date.now = () => realDateNow() + window.__timeOffset;
    window.__fetchCalls = 0;
    window.__authReloadCalls = 0;
    window.__appRunCount = 0;
    window.__bodyTextWalkerCount = 0;

    const originalCreateTreeWalker = document.createTreeWalker.bind(document);
    document.createTreeWalker = (root, whatToShow, ...rest) => {
      if (
        root === document.body &&
        whatToShow === NodeFilter.SHOW_TEXT
      ) {
        window.__bodyTextWalkerCount += 1;
      }

      return originalCreateTreeWalker(root, whatToShow, ...rest);
    };

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

    /*
     * A complete environment inside one generic descendant of an explicit
     * model turn. The outer turn cannot discover this host through the normal
     * raw-math selector, so the proven local fallback scope must not be
     * suppressed during root deduplication.
     */
    const nestedTurn = document.createElement('ms-chat-turn');
    const nestedRenderer = document.createElement('new-response-renderer');
    const nestedMath = document.createElement('div');
    const percentMath = document.createElement('div');

    nestedTurn.id = 'nested-fallback-model-turn';
    nestedTurn.setAttribute('data-turn-role', 'model');
    nestedMath.id = 'nested-generic-environment';
    nestedMath.textContent = [
      String.raw`\begin{aligned}`,
      String.raw`\mathbf{\text{사채상환손익}} &= 98,150\text{원} - 92,000\text{원} \\`,
      String.raw`&= \mathbf{+6,150\text{원}}`,
      String.raw`\end{aligned}`
    ].join('\n');
    percentMath.id = 'step-two-percent-equation';
    percentMath.textContent = [
      String.raw`\begin{aligned}`,
      String.raw`\text{6개월간 유효이자} &= 4,826.1\text{원} \times 10% \times \frac{6}{12} = 241.3\text{원} \\`,
      String.raw`\text{6개월간 표시이자} &= 400\text{원} \times \frac{6}{12} = 200\text{원} \\`,
      String.raw`\text{6개월간 사할차 상각액} &= 241.3\text{원} - 200\text{원} = \mathbf{41.3\text{원}}`,
      String.raw`\end{aligned}`
    ].join('\n');
    nestedRenderer.append(nestedMath, percentMath);
    nestedTurn.appendChild(nestedRenderer);
    document.getElementById('selectorless-main').appendChild(nestedTurn);
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
    window.katex.render(
      String.raw`\text{일반차입금 자본화액} = \left(\underbrace{\text{지출액} \times \frac{\mathbf{\text{공사기간 }9}}{12}}_{\text{공사기간이 이미 반영된 지출액}} - \text{특정차입금}\right) \times \underbrace{\text{연평균 가중평균이자율}}_{\text{1년 기준 금리}}`,
      document.getElementById('photo-four-stretchy-math'),
      options
    );
    window.katex.render(
      String.raw`\times 9/12`,
      document.getElementById('photo-four-inline-math'),
      { ...options, displayMode: false }
    );
    window.katex.render(
      String.raw`\frac{9}{12}`,
      document.getElementById('unscoped-katex-annotation'),
      { ...options, displayMode: false }
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
    const nativeBoldLiteralBreak = document.getElementById(
      'native-bold-literal-break'
    );
    const splitBold = document.getElementById('split-bold');
    const multipleBold = document.getElementById('multiple-bold');
    const splitBoldItalic = document.getElementById('split-bold-italic');
    const mathAdjacentBold = document.getElementById('math-adjacent-bold');
    const nativeBoldMixedMarker = document.getElementById(
      'native-bold-mixed-marker'
    );
    const nativeBoldInnerMarker = document.getElementById(
      'native-bold-inner-marker'
    );
    const underlineRoot = document.getElementById('raw-underline-passages');
    const repairedUnderlines = Array.from(underlineRoot.querySelectorAll(
      'u.aistudio-underline-repaired'
    ));
    const fairValueCard = document.getElementById(
      'photo-three-fair-value-card'
    );
    const fairValueUnderlines = Array.from(
      fairValueCard.querySelectorAll('u.aistudio-underline-repaired')
    );
    const rawMathIds = [
      'raw-accounting-array',
      'raw-t-account-array',
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
    const stretchyMath = document.getElementById(
      'photo-four-stretchy-math'
    );
    const stretchyDisplay = stretchyMath.querySelector('.katex-display');
    const stretchyKatex = stretchyDisplay.querySelector(':scope > .katex');
    const stretchyHtml = stretchyKatex.querySelector('.katex-html');
    const stretchyClipNodes = Array.from(stretchyKatex.querySelectorAll([
      '.katex-mathml',
      '.pstrut',
      '.katex-stretchy',
      '.hide-tail',
      '.halfarrow-left',
      '.halfarrow-right',
      '.brace-left',
      '.brace-center',
      '.brace-right'
    ].join(',')));
    const boldWithMath = document.getElementById(
      'photo-four-bold-with-math'
    );
    const boldWithMathStrong = boldWithMath.querySelector(
      'strong.aistudio-md-repaired'
    );
    const boldWithMathKatex = boldWithMathStrong?.querySelector('.katex');
    const visibleTextOf = (element) => {
      if (!element) {
        return '';
      }

      const clone = element.cloneNode(true);
      clone.querySelectorAll('.katex-mathml').forEach((node) => node.remove());
      return clone.textContent;
    };
    const fontWeightOf = (element) => element
      ? Number(getComputedStyle(element).fontWeight)
      : 0;
    const codeBoundaryBold = document.getElementById('code-boundary-bold');
    const linkBoundaryBold = document.getElementById('link-boundary-bold');
    const proseCodeBlock = document.getElementById('reported-prose-code-bold');
    const proseCodeStrong = proseCodeBlock.querySelector(
      'strong.aistudio-md-repaired'
    );
    const asciiTree = document.getElementById('reported-ascii-capital-tree');
    const asciiTreeCode = asciiTree.querySelector('code');
    const asciiTreeOriginal = [
      '┌─ 자본금 (무조건 액면가액!)',
      '             │',
      '자본거래 ───┼─ 자본잉여금 (주주와의 거래에서 생긴 (+) 플러스 잉여금)',
      '             │',
      '             └─ 자본조정 (자본의 차감(-) 항목 또는 임시 가계정 성격)'
    ].join('\n');
    const asciiContractTree = document.getElementById(
      'reported-ascii-contract-tree'
    );
    const asciiContractTreeCode = asciiContractTree.querySelector('code');
    const asciiContractTreeOriginal = [
      '┌─ 확정 금액 ── 확정 수량 주식 교부? ───> 【자본】 (미발행자본)',
      '계약 ─┤',
      '      └─ 확정 금액 ── 주가 변동에 따라 수량 변동? ───> 【금융부채】'
    ].join('\n');
    const asciiComparison = document.getElementById(
      'reported-ascii-comparison'
    );
    const asciiComparisonCode = asciiComparison.querySelector('code');
    const asciiComparisonOriginal = [
      '< 유상증자 (실질적 증자) >                    < 무상증자 (형식적 증자) >',
      '______________________________               ______________________________',
      '      [자 산]       |      [자 본]                 [자 산]       |      [자 본]',
      '___________________+__________               ___________________+__________',
      '현금 +XXX           | 자본금 +XXX              (변동 없음)       | 자본금 +XXX',
      '                    | 주식발행초과금 +XXX                         | 주식발행초과금 -XXX',
      '___________________+__________               ___________________+__________',
      '순자산(자본총계) XXX 증가!                    순자산(자본총계) 변동 없음!'
    ].join('\n');
    const asciiComparisonStructural = Array.from(
      asciiComparison.querySelectorAll('.aistudio-ascii-grid-structural')
    );
    const asciiComparisonColumns = new Map();

    for (const junction of asciiComparisonStructural) {
      const panel = junction.getAttribute('data-aistudio-ascii-panel');
      const column = getComputedStyle(junction).gridColumnStart;
      const key = `${panel}:${column}`;
      const positions = asciiComparisonColumns.get(key) || [];
      positions.push(junction.getBoundingClientRect().left);
      asciiComparisonColumns.set(key, positions);
    }

    const asciiComparisonRepeatedColumns = Array.from(
      asciiComparisonColumns.values()
    ).filter((positions) => positions.length >= 2);
    const asciiComparisonJunctionDrift = Math.max(
      0,
      ...asciiComparisonRepeatedColumns.map((positions) => (
        Math.max(...positions) - Math.min(...positions)
      ))
    );
    const asciiDividend = document.getElementById(
      'reported-ascii-dividend-comparison'
    );
    const asciiDividendCode = asciiDividend.querySelector('code');
    const asciiDividendOriginal = [
      '< 현금배당 (실질적 유출) >                    < 주식배당 (자본 내 대체) >',
      '________________________________               ________________________________',
      '      [자 산]       |      [자 본]                 [자 산]       |      [자 본]',
      '___________________+____________               ___________________+____________',
      '현금 (XX)           |                           (변동 없음)        | 자본금 XX',
      '                    | 미처분이익잉여금 (XX)                        | 미처분이익잉여금',
      '________________________┴_______               ________________________┴_______',
      '순자산 (자본총계) XX 감소!                     순자산 (자본총계) 변동 없음!'
    ].join('\n');
    const asciiDividendStructural = Array.from(
      asciiDividend.querySelectorAll('.aistudio-ascii-grid-structural')
    );
    const asciiDividendColumns = new Map();

    for (const junction of asciiDividendStructural) {
      const panel = junction.getAttribute('data-aistudio-ascii-panel');
      const column = getComputedStyle(junction).gridColumnStart;
      const key = `${panel}:${column}`;
      const positions = asciiDividendColumns.get(key) || [];
      positions.push(junction.getBoundingClientRect().left);
      asciiDividendColumns.set(key, positions);
    }

    const asciiDividendDrift = Math.max(
      0,
      ...Array.from(asciiDividendColumns.values()).map((positions) => (
        Math.max(...positions) - Math.min(...positions)
      ))
    );
    const accountingTable = document.getElementById('accounting-mobile-table');
    const accountingWrapper = accountingTable.closest(
      '.aistudio-table-scroll'
    );
    const accountingDateCell = document.getElementById('accounting-date-cell');
    const accountingSideCell = document.getElementById('accounting-side-cell');
    const accountingNameCell = document.getElementById('accounting-name-cell');
    const currentModelResponse = document.getElementById(
      'reported-current-model-response'
    );
    const currentModelStrong = Array.from(currentModelResponse.querySelectorAll(
      'strong.aistudio-md-repaired'
    ));
    const currentModelUnderline = currentModelResponse.querySelector(
      'u.aistudio-underline-repaired'
    );
    const rolelessModelResponse = document.getElementById(
      'roleless-model-response'
    );
    const selectorlessModelResponse = document.getElementById(
      'reported-selectorless-model-output'
    );
    const selectorlessStrong = Array.from(
      selectorlessModelResponse.querySelectorAll(
        'strong.aistudio-md-repaired'
      )
    );
    const selectorlessUnderlines = Array.from(
      selectorlessModelResponse.querySelectorAll(
        'u.aistudio-underline-repaired'
      )
    );
    const unscopedBold = document.getElementById(
      'unscoped-bold-with-new-math-host'
    );
    const unscopedStrong = unscopedBold.querySelector(
      'strong.aistudio-md-repaired'
    );
    const unscopedEquation = document.getElementById(
      'unscoped-inline-equation'
    );
    const unscopedKatex = document.getElementById(
      'unscoped-bold-with-katex-annotation'
    );
    const unscopedKatexStrong = unscopedKatex.querySelector(
      'strong.aistudio-md-repaired'
    );
    const unscopedBreak = document.getElementById(
      'unscoped-literal-break'
    );
    const selectorlessReportedNodes = [
      'photo-one-underline-usual',
      'photo-one-underline-always',
      'photo-two-development-stage',
      'photo-two-research-stage',
      'photo-two-alternatives'
    ].map((id) => document.getElementById(id));
    const rawBoldLeafSelector = [
      'p',
      'li',
      'blockquote',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'pre',
      'td',
      '.very-large-text-container'
    ].join(',');
    const rawBoldRemainderIds = Array.from(
      document.querySelectorAll(
        `.chat-turn-container.model :is(${rawBoldLeafSelector})`
      )
    ).filter((element) => (
      /(?:\*\*|__)/.test(element.textContent || '') &&
      !element.matches('.aistudio-ascii-tree-block-repaired') &&
      !element.querySelector(rawBoldLeafSelector)
    )).map((element) => element.id).sort();
    return {
      boldCount: cell.querySelectorAll('strong.aistudio-md-repaired').length,
      boldText: cell.querySelector('strong.aistudio-md-repaired')?.textContent,
      breakCount: cell.querySelectorAll('br.aistudio-table-br-repaired').length,
      html: cell.innerHTML,
      text: cell.textContent,
      preservedBlockBoundary: blockBoundary.querySelectorAll('br').length === 0,
      preservedCode: literalCode.textContent === '<br>',
      preservedLinkBoundary: linkBoundary.querySelectorAll('br').length === 0,
      nativeBoldLiteralBreakRepaired:
        nativeBoldLiteralBreak.querySelectorAll(
          'strong > br.aistudio-table-br-repaired'
        ).length === 1 &&
        !nativeBoldLiteralBreak.textContent.includes('<br>') &&
        nativeBoldLiteralBreak.textContent ===
          '(차) 미처분이익잉여금 감소(대) 미지급배당금 (부채)',
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
      boldContainerMatrixRepaired: [
        ['heading-bold', '항상 충족'],
        ['blockquote-bold', '신뢰성 있게 측정'],
        ['korean-underscore-bold', '필수 조건'],
        ['modern-chunk-bold', '공정가치를 측정']
      ].every(([id, expected]) => {
        const element = document.getElementById(id);
        const strong = element.querySelector('strong.aistudio-md-repaired');
        return strong?.textContent === expected &&
          fontWeightOf(strong) >= 600 &&
          !element.textContent.includes('**') &&
          !element.textContent.includes('__');
      }),
      nativeBoldMixedMarkerRepaired:
        nativeBoldMixedMarker.textContent ===
          '⚡ 1초 공식: 주주에게 지급한 총 현금을 고르면 100% 정답입니다.' &&
        nativeBoldMixedMarker.querySelector(
          'strong > strong.aistudio-md-repaired'
        )?.textContent === '주주에게 지급한 총 현금' &&
        !nativeBoldMixedMarker.textContent.includes('**') &&
        !nativeBoldMixedMarker.textContent.includes('__'),
      nativeBoldInnerMarkerRepaired:
        nativeBoldInnerMarker.textContent ===
          '⚡ 1초 공식: 무조건 0원입니다.' &&
        nativeBoldInnerMarker.querySelector(
          'strong > strong.aistudio-md-repaired'
        )?.textContent === '0원' &&
        !nativeBoldInnerMarker.textContent.includes('**'),
      underlineCount: repairedUnderlines.length,
      underlineTexts: repairedUnderlines.map((element) => element.textContent),
      underlineMarkersRemoved: !underlineRoot.textContent.includes('<u>') &&
        !underlineRoot.textContent.includes('</u>'),
      underlineDecoration: repairedUnderlines[0]
        ? getComputedStyle(repairedUnderlines[0]).textDecorationLine
        : '',
      fairValueUnderlineTexts: fairValueUnderlines.map(
        (element) => element.textContent
      ),
      fairValueUnderlineDecorations: fairValueUnderlines.map(
        (element) => getComputedStyle(element).textDecorationLine
      ),
      fairValueMarkersRemoved:
        !fairValueCard.textContent.includes('<u>') &&
        !fairValueCard.textContent.includes('</u>'),
      permanentModelProgressVisible: (() => {
        const progress = document.getElementById(
          'permanent-model-token-progress'
        );
        const rect = progress.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })(),
      underlineLinkBoundaryPreserved:
        document.querySelectorAll('#underline-link-boundary u').length === 0 &&
        document.getElementById('underline-link-boundary').textContent ===
          '<u>do not cross links here</u>',
      underlineAttributePreserved:
        document.querySelectorAll('#underline-attribute-preserved u').length === 0 &&
        document.getElementById('underline-attribute-preserved').textContent ===
          '<u onclick="alert(1)">unsafe</u>',
      nativeUnderlinePreserved:
        document.querySelectorAll(
          '#native-underline-preserved > u:not(.aistudio-underline-repaired)'
        ).length === 1,
      userUnderlinePreserved:
        document.getElementById('user-raw-underline').textContent ===
        '<u>사용자 원문</u>' &&
        document.querySelectorAll('#user-raw-underline u').length === 0,
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
      tAccountFallback: (() => {
        const root = document.getElementById('raw-t-account-array');
        const table = root.querySelector('.aistudio-array-repaired');
        const rows = Array.from(table?.querySelectorAll(
          '.aistudio-array-row'
        ) || []);
        const heading = rows[0]?.querySelector('.aistudio-array-cell');
        const ending = rows.at(-1)?.querySelector('.aistudio-array-cell');

        return {
          repaired: Boolean(table),
          display: table ? getComputedStyle(table).display : '',
          rawCommandsVisible: /\\(?:multicolumn|hline|textbf)\b/.test(
            root.textContent
          ),
          texts: rows.map((row) => Array.from(
            row.querySelectorAll('.aistudio-array-cell'),
            (cell) => cell.textContent.trim()
          )),
          headingSpan: heading?.style.getPropertyValue(
            '--aistudio-array-span'
          ),
          ruledRows: rows.filter((row) => (
            row.querySelector('.aistudio-array-rule')
          )).length,
          headingWeight: heading
            ? Number(getComputedStyle(heading.querySelector('strong')).fontWeight)
            : 0,
          endingWeight: ending
            ? Number(getComputedStyle(ending.querySelector('strong')).fontWeight)
            : 0
        };
      })(),
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
      stretchyCount: stretchyKatex.querySelectorAll(
        '.katex-stretchy'
      ).length,
      stretchyClipOverflows: stretchyClipNodes.map(
        (element) => getComputedStyle(element).overflow
      ),
      stretchyDisplayWidth: stretchyDisplay.clientWidth,
      stretchyContentWidth: stretchyHtml.scrollWidth,
      stretchyScrollWidth: stretchyKatex.scrollWidth,
      stretchyNaturalWidth: Number(
        stretchyKatex.getAttribute('data-aistudio-math-natural-width') || 0
      ),
      stretchyFitScale: Number(
        stretchyKatex.getAttribute('data-aistudio-math-fit-scale') || 1
      ),
      boldWithMathText: visibleTextOf(boldWithMathStrong),
      boldWithMathWeight: boldWithMathStrong
        ? Number(getComputedStyle(boldWithMathStrong).fontWeight)
        : 0,
      boldWithMathMathStroke: boldWithMathKatex
        ? getComputedStyle(boldWithMathKatex).textShadow
        : 'none',
      boldWithMathMarkersRemoved: !boldWithMath.textContent.includes('**'),
      boldWithMathKatexPreserved:
        Boolean(boldWithMathStrong?.querySelector('.katex')) &&
        sourceOf('photo-four-bold-with-math') === String.raw`\times 9/12`,
      fittedMathCount: Number(document.documentElement.getAttribute(
        'data-aistudio-mobile-fix-fitted-math'
      )),
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
      proseCodeBoldCount: proseCodeBlock.querySelectorAll(
        'strong.aistudio-md-repaired'
      ).length,
      proseCodeBoldText: proseCodeStrong?.textContent,
      proseCodeBoldWeight: fontWeightOf(proseCodeStrong),
      proseCodeMarkersRemoved: !proseCodeBlock.textContent.includes('**'),
      proseCodeBlockRepaired: proseCodeBlock.classList.contains(
        'aistudio-prose-code-block-repaired'
      ),
      splitProseCodeRepaired:
        document.querySelectorAll(
          '#reported-prose-code-split strong.aistudio-md-repaired'
        ).length === 1 &&
        !document.getElementById('reported-prose-code-split')
          .textContent.includes('**'),
      multiParagraphProseCodeRepaired:
        document.querySelectorAll(
          '#reported-ma-prose-code strong.aistudio-md-repaired'
        ).length === 1 &&
        document.querySelector(
          '#reported-ma-prose-code strong.aistudio-md-repaired'
        )?.textContent ===
          '"M&A로 취득하는 무형자산은 유입가능성과 신뢰성 있는 측정 기준 둘 다 항상 충족하는 것으로 본다!"' &&
        !document.getElementById('reported-ma-prose-code')
          .textContent.includes('**') &&
        document.getElementById('reported-ma-prose-code')
          .textContent.includes("취득일의 '공정가치'를 무조건 산출해 냅니다.\n\n그래서") &&
        getComputedStyle(
          document.querySelector('#reported-ma-prose-code > code')
        ).whiteSpace === 'pre-line',
      actualCodePreserved:
        document.getElementById('actual-code-bold').textContent ===
          'const label = "**literal markdown**";' &&
        document.querySelectorAll('#actual-code-bold strong').length === 0,
      koreanCodePreserved:
        document.getElementById('korean-code-bold').textContent ===
          'const label = "**정답**"; // 한국어 코드 예시' &&
        document.querySelectorAll('#korean-code-bold strong').length === 0,
      markdownSyntaxPreserved:
        document.getElementById('markdown-syntax-example').textContent ===
          '마크다운 문법 예시: **굵게**' &&
        document.querySelectorAll('#markdown-syntax-example strong').length === 0,
      languageCodePreserved:
        document.getElementById('language-code-bold').textContent ===
          '한국어 설명입니다. **굵게 표시합니다.**' &&
        document.querySelectorAll('#language-code-bold strong').length === 0,
      asciiTreeRepaired:
        asciiTree.classList.contains('aistudio-ascii-tree-block-repaired') &&
        asciiTreeCode.classList.contains('aistudio-ascii-tree-repaired') &&
        asciiTree.querySelector(
          '.aistudio-ascii-tree-visual[aria-hidden="true"]'
        ) !== null,
      asciiTreeOriginalPreserved:
        asciiTreeCode.textContent === asciiTreeOriginal &&
        asciiTreeCode.innerText === asciiTreeOriginal &&
        asciiTree.textContent === asciiTreeOriginal,
      asciiTreeDisplay: getComputedStyle(asciiTree.querySelector(
        '.aistudio-ascii-tree-visual'
      )).display,
      asciiTreeJunctionXs: Array.from(asciiTree.querySelectorAll(
        '.aistudio-ascii-tree-junction'
      )).map((junction) => junction.getBoundingClientRect().left),
      asciiTreeRowCount: asciiTree.querySelectorAll(
        '.aistudio-ascii-tree-row'
      ).length,
      asciiContractTreeRepaired:
        asciiContractTree.classList.contains(
          'aistudio-ascii-tree-block-repaired'
        ) &&
        asciiContractTree.querySelector(
          '.aistudio-ascii-tree-visual[aria-hidden="true"]'
        ) !== null,
      asciiContractTreeOriginalPreserved:
        asciiContractTreeCode.textContent === asciiContractTreeOriginal &&
        asciiContractTreeCode.innerText === asciiContractTreeOriginal &&
        asciiContractTree.textContent === asciiContractTreeOriginal,
      asciiContractTreeJunctions: Array.from(
        asciiContractTree.querySelectorAll('.aistudio-ascii-tree-junction')
      ).map((junction) => ({
        text: junction.getAttribute('data-aistudio-ascii-cell'),
        x: junction.getBoundingClientRect().left
      })),
      asciiContractTreeRowCount: asciiContractTree.querySelectorAll(
        '.aistudio-ascii-tree-row'
      ).length,
      asciiComparisonRepaired:
        asciiComparison.classList.contains(
          'aistudio-ascii-tree-block-repaired'
        ) &&
        asciiComparison.querySelector(
          '.aistudio-ascii-character-grid[aria-hidden="true"]'
        ) !== null,
      asciiComparisonOriginalPreserved:
        asciiComparisonCode.textContent === asciiComparisonOriginal &&
        asciiComparisonCode.innerText === asciiComparisonOriginal &&
        asciiComparison.textContent === asciiComparisonOriginal,
      asciiComparisonStructuralCount: asciiComparisonStructural.length,
      asciiComparisonRunCount: asciiComparison.querySelectorAll(
        '.aistudio-ascii-grid-run'
      ).length,
      asciiComparisonRepeatedColumnCount:
        asciiComparisonRepeatedColumns.length,
      asciiComparisonStructuralColumnCount:
        asciiComparisonColumns.size,
      asciiComparisonJunctionDrift,
      asciiComparisonScrollable:
        asciiComparison.scrollWidth > asciiComparison.clientWidth,
      asciiDividendRepaired:
        asciiDividend.classList.contains(
          'aistudio-ascii-tree-block-repaired'
        ) &&
        asciiDividend.querySelector(
          '.aistudio-ascii-character-grid[aria-hidden="true"]'
        ) !== null,
      asciiDividendOriginalPreserved:
        asciiDividendCode.textContent === asciiDividendOriginal &&
        asciiDividendCode.innerText === asciiDividendOriginal &&
        asciiDividend.textContent === asciiDividendOriginal,
      asciiDividendTeeCount: asciiDividend.querySelectorAll(
        '.aistudio-ascii-grid-structural[data-aistudio-ascii-cell="┴"]'
      ).length,
      asciiDividendStructuralColumnCount: asciiDividendColumns.size,
      asciiDividendDrift,
      asciiDividendScrollable:
        asciiDividend.scrollWidth > asciiDividend.clientWidth,
      accountingTableWrapped:
        accountingTable.getAttribute('data-aistudio-mobile-table') === '1' &&
        accountingWrapper?.getAttribute('data-aistudio-table-scroll') === '1',
      accountingWrapperCount: document.querySelectorAll(
        '#accounting-table-narrow-host > .aistudio-table-scroll'
      ).length,
      accountingTableTextPreserved:
        accountingTable.textContent.includes('증자일') &&
        accountingTable.textContent.includes('주식발행초과금') &&
        accountingTable.textContent.includes('700,000 − 500,000'),
      accountingWrapperClientWidth: accountingWrapper?.clientWidth || 0,
      accountingWrapperScrollWidth: accountingWrapper?.scrollWidth || 0,
      accountingDateWhiteSpace: getComputedStyle(accountingDateCell).whiteSpace,
      accountingSideWhiteSpace: getComputedStyle(accountingSideCell).whiteSpace,
      accountingNameWordBreak: getComputedStyle(accountingNameCell).wordBreak,
      accountingDateHeight: accountingDateCell.getBoundingClientRect().height,
      accountingDateLineHeight: Number.parseFloat(
        getComputedStyle(accountingDateCell).lineHeight
      ),
      userTablePreserved:
        document.getElementById('user-accounting-table')
          .getAttribute('data-aistudio-mobile-table') === null &&
        document.getElementById('user-accounting-table')
          .closest('.aistudio-table-scroll') === null,
      userProseCodePreserved:
        document.getElementById('user-prose-code-bold').textContent ===
          '사용자가 입력한 **한국어 설명문입니다.** 그대로 둡니다.' &&
        document.querySelectorAll('#user-prose-code-bold strong').length === 0,
      currentModelStrongTexts: currentModelStrong.map(
        (element) => element.textContent
      ),
      currentModelStrongWeights: currentModelStrong.map(fontWeightOf),
      currentModelUnderlineText: currentModelUnderline?.textContent,
      currentModelUnderlineDecoration: currentModelUnderline
        ? getComputedStyle(currentModelUnderline).textDecorationLine
        : '',
      currentModelMarkersRemoved:
        !currentModelResponse.textContent.includes('**') &&
        !currentModelResponse.textContent.includes('<u>') &&
        !currentModelResponse.textContent.includes('</u>'),
      rolelessModelRepaired:
        rolelessModelResponse.querySelector(
          'strong.aistudio-md-repaired'
        )?.textContent === '모델 출력은 복구' &&
        !rolelessModelResponse.textContent.includes('**'),
      lowercaseUserPreserved:
        document.getElementById('lowercase-user-bold').textContent ===
          '사용자가 쓴 **원문 굵게 표기**는 유지합니다.' &&
        document.getElementById('lowercase-user-underline').textContent ===
          '사용자가 쓴 <u>원문 밑줄 표기</u>도 유지합니다.' &&
        document.querySelectorAll(
          '#lowercase-user-response strong, #lowercase-user-response u'
        ).length === 0,
      selectorlessStrongTexts: selectorlessStrong.map(
        (element) => element.textContent
      ),
      selectorlessStrongWeights: selectorlessStrong.map(fontWeightOf),
      selectorlessUnderlineTexts: selectorlessUnderlines.map(
        (element) => element.textContent
      ),
      selectorlessUnderlineDecorations: selectorlessUnderlines.map(
        (element) => getComputedStyle(element).textDecorationLine
      ),
      selectorlessMarkersRemoved:
        selectorlessReportedNodes.every((element) => (
          !element.textContent.includes('**') &&
          !element.textContent.includes('<u>') &&
          !element.textContent.includes('</u>')
        )),
      selectorlessRootMarked:
        selectorlessModelResponse.querySelector(
          '[data-aistudio-repair-root="1"]'
        ) !== null ||
        selectorlessModelResponse.getAttribute(
          'data-aistudio-repair-root'
        ) === '1',
      selectorlessSplitMathSource: sourceOf(
        'photo-split-aligned-wrapper'
      ),
      selectorlessSplitMathRepaired:
        document.querySelector(
          '#photo-split-aligned-wrapper .aistudio-raw-math-repaired .katex'
        ) !== null,
      knownSplitMathSource: sourceOf('known-split-aligned-wrapper'),
      knownSplitMathRepaired:
        document.querySelector(
          '#known-split-aligned-wrapper .aistudio-raw-math-repaired .katex'
        ) !== null,
      nestedFallbackMathSource: sourceOf('nested-generic-environment'),
      nestedFallbackMathRepaired:
        document.querySelector(
          '#nested-generic-environment .aistudio-raw-math-repaired .katex'
        ) !== null,
      percentRowSource: sourceOf('step-two-percent-equation'),
      percentRowRepaired:
        document.querySelector(
          '#step-two-percent-equation .aistudio-raw-math-repaired .katex'
        ) !== null,
      percentRowVisibleText: (() => {
        const html = document.querySelector(
          '#step-two-percent-equation .katex-html'
        );
        return html?.textContent || '';
      })(),
      selectorlessLiteralCodePreserved:
        document.getElementById('selectorless-literal-code').textContent ===
          'Markdown syntax: **literal stays literal** and <u>literal</u>' &&
        document.querySelectorAll(
          '#selectorless-literal-code strong, #selectorless-literal-code u'
        ).length === 0,
      selectorlessUserPreserved:
        document.getElementById('selectorless-user-literal').textContent ===
          '사용자 **원문 굵게**와 <u>원문 밑줄</u>은 유지합니다.' &&
        document.querySelectorAll(
          '#selectorless-user-output strong, #selectorless-user-output u'
        ).length === 0,
      selectorlessNavigationPreserved:
        document.getElementById('selectorless-nav-literal').textContent ===
          '메뉴 **원문 표기**와 <u>원문 태그</u>' &&
        document.querySelectorAll(
          '#selectorless-navigation strong, #selectorless-navigation u'
        ).length === 0,
      unscopedBoldText: visibleTextOf(unscopedStrong),
      unscopedBoldWeight: fontWeightOf(unscopedStrong),
      unscopedMarkersRemoved: !unscopedBold.textContent.includes('**'),
      unscopedEquationPreserved:
        unscopedStrong?.contains(unscopedEquation) === true,
      unscopedEquationMarked: unscopedEquation.classList.contains(
        'aistudio-md-embedded-math'
      ),
      unscopedEquationWeight: fontWeightOf(unscopedEquation),
      unscopedEquationStroke:
        getComputedStyle(unscopedEquation).textShadow,
      unscopedKatexText: visibleTextOf(unscopedKatexStrong),
      unscopedKatexMarkersRemoved:
        !unscopedKatex.textContent.includes('**'),
      unscopedKatexPreserved:
        Boolean(unscopedKatexStrong?.querySelector('.katex')) &&
        sourceOf('unscoped-bold-with-katex-annotation') ===
          String.raw`\frac{9}{12}`,
      unscopedRootMarked:
        unscopedBold.querySelector(
          '[data-aistudio-repair-root="1"]'
        ) !== null,
      unscopedBreakCount: unscopedBreak.querySelectorAll(
        'br.aistudio-table-br-repaired'
      ).length,
      unscopedBreakMarkersRemoved:
        !unscopedBreak.textContent.includes('<br>'),
      unscopedBreakRootMarked:
        unscopedBreak.getAttribute('data-aistudio-repair-root') === '1',
      unscopedUserPreserved:
        document.getElementById('unscoped-user-literal').textContent ===
          '사용자의 **보존할 원문**입니다.' &&
        document.querySelectorAll(
          '#unscoped-user-literal strong'
        ).length === 0,
      diagnosticFallbackRoots: Number(
        document.documentElement.getAttribute(
          'data-aistudio-mobile-fix-fallback-roots'
        )
      ),
      diagnosticTotalRepairs: Number(
        document.documentElement.getAttribute(
          'data-aistudio-mobile-fix-total-repairs'
        )
      ),
      uncheckedMathFitCount: Array.from(document.querySelectorAll(
        '.katex-display:not([data-aistudio-math-fit-checked])'
      )).filter((display) => !display.closest(
        '[data-turn-role="user"], .user-prompt-container, ' +
        '.chat-turn-container.user'
      )).length,
      permanentProgressVisible: (() => {
        const progress = document.getElementById('permanent-token-progress');
        const rect = progress.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })(),
      rawBoldRemainderIds,
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
        'data-aistudio-mobile-safe-1103'
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
    !rendering.boldContainerMatrixRepaired ||
    !rendering.nativeBoldMixedMarkerRepaired ||
    !rendering.nativeBoldInnerMarkerRepaired ||
    rendering.underlineCount !== 3 ||
    JSON.stringify(rendering.underlineTexts) !==
      JSON.stringify(['어렵다', '없다', '필요조건이다']) ||
    !rendering.underlineMarkersRemoved ||
    !rendering.underlineDecoration.includes('underline') ||
    JSON.stringify(rendering.fairValueUnderlineTexts) !== JSON.stringify([
      '절대 1원도 하지 않습니다',
      '무조건 100% 당기손익(IS)'
    ]) ||
    rendering.fairValueUnderlineDecorations.some(
      (decoration) => !decoration.includes('underline')
    ) ||
    !rendering.fairValueMarkersRemoved ||
    !rendering.permanentModelProgressVisible ||
    !rendering.underlineLinkBoundaryPreserved ||
    !rendering.underlineAttributePreserved ||
    !rendering.nativeUnderlinePreserved ||
    !rendering.userUnderlinePreserved ||
    rendering.rawMathCount !== 11 ||
    rendering.rawMathKatexCount !== 11 ||
    rendering.rawMathMathmlCount !== 11 ||
    rendering.rawMathErrorCount !== 0 ||
    !rendering.arraySource?.startsWith('\\begin{array}{ll|ll}') ||
    !rendering.arraySource?.includes('\\\\') ||
    !rendering.tAccountFallback.repaired ||
    rendering.tAccountFallback.display !== 'inline-grid' ||
    rendering.tAccountFallback.rawCommandsVisible ||
    rendering.tAccountFallback.headingSpan !== '2' ||
    rendering.tAccountFallback.ruledRows !== 3 ||
    rendering.tAccountFallback.headingWeight < 600 ||
    rendering.tAccountFallback.endingWeight < 600 ||
    JSON.stringify(rendering.tAccountFallback.texts) !== JSON.stringify([
      ['보통주주식발행초과금 (자본잉여금)'],
      ['차변 (감소)', '대변 (증가)'],
      ['', '기초잔액: 4,000,000'],
      ['', '3/1 증자: 2,000,000'],
      ['', '12/1 현물출자: 3,000,000'],
      ['기말잔액: 9,000,000', '']
    ]) ||
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
    rendering.stretchyCount < 2 ||
    rendering.stretchyClipOverflows.some(
      (overflow) => overflow !== 'hidden'
    ) ||
    rendering.stretchyNaturalWidth <= rendering.stretchyDisplayWidth ||
    rendering.stretchyFitScale >= 1 ||
    rendering.stretchyFitScale < 0.58 ||
    rendering.stretchyScrollWidth > rendering.stretchyDisplayWidth + 2 ||
    rendering.boldWithMathText !==
      '공사기간과 겹치는 기간(4/1~12/31 = 9개월)만 직접 골라내어(×9/12)' ||
    rendering.boldWithMathWeight < 600 ||
    rendering.boldWithMathMathStroke === 'none' ||
    !rendering.boldWithMathMarkersRemoved ||
    !rendering.boldWithMathKatexPreserved ||
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
    !rendering.nativeBoldLiteralBreakRepaired ||
    !rendering.preservedCodeBoundary ||
    !rendering.preservedLinkBoundaryBold ||
    rendering.proseCodeBoldCount !== 1 ||
    rendering.proseCodeBoldText !==
      '"취득 후의 지출(후속지출)"은 자산인식 요건을 따질 것도 없이 무조건 100% 당기비용' ||
    rendering.proseCodeBoldWeight < 600 ||
    !rendering.proseCodeMarkersRemoved ||
    !rendering.proseCodeBlockRepaired ||
    !rendering.splitProseCodeRepaired ||
    !rendering.multiParagraphProseCodeRepaired ||
    !rendering.actualCodePreserved ||
    !rendering.koreanCodePreserved ||
    !rendering.markdownSyntaxPreserved ||
    !rendering.languageCodePreserved ||
    !rendering.asciiTreeRepaired ||
    !rendering.asciiTreeOriginalPreserved ||
    rendering.asciiTreeDisplay !== 'inline-grid' ||
    rendering.asciiTreeRowCount !== 5 ||
    rendering.asciiTreeJunctionXs.length !== 5 ||
    Math.max(...rendering.asciiTreeJunctionXs) -
      Math.min(...rendering.asciiTreeJunctionXs) > 0.5 ||
    !rendering.asciiContractTreeRepaired ||
    !rendering.asciiContractTreeOriginalPreserved ||
    rendering.asciiContractTreeRowCount !== 3 ||
    JSON.stringify(rendering.asciiContractTreeJunctions.map(
      (junction) => junction.text
    )) !== JSON.stringify(['┌', '┤', '└']) ||
    Math.max(...rendering.asciiContractTreeJunctions.map(
      (junction) => junction.x
    )) - Math.min(...rendering.asciiContractTreeJunctions.map(
      (junction) => junction.x
    )) > 0.5 ||
    !rendering.asciiComparisonRepaired ||
    !rendering.asciiComparisonOriginalPreserved ||
    rendering.asciiComparisonStructuralCount < 8 ||
    rendering.asciiComparisonRunCount < 1 ||
    rendering.asciiComparisonRunCount > 200 ||
    rendering.asciiComparisonStructuralColumnCount !== 2 ||
    rendering.asciiComparisonRepeatedColumnCount !== 2 ||
    rendering.asciiComparisonJunctionDrift > 0.5 ||
    !rendering.asciiComparisonScrollable ||
    !rendering.asciiDividendRepaired ||
    !rendering.asciiDividendOriginalPreserved ||
    rendering.asciiDividendTeeCount !== 2 ||
    rendering.asciiDividendStructuralColumnCount !== 2 ||
    rendering.asciiDividendDrift > 0.5 ||
    !rendering.asciiDividendScrollable ||
    !rendering.accountingTableWrapped ||
    rendering.accountingWrapperCount !== 1 ||
    !rendering.accountingTableTextPreserved ||
    rendering.accountingWrapperClientWidth <= 0 ||
    rendering.accountingWrapperScrollWidth <=
      rendering.accountingWrapperClientWidth ||
    rendering.accountingDateWhiteSpace !== 'nowrap' ||
    rendering.accountingSideWhiteSpace !== 'nowrap' ||
    rendering.accountingNameWordBreak !== 'keep-all' ||
    rendering.accountingDateHeight > rendering.accountingDateLineHeight * 1.8 ||
    !rendering.userTablePreserved ||
    !rendering.userProseCodePreserved ||
    JSON.stringify(rendering.currentModelStrongTexts) !== JSON.stringify([
      '발생가능성 인식기준은 항상 충족',
      '발생가능성 인식기준은 항상 충족',
      '신뢰성 있는 측정 인식기준은 사업결합으로 취득하는 무형자산의 경우 항상 충족'
    ]) ||
    rendering.currentModelStrongWeights.some((weight) => weight < 600) ||
    rendering.currentModelUnderlineText !== '통상 신뢰성 있게 측정' ||
    !rendering.currentModelUnderlineDecoration.includes('underline') ||
    !rendering.currentModelMarkersRemoved ||
    !rendering.rolelessModelRepaired ||
    !rendering.lowercaseUserPreserved ||
    JSON.stringify(rendering.selectorlessStrongTexts) !== JSON.stringify([
      '개발단계',
      '모두 연구단계에서 발생한 것(전액 당기비용)',
      '대체안을 제안, 설계, 평가, 최종 선택'
    ]) ||
    rendering.selectorlessStrongWeights.some((weight) => weight < 600) ||
    JSON.stringify(rendering.selectorlessUnderlineTexts) !== JSON.stringify([
      '통상',
      '항상 존재하는 것으로 본다.'
    ]) ||
    rendering.selectorlessUnderlineDecorations.some(
      (decoration) => !decoration.includes('underline')
    ) ||
    !rendering.selectorlessMarkersRemoved ||
    !rendering.selectorlessRootMarked ||
    !rendering.selectorlessSplitMathRepaired ||
    !rendering.selectorlessSplitMathSource?.startsWith('\\begin{aligned}') ||
    !rendering.selectorlessSplitMathSource?.includes('사채상환손익') ||
    !rendering.knownSplitMathRepaired ||
    !rendering.nestedFallbackMathRepaired ||
    !rendering.nestedFallbackMathSource?.includes('사채상환손익') ||
    !rendering.percentRowRepaired ||
    !rendering.percentRowSource?.includes('10\\% \\times \\frac{6}{12}') ||
    !rendering.percentRowSource?.includes('241.3\\text{원} \\\\') ||
    rendering.percentRowVisibleText.includes('106개월간') ||
    !rendering.knownSplitMathSource?.startsWith('\\begin{aligned}') ||
    !rendering.knownSplitMathSource?.includes('사채상환손익') ||
    !rendering.selectorlessLiteralCodePreserved ||
    !rendering.selectorlessUserPreserved ||
    !rendering.selectorlessNavigationPreserved ||
    rendering.unscopedBoldText !==
      '공사기간과 겹치는 기간(4/1~12/31 = 9개월)만 직접 골라내어(×9/12)' ||
    rendering.unscopedBoldWeight < 600 ||
    !rendering.unscopedMarkersRemoved ||
    !rendering.unscopedEquationPreserved ||
    !rendering.unscopedEquationMarked ||
    rendering.unscopedEquationWeight < 600 ||
    rendering.unscopedEquationStroke === 'none' ||
    !rendering.unscopedKatexText.startsWith('TeX 주석 포함 수식(') ||
    !rendering.unscopedKatexText.endsWith(')도 굵게') ||
    !rendering.unscopedKatexMarkersRemoved ||
    !rendering.unscopedKatexPreserved ||
    !rendering.unscopedRootMarked ||
    rendering.unscopedBreakCount !== 1 ||
    !rendering.unscopedBreakMarkersRemoved ||
    !rendering.unscopedBreakRootMarked ||
    !rendering.unscopedUserPreserved ||
    rendering.diagnosticFallbackRoots > 6 ||
    rendering.diagnosticTotalRepairs < 5 ||
    rendering.uncheckedMathFitCount !== 0 ||
    !rendering.permanentProgressVisible ||
    JSON.stringify(rendering.rawBoldRemainderIds) !== JSON.stringify([
      'actual-code-bold',
      'code-boundary-bold',
      'korean-code-bold',
      'language-code-bold',
      'link-boundary-bold',
      'markdown-syntax-example'
    ]) ||
    !rendering.fencedMathPreserved ||
    rendering.unexpectedBarrierMathSources.length !== 0 ||
    rendering.version !== '1.10.3'
  ) {
    throw new Error(`Firefox rendering regression: ${JSON.stringify(rendering)}`);
  }

  await page.evaluate(() => {
    const fallbackSurface = document.getElementById('selectorless-main');
    const runLabel = document.querySelector('.run-button-label');
    const completedTurn = document.createElement('ms-chat-turn');
    const completedContainer = document.createElement('div');
    const completedRenderer = document.createElement('ms-cmark-node');
    const completedWrong = document.createElement('p');
    const completedCorrect = document.createElement('p');
    const modelTurn = document.createElement('section');
    const modelRenderer = document.createElement('div');
    const modelParagraph = document.createElement('p');
    const modelMath = document.createElement('div');
    const progress = document.createElement('div');

    runLabel.textContent = 'Stop';

    completedTurn.id = 'dynamic-completed-old-turn';
    completedContainer.className = 'chat-turn-container model';
    completedRenderer.id = 'dynamic-completed-old-response';
    completedWrong.textContent =
      '과거 ②번 지문은 모두 **개발단계**에서 발생한 것으로 본다.';
    completedCorrect.textContent =
      '과거 올바른 기준은 **모두 연구단계에서 발생한 것(전액 당기비용)**이다.';
    completedRenderer.append(completedWrong, completedCorrect);
    completedContainer.appendChild(completedRenderer);
    completedTurn.appendChild(completedContainer);
    fallbackSurface.appendChild(completedTurn);

    modelTurn.id = 'dynamic-roleless-model-turn';
    modelTurn.className = 'unknown-dynamic-response-shell';
    modelRenderer.id = 'dynamic-roleless-model-response';
    modelParagraph.textContent =
      '새 응답의 **동적 모델 출력**과 <u>동적 밑줄</u>입니다.';
    modelMath.id = 'dynamic-photo-split-aligned';
    [
      String.raw`\begin{aligned}`,
      String.raw`\mathbf{\text{사채상환손익}} &= \text{상환시점 장부금액}(98,150\text{원}) - \text{상환대가}`,
      '(92,000\\text{원}) \\',
      String.raw`&= \mathbf{+6,150\text{원 (사채상환이익 → 당기순이익 6,150원 증가)}}`,
      String.raw`\end{aligned}`
    ].forEach((text) => {
      const line = document.createElement('div');
      line.textContent = text;
      modelMath.appendChild(line);
    });
    progress.id = 'dynamic-model-progress';
    progress.setAttribute('role', 'progressbar');
    progress.style.cssText = 'display:block;width:2px;height:2px';
    modelRenderer.append(modelParagraph, modelMath, progress);
    modelTurn.appendChild(modelRenderer);
    fallbackSurface.appendChild(modelTurn);

    const userTurn = document.createElement('section');
    const userRenderer = document.createElement('div');
    const userParagraph = document.createElement('p');

    userTurn.id = 'dynamic-lowercase-user-turn';
    userTurn.setAttribute('data-turn-role', 'user');
    userRenderer.id = 'dynamic-lowercase-user-response';
    userParagraph.textContent =
      '새 사용자 **원문 굵게**와 <u>원문 밑줄</u>입니다.';
    userRenderer.appendChild(userParagraph);
    userTurn.appendChild(userRenderer);
    fallbackSurface.appendChild(userTurn);
  });

  await page.waitForTimeout(2300);

  const duringStreaming = await page.evaluate(() => ({
    completedStrongTexts: Array.from(document.querySelectorAll(
      '#dynamic-completed-old-response strong.aistudio-md-repaired'
    )).map((element) => element.textContent),
    completedStrongWeights: Array.from(document.querySelectorAll(
      '#dynamic-completed-old-response strong.aistudio-md-repaired'
    )).map((element) => Number(getComputedStyle(element).fontWeight)),
    completedMarkersRemoved:
      !document.getElementById('dynamic-completed-old-response')
        .textContent.includes('**'),
    modelText: document.getElementById(
      'dynamic-roleless-model-response'
    ).textContent,
    modelRepairs: document.querySelectorAll(
      '#dynamic-roleless-model-response strong, ' +
      '#dynamic-roleless-model-response u'
    ).length,
    rawMathVisible: document.getElementById(
      'dynamic-photo-split-aligned'
    ).textContent.includes('begin{aligned}'),
    mathRepairs: document.querySelectorAll(
      '#dynamic-photo-split-aligned .aistudio-raw-math-repaired'
    ).length,
    userText: document.getElementById(
      'dynamic-lowercase-user-response'
    ).textContent,
    userRepairs: document.querySelectorAll(
      '#dynamic-lowercase-user-response strong, ' +
      '#dynamic-lowercase-user-response u'
    ).length,
    generating: document.documentElement.getAttribute(
      'data-aistudio-mobile-fix-generating'
    ),
    deferredRoots: Number(document.documentElement.getAttribute(
      'data-aistudio-mobile-fix-deferred-roots'
    ))
  }));

  if (
    JSON.stringify(duringStreaming.completedStrongTexts) !== JSON.stringify([
      '개발단계',
      '모두 연구단계에서 발생한 것(전액 당기비용)'
    ]) ||
    duringStreaming.completedStrongWeights.some((weight) => weight < 600) ||
    !duringStreaming.completedMarkersRemoved ||
    !duringStreaming.modelText.includes('**동적 모델 출력**') ||
    !duringStreaming.modelText.includes('<u>동적 밑줄</u>') ||
    duringStreaming.modelRepairs !== 0 ||
    !duringStreaming.rawMathVisible ||
    duringStreaming.mathRepairs !== 0 ||
    !duringStreaming.userText.includes('**원문 굵게**') ||
    !duringStreaming.userText.includes('<u>원문 밑줄</u>') ||
    duringStreaming.userRepairs !== 0 ||
    duringStreaming.generating !== 'true' ||
    duringStreaming.deferredRoots < 1
  ) {
    throw new Error(
      `Firefox streaming guard regression: ${JSON.stringify(duringStreaming)}`
    );
  }

  await page.evaluate(() => {
    document.getElementById('dynamic-model-progress').remove();
    document.querySelector('.run-button-label').textContent = 'Run';
  });
  await page.waitForTimeout(2700);

  const dynamicRepair = await page.evaluate(() => {
    const model = document.getElementById('dynamic-roleless-model-response');
    const user = document.getElementById('dynamic-lowercase-user-response');
    const strong = model.querySelector('strong.aistudio-md-repaired');
    const underline = model.querySelector('u.aistudio-underline-repaired');

    return {
      modelHtml: model.innerHTML,
      modelText: model.textContent,
      strongText: strong?.textContent,
      strongWeight: strong
        ? Number(getComputedStyle(strong).fontWeight)
        : 0,
      underlineText: underline?.textContent,
      underlineDecoration: underline
        ? getComputedStyle(underline).textDecorationLine
        : '',
      mathRepaired: document.querySelector(
        '#dynamic-photo-split-aligned .aistudio-raw-math-repaired .katex'
      ) !== null,
      mathSource: document.querySelector(
        '#dynamic-photo-split-aligned annotation[encoding="application/x-tex"]'
      )?.textContent || '',
      mathFitChecked: document.querySelector(
        '#dynamic-photo-split-aligned .katex-display'
      )?.getAttribute('data-aistudio-math-fit-checked') === '1',
      userText: user.textContent,
      userRepairs: user.querySelectorAll('strong, u').length
    };
  });

  if (
    dynamicRepair.modelText.includes('**') ||
    dynamicRepair.modelText.includes('<u>') ||
    dynamicRepair.modelText.includes('</u>') ||
    dynamicRepair.strongText !== '동적 모델 출력' ||
    dynamicRepair.strongWeight < 600 ||
    dynamicRepair.underlineText !== '동적 밑줄' ||
    !dynamicRepair.underlineDecoration.includes('underline') ||
    !dynamicRepair.mathRepaired ||
    !dynamicRepair.mathSource.startsWith('\\begin{aligned}') ||
    !dynamicRepair.mathSource.includes('사채상환손익') ||
    !dynamicRepair.mathFitChecked ||
    !dynamicRepair.userText.includes('**원문 굵게**') ||
    !dynamicRepair.userText.includes('<u>원문 밑줄</u>') ||
    dynamicRepair.userRepairs !== 0
  ) {
    throw new Error(
      `Firefox dynamic-root regression: ${JSON.stringify(dynamicRepair)}`
    );
  }

  await page.evaluate(() => {
    window.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(1200);

  const dynamicHtmlAfterRescan = await page.evaluate(() => (
    document.getElementById('dynamic-roleless-model-response').innerHTML
  ));

  if (dynamicHtmlAfterRescan !== dynamicRepair.modelHtml) {
    throw new Error('Firefox dynamic-root idempotency regression');
  }

  const cachedMathFit = await page.evaluate(async () => {
    const originalGetComputedStyle = window.getComputedStyle;
    let mathStyleReads = 0;

    window.getComputedStyle = function (element, pseudo) {
      if (
        element?.matches?.('.katex, .katex-display, ms-katex.display')
      ) {
        mathStyleReads += 1;
      }

      return originalGetComputedStyle.call(window, element, pseudo);
    };

    try {
      for (let index = 0; index < 20; index += 1) {
        window.dispatchEvent(new Event('scroll'));
      }

      await new Promise((resolve) => setTimeout(resolve, 700));
    } finally {
      window.getComputedStyle = originalGetComputedStyle;
    }

    return { mathStyleReads };
  });

  if (cachedMathFit.mathStyleReads !== 0) {
    throw new Error(
      `Firefox cached math-fit regression: ${JSON.stringify(cachedMathFit)}`
    );
  }

  const promptTyping = await page.evaluate(async () => {
    const editor = document.getElementById('unknown-plaintext-editor');
    editor.focus();
    await new Promise((resolve) => setTimeout(resolve, 500));
    window.__bodyTextWalkerCount = 0;

    const text = editor.firstChild;

    for (let index = 0; index < 40; index += 1) {
      text.nodeValue = `**입력 ${index}**`;
      editor.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        data: '가',
        inputType: 'insertText'
      }));
    }

    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    await new Promise((resolve) => setTimeout(resolve, 1400));

    return {
      bodyFallbackWalkers: window.__bodyTextWalkerCount,
      editorMarked:
        editor.hasAttribute('data-aistudio-repair-root'),
      editorRepairCount: editor.querySelectorAll(
        '.aistudio-md-repaired, .aistudio-raw-math-repaired'
      ).length,
      editorText: editor.textContent
    };
  });

  if (
    promptTyping.bodyFallbackWalkers !== 0 ||
    promptTyping.editorMarked ||
    promptTyping.editorRepairCount !== 0 ||
    promptTyping.editorText !== '**입력 39**'
  ) {
    throw new Error(
      `Firefox prompt typing regression: ${JSON.stringify(promptTyping)}`
    );
  }

  await page.evaluate(() => {
    window.__timeOffset += 100000;
  });
  /* Date.now is intentionally offset above. Use a trusted pointer event
     without the locator actionability clock, which shares that page shim. */
  const runButtonPoint = await page.evaluate(() => {
    const button = document.querySelector('button.ctrl-enter-submits');
    button.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = button.getBoundingClientRect();

    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  });
  await page.mouse.click(runButtonPoint.x, runButtonPoint.y);
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

  return {
    rendering,
    duringStreaming,
    dynamicRepair,
    cachedMathFit,
    promptTyping,
    preflight
  };
}
