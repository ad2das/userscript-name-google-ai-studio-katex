async (page) => {
  const fs = require('node:fs');
  const source = fs.readFileSync('aaa.user.js', 'utf8')
    .replace('const ENABLE_SAFE_OUTPUT_REPAIR = true;', 'const ENABLE_SAFE_OUTPUT_REPAIR = false;')
    .replace(/\n  if \(document\.readyState === 'loading'\)/,
      '\n  globalThis.__createController = createLiveEmphasisController;\n  if (document.readyState === \'loading\')');
  await page.setContent('<html><body><ms-prompt-input id="composer"></ms-prompt-input><article id="model"><p>**원문 보존** 끝</p></article></body></html>');
  await page.evaluate(() => {
    const composer = document.getElementById('composer');
    for (let i = 0; i < 1500; i++) {
      const span = document.createElement('span');
      span.textContent = '입력 상태';
      composer.append(span);
    }
  });
  await page.addScriptTag({content:source});
  await page.evaluate(() => {
    globalThis.__typingController = __createController({getRoot:()=>document.getElementById('model'),parse:()=>[],active:()=>false,typing:()=>true});
    globalThis.__originalClosest = Element.prototype.closest;
    globalThis.__closestCalls = 0;
    Element.prototype.closest = function (...args) { __closestCalls++; return __originalClosest.apply(this,args); };
    globalThis.__batchStart = performance.now();
    for (const span of document.querySelectorAll('#composer span')) span.firstChild.nodeValue += ' 변경';
  });
  await page.waitForTimeout(50);
  const result = await page.evaluate(() => {
    const result = { records:1500, closestCalls:__closestCalls,
      sourceUnchanged:document.querySelector('#model p').textContent==='**원문 보존** 끝' };
    Element.prototype.closest = __originalClosest;
    __typingController.stop();
    return result;
  });
  if (result.closestCalls > 20 || !result.sourceUnchanged) throw new Error(JSON.stringify(result));
  // Exercise the installed configuration too: the earlier isolated controller
  // check deliberately disables the main output observer and cannot catch it.
  await page.setContent('<main role="main"><ms-prompt-input><textarea id="input"></textarea><button class="run-button">Run</button><div id="noise"></div></ms-prompt-input><article data-turn-role="model"><ms-cmark-node><p id="late">Original</p></ms-cmark-node></article></main>');
  await page.evaluate(() => {
    const noise = document.getElementById('noise');
    for (let i=0;i<1500;i++) { const span=document.createElement('span'); span.textContent='입력 상태'; noise.append(span); }
  });
  const installedSource = process.env.AISTUDIO_TYPING_BASELINE
    ? require('node:child_process').execFileSync('git',['show','77aeea5:aaa.user.js'],{encoding:'utf8'})
    : fs.readFileSync('aaa.user.js','utf8');
  const composerSource = installedSource.replace(/\n  if \(document\.readyState === 'loading'\)/,
    '\n  globalThis.__typingAudit = { scan, repairRoot };\n  if (document.readyState === \'loading\')');
  await page.addScriptTag({content:installedSource});
  await page.locator('#input').focus();
  const enabled = await page.evaluate(async () => {
    const original=Element.prototype.closest;
    let calls=0;
    Element.prototype.closest=function(...args){calls++;return original.apply(this,args);};
    const input=document.getElementById('input');
    input.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,inputType:'insertText',data:'가'}));
    const started=performance.now();
    for(const span of document.querySelectorAll('#noise span')) span.firstChild.nodeValue+=' 변경';
    document.getElementById('late').textContent='최종 **지연 문장**';
    await new Promise(resolve=>setTimeout(resolve,0));
    const observation={closestCalls:calls,taskMs:Math.round(performance.now()-started),deferred:!document.querySelector('#late strong')};
    Element.prototype.closest=original;
    return observation;
  });
  result.enabled=enabled;
  if((!process.env.AISTUDIO_TYPING_BASELINE && enabled.closestCalls>30) || !enabled.deferred)throw new Error(JSON.stringify(result));
  await page.locator('#input').blur();
  await page.waitForFunction(()=>document.querySelector('#late strong')?.textContent==='지연 문장',null,{timeout:12000});
  result.lateRewriteRepaired=true;
  // The live composer host is now ms-prompt-box; the whole composer must stay
  // opaque to scans and cleanup, including attachment chips with images.
  await page.setContent('<main role="main"><ms-prompt-box id="box"><div class="textarea-row"><textarea id="box-input"></textarea></div><div class="attachment-chip"><img id="chip-img" alt="첨부" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="></div><p id="box-hint">**첨부 대기**</p></ms-prompt-box><article data-turn-role="model"><ms-cmark-node><p id="box-late">**모델 문단 복구**</p></ms-cmark-node></article></main>');
  await page.addScriptTag({ content: composerSource });
  await page.waitForFunction(() => document.querySelector('#box-late strong')?.textContent === '모델 문단 복구', null, { timeout: 12000 });
  result.composer = await page.evaluate(() => {
    const box = document.getElementById('box');
    const chip = box.querySelector('.attachment-chip');
    const img = document.getElementById('chip-img');
    chip.classList.add('uploading');
    const extra = document.createElement('span');
    extra.textContent = '업로드 중';
    chip.append(extra);
    const before = box.innerHTML;
    window.__typingAudit.scan();
    return {
      composerUntouched: box.innerHTML === before,
      chipImageSame: document.getElementById('chip-img') === img,
      noArtifactsInComposer: !box.querySelector('[data-aistudio-repair-root], .aistudio-md-repaired, .aistudio-amount-token, .aistudio-won-symbol'),
      composerNotRepairRoot: !box.hasAttribute('data-aistudio-repair-root')
    };
  });
  if (!process.env.AISTUDIO_TYPING_BASELINE && Object.values(result.composer).some((x) => !x)) {
    throw new Error('composer opacity regression: ' + JSON.stringify(result.composer));
  }
  return result;
}
