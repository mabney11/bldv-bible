import { readFileSync, existsSync } from 'node:fs';
let Database; ({ default: Database } = await import('better-sqlite3'));
const db = new Database('./corpus.db', { readonly: true });
// Is H3063 (Judah) tagged nmpr/adjv anywhere in tokens_bhs?
for (const sn of ['3063','1144','3130','3389']) {  // Judah, Benjamin, Joseph, Jerusalem
  const rows = db.prepare("SELECT DISTINCT pos FROM tokens_bhs WHERE ('H'||REPLACE(strongs,'H',''))=?").all('H'+sn);
  console.log(`  H${sn}: pos tags = ${rows.map(r=>r.pos).join(', ') || '(none — not in tokens_bhs)'}`);
}
db.close();
