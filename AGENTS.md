# AGENTS.md

Instructions for any AI agent working in this repository. One file, no
per-vendor copy: Claude Code, Cursor, Codex and the rest all read `AGENTS.md`.

Read this before changing the mapping. Most of the rules below exist because
the failure they prevent is invisible: an import that looks complete, that
nobody re-reads, and that put a personal email address in the company email
column of nine thousand rows.

## What this repository is

A small library that maps the columns of an uploaded file onto a destination
table you define, and reports how sure it is about each one.

```text
uploaded columns ──▶ strict name equality ──▶ typed yes/no per remaining pair ──▶ greedy one-to-one ──▶ mapping + probabilities
```

The library is the product. `demo/` is a test bench that exists so a human can
watch it work before wiring it in; it is not a thing anybody deploys. A change
that improves the demo at the cost of the library has the priority backwards.

There are no dependencies. Node 22.18 or newer.

## Layout

| Path | What it is |
| :--- | :--- |
| `lib/index.mjs` | `mapColumns`, the one entry point. Orchestration only |
| `lib/mapper.mjs` | the two stages, the question shape, the budget, the resolution. **Pure** |
| `lib/jev.mjs` | **the only file that talks to a service**. Reads the key at call time |
| `lib/csv.mjs` | a CSV reader that runs in Node and in a browser. Convenience, not the point |
| `demo/server.mjs` | eighty lines of `node:http`. Holds the key, serves the page |
| `demo/schemas.mjs` | three destination tables, for the demo only |
| `demo/samples/` | nine real-shaped exports, each one breaking something specific |
| `test/` | 27 assertions, no network, no key |
| `docs/` | the README screenshots. Regenerated, never edited by hand |
| `skills/csv-mapping/SKILL.md` | the procedure, as a skill |

## Commands

```bash
npm test          # no network, no key, no cost
npm run demo      # http://localhost:5211
```

## Regenerating the screenshots

The four images in `docs/` are real runs of the demo, captured headlessly. They
go stale when the UI or the sample files change, and a stale screenshot is
worse than none.

Check what is actually answering before capturing. A server left running on
that port from an earlier session will answer instead, and if its directory has
moved it answers 404, which Chrome photographs happily. Two screenshots of a
404 page have already been committed that way.

```bash
lsof -ti :5311 | xargs kill -9 2>/dev/null
PORT=5311 npm run demo &
sleep 2
curl -s --fail http://localhost:5311/ | grep -q 'jev-table-import-mapper' || echo "WRONG SERVER"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
shot () { "$CHROME" --headless=new --hide-scrollbars --force-device-scale-factor=2 \
  --window-size=$2 --virtual-time-budget=25000 --screenshot="docs/$1.png" "$3"; }

shot demo    1100,600  "http://localhost:5311/"
shot mapping 1100,1245 "http://localhost:5311/?table=ecom_orders&file=orders-warehouse-export.csv"
shot partial 1100,1245 "http://localhost:5311/?table=crm_contacts&file=crm-eventbrite.csv"
shot matrix  1400,1000 "http://localhost:5311/?table=ecom_orders&file=orders-warehouse-export.csv&view=matrix"
```

Check the file sizes afterwards. A real capture is 100 to 300 KB; 20 KB means
Chrome photographed an error page.

This costs three mapping runs, so under half a cent. The numbers in the README
table come from the same runs: if you regenerate the images, check that the
table still matches what they show.

## The rules

1. **Stage 1 does typography and nothing else.** Case, accents, separators,
   then a strict equality. Do not add an alias table. It has been tried, and it
   failed twice: `Attendee Country` and `Company Country` both matched
   `country` and the first one in column order won silently, and `team` is not
   `department` anyway. Anything that needs interpreting, including
   translations and abbreviations, goes to stage 2. That is more questions and
   slightly more money, and it is the price of never lying.
2. **An equality that is not unique on both sides locks nothing.** Two incoming
   columns normalising onto one destination is a question, not a match.
