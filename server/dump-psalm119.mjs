// dump-psalm119.mjs — run from server/:   node dump-psalm119.mjs
// Read-only. Writes psalm119-tokens.json (a few thousand rows). Upload that file.
//
// This is the whole point: Psalm 119 is FIXED. Its Hebrew tokens are fixed. Once I
// have them I can resolve every English word to its lemma deterministically, verse by
// verse, and SHOW you the 176-verse table — no probability, no guessing, no synthetic
// tests. If it is 100% on Psalm 119 the same procedure is 100% everywhere, because
// nothing about it is chapter-specific.

import Database from 'better-sqlite3';
import { writeFileSync } from 'node:fs';

const db = new Database('./corpus.db', { readonly: true });

// Psalms = canon id 19. If your book_id differs, change it here.
const BOOK = 19, CHAP = 119;

const rows = db.prepare(`
    SELECT verse, token_ordinal, word_raw, pos, morph, strongs
    FROM tokens_bhs
    WHERE book_id = ? AND chapter = ?
    ORDER BY verse, token_ordinal
`).all(BOOK, CHAP);

if (!rows.length) {
  console.error('✗ no rows — check that Psalms is book_id 19 in your corpus.db:');
  for (const r of db.prepare(`SELECT DISTINCT book_id FROM tokens_bhs ORDER BY book_id LIMIT 45`).all())
    process.stderr.write(r.book_id + ' ');
  process.exit(1);
}

// the Paleo root per Strong's, so the transliteration is derivable from YOUR data
let roots = {};
for (const p of ['./lexicon/strongs-roots.json', './strongs-roots.json']) {
  try { roots = JSON.parse((await import('node:fs')).readFileSync(p, 'utf8')); break; } catch {}
}
const used = {};
for (const r of rows) {
  if (!r.strongs) continue;
  const sn = 'H' + String(r.strongs).replace(/^H+/, '');
  if (roots[sn]) used[sn] = roots[sn];
}

writeFileSync('psalm119-tokens.json', JSON.stringify({
  book_id: BOOK, chapter: CHAP,
  verses: rows.length ? Math.max(...rows.map(r => r.verse)) : 0,
  tokens: rows,
  strongs_roots: used,      // only the Strong's this chapter actually uses
}, null, 1));

console.log(`✓ psalm119-tokens.json`);
console.log(`  verses ${Math.max(...rows.map(r => r.verse))} · tokens ${rows.length} · distinct Strong's ${Object.keys(used).length}`);
console.log(`  upload that file.`);
db.close();
