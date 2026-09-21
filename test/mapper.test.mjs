import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_THRESHOLD,
  buildQuestions,
  buildState,
  deterministicPass,
  norm,
  planLots,
  preview,
  resolve,
} from '../lib/mapper.mjs';
import { mapColumns } from '../lib/index.mjs';

const schema = {
  name: 'CRM contacts',
  about: 'People in a sales CRM.',
  columns: [
    { key: 'first_name', type: 'text', desc: 'Given name only' },
    { key: 'last_name', type: 'text', desc: 'Family name only' },
    { key: 'email', type: 'email', desc: 'Primary business email' },
    { key: 'country', type: 'text', desc: 'Country the contact is based in' },
  ],
};

const cols = (...names) => names.map((name) => ({ name, samples: ['x'] }));

// --- stage 1 ---------------------------------------------------------------

test('normalisation touches case, accents and separators, and nothing else', () => {
  assert.equal(norm('First Name'), 'firstname');
  assert.equal(norm('FIRST_NAME'), 'firstname');
  assert.equal(norm('Prénom'), 'prenom');
  assert.notEqual(norm('prenom'), norm('first_name'));
});

test('a name that lands on a name is locked without a question', () => {
  const { locked } = deterministicPass(['First Name', 'E-Mail'], schema);
  assert.equal(locked.first_name, 'First Name');
  assert.equal(locked.email, 'E-Mail');
});

test('a near miss is not an equality and goes to the model', () => {
  const { locked } = deterministicPass(['Attendee Country', 'Company Name'], schema);
  assert.deepEqual(locked, {});
});

test('two columns that normalise onto the same destination lock nothing', () => {
  // This is the regression that matters. An earlier version locked whichever
  // came first in column order, silently, which is the confidently-wrong
  // failure mode.
  const { locked, ambiguous } = deterministicPass(['Country', 'country'], schema);
  assert.equal(locked.country, undefined);
  assert.deepEqual(ambiguous, [{ destination: 'country', sources: ['Country', 'country'] }]);
});

// --- the payload -----------------------------------------------------------

test('a long value is trimmed at both ends, keeping its shape visible', () => {
  const long = `${'a'.repeat(300)}@example.com`;
  const out = preview(long);
  assert.ok(out.length < 220);
  assert.ok(out.endsWith('@example.com'));
  assert.equal(preview('short@example.com'), 'short@example.com');
});

test('the state carries the column descriptions, which are what disambiguates', () => {
  const state = buildState({ schema, columns: cols('Mail'), filename: 'f.csv' });
  assert.equal(state.destination_table.columns[2].holds, 'Primary business email');
  assert.deepEqual(state.incoming_file.columns[0].example_values, ['x']);
});

test('one question per pair, plus one guard per incoming column', () => {
  const { questions, index } = buildQuestions({ schema, columns: cols('Mail', 'Ville') });
  assert.equal(Object.keys(questions).length, 2 * 4 + 2);
  assert.equal(index.filter((e) => e.kind === 'guard').length, 2);
  assert.ok(Object.values(questions).every((q) => q.type === 'noul'));
});

test('a state that cannot fit its own budget fails loudly rather than on the wire', () => {
  const huge = { blob: 'x'.repeat(200_000) };
  assert.throws(() => planLots({ state: huge, ids: ['a'] }), /cannot be split/);
});

test('questions are split only when they no longer fit in one call', () => {
  const state = buildState({ schema, columns: cols('a', 'b'), filename: 'f.csv' });
  assert.equal(planLots({ state, ids: Array.from({ length: 253 }, (_, i) => `q${i}`) }).length, 1);
  assert.ok(planLots({ state, ids: Array.from({ length: 4000 }, (_, i) => `q${i}`) }).length > 1);
});

// --- stage 2 resolution ----------------------------------------------------

test('resolution is one to one: a destination is never written twice', () => {
  const columns = cols('mail_pro', 'mail_perso');
  const matrix = {
    mail_pro: { email: 0.87 },
    mail_perso: { email: 0.54 },
  };
  const { mapping, ignored } = resolve({ schema, columns, locked: {}, matrix });
  assert.equal(mapping.email.source, 'mail_pro');
  assert.equal(mapping.email.method, 'jev');
  assert.deepEqual(ignored, ['mail_perso']);
});

