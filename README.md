[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/airdropjepe45-svg/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/airdropjepe45-svg/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

# csv-reader-speed

A fast, dependency-free CSV reader for the make.fun bounty
`csv-reader-speed-01-run-20261121`. `solve.js` exports `run({ text, header })`
and returns `{ columns, rows, errors }`, matching the reference semantics
exactly — in a single left-to-right pass over the input text.

## What it handles

- A leading BOM (only the very first character), blank lines, and LF / CRLF
  line endings.
- Quoted fields: doubled quotes (`""` → `"`), embedded line breaks (LF, CRLF
  and lone CR inside quotes all become `\n`), quote junk after the closing
  quote, and unterminated quotes (re-read as unquoted text with the opening
  quote kept literally, line counter reset to the opening quote's line).
- Stray CRs outside quotes: dropped, one `stray_cr` error each.
- Short and long rows: padded with `""` / cut, with `short_row` /
  `long_row` errors carrying the pre-padding field count / the cut fields.
  The header is never normalised, and the first kept record defines the
  width. Every error carries the line and row its record starts on.
- No trimming, no type conversion, no Unicode normalisation: every field
  stays a string exactly as read.

## Why it is fast

The reference reads one character at a time and concatenates per character.
This implementation takes the fast path wherever the data allows it:

- Unquoted fields — about 87% of fields in the practice set — are taken as
  **one slice per field** instead of a per-character loop with concatenation.
  Stray CRs are the only thing that forces a segment-building read, and
  they are rare.
- Quoted fields take a fast slice path too, unless they contain a doubled
  quote or an embedded line break, in which case a segment-building scan
  handles exactly those cases.
- No regex anywhere in the hot loop, no per-field allocations beyond the
  field string and the row array, and errors are only built when one
  actually occurs.

On the practice set (6 cases, ~10.2M characters, 63,692 rows) the entry
driver runs the whole set in ~0.88 s median on this machine versus ~1.59 s
for the baseline driver — about **1.8× faster** end to end, including the
JSON parse/stringify both drivers share. The parser itself (`run()` only,
warmed up) is roughly 5–7× faster than the reference parser.

## Files

| File | What it is |
| --- | --- |
| `solve.js` | The reader: dependency-free ES module exporting `run(input)`. |
| `main.ts` | Driver (Node 22, stdlib only): reads `cases.json`, answers each case, writes `answers.json`. |
| `README.md` | This file. |
| `LICENSE` | MIT. |

## Run it

```sh
MAKEFUN_INPUT_DIR=/path/to/input MAKEFUN_OUTPUT_DIR=/path/to/output node main.ts
```

`main.ts` reads `cases.json` from the input directory (or `/input` by
default), answers each case with `run`, and writes `answers.json` to the
output directory (or `/output` by default). It turns V8 incremental
marking off first, the same way the baseline driver does.

---

Made for [make.fun](https://make.fun/bounty/csv-reader-speed-01-run-20261121?ref=89fdt4kt) — earn money making things with AI.