3. **One question per pair, never one choice per column.** A multiple choice
   has to name an option even when none fits, and answers a tie with a
   confident number. The matrix lets a column map to nothing, which is the
   "this field is missing from the file" case, and it is most of the value here.
4. **Keep the guard question.** One per incoming column, asking whether the
   column has no home at all. It is the only number that distinguishes "not
   imported because it does not belong" from "not imported because the best
   pair fell under the threshold".
5. **Resolution stays one to one.** Two sources writing into one destination is
   silent data loss. Leaving the second one in `ignored` is the correct outcome.
6. **A missing answer is an error, never a zero.** A question that comes back
   unanswered and is read as 0 turns a service problem into a mapping problem,
   and the user sees an empty field instead of an error.
7. **`lib/` stays pure apart from `lib/jev.mjs`.** No environment variable, no
   socket, no `console.log` anywhere else. Thresholds and transports arrive as
   arguments. This is what makes the library embeddable and the tests free.
8. **Never lower the default threshold to make a demo look better.** A wrong
   column is worse than an empty one: an empty field is visibly missing, a
   wrong one looks done.

## Changing the transport

`lib/jev.mjs` posts one `state` plus a bag of questions and returns:

```js
{ answers: { [id]: { noul: 0..1 } }, model, usage: { in, out, cost }, ms }
```

Everything downstream depends on that shape and on nothing else. To use another
provider, write a function with that signature and pass it as `decide`. Do not
edit `lib/mapper.mjs` to accommodate a provider.

Say in the pull request which model and which sample files you tested, with the
numbers. "It works" is not a result: on this problem, a worse model does not
fail, it returns plausible probabilities that are wrong.

## Cost, and how to talk about it

A run is one or two calls and costs a fraction of a cent: the nine sample files
range from $0.000077 to $0.0013. Questions scale as incoming columns times
remaining destination columns, so the cost is quadratic in the width of the
file, not in the number of rows. Rows are free; only three values per column
are ever sent.

Before proposing something that multiplies the questions (asking per row, or
re-asking after every manual correction), work out the new number and say it.

## Rules for agents

- **Do not import anything.** `mapColumns` proposes a mapping. Writing rows is
  the host product's job, and a mapping applied without a human seeing the
  probabilities defeats the purpose of producing them.
- **Do not hand-fix a bad mapping in the demo.** The fix is almost always a
  better `desc` on the destination column, and sometimes a rule in
  `lib/mapper.mjs` with a test. A special case in the UI is neither.
- **Do not add a dependency.** There are none. One needs an issue first.
- **Do not print or log an API key**, do not copy `.env` anywhere, and do not
  send the key to the browser. The demo's architecture is the example: the page
  posts column names and three values per column, the server holds the key.
- **Do not commit a real export.** `.gitignore` excludes `*.csv` outside
  `demo/samples/`. Somebody's customer list in the history is permanent.
- **No em dashes** in code, comments, documentation or output.

## Things that bite

- **The displayed 32k context is not the request budget.** There are two: 64k
  for the state plus all questions, and 32k for the state plus the single
  longest question. Reading the 32k as the total splits the batches twice as
  early as needed and doubles the price.
- **The state is resent with every batch.** Splitting is not free, which is why
  `planLots` fits as much as it can into one call rather than using a round
  number of questions per lot.
- **Time does not follow question count.** 12 questions take 640 ms, 253 take
  750 ms. Do not optimise for fewer questions on latency grounds; optimise for
  fewer because the state is resent and each question is paid for.
- **Locked pairs must be removed from both sides before stage 2.** Leaving a
  locked destination in the question set lets the greedy pass hand it to a
  second source.
- **Example values are what disambiguate, not column names.** A change that
  drops them to save tokens will look fine on clean exports and quietly break
  on Shopify, where `Name` holds `#1042`.
- **`preview()` trims at both ends for a reason.** A head-only truncation hides
  the end of a value, and the end is where a date's timezone, a currency
  suffix, or an email domain lives.
