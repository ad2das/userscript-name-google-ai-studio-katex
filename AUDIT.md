# 1.11.0 strict audit

Reviewed 2026-09-06. This is a tested hardening release, not a claim of perfection.

## Corrections

- Represent rendered math as opaque atoms when repairing Markdown, including
  math-only emphasis. Preserve math hosts, inputs, links, editors, and user content.
- Tokenize emphasis without allowing an unmatched `*` to swallow later bold;
  preserve escaped markers, code spans/fences, identifiers, and malformed delimiters.
- Require positive model ownership. Handle role arrival and all records in a
  mutation batch; do not invalidate repair state in response to our own DOM writes.
- Scope Run/Stop interpretation to recognized composer controls and prioritize busy
  state. No authentication, submission, keyboard, or network interception is added.
- Preserve native math hosts, inline display mode, and TeX comments; invalidate
  cached sizing on same-host updates and font loading. Contain extremely wide
  formulas in a padded horizontal scroller after reaching the font-size floor.
- Reject executable code with box-drawing strings. Refresh diagram overlays after
  text changes or code-node replacement; copy current source, without substituting
  the entire diagram for a partial selection.

## Runtime work

Inline emphasis and underline repairs prepare live DOM ranges once per container.
Fallback discovery is scoped and resumable; clean-root eligibility and formula
measurements are cached. Native math subtrees are pruned from text projection.
Environment matching and root deduplication avoid the previous pairwise scans.
Input size, visited nodes, nesting depth, and KaTeX expansion/size are bounded.
There are no new runtime dependencies; Playwright is a development-only dependency.

The fixture benchmark uses 180 completed turns / 3,600 paragraphs and six warm
scans. Baseline 1.10.11 measured approximately 9–11 ms per scan on this machine;
the release desktop run measured `[2, 1, 1, 0, 1, 1]` ms, and the 412 px run
measured `[1, 1, 1, 0, 1, 2]` ms (1 ms median in both). Zero is timer rounding,
not literally free work. Exact timings depend on machine load and are emitted in
the test report. Editor-focused scan assertions
require zero body TreeWalkers and zero computed-style reads. These are neither a
memory/power benchmark nor a guarantee about cold rendering or Android latency.

Lightweight here means less repeated runtime work, not a smaller source download:
the normalized userscript grew from 169,098 to 174,929 UTF-8 bytes as safety checks
were added. KaTeX remains pinned at 0.18.1; no additional runtime library is loaded.

## Verification and limits

Run `npm test`, `npm run test:browser`, and `npm run test:browser:mobile`.
The browser runner verifies existing rendering regressions and 37 targeted audit
checks, fails on uncaught page errors, and saves desktop/mobile reports and PNGs.
It uses local fixtures, real pinned KaTeX, and fresh Firefox profiles at 1280 px and
412 px. It does not exercise a real signed-in AI Studio session, Android Firefox,
Violentmonkey `@require` execution, or a server-side permission failure.

An Oracle second-model review informed the boundary, parser, observer, and
performance fixes. Findings were checked against source and reproduction tests;
the review itself is not proof of correctness.

Remaining tradeoffs: roleless output stays unmodified until ownership is known;
Run/Stop and busy detection depends on UI signals; native bold repair replaces
host children (not the host); raw percentage and Korean prose-code recovery remain
intentional heuristics. A 6 ms cooperative scan budget is not a hard deadline for
one synchronous DOM operation or KaTeX render. Future AI Studio DOM changes still
require real-device regression testing.
