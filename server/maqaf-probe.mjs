import Database from 'better-sqlite3';
const db = new Database('corpus.db', { readonly: true });
const psa = db.prepare("SELECT DISTINCT canon_id FROM verses WHERE code='PSA' LIMIT 1").get();
const bid = psa ? psa.canon_id : 19;
console.log('Psalms book_id =', bid, '· Psalm 110:4 tokens:');
for (const r of db.prepare(
    "SELECT token_ordinal o, word_raw w, pos, strongs, morph FROM tokens_bhs WHERE book_id=? AND chapter=110 AND verse=4 ORDER BY token_ordinal").all(bid)) {
  const cps = [...(r.w || '')].map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')).join(' ');
  console.log(`t${r.o} [${r.pos}] ${r.strongs || ''}  "${r.w}"  ${cps}`);
}
const n = db.prepare("SELECT COUNT(*) n FROM tokens_bhs WHERE word_raw LIKE '%'||char(1470)||'%'").get().n;
console.log(`\nword_raw values containing a maqaf (U+05BE): ${n.toLocaleString()}`);
db.close();
