// ==UserScript==
// @name         Google AI Studio KaTeX/Markdown Display Fix Mobile
// @namespace    https://aistudio.google.com/
// @version      1.0.24-mobile-scroll-momentum
// @description  Mobile Firefox/Violentmonkey friendly KaTeX-safe, table-scroll, native vertical scroll, split Markdown bold, wrapping, and Samsung/Google-like font fix.
// @author       Codex
// @match        https://aistudio.google.com/*
// @match        https://*.aistudio.google.com/*
// @run-at       document-end
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  var STYLE_ID = 'aistudio-mobile-katex-md-fix-style';
  var KATEX_CSS_ID = 'aistudio-mobile-katex-css';
  var KATEX_CSS_URL = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
  var SCROLL_ISLAND_SELECTOR = [
    '.aistudio-table-scroll',
    'ms-katex.display',
    '.katex-display',
    'pre'
  ].join(',');

  var LEGACY_STYLE_IDS = [
    'codex-aistudio-katex-display-fix',
    'tm-aistudio-katex-display-fix',
    'aistudio-mobile-readable-font-css'
  ];

  var RESPONSE_SELECTOR = [
    '[data-turn-role="Model"]',
    '[data-message-author-role="assistant"]',
    '.model-prompt-container',
    '.chat-turn-container.model',
    'ms-chat-turn',
    'ms-chat-message',
    'message-content',
    '.markdown',
    '.markdown-body'
  ].join(',');

  var SKIP_SELECTOR = [
    'textarea',
    'input',
    'select',
    'button',
    '[contenteditable="true"]',
    '[role="textbox"]',
    'code',
    'pre',
    'kbd',
    'samp',
    'script',
    'style',
    '.cm-editor',
    '.monaco-editor',
    '.katex',
    'ms-katex',
    '.MathJax',
    'mjx-container',
    '.codex-md-strong',

    '[data-turn-role="User"]',
    '[data-message-author-role="user"]',
    '.user-prompt-container',
    '.chat-turn-container.user',
    'ms-prompt-input',
    'ms-autosize-textarea',
    'ms-chat-input'
  ].join(',');

  var FIX_CSS = [
    ':root{',
    '--aistudio-mobile-font:"Google Sans Text","Google Sans","SamsungOne","SamsungOne UI","Roboto","Noto Sans KR",system-ui,sans-serif;',
    '--aistudio-mobile-mono-font:ui-monospace,"Roboto Mono","Droid Sans Mono","Cascadia Mono","Consolas",monospace;',
    '--aistudio-mobile-font-size:16px;',
    '--aistudio-mobile-line-height:1.58;',
    '--aistudio-mobile-letter-spacing:0;',
    '--aistudio-mobile-bold-weight:600;',
    '}',

    'html,body{',
    'max-width:100%!important;',
    'overflow-x:hidden!important;',
    'font-family:var(--aistudio-mobile-font)!important;',
    'font-size:var(--aistudio-mobile-font-size)!important;',
    'line-height:var(--aistudio-mobile-line-height)!important;',
    '-webkit-font-smoothing:antialiased!important;',
    'text-rendering:optimizeLegibility!important;',
    '}',

    'body,button,input,textarea,select,[data-turn-role="Model"],[data-message-author-role="assistant"],[data-turn-role="User"],[data-message-author-role="user"],.model-prompt-container,.user-prompt-container,.chat-turn-container,ms-chat-turn,ms-chat-message,message-content,.markdown,.markdown-body{',
    'font-family:var(--aistudio-mobile-font)!important;',
    'font-size:var(--aistudio-mobile-font-size)!important;',
    'line-height:var(--aistudio-mobile-line-height)!important;',
    'letter-spacing:var(--aistudio-mobile-letter-spacing)!important;',
    '-webkit-font-smoothing:antialiased!important;',
    'text-rendering:optimizeLegibility!important;',
    '}',

    'strong,b,.codex-md-strong{',
    'font-family:inherit!important;',
    'font-weight:var(--aistudio-mobile-bold-weight)!important;',
    'text-shadow:none!important;',
    '-webkit-text-stroke:0!important;',
    '}',

    '[data-turn-role="Model"],[data-message-author-role="assistant"],.model-prompt-container,.chat-turn-container.model,ms-chat-turn,ms-chat-message,message-content,.markdown,.markdown-body{',
    'max-width:100%!important;',
    'min-width:0!important;',
    'box-sizing:border-box!important;',
    'overflow-x:hidden!important;',
    'overflow-wrap:break-word!important;',
    'word-break:normal!important;',
    '}',

    '[data-turn-role="Model"] p,[data-turn-role="Model"] div:not(.aistudio-table-scroll),[data-turn-role="Model"] li,[data-message-author-role="assistant"] p,[data-message-author-role="assistant"] div:not(.aistudio-table-scroll),[data-message-author-role="assistant"] li,.model-prompt-container p,.model-prompt-container div:not(.aistudio-table-scroll),.model-prompt-container li,.chat-turn-container.model p,.chat-turn-container.model div:not(.aistudio-table-scroll),.chat-turn-container.model li,ms-chat-turn p,ms-chat-turn div:not(.aistudio-table-scroll),ms-chat-turn li,ms-chat-message p,ms-chat-message div:not(.aistudio-table-scroll),ms-chat-message li,message-content p,message-content div:not(.aistudio-table-scroll),message-content li,.markdown p,.markdown div:not(.aistudio-table-scroll),.markdown li,.markdown-body p,.markdown-body div:not(.aistudio-table-scroll),.markdown-body li{',
    'max-width:100%!important;',
    'min-width:0!important;',
    'box-sizing:border-box!important;',
    'white-space:normal!important;',
    'overflow-wrap:break-word!important;',
    'word-break:normal!important;',
    '}',

    '.aistudio-table-scroll{',
    'display:block!important;',
    'width:100%!important;',
    'max-width:100%!important;',
    'min-width:0!important;',
    'overflow-x:auto!important;',
    'overflow-y:visible!important;',
    '-webkit-overflow-scrolling:touch!important;',
    'touch-action:pan-x pan-y pinch-zoom!important;',
    'overscroll-behavior-x:contain!important;',
    'overscroll-behavior-y:auto!important;',
    'box-sizing:border-box!important;',
    'margin:0.75em 0!important;',
    'padding-bottom:0.35em!important;',
    'scroll-behavior:auto!important;',
    '}',

    '.aistudio-table-scroll table{',
    'width:max-content!important;',
    'min-width:100%!important;',
    'max-width:none!important;',
    'table-layout:auto!important;',
    'border-collapse:collapse!important;',
    '}',

    '.aistudio-table-scroll th,.aistudio-table-scroll td{',
    'white-space:nowrap!important;',
    'word-break:keep-all!important;',
    'overflow-wrap:normal!important;',
    'vertical-align:top!important;',
    'box-sizing:border-box!important;',
    '}',

    '[data-turn-role="Model"] table,[data-message-author-role="assistant"] table,.model-prompt-container table,.chat-turn-container.model table,ms-chat-turn table,ms-chat-message table,message-content table,.markdown table,.markdown-body table{',
    'width:max-content!important;',
    'min-width:100%!important;',
    'max-width:none!important;',
    'table-layout:auto!important;',
    'border-collapse:collapse!important;',
    '}',

    '[data-turn-role="Model"] th,[data-turn-role="Model"] td,[data-message-author-role="assistant"] th,[data-message-author-role="assistant"] td,.model-prompt-container th,.model-prompt-container td,.chat-turn-container.model th,.chat-turn-container.model td,ms-chat-turn th,ms-chat-turn td,ms-chat-message th,ms-chat-message td,message-content th,message-content td,.markdown th,.markdown td,.markdown-body th,.markdown-body td{',
    'white-space:nowrap!important;',
    'word-break:keep-all!important;',
    'overflow-wrap:normal!important;',
    'vertical-align:top!important;',
    '}',

    'pre,code,kbd,samp,.cm-editor,.monaco-editor{',
    'font-family:var(--aistudio-mobile-mono-font)!important;',
    'letter-spacing:0!important;',
    '}',

    'pre{',
    'max-width:100%!important;',
    'overflow-x:auto!important;',
    'overflow-y:visible!important;',
    '-webkit-overflow-scrolling:touch!important;',
    'touch-action:pan-x pan-y pinch-zoom!important;',
    'overscroll-behavior-x:contain!important;',
    'overscroll-behavior-y:auto!important;',
    'box-sizing:border-box!important;',
    'scroll-behavior:auto!important;',
    '}',

    'code{',
    'max-width:100%!important;',
    '}',

    'ms-katex{',
    'max-width:100%!important;',
    'box-sizing:border-box!important;',
    'letter-spacing:0!important;',
    '}',

    'ms-katex.inline{',
    'display:inline-block!important;',
    'max-width:100%!important;',
    'vertical-align:-0.18em!important;',
    '}',

    'ms-katex.display{',
    'display:block!important;',
    'width:100%!important;',
    'max-width:100%!important;',
    'min-width:0!important;',
    'box-sizing:border-box!important;',
    'overflow-x:auto!important;',
    'overflow-y:visible!important;',
    '-webkit-overflow-scrolling:touch!important;',
    'touch-action:pan-x pan-y pinch-zoom!important;',
    'overscroll-behavior-x:contain!important;',
    'overscroll-behavior-y:auto!important;',
    'margin:0.55em 0!important;',
    'padding:0.12em 0 0.38em 0!important;',
    'scroll-behavior:auto!important;',
    '}',

    '.katex-display{',
    'display:block!important;',
    'max-width:100%!important;',
    'overflow-x:auto!important;',
    'overflow-y:visible!important;',
    '-webkit-overflow-scrolling:touch!important;',
    'touch-action:pan-x pan-y pinch-zoom!important;',
    'overscroll-behavior-x:contain!important;',
    'overscroll-behavior-y:auto!important;',
    'box-sizing:border-box!important;',
    'margin:0.55em 0!important;',
    'padding-bottom:0.25em!important;',
    'scroll-behavior:auto!important;',
    '}',

    '.katex{',
    'text-indent:0!important;',
    'text-rendering:auto!important;',
    'line-height:1.2!important;',
    'letter-spacing:0!important;',
    '}',

    '.katex-display>.katex{',
    'display:inline-block!important;',
    'max-width:none!important;',
    '}',

    'ms-katex .katex-mathml,.katex .katex-mathml{',
    'position:absolute!important;',
    'clip:rect(1px,1px,1px,1px)!important;',
    'clip-path:inset(50%)!important;',
    'width:1px!important;',
    'height:1px!important;',
    'padding:0!important;',
    'border:0!important;',
    'overflow:hidden!important;',
    'white-space:nowrap!important;',
    '}',

    'ms-katex pre,ms-katex code.rendered{',
    'background:transparent!important;',
    'border:0!important;',
    'box-shadow:none!important;',
    '}',

    'ms-katex pre{',
    'margin:0!important;',
    'padding:0!important;',
    '}',

    'ms-katex code.rendered{',
    'margin:0!important;',
    'padding:0!important;',
    'color:inherit!important;',
    '}'
  ].join('\n');

  var scheduled = false;
  var pendingRoots = [];

  function addPendingRoot(root) {
    var i;

    if (!root) return;

    for (i = 0; i < pendingRoots.length; i += 1) {
      if (pendingRoots[i] === root) return;
    }

    pendingRoots.push(root);
  }

  function injectLink(id, href) {
    var head = document.head || document.querySelector('head');
    var link;

    if (!head) return false;

    if (!document.getElementById(id)) {
      link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = href;
      head.appendChild(link);
    }

    return true;
  }

  function injectStyles() {
    var head = document.head || document.querySelector('head');
    var i;
    var old;
    var styleNode;

    if (!head) return false;

    for (i = 0; i < LEGACY_STYLE_IDS.length; i += 1) {
      old = document.getElementById(LEGACY_STYLE_IDS[i]);

      if (old && old.parentNode) {
        old.parentNode.removeChild(old);
      }
    }

    injectLink(KATEX_CSS_ID, KATEX_CSS_URL);

    styleNode = document.getElementById(STYLE_ID);

    if (!styleNode) {
      if (typeof GM_addStyle === 'function') {
        styleNode = GM_addStyle(FIX_CSS);
      }

      if (!styleNode) {
        styleNode = document.createElement('style');
        styleNode.textContent = FIX_CSS;
        head.appendChild(styleNode);
      }

      styleNode.id = STYLE_ID;
    }

    if (styleNode.textContent !== FIX_CSS) {
      styleNode.textContent = FIX_CSS;
    }

    if (!styleNode.parentNode) {
      head.appendChild(styleNode);
    }

    if (document.documentElement) {
      document.documentElement.setAttribute('data-aistudio-mobile-fix', 'native-scroll');
    }

    return true;
  }

  function hasBoldPair(text) {
    return text.indexOf('**') !== -1 || text.indexOf('__') !== -1;
  }

  function hasMarkerChar(text) {
    return text.indexOf('*') !== -1 || text.indexOf('_') !== -1;
  }

  function getElementFromNode(node) {
    if (!node) return null;
    if (node.nodeType === 1) return node;
    return node.parentElement || null;
  }

  function elementClosest(el, selector) {
    if (!el || !el.closest) return null;

    try {
      return el.closest(selector);
    } catch (err) {
      return null;
    }
  }

  function elementMatches(el, selector) {
    if (!el || !el.matches) return false;

    try {
      return el.matches(selector);
    } catch (err) {
      return false;
    }
  }

  function isSkipped(node) {
    var el = getElementFromNode(node);
    return !el || !!elementClosest(el, SKIP_SELECTOR);
  }

  function addTarget(targets, element) {
    var i;

    if (!element) return;

    for (i = 0; i < targets.length; i += 1) {
      if (targets[i] === element) return;
    }

    targets.push(element);
  }

  function collectResponseTargets(root) {
    var targets = [];
    var base = getElementFromNode(root) || document.body || document.documentElement;
    var found;
    var i;

    if (!base) return targets;

    if (elementMatches(base, RESPONSE_SELECTOR)) {
      addTarget(targets, base);
    }

    addTarget(targets, elementClosest(base, RESPONSE_SELECTOR));

    if (base.querySelectorAll) {
      found = base.querySelectorAll(RESPONSE_SELECTOR);

      for (i = 0; i < found.length; i += 1) {
        addTarget(targets, found[i]);
      }
    }

    if (!targets.length) {
      addTarget(targets, document.querySelector('main, [role="main"]') || document.body);
    }

    return targets;
  }

  function wrapTables(root) {
    var targets = collectResponseTargets(root);
    var i;
    var j;
    var tables;
    var table;
    var wrapper;

    for (i = 0; i < targets.length; i += 1) {
      if (!targets[i] || isSkipped(targets[i])) continue;

      tables = targets[i].querySelectorAll ? targets[i].querySelectorAll('table') : [];

      for (j = 0; j < tables.length; j += 1) {
        table = tables[j];

        if (!table || !table.parentNode) continue;
        if (elementClosest(table, '.aistudio-table-scroll')) continue;
        if (isSkipped(table)) continue;

        wrapper = document.createElement('div');
        wrapper.className = 'aistudio-table-scroll';

        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);
      }
    }
  }

  function getDepth(el) {
    var depth = 0;

    while (el) {
      depth += 1;
      el = el.parentElement;
    }

    return depth;
  }

  function collectCandidateElements(target) {
    var candidates = [];
    var walker;

    if (!target || isSkipped(target)) return candidates;

    walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
      acceptNode: function (textNode) {
        var value = textNode.nodeValue || '';

        if (!hasMarkerChar(value)) {
          return NodeFilter.FILTER_SKIP;
        }

        if (isSkipped(textNode)) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    });

    while (walker.nextNode()) {
      var textNode = walker.currentNode;
      var el = textNode.parentElement;
      var hops = 0;

      while (el && el !== document.body && hops < 14) {
        if (isSkipped(el)) break;

        if (hasBoldPair(el.textContent || '')) {
          addTarget(candidates, el);
          break;
        }

        if (el === target) break;

        el = el.parentElement;
        hops += 1;
      }
    }

    candidates.sort(function (a, b) {
      return getDepth(b) - getDepth(a);
    });

    return candidates;
  }

  function collectTextMap(element) {
    var segments = [];
    var text = '';

    var walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: function (textNode) {
        var value = textNode.nodeValue || '';

        if (!value) {
          return NodeFilter.FILTER_SKIP;
        }

        if (isSkipped(textNode)) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    });

    while (walker.nextNode()) {
      var node = walker.currentNode;
      var value = node.nodeValue || '';
      var start;

      if (!value) continue;

      start = text.length;
      text += value;

      segments.push({
        node: node,
        start: start,
        end: text.length
      });
    }

    return {
      text: text,
      segments: segments
    };
  }

  function findPosition(segments, index, bias) {
    var i;
    var seg;
    var prev;
    var next;
    var last;

    if (!segments.length) return null;

    for (i = 0; i < segments.length; i += 1) {
      seg = segments[i];

      if (index > seg.start && index < seg.end) {
        return {
          node: seg.node,
          offset: index - seg.start
        };
      }

      if (index === seg.start) {
        if (bias === 'end' && i > 0) {
          prev = segments[i - 1];

          return {
            node: prev.node,
            offset: prev.node.nodeValue.length
          };
        }

        return {
          node: seg.node,
          offset: 0
        };
      }

      if (index === seg.end) {
        if (bias === 'start' && i + 1 < segments.length) {
          next = segments[i + 1];

          return {
            node: next.node,
            offset: 0
          };
        }

        return {
          node: seg.node,
          offset: seg.node.nodeValue.length
        };
      }
    }

    last = segments[segments.length - 1];

    if (index >= last.end) {
      return {
        node: last.node,
        offset: last.node.nodeValue.length
      };
    }

    return null;
  }

  function makeRange(segments, startIndex, endIndex) {
    var start = findPosition(segments, startIndex, 'start');
    var end = findPosition(segments, endIndex, 'end');
    var range;

    if (!start || !end) return null;

    range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);

    return range;
  }

  function findLastBoldMatch(text) {
    var re = /(\*\*|__)(\S(?:[\s\S]*?\S)?)\1/g;
    var match;
    var last = null;
    var marker;
    var inner;
    var full;

    while ((match = re.exec(text))) {
      marker = match[1];
      inner = match[2] || '';
      full = match[0] || '';

      if (!inner.replace(/\s/g, '')) continue;
      if (inner.length > 2000) continue;
      if (full.indexOf('\n\n\n') !== -1) continue;

      last = {
        start: match.index,
        end: match.index + full.length,
        marker: marker
      };
    }

    return last;
  }

  function wrapBoldMatch(segments, match) {
    var markerLength = match.marker.length;

    var startMarkerStart = match.start;
    var startMarkerEnd = match.start + markerLength;
    var innerStart = startMarkerEnd;
    var innerEnd = match.end - markerLength;
    var endMarkerStart = innerEnd;
    var endMarkerEnd = match.end;

    var endMarkerRange;
    var innerRange;
    var startMarkerRange;
    var content;
    var strong;

    if (innerEnd <= innerStart) return false;

    endMarkerRange = makeRange(segments, endMarkerStart, endMarkerEnd);
    innerRange = makeRange(segments, innerStart, innerEnd);
    startMarkerRange = makeRange(segments, startMarkerStart, startMarkerEnd);

    if (!startMarkerRange || !innerRange || !endMarkerRange) return false;

    try {
      endMarkerRange.deleteContents();

      content = innerRange.extractContents();

      strong = document.createElement('strong');
      strong.className = 'codex-md-strong';
      strong.appendChild(content);

      innerRange.insertNode(strong);
      startMarkerRange.deleteContents();

      return true;
    } catch (err) {
      return false;
    }
  }

  function processBoldInElement(element) {
    var changed = 0;
    var i;
    var map;
    var match;

    if (!element || isSkipped(element)) return 0;

    for (i = 0; i < 20; i += 1) {
      map = collectTextMap(element);

      if (!hasBoldPair(map.text) || !map.segments.length) break;

      match = findLastBoldMatch(map.text);

      if (!match) break;
      if (!wrapBoldMatch(map.segments, match)) break;

      changed += 1;
    }

    return changed;
  }

  function scanRoot(root) {
    var targets = collectResponseTargets(root);
    var i;
    var j;
    var target;
    var candidates;

    wrapTables(root);

    for (i = 0; i < targets.length; i += 1) {
      target = targets[i];

      if (!target || isSkipped(target)) continue;

      candidates = collectCandidateElements(target);

      for (j = 0; j < candidates.length; j += 1) {
        processBoldInElement(candidates[j]);
      }
    }
  }

  function flush() {
    var roots;
    var i;
    var root;

    scheduled = false;

    injectStyles();

    roots = pendingRoots.length > 50
      ? [document.body || document.documentElement]
      : pendingRoots.slice(0);

    pendingRoots = [];

    if (!roots.length) {
      roots.push(document.body || document.documentElement);
    }

    for (i = 0; i < roots.length; i += 1) {
      root = roots[i];

      if (!root) continue;
      if (root.isConnected === false) continue;

      scanRoot(root);
    }
  }

  function schedule(root) {
    addPendingRoot(root);

    if (scheduled) return;

    scheduled = true;

    window.setTimeout(flush, 25);
  }

  function canScrollVertically(el) {
    var style;

    if (!el) return false;

    if (el === document.scrollingElement || el === document.documentElement || el === document.body) {
      return (document.scrollingElement || document.documentElement).scrollHeight >
        window.innerHeight + 2;
    }

    if (el.scrollHeight <= el.clientHeight + 2) return false;

    style = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if (!style) return true;

    return /auto|scroll|overlay/i.test(style.overflowY || style.overflow || '');
  }

  function findVerticalScroller(start) {
    var el = start;
    var scrollingElement = document.scrollingElement || document.documentElement;

    while (el && el !== document.body && el !== document.documentElement) {
      if (!elementMatches(el, SCROLL_ISLAND_SELECTOR) && canScrollVertically(el)) {
        return el;
      }

      el = el.parentElement;
    }

    return scrollingElement;
  }

  function clampScrollTop(scroller, value) {
    var max;

    if (!scroller) return 0;

    max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);

    return Math.max(0, Math.min(max, value));
  }

  function installVerticalScrollRescue() {
    var active = null;
    var momentumFrame = 0;

    function cancelMomentum() {
      if (momentumFrame) {
        window.cancelAnimationFrame(momentumFrame);
        momentumFrame = 0;
      }
    }

    function runMomentum(scroller, velocity) {
      var lastTime;
      var startTime;

      if (!scroller || Math.abs(velocity) < 0.18) return;

      cancelMomentum();

      velocity = Math.max(-3.2, Math.min(3.2, velocity));
      lastTime = Date.now();
      startTime = lastTime;

      function step() {
        var now = Date.now();
        var elapsed = Math.max(1, now - lastTime);
        var before = scroller.scrollTop || 0;
        var next = clampScrollTop(scroller, before + velocity * elapsed);

        scroller.scrollTop = next;

        if (next === before || now - startTime > 1300) {
          momentumFrame = 0;
          return;
        }

        velocity *= Math.pow(0.94, elapsed / 16);
        lastTime = now;

        if (Math.abs(velocity) < 0.04) {
          momentumFrame = 0;
          return;
        }

        momentumFrame = window.requestAnimationFrame(step);
      }

      momentumFrame = window.requestAnimationFrame(step);
    }

    function reset() {
      var finished = active;

      active = null;

      if (finished && finished.mode === 'vertical') {
        runMomentum(finished.scroller, finished.velocity || 0);
      }
    }

    document.addEventListener('touchstart', function (event) {
      var touch;
      var island;
      var scroller;

      if (!event.touches || event.touches.length !== 1) {
        reset();
        return;
      }

      cancelMomentum();

      island = elementClosest(event.target, SCROLL_ISLAND_SELECTOR);
      if (!island) {
        reset();
        return;
      }

      scroller = findVerticalScroller(island.parentElement || island);
      touch = event.touches[0];

      active = {
        island: island,
        scroller: scroller,
        startX: touch.clientX,
        startY: touch.clientY,
        lastY: touch.clientY,
        lastMoveTime: Date.now(),
        velocity: 0,
        mode: '',
        islandScrollLeft: island.scrollLeft || 0
      };
    }, { capture: true, passive: true });

    document.addEventListener('touchmove', function (event) {
      var touch;
      var dx;
      var dy;
      var absX;
      var absY;
      var deltaY;
      var scroller;
      var before;
      var next;
      var now;
      var elapsed;

      if (!active || !event.touches || event.touches.length !== 1) return;

      touch = event.touches[0];
      dx = touch.clientX - active.startX;
      dy = touch.clientY - active.startY;
      absX = Math.abs(dx);
      absY = Math.abs(dy);

      if (!active.mode) {
        if (Math.max(absX, absY) < 8) return;
        active.mode = absY > absX * 1.15 ? 'vertical' : 'horizontal';
      }

      if (active.mode !== 'vertical') return;

      scroller = active.scroller || findVerticalScroller(active.island);
      if (!scroller) return;

      deltaY = active.lastY - touch.clientY;
      before = scroller.scrollTop || 0;
      next = clampScrollTop(scroller, before + deltaY);

      if (next !== before) {
        now = Date.now();
        elapsed = Math.max(1, now - active.lastMoveTime);
        scroller.scrollTop = next;
        active.lastY = touch.clientY;
        active.lastMoveTime = now;
        active.velocity = (next - before) / elapsed;
        active.island.scrollLeft = active.islandScrollLeft;
        event.preventDefault();
        event.stopPropagation();
      }
    }, { capture: true, passive: false });

    document.addEventListener('touchend', reset, { capture: true, passive: true });
    document.addEventListener('touchcancel', reset, { capture: true, passive: true });
  }

  function startObserver() {
    var target = document.documentElement || document.body;
    var observer;

    if (!target) {
      window.setTimeout(startObserver, 80);
      return;
    }

    observer = new MutationObserver(function (mutations) {
      var addedCount = 0;
      var i;
      var j;
      var mutation;
      var node;

      for (i = 0; i < mutations.length; i += 1) {
        mutation = mutations[i];

        if (mutation.type === 'characterData') {
          schedule(mutation.target.parentElement);
          continue;
        }

        for (j = 0; j < mutation.addedNodes.length; j += 1) {
          node = mutation.addedNodes[j];

          if (node.nodeType === 1 || node.nodeType === 3) {
            addedCount += 1;

            if (addedCount > 30) {
              schedule(document.body || document.documentElement);
              return;
            }

            schedule(node.nodeType === 3 ? node.parentElement : node);
          }
        }
      }
    });

    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true
    });

    schedule(document.body || document.documentElement);
  }

  function boot() {
    injectStyles();
    installVerticalScrollRescue();
    startObserver();
    schedule(document.body || document.documentElement);
  }

  var bootTimer = window.setInterval(function () {
    if (document.documentElement) {
      window.clearInterval(bootTimer);
      boot();
    }
  }, 80);

  document.addEventListener('DOMContentLoaded', function () {
    injectStyles();
    schedule(document.body || document.documentElement);
  }, false);

  window.addEventListener('pageshow', function () {
    injectStyles();
    schedule(document.body || document.documentElement);
  }, false);
}());
