// ==UserScript==
// @name         Google AI Studio KaTeX/Markdown Display Fix Mobile (Safe)
// @namespace    https://aistudio.google.com/
// @version      1.4.4
// @description  Mobile-safe font/wrapping fix and delayed repair of raw **bold** in completed model output.
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

  const VERSION = '1.4.4';
  const STYLE_ID = 'aistudio-mobile-safe-144-style';
  const VERSION_ATTR = 'data-aistudio-mobile-safe-144';

  /*
   * 생성 중에는 DOM을 건드리지 않는다.
   * 최신 답변은 텍스트가 멈춘 뒤 4.5초 후 처리한다.
   */
  const SCAN_MS = 1800;
  const OLD_TURN_WAIT_MS = 1800;
  const LAST_TURN_WAIT_MS = 4500;

  const STYLE_ROOT_SELECTOR = [
    'ms-chat-turn .chat-turn-container.model ms-cmark-node',
    'ms-chat-turn [data-turn-role="Model"] ms-cmark-node',
    '.chat-turn-container.model ms-cmark-node',
    '[data-turn-role="Model"] ms-cmark-node',
    '[data-message-author-role="assistant"] ms-cmark-node',
    '.model-prompt-container ms-cmark-node',
    '.chat-turn-container.model .markdown',
    '.chat-turn-container.model .markdown-body'
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

  const SPLIT_BLOCK_SELECTOR = [
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
    'noscript',

    'svg',
    'math',
    '.cm-editor',
    '.monaco-editor',

    '.katex',
    'ms-katex',
    '.MathJax',
    'mjx-container'
  ].join(',');

  const INLINE_REPAIR_CONTAINER_SELECTOR = [
    'p',
    'li',
    'dd',
    'dt',
    'figcaption',
    'blockquote',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'th',
    'td'
  ].join(',');

  const SCOPE = `:where(${STYLE_ROOT_SELECTOR})`;

  const MAX_MATCH_INNER_LENGTH = 2000;
  const MAX_INLINE_TEXT_LENGTH = 12000;
  const RETRY_BASE_MS = 2000;
  const RETRY_MAX_MS = 30000;

  const CSS_TEXT = `
:root {
  --as-font:
    "Google Sans Text",
    "Google Sans",
    "SamsungOne",
    "SamsungOne UI",
    "Roboto",
    "Noto Sans KR",
    system-ui,
    sans-serif;

  --as-mono:
    ui-monospace,
    "Roboto Mono",
    "Droid Sans Mono",
    "Cascadia Mono",
    "Consolas",
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

strong,
b,
.aistudio-md-repaired {
  font-family: inherit !important;
  font-weight: var(--as-bold) !important;
  text-shadow: none !important;
  -webkit-text-stroke: 0 !important;
}

pre,
code,
kbd,
samp,
.cm-editor,
.monaco-editor {
  font-family: var(--as-mono) !important;
  letter-spacing: 0 !important;
}

${SCOPE} pre {
  max-width: 100% !important;

  overflow-x: auto !important;
  overflow-y: hidden !important;

  box-sizing: border-box !important;
  -webkit-overflow-scrolling: touch !important;
  overscroll-behavior-x: contain !important;
}

/*
 * 표를 block으로 바꾸지 않는다.
 * 셀 내부 내용만 모바일 폭에 맞춰 줄바꿈한다.
 */
${SCOPE} table {
  width: 100% !important;
  max-width: 100% !important;

  table-layout: auto !important;
  border-collapse: collapse !important;
  box-sizing: border-box !important;
}

${SCOPE} :where(th, td) {
  min-width: 0 !important;

  white-space: normal !important;
  overflow-wrap: anywhere !important;
  word-break: normal !important;

  vertical-align: top !important;
}

/*
 * KaTeX 내부의 display, width, line-height는 건드리지 않는다.
 * 진짜 블록 수식 바깥쪽에만 가로 스크롤을 허용한다.
 */
${SCOPE} ms-katex.display {
  max-width: 100% !important;

  overflow-x: auto !important;
  overflow-y: hidden !important;

  box-sizing: border-box !important;
  -webkit-overflow-scrolling: touch !important;
  overscroll-behavior-x: contain !important;
}
`;

  const states = new WeakMap();

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

  function installStyle() {
    const parent =
      document.head ||
      document.documentElement;

    if (!parent) {
      return;
    }

    /*
     * 이전 버전이 삽입한 CSS를 제거한다.
     */
    [
      'codex-aistudio-katex-display-fix',
      'tm-aistudio-katex-display-fix',
      'aistudio-mobile-readable-font-css',
      'aistudio-mobile-katex-md-fix-style',
      'aistudio-mobile-display-fix-style',
      'aistudio-mobile-safe-fix-style',
      'aistudio-mobile-safe-display-fix-style',
      'aistudio-mobile-safe-143-style'
    ].forEach((id) => {
      const oldStyle =
        document.getElementById(id);

      if (oldStyle) {
        oldStyle.remove();
      }
    });

    const oldKatexLink =
      document.getElementById(
        'aistudio-mobile-katex-css'
      );

    if (oldKatexLink) {
      oldKatexLink.remove();
    }

    /*
     * 이전 Custom Highlight 등록도 제거한다.
     */
    try {
      if (
        window.CSS &&
        CSS.highlights
      ) {
        CSS.highlights.delete(
          'aistudio-raw-bold-markers'
        );

        CSS.highlights.delete(
          'aistudio-raw-bold-content'
        );
      }
    } catch (_) {
      /*
       * 구형 Firefox 또는 격리된 실행 환경이면 무시한다.
       */
    }

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
        style =
          document.createElement('style');

        style.textContent = CSS_TEXT;
        parent.appendChild(style);
      }

      style.id = STYLE_ID;
    } else {
      style.textContent = CSS_TEXT;
    }

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

  function isWordChar(character) {
    return Boolean(
      character &&
      /[0-9A-Za-z_\u00C0-\uFFFF]/.test(
        character
      )
    );
  }

  function findMatches(text) {
    const result = [];

    const regex =
      /(\*\*|__)(\S(?:[\s\S]*?\S)?)\1/g;

    let match;

    while ((match = regex.exec(text))) {
      const marker = match[1];
      const inner = match[2] || '';

      const start = match.index;
      const end =
        start + match[0].length;

      const markerCharacter =
        marker[0];

      const before =
        text[start - 1] || '';

      const after =
        text[end] || '';

      if (
        !inner.trim() ||
        inner.length > MAX_MATCH_INNER_LENGTH
      ) {
        continue;
      }

      if (
        /\n\s*\n\s*\n/.test(inner)
      ) {
        continue;
      }

      /*
       * ***bold*** 또는 ___bold___ 일부를
       * 잘못 잡지 않는다.
       */
      if (
        before === markerCharacter ||
        after === markerCharacter ||
        inner[0] === markerCharacter ||
        inner[inner.length - 1] ===
          markerCharacter
      ) {
        continue;
      }

      /*
       * foo__bar__baz 같은 식별자를
       * Markdown으로 처리하지 않는다.
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
        marker,
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

    const text =
      textNode.nodeValue || '';

    const matches =
      hasPair(text)
        ? findMatches(text)
        : [];

    if (!matches.length) {
      return 0;
    }

    const fragment =
      document.createDocumentFragment();

    let cursor = 0;

    for (const match of matches) {
      if (match.start > cursor) {
        fragment.appendChild(
          document.createTextNode(
            text.slice(
              cursor,
              match.start
            )
          )
        );
      }

      const strong =
        document.createElement('strong');

      strong.className =
        'aistudio-md-repaired';

      strong.setAttribute(
        'data-aistudio-md-repaired',
        '1'
      );

      strong.textContent =
        match.inner;

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

    textNode.parentNode.replaceChild(
      fragment,
      textNode
    );

    return matches.length;
  }

  function collectRepairTextNodes(container) {
    const walker =
      document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(textNode) {
            if (
              !textNode.nodeValue ||
              skipped(textNode)
            ) {
              return NodeFilter.FILTER_REJECT;
            }

            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );

    const textNodes = [];

    while (walker.nextNode()) {
      textNodes.push(
        walker.currentNode
      );
    }

    return textNodes;
  }

  function textPosition(textNodes, offset) {
    let remaining =
      Math.max(0, offset);

    for (const textNode of textNodes) {
      const length =
        (textNode.nodeValue || '').length;

      if (remaining <= length) {
        return {
          node: textNode,
          offset: remaining
        };
      }

      remaining -= length;
    }

    const last =
      textNodes[textNodes.length - 1];

    if (!last) {
      return null;
    }

    return {
      node: last,
      offset: (last.nodeValue || '').length
    };
  }

  function rangeFromTextOffsets(
    textNodes,
    start,
    end
  ) {
    const from =
      textPosition(textNodes, start);

    const to =
      textPosition(textNodes, end);

    if (!from || !to) {
      return null;
    }

    const range =
      document.createRange();

    range.setStart(
      from.node,
      from.offset
    );

    range.setEnd(
      to.node,
      to.offset
    );

    return range;
  }

  function textNodesAndText(container) {
    const textNodes =
      collectRepairTextNodes(container);

    return {
      textNodes,
      text: textNodes.map((textNode) => (
        textNode.nodeValue || ''
      )).join('')
    };
  }

  function deleteTextRange(
    container,
    start,
    end
  ) {
    if (end <= start) {
      return false;
    }

    const current =
      textNodesAndText(container);

    const range =
      rangeFromTextOffsets(
        current.textNodes,
        start,
        end
      );

    if (!range) {
      return false;
    }

    try {
      range.deleteContents();
      return true;
    } catch (_) {
      return false;
    }
  }

  function wrapTextRange(
    container,
    start,
    end
  ) {
    if (end <= start) {
      return false;
    }

    const current =
      textNodesAndText(container);

    const range =
      rangeFromTextOffsets(
        current.textNodes,
        start,
        end
      );

    if (!range || range.collapsed) {
      return false;
    }

    const strong =
      document.createElement('strong');

    strong.className =
      'aistudio-md-repaired';

    strong.setAttribute(
      'data-aistudio-md-repaired',
      '1'
    );

    try {
      strong.appendChild(
        range.extractContents()
      );

      range.insertNode(strong);
      return true;
    } catch (_) {
      return false;
    }
  }

  function repairSplitMatch(
    container,
    match
  ) {
    const markerLength =
      match.marker.length;

    const innerStart =
      match.start + markerLength;

    const innerEnd =
      match.end - markerLength;

    if (
      !deleteTextRange(
        container,
        innerEnd,
        match.end
      )
    ) {
      return false;
    }

    if (
      !deleteTextRange(
        container,
        match.start,
        innerStart
      )
    ) {
      return false;
    }

    return wrapTextRange(
      container,
      match.start,
      innerEnd - markerLength
    );
  }

  function repairSplitEmphasisInContainer(container) {
    if (
      !container ||
      !container.isConnected ||
      closest(container, USER_SELECTOR) ||
      container.querySelector(SPLIT_BLOCK_SELECTOR)
    ) {
      return 0;
    }

    const snapshot =
      textNodesAndText(container);

    const text =
      snapshot.text;

    if (
      !hasPair(text) ||
      text.length > MAX_INLINE_TEXT_LENGTH
    ) {
      return 0;
    }

    const matches =
      findMatches(text);

    if (!matches.length) {
      return 0;
    }

    let repaired = 0;

    for (
      let index = matches.length - 1;
      index >= 0;
      index -= 1
    ) {
      if (
        repairSplitMatch(
          container,
          matches[index]
        )
      ) {
        repaired += 1;
      }
    }

    return repaired;
  }

  function repairSplitEmphasis(root) {
    const containers = [];

    if (
      root.matches &&
      root.matches(INLINE_REPAIR_CONTAINER_SELECTOR)
    ) {
      containers.push(root);
    }

    root.querySelectorAll(
      INLINE_REPAIR_CONTAINER_SELECTOR
    ).forEach((container) => {
      containers.push(container);
    });

    let repaired = 0;

    for (const container of containers) {
      repaired +=
        repairSplitEmphasisInContainer(
          container
        );
    }

    return repaired;
  }

  function repairRoot(root) {
    if (
      !root ||
      !root.isConnected ||
      closest(root, USER_SELECTOR)
    ) {
      return 0;
    }

    const walker =
      document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(textNode) {
            const value =
              textNode.nodeValue || '';

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
      textNodes.push(
        walker.currentNode
      );
    }

    let repaired = 0;

    /*
     * 뒤에서부터 바꿔 앞쪽 노드 참조에
     * 미치는 영향을 줄인다.
     */
    for (
      let index = textNodes.length - 1;
      index >= 0;
      index -= 1
    ) {
      repaired +=
        repairTextNode(
          textNodes[index]
        );
    }

    if (
      hasPair(root.textContent || '')
    ) {
      repaired +=
        repairSplitEmphasis(root);
    }

    return repaired;
  }

  function nearViewport(element) {
    const height =
      window.innerHeight || 800;

    const rect =
      element.getBoundingClientRect();

    return (
      rect.bottom >= -height &&
      rect.top <= height * 2
    );
  }

  function collectRoots() {
    const all =
      Array.from(
        document.querySelectorAll(
          REPAIR_ROOT_SELECTOR
        )
      ).filter((root) => {
        if (
          !root.isConnected ||
          closest(root, USER_SELECTOR)
        ) {
          return false;
        }

        /*
         * 중첩된 ms-cmark-node라면
         * 가장 바깥쪽 루트만 처리한다.
         */
        const parentRoot =
          root.parentElement
            ? closest(
                root.parentElement,
                REPAIR_ROOT_SELECTOR
              )
            : null;

        return !parentRoot;
      });

    const selected =
      all.filter(nearViewport);

    /*
     * 현재 및 최근 답변은 화면 판정과
     * 상관없이 항상 확인한다.
     */
    all.slice(-4).forEach((root) => {
      if (!selected.includes(root)) {
        selected.push(root);
      }
    });

    return selected;
  }

  function lastModelTurn() {
    const models =
      document.querySelectorAll(
        [
          'ms-chat-turn .chat-turn-container.model',
          'ms-chat-turn [data-turn-role="Model"]'
        ].join(',')
      );

    const last =
      models[models.length - 1];

    if (!last) {
      return null;
    }

    return (
      closest(last, 'ms-chat-turn') ||
      last
    );
  }

  function visible(element) {
    if (
      !element ||
      !element.isConnected
    ) {
      return false;
    }

    const style =
      getComputedStyle(element);

    const rect =
      element.getBoundingClientRect();

    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function generating() {
    const runButton =
      document.querySelector(
        'button.run-button'
      );

    const label =
      runButton
        ? [
            runButton.getAttribute(
              'aria-label'
            ) || '',

            runButton.getAttribute(
              'title'
            ) || '',

            runButton.textContent || ''
          ].join(' ')
        : '';

    if (
      runButton &&
      visible(runButton) &&
      /(?:stop|cancel|abort|중지|정지|취소)/i.test(
        label
      )
    ) {
      return true;
    }

    const indicators =
      document.querySelectorAll(
        [
          'ms-chat-turn .chat-turn-container.model [aria-busy="true"]',
          'ms-chat-turn .chat-turn-container.model mat-progress-spinner',
          'ms-chat-turn .chat-turn-container.model mat-spinner',
          'ms-chat-turn .chat-turn-container.model [role="progressbar"]'
        ].join(',')
      );

    return Array.from(
      indicators
    ).some(visible);
  }

  function scan() {
    pending = false;

    if (document.hidden) {
      return;
    }

    const now = Date.now();
    const roots = collectRoots();
    const lastTurn = lastModelTurn();
    const pageGenerating = generating();

    for (const root of roots) {
      const text =
        root.textContent || '';

      if (!hasPair(text)) {
        states.delete(root);
        continue;
      }

      let state =
        states.get(root);

      /*
       * 텍스트가 바뀌었다면 생성이나 렌더링이
       * 진행 중일 수 있으므로 대기 시간을 재설정한다.
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

      const turn =
        closest(
          root,
          'ms-chat-turn'
        ) ||
        closest(
          root,
          '.chat-turn-container.model'
        );

      const wait =
        turn &&
        lastTurn &&
        turn === lastTurn
          ? LAST_TURN_WAIT_MS
          : OLD_TURN_WAIT_MS;

      if (
        pageGenerating &&
        turn &&
        lastTurn &&
        turn === lastTurn
      ) {
        continue;
      }

      const attempts =
        state.attempts || 0;

      const retryWait =
        Math.min(
          RETRY_MAX_MS,
          RETRY_BASE_MS *
            Math.pow(
              2,
              Math.min(attempts, 4)
            )
        );

      if (
        now - state.since < wait ||
        (
          state.attempted === text &&
          now - (state.lastAttemptAt || 0) <
            retryWait
        )
      ) {
        continue;
      }

      state.attempted = text;

      const repaired =
        repairRoot(root);

      const after =
        root.textContent || '';

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
    if (pending) {
      return;
    }

    pending = true;

    window.setTimeout(() => {
      if (
        typeof window.requestIdleCallback ===
        'function'
      ) {
        window.requestIdleCallback(
          scan,
          {
            timeout: 900
          }
        );
      } else {
        scan();
      }
    }, delay);
  }

  function shouldObserveMutationTarget(node) {
    const element =
      elementOf(node);

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

    observer =
      new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (
            shouldObserveMutationTarget(
              mutation.target
            )
          ) {
            schedule(300);
            return;
          }

          for (
            const node of mutation.addedNodes || []
          ) {
            if (
              shouldObserveMutationTarget(node)
            ) {
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
    const html =
      document.documentElement;

    if (!html) {
      return;
    }

    if (
      html.getAttribute(VERSION_ATTR) ===
      VERSION
    ) {
      return;
    }

    html.setAttribute(
      VERSION_ATTR,
      VERSION
    );

    html.setAttribute(
      'data-aistudio-mobile-fix',
      'safe-completed-model-dom-repair'
    );

    installStyle();
    installObserver();
    schedule(250);

    window.setInterval(
      schedule,
      SCAN_MS
    );

    window.addEventListener(
      'pageshow',
      () => schedule(150),
      {
        passive: true
      }
    );

    window.addEventListener(
      'scroll',
      () => schedule(250),
      {
        passive: true
      }
    );

    window.addEventListener(
      'popstate',
      () => schedule(300),
      {
        passive: true
      }
    );

    document.addEventListener(
      'visibilitychange',
      () => {
        if (!document.hidden) {
          schedule(150);
        }
      },
      {
        passive: true
      }
    );
  }

  boot();
}());
