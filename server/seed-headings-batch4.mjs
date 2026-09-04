// seed-headings-batch4.mjs — the first wave of Pseudepigrapha headings.
//
// Continuing the corpus-wide headings rollout (see server.js's `headings`
// table comment for the Part/Section/Chapter title/Pericope scheme). Prior
// coverage: seed-headings-pilot.mjs (Genesis, Isaiah, Matthew, Antiquities),
// seed-headings-batch2.mjs (rest of the canonical OT+NT), seed-headings-
// batch3.mjs (Deuterocanon + rest of Josephus). This batch covers 45
// Pseudepigrapha books:
//   - The Testaments of the Twelve Patriarchs (Reuben..Benjamin)
//   - Testament of Abraham/Isaac/Jacob/Job/Solomon, Testament of Kohath
//   - A cluster of short/fragmentary DSS-and-similar texts (Prayer of
//     Manasseh, 4 Baruch, Apocalypse of Sedrach, Jannes and Jambres, Book
//     of Giants, Genesis Apocryphon, Wisdom of Ahikar, Five Psalms of
//     David, Visions of Amram, Book of Nathan the Prophet, Balaam
//     Inscription, Prayer of Azariah) -- deliberately light-touch, per the
//     app owner's own preference: mostly chapter titles only, no forced
//     section/pericope structure on text too short/fragmentary to have it.
//   - The apocalyptic cluster (Apocalypse of Abraham, Ascension of Isaiah,
//     Apocalypse of Elijah, Apocalypse of Peter, Testament of Moses, Ladder
//     of Jacob, Lives of the Prophets, History of the Rechabites)
//   - A narrative batch (Psalms of Solomon, Joseph and Asenath, Gad the
//     Seer, Odes of Solomon, Songs of the Sabbath Sacrifice, Apocryphon of
//     Joshua, Additions to Esther)
//
//   cd server && node seed-headings-batch4.mjs
//
// Idempotent: deletes any existing headings for these 45 book_ids first,
// then inserts this file's data fresh. Creates the `headings` table itself
// if needed.
//
// Content notes (kept for future reference):
// - Every chapter of every book in this batch was read from the corpus's
//   actual translated text before writing its heading (not recalled from
//   memory) -- this material is obscure enough that background knowledge
//   alone is unreliable. A few books have genuine gaps or non-sequential
//   chapter numbering in this corpus, confirmed against corpus.db directly
//   rather than assumed to be errors: Lives of the Prophets is numbered
//   0-23 (not 1-24); Odes of Solomon has no surviving Ode 2 (no manuscript
//   preserves it); Apocryphon of Joshua has no chapter 2; Gad the Seer
//   jumps from chapter 14 straight to a single-verse chapter 23; Additions
//   to Esther is numbered 10-16 (the LXX/Vulgate's own continuation
//   numbering after Esther's Hebrew chapters, not 1-7).
// - Several genuinely fragmentary/damaged texts (Book of Giants, Genesis
//   Apocryphon, Balaam Inscription, Visions of Amram, Apocalypse of
//   Sedrach) got titles that say so honestly rather than inventing
//   coherence the source text doesn't have.
// - As in earlier batches, headings follow each book's own actual
//   transliteration usage in the corpus's translated text where it
//   diverges from the static name-map (e.g. several books keep "David",
//   "Israel", "Joseph", "Jesus", "Mary" in plain English even where a map
//   entry exists) -- and a couple of map-vs-corpus mismatches were caught
//   and worked around (History of the Rechabites 7:2's "Jonadab" one-off
//   mistransliteration; Prayer of Azariah's own consistent "Azarias").
//
// See seed-headings-batch4-data.json for the actual heading content, keyed
// by canon_id (string) -> array of { level, chapter, verse?, title } rows.
// level: 1=Part 2=Section 3=Chapter title 4=Pericope.

import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(HERE, 'translation.db'));
db.pragma('journal_mode = WAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS headings (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id     INTEGER NOT NULL,
        level       INTEGER NOT NULL,
        chapter     INTEGER NOT NULL,
        verse       INTEGER NOT NULL DEFAULT 1,
        end_chapter INTEGER,
        end_verse   INTEGER,
        title       TEXT    NOT NULL DEFAULT '',
        subtitle    TEXT    NOT NULL DEFAULT '',
        sort_order  INTEGER NOT NULL DEFAULT 0,
        updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_headings_book ON headings(book_id, chapter, verse, level);
`);

const dataPath = join(HERE, 'seed-headings-batch4-data.json');
const BATCH = JSON.parse(readFileSync(dataPath, 'utf8'));

const del = db.prepare(`DELETE FROM headings WHERE book_id = ?`);
const ins = db.prepare(`
    INSERT INTO headings(book_id, level, chapter, verse, title)
    VALUES (?, ?, ?, ?, ?)
`);

const run = db.transaction(() => {
  let total = 0;
  for (const [bookId, rows] of Object.entries(BATCH)) {
    del.run(+bookId);
    for (const r of rows) {
      ins.run(+bookId, r.level, r.chapter, r.verse ?? 1, r.title);
      total++;
    }
    console.log(`[headings] book ${bookId}: ${rows.length} rows`);
  }
  return total;
});

const total = run();
console.log(`[headings] seeded ${total} headings total across ${Object.keys(BATCH).length} books.`);
