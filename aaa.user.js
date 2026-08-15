// ==UserScript==
// @name         Google AI Studio KaTeX/Markdown Display Fix Mobile (Hybrid Safe)
// @namespace    https://aistudio.google.com/
// @version      1.6.5
// @description  Mobile-safe display fixes, raw array/aligned recovery, Markdown repairs, and guarded session keepalive.
// @author       Codex
// @match        https://aistudio.google.com/*
// @match        https://*.aistudio.google.com/*
// @run-at       document-idle
// @inject-into  auto
// @noframes
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '1.6.5';
  const STYLE_ID = 'aistudio-mobile-safe-165-style';
  const VERSION_ATTR = 'data-aistudio-mobile-safe-165';

  /*
   * CSS-only만 쓰면 raw **bold**를 실제 굵게 만들 수 없다.
   * 그래서 이 버전은 "완료된 모델 출력"의 raw Markdown만 아주 보수적으로 고친다.
   *
   * 안전을 위해 하지 않는 것:
   * - 생성 중 최신 답변 수정
   * - KaTeX / MathJax 내부 수정
   * - code / pre / link / input 내부 수정
   * - 링크, 코드, 수식, 블록 경계를 가로질러 **bold**를 합치기
   *
   * v1.5.2 핵심:
   * - display 수식에 overflow-x: auto를 주지 않는다.
   * - 수식 위아래 clipping / 세로 스크롤 발생을 막기 위해 overflow: visible을 우선한다.
   */
  const ENABLE_SAFE_OUTPUT_REPAIR = true;

  const SCAN_MS = 10000;
  const MUTATION_SCAN_DELAY_MS = 450;
  const OLD_TURN_WAIT_MS = 500;
  const LAST_TURN_WAIT_MS = 1500;
  const RETRY_BASE_MS = 2000;
  const RETRY_MAX_MS = 30000;
  const MAX_MATCH_INNER_LENGTH = 2000;
  const MAX_INLINE_REPAIR_LENGTH = 12000;
  const MAX_RAW_MATH_LENGTH = 12000;

  const ENABLE_SESSION_KEEPALIVE = true;
  const AUTH_EXPIRY_MARGIN_MS = 10 * 60 * 1000;
  const AUTH_HEARTBEAT_MS = 5 * 60 * 1000;
  const SESSION_FRESH_MS = 90 * 1000;
  const SESSION_PREFLIGHT_TIMEOUT_MS = 6000;
  const RECOVERY_STATUS_ID = 'aistudio-session-recovery-status';

  const RUN_BUTTON_SELECTOR = [
    'button[type="submit"]',
    'button.ctrl-enter-submits',
    'button.run-button'
  ].join(',');

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

  const MODEL_ACTIVITY_SELECTOR = MODEL_TURN_SELECTOR
    .split(',')
    .flatMap((turnSelector) => [
      '[aria-busy="true"]',
      'mat-progress-spinner',
      'mat-spinner',
      '[role="progressbar"]'
    ].map((activitySelector) => (
      `${turnSelector.trim()} ${activitySelector}`
    )))
    .join(',');

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
    '.aistudio-md-repaired',
    '.aistudio-array-repaired',
    '.aistudio-aligned-repaired'
  ].join(',');

  const INLINE_REPAIR_CONTAINER_SELECTOR = [
    'ms-cmark-node',
    'p',
    'li',
    'dd',
    'dt',
    'figcaption',
    'summary',
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

  const RAW_MATH_CONTAINER_SELECTOR = [
    'p',
    'li',
    'blockquote',
    'figcaption',
    'ms-cmark-node'
  ].join(',');

  const INLINE_REPAIR_BOUNDARY_SELECTOR = [
    'br',
    'hr',
    'a',
    'strong',
    'b',
    'code',
    'pre',
    'kbd',
    'samp',
    'script',
    'style',
    'noscript',
    'svg',
    'math',
    'textarea',
    'input',
    'select',
    'button',
    '[contenteditable="true"]',
    '[role="textbox"]',
    '.katex',
    'ms-katex',
    '.MathJax',
    'mjx-container',
    'ms-cmark-node',
    'p',
    'div',
    'li',
    'dd',
    'dt',
    'figcaption',
    'summary',
    'blockquote',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'th',
    'td',
    'ul',
    'ol'
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
    'aistudio-mobile-safe-150-style',
    'aistudio-mobile-safe-151-style',
    'aistudio-mobile-safe-152-style',
    'aistudio-mobile-safe-160-style',
    'aistudio-mobile-safe-161-style',
    'aistudio-mobile-safe-162-style',
    'aistudio-mobile-safe-163-style',
    'aistudio-mobile-safe-164-style'
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

/*
 * AI Studio가 raw \\begin{array} 블록의 명령/행 구분 백슬래시를
 * 일부 잃어버린 경우에만 쓰는 보수적인 HTML fallback이다.
 */
${SCOPE} .aistudio-array-repaired {
  display: inline-table !important;
  max-width: 100% !important;
  margin: 0.65em auto !important;
  border-collapse: collapse !important;
  font-family: var(--as-font) !important;
  font-size: 1em !important;
  line-height: 1.45 !important;
  vertical-align: middle !important;
}

${SCOPE} .aistudio-array-row {
  display: table-row !important;
}

${SCOPE} .aistudio-array-cell {
  display: table-cell !important;
  padding: 0.12em 0.45em !important;
  white-space: nowrap !important;
  overflow-wrap: normal !important;
  word-break: normal !important;
  vertical-align: baseline !important;
}

${SCOPE} .aistudio-array-align-l {
  text-align: left !important;
}

${SCOPE} .aistudio-array-align-c {
  text-align: center !important;
}

${SCOPE} .aistudio-array-align-r {
  text-align: right !important;
}

${SCOPE} .aistudio-array-divider {
  border-left: 1px solid currentColor !important;
}

/*
 * 깨진 \\begin{aligned} 블록을 수식의 & 정렬점에 맞춰 복원한다.
 */
${SCOPE} .aistudio-aligned-repaired {
  display: inline-table !important;
  max-width: 100% !important;
  margin: 0.65em auto !important;
  border-collapse: collapse !important;
  font-family: var(--as-font) !important;
  font-size: 1em !important;
  line-height: 1.55 !important;
  vertical-align: middle !important;
}

${SCOPE} .aistudio-aligned-row {
  display: table-row !important;
}

${SCOPE} .aistudio-aligned-cell {
  display: table-cell !important;
  padding: 0.12em 0 !important;
  white-space: nowrap !important;
  overflow-wrap: normal !important;
  word-break: normal !important;
  vertical-align: baseline !important;
}

${SCOPE} .aistudio-aligned-anchor {
  padding-right: 0.22em !important;
  text-align: right !important;
}

${SCOPE} .aistudio-aligned-expression {
  padding-left: 0.08em !important;
  text-align: left !important;
}

${SCOPE} .aistudio-tex-bold {
  font-weight: var(--as-bold) !important;
}

${SCOPE} .aistudio-md-bold-italic {
  font-style: italic !important;
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

/*
 * KaTeX / MathJax 안전 처리.
 *
 * display 수식에는 overflow-x: auto를 주지 않는다.
 * overflow-x: auto + overflow-y: visible 조합은 브라우저에서
 * 실제로 세로 clipping 또는 세로 스크롤 컨테이너처럼 동작할 수 있다.
 *
 * 그래서 수식은 위아래 보존을 우선하고, overflow: visible로 둔다.
 * 아주 긴 수식은 화면 오른쪽으로 넘칠 수 있지만, 수식 자체가 잘리는 것보다는 안전하다.
 */
${SCOPE} :where(
  ms-katex.display,
  .katex-display,
  mjx-container[display="true"]
) {
  display: block !important;
  max-width: 100% !important;

  overflow: visible !important;
  overflow-x: visible !important;
  overflow-y: visible !important;

  box-sizing: border-box !important;

  padding-top: 0.35em !important;
  padding-bottom: 0.35em !important;
  margin-top: 0.65em !important;
  margin-bottom: 0.65em !important;
}

/*
 * 수식 내부는 일반 텍스트 줄바꿈 규칙의 영향을 받지 않게 한다.
 */
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

/*
 * 인라인 수식은 중간에서 부서지지 않게 한다.
 * .katex 전체에 nowrap을 걸면 display 수식에도 영향을 줄 수 있으므로 제외한다.
 */
${SCOPE} :where(
  ms-katex:not(.display),
  mjx-container:not([display="true"])
) {
  white-space: nowrap !important;
}

/*
 * KaTeX display 내부도 세로 clipping을 막는다.
 */
${SCOPE} :where(
  .katex-display,
  .katex-display > .katex,
  .katex-display > .katex *,
  ms-katex.display,
  ms-katex.display *,
  mjx-container[display="true"],
  mjx-container[display="true"] *
) {
  overflow: visible !important;
}

/*
 * display 수식 내부 본체가 부모 폭 안에서 가능한 한 자연스럽게 놓이도록 한다.
 */
${SCOPE} :where(.katex-display > .katex) {
  max-width: 100% !important;
}

/*
 * details/summary, blockquote 같은 Markdown 부가 요소도 모바일에서 폭을 넘지 않게 한다.
 */
${SCOPE} :where(details, blockquote) {
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
}

/*
 * 긴 단어가 있는 제목이 모바일에서 화면을 밀지 않게 한다.
 */
${SCOPE} :where(h1, h2, h3, h4, h5, h6) {
  overflow-wrap: anywhere !important;
  word-break: normal !important;
}

#${RECOVERY_STATUS_ID} {
  position: fixed !important;
  right: max(12px, env(safe-area-inset-right)) !important;
  bottom: max(12px, env(safe-area-inset-bottom)) !important;
  z-index: 2147483647 !important;
  max-width: min(88vw, 420px) !important;
  padding: 10px 13px !important;
  border: 1px solid rgba(255, 255, 255, 0.18) !important;
  border-radius: 12px !important;
  background: rgba(32, 33, 36, 0.94) !important;
  color: #fff !important;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.28) !important;
  font: 500 13px/1.45 var(--as-font) !important;
  pointer-events: none !important;
  opacity: 0 !important;
  transform: translateY(8px) !important;
  transition: opacity 160ms ease, transform 160ms ease !important;
}

#${RECOVERY_STATUS_ID}[data-visible="true"] {
  opacity: 1 !important;
  transform: translateY(0) !important;
}
`;

  const states = new WeakMap();

  let cleanedLegacy = false;
  let pending = false;
  let observer = null;
  let authRefreshPromise = null;
  let sessionRefreshPromise = null;
  let runPreflightPromise = null;
  let lastSessionRefreshAt = 0;
  let bypassRunPreflight = false;
  let statusTimer = null;

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
      style = document.createElement('style');
      style.textContent = CSS_TEXT;
      parent.appendChild(style);

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

  function hasLiteralTableBreak(text) {
    return Boolean(
      text &&
      /<br\s*\/?\s*>/i.test(text)
    );
  }

  function hasRawArrayText(text) {
    return Boolean(
      text &&
      text.length <= MAX_RAW_MATH_LENGTH &&
      /(?:^|\s)(?:\\)?begin\s*\{array\}\s*\{[lcr|\s]+\}/i.test(text) &&
      /(?:\\)?end\s*\{array\}(?:\s|$)/i.test(text)
    );
  }

  function hasRawAlignedText(text) {
    return Boolean(
      text &&
      text.length <= MAX_RAW_MATH_LENGTH &&
      /(?:^|\s)(?:\\)?begin\s*\{aligned\}/i.test(text) &&
      /(?:\\)?end\s*\{aligned\}(?:\s|$)/i.test(text)
    );
  }

  function hasRepairableText(text) {
    return (
      hasPair(text) ||
      hasLiteralTableBreak(text) ||
      hasRawArrayText(text) ||
      hasRawAlignedText(text)
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

  function parseArrayColumns(specification) {
    const alignments = [];
    const dividers = [];
    let dividerPending = false;

    for (const character of specification || '') {
      if (character === '|') {
        dividerPending = true;
        continue;
      }

      if (!/[lcr]/i.test(character)) {
        if (!/\s/.test(character)) {
          return null;
        }
        continue;
      }

      if (dividerPending) {
        dividers.push(alignments.length);
        dividerPending = false;
      }

      alignments.push(character.toLowerCase());
    }

    if (!alignments.length || alignments.length > 12) {
      return null;
    }

    return { alignments, dividers };
  }

  function splitRawMathRows(body) {
    const rows = [];
    let current = '';
    let depth = 0;

    const finishRow = () => {
      if (current.trim()) {
        rows.push(current.trim());
      }
      current = '';
    };

    for (let index = 0; index < body.length; index += 1) {
      const character = body[index];

      if (character === '{' && !isEscaped(body, index)) {
        depth += 1;
      } else if (
        character === '}' &&
        !isEscaped(body, index) &&
        depth > 0
      ) {
        depth -= 1;
      }

      if (character === '\\' && depth === 0) {
        if (body[index + 1] === '\\') {
          finishRow();
          index += 1;
          continue;
        }

        let cursor = index + 1;

        while (body[cursor] === ' ' || body[cursor] === '\t') {
          cursor += 1;
        }

        if (body[cursor] === '\r') {
          cursor += 1;
        }

        if (body[cursor] === '\n' || cursor >= body.length) {
          finishRow();
          index = cursor;
          continue;
        }
      }

      current += character;
    }

    finishRow();
    return rows;
  }

  function splitRawMathCells(row) {
    const cells = [];
    let current = '';
    let depth = 0;

    for (let index = 0; index < row.length; index += 1) {
      const character = row[index];

      if (character === '{' && !isEscaped(row, index)) {
        depth += 1;
      } else if (
        character === '}' &&
        !isEscaped(row, index) &&
        depth > 0
      ) {
        depth -= 1;
      }

      if (
        character === '&' &&
        depth === 0 &&
        !isEscaped(row, index)
      ) {
        cells.push(current.trim());
        current = '';
        continue;
      }

      current += character;
    }

    cells.push(current.trim());
    return cells;
  }

  function plainArrayCellText(source) {
    let text = (source || '').trim();
    let previous;

    do {
      previous = text;
      text = text.replace(/\\text\s*\{([^{}]*)\}/gi, '$1');
    } while (text !== previous);

    return text
      .replace(/\\(?:qquad|quad)\b/g, ' ')
      .replace(/\\[,;:!]/g, ' ')
      .replace(/\\([&%_#$\\{}])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function readTexGroup(source, openingIndex) {
    if (!source || source[openingIndex] !== '{') {
      return null;
    }

    let depth = 0;

    for (
      let index = openingIndex;
      index < source.length;
      index += 1
    ) {
      if (isEscaped(source, index)) {
        continue;
      }

      if (source[index] === '{') {
        depth += 1;
      } else if (source[index] === '}') {
        depth -= 1;

        if (depth === 0) {
          return {
            content: source.slice(openingIndex + 1, index),
            end: index
          };
        }
      }
    }

    return null;
  }

  function appendTexRun(runs, text, bold) {
    if (!text) {
      return;
    }

    const previous = runs[runs.length - 1];

    if (previous && previous.bold === bold) {
      previous.text += text;
      return;
    }

    runs.push({ text, bold });
  }

  function simpleTexRuns(source, inheritedBold = false) {
    const runs = [];
    let bold = inheritedBold;
    let index = 0;

    const appendChildRuns = (childRuns) => {
      for (const run of childRuns) {
        appendTexRun(runs, run.text, run.bold);
      }
    };

    while (index < source.length) {
      const character = source[index];

      if (character === '{') {
        const group = readTexGroup(source, index);

        if (group) {
          appendChildRuns(simpleTexRuns(group.content, bold));
          index = group.end + 1;
          continue;
        }
      }

      if (character !== '\\') {
        if (character !== '}') {
          appendTexRun(runs, character, bold);
        }
        index += 1;
        continue;
      }

      const commandMatch = source.slice(index + 1).match(/^([A-Za-z]+|.)/);

      if (!commandMatch) {
        appendTexRun(runs, '\\', bold);
        index += 1;
        continue;
      }

      const command = commandMatch[1];
      const lowerCommand = command.toLowerCase();
      let next = index + 1 + command.length;

      while (/\s/.test(source[next] || '')) {
        next += 1;
      }

      if (lowerCommand === 'bf' || lowerCommand === 'bfseries') {
        bold = true;
        index = next;
        continue;
      }

      const normalGroupCommands = new Set([
        'text',
        'textrm',
        'textnormal',
        'mathrm',
        'operatorname',
        'mbox'
      ]);
      const boldGroupCommands = new Set([
        'textbf',
        'mathbf',
        'boldsymbol'
      ]);

      if (
        source[next] === '{' &&
        (
          normalGroupCommands.has(lowerCommand) ||
          boldGroupCommands.has(lowerCommand)
        )
      ) {
        const group = readTexGroup(source, next);

        if (group) {
          appendChildRuns(simpleTexRuns(
            group.content,
            bold || boldGroupCommands.has(lowerCommand)
          ));
          index = group.end + 1;
          continue;
        }
      }

      if (lowerCommand === 'frac' && source[next] === '{') {
        const numerator = readTexGroup(source, next);
        let denominatorStart = numerator ? numerator.end + 1 : next;

        while (/\s/.test(source[denominatorStart] || '')) {
          denominatorStart += 1;
        }

        const denominator = source[denominatorStart] === '{'
          ? readTexGroup(source, denominatorStart)
          : null;

        if (numerator && denominator) {
          appendTexRun(runs, '(', bold);
          appendChildRuns(simpleTexRuns(numerator.content, bold));
          appendTexRun(runs, ')/(', bold);
          appendChildRuns(simpleTexRuns(denominator.content, bold));
          appendTexRun(runs, ')', bold);
          index = denominator.end + 1;
          continue;
        }
      }

      if (lowerCommand === 'sqrt' && source[next] === '{') {
        const group = readTexGroup(source, next);

        if (group) {
          appendTexRun(runs, '√(', bold);
          appendChildRuns(simpleTexRuns(group.content, bold));
          appendTexRun(runs, ')', bold);
          index = group.end + 1;
          continue;
        }
      }

      const symbols = {
        approx: '≈',
        cdot: '·',
        ge: '≥',
        geq: '≥',
        infty: '∞',
        le: '≤',
        leq: '≤',
        neq: '≠',
        pm: '±',
        times: '×',
        to: '→'
      };

      if (Object.prototype.hasOwnProperty.call(symbols, lowerCommand)) {
        appendTexRun(runs, symbols[lowerCommand], bold);
        index = next;
        continue;
      }

      if (lowerCommand === 'quad' || lowerCommand === 'qquad') {
        appendTexRun(runs, ' ', bold);
        index = next;
        continue;
      }

      if ([',', ';', ':', '!'].includes(command)) {
        appendTexRun(runs, ' ', bold);
        index = next;
        continue;
      }

      if (['left', 'right'].includes(lowerCommand)) {
        index = next;
        continue;
      }

      if (/^[&%_#$\\{}]$/.test(command)) {
        appendTexRun(runs, command, bold);
        index = next;
        continue;
      }

      appendTexRun(runs, `\\${command}`, bold);
      index = next;
    }

    return runs;
  }

  function appendSimpleTex(parent, source) {
    for (const run of simpleTexRuns(source)) {
      if (run.bold) {
        const strong = document.createElement('strong');
        strong.className = 'aistudio-tex-bold';
        strong.textContent = run.text;
        parent.appendChild(strong);
      } else {
        parent.appendChild(document.createTextNode(run.text));
      }
    }
  }

  function parseRawAligned(text) {
    if (!hasRawAlignedText(text)) {
      return null;
    }

    const source = text.trim();
    const opening = source.match(
      /^(?:\\)?begin\s*\{aligned\}/i
    );

    if (!opening) {
      return null;
    }

    const remainder = source.slice(opening[0].length);
    const closing = remainder.match(
      /(?:\\)?end\s*\{aligned\}\s*$/i
    );

    if (!closing || typeof closing.index !== 'number') {
      return null;
    }

    const body = remainder.slice(0, closing.index).trim();

    if (!body || !body.includes('&')) {
      return null;
    }

    const rows = splitRawMathRows(body).map(splitRawMathCells);
    const columnCount = Math.max(0, ...rows.map((row) => row.length));

    if (
      !rows.length ||
      columnCount < 2 ||
      columnCount > 8
    ) {
      return null;
    }

    for (const row of rows) {
      while (row.length < columnCount) {
        row.push('');
      }
    }

    return { rows };
  }

  function createRepairedAligned(parsed) {
    const aligned = document.createElement('span');
    aligned.className = 'aistudio-aligned-repaired';
    aligned.setAttribute('data-aistudio-aligned-repaired', '1');
    aligned.setAttribute('role', 'table');

    for (const rowValues of parsed.rows) {
      const row = document.createElement('span');
      row.className = 'aistudio-aligned-row';
      row.setAttribute('role', 'row');

      rowValues.forEach((value, index) => {
        const cell = document.createElement('span');
        const alignmentClass = index % 2 === 0
          ? 'aistudio-aligned-anchor'
          : 'aistudio-aligned-expression';

        cell.className = `aistudio-aligned-cell ${alignmentClass}`;
        cell.setAttribute('role', 'cell');
        appendSimpleTex(cell, value);
        row.appendChild(cell);
      });

      aligned.appendChild(row);
    }

    return aligned;
  }

  function parseRawArray(text) {
    if (!hasRawArrayText(text)) {
      return null;
    }

    const source = text.trim();
    const opening = source.match(
      /^(?:\\)?begin\s*\{array\}\s*\{([lcr|\s]+)\}/i
    );

    if (!opening) {
      return null;
    }

    const remainder = source.slice(opening[0].length);
    const closing = remainder.match(
      /(?:\\)?end\s*\{array\}\s*$/i
    );

    if (!closing || typeof closing.index !== 'number') {
      return null;
    }

    const columns = parseArrayColumns(opening[1]);
    const body = remainder.slice(0, closing.index).trim();

    if (!columns || !body || !body.includes('&')) {
      return null;
    }

    const rows = splitRawMathRows(body).map(splitRawMathCells);

    if (
      !rows.length ||
      rows.some((row) => row.length > columns.alignments.length)
    ) {
      return null;
    }

    for (const row of rows) {
      while (row.length < columns.alignments.length) {
        row.push('');
      }
    }

    return {
      alignments: columns.alignments,
      dividers: columns.dividers,
      rows: rows.map((row) => row.map(plainArrayCellText))
    };
  }

  function createRepairedArray(parsed) {
    const array = document.createElement('span');
    array.className = 'aistudio-array-repaired';
    array.setAttribute('data-aistudio-array-repaired', '1');
    array.setAttribute('role', 'table');

    for (const rowValues of parsed.rows) {
      const row = document.createElement('span');
      row.className = 'aistudio-array-row';
      row.setAttribute('role', 'row');

      rowValues.forEach((value, index) => {
        const cell = document.createElement('span');
        const alignment = parsed.alignments[index] || 'l';
        const divider = parsed.dividers.includes(index)
          ? ' aistudio-array-divider'
          : '';

        cell.className =
          `aistudio-array-cell aistudio-array-align-${alignment}${divider}`;
        cell.setAttribute('role', 'cell');
        cell.textContent = value;
        row.appendChild(cell);
      });

      array.appendChild(row);
    }

    return array;
  }

  function repairRawAlignedContainer(container) {
    if (
      !container ||
      !container.isConnected ||
      closest(container, USER_SELECTOR) ||
      closest(container, SKIP_SELECTOR) ||
      (
        container.querySelector &&
        container.querySelector(
          'a, code, pre, table, svg, math, .katex, ms-katex, ' +
          '.MathJax, mjx-container, .aistudio-array-repaired, ' +
          '.aistudio-aligned-repaired'
        )
      )
    ) {
      return 0;
    }

    const sources = [
      container.textContent || '',
      typeof container.innerText === 'string'
        ? container.innerText
        : ''
    ];
    let parsed = null;

    for (const source of sources) {
      parsed = parseRawAligned(source);
      if (parsed) {
        break;
      }
    }

    if (!parsed || typeof container.replaceChildren !== 'function') {
      return 0;
    }

    container.replaceChildren(createRepairedAligned(parsed));
    return 1;
  }

  function repairRawAligned(root) {
    if (!root || !root.querySelectorAll) {
      return 0;
    }

    const containers = Array.from(
      root.querySelectorAll(RAW_MATH_CONTAINER_SELECTOR)
    ).reverse();

    if (
      root.matches &&
      root.matches(RAW_MATH_CONTAINER_SELECTOR)
    ) {
      containers.push(root);
    }

    let repaired = 0;

    for (const container of containers) {
      repaired += repairRawAlignedContainer(container);
    }

    return repaired;
  }

  function repairRawArrayContainer(container) {
    if (
      !container ||
      !container.isConnected ||
      closest(container, USER_SELECTOR) ||
      closest(container, SKIP_SELECTOR) ||
      (
        container.querySelector &&
        container.querySelector(
          'a, code, pre, table, svg, math, .katex, ms-katex, ' +
          '.MathJax, mjx-container, .aistudio-array-repaired, ' +
          '.aistudio-aligned-repaired'
        )
      )
    ) {
      return 0;
    }

    const sources = [
      container.textContent || '',
      typeof container.innerText === 'string'
        ? container.innerText
        : ''
    ];
    let parsed = null;

    for (const source of sources) {
      parsed = parseRawArray(source);
      if (parsed) {
        break;
      }
    }

    if (!parsed || typeof container.replaceChildren !== 'function') {
      return 0;
    }

    container.replaceChildren(createRepairedArray(parsed));
    return 1;
  }

  function repairRawArrays(root) {
    if (!root || !root.querySelectorAll) {
      return 0;
    }

    const containers = Array.from(
      root.querySelectorAll(RAW_MATH_CONTAINER_SELECTOR)
    ).reverse();

    if (
      root.matches &&
      root.matches(RAW_MATH_CONTAINER_SELECTOR)
    ) {
      containers.push(root);
    }

    let repaired = 0;

    for (const container of containers) {
      repaired += repairRawArrayContainer(container);
    }

    return repaired;
  }

  function isWordChar(character) {
    return Boolean(
      character &&
      /[0-9A-Za-z_\u00C0-\uFFFF]/.test(character)
    );
  }

  function findMatches(text) {
    const result = [];
    const regex = /(\*\*\*|___|\*\*|__)(\S(?:[\s\S]*?\S)?)\1/g;

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
       * 네 개 이상의 연속 마커나 중첩 마커 일부를 잘못 잡지 않는다.
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
        markerCharacter === '_' &&
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
        raw: match[0],
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

  function createRepairedStrong(text, marker = '**') {
    const strong = document.createElement('strong');
    strong.className = marker.length === 3
      ? 'aistudio-md-repaired aistudio-md-bold-italic'
      : 'aistudio-md-repaired';
    strong.setAttribute('data-aistudio-md-repaired', '1');
    strong.setAttribute(
      'data-aistudio-md-emphasis',
      marker.length === 3 ? 'bold-italic' : 'bold'
    );
    strong.textContent = text;
    return strong;
  }

  function appendBoldRepairedText(fragment, text) {
    const matches = findMatches(text);

    if (!matches.length) {
      fragment.appendChild(document.createTextNode(text));
      return 0;
    }

    let cursor = 0;

    for (const match of matches) {
      if (match.start > cursor) {
        fragment.appendChild(
          document.createTextNode(
            text.slice(cursor, match.start)
          )
        );
      }

      fragment.appendChild(
        createRepairedStrong(match.inner, match.marker)
      );
      cursor = match.end;
    }

    if (cursor < text.length) {
      fragment.appendChild(
        document.createTextNode(
          text.slice(cursor)
        )
      );
    }

    return matches.length;
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
     * findMatches가 수식 자체를 포함한 강조만 제외한다. 같은 텍스트
     * 노드의 다른 위치에 있는 raw 수식 표기는 그대로 보존한다.
     */
    if (!hasPair(text)) {
      return 0;
    }

    const fragment = document.createDocumentFragment();
    const repaired = appendBoldRepairedText(fragment, text);

    if (!repaired) {
      return 0;
    }

    textNode.parentNode.replaceChild(fragment, textNode);

    return repaired;
  }

  function repairTableBreakTextNode(textNode) {
    if (
      !textNode ||
      !textNode.parentNode ||
      !textNode.isConnected ||
      skipped(textNode)
    ) {
      return 0;
    }

    const cell = closest(textNode.parentElement, 'th, td');
    const text = textNode.nodeValue || '';

    if (
      !cell ||
      !hasLiteralTableBreak(text) ||
      hasMathLikeText(text)
    ) {
      return 0;
    }

    const parts = text.split(/(<br\s*\/?\s*>)/gi);
    const fragment = document.createDocumentFragment();
    let repaired = 0;

    for (const part of parts) {
      if (!part) {
        continue;
      }

      if (/^<br\s*\/?\s*>$/i.test(part)) {
        fragment.appendChild(createRepairedTableBreak());
        repaired += 1;
      } else {
        repaired += appendBoldRepairedText(fragment, part);
      }
    }

    if (!repaired) {
      return 0;
    }

    textNode.parentNode.replaceChild(fragment, textNode);
    return repaired;
  }

  function createRepairedTableBreak() {
    const lineBreak = document.createElement('br');
    lineBreak.className = 'aistudio-table-br-repaired';
    lineBreak.setAttribute('data-aistudio-table-br-repaired', '1');
    return lineBreak;
  }

  function textPosition(records, offset, endPosition = false) {
    for (const record of records) {
      const inside = endPosition
        ? offset > record.start && offset <= record.end
        : offset >= record.start && offset < record.end;

      if (inside) {
        return {
          node: record.node,
          offset: offset - record.start
        };
      }
    }

    return null;
  }

  function repairSplitTableBreaksInCell(cell) {
    if (!cell || !cell.isConnected || !hasLiteralTableBreak(cell.textContent || '')) {
      return 0;
    }

    const groups = [];
    const walker = document.createTreeWalker(
      cell,
      NodeFilter.SHOW_TEXT
    );
    let currentGroup = null;

    while (walker.nextNode()) {
      const textNode = walker.currentNode;

      if (!textNode.nodeValue) {
        continue;
      }

      if (
        skipped(textNode) ||
        closest(textNode.parentElement, 'th, td') !== cell
      ) {
        currentGroup = null;
        continue;
      }

      const block = closest(
        textNode.parentElement,
        'p, div, li, dd, dt, blockquote, figcaption'
      ) || cell;

      if (!currentGroup || currentGroup.block !== block) {
        currentGroup = {
          block,
          textNodes: []
        };
        groups.push(currentGroup);
      }

      currentGroup.textNodes.push(textNode);
    }

    let repaired = 0;

    for (const group of groups) {
      const records = [];
      let text = '';

      for (const textNode of group.textNodes) {
        const value = textNode.nodeValue || '';
        const start = text.length;
        text += value;
        records.push({
          node: textNode,
          start,
          end: text.length
        });
      }

      const matches = Array.from(text.matchAll(/<br\s*\/?\s*>/gi));

      for (let index = matches.length - 1; index >= 0; index -= 1) {
        const match = matches[index];
        const start = textPosition(records, match.index, false);
        const end = textPosition(
          records,
          match.index + match[0].length,
          true
        );

        if (!start || !end) {
          continue;
        }

        const range = document.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);

        const selected = range.cloneContents();

        if (
          selected.querySelector &&
          selected.querySelector(
            'br, a, strong, b, code, pre, kbd, samp, script, style, noscript, svg, math, ' +
            'textarea, input, select, [contenteditable="true"], [role="textbox"], ' +
            '.katex, ms-katex, .MathJax, mjx-container'
          )
        ) {
          if (typeof range.detach === 'function') {
            range.detach();
          }
          continue;
        }

        range.deleteContents();
        range.insertNode(createRepairedTableBreak());
        if (typeof range.detach === 'function') {
          range.detach();
        }
        repaired += 1;
      }
    }

    return repaired;
  }

  function repairSplitTableBreaks(root) {
    if (!root || !root.querySelectorAll) {
      return 0;
    }

    let repaired = 0;
    const cells = [];

    if (root.matches && root.matches('th, td')) {
      cells.push(root);
    }

    cells.push(...root.querySelectorAll('th, td'));

    for (const cell of cells) {
      repaired += repairSplitTableBreaksInCell(cell);
    }

    return repaired;
  }

  function repairTextRecordForMatch(record, match) {
    const textNode = record && record.node;

    if (
      !textNode ||
      !textNode.parentNode ||
      !textNode.isConnected
    ) {
      return false;
    }

    const text = textNode.nodeValue || '';
    const markerLength = match.marker.length;
    const innerStart = match.start + markerLength;
    const innerEnd = match.end - markerLength;
    const overlapStart = Math.max(record.start, match.start);
    const overlapEnd = Math.min(record.end, match.end);

    if (overlapEnd <= overlapStart) {
      return false;
    }

    const localBoundaries = Array.from(new Set([
      0,
      text.length,
      match.start - record.start,
      innerStart - record.start,
      innerEnd - record.start,
      match.end - record.start
    ].map((offset) => (
      Math.max(0, Math.min(text.length, offset))
    )))).sort((left, right) => left - right);

    const fragment = document.createDocumentFragment();

    for (
      let index = 0;
      index < localBoundaries.length - 1;
      index += 1
    ) {
      const localStart = localBoundaries[index];
      const localEnd = localBoundaries[index + 1];

      if (localEnd <= localStart) {
        continue;
      }

      const part = text.slice(localStart, localEnd);
      const globalStart = record.start + localStart;
      const globalEnd = record.start + localEnd;
      const insideOpeningMarker =
        globalStart >= match.start &&
        globalEnd <= innerStart;
      const insideClosingMarker =
        globalStart >= innerEnd &&
        globalEnd <= match.end;
      const insideContent =
        globalStart >= innerStart &&
        globalEnd <= innerEnd;

      if (insideOpeningMarker || insideClosingMarker) {
        continue;
      }

      fragment.appendChild(
        insideContent
          ? createRepairedStrong(part, match.marker)
          : document.createTextNode(part)
      );
    }

    textNode.parentNode.replaceChild(fragment, textNode);
    return true;
  }

  function repairInlineMatch(container, records, match) {
    const start = textPosition(records, match.start, false);
    const end = textPosition(records, match.end, true);

    if (!start || !end) {
      return false;
    }

    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);

    const selected = range.cloneContents();
    const selectedText = selected.textContent || '';
    const crossesBoundary = Boolean(
      selected.querySelector &&
      selected.querySelector(INLINE_REPAIR_BOUNDARY_SELECTOR)
    );

    if (typeof range.detach === 'function') {
      range.detach();
    }

    if (
      selectedText !== match.raw ||
      crossesBoundary
    ) {
      return false;
    }

    const affected = records.filter((record) => (
      record.end > match.start &&
      record.start < match.end
    ));

    if (!affected.length) {
      return false;
    }

    for (let index = affected.length - 1; index >= 0; index -= 1) {
      repairTextRecordForMatch(affected[index], match);
    }

    return true;
  }

  function repairInlineEmphasisInContainer(container) {
    if (
      !container ||
      !container.isConnected ||
      closest(container, USER_SELECTOR)
    ) {
      return 0;
    }

    const collect = () => {
      const records = [];
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT
      );
      let text = '';

      while (walker.nextNode()) {
        const textNode = walker.currentNode;
        const value = textNode.nodeValue || '';

        if (!value || skipped(textNode)) {
          continue;
        }

        const start = text.length;
        text += value;
        records.push({
          node: textNode,
          start,
          end: text.length
        });
      }

      return { records, text };
    };

    const snapshot = collect();

    if (
      !hasPair(snapshot.text) ||
      snapshot.text.length > MAX_INLINE_REPAIR_LENGTH
    ) {
      return 0;
    }

    const matches = findMatches(snapshot.text);
    let repaired = 0;

    for (let index = matches.length - 1; index >= 0; index -= 1) {
      const current = collect();

      if (
        repairInlineMatch(
          container,
          current.records,
          matches[index]
        )
      ) {
        repaired += 1;
      }
    }

    return repaired;
  }

  function repairInlineEmphasis(root) {
    if (!root || !root.querySelectorAll) {
      return 0;
    }

    const containers = Array.from(
      root.querySelectorAll(INLINE_REPAIR_CONTAINER_SELECTOR)
    );

    if (
      root.matches &&
      root.matches(INLINE_REPAIR_CONTAINER_SELECTOR)
    ) {
      containers.unshift(root);
    } else {
      /*
       * 새 AI Studio 마크업이 별도 문단 래퍼 없이 inline 노드만
       * 출력하는 경우에도 root 자체를 마지막 안전 후보로 사용한다.
       */
      containers.push(root);
    }

    let repaired = 0;

    for (const container of containers) {
      repaired += repairInlineEmphasisInContainer(container);
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

    const rootText = root.textContent || '';

    if (!hasRepairableText(rootText)) {
      return 0;
    }

    let repaired = repairRawAligned(root);
    repaired += repairRawArrays(root);
    repaired += repairSplitTableBreaks(root);
    repaired += repairInlineEmphasis(root);
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(textNode) {
          const value = textNode.nodeValue || '';

          if (!hasRepairableText(value)) {
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

    /*
     * 뒤에서부터 바꿔 앞쪽 노드 참조 영향을 줄인다.
     */
    for (
      let index = textNodes.length - 1;
      index >= 0;
      index -= 1
    ) {
      const tableBreaks = repairTableBreakTextNode(textNodes[index]);

      repaired += tableBreaks;

      if (!tableBreaks) {
        repaired += repairTextNode(textNodes[index]);
      }
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

  function buttonLabel(button) {
    if (!button) {
      return '';
    }

    const primaryLabel = button.querySelector
      ? button.querySelector('.run-button-label')
      : null;

    return [
      primaryLabel ? primaryLabel.textContent || '' : '',
      button.getAttribute ? button.getAttribute('aria-label') || '' : '',
      button.getAttribute ? button.getAttribute('title') || '' : '',
      button.textContent || ''
    ].join(' ').replace(/\s+/g, ' ').trim();
  }

  function isStopActionLabel(label) {
    return /(?:^|\s)(?:stop|cancel|abort|중지|정지|취소)(?:\s|$)/i.test(
      label || ''
    );
  }

  function isRunActionLabel(label) {
    return /(?:^|\s)(?:run|retry|rerun|실행|재시도|다시\s*생성)(?:\s|$)/i.test(
      label || ''
    );
  }

  function canSubmit(button) {
    return Boolean(
      button &&
      !button.disabled &&
      button.getAttribute('aria-disabled') !== 'true'
    );
  }

  function isPromptRunButton(button) {
    if (!button) {
      return false;
    }

    return Boolean(
      (
        button.matches &&
        button.matches('button.ctrl-enter-submits, button.run-button')
      ) ||
      (
        button.querySelector &&
        button.querySelector('.run-button-label')
      )
    );
  }

  function findRunButton() {
    const buttons = Array.from(
      document.querySelectorAll(RUN_BUTTON_SELECTOR)
    );

    return buttons.find((button) => {
      const label = buttonLabel(button);

      return (
        visible(button) &&
        isPromptRunButton(button) &&
        isRunActionLabel(label) &&
        !isStopActionLabel(label)
      );
    }) || null;
  }

  function generating() {
    const activeStopButton = Array.from(
      document.querySelectorAll('button')
    ).some((button) => (
      visible(button) &&
      isStopActionLabel(buttonLabel(button))
    ));

    if (activeStopButton) {
      return true;
    }

    const indicators = document.querySelectorAll(
      MODEL_ACTIVITY_SELECTOR
    );

    return Array.from(indicators).some(visible);
  }

  function showRecoveryStatus(message, visibleForMs = 3500) {
    const parent = document.body || document.documentElement;

    if (!parent) {
      return;
    }

    let status = document.getElementById(RECOVERY_STATUS_ID);

    if (!status) {
      status = document.createElement('div');
      status.id = RECOVERY_STATUS_ID;
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      parent.appendChild(status);
    }

    status.textContent = message;
    status.setAttribute('data-visible', 'true');

    if (statusTimer) {
      window.clearTimeout(statusTimer);
    }

    statusTimer = window.setTimeout(() => {
      status.removeAttribute('data-visible');
    }, visibleForMs);
  }

  function googleAuthUser() {
    try {
      const gapi = window.gapi;
      const auth =
        gapi &&
        gapi.auth2 &&
        typeof gapi.auth2.getAuthInstance === 'function'
          ? gapi.auth2.getAuthInstance()
          : null;

      return (
        auth &&
        auth.currentUser &&
        typeof auth.currentUser.get === 'function'
      )
        ? auth.currentUser.get()
        : null;
    } catch (_) {
      return null;
    }
  }

  function refreshGoogleAuthIfNeeded() {
    if (authRefreshPromise) {
      return authRefreshPromise;
    }

    const user = googleAuthUser();

    if (
      !user ||
      typeof user.getAuthResponse !== 'function' ||
      typeof user.reloadAuthResponse !== 'function'
    ) {
      return Promise.resolve(false);
    }

    try {
      const response = user.getAuthResponse(true);
      const expiresAt = response && Number(response.expires_at);

      if (
        !Number.isFinite(expiresAt) ||
        expiresAt - Date.now() >= AUTH_EXPIRY_MARGIN_MS
      ) {
        return Promise.resolve(false);
      }
    } catch (_) {
      return Promise.resolve(false);
    }

    authRefreshPromise = Promise.resolve()
      .then(() => user.reloadAuthResponse())
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        authRefreshPromise = null;
      });

    return authRefreshPromise;
  }

  function withTimeout(promise, timeoutMs) {
    return Promise.race([
      promise,
      new Promise((resolve) => {
        window.setTimeout(() => resolve(false), timeoutMs);
      })
    ]);
  }

  function refreshSessionDocument() {
    if (typeof window.fetch !== 'function') {
      return Promise.resolve(false);
    }

    /*
     * This GET keeps the authenticated AI Studio document session warm and verifies
     * that it is still reachable. It does not claim to replace app-internal tokens;
     * the exposed Google auth object above is the only token we refresh directly.
     */
    return window.fetch(
      window.location.href.split('#')[0],
      {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        redirect: 'follow',
        headers: {
          Accept: 'text/html'
        }
      }
    ).then((response) => {
      let responseUrl = null;

      try {
        responseUrl = new URL(response.url || window.location.href);
      } catch (_) {
        responseUrl = null;
      }

      const refreshed = Boolean(
        response.ok &&
        responseUrl &&
        responseUrl.origin === window.location.origin &&
        !/^\/(?:welcome|available[_-]regions?)(?:\/|$)/i.test(
          responseUrl.pathname
        )
      );

      if (response.body && typeof response.body.cancel === 'function') {
        response.body.cancel().catch(() => {});
      }

      return refreshed;
    }).catch(() => false);
  }

  function keepSessionFresh(force = false) {
    if (!ENABLE_SESSION_KEEPALIVE) {
      return Promise.resolve(true);
    }

    if (
      !force &&
      Date.now() - lastSessionRefreshAt < SESSION_FRESH_MS
    ) {
      return Promise.resolve(true);
    }

    if (sessionRefreshPromise) {
      return sessionRefreshPromise;
    }

    sessionRefreshPromise = withTimeout(
      Promise.all([
        refreshGoogleAuthIfNeeded(),
        refreshSessionDocument()
      ]).then(([tokenRefreshed, documentRefreshed]) => (
        tokenRefreshed || documentRefreshed
      )),
      SESSION_PREFLIGHT_TIMEOUT_MS
    ).then((refreshed) => {
      if (refreshed) {
        lastSessionRefreshAt = Date.now();
        document.documentElement.setAttribute(
          'data-aistudio-session-fresh-at',
          String(lastSessionRefreshAt)
        );
      }

      return Boolean(refreshed);
    }).finally(() => {
      sessionRefreshPromise = null;
    });

    return sessionRefreshPromise;
  }

  function clickedRunButton(target) {
    const button = closest(target, RUN_BUTTON_SELECTOR);

    if (
      !button ||
      !visible(button) ||
      !isPromptRunButton(button) ||
      !canSubmit(button) ||
      !isRunActionLabel(buttonLabel(button)) ||
      isStopActionLabel(buttonLabel(button))
    ) {
      return null;
    }

    return button;
  }

  function runAfterSessionPreflight(button) {
    if (!button || runPreflightPromise) {
      return;
    }

    showRecoveryStatus('답변 생성 전에 AI Studio 세션을 확인하고 있습니다…');

    runPreflightPromise = keepSessionFresh(true).then((refreshed) => {
      if (
        !button.isConnected ||
        !canSubmit(button) ||
        generating()
      ) {
        showRecoveryStatus(
          'AI Studio가 아직 생성 중이거나 Run 버튼 상태가 바뀌어 요청을 보내지 않았습니다.',
          6000
        );
        return;
      }

      bypassRunPreflight = true;
      showRecoveryStatus(
        refreshed
          ? '세션 확인 완료 · 답변 생성을 시작합니다.'
          : '세션 선제 갱신을 확인하지 못해 AI Studio 기본 방식으로 전송합니다.',
        refreshed ? 3500 : 6000
      );

      try {
        button.click();
      } finally {
        window.setTimeout(() => {
          bypassRunPreflight = false;
        }, 0);
      }
    }).finally(() => {
      runPreflightPromise = null;
    });
  }

  function installSessionKeepalive() {
    if (!ENABLE_SESSION_KEEPALIVE) {
      return;
    }

    document.addEventListener(
      'click',
      (event) => {
        if (bypassRunPreflight || !event.isTrusted) {
          return;
        }

        const button = clickedRunButton(event.target);

        if (
          !button ||
          Date.now() - lastSessionRefreshAt < SESSION_FRESH_MS
        ) {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        runAfterSessionPreflight(button);
      },
      true
    );

    document.addEventListener(
      'keydown',
      (event) => {
        if (
          bypassRunPreflight ||
          event.key !== 'Enter' ||
          (!event.ctrlKey && !event.metaKey) ||
          Date.now() - lastSessionRefreshAt < SESSION_FRESH_MS
        ) {
          return;
        }

        const prompt = closest(
          event.target,
          'ms-prompt-input, ms-autosize-textarea, textarea, [contenteditable="true"], [role="textbox"]'
        );
        const button = findRunButton();

        if (!prompt || !button || !canSubmit(button)) {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        runAfterSessionPreflight(button);
      },
      true
    );

    window.setInterval(
      () => keepSessionFresh(true),
      AUTH_HEARTBEAT_MS
    );
  }

  function scan() {
    pending = false;

    if (
      document.hidden ||
      !ENABLE_SAFE_OUTPUT_REPAIR
    ) {
      return;
    }

    const now = Date.now();
    const roots = collectRoots();
    const lastTurn = lastModelTurn();
    const pageGenerating = generating();

    /*
     * AI Studio가 스트리밍 중일 때는 이전 답변을 포함해 어떤 출력 DOM도 바꾸지 않는다.
     * Angular가 관리하는 노드를 동시에 교체하면 다음 GenerateContent 요청의 내부 상태가
     * 깨질 수 있으므로, 완료 후 안정 구간에서만 보정한다.
     */
    if (pageGenerating) {
      return;
    }

    for (const root of roots) {
      const text = root.textContent || '';

      if (!hasRepairableText(text)) {
        states.delete(root);
        continue;
      }

      const rootTurn =
        closest(root, 'ms-chat-turn') ||
        closest(root, MODEL_TURN_SELECTOR) ||
        root;
      const isLastTurn = sameTurnOrInside(rootTurn, lastTurn);
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
        schedule(
          (isLastTurn ? LAST_TURN_WAIT_MS : OLD_TURN_WAIT_MS) + 50
        );
        continue;
      }

      /*
       * 최신 답변은 렌더러의 후속 갱신을 기다리기 위해 더 오래 안정화한다.
       */
      const wait = isLastTurn
        ? LAST_TURN_WAIT_MS
        : OLD_TURN_WAIT_MS;

      const attempts = state.attempts || 0;
      const retryWait = Math.min(
        RETRY_MAX_MS,
        RETRY_BASE_MS * Math.pow(2, Math.min(attempts, 4))
      );

      const stabilityRemaining = wait - (now - state.since);

      if (stabilityRemaining > 0) {
        schedule(stabilityRemaining + 50);
        continue;
      }

      if (
        state.attempted === text &&
        now - (state.lastAttemptAt || 0) < retryWait
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

        if (hasRepairableText(after)) {
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
      !ENABLE_SAFE_OUTPUT_REPAIR
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
      !ENABLE_SAFE_OUTPUT_REPAIR ||
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
          schedule(MUTATION_SCAN_DELAY_MS);
          return;
        }

        for (const node of mutation.addedNodes || []) {
          if (shouldObserveMutationTarget(node)) {
            schedule(MUTATION_SCAN_DELAY_MS);
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
    installSessionKeepalive();
    schedule(250);
    keepSessionFresh(true);

    html.setAttribute(VERSION_ATTR, VERSION);
    html.setAttribute(
      'data-aistudio-mobile-fix',
      'css-plus-safe-math-markdown-repair-session-keepalive'
    );

    window.addEventListener(
      'pageshow',
      () => {
        installStyle();
        schedule(150);
        keepSessionFresh(false);
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
          keepSessionFresh(false);
        }
      },
      { passive: true }
    );

    window.addEventListener(
      'focus',
      () => keepSessionFresh(false),
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
