import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, 'corpus.db'), { readonly: true });
console.log('books table columns:', db.prepare(`PRAGMA table_info(books)`).all().map(c => c.name).join(', '));
console.log(db.prepare(`SELECT * FROM books WHERE corpus='ENG'`).all().find(r => r.code === 'MAT' || r.book_id === 138));
