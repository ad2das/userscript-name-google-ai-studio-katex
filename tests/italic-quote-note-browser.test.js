async (page) => {
  // Live 10lmcf (2026-11-02): `> *"… **손상차손(당기비용)**은 얼마인가?"*` in a blockquote.
  // cmark cannot close `)**은`, so the final `*` closes one star of that run.
  const fs = require('node:fs');
  const source = fs.readFileSync(process.env.AISTUDIO_SOURCE || 'aaa.user.js', 'utf8').replace(/\n  if \(document\.readyState === 'loading'\)/,
    '\n  globalThis.__note = { repairRoot, scan };\n  if (document.readyState === \'loading\')');
  await page.setContent('<!doctype html><html><body><main role="main"><ms-prompt-input><textarea></textarea><button class="run-button">Run</button></ms-prompt-input><article data-turn-role="model" tabindex="-1"><ms-cmark-node id="response"></ms-cmark-node></article><article data-turn-role="user" id="user"></article></main></body></html>');
  await page.addScriptTag({ path: 'node_modules/katex/dist/katex.min.js' });
  await page.addScriptTag({ content: source });
  const result = await page.evaluate(() => {
    const A = '<!--anchor-->';
    const tailOf = text => `<span style="font-style: italic;" class="ng-star-inserted"><ms-cmark-node>${A}<span class="ng-star-inserted">${text}</span>${A}</ms-cmark-node></span>`;
    const span = text => `<span class="ng-star-inserted">${text}</span>`;
    const br = '<br class="ng-star-inserted"><ms-cmark-node class="ng-star-inserted"><!----></ms-cmark-node>';
    const answer = span('➡️ 이때는 학습자님 생각대로 추가로 발생한 ') + A +
      `<strong class="ng-star-inserted"><ms-cmark-node>${A}${span('₩2,000')}${A}</ms-cmark-node></strong>` + A + span('이 정답입니다!');
    // Verbatim structure of the live block (Angular attributes and anchor counts trimmed).
    const q1 = '<ms-cmark-node>' + A + span('*"20×2년도에 인식할 **손상차손(당기비용)*') + A + tailOf('은 얼마인가?"') + A + br + A + answer + A + '</ms-cmark-node>';
    const quote = (() => {
      const bq = document.createElement('blockquote');
      bq.innerHTML = '<ms-cmark-node class="cmark-node"></ms-cmark-node>';
      document.getElementById('response').append(bq);
      return bq.firstElementChild;
    })();
    const make = (id, html, owner = quote) => {
      const p = document.createElement('p'); p.id = id;
      p.innerHTML = html.replaceAll(A, A.repeat(30)); owner.append(p); return p;
    };
    const allNodes = p => { const out = []; const w = document.createTreeWalker(p, NodeFilter.SHOW_ALL); while (w.nextNode()) out.push(w.currentNode); return out; };
    const checks = {};

    // 1. The live block.
    const p1 = make('q1', q1);
    const host1 = p1.firstElementChild;
    const tail1 = host1.querySelector('span[style]');
    const br1 = host1.querySelector('br');
    const strong1 = host1.querySelector('strong');
    const nodes1 = allNodes(p1);
    __note.repairRoot(p1);
    const once1 = p1.innerHTML;
    __note.repairRoot(p1);
    const em1 = host1.querySelector('em[data-aistudio-note-tail]');
    checks.q1Text = p1.textContent === '"20×2년도에 인식할 손상차손(당기비용)은 얼마인가?"➡️ 이때는 학습자님 생각대로 추가로 발생한 ₩2,000이 정답입니다!';
    checks.q1NoStars = !p1.textContent.includes('*');
    checks.q1Em = em1?.textContent === '"20×2년도에 인식할 손상차손(당기비용)';
    checks.q1Bold = em1?.querySelector('strong')?.textContent === '손상차손(당기비용)';
    checks.q1Italic = !!em1 && getComputedStyle(em1).fontStyle === 'italic';
    checks.q1Weight = !!em1?.querySelector('strong') && Number(getComputedStyle(em1.querySelector('strong')).fontWeight) >= 600;
    checks.q1Identity = nodes1.every(n => n.isConnected) && em1?.nextElementSibling === tail1 &&
      host1.contains(br1) && host1.querySelector('strong:not(.aistudio-md-repaired)') === strong1 &&
      tail1.textContent === '은 얼마인가?"';
    checks.q1Idempotent = once1 === p1.innerHTML;

    // 2. Curly quotes.
    const p2 = make('q2', '<ms-cmark-node>' + A + span('*“기말에 인식할 **이자수익(유효이자)*') + A + tailOf('은 얼마인가?”') + A + '</ms-cmark-node>');
    __note.repairRoot(p2);
    checks.q2Curly = p2.textContent === '“기말에 인식할 이자수익(유효이자)은 얼마인가?”' &&
      p2.querySelector('em[data-aistudio-note-tail] strong')?.textContent === '이자수익(유효이자)';

    // 3. Two quoted notes on separate lines of one paragraph.
    const p3 = make('q3', '<ms-cmark-node>' + A + span('*"첫째 **취득원가(공정가치)*') + A + tailOf('는 얼마인가?"') + A + br + A +
      span('➡️ 답 하나') + A + br + A + span('*"둘째 **처분손익(당기손익)*') + A + tailOf('은 얼마인가?"') + A + '</ms-cmark-node>');
    __note.repairRoot(p3);
    const ems3 = Array.from(p3.querySelectorAll('em[data-aistudio-note-tail]'));
    checks.q3Both = ems3.length === 2 && !p3.textContent.includes('*') &&
      ems3.map(em => em.querySelector('strong')?.textContent).join('|') === '취득원가(공정가치)|처분손익(당기손익)' &&
      p3.querySelectorAll('br').length === 2;

    // 4. The existing paren note may also end at a line break now.
    const p4 = make('q4', '<ms-cmark-node>' + A + span('*(※ 원문 수치 대신, **"원가에 25%의 이익을 가산하였다."*') + A + tailOf('라고 가정한 추가 비교입니다.)') + A + br + A + span('다음 줄.') + A + '</ms-cmark-node>');
    __note.repairRoot(p4);
    checks.q4ParenBeforeBreak = p4.querySelector('em[data-aistudio-note-tail] strong')?.textContent === '"원가에 25%의 이익을 가산하였다."' &&
      p4.textContent === '(※ 원문 수치 대신, "원가에 25%의 이익을 가산하였다."라고 가정한 추가 비교입니다.)다음 줄.';

    // 5. Shapes that must stay untouched.
    // W-R4C4: quotes are ordinary text, so their variants repair; text that
    // follows the native tail stays outside the em instead of blocking it.
    const repairedVariants = {
      noQuote: q1.replace('*"20×2', '*20×2'),
      unclosedQuote: q1.replace('은 얼마인가?"', '은 얼마인가?'),
      mismatchedQuote: q1.replace('*"20×2', '*“20×2'),
      trailingText: '<ms-cmark-node>' + A + span('*"20×2년도에 인식할 **손상차손(당기비용)*') + A + tailOf('은 얼마인가?"') + A + span(' 라고 물었다.') + A + '</ms-cmark-node>'
    };
    checks.variantsRepaired = Object.entries(repairedVariants).every(([id, html]) => {
      const node = make('ok-' + id, html);
      const tailNode = node.querySelector('span[style]');
      __note.repairRoot(node);
      const em = node.querySelector('em[data-aistudio-note-tail]');
      const once = node.innerHTML;
      __note.repairRoot(node);
      return !!em?.querySelector('strong') &&
        em.querySelector('strong').textContent === '손상차손(당기비용)' &&
        em.nextElementSibling === tailNode &&
        !node.textContent.includes('*') &&
        once === node.innerHTML;
    });
    checks.trailingTextOutside = (() => {
      const node = document.getElementById('ok-trailingText');
      const tailNode = node.querySelector('span[style]');
      const em = node.querySelector('em[data-aistudio-note-tail]');
      return !!em && em.nextElementSibling === tailNode && tailNode.nextElementSibling?.textContent === ' 라고 물었다.';
    })();
    const invalid = {
      starInTail: q1.replace('은 얼마인가?"', '은 *얼마인가?"'),
      twoBoldRuns: q1.replace('인식할 **손상차손', '인식할 **기말** **손상차손'),
      notItalicTail: q1.replace('style="font-style: italic;" ', ''),
      interactiveTail: q1.replace('<span class="ng-star-inserted">은', '<span role="button" class="ng-star-inserted">은'),
      spaceAfterStar: q1.replace('*"20×2', '* "20×2'),
      inCode: '<code>' + q1 + '</code>',
      inLink: '<a>' + q1 + '</a>'
    };
    checks.excluded = Object.entries(invalid).filter(([id, html]) => {
      const bad = make('bad-' + id, html);
      const before = bad.innerHTML;
      __note.repairRoot(bad);
      // `**기말**` is a valid bold pair that the ordinary bold repair may fix.
      if (id === 'twoBoldRuns') return !!bad.querySelector('em[data-aistudio-note-tail]') || bad.textContent.includes('당기비용)은');
      return bad.innerHTML !== before;
    }).map(([id]) => id);
    checks.excludedOk = checks.excluded.length === 0;
    const user = make('user-q', q1, document.getElementById('user'));
    const userBefore = user.innerHTML;
    __note.repairRoot(user);
    checks.user = user.innerHTML === userBefore;

    // 6. A native rewrite of the tail restores the original order.
    tail1.querySelector('span').textContent = '새 일반 문장';
    __note.repairRoot(p1);
    checks.q1Cleanup = !host1.querySelector('em[data-aistudio-note-tail]') && p1.textContent.includes('새 일반 문장');

    // 8. W-R4L: the two live chat A shapes the stolen-star rule declined.
    //    (a) the lead is only the opening quote: `*"**B*` + italic tail;
    //    (b) the native italic tail carries its own native bold.
    const boldTailOf = (text, bold) => '<span style="font-style: italic;" class="ng-star-inserted"><ms-cmark-node>' + A +
      '<span class="ng-star-inserted">' + text + '</span>' +
      '<strong class="ng-star-inserted"><ms-cmark-node>' + bold + '</ms-cmark-node></strong>' +
      '</ms-cmark-node></span>';
    // (a) quote-only lead, made-up accounting-style text, inline-code inside B.
    const qLeadQuote = '<ms-cmark-node>' + A + span('*"**가나다(구매자)*') + A +
      boldTailOf('은 개설 비용 ', '₩12,000') + A + '</ms-cmark-node>';
    const qLeadQuoteNode = make('l1', qLeadQuote);
    const l1Tail = qLeadQuoteNode.querySelector('span[style]');
    __note.repairRoot(qLeadQuoteNode);
    const l1Em = qLeadQuoteNode.querySelector('em[data-aistudio-note-tail]');
    checks.l1Text = qLeadQuoteNode.textContent === '"가나다(구매자)은 개설 비용 ₩12,000';
    checks.l1NoStars = !qLeadQuoteNode.textContent.includes('*');
    checks.l1Em = l1Em?.textContent === '"가나다(구매자)';
    checks.l1Bold = l1Em?.querySelector('strong')?.textContent === '가나다(구매자)';
    checks.l1TailKept = !!l1Em && l1Em.nextElementSibling === l1Tail &&
      l1Tail.querySelector('strong')?.textContent === '₩12,000';
    checks.l1Italic = !!l1Em && getComputedStyle(l1Em).fontStyle === 'italic';

    // (b) lead carries text, one inline-code atom sits inside B, the tail holds a
    //     native strong that spans an inline-code atom too.
    const qBoldTail = '<ms-cmark-node>' + A + span('*"기말 현재의 **예상 금액은 ') + A +
      '<span class="inline-code ng-star-inserted">₩180,000</span>' + A + span('*') + A +
      '<span style="font-style: italic;" class="ng-star-inserted"><ms-cmark-node>' + A +
      '<span class="ng-star-inserted">이고, 이 중 </span>' +
      '<strong class="ng-star-inserted"><ms-cmark-node><span class="ng-star-inserted">60%(</span>' +
      '<span class="inline-code ng-star-inserted">= ₩108,000</span>' +
      '<span class="ng-star-inserted">)를 보증</span></ms-cmark-node></strong>' +
      '<span class="ng-star-inserted">한다."</span></ms-cmark-node></span>' + A + '</ms-cmark-node>';
    const qBoldTailNode = make('l2', qBoldTail);
    const l2Tail = qBoldTailNode.querySelectorAll('span[style]')[0];
    __note.repairRoot(qBoldTailNode);
    const l2Em = qBoldTailNode.querySelector('em[data-aistudio-note-tail]');
    checks.l2Text = qBoldTailNode.textContent === '"기말 현재의 예상 금액은 ₩180,000이고, 이 중 60%(= ₩108,000)를 보증한다."';
    checks.l2NoStars = !qBoldTailNode.textContent.includes('*');
    checks.l2Bold = l2Em?.querySelector('strong')?.textContent === '예상 금액은 ₩180,000';
    checks.l2Em = l2Em?.textContent === '"기말 현재의 예상 금액은 ₩180,000';
    checks.l2TailKept = !!l2Em && l2Em.nextElementSibling === l2Tail &&
      l2Tail.querySelector('strong')?.textContent === '60%(= ₩108,000)를 보증';

    // MUST-stay for (a): the quote lead may only be one or two opening quotes.
    const leadMisfires = {
      // an ASCII apostrophe is never a quote for this rule
      apostropheLead: qLeadQuote.replace('*"**', "*'**"),
      // three opening marks are not a quote lead
      tripleLead: qLeadQuote.replace('*"**', '*"“‘**'),
      // the quote lead with a non-italic tail is unchanged
      quoteNoItalic: qLeadQuote.replace('style="font-style: italic;" ', '')
    };
    checks.leadMisfires = Object.entries(leadMisfires).filter(([mid, html]) => {
      const node = make('lm-' + mid, html);
      const before = node.innerHTML;
      __note.repairRoot(node);
      return node.innerHTML !== before;
    }).map(([mid]) => mid);
    checks.leadMisfiresOk = checks.leadMisfires.length === 0;

    // MUST-stay for (b): a tail whose bold contains a control or a link, and a tail
    // that is not italic at all.
    const tailMisfires = {
      strongWithControl: qBoldTail.replace('<strong class="ng-star-inserted"><ms-cmark-node>',
        '<strong class="ng-star-inserted" role="button"><ms-cmark-node>'),
      linkInTail: qBoldTail.replace('<span class="ng-star-inserted">한다."</span>',
        '<a href="https://example.com/"><span class="ng-star-inserted">한다."</span></a>'),
      boldTailNoItalic: qBoldTail.replace('style="font-style: italic;" ', '')
    };
    checks.tailMisfires = Object.entries(tailMisfires).filter(([mid, html]) => {
      const node = make('tm-' + mid, html);
      const before = node.innerHTML;
      __note.repairRoot(node);
      return node.innerHTML !== before;
    }).map(([mid]) => mid);
    checks.tailMisfiresOk = checks.tailMisfires.length === 0;

    // Both repairs are idempotent: a second pass changes nothing.
    const l1Once = qLeadQuoteNode.innerHTML, l2Once = qBoldTailNode.innerHTML;
    __note.repairRoot(qLeadQuoteNode);
    __note.repairRoot(qBoldTailNode);
    checks.l1Idempotent = l1Once === qLeadQuoteNode.innerHTML;
    checks.l2Idempotent = l2Once === qBoldTailNode.innerHTML;
    return { checks };
  });

  // 7. End to end: a new block reaches the repair through the scheduler alone.
  await page.waitForTimeout(2800);
  const started = Date.now();
  await page.evaluate(() => {
    const A = '<!--anchor-->'.repeat(30);
    const bq = document.createElement('blockquote');
    bq.innerHTML = '<ms-cmark-node class="cmark-node"><p id="e2e"><ms-cmark-node>' + A +
      '<span>*"20×2년도에 인식할 **손상차손(당기비용)*</span>' + A +
      '<span style="font-style: italic;"><ms-cmark-node><span>은 얼마인가?"</span></ms-cmark-node></span>' + A +
      '<br><ms-cmark-node></ms-cmark-node><span>➡️ 답.</span></ms-cmark-node></p></ms-cmark-node>';
    document.getElementById('response').append(bq);
  });
  try {
    await page.waitForFunction(() => !!document.querySelector('#e2e em[data-aistudio-note-tail] strong'), null, { timeout: 4000 });
    result.checks.e2eMs = Date.now() - started;
    result.checks.e2e = !(await page.locator('#e2e').evaluate(n => n.textContent.includes('*')));
  } catch (error) {
    result.checks.e2e = false;
  }
  const failed = Object.entries(result.checks).filter(([key, ok]) => ok === false).map(([key]) => key);
  if (failed.length) throw new Error(JSON.stringify({ failed, result }));
  return result;
}
