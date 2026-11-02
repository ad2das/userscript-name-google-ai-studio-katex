# 1.13.32 audit

## Evidence from the phone (1.13.31 diagnostic badge)

The user ran one generation with `#aisfix-diag` on and sent this badge:

```
end->genFalse +0 held=- stop=1 gen=21797
scan1 +0 gates h/s/m/p/d=0/50/0/0/0 ...
wait=7 retry=0 att=7 repair1 +892 n=2 tot=35
raw 1s **14 $0 tex0 | 3s **14 $0 tex0 | 10s **0 $0 tex0
```

The end of the generation was seen at once, and the first scan ran at once.
The scroll gate then deferred the scan 50 times in the 30 s window. Fourteen raw
`**` stayed on the turn from 1 s to 3 s and were gone by 10 s. The user had
already reported that repairs come by themselves after 3-10 s while they leave
the page alone.

## Cause

`scan()` returns for 140 ms after every `scroll`, `wheel` or `touchmove` event.
The script's own repairs change the height of the response:

- above the viewport, Firefox scroll anchoring moves the scroll position (a
  fixture measured 582 px and one `scroll` event per repair batch);
- at the bottom, AI Studio's autoscroll does the same.

Every sliced repair pass therefore re-armed the gate for the next pass. A
desktop finishes in one batch, so the gate never showed in the audits so far.
A phone needs many slices, and each slice paid about 156 ms.

## Change

A `scroll` event defers scans only when a touch or pointer is held down, or when
a touch, pointer, wheel or key event happened within the last 1.5 s (fling
momentum). `wheel` and `touchmove` defer scans as before. Scroll events with no
input nearby no longer pause repairs. The diagnostic badge counts those ignored
events (`ps=`) and shows when the newest turn first had no raw bold (`clean +ms`).

## Results

| fixture `--scroll-intent` (repair of a new paragraph) | 1.13.31 | 1.13.32 |
|---|---|---|
| script-only scrolling for 2.5 s | 2,628 ms (waited for the scrolling to stop) | 327 ms |
| the same scrolling under a pressed pointer | deferred, 1,335 ms | deferred, 1,332 ms |

## Tests

New suite `--scroll-intent`. `perf-mutation`'s "fast scrolling defers scans"
case now holds a pointer during its synthetic scroll events: scroll events alone
no longer stand for a user. `npm test`, `node tests/run-browser.cjs` and
`--mobile` pass.
