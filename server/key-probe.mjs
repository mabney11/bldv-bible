import Database from 'better-sqlite3';
const db = new Database('corpus.db', { readonly: true });
const p = (l, r) => { console.log('\n=== ' + l + ' ==='); r.length ? console.table(r) : console.log('(no rows)'); };

p('ENG rows by corpus', db.prepare("SELECT corpus, COUNT(*) n FROM verses GROUP BY corpus").all());

p('Find Genesis 1:1 by text (all keys)', db.prepare(
  "SELECT id, book_id, corpus, code, chapter, verse, ord_c, ord_v, canon_id, substr(text,1,45) t \
   FROM verses WHERE corpus='ENG' AND text LIKE 'In the beginning%' LIMIT 5").all());

p('Sample OT-range ENG rows (canon 1-5) how are they keyed?', db.prepare(
  "SELECT canon_id, code, chapter, verse, ord_c, ord_v, substr(text,1,35) t \
   FROM verses WHERE corpus='ENG' AND canon_id BETWEEN 1 AND 5 LIMIT 5").all());

p('Distinct codes present for ENG (first 25)', db.prepare(
  "SELECT DISTINCT code FROM verses WHERE corpus='ENG' AND code IS NOT NULL LIMIT 25").all());
db.close();
