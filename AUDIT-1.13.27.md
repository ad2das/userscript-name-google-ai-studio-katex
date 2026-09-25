# 1.13.27 typing-latency audit on heavily piled-up conversations

This release removes the remaining script-attributable typing cost on very long
AI Studio conversations. Measurements use a plaintext Firefox cookie session
injected into Playwright Firefox (Chrome's app-bound encryption refuses copied
profiles) and the real conversation `122RBV0dl3lKs48sh8ae2OgkUgDCHYUS0`
(66 turns, 5.6k elements) inflated by cloning `ms-chat-turn` N times:

- x1: 66 turns / 5.7k elements
- x4: 264 turns / 20.5k elements
- x12: 792 turns / 60.3k elements

Method: each burst types a fixed 26-character Korean sentence at 40 ms delay;
requestAnimationFrame frame gaps (max / frames over 50 ms / over 100 ms) and
total burst wall time are recorded. Style on/off is `style.disabled`; both
states get a 1.5 s settle plus a forced style/layout flush before the burst so
the numbers reflect steady state, not the one-off restyle of re-enabling the
sheet. Probe scripts live in the gitignored `output/probe/`.

## Findings

1. **Universal-selector rules caused the dominant whole-document invalidation.**
   `:where(.katex, .katex *)` and
   `:where(ms-katex, .katex, .katex *, mjx-container, mjx-container *)`
   made every composer attribute change re-cascade over the whole document.
   Isolated on the x12 page, the `*` form cost +83 s per 26-char burst; the
   descendant variant `.aistudio-raw-math-repaired :where(.katex, .katex *)`
   plus 105 copies cost +3.0 s, exactly the live sheet's delta. `overflow-wrap`
   and `word-break` inherit from `.katex` itself, so the `*` branches were
   removed.
2. **`:has()` island guard cost ~0.5 s per burst at x12.** The guard now uses a
   JS-maintained `data-aistudio-island` marker with identical exclusion
   semantics (a style root whose subtree contains a user/contenteditable island
   is excluded). The marker is recomputed on style install and repair scans
   only, never per keystroke, and normally writes nothing.
3. **The remaining residual is a distributed style-cascade tax.** With
   declarations emptied (selectors unchanged) the sheet costs nothing; with
   declarations present the cost is spread across all rules (chunk bisection:
   additive, no hot rule left); hiding `ms-chat-turn` removes it entirely;
   `content-visibility: auto` does not help; never-match guards
   (`:not(.zzz-never)` per rule) are catastrophically worse (+35 s). The tax
   scales with document size and cannot be removed while the sheet styles the
   content at all.

## 26-character burst ladder (style on vs off, steady state)

| Scale | on (ms) | off (ms) | delta | notes |
|---|---|---|---|---|
| x1 | 1618 / 1593 / 1596 | 1529 / 1538 / 1544 | ~+65 ms (~+2.5 ms/keystroke) | o50: on 1/0/1 vs off 0/0/1 (noise) |
| x4 | 2942 / 3049 / 3156 | 2810 / 2642 / 2753 | ~+310 ms (~+12 ms/keystroke) | o50 +8 frames of 52-55 samples |
| x12 | 8748 / 9220 / 8509 | 7341 / 7486 / 7766 | ~+1.3 s | frame counts at parity (o50 40/39/39 vs 39/39/39, o100 40/39/39 vs 38/39/39) |

For reference, the same x12 page with no userscript at all needs ~7.5 s per
burst (36% of a second per keystroke in Firefox itself); 1.13.26 measured
+3.4-4.7 s of script-attributable cost on the same page, so the script's share
fell by roughly 3x and its absolute contribution at real conversation scale is
single-digit milliseconds per keystroke.

## Verification

- `npm test` (syntax + unit; asserts the built sheet has no `:has()`, carries
  the island marker guard on every rule, and that `refreshIslandMarks` exists).
- `node tests/run-browser.cjs` (desktop), `--mobile`, `--audit`: green.
- `output/probe/guard-repro.cjs`: marker keeps islands native, clean roots
  styled, unguarded roots polluted (semantic check).
- Synthetic matrices and chunk bisection logs in `output/probe/ls-*.log`.

## Known limits

- On the 792-turn / 60k-element page Firefox's own composer handling is the
  dominant cost; no stylesheet configuration reaches literal on/off parity
  there while styling the content. The sheet no longer contains `:has()`,
  universal `*` subject branches, or subject-side guards that force
  document-wide invalidation.
- The marker is refreshed on install/scan cadence; an island that appears
  inside a styled content root is excluded within the next scan (normally
  sub-second), which matches previous behaviour in practice (no such nesting
  exists on the live page: 0 of 4332 style roots contain protected islands).