# 1.13.28 rendering and scroll-jank audit

Measured on the live site with Playwright Firefox, a copied Firefox cookie
session, a 412×915 mobile viewport and real conversations (lease / revenue
accounting lectures, up to 198k tokens). Probe scripts live in the gitignored
`output/survey/`: `walk.cjs` scrolls the viewport and flags visible defects
(literal `**`, raw TeX, raw pipe rows, tiny/clipped/off-screen math, display
gaps); `jank.cjs` does 160 wheel steps of 260 px every 50 ms and records
requestAnimationFrame gaps; `timeline.cjs` correlates long frames with
instrumented userscript calls.

## Rendering findings and fixes

1. **Wide display math was tiny and still clipped.** KaTeX 0.18 splits a
   chained equation into sibling `.katex-base` blocks, but the fitter only
   scaled down to 0.58 (11 px) and the formula still overflowed. Chains with
   ≥2 top-level bases and no tag now wrap between bases with a hanging indent
   (scaled to ≥0.85 only when one base alone is wider than the column);
   single-block arrays/matrices scale to ≥0.75 and then scroll. Inline math
   wider than its container wraps the same way before falling back to the
   scroller. Inline hosts are marked checked so they are not re-measured.
2. **Display math vertical gaps.** Margin/padding applied to both the outer
   `ms-katex.display` and the inner `.katex-display`/`pre`/`code`, plus the
   native `<br>` after the block, turned a 13 px formula into ~95 px. Inner
   spacing is zeroed and the trailing `<br>` hidden (stacked gap 13.6 px,
   tail gap 11 px).
3. **Numeric ranges eaten as strikethrough.** `(PDF 11~15쪽, 교재 639~643쪽)`
   paired the two single tildes into `<s>`, which also broke the surrounding
   `**…**`. A generic range branch restores the tildes when a digit/unit or
   `]` touches both sides without whitespace, including two ranges sharing one
   `<s>` across two bold clauses; endpoints must increase. Real deletions
   (`<s>10,000원</s> 8,000원`, `<s>삭제된 문장</s>`) stay struck.
4. **Italic notes whose bold closer was eaten.** `*(※ … **₩32,891*…)*`
   left literal stars and only the tail italic. The repair now accepts
   inline-code atoms, multi-span notes, and notes that follow a `<br>` inside
   a paragraph (e.g. after a display formula). Nodes are moved, never cloned;
   stale wrappers are unwrapped when the native tail changes.
5. **Raw pipe tables with inline code / wrapped rows.** Tables printed inside
   a paragraph whose cells contained inline code or continued on the next
   line were left as raw `| … |` text; they are now projected with code-styled
   runs and multi-line cells (`white-space: pre-line`), copy text unchanged.

After the fixes the walk finds no visible defects on the four reference
conversations (the only flags are hidden raw-table sources whose visual table
renders correctly).

## Scroll-jank findings and fixes

Baseline 1.13.27 on the 198k-token conversation: 90,873 MutationObserver
records in 36 s (single batches up to 19,144 records), `handleMutations` 11 s
total / 2.7 s max, `repairRawMath` 8 s, `scanResponses` 243 runs with
`repairRoot` re-run up to 57× on the same root, `generating()` 8 ms × 482.

- Records are grouped per `(target, type)` with memoized ancestor lookups;
  batches over 300 records are queued and drained in `SCAN_BUDGET_MS` slices.
- Visible priority only reorders roots; it no longer bypasses the retry
  backoff, so finished roots are not re-repaired.
- The raw-math gate ignores TeX stored in rendered `.katex-mathml` annotations.
- `generating()` queries composer buttons first and caches for 200 ms.
- Scans are deferred while scrolling (140 ms idle) and the filtered root list
  is cached between unchanged scans.
- `flushPendingCleanup`, display-math fitting and inline-math containment are
  budgeted; inline math is measured in batched read/write phases (no layout
  thrash); scans yield between phases (at most twice in a row, so the root
  loop always progresses); urgent scans run in a task after the frame instead
  of inside `requestAnimationFrame`.

| build (same conversation, same wheel script) | frames >50 ms | >100 ms | max | p95 |
|---|---|---|---|---|
| 1.13.27 | ~220 | — | 2.3 s | 137 ms |
| after record coalescing / backoff fix | 17 | ~10 | 291 ms | 25 ms |
| 1.13.28 | 6-7 | 4 | ~215 ms | 21-25 ms |
| no userscript | 5 | 0 | 96 ms | 20.8 ms |

`timeline.cjs` on 1.13.28: none of the remaining long frames (83-212 ms)
contains a userscript call longer than 15 ms; they are native style/layout of
lazily inserted turns, possibly amplified by the stylesheet's cascade cost.

## Tests

`npm test`, `node tests/run-browser.cjs` (desktop and `--mobile`) plus the new
`--math-wrap`, `--perf-mutation`, `--range-strike` suites and the extended
`--italic-note`, `--raw-table`, `--scroll`, `--contract`, `--scheduler`
suites all pass.
