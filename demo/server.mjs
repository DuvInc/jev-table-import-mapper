// The demo server. About eighty lines of `node:http`, no dependencies, and
// nothing in it is meant to ship: it exists so you can watch the mapping
// happen on nine real exports before you wire `lib/` into your own product.
//
// The one thing worth copying is the shape: the key lives on the server, the
// browser posts column names and a few sample values, and the mapping comes
// back as data. Never put the key in the page.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SCHEMAS } from './schemas.mjs';
import { mapColumns } from '../lib/index.mjs';
import { DEFAULT_THRESHOLD } from '../lib/mapper.mjs';
import { JEV_MODEL, hasKey } from '../lib/jev.mjs';

// Node reads the file, so no dotenv. A real environment variable still wins.
try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch { /* no .env, fine */ }

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(HERE, 'public');
const LIB = join(HERE, '..', 'lib');
const SAMPLES = join(HERE, 'samples');
const PORT = Number(process.env.PORT || 5211);
const THRESHOLD = Number(process.env.MATCH_THRESHOLD || DEFAULT_THRESHOLD);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

async function readBody(req, limit = 4_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Body too large'), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function serveStatic(res, root, pathname) {
  const file = normalize(join(root, pathname));
  // Path traversal: `/../../.env` is the first thing anyone tries.
  if (!file.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('404');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/schemas') {
    return json(res, 200, {
      schemas: Object.values(SCHEMAS),
      model: JEV_MODEL,
      threshold: THRESHOLD,
      ready: hasKey(),
    });
  }

  if (url.pathname === '/api/sample') {
    const name = url.searchParams.get('f') || '';
    if (!/^[a-z0-9.\-]+\.csv$/i.test(name)) return json(res, 400, { error: 'bad name' });
    try {
      return json(res, 200, { name, text: await readFile(join(SAMPLES, name), 'utf8') });
    } catch {
      return json(res, 404, { error: 'not found' });
    }
  }

  if (url.pathname === '/api/map' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const schema = SCHEMAS[body.schema];
      if (!schema) throw Object.assign(new Error('unknown schema'), { status: 400 });
      const result = await mapColumns({
        schema,
        columns: body.columns,
        filename: body.filename,
        threshold: THRESHOLD,
      });
      return json(res, 200, result);
    } catch (e) {
      return json(res, e.status || 500, { error: e.message });
    }
  }

  // `lib/` is served to the page so the browser runs the same CSV reader the
  // server does, from the same file.
  if (url.pathname.startsWith('/lib/')) return serveStatic(res, LIB, url.pathname.slice(4));

  let path = url.pathname === '/' ? '/index.html' : url.pathname;
  if (!extname(path)) path += '.html';
  return serveStatic(res, PUBLIC, path);
});

server.listen(PORT, () => {
  console.log(`csv-column-mapper demo  http://localhost:${PORT}`);
  console.log(`model ${JEV_MODEL} | threshold ${THRESHOLD} | key ${hasKey() ? 'found' : 'MISSING'}`);
  if (!hasKey()) console.log('Without a key the deterministic pass still runs and the demo will report the rest as unmapped.');
});
