# 1.13.33 audit

## Problem

While the user scrolls, AI Studio re-creates the turns it shows. Up to 1.13.32 the
script repaired the re-created nodes in place after they had been painted, so raw
`**`, `*` and `$` flashed on screen for one or more frames on every scroll. AI
Studio could also rewrite a node the script had already repaired, which brought the
raw text back until the next scan. On a phone the per-scroll repair work also cost
several seconds of CPU per conversation.

## Change: block mirror

- Inside a model response, every block leaf (`p`, `h1`-`h6`, `td`, `th`) keeps AI
  Studio's own nodes untouched. CSS hides them, and the script shows a repaired copy
  next to them.
- The copy is rebuilt when AI Studio changes the leaf, and dropped when AI Studio
  removes it.
- Leaves in view are built inside the mutation callback, before the next paint
  (capped at 50 ms per callback). The rest are built from a queue. A queued leaf that
  scrolls into view moves to the front and is built before that frame paints when the
  6 ms frame budget allows.
- Display-math fitting reuses its last verdict while the formula, its width and the
  font are unchanged. A width that collapses to 0 (a hidden container) is ignored.
- Note repair for `*… **bold*` + italic tail (AI Studio took the italic closer from
  the bold run):
  - now also works after a line break, inside table cells, and with inline code or
    math inside the note;
  - text after the note stays outside the repaired italic;
  - a `*` between a letter or digit and a symbol such as `%` or `+` (`25*%`,
    `x*+y*z`) no longer starts italic, and an italic run must have balanced brackets
    and quotes.

## Results

Live AI Studio, phone layout (412×915, Android Firefox user agent), two long saved
conversations (A, B), read-only loads, runs interleaved.

| measure | conversation | 1.13.32 | 1.13.33 |
|---|---|---|---|
| sampled frames with a raw marker while scrolling | A | 46, 53 | 0, 0, 0, 0 |
| | B | 19, 31 | 0, 0, 0, 0 |
| total scan CPU per run (ms) | A | 2,625 / 2,641 | 874 – 1,152 |
| | B | 3,585 / 3,988 | 1,897 – 2,094 |
| frames over 50 ms during a 160-step scroll | A | 7 / 8 / 8 | 6 / 6 / 6 |
| | B | 30 / 31 / 30 | 21 / 28 / 22 |
| longest frame (ms) | A | 504 / 495 / 508 | 574 / 591 / 587 |
| | B | 329 / 329 / 325 | 345 / 354 / 350 |

Visible result compared leaf by leaf with 1.13.32 (a walk that reads the repaired
copy), over 30 synthetic streamed answers, 8 real streamed answers and both
conversations:
- 0 leaves worse than 1.13.32;
- 3,568 leaves identical;
- 12 leaves better (raw `**`/`*` removed, a raw `\begin{array}` rendered).

Font family, size, weight, style, line height, color and letter spacing of the
unchanged text in a repaired copy match AI Studio's own rendering on every
compared character. Leaf position and width match to 0 px.

## Known limits

- On conversation A one frame during the scroll is about 80 ms longer than in
  1.13.32. It is a single task in which AI Studio re-creates the turns. The extra
  time is the new mutation walk (about 120 ms). A follow-up is in progress.
- A markdown table written directly after a paragraph line, and a note that
  contains two bold runs, still show raw `|` / `*`. 1.13.32 shows them raw as well.

## Tests

- New suites:
  - `--r4-mirror`: mirror build, identity, cleanup;
  - `--r4-flash`: no raw frame on re-create and scroll;
  - `--r4-residual`: note shapes, table cell with math and inline code;
  - `--math-fit-force`: fit reuse, hidden-container resize, content change inside
    a formula.
- `italic-note` and `italic-quote-note` gained the new shapes and the guards that
  must stay literal.
- `npm test`, `node tests/run-browser.cjs` and `--mobile` pass.
