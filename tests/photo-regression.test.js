async (page) => {
  const fs = require('node:fs');
  const source = fs.readFileSync('aaa.user.js', 'utf8').replace(/\n  if \(document\.readyState === 'loading'\)/,
    '\n  globalThis.__photo = { repairRoot };\n  if (document.readyState === \'loading\')');
  const variants = {
    plain: `주석은 실무적으로 적용 가능한 한 **'체계적인 방법'**으로 표시하며, 이해가능성과 비교가능성을 고려합니다.`,
    doubleQuote: `주석은 실무적으로 적용 가능한 한 **"체계적인 방법"**으로 표시합니다.`,
    nativeWhole: `<strong>주석은 실무적으로 적용 가능한 한 **'체계적인 방법'**으로 표시합니다.</strong>`,
    nativeInner: `주석은 실무적으로 적용 가능한 한 **<strong>'체계적인 방법'</strong>**으로 표시합니다.`,
    nativePartial: `주석은 실무적으로 적용 가능한 한 **'<strong>체계적인</strong> 방법'**으로 표시합니다.`,
    nestedNative: `<strong>주석은 실무적으로 적용 가능한 한 **'<b>체계적인</b> 방법'**으로 표시합니다.</strong>`,
    splitSpans: `주석은 실무적으로 적용 가능한 한 <span>*</span><span>*'체계적인 방법'*</span><span>*</span>으로 표시합니다.`,
    protectedLink: `**'<a href="#">체계적인</a> 방법'**`,
    protectedCode: `**'<code>체계적인</code> 방법'**`,
    protectedEditor: `**'<span contenteditable="plaintext-only">체계적인</span> 방법'**`,
    protectedNestedLink: `<a href="#"><strong>**'체계적인 방법'**</strong></a>`,
    protectedNestedCode: `<code><strong>**'체계적인 방법'**</strong></code>`,
    protectedNestedUser: `<strong><span data-turn-role="user">**'체계적인 방법'**</span></strong>`
  };
  await page.setContent('<main><ms-prompt-input><button class="run-button">Run</button></ms-prompt-input><article data-turn-role="model" id="response"></article></main>');
  await page.evaluate((variants) => {
    for (const [id, html] of Object.entries(variants)) {
      const p = document.createElement('p');
      p.id = id;
      p.innerHTML = html;
      document.getElementById('response').append(p);
    }
    window.__protected = Object.fromEntries(Array.from(document.querySelectorAll('[id^="protected"]')).map((p) => [p.id, p.innerHTML]));
    window.__nativeNodes = Array.from(document.querySelectorAll('strong, b'));
  }, variants);
  await page.addScriptTag({ content: source });
  await page.waitForTimeout(3500);
  const result = await page.evaluate(() => ({
    cases: Object.fromEntries(Array.from(document.querySelectorAll('#response > p')).map((p) => [p.id, {
      repaired: !p.textContent.includes('**'), text: p.textContent, html: p.innerHTML
    }])),
    protectedPreserved: Object.entries(__protected).every(([id, html]) => document.getElementById(id).innerHTML === html),
    nativeIdentity: __nativeNodes.every((node) => node.isConnected)
  }));
  result.idempotent = await page.evaluate(() => {
    const response = document.getElementById('response');
    const before = response.innerHTML;
    __photo.repairRoot(response);
    __photo.repairRoot(response);
    return response.innerHTML === before;
  });
  console.log(JSON.stringify(result));
  fs.mkdirSync('output/playwright', { recursive: true });
  await page.screenshot({ path: `output/playwright/photo-${page.viewportSize().width}.png`, fullPage: true });
  if (!process.env.AISTUDIO_AUDIT_BASELINE && (!result.idempotent || !result.protectedPreserved || !result.nativeIdentity ||
      Object.entries(result.cases).some(([id, value]) => !id.startsWith('protected') && !value.repaired))) {
    throw new Error('Photo regression: ' + JSON.stringify(result));
  }
  return result;
}
