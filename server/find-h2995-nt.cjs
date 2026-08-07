const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, 'corpus.db'), { readonly: true });

// tokens_nt is the NT/HEB source. Any H2995 here is the "Son" reuse, never
// the OT place-name Yabneel (that only ever occurs in Joshua's tokens_bhs).
const rows = db.prepare(`
  SELECT book_id, chapter, verse, token_ordinal, word_raw, pos
  FROM tokens_nt
  WHERE strongs LIKE '%2995%'
  ORDER BY book_id, chapter, verse, token_ordinal
`).all();

console.log(`${rows.length} NT occurrence(s) of H2995:\n`);
for (const r of rows) {
  console.log(`book_id=${r.book_id} ${r.chapter}:${r.verse} ordinal=${r.token_ordinal}  word_raw=${r.word_raw}  pos=${r.pos}`);
}
