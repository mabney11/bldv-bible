#!/usr/bin/env node
'use strict';
/*
 * sample-corpus.js — pull N random verses from N DIFFERENT books, for a quick,
 * non-cherry-picked spot-check before greenlighting a batch of ingestion/
 * sanitization/modernization changes.
 *
 * Deliberately NOT deterministic — the point is an independent look at different
 * corners of the corpus each time a change is made, so a real problem sitting in a
 * verse that never happens to get checked doesn't slip through just because the same
 * handful of "known good" verses keep getting re-reviewed. Run it fresh after every
 * round of changes, not once at the start.
 *
 * Usage:
 *   node sample-corpus.js                                   5 random verses, 5 different
 *                                                            books, anywhere in corpus='ENG'
 *   node sample-corpus.js --n=8                              8 verses instead of 5
 *   node sample-corpus.js --src=gnostic-priority-2026-07      only this batch's ingested texts
 *   node sample-corpus.js --codes=GOSPEL_OF_THOMAS,GOSPEL_OF_PHILIP   only these exact books
 *
 * --src is useful right after touching ingestion code (restricts the sample to the
 * texts that code actually touches); running with NO filter afterward is what catches
 * collateral effects on OTHER books (this session's modernizer/entity fixes turned out
 * to also change Gospel of Nicodemus, Jasher, Testament of Asher, etc. — worth seeing
 * those too, not just the texts that were the original target).
 */
const path = require('path');
const Database = require('better-sqlite3');

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
}));
const N = parseInt(args.n, 10) || 5;
const CORPUS = path.join(__dirname, 'corpus.db');
const db = new Database(CORPUS, { readonly: true });

let where = "corpus='ENG' AND text IS NOT NULL AND text <> ''";
const params = [];
if (args.src) { where += ' AND src=?'; params.push(args.src); }
if (args.codes) {
  const codes = String(args.codes).split(',').map(s => s.trim()).filter(Boolean);
  where += ` AND code IN (${codes.map(() => '?').join(',')})`;
  params.push(...codes);
}

const codeRows = db.prepare(`SELECT DISTINCT code FROM verses WHERE ${where}`).all(...params);
if (!codeRows.length) {
  console.log('No matching books found for this filter.');
  process.exit(0);
}

// Fisher-Yates shuffle, then take up to N distinct book codes.
const codes = codeRows.map(r => r.code);
for (let i = codes.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [codes[i], codes[j]] = [codes[j], codes[i]];
}
const chosen = codes.slice(0, N);

const pickVerse = db.prepare(
  `SELECT code, chapter, verse, text FROM verses WHERE ${where} AND code=? ORDER BY RANDOM() LIMIT 1`
);

console.log(`${chosen.length} random verse(s) from ${chosen.length} different book(s)`
  + (codeRows.length > chosen.length ? ` (out of ${codeRows.length} matching books)` : '') + ':\n');
for (const code of chosen) {
  const row = pickVerse.get(...params, code);
  if (!row) continue;
  console.log(`── ${row.code} ${row.chapter}:${row.verse} ──`);
  console.log(row.text);
  console.log('');
}
db.close();
