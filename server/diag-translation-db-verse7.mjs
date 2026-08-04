import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tdb = new Database(path.join(__dirname, 'translation.db'), { readonly: true });
// need book_id for Matthew — check via corpus.db
const cdb = new Database(path.join(__dirname, 'corpus.db'), { readonly: true });
const bookId = cdb.prepare(`SELECT DISTINCT book_id FROM verses WHERE code='MAT' LIMIT 1`).get().book_id;
console.log('Matthew book_id:', bookId);
const rows = tdb.prepare(`
    SELECT book_id, chapter, verse, status, text, original_text, source_origin
    FROM translations WHERE book_id=? AND chapter=1 AND verse IN (6,7)
`).all(bookId);
for (const r of rows) {
    console.log(`\nMAT 1:${r.verse}  status=${r.status}  source_origin=${r.source_origin}`);
    console.log(`  text          : ${r.text}`);
    console.log(`  original_text : ${r.original_text}`);
    console.log(`  text === original_text: ${r.text === r.original_text}`);
}
