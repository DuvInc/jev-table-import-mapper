import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseCSV, readCSV, sniffDelimiter, toColumns } from '../lib/csv.mjs';

test('a quoted field keeps its delimiter', () => {
  const rows = parseCSV('a,b\n"Paris, France",2');
  assert.deepEqual(rows[1], ['Paris, France', '2']);
});

test('a doubled quote is one quote', () => {
  const rows = parseCSV('a\n"He said ""no"""');
  assert.equal(rows[1][0], 'He said "no"');
});

test('the Excel BOM is not part of the first column name', () => {
  const rows = parseCSV('﻿first_name,last_name\nAda,Lovelace');
  assert.equal(rows[0][0], 'first_name');
});

test('CRLF and a lone CR both end a row', () => {
  assert.equal(parseCSV('a,b\r\n1,2\r3,4').length, 3);
});

test('a blank trailing line is not a record', () => {
  assert.equal(parseCSV('a,b\n1,2\n\n').length, 2);
});

test('a semicolon export is sniffed, and a comma inside a quoted field does not win the vote', () => {
  assert.equal(sniffDelimiter('nom;ville;pays\nAda;"Paris, France";FR'), ';');
  assert.equal(sniffDelimiter('name,city\nAda,Paris'), ',');
});

test('toColumns takes three sample values and pads a short row', () => {
  const columns = toColumns(parseCSV('a,b\n1,2\n3\n5,6\n7,8'));
  assert.deepEqual(columns[0], { name: 'a', samples: ['1', '3', '5'] });
  assert.deepEqual(columns[1], { name: 'b', samples: ['2', '', '6'] });
});

test('readCSV goes from text to the mapper input shape in one step', () => {
  const columns = readCSV('prenom;ville\nAda;Paris');
  assert.deepEqual(columns.map((c) => c.name), ['prenom', 'ville']);
  assert.deepEqual(columns[0].samples, ['Ada']);
});

test('an empty file yields no columns rather than throwing', () => {
  assert.deepEqual(readCSV(''), []);
});
