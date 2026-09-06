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
- Narrow recovery of numeric percentages before explicit math operators, such as
  `10% \times ...`; comments and verbatim TeX regions are preserved
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
- Leaked quoted emphasis such as `*"quoted Korean prose"*`, rendered as
  italics without mistaking multiplication, wildcards, or list markers
- Optional bold single- or multi-paragraph Korean prose that AI Studio misclassifies as
  an indented code block, preserving paragraph breaks and adjacent Korean text,
  while preserving actual code and literal Markdown syntax examples
- Literal `<u>underlined text</u>` in completed model responses, including tags
  split across multiple inline nodes, without interpreting attributes or other HTML
- Model-response discovery across case variants such as `Model`/`model` and
  `assistant`. Roleless turns are left untouched until a known model role/class
  appears; renderer tags alone are not proof of authorship.
- Selector-independent fallback discovery for raw Markdown/HTML/TeX in the
  nearest response paragraph, even when AI Studio changes every surrounding
  renderer tag inside a positively identified model turn, while excluding user,
  editor, code, navigation, and dialog surfaces
- Page-wide generation guarding: a recognized composer `Stop` or explicit model/
  composer busy state suspends completion-time response repair and measurement. A recognized
  composer `Run` can override stale progress widgets, but unrelated buttons cannot.
- A separate live emphasis layer can display eligible closed `**bold**` prose
  during generation without changing native response text nodes. It excludes
  user messages, thought turns, editing surfaces, code, and math crossings, and
  falls back to the original Markdown when typography or geometry is unsupported.
- Attribute-only role/busy/visibility lifecycle changes reset the local repair
  state, while known-turn mutations avoid the full-page fallback TreeWalker
- Display-math width measurements are cached and invalidated after formula changes,
  font loading, viewport resizes, and page visibility/navigation changes
- Prompt editors—including Firefox `contenteditable="plaintext-only"`—are always
  excluded from repair. Output scans pause during typing/IME composition and resume
  after 1.6 seconds of inactivity, even if the composer keeps keyboard focus.
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
- Generic Korean pseudo-tables inside code blocks are rebuilt into compact
  label/amount/separator CSS columns; header, blank, continuation, multi-row,
  and single-row entries share the same parser without account-name rules
- Fully framed Korean code diagrams normalize both outer edges in the shared
  Unicode character grid, while real source code and copy text stay untouched
- Authentication, prompt input, Run/`Ctrl+Enter`, and AI Studio network requests
  remain entirely native and are never intercepted by the display repair
- The userscript runs in Violentmonkey's isolated content context and suspends
  all response measurement and repair while AI Studio is generating

## Target

- `https://aistudio.google.com/*`
- `https://*.aistudio.google.com/*`

## Notes

The script is intended for mobile Firefox with Violentmonkey. It uses standard browser
DOM APIs and can also run in other userscript managers.

Version 1.13.5 uses a pinned KaTeX 0.18.1 `@require`, explicit update/download
URLs, and no privileged GM API.
Violentmonkey runs it in the isolated content-script context, where it can repair the
rendered DOM without accessing AI Studio's page JavaScript objects. The script
does not access Google auth state, issue session requests, intercept prompt events,
or retry a failed generation. It defers the completion-time DOM repair pipeline
while generation is detected, while a separate foreground controller may read
eligible prose and paint a pointer-transparent, accessibility-hidden canvas layer.
Native selection and copy remain authoritative; selecting text reveals Markdown,
and delimiter layout space is retained. The live layer is not a replacement for
native semantic emphasis or canonical Markdown reflow. See
[live rendering validation and limits](tests/LIVE-PREVIEW-EXPERIMENT.md).
Generation detection is necessarily dependent on AI Studio's changing UI; it is
not an authentication or permission-error fix.

Raw math repair replaces text candidates or complete line-bounded TeX blocks inside
completed model output after validation. Supported array/aligned HTML fallbacks
remain available when KaTeX cannot render them. Mixed content with existing native
math is not flattened into a replacement formula. Surrounding protected content is
preserved. Existing rendered math is left untouched except when its TeX source
contains the known nested-bold inheritance defect. Fenced/code text, links,
editable/user content, and malformed or unsupported environments are preserved. Only
conservatively detected box-drawing trees or Korean multi-panel ASCII tables receive
a visual grid wrapper; their original text content is unchanged.
Native rendered-math repairs preserve the outer host and real TeX comments.
Numeric-percentage recovery is a narrow heuristic, not a general-purpose TeX parser.
`ENABLE_HEURISTIC_PROSE_CODE_REPAIR` and `ENABLE_LEGACY_MARKER_RECOVERY` default to
`false`: unlabeled code and unmatched inner delimiters are preserved. Enabling these
legacy options can change source text and is not recommended for literal examples.
KaTeX rendering uses `trust: false` with bounded input size, expansion count, and
rendered size.

