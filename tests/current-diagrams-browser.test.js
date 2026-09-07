async (page) => {
  const fs = require('node:fs');
  const fixtures = require('./fixtures/current-diagrams.cjs');
  const results = {};
  for (const fixture of fixtures) {
    await page.goto('https://aistudio.google.com/tests/fixtures/aistudio.html');
    await page.setContent('<article data-turn-role="model"><pre><code></code></pre></article><textarea aria-label="Prompt">untouched input</textarea><article data-turn-role="user"><pre><code></code></pre></article>');
    await page.evaluate(text => {
      document.querySelector('code').textContent = text;
      document.querySelector('[data-turn-role="user"] code').textContent = text;
      globalThis.originalDiagram = document.querySelector('code');
    }, fixture.source);
    await page.addScriptTag({ content: fs.readFileSync('aaa.user.js', 'utf8') });
    await page.waitForFunction(() => document.querySelector('.aistudio-ascii-tree-visual'));
    results[fixture.name] = await page.evaluate(({ source, layout }) => {
      const visual = document.querySelector('.aistudio-ascii-tree-visual');
      const rows = Array.from(visual.querySelectorAll('.aistudio-ascii-tree-row'));
      const points = rows.map(row => {
        const result = [];
        for (const run of row.querySelectorAll('[data-aistudio-ascii-cell]')) {
          const text = run.getAttribute('data-aistudio-ascii-cell');
          const style = getComputedStyle(run, '::before');
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          for (let i = 0; i < text.length; i++) {
            if (/[┌┐└┘├┤┬┴┼│]/.test(text[i])) result.push({ char: text[i], x: run.getBoundingClientRect().left + ctx.measureText(text.slice(0, i)).width });
          }
        }
        return result;
      });
      let drift = 0;
      let comparisons = 0;
      let opening;
      for (const row of points) {
        if (row.some(p => p.char === '┌')) opening = row;
        else if (opening && row.length === opening.length && row.length >= 2) {
          row.forEach((p, i) => { drift = Math.max(drift, Math.abs(p.x - opening[i].x)); comparisons++; });
        } else if (opening && row[0]?.char === '└' && row[row.length - 1]?.char === '┘') {
          drift = Math.max(drift, Math.abs(row[0].x - opening[0].x),
            Math.abs(row[row.length - 1].x - opening[opening.length - 1].x));
          comparisons += 2;
        }
      }
      const pre = document.querySelector('pre');
      // Geometry alone can pass after dropping a long label, formula or arrow.
      // Compare all non-layout characters against the complete original source.
      const visibleText = Array.from(visual.querySelectorAll('[data-aistudio-ascii-cell]'))
        .map(cell => cell.getAttribute('data-aistudio-ascii-cell')).join('');
      const semanticText = text => text.replace(/[\s┌┐└┘├┤┬┴┼│─]/g, '');
      const contentPreserved = semanticText(visibleText) === semanticText(source);
      pre.scrollLeft = pre.scrollWidth;
      const reachable = pre.scrollWidth <= pre.clientWidth + 1 ||
        (['auto', 'scroll'].includes(getComputedStyle(pre).overflowX) && pre.scrollLeft > 0);
      pre.scrollLeft = 0;
      return {
        correctLayout: visual.classList.contains(`aistudio-ascii-${layout}-grid`),
        sourcePreserved: document.querySelector('code') === originalDiagram && originalDiagram.textContent === source,
        inputPreserved: document.querySelector('textarea').value === 'untouched input',
        singleVisual: document.querySelectorAll('.aistudio-ascii-tree-visual').length === 1,
        userPreserved: document.querySelector('[data-turn-role="user"] code').textContent === source &&
          !document.querySelector('[data-turn-role="user"] .aistudio-ascii-tree-visual'),
        contentPreserved, comparisons, drift, reachable
      };
    }, fixture);
    await page.screenshot({ path: `output/playwright/current-${fixture.name}-${page.viewportSize().width}.png`, fullPage: true });
    const r = results[fixture.name];
    if (!r.correctLayout || !r.sourcePreserved || !r.contentPreserved || !r.inputPreserved || !r.userPreserved || !r.singleVisual || !r.reachable || r.comparisons < 2 || r.drift > 1) throw new Error(JSON.stringify({ fixture: fixture.name, ...r }));
  }
  return results;
}
