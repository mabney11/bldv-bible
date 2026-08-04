#!/usr/bin/env node
/* diagnose-psalm-align.js  —  READ ONLY. Writes nothing.
 *
 * Prints, side by side per verse number, what tokens_bhs (the Hebrew grid the
 * loader aligns to) holds versus what got loaded into corpus.db ENG
 * (src='web-passthrough') — for a few psalms with different superscription
 * shapes. This tells us EXACTLY how tokens_bhs numbers psalm superscriptions
 * and where the English↔Hebrew pairing drifts, so alignChapter can be fixed
 * precisely instead of by guess.
 *
 *   node diagnose-psalm-align.js [path/to/corpus.db]
 *
 * Default path matches the loader's assumption (./corpus.db). Pass yours if
 * different, e.g.  node diagnose-psalm-align.js ../server/data/corpus.db
 */
'use strict';
const path = require('path');
let Database;
try { Database = require('better-sqlite3'); }
catch { console.error('Run this from a folder where better-sqlite3 is installed (your server dir).'); process.exit(1); }

const DB = process.argv[2] || 'corpus.db';
const PSALMS = [3, 23, 51, 82, 88];   // 3=1-line title, 51=2-line title, 82=reported, 88=long title, 23=short
const CANON_PSA = 19;
const SRC_TAG = 'web-passthrough';

const db = new Database(DB, { readonly: true, fileMustExist: true });

// tokens_bhs: one row per token. Collapse to verse -> ordered surface preview.
const tokStmt = db.prepare(
  `SELECT verse, token_ordinal, word_raw FROM tokens_bhs
    WHERE book_id=? AND chapter=? ORDER BY verse, token_ordinal`);
// loaded English baseline for the same chapter.
const engStmt = db.prepare(
  `SELECT verse, text FROM verses
    WHERE corpus='ENG' AND canon_id=? AND chapter=? AND src=? ORDER BY verse`);

function tokensByVerse(ch) {
  const m = new Map();
  for (const r of tokStmt.all(CANON_PSA, ch)) {
    if (!m.has(r.verse)) m.set(r.verse, []);
    m.get(r.verse).push(r.word_raw);
  }
  return m;                       // verse -> [surface,...]
}
function engByVerse(ch) {
  const m = new Map();
  for (const r of engStmt.all(CANON_PSA, ch, SRC_TAG)) m.set(r.verse, r.text || '');
  return m;
}

// crude paleo/Hebrew -> readable: just show the raw surface (user reads paleo);
// keep it short so rows line up.
const preview = (arr, n = 4) => (arr || []).slice(0, n).join(' ');
const clip = (s, n) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);

console.log(`DB: ${path.resolve(DB)}\n`);

for (const ch of PSALMS) {
  const tv = tokensByVerse(ch);
  const ev = engByVerse(ch);
  const tVerses = [...tv.keys()].sort((a, b) => a - b);
  const eVerses = [...ev.keys()].sort((a, b) => a - b);
  const allV = [...new Set([...tVerses, ...eVerses])].sort((a, b) => a - b);

  console.log('═'.repeat(96));
  console.log(`PSALM ${ch}   tokens_bhs verses = [${tVerses.join(',')}]  (count ${tVerses.length})`);
  console.log(`             loaded ENG verses = [${eVerses.join(',')}]  (count ${eVerses.length})`);
  const M = tVerses.length, W = eVerses.length;
  console.log(`             counts: tokens(M)=${M}  eng(W)=${W}  ${M === W ? 'EQUAL→identity' : M > W ? 'M>W→right-align(blank lead)' : 'M<W→left-fill(blank tail)'}`);
  console.log('─'.repeat(96));
  console.log(`  v | HEBREW tokens_bhs (first 4 surfaces)          | ENGLISH loaded (first ~52 chars)`);
  console.log('─'.repeat(96));
  for (const v of allV) {
    const h = tv.has(v) ? preview(tv.get(v)) : '·· (no Hebrew tokens at this verse) ··';
    const e = ev.has(v) ? clip(ev.get(v), 52) : '·· (no English at this verse) ··';
    console.log(`  ${String(v).padStart(2)}| ${h.padEnd(45).slice(0, 45)} | ${e}`);
  }
  console.log('');
}

console.log('═'.repeat(96));
console.log(`Read: for each verse number, does the HEBREW (left) describe the SAME line as the`);
console.log(`ENGLISH (right)? If English is one/two verses BEHIND the Hebrew, that gap = the`);
console.log(`superscription verses tokens_bhs numbers but WEB doesn't. Paste this whole dump back.`);
db.close();