test('a pair under the threshold is left unmapped, not mapped weakly', () => {
  const matrix = { team: { country: 0.4 } };
  const { mapping, suggestions } = resolve({ schema, columns: cols('team'), locked: {}, matrix });
  assert.equal(mapping.country, undefined);
  assert.deepEqual(suggestions.country[0], { source: 'team', p: 0.4 });
});

test('a locked pair keeps its destination even against a higher probability', () => {
  const columns = cols('email', 'contact_email');
  const matrix = { contact_email: { email: 0.99 } };
  const { mapping } = resolve({ schema, columns, locked: { email: 'email' }, matrix });
  assert.deepEqual(mapping.email, { source: 'email', p: 1, method: 'exact' });
});

test('the threshold is a parameter, not a constant baked into the resolution', () => {
  const matrix = { ville: { country: 0.6 } };
  const opts = { schema, columns: cols('ville'), locked: {}, matrix };
  assert.equal(resolve(opts).mapping.country, undefined);
  assert.equal(resolve({ ...opts, threshold: 0.5 }).mapping.country.source, 'ville');
  assert.equal(DEFAULT_THRESHOLD, 0.75);
});

// --- end to end, with a stubbed transport ----------------------------------

// The `decide` argument is the seam. No key, no network, no cost.
function stub(byPair) {
  return async ({ questions }) => ({
    answers: Object.fromEntries(Object.entries(questions).map(([id, q]) => {
      const { incoming_column: src, destination_column: dst } = q.instructions;
      const p = dst ? (byPair[`${src}>${dst}`] ?? 0.02) : (byPair[`${src}>*`] ?? 0.9);
      return [id, { noul: p }];
    })),
    model: 'stub',
    usage: { in: 10, out: 1, cost: 0.000001 },
    ms: 1,
  });
}

test('the locked pairs are never sent, and the rest comes back resolved', async () => {
  let asked = null;
  const decide = async (args) => {
    asked = args;
    return stub({ 'Attendee>first_name': 0.81, 'Pays>country': 0.93, 'Ticket type>*': 0.95 })(args);
  };

  const result = await mapColumns({
    schema,
    columns: cols('email', 'Attendee', 'Pays', 'Ticket type'),
    filename: 'eventbrite.csv',
    decide,
  });

  // `email` was settled for free, so it is absent from both the state and the
  // questions. That is the whole economic argument for stage 1.
  const asked_sources = asked.state.incoming_file.columns.map((c) => c.column);
  assert.ok(!asked_sources.includes('email'));
  assert.ok(!asked.state.destination_table.columns.some((c) => c.column === 'email'));

  assert.equal(result.mapping.email.method, 'exact');
  assert.equal(result.mapping.first_name.source, 'Attendee');
  assert.equal(result.mapping.country.source, 'Pays');
  assert.deepEqual(result.ignored, ['Ticket type']);
  assert.equal(result.orphan['Ticket type'], 0.95);
  assert.equal(result.stats.exact, 1);
  assert.equal(result.stats.calls, 1);
});

test('a dropped column with a low guard is still reported, not hidden', () => {
  // The guard is the number that warns you: low means the model believes there
  // IS a home for the column, so it was dropped by the threshold instead.
  const matrix = { dept: { country: 0.31 } };
  const { ignored } = resolve({ schema, columns: cols('dept'), locked: {}, matrix });
  assert.deepEqual(ignored, ['dept']);
});

test('a missing answer is an error, never a silent zero', async () => {
  const decide = async () => ({ answers: {}, model: 's', usage: { in: 0, out: 0, cost: 0 }, ms: 1 });
  await assert.rejects(
    () => mapColumns({ schema, columns: cols('Mail'), decide }),
    /No answer came back/,
  );
});

test('an empty schema or an empty file is rejected before any call is made', async () => {
  const decide = async () => assert.fail('should not have been called');
  await assert.rejects(() => mapColumns({ schema: { columns: [] }, columns: cols('a'), decide }));
  await assert.rejects(() => mapColumns({ schema, columns: [], decide }));
});

test('a file that needs no questions at all makes no call', async () => {
  const decide = async () => assert.fail('should not have been called');
  const result = await mapColumns({
    schema,
    columns: cols('first_name', 'last_name', 'email', 'country'),
    decide,
  });
  assert.equal(result.stats.calls, 0);
  assert.equal(result.stats.cost, 0);
  assert.equal(Object.keys(result.mapping).length, 4);
});
