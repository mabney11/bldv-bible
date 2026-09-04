// seed-headings-pilot.mjs — one-time pilot content for the new headings feature
// (Part/Section/Chapter title/Pericope — see server.js's `headings` table
// comment for the scheme). Run this once to review style/correctness before
// the same approach is run across the rest of the corpus.
//
//   cd server && node seed-headings-pilot.mjs
//
// Idempotent: deletes any existing headings for these 4 pilot books first,
// then inserts this file's content fresh — safe to re-run after editing this
// file to tweak wording. Creates the `headings` table itself if the server
// hasn't been restarted since the migration shipped, so run order doesn't
// matter. Restart the server (or nothing extra needed if it's already been
// restarted since the migration) to see this in the Reader/Studio.
//
// Content notes:
// - Person/place names use this corpus's own established transliterations
//   (name-map-expanded.json) wherever one exists — Isaiah -> Yashaiyah,
//   Judah -> Yahawadah, Tamar -> Thamar, etc. — so a heading reads
//   consistently with the surrounding "Novel English" prose it sits above.
//   A few names (Josephus's Antiquities, mostly Roman-era figures) have no
//   entry in the map and are left in plain English, same as the body text
//   currently renders them.
// - "Bethel" is deliberately left untransliterated in Genesis 28/35: the
//   single-word map entry for "Bethel" resolves to "Al" (a different,
//   apparently unrelated single-word entry from the correct compound
//   "Beth-El" -> "Bayathaal") — flagging this as a possible name-map data
//   gap rather than guessing which is intended.
// - Isaiah's Part/Section structure follows the standard scholarly division
//   (First Isaiah / Book of Comfort / Third Isaiah, with well-known
//   sub-sections like the Book of Immanuel and the oracles against the
//   nations) — reworded in this project's own voice, not copied from any
//   particular study Bible.
// - Only a handful of Pericope (verse-anchored) headings are seeded per book,
//   as a demonstration — not an attempt at exhaustive granular coverage.

import Database from 'better-sqlite3';
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

const PART = 1, SECTION = 2, CHAPTER = 3, PERICOPE = 4;

