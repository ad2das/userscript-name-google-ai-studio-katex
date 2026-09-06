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
selection fallback, editing surfaces, multiline Korean painting, native renderer
wrappers with separately emphasized prefixes, source disconnection,
covering overlays, ancestor clipping/transforms, and teardown. The 20-sample timing check is a fixture acceptance gate, not a claim
about real AI Studio performance. Results have a `-live-preview` filename suffix.

Not yet a production implementation:

- Only one short, visible prose block is supported. Each emphasis interval must
  have homogeneous inline typography; unrelated native bold prefixes can remain.
  Wrapped lines are painted only if true bold fits every native line's glyph space.
  Math, code, nested formatting within an interval, controls, and complex shaping
  are rejected. These fallbacks still display the original Markdown.
- Delimiter layout space remains. This cannot reproduce canonical Markdown
  reflow, even when the visible glyphs fit. Selection temporarily reveals source.
- Root discovery, a multi-block revision queue, completion handover, nested
  scrollers, browser zoom and variable-font equivalence still require validation.
  The clipping gate rejects partially clipped ranges; occlusion uses three sampled
  hit-test points and is not proof against arbitrary partially overlapping surfaces.
  The simple global highlight name is only
  appropriate for this single-block fixture.
- Copy remains native Markdown and the visual layer adds no semantic emphasis
  for assistive technology. No clipboard/download/auth/network interception is
  used or proposed.

Do not enable this fixture as a live userscript feature based only on its passing
tests. Integration must retain these safety gates and broaden actual coverage.
