#!/usr/bin/env node
'use strict';
/*
 * sanitize-english.js — run EVERY English verse in corpus.db through the same
 * name/place + divine-title passthrough used for the canonical baseline, so the
 * works (deuterocanon / pseudepigrapha: Prayer of Manasseh, 1 Enoch, Jubilees,
 * the Testaments, …) read with your transliteration too — "Abraham, Isaac, and
 * Jacob" → "Abaraham, Yatzachaq, and Yaiqab", "Israel" → "Yasharaal", etc.
 *
 * IDEMPOTENT: already-transliterated text contains no English name keys, so the
 * canonical WEB baseline (already sanitized by load-english-baseline.js) is a
 * no-op on re-run. Safe to run repeatedly.
 *
 * Reads corpus.db ENG, which is what /parallel, the readers, AND the Studio
 * (via its englishBaseline fallback) all read — so one pass covers every view.
 *
 * DEPLOY ORDER (same slot as the baseline loader):
 *   re-ingest corpus.db  →  node load-english-baseline.js  →  node sanitize-english.js  →  restart server
 *
 * Usage:
 *   node sanitize-english.js            apply in place
 *   node sanitize-english.js --dry-run  preview counts + samples, write nothing
 */
const path = require('path');
const Database = require('better-sqlite3');
const { makePassthrough } = require('./name-passthrough.js');
const map = require('./name-map-expanded.json');

const DRY = process.argv.includes('--dry-run');
const pass = makePassthrough(map, { gloss: false });
const CORPUS = path.join(__dirname, 'corpus.db');

const db = new Database(CORPUS, { readonly: DRY });

// Every English verse across all 135 ENG books (canonical + promoted works).
const rows = db.prepare(
  "SELECT id, canon_id, code, text FROM verses WHERE corpus='ENG' AND text IS NOT NULL AND text <> ''"
).all();

const upd = db.prepare('UPDATE verses SET text=? WHERE id=?');
let changed = 0;
const byBook = {};                    // canon_id -> count changed (coverage report)
const sample = [];

// A verse that already carries a glossed divine title — "Alahayam (…", etc. —
// has been sanitized before (WEB baseline arrives pre-glossed from the loader,
// or a prior run). Skip it so re-running never double-glosses. Verses with only
// clean name transliterations are safe to re-run (no English keys remain).
const ALREADY = /(Alahayam|Adanay|Yahawah|Ilayawan|Shaday|Tzabaawath) \(/;

const apply = db.transaction(() => {
  for (const r of rows) {
    if (ALREADY.test(r.text)) continue;
    const t = pass(r.text);
    if (t === r.text) continue;
    changed++;
    const key = r.canon_id != null ? r.canon_id : `doc:${r.code}`;
    byBook[key] = (byBook[key] || 0) + 1;
    if (sample.length < 10) sample.push({ id: r.id, book: key, before: r.text.slice(0, 72), after: t.slice(0, 72) });
    if (!DRY) upd.run(t, r.id);
  }
});
apply();

console.log(`${DRY ? '[dry-run] would sanitize' : 'sanitized'} ${changed} / ${rows.length} English verses across ${Object.keys(byBook).length} books`);
console.log('\nsample changes:');
for (const s of sample) console.log(`  #${s.id} (book ${s.book})\n    - ${s.before}\n    + ${s.after}`);

if (DRY) {
  console.log('\nNo changes written (--dry-run). Re-run without --dry-run to apply.');
} else {
  console.log('\nDone. /parallel, the readers, and the Studio all read corpus.db ENG — restart the server to serve the sanitized text.');
}
db.close();