// ── Genesis (canon_id 1) ─────────────────────────────────────────────────────
const GENESIS = [
  { level: SECTION, chapter: 1,  title: 'The Primeval History' },
  { level: SECTION, chapter: 12, title: 'The Ancestors: Abaraham, Yatzachaq, and Yaiqab' },
  { level: SECTION, chapter: 37, title: "Yawasap in Matzarayam" },

  { level: CHAPTER, chapter: 1,  title: 'Creation of the Heavens and the Earth' },
  { level: CHAPTER, chapter: 2,  title: 'The Garden of Eden and the First Woman' },
  { level: CHAPTER, chapter: 3,  title: 'The Fall of Adam and Chawah' },
  { level: CHAPTER, chapter: 4,  title: 'Qayan and Habal; the Line of Qayan' },
  { level: CHAPTER, chapter: 5,  title: 'The Generations from Adam to Nach' },
  { level: CHAPTER, chapter: 6,  title: 'The Wickedness of Man; Nach Builds the Ark' },
  { level: CHAPTER, chapter: 7,  title: 'The Flood Begins' },
  { level: CHAPTER, chapter: 8,  title: "The Flood Recedes; Nach's Sacrifice" },
  { level: CHAPTER, chapter: 9,  title: "Yahawah's Covenant with Nach" },
  { level: CHAPTER, chapter: 10, title: 'The Table of Nations' },
  { level: CHAPTER, chapter: 11, title: 'The Tower of Babal; the Line to Abaram' },
  { level: CHAPTER, chapter: 12, title: 'The Call of Abaram' },
  { level: CHAPTER, chapter: 13, title: 'Abaram and Lawat Separate' },
  { level: CHAPTER, chapter: 14, title: 'The War of the Kings; Malakayatzadaq Blesses Abaram' },
  { level: CHAPTER, chapter: 15, title: "Yahawah's Covenant with Abaram" },
  { level: CHAPTER, chapter: 16, title: 'Hagar and the Birth of Yashamaial' },
  { level: CHAPTER, chapter: 17, title: "The Covenant of Circumcision; Abaraham's Name Changed" },
  { level: CHAPTER, chapter: 18, title: 'Three Visitors; the Intercession for Sadam' },
  { level: CHAPTER, chapter: 19, title: 'The Destruction of Sadam and Imarah' },
  { level: CHAPTER, chapter: 20, title: 'Abaraham and Abayamalak' },
  { level: CHAPTER, chapter: 21, title: 'The Birth of Yatzachaq; Hagar Sent Away' },
  { level: CHAPTER, chapter: 22, title: 'The Binding of Yatzachaq' },
  { level: CHAPTER, chapter: 23, title: 'The Death of Sarah' },
  { level: CHAPTER, chapter: 24, title: 'A Wife Found for Yatzachaq' },
  { level: CHAPTER, chapter: 25, title: 'The Death of Abaraham; Ishaw and Yaiqab' },
  { level: CHAPTER, chapter: 26, title: 'Yatzachaq Among the Palashath' },
  { level: CHAPTER, chapter: 27, title: 'Yaiqab Receives the Blessing' },
  { level: CHAPTER, chapter: 28, title: "Yaiqab's Vision at Bethel" },
  { level: CHAPTER, chapter: 29, title: 'Yaiqab Serves Laban; His Wives' },
  { level: CHAPTER, chapter: 30, title: 'The Children of Yaiqab; His Flocks' },
  { level: CHAPTER, chapter: 31, title: 'Yaiqab Flees from Laban' },
  { level: CHAPTER, chapter: 32, title: 'Yaiqab Wrestles at Panawaal' },
  { level: CHAPTER, chapter: 33, title: 'Yaiqab and Ishaw Are Reconciled' },
  { level: CHAPTER, chapter: 34, title: 'Dayanah and the Men of Shakam' },
  { level: CHAPTER, chapter: 35, title: 'Yaiqab Returns to Bethel; the Death of Rachal' },
  { level: CHAPTER, chapter: 36, title: 'The Generations of Ishaw' },
  { level: CHAPTER, chapter: 37, title: 'Yawasap Sold by His Brothers' },
  { level: CHAPTER, chapter: 38, title: 'Yahawadah and Thamar' },
  { level: CHAPTER, chapter: 39, title: "Yawasap and Pawatayapar's Wife" },
  { level: CHAPTER, chapter: 40, title: 'Yawasap Interprets Two Dreams' },
  { level: CHAPTER, chapter: 41, title: "Yawasap Interprets Paraih's Dreams" },
  { level: CHAPTER, chapter: 42, title: "Yawasap's Brothers Come to Matzarayam" },
  { level: CHAPTER, chapter: 43, title: 'The Second Journey to Matzarayam' },
  { level: CHAPTER, chapter: 44, title: "The Silver Cup in Banayamayan's Sack" },
  { level: CHAPTER, chapter: 45, title: 'Yawasap Reveals Himself' },
  { level: CHAPTER, chapter: 46, title: 'Yaiqab Goes Down to Matzarayam' },
  { level: CHAPTER, chapter: 47, title: 'Yaiqab Settles in Matzarayam' },
  { level: CHAPTER, chapter: 48, title: "Yaiqab Blesses Yawasap's Sons" },
  { level: CHAPTER, chapter: 49, title: "Yaiqab's Blessing on His Twelve Sons" },
  { level: CHAPTER, chapter: 50, title: 'The Death of Yaiqab and Yawasap' },

  // Pericopes — granular demo, not exhaustive.
  { level: PERICOPE, chapter: 22, verse: 1,  title: 'Yahawah Tests Abaraham' },
  { level: PERICOPE, chapter: 22, verse: 9,  title: 'Yatzachaq Bound on the Altar' },
  { level: PERICOPE, chapter: 38, verse: 1,  title: "Yahawadah's Sons; Thamar Widowed" },
  { level: PERICOPE, chapter: 38, verse: 12, title: "Thamar's Deception of Yahawadah" },
  { level: PERICOPE, chapter: 38, verse: 27, title: 'The Birth of Paratz and Zarach' },
];

