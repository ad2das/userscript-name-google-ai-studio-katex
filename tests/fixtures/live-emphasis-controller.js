// Fixture-only controller. Integration with the real userscript is not enabled.
globalThis.createLiveEmphasisController = function ({ getRoot, parse, active, typing }) {
  const key = 'aistudio-live-prototype';
  const highlight = new Highlight();
  const host = document.createElement('div');
  host.className = 'aistudio-live-preview-layer';
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1';
  const style = document.createElement('style');
  style.textContent = `::highlight(${key}) { color:transparent;text-shadow:none }`;
  document.head.append(style);
  const projectors = new Map();
  const dirty = new Set();
  let frame = 0;
  let stopped = false;
  let currentRoot = null;
  let renderedBlocks = 0;
  function clear() {
    for (const projector of projectors.values()) projector.stop();
    projectors.clear();
    dirty.clear();
    highlight.clear();
    CSS.highlights.delete(key);
    host.remove();
    currentRoot = null;
  }
  function queue(block) {
    projectors.get(block)?.invalidate();
    dirty.add(block);
  }
  function synchronize(discover = false) {
    if (stopped) return;
    if (!active() || typing() || document.hidden) { clear(); return; }
    const root = getRoot();
    if (!root?.isConnected) { clear(); return; }
    if (root !== currentRoot) { clear(); currentRoot = root; discover = true; }
    if (!host.isConnected) document.body.append(host);
    CSS.highlights.set(key, highlight);
    for (const [block, projector] of projectors) {
      if (!root.contains(block)) { projector.stop(); projectors.delete(block); dirty.delete(block); }
    }
    if (discover) {
      // This discovery cap is provisional; production needs persistent traversal.
      for (const block of Array.from(root.querySelectorAll('p')).slice(-64)) queue(block);
    }
    if (dirty.size && !frame) frame = requestAnimationFrame(flush);
  }
  function flush() {
    frame = 0;
    if (!active() || typing() || document.hidden) { clear(); return; }
    const start = performance.now();
    let count = 0;
    for (const block of dirty) {
      dirty.delete(block);
      if (!currentRoot?.contains(block)) continue;
      let projector = projectors.get(block);
      if (!projector) {
        projector = createLiveEmphasisPrototype(block, parse, { host, highlight });
        projectors.set(block, projector);
      }
      projector.refresh();
      renderedBlocks++;
      if (++count >= 4 || performance.now() - start >= 6) break;
    }
    if (dirty.size) frame = requestAnimationFrame(flush);
  }
  const observer = new MutationObserver(records => {
    let discover = false;
    let relevant = false;
    for (const record of records) {
      const element = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (element?.closest('.aistudio-live-preview-layer')) continue;
      const nodes = [...record.addedNodes, ...record.removedNodes];
      if (nodes.length && nodes.every(n => n === host)) continue;
      relevant = true;
      const block = element?.closest('p');
      if (block && currentRoot?.contains(block)) queue(block);
      else discover = true;
    }
    if (relevant) synchronize(discover);
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-busy'] });
  const invalidateAll = () => {
    for (const block of projectors.keys()) queue(block);
    synchronize(true);
  };
  const events = [[document, 'scroll'], [document, 'selectionchange'], [document, 'input'],
    [document, 'compositionstart'], [document, 'compositionend'], [document, 'visibilitychange'],
    [window, 'resize'], [document.fonts, 'loadingdone'], [window.visualViewport, 'scroll'],
    [window.visualViewport, 'resize']];
  for (const [target, type] of events) target?.addEventListener(type, invalidateAll, true);
  synchronize(true);
  return {
    invalidate: invalidateAll,
    stats: () => ({ blocks: projectors.size, queued: dirty.size, renderedBlocks,
      ranges: highlight.size, layerConnected: host.isConnected }),
    stop() {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      for (const [target, type] of events) target?.removeEventListener(type, invalidateAll, true);
      clear();
      style.remove();
    }
  };
};
