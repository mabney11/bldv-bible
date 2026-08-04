// check-jasher.mjs — find Jasher ENG rows and show their canon_id, to see why
// apply-word-map (canon_id >= 40) isn't reaching them.
let Database; ({ default: Database } = await import('better-sqlite3'));
const db = new Database('./corpus.db', { readonly: true });
// find Jasher by code
const rows = db.prepare(`SELECT code, corpus, canon_id, chapter, verse, text FROM verses
  WHERE UPPER(code) LIKE '%YASHAR%' AND corpus='ENG' LIMIT 5`).all();
console.log('Jasher by code LIKE YASHAR:', rows.length, 'rows');
for (const r of rows) console.log(` canon_id=${r.canon_id} ch=${r.chapter} v=${r.verse}: ${(r.text||'').slice(0,60)}`);
// also try by book title match
const byName = db.prepare(`SELECT DISTINCT code, corpus, canon_id, COUNT(*) n FROM verses
  WHERE corpus='ENG' AND code LIKE '%JASHER%' OR code LIKE '%yashar%' GROUP BY code, corpus, canon_id LIMIT 5`).all();
console.log('\nJasher by code LIKE JASHER:', byName);
// how many ENG rows have NULL canon_id?
const nullCid = db.prepare(`SELECT COUNT(*) n FROM verses WHERE corpus='ENG' AND canon_id IS NULL`).get();
console.log('\nENG rows with NULL canon_id:', nullCid.n);
// show which codes have null canon_id
const nullCodes = db.prepare(`SELECT DISTINCT code, COUNT(*) n FROM verses WHERE corpus='ENG' AND canon_id IS NULL GROUP BY code LIMIT 10`).all();
for (const r of nullCodes) console.log(' ', r.code, r.n);
db.close();
