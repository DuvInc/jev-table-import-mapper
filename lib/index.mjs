// The entry point. One call, one object back.
//
//   import { mapColumns } from './lib/index.mjs';
//   import { readCSV } from './lib/csv.mjs';
//
//   const result = await mapColumns({
//     schema,                          // your destination table
//     columns: readCSV(csvText),       // or your own [{ name, samples }]
//     filename: 'export.csv',
//   });
//
// Nothing here writes anywhere, prompts anyone, or imports a row. It returns a
// proposed mapping and the evidence behind it. Presenting that to a human and
// performing the import is your product's job, and deliberately not this
// module's.

import { decide as defaultDecide, JEV_MODEL } from './jev.mjs';
import {
  DEFAULT_THRESHOLD,
  buildQuestions,
  buildState,
  deterministicPass,
  planLots,
  resolve,
} from './mapper.mjs';

export async function mapColumns({
  schema,
  columns,
  filename = 'upload.csv',
  threshold = DEFAULT_THRESHOLD,
  decide = defaultDecide,
  model = JEV_MODEL,
  signal,
}) {
  if (!schema?.columns?.length) throw Object.assign(new Error('schema.columns is empty'), { status: 400 });
  const incoming = (columns || []).filter((c) => c && c.name);
  if (!incoming.length) throw Object.assign(new Error('no incoming columns'), { status: 400 });

  const startedAt = performance.now();

  // Stage 1. On a clean HubSpot export this settles 7 of 10 columns before any
  // network call happens at all.
  const { locked, ambiguous } = deterministicPass(incoming.map((c) => c.name), schema);

  // Stage 2 only ever sees what stage 1 could not settle. Fewer questions is
  // less money, and a destination that is already locked must not be offered
  // again or the greedy resolution could hand it to a second source.
  const lockedSources = new Set(Object.values(locked));
  const remainingSource = incoming.filter((c) => !lockedSources.has(c.name));
  const remainingDest = schema.columns.filter((c) => !locked[c.key]);

  let matrix = {};
  let orphan = {};
  let usage = { in: 0, out: 0, cost: 0 };
  let modelUsed = null;
  let jevMs = 0;
  let questionCount = 0;
  let calls = 0;

  if (remainingSource.length && remainingDest.length) {
    const subSchema = { ...schema, columns: remainingDest };
    const state = buildState({ schema: subSchema, columns: remainingSource, filename });
    const { questions, index } = buildQuestions({ schema: subSchema, columns: remainingSource });
    const byId = new Map(index.map((entry) => [entry.id, entry]));
    const ids = Object.keys(questions);
    questionCount = ids.length;

    const lots = planLots({ state, ids });
    calls = lots.length;

    // The lots are independent, so they go out together. The model groups
    // questions internally, which is why 253 questions cost about as much wall
    // clock as 12: 750 ms against 640 ms, measured.
    const results = await Promise.all(lots.map((lot) => decide({
      state,
      questions: Object.fromEntries(lot.map((id) => [id, questions[id]])),
      model,
      signal,
    }).then((r) => ({ lot, r }))));

    for (const { lot, r } of results) {
      for (const id of lot) {
        const entry = byId.get(id);
        const p = r.answers?.[id]?.noul;
        if (typeof p !== 'number') {
          throw Object.assign(new Error(`No answer came back for question ${id}`), { status: 502 });
        }
        if (entry.kind === 'pair') (matrix[entry.source] ||= {})[entry.destination] = p;
        else orphan[entry.source] = p;
      }
      usage = {
        in: usage.in + r.usage.in,
        out: usage.out + r.usage.out,
        cost: usage.cost + r.usage.cost,
      };
      // Wall clock, not the sum: the calls ran in parallel.
      jevMs = Math.max(jevMs, r.ms);
      modelUsed = r.model || modelUsed;
    }
  }

  const { mapping, suggestions, ignored } = resolve({ schema, columns: incoming, locked, matrix, threshold });

  return {
    mapping,        // destinationKey -> { source, p, method: 'exact' | 'jev' }
    suggestions,    // destinationKey -> [{ source, p }], best three, for manual mapping
    ignored,        // incoming column names that were not used
    matrix,         // source -> { destinationKey: p }, every probability asked for
    orphan,         // source -> p(nothing in the schema holds this)
    ambiguous,      // equalities that were not unique on both sides
    threshold,
    model: modelUsed || model,
    stats: {
      exact: Object.keys(locked).length,
      questions: questionCount,
      calls,
      jevMs,
      totalMs: Math.round(performance.now() - startedAt),
      tokensIn: usage.in,
      tokensOut: usage.out,
      cost: usage.cost,
    },
  };
}

export { readCSV, parseCSV, sniffDelimiter, toColumns } from './csv.mjs';
export {
  DEFAULT_THRESHOLD,
  buildQuestions,
  buildState,
  deterministicPass,
  estimateTokens,
  norm,
  planLots,
  preview,
  resolve,
} from './mapper.mjs';
export { decide, hasKey, JEV_MODEL } from './jev.mjs';
