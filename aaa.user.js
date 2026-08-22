// ==UserScript==
// @name         Google AI Studio KaTeX/Markdown Display Fix Mobile (Hybrid Safe)
// @namespace    https://aistudio.google.com/
// @version      1.9.9
// @description  Mobile-safe KaTeX recovery, Markdown repairs, and guarded AI Studio session keepalive.
// @author       Codex
// @match        https://aistudio.google.com/*
// @match        https://*.aistudio.google.com/*
// @require      https://cdn.jsdelivr.net/npm/katex@0.18.1/dist/katex.min.js
// @downloadURL  https://raw.githubusercontent.com/ad2das/userscript-name-google-ai-studio-katex/main/aaa.user.js
// @updateURL    https://raw.githubusercontent.com/ad2das/userscript-name-google-ai-studio-katex/main/aaa.user.js
// @homepageURL  https://github.com/ad2das/userscript-name-google-ai-studio-katex
// @supportURL   https://github.com/ad2das/userscript-name-google-ai-studio-katex/issues
// @run-at       document-idle
// @inject-into  auto
// @noframes
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '1.9.9';
  const STYLE_ID = 'aistudio-mobile-safe-199-style';
  const VERSION_ATTR = 'data-aistudio-mobile-safe-199';
  const KATEX_VERSION = '0.18.1';
  const KATEX_CSS_ID = 'aistudio-katex-0181-css';
  const KATEX_CSS_URL =
    'https://cdn.jsdelivr.net/npm/katex@0.18.1/dist/katex.min.css';

  /*
   * CSS-only만 쓰면 raw **bold**를 실제 굵게 만들 수 없다.
   * 그래서 이 버전은 "완료된 모델 출력"의 raw Markdown만 아주 보수적으로 고친다.
   *
   * 안전을 위해 하지 않는 것:
   * - 생성 중 최신 답변 수정
   * - KaTeX / MathJax 내부 수정
   * - 실제 code / pre / link / input의 원문 수정
   * - 링크, 코드, 블록 경계를 가로질러 **bold**를 합치기
   * - 단, 강조 안에 이미 렌더된 인라인 수식만 끼어 있는 경우는 수식을
   *   그대로 보존하면서 하나의 strong으로 안전하게 복구한다.
   *
   * 단, 한국어 설명문이 들여쓰기 때문에 pre > code로 잘못
   * 분류된 경우에는 코드 신호가 없을 때만 raw bold를 복구한다.
   * 박스문자 트리와 보수적으로 식별한 한글 다중 열 ASCII 표는 원문 code를
   * 보존한 채 aria-hidden 시각 레이어만 추가해 연결 열을 맞춘다.
   *
   * display 수식의 바깥 래퍼는 세로 clipping을 막기 위해 overflow: visible로
   * 두되, KaTeX의 stretchy SVG 내부 clipping 규칙은 반드시 유지한다.
   */
  const ENABLE_SAFE_OUTPUT_REPAIR = true;

  const SCAN_MS = 10000;
  const MUTATION_SCAN_DELAY_MS = 450;
  const GENERATION_RECHECK_MS = 750;
  const OLD_TURN_WAIT_MS = 500;
  const LAST_TURN_WAIT_MS = 1500;
  const RETRY_BASE_MS = 2000;
  const RETRY_MAX_MS = 30000;
  const MAX_MATCH_INNER_LENGTH = 2000;
  const MAX_INLINE_REPAIR_LENGTH = 12000;
  const MAX_RAW_MATH_LENGTH = 12000;
  const MAX_FALLBACK_ROOT_LENGTH = 16000;
  const MAX_FALLBACK_ASCENT = 12;
  const MAX_RECENT_REPAIR_ROOTS = 64;
  const MAX_KATEX_EXPANSIONS = 1000;
  const MAX_KATEX_SIZE = 20;
  const MAX_ASCII_TREE_LENGTH = 8000;
  const MAX_ASCII_TREE_LINES = 120;
  const MAX_ASCII_GRID_COLUMNS = 320;
  const MAX_ASCII_GRID_RUNS = 1200;
  const MIN_DISPLAY_MATH_SCALE = 0.58;
  const MATH_FIT_CHECKED_ATTR = 'data-aistudio-math-fit-checked';
  const MOBILE_TABLE_ATTR = 'data-aistudio-mobile-table';

  const RAW_MATH_ENVIRONMENTS = new Set([
    'array',
    'darray',
    'subarray',
    'aligned',
    'alignedat',
    'gathered',
    'split',
    'cases',
    'dcases',
    'rcases',
    'drcases',
    'matrix',
    'matrix*',
    'pmatrix',
    'pmatrix*',
    'bmatrix',
    'bmatrix*',
    'Bmatrix',
    'Bmatrix*',
    'vmatrix',
    'vmatrix*',
    'Vmatrix',
    'Vmatrix*',
    'smallmatrix',
    'equation',
    'equation*',
    'align',
    'align*',
    'alignat',
    'alignat*',
    'gather',
    'gather*',
    'CD'
  ]);

  const BOLD_TEX_GROUP_COMMANDS = new Set([
    'mathbf',
    'boldsymbol',
    'bold',
    'pmb',
    'textbf'
  ]);

  const NORMAL_TEX_GROUP_COMMANDS = new Set([
    'mathnormal',
    'mathrm',
    'textnormal',
    'textrm'
  ]);

  const NORMAL_TEX_DECLARATIONS = new Set([
    'md',
    'mdseries',
    'normalfont',
    'rm'
  ]);

  const RENDERED_MATH_SELECTOR = [
    'ms-katex',
    '.katex-display',
    '.katex',
    '.MathJax',
    'mjx-container'
  ].join(',');

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

  /*
   * AI Studio has used both Model/model and assistant role values. Attribute
   * value matching is explicitly case-insensitive so a casing-only rollout
   * cannot make every Markdown repair silently miss the response.
   */
  const MODEL_ROLE_SELECTORS = [
    '[data-turn-role="model" i]',
    '[data-turn-role="assistant" i]',
    '[data-message-author-role="assistant" i]',
    '[data-message-author-role="model" i]'
  ];

  const USER_ROLE_SELECTORS = [
    '[data-turn-role="user" i]',
    '[data-turn-role="human" i]',
    '[data-message-author-role="user" i]',
    '[data-message-author-role="human" i]'
  ];

  const FALLBACK_SURFACE_SELECTORS = [
    'app-root',
    'main',
    '[role="main"]',
    'ms-chat-turn'
  ];
  const FALLBACK_SURFACE_SELECTOR = FALLBACK_SURFACE_SELECTORS.join(',');
  const REPAIRED_ROOT_SELECTOR = '[data-aistudio-repair-root="1"]';

  /*
   * Response renderer elements are the stable fallback when the surrounding
   * turn has not received a role/class yet. Restrict this fallback to chat
   * turns; user turns are excluded separately by USER_SELECTOR.
   */
  const MODEL_RENDERER_SELECTOR = [
    'ms-chat-turn ms-cmark-node',
    'ms-chat-turn ms-text-chunk'
  ].join(',');

  const STYLE_ROOT_SELECTOR = [
    REPAIRED_ROOT_SELECTOR,
    MODEL_RENDERER_SELECTOR,
    '.chat-turn-container.model ms-cmark-node',
    '.chat-turn-container.model ms-text-chunk',
    ...MODEL_ROLE_SELECTORS.flatMap((roleSelector) => [
      `${roleSelector} ms-cmark-node`,
      `${roleSelector} ms-text-chunk`,
      `${roleSelector} .markdown`,
      `${roleSelector} .markdown-body`
    ]),
    '.model-prompt-container ms-cmark-node',
    '.model-prompt-container ms-text-chunk',
    '.model-prompt-container .very-large-text-container',
    '.chat-turn-container.model .markdown',
    '.chat-turn-container.model .markdown-body'
  ].join(',');

  const MODEL_TURN_SELECTOR = [
    'ms-chat-turn .chat-turn-container.model',
    ...MODEL_ROLE_SELECTORS,
    '.model-prompt-container',
    '.chat-turn-container.model'
  ].join(',');

  const MODEL_ACTIVITY_INDICATORS = [
    '[aria-busy="true"]',
    'mat-progress-spinner',
    'mat-spinner',
    '[role="progressbar"]'
  ];

  const MODEL_ACTIVITY_SELECTOR = [
    ...MODEL_TURN_SELECTOR
      .split(',')
      .flatMap((turnSelector) => MODEL_ACTIVITY_INDICATORS.map(
        (activitySelector) => (
          `${turnSelector.trim()} ${activitySelector}`
        )
      )),
    /* 역할이 아직 없는 최신 turn도 생성 중에는 절대 수정하지 않는다. */
    ...MODEL_ACTIVITY_INDICATORS.map((activitySelector) => (
      `ms-chat-turn ${activitySelector}`
    ))
  ]
    .join(',');

  const FALLBACK_ACTIVITY_SELECTOR = FALLBACK_SURFACE_SELECTORS
    .flatMap((surfaceSelector) => MODEL_ACTIVITY_INDICATORS.map(
      (activitySelector) => `${surfaceSelector} ${activitySelector}`
    ))
    .join(',');

  const REPAIR_ROOT_SELECTOR = [
    STYLE_ROOT_SELECTOR,
    MODEL_TURN_SELECTOR
  ].join(',');

  const USER_SELECTOR = [
    ...USER_ROLE_SELECTORS,
    '[data-role="user" i]',
    '[data-author-role="user" i]',
    '[data-message-role="user" i]',
    '.user-prompt-container',
    '.chat-turn-container.user',
    '.user-message',
    '.human-message',
    'ms-user-message',
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
    '.aistudio-aligned-repaired',
    '.aistudio-raw-math-repaired'
  ].join(',');

  const FALLBACK_EXCLUDE_SELECTOR = [
    'nav',
    'header',
    'footer',
    'aside',
    '[role="navigation"]',
    '[role="menu"]',
    '[role="menubar"]',
    '[role="toolbar"]',
    '[role="dialog"]',
    '[role="alertdialog"]',
    '[aria-modal="true"]',
    '.cdk-overlay-container',
    `#${RECOVERY_STATUS_ID}`
  ].join(',');

  const INLINE_REPAIR_CONTAINER_SELECTOR = [
    'ms-cmark-node',
    'ms-text-chunk',
    '.very-large-text-container',
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
    'dd',
    'dt',
    'th',
    'td',
    'ms-cmark-node',
    'ms-text-chunk',
    '.very-large-text-container'
  ].join(',');

  const RAW_MATH_RANGE_BLOCK_SELECTOR = [
    'p',
    'li',
    'blockquote',
    'figcaption',
    'dd',
    'dt',
    'th',
    'td',
    'div',
    'section',
    'article',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'ms-cmark-node',
    'ms-text-chunk'
  ].join(',');

  const RAW_MATH_RANGE_BARRIER_SELECTOR = [
    SKIP_SELECTOR,
    'table',
    '.aistudio-rendered-math-bold-repaired'
  ].join(',');
  const RAW_MATH_RANGE_BARRIER_TEXT = '\n{aistudio-dom-barrier\n';

  const INLINE_REPAIR_BOUNDARY_SELECTOR = [
    'br',
    'hr',
    'a',
    'strong',
    'b',
    'u',
    'ins',
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
    '.aistudio-underline-repaired',
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

  const INLINE_EMBEDDED_MATH_SELECTOR = [
    '.katex',
    'ms-katex',
    '.MathJax',
    'mjx-container',
    'math',
    'math-field',
    '[role="math"]',
    '[data-tex]',
    '[data-latex]',
    '[data-math]',
    '[latex]',
    '[expression]',
    '[formula]'
  ].join(',');

  const EMBEDDED_MATH_NAME_TOKEN =
    /(?:^|[-_:])(?:math|katex|mathjax|latex|tex|formula|equation)(?:$|[-_:](?:inline|display|renderer|rendered|container|field|block)$)/i;
  const EMBEDDED_MATH_CLASS_TOKEN =
    /^(?:katex|mathjax|mathjax-container|math|math-inline|inline-math|math-container|math-renderer|rendered-math|latex|latex-inline|tex-math|formula|formula-inline|equation|equation-inline)$/i;

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
    'aistudio-mobile-safe-164-style',
    'aistudio-mobile-safe-165-style',
    'aistudio-mobile-safe-170-style',
    'aistudio-mobile-safe-171-style',
    'aistudio-mobile-safe-180-style',
    'aistudio-mobile-safe-181-style',
    'aistudio-mobile-safe-182-style',
    'aistudio-mobile-safe-183-style',
    'aistudio-mobile-safe-184-style',
    'aistudio-mobile-safe-185-style',
    'aistudio-mobile-safe-186-style',
    'aistudio-mobile-safe-187-style',
    'aistudio-mobile-safe-188-style',
    'aistudio-mobile-safe-189-style',
    'aistudio-mobile-safe-190-style',
    'aistudio-mobile-safe-191-style',
    'aistudio-mobile-safe-192-style',
    'aistudio-mobile-safe-193-style',
    'aistudio-mobile-safe-194-style',
    'aistudio-mobile-safe-195-style',
    'aistudio-mobile-safe-196-style',
    'aistudio-mobile-safe-197-style',
    'aistudio-mobile-safe-198-style'
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

/* AI Studio가 문자로 노출한 속성 없는 <u>...</u>의 안전한 fallback. */
${SCOPE} u.aistudio-underline-repaired {
  font: inherit !important;
  color: inherit !important;
  text-decoration-line: underline !important;
  text-decoration-style: solid !important;
  text-decoration-thickness: 0.08em !important;
  text-underline-offset: 0.12em !important;
  text-decoration-skip-ink: auto !important;
}

/*
 * 원문으로 노출된 완전한 TeX 블록은 고정 버전 KaTeX로 다시 렌더한다.
 * 파싱이 성공한 경우에만 이 래퍼가 만들어진다.
 */
${SCOPE} .aistudio-raw-math-repaired {
  max-width: 100% !important;
  box-sizing: border-box !important;
  overflow: visible !important;
  overflow-wrap: normal !important;
  word-break: normal !important;
}

${SCOPE} .aistudio-raw-math-display {
  display: block !important;
  margin: 0.65em 0 !important;
}

${SCOPE} .aistudio-raw-math-inline {
  display: inline !important;
  margin: 0 !important;
}

${SCOPE} .aistudio-raw-math-repaired :where(.katex, .katex *) {
  overflow-wrap: normal !important;
  word-break: normal !important;
}

/* Markdown **...** 안의 수식도 주변 굵기와 맞추는 시각적 fallback. */
${SCOPE} :where(
  .aistudio-raw-math-bold > .katex,
  .aistudio-md-contains-math .katex,
  .aistudio-md-embedded-math
) {
  font-weight: 700 !important;
  font-synthesis: weight !important;
  -webkit-text-stroke: 0.12px currentColor !important;
  text-shadow: 0.01em 0 currentColor, -0.01em 0 currentColor !important;
}

/*
 * KaTeX는 굵은 수학 그룹 안의 텍스트 그룹에 굵기를 상속하지 않는다.
 * 정규화된 한글 fallback 글꼴에도 굵기를 명시해 페이지 CSS의 간섭을 막는다.
 */
${SCOPE} :where(
  .aistudio-raw-math-repaired,
  .aistudio-rendered-math-bold-repaired
) .katex :where(.mathbf, .textbf, .boldsymbol).hangul_fallback {
  font-family: var(--as-font) !important;
  font-weight: 700 !important;
  font-synthesis: weight !important;
}

/* KaTeX 글꼴 메트릭이 없는 ① 같은 enclosed glyph도 굵은 그룹에 맞춘다. */
${SCOPE} :where(
  .aistudio-raw-math-repaired,
  .aistudio-rendered-math-bold-repaired
) .aistudio-katex-bold-glyph-fallback {
  font-weight: 700 !important;
  font-synthesis: weight !important;
  -webkit-text-stroke: 0.12px currentColor !important;
  text-shadow: 0.01em 0 currentColor, -0.01em 0 currentColor !important;
}

${SCOPE} .aistudio-rendered-math-bold-repaired {
  max-width: 100% !important;
  box-sizing: border-box !important;
  overflow: visible !important;
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

/*
 * 한글 fallback 폭과 ASCII 공백 폭이 달라도 박스문자 구조도의 연결 열은
 * 공유 grid column에 놓는다. 각 cell의 실제 텍스트와 줄바꿈은 유지되어
 * AI Studio의 복사/다운로드 동작은 원문을 그대로 읽을 수 있다.
 */
${SCOPE} pre.aistudio-ascii-tree-block-repaired >
code.aistudio-ascii-tree-repaired {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  margin: -1px !important;
  padding: 0 !important;
  overflow: hidden !important;
  clip: rect(0 0 0 0) !important;
  clip-path: inset(50%) !important;
  white-space: pre !important;
}

${SCOPE} .aistudio-ascii-tree-visual {
  display: inline-grid !important;
  grid-template-columns: max-content max-content max-content !important;
  width: max-content !important;
  min-width: 100% !important;
  white-space: normal !important;
  overflow-wrap: normal !important;
  word-break: normal !important;
}

${SCOPE} .aistudio-ascii-tree-row {
  display: contents !important;
}

${SCOPE} :where(
  .aistudio-ascii-tree-left,
  .aistudio-ascii-tree-junction,
  .aistudio-ascii-tree-right,
  .aistudio-ascii-tree-plain
) {
  white-space: pre !important;
  overflow-wrap: normal !important;
  word-break: normal !important;
}

${SCOPE} :where(
  .aistudio-ascii-tree-left,
  .aistudio-ascii-tree-junction,
  .aistudio-ascii-tree-right,
  .aistudio-ascii-tree-plain
)::before {
  content: attr(data-aistudio-ascii-cell) !important;
}

${SCOPE} .aistudio-ascii-tree-left {
  grid-column: 1 !important;
  justify-self: end !important;
}

${SCOPE} .aistudio-ascii-tree-junction {
  grid-column: 2 !important;
}

${SCOPE} .aistudio-ascii-tree-right {
  grid-column: 3 !important;
}

${SCOPE} .aistudio-ascii-tree-plain {
  grid-column: 1 / -1 !important;
}

/* 좌우 표처럼 여러 축을 가진 ASCII 도식은 1ch 논리 격자에 배치한다. */
${SCOPE} .aistudio-ascii-tree-visual.aistudio-ascii-character-grid {
  display: block !important;
  width: max-content !important;
  min-width: 100% !important;
}

${SCOPE} .aistudio-ascii-character-grid .aistudio-ascii-tree-row {
  display: grid !important;
  grid-template-columns: repeat(
    var(--aistudio-ascii-columns),
    1ch
  ) !important;
  width: max-content !important;
  min-width: calc(var(--aistudio-ascii-columns) * 1ch) !important;
  min-height: 1.55em !important;
  line-height: 1.55 !important;
}

${SCOPE} .aistudio-ascii-grid-run {
  grid-row: 1 !important;
  align-self: baseline !important;
  min-width: 0 !important;
  white-space: pre !important;
  overflow: visible !important;
  overflow-wrap: normal !important;
  word-break: normal !important;
}

${SCOPE} .aistudio-ascii-grid-run::before {
  content: attr(data-aistudio-ascii-cell) !important;
}

${SCOPE} .aistudio-ascii-grid-wide {
  font-family: var(--as-mono) !important;
}

/* 들여쓰기 때문에 코드 블록으로 오인된 한국어 설명문만 원래 문단처럼 복구한다. */
${SCOPE} pre.aistudio-prose-code-block-repaired {
  overflow: visible !important;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  white-space: normal !important;
}

${SCOPE} pre.aistudio-prose-code-block-repaired >
code.aistudio-prose-code-repaired {
  display: block !important;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  font-family: var(--as-font) !important;
  font-size: inherit !important;
  line-height: inherit !important;
  white-space: pre-line !important;
  overflow-wrap: break-word !important;
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
  min-width: 4.5em !important;
  box-sizing: border-box !important;

  white-space: normal !important;
  overflow-wrap: normal !important;
  word-break: keep-all !important;
  hyphens: none !important;

  vertical-align: top !important;
}

${SCOPE} th {
  white-space: nowrap !important;
}

${SCOPE} :where(th, td):nth-child(1) {
  min-width: 4.25em !important;
  white-space: nowrap !important;
}

${SCOPE} :where(th, td):nth-child(2) {
  min-width: 3.25em !important;
  white-space: nowrap !important;
}

${SCOPE} .aistudio-table-scroll {
  display: block !important;
  width: 100% !important;
  max-width: 100% !important;
  margin: 0.65em 0 !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  box-sizing: border-box !important;
  -webkit-overflow-scrolling: touch !important;
  overscroll-behavior-x: contain !important;
  scrollbar-gutter: stable !important;
}

${SCOPE} .aistudio-table-scroll > table[${MOBILE_TABLE_ATTR}="1"] {
  width: max-content !important;
  min-width: 100% !important;
  max-width: none !important;
  margin: 0 !important;
  table-layout: auto !important;
}

${SCOPE} .aistudio-table-scroll :where(th, td) {
  max-width: min(28em, 68vw) !important;
  line-height: 1.5 !important;
}

${SCOPE} .aistudio-table-scroll :where(th, td):nth-child(3) {
  min-width: 7em !important;
}

${SCOPE} .aistudio-table-scroll :where(th, td):nth-child(4) {
  font-variant-numeric: tabular-nums !important;
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
 * 그래서 바깥 래퍼는 위아래 보존을 우선하고 overflow: visible로 둔다.
 * 가로로 긴 KaTeX 본체는 JS에서 가용 폭에 맞춰 비례 축소한다.
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
 * KaTeX display의 바깥 본체도 세로 clipping을 막는다. 아래의 내부
 * stretchy/MathML 조각은 KaTeX 원래 규칙대로 overflow:hidden을 복원한다.
 */
${SCOPE} :where(
  .katex-display,
  .katex-display > .katex,
  ms-katex.display,
  mjx-container[display="true"]
) {
  overflow: visible !important;
}

/*
 * KaTeX의 stretchy SVG와 접근성 MathML은 내부 조각을 잘라내기 위해
 * overflow:hidden이 필수다. 이를 visible로 바꾸면 underbrace 꼬리가
 * 화면 전체의 수평선처럼 새어 나온다.
 */
${SCOPE} .katex :where(
  .katex-mathml,
  .pstrut,
  .katex-stretchy,
  .stretchy,
  .hide-tail,
  .halfarrow-left,
  .halfarrow-right,
  .brace-left,
  .brace-center,
  .brace-right
) {
  overflow: hidden !important;
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
  const fallbackRoots = new WeakSet();
  const rawMathScopeRoots = new WeakSet();
  const mathFitOriginalStyles = new WeakMap();

  let cleanedLegacy = false;
  let pendingTimerId = null;
  let pendingDueAt = Infinity;
  let scanQueued = false;
  let observer = null;
  let authRefreshPromise = null;
  let sessionRefreshPromise = null;
  let runPreflightPromise = null;
  let lastSessionRefreshAt = 0;
  let bypassRunPreflight = false;
  let statusTimer = null;
  let repairedTotal = 0;
  let mathFitResizeDirty = true;
  let fallbackDirty = true;
  let lastFallbackScanAt = 0;
  const mathFitCache = new WeakMap();

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

  function installKatexStylesheet(parent) {
    let stylesheet = document.getElementById(KATEX_CSS_ID);

    if (!stylesheet) {
      stylesheet = document.createElement('link');
      stylesheet.id = KATEX_CSS_ID;
      stylesheet.rel = 'stylesheet';
      stylesheet.href = KATEX_CSS_URL;
      stylesheet.crossOrigin = 'anonymous';
      stylesheet.referrerPolicy = 'no-referrer';
      stylesheet.setAttribute('data-katex-version', KATEX_VERSION);
      parent.appendChild(stylesheet);
    } else if (!stylesheet.isConnected) {
      parent.appendChild(stylesheet);
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
    installKatexStylesheet(parent);

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

  function hasLiteralUnderline(text) {
    return Boolean(
      text &&
      /<u\s*>[\s\S]*?<\/u\s*>/i.test(text)
    );
  }

  function bracesAreBalanced(source) {
    let depth = 0;

    for (let index = 0; index < source.length; index += 1) {
      if (isEscaped(source, index)) {
        continue;
      }

      if (source[index] === '{') {
        depth += 1;
      } else if (source[index] === '}') {
        depth -= 1;

        if (depth < 0) {
          return false;
        }
      }
    }

    return depth === 0;
  }

  function normalizeCollapsedRowSeparators(source) {
    const normalizedLines = source
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => {
        const ending = line.match(/^(.*?)(\\+)([ \t]*)$/);

        if (!ending || ending[2].length !== 1) {
          return line;
        }

        return `${ending[1]}\\\\${ending[3]}`;
      });

    return normalizedLines
      .join('\n')
      .replace(/(^|[^\\])\\([ \t]+)(?=&)/g, '$1\\\\$2');
  }

  function propagateBoldIntoText(source, inheritedBold = false) {
    let output = '';
    let bold = inheritedBold;
    let index = 0;

    while (index < source.length) {
      if (source[index] === '{' && !isEscaped(source, index)) {
        const group = readTexGroup(source, index);

        if (group) {
          output += `{${propagateBoldIntoText(group.content, bold)}}`;
          index = group.end + 1;
          continue;
        }
      }

      if (source[index] !== '\\' || isEscaped(source, index)) {
        output += source[index];
        index += 1;
        continue;
      }

      const commandMatch = source.slice(index + 1).match(/^([A-Za-z]+|.)/);

      if (!commandMatch) {
        output += source[index];
        index += 1;
        continue;
      }

      const command = commandMatch[1];
      const lowerCommand = command.toLowerCase();
      let next = index + 1 + command.length;

      while (/\s/.test(source[next] || '')) {
        next += 1;
      }

      const commandPrefix = source.slice(index, next);

      if (lowerCommand === 'bf') {
        output += commandPrefix;
        bold = true;
        index = next;
        continue;
      }

      if (NORMAL_TEX_DECLARATIONS.has(lowerCommand)) {
        output += commandPrefix;
        bold = false;
        index = next;
        continue;
      }

      if (source[next] !== '{') {
        output += commandPrefix;
        index = next;
        continue;
      }

      const group = readTexGroup(source, next);

      if (!group) {
        output += commandPrefix;
        index = next;
        continue;
      }

      const groupIsBold = NORMAL_TEX_GROUP_COMMANDS.has(lowerCommand)
        ? false
        : bold || BOLD_TEX_GROUP_COMMANDS.has(lowerCommand);
      let content = propagateBoldIntoText(group.content, groupIsBold);

      if (
        lowerCommand === 'text' &&
        bold &&
        !/^\s*\\(?:bf|rm|md|textnormal|normalfont)\b/.test(content)
      ) {
        content = `\\bf ${content}`;
      }

      output += `${commandPrefix}{${content}}`;
      index = group.end + 1;
    }

    return output;
  }

  function normalizeKatexCommands(source) {
    let visibleSource = '';

    /*
     * AI Studio occasionally emits a human-readable percentage as bare `%`.
     * TeX treats that as a comment, swallowing the remainder of the row,
     * including its `\\`; the next aligned row then appears as `106개월간`.
     * Raw-math candidates are visible output, so preserve every unescaped
     * percent sign as a literal glyph before KaTeX parses the block.
     */
    for (let index = 0; index < source.length; index += 1) {
      if (source[index] === '%' && !isEscaped(source, index)) {
        visibleSource += '\\%';
      } else {
        visibleSource += source[index];
      }
    }

    const aliasesNormalized = visibleSource
      .replace(/\\bm(?=\s*\{)/g, '\\boldsymbol')
      .replace(/\\bfseries\b/g, '\\bf');

    return propagateBoldIntoText(aliasesNormalized);
  }

  function stripOuterMarkdownBold(source) {
    const match = source.match(/^(\*\*|__)([\s\S]+)\1$/);

    if (!match || !match[2].trim()) {
      return { source, bold: false };
    }

    return {
      source: match[2].trim(),
      bold: true
    };
  }

  function parseRawMathCandidate(text) {
    if (
      !text ||
      text.length > MAX_RAW_MATH_LENGTH
    ) {
      return null;
    }

    const outer = stripOuterMarkdownBold(text.trim());
    const source = outer.source;

    if (!source || !bracesAreBalanced(source)) {
      return null;
    }

    const opening = source.match(
      /^(?:\\)?begin\s*\{([A-Za-z][A-Za-z*]*)\}/
    );
    const closing = source.match(
      /(?:\\)?end\s*\{([A-Za-z][A-Za-z*]*)\}\s*$/
    );

    if (opening || closing) {
      if (
        !opening ||
        !closing ||
        opening[1] !== closing[1] ||
        !RAW_MATH_ENVIRONMENTS.has(opening[1]) ||
        typeof closing.index !== 'number' ||
        closing.index < opening[0].length
      ) {
        return null;
      }

      const environment = opening[1];
      const body = normalizeCollapsedRowSeparators(
        source.slice(opening[0].length, closing.index)
      );
      let tex;

      if (/^equation\*?$/.test(environment)) {
        tex = body;
      } else if (/^align\*?$/.test(environment)) {
        tex = `\\begin{aligned}${body}\\end{aligned}`;
      } else if (/^alignat\*?$/.test(environment)) {
        tex = `\\begin{alignedat}${body}\\end{alignedat}`;
      } else if (/^gather\*?$/.test(environment)) {
        tex = `\\begin{gathered}${body}\\end{gathered}`;
      } else {
        tex = `\\begin{${environment}}${body}\\end{${environment}}`;
      }

      return {
        bold: outer.bold,
        displayMode: true,
        environment,
        kind: 'environment',
        tex: normalizeKatexCommands(tex)
      };
    }

    const delimiterPairs = [
      { open: '$$', close: '$$', displayMode: true },
      { open: '\\[', close: '\\]', displayMode: true },
      { open: '\\(', close: '\\)', displayMode: false },
      { open: '$', close: '$', displayMode: false }
    ];

    for (const delimiters of delimiterPairs) {
      if (
        !source.startsWith(delimiters.open) ||
        !source.endsWith(delimiters.close) ||
        source.length <= delimiters.open.length + delimiters.close.length
      ) {
        continue;
      }

      if (
        delimiters.open === '$' &&
        (source.startsWith('$$') || source.endsWith('$$'))
      ) {
        continue;
      }

      const tex = source.slice(
        delimiters.open.length,
        source.length - delimiters.close.length
      ).trim();

      if (!tex) {
        return null;
      }

      return {
        bold: outer.bold,
        displayMode: delimiters.displayMode,
        environment: null,
        kind: 'delimited',
        tex: normalizeKatexCommands(tex)
      };
    }

    const standaloneBoldMath = (
      /^(?:\\(?:mathbf|boldsymbol|bm|bold|pmb|textbf|text)\s*\{|\\(?:bf|bfseries)\b)/.test(source) ||
      /^\{\s*\\(?:bf|bfseries)\b/.test(source)
    );

    if (!standaloneBoldMath) {
      return null;
    }

    return {
      bold: outer.bold,
      displayMode: false,
      environment: null,
      kind: 'standalone-bold',
      tex: normalizeKatexCommands(source)
    };
  }

  function markdownFencedCodeRanges(source) {
    if (!source) {
      return [];
    }

    const ranges = [];
    const lines = source.split('\n');
    let offset = 0;
    let fence = null;

    for (let index = 0; index < lines.length; index += 1) {
      const rawLine = lines[index];
      const line = rawLine.endsWith('\r')
        ? rawLine.slice(0, -1)
        : rawLine;
      const lineEnd = offset + rawLine.length + (
        index < lines.length - 1 ? 1 : 0
      );
      const match = line.match(/^[ \t]*(`{3,}|~{3,})(.*)$/);

      if (match) {
        const marker = match[1];

        if (!fence) {
          fence = {
            character: marker[0],
            length: marker.length,
            start: offset
          };
        } else if (
          marker[0] === fence.character &&
          marker.length >= fence.length &&
          !match[2].trim()
        ) {
          ranges.push({ start: fence.start, end: lineEnd });
          fence = null;
        }
      }

      offset = lineEnd;
    }

    if (fence) {
      ranges.push({ start: fence.start, end: source.length });
    }

    return ranges;
  }

  function rangeOverlaps(ranges, start, end) {
    return ranges.some((range) => (
      start < range.end && end > range.start
    ));
  }

  function whitespaceOnlyOnLineBefore(source, index) {
    const lineStart = source.lastIndexOf('\n', index - 1) + 1;

    return !source.slice(lineStart, index).trim();
  }

  function whitespaceOnlyOnLineAfter(source, index) {
    const nextLine = source.indexOf('\n', index);
    const lineEnd = nextLine === -1 ? source.length : nextLine;

    return !source.slice(index, lineEnd).trim();
  }

  function delimiterIsEscaped(source, index) {
    let slashes = 0;

    for (
      let cursor = index - 1;
      cursor >= 0 && source[cursor] === '\\';
      cursor -= 1
    ) {
      slashes += 1;
    }

    return slashes % 2 === 1;
  }

  function findEnvironmentMathBlocks(source, protectedRanges) {
    const blocks = [];
    const openingPattern = /(?:\\)?begin\s*\{([A-Za-z][A-Za-z*]*)\}/g;
    let opening;

    while ((opening = openingPattern.exec(source))) {
      const environment = opening[1];

      if (!RAW_MATH_ENVIRONMENTS.has(environment)) {
        continue;
      }

      const tokenPattern = /(?:\\)?(begin|end)\s*\{([A-Za-z][A-Za-z*]*)\}/g;
      tokenPattern.lastIndex = openingPattern.lastIndex;
      let depth = 1;
      let closingEnd = -1;
      let token;

      while ((token = tokenPattern.exec(source))) {
        if (token[2] !== environment) {
          continue;
        }

        depth += token[1] === 'begin' ? 1 : -1;

        if (depth === 0) {
          closingEnd = tokenPattern.lastIndex;
          break;
        }
      }

      if (closingEnd === -1) {
        continue;
      }

      const start = opening.index;
      const end = closingEnd;

      openingPattern.lastIndex = end;

      if (
        !whitespaceOnlyOnLineBefore(source, start) ||
        !whitespaceOnlyOnLineAfter(source, end) ||
        rangeOverlaps(protectedRanges, start, end)
      ) {
        continue;
      }

      const blockSource = source.slice(start, end);
      const candidate = parseRawMathCandidate(blockSource);

      if (candidate) {
        blocks.push({ start, end, source: blockSource, candidate });
      }
    }

    return blocks;
  }

  function findDelimitedMathBlocks(
    source,
    protectedRanges,
    open,
    close
  ) {
    const blocks = [];
    let searchFrom = 0;

    while (searchFrom < source.length) {
      const start = source.indexOf(open, searchFrom);

      if (start === -1) {
        break;
      }

      searchFrom = start + open.length;

      if (
        delimiterIsEscaped(source, start) ||
        !whitespaceOnlyOnLineBefore(source, start) ||
        rangeOverlaps(protectedRanges, start, searchFrom)
      ) {
        continue;
      }

      let closeStart = source.indexOf(close, searchFrom);

      while (
        closeStart !== -1 &&
        delimiterIsEscaped(source, closeStart)
      ) {
        closeStart = source.indexOf(close, closeStart + close.length);
      }

      if (closeStart === -1) {
        break;
      }

      const end = closeStart + close.length;
      searchFrom = end;

      if (
        !whitespaceOnlyOnLineAfter(source, end) ||
        rangeOverlaps(protectedRanges, start, end)
      ) {
        continue;
      }

      const blockSource = source.slice(start, end);
      const candidate = parseRawMathCandidate(blockSource);

      if (candidate) {
        blocks.push({ start, end, source: blockSource, candidate });
      }
    }

    return blocks;
  }

  function findLineMathBlocks(source, protectedRanges) {
    const blocks = [];
    let lineStart = 0;

    while (lineStart <= source.length) {
      const nextLine = source.indexOf('\n', lineStart);
      const lineEnd = nextLine === -1 ? source.length : nextLine;
      const rawLine = source.slice(lineStart, lineEnd);
      const leading = rawLine.length - rawLine.trimStart().length;
      const trailing = rawLine.length - rawLine.trimEnd().length;
      const start = lineStart + leading;
      const end = lineEnd - trailing;

      if (
        start < end &&
        !rangeOverlaps(protectedRanges, start, end)
      ) {
        const blockSource = source.slice(start, end);
        const candidate = parseRawMathCandidate(blockSource);

        if (candidate) {
          blocks.push({ start, end, source: blockSource, candidate });
        }
      }

      if (nextLine === -1) {
        break;
      }

      lineStart = nextLine + 1;
    }

    return blocks;
  }

  function findEmbeddedRawMathBlocks(source) {
    if (!source) {
      return [];
    }

    const protectedRanges = markdownFencedCodeRanges(source);
    const blocks = [
      ...findEnvironmentMathBlocks(source, protectedRanges),
      ...findDelimitedMathBlocks(source, protectedRanges, '$$', '$$'),
      ...findDelimitedMathBlocks(source, protectedRanges, '\\[', '\\]'),
      ...findLineMathBlocks(source, protectedRanges)
    ];

    blocks.sort((left, right) => (
      left.start - right.start || right.end - left.end
    ));

    const nonOverlapping = [];

    for (const block of blocks) {
      if (
        !nonOverlapping.some((accepted) => (
          block.start < accepted.end && block.end > accepted.start
        ))
      ) {
        nonOverlapping.push(block);
      }
    }

    return nonOverlapping;
  }

  function hasRawMathText(text) {
    if (!text) {
      return false;
    }

    if (parseRawMathCandidate(text)) {
      return true;
    }

    const environmentMatch = text.match(
      /(?:^|\s)(?:\\)?begin\s*\{([A-Za-z][A-Za-z*]*)\}/
    );

    return Boolean(
      (
        environmentMatch &&
        RAW_MATH_ENVIRONMENTS.has(environmentMatch[1])
      ) ||
      /\\(?:\[|\()/.test(text) ||
      /\\(?:mathbf|boldsymbol|bm|bold|pmb|textbf|bfseries|bf)\b/.test(text) ||
      text.includes('$$') ||
      hasUnescapedDollarPair(text)
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
      hasLiteralUnderline(text) ||
      hasRawMathText(text)
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

  function availableKatex() {
    const engine =
      typeof globalThis === 'object'
        ? globalThis.katex
        : null;

    return engine && typeof engine.render === 'function'
      ? engine
      : null;
  }

  function renderedMathSource(element) {
    if (!element || !element.querySelector) {
      return '';
    }

    const annotation = element.querySelector(
      'annotation[encoding="application/x-tex"]'
    );

    if (annotation && (annotation.textContent || '').trim()) {
      return annotation.textContent.trim();
    }

    for (const attribute of [
      'data-tex',
      'data-latex',
      'data-math',
      'latex',
      'expression',
      'formula'
    ]) {
      const value = element.getAttribute
        ? element.getAttribute(attribute)
        : null;

      if (value && value.trim()) {
        return value.trim();
      }
    }

    return '';
  }

  function hasTextOutsideRenderedMath(container) {
    if (
      !container ||
      !container.querySelector ||
      !container.querySelector(RENDERED_MATH_SELECTOR)
    ) {
      return true;
    }

    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT
    );

    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      const value = textNode.nodeValue || '';
      const parent = textNode.parentElement;

      if (
        value.trim() &&
        !(
          parent &&
          closest(parent, RENDERED_MATH_SELECTOR)
        )
      ) {
        return true;
      }
    }

    return false;
  }

  function sourceFromMixedMathDom(container) {
    const blockSelector = [
      'p',
      'li',
      'blockquote',
      'figcaption',
      'dd',
      'dt',
      'th',
      'td',
      'div'
    ].join(',');
    let missingRenderedSource = false;

    const visit = (node) => {
      if (!node) {
        return '';
      }

      if (node.nodeType === 3) {
        return node.nodeValue || '';
      }

      if (node.nodeType !== 1) {
        return '';
      }

      if (node.matches && node.matches(RENDERED_MATH_SELECTOR)) {
        const source = renderedMathSource(node);

        if (!source) {
          missingRenderedSource = true;
        }

        return source;
      }

      if (node.matches && node.matches('br')) {
        return '\n';
      }

      const content = Array.from(node.childNodes || [], visit).join('');

      return node !== container && node.matches && node.matches(blockSelector)
        ? `\n${content}\n`
        : content;
    };

    const source = visit(container).trim();

    return missingRenderedSource ? '' : source;
  }

  function renderKatexSource(source, displayMode, className) {
    const engine = availableKatex();

    if (
      !engine ||
      !source ||
      source.length > MAX_RAW_MATH_LENGTH ||
      !bracesAreBalanced(source)
    ) {
      return null;
    }

    const rendered = document.createElement('span');
    rendered.className = className;

    try {
      engine.render(source, rendered, {
        displayMode,
        output: 'htmlAndMathml',
        throwOnError: true,
        strict: 'ignore',
        trust: false,
        maxExpand: MAX_KATEX_EXPANSIONS,
        maxSize: MAX_KATEX_SIZE
      });
    } catch (_) {
      return null;
    }

    if (
      !rendered.querySelector ||
      !rendered.querySelector('.katex') ||
      rendered.querySelector('.katex-error')
    ) {
      return null;
    }

    return rendered;
  }

  function markUnsupportedBoldGlyphs(rendered) {
    if (!rendered || !rendered.querySelectorAll) {
      return 0;
    }

    const unsupportedGlyph = /[\u20A0-\u20CF\u2460-\u24FF\u2776-\u2793\u{1F100}-\u{1F1FF}]/gu;
    const glyphWeights = new Map();
    let marked = 0;

    for (const mathmlToken of rendered.querySelectorAll(
      '.katex-mathml mtext, .katex-mathml mi, ' +
      '.katex-mathml mn, .katex-mathml mo'
    )) {
      for (const glyph of (
        (mathmlToken.textContent || '').match(unsupportedGlyph) || []
      )) {
        if (!glyphWeights.has(glyph)) {
          glyphWeights.set(glyph, []);
        }

        glyphWeights.get(glyph).push(Boolean(
          mathmlToken.closest('[mathvariant="bold"]')
        ));
      }
    }

    if (!glyphWeights.size) {
      return 0;
    }

    for (const element of rendered.querySelectorAll('.katex-html span')) {
      if (element.children.length || !element.classList) {
        continue;
      }

      const glyphs = (element.textContent || '').match(unsupportedGlyph) || [];
      let shouldBeBold = false;

      for (const glyph of glyphs) {
        const weights = glyphWeights.get(glyph);

        if (weights && weights.length && weights.shift()) {
          shouldBeBold = true;
        }
      }

      if (
        shouldBeBold &&
        !element.classList.contains('aistudio-katex-bold-glyph-fallback')
      ) {
        element.classList.add('aistudio-katex-bold-glyph-fallback');
        marked += 1;
      }
    }

    return marked;
  }

  function renderRawMathCandidate(candidate) {
    if (!candidate || !candidate.tex) {
      return null;
    }

    const rendered = renderKatexSource(
      candidate.tex,
      candidate.displayMode,
      [
        'aistudio-raw-math-repaired',
        candidate.displayMode
          ? 'aistudio-raw-math-display'
          : 'aistudio-raw-math-inline',
        candidate.bold
          ? 'aistudio-raw-math-bold'
          : ''
      ].filter(Boolean).join(' ')
    );

    if (!rendered) {
      return null;
    }

    markUnsupportedBoldGlyphs(rendered);

    rendered.setAttribute('data-aistudio-raw-math-repaired', '1');
    rendered.setAttribute('data-aistudio-raw-math-kind', candidate.kind);
    rendered.setAttribute('data-katex-version', KATEX_VERSION);

    if (candidate.environment) {
      rendered.setAttribute(
        'data-aistudio-raw-math-environment',
        candidate.environment
      );
    }

    return rendered;
  }

  function repairRenderedMathBold(root) {
    if (!root || !root.querySelectorAll) {
      return 0;
    }

    const hosts = Array.from(
      root.querySelectorAll(RENDERED_MATH_SELECTOR)
    );

    if (root.matches && root.matches(RENDERED_MATH_SELECTOR)) {
      hosts.unshift(root);
    }

    let repaired = 0;

    for (const host of hosts) {
      if (
        !host.isConnected ||
        closest(host, USER_SELECTOR) ||
        closest(host, '.aistudio-raw-math-repaired') ||
        closest(host, '.aistudio-rendered-math-bold-repaired') ||
        (
          host.matches('.katex') &&
          host.parentElement &&
          closest(host.parentElement, RENDERED_MATH_SELECTOR)
        )
      ) {
        continue;
      }

      const source = renderedMathSource(host);

      if (
        !source ||
        source.length > MAX_RAW_MATH_LENGTH ||
        !bracesAreBalanced(source)
      ) {
        continue;
      }

      const normalized = normalizeKatexCommands(source);

      if (normalized === source) {
        continue;
      }

      const displayMode = Boolean(
        host.matches('ms-katex.display, .katex-display') ||
        host.matches('[display], [display="true"]') ||
        closest(host, '.katex-display') ||
        (host.querySelector && host.querySelector('.katex-display'))
      );
      const replacement = renderKatexSource(
        normalized,
        displayMode,
        [
          'aistudio-rendered-math-bold-repaired',
          displayMode
            ? 'aistudio-raw-math-display'
            : 'aistudio-raw-math-inline'
        ].join(' ')
      );

      if (!replacement || typeof host.replaceWith !== 'function') {
        continue;
      }

      markUnsupportedBoldGlyphs(replacement);

      replacement.setAttribute(
        'data-aistudio-rendered-math-bold-repaired',
        '1'
      );
      replacement.setAttribute('data-katex-version', KATEX_VERSION);
      host.replaceWith(replacement);
      repaired += 1;
    }

    return repaired;
  }

  function fallbackRawMath(source, candidate) {
    if (!candidate || candidate.kind !== 'environment') {
      return null;
    }

    if (candidate.environment === 'array') {
      const parsedArray = parseRawArray(source);
      return parsedArray ? createRepairedArray(parsedArray) : null;
    }

    if (candidate.environment === 'aligned') {
      const parsedAligned = parseRawAligned(source);
      return parsedAligned ? createRepairedAligned(parsedAligned) : null;
    }

    return null;
  }

  function mappedRawMathSource(container) {
    let source = '';
    const segments = [];

    const appendBoundary = () => {
      source += '\n';
    };

    const visit = (node) => {
      if (!node) {
        return;
      }

      if (node.nodeType === 3) {
        const value = node.nodeValue || '';

        if (value) {
          const start = source.length;
          source += value;
          segments.push({
            end: source.length,
            node,
            start
          });
        }

        return;
      }

      if (node.nodeType !== 1) {
        return;
      }

      if (
        node !== container &&
        node.matches &&
        node.matches(RAW_MATH_RANGE_BARRIER_SELECTOR)
      ) {
        source += RAW_MATH_RANGE_BARRIER_TEXT;
        return;
      }

      if (node.matches && node.matches('br')) {
        appendBoundary();
        return;
      }

      const isBlock = Boolean(
        node !== container &&
        node.matches &&
        node.matches(RAW_MATH_RANGE_BLOCK_SELECTOR)
      );

      if (isBlock) {
        appendBoundary();
      }

      for (const child of Array.from(node.childNodes || [])) {
        visit(child);
      }

      if (isBlock) {
        appendBoundary();
      }
    };

    visit(container);

    return { segments, source };
  }

  function mappedRawMathPoint(segments, index, endPoint) {
    for (const segment of segments) {
      const contains = endPoint
        ? index > segment.start && index <= segment.end
        : index >= segment.start && index < segment.end;

      if (contains) {
        return {
          node: segment.node,
          offset: index - segment.start
        };
      }
    }

    return null;
  }

  function mappedRawMathRange(mapping, block) {
    if (
      !mapping ||
      !block ||
      typeof document.createRange !== 'function'
    ) {
      return null;
    }

    const start = mappedRawMathPoint(
      mapping.segments,
      block.start,
      false
    );
    const end = mappedRawMathPoint(
      mapping.segments,
      block.end,
      true
    );

    if (!start || !end) {
      return null;
    }

    const range = document.createRange();

    try {
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);

      const selected = range.cloneContents();

      if (
        range.collapsed ||
        (
          selected.querySelector &&
          selected.querySelector(RAW_MATH_RANGE_BARRIER_SELECTOR)
        )
      ) {
        range.detach();
        return null;
      }
    } catch (_) {
      range.detach();
      return null;
    }

    return range;
  }

  function repairEmbeddedRawMathRanges(container) {
    if (!container || !container.querySelectorAll) {
      return 0;
    }

    const mapping = mappedRawMathSource(container);
    const operations = [];

    for (const block of findEmbeddedRawMathBlocks(mapping.source)) {
      const range = mappedRawMathRange(mapping, block);

      if (!range) {
        continue;
      }

      const replacement =
        renderRawMathCandidate(block.candidate) ||
        fallbackRawMath(block.source, block.candidate);

      if (replacement) {
        operations.push({ range, replacement });
      } else {
        range.detach();
      }
    }

    let repaired = 0;

    for (
      let index = operations.length - 1;
      index >= 0;
      index -= 1
    ) {
      const operation = operations[index];

      try {
        operation.range.deleteContents();
        operation.range.insertNode(operation.replacement);
        repaired += 1;
      } catch (_) {
        // DOM이 동시에 갱신된 경우 다음 스캔에서 다시 시도한다.
      } finally {
        operation.range.detach();
      }
    }

    if (repaired) {
      const previous = Number(container.getAttribute(
        'data-aistudio-embedded-raw-math-repaired'
      )) || 0;
      container.setAttribute(
        'data-aistudio-embedded-raw-math-repaired',
        String(previous + repaired)
      );
    }

    return repaired;
  }

  function repairRawMathContainer(container) {
    if (
      !container ||
      !container.isConnected ||
      closest(container, USER_SELECTOR) ||
      closest(container, SKIP_SELECTOR) ||
      !container.querySelector ||
      typeof container.replaceChildren !== 'function'
    ) {
      return 0;
    }

    const containsRenderedMath = Boolean(
      container.querySelector &&
      container.querySelector(RENDERED_MATH_SELECTOR)
    );

    if (
      containsRenderedMath &&
      !hasTextOutsideRenderedMath(container)
    ) {
      return 0;
    }

    const canReplaceWhole = !container.querySelector(
      'a, code, pre, table, .aistudio-array-repaired, ' +
      '.aistudio-aligned-repaired, .aistudio-raw-math-repaired, ' +
      '.aistudio-rendered-math-bold-repaired'
    );

    if (canReplaceWhole) {
      const mixedSource = sourceFromMixedMathDom(container);
      const sources = containsRenderedMath
        ? [mixedSource].filter(Boolean)
        : Array.from(new Set([
          mixedSource,
          container.textContent || '',
          typeof container.innerText === 'string'
            ? container.innerText
            : ''
        ].filter(Boolean)));

      for (const source of sources) {
        const candidate = parseRawMathCandidate(source);

        if (!candidate) {
          continue;
        }

        const replacement =
          renderRawMathCandidate(candidate) ||
          fallbackRawMath(source, candidate);

        if (replacement) {
          container.replaceChildren(replacement);
          return 1;
        }
      }
    }

    return repairEmbeddedRawMathRanges(container);
  }

  function hasSplitRawMathEnvironment(root, rootText) {
    if (
      !root ||
      !root.querySelectorAll ||
      typeof document.createTreeWalker !== 'function' ||
      !/(?:\\)?begin\s*\{[A-Za-z]/i.test(rootText || '') ||
      !/(?:\\)?end\s*\{[A-Za-z]/i.test(rootText || '')
    ) {
      return false;
    }

    const markers = new Map();
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(textNode) {
          const value = textNode.nodeValue || '';
          const parent = textNode.parentElement;

          if (
            !parent ||
            !/(?:\\)?(?:begin|end)\s*\{[A-Za-z]/i.test(value) ||
            closest(parent, RENDERED_MATH_SELECTOR) ||
            closest(parent, SKIP_SELECTOR)
          ) {
            return NodeFilter.FILTER_SKIP;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      const owner =
        closest(textNode.parentElement, RAW_MATH_CONTAINER_SELECTOR) ||
        textNode.parentElement;
      const tokenPattern = /(?:\\)?(begin|end)\s*\{([A-Za-z][A-Za-z*]*)\}/gi;
      let token;

      while ((token = tokenPattern.exec(textNode.nodeValue || ''))) {
        const environment = token[2];

        if (!RAW_MATH_ENVIRONMENTS.has(environment)) {
          continue;
        }

        const entry = markers.get(environment) || {
          openings: new Set(),
          closings: new Set()
        };
        entry[token[1].toLowerCase() === 'begin' ? 'openings' : 'closings']
          .add(owner);
        markers.set(environment, entry);
      }
    }

    for (const entry of markers.values()) {
      for (const opening of entry.openings) {
        for (const closing of entry.closings) {
          if (opening !== closing) {
            return true;
          }
        }
      }
    }

    return false;
  }

  function repairRawMath(root, rootText = '') {
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
    } else if (
      fallbackRoots.has(root) ||
      hasSplitRawMathEnvironment(root, rootText)
    ) {
      /*
       * AI Studio는 begin/end를 서로 다른 형제 renderer에 둘 수 있다.
       * selectorless fallback root와 실제로 marker가 갈라진 알려진 turn만
       * 추가해 일반 응답의 상위 root를 불필요하게 다시 순회하지 않는다.
       */
      containers.push(root);
    }

    let repaired = 0;

    for (const container of containers) {
      repaired += repairRawMathContainer(container);
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
      const sourceInner = match[2] || '';
      const openingTrim = (
        marker[0] === '*' &&
        sourceInner.startsWith('__') &&
        !sourceInner.endsWith('__')
      ) ? 2 : 0;
      const inner = sourceInner.slice(openingTrim);
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
      const asciiIdentifierInner = /^[0-9A-Za-z_]+$/.test(inner);

      if (
        markerCharacter === '_' &&
        (
          isWordChar(before) ||
          (
            isWordChar(after) &&
            asciiIdentifierInner
          )
        )
      ) {
        continue;
      }

      result.push({
        start,
        end,
        openingTrim,
        marker,
        raw: match[0],
        inner
      });
    }

    return result;
  }

  function isLikelyProseCodeText(text) {
    const source = (text || '').trim();

    if (
      !source ||
      source.length > MAX_INLINE_REPAIR_LENGTH ||
      !hasPair(source) ||
      hasMathLikeText(source)
    ) {
      return false;
    }

    const nonEmptyLines = source
      .split(/\r?\n/)
      .filter((line) => line.trim());

    const paragraphs = source
      .split(/\r?\n\s*\r?\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);

    if (
      nonEmptyLines.length > 30 ||
      paragraphs.length > 12
    ) {
      return false;
    }

    /*
     * 언어 표식, 실행 구문, 괄호 블록, 셸/SQL 시작 토큰이 있으면
     * 한국어 주석이나 문자열이 섞여 있어도 실제 코드로 간주한다.
     */
    if (
      /```|~~~/i.test(source) ||
      /(?:^|\n)\s*(?:const|let|var|function|class|import|export|return|def|async|await|if|for|while|switch|try|catch)\b/im.test(source) ||
      /(?:^|\n)\s*(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/im.test(source) ||
      /(?:^|\n)\s*[$>#]\s/m.test(source) ||
      /(?:^|\n)\s*(?:\/\/|\/\*|\*\/|<!--)/m.test(source) ||
      /(?:^|\n)\s*[A-Za-z_$][\w$.[\]-]*\s*(?:=|\+=|-=|\*=|\/=)/m.test(source) ||
      /(?:^|\n)\s*[A-Za-z_][\w.-]*\s*:\s+\S/m.test(source) ||
      /^\s*["'`][\s\S]*["'`]\s*;?\s*$/.test(source) ||
      /(?:=>|===|!==|&&|\|\||::|[{}]|;\s*(?:\n|$))/m.test(source) ||
      /<\/?[A-Za-z][^>]*>/.test(source) ||
      /\b(?:console\.(?:log|error|warn)|print|printf|echo)\s*\(/i.test(source) ||
      /\b[A-Za-z_$][\w$]*\s*\(/.test(source) ||
      /(?:Markdown|마크다운|문법|리터럴|literal|raw|코드\s*예시)/i.test(source)
    ) {
      return false;
    }

    const matches = findMatches(source);
    const hasKoreanEmphasis = matches.some((match) => (
      /[가-힣]{2}/.test(match.inner)
    ));
    const paragraphsLookLikeProse = paragraphs.every((paragraph) => {
      const hangulCount = (paragraph.match(/[가-힣]/g) || []).length;
      const visibleCount = (paragraph.match(/[^\s*_]/g) || []).length;
      const sentenceLike = (
        /(?:다|요|함|임|까|자)(?:[.!?]["'”’]?|$)/.test(paragraph) ||
        /[.!?]["'”’]?(?:\s|$)/.test(paragraph)
      );

      return Boolean(
        sentenceLike &&
        hangulCount >= 4 &&
        visibleCount > 0 &&
        hangulCount / visibleCount >= 0.2
      );
    });

    return Boolean(
      matches.length &&
      hasKoreanEmphasis &&
      paragraphs.length &&
      paragraphsLookLikeProse
    );
  }

  function findUnderlineMatches(text) {
    const result = [];
    const regex = /<u\s*>([\s\S]*?)<\/u\s*>/gi;
    let match;

    while ((match = regex.exec(text))) {
      const raw = match[0];
      const inner = match[1] || '';
      const opening = raw.match(/^<u\s*>/i)?.[0] || '';
      const closing = raw.match(/<\/u\s*>$/i)?.[0] || '';
      const start = match.index;
      const end = start + raw.length;
      const innerStart = start + opening.length;
      const innerEnd = end - closing.length;

      if (
        !opening ||
        !closing ||
        isEscaped(text, start) ||
        isEscaped(text, innerEnd)
      ) {
        continue;
      }

      if (
        !inner.trim() ||
        inner.length > MAX_MATCH_INNER_LENGTH ||
        /\n\s*\n/.test(inner) ||
        /<\/?[A-Za-z][^>]*>/.test(inner)
      ) {
        continue;
      }

      result.push({
        start,
        end,
        innerStart,
        innerEnd,
        opening,
        closing,
        raw,
        inner
      });
    }

    return result;
  }

  function skipped(textNode, allowedSkipRoot = null) {
    const parent =
      textNode &&
      textNode.parentElement;

    if (!parent) {
      return true;
    }

    let skipRoot = closest(parent, SKIP_SELECTOR);

    if (allowedSkipRoot && skipRoot === allowedSkipRoot) {
      skipRoot = closest(allowedSkipRoot.parentElement, SKIP_SELECTOR);
    }

    return Boolean(
      closest(parent, USER_SELECTOR) ||
      skipRoot ||
      insideEmbeddedMath(parent)
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

  function trimFragmentText(fragment, leadingLength, trailingLength) {
    const textNodes = [];
    const walker = document.createTreeWalker(
      fragment,
      NodeFilter.SHOW_TEXT
    );

    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    let leading = leadingLength;

    for (const textNode of textNodes) {
      if (!leading) {
        break;
      }

      const value = textNode.nodeValue || '';
      const amount = Math.min(leading, value.length);
      textNode.nodeValue = value.slice(amount);
      leading -= amount;
    }

    let trailing = trailingLength;

    for (let index = textNodes.length - 1; index >= 0; index -= 1) {
      if (!trailing) {
        break;
      }

      const textNode = textNodes[index];
      const value = textNode.nodeValue || '';
      const amount = Math.min(trailing, value.length);
      textNode.nodeValue = value.slice(0, value.length - amount);
      trailing -= amount;
    }

    for (const textNode of textNodes) {
      if (!textNode.nodeValue && textNode.parentNode) {
        textNode.parentNode.removeChild(textNode);
      }
    }

    return !leading && !trailing;
  }

  function createRepairedUnderline(contents) {
    const underline = document.createElement('u');
    underline.className = 'aistudio-underline-repaired';
    underline.setAttribute('data-aistudio-underline-repaired', '1');
    underline.appendChild(contents);
    return underline;
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

  function analyzeAsciiBoxTree(text) {
    if (
      !text ||
      text.length > MAX_ASCII_TREE_LENGTH
    ) {
      return null;
    }

    const source = text.replace(/\r\n?/g, '\n');
    const rawLines = source.split('\n');

    if (
      rawLines.length < 3 ||
      rawLines.length > MAX_ASCII_TREE_LINES
    ) {
      return null;
    }

    let branchCount = 0;
    let cornerCount = 0;
    let verticalCount = 0;
    let horizontalCount = 0;
    let structuralCount = 0;
    const lines = [];

    for (const line of rawLines) {
      if (!line.trim()) {
        lines.push({ plain: line });
        continue;
      }

      const junctions = Array.from(line.matchAll(/[┌└├┼│|]/g));

      /*
       * 복잡한 표/다중 열 그림은 건드리지 않는다. 한 행에 연결 축이 하나인
       * 단순 분류 트리만 공유 grid column으로 옮긴다.
       */
      if (junctions.length !== 1) {
        return null;
      }

      const junction = junctions[0][0];
      const index = junctions[0].index;

      structuralCount += 1;
      branchCount += /[├┼]/.test(junction) ? 1 : 0;
      cornerCount += /[┌└]/.test(junction) ? 1 : 0;
      verticalCount += /[│|]/.test(junction) ? 1 : 0;
      horizontalCount += line.includes('─') ? 1 : 0;
      lines.push({
        junction,
        left: line.slice(0, index),
        right: line.slice(index + junction.length)
      });
    }

    if (
      structuralCount < 3 ||
      !branchCount ||
      !cornerCount ||
      !verticalCount ||
      !horizontalCount
    ) {
      return null;
    }

    return { kind: 'single-axis', lines, source };
  }

  function asciiCharacterWidth(character) {
    const point = character.codePointAt(0) || 0;

    if (
      point === 0x200d ||
      (point >= 0x0300 && point <= 0x036f) ||
      (point >= 0xfe00 && point <= 0xfe0f)
    ) {
      return 0;
    }

    return (
      (point >= 0x1100 && point <= 0x115f) ||
      point === 0x2329 ||
      point === 0x232a ||
      (point >= 0x2e80 && point <= 0xa4cf) ||
      (point >= 0xac00 && point <= 0xd7a3) ||
      (point >= 0xf900 && point <= 0xfaff) ||
      (point >= 0xfe10 && point <= 0xfe19) ||
      (point >= 0xfe30 && point <= 0xfe6f) ||
      (point >= 0xff00 && point <= 0xff60) ||
      (point >= 0xffe0 && point <= 0xffe6) ||
      (point >= 0x1f300 && point <= 0x1faff) ||
      (point >= 0x20000 && point <= 0x3fffd)
    ) ? 2 : 1;
  }

  function asciiCharacterGridLine(line) {
    const runs = [];
    let column = 0;
    let current = null;

    const flush = () => {
      if (current) {
        runs.push(current);
        current = null;
      }
    };

    for (const character of Array.from(line)) {
      if (character === '\t') {
        flush();
        column += 8 - (column % 8);
        continue;
      }

      const width = asciiCharacterWidth(character);

      if (!width) {
        if (current) {
          current.text += character;
        }
        continue;
      }

      if (character === ' ') {
        flush();
        column += 1;
        continue;
      }

      const type = /[|│+┼]/.test(character)
        ? 'junction'
        : width === 2
          ? 'wide'
          : 'narrow';

      if (
        current &&
        current.type === type &&
        type !== 'junction' &&
        current.start + current.columns === column
      ) {
        current.text += character;
        current.columns += width;
      } else {
        flush();
        current = {
          columns: width,
          start: column,
          text: character,
          type
        };
      }

      column += width;
    }

    flush();
    return { columns: column, runs };
  }

  function asciiPanelIndex(column, panelStarts) {
    let panelIndex = 0;

    for (let index = 1; index < panelStarts.length; index += 1) {
      if (column < panelStarts[index]) {
        break;
      }

      panelIndex = index;
    }

    return panelIndex;
  }

  function asciiMedianColumn(columns) {
    if (!columns.length) {
      return null;
    }

    const ordered = columns.slice().sort((left, right) => left - right);
    return ordered[Math.floor((ordered.length - 1) / 2)];
  }

  function asciiStructuralRun(run, dividerLine) {
    return (
      /[|│]/.test(run.text) ||
      (dividerLine && /[+┼]/.test(run.text))
    );
  }

  function asciiPanelAnchors(lines, rawLines, panelStarts) {
    const candidates = panelStarts.map(() => ({ all: [], vertical: [] }));

    lines.forEach((line, lineIndex) => {
      const dividerLine = /_{6,}|─{6,}/.test(rawLines[lineIndex]);

      for (const run of line.runs) {
        if (!asciiStructuralRun(run, dividerLine)) {
          continue;
        }

        const panelIndex = asciiPanelIndex(run.start, panelStarts);
        const panel = candidates[panelIndex];
        panel.all.push(run.start);

        if (/[|│]/.test(run.text)) {
          panel.vertical.push(run.start);
        }
      }
    });

    return candidates.map((panel) => asciiMedianColumn(
      panel.vertical.length ? panel.vertical : panel.all
    ));
  }

  function normalizeAsciiPanelAxes(
    lines,
    rawLines,
    panelStarts,
    panelAnchors
  ) {
    return lines.map((line, lineIndex) => {
      const dividerLine = /_{6,}|─{6,}/.test(rawLines[lineIndex]);
      const runs = line.runs.map((run) => ({ ...run }));
      const structuralByPanel = panelStarts.map(() => []);

      runs.forEach((run, runIndex) => {
        if (!asciiStructuralRun(run, dividerLine)) {
          return;
        }

        const panelIndex = asciiPanelIndex(run.start, panelStarts);
        structuralByPanel[panelIndex].push({
          runIndex,
          sourceColumn: run.start
        });
      });

      structuralByPanel.forEach((structuralRuns, panelIndex) => {
        const anchor = panelAnchors[panelIndex];

        if (!structuralRuns.length || !Number.isFinite(anchor)) {
          return;
        }

        const sourceAxis = asciiMedianColumn(
          structuralRuns.map((entry) => entry.sourceColumn)
        );
        const delta = anchor - sourceAxis;
        const panelStart = panelStarts[panelIndex];
        const panelEnd = panelStarts[panelIndex + 1] ?? Infinity;
        const structuralIndexes = new Set(
          structuralRuns.map((entry) => entry.runIndex)
        );

        runs.forEach((run, runIndex) => {
          if (run.start < panelStart || run.start >= panelEnd) {
            return;
          }

          const structural = structuralIndexes.has(runIndex);

          if (structural) {
            run.start = anchor;
            run.structural = true;
            run.panelIndex = panelIndex;
          } else if (run.start > sourceAxis) {
            run.start += delta;
          }
        });

        if (!dividerLine) {
          return;
        }

        const firstStructuralIndex = structuralRuns[0].runIndex;
        const before = runs[firstStructuralIndex - 1];

        if (before && /^[_─]+$/.test(before.text)) {
          const columns = Math.max(0, anchor - before.start);
          before.columns = columns;
          before.text = before.text[0].repeat(columns);
        }
      });

      return {
        columns: Math.max(
          line.columns,
          ...runs.map((run) => run.start + run.columns)
        ),
        runs: runs.filter((run) => run.columns > 0)
      };
    });
  }

  function analyzeMultiPanelAsciiTable(text) {
    if (
      !text ||
      text.length > MAX_ASCII_TREE_LENGTH
    ) {
      return null;
    }

    const source = text.replace(/\r\n?/g, '\n');
    const rawLines = source.split('\n');
    const headings = source.match(/<[^>\n]{2,}>/g) || [];
    const headingLine = rawLines.find((line) => (
      (line.match(/<[^>\n]{2,}>/g) || []).length >= 2
    ));
    const dividerCount = rawLines.filter((line) => (
      /_{6,}|─{6,}/.test(line)
    )).length;
    const verticalCount = rawLines.filter((line) => /[|│]/.test(line)).length;

    if (
      rawLines.length < 5 ||
      rawLines.length > MAX_ASCII_TREE_LINES ||
      headings.length < 2 ||
      dividerCount < 2 ||
      verticalCount < 2 ||
      !headingLine ||
      !/[가-힣]/.test(source)
    ) {
      return null;
    }

    const headingMatches = Array.from(
      headingLine.matchAll(/<[^>\n]{2,}>/g)
    );
    const panelStarts = headingMatches.map((match) => (
      asciiCharacterGridLine(headingLine.slice(0, match.index)).columns
    ));

    if (panelStarts.length < 2 || panelStarts.length > 4) {
      return null;
    }

    const sourceLines = rawLines.map(asciiCharacterGridLine);
    const panelAnchors = asciiPanelAnchors(
      sourceLines,
      rawLines,
      panelStarts
    );

    if (panelAnchors.some((anchor) => !Number.isFinite(anchor))) {
      return null;
    }

    const lines = normalizeAsciiPanelAxes(
      sourceLines,
      rawLines,
      panelStarts,
      panelAnchors
    );
    const columns = Math.max(...lines.map((line) => line.columns));
    const runCount = lines.reduce(
      (total, line) => total + line.runs.length,
      0
    );

    if (
      columns < 30 ||
      columns > MAX_ASCII_GRID_COLUMNS ||
      runCount > MAX_ASCII_GRID_RUNS
    ) {
      return null;
    }

    return {
      columns,
      kind: 'character-grid',
      lines,
      panelAnchors,
      runCount,
      source
    };
  }

  function analyzeAsciiDiagram(text) {
    return (
      analyzeAsciiBoxTree(text) ||
      analyzeMultiPanelAsciiTable(text)
    );
  }

  function eligibleAsciiTreeCode(code) {
    const pre = code && code.parentElement;

    return Boolean(
      pre &&
      pre.matches('pre') &&
      !closest(code, USER_SELECTOR) &&
      !code.matches(
        '.aistudio-ascii-tree-repaired, .aistudio-prose-code-repaired, ' +
        '[class*="language-"], [class*="lang-"], [data-language], [data-lang]'
      ) &&
      !pre.matches(
        '.aistudio-ascii-tree-block-repaired, ' +
        '[class*="language-"], [class*="lang-"], [data-language], [data-lang]'
      ) &&
      !code.querySelector(
        'a, button, input, textarea, select, svg, math, script, style'
      )
    );
  }

  function asciiTreeCodeCandidates(root) {
    if (!root || !root.querySelectorAll) {
      return [];
    }

    const candidates = Array.from(root.querySelectorAll('pre > code'));

    if (root.matches && root.matches('pre > code')) {
      candidates.unshift(root);
    }

    return candidates.filter(eligibleAsciiTreeCode);
  }

  function hasAsciiBoxTreeHint(text) {
    return Boolean(
      text &&
      (
        (
          /[┌└]/.test(text) &&
          /[├┼]/.test(text) &&
          /[│|]/.test(text) &&
          text.includes('─')
        ) ||
        (
          /[가-힣]/.test(text) &&
          /<[^>\n]{2,}>[\s\S]*<[^>\n]{2,}>/.test(text) &&
          /_{6,}|─{6,}/.test(text) &&
          /[|│]/.test(text)
        )
      )
    );
  }

  function hasUnrepairedAsciiBoxTree(root, text = '') {
    const rootText = text || (root && root.textContent) || '';

    if (!hasAsciiBoxTreeHint(rootText)) {
      return false;
    }

    return asciiTreeCodeCandidates(root).some((code) => (
      Boolean(analyzeAsciiDiagram(code.textContent || ''))
    ));
  }

  function hasRepairableRoot(root, text = '') {
    const rootText = text || (root && root.textContent) || '';

    return Boolean(
      hasRepairableText(rootText) ||
      hasUnrepairedAsciiBoxTree(root, rootText) ||
      hasUnwrappedMobileTable(root)
    );
  }

  function repairAsciiBoxTrees(root) {
    let repaired = 0;

    for (const code of asciiTreeCodeCandidates(root)) {
      const analysis = analyzeAsciiDiagram(code.textContent || '');

      if (!analysis) {
        continue;
      }

      const pre = code.parentElement;
      const visual = document.createElement('span');
      visual.className = 'aistudio-ascii-tree-visual';
      visual.setAttribute('aria-hidden', 'true');

      if (analysis.kind === 'character-grid') {
        visual.classList.add('aistudio-ascii-character-grid');
        visual.style.setProperty(
          '--aistudio-ascii-columns',
          String(analysis.columns)
        );
      }

      analysis.lines.forEach((line, lineIndex) => {
        const row = document.createElement('span');
        row.className = 'aistudio-ascii-tree-row';
        row.setAttribute('data-aistudio-ascii-tree-line', String(lineIndex));

        if (analysis.kind === 'character-grid') {
          for (const run of line.runs) {
            const span = document.createElement('span');
            span.className = 'aistudio-ascii-grid-run';
            span.classList.add(`aistudio-ascii-grid-${run.type}`);

            if (run.structural) {
              span.classList.add('aistudio-ascii-grid-structural');
              span.setAttribute(
                'data-aistudio-ascii-panel',
                String(run.panelIndex)
              );
            }

            span.setAttribute('data-aistudio-ascii-cell', run.text);
            span.style.gridColumn = `${run.start + 1} / span ${run.columns}`;
            row.appendChild(span);
          }
        } else if (Object.prototype.hasOwnProperty.call(line, 'plain')) {
          const plain = document.createElement('span');
          plain.className = 'aistudio-ascii-tree-plain';
          plain.setAttribute('data-aistudio-ascii-cell', line.plain);
          row.appendChild(plain);
        } else {
          const left = document.createElement('span');
          const junction = document.createElement('span');
          const right = document.createElement('span');

          left.className = 'aistudio-ascii-tree-left';
          left.setAttribute('data-aistudio-ascii-cell', line.left);
          junction.className = 'aistudio-ascii-tree-junction';
          junction.setAttribute('data-aistudio-ascii-cell', line.junction);
          right.className = 'aistudio-ascii-tree-right';
          right.setAttribute('data-aistudio-ascii-cell', line.right);
          row.append(left, junction, right);
        }

        visual.appendChild(row);
      });

      code.classList.add('aistudio-ascii-tree-repaired');
      code.setAttribute('data-aistudio-ascii-tree-repaired', '1');
      pre.insertBefore(visual, code.nextSibling);
      pre.classList.add('aistudio-ascii-tree-block-repaired');
      pre.setAttribute(
        'data-aistudio-ascii-tree-block-repaired',
        '1'
      );
      pre.addEventListener('copy', (event) => {
        if (!event.clipboardData) {
          return;
        }

        event.clipboardData.setData('text/plain', analysis.source);
        event.preventDefault();
      });
      repaired += 1;
    }

    return repaired;
  }

  function repairProseCodeBold(root) {
    if (!root || !root.querySelectorAll) {
      return 0;
    }

    const candidates = Array.from(root.querySelectorAll('pre > code'));

    if (root.matches && root.matches('pre > code')) {
      candidates.unshift(root);
    }

    let repaired = 0;

    for (const code of candidates) {
      const pre = code.parentElement;

      if (
        !pre ||
        !pre.matches('pre') ||
        closest(code, USER_SELECTOR) ||
        code.matches(
          '.aistudio-ascii-tree-repaired, ' +
          '[class*="language-"], [class*="lang-"], [data-language], [data-lang]'
        ) ||
        pre.matches(
          '[class*="language-"], [class*="lang-"], [data-language], [data-lang]'
        ) ||
        code.querySelector(
          'a, button, input, textarea, select, svg, math, script, style'
        )
      ) {
        continue;
      }

      const text = code.textContent || '';

      if (!isLikelyProseCodeText(text)) {
        continue;
      }

      const fragment = document.createDocumentFragment();
      const count = appendBoldRepairedText(fragment, text);

      if (!count) {
        continue;
      }

      code.replaceChildren(fragment);
      code.classList.add('aistudio-prose-code-repaired');
      code.setAttribute('data-aistudio-prose-code-repaired', '1');
      pre.classList.add('aistudio-prose-code-block-repaired');
      pre.setAttribute('data-aistudio-prose-code-block-repaired', '1');
      repaired += count;
    }

    return repaired;
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
    const allowedSkipRoot = textNode && closest(
      textNode.parentElement,
      'strong:not(.aistudio-md-repaired), ' +
      'b:not(.aistudio-md-repaired)'
    );

    if (
      !textNode ||
      !textNode.parentNode ||
      !textNode.isConnected ||
      skipped(textNode, allowedSkipRoot)
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

      const allowedSkipRoot = closest(
        textNode.parentElement,
        'strong:not(.aistudio-md-repaired), ' +
        'b:not(.aistudio-md-repaired)'
      );

      if (
        skipped(textNode, allowedSkipRoot) ||
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

  function eligibleMobileTable(table) {
    return Boolean(
      table &&
      table.isConnected &&
      table.matches &&
      table.matches('table') &&
      !table.hasAttribute(MOBILE_TABLE_ATTR) &&
      !closest(table, USER_SELECTOR) &&
      !closest(
        table,
        'code, pre, [contenteditable="true"], [role="textbox"]'
      )
    );
  }

  function mobileTableCandidates(root) {
    if (!root || !root.querySelectorAll) {
      return [];
    }

    const tables = Array.from(root.querySelectorAll(
      `table:not([${MOBILE_TABLE_ATTR}])`
    ));

    if (
      root.matches &&
      root.matches(`table:not([${MOBILE_TABLE_ATTR}])`)
    ) {
      tables.unshift(root);
    }

    return tables.filter(eligibleMobileTable);
  }

  function hasUnwrappedMobileTable(root) {
    return mobileTableCandidates(root).length > 0;
  }

  function repairMobileTables(root) {
    let repaired = 0;

    for (const table of mobileTableCandidates(root)) {
      const parent = table.parentNode;

      if (!parent) {
        continue;
      }

      if (
        parent.matches &&
        parent.matches('.aistudio-table-scroll')
      ) {
        table.setAttribute(MOBILE_TABLE_ATTR, '1');
        continue;
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'aistudio-table-scroll';
      wrapper.setAttribute('data-aistudio-table-scroll', '1');
      wrapper.setAttribute('role', 'region');
      wrapper.setAttribute('aria-label', '표 가로 스크롤');
      wrapper.setAttribute('tabindex', '0');
      table.setAttribute(MOBILE_TABLE_ATTR, '1');
      parent.insertBefore(wrapper, table);
      wrapper.appendChild(table);
      repaired += 1;
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
    const innerStart = (
      match.start + markerLength + (match.openingTrim || 0)
    );
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

  function looksLikeEmbeddedMathElement(element) {
    if (!element || element.nodeType !== 1) {
      return false;
    }

    if (
      element.matches &&
      element.matches(INLINE_EMBEDDED_MATH_SELECTOR)
    ) {
      return true;
    }

    const localName = (element.localName || '').toLowerCase();

    if (
      localName.includes('-') &&
      EMBEDDED_MATH_NAME_TOKEN.test(localName)
    ) {
      return true;
    }

    return Boolean(
      element.classList &&
      Array.from(element.classList).some((token) => (
        EMBEDDED_MATH_CLASS_TOKEN.test(token)
      ))
    );
  }

  function embeddedMathRoots(fragment) {
    if (!fragment) {
      return [];
    }

    const candidates = [];

    if (looksLikeEmbeddedMathElement(fragment)) {
      candidates.push(fragment);
    }

    if (fragment.querySelectorAll) {
      for (const element of fragment.querySelectorAll('*')) {
        if (looksLikeEmbeddedMathElement(element)) {
          candidates.push(element);
        }
      }
    }

    return candidates.filter((element) => !candidates.some((other) => (
      other !== element &&
      typeof other.contains === 'function' &&
      other.contains(element)
    )));
  }

  function insideEmbeddedMath(element) {
    let current = element;

    while (current && current.nodeType === 1) {
      if (looksLikeEmbeddedMathElement(current)) {
        return true;
      }

      current = current.parentElement;
    }

    return false;
  }

  function fragmentTextWithoutEmbeddedMath(fragment) {
    const clone = fragment.cloneNode(true);

    embeddedMathRoots(clone).forEach((element) => element.remove());

    return clone.textContent || '';
  }

  function markEmbeddedMathRoots(fragment) {
    for (const element of embeddedMathRoots(fragment)) {
      element.classList.add('aistudio-md-embedded-math');
    }
  }

  function fragmentCrossesUnsafeInlineBoundary(fragment) {
    return Array.from(
      fragment.querySelectorAll(INLINE_REPAIR_BOUNDARY_SELECTOR)
    ).some((element) => !insideEmbeddedMath(element));
  }

  function repairInlineMatchContainingMath(range, match) {
    const contents = range.extractContents();
    const preview = contents.cloneNode(true);

    if (
      !trimFragmentText(
        preview,
        match.marker.length + (match.openingTrim || 0),
        match.marker.length
      ) ||
      fragmentTextWithoutEmbeddedMath(preview) !== match.inner
    ) {
      range.insertNode(contents);
      return false;
    }

    trimFragmentText(
      contents,
      match.marker.length + (match.openingTrim || 0),
      match.marker.length
    );
    markEmbeddedMathRoots(contents);

    const strong = createRepairedStrong('', match.marker);

    strong.classList.add('aistudio-md-contains-math');
    strong.replaceChildren(contents);
    range.insertNode(strong);
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
    const containsEmbeddedMath = embeddedMathRoots(selected).length > 0;
    const selectedText = containsEmbeddedMath
      ? fragmentTextWithoutEmbeddedMath(selected)
      : selected.textContent || '';
    const crossesBoundary = Boolean(
      selected.querySelector &&
      fragmentCrossesUnsafeInlineBoundary(selected)
    );

    if (
      selectedText !== match.raw ||
      crossesBoundary
    ) {
      if (typeof range.detach === 'function') {
        range.detach();
      }
      return false;
    }

    if (containsEmbeddedMath) {
      const repaired = repairInlineMatchContainingMath(range, match);

      if (typeof range.detach === 'function') {
        range.detach();
      }

      return repaired;
    }

    if (typeof range.detach === 'function') {
      range.detach();
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

  function collectInlineText(container) {
    const records = [];
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT
    );
    let text = '';
    const allowedSkipRoot = (
      container.matches &&
      container.matches(
        'strong:not(.aistudio-md-repaired), ' +
        'b:not(.aistudio-md-repaired)'
      )
    ) ? container : null;

    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      const value = textNode.nodeValue || '';

      if (!value || skipped(textNode, allowedSkipRoot)) {
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
  }

  function repairInlineUnderlineMatch(records, match) {
    const start = textPosition(records, match.start, false);
    const end = textPosition(records, match.end, true);

    if (!start || !end) {
      return false;
    }

    if (
      closest(start.node.parentElement, 'u, ins') ||
      closest(end.node.parentElement, 'u, ins')
    ) {
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
    const previewTrimmed = trimFragmentText(
      selected,
      match.opening.length,
      match.closing.length
    );

    if (
      selectedText !== match.raw ||
      crossesBoundary ||
      !previewTrimmed ||
      selected.textContent !== match.inner
    ) {
      if (typeof range.detach === 'function') {
        range.detach();
      }
      return false;
    }

    const contents = range.extractContents();

    if (
      !trimFragmentText(
        contents,
        match.opening.length,
        match.closing.length
      ) ||
      contents.textContent !== match.inner
    ) {
      range.insertNode(contents);
      if (typeof range.detach === 'function') {
        range.detach();
      }
      return false;
    }

    range.insertNode(createRepairedUnderline(contents));

    if (typeof range.detach === 'function') {
      range.detach();
    }

    return true;
  }

  function repairLiteralUnderlinesInContainer(container) {
    if (
      !container ||
      !container.isConnected ||
      closest(container, USER_SELECTOR)
    ) {
      return 0;
    }

    const snapshot = collectInlineText(container);

    if (
      !hasLiteralUnderline(snapshot.text) ||
      snapshot.text.length > MAX_INLINE_REPAIR_LENGTH
    ) {
      return 0;
    }

    const matches = findUnderlineMatches(snapshot.text);
    let repaired = 0;

    for (let index = matches.length - 1; index >= 0; index -= 1) {
      const current = collectInlineText(container);

      if (
        repairInlineUnderlineMatch(
          current.records,
          matches[index]
        )
      ) {
        repaired += 1;
      }
    }

    return repaired;
  }

  function repairLiteralUnderlines(root) {
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
      containers.push(root);
    }

    let repaired = 0;

    for (const container of containers) {
      repaired += repairLiteralUnderlinesInContainer(container);
    }

    return repaired;
  }

  function repairInlineEmphasisInContainer(container) {
    if (
      !container ||
      !container.isConnected ||
      closest(container, USER_SELECTOR)
    ) {
      return 0;
    }

    const collect = () => collectInlineText(container);

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

    const nativeEmphasis = Array.from(root.querySelectorAll(
      'strong:not(.aistudio-md-repaired), ' +
      'b:not(.aistudio-md-repaired)'
    ));

    if (
      root.matches &&
      root.matches(
        'strong:not(.aistudio-md-repaired), ' +
        'b:not(.aistudio-md-repaired)'
      )
    ) {
      nativeEmphasis.unshift(root);
    }

    containers.push(...nativeEmphasis);

    let repaired = 0;
    const visited = new Set();

    for (const container of containers) {
      if (visited.has(container)) {
        continue;
      }

      visited.add(container);
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

    if (!hasRepairableRoot(root, rootText)) {
      return 0;
    }

    let repaired = repairRawMath(root, rootText);
    repaired += repairRenderedMathBold(root);
    repaired += repairSplitTableBreaks(root);
    repaired += repairMobileTables(root);
    repaired += repairLiteralUnderlines(root);
    repaired += repairAsciiBoxTrees(root);
    repaired += repairProseCodeBold(root);
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

  function restoreOriginalMathFontSize(katexRoot) {
    const original = mathFitOriginalStyles.get(katexRoot);

    if (!original) {
      mathFitOriginalStyles.set(katexRoot, {
        priority: katexRoot.style.getPropertyPriority('font-size'),
        value: katexRoot.style.getPropertyValue('font-size')
      });
      return;
    }

    if (original.value) {
      katexRoot.style.setProperty(
        'font-size',
        original.value,
        original.priority
      );
    } else {
      katexRoot.style.removeProperty('font-size');
    }
  }

  function fitDisplayMath(display, force = false) {
    if (
      !display ||
      !display.isConnected ||
      !closest(display, STYLE_ROOT_SELECTOR) ||
      closest(display, USER_SELECTOR)
    ) {
      return false;
    }

    if (!force && mathFitCache.has(display)) {
      return false;
    }

    const katexRoot =
      display.querySelector(':scope > .katex') ||
      display.querySelector('.katex');

    if (!katexRoot) {
      return false;
    }

    restoreOriginalMathFontSize(katexRoot);
    katexRoot.removeAttribute('data-aistudio-math-fit-scale');
    katexRoot.removeAttribute('data-aistudio-math-natural-width');

    const availableWidth = Math.floor(display.clientWidth || 0);
    const naturalWidth = Math.ceil(katexRoot.scrollWidth || 0);
    const baseFontSize = Number.parseFloat(
      getComputedStyle(katexRoot).fontSize
    );

    mathFitCache.set(display, {
      availableWidth,
      naturalWidth
    });

    if (
      !availableWidth ||
      !naturalWidth ||
      !Number.isFinite(baseFontSize)
    ) {
      mathFitCache.delete(display);
      display.removeAttribute(MATH_FIT_CHECKED_ATTR);
      return false;
    }

    display.setAttribute(MATH_FIT_CHECKED_ATTR, '1');

    if (naturalWidth <= availableWidth + 1) {
      return false;
    }

    const scale = Math.max(
      MIN_DISPLAY_MATH_SCALE,
      Math.min(1, (availableWidth - 2) / naturalWidth)
    );

    katexRoot.style.setProperty(
      'font-size',
      (baseFontSize * scale).toFixed(3) + 'px',
      'important'
    );
    katexRoot.setAttribute(
      'data-aistudio-math-fit-scale',
      scale.toFixed(4)
    );
    katexRoot.setAttribute(
      'data-aistudio-math-natural-width',
      String(naturalWidth)
    );

    return true;
  }

  function fitWideDisplayMath(force = false) {
    const uncheckedSelector = `[${MATH_FIT_CHECKED_ATTR}="1"]`;
    const selector = force
      ? '.katex-display, ms-katex.display'
      : [
          `.katex-display:not(${uncheckedSelector})`,
          `ms-katex.display:not(${uncheckedSelector})`
        ].join(',');
    const displays = Array.from(document.querySelectorAll(
      selector
    )).filter((display) => {
      if (closest(display, USER_SELECTOR)) {
        return false;
      }

      const nestedDisplay =
        display.matches('ms-katex.display') &&
        display.querySelector('.katex-display');

      if (nestedDisplay) {
        display.setAttribute(MATH_FIT_CHECKED_ATTR, '1');
        return false;
      }

      return true;
    });
    let fitted = 0;

    for (const display of displays) {
      if (fitDisplayMath(display, force)) {
        fitted += 1;
      }
    }

    return fitted;
  }

  function nearViewport(element) {
    const height = window.innerHeight || 800;
    const rect = element.getBoundingClientRect();

    return (
      rect.bottom >= -height &&
      rect.top <= height * 2
    );
  }

  function hasFallbackRepairHint(text) {
    return Boolean(
      text &&
      (
        /[*_<>$\\┌└├┼│]/.test(text) ||
        /(?:begin|end)\s*\{/i.test(text)
      )
    );
  }

  function hasRawMathFallbackHint(text) {
    return Boolean(
      text &&
      (
        /(?:\\)?(?:begin|end)\s*\{[A-Za-z]/i.test(text) ||
        /\\(?:\[|\(|mathbf|boldsymbol|bm|bold|pmb|textbf|bfseries|bf)/.test(text) ||
        text.includes('$$') ||
        hasUnescapedDollarPair(text)
      )
    );
  }

  function hasActionableRepairElement(element) {
    const text = element && (element.textContent || '');

    if (!text || text.length > MAX_FALLBACK_ROOT_LENGTH) {
      return false;
    }

    const inlineText = collectInlineText(element).text;
    let hasCompleteRawMath = Boolean(parseRawMathCandidate(text));

    if (!hasCompleteRawMath && hasRawMathFallbackHint(text)) {
      hasCompleteRawMath = findEmbeddedRawMathBlocks(
        mappedRawMathSource(element).source
      ).length > 0;
    }

    if (
      hasCompleteRawMath &&
      !(
        element.matches &&
        element.matches(RAW_MATH_CONTAINER_SELECTOR)
      )
    ) {
      /*
       * A proven, bounded environment scope must survive collection even when
       * an explicit model turn contains it. The outer turn does not scan
       * arbitrary div/custom hosts, so dropping this scope would lose the
       * exact raw-math candidate that fallback discovery already validated.
       */
      rawMathScopeRoots.add(element);
    } else {
      rawMathScopeRoots.delete(element);
    }

    return Boolean(
      findMatches(inlineText).length ||
      findUnderlineMatches(inlineText).length ||
      hasLiteralTableBreak(text) ||
      hasCompleteRawMath ||
      hasUnrepairedAsciiBoxTree(element, text) ||
      hasUnwrappedMobileTable(element)
    );
  }

  function fallbackBlocked(element) {
    return Boolean(
      !element ||
      closest(element, USER_SELECTOR) ||
      closest(element, SKIP_SELECTOR) ||
      closest(element, FALLBACK_EXCLUDE_SELECTOR)
    );
  }

  function fallbackRootForTextNode(textNode) {
    const value = textNode && textNode.nodeValue;
    const parent = textNode && textNode.parentElement;

    const asciiCode = parent
      ? closest(parent, 'pre > code')
      : null;

    if (
      asciiCode &&
      eligibleAsciiTreeCode(asciiCode) &&
      analyzeAsciiDiagram(asciiCode.textContent || '')
    ) {
      fallbackRoots.add(asciiCode);
      return asciiCode;
    }

    if (
      !parent ||
      !hasFallbackRepairHint(value) ||
      fallbackBlocked(parent)
    ) {
      return null;
    }

    const surface =
      closest(parent, FALLBACK_SURFACE_SELECTOR) ||
      document.body;
    const includeSurface = Boolean(
      surface &&
      surface.matches &&
      surface.matches('ms-chat-turn')
    );

    if (
      !surface ||
      typeof surface.contains !== 'function' ||
      !surface.contains(parent)
    ) {
      return null;
    }

    let current = parent;

    for (
      let depth = 0;
      current && depth < MAX_FALLBACK_ASCENT;
      depth += 1
    ) {
      if (current === surface && !includeSurface) {
        break;
      }

      if (fallbackBlocked(current)) {
        return null;
      }

      const text = current.textContent || '';

      if (text.length > MAX_FALLBACK_ROOT_LENGTH) {
        return null;
      }

      if (hasActionableRepairElement(current)) {
        fallbackRoots.add(current);
        return current;
      }

      if (current === surface) {
        break;
      }

      current = current.parentElement;
    }

    return null;
  }

  function collectFallbackRoots() {
    const body = document.body;

    if (
      !body ||
      typeof document.createTreeWalker !== 'function'
    ) {
      return [];
    }

    const roots = new Set();
    const walker = document.createTreeWalker(
      body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(textNode) {
          return hasFallbackRepairHint(textNode.nodeValue || '')
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        }
      }
    );

    while (walker.nextNode()) {
      const root = fallbackRootForTextNode(walker.currentNode);

      if (root) {
        roots.add(root);
      }
    }

    return Array.from(roots);
  }

  function collectRoots() {
    const explicitRoots = Array.from(
      document.querySelectorAll(REPAIR_ROOT_SELECTOR)
    ).filter((root) => {
      return Boolean(
        root.isConnected &&
        !closest(root, USER_SELECTOR) &&
        hasRepairableRoot(root, root.textContent || '')
      );
    });

    const fallbackNow = Date.now();
    const fallbackFresh = fallbackDirty ||
      fallbackNow - lastFallbackScanAt >= SCAN_MS;

    if (fallbackFresh) {
      lastFallbackScanAt = fallbackNow;
      fallbackDirty = false;
    }

    const fallbackList = fallbackFresh
      ? collectFallbackRoots()
      : [];

    /*
     * 안정화 대기 중에는 비싼 body fallback 스캔을 반복하지 않는다.
     * 최초에 찾은 작은 후보만 명시적 root로 승격해 다음 예약 스캔에서도
     * 유지한다. 기존 10초 fallback 게이트와 수식 폭 캐시는 그대로 둔다.
     */
    for (const root of fallbackList) {
      if (
        root.setAttribute &&
        !root.matches(REPAIRED_ROOT_SELECTOR)
      ) {
        root.setAttribute('data-aistudio-repair-root', '1');
      }
    }

    const candidates = Array.from(new Set([
      ...explicitRoots,
      ...fallbackList
    ])).filter((root) => (
      root.isConnected &&
      !closest(root, USER_SELECTOR)
    ));

    /*
     * 일반 fallback 문단은 가장 바깥 turn으로 합치되, 완전한 수식 환경을
     * 검증한 작은 scope는 유지한다. 상위 turn은 임의 div/custom host를
     * 순회하지 않으므로 이 예외가 없으면 검증된 수식이 누락된다.
     */
    const roots = candidates.filter((root) => (
      rawMathScopeRoots.has(root) ||
      !candidates.some((candidate) => (
        candidate !== root &&
        typeof candidate.contains === 'function' &&
        candidate.contains(root)
      ))
    ));

    roots.sort((left, right) => {
      if (
        left === right ||
        typeof left.compareDocumentPosition !== 'function'
      ) {
        return 0;
      }

      if (left.contains && left.contains(right)) {
        return rawMathScopeRoots.has(right) ? 1 : -1;
      }

      if (right.contains && right.contains(left)) {
        return rawMathScopeRoots.has(left) ? -1 : 1;
      }

      const position = left.compareDocumentPosition(right);

      if (position & 4) {
        return -1;
      }

      if (position & 2) {
        return 1;
      }

      return 0;
    });

    const selected = roots.filter(nearViewport);

    /*
     * selectorless fallback은 한 답변에서 여러 문단이 될 수 있으므로
     * 최근 표식 문단을 넉넉히 확인한다.
     */
    roots.slice(-MAX_RECENT_REPAIR_ROOTS).forEach((root) => {
      if (!selected.includes(root)) {
        selected.push(root);
      }
    });

    return selected;
  }

  function lastModelTurn(roots = []) {
    const actionableRoots = roots.filter((root) => (
      hasRepairableRoot(root, root.textContent || '')
    ));
    const models = actionableRoots.length
      ? actionableRoots
      : Array.from(
        document.querySelectorAll(REPAIR_ROOT_SELECTOR)
      ).filter((root) => (
        root.isConnected &&
        !closest(root, USER_SELECTOR) &&
        hasRepairableRoot(root, root.textContent || '')
      ));

    const last = models[models.length - 1];

    if (!last) {
      return null;
    }

    return (
      closest(last, 'ms-chat-turn') ||
      closest(last, MODEL_TURN_SELECTOR) ||
      last
    );
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

  function hasVisibleActivityInside(container) {
    if (!container || !container.querySelectorAll) {
      return false;
    }

    return Array.from(container.querySelectorAll(
      MODEL_ACTIVITY_INDICATORS.join(',')
    )).some(visible);
  }

  function hasLocalGenerationActivity(root, rootTurn) {
    if (hasVisibleActivityInside(rootTurn)) {
      return true;
    }

    const surface = closest(root, FALLBACK_SURFACE_SELECTOR);
    let current = root && root.parentElement;

    for (
      let depth = 0;
      current && current !== surface && depth < MAX_FALLBACK_ASCENT;
      depth += 1
    ) {
      if (hasVisibleActivityInside(current)) {
        return true;
      }

      current = current.parentElement;
    }

    return false;
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

  function fallbackActivityHasRepairHint(indicator) {
    if (
      !indicator ||
      fallbackBlocked(indicator)
    ) {
      return false;
    }

    const surface = closest(indicator, FALLBACK_SURFACE_SELECTOR);
    let current = indicator.parentElement;

    for (
      let depth = 0;
      current && current !== surface && depth < MAX_FALLBACK_ASCENT;
      depth += 1
    ) {
      if (hasFallbackRepairHint(current.textContent || '')) {
        return true;
      }

      current = current.parentElement;
    }

    return false;
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

    /*
     * AI Studio keeps token/progress widgets mounted after a response has
     * finished. A visible Run action is the authoritative completed state;
     * stale spinners inside an old model turn must not freeze every repair.
     */
    if (findRunButton()) {
      return false;
    }

    const indicators = document.querySelectorAll(
      MODEL_ACTIVITY_SELECTOR
    );

    if (Array.from(indicators).some(visible)) {
      return true;
    }

    const fallbackIndicators = document.querySelectorAll(
      FALLBACK_ACTIVITY_SELECTOR
    );

    return Array.from(fallbackIndicators).some((indicator) => (
      visible(indicator) &&
      fallbackActivityHasRepairHint(indicator)
    ));
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
    if (
      document.hidden ||
      !ENABLE_SAFE_OUTPUT_REPAIR
    ) {
      return;
    }

    const now = Date.now();
    const html = document.documentElement;
    const fittedMathCount = fitWideDisplayMath(mathFitResizeDirty);
    mathFitResizeDirty = false;
    const pageGenerating = generating();

    if (html) {
      html.setAttribute(
        'data-aistudio-mobile-fix-generating',
        pageGenerating ? 'true' : 'false'
      );
      html.setAttribute(
        'data-aistudio-mobile-fix-fitted-math',
        String(fittedMathCount)
      );
    }

    const roots = collectRoots();
    const lastTurn = lastModelTurn(roots);

    if (pageGenerating) {
      /*
       * 현재 작성 중인 마지막 turn만 건드리지 않는다. 다른 과거 turn은
       * 이미 완성된 DOM이므로 정상적인 안정화 검사 후 복구할 수 있다.
       * Stop 하나 때문에 긴 세션의 모든 과거 답변이 영구 동결되지 않도록
       * 재확인도 계속한다.
       */
      schedule(GENERATION_RECHECK_MS);
    }

    const fallbackCount = roots.filter((root) => (
      fallbackRoots.has(root)
    )).length;
    let repairedThisScan = 0;
    let deferredThisScan = 0;

    if (html) {
      html.setAttribute(
        'data-aistudio-mobile-fix-scan-roots',
        String(roots.length)
      );
      html.setAttribute(
        'data-aistudio-mobile-fix-fallback-roots',
        String(fallbackCount)
      );
    }

    for (const root of roots) {
      const text = root.textContent || '';

      if (!hasRepairableRoot(root, text)) {
        states.delete(root);
        continue;
      }

      const rootTurn =
        closest(root, 'ms-chat-turn') ||
        closest(root, MODEL_TURN_SELECTOR) ||
        root;
      const isLastTurn = sameTurnOrInside(rootTurn, lastTurn);

      if (
        pageGenerating &&
        (
          isLastTurn ||
          hasLocalGenerationActivity(root, rootTurn)
        )
      ) {
        deferredThisScan += 1;
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

      if (
        root.setAttribute &&
        !root.matches(REPAIRED_ROOT_SELECTOR)
      ) {
        root.setAttribute('data-aistudio-repair-root', '1');
      }

      const repaired = repairRoot(root);
      const after = root.textContent || '';

      if (repaired > 0) {
        repairedThisScan += repaired;
        repairedTotal += repaired;
        states.set(root, {
          text: after,
          since: now,
          attempted: null,
          attempts: 0,
          lastAttemptAt: null
        });

        /* 새 KaTeX의 실제 폭은 DOM 삽입 다음 프레임에서 계산한다. */
        schedule(hasRepairableRoot(root, after) ? 250 : 100);

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

    if (html) {
      html.setAttribute(
        'data-aistudio-mobile-fix-last-repairs',
        String(repairedThisScan)
      );
      html.setAttribute(
        'data-aistudio-mobile-fix-total-repairs',
        String(repairedTotal)
      );
      html.setAttribute(
        'data-aistudio-mobile-fix-deferred-roots',
        String(deferredThisScan)
      );
    }

    if (
      repairedThisScan > 0 &&
      window.console &&
      typeof window.console.info === 'function'
    ) {
      window.console.info(
        '[AI Studio display fix v' + VERSION + '] repaired',
        {
          fallbackRoots: fallbackCount,
          repairs: repairedThisScan,
          roots: roots.length,
          total: repairedTotal
        }
      );
    }
  }

  function schedulerNow() {
    return (
      window.performance &&
      typeof window.performance.now === 'function'
        ? window.performance.now()
        : Date.now()
    );
  }

  function schedule(delay = 0) {
    if (!ENABLE_SAFE_OUTPUT_REPAIR) {
      return;
    }

    const dueAt = schedulerNow() + Math.max(0, delay);

    if (scanQueued) {
      return;
    }

    if (
      pendingTimerId !== null &&
      dueAt >= pendingDueAt
    ) {
      return;
    }

    if (pendingTimerId !== null) {
      window.clearTimeout(pendingTimerId);
    }

    pendingDueAt = dueAt;

    pendingTimerId = window.setTimeout(() => {
      pendingTimerId = null;
      pendingDueAt = Infinity;
      scanQueued = true;

      const run = () => {
        scanQueued = false;
        scan();
      };

      if (
        typeof window.requestIdleCallback === 'function'
      ) {
        window.requestIdleCallback(run, { timeout: 900 });
      } else {
        run();
      }
    }, Math.max(0, dueAt - schedulerNow()));
  }

  function clearFallbackRootsInsideUser(element) {
    const userRoot = closest(element, USER_SELECTOR);

    if (!userRoot) {
      return;
    }

    const marked = [];

    if (userRoot.matches && userRoot.matches(REPAIRED_ROOT_SELECTOR)) {
      marked.push(userRoot);
    }

    if (userRoot.querySelectorAll) {
      marked.push(...userRoot.querySelectorAll(REPAIRED_ROOT_SELECTOR));
    }

    for (const root of marked) {
      root.removeAttribute('data-aistudio-repair-root');
      fallbackRoots.delete(root);
      rawMathScopeRoots.delete(root);
      states.delete(root);
    }
  }

  function knownRepairRootForMutation(node) {
    const element = elementOf(node);

    if (!element || closest(element, USER_SELECTOR)) {
      return null;
    }

    let current = element;
    let knownRoot = null;

    while (current) {
      if (current.matches && current.matches(REPAIR_ROOT_SELECTOR)) {
        knownRoot = current;
      }

      if (
        current.matches &&
        current.matches(FALLBACK_SURFACE_SELECTOR)
      ) {
        break;
      }

      current = current.parentElement;
    }

    return knownRoot;
  }

  function isFallbackMutationTarget(element) {
    if (
      !element ||
      fallbackBlocked(element) ||
      !closest(element, FALLBACK_SURFACE_SELECTOR)
    ) {
      return false;
    }

    return hasRepairableRoot(element, element.textContent || '');
  }

  function shouldObserveMutationTarget(
    node,
    includeDescendants = false
  ) {
    const element = elementOf(node);

    if (
      !element ||
      closest(element, USER_SELECTOR)
    ) {
      return false;
    }

    if (
      closest(element, MODEL_TURN_SELECTOR) ||
      closest(element, REPAIR_ROOT_SELECTOR) ||
      isFallbackMutationTarget(element)
    ) {
      return true;
    }

    if (
      !includeDescendants ||
      typeof element.querySelectorAll !== 'function' ||
      !hasRepairableRoot(element, element.textContent || '')
    ) {
      return false;
    }

    /*
     * Angular가 완성된 role 없는 ms-chat-turn을 한 번에 삽입하면 mutation의
     * addedNode는 바깥 turn이다. 내부 renderer까지 확인해 10초 주기 스캔을
     * 기다리지 않고 안정화 타이머를 시작한다.
     */
    const hasExplicitRoot = Array.from(
      element.querySelectorAll(REPAIR_ROOT_SELECTOR)
    ).some((candidate) => !closest(candidate, USER_SELECTOR));

    if (hasExplicitRoot) {
      return true;
    }

    const fallbackSurface =
      element.matches(FALLBACK_SURFACE_SELECTOR)
        ? element
        : element.querySelector(FALLBACK_SURFACE_SELECTOR);

    return Boolean(
      fallbackSurface &&
      hasRepairableRoot(
        fallbackSurface,
        fallbackSurface.textContent || ''
      )
    );
  }

  function hasUnmeasuredDisplayMath(node) {
    const element = elementOf(node);

    if (
      !element ||
      !element.querySelector ||
      closest(element, USER_SELECTOR)
    ) {
      return false;
    }

    return Boolean(
      (
        element.matches &&
        element.matches('.katex-display, ms-katex.display') &&
        !element.hasAttribute(MATH_FIT_CHECKED_ATTR)
      ) ||
      element.querySelector(
        `.katex-display:not([${MATH_FIT_CHECKED_ATTR}]), ` +
        `ms-katex.display:not([${MATH_FIT_CHECKED_ATTR}])`
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
        const mutationElement = elementOf(mutation.target);

        if (mutation.type === 'attributes') {
          clearFallbackRootsInsideUser(mutationElement);
        }

        if (
          hasUnmeasuredDisplayMath(mutation.target) ||
          Array.from(mutation.addedNodes || []).some(
            hasUnmeasuredDisplayMath
          )
        ) {
          schedule(100);
        }

        const knownRoot = knownRepairRootForMutation(mutation.target);

        if (knownRoot) {
          /*
           * Known roots are already collected by a bounded selector query.
           * Reset same-text backoff for structural/attribute lifecycle changes
           * without triggering the expensive full-body fallback TreeWalker.
           */
          states.delete(knownRoot);
          schedule(MUTATION_SCAN_DELAY_MS);
          return;
        }

        if (shouldObserveMutationTarget(mutation.target)) {
          fallbackDirty = true;
          schedule(MUTATION_SCAN_DELAY_MS);
          return;
        }

        for (const node of mutation.addedNodes || []) {
          if (shouldObserveMutationTarget(node, true)) {
            fallbackDirty = true;
            schedule(MUTATION_SCAN_DELAY_MS);
            return;
          }
        }
      }
    });

    observer.observe(target, {
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        'data-turn-role',
        'data-message-author-role',
        'data-role',
        'data-author-role',
        'data-message-role',
        'aria-busy',
        'aria-hidden',
        'hidden'
      ],
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
      'katex-engine-safe-math-markdown-repair-session-keepalive'
    );

    window.addEventListener(
      'pageshow',
      () => {
        installStyle();
        mathFitResizeDirty = true;
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
          mathFitResizeDirty = true;
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

    window.addEventListener(
      'resize',
      () => {
        mathFitResizeDirty = true;
        schedule(150);
      },
      { passive: true }
    );

    window.addEventListener(
      'orientationchange',
      () => {
        mathFitResizeDirty = true;
        schedule(150);
      },
      { passive: true }
    );

    document.addEventListener(
      'visibilitychange',
      () => {
        if (!document.hidden) {
          installStyle();
          mathFitResizeDirty = true;
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
