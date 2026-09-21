// The only file in this repository that talks to a service.
//
// It posts one `state` plus a bag of typed questions and gets typed answers
// back. Everything else in `lib/` is pure: it builds questions and reads
// probabilities, and never knows who answered them.
//
// That boundary is the point. To run this against your own gateway, a proxy
// that holds the key server side, a self-hosted deployment or a stub in tests,
// write a function with this signature and pass it in as `decide`:
//
//   async ({ state, questions }) => ({
//     answers: { [id]: { noul: 0..1 } },
//     model: string,
//     usage: { in, out, cost },
//     ms: number,
//   })
//
// `test/mapper.test.mjs` does exactly that, which is why the test suite needs
// no key and no network.

const ENDPOINT = process.env.JEV_ENDPOINT || 'https://openrouter.ai/api/alpha/decisions';

export const JEV_MODEL = process.env.JEV_MODEL || 'typesafe/jev-1.13';

// Read at call time, never at import time: a key that is cached in a module
// constant survives a rotation and is impossible to override in a test.
const apiKey = () => (process.env.OPENROUTER_API_KEY || '').trim();

export const hasKey = () => !!apiKey();

export async function decide({ state, questions, model = JEV_MODEL, signal }) {
  const key = apiKey();
  if (!key) {
    throw Object.assign(
      new Error('No OPENROUTER_API_KEY in the environment. See .env.example.'),
      { status: 412 },
    );
  }

  const started = performance.now();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, state, questions }),
    signal,
  });

  // Read as text first. A gateway under load answers with an HTML error page,
  // and `res.json()` then throws a parse error that says nothing about what
  // actually happened.
  const raw = await res.text();
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw Object.assign(
      new Error(`Non-JSON response, HTTP ${res.status}: ${raw.slice(0, 300)}`),
      { status: 502 },
    );
  }
  if (!res.ok || body.error) {
    throw Object.assign(
      new Error(body.error?.message || body.error_type || `HTTP ${res.status}`),
      { status: res.status },
    );
  }

  return {
    answers: body.answers,
    model: body.model,
    usage: {
      in: body.usage?.input_tokens || 0,
      out: body.usage?.output_tokens || 0,
      cost: body.usage?.cost || 0,
    },
    ms: Math.round(performance.now() - started),
  };
}
