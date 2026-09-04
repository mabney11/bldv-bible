// seed-headings-batch5.mjs — the final wave. This completes the headings
// rollout across the ENTIRE corpus.
//
// Continuing from seed-headings-pilot.mjs (Genesis, Isaiah, Matthew,
// Antiquities), seed-headings-batch2.mjs (rest of the canonical OT+NT),
// seed-headings-batch3.mjs (Deuterocanon + rest of Josephus), and
// seed-headings-batch4.mjs (Pseudepigrapha wave 1). This batch covers the
// remaining 25 books:
//   - Book of Jasher (91 ch, full Part/Section/Pericope treatment given its
//     scale and popularity)
//   - 1 & 2 Adam and Eve
//   - 2 Enoch, 3 Baruch, 2 Baruch, 2 Esdras (the major apocalypses)
//   - Gospel of Nicodemus, Epistle of Barnabas, I/II/III Hermas (Shepherd
//     of Hermas), Book of Melchizedek
//   - Nag Hammadi: Gospel of Thomas, Gospel of Philip, Secret Book of
//     John, Melchizedek (NHC) -- each stored as 1 long chapter, given
//     internal section/pericope structure the same way Josephus's Life
//     was handled in batch3
//   - Pistis Sophia I-IV (148 chapters total -- the single largest book in
//     this rollout)
//   - Acts of Paul and Thecla, Third Corinthians, Gospel of Peter, Acts of
//     Barnabas
//
//   cd server && node seed-headings-batch5.mjs
//
// Idempotent: deletes any existing headings for these 25 book_ids first
// (this supersedes Book of Melchizedek's 3 old legacy headings from the
// original book-sections.json-era migration), then inserts this file's
// data fresh. Creates the `headings` table itself if needed.
//
// Content notes (kept for future reference):
// - As with every prior batch, every chapter of every book here was read
//   from the corpus's actual translated text before writing its heading --
//   this material (especially Pistis Sophia, the Nag Hammadi texts, 2
//   Enoch/2-3 Baruch) is obscure enough that background knowledge alone
//   would have produced wrong or invented content.
// - A few real corpus quirks surfaced and were worked around rather than
//   "corrected": 2 Enoch's chapters 69-73 (the Melchizedek/Nir appendix)
//   have no English gloss yet in translation.db and were titled from the
//   Hebrew/source text in corpus.db instead. 2 Baruch chapters 34 and 37
//   don't start at verse 1 in this corpus (verses 4 and 12 respectively)
//   -- their heading anchors reflect the real first verse. 3 Baruch and
//   II Hermas are numbered starting at chapter 0, not 1 -- preserved as-is.
//   Book of Melchizedek chapter 31 has a real ingestion duplication bug
//   (a block of text repeated 2-3 times with a stray embedded "Chapter VI"
//   heading) -- flagged here for awareness, doesn't affect this heading.
// - Jasher got the fullest treatment of this whole rollout outside the
//   original pilot (7 sections, 40 pericopes across 91 chapters) given how
//   much unique non-biblical material it has and its popularity among
//   readers of this kind of corpus.
// - The single-chapter Nag Hammadi texts and Pistis Sophia's chapters
//   often carry the original editor's own inline topic-labels in the
//   translated verse text (e.g. Gospel of Philip's "The Virgin Birth" at
//   v15, Secret Book of John's "The Providence Hymn" at v257, Pistis
//   Sophia's synopsis lines) -- these were used directly as section
//   anchors where present, rather than invented from scratch.
// - As always, headings follow each book's own actual name usage where it
//   diverges from the static map (e.g. Jasher uses "Isaac"/"Joshua" almost
//   exclusively over their mapped transliterations; 1&2 Adam and Eve keep
//   "Abel," "Noah," and several angel names plain).
//
// See seed-headings-batch5-data.json for the actual heading content, keyed
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

const dataPath = join(HERE, 'seed-headings-batch5-data.json');
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
console.log(`\n[headings] This completes the corpus-wide headings rollout.`);
