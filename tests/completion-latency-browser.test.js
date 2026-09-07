async (page) => {
  const fs = require('node:fs');
  const source = fs.readFileSync('aaa.user.js','utf8').replace('  function scan() {','  function scan() { globalThis.__latencyScans++;');
  await page.setContent('<main role="main"><ms-prompt-input><textarea></textarea><button class="run-button">Stop</button></ms-prompt-input><article data-turn-role="model"><ms-cmark-node id="answer"></ms-cmark-node></article></main>');
  await page.evaluate(()=>{
    globalThis.__latencyScans=0;
    // Simulate a busy application: idle work can wait 700ms, animation frames
    // remain available. This exposes stacked idle/stability scheduling delays.
    window.requestIdleCallback=cb=>setTimeout(()=>cb({didTimeout:true,timeRemaining:()=>0}),700);
    window.cancelIdleCallback=clearTimeout;
    const root=document.getElementById('answer');
    for(let i=0;i<48;i++){
      const p=document.createElement('p');p.id='p'+i;
      p.innerHTML='<ms-cmark-node>'+ '<!--native-->'.repeat(30)+'<span>매출원가 **핵심 계산 '+i+'**을 확인합니다.</span></ms-cmark-node>';
      root.append(p);
    }
  });
  await page.addScriptTag({path:'node_modules/katex/dist/katex.min.js'});
  await page.addScriptTag({content:source});
  await page.waitForFunction(()=>document.documentElement.getAttribute('data-aistudio-mobile-fix-generating')==='true');
  const streamingSafe=await page.locator('#answer strong').count()===0;
  await page.evaluate(()=>{
    globalThis.__start=performance.now();globalThis.__first=null;globalThis.__last=null;
    const root=document.getElementById('answer');
    const observer=new MutationObserver(()=>{
      const count=root.querySelectorAll('strong').length;
      if(count&&!__first)__first=performance.now()-__start;
      if(count===48){__last=performance.now()-__start;observer.disconnect();}
    });observer.observe(root,{childList:true,subtree:true});
    document.querySelector('.run-button').textContent='Run';
  });
  await page.waitForFunction(()=>__last!==null,null,{timeout:15000});
  const result=await page.evaluate(()=>({firstMs:Math.round(__first),all48Ms:Math.round(__last),scans:__latencyScans}));
  result.streamingSafe=streamingSafe;
  // A late native tail update must still be repaired without another Run.
  await page.evaluate(()=>{globalThis.__tailStart=performance.now();document.getElementById('p47').innerHTML='<ms-cmark-node><span>최종 **지연 도착 문장**입니다.</span></ms-cmark-node>';});
  await page.waitForFunction(()=>document.querySelector('#p47 strong')?.textContent==='지연 도착 문장');
  result.tailMs=await page.evaluate(()=>Math.round(performance.now()-__tailStart));
  if(!streamingSafe)throw new Error(JSON.stringify(result));
  if(!process.env.AISTUDIO_LATENCY_BASELINE && (result.all48Ms>1600||result.tailMs>1600))throw new Error(JSON.stringify(result));
  return result;
}
