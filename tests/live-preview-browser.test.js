async (page) => {
  const fs = require('node:fs');
  const source = fs.readFileSync('aaa.user.js', 'utf8')
    .replace('const ENABLE_LIVE_EMPHASIS = true;', 'const ENABLE_LIVE_EMPHASIS = false;')
    .replace(/\n  if \(document\.readyState === 'loading'\)/,
    '\n  globalThis.__liveParse = findMatches; globalThis.createLiveEmphasisPrototype = createLiveEmphasisProjection;\n  if (document.readyState === \'loading\')');
  await page.setContent('<!doctype html><html><head><style>body{background:#202124;color:#eee;font:18px Arial;padding:24px}p{line-height:1.6}</style></head><body><main><ms-prompt-input><button class="run-button">Stop</button></ms-prompt-input><article data-turn-role="model"><p id="live">앞 문장 <span>**강조</span><!--anchor--><span> 문장**</span> 뒤 문장</p></article></main></body></html>');
  await page.addScriptTag({ content: source });
  await page.evaluate(() => {
    const block = document.getElementById('live');
    globalThis.__before = { html: block.innerHTML, nodes: Array.from(block.childNodes), child: block.querySelector('span').firstChild };
    globalThis.__preview = createLiveEmphasisPrototype(block, __liveParse);
  });
  await page.waitForTimeout(150);
  const initial = await page.evaluate(() => __preview.stats());
  if (!initial.visible) throw new Error('Live prototype did not paint: ' + JSON.stringify(initial));
  const checks = await page.evaluate(() => {
    const block = document.getElementById('live');
    return {
      paintsWhileStopActive: document.querySelector('button').textContent === 'Stop' && __preview.stats().visible,
      sourceUnchanged: block.innerHTML === __before.html,
      frameworkNodesUnchanged: __before.nodes.every((n, i) => block.childNodes[i] === n) && block.querySelector('span').firstChild === __before.child,
      noDuplicateSelectableText: !document.querySelector('.aistudio-live-preview-layer').textContent,
      layerOutsideNativeResponse: !block.closest('article').querySelector('canvas'),
      noninteractiveLayer: getComputedStyle(document.querySelector('.aistudio-live-preview-layer')).pointerEvents === 'none'
    };
  });
  await page.screenshot({ path: 'output/playwright/live-preview-prototype.png' });
  await page.evaluate(() => { document.getElementById('live').textContent = '앞 문장 **아직 열림'; });
  await page.waitForTimeout(50);
  checks.incompletePairRevealsSource = await page.evaluate(() => !__preview.stats().visible && !CSS.highlights.has('aistudio-live-emphasis'));
  await page.evaluate(() => { document.getElementById('live').textContent = "앞 문장 **'가시성검증 05"; });
  await page.waitForTimeout(50);
  checks.pendingQuotedPairPaintsWithoutMutation = await page.evaluate(() =>
    __preview.stats().visible && document.getElementById('live').textContent === "앞 문장 **'가시성검증 05");
  await page.evaluate(() => { document.getElementById('live').firstChild.nodeValue += "'*"; });
  await page.waitForTimeout(50);
  checks.partialQuotedClosePaints = await page.evaluate(() => __preview.stats().visible);
  await page.evaluate(() => { document.getElementById('live').firstChild.nodeValue += '*'; });
  await page.waitForTimeout(50);
  checks.closedQuotedTailPaints = await page.evaluate(() =>
    __preview.stats().visible && document.getElementById('live').textContent === "앞 문장 **'가시성검증 05'**");
  await page.evaluate(() => { document.getElementById('live').innerHTML = '<code>**\'문자 그대로</code>'; });
  await page.waitForTimeout(50);
  checks.pendingQuotedCodePreserved = await page.evaluate(() =>
    !__preview.stats().visible && document.querySelector('#live code').textContent === "**'문자 그대로");
  await page.evaluate(() => { document.getElementById('live').textContent = "앞 문장 **'임시 강조"; });
  await page.waitForTimeout(50);
  await page.evaluate(() => { document.getElementById('live').textContent = '앞 문장 일반 글자로 변경'; });
  await page.waitForTimeout(50);
  checks.pendingRewriteRestoresNative = await page.evaluate(() =>
    !__preview.stats().visible && document.getElementById('live').textContent === '앞 문장 일반 글자로 변경');
  await page.evaluate(() => { document.getElementById('live').textContent = '앞 문장 **완료된 강조** 다음'; });
  await page.waitForTimeout(80);
  checks.closedPairRepaintsBeforeCompletion = await page.evaluate(() => __preview.stats().visible && __preview.stats().lastLatency <= 100);
  const streamed = await page.evaluate(async () => {
    const node = document.getElementById('live').firstChild;
    const samples = [];
    for (let i = 0; i < 20; i++) {
      await new Promise(resolve => setTimeout(() => { node.nodeValue = `문장 ${i} **강조`; resolve(); }, 5));
      await new Promise(resolve => setTimeout(() => { node.nodeValue += ' 문장**'; resolve(); }, 5));
      await new Promise(resolve => setTimeout(resolve, 35));
      if (__preview.stats().visible) throw new Error('Ambiguous closing run painted at streaming tail');
      const start = performance.now();
      await new Promise(resolve => setTimeout(() => { node.nodeValue += ' 다음'; resolve(); }, 5));
      while (!__preview.stats().visible && performance.now() - start < 150) {
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      if (!__preview.stats().visible || node !== document.getElementById('live').firstChild) {
        throw new Error('Streaming paint or native text-node retention failed');
      }
      samples.push(performance.now() - start);
    }
    return samples.sort((a,b) => a-b);
  });
  checks.timerDrivenStreamingP95 = streamed[18] <= 100;
  await page.evaluate(() => { document.getElementById('live').textContent = '앞 문장 **완료된 강조** 다음'; });
  await page.waitForTimeout(50);
  await page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('live'));
    getSelection().addRange(range);
  });
  await page.waitForTimeout(50);
  checks.selectionRevealsNativeSource = await page.evaluate(() => !__preview.stats().visible && getSelection().toString().includes('**완료된 강조**'));
  await page.evaluate(() => {
    getSelection().removeAllRanges();
    document.getElementById('live').innerHTML = '<span contenteditable="true">**편집 영역** 다음</span>';
  });
  await page.waitForTimeout(50);
  checks.editorFallback = await page.evaluate(() => !__preview.stats().visible);
  await page.evaluate(() => {
    const block = document.getElementById('live');
    block.textContent = '**가나다라마바사아자차카타파하가나다라마바사** 다음';
    block.style.width = '90px';
  });
  await page.waitForTimeout(50);
  checks.multilineKoreanPaints = await page.evaluate(() => __preview.stats().visible &&
    document.querySelectorAll('.aistudio-live-preview-layer canvas').length >= 3 &&
    document.getElementById('live').textContent === '**가나다라마바사아자차카타파하가나다라마바사** 다음');
  await page.screenshot({ path: 'output/playwright/live-preview-multiline.png' });
  await page.evaluate(() => {
    const block = document.getElementById('live');
    block.style.width = '';
    block.innerHTML = '<ms-cmark-node><strong>기존 강조</strong><span> 본문 **새 </span><!--anchor--><span>강조** 뒤</span></ms-cmark-node>';
    block.firstElementChild.style.cssText = 'display:contents;font-family:monospace';
    globalThis.__nativePrefix = block.querySelector('strong');
    globalThis.__nativeAnchor = block.firstElementChild.childNodes[2];
  });
  await page.waitForTimeout(50);
  checks.nativeRendererAndSeparatePrefix = await page.evaluate(() => __preview.stats().visible &&
    document.querySelector('#live strong') === __nativePrefix && __nativePrefix.textContent === '기존 강조' &&
    document.querySelector('#live ms-cmark-node').childNodes[2] === __nativeAnchor &&
    document.querySelectorAll('.aistudio-live-preview-layer canvas').length === 1);
  await page.evaluate(() => {
    const block = document.getElementById('live');
    block.innerHTML = '<span class="inline-code">**코드 안의 기호</span> 그리고 **바깥 강조** 끝';
    globalThis.__literalInlineCode = block.firstChild;
  });
  await page.waitForTimeout(50);
  checks.inlineCodeDoesNotBlockUnrelatedEmphasis = await page.evaluate(() =>
    __preview.stats().visible && __preview.stats().ranges === 1 &&
    document.getElementById('live').firstChild === __literalInlineCode &&
    __literalInlineCode.textContent === '**코드 안의 기호');
  await page.evaluate(() => {
    document.getElementById('live').innerHTML = '**바깥 <code>코드</code> 경계** 끝';
  });
  await page.waitForTimeout(50);
  checks.liveEmphasisNeverCrossesCode = await page.evaluate(() => !__preview.stats().visible &&
    document.querySelector('#live code').textContent === '코드');
  await page.evaluate(() => {
    const block = document.getElementById('live');
    block.style.width = '';
    block.textContent = '**다시 강조** 다음';
  });
  await page.waitForTimeout(50);
  checks.rewriteRepaints = await page.evaluate(() => __preview.stats().visible);
  await page.evaluate(() => {
    const cover = document.createElement('div');
    cover.id = 'cover';
    cover.style.cssText = 'position:fixed;inset:0;background:black;z-index:100;';
    document.body.append(cover);
  });
  await page.waitForTimeout(50);
  checks.occludedSourceRevealed = await page.evaluate(() => !__preview.stats().visible && !CSS.highlights.has('aistudio-live-emphasis'));
  await page.evaluate(() => document.getElementById('cover').remove());
  await page.waitForTimeout(50);
  checks.uncoveredRepaints = await page.evaluate(() => __preview.stats().visible);
  await page.evaluate(() => {
    const wrapper = document.createElement('div');
    wrapper.id = 'clipper';
    wrapper.style.cssText = 'height:10px;overflow:hidden;';
    const block = document.getElementById('live');
    block.before(wrapper);
    wrapper.append(block);
  });
  await page.waitForTimeout(50);
  checks.clippedSourceFallback = await page.evaluate(() => !__preview.stats().visible);
  await page.evaluate(() => { document.getElementById('clipper').style.height = '120px'; });
  await page.waitForTimeout(50);
  checks.unclippedRepaints = await page.evaluate(() => __preview.stats().visible);
  await page.evaluate(() => { document.getElementById('clipper').style.transform = 'scale(1.2)'; });
  await page.waitForTimeout(50);
  checks.transformedSourceFallback = await page.evaluate(() => !__preview.stats().visible);
  await page.evaluate(() => { document.getElementById('live').remove(); });
  await page.waitForTimeout(25);
  checks.disconnectedSourceClears = await page.evaluate(() => !__preview.stats().visible && !CSS.highlights.has('aistudio-live-emphasis'));
  await page.evaluate(() => { __preview.stop(); });
  checks.cleanup = await page.evaluate(() => !document.querySelector('.aistudio-live-preview-layer') && !CSS.highlights.has('aistudio-live-emphasis'));
  if (Object.values(checks).some(x => !x)) throw new Error(JSON.stringify(checks));

  // ---- livePreviewIdleBulk (W-R4M) ----
  // The idle fast path in the real controller, driven directly. Change B collapses the whole
  // per-record loop into one `scheduleSync(true)` when `currentRoot === null`, so the layer state
  // after a 20000-record idle batch must equal the base build's: no projectors, no host, no
  // highlight. The second half proves the fast path is not a mute button: during a generation in a
  // root R4 does not cover, a bulk batch inside it still produces ranges.
  //
  // The controller is constructed here (the suite disables the in-page instance so its layer
  // cannot be confused with this one) exactly like live-controller-browser.test.js does.
  const controllerSource = source
    .replace(/\n  if \(document\.readyState === 'loading'\)/,
      '\n  globalThis.__liveParse2 = findMatches; globalThis.createLiveEmphasisController = createLiveEmphasisController;\n  if (document.readyState === \'loading\')');
  const bulkSource = controllerSource
    .replace('const ENABLE_SAFE_OUTPUT_REPAIR = true;', 'const ENABLE_SAFE_OUTPUT_REPAIR = true;')
    .replace('const ENABLE_R4_MIRROR = true;', 'const ENABLE_R4_MIRROR = false;');
  // Same page shape live-controller-browser.test.js uses: that markup is what the projector's
  // geometry and selection gates accept, so a check here cannot fail for layout reasons.
  await page.setContent('<!doctype html><html><head><style>body{background:#202124;color:#eee;' +
    'font:18px Arial;padding:24px}p{line-height:1.6}</style></head><body><main>' +
    '<ms-prompt-input><textarea></textarea><button class="run-button">Stop</button></ms-prompt-input>' +
    '<article data-turn-role="user">**사용자 원문**</article>' +
    '<article id="model" data-turn-role="model"><p>**첫 문단** 끝</p><p>**둘째 문단** 끝</p>' +
    '<p>**셋째 문단** 끝</p></article></main></body></html>');
  await page.addScriptTag({ content: bulkSource });
  const idleBulk = await page.evaluate(async () => {
    let generating = false;
    globalThis.__typing2 = false;
    globalThis.__controller2 = createLiveEmphasisController({
      getRoot: () => document.getElementById('model'),
      parse: __liveParse2,
      active: () => generating,
      typing: () => __typing2
    });
    const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const snap = () => {
      const stats = __controller2.stats();
      return { blocks: stats.blocks, ranges: stats.ranges, layer: stats.layerConnected,
        host: document.querySelectorAll('.aistudio-live-preview-layer').length };
    };
    // Idle, currentRoot === null: the controller was constructed idle so no root ever resolved.
    const before = snap();
    // ONE task, >= 20000 records, while idle and with no root.
    const pad = document.createElement('div');
    pad.style.display = 'none';
    document.body.append(pad);
    const records = [];
    for (let i = 0; i < 20000; i++) {
      const s = document.createElement('span');
      s.append(document.createTextNode('p' + i));
      pad.append(s);
      records.push(s.firstChild);
    }
    const counter = new MutationObserver(() => {});
    counter.observe(document.body, { childList: true, characterData: true, subtree: true });
    for (const node of records) node.data = 'q' + node.data;
    const own = counter.takeRecords();
    counter.disconnect();
    await settle(300);
    const afterIdle = snap();
    // Generating: the existing paint must SURVIVE a bulk batch that touches the same root and
    // adds unrelated nodes. If the fast path had swallowed the batch (or cleared the layer), the
    // ranges would drop to 0 with the native `**` text still unrepaired.
    generating = true;
    __controller2.invalidate();
    await settle(400);
    const genBefore = snap();
    const target = document.getElementById('model');
    for (let i = 0; i < 200; i++) {
      const s = document.createElement('span');
      s.style.display = 'none';
      s.append(document.createTextNode('x'));
      target.append(s);
    }
    for (const node of Array.from(target.querySelectorAll('span'))) {
      if (node.firstChild && node.firstChild.nodeType === 3) node.firstChild.data = 'y' + node.firstChild.data;
    }
    await settle(600);
    const afterGen = snap();
    __controller2.stop();
    const stopped = snap();
    return { recordCount: own.length, before, afterIdle, genBefore, afterGen, stopped };
  });
  checks.livePreviewIdleBulkLayerCleared = idleBulk.afterIdle.blocks === 0 && idleBulk.afterIdle.ranges === 0 &&
    idleBulk.afterIdle.layer === false && idleBulk.afterIdle.host === 0;
  checks.livePreviewIdleBulkIsBig = idleBulk.recordCount >= 20000;
  // The generation half: the layer that was painted before the batch is still painted after it.
  checks.livePreviewGenerationBulkKeepsPaint = idleBulk.genBefore.ranges > 0 &&
    idleBulk.afterGen.ranges >= idleBulk.genBefore.ranges && idleBulk.afterGen.layer === true;
  if (Object.values(checks).some(x => !x)) {
    throw new Error(JSON.stringify({ checks, idleBulk }));
  }
  return { checks, initial, timerSamples: streamed.length, timerP95Ms: streamed[18], idleBulk };
}
