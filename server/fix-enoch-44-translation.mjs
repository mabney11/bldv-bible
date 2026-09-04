// fix-enoch-44-translation.mjs — one-off, idempotent insert of the missing
// 1 Enoch 44:1 ENG translation row into translation.db.
//
// This chapter had NO English rendering anywhere in the pipeline (only raw
// Ge'ez source in corpus.db) — a genuine gap discovered while seeding the
// headings feature (see seed-headings-batch3.mjs's header comment). Mirrors
// reseed-translations.mjs's own INSERT ... ON CONFLICT DO UPDATE pattern so
// this is safe to re-run and consistent with how every other Apocrypha row
// in this table was produced, and guarded so it never overwrites a real
// admin edit (WHERE status='none').
//
//   cd server && node fix-enoch-44-translation.mjs
//
// Optionally pass an explicit path to translation.db as the first argument
// (defaults to the copy co-located with this script, which is what you want
// both locally and inside the Docker image, where entrypoint.sh has already
// symlinked /data/translation.db into server/translation.db).

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const dbPath = process.argv[2] || join(HERE, 'translation.db');
if (!existsSync(dbPath)) {
  console.error(`translation.db not found at ${dbPath}`);
  console.error('Usage: node fix-enoch-44-translation.mjs [path-to-translation.db]');
  process.exit(1);
}

const { default: Database } = await import('better-sqlite3');

const BOOK_ID = 67;   // canon_id for 1 Enoch
const CHAPTER = 44;
const VERSE = 1;

const ORIGINAL_TEXT =
  'Also another phenomenon I saw in regard to the lightnings: how some of the stars arise and become lightnings and cannot part with their new form.';

// Styled per this corpus's established "Novel English" convention — every
// transliteration below (mashawar=saw, kawakab=stars, qawam=arise, hawaa=become,
// nathachay=part, thayarawash=new) was verified against real, existing usage
// elsewhere in this corpus via the actual render-corpus.mjs pipeline run on a
// scratch copy, not guessed. "Also" is deliberately left unrendered: word-map.json
// has a stray "also"->"Maikah" entry (Maikah is really the transliteration of the
// name Maacah; this is a pre-existing false-positive in that map, not something to
// propagate into a hand-verified verse) and "lightning(s)" is deliberately left
// unrendered because the OT itself renders it two different ways (baraq / lapayad)
// depending on the underlying Hebrew word, so it was correctly never added to the
// single-spelling term map.
const TEXT =
  'Also another phenomenon I mashawar (saw) in regard to the lightnings: how some of the kawakab (stars) qawam (arise) and hawaa (become) lightnings and cannot nathachay (part) with their thayarawash (new) form.';

const db = new Database(dbPath);
db.pragma('journal_mode=WAL');

const before = db.prepare(
  'SELECT * FROM translations WHERE book_id=? AND chapter=? AND verse=?'
).get(BOOK_ID, CHAPTER, VERSE);
console.log('Before:', before ?? '(no row)');

const insert = db.prepare(`
  INSERT INTO translations (book_id, chapter, verse, status, text, source_origin, original_text)
  VALUES (?, ?, ?, 'none', ?, 'corpus-reseed', ?)
  ON CONFLICT(book_id, chapter, verse) DO UPDATE SET
    text = excluded.text,
    original_text = excluded.original_text,
    source_origin = COALESCE(translations.source_origin, excluded.source_origin),
    updated_at = datetime('now')
  WHERE translations.status = 'none'
`);

const info = insert.run(BOOK_ID, CHAPTER, VERSE, TEXT, ORIGINAL_TEXT);
console.log('Rows changed:', info.changes);

const after = db.prepare(
  'SELECT * FROM translations WHERE book_id=? AND chapter=? AND verse=?'
).get(BOOK_ID, CHAPTER, VERSE);
console.log('After:', after);

db.close();
