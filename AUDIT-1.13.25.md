# 1.13.25 typing-latency review

This release reduces main-thread work around prompt typing. A 6x CPU-throttled
Chromium benchmark (140 model turns x 12 paragraphs, real key events) showed the
typing bursts themselves stayed clean, but the pipeline that resumes after input
settles — deferred scan work plus the live emphasis controller — burned
long tasks that the next keystrokes landed on. The profile attributed the churn
to `getBoundingClientRect` (287 ms), `closest` (254 ms) and the controller
re-running the full generation probe once per mutation batch.

## Evidence and corrections

- `findRunButton` read `getComputedStyle` + `getBoundingClientRect` for every
  button before checking its label. Label checks now run first and geometry is
  only read for label-matching candidates. `generating()` additionally
  pre-filters stop candidates with `stopLabelHint`, and the run scan with
  `runLabelHint`, before building the full joined label.
- The live emphasis controller called `synchronize` (guard chain, `generating`,
  `getRoot`) for every mutation batch while not typing. Non-typing synchronize
  passes are now coalesced into one animation frame via `scheduleSync`; the
  typing teardown path stays synchronous so prompt activity still clears the
  layer immediately.
- `collectRoots` now aborts with an empty list as soon as the prompt editor
  becomes active again — after the fallback walk, before the candidate/turn
  filter, and before the viewport geometry pass — so resumed typing stops
  collection work instead of waiting for the whole phase.
- The repair slice loop in `scanResponses` rechecks `promptEditorActive()` per
  root and reschedules instead of completing the slice once typing resumes.

## Measurements

Profile of the post-typing pause window (6x CPU throttle, 140 turns x 12
paragraphs), before -> after:

- `getBoundingClientRect` self time: 287 ms -> 73 ms
- `generating` inclusive: 170 ms -> 40 ms
- controller observer callback: left the top-30 inclusive list
- typing bursts: zero long tasks, 16.8 ms max frame gap in both runs

The remaining pause-phase long tasks are the repair pipeline itself (bounded
6 ms slices under normal CPU); resumed typing now aborts those slices at the
next check instead of finishing them.

## Tests

`tests/audit-browser.test.js` adds `typingYieldsRootCollection`: with a pending
repairable root and an active editor, `collectRoots()` must return empty.
`npm test`, `npm run test:browser`, and `npm run test:browser:mobile` were run
for this release; fixture and parser checks pass at 1280 px and 412 px.

## Limits

Measurements are fixture-level (Chromium + Playwright, CPU throttling) and the
synthetic editor mutates less than AI Studio's real prompt editor. Real-device
Violentmonkey verification on a logged-in AI Studio session remains required for
each release. The pause churn still performs the same repair work; this release
bounds and yields it, it does not remove it.