// ── Isaiah (canon_id 23) ─────────────────────────────────────────────────────
const ISAIAH = [
  { level: PART, chapter: 1,  title: 'Part I — Warnings and Hope for Yahawadah and Yarawashalam' },
  { level: PART, chapter: 40, title: "Part II — Comfort for Yahawah's People" },
  { level: PART, chapter: 56, title: 'Part III — A New Yarawashalam' },

  { level: SECTION, chapter: 1,  title: 'Opening Oracles Against a Rebellious Nation' },
  { level: SECTION, chapter: 6,  title: 'The Book of Imanawaal' },
  { level: SECTION, chapter: 13, title: 'Oracles Against the Nations' },
  { level: SECTION, chapter: 24, title: 'The Little Apocalypse' },
  { level: SECTION, chapter: 28, title: 'Woes and Promises' },
  { level: SECTION, chapter: 34, title: 'Judgment and Restoration' },
  { level: SECTION, chapter: 36, title: 'Chazaqayah and the Threat from Ashawar' },
  { level: SECTION, chapter: 49, title: "The Suffering Servant and Tzayawan's Restoration" },

  { level: CHAPTER, chapter: 1,  title: "Yahawah's Indictment of a Rebellious People" },
  { level: CHAPTER, chapter: 2,  title: "The Mountain of Yahawah's House; the Day of Yahawah" },
  { level: CHAPTER, chapter: 3,  title: "Judgment on Yarawashalam's Leaders" },
  { level: CHAPTER, chapter: 4,  title: 'The Branch of Yahawah; a Remnant Cleansed' },
  { level: CHAPTER, chapter: 5,  title: 'The Song of the Vineyard; Six Woes' },
  { level: CHAPTER, chapter: 6,  title: 'The Call of Yashaiyah' },
  { level: CHAPTER, chapter: 7,  title: 'The Sign of Imanawaal' },
  { level: CHAPTER, chapter: 8,  title: 'A Son Named for Coming Ruin; Light After Darkness' },
  { level: CHAPTER, chapter: 9,  title: "A Child Is Born; Yahawah's Anger Against Yasharaal" },
  { level: CHAPTER, chapter: 10, title: "Woe to Ashawar, Yahawah's Instrument" },
  { level: CHAPTER, chapter: 11, title: 'The Root of Yashay; the Peaceful Kingdom' },
  { level: CHAPTER, chapter: 12, title: 'A Song of Thanksgiving' },
  { level: CHAPTER, chapter: 13, title: 'The Oracle Against Babal' },
  { level: CHAPTER, chapter: 14, title: 'The Fall of the King of Babal; the Oracle Against Palashath' },
  { level: CHAPTER, chapter: 15, title: 'The Oracle Against Mawaab' },
  { level: CHAPTER, chapter: 16, title: "Mawaab's Pride and Downfall" },
  { level: CHAPTER, chapter: 17, title: 'The Oracle Against Damashaq' },
  { level: CHAPTER, chapter: 18, title: 'The Oracle Against Kawash' },
  { level: CHAPTER, chapter: 19, title: 'The Oracle Against Matzarayam' },
  { level: CHAPTER, chapter: 20, title: "Yashaiyah's Sign Against Matzarayam and Kawash" },
  { level: CHAPTER, chapter: 21, title: 'The Fall of Babal Foreseen; Oracles Against Dawamah and Irab' },
  { level: CHAPTER, chapter: 22, title: 'The Oracle Concerning the Valley of Vision' },
  { level: CHAPTER, chapter: 23, title: 'The Oracle Against Tzar' },
  { level: CHAPTER, chapter: 24, title: 'The Earth Laid Waste' },
  { level: CHAPTER, chapter: 25, title: "A Song of Praise for Yahawah's Deliverance" },
  { level: CHAPTER, chapter: 26, title: 'A Song of Trust in Yahawah' },
  { level: CHAPTER, chapter: 27, title: 'The Deliverance of Yasharaal' },
  { level: CHAPTER, chapter: 28, title: 'Woe to the Drunkards of Aparayam' },
  { level: CHAPTER, chapter: 29, title: 'Woe to Arayaal' },
  { level: CHAPTER, chapter: 30, title: 'Woe to the Rebellious Children Who Trust in Matzarayam' },
  { level: CHAPTER, chapter: 31, title: "Woe to Those Who Rely on Matzarayam's Horses" },
  { level: CHAPTER, chapter: 32, title: 'A Righteous King; the Spirit Poured Out' },
  { level: CHAPTER, chapter: 33, title: 'Woe to the Destroyer; Yahawah Exalted' },
  { level: CHAPTER, chapter: 34, title: 'Judgment on the Nations; the Ruin of Adawam' },
  { level: CHAPTER, chapter: 35, title: 'The Joy of the Redeemed' },
  { level: CHAPTER, chapter: 36, title: 'Sanacharayab Threatens Yarawashalam' },
  { level: CHAPTER, chapter: 37, title: "Chazaqayah's Prayer and Yahawah's Deliverance" },
  { level: CHAPTER, chapter: 38, title: "Chazaqayah's Illness and Recovery" },
  { level: CHAPTER, chapter: 39, title: 'The Envoys from Babal' },
  { level: CHAPTER, chapter: 40, title: "Comfort for Yahawah's People" },
  { level: CHAPTER, chapter: 41, title: "Yahawah Challenges the Nations' Idols" },
  { level: CHAPTER, chapter: 42, title: 'The Servant of Yahawah' },
  { level: CHAPTER, chapter: 43, title: "Yasharaal's Redeemer" },
  { level: CHAPTER, chapter: 44, title: 'Yahawah Alone Is God; Kawarash Named' },
  { level: CHAPTER, chapter: 45, title: "Kawarash, Yahawah's Anointed" },
  { level: CHAPTER, chapter: 46, title: "The Fall of Babal's Idols" },
  { level: CHAPTER, chapter: 47, title: 'The Humiliation of Babal' },
  { level: CHAPTER, chapter: 48, title: "Yahawah's Discipline of Yasharaal" },
  { level: CHAPTER, chapter: 49, title: "The Servant's Mission to the Nations" },
  { level: CHAPTER, chapter: 50, title: "The Servant's Obedience and Suffering" },
  { level: CHAPTER, chapter: 51, title: 'Comfort for Tzayawan' },
  { level: CHAPTER, chapter: 52, title: 'The Herald of Good News; the Suffering Servant' },
  { level: CHAPTER, chapter: 53, title: 'The Suffering Servant Bears Our Sorrows' },
  { level: CHAPTER, chapter: 54, title: 'The Everlasting Covenant of Peace' },
  { level: CHAPTER, chapter: 55, title: 'An Invitation to the Thirsty' },
  { level: CHAPTER, chapter: 56, title: 'Salvation for All Who Keep the Covenant' },
  { level: CHAPTER, chapter: 57, title: 'Idolatry Rebuked; Comfort for the Contrite' },
  { level: CHAPTER, chapter: 58, title: 'True Fasting and Sabbath-Keeping' },
  { level: CHAPTER, chapter: 59, title: 'Sin Separates from Yahawah; the Redeemer Comes' },
  { level: CHAPTER, chapter: 60, title: 'The Glory of Tzayawan Restored' },
  { level: CHAPTER, chapter: 61, title: 'The Anointed Herald of Good News' },
  { level: CHAPTER, chapter: 62, title: "Tzayawan's New Name" },
  { level: CHAPTER, chapter: 63, title: 'Yahawah the Avenger; a Prayer for Mercy' },
  { level: CHAPTER, chapter: 64, title: 'A Prayer for Yahawah to Come Down' },
  { level: CHAPTER, chapter: 65, title: 'Judgment and New Creation' },
  { level: CHAPTER, chapter: 66, title: 'New Heavens and a New Earth' },

  // Pericopes — granular demo within chapter 1, plus the flagship example
  // from the feature request itself (chapter 6, "The Call of Yashaiyah").
  { level: PERICOPE, chapter: 1, verse: 2,  title: "Yahawah's Complaint Against Yasharaal" },
  { level: PERICOPE, chapter: 1, verse: 18, title: 'An Invitation to Reason Together' },
  { level: PERICOPE, chapter: 1, verse: 21, title: 'How the Faithful City Became a Harlot' },
  { level: PERICOPE, chapter: 6, verse: 1,  title: 'The Call of Yashaiyah' },
];

