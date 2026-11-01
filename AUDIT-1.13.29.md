# 1.13.29 repair-latency audit

Complaint: repairs show up too slowly. Measured with a live Playwright Firefox
probe (copied Firefox cookie session, 412×915 mobile viewport, the four
reference conversations of the 1.13.28 audit, two runs each). The probe samples
visible defects (literal `**`, raw TeX, raw pipe rows, …) every 50 ms and
reports how long fixable defects stay on screen after the script starts on an
opened conversation (L) and after scrolling to five positions (S). Probe
scripts live in the gitignored `output/survey/` (`latency.cjs`,
`latency-table.cjs`, `--trace` for per-function attribution).

## Findings on 1.13.28

- Sliced work waited a 16 ms timer, then an animation frame, then a 0 ms
  timeout before every 6 ms slice; the script was busy only ~20-27 % of the
  time defects stayed visible.
- A new or changed root restarted its 150/300 ms settle wait when a scan first
  noticed it, not when the DOM last changed.
- Visible priority was computed only after a real scroll, and the round-robin
  cursor started past the reordered visible roots.
- AI Studio does not mutate an opened, idle conversation; after a scroll it
  re-renders the visible turns (single mutation batches up to 46k records).

## Changes

- Budget continuations resume through a MessageChannel task (setTimeout 0
  fallback) instead of `schedule(16, true)`.
- New root states start their settle wait at the last output mutation.
- Visible priority is computed on open, after output changes and after
  resize/orientation/page-show/visibility changes.
- Each scan visits visible roots, then roots of the newest model turn, then
  continues the round-robin over the rest; a settling priority root holds the
  scan until it is ready.

## Results (same probe, same conversations)

| | 1.13.28 | 1.13.29 |
|---|---|---|
| open: defects visible, median / max | 1666 / 2440 ms | 638 / 810 ms |
| scroll: defects visible, median / max | 1032 / 3527 ms | 619 / 2160 ms |
| first repair, open / scroll (median) | 923 / 903 ms | 597 / 550 ms |
| fixture: completion → all 48 repaired | 364 ms | 28 ms |
| jank.cjs frames > 50 ms (1Q0v9E / 1ei8Na) | 6 / 26 | 6 / 25 |

Headless desktop timings; a phone is slower in absolute terms. Remaining scan
CPU after a scroll is mostly root collection (`collectRoots` with the fallback
walker) after AI Studio's re-render.

## Tests

New fixture suites `--insert-latency`, `--visible-first`; `--completion-latency`
now requires ≤ 200 ms / ≤ 450 ms. The scheduler suite checks typing/streaming
safety on content inserted during that phase (finished content present at boot
is now repaired immediately, by design). `npm test`, `node tests/run-browser.cjs`
and `--mobile` pass.
