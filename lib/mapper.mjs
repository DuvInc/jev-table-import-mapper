// Two stages, and the order matters more than either one of them.
//
// 1. Determinism first, and nothing beyond determinism. A column name whose
//    typography normalises onto a destination name is locked immediately.
//    These pairs are never sent to the model: free, instant, and never wrong.
//
// 2. The model for everything else, as a matrix of independent booleans. One
//    question per pair (incoming column x destination column) rather than one
//    multiple-choice question per column. A choice has to pick an option even
//    when none of them fit; a matrix lets a column map to nothing, which is
//    exactly the "this field is missing from the file" case.
//
// Every function here is pure. Nothing reads an environment variable, nothing
// opens a socket. The transport arrives as an argument.

export const DEFAULT_THRESHOLD = 0.75;

const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// Case, accents, separators. Nothing else.
export const norm = (s) => stripAccents(String(s ?? '')).toLowerCase().replace(/[^a-z0-9]/g, '');

// ---------------------------------------------------------------------------
// Stage 1: string identity, and only string identity.
//
// An earlier version carried an alias table: `attendeecountry` -> `country`,
// `personid` -> `employee_id`, `site` -> `location`, `prenom` -> `first_name`.
// Those are judgements dressed up as normalisation, and they break twice:
//
//   1. A file holding both `Attendee Country` and `Company Country` produces
//      two "exact" matches on one destination, and the code locks whichever
//      came first in column order. Silently. That is the confidently-wrong
//      failure mode, which is the only one that really costs anything.
//   2. `team` is not `department`, `site` is not `location`, `person_id` is
//      not `employee_id`. Those are questions, not equalities.
//
// So this stage does typography and a strict equality, and everything that
// needs interpreting, including translations and abbreviations, goes to the
// model. That is more questions and slightly more money. It is the price of
// never lying.
//
// The remaining guard is for the genuine duplicate (`Country` and `country` in
// the same file): unless the equality is unique on both sides, nothing is
// locked and the pair goes down to stage 2, which tells them apart on values.
export function deterministicPass(sourceNames, schema) {
  const locked = {};      // destinationKey -> sourceName
  const ambiguous = [];   // equalities that were not unique, reported for the UI

  for (const col of schema.columns) {
    const target = norm(col.key);
    const hits = sourceNames.filter((name) => norm(name) === target);
    if (hits.length === 1) {
      const alsoMatches = schema.columns.filter((c) => norm(c.key) === norm(hits[0]));
      if (alsoMatches.length === 1) { locked[col.key] = hits[0]; continue; }
    }
    if (hits.length > 1) ambiguous.push({ destination: col.key, sources: hits });
  }
  return { locked, ambiguous };
}

// ---------------------------------------------------------------------------
// First 100 characters, ellipsis, last 100. Enough to recognise a shape (an
// email, a date, an article code), never enough to blow the context window on
// one row of pasted HTML.
export function preview(value, head = 100, tail = 100) {
  const s = String(value ?? '');
  return s.length <= head + tail ? s : `${s.slice(0, head)} … ${s.slice(-tail)}`;
}

// What the model sees. The destination column descriptions are not decoration:
// they are what tells two neighbouring fields apart, and they are the single
// highest-leverage thing you will write when adapting this to your schema.
//
// The example values are not a bonus either, they do the work. Shopify's `Name`
// column goes to `order_ref` at 93 percent and to `product_name` at 2 percent
// because its values are `#1042`, not `Marit Halvorsen`.
export function buildState({ schema, columns, filename }) {
  return {
    task: 'Map the columns of an uploaded file onto the columns of a destination table.',
    destination_table: {
      name: schema.name,
      about: schema.about || schema.blurb || '',
      columns: schema.columns.map((c) => ({
        column: c.key,
        type: c.type,
        holds: c.desc || c.description || '',
      })),
    },
    incoming_file: {
      filename: filename || 'upload.csv',
      columns: columns.map((c) => ({
        column: c.name,
        example_values: (c.samples || []).map((v) => preview(v)),
      })),
    },
  };
}

