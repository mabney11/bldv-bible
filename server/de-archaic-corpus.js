#!/usr/bin/env node
'use strict';
/*
 * de-archaic-corpus.js — modernize archaic English across corpus.db ENG, in place.
 *
 * Runs every English verse through modernize-english.js (closed-class archaic
 * words + curated-verb -eth/-est), so the works read in plain modern English
 * without inventing anything. Canonical WEB is already modern → no-op there.
 * Idempotent: safe to run repeatedly.
 *
 * Also repairs the baked "Rakal" left by the earlier name bug. Safe corpus-wide:
 * with the rebuilt name map the town's spelling stays "Rachal", so nothing emits
 * "Rakal" anymore — every "Rakal" in the DB is old corruption of Rachel (Rachal).
 *
 * DEPLOY ORDER:
 *   node build-names-from-hebrew.mjs   (rebuild the correct name map — done)
 *   node sanitize-english.js           (apply names)
 *   node de-archaic-corpus.js          (this: modernize + Rakal repair)
 *   restart server
 *
 *   node de-archaic-corpus.js            apply in place
 *   node de-archaic-corpus.js --dry-run  preview counts + samples + residue, write nothing
 */
const path = require('path');
const Database = require('better-sqlite3');
const { modernize, listResidual } = require('./modernize-english.js');

const DRY = process.argv.includes('--dry-run');
const CORPUS = path.join(__dirname, 'corpus.db');
const db = new Database(CORPUS, { readonly: DRY });

const repairRakal = s => s.replace(/\bRakal\b/g, 'Rachal');

const rows = db.prepare(
  "SELECT id, canon_id, code, text FROM verses WHERE corpus='ENG' AND text IS NOT NULL AND text <> ''"
).all();

const upd = db.prepare('UPDATE verses SET text=? WHERE id=?');
let changed = 0, rakalFixed = 0;
const byBook = {};                 // code -> count changed
const residue = {};                // code -> Set of unresolved archaic markers
const sample = [];

const apply = db.transaction(() => {
  for (const r of rows) {
    let t = modernize(r.text);
    const beforeRakal = t;
    t = repairRakal(t);
    if (t !== beforeRakal) rakalFixed++;
    if (t === r.text) continue;
    changed++;
    byBook[r.code] = (byBook[r.code] || 0) + 1;
    const left = listResidual(t);
    if (left.length) { (residue[r.code] ||= new Set()); left.forEach(x => residue[r.code].add(x)); }
    if (sample.length < 12) sample.push({ code: r.code, before: r.text.slice(0, 76), after: t.slice(0, 76) });
    if (!DRY) upd.run(t, r.id);
  }
});
apply();

console.log(`${DRY ? '[dry-run] would modernize' : 'modernized'} ${changed} / ${rows.length} English verses`);
console.log(`Rakal → Rachal repairs: ${rakalFixed}`);
console.log(`\nby book:`);
for (const [code, n] of Object.entries(byBook).sort((a, b) => b[1] - a[1]))
  console.log('  ' + String(n).padStart(5) + '  ' + code);

const resEntries = Object.entries(residue).filter(([, s]) => s && s.size);
if (resEntries.length) {
  console.log(`\nResidual archaic markers still present (curated verb list didn't cover these —`);
  console.log(`send them back and I'll add the stems):`);
  for (const [code, s] of resEntries) console.log('  ' + code.padEnd(26) + ' ' + [...s].slice(0, 12).join(', '));
} else {
  console.log('\nNo residual archaic markers detected.');
}

console.log('\nsample changes:');
for (const s of sample) console.log(`  [${s.code}]\n    - ${s.before}\n    + ${s.after}`);

console.log(DRY
  ? '\nNo changes written (--dry-run). Re-run without --dry-run to apply.'
  : '\nDone. Restart the server to serve the modernized text.');
db.close();
