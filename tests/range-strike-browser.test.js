async (page) => {
  const fs = require('node:fs');
  const source = fs.readFileSync('aaa.user.js', 'utf8').replace(/\n  if \(document\.readyState === 'loading'\)/,
    '\n  globalThis.__range = { repairRoot };\n  if (document.readyState === \'loading\')');
  await page.setContent('<main role="main"><ms-prompt-input><textarea></textarea><button class="run-button">Run</button></ms-prompt-input><article data-turn-role="model" tabindex="-1"><ms-cmark-node id="response"></ms-cmark-node></article></main>');
  await page.addScriptTag({ path: 'node_modules/katex/dist/katex.min.js' });
  await page.addScriptTag({ content: source });
  const result = await page.evaluate(() => {
    const make = (id, html) => {
      const p = document.createElement('p');
      p.id = id;
      p.innerHTML = html.replaceAll('<!--anchor-->', '<!--anchor-->'.repeat(30));
      document.getElementById('response').append(p);
      return p;
    };
    const cases = [
      ['a', '<ms-cmark-node><!--anchor--><span>올려주신 교재의 앞부분인 **제16장 리스 — 제3절 리스이용자의 회계처리(PDF 11</span><s><!--anchor--><ms-cmark-node><span>15쪽, 교재 639</span></ms-cmark-node></s><span>643쪽)**부터 바로 설명을 시작하겠습니다. </span><span style="font-style: italic;"><ms-cmark-node><span>(혹시 뒷부분인 제17장 법인세회계의 제3절을 먼저 보시려는 것이었다면 말씀해 주세요!)</span></ms-cmark-node></span></ms-cmark-node>',
        '(PDF 11~15쪽, 교재 639~643쪽)', '제16장'],
      ['b', '<ms-cmark-node><!--anchor--><span>이번 시간에는 **심화 (1) 리스채권 손상차손부터 (5) 판매형리스까지(교재 644</span><s><ms-cmark-node><span>652쪽 상단, [예제 16-7]</span></ms-cmark-node></s><span>[예제 16-10])**를 완벽하게 정리하겠습니다.</span></ms-cmark-node>',
        '(교재 644~652쪽 상단, [예제 16-7]~[예제 16-10])', '심화 (1)'],
      ['c', '<ms-cmark-node><!--anchor--><span>이제 계산 문제와 이론 문제가 가장 풍성하게 출제되는 **제4절 거래가격 산정 (교재 474</span><s><ms-cmark-node><span>481페이지 / PDF 6</span></ms-cmark-node></s><span>13p)**을 집중 강의하겠습니다.</span></ms-cmark-node>',
        '(교재 474~481페이지 / PDF 6~13p)', '제4절']
    ];
    const checks = {};
    for (const [id, html, range, boldStart] of cases) {
      const p = make(id, html);
      __range.repairRoot(p);
      const strike = p.querySelector('s');
      const strong = p.querySelector('strong.aistudio-md-repaired');
      checks[id + 'Text'] = p.textContent.includes(range);
      checks[id + 'Class'] = !!strike && strike.classList.contains('aistudio-page-range-repaired');
      checks[id + 'Tilde'] = p.textContent.includes('~') &&
        Array.from(p.querySelectorAll('strong.aistudio-md-repaired'))
          .map(strong => strong.textContent).join('').includes('~');
      checks[id + 'NoLine'] = !!strike && getComputedStyle(strike).textDecorationLine === 'none';
      checks[id + 'Bold'] = !!strong && strong.textContent.startsWith(boldStart) &&
        Array.from(p.querySelectorAll('strong.aistudio-md-repaired'))
          .map(strong => strong.textContent).join('').includes(range);
    }
    const bad = [
      ['neg-amount', '<ms-cmark-node><span>가격은 </span><s><ms-cmark-node><span>10,000원</span></ms-cmark-node></s><span> 8,000원입니다</span></ms-cmark-node>'],
      ['neg-deleted', '<ms-cmark-node><span>다음 문장은 </span><s><ms-cmark-node><span>삭제된 문장</span></ms-cmark-node></s><span> 입니다</span></ms-cmark-node>'],
      ['neg-version', '<ms-cmark-node><span>버전 </span><s><ms-cmark-node><span>3</span></ms-cmark-node></s><span>은 폐기되었습니다</span></ms-cmark-node>'],
      ['neg-decreasing', '<ms-cmark-node><span>A 12</span><s><ms-cmark-node><span>10 삭제</span></ms-cmark-node></s><span>5 끝</span></ms-cmark-node>']
    ];
    checks.negatives = bad.every(([id, html]) => {
      const p = make(id, html);
      const before = p.innerHTML;
      __range.repairRoot(p);
      return p.innerHTML === before && !p.querySelector('.aistudio-page-range-repaired');
    });
    const paired = make('g',
      '<ms-cmark-node><!--anchor--><span>좋습니다! 리스제공자의 금융리스에 이어, 오늘은 제2절의 마지막 퍼즐인 **[리스제공자의 운용리스(교재 637</span><s><ms-cmark-node><span>638쪽)]**를 마무리하고, 시험에서 가장 출제 비중이 높은 **제3절 [리스이용자의 회계처리(교재 639</span></ms-cmark-node></s><span>641쪽)]**로 힘차게 넘어가겠습니다.</span></ms-cmark-node>');
    __range.repairRoot(paired);
    const pairedStrike = paired.querySelector('s');
    const pairedBold = Array.from(paired.querySelectorAll('strong.aistudio-md-repaired'))
      .map(strong => strong.textContent).join('');
    checks.gText = paired.textContent.includes('637~638쪽') &&
      paired.textContent.includes('639~641쪽') && !paired.textContent.includes('**');
    checks.gNoLine = !!pairedStrike &&
      pairedStrike.classList.contains('aistudio-page-range-repaired') &&
      getComputedStyle(pairedStrike).textDecorationLine === 'none';
    checks.gBold = pairedBold.includes('[리스제공자의 운용리스(교재 637~638쪽)]') &&
      pairedBold.includes('제3절 [리스이용자의 회계처리(교재 639~641쪽)]');
    return { checks };
  });
  if (Object.values(result.checks).some(ok => !ok)) throw new Error(JSON.stringify(result));
  return result;
}
