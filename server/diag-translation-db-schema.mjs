import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tdb = new Database(path.join(__dirname, 'translation.db'), { readonly: true });

console.log('translations table columns:', tdb.prepare(`PRAGMA table_info(translations)`).all().map(c => c.name).join(', '));

// Find rows whose text mentions "abaya" or "Shalamah" near Matthew territory —
// sample distinct book_ids present and their chapter/verse ranges to spot Matthew.
const bookIds = tdb.prepare(`SELECT DISTINCT book_id FROM translations ORDER BY book_id LIMIT 20`).all();
console.log('\nfirst 20 distinct book_ids in translations:', bookIds.map(r => r.book_id).join(', '));

// Search directly for the known-bad text so we find the RIGHT book_id regardless of numbering.
const hit = tdb.prepare(`SELECT book_id, chapter, verse, status, text, original_text FROM translations WHERE text LIKE '%abaya (father)%' LIMIT 5`).all();
console.log(`\nrows containing "abaya (father)": ${hit.length}`);
for (const r of hit) console.log(`  book_id=${r.book_id} ${r.chapter}:${r.verse}  status=${r.status}\n    text=${r.text}\n    original_text=${r.original_text}`);
