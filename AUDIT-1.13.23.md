# 1.13.23 row-separator repair review

This release fixes reproduced fallback-parse defects in repaired aligned and
array bodies. It does not claim that every malformed TeX input can be rendered.

## Evidence and corrections

- Row-spacing arguments (`\\[6pt]`, the lost-backslash form `\[6pt]`,
  `\\*[4pt]`, and a bracket left at the start of the next line) are consumed
  while splitting rows. Previously the argument leaked into the next row's
  first cell and was painted as literal text by
  `createRepairedAligned`/`createRepairedArray`.
- `\cr` and `\crcr` at brace depth 0 now split rows. KaTeX rejects `\crcr`, so
  the fallback rebuild was the only available path for such input.
- A trailing row-spacing argument no longer creates a phantom `[6pt]` row.
- Leading `\cline{...}` and `\hdashline` rules are stripped together with
  `\hline`. `\cline` is unsupported by KaTeX, so arrays containing it fall back
  to the DOM rebuild; the command previously appeared as `\cline1-2` text in
  the rebuilt cells.
- A single-token `\bm x` (no braces) is normalized to `\boldsymbol x`, matching
  the existing `\bm{...}` alias behavior.

## Tests

Unit regressions in `tests/userscript.test.cjs` cover every separator form, the
lost-backslash form, non-dimension brackets that must stay literal, trailing
spacing, `\cline`/`\hdashline` stripping, and the `\bm` alias. `npm test`,
`npm run test:browser`, and `npm run test:browser:mobile` were run for this
release; fixture and parser checks pass at 1280 px and 412 px.

## Limits

Only bounded TeX dimension units are recognized as row spacing. Unknown
commands inside cells still rely on the existing lexical projection. Live
AI Studio verification and real-device Violentmonkey testing remain required
for each release; these are parser-level and fixture-level verifications.
