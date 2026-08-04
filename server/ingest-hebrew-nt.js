#!/usr/bin/env node
/**
 * ingest-hebrew-nt.js
 *
 * Loads the (public-domain) Delitzsch Hebrew New Testament into corpus.db as the
 * HEB ("Hebrew extra") source, so Heb-Extra finally has Matthew (and the rest of
 * the NT). The app reads HEB from main.verses WHERE corpus='HEB', keyed by
 * canon_id (40=Matthew … 66=Revelation), ord_c (chapter), ord_v (verse); it
 * converts the square Hebrew to Paleo (U+10900) for display, so the text is
 * stored verbatim/vocalized.
 *
 * Usage:
 *   node ingest-hebrew-nt.js [--db corpus.db] [--json hebrew-nt-delitzsch.json] [--matthew-only] [--dry-run]
 *
 * Defaults: --db ./corpus.db  --json ./hebrew-nt-delitzsch.json
 *
 * Idempotent: it first DELETEs any existing corpus='HEB' rows in the NT range
 * (canon_id 40-66), then inserts, so re-running never duplicates. It introspects
 * the `verses` table and only writes columns that actually exist, so it adapts to
 * whatever schema your corpus.db uses.
 *
 * Source: Revised Franz Delitzsch Hebrew NT — github.com/HebrewNewTestament/HebDelitzsch
 * Public domain (Delitzsch d. 1890; translation 1877-1892).
 */
'use strict';
const fs = require('fs');
const path = require('path');

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return (v && !v.startsWith('--')) ? v : true;
}
const DB_PATH   = arg('--db',   'corpus.db');
const JSON_PATH = arg('--json', 'hebrew-nt-delitzsch.json');
const MATT_ONLY = process.argv.includes('--matthew-only');
const DRY       = process.argv.includes('--dry-run');
const KEEP_SQUARE = process.argv.includes('--keep-square');  // store square Hebrew instead of Paleo

// Square (modern) Hebrew → Paleo (U+10900), mirroring server/lib hebrewPaleo:
// consonants 1:1, finals fold to base, niqqud/cantillation/sof-pasuq dropped. The
// app is Paleo-only, so by default the corpus stores Paleo and no modern Hebrew is
// ever associated with it. Maqaf (U+05BE) becomes a SPACE so joined forms like
// בֶּן־דָּוִד split into two word blocks.
const _HEB_TO_PALEO = (() => {
  const base = 'אבגדהוזחטיכלמנסעפצקרשת';
  const paleo = [...'𐤀𐤁𐤂𐤃𐤄𐤅𐤆𐤇𐤈𐤉𐤊𐤋𐤌𐤍𐤎𐤏𐤐𐤑𐤒𐤓𐤔𐤕'];
  const m = {};
  [...base].forEach((h, i) => { m[h] = paleo[i]; });
  for (const [f, b] of Object.entries({ 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' })) m[f] = m[b];
  return m;
})();
function toPaleo(s) {
  let out = '';
  for (const ch of String(s || '').replace(/\u05BE/g, ' ')) {   // maqaf → space (split words)
    if (_HEB_TO_PALEO[ch]) { out += _HEB_TO_PALEO[ch]; continue; }
    const cp = ch.codePointAt(0);
    if (cp >= 0x0591 && cp <= 0x05C7) continue;   // niqqud / cantillation / sof-pasuq
    out += ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}

let Database;
try { Database = require('better-sqlite3'); }
catch { console.error("✗ better-sqlite3 not found. Run from your server dir (npm i better-sqlite3)."); process.exit(1); }

if (!fs.existsSync(JSON_PATH)) { console.error(`✗ data file not found: ${JSON_PATH}`); process.exit(1); }
if (!fs.existsSync(DB_PATH))   { console.error(`✗ corpus.db not found: ${DB_PATH}`); process.exit(1); }

const payload = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
let rows = Array.isArray(payload) ? payload : (payload.verses || []);
if (MATT_ONLY) rows = rows.filter(r => r.canon_id === 40);
if (!rows.length) { console.error('✗ no verses to ingest'); process.exit(1); }
console.log(`Source: ${payload._source || 'Hebrew NT'} — ${rows.length} verses${MATT_ONLY ? ' (Matthew only)' : ''}`);

const db = new Database(DB_PATH);

// Introspect the verses table so we write only columns that exist.
const cols = db.prepare(`PRAGMA table_info(verses)`).all();
if (!cols.length) { console.error('✗ no `verses` table in this DB'); process.exit(1); }
const colNames = new Set(cols.map(c => c.name));

// Map our data onto whatever the schema calls things. Every candidate is written
// only if that column actually exists.
function valuesFor(r) {
  const cand = {
    corpus:   'HEB',
    canon_id: r.canon_id,
    ord_c:    r.chapter,
    ord_v:    r.verse,
    text:     KEEP_SQUARE ? r.text : toPaleo(r.text),
    code:     null,                                  // canonical book → no doc code
    ref_key:  `${r.book}.${r.chapter}.${r.verse}`,   // OSIS-style ref if column exists
    lang:     'hbo',
  };
  const out = {};
  for (const c of cols) {
    if (c.name in cand) { out[c.name] = cand[c.name]; continue; }
    // Unknown NOT NULL column with no default → supply a safe placeholder.
    if (c.notnull && c.dflt_value == null && c.pk === 0) out[c.name] = '';
  }
  return out;
}

const sample = valuesFor(rows[0]);
const insCols = Object.keys(sample);
console.log(`verses columns: [${cols.map(c => c.name).join(', ')}]`);
console.log(`writing columns: [${insCols.join(', ')}]`);
const unmapped = insCols.filter(c => !['corpus','canon_id','ord_c','ord_v','text','code','ref_key','lang'].includes(c));
if (unmapped.length) console.warn(`⚠ placeholder '' written for unmapped NOT NULL column(s): ${unmapped.join(', ')}`);

const existing = db.prepare(
  `SELECT COUNT(*) n FROM verses WHERE corpus='HEB' AND canon_id BETWEEN 40 AND 66`
).get().n;

if (DRY) {
  console.log(`\n[dry-run] would delete ${existing} existing HEB NT verse(s) and insert ${rows.length}.`);
  console.log('[dry-run] sample row:', JSON.stringify(sample).slice(0, 200));
  process.exit(0);
}

const del = db.prepare(`DELETE FROM verses WHERE corpus='HEB' AND canon_id BETWEEN 40 AND 66`);
const ins = db.prepare(
  `INSERT INTO verses (${insCols.join(',')}) VALUES (${insCols.map(c => '@' + c).join(',')})`
);

const run = db.transaction(() => {
  const removed = del.run().changes;
  let n = 0;
  for (const r of rows) { ins.run(valuesFor(r)); n++; }
  return { removed, n };
});

const { removed, n } = run();
console.log(`\n✓ removed ${removed} old HEB NT verse(s), inserted ${n}.`);
const books = db.prepare(
  `SELECT canon_id, COUNT(*) v FROM verses WHERE corpus='HEB' AND canon_id BETWEEN 40 AND 66 GROUP BY canon_id ORDER BY canon_id`
).all();
console.log(`HEB NT books now present: ${books.map(b => `${b.canon_id}(${b.v})`).join(' ')}`);
const mt = db.prepare(`SELECT text FROM verses WHERE corpus='HEB' AND canon_id=40 AND ord_c=22 AND ord_v=35`).get();
console.log(`Matthew 22:35 check: ${mt ? '✓ ' + mt.text : '✗ missing'}`);
db.close();
console.log('\nDone. Restart the server so the HEB source re-attaches, then open Heb-Extra → Matthew.');
