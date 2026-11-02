# 1.13.31 audit

## Remaining glitch on 1.13.30

A read-only live survey of the six most recent conversations, scrolled from the
bottom with the same Playwright Firefox probe as earlier audits (412×915), found
one defect still on screen after 5 s. It sat in a blockquote:

```
> *"20×2년도에 인식할 **손상차손(당기비용)**은 얼마인가?"*
```

cmark cannot close `)**은` (punctuation before, a letter after), so the final
`*` closed one star of that run. The page showed the literal
`*"20×2년도에 인식할 **손상차손(당기비용)*` and a native italic `은 얼마인가?"`.
`repairMisparsedItalicNotes` already rebuilt the same misparse for `*(※ … )`
notes. It now also accepts:

- quoted notes `*"…"*` and `*“…”*` (the pair must match);
- a note followed by a line break, not only at the end of the paragraph;
- several notes in one paragraph.

All existing star rules are unchanged: one bold run, exactly four stars, no star
in the tail, no interactive nodes. Trailing text after the tail on the same line
is still rejected. A stale note wrapper keeps its host eligible until it is
cleaned up.

## Results

| | 1.13.30 | 1.13.31 |
|---|---|---|
| live replay of that conversation (31 positions): persistent defects | 1 | 0 |
| fixture `--italic-quote-note` (17 checks) | 11 fail | all pass |
| repair through the scheduler (fixture, block appended) | never | 333 ms |

## Diagnostic badge (opt-in)

The delay between the end of a generation and the first repair on a phone could
not be measured headlessly. `GenerateContent` returned 403 for the automated
session. Opening AI Studio once with `#aisfix-diag` stores a flag in
localStorage. A badge (shadow DOM on `<html>`, so the script's observers do not
see it) then shows per generation:

- what kept the page "generating";
- which gates delayed the first scan;
- the stability waits and retry skips of the newest turn;
- when the first repair landed;
- when the live layer ended;
- the raw markers left 1, 3 and 10 s later.

`#aisfix-diag-off` removes the flag. With the flag absent every hook is a single
boolean check. The fixture shows identical repairs with and without the badge,
and no extra scans.

## Tests

New suites:

- `--italic-quote-note`: the live block, curly quotes, two notes in one paragraph, a paren note before a break, 11 rejected shapes, the user turn, stale cleanup, and the end-to-end scheduler path;
- `--diag`: off by default, the hash on/off switch, badge content, and idle scans.

`npm test`, `node tests/run-browser.cjs` and `--mobile` pass.
