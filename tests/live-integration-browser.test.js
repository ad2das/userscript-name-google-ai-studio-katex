async (page) => {
  const fs = require('node:fs');
  // Exercise the real boot adapter, without exporting or invoking private helpers.
  const source = fs.readFileSync('aaa.user.js', 'utf8');
  await page.setContent('<!doctype html><html><body><main><ms-prompt-input><textarea aria-label="Prompt"></textarea><button class="run-button">Run</button></ms-prompt-input><ms-chat-turn><div class="chat-turn-container user"><p>**사용자 원문** 끝</p></div></ms-chat-turn><ms-chat-turn><div id="response" class="chat-turn-container model"><p><ms-cmark-node><span>이전 내용</span><!--anchor--></ms-cmark-node></p></div></ms-chat-turn><ms-chat-turn class="thought-activity-host"><div class="chat-turn-container model"><p>**생각 영역** 끝</p></div></ms-chat-turn></main></body></html>');
  await page.addScriptTag({ content: source });
  const before = await page.evaluate(() => ({
    inactiveLayers: document.querySelectorAll('.aistudio-live-preview-layer').length,
    userSource: document.querySelector('.user').innerHTML,
    thoughtSource: document.querySelector('.thought-activity-host').innerHTML
  }));
  await page.evaluate(() => {
    const span = document.querySelector('#response span');
    globalThis.__retainedSource = span.firstChild;
    __retainedSource.nodeValue = '**실시간 강조** 끝';
    document.querySelector('button').textContent = 'Stop';
  });
  await page.waitForFunction(() => (CSS.highlights.get('aistudio-live-emphasis')?.size || 0) === 1);
  const checks = await page.evaluate((before) => ({
    inactiveUntilGeneration: before.inactiveLayers === 0,
    realBootAdapterPaints: document.querySelectorAll('.aistudio-live-preview-layer').length === 1,
    nativeSourceRetained: document.querySelector('#response span').firstChild === __retainedSource && __retainedSource.nodeValue === '**실시간 강조** 끝',
    userUnchanged: document.querySelector('.user').innerHTML === before.userSource,
    thoughtNotProjected: document.querySelector('.thought-activity-host').innerHTML === before.thoughtSource,
    noSourceRepairDuringGeneration: !document.querySelector('#response strong')
  }), before);
  await page.getByRole('textbox', { name: 'Prompt' }).fill('작성 중인 초안');
  await page.waitForFunction(() => !document.querySelector('.aistudio-live-preview-layer'));
  checks.inputProtected = await page.evaluate(() =>
    document.querySelector('textarea').value === '작성 중인 초안' && __retainedSource.nodeValue === '**실시간 강조** 끝');
  await page.waitForTimeout(1700);
  await page.evaluate(() => {
    document.querySelector('textarea').blur();
    __retainedSource.nodeValue = '**변경된 강조** 끝';
  });
  await page.waitForFunction(() => (CSS.highlights.get('aistudio-live-emphasis')?.size || 0) === 1);
  checks.resumesAfterInputIdle = await page.evaluate(() => !!document.querySelector('.aistudio-live-preview-layer'));
  await page.evaluate(() => { document.querySelector('button').textContent = 'Run'; });
  await page.waitForFunction(() => !!document.querySelector('#response strong') && !document.querySelector('.aistudio-live-preview-layer'));
  checks.completionReturnsToNativeDOM = await page.evaluate(() =>
    document.querySelector('#response').textContent === '변경된 강조 끝' &&
    document.querySelector('textarea').value === '작성 중인 초안');
  if (Object.values(checks).some(x=>!x)) throw new Error(JSON.stringify(checks));
  return { checks };
}
