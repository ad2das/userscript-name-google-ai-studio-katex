# Live emphasis validation and limits (1.13.0)

Run `node tests/run-browser.cjs --live-preview` and repeat with `--mobile`.
The projection and controller now live inside `aaa.user.js`. The former standalone
fixture copies were removed so tests exercise the same implementation as installs.
The additional `--live-controller` suite exercises a shared multi-paragraph layer
and highlight registry, dirty-paragraph scheduling, typing release, generation
phase transitions, legacy completion repair, and teardown. Repeat with `--mobile`.
The `--live-integration` suite exercises the unmodified userscript through its
real boot adapter, native-style model ownership, Run/Stop controls and prompt input.
All three live suites are included in the default browser test run.

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

Known implementation and validation limits:

- The projection engine handles short, visible prose blocks. Each emphasis interval must
  have homogeneous inline typography; unrelated native bold prefixes can remain.
  Wrapped lines are painted only if true bold fits every native line's glyph space.
  Math, code crossings, nested formatting within an interval, controls, and complex
  shaping are rejected. Native inline code outside an emphasis interval is an
  opaque parser region and remains unchanged. Other fallbacks still display the
  original Markdown.
- Delimiter layout space remains. This cannot reproduce canonical Markdown
  reflow, even when the visible glyphs fit. Selection temporarily reveals source.
- The experimental controller shares one layer and registry across paragraphs,
  with up to four blocks or six milliseconds per callback (one block remains
  indivisible). Unchanged paragraphs retain their paint. Discovery now uses a
  persistent element walker, visiting at most 128 elements within the frame's
  budget, excluding protected subtrees. A 130-paragraph fixture verifies that
  discovery is not limited to the last 64 paragraphs. The boot adapter selects
  the latest positively identified model container, excluding user/editor and
  thought scopes; real AI Studio verification is still required after installing
  this version. New renderer variants can remain unsupported.
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

Passing fixtures do not establish universal live-page correctness. Unsupported
cases still show source Markdown during streaming; no claim of complete marker
elimination, canonical reflow, universal occlusion handling, or generation-error
causality follows from these tests. A real installation and generation audit is
required for each release.