// One boolean per pair, plus one guard per incoming column.
//
// The guard asks the opposite question: "is there no home at all for this
// column?". It is the number that warns you. A column that ends up dropped
// while its guard is LOW was not dropped because it had nowhere to go, it was
// dropped because no pair cleared the threshold. That is the one to look at.
export function buildQuestions({ schema, columns }) {
  const questions = {};
  const index = [];

  for (const src of columns) {
    for (const dst of schema.columns) {
      const id = `m${index.length}`;
      index.push({ id, kind: 'pair', source: src.name, destination: dst.key });
      questions[id] = {
        type: 'noul',
        instructions: {
          incoming_column: src.name,
          destination_column: dst.key,
          question: `Does the incoming column "${src.name}" hold the data that belongs in the destination column "${dst.key}"?`,
        },
        criteria: {
          true: 'The values in this incoming column are what that destination column is meant to store: same meaning, same kind of value',
          false: 'A different field, a near miss that would put the wrong data in that column, or unrelated',
        },
      };
    }
    const id = `g${index.length}`;
    index.push({ id, kind: 'guard', source: src.name });
    questions[id] = {
      type: 'noul',
      instructions: {
        incoming_column: src.name,
        question: `Is there no column at all in the destination table for "${src.name}"?`,
      },
      criteria: {
        true: 'Nothing in the destination schema is meant to hold this, it should be dropped on import',
        false: 'One of the destination columns is a home for it',
      },
    };
  }
  return { questions, index };
}

// ---------------------------------------------------------------------------
// Batching.
//
// The model documents two budgets, and they are not the same number:
//
//   - 64k tokens per request: the state PLUS every question in it;
//   - 32k tokens: the state plus the SINGLE longest question.
//
// The 32k that a gateway displays is the second budget, not the total. Measured
// on jev 1.13: an input of 62,552 tokens goes through, and just above it the
// request is refused with `max_tokens_exceeded`, which matches the announced
// 64k. There is no limit on the NUMBER of questions: 4,000 short ones fit in
// one call. Each question here weighs about 115 tokens, so a 23 column file
// against a 10 column table (253 questions, 29,313 tokens) is a single call.
//
// The second budget cannot be split. If the state alone approaches 32k, no
// batch will ever pass, so `planLots` says so instead of letting an opaque 400
// come back from the wire.
export const REQUEST_TOKEN_BUDGET = 58_000;   // headroom under the 64k total
export const STATE_TOKEN_CEILING = 30_000;    // headroom under the 32k state budget
export const TOKENS_PER_QUESTION = 120;       // measured at ~115, rounded up

// Characters per token, measured on this payload shape. A rough estimate is
// the right tool here: the cost of being wrong is one extra batch.
export const estimateTokens = (value) => Math.ceil(JSON.stringify(value).length / 3.6);

export function planLots({ state, ids, budget = REQUEST_TOKEN_BUDGET }) {
  const stateTokens = estimateTokens(state);
  if (stateTokens > STATE_TOKEN_CEILING) {
    throw Object.assign(
      new Error(
        `The state is about ${stateTokens} tokens. The limit is 32k for the state plus the longest single question, `
        + 'and that budget cannot be split across calls. Send fewer columns, or shorter example values.',
      ),
      { status: 413 },
    );
  }
  const perLot = Math.max(1, Math.floor((budget - stateTokens) / TOKENS_PER_QUESTION));
  const lots = [];
  for (let i = 0; i < ids.length; i += perLot) lots.push(ids.slice(i, i + perLot));
  return lots;
}

// ---------------------------------------------------------------------------
// Greedy one to one: the best free pair first.
//
// One to one is a real constraint, not an implementation detail. Two incoming
// columns writing into the same destination is a silent data loss, and it is
// better to leave the second one out and show it as "not imported".
export function resolve({ schema, columns, locked, matrix, threshold = DEFAULT_THRESHOLD }) {
  const sourceTaken = new Set(Object.values(locked));
  const destTaken = new Set(Object.keys(locked));

  const pairs = [];
  for (const src of columns) {
    for (const dst of schema.columns) {
      if (sourceTaken.has(src.name) || destTaken.has(dst.key)) continue;
      pairs.push({ source: src.name, destination: dst.key, p: matrix[src.name]?.[dst.key] ?? 0 });
    }
  }
  pairs.sort((a, b) => b.p - a.p);

  const mapping = {};
  for (const [destination, source] of Object.entries(locked)) {
    mapping[destination] = { source, p: 1, method: 'exact' };
  }
  for (const pair of pairs) {
    if (sourceTaken.has(pair.source) || destTaken.has(pair.destination)) continue;
    if (pair.p < threshold) continue;
    mapping[pair.destination] = { source: pair.source, p: pair.p, method: 'jev' };
    sourceTaken.add(pair.source);
    destTaken.add(pair.destination);
  }

  // The best remaining candidates, so the UI can offer a ranked dropdown
  // rather than an alphabetical list of every column in the file.
  const suggestions = {};
  for (const dst of schema.columns) {
    if (mapping[dst.key]) continue;
    suggestions[dst.key] = columns
      .filter((c) => !sourceTaken.has(c.name))
      .map((c) => ({ source: c.name, p: matrix[c.name]?.[dst.key] ?? 0 }))
      .sort((a, b) => b.p - a.p)
      .slice(0, 3);
  }

  const ignored = columns.filter((c) => !sourceTaken.has(c.name)).map((c) => c.name);
  return { mapping, suggestions, ignored };
}
