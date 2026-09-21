// A CSV reader small enough to read in one sitting, and correct on the two
// things that break naive splitters: quoted fields containing the delimiter,
// and doubled quotes inside them.
//
// This module runs unchanged in Node and in a browser. The demo serves it to
// the page directly, which is also the proof that it has no Node dependency.
//
// It is here for convenience. If your product already parses CSV, spreadsheets
// or an upstream API payload, keep your parser and build the `columns` array
// yourself: that array is the only thing the mapper reads.

export function parseCSV(text, { delimiter = ',' } = {}) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  // Strip the UTF-8 BOM that Excel writes, and normalise CRLF and lone CR.
  const s = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  // A trailing newline, or a run of empty lines in the middle, is not a record.
  return rows.filter((r) => r.some((v) => v !== ''));
}

// Guess the delimiter from the header line. Exports from French, German and
// Spanish locales are semicolon separated often enough that failing on them
// would be the first bug anybody reports.
export function sniffDelimiter(text, candidates = [',', ';', '\t', '|']) {
  const head = String(text).replace(/^﻿/, '').split(/\r\n?|\n/)[0] || '';
  let best = candidates[0];
  let bestCount = 0;
  for (const d of candidates) {
    // Count only what falls outside quotes, so a comma inside "Paris, France"
    // does not win the vote for a semicolon-separated file.
    const count = parseCSV(head, { delimiter: d })[0]?.length ?? 1;
    if (count > bestCount) { best = d; bestCount = count; }
  }
  return best;
}

// The shape the mapper wants: one entry per incoming column, with a few real
// values. `sampleRows` is deliberately small. Three values are enough to
// recognise a shape, and every extra one is paid for in every request.
export function toColumns(rows, { sampleRows = 3 } = {}) {
  const [head, ...data] = rows;
  if (!head) return [];
  return head.map((name, i) => ({
    name,
    samples: data.slice(0, sampleRows).map((r) => r[i] ?? ''),
  }));
}

// text -> columns, for the common case.
export function readCSV(text, options = {}) {
  const delimiter = options.delimiter || sniffDelimiter(text);
  return toColumns(parseCSV(text, { delimiter }), options);
}
