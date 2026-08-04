// reseed-translations.mjs — seed translation.db with clean non-OT English from corpus.db.
//
// BUG FOUND 2026-07-27 (the one that made EVERY reading-text fix today look like
// it "didn't work" no matter how many times the pipeline was rerun): this file's
// header used to claim "Uses book_id (not canon_id) which is what translation.db
// actually has" and read corpus.db's OWN internal `verses.book_id` column to key
// every insert/update. That claim is wrong. Proven empirically: corpus.db's
// internal book_id for Matthew is 138 (an incidental insertion-order id — NT/
// Apocrypha books were added to corpus.db over time, so their book_id has no
// relationship to canon order), but translation.db's `translations.book_id`
// column for the SAME rows is 40 (canon_id — confirmed by querying rows
// containing known text directly). The OT (1-39) happened to look fine because
// corpus.db's book_id and canon_id coincide there by pure luck (Genesis..Malachi
// were inserted in canon order) — this bug is invisible on the OT and only bites
// the non-OT corpus reseed does. Every run wrote fresh corpus.db text into NEW
// orphan rows keyed book_id=138 (etc.) that no endpoint ever reads, while the
// REAL rows the API serves (book_id=40, i.e. canon_id) sat frozen at whatever
// content they held from the last time they were correctly seeded — so a correct
// code fix, a correct corpus.db `text` rewrite, and a "seeded/refreshed N rows"
// success message could all be true at once while the reader kept showing old
// text, because reseed was refreshing rows nobody was looking at. Fixed by
// reading corpus.db's `canon_id` column instead of `book_id` throughout — that's
// what actually matches translation.db's key.
//
//   node reseed-translations.mjs

import { existsSync } from 'node:fs';
const die = m => { console.error('\u2717 '+m); process.exit(1); };
let Database; try{({default:Database}=await import('better-sqlite3'));}catch{die('run from server/');}
for(const f of['./corpus.db','./translation.db']) if(!existsSync(f)) die(f+' not found');

const src = new Database('./corpus.db', { readonly: true });
const tdb = new Database('./translation.db');
tdb.pragma('journal_mode=WAL');

// Find canon_ids for non-OT ENG books. MUST use canon_id, not verses.book_id/
// books.book_id — those are a per-corpus-ingest surrogate key that is DIFFERENT
// for every corpus/edition of the same book (Matthew: GNT/HEB book_id=138,
// ENG book_id=6097, LAT=1921, ...) while canon_id is the one stable, universal
// identifier (Matthew=40 always) that translation.db's own `book_id` column
// actually stores. See CLAUDE.md's "book_id means two different things" section.
const otBooks = src.prepare(
  `SELECT DISTINCT canon_id FROM verses WHERE corpus='ENG' AND canon_id <= 39`).all().map(r=>r.canon_id);
const nonOtBooks = src.prepare(
  `SELECT DISTINCT canon_id FROM verses WHERE corpus='ENG' AND canon_id > 39`).all().map(r=>r.canon_id);
console.log(`OT canon_ids: ${otBooks.length}, non-OT canon_ids: ${nonOtBooks.length}`);

// Get all non-OT ENG verses, keyed by canon_id (aliased to book_id here only
// because that's translation.db's column name — the VALUE is canon_id).
const rows = src.prepare(
  `SELECT canon_id AS book_id, chapter, verse, text FROM verses
   WHERE corpus='ENG' AND canon_id > 39 AND text IS NOT NULL AND TRIM(text)<>''`).all();
src.close();
console.log(`non-OT ENG verses in corpus.db: ${rows.length.toLocaleString()}`);

if (!rows.length) { console.log('\u2717 No non-OT verses found in corpus.db — run reingest-apocrypha.mjs first'); tdb.close(); process.exit(1); }

// Clear apocrypha rows by canon_id range (> 66), leaving OT 1-39 and NT 40-66 intact.
const n_del = tdb.prepare('DELETE FROM translations WHERE book_id > 66').run().changes;
console.log(`Cleared ${n_del} stale apocrypha rows (canon_id > 66)`);

// BUG FOUND 2026-07-27 (same class as the OT translation.db freeze fixed the
// same day in load-english-baseline.js, but worse here): this used to be a
// single `INSERT OR REPLACE INTO translations (book_id,chapter,verse,status,
// text,original_text) VALUES (?,?,?,'none',?,?)`. SQLite's OR REPLACE deletes
// the conflicting row and reinserts ONLY the named columns, so on every verse
// that already existed -- including every verse a human had EVER saved a
// Studio translation for, since book_id>39 covers all of NT+Apocrypha with
// no status/edit guard -- it silently discarded rich_text and source_origin
// (reverted to ''/NULL) and forced status back to 'none' even if it had been
// 'done' or 'in_progress', destroying the saved edit outright rather than
// just shadowing it. This ran unconditionally on every render-all.mjs
// rebuild. Fixed to mirror load-english-baseline.js's safe two-statement
// pattern: seed a NEW row (or touch only source_origin/original_text on an
// existing one), then separately refresh `text` ONLY on rows nobody has ever
// edited (status='none' AND text still equals its own original_text) -- a
// human's saved work can never be touched by either statement.
// translation.db uses (book_id, chapter, verse) as key, no id/corpus.
const importOriginal = tdb.prepare(`
  INSERT INTO translations (book_id, chapter, verse, status, text, source_origin, original_text)
  VALUES (?, ?, ?, 'none', ?, 'corpus-reseed', ?)
  ON CONFLICT(book_id, chapter, verse) DO UPDATE SET
    source_origin = COALESCE(translations.source_origin, excluded.source_origin),
    original_text = COALESCE(translations.original_text, excluded.original_text)
`);
const resetUntouched = tdb.prepare(`
  UPDATE translations SET text = ?, original_text = ?, updated_at = datetime('now')
  WHERE book_id = ? AND chapter = ? AND verse = ?
    AND status = 'none' AND (original_text IS NULL OR text = original_text)
`);
let n=0;
tdb.transaction(()=>{
  for(const r of rows) {
    importOriginal.run(r.book_id, r.chapter, r.verse, r.text, r.text);
    resetUntouched.run(r.text, r.text, r.book_id, r.chapter, r.verse);
    n++;
  }
})();
tdb.close();
console.log(`\u2713 seeded/refreshed ${n.toLocaleString()} non-OT rows into translation.db (saved edits left untouched)`);
console.log('Restart the server.');
