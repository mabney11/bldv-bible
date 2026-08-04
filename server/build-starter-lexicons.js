#!/usr/bin/env node
/**
 * build-starter-lexicons.js
 *
 * Generates starter gloss lexicons for the foreign reader from concordance.db.
 * One JSON per language, keyed by the SAME normalized surface the reader looks
 * up (server.js → splitTextToTokens), value = "" (your gloss to fill in),
 * ordered most-frequent-first so you gloss the words that actually appear most.
 *
 * Re-runnable and non-destructive: glosses you've already written are preserved,
 * new surfaces are appended with an empty gloss, and nothing is deleted.
 *
 * Usage:
 *   node build-starter-lexicons.js [path/to/concordance.db] [path/to/lexicon-dir]
 *
 * Defaults try the usual locations relative to this script:
 *   db  : ../concordance.db  then ./concordance.db
 *   out : ../server/lexicon  then ../lexicon  then ./lexicon
 *
 * Output files (only these languages — Greek/Ge'ez/Latin already have lexicons):
 *   syriac-lexicon.json   (corpus SYR, script syriac)
 *   coptic-lexicon.json   (corpus COP, script coptic)
 *   hebrew-extra-lexicon.json (corpus HEB, script paleo-hebrew)
 */
const fs   = require('fs');
const path = require('path');
let Database;
try { Database = require('better-sqlite3'); }
catch { console.error("This script needs better-sqlite3 (you already use it in the server).\nRun it from the server folder, or: npm i better-sqlite3"); process.exit(1); }

// ── normalization: keep this byte-for-byte in sync with splitTextToTokens() in
//    server.js, or the keys won't match what the reader requests. ──────────────
const norm = s => String(s || '').replace(/[\u1360-\u1368\u00B7.,:;!?\u037E\u0387]/g, '');

const LANGS = [
  { corpus: 'SYR', file: 'syriac-lexicon.json' },
  { corpus: 'COP', file: 'coptic-lexicon.json' },
  { corpus: 'HEB', file: 'hebrew-extra-lexicon.json' },
];

const firstExisting = (cands) => cands.find(p => { try { return fs.existsSync(p); } catch { return false; } });

const dbPath = process.argv[2] || firstExisting([
  path.join(__dirname, '..', 'concordance.db'),
  path.join(__dirname, 'concordance.db'),
  path.join(process.cwd(), 'concordance.db'),
]);
const outDir = process.argv[3] || firstExisting([
  path.join(__dirname, '..', 'server', 'lexicon'),
  path.join(__dirname, '..', 'lexicon'),
  path.join(__dirname, 'lexicon'),
]) || path.join(__dirname, '..', 'server', 'lexicon');

if (!dbPath || !fs.existsSync(dbPath)) {
  console.error(`concordance.db not found. Pass its path:\n  node build-starter-lexicons.js C:\\path\\to\\concordance.db`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
console.log(`db : ${dbPath}\nout: ${outDir}\n`);

const db = new Database(dbPath, { readonly: true });

// Serialize one entry per line so the file is easy to hand-edit and diff.
const serialize = (entries) =>
  '{\n' + entries.map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n') + '\n}\n';

for (const { corpus, file } of LANGS) {
  let rows;
  try {
    rows = db.prepare('SELECT surface, COUNT(*) n FROM tokens WHERE corpus=? GROUP BY surface').all(corpus);
  } catch (e) {
    console.error(`! ${corpus}: query failed (${e.message}) — skipping`);
    continue;
  }

  // Aggregate by normalized key (several surfaces collapse to one lexeme key).
  const counts = new Map();
  for (const r of rows) {
    const k = norm(r.surface);
    if (!k) continue;
    counts.set(k, (counts.get(k) || 0) + r.n);
  }

  const outPath = path.join(outDir, file);
  let existing = {};
  if (fs.existsSync(outPath)) {
    try { existing = JSON.parse(fs.readFileSync(outPath, 'utf8')) || {}; }
    catch (e) { console.error(`! ${file}: couldn't parse existing file (${e.message}); leaving it untouched`); continue; }
  }

  // Most-frequent first; preserve any gloss already written.
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const out = [];
  const seen = new Set();
  for (const [k] of sorted) { out.push([k, existing[k] || '']); seen.add(k); }
  // Carry over any pre-existing keys not present in the corpus scan (don't lose work).
  for (const k of Object.keys(existing)) if (!seen.has(k)) out.push([k, existing[k]]);

  fs.writeFileSync(outPath, serialize(out));
  const filled = out.filter(([, v]) => v).length;
  console.log(`✓ ${file}: ${out.length} keys (${filled} already glossed)`);
  const top = sorted.slice(0, 15).map(([k, n]) => `${k}·${n}`).join('  ');
  if (top) console.log(`    top: ${top}\n`);
}

db.close();
console.log('Done. Fill in glosses top-down; the server hot-reloads the JSON on save.');
