// diagnose-sirach-gap.mjs — why are Sirach chapters 17,22,23,24,29,36 missing
// from the app, when they're present with full text in the Scrollmapper source?
//
// Run from server/:   node diagnose-sirach-gap.mjs
import Database from 'better-sqlite3';

const db = new Database('./corpus.db', { readonly: true });

console.log('=== verses table + index definitions ===');
console.log(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='verses'").get()?.sql);
for (const idx of db.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='verses'").all()) {
  console.log(idx.name, '::', idx.sql);
}

console.log('\n=== SIRACH rows in corpus.db, grouped by raw chapter ===');
const rows = db.prepare(`
  SELECT chapter, verse, ord_c, ord_v, canon_id
  FROM verses WHERE corpus='ENG' AND code='SIRACH'
`).all();
console.log('total SIRACH rows:', rows.length);

const byChapter = {};
for (const r of rows) (byChapter[r.chapter] ??= []).push(r);
const chapterKeys = Object.keys(byChapter).sort((a, b) => Number(a) - Number(b));
console.log('distinct raw chapter values:', chapterKeys);

for (const ch of chapterKeys) {
  const rs = byChapter[ch];
  const nullOrds = rs.filter(r => r.ord_c == null || r.ord_v == null).length;
  const ordCs = rs.map(r => r.ord_c).filter(v => v != null);
  const canonIds = [...new Set(rs.map(r => r.canon_id))];
  console.log(
    `chapter "${ch}": rows=${rs.length}  null_ord=${nullOrds}  ord_c_values=${[...new Set(ordCs)].join(',')}  canon_id(s)=${canonIds.join(',')}`
  );
}

console.log('\n=== full detail for target chapters (17,22,23,24,29,36) ===');
for (const ch of ['17', '22', '23', '24', '29', '36']) {
  console.log(`--- raw chapter "${ch}" ---`);
  console.log(byChapter[ch] ?? 'NO ROWS AT ALL for this raw chapter value');
}

console.log('\n=== translation.db: which chapters made it to the serving table for book_id=70 ===');
const tdb = new Database('./translation.db', { readonly: true });
console.log(db2sql(tdb));
function db2sql(d) {
  return d.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='translations'").get()?.sql;
}
const trows = tdb.prepare(`SELECT DISTINCT chapter FROM translations WHERE book_id=70`).all();
console.log('translation.db chapters present for book_id=70:', trows.map(r => r.chapter).sort((a, b) => Number(a) - Number(b)));

db.close();
tdb.close();
