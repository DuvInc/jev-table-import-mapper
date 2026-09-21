# Contributing

Thanks for looking. This is a one-person project maintained on a best-effort
basis, so the most useful thing you can do before writing code is open an issue.
A small fix is always welcome; a large one is worth agreeing on first.

## Getting set up

Node 22.18 or newer. There are no npm dependencies.

```bash
npm install     # installs nothing, and that is the point
npm test        # 27 assertions, no network, no API key
```

`npm test` passes on a fresh clone with no keys. If it does not, that is a bug
worth reporting on its own.

To exercise the part that costs money you need an OpenRouter key in `.env` and
`npm run demo`. A full run over all nine sample files costs well under a cent.

## Sign your commits off

Every commit needs a `Signed-off-by` line, which certifies that you wrote the
patch or otherwise have the right to submit it under the MIT licence. This is
the [Developer Certificate of Origin](https://developercertificate.org): one
line, no paperwork, no copyright assignment.

```bash
git commit -s -m "Your message"
```

## What makes a change likely to be merged

**A mapping change comes with a test.** `lib/mapper.mjs` is the only file with
judgement in it, and several rules in it exist because of a file that was
mapped confidently and wrongly. If you change what stage 1 locks, or how
resolution picks, add the case to `test/mapper.test.mjs` that shows what it now
does.

**The purity boundary holds.** `lib/jev.mjs` is the only file that reads a key
or opens a socket. Everything else takes its transport and its threshold as
arguments. A change that reads `process.env` in `lib/mapper.mjs` makes the
library harder to embed and the tests harder to trust.

**No new dependency.** There are none. A dependency needs an argument in an
issue first.

**Report what you measured.** For a model or prompt change, name the model and
give the numbers per sample file: mapped, questions, calls, cost. A worse model
on this problem does not fail loudly, it returns plausible probabilities that
are wrong, so "works for me" is not a result.

**Comments explain why, not what.** The existing ones are long on purpose: they
record the reasoning, and where it matters, what went wrong before.

**A UI change regenerates the screenshots.** `docs/` holds real runs, and
`AGENTS.md` has the four commands that reproduce them. A README showing an
interface that no longer exists is a bug report waiting to happen.

**No em dashes**, anywhere.

## Reporting a bug

Include the commit, the destination schema, and the header row of the file. A
mapping bug is almost always reproducible from the column names plus three
sample values, and that is all this tool ever sees anyway.

Please do not paste a real customer export into an issue. Rename the columns to
whatever they really were and invent the values.

For anything with security implications, read [SECURITY.md](./SECURITY.md)
instead of opening a public issue.
