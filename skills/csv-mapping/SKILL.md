---
name: csv-mapping
description: Map an uploaded file's columns onto a destination table. Use when a user wants to import a CSV or export into a schema they do not control, when an import screen needs its column mapping filled in, when a mapping came out wrong and needs diagnosing, or when they ask what mapping a file would cost.
---

# Mapping a file onto a table

The procedure. The reasoning is in `AGENTS.md`, the evidence and the cost model
in `README.md`.

## 1. Get the destination schema right first

This is where most mapping problems are solved, before any code runs.

```js
{ key: 'work_email', type: 'email', desc: 'Company email address, explicitly not a personal one' }
```

Every column needs a `desc` that says what it holds, and when a near miss
exists in the same table, what it does not hold. If the user's schema lives in
a database or another tool, read the column metadata and write the
descriptions; do not leave them empty and hope the names carry it.

## 2. Read the file, do not move it

```js
import { mapColumns, readCSV } from './lib/index.mjs';

const columns = readCSV(await readFile(path, 'utf8'));
const result = await mapColumns({ schema, columns, filename: basename(path) });
```

Only column names and three sample values per column are sent. Rows stay put.
If the user's data is sensitive, say that out loud before running it, because
three real values are still real values.

## 3. Show the numbers, never the mapping alone

Report, in this order:

1. what was locked deterministically (`method: 'exact'`), which cost nothing;
2. what the model decided, each with its probability;
3. what was left unmapped, with the best candidates from `suggestions`;
4. what was not imported at all (`ignored`), and among those, the ones whose
   `orphan` score is low.

That last group is the one that needs a human. A low guard means the model
believes the column does belong somewhere, so it was dropped by the threshold
rather than by belonging nowhere.

Never present a mapping as done. The user confirms it.

## 4. When a mapping is wrong

In order of how often it is the answer:

1. **The destination description is thin.** Add what the column does not hold.
   Re-run and compare.
2. **The example values are unhelpful.** The first three rows are empty, or all
   identical. Sample further into the file.
3. **The threshold is wrong for this table.** 0.75 by default. Raising it sends
   more to the human, which is the safe direction.
4. **It is a real limitation.** `Attendee` holding a full name where the table
   wants `first_name` and `last_name` is not a mapping failure. One column
   cannot map to two, and the split belongs downstream in transformation.

Do not add a special case to `lib/mapper.mjs` without a test, and never add an
alias table. `AGENTS.md` explains what that broke last time.

## 5. Cost

One or two calls per file, a fraction of a cent. Questions scale as incoming
columns times remaining destination columns, so a wide file is what costs, not
a long one. Before running something that multiplies the questions, work out
the number and say it.

## Running the demo

```bash
npm run demo     # http://localhost:5211
```

For showing a human how it behaves on nine real-shaped exports. It is a test
bench, not a thing to deploy or to extend.
