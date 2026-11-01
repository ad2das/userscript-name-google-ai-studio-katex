# 1.13.30 scroll-time work audit

Follow-up to `AUDIT-1.13.29.md`: after a scroll most scan CPU went into root
collection, not repairs. Measured with the same live Playwright Firefox probe
(copied cookie session, 412×915 viewport, the four reference conversations,
five scroll positions each) plus a fallback-walker counter mode (`--fbstats`)
in the gitignored `output/survey/latency.cjs`.

## Findings on 1.13.29

- After a scroll AI Studio re-renders the visible turns top-down: an element
  is attached first and filled afterwards, so one mutation batch reports
  nested scopes.
- Each of those scopes was queued for the fallback TreeWalker. 99.3 % of the
  12,597 queued scopes already had a queued ancestor, so 7,126 walks covered
  332,140 nodes and found the same roots again and again (722 root hits).
- Every found root also forced a full root-list recompute.

## Change

- A mutation scope is not queued while one of its ancestors is queued, and a
  queued scope is skipped when an ancestor was queued after it. The ancestor
  walk visits the same nodes; scopes inside subtrees the walker rejects were
  never queued (`fallbackBlocked`), so coverage is unchanged. Per-scope
  invalidation and the settle timestamp still run for a skipped scope.

## Results (same probe; sums over 20 scroll windows)

| | 1.13.29 | 1.13.30 |
|---|---|---|
| fallback walks / nodes visited | 7,126 / 163,261 | 77 / 17,222 |
| fallback walker time | 4,371 ms | 544 ms |
| `collectRoots` (incl. walker) | 8,462 ms | 1,673 ms |
| total scan time (`scanResponses`) | 16,215 ms | 8,619 ms |
| `repairRoot` (actual repairs) | 4,954 ms | 4,699 ms |
| defects left at window end | 1 | 0 |
| scroll: defects visible, median / max (A/B run) | 628 / 2,129 ms | 657 / 1,941 ms |
| open: defects visible, median / max (A/B run) | 754 / 1,012 ms | 734 / 1,104 ms |
| jank.cjs frames > 50 ms (1Q0v9E / 1ei8Na) | 7 / 27 | 7 / 26 |

Latency medians are within the probe's ±50 ms sampling and run-to-run noise on
desktop; the saving is CPU per scroll, which matters more on a phone.

## Tests

New fixture suite `--rerender-walker`: six model turns re-rendered top-down
(paragraph > span > span > text plus a raw `aligned` environment in a generic
host). It requires one walk per re-rendered node (1.13.29: 382 walks / 1,290
visits for 744 nodes; 1.13.30: 12 / 732), all bold and raw-math repairs, no
literal `**` and an idle page afterwards. `npm test`,
`node tests/run-browser.cjs` and `--mobile` pass.
