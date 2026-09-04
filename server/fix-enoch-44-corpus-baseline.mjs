import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const dbPath = process.argv[2] || join(HERE, 'corpus.db');
if (!existsSync(dbPath)) {
  console.error(`corpus.db not found at ${dbPath}`);
  process.exit(1);
}

const { default: Database } = await import('better-sqlite3');

const CANON_ID = 67;
const BOOK_ID  = 6126;
const CODE     = '1_ENOCH';
const CHAPTER  = 44;
const VERSE    = 1;

const TEXT_SRC =
  'Also another phenomenon I saw in regard to the lightnings: how some of the stars arise and become lightnings and cannot part with their new form.';

const TEXT =
  'Also another phenomenon I mashawar (saw) in regard to the lightnings: how some of the kawakab (stars) qawam (arise) and hawaa (become) lightnings and cannot nathachay (part) with their thayarawash (new) form.';

const db = new Database(dbPath);
db.pragma('journal_mode=WAL');

const existing = db.prepare(
  `SELECT * FROM verses WHERE corpus='ENG' AND canon_id=? AND ord_c=? AND ord_v=?`
).get(CANON_ID, CHAPTER, VERSE);
console.log('Before:', existing ?? '(no row)');

if (existing) {
  console.log('Row already present — nothing to do.');
} else {
  const insert = db.prepare(`
    INSERT INTO verses (ref_key, book_id, corpus, code, chapter, verse, ord_c, ord_v, text, category, src, conf, canon_id, text_paleo, text_src)
    VALUES (NULL, ?, 'ENG', ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, ?)
  `);
  const info = insert.run(BOOK_ID, CODE, String(CHAPTER), String(VERSE), CHAPTER, VERSE, TEXT, CANON_ID, TEXT_SRC);
  console.log('Inserted rowid:', info.lastInsertRowid);
}

const after = db.prepare(
  `SELECT * FROM verses WHERE corpus='ENG' AND canon_id=? AND ord_c=? AND ord_v=?`
).get(CANON_ID, CHAPTER, VERSE);
console.log('After:', after);

db.close();
