# Live emphasis experiment (not shipped)

Run `node tests/run-browser.cjs --live-preview` and repeat with `--mobile`.
The userscript does not load `fixtures/live-emphasis-prototype.js`.
The additional `--live-controller` suite exercises a shared multi-paragraph layer
and highlight registry, dirty-paragraph scheduling, typing release, generation
phase transitions, legacy completion repair, and teardown. Repeat with `--mobile`.
Neither experimental file is loaded by the userscript.

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

- The projection engine handles short, visible prose blocks. Each emphasis interval must
  have homogeneous inline typography; unrelated native bold prefixes can remain.
  Wrapped lines are painted only if true bold fits every native line's glyph space.
  Math, code, nested formatting within an interval, controls, and complex shaping
  are rejected. These fallbacks still display the original Markdown.
- Delimiter layout space remains. This cannot reproduce canonical Markdown
  reflow, even when the visible glyphs fit. Selection temporarily reveals source.
- The experimental controller shares one layer and registry across paragraphs,
  with up to four blocks or six milliseconds per callback (one block remains
  indivisible). Unchanged paragraphs retain their paint. Discovery now uses a
  persistent element walker, visiting at most 128 elements within the frame's
  budget, excluding protected subtrees. A 130-paragraph fixture verifies that
  discovery is not limited to the last 64 paragraphs. Real response-ownership
  integration remains necessary.
- On generation completion, existing paint bridges up to five seconds while
  legacy repair proceeds. The fixture samples animation frames and observes no
  uncovered raw-text frame in that transition. This is not a guarantee for
  arbitrary native-renderer timing: expiry restores the source even if legacy
  repair has not succeeded. Typing and hidden-page guards clear the layer. Nested
  scrollers, browser zoom and variable-font equivalence still require validation.
  The clipping gate rejects partially clipped ranges; occlusion uses three sampled
  hit-test points and is not proof against arbitrary partially overlapping surfaces.
  The highlight name is reserved for a single controller per document.
- Copy remains native Markdown and the visual layer adds no semantic emphasis
  for assistive technology. No clipboard/download/auth/network interception is
  used or proposed.

Do not enable this fixture as a live userscript feature based only on its passing
tests. Integration must retain these safety gates and broaden actual coverage.
