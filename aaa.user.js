// ==UserScript==
// @name         Google AI Studio KaTeX/Markdown Display Fix Mobile (CSS Safe)
// @namespace    https://aistudio.google.com/
// @version      1.5.0
// @description  CSS-only mobile-safe font/wrapping/display fix for Google AI Studio model output. Does not edit completed DOM.
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

  const VERSION = '1.5.0';
  const STYLE_ID = 'aistudio-mobile-safe-150-style';
  const VERSION_ATTR = 'data-aistudio-mobile-safe-150';

  /*
   * 이 버전은 DOM을 고치지 않는다.
   *
   * 목적:
   * - 모바일에서 모델 답변 폰트/줄바꿈 개선
   * - 코드블록 가로 스크롤 유지
   * - 표 셀 내부 줄바꿈 개선
   * - KaTeX / MathJax 수식이 잘리거나 깨지는 것을 최대한 방지
   *
   * 하지 않는 것:
   * - raw **bold** 를 <strong>으로 변환하지 않음
   * - raw TeX를 직접 KaTeX로 렌더링하지 않음
   * - 모델 출력 DOM을 split / wrap / replace 하지 않음
   */

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
    'aistudio-mobile-safe-145-style'
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

/*
 * 기본 UI 폰트 정리.
 * 모델 출력뿐 아니라 입력창/버튼의 모바일 가독성도 같이 맞춘다.
 */
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

/*
 * 모델 답변 본문 기본값.
 */
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

/*
 * 일반 문단/목록/제목은 모바일 폭 안에서 자연스럽게 줄바꿈.
 */
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

/*
 * 굵게 표시는 모델 답변 영역 안에서만 보정한다.
 * 전역 strong/b를 건드리지 않는다.
 */
${SCOPE} :where(strong, b) {
  font-family: inherit !important;
  font-weight: var(--as-bold) !important;
  text-shadow: none !important;
  -webkit-text-stroke: 0 !important;
}

/*
 * 링크나 긴 URL은 화면 밖으로 밀려나지 않게 한다.
 */
${SCOPE} :where(a) {
  overflow-wrap: anywhere !important;
  word-break: normal !important;
}

/*
 * 코드 계열 폰트.
 */
${SCOPE} :where(code, pre, kbd, samp) {
  font-family: var(--as-mono) !important;
  letter-spacing: 0 !important;
}

/*
 * 코드블록은 줄을 강제로 꺾지 않고 가로 스크롤한다.
 * 코드 가독성과 복사 안정성을 우선한다.
 */
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
 * 인라인 코드는 너무 긴 토큰일 때만 화면을 밀지 않게 한다.
 */
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

/*
 * 표는 block으로 바꾸지 않는다.
 * 표 구조는 유지하고, 셀 내부 텍스트만 모바일 폭에 맞춰 줄바꿈한다.
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
  box-sizing: border-box !important;

  white-space: normal !important;
  overflow-wrap: anywhere !important;
  word-break: normal !important;

  vertical-align: top !important;
}

/*
 * 이미지/영상은 모델 답변 폭을 넘지 않게 한다.
 * svg는 KaTeX 내부에서 쓰일 수 있으므로 여기서 건드리지 않는다.
 */
${SCOPE} :where(img, video, canvas) {
  max-width: 100% !important;
  height: auto !important;
  box-sizing: border-box !important;
}

/*
 * KaTeX / MathJax 안전 처리.
 *
 * 핵심:
 * - 수식 내부 구조는 건드리지 않는다.
 * - display 수식 바깥 래퍼에만 가로 스크롤을 허용한다.
 * - overflow-y: hidden 을 쓰지 않는다.
 *   분수, 적분, 행렬, 위첨자/아래첨자가 잘릴 수 있기 때문이다.
 */
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
 */
${SCOPE} :where(
  ms-katex:not(.display),
  .katex,
  mjx-container:not([display="true"])
) {
  white-space: nowrap !important;
}

/*
 * display 수식은 래퍼가 스크롤을 담당한다.
 */
${SCOPE} :where(.katex-display > .katex) {
  max-width: none !important;
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
`;

  let cleanedLegacy = false;

  function cleanupLegacy() {
    if (cleanedLegacy) {
      return;
    }

    cleanedLegacy = true;

    /*
     * 이전 버전 userscript가 삽입한 style만 제거한다.
     * KaTeX 자체 CSS일 수 있는 aistudio-mobile-katex-css 같은 link는 제거하지 않는다.
     */
    for (const id of LEGACY_STYLE_IDS) {
      const oldStyle = document.getElementById(id);

      if (oldStyle) {
        oldStyle.remove();
      }
    }

    /*
     * 이전 버전에서 Custom Highlight를 사용했다면 잔여 등록을 제거한다.
     * DOM 자체는 건드리지 않는다.
     */
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
        style =
          document.createElement('style');

        style.textContent = CSS_TEXT;
        parent.appendChild(style);
      }

      style.id = STYLE_ID;
    } else if (style.textContent !== CSS_TEXT) {
      style.textContent = CSS_TEXT;
    }

    style.setAttribute(
      'data-version',
      VERSION
    );

    if (!style.isConnected) {
      parent.appendChild(style);
    }
  }

  function boot() {
    const html =
      document.documentElement;

    if (!html) {
      return;
    }

    installStyle();

    html.setAttribute(
      VERSION_ATTR,
      VERSION
    );

    html.setAttribute(
      'data-aistudio-mobile-fix',
      'css-only-katex-safe'
    );

    /*
     * AI Studio는 SPA라서 navigation 후에도 style이 유지되는 편이지만,
     * 혹시 head가 다시 구성되는 경우를 대비해서 style만 재확인한다.
     * 모델 출력 DOM은 절대 수정하지 않는다.
     */
    window.addEventListener(
      'pageshow',
      installStyle,
      {
        passive: true
      }
    );

    window.addEventListener(
      'popstate',
      () => {
        window.setTimeout(
          installStyle,
          150
        );
      },
      {
        passive: true
      }
    );

    document.addEventListener(
      'visibilitychange',
      () => {
        if (!document.hidden) {
          installStyle();
        }
      },
      {
        passive: true
      }
    );

    window.setInterval(
      installStyle,
      10000
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      boot,
      {
        once: true
      }
    );
  } else {
    boot();
  }
}());