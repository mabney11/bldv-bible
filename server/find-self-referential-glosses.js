#!/usr/bin/env node
'use strict';
/*
 * find-self-referential-glosses.js — scan for the corruption a name-passthrough.js
 * bug introduced during this session, before it was fixed: a word immediately
 * followed by a gloss containing the EXACT SAME word — "Idah (Idah)" (should read
 * "Idah (Adah)"), "Aman (Aman)" (should read "Aman (Amen)"), or a mangled
 * hyphen-compound gloss like a "Tubal-Cain" gloss having each half separately
 * transliterated instead of being left as the plain English original.
 *
 * REPORT ONLY — no writes. Run this first so we can see the actual scope (which
 * books, how many rows) before picking a repair strategy: rows that have a
 * text_src baseline can likely be recovered by diffing against it; rows with no
 * text_src (if any) will need a different fix.
 *
 * Usage:
 *   node find-self-referential-glosses.js
 */
const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, 'corpus.db'), { readonly: true });

// Word immediately followed by "(" + the SAME word (case-sensitive) + ")".
const SELF_GLOSS = /\b([A-Za-z][A-Za-z']*)\s*\(\1\)/g;
// Same idea but for a hyphen-compound gloss where EVERY segment matches the
// preceding compound exactly, e.g. "Thawabalaqayan (Thawabal-Qayan)" would not
// match this (segments differ) but flags any exact hyphen self-repeat too.
const SELF_GLOSS_HYPHEN = /\b([A-Za-z][A-Za-z']*(?:-[A-Za-z][A-Za-z']*)+)\s*\(\1\)/g;

const hasTextSrc = db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('verses') WHERE name='text_src'").get().n > 0;

const cols = hasTextSrc ? 'id, canon_id, code, chapter, verse, text, text_src' : 'id, canon_id, code, chapter, verse, text';
const rows = db.prepare(`SELECT ${cols} FROM verses WHERE corpus='ENG' AND text IS NOT NULL AND text <> ''`).all();

let found = 0, withSrc = 0, withoutSrc = 0;
const byBook = {};
const samples = [];

for (const r of rows) {
  SELF_GLOSS.lastIndex = 0;
  SELF_GLOSS_HYPHEN.lastIndex = 0;
  const hit = SELF_GLOSS.test(r.text) || SELF_GLOSS_HYPHEN.test(r.text);
  if (!hit) continue;
  found++;
  const key = r.canon_id != null ? r.canon_id : `doc:${r.code}`;
  byBook[key] = (byBook[key] || 0) + 1;
  const hasSrc = hasTextSrc && r.text_src && r.text_src !== r.text;
  if (hasSrc) withSrc++; else withoutSrc++;
  if (samples.length < 25) {
    samples.push({ id: r.id, ref: `${r.code} ${r.chapter}:${r.verse}`, text: r.text.slice(0, 160), hasSrc });
  }
}

console.log(`text_src column present: ${hasTextSrc}`);
console.log(`${found} row(s) with a self-referential gloss found across ${Object.keys(byBook).length} book(s)`);
console.log(`  of which have a DIFFERING text_src to potentially recover from: ${withSrc}`);
console.log(`  of which have NO usable text_src (need a different fix):        ${withoutSrc}`);
console.log('\nby book:');
for (const [b, n] of Object.entries(byBook).sort((a, b) => b[1] - a[1])) {
  console.log('  ' + String(n).padStart(5) + '  ' + b);
}
console.log('\nsamples:');
for (const s of samples) {
  console.log(`  #${s.id} [${s.ref}] (text_src recoverable: ${s.hasSrc})`);
  console.log(`    ${s.text}`);
}
db.close();
