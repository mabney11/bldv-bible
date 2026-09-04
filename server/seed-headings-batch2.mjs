// seed-headings-batch2.mjs — corpus-wide rollout of the headings feature
// (Part/Section/Chapter title/Pericope — see server.js's `headings` table
// comment for the scheme) across the full canonical Old and New Testament,
// continuing on from the pilot (seed-headings-pilot.mjs did Genesis, Isaiah,
// Matthew, and Josephus's Antiquities).
//
// This batch covers all 63 remaining OT+NT books: Exodus-Deuteronomy,
// Joshua-Esther, Job/Psalms/Proverbs/Ecclesiastes/Song of Songs,
// Jeremiah-Malachi, Mark/Luke/John/Acts, and Romans-Revelation.
//
//   cd server && node seed-headings-batch2.mjs
//
// Idempotent: deletes any existing headings for these 63 book_ids first,
// then inserts this file's data fresh — safe to re-run after editing
// seed-headings-batch2-data.json to tweak wording. Creates the `headings`
// table itself if the server hasn't been restarted since the migration
// shipped, so run order doesn't matter. Restart the server (or nothing
// extra needed if it's already been restarted since the migration) to see
// this in the Reader/Studio.
//
// Content notes:
// - Person/place/God names use this corpus's own established
//   transliterations (name-map-expanded.json) wherever one exists, so
//   headings read consistently with the surrounding "Novel English" prose.
//   Each book group below was generated with every proper name individually
//   checked against name-map-expanded.json (and, where the map disagreed
//   with actual body-text usage in corpus.db, against the corpus itself).
// - A modest number of names have no entry anywhere in the map (mostly
//   minor figures, Greek/Roman-era geography, and a few gentilic plurals)
//   and are deliberately left in plain English rather than guessing a
//   spelling — same policy as the pilot's own "Bethel" and Antiquities notes.
//   See generation notes below, kept for future reference:
//     * Torah (Exod-Deut): Moses -> Mashah (not "Mawshah"), Ebal -> Iyabal.
//       Left plain: Og, Bezalel, "Amorites"/"Canaanites"/"Levites" (gentilic
//       plurals -- worked around via ancestor names where natural).
//     * Joshua-Esther: caught a name-map data bug -- "Hazor" resolves to
//       "Chatzawarachadathah" in the static single-word dict (an apparent
//       merge artifact); the corpus body actually renders it "Chatzawar",
//       which is what's used here. Left plain: Jabesh Gilead, Baal Perazim,
//       Adoni-zedek, Shunammite.
//     * Job-Song of Songs (Wisdom): see original pilot-era notes; Job's
//       cast (Ayawab, Alayapaz, Baladad, Tzawapar, Alayahaw) and Psalms'
//       "Book I-V" Part headers follow established forms.
//     * Jeremiah-Malachi: left plain: Meshach (Shadrach/Abednego are
//       mapped, Meshach isn't), Pashhur, Rechabites (gentilic plural of a
//       mapped name). "Bethel" again sidestepped per the pilot's flag.
//     * Mark/Luke/John/Acts: matched the Matthew pilot's exact established
//       forms (Yashawai, Yawachanan, Kayapaa, Marayam, etc.). ~45 names
//       left in plain English where no map entry exists for the NT surface
//       form even though a similar OT name does (Caiaphas, Nicodemus,
//       Zacchaeus, Cornelius, and most Greco-Roman geography -- Antioch,
//       Corinth, Ephesus, Athens, Philippi, Rome, etc.), matching the
//       pilot's own precedent of not inventing spellings.
//     * Romans-Revelation: Jesus -> Yashawai, Christ -> Mashayach (matching
//       the Matthew pilot). Left plain: Titus, Philemon, Onesimus, Silas,
//       Apollos, and all Greek place names (the map is Hebrew/OT-derived).
//
// See seed-headings-batch2-data.json for the actual heading content, keyed
// by canon_id (as a string) -> array of { level, chapter, verse?, title,
// subtitle? } rows. level: 1=Part 2=Section 3=Chapter title 4=Pericope.

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

const dataPath = join(HERE, 'seed-headings-batch2-data.json');
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
