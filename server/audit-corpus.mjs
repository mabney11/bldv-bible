// audit-corpus.mjs — what does each corpus actually contain?
//
//   node audit-corpus.mjs              summary: every corpus, how many books/verses
//   node audit-corpus.mjs --gaps       only the books a corpus is MISSING
//   node audit-corpus.mjs --book 40    everything known about one book (40 = Matthew)
//
// The Studio shows an empty "Greek Scriptures Source" for Matthew, and several books
// in the sidebar sit at 0%. Rather than guess which loader dropped what, this reads
// the database and says plainly what is there and what is not — per corpus, per book.

import { existsSync } from 'node:fs';
const args = process.argv.slice(2);
const argv = (f,d) => { const i = args.indexOf(f); return i>=0 ? args[i+1] : d; };
const GAPS = args.includes('--gaps');
const BOOK = argv('--book', null);
const die = m => { console.error('\u2717 '+m); process.exit(1); };

let Database;
try { ({ default: Database } = await import('better-sqlite3')); }
catch { die('better-sqlite3 not found — run from server/'); }
if (!existsSync('./corpus.db')) die('corpus.db not found');
const db = new Database('./corpus.db', { readonly: true });

const nonEmpty = "text IS NOT NULL AND TRIM(text) <> ''";

// one book?
if (BOOK) {
  const rows = db.prepare(`SELECT corpus, COUNT(*) n, COUNT(DISTINCT chapter) ch,
      SUM(CASE WHEN ${nonEmpty} THEN 1 ELSE 0 END) filled
      FROM verses WHERE canon_id = ? GROUP BY corpus ORDER BY corpus`).all(Number(BOOK));
  console.log(`canon_id ${BOOK}\n`);
  if (!rows.length) console.log('  NO ROWS AT ALL for this book, in any corpus.');
  for (const r of rows)
    console.log(`  ${String(r.corpus).padEnd(6)} ${String(r.filled).padStart(6)} verses with text` +
                ` (${r.n} rows, ${r.ch} chapters)` + (r.filled === 0 ? '   <-- ROWS EXIST BUT ALL EMPTY' : ''));
  db.close(); process.exit(0);
}

const corpora = db.prepare(`SELECT DISTINCT corpus FROM verses ORDER BY corpus`).all().map(r => r.corpus);
const allBooks = db.prepare(`SELECT DISTINCT canon_id FROM verses ORDER BY canon_id`).all().map(r => r.canon_id);

console.log(`corpora: ${corpora.join(', ')}`);
console.log(`books with any row: ${allBooks.length} (canon_id ${allBooks[0]}..${allBooks[allBooks.length-1]})\n`);

const stat = db.prepare(`SELECT corpus, COUNT(DISTINCT canon_id) books,
    SUM(CASE WHEN ${nonEmpty} THEN 1 ELSE 0 END) filled, COUNT(*) rows
    FROM verses GROUP BY corpus ORDER BY filled DESC`).all();
console.log('corpus   books   verses with text   empty rows');
for (const s of stat)
  console.log(`  ${String(s.corpus).padEnd(6)} ${String(s.books).padStart(5)} ${String(s.filled).padStart(17).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} ${String(s.rows - s.filled).padStart(12)}`);

// which books does each corpus have NOTHING for?
console.log('\nBOOKS WITH NO TEXT, BY CORPUS');
console.log('(a book listed here has zero non-empty verses in that corpus — that is why');
console.log(' the Studio source panel comes up blank and the sidebar shows 0%)\n');
for (const c of corpora) {
  const have = new Set(db.prepare(
    `SELECT DISTINCT canon_id FROM verses WHERE corpus = ? AND ${nonEmpty}`).all(c).map(r => r.canon_id));
  const gaps = allBooks.filter(b => !have.has(b));
  const OT = gaps.filter(b => b <= 39), NT = gaps.filter(b => b >= 40 && b <= 66), other = gaps.filter(b => b > 66);
  console.log(`  ${c}:  has ${have.size} books, missing ${gaps.length}`);
  if (OT.length)    console.log(`      OT (1-39)   : ${OT.join(' ')}`);
  if (NT.length)    console.log(`      NT (40-66)  : ${NT.join(' ')}`);
  if (other.length) console.log(`      other (67+) : ${other.slice(0,30).join(' ')}${other.length>30?' ...':''}`);
  if (!GAPS && gaps.length === 0) console.log('      (complete)');
}

console.log('\nMatthew is canon_id 40. For detail:  node audit-corpus.mjs --book 40');
db.close();
