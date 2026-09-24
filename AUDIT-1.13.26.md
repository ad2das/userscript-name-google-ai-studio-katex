# 1.13.26 live-site typing-latency and composer review

This release removes the remaining typing lag on long AI Studio conversations
and hardens the composer against interference. The findings come from
measurements on the live site: a plaintext Firefox cookie session was injected
into Playwright Firefox (Chrome's app-bound encryption refuses copied profiles),
then typing was measured with requestAnimationFrame frame-gap probes on a real
42-turn conversation (4,906 elements, 370 cmark nodes, 46 KaTeX atoms).

## Evidence and corrections

- With the script installed, typing bursts produced 14-31 frames over 50 ms per
  burst (max 93-133 ms). Without the script the same bursts were clean (zero
  frames over 50 ms, max 20-22 ms).
- Bisect on the live page: disabling live emphasis, the repair pipeline, or the
  main mutation observer did not remove the jank; disabling the injected
  stylesheet did. Isolation: dropping the pinned KaTeX stylesheet link did not
  help; dropping `CSS_TEXT` did.
- Scope bisect: replacing `${SCOPE}` with a marker attribute, simplifying it to
  `:where(STYLE_ROOT_SELECTOR)`, or keeping the self + `:has()` exclusions while
  dropping `:not(:where(PROTECTED_CSS_SELECTOR) *)` all removed the jank. The
  descendant exclusion forced an ancestor walk against the long protected list
  for every element on every style recalc, for each of the ~150 scoped rules.
- `SCOPE` now keeps the self exclusion and the `:has()` container exclusion and
  drops the descendant clause. The container exclusion still prevents styling
  model scopes that hold editor/user islands, at a fraction of the cost.
- The live composer host is now `ms-prompt-box` (the old `ms-prompt-input` /
  `ms-autosize-textarea` hosts are gone; the textarea still matched the typing
  guard). `ms-prompt-box` is added to the prompt-editor selector so the whole
  composer - attachment chips, upload progress, run controls - stays opaque to
  mutation handling and cleanup. Run/Stop detection inside the composer is
  preserved by the existing button branch.
- Image-submit no-response was reproduced on the live site as a
  `GenerateContent` 403 with body `"The caller does not have permission"`,
  rendering "internal error has occurred" in the UI. The identical failure
  occurs with the script disabled, so it is an account/session-side condition
  in the injected-cookie environment, not script interference. The script-side
  attachment flow was verified intact (chip and image preserved, zero repairs
  during the request). The submit-window frame spike (123-147 ms) also occurs
  without the script.

## Tests

`tests/userscript.test.cjs` asserts the expensive descendant exclusion is gone,
the `:has()` exclusion stays, and `ms-prompt-box` is in the prompt-editor
selector. `tests/live-typing-browser.test.js` adds a composer-opacity scenario:
an `ms-prompt-box` with a textarea, an attachment chip and an image receives
upload churn and a scan; the composer must stay byte-identical, the image node
identity must hold, and no repair artifacts may appear inside the composer,
while a model paragraph in the same page is repaired.

## Verification

- Live site, fixed script, same conversation: typing bursts max 37 ms with zero
  frames over 50 ms (was 124-126 ms / 14-31 long frames); pause 23 ms.
- `npm test`, `npm run test:browser`, `npm run test:browser:mobile` were run for
  this release; fixture and parser checks pass at 1280 px and 412 px.

## Limits

The injected-cookie session cannot satisfy the backend attestation required for
`GenerateContent` (403 "caller does not have permission"), so generation could
not be streamed on the live site; typing and composer measurements do not depend
on generation. Phone-specific lag (Firefox Android + Violentmonkey) remains
user-side verification. The pause-phase repair pipeline still performs bounded
slices; this release removes the per-keystroke style-recalc cost, which was the
dominant live-site term.
