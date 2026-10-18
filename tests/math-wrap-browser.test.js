async (page) => {
  const fs = require('node:fs');
  const source = fs.readFileSync('aaa.user.js', 'utf8').replace(
    /\n  if \(document\.readyState === 'loading'\)/,
    '\n  globalThis.__mathWrap = { containWideInlineMath };\n  if (document.readyState === \'loading\')'
  );
  await page.setViewportSize({ width: 412, height: 915 });
  await page.setContent(`<!doctype html><html><body><main role="main">
    <ms-prompt-input><textarea></textarea><button class="run-button">Run</button></ms-prompt-input>
    <article class="chat-turn-container model" data-turn-role="model">
      <ms-cmark-node id="math-turn">
        <ms-katex class="display" id="wrap-display"><pre><code class="rendered" id="wrap-code"></code></pre></ms-katex>
        <ms-katex class="display" id="scale-display"><pre><code class="rendered" id="scale-code"></code></pre></ms-katex>
        <ul style="width:300px;max-width:100%"><li id="inline-li"><ms-katex id="inline-host"></ms-katex></li></ul>
        <div id="collapsed" style="display:none"><ul style="width:300px;max-width:100%"><li><ms-katex id="hidden-host"></ms-katex></li></ul></div>
      </ms-cmark-node>
    </article>
  </main></body></html>`);
  await page.addStyleTag({ path: 'node_modules/katex/dist/katex.min.css' });
  await page.addScriptTag({ path: 'node_modules/katex/dist/katex.min.js' });
  const natural = await page.evaluate(() => {
    const wrapSrc = '\\text{정기리스료 현재가치} = 32,744 \\times 2.40183 = 78,645.52... \\rightarrow ₩78,646';
    const render = (target, src, displayMode) => {
      const span = document.createElement('span');
      target.append(span);
      katex.render(src, span, {
        displayMode,
        output: 'htmlAndMathml',
        throwOnError: true,
        strict: 'ignore'
      });
    };
    render(document.getElementById('wrap-code'), wrapSrc, true);
    render(
      document.getElementById('scale-code'),
      '\\begin{array}{llr|llr}\\text{(차)} & \\text{주식보상비용 (비용)} & 500 & \\text{(대)} & \\text{주식선택권 (자본)} & 500\\end{array}',
      true
    );
    render(
      document.getElementById('inline-host'),
      '\\text{당기 인식할 수익} = (\\text{총 계약금액} \\times \\text{누적진행률}) - \\text{전기 인식 수익}',
      false
    );
    render(
      document.getElementById('hidden-host'),
      '\\text{당기 인식할 수익} = (\\text{총 계약금액} \\times \\text{누적진행률}) - \\text{전기 인식 수익}',
      false
    );
    const wrapMath = document.querySelector('#wrap-display .katex');
    return {
      wrapFontSize: getComputedStyle(wrapMath).fontSize,
      viewport: window.innerWidth
    };
  });
  if (natural.viewport !== 412) {
    throw new Error('math-wrap suite requires the 412 px viewport');
  }
  await page.addScriptTag({ content: source });
  await page.waitForTimeout(3000);
  const result = await page.evaluate((unfittedFontSize) => {
    const wrapDisplay = document.getElementById('wrap-display');
    const wrapMath = wrapDisplay.querySelector('.katex');
    const wrapBox = wrapMath.parentElement;
    const wrapBases = Array.from(
      wrapDisplay.querySelectorAll('.katex-html > .katex-base')
    );
    const displayRight = wrapDisplay.getBoundingClientRect().right;
    return {
      wrapMode: wrapMath.getAttribute('data-aistudio-math-fit-mode'),
      wrapScale: wrapMath.getAttribute('data-aistudio-math-fit-scale'),
      wrapFontSize: getComputedStyle(wrapMath).fontSize,
      unfittedFontSize,
      wrapClass: wrapBox.classList.contains('aistudio-math-wrap'),
      bases: wrapBases.length,
      basesWithin: wrapBases.every(
        (base) => base.getBoundingClientRect().right <= displayRight + 1
      ),
      noScroller: !wrapDisplay.closest('.aistudio-math-scroll'),
      displayHeight: wrapDisplay.getBoundingClientRect().height,
      htmlHeight: wrapDisplay.querySelector('.katex-html')
        .getBoundingClientRect().height,
      scaleMode: document.querySelector('#scale-display .katex')
        .getAttribute('data-aistudio-math-fit-mode'),
      scale: Number(
        document.querySelector('#scale-display .katex')
          .getAttribute('data-aistudio-math-fit-scale')
      ),
      scaleScroller: !!document.querySelector(
        '#scale-display .aistudio-math-scroll, .aistudio-math-scroll #scale-display'
      ),
      scaleOverflow: document.querySelector('#scale-display .katex')
        .scrollWidth > document.getElementById('scale-display').clientWidth + 1,
      inlineWrap: document.getElementById('inline-host')
        .classList.contains('aistudio-inline-math-wrap'),
      inlineOverflow: (() => {
        const li = document.getElementById('inline-li');
        const host = document.getElementById('inline-host');
        return host.scrollWidth > li.clientWidth + 1;
      })()
    };
  }, natural.wrapFontSize);
  const wrapOk = result.wrapMode === 'wrap' &&
    result.wrapFontSize === result.unfittedFontSize &&
    result.wrapClass &&
    result.bases >= 2 &&
    result.basesWithin &&
    result.noScroller;
  const gapOk = result.displayHeight - result.htmlHeight < 30;
  const scaleOk = result.scaleMode === 'scale' &&
    result.scale >= 0.75 &&
    (!result.scaleOverflow || result.scaleScroller);
  const inlineOk = result.inlineWrap && !result.inlineOverflow;

  result.hidden = await page.evaluate(() => {
    const host = document.getElementById('hidden-host');
    return {
      checked: host.getAttribute('data-aistudio-inline-math-checked'),
      wrapped: host.classList.contains('aistudio-inline-math-wrap')
    };
  });
  const hiddenUnchecked = result.hidden.checked === null &&
    !result.hidden.wrapped;
  result.hiddenAfterShow = await page.evaluate(() => {
    document.getElementById('collapsed').style.display = '';
    __mathWrap.containWideInlineMath(false);
    const host = document.getElementById('hidden-host');
    return {
      checked: host.getAttribute('data-aistudio-inline-math-checked'),
      wrapped: host.classList.contains('aistudio-inline-math-wrap')
    };
  });
  const hiddenReevaluated = result.hiddenAfterShow.checked === '1' &&
    result.hiddenAfterShow.wrapped;

  await page.setViewportSize({ width: 1280, height: 915 });
  await page.waitForTimeout(2000);
  result.refit = await page.evaluate(() => {
    const wrapDisplay = document.getElementById('wrap-display');
    const wrapMath = wrapDisplay.querySelector('.katex');
    return {
      wrapClass: wrapDisplay.classList.contains('aistudio-math-wrap'),
      scale: wrapMath.getAttribute('data-aistudio-math-fit-scale'),
      mode: wrapMath.getAttribute('data-aistudio-math-fit-mode'),
      fontReset: wrapMath.style.getPropertyValue('font-size')
    };
  });
  const refitOk = !result.refit.wrapClass &&
    (!result.refit.scale || Number(result.refit.scale) === 1) &&
    !result.refit.fontReset;

  if (!wrapOk || !gapOk || !scaleOk || !inlineOk || !refitOk ||
      !hiddenUnchecked || !hiddenReevaluated) {
    throw new Error(JSON.stringify({
      result, wrapOk, gapOk, scaleOk, inlineOk, refitOk,
      hiddenUnchecked, hiddenReevaluated
    }));
  }
  return {
    result, wrapOk, gapOk, scaleOk, inlineOk, refitOk,
    hiddenUnchecked, hiddenReevaluated
  };
}
