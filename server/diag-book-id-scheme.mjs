import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, 'corpus.db'), { readonly: true });

console.log('=== verses.book_id for code=MAT, per corpus ===');
console.log(db.prepare(`SELECT DISTINCT corpus, book_id, canon_id FROM verses WHERE code='MAT'`).all());

console.log('\n=== books table rows for code=MAT ===');
console.log(db.prepare(`SELECT * FROM books WHERE code='MAT'`).all());

console.log('\n=== is verses.book_id unique per (corpus,code), or shared across corpora for MAT? ===');
console.log('(if each corpus row above has a DIFFERENT book_id, book_id is per-corpus-ingest, not a stable cross-corpus id)');

console.log('\n=== other tables that reference book_id vs canon_id (schema check) ===');
for (const t of ['tokens_bhs', 'tokens_nt', 'tokens', 'surface_occurrences']) {
    try {
        const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
        console.log(`${t}: ${cols.join(', ')}`);
    } catch { console.log(`${t}: (not in this db)`); }
}

console.log('\n=== does anything actually JOIN on books.book_id? grep-style check of a few known FK-ish columns ===');
console.log(db.prepare(`SELECT COUNT(*) n FROM books`).get());
console.log('sample books rows:', db.prepare(`SELECT book_id, corpus, code, title FROM books LIMIT 5`).all());
