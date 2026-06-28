// ==UserScript==
// @name         Google AI Studio KaTeX/Markdown Display Fix Mobile (Hybrid Safe)
// @namespace    https://aistudio.google.com/
// @version      1.5.1
// @description  Mobile-safe CSS fix plus conservative completed-output raw **bold** repair. Math-safe by default.
// @author       Codex
// @match        https://aistudio.google.com/*
// @match        https://*.aistudio.google.com/*
// @run-at       document-idle
// @inject-into  content
// @noframes
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '1.5.1';
  const STYLE_ID = 'aistudio-mobile-safe-151-style';
  const VERSION_ATTR = 'data-aistudio-mobile-safe-151';

  /*
   * CSS-only만 쓰면 raw **bold**를 실제 굵게 만들 수 없다.
   * 그래서 이 버전은 "완료된 모델 출력"의 "수식 없는 단일 텍스트 노드"만 아주 보수적으로 고친다.
   *
   * 안전을 위해 하지 않는 것:
   * - 생성 중 최신 답변 수정
   * - 수식이 들어 있는 텍스트 노드 수정
   * - KaTeX / MathJax 내부 수정
   * - code / pre / link / input 내부 수정
   * - 여러 DOM 노드에 나뉜 **bold**를 억지로 합쳐서 수정
   */
  const ENABLE_SAFE_RAW_BOLD_REPAIR = true;

  const SCAN_MS = 1800;
  const OLD_TURN_WAIT_MS = 1800;
  const LAST_TURN_WAIT_MS = 100;
  const RETRY_BASE_MS = 2000;
  const RETRY_MAX_MS = 30000;
  const MAX_MATCH_INNER_LENGTH = 2000;

  const STYLE_ROOT_SELECTOR = [
    'ms-chat-turn .chat-turn-container.model ms-cmark-node',
    'ms-chat-turn [data-turn-role="Model"] ms-cmark-node',
    '.chat-turn-container.model ms-cmark-node',
    '[data-turn-role="Model"] ms-cmark-node',
    '[data-message-author-role="assistant"] ms-cmark-node',
    '.model-prompt-container ms-cmark-node',
    '.chat-turn-container.model .markdown',
    '.chat-turn-container.model .markdown-body',
    '[data-message-author-role="assistant"] .markdown',
    '[data-message-author-role="assistant"] .markdown-body'
  ].join(',');

  const MODEL_TURN_SELECTOR = [
    'ms-chat-turn .chat-turn-container.model',
    'ms-chat-turn [data-turn-role="Model"]',
    '[data-message-author-role="assistant"]',
    '.model-prompt-container',
    '.chat-turn-container.model'
  ].join(',');

  const REPAIR_ROOT_SELECTOR = [
    STYLE_ROOT_SELECTOR,
    MODEL_TURN_SELECTOR
  ].join(',');

  const USER_SELECTOR = [
    '[data-turn-role="User"]',
    '[data-message-author-role="user"]',
    '.user-prompt-container',
    '.chat-turn-container.user',
    'ms-prompt-input',
    'ms-autosize-textarea',
    'ms-chat-input'
  ].join(',');

  const SKIP_SELECTOR = [
    'textarea',
    'input',
    'select',
    'button',
    '[contenteditable="true"]',
    '[role="textbox"]',

    'a',
    'code',
    'pre',
    'kbd',
    'samp',
    'script',
    'style',
    'noscript',

    'svg',
    'math',
    '.cm-editor',
    '.monaco-editor',

    '.katex',
    'ms-katex',
    '.MathJax',
    'mjx-container',

    'strong',
    'b',
    '.aistudio-md-repaired'
  ].join(',');

  const SCOPE = `:where(${STYLE_ROOT_SELECTOR})`;

  const LEGACY_STYLE_IDS = [
    'codex-aistudio-katex-display-fix',
    'tm-aistudio-katex-display-fix',
    'aistudio-mobile-readable-font-css',
    'aistudio-mobile-katex-md-fix-style',
    'aistudio-mobile-display-fix-style',
    'aistudio-mobile-safe-fix-style',
    'aistudio-mobile-safe-display-fix-style',
    'aistudio-mobile-safe-143-style',
    'aistudio-mobile-safe-144-style',
    'aistudio-mobile-safe-145-style',
    'aistudio-mobile-safe-150-style'
  ];

  const CSS_TEXT = `
:root {
  --as-font:
    "Google Sans Text",
    "Google Sans",
    "SamsungOne",
    "SamsungOne UI",
    "Roboto",
    "Noto Sans KR",
    "Apple SD Gothic Neo",
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;

  --as-mono:
    ui-monospace,
    "Roboto Mono",
    "Droid Sans Mono",
    "Cascadia Mono",
    "Consolas",
    "SFMono-Regular",
    monospace;

  --as-size: 16px;
  --as-line: 1.58;
  --as-bold: 600;
}

html,
body,
button,
input,
textarea,
select {
  font-family: var(--as-font) !important;
  -webkit-font-smoothing: antialiased !important;
  text-rendering: optimizeLegibility !important;
}

${SCOPE} {
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;

  font-family: var(--as-font) !important;
  font-size: var(--as-size) !important;
  line-height: var(--as-line) !important;
  letter-spacing: 0 !important;

  white-space: normal !important;
  overflow-wrap: break-word !important;
  word-break: normal !important;
}

${SCOPE} :where(
  p,
  li,
  blockquote,
  dd,
  dt,
  figcaption,
  summary,
  h1,
  h2,
  h3,
  h4,
  h5,
  h6
) {
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;

  white-space: normal !important;
  overflow-wrap: break-word !important;
  word-break: normal !important;
}

${SCOPE} :where(strong, b, .aistudio-md-repaired) {
  font-family: inherit !important;
  font-weight: var(--as-bold) !important;
  text-shadow: none !important;
  -webkit-text-stroke: 0 !important;
}

${SCOPE} :where(a) {
  overflow-wrap: anywhere !important;
  word-break: normal !important;
}

${SCOPE} :where(code, pre, kbd, samp) {
  font-family: var(--as-mono) !important;
  letter-spacing: 0 !important;
}

${SCOPE} pre {
  max-width: 100% !important;
  min-width: 0 !important;

  overflow-x: auto !important;
  overflow-y: visible !important;

  box-sizing: border-box !important;
  -webkit-overflow-scrolling: touch !important;
  overscroll-behavior-x: contain !important;

  white-space: pre !important;
}

${SCOPE} pre code {
  white-space: pre !important;
  overflow-wrap: normal !important;
  word-break: normal !important;
}

${SCOPE} :where(
  p code,
  li code,
  dd code,
  dt code,
  th code,
  td code,
  blockquote code
) {
  white-space: break-spaces !important;
  overflow-wrap: anywhere !important;
  word-break: normal !important;
}

${SCOPE} table {
  width: 100% !important;
  max-width: 100% !important;

  table-layout: auto !important;
  border-collapse: collapse !important;
  box-sizing: border-box !important;
}

${SCOPE} :where(th, td) {
  min-width: 0 !important;
  box-sizing: border-box !important;

  white-space: normal !important;
  overflow-wrap: anywhere !important;
  word-break: normal !important;

  vertical-align: top !important;
}

${SCOPE} :where(img, video, canvas) {
  max-width: 100% !important;
  height: auto !important;
  box-sizing: border-box !important;
}

${SCOPE} :where(
  ms-katex.display,
  .katex-display,
  mjx-container[display="true"]
) {
  display: block !important;
  max-width: 100% !important;

  overflow-x: auto !important;
  overflow-y: visible !important;

  box-sizing: border-box !important;
  -webkit-overflow-scrolling: touch !important;
  overscroll-behavior-x: contain !important;

  padding-top: 0.05em !important;
  padding-bottom: 0.05em !important;
}

${SCOPE} :where(
  ms-katex,
  .katex,
  .katex *,
  mjx-container,
  mjx-container *
) {
  overflow-wrap: normal !important;
  word-break: normal !important;
}

${SCOPE} :where(
  ms-katex:not(.display),
  .katex,
  mjx-container:not([display="true"])
) {
  white-space: nowrap !important;
}

${SCOPE} :where(.katex-display > .katex) {
  max-width: none !important;
}

${SCOPE} :where(details, blockquote) {
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
}

${SCOPE} :where(h1, h2, h3, h4, h5, h6) {
  overflow-wrap: anywhere !important;
  word-break: normal !important;
}
`;

  const states = new WeakMap();

  let cleanedLegacy = false;
  let pending = false;
  let observer = null;

  function elementOf(node) {
    if (!node) {
      return null;
    }

    return node.nodeType === Node.ELEMENT_NODE
      ? node
      : node.parentElement;
  }

  function closest(node, selector) {
    const element = elementOf(node);

    if (
      !element ||
      typeof element.closest !== 'function'
    ) {
      return null;
    }

    try {
      return element.closest(selector);
    } catch (_) {
      return null;
    }
  }

  function cleanupLegacy() {
    if (cleanedLegacy) {
      return;
    }

    cleanedLegacy = true;

    for (const id of LEGACY_STYLE_IDS) {
      const oldStyle = document.getElementById(id);

      if (oldStyle) {
        oldStyle.remove();
      }
    }

    try {
      if (
        window.CSS &&
        CSS.highlights
      ) {
        CSS.highlights.delete('aistudio-raw-bold-markers');
        CSS.highlights.delete('aistudio-raw-bold-content');
      }
    } catch (_) {
      /*
       * 구형 브라우저 또는 격리 환경에서는 무시한다.
       */
    }
  }

  function installStyle() {
    const parent =
      document.head ||
      document.documentElement;

    if (!parent) {
      return;
    }

    cleanupLegacy();

    let style =
      document.getElementById(STYLE_ID);

    if (!style) {
      try {
        style =
          typeof GM_addStyle === 'function'
            ? GM_addStyle(CSS_TEXT)
            : null;
      } catch (_) {
        style = null;
      }

      if (
        !style ||
        style.nodeType !== Node.ELEMENT_NODE
      ) {
        style = document.createElement('style');
        style.textContent = CSS_TEXT;
        parent.appendChild(style);
      }

      style.id = STYLE_ID;
    } else if (style.textContent !== CSS_TEXT) {
      style.textContent = CSS_TEXT;
    }

    style.setAttribute('data-version', VERSION);

    if (!style.isConnected) {
      parent.appendChild(style);
    }
  }

  function hasPair(text) {
    return Boolean(
      text &&
      (
        text.includes('**') ||
        text.includes('__')
      )
    );
  }

  function isEscaped(text, index) {
    let count = 0;

    for (
      let cursor = index - 1;
      cursor >= 0 && text[cursor] === '\\';
      cursor -= 1
    ) {
      count += 1;
    }

    return count % 2 === 1;
  }

  function hasUnescapedDollarPair(text) {
    if (!text) {
      return false;
    }

    let count = 0;

    for (let index = 0; index < text.length; index += 1) {
      if (
        text[index] === '$' &&
        !isEscaped(text, index)
      ) {
        count += 1;

        if (count >= 2) {
          return true;
        }
      }
    }

    return false;
  }

  function hasMathLikeText(text) {
    return Boolean(
      text &&
      (
        /\\(?:\(|\)|\[|\])/.test(text) ||
        /\\(?:begin|end)\s*\{/.test(text) ||
        /\\(?:frac|sqrt|sum|prod|int|lim|alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|phi|omega)\b/.test(text) ||
        text.includes('$$') ||
        hasUnescapedDollarPair(text)
      )
    );
  }

  function isWordChar(character) {
    return Boolean(
      character &&
      /[0-9A-Za-z_\u00C0-\uFFFF]/.test(character)
    );
  }

  function findMatches(text) {
    const result = [];
    const regex = /(\*\*|__)(\S(?:[\s\S]*?\S)?)\1/g;

    let match;

    while ((match = regex.exec(text))) {
      const marker = match[1];
      const inner = match[2] || '';
      const start = match.index;
      const end = start + match[0].length;
      const markerCharacter = marker[0];
      const before = text[start - 1] || '';
      const after = text[end] || '';
      const closingMarkerStart = end - marker.length;

      if (
        isEscaped(text, start) ||
        isEscaped(text, closingMarkerStart)
      ) {
        continue;
      }

      if (
        !inner.trim() ||
        inner.length > MAX_MATCH_INNER_LENGTH ||
        hasMathLikeText(inner)
      ) {
        continue;
      }

      if (/\n\s*\n/.test(inner)) {
        continue;
      }

      /*
       * ***bold*** 또는 ___bold___ 일부를 잘못 잡지 않는다.
       */
      if (
        before === markerCharacter ||
        after === markerCharacter ||
        inner[0] === markerCharacter ||
        inner[inner.length - 1] === markerCharacter
      ) {
        continue;
      }

      /*
       * foo__bar__baz 같은 식별자를 Markdown으로 처리하지 않는다.
       */
      if (
        marker === '__' &&
        (
          isWordChar(before) ||
          isWordChar(after)
        )
      ) {
        continue;
      }

      result.push({
        start,
        end,
        inner
      });
    }

    return result;
  }

  function skipped(textNode) {
    const parent =
      textNode &&
      textNode.parentElement;

    if (!parent) {
      return true;
    }

    return Boolean(
      closest(parent, USER_SELECTOR) ||
      closest(parent, SKIP_SELECTOR)
    );
  }

  function repairTextNode(textNode) {
    if (
      !textNode ||
      !textNode.parentNode ||
      !textNode.isConnected ||
      skipped(textNode)
    ) {
      return 0;
    }

    const text = textNode.nodeValue || '';

    /*
     * 수식이 같은 텍스트 노드 안에 있으면 통째로 건너뛴다.
     * 볼드보다 수식 안정성을 우선한다.
     */
    if (
      !hasPair(text) ||
      hasMathLikeText(text)
    ) {
      return 0;
    }

    const matches = findMatches(text);

    if (!matches.length) {
      return 0;
    }

    const fragment = document.createDocumentFragment();
    let cursor = 0;

    for (const match of matches) {
      if (match.start > cursor) {
        fragment.appendChild(
          document.createTextNode(
            text.slice(cursor, match.start)
          )
        );
      }

      const strong = document.createElement('strong');
      strong.className = 'aistudio-md-repaired';
      strong.setAttribute('data-aistudio-md-repaired', '1');
      strong.textContent = match.inner;

      fragment.appendChild(strong);
      cursor = match.end;
    }

    if (cursor < text.length) {
      fragment.appendChild(
        document.createTextNode(
          text.slice(cursor)
        )
      );
    }

    textNode.parentNode.replaceChild(fragment, textNode);

    return matches.length;
  }

  function repairRoot(root) {
    if (
      !root ||
      !root.isConnected ||
      closest(root, USER_SELECTOR)
    ) {
      return 0;
    }

    const rootText = root.textContent || '';

    if (!hasPair(rootText)) {
      return 0;
    }

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(textNode) {
          const value = textNode.nodeValue || '';

          if (!hasPair(value)) {
            return NodeFilter.FILTER_SKIP;
          }

          if (skipped(textNode)) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];

    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    let repaired = 0;

    /*
     * 뒤에서부터 바꿔 앞쪽 노드 참조 영향을 줄인다.
     */
    for (
      let index = textNodes.length - 1;
      index >= 0;
      index -= 1
    ) {
      repaired += repairTextNode(textNodes[index]);
    }

    return repaired;
  }

  function nearViewport(element) {
    const height = window.innerHeight || 800;
    const rect = element.getBoundingClientRect();

    return (
      rect.bottom >= -height &&
      rect.top <= height * 2
    );
  }

  function collectRoots() {
    const roots = Array.from(
      document.querySelectorAll(REPAIR_ROOT_SELECTOR)
    ).filter((root) => {
      if (
        !root.isConnected ||
        closest(root, USER_SELECTOR)
      ) {
        return false;
      }

      /*
       * 중첩된 후보가 있으면 가장 바깥쪽만 처리한다.
       */
      const parentRoot =
        root.parentElement
          ? closest(root.parentElement, REPAIR_ROOT_SELECTOR)
          : null;

      return !parentRoot;
    });

    const selected = roots.filter(nearViewport);

    /*
     * 최근 답변 몇 개는 화면 판정과 상관없이 확인한다.
     */
    roots.slice(-4).forEach((root) => {
      if (!selected.includes(root)) {
        selected.push(root);
      }
    });

    return selected;
  }

  function lastModelTurn() {
    const models = document.querySelectorAll(
      [
        'ms-chat-turn .chat-turn-container.model',
        'ms-chat-turn [data-turn-role="Model"]',
        '[data-message-author-role="assistant"]',
        '.model-prompt-container',
        '.chat-turn-container.model'
      ].join(',')
    );

    const last = models[models.length - 1];

    if (!last) {
      return null;
    }

    return closest(last, 'ms-chat-turn') || last;
  }

  function sameTurnOrInside(root, turn) {
    if (!root || !turn) {
      return false;
    }

    return (
      root === turn ||
      turn.contains(root) ||
      root.contains(turn)
    );
  }

  function visible(element) {
    if (
      !element ||
      !element.isConnected
    ) {
      return false;
    }

    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function generating() {
    const runButton = document.querySelector('button.run-button');

    const label = runButton
      ? [
          runButton.getAttribute('aria-label') || '',
          runButton.getAttribute('title') || '',
          runButton.textContent || ''
        ].join(' ')
      : '';

    if (
      runButton &&
      visible(runButton) &&
      /(?:stop|cancel|abort|중지|정지|취소)/i.test(label)
    ) {
      return true;
    }

    const indicators = document.querySelectorAll(
      [
        'ms-chat-turn .chat-turn-container.model [aria-busy="true"]',
        'ms-chat-turn .chat-turn-container.model mat-progress-spinner',
        'ms-chat-turn .chat-turn-container.model mat-spinner',
        'ms-chat-turn .chat-turn-container.model [role="progressbar"]'
      ].join(',')
    );

    return Array.from(indicators).some(visible);
  }

  function scan() {
    pending = false;

    if (
      document.hidden ||
      !ENABLE_SAFE_RAW_BOLD_REPAIR
    ) {
      return;
    }

    const now = Date.now();
    const roots = collectRoots();
    const lastTurn = lastModelTurn();
    const pageGenerating = generating();

    for (const root of roots) {
      const text = root.textContent || '';

      if (!hasPair(text)) {
        states.delete(root);
        continue;
      }

      let state = states.get(root);

      /*
       * 텍스트가 바뀌었다면 아직 생성/렌더링 중일 수 있으므로 대기 시간을 다시 잰다.
       */
      if (
        !state ||
        state.text !== text
      ) {
        state = {
          text,
          since: now,
          attempted: null,
          attempts: 0,
          lastAttemptAt: null
        };

        states.set(root, state);
        continue;
      }

      const rootTurn =
        closest(root, 'ms-chat-turn') ||
        closest(root, MODEL_TURN_SELECTOR) ||
        root;

      const isLastTurn = sameTurnOrInside(rootTurn, lastTurn);

      /*
       * 최신 답변이 생성 중이면 절대 건드리지 않는다.
       */
      if (
        pageGenerating &&
        isLastTurn
      ) {
        continue;
      }

      const wait = isLastTurn
        ? LAST_TURN_WAIT_MS
        : OLD_TURN_WAIT_MS;

      const attempts = state.attempts || 0;
      const retryWait = Math.min(
        RETRY_MAX_MS,
        RETRY_BASE_MS * Math.pow(2, Math.min(attempts, 4))
      );

      if (
        now - state.since < wait ||
        (
          state.attempted === text &&
          now - (state.lastAttemptAt || 0) < retryWait
        )
      ) {
        continue;
      }

      state.attempted = text;

      const repaired = repairRoot(root);
      const after = root.textContent || '';

      if (repaired > 0) {
        states.set(root, {
          text: after,
          since: now,
          attempted: null,
          attempts: 0,
          lastAttemptAt: null
        });

        if (hasPair(after)) {
          schedule(250);
        }

        continue;
      }

      states.set(root, {
        text,
        since: state.since,
        attempted: text,
        attempts: attempts + 1,
        lastAttemptAt: now
      });
    }
  }

  function schedule(delay = 0) {
    if (
      pending ||
      !ENABLE_SAFE_RAW_BOLD_REPAIR
    ) {
      return;
    }

    pending = true;

    window.setTimeout(() => {
      if (
        typeof window.requestIdleCallback === 'function'
      ) {
        window.requestIdleCallback(scan, { timeout: 900 });
      } else {
        scan();
      }
    }, delay);
  }

  function shouldObserveMutationTarget(node) {
    const element = elementOf(node);

    return Boolean(
      element &&
      !closest(element, USER_SELECTOR) &&
      (
        closest(element, MODEL_TURN_SELECTOR) ||
        closest(element, REPAIR_ROOT_SELECTOR)
      )
    );
  }

  function installObserver() {
    if (
      observer ||
      !ENABLE_SAFE_RAW_BOLD_REPAIR ||
      typeof MutationObserver !== 'function'
    ) {
      return;
    }

    const target =
      document.body ||
      document.documentElement;

    if (!target) {
      return;
    }

    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (shouldObserveMutationTarget(mutation.target)) {
          schedule(300);
          return;
        }

        for (const node of mutation.addedNodes || []) {
          if (shouldObserveMutationTarget(node)) {
            schedule(300);
            return;
          }
        }
      }
    });

    observer.observe(target, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  function boot() {
    const html = document.documentElement;

    if (!html) {
      return;
    }

    installStyle();
    installObserver();
    schedule(250);

    html.setAttribute(VERSION_ATTR, VERSION);
    html.setAttribute(
      'data-aistudio-mobile-fix',
      'css-plus-safe-raw-bold-repair'
    );

    window.addEventListener(
      'pageshow',
      () => {
        installStyle();
        schedule(150);
      },
      { passive: true }
    );

    window.addEventListener(
      'popstate',
      () => {
        window.setTimeout(() => {
          installStyle();
          schedule(150);
        }, 150);
      },
      { passive: true }
    );

    window.addEventListener(
      'scroll',
      () => schedule(250),
      { passive: true }
    );

    document.addEventListener(
      'visibilitychange',
      () => {
        if (!document.hidden) {
          installStyle();
          schedule(150);
        }
      },
      { passive: true }
    );

    window.setInterval(installStyle, 10000);
    window.setInterval(schedule, SCAN_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}());