// ── Matthew (canon_id 40) ────────────────────────────────────────────────────
const MATTHEW = [
  { level: SECTION, chapter: 1,  title: 'Birth and Preparation' },
  { level: SECTION, chapter: 5,  title: 'The Sermon on the Mountain' },
  { level: SECTION, chapter: 8,  title: 'Ministry, Miracles, and Growing Opposition' },
  { level: SECTION, chapter: 17, title: 'Teaching on the Way to Yarawashalam' },
  { level: SECTION, chapter: 21, title: 'Confrontation in Yarawashalam' },
  { level: SECTION, chapter: 26, title: 'Passion and Resurrection' },

  { level: CHAPTER, chapter: 1,  title: 'The Genealogy and Birth of Yashawai' },
  { level: CHAPTER, chapter: 2,  title: 'The Magi; the Flight into Matzarayam' },
  { level: CHAPTER, chapter: 3,  title: 'Yawachanan the Baptizer Prepares the Way' },
  { level: CHAPTER, chapter: 4,  title: 'The Temptation of Yashawai; the First Disciples Called' },
  { level: CHAPTER, chapter: 5,  title: 'The Sermon on the Mountain: the Beatitudes and the Law' },
  { level: CHAPTER, chapter: 6,  title: 'The Sermon on the Mountain: Prayer, Fasting, and Trust' },
  { level: CHAPTER, chapter: 7,  title: 'The Sermon on the Mountain: Judging and True Obedience' },
  { level: CHAPTER, chapter: 8,  title: 'Healings and the Calming of the Storm' },
  { level: CHAPTER, chapter: 9,  title: 'More Healings; the Call of Mathathayahaw' },
  { level: CHAPTER, chapter: 10, title: 'The Twelve Sent Out' },
  { level: CHAPTER, chapter: 11, title: "Yawachanan's Question; Yashawai's Invitation to Rest" },
  { level: CHAPTER, chapter: 12, title: 'Sabbath Controversies; the Sign of Yawanah' },
  { level: CHAPTER, chapter: 13, title: 'Parables of the Kingdom' },
  { level: CHAPTER, chapter: 14, title: 'The Death of Yawachanan the Baptizer; Feeding the Five Thousand' },
  { level: CHAPTER, chapter: 15, title: 'Tradition and Faith; Feeding the Four Thousand' },
  { level: CHAPTER, chapter: 16, title: "Kayapaa's Confession; the First Passion Prediction" },
  { level: CHAPTER, chapter: 17, title: 'The Transfiguration' },
  { level: CHAPTER, chapter: 18, title: 'Life in the Community of Believers' },
  { level: CHAPTER, chapter: 19, title: 'Marriage, Children, and the Rich Young Man' },
  { level: CHAPTER, chapter: 20, title: 'The Laborers in the Vineyard; the Third Passion Prediction' },
  { level: CHAPTER, chapter: 21, title: 'The Entry into Yarawashalam; Cleansing the Temple' },
  { level: CHAPTER, chapter: 22, title: 'Parables and Questions in the Temple' },
  { level: CHAPTER, chapter: 23, title: 'Woes Against the Scribes and Pharisees' },
  { level: CHAPTER, chapter: 24, title: 'Signs of the End of the Age' },
  { level: CHAPTER, chapter: 25, title: 'Parables of Readiness: Virgins, Talents, Sheep and Goats' },
  { level: CHAPTER, chapter: 26, title: 'The Last Supper and the Arrest of Yashawai' },
  { level: CHAPTER, chapter: 27, title: 'The Trial, Crucifixion, and Burial of Yashawai' },
  { level: CHAPTER, chapter: 28, title: 'The Resurrection of Yashawai' },

  { level: PERICOPE, chapter: 5,  verse: 3, title: 'The Beatitudes' },
  { level: PERICOPE, chapter: 6,  verse: 9, title: "The Lord's Prayer" },
  { level: PERICOPE, chapter: 28, verse: 1, title: 'He Is Risen' },
];

