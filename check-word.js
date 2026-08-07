const Database = require('better-sqlite3');
const db = new Database('server/surface-index.db', { readonly: true });
const row = db.prepare(
  "SELECT word_raw, strongs, rendered_paleo, root_paleo, tier FROM token_surfaces WHERE source='HEB' AND word_raw=?"
).get('𐤁𐤍𐤀𐤋');
console.log(row);