Discovery uses a scoped, resumable queue (up to 400 nodes per slice) and a 6 ms
cooperative budget. Clean response roots and math widths are cached. Inline work
also resumes through a per-root cursor, processing at most 32 containers and 100
emphasis groups per container per pass. Work already queued yields to active typing.
This is not a hard deadline: a single DOM operation, projection, or KaTeX render can
still exceed 6 ms. A shared resize observer invalidates changed formula widths.

## Tests

```sh
npm ci
npm test
npx playwright install firefox
npm run test:browser
npm run test:browser:mobile
```

The test matrix runs the normalized sources through the same pinned KaTeX release and
covers environment variants, bold commands, collapsed row separators, malformed input,
and untrusted links. The browser fixture additionally verifies DOM boundaries, MathML,
existing rendered math, and user-message preservation.
The browser suites run in fresh desktop Firefox profiles, with every request routed
to local fixtures or blocked. They cover real KaTeX nodes, protected controls,
role arrival, mutation batches, live diagram source/copy updates, pending scans during
typing, and 180-turn/3,600-paragraph warm-scan measurements. The mobile command uses
a 412 px viewport; it does not emulate Android Firefox or the Violentmonkey sandbox.
Reports and screenshots are written under `output/playwright/`.

Fixtures also verify zero userscript auth-refresh/fetch calls and exactly one native
Run click. They do not validate a signed-in AI Studio session or prove that a real
Google permission error is fixed. See [the 1.12.0 review](AUDIT-1.12.0.md) and
[historical audits](AUDIT.md) for evidence and limits.

1.13.5 aligns Korean dotted-leader statements using separate label, leader,
amount and note columns. It requires at least three recognized amount rows,
preserves original code/amount parentheses/notes, and rejects prose or filenames.

1.13.4 stretches pure horizontal rules across single delimited T-account grids.
The visual layer uses a CSS rule instead of fixed-length glyphs, preserving the
original code and keeping totals covered when the account expands. Browser
regressions check the painted rule width, column alignment, and source identity.

1.13.3 also recognizes a tight Unicode divider beside a bracketed amount in a
single ruled T-account. It preserves the original code and amount brackets;
desktop/mobile fixtures check divider alignment and horizontal scroll access.
This release does not change Tampermonkey installation settings or establish
that the update has been installed in the signed-in browser.

1.13.2 recognizes square-bracket headings in multi-panel T-account diagrams and
aligns each panel's vertical dividers without changing the original code block.
Live prose emphasis can coexist with native inline code: literal code is masked
only in the parser's offset-preserving view, and no live emphasis crosses into it.
The input-activity fast path from 1.13.1 remains enabled.

1.13.1 gates live-controller mutation batches before iterating their records when
the prompt is active, and cancels queued live frames on teardown. A focused
1,500-record input fixture previously made 4,500 ancestor lookups even though
rendering was eventually deferred; the early guard avoids that work entirely.
This is a measured hot-path fix, not proof that every source of real-page input
latency has been eliminated.

1.12.2 preserves literal Markdown inside native `.inline-code` spans and repairs
outer emphasis without replacing those spans or changing their code font. It
also removes obsolete script-owned emphasis wrappers after a native rewrite to
plain prose, preserving their current text nodes and comment anchors. Bounded
completion-work continuations can preempt a waiting idle callback; latest-turn
selection follows document order, and both retry checks use the same backoff.
Generation and prompt-activity guards remain in force. This release does **not**
implement live streaming emphasis or fix Google generation permission errors.
Live emphasis was introduced separately in 1.13.0, with the limits documented above.

1.12.1 repairs paired book/PDF page ranges through AI Studio's native nested
`ms-cmark-node`/`span` wrappers and Angular comment anchors. This structure was
observed in a live Chrome conversation with 1.12.0 actually enabled; the older
text-node-only rule missed it. Native elements and listeners are preserved.

Chrome/Tampermonkey installation has two stages: install the userscript, then
enable Tampermonkey's **Allow User Scripts** permission and reload AI Studio.
Installation alone does not establish execution. See the
[official permission instructions](https://www.tampermonkey.net/faq.php?q=Q209).

1.12.0 adds nested emphasis, emphasis across a hard line break, shared code-literal
protection, native-boundary-preserving edits, queued cleanup after generation,
detached/reinserted-root and table-wrapper recovery, and narrower CSS protection.
It also recognizes one specific accidental strikethrough pattern in paired book/PDF
page ranges with equal spans; this is an explicitly documented heuristic.

1.11.1 also repairs leaked emphasis around existing native bold elements, such as
`**<strong>'체계적인 방법'</strong>**`, without treating the bold element as a code/editor
boundary. The screenshot follow-up suite covers 13 markup variants, native node
identity, protected content, and repeat-run idempotence. A screenshot alone cannot
prove which underlying DOM variant the live page uses.
