# 1.13.24 leader-glyph and unknown-command review

This release fixes two reproduced defects in the fallback parsers: leader rows
that use typographic dot glyphs were not recognized, and unknown TeX commands
inside repaired aligned/array cells leaked their backslash names into the
painted text.

## Evidence and corrections

- `analyzeAsciiLeaderTable` previously matched only runs of four or more ASCII
  dots. Leader runs are now canonicalized first, so `·` (middle dot), `…`
  (ellipsis), `‥`, `․` and `．` runs — including space-separated (`· · ·`) and
  full-width forms — are recognized as dotted leaders. A single `…`/`‥` is
  accepted as a leader; a single `·` and runs of fewer than four ASCII dots stay
  literal so prose and labels such as `매출·수익` keep their meaning.
- `simpleTexRuns` previously emitted `\command` for any command it did not
  understand, which surfaced as literal `\notacommand` text in repaired
  aligned/array cells. Unknown commands are now dropped instead of leaked,
  while following groups still render.
- Common symbol commands now map to glyphs (Greek letters including uppercase
  forms, `\sum`, `\int`, `\partial`, arrows, set/relation operators, `\cdots`,
  `\checkmark` and related marks). Spacing commands (`\quad`, `\hspace`,
  `\kern`, …) emit a space and consume their argument group; `\phantom` family
  commands consume their argument group without emitting text.
- `\ ` and `\\` no longer leak backslash characters into projected cell text,
  and a command followed by whitespace preserves the separating space instead
  of swallowing it (`\alpha + \beta` projects to `α + β`).

## Tests

Unit regressions in `tests/userscript.test.cjs` cover middle-dot, ellipsis,
spaced-leader and dotted-label tables, single-middle-dot rejection, symbol
mapping, unknown-command non-leak, `\ `, `\hspace{...}`, `\phantom{...}` and an
end-to-end `parseRawArray` projection. `tests/t-account-browser.test.js` adds a
mixed `·`/`…` leader table and asserts aligned amounts, preserved notes, dotted
leader painting and untouched source. `npm test`, `npm run test:browser`, and
`npm run test:browser:mobile` were run for this release; fixture and parser
checks pass at 1280 px and 412 px.

## Limits

Unknown commands are dropped without a glyph fallback, so a command outside the
mapped set contributes no visible text beyond its group contents. Live AI
Studio verification and real-device Violentmonkey testing remain required for
each release; these are parser-level and fixture-level verifications.
