# 1.12.0 rendering review

This release fixes reproduced defects; it does not guarantee that every future AI
Studio page or every malformed Markdown input can be rendered correctly.

## Evidence and corrections

- **Idle focus:** focusing the composer permanently stopped earlier versions.
  Passive focus/input/composition observation now pauses real typing and resumes
  after 1.6 seconds of inactivity. No prompt value is read, no event canceled, and
  no keyboard/submission/authentication/network interception is added.
- **Nested formatting:** nested bold/quoted emphasis is planned as a bounded tree;
  inner repairs no longer strand the outer markers. Native underline and hard line
  breaks compose with emphasis. Unmatched inner delimiters remain literal by default.
- **Lexical context:** code spans/fences and escaping share a lexical projection.
  Underline/table-break/raw-math paths no longer discard that protection. The final
  context-free text-node fallback was removed from the repair pipeline.
- **Native boundaries:** partial native ancestors are not extracted/cloned. Text
  pieces are styled in place, preserving IDs, original hosts and listeners.
  Semantic sections are barriers; user/editor/media/control descendants are guarded.
  Empty controls interrupt table-break grouping. Existing native math is not
  flattened into a larger raw-math replacement.
- **Lifecycle:** observer cleanup is queued behind generation/typing checks.
  Reinserted nodes and missing owned table wrappers are revalidated. Reused emphasis
  hosts can be repaired again. Disabled Run controls do not prove completion.
- **Math:** comments and verbatim regions survive normalization. Only narrowly
  recognized numeric percentages are recovered. Shared resize observation catches
  container-only changes; HTML fallbacks have horizontal overflow containment.
- **Styles:** scopes within or containing protected editor/user islands are excluded
  from inherited typography overrides. This uses modern CSS `:has()` support.
- **Bounded work:** inline passes yield between containers using a cursor, with
  32-container/100-emphasis-group limits. Existing text/node/TeX limits remain.
  No new runtime library is loaded. This is not a hard 6 ms rendering guarantee.

## Tests and review

Run `npm test`, `npm run test:browser`, and `npm run test:browser:mobile`.
The existing feature suite explicitly enables the two legacy recovery options;
the audit, photo, and rendering-contract suites test the default safe settings.
Baseline assertion suppression is rejected unless `--baseline` is explicitly set.

The contract suite includes text, separate text nodes, span partitions and native
bold partitions; nested/literal formatting; the two long quoted sentences from the
user's photo; hard line breaks; partial-host identity/listeners; empty controls;
unfocused editors; protected CSS; native math; page-range heuristics; DOM reinsertion;
table rewrapping; cleanup during Stop; idle composer focus; IME; and cold marked work.
The body-walker counter now counts walkers using combined element/text masks.
Reports and screenshots are generated under `output/playwright/`.

Release verification: syntax/unit tests and all four browser suites passed at
1280 px and 412 px. All 82 contract checks passed in each width. The existing
37-check audit and 13-layout photo suite also passed. Native Run count was one;
fixture auth-refresh/fetch counts were zero. On this machine, warm 180-turn scans
were `[1, 0, 1, 1, 1, 1]` ms desktop and `[1, 1, 1, 1, 1, 1]` ms mobile-width.
The first bounded pass over 600 marked paragraphs took 1 ms and 3 ms respectively;
the remainder completed through subsequent passes. These are fixture measurements,
not an Android power/memory benchmark or timing guarantee.

An independent Oracle review of 1.11.1 completed in a separate model session.
Its synthetic Chromium findings were checked against the code and new Firefox
reproductions. It did not test actual Violentmonkey injection. Review feedback is
advisory, not certification.

## Remaining evidence gaps and tradeoffs

The user's pictured conversation was not found in the connected AI Studio account.
Its exact DOM and installed Android userscript version remain unknown. The copied
response text or an accessible conversation link is needed to establish the cause
of the photographed list typography/line-wrapping, rather than infer it from pixels.

Paired page-range restoration is deliberately narrow: `p.381<s>385 / PDF 45</s>49`
can become `p.381~385 / PDF 45~49` only when both numerical spans agree. It cannot
prove the original author intended ranges. Other strikethrough remains unchanged.

Prose-code conversion and malformed mixed-marker cleanup are off by default.
Native math mixed with incomplete raw TeX may remain unmodified to avoid deleting
native content. Full CommonMark parsing, arbitrary unsupported TeX, original
Markdown recovery, and all possible native DOM layouts are not guaranteed.
The global pinned KaTeX stylesheet and the actual isolated `@require` context still
need real Violentmonkey/device testing. Partial selection of generated ASCII grids
also remains subject to browser generated-content/clipboard behavior.