// ── Josephus, Antiquities of the Jews (canon_id 220) ────────────────────────
// Book-for-book: this edition's 20 chapters ARE Antiquities' own 20 books, so
// each title is that book's real historical scope. No name-map entries exist
// for these (mostly Roman-era) figures, so they're left in plain English,
// same as the body text.
const ANTIQUITIES = [
  { level: PART, chapter: 1,  title: 'Part I — From the Creation to the Babylonian Exile' },
  { level: PART, chapter: 11, title: 'Part II — Return, Hellenism, and the Hasmoneans' },
  { level: PART, chapter: 14, title: 'Part III — Herod and Roman Judea' },

  { level: CHAPTER, chapter: 1,  title: 'From the Creation to the Death of Isaac' },
  { level: CHAPTER, chapter: 2,  title: 'Joseph in Egypt and the Beginning of the Bondage' },
  { level: CHAPTER, chapter: 3,  title: 'The Exodus and the Giving of the Law' },
  { level: CHAPTER, chapter: 4,  title: 'The Forty Years in the Wilderness and the Death of Moses' },
  { level: CHAPTER, chapter: 5,  title: 'The Conquest of Canaan and the Judges' },
  { level: CHAPTER, chapter: 6,  title: 'The Reign of Saul' },
  { level: CHAPTER, chapter: 7,  title: 'The Reign of David' },
  { level: CHAPTER, chapter: 8,  title: 'Solomon and the Division of the Kingdom' },
  { level: CHAPTER, chapter: 9,  title: 'The Kings of Israel and Judah to the Fall of Samaria' },
  { level: CHAPTER, chapter: 10, title: 'The Fall of Judah and the Babylonian Captivity' },
  { level: CHAPTER, chapter: 11, title: 'The Return from Exile and the Time of Alexander' },
  { level: CHAPTER, chapter: 12, title: 'The Ptolemies, the Seleucids, and the Rise of the Maccabees' },
  { level: CHAPTER, chapter: 13, title: 'The Hasmonean Dynasty' },
  { level: CHAPTER, chapter: 14, title: 'The Rise of Herod and Roman Intervention' },
  { level: CHAPTER, chapter: 15, title: 'The Early Reign of Herod' },
  { level: CHAPTER, chapter: 16, title: "Herod's Family and Troubles" },
  { level: CHAPTER, chapter: 17, title: 'The Death of Herod and the Rise of Archelaus' },
  { level: CHAPTER, chapter: 18, title: 'Roman Governors, John the Baptist, and Jesus' },
  { level: CHAPTER, chapter: 19, title: 'The Death of Caligula and the Reign of Claudius' },
  { level: CHAPTER, chapter: 20, title: 'The Roman Procurators and the Eve of the War' },
];

const PILOT = { 1: GENESIS, 23: ISAIAH, 40: MATTHEW, 220: ANTIQUITIES };

const del = db.prepare(`DELETE FROM headings WHERE book_id = ?`);
const ins = db.prepare(`
    INSERT INTO headings(book_id, level, chapter, verse, title)
    VALUES (?, ?, ?, ?, ?)
`);

const run = db.transaction(() => {
  let total = 0;
  for (const [bookId, rows] of Object.entries(PILOT)) {
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
console.log(`[headings] seeded ${total} headings total across ${Object.keys(PILOT).length} pilot books.`);
db.close();
