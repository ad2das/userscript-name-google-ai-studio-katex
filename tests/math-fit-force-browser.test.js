async (page) => {
  /*
   * W-R4Q / W2. A forced math-fit trigger (fonts loadingdone, pageshow, popstate,
   * visibilitychange, resize, orientationchange) must re-measure EVERY display the
   * way an unbudgeted forced pass would, even when the pass cannot finish inside
   * one scan budget, and no single script task may spend more than a frame's
   * worth of time doing it.
   *
   * Fixture: 200 display formulas in a 300 px column, each fitting at the base
   * font, so the boot pass records them checked without a scale. A stylesheet
   * then raises the KaTeX font size to 2.6x WITHOUT changing the column width, so
   * every formula overflows and a correct refit must re-measure all of them
   * (fitDisplayMath resets the previous scale before measuring, so this is a full
   * pass, not an incremental one). window.pageshow is the forced trigger.
   *
   * Checks:
   *   allRefit         - every display is fitted for the new metrics (no
   *                      horizontal overflow outside an explicit scroller)
   *   budgetKept       - no single script task during the refit exceeded 20 ms
   *   sameAsUnbudgeted - per-display fitted state equals the r4-build-i reference
   *                      (MF_BASELINE in, MF_BASELINE_OUT writes it)
   */
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(process.env.AISTUDIO_SOURCE || 'aaa.user.js', 'utf8');
  const baselineIn = process.env.MF_BASELINE || '';
  const baselineOut = process.env.MF_BASELINE_OUT || '';
  /*
   * 60 displays of this shape already exceed one 6 ms budget: the control build
   * refits 3 of them and stops (see raw-q/mf-ctl-p.log), which is the defect.
   */
  const COUNT = Number(process.env.MF_COUNT || 60);
  const COLUMN = 300;
  const TASK_CAP_MS = 20;
  const REFIT_SETTLE_MS = 30000;

  const SHELL = '<!doctype html><html><head><style>ms-cmark-node{display:contents}' +
    '.mf-col{width:' + COLUMN + 'px;max-width:100%}' +
    '.katex-display.mf-host{margin:0}' +
    '</style></head><body style="margin:0"><main role="main">' +
    '<ms-autoscroll-container style="display:block;height:800px;overflow:auto">' +
    '<ms-chat-turn><div class="chat-turn-container model"><ms-cmark-node class="cmark-node" id="math-turn"></ms-cmark-node></div></ms-chat-turn>' +
    '</ms-autoscroll-container>' +
    '<ms-prompt-box><textarea></textarea><button class="run-button">Run</button></ms-prompt-box></main></body></html>';

  await page.setContent(SHELL);
  await page.addStyleTag({ path: 'node_modules/katex/dist/katex.min.css' });
  await page.addScriptTag({ path: 'node_modules/katex/dist/katex.min.js' });

  await page.evaluate((count) => {
    const turn = document.getElementById('math-turn');
    for (let index = 0; index < count; index += 1) {
      // The fit target is .katex-display itself: no nested .katex-display, so
      // fitWideDisplayMath's nested-display skip does not apply to the fixture.
      const host = document.createElement('span');
      host.className = 'katex-display mf-host';
      host.setAttribute('data-fixture-index', String(index));
      const column = document.createElement('div');
      column.className = 'mf-col';
      column.append(host);
      turn.append(column);
      // Fits the column at the base font; overflows it 1.25-1.8x after the bump.
      katex.render('q_{' + (1 + (index % 3)) + '}q_{2}q_{3}q_{4}q_{5}q_{6}q_{7}q_{8}q_{9}', host, {
        displayMode: false, output: 'htmlAndMathml', throwOnError: true, strict: 'ignore'
      });
    }

    /*
     * One inline host whose formula is wider than its 180 px list item, so the
     * containment pass wraps it in a scroller. That wrapped state is what the
     * repeated passes used to tear down and rebuild: the churn probe counts those
     * writes.
     */
    const list = document.createElement('div');
    list.id = 'inline-container';
    list.style.cssText = 'width:180px;max-width:100%';
    const inline = document.createElement('ms-katex');
    inline.id = 'inline-host';
    list.append(inline);
    turn.append(list);
    katex.render(
      '\\text{당기 인식할 수익} = (\\text{총 계약금액} \\times \\text{누적진행률}) - \\text{전기 인식 수익}',
      inline,
      { displayMode: false, output: 'htmlAndMathml', throwOnError: true, strict: 'ignore' }
    );
  }, COUNT);

  /*
   * Task timer. The scan is scheduled through setTimeout / MessageChannel /
   * requestIdleCallback / requestAnimationFrame depending on urgency, so every
   * entry point is wrapped to time the whole callback. This is what makes
   * `budgetKept` measurable: the failure mode is one long synchronous pass.
   */
  await page.evaluate(() => {
    const tasks = globalThis.__mfTasks = [];
    const detail = globalThis.__mfTaskDetail = [];
    const wrap = (fn, kind) => (typeof fn === 'function'
      ? function timed() {
        const t0 = performance.now();
        try { return fn.apply(this, arguments); } finally {
          const ms = +(performance.now() - t0).toFixed(2);
          tasks.push(ms);
          detail.push([ms, kind]);
        }
      }
      : fn);
    const NativeMessageChannel = window.MessageChannel;
    // MessagePort.onmessage is an accessor on the prototype. A shadowing own
    // property that never forwards to it silently swallows every message, which
    // would disable the script's own continuation port - so the wrapper sets the
    // native handler and only reads its value back.
    const portProto = MessagePort.prototype;
    const nativeSet = Object.getOwnPropertyDescriptor(portProto, 'onmessage')?.set;
    window.MessageChannel = class TimedMessageChannel extends NativeMessageChannel {
      constructor() {
        super();
        const port = this.port1;
        let handler = null;
        Object.defineProperty(port, 'onmessage', {
          configurable: true,
          get: () => handler,
          set: (fn) => {
            handler = wrap(fn, 'mc');
            if (nativeSet) nativeSet.call(port, handler);
            else Object.getOwnPropertyDescriptor(portProto, 'onmessage').set?.call(port, handler);
          }
        });
      }
    };
    const nativeTimeout = window.setTimeout;
    window.setTimeout = function (fn, delay) {
      const rest = Array.prototype.slice.call(arguments, 2);
      return nativeTimeout.call(window, wrap(fn, 'timeout'), delay, ...rest);
    };
    const nativeIdle = window.requestIdleCallback;
    if (typeof nativeIdle === 'function') {
      window.requestIdleCallback = function (fn, options) {
        return nativeIdle.call(window, wrap(fn, 'idle'), options);
      };
    }
    const nativeRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = function (fn) {
      return nativeRaf.call(window, wrap(fn, 'raf'));
    };
  });

  await page.addScriptTag({ content: source });
  await page.waitForTimeout(3000);

  const readState = () => {
    const hosts = Array.from(document.querySelectorAll('#math-turn .katex-display'));
    const rows = hosts.map((host) => {
      const katexRoot = host.querySelector(':scope > .katex');
      const scroller = host.closest('.aistudio-math-scroll');
      // Natural width beyond the container, which is what the reader sees.
      const overflow = katexRoot ? katexRoot.scrollWidth - Math.floor(host.clientWidth) : null;
      return {
        scale: katexRoot?.getAttribute('data-aistudio-math-fit-scale') || null,
        mode: katexRoot?.getAttribute('data-aistudio-math-fit-mode') || null,
        checked: host.getAttribute('data-aistudio-math-fit-checked') === '1',
        overflow,
        scrollable: Boolean(scroller)
      };
    });
    return {
      count: rows.length,
      checked: rows.filter((row) => row.checked).length,
      scaled: rows.filter((row) => row.scale).length,
      overflowing: rows.filter((row) => !row.scrollable && row.overflow > 1).length,
      column: hosts.length ? Math.floor(hosts[0].clientWidth) : 0,
      signature: rows.map((row) => (row.scale || '-') + '/' + (row.mode || '-') +
        '/' + (row.scrollable ? 'S' : 'N') + '/' + (row.overflow > 1 ? 'O' : 'F')).join('|')
    };
  };
  const boot = await page.evaluate(readState);

  // Raise the KaTeX font size only: the column width is unchanged.
  await page.addStyleTag({ content: '.katex{font-size:2.6em !important}' });

  const followUp = await page.evaluate(readState);
  await page.evaluate(() => {
    globalThis.__mfTasks.length = 0;
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
  });

  /*
   * Wait for convergence on the fitted signature, not on quiet tasks: the pass is
   * budgeted over many tasks and the page's own intervals keep ticking.
   */
  const settled = await page.evaluate(async (limit) => {
    const signatureOf = () => Array.from(document.querySelectorAll('#math-turn .katex-display'))
      .map((host) => {
        const katexRoot = host.querySelector(':scope > .katex');
        return (katexRoot?.getAttribute('data-aistudio-math-fit-scale') || '-') +
          '/' + (katexRoot?.getAttribute('data-aistudio-math-fit-mode') || '-') +
          '/' + (host.closest('.aistudio-math-scroll') ? 'S' : 'N');
      }).join('|');
    /*
     * Convergence means: every display carries its checked marker, no force
     * stamp is left, and the fitted signature has been unchanged for 600 ms.
     * A signature-only test is not enough - the recorded scales repeat, so an
     * unfinished pass can look stable for a while.
     */
    const deadline = performance.now() + limit;
    let last = null;
    let stableSince = performance.now();
    while (performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const current = signatureOf();
      const hosts = document.querySelectorAll('#math-turn .katex-display');
      const stamped = document.querySelectorAll('#math-turn .katex-display[data-aistudio-math-fit-force]').length;
      const unchecked = Array.from(hosts).filter((host) => host.getAttribute('data-aistudio-math-fit-checked') !== '1').length;
      if (current !== last) { last = current; stableSince = performance.now(); continue; }
      if (!stamped && !unchecked && performance.now() - stableSince >= 600) {
        return { settled: true, stableMs: Math.round(performance.now() - stableSince), tasks: globalThis.__mfTasks.length };
      }
    }
    return { settled: false, stableMs: -1, tasks: globalThis.__mfTasks.length,
      stampedLeft: document.querySelectorAll('#math-turn .katex-display[data-aistudio-math-fit-force]').length,
      uncheckedLeft: Array.from(document.querySelectorAll('#math-turn .katex-display'))
        .filter((host) => host.getAttribute('data-aistudio-math-fit-checked') !== '1').length };
  }, REFIT_SETTLE_MS);

  const after = await page.evaluate((readStateSource) => {
    // eslint-disable-next-line no-new-func
    const state = new Function('return (' + readStateSource + ')()')();
    const tasks = globalThis.__mfTasks.slice();
    const detail = (globalThis.__mfTaskDetail || []).slice();
    const worst = tasks.reduce((acc, ms) => (ms > acc ? ms : acc), 0);
    return {
      state,
      tasks: tasks.length,
      worstTask: worst,
      tasksOverCap: tasks.filter((ms) => ms > 20).length,
      topTasks: detail.sort((a, b) => b[0] - a[0]).slice(0, 5)
    };
  }, readState.toString());

  /*
   * Reference answer for `sameAsUnbudgeted`, derived in the page instead of
   * carried in a file: for every display, undo the applied fit, measure the
   * natural width at the base font, and compute the scale an unbudgeted pass
   * would choose with the same rule (max(MIN_DISPLAY_MATH_SCALE,
   * min(1, (available - 2) / natural))). The fixture's formulas render a single
   * .katex-base, so they take the scale branch, not the wrap branch. The
   * previously applied fit is restored afterwards.
   */
  const expected = await page.evaluate(() => {
    const MIN_SCALE = 0.75;
    const rows = [];
    for (const host of document.querySelectorAll('#math-turn .katex-display')) {
      const katexRoot = host.querySelector(':scope > .katex');
      if (!katexRoot) { rows.push(null); continue; }
      const appliedFontSize = katexRoot.style.getPropertyValue('font-size');
      const appliedPriority = katexRoot.style.getPropertyPriority('font-size');
      katexRoot.style.removeProperty('font-size');
      const availableWidth = Math.floor(host.clientWidth || 0);
      const naturalWidth = Math.ceil(katexRoot.scrollWidth || 0);
      const expectedScale = naturalWidth <= availableWidth + 1
        ? 1
        : Math.max(MIN_SCALE, Math.min(1, (availableWidth - 2) / naturalWidth));
      if (appliedFontSize) katexRoot.style.setProperty('font-size', appliedFontSize, appliedPriority);
      rows.push(expectedScale.toFixed(4));
    }
    return rows;
  });

  const scales = after.state.signature.split('|');
  let baselineScales = null;
  if (baselineIn && fs.existsSync(baselineIn)) {
    baselineScales = JSON.parse(fs.readFileSync(baselineIn, 'utf8')).scales;
  }
  if (baselineOut) {
    fs.mkdirSync(path.dirname(baselineOut), { recursive: true });
    fs.writeFileSync(baselineOut, JSON.stringify({
      source: process.env.AISTUDIO_SOURCE || 'aaa.user.js',
      column: boot.column,
      count: after.state.count,
      scales,
      worstTaskMs: after.worstTask
    }, null, 1));
  }
  /*
   * Compare the fitted scale only (the signature also carries mode/scroller/
   * overflow markers, which the reference does not model).
   */
  const reference = baselineScales || expected;
  const fitted = after.state.signature.split('|').map((cell) => cell.split('/')[0]);
  const scaleDiffs = reference
    ? fitted.map((value, index) => (value === reference[index] ? null : [index, reference[index], value]))
      .filter(Boolean)
    : [];

  /*
   * Trigger cost and inline churn.
   *
   * Both defects live in one place: a forced trigger re-applied a fit whose inputs
   * had not changed, and every re-apply wrote class/style/childList inside the leaf
   * it fitted. On chat B that closed a loop - the write rebuilt the leaf, the
   * rebuild hid the native display children, the width collapse invalidated math
   * fit, and the next pass wrote again - so ONE font-load trigger became 161-168
   * fits and 1.5-1.6 s of scan time with no further triggers at all.
   *
   * Three probes, because a trigger can waste work in three ways:
   *   burstOnce            five pageshow events inside 50 ms must not fit a display
   *                        more than twice (the scheduler may coalesce them, but a
   *                        pass that re-arms per event would show 5 writes).
   *   repeatTriggerNoWrite five pageshow events spaced 250 ms apart - one pass each,
   *                        so coalescing cannot hide anything - must write NOTHING,
   *                        because every display's inputs are unchanged.
   *   noInlineChurn        the wrapped inline host must see zero childList/class
   *                        mutations, i.e. no unwrap/re-wrap cycle.
   */
  const probe = async (gapMs) => page.evaluate(async ([gap, limit]) => {
    const scaleWrites = new Map();
    const inlineChurn = [];
    const inlineHost = document.getElementById('inline-host');
    const inlineContainer = document.getElementById('inline-container');

    const fitObserver = new MutationObserver((records) => {
      for (const record of records) {
        if (record.attributeName !== 'data-aistudio-math-fit-scale') continue;
        const display = record.target.closest('.katex-display') || record.target;
        scaleWrites.set(display, (scaleWrites.get(display) || 0) + 1);
      }
    });
    fitObserver.observe(document.getElementById('math-turn'), {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-aistudio-math-fit-scale', 'style']
    });

    const churnObserver = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') inlineChurn.push('attr:' + record.attributeName);
        else inlineChurn.push('childList');
      }
    });
    if (inlineContainer) {
      churnObserver.observe(inlineContainer, {
        subtree: true, childList: true, attributes: true, attributeFilter: ['class']
      });
    }

    for (let index = 0; index < 5; index += 1) {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
      await new Promise((resolve) => setTimeout(resolve, gap));
    }

    /*
     * Quiet means: no display unchecked or force-stamped, and no new fit write for
     * 700 ms. Counting is per display, so a pass that stops writing because every
     * display is already fitted is exactly the pass this probe is looking for.
     */
    const deadline = performance.now() + limit;
    let lastTotal = -1;
    let stableSince = performance.now();
    while (performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const total = Array.from(scaleWrites.values()).reduce((a, b) => a + b, 0);
      const unchecked = Array.from(document.querySelectorAll('#math-turn .katex-display'))
        .filter((host) => host.getAttribute('data-aistudio-math-fit-checked') !== '1').length;
      const stamped = document.querySelectorAll('#math-turn .katex-display[data-aistudio-math-fit-force]').length;
      if (total !== lastTotal) { lastTotal = total; stableSince = performance.now(); continue; }
      if (!unchecked && !stamped && performance.now() - stableSince >= 700) break;
    }

    fitObserver.disconnect();
    churnObserver.disconnect();
    const perDisplay = Array.from(scaleWrites.values());
    return {
      displaysWritten: perDisplay.length,
      worstPerDisplay: perDisplay.reduce((a, b) => (a > b ? a : b), 0),
      totalWrites: perDisplay.reduce((a, b) => a + b, 0),
      inlineChurn: inlineChurn.length,
      inlineChurnSample: inlineChurn.slice(0, 6),
      // Either containment is correct for this host: a scroll wrapper, or the
      // break-at-relation class. What matters is that a verdict exists at all.
      inlineWrapped: Boolean(inlineHost?.closest('.aistudio-inline-math-scroll')),
      inlineVerdicted: Boolean(
        inlineHost?.closest('.aistudio-inline-math-scroll') ||
        inlineHost?.classList.contains('aistudio-inline-math-wrap')
      ),
      inlineExists: Boolean(inlineHost),
      // Every display must still carry its verdict after the probe.
      stillFitted: Array.from(document.querySelectorAll('#math-turn .katex-display'))
        .every((host) => host.querySelector(':scope > .katex')?.getAttribute('data-aistudio-math-fit-scale'))
    };
  }, [gapMs, REFIT_SETTLE_MS]);

  const burst = await probe(10);
  const repeat = await probe(250);

  /*
   * W-R4Q3 hole 1: a ResizeObserver width collapse must not become the baseline.
   * R4 hides the native children of a mirrored leaf, so a display really does
   * report 0 and then its real width again. If the 0 is stored as the previous
   * width, the return to a DIFFERENT width is ignored and the display keeps the
   * fit measured for the old width, which then overflows.
   *
   * Fixture: one display fitted (scaled) at width A. Its container is hidden
   * (display:none -> the observer sees 0), resized to B < A while hidden, then
   * shown again. No window event is dispatched: only the resize observer may
   * notice, which is the whole point.
   */
  const hiddenResize = await page.evaluate(async (limit) => {
    const turn = document.getElementById('math-turn');
    const CHECKED = 'data-aistudio-math-fit-checked';
    const frames = async (count) => {
      for (let index = 0; index < count; index += 1) {
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
    };
    const signatureOf = (host) => {
      const katexRoot = host.querySelector(':scope > .katex');
      return (katexRoot?.getAttribute('data-aistudio-math-fit-scale') || '-') + '/' +
        (katexRoot?.getAttribute('data-aistudio-math-fit-mode') || '-') + '/' +
        (host.classList.contains('aistudio-math-wrap') ? 'W' : 'n') + '/' +
        (host.closest('.aistudio-math-scroll') ? 'S' : 'N') + '/' +
        (host.getAttribute(CHECKED) === '1' ? 'c' : 'u');
    };
    const waitSettled = async (host, ms) => {
      const deadline = performance.now() + ms;
      let last = null;
      let stableSince = performance.now();
      while (performance.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const current = signatureOf(host);
        if (current !== last) { last = current; stableSince = performance.now(); continue; }
        if (current.endsWith('c') && performance.now() - stableSince >= 700) return true;
      }
      return false;
    };
    const container = document.createElement('div');
    container.id = 'hidden-resize-container';
    const host = document.createElement('span');
    host.className = 'katex-display';
    host.id = 'hidden-resize-host';
    container.append(host);
    turn.append(container);
    /*
     * A single-base formula so the wrap branch (which needs two .katex-base) does
     * not apply: both widths take the plain scale branch. The text is wide enough
     * that the two widths both scale it and both stay inside the chat column.
     */
    const FORMULA = '\\text{R4Q3 long single-base formula for the hidden resize check with plenty of width}';
    katex.render(FORMULA, host,
      { displayMode: false, output: 'htmlAndMathml', throwOnError: true, strict: 'ignore' });
    const katexRoot = host.querySelector(':scope > .katex');

    /*
     * Natural width: the .katex-base rect, which is the formula's own width and is
     * independent of the container (.katex-html fills its parent, so scrollWidth is
     * not a natural-width signal). Then A = natural - 6%, B = natural - 12%.
     */
    const scratchMeasure = document.createElement('div');
    scratchMeasure.style.cssText = 'position:absolute;left:-9999px;top:0;width:4000px';
    const measuredHost = document.createElement('span');
    measuredHost.className = 'katex-display';
    scratchMeasure.append(measuredHost);
    document.body.append(scratchMeasure);
    katex.render(FORMULA, measuredHost,
      { displayMode: false, output: 'htmlAndMathml', throwOnError: true, strict: 'ignore' });
    const measuredRoot = measuredHost.querySelector(':scope > .katex');
    const naturalWidth = Math.ceil(
      measuredRoot.querySelector(':scope > .katex-html > .katex-base')
        ?.getBoundingClientRect().width || 0
    );
    const measuredBases = measuredRoot.querySelectorAll(
      ':scope > .katex-html > .katex-base').length;
    scratchMeasure.remove();
    const widthA = Math.ceil(naturalWidth * 0.94);
    const widthB = Math.ceil(naturalWidth * 0.88);
    container.style.width = widthA + 'px';
    await waitSettled(host, limit);
    const fittedAtA = katexRoot.getAttribute('data-aistudio-math-fit-scale');
    const stageA = {
      mode: katexRoot.getAttribute('data-aistudio-math-fit-mode'),
      scale: fittedAtA,
      scrollWidth: Math.ceil(katexRoot.scrollWidth || 0),
      clientWidth: Math.floor(host.clientWidth || 0),
      checked: host.getAttribute(CHECKED) === '1',
      bases: katexRoot.querySelectorAll(':scope > .katex-html > .katex-base').length,
      hasTag: Boolean(katexRoot.querySelector('.tag')),
      measuredBases
    };

    let markerHeld = null;
    for (let attempt = 1; attempt <= 3 && markerHeld !== true; attempt += 1) {
      container.style.display = 'none';
      await frames(3);
      // A scan landing while hidden would clear the marker and refit at width 0,
      // which would make the check pass for the wrong reason: record it.
      markerHeld = host.getAttribute(CHECKED) === '1' &&
        Boolean(katexRoot.getAttribute('data-aistudio-math-fit-scale'));
      container.style.width = widthB + 'px';
      await frames(3);
      container.style.display = '';
      await frames(3);
      await waitSettled(host, limit);
      if (markerHeld !== true) {
        container.style.width = widthA + 'px';
        await frames(3);
        await waitSettled(host, limit);
      }
    }

    const scroller = host.parentElement?.classList.contains('aistudio-math-scroll')
      ? host.parentElement : null;
    const availableWidth = Math.floor(host.clientWidth || 0);
    const overflow = Math.ceil(katexRoot.scrollWidth || 0) - availableWidth;
    const scale = katexRoot.getAttribute('data-aistudio-math-fit-scale');

    /*
     * Reference: a fresh full fit at width B, measured on a detached clone so the
     * live display keeps its state. Same rule as fitDisplayMath's scale branch.
     */
    const scratch = document.createElement('div');
    scratch.style.cssText = 'position:absolute;left:-9999px;top:0;width:' + widthB + 'px';
    const cloneHost = host.cloneNode(true);
    const cloneRoot = cloneHost.querySelector(':scope > .katex');
    cloneRoot.removeAttribute('data-aistudio-math-fit-scale');
    cloneRoot.removeAttribute('data-aistudio-math-natural-width');
    cloneRoot.removeAttribute('data-aistudio-math-fit-mode');
    cloneRoot.style.removeProperty('font-size');
    cloneHost.classList.remove('aistudio-math-wrap');
    scratch.append(cloneHost);
    document.body.append(scratch);
    const cloneAvailable = Math.floor(cloneHost.clientWidth || 0);
    const cloneNatural = Math.ceil(cloneRoot.scrollWidth || 0);
    const referenceScale = cloneNatural <= cloneAvailable + 1
      ? 1
      : Math.max(0.75, Math.min(1, (cloneAvailable - 2) / cloneNatural));
    scratch.remove();

    return {
      naturalWidth,
      widthA,
      widthB,
      stageA,
      fittedAtA,
      markerHeld,
      availableWidth,
      overflow,
      scroller: Boolean(scroller),
      scale,
      cloneAvailable,
      cloneNatural,
      referenceScale: referenceScale.toFixed(4),
      appliedScale: scale ? Number(scale).toFixed(4) : null
    };
  }, REFIT_SETTLE_MS);
  const hiddenResizeRefit = hiddenResize.markerHeld === true &&
    hiddenResize.scroller === false &&
    hiddenResize.overflow <= 1 &&
    hiddenResize.appliedScale === hiddenResize.referenceScale;

  /*
   * W-R4Q3 hole 2: content that changes INSIDE an existing .katex root changes the
   * natural width without replacing the root. The mutation observer must drop the
   * recorded measurement, not only the cache, or the next pass reuses the old
   * verdict and the wider formula overflows.
   *
   * Fixture: one display that fits unscaled, then its .katex-html children are
   * cloned so the natural width is about 3x the container. No window event.
   */
  const innerContent = await page.evaluate(async (limit) => {
    const turn = document.getElementById('math-turn');
    const CHECKED = 'data-aistudio-math-fit-checked';
    const container = document.createElement('div');
    container.id = 'inner-content-container';
    container.style.cssText = 'width:360px;max-width:100%';
    const host = document.createElement('span');
    host.className = 'katex-display';
    host.id = 'inner-content-host';
    container.append(host);
    turn.append(container);
    katex.render('b_{1}+b_{2}+b_{3}', host,
      { displayMode: false, output: 'htmlAndMathml', throwOnError: true, strict: 'ignore' });
    const katexRoot = host.querySelector(':scope > .katex');
    const settle = async (ms) => {
      const deadline = performance.now() + ms;
      let last = null;
      let stableSince = performance.now();
      while (performance.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const current = [
          katexRoot.getAttribute('data-aistudio-math-fit-scale') || '-',
          katexRoot.getAttribute('data-aistudio-math-fit-mode') || '-',
          host.classList.contains('aistudio-math-wrap') ? 'W' : 'n',
          host.closest('.aistudio-math-scroll') ? 'S' : 'N',
          host.getAttribute(CHECKED) === '1' ? 'c' : 'u'
        ].join('/');
        if (current !== last) { last = current; stableSince = performance.now(); continue; }
        if (current.endsWith('c') && performance.now() - stableSince >= 700) return true;
      }
      return false;
    };
    await settle(limit);
    const bootScale = katexRoot.getAttribute('data-aistudio-math-fit-scale');
    const bootOverflow = Math.ceil(katexRoot.scrollWidth || 0) - Math.floor(host.clientWidth || 0);
    const naturalBefore = Math.ceil(katexRoot.scrollWidth || 0);

    // Keep the root element, widen its content: clone the .katex-html children.
    const html = katexRoot.querySelector(':scope > .katex-html');
    for (let copy = 0; copy < 2; copy += 1) {
      for (const child of Array.from(html.children)) html.append(child.cloneNode(true));
    }
    await settle(limit);

    const scroller = host.closest('.aistudio-math-scroll');
    const availableWidth = Math.floor(host.clientWidth || 0);
    const overflow = Math.ceil(katexRoot.scrollWidth || 0) - availableWidth;
    const scale = katexRoot.getAttribute('data-aistudio-math-fit-scale');
    return {
      naturalBefore,
      bootScale,
      bootOverflow,
      checked: host.getAttribute(CHECKED) === '1',
      availableWidth,
      overflow,
      scroller: Boolean(scroller),
      wrapped: host.classList.contains('aistudio-math-wrap'),
      scale,
      mode: katexRoot.getAttribute('data-aistudio-math-fit-mode')
    };
  }, REFIT_SETTLE_MS);
  const innerContentRefit = innerContent.bootOverflow <= 1 && innerContent.checked === true &&
    (innerContent.scroller === true ||
      (innerContent.overflow <= 1 && Boolean(innerContent.scale || innerContent.wrapped)));

  const checks = {
    // Fixture validity: the displays fit at the base font and the boot pass
    // measured all of them.
    fixtureComplete: boot.count === COUNT && boot.checked === COUNT && boot.overflowing === 0,
    // The font bump really invalidates every formula, and the trigger ran work.
    fixtureInvalidated: followUp.overflowing === COUNT && after.tasks > 0,
    // W1: every display is re-measured for the new metrics, not just the first
    // slice of the budget.
    allRefit: after.state.overflowing === 0 && after.state.scaled === COUNT,
    // The refit is spread across tasks: no single script task over 20 ms.
    budgetKept: after.worstTask <= TASK_CAP_MS,
    // Same per-display fitted scale as an unbudgeted forced pass would produce.
    sameAsUnbudgeted: scaleDiffs.length === 0,
    // A burst of forced triggers re-measures every display once, not once per
    // event: no display may be re-fitted more than twice.
    burstOnce: burst.worstPerDisplay <= 2,
    // Spaced repeats cannot be coalesced by the scheduler, so they isolate the
    // real defect: an unchanged display must not be written at all.
    repeatTriggerNoWrite: repeat.worstPerDisplay === 0 && repeat.stillFitted,
    // A repeated pass over an unchanged inline host writes nothing to the DOM.
    noInlineChurn: repeat.inlineExists && repeat.inlineVerdicted === true &&
      repeat.inlineChurn === 0,
    // W-R4Q3: a hidden-then-resized display must refit for the new width with no
    // window event, i.e. the ResizeObserver must not treat the 0 as the baseline.
    hiddenResizeRefit,
    // W-R4Q3: content changed inside the existing .katex root must refit (scaled
    // or scroller) with no window event.
    innerContentRefit
  };

  const summary = {
    boot: { count: boot.count, checked: boot.checked, overflowing: boot.overflowing, column: boot.column },
    followUp: { overflowing: followUp.overflowing, scaled: followUp.scaled },
    settled,
    after: {
      count: after.state.count,
      scaled: after.state.scaled,
      overflowing: after.state.overflowing,
      checked: after.state.checked
    },
    tasks: after.tasks,
    worstTask: after.worstTask,
    topTasks: after.topTasks,
    tasksOverCap: after.tasksOverCap,
    scaleSample: scales.slice(0, 4),
    scaleDiffs: scaleDiffs.slice(0, 8),
    burst,
    repeat,
    hiddenResize,
    innerContent,
    referenceSource: baselineScales ? 'file' : 'derived',
    baselineUsed: baselineIn || null,
    baselineWritten: baselineOut || null
  };
  const failed = Object.entries(checks).filter(([, ok]) => ok !== true).map(([key]) => key);
  if (failed.length) throw new Error(JSON.stringify({ failed, checks, summary }));
  return { checks, summary };
}
