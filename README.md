# Google AI Studio KaTeX/Markdown Display Fix Mobile

Mobile Firefox + Violentmonkey userscript for Google AI Studio.

## Install

Open this link on the phone with Violentmonkey installed:

https://raw.githubusercontent.com/ad2das/userscript-name-google-ai-studio-katex/main/aaa.user.js

Violentmonkey should detect the `.user.js` file and show an install screen.

## What It Fixes

- KaTeX display math horizontal scrolling on mobile
- Markdown tables overflowing the screen
- Literal `<br>`, `<br/>`, and `<br />` markers shown inside completed table cells,
  including markers split across multiple inline nodes
- Raw TeX environments whose `\begin`/`\end` or row-separator backslashes were
  lost by AI Studio, including arrays, aligned equations, matrices, cases,
  split/equation, align/alignat, and gather variants
- Raw display/inline delimiters and bold math commands such as `\mathbf`,
  `\boldsymbol`, `\bm`, `\bold`, `\pmb`, `\textbf`, `\bf`, and nested
  `\text{...}`
- Bold inheritance through nested text, including
  `\mathbf{10,000\text{원}}`, in both raw and already-rendered KaTeX
- Complete raw TeX blocks embedded after headings or explanatory paragraphs,
  while preserving the surrounding response text and fenced code examples
- Raw TeX blocks next to rendered tables and other structured response content,
  without rebuilding or deleting those surrounding DOM elements
- Bold fallback for unsupported enclosed and currency glyphs such as `①` and `₩`
- Native vertical page scrolling
- Split `**bold**` / `__bold__` Markdown text in model responses
- Mobile readable Google/Samsung-like font stack
- Code/pre blocks with horizontal scrolling
- Long-running AI Studio document sessions kept warm without reloading the tab
- A Google-auth/session preflight before stale Run/`Ctrl+Enter` submissions

## Target

- `https://aistudio.google.com/*`
- `https://*.aistudio.google.com/*`

## Notes

The script is intended for mobile Firefox with Violentmonkey. It uses standard browser
DOM APIs and can also run in other userscript managers.

Version 1.8.1 uses a pinned KaTeX 0.18.1 `@require`, explicit update/download
URLs, and no privileged GM API.
Violentmonkey may inject it into
the page context when allowed and safely fall back to the content context. The script
does not retry a failed generation. It refreshes an exposed Google auth token when
needed, warms the authenticated AI Studio document session before generation, and
blocks all answer-DOM repair while AI Studio is streaming.

Raw math repair is fail-closed: it replaces either an entire completed model-output
container or complete line-bounded TeX blocks inside plain response text, and only
after KaTeX renders each candidate without an error. Surrounding prose and line breaks
are preserved. Existing rendered math is left untouched except when its TeX source
contains the known nested-bold inheritance defect. Fenced/code blocks, links,
editable/user content, and malformed or unsupported environments are always preserved.
KaTeX rendering uses `trust: false` with bounded input size, expansion count, and
rendered size.

## Tests

```sh
npm install
npm test
```

The test matrix runs the normalized sources through the same pinned KaTeX release and
covers environment variants, bold commands, collapsed row separators, malformed input,
and untrusted links. The browser fixture additionally verifies DOM boundaries, MathML,
existing rendered math, and user-message preservation.
