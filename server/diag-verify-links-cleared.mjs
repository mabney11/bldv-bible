import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tdb = new Database(path.join(__dirname, 'translation.db'), { readonly: true });
const rows = tdb.prepare(`SELECT rowid, book_id, chapter, verse, english_indices, token_ordinals FROM translation_links WHERE book_id=40 AND chapter=1 AND verse=6`).all();
console.log(`rows remaining for Matthew 1:6: ${rows.length}`);
for (const r of rows) console.log(r);
