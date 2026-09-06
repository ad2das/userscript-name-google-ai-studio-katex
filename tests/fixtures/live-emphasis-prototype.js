// Experimental, fixture-only. Not loaded by the userscript or published UI.
// Deliberately declines heterogeneous, protected, and oversized text.
globalThis.createLiveEmphasisPrototype = function (block, parse, shared = null) {
  const key = 'aistudio-live-prototype';
  let layer = null;
  let frame = 0;
  let stopped = false;
  let paints = 0;
  let lastLatency = null;
  let dirtyAt = performance.now();
  let ownedRanges = [];
  const style = shared ? null : document.createElement('style');
  if (style) {
    style.textContent = `::highlight(${key}) { color: transparent; text-shadow: none; }`;
    document.head.append(style);
  }
  const supported = !!(globalThis.Highlight && CSS.highlights &&
    CSS.supports('selector(::highlight(aistudio-live-prototype))'));
  function clear() {
    if (shared) ownedRanges.forEach(range => shared.highlight.delete(range));
    else CSS.highlights?.delete(key);
    ownedRanges = [];
    layer?.remove();
    layer = null;
  }
  function rangeAt(records, start, end) {
    const first = records.find(r => start >= r.start && start < r.end);
    const last = records.find(r => end > r.start && end <= r.end);
    if (!first || !last) return null;
    const range = document.createRange();
    range.setStart(first.node, start - first.start);
    range.setEnd(last.node, end - last.start);
    return range;
  }
  function geometryAllowed(rect) {
    if (window.visualViewport && window.visualViewport.scale !== 1) return false;
    for (let element = block; element; element = element.parentElement) {
      const style = getComputedStyle(element);
      if (style.visibility !== 'visible' || Number(style.opacity) !== 1 ||
          style.transform !== 'none' || style.filter !== 'none' ||
          style.writingMode !== 'horizontal-tb' || !['normal', '1'].includes(style.zoom)) return false;
      const bounds = element.getBoundingClientRect();
      if (/(hidden|clip|scroll|auto)/.test(style.overflowX) &&
          (rect.left < bounds.left + element.clientLeft ||
           rect.right > bounds.left + element.clientLeft + element.clientWidth)) return false;
      if (/(hidden|clip|scroll|auto)/.test(style.overflowY) &&
          (rect.top < bounds.top + element.clientTop ||
           rect.bottom > bounds.top + element.clientTop + element.clientHeight)) return false;
    }
    // A body-level layer must never float above a dialog covering the source.
    const y = (rect.top + rect.bottom) / 2;
    return [rect.left + 1, (rect.left + rect.right) / 2, rect.right - 1]
      .every(x => block.contains(document.elementFromPoint(x, y)));
  }
  function lineRuns(records, match) {
    const lines = [];
    let offset = match.start;
    for (const char of match.raw) {
      const glyph = rangeAt(records, offset, offset + char.length);
      if (!glyph) return [];
      const rect = glyph.getBoundingClientRect();
      let line = lines[lines.length - 1];
      if (!line || Math.abs(line.top - rect.top) > 1) {
        line = { top: rect.top, bottom: rect.bottom, left: rect.left,
          right: rect.right, text: '', contentLeft: null };
        lines.push(line);
      }
      if (Math.abs(line.bottom - rect.bottom) > 1) return [];
      line.right = Math.max(line.right, rect.right);
      if (offset >= match.start + 2 && offset < match.end - 2 && rect.width > 0) {
        if (line.contentLeft === null) line.contentLeft = rect.left;
        line.text += char;
      }
      offset += char.length;
    }
    return lines;
  }
  function render() {
    frame = 0;
    clear();
    if (stopped || !supported || !block.isConnected || document.hidden) return;
    const blockBounds = block.getBoundingClientRect();
    if (blockBounds.bottom <= 0 || blockBounds.top >= innerHeight ||
        blockBounds.right <= 0 || blockBounds.left >= innerWidth) return;
    if (!getSelection().isCollapsed || block.querySelector(':not(span, ms-cmark-node, strong, b)') ||
        block.closest('[contenteditable], [role="textbox"], [data-turn-role="user"], pre, code') ||
        block.querySelector('[contenteditable], [role], [tabindex], [hidden], .inline-code, [aria-hidden="true"]')) return;
    const text = block.textContent;
    if (text.length > 512 || /[`$\\\n\uFFFC]/.test(text)) return;
    const records = [];
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let offset = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (records.length >= 32) return;
      records.push({ node, start: offset, end: offset + node.length });
      offset += node.length;
    }
    const signature = s => [s.fontFamily, s.fontSize, s.fontWeight, s.fontStyle,
      s.color, s.letterSpacing, s.wordSpacing, s.textTransform, s.direction].join('|');
    const mask = [];
    const candidate = document.createElement('div');
    candidate.className = shared ? 'aistudio-live-preview-block' : 'aistudio-live-preview-layer';
    candidate.setAttribute('aria-hidden', 'true');
    candidate.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1;';
    for (const match of parse(text).slice(0, 12)) {
      if (match.marker !== '**' || match.children.length || match.openingTrim ||
          match.end === text.length || /[*_]/.test(match.inner)) continue;
      const matchedRecords = records.filter(r => r.start < match.end && r.end > match.start);
      const base = getComputedStyle(matchedRecords[0].node.parentElement);
      // AI Studio's paragraph font can differ from its inline renderer font.
      // Existing native emphasis outside this interval is not a reason to skip.
      if (base.direction !== 'ltr' || base.textTransform !== 'none' ||
          Number(base.fontWeight) >= 600 || base.fontStyle !== 'normal' ||
          !['normal', '0px'].includes(base.letterSpacing) ||
          !['normal', '0px'].includes(base.wordSpacing) ||
          matchedRecords.some(r => signature(getComputedStyle(r.node.parentElement)) !== signature(base))) continue;
      const range = rangeAt(records, match.start, match.end);
      const inner = rangeAt(records, match.start + 2, match.end - 2);
      if (!range || !inner || range.toString() !== match.raw) continue;
      // Complex shaping needs a richer source map; never split its clusters.
      if (/[\p{Mark}\u200c-\u200f\u202a-\u202e\u2066-\u2069]/u.test(match.inner)) continue;
      const lines = lineRuns(records, match);
      if (!lines.length || lines.length > 20) continue;
      const canvases = [];
      let valid = true;
      for (const line of lines) {
      const rect = { ...line, height: line.bottom - line.top };
      if (rect.top < 0 || rect.bottom > innerHeight || rect.left < 0 || rect.right > innerWidth ||
          !geometryAllowed(rect)) { valid = false; break; }
      if (!line.text.trim()) continue;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const font = `600 ${base.fontSize} ${base.fontFamily}`;
      ctx.font = font;
      const metrics = ctx.measureText(line.text);
      const ascent = metrics.fontBoundingBoxAscent;
      const descent = metrics.fontBoundingBoxDescent;
      // Do not squeeze true bold or cover the adjacent native suffix.
      if (!Number.isFinite(ascent) || !Number.isFinite(descent) ||
          metrics.width > rect.right - line.contentLeft + 0.1 ||
          ascent + descent > rect.height + 2) { valid = false; break; }
      const width = Math.ceil(metrics.width + 2);
      const height = Math.ceil(rect.height + 2);
      const scale = devicePixelRatio;
      canvas.width = Math.ceil(width * scale);
      canvas.height = Math.ceil(height * scale);
      canvas.style.cssText = `position:absolute;left:${line.contentLeft}px;top:${rect.top}px;width:${width}px;height:${height}px;`;
      ctx.scale(scale, scale);
      ctx.font = font;
      ctx.fillStyle = base.color;
      ctx.fillText(line.text, 0, (rect.height - ascent - descent) / 2 + ascent);
      canvases.push(canvas);
      }
      if (!valid || !canvases.length) continue;
      candidate.append(...canvases);
      mask.push(range);
    }
    if (!mask.length) return;
    // Source and geometry are read and committed in the same JS task.
    (shared?.host || document.body).append(candidate);
    if (shared) mask.forEach(range => shared.highlight.add(range));
    else CSS.highlights.set(key, new Highlight(...mask));
    ownedRanges = mask;
    layer = candidate;
    paints++;
    lastLatency = performance.now() - dirtyAt;
  }
  function invalidate() {
    clear();
    dirtyAt = performance.now();
    if (!shared && !stopped && !frame) frame = requestAnimationFrame(render);
  }
  const observer = shared ? null : new MutationObserver(invalidate);
  observer?.observe(block, { subtree: true, childList: true, characterData: true, attributes: true });
  const attachmentObserver = shared ? null : new MutationObserver(records => {
    if (!block.isConnected) { clear(); return; }
    const owned = node => node.nodeType === 1 && node.matches('.aistudio-live-preview-layer');
    if (records.some(record => {
      if (record.target.nodeType === 1 && record.target.closest('.aistudio-live-preview-layer')) return false;
      if (record.type === 'attributes') return !block.contains(record.target);
      const nodes = [...record.addedNodes, ...record.removedNodes];
      return nodes.some(node => !owned(node));
    })) invalidate();
  });
  attachmentObserver?.observe(document.body, { subtree: true, childList: true,
    attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  const events = shared ? [] : [[document, 'scroll'], [window, 'resize'], [document, 'selectionchange'],
    [document, 'visibilitychange'], [document.fonts, 'loadingdone'],
    [window.visualViewport, 'scroll'], [window.visualViewport, 'resize']];
  for (const [target, type] of events) target?.addEventListener(type, invalidate, true);
  invalidate();
  return {
    refresh: render,
    invalidate,
    stats: () => ({ supported, paints, lastLatency, visible: !!layer, ranges: ownedRanges.length }),
    stop() {
      stopped = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      attachmentObserver?.disconnect();
      for (const [target, type] of events) target?.removeEventListener(type, invalidate, true);
      clear();
      style?.remove();
    }
  };
};
