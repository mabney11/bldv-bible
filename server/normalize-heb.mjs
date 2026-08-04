// normalize-heb.mjs — the HEB corpus has verses but NO chapter numbers.
//
//   node normalize-heb.mjs             report only, writes nothing
//   node normalize-heb.mjs --apply     backfill chapter/verse
//
// THE SYMPTOM
//   node audit-corpus.mjs --book 40
//     HEB   1071 verses with text (1071 rows, 0 chapters)
//   Every other corpus reports 28 chapters for Matthew. HEB reports ZERO — meaning
//   `chapter` is NULL on every row. The text is there; it simply cannot be addressed
//   by (book, chapter, verse) like everything else, which is why that source panel
//   behaves differently from the others.
//
// THE REPAIR
//   The chapter/verse are recoverable from whatever key the rows DO carry (ref_key,
//   osis id, or an id like "HEB.40.1.1"). This inspects the actual columns first and
//   shows you the parse BEFORE touching anything — no assumption about the schema.
//
// It never invents a number: a row whose chapter cannot be parsed is reported, not
// guessed at, and left alone.

import { existsSync } from 'node:fs';
const APPLY = process.argv.includes('--apply');
const die = m => { console.error('\u2717 ' + m); process.exit(1); };

let Database;
try { ({ default: Database } = await import('better-sqlite3')); }
catch { die('better-sqlite3 not found — run from server/'); }
if (!existsSync('./corpus.db')) die('corpus.db not found');
const db = new Database('./corpus.db', { readonly: !APPLY });

const cols = db.prepare('PRAGMA table_info(verses)').all().map(c => c.name);
console.log('verses columns: ' + cols.join(', ') + '\n');

const bad = db.prepare(
  `SELECT COUNT(*) n FROM verses WHERE corpus='HEB' AND (chapter IS NULL OR chapter = 0)`).get().n;
const tot = db.prepare(`SELECT COUNT(*) n FROM verses WHERE corpus='HEB'`).get().n;
console.log(`HEB rows: ${tot.toLocaleString()}   with NO chapter: ${bad.toLocaleString()}\n`);
if (!bad) { console.log('\u2713 every HEB row already has a chapter — nothing to do.'); db.close(); process.exit(0); }

// show what the rows actually look like, so the parse is based on data not assumption
const sample = db.prepare(
  `SELECT * FROM verses WHERE corpus='HEB' AND (chapter IS NULL OR chapter = 0) LIMIT 5`).all();
console.log('sample rows:');
for (const r of sample) {
  const shown = Object.entries(r)
    .filter(([k]) => k !== 'text')
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('  ');
  console.log('   ' + shown);
  console.log('      text: ' + String(r.text || '').slice(0, 45));
}

// ── TWO independent sources for chapter/verse; use both and CROSS-CHECK. ─────
// The dump shows ord_c=1, ord_v=1 already sitting on the row as integers, AND
// ref_key="Matt.1.1". Rather than trust either, parse the ref_key and require it to
// agree with ord_c/ord_v. Any row where they disagree is reported and left alone —
// a silent mismatch here would misplace a verse, which is exactly the class of bug
// that produced the Psalms off-by-one.
const parseRef = v => {
  const m = String(v ?? '').match(/(\d+)[.:_-](\d+)\s*$/);
  return m ? { chapter: +m[1], verse: +m[2] } : null;
};

// book_id and code are NULL on these rows too. Recover them from a sibling corpus
// that already has the same canon_id — read from the database, not assumed.
const sibling = new Map();
for (const r of db.prepare(
  `SELECT canon_id, book_id, code FROM verses
    WHERE corpus <> 'HEB' AND book_id IS NOT NULL AND canon_id IS NOT NULL
    GROUP BY canon_id`).all()) sibling.set(r.canon_id, { book_id: r.book_id, code: r.code });
console.log(`\nbook_id/code recoverable for ${sibling.size} canon_ids from sibling corpora`);

const rows = db.prepare(
  `SELECT rowid AS _rid, ref_key, ord_c, ord_v, canon_id, book_id, code
     FROM verses WHERE corpus='HEB' AND (chapter IS NULL OR chapter = 0)`).all();

const plan = [];
const disagree = [], unparsed = [];
for (const r of rows) {
  const ref = parseRef(r.ref_key);
  const ord = (r.ord_c != null && r.ord_v != null) ? { chapter: r.ord_c, verse: r.ord_v } : null;
  if (!ref && !ord) { unparsed.push(r.ref_key); continue; }
  if (ref && ord && (ref.chapter !== ord.chapter || ref.verse !== ord.verse)) {
    disagree.push(`${r.ref_key}  ref=${ref.chapter}:${ref.verse}  ord=${ord.chapter}:${ord.verse}`);
    continue;                                   // never guess between two answers
  }
  const cv = ref || ord;
  const sib = sibling.get(r.canon_id) || {};
  plan.push({ rid: r._rid, ...cv,
              book_id: r.book_id ?? sib.book_id ?? null,
              code: r.code ?? sib.code ?? null });
}

console.log(`\nrows to fix        : ${rows.length.toLocaleString()}`);
console.log(`  ref_key and ord_* AGREE : ${plan.length.toLocaleString()}`);
console.log(`  they DISAGREE (skipped) : ${disagree.length.toLocaleString()}`);
console.log(`  neither parses (skipped): ${unparsed.length.toLocaleString()}`);
for (const d of disagree.slice(0, 8)) console.log('   ! ' + d);
for (const u of unparsed.slice(0, 8)) console.log('   ? ' + u);
const withBook = plan.filter(p => p.book_id != null).length;
console.log(`  book_id also recoverable: ${withBook.toLocaleString()} of ${plan.length.toLocaleString()}`);

if (!APPLY) { console.log('\n[report only] nothing written. Re-run with --apply.'); db.close(); process.exit(0); }

const upd = db.prepare(`UPDATE verses
    SET chapter = ?, verse = ?,
        book_id = COALESCE(book_id, ?),
        code    = COALESCE(code, ?)
  WHERE rowid = ?`);
let n = 0;
db.transaction(() => { for (const p of plan) n += upd.run(p.chapter, p.verse, p.book_id, p.code, p.rid).changes; })();
console.log(`\n\u2713 backfilled ${n.toLocaleString()} HEB rows (chapter, verse, book_id, code)`);

const left = db.prepare(
  `SELECT COUNT(*) n FROM verses WHERE corpus='HEB' AND (chapter IS NULL OR chapter = 0)`).get().n;
console.log(`postcondition — HEB rows still without a chapter: ${left}`);
if (left) console.log('  (these are the unparsed ones above — inspect them, nothing was guessed)');
console.log('\nRe-run: node audit-corpus.mjs --book 40   — HEB should now report 28 chapters.');
db.close();
