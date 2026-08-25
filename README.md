# Google AI Studio KaTeX/Markdown Display Fix Mobile

Mobile Firefox + Violentmonkey userscript for Google AI Studio.

## Install

Open this link on the phone with Violentmonkey installed:

https://raw.githubusercontent.com/ad2das/userscript-name-google-ai-studio-katex/main/aaa.user.js

Violentmonkey should detect the `.user.js` file and show an install screen.

## What It Fixes

- KaTeX display math horizontal scrolling on mobile
- Wide display formulas fitted to the available mobile width without leaking
  KaTeX `underbrace`/stretchy SVG segments as long black lines
- Markdown tables use a contained horizontal scroller instead of crushing short
  Korean columns (`일자`, `구분`, account names) into syllable-per-line text
- Literal `<br>`, `<br/>`, and `<br />` markers shown inside completed table cells,
  including markers split across multiple inline nodes or left inside AI Studio's
  native bold elements
- Raw TeX environments whose `\begin`/`\end` or row-separator backslashes were
  lost by AI Studio, including arrays, aligned equations, matrices, cases,
  split/equation, align/alignat, and gather variants
- Broken accounting arrays with `\multicolumn` headings and `\hline` rules are
  restored as aligned, responsive T-accounts instead of exposing TeX commands
- Raw display/inline delimiters and bold math commands such as `\mathbf`,
  `\boldsymbol`, `\bm`, `\bold`, `\pmb`, `\textbf`, `\bf`, and nested
  `\text{...}`
- Bare percentage signs in raw TeX are preserved as visible `\%` instead of
  commenting out the rest of an aligned row and joining it to the next row
- Bold inheritance through nested text, including
  `\mathbf{10,000\text{원}}`, in both raw and already-rendered KaTeX
- Complete raw TeX blocks embedded after headings or explanatory paragraphs,
  while preserving the surrounding response text and fenced code examples
- Raw TeX blocks next to rendered tables and other structured response content,
  without rebuilding or deleting those surrounding DOM elements
- Raw TeX environments split across sibling AI Studio renderer blocks, including
  known `ms-cmark-node` turns as well as selectorless fallback markup
- Complete raw TeX inside an otherwise unknown `div`/custom renderer nested in
  a known model turn, without broad generic-element scans
- Bold fallback for unsupported enclosed and currency glyphs such as `①` and `₩`
- Native vertical page scrolling
- Split `**bold**` / `__bold__` Markdown text in model responses, including
  emphasis that spans an already-rendered KaTeX, MathML, or custom inline-math
  host and literal nested markers left inside AI Studio's native bold elements—even
  inside virtualized historical responses outside known renderer tags
- Bold single- or multi-paragraph Korean prose that AI Studio misclassifies as
  an indented code block, preserving paragraph breaks and adjacent Korean text,
  while preserving actual code and literal Markdown syntax examples
- Literal `<u>underlined text</u>` in completed model responses, including tags
  split across multiple inline nodes, without interpreting attributes or other HTML
- Model-response discovery across case variants such as `Model`/`model` and
  `assistant`, plus roleless `ms-cmark-node`/`ms-text-chunk` response fallbacks
  while continuing to preserve user turns
- Selector-independent fallback discovery for raw Markdown/HTML/TeX in the
  nearest response paragraph, even when AI Studio changes every surrounding
  turn/renderer tag, while excluding user, editor, code, navigation, and dialog
  surfaces
- Per-turn generation guarding: a live `Stop` action defers only the active
  latest response, while already completed conversation turns are still
  repaired; a visible `Run` action overrides stale progress widgets
- Attribute-only role/busy/visibility lifecycle changes reset the local repair
  state, while known-turn mutations avoid the full-page fallback TreeWalker
- Display-math width measurements are cached and rerun only for new formulas or
  viewport resizes, keeping long mobile chats responsive
- Prompt editors—including Firefox `contenteditable="plaintext-only"`—are excluded
  from mutation, scroll, resize, and periodic fallback scans while focused, so
  typing does not walk the full long-chat DOM
- Mobile readable Google/Samsung-like font stack
- Code/pre blocks with horizontal scrolling
- Simple `┌ ┤ ┼ │ └ ─` trees and Korean multi-panel ASCII tables aligned through
  bounded grids (Hangul 2 columns, ASCII 1), with each panel's vertical separators
  and `+`/`┬`/`┴` box junctions snapped to one axis while preserving original text
  for copy/download and leaving normal and language-labelled code untouched
- Korean `[설명] ──▶ "결과"` code diagrams use one shared arrow axis even when
  AI Studio splits numbers and text into differently styled inline spans
- Multi-stage Korean balance timelines with dates, amounts, and several arrows
  use a bounded character grid so every stage stays on its intended column
- Generic Korean pseudo-tables inside code blocks use measured Unicode columns
  and normalized `|` axes; this covers multi-row and single-row journal entries
  without account-name-specific rules, while real source code stays untouched
- Long-running AI Studio document sessions kept warm without reloading the tab
- A Google-auth/session preflight before stale Run/`Ctrl+Enter` submissions

## Target

- `https://aistudio.google.com/*`
- `https://*.aistudio.google.com/*`

## Notes

The script is intended for mobile Firefox with Violentmonkey. It uses standard browser
DOM APIs and can also run in other userscript managers.

Version 1.10.6 uses a pinned KaTeX 0.18.1 `@require`, explicit update/download
URLs, and no privileged GM API.
Violentmonkey may inject it into
the page context when allowed and safely fall back to the content context. The script
does not retry a failed generation. It refreshes an exposed Google auth token when
needed, warms the authenticated AI Studio document session before generation, and
defers DOM repair only for the active latest answer while AI Studio is streaming.

Raw math repair is fail-closed: it replaces either an entire completed model-output
container or complete line-bounded TeX blocks inside plain response text, and only
after KaTeX renders each candidate without an error. Surrounding prose and line breaks
are preserved. Existing rendered math is left untouched except when its TeX source
contains the known nested-bold inheritance defect. Fenced/code text, links,
editable/user content, and malformed or unsupported environments are preserved. Only
conservatively detected box-drawing trees or Korean multi-panel ASCII tables receive
a visual grid wrapper; their original text content is unchanged.
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
