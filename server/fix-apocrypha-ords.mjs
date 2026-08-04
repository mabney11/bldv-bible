// fix-apocrypha-ords.mjs
// Run from the server/ directory:  node fix-apocrypha-ords.mjs
//
// ROOT CAUSE: apocrypha ENG rows in corpus.db have ord_c / ord_v = NULL, while
// their chapter / verse TEXT columns are populated ('1', '1', ...). Every verse
// read path resolves identity through ord_c / ord_v:
//   • /api/translate/chapter  -> WHERE ord_c=?  (verse list -> empty -> "Loading…")
//   • englishBaseline()       -> view exposes ord_c AS chapter -> no prefill text
//   • /api/parallel/languages -> has_english=false -> reader shows "not translated"
// OT/NT work because their ord_c / ord_v were populated at load time.
//
// This script backfills ord_c / ord_v from the numeric chapter / verse columns,
// ONLY for fully-numeric values, and reports anything it can't safely convert.

import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'corpus.db');
const db = new Database(DB_PATH);

const SCOPE = `corpus='ENG' AND canon_id > 66`;
// "fully numeric" = non-empty and contains no non-digit character
const NUMERIC = `<> '' AND `.replace(/^/, '');
const isNum = (col) => `${col} <> '' AND ${col} NOT GLOB '*[^0-9]*'`;

console.log('DB:', DB_PATH, '\n');

// ── 1. BEFORE ───────────────────────────────────────────────────────────────
const before = db.prepare(`
  SELECT COUNT(*)                                              AS total,
         SUM(ord_c IS NULL OR ord_v IS NULL)                   AS null_ords,
         SUM((ord_c IS NULL OR ord_v IS NULL)
              AND ${isNum('chapter')} AND ${isNum('verse')})   AS fixable
  FROM verses WHERE ${SCOPE}
`).get();
console.log('BEFORE  (apocrypha ENG rows):', before);

// rows that are NULL but NOT fully-numeric — these won't be auto-fixed; inspect
const weird = db.prepare(`
  SELECT canon_id, chapter, verse, COUNT(*) AS n
  FROM verses
  WHERE ${SCOPE} AND (ord_c IS NULL OR ord_v IS NULL)
    AND NOT (${isNum('chapter')} AND ${isNum('verse')})
  GROUP BY canon_id, chapter, verse
  ORDER BY canon_id LIMIT 30
`).all();
if (weird.length) {
  console.log('\n⚠ NON-NUMERIC chapter/verse (NOT auto-fixed — tell me about these):');
  console.table(weird);
}

// ── 2. BACKFILL ─────────────────────────────────────────────────────────────
const info = db.prepare(`
  UPDATE verses
  SET ord_c = CAST(chapter AS INTEGER),
      ord_v = CAST(verse   AS INTEGER)
  WHERE ${SCOPE}
    AND (ord_c IS NULL OR ord_v IS NULL)
    AND ${isNum('chapter')} AND ${isNum('verse')}
`).run();
console.log(`\n✓ UPDATED ${info.changes} rows`);

// ── 3. AFTER / VERIFY ───────────────────────────────────────────────────────
const sample = db.prepare(`
  SELECT canon_id, chapter, verse, ord_c, ord_v
  FROM verses WHERE ${SCOPE} AND canon_id=101
  ORDER BY ord_c, ord_v LIMIT 5
`).all();
console.log('\nAFTER  (canon_id 101 = 1 Adam and Eve, ch1):');
console.table(sample);

const remaining = db.prepare(`
  SELECT COUNT(*) AS still_null FROM verses
  WHERE ${SCOPE} AND (ord_c IS NULL OR ord_v IS NULL)
`).get();
console.log('STILL NULL after fix:', remaining.still_null,
            remaining.still_null ? '(non-numeric rows above — needs manual mapping)' : '(clean)');

db.close();
console.log('\nDone. Restart the server, then reload /translate — Ch 1 should list its verses.');
