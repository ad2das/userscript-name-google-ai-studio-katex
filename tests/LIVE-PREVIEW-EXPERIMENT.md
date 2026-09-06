# Live emphasis experiment (not shipped)

Run `node tests/run-browser.cjs --live-preview` and repeat with `--mobile`.
The userscript does not load `fixtures/live-emphasis-prototype.js`.

This experiment uses an accessibility-hidden, pointer-transparent canvas layer
outside the native answer. CSS Custom Highlights suppress only the replaced
range's ink. Native text nodes, comments, selection, and copy remain authoritative.
It reuses the userscript's emphasis parser; it does not run completion-time DOM
repair while the fixture's Stop control remains active.

Current gates cover split spans, unchanged source/node identity, timer-driven
streaming, ambiguous closing runs at the streaming tail, rewrite invalidation,
selection fallback, editing surfaces, multiline fallback, source disconnection,
and teardown. The 20-sample timing check is a fixture acceptance gate, not a claim
about real AI Studio performance. Results have a `-live-preview` filename suffix.

Not yet a production implementation:

- Only one short, homogeneous, visible prose block is supported. A line-crossing
  range is rejected. Math, code, nested formatting, controls, and complex content
  are rejected. These fallbacks still display the original Markdown.
- Delimiter layout space remains. This cannot reproduce canonical Markdown
  reflow, even when the visible glyphs fit. Selection temporarily reveals source.
- Root discovery, a multi-block revision queue, completion handover, nested
  scrollers/clipping/occlusion, browser zoom and variable-font equivalence still
  require implementation or validation. The simple global highlight name is only
  appropriate for this single-block fixture.
- Copy remains native Markdown and the visual layer adds no semantic emphasis
  for assistive technology. No clipboard/download/auth/network interception is
  used or proposed.

Do not enable this fixture as a live userscript feature based only on its passing
tests. Integration must retain these safety gates and broaden actual coverage.
