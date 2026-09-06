async (page) => {
  const fs = require('node:fs');
  const source = fs.readFileSync('aaa.user.js', 'utf8').replace(/\n  if \(document\.readyState === 'loading'\)/,
    '\n  globalThis.__liveParse = findMatches;\n  if (document.readyState === \'loading\')');
  await page.setContent('<!doctype html><html><head><style>body{background:#202124;color:#eee;font:18px Arial;padding:24px}p{line-height:1.6}</style></head><body><main><ms-prompt-input><button class="run-button">Stop</button></ms-prompt-input><article data-turn-role="model"><p id="live">앞 문장 <span>**강조</span><!--anchor--><span> 문장**</span> 뒤 문장</p></article></main></body></html>');
  await page.addScriptTag({ content: source });
  await page.addScriptTag({ path: 'tests/fixtures/live-emphasis-prototype.js' });
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
  checks.incompletePairRevealsSource = await page.evaluate(() => !__preview.stats().visible && !CSS.highlights.has('aistudio-live-prototype'));
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
    block.textContent = '**한 줄에 들어갈 수 없는 길고 긴 강조 문장입니다** 다음';
    block.style.width = '70px';
  });
  await page.waitForTimeout(50);
  checks.multilineFallback = await page.evaluate(() => !__preview.stats().visible);
  await page.evaluate(() => {
    const block = document.getElementById('live');
    block.style.width = '';
    block.textContent = '**다시 강조** 다음';
  });
  await page.waitForTimeout(50);
  checks.rewriteRepaints = await page.evaluate(() => __preview.stats().visible);
  await page.evaluate(() => { document.getElementById('live').remove(); });
  await page.waitForTimeout(25);
  checks.disconnectedSourceClears = await page.evaluate(() => !__preview.stats().visible && !CSS.highlights.has('aistudio-live-prototype'));
  await page.evaluate(() => { __preview.stop(); });
  checks.cleanup = await page.evaluate(() => !document.querySelector('.aistudio-live-preview-layer') && !CSS.highlights.has('aistudio-live-prototype'));
  if (Object.values(checks).some(x => !x)) throw new Error(JSON.stringify(checks));
  return { checks, initial, timerSamples: streamed.length, timerP95Ms: streamed[18] };
}
