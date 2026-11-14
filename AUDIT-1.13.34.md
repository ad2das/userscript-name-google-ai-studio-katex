# 1.13.34 audit

Validated on fixture pages and on a saved copy of a long conversation's DOM. The live
AI Studio session used for measurement was signed out, so this release has no live
scroll measurement.

## 1. Tables glued to a paragraph

A markdown table written right after a line of prose reached the page as one
paragraph: `… 다음과 같습니다. | 날짜 | 항목 | 금액 | | :--- | :--- | ---: | | 1월 | 재료 | 100 | …`.

- AI Studio drops the line breaks of such a paragraph, so no line starts with `|`.
- The raw-table repair only looked for line-based tables, and its gate also required
  a `<br>`.
- 1.13.32 and 1.13.33 both showed these tables raw.

Change:
- The gate accepts any text with a delimiter row.
- A new reader splits the run on `|` (a pipe inside inline code is text), takes the
  column count from the delimiter row, and reads the header before it and the rows
  after it.
- Prose before the table stays as prose above the grid. Text after the last row stays
  below it.
- Empty cells stay empty cells. A row of only empty cells ends the table.

Saved conversation with 2,255 leaves:
- all 8 glued tables render (2-5 rows each);
- every other leaf is byte-identical to 1.13.33;
- a second saved conversation (974 leaves, no glued table) is unchanged.

## 2. Quoted notes that open with the quote mark

`*"**갑(구매자)**은 … 없다."*` and `*"기말에 **예상 금액은 ₩1,000**이고, … **보증**한다."*` kept raw
stars.

The note repair from 1.13.33 required a letter between the opening `*` and the bold
run. It also required the native italic tail to contain no bold.

Change:
- One or two opening quote marks (`"`, `“`, `‘`) may be the whole lead. The ASCII `'`
  still never counts.
- A native `<strong>` inside the italic tail is allowed. The tail is never moved.

A note with two complete bold runs before the stolen star stays raw. No rule tells it
apart from text that must stay literal.

## 3. Shorter mutation callbacks on large re-renders

When AI Studio re-creates turns, one mutation callback can carry 40,000-90,000
records.

- The mirror driver walked every record inside that task.
- The live-emphasis preview's observer also walked every record. It did so even when
  it had nothing to show: idle, or the newest turn already covered by the mirror.

Change:
- **Mirror driver.** A batch of 2,000 records or more resolves its work from the
  leaves of the subtrees it added. In-view leaves are built before the paint and
  off-screen leaves are queued.
- **The other records** are checked after the paint, in 6 ms slices, with the same
  per-record test as before. That catches a mirrored leaf edited in another turn in the
  same batch.
- **Batches without added elements** still use the exact per-record walk.
- **Preview observer.** It returns at once when it has no current root and no
  generation is running.

Fixture with one 40,962-record re-create task (median of 5):

| callback inside the task | 1.13.33 | 1.13.34 |
|---|---|---|
| mirror driver | 82 ms | 13 ms |
| preview observer | 65 ms | 10 ms |

The deferred check runs after the paint: 69-76 ms in total, in 6 ms slices.

On the live conversation where 1.13.33's longest scroll frame was about 80 ms longer
than 1.13.32's, these two callbacks were measured at about 120 ms and 150 ms inside
that frame. The live effect of this change is not measured.

## Tests

- `raw-table`: glued tables (single and two tables, alignment, bold cells, empty body
  and header cells, an all-empty row, prose before and after) plus checks that must
  stay unchanged:
  - a `|` in prose without a delimiter row;
  - a `|` in inline code;
  - a real `<table>`.
- `italic-quote-note`: both note shapes, plus guards:
  - an apostrophe lead and a three-mark lead;
  - a non-italic tail;
  - a tail with a link or a control.
- `r4-flash`:
  - `bulkMixedEdit`: a re-create plus text edits in another turn's mirrored leaves, in
    one callback, with and without added elements;
  - each fixture now runs in a fresh page.
- `live-preview`: `livePreviewIdleBulk` (idle bulk batch leaves the layer empty; a
  bulk batch during generation keeps the painted ranges).
- `npm test`, `node tests/run-browser.cjs` and `--mobile` pass.
