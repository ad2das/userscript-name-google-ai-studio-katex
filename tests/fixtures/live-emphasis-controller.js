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
  let discoveryWalker = null;
  let wasActive = false;
  let draining = false;
  let drainTimer = null;
  function finishDrain() {
    draining = false;
    clearTimeout(drainTimer);
    drainTimer = null;
    clear();
  }
  function phaseAllowed() {
    const running = active();
    if (running) {
      draining = false;
      clearTimeout(drainTimer);
      drainTimer = null;
    } else if (wasActive && projectors.size) {
      draining = true;
      // A bounded bridge, not permanent replacement of completed native output.
      drainTimer = setTimeout(finishDrain, 5000);
    }
    wasActive = running;
    return running || draining;
  }
  function clear() {
    for (const projector of projectors.values()) projector.stop();
    projectors.clear();
    dirty.clear();
    discoveryWalker = null;
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
    if (!phaseAllowed() || typing() || document.hidden) { finishDrain(); return; }
    const root = getRoot();
    if (!root?.isConnected) { clear(); return; }
    if (root !== currentRoot) { clear(); currentRoot = root; discover = true; }
    if (!host.isConnected) document.body.append(host);
    CSS.highlights.set(key, highlight);
    for (const [block, projector] of projectors) {
      if (!root.contains(block)) { projector.stop(); projectors.delete(block); dirty.delete(block); }
    }
    if (discover) {
      if (!discoveryWalker) discoveryWalker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
          return node.matches('pre, code, math, .katex, ms-katex, [contenteditable], [data-turn-role="user"]')
            ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        }
      });
    }
    if ((dirty.size || discoveryWalker) && !frame) frame = requestAnimationFrame(flush);
  }
  function flush() {
    frame = 0;
    if (!phaseAllowed() || typing() || document.hidden) { finishDrain(); return; }
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
    // Every visited element counts toward the slice, including neutral wrappers.
    // FILTER_SKIP would hide an arbitrarily large traversal inside nextNode().
    let visited = 0;
    while (discoveryWalker && visited++ < 128 && performance.now() - start < 6) {
      const node = discoveryWalker.nextNode();
      if (!node) discoveryWalker = null;
      else if (node.tagName === 'P') queue(node);
    }
    if (dirty.size || discoveryWalker) frame = requestAnimationFrame(flush);
    else if (draining && highlight.size === 0) finishDrain();
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
      else if (!element?.closest('button')) discover = true;
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
      ranges: highlight.size, layerConnected: host.isConnected, draining, discovering: !!discoveryWalker }),
    stop() {
      stopped = true;
      clearTimeout(drainTimer);
      cancelAnimationFrame(frame);
      observer.disconnect();
      for (const [target, type] of events) target?.removeEventListener(type, invalidateAll, true);
      clear();
      style.remove();
    }
  };
};
