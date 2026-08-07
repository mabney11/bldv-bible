const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, 'corpus.db'), { readonly: true });

// Looking for any token whose surface CONTAINS Ben (𐤁𐤍) immediately followed,
// anywhere later in the same word, by Elohim/Alahayam's letters (𐤀𐤋𐤄𐤉𐤌) —
// with or without the article 𐤄 fused in between. Checking both tokens_nt
// (the custom NT) and tokens_bhs (the real OT) so we know whether this is an
// NT-only theological coinage or something the OT source itself also does.
const pattern = /^𐤁𐤍.*𐤀𐤋𐤄𐤉𐤌.*$/u;

for (const [label, table, cols] of [
  ['tokens_nt', 'tokens_nt', 'book_id, chapter, verse, token_ordinal, word_raw, pos, strongs'],
  ['tokens_bhs', 'tokens_bhs', 'book_id, chapter, verse, token_ordinal, word_raw, pos, strongs'],
]) {
  // Not anchored to the start — catches a prefixed variant too (e.g. a
  // conjunction Waw fused on front: "WaBanahaalahayam").
  const rows = db.prepare(`SELECT ${cols} FROM ${table} WHERE word_raw LIKE '%𐤁𐤍%𐤀𐤋𐤄𐤉𐤌%'`).all();
  console.log(`\n${label}: ${rows.length} match(es)`);
  for (const r of rows) {
    console.log(`  book_id=${r.book_id} ${r.chapter}:${r.verse} ordinal=${r.token_ordinal}  word_raw=${r.word_raw}  pos=${r.pos}  strongs=${r.strongs}`);
  }
}
