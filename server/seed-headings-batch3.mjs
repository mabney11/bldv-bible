// seed-headings-batch3.mjs — Deuterocanon + the rest of Josephus.
//
// Continuing the corpus-wide headings rollout (see server.js's `headings`
// table comment for the Part/Section/Chapter title/Pericope scheme).
// Prior coverage: seed-headings-pilot.mjs (Genesis, Isaiah, Matthew,
// Josephus's Antiquities) and seed-headings-batch2.mjs (the rest of the
// canonical Old + New Testament). This batch covers all 15
// Deuterocanon/Josephus-remainder books:
//   1 Enoch, Jubilees, 1 & 2 Maccabees, Sirach, Wisdom of Solomon,
//   Tobit, Judith, 1 Baruch, Susanna, Bel and the Dragon, 1 Esdras,
//   and Josephus's Life, Against Apion, and The Jewish War.
//
//   cd server && node seed-headings-batch3.mjs
//
// Idempotent: deletes any existing headings for these 15 book_ids first,
// then inserts this file's data fresh. Creates the `headings` table itself
// if needed, so run order relative to the other seed scripts doesn't matter.
// Restart the server (if it isn't already running a version since the
// headings migration shipped) to see this in the Reader/Studio.
//
// Content notes (kept for future reference):
// - 1 Enoch is stored as 108 chapters in this corpus. Chapter 44 has no
//   translated English text yet in translation.db (a real gap in this
//   corpus's translation pipeline, not a headings issue) but the source
//   text exists, so it still gets a heading, ready for whenever it's
//   translated. Every chapter's content was read from the actual corpus
//   text (not recalled from memory) given how easy 1 Enoch/Jubilees are to
//   misremember chapter-by-chapter; unmapped terms (Watchers, Azazel,
//   Nephilim, Leviathan, Behemoth, Mastema, Belial, etc.) are left in plain
//   English, matching how the corpus's own prose renders them.
// - Maccabees/Sirach/Wisdom: the corpus's own translated text was found to
//   leave many Hellenistic-era AND some biblical names in plain English
//   even where a map entry technically exists (Judas/Jonathan/Simon never
//   render as their Hebrew-derived forms in these books) -- headings follow
//   the corpus's actual usage rather than the static map, per the same
//   precedent set in batch2 (Hazor). "Idumea" -> "Adam" in the single-word
//   map looks like a data bug and was left plain, flagged like the pilot's
//   own Bethel note.
// - Tobit/Judith/Baruch/Susanna/Bel/1 Esdras: these Greek/LXX-sourced texts
//   often keep Greek-form names distinct from the Hebrew-canon spelling of
//   the "same" person (Nabuchodonosor, Zorobabel, Esdras, Aggeus, Zacharias
//   rather than the OT-canon transliterations) -- titles follow what the
//   book's own text actually uses. Susanna/Bel's "Daniel" was transliterated
//   to "Dan" for consistency with the existing Daniel headings, even though
//   this corpus's own Susanna/Bel prose mostly prints "Daniel" untouched --
//   a judgment call, flagged for review. Tobit's heroine is "Sara" in-corpus
//   (no h), distinct from the mapped "Sarah" (Abraham's wife).
// - Josephus's Life, Against Apion, and The Jewish War: matched the
//   Antiquities pilot's own choice to leave Roman-era names in plain
//   English throughout (Vespasian, Titus, Agrippa, John of Gischala, Simon
//   bar Giora, etc.), even where a couple of shared place-names (Jerusalem,
//   Galilee, Jordan) do have map entries -- consistency with the existing
//   Antiquities headings won out. Section/pericope verse anchors for War
//   were extracted from Whiston's own embedded chapter-header text (present
//   as literal opening words of many verses in this corpus's source) rather
//   than guessed, so they land on the corpus's real verse numbers. War got
//   generous pericope coverage (104 rows) given how historically rich and
//   well-known its episodes are (Jotapata, the Temple's burning, Masada).
//
// See seed-headings-batch3-data.json for the actual heading content, keyed
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

const dataPath = join(HERE, 'seed-headings-batch3-data.json');
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
