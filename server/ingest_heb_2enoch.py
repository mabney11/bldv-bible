#!/usr/bin/env python3
"""
ingest_heb_2enoch.py -- add the new HEB (Hebrew) source for canon_id 136
("2 Enoch"), from server/heb_2enoch_import.json.

Source: Abraham Kahana's 1936 anthology, the volume "ספר חנוך ב" -- Kahana's
own solo translation (public domain: he died 1946, PD in Israel since 2016).
40-page scan downloaded from Wikimedia Commons ("Category:Jewish apocrypha
(Abraham Kahana)"), fieldy moved the file into server/.

*** STRUCTURAL NOTE -- READ BEFORE TOUCHING THIS BOOK AGAIN ***
Unlike every other Hebrew apocrypha ingested this project (4 Ezra: clean +2
chapter offset; 2 Baruch, Baruch: straight 1:1 chapter mapping), Kahana's
2 Enoch uses a RADICALLY coarser chapter division than this app's existing
English text: only ~22 native chapters (his own numbering skips "19"
entirely -- goes ...17, 18, 20, 21...) covering what the standard English
scholarly numbering spreads across 68 chapters, with some of his chapters
(e.g. his ch.13) alone running to 100+ verses and covually spanning what is
~17 standard English chapters' worth of content. There is no fixed offset or
ratio -- fieldy was asked and explicitly chose full manual content-based
re-keying (over the cheaper options of native-numbering-only or skipping the
book) to keep this source's chapter:verse numbers aligned with the app's
existing standard numbering, matching how every other source in this app
lines up in parallel view.

That re-keying was done as follows:
  1. Full verse-by-verse transcription of all 40 page images (546 Hebrew
     verses after dropping one textually-empty marker-only verse at native
     Kahana 9:23 -- a stray verse-letter in the print with no body text).
  2. This app's own existing ENG/2_ENOCH text (321 verses, 68 chapters) was
     pulled as the content-matching reference.
  3. Every single Hebrew verse was individually read, translated, and
     assigned to a STANDARD chapter number by content/topic match against
     the English reference (content flows in the same linear order in both
     texts -- Kahana only ever compresses, never reorders -- so this was a
     boundary-finding exercise, not a search problem). Verse NUMBERS within
     each assigned standard chapter are simply sequential (1..N) in the
     Hebrew's own reading order -- they are NOT forced to match the
     English translation's own verse count or split points for that
     chapter (Kahana's translation has its own, denser or looser, verse
     granularity throughout).
  4. Standard chapter 17 ("armed heavenly soldiers... singing" -- part of
     the 4th-heaven sun/moon material) has NO distinctly-identifiable
     Hebrew text in Kahana's translation (his chapter 6, covering the
     4th heaven, jumps straight from what matches English ch.16 to what
     matches English ch.18) -- so chapter 17 is genuinely ABSENT from this
     HEB source (0 rows), same as how DSS_* sources leave many chapters
     empty elsewhere in this app. This is expected, not a bug -- no
     sourceVerseRemap.js entry is needed for a simple "whole chapter has
     zero rows" case.
  5. *** This app's existing ENG/2_ENOCH text STOPS at chapter 68 (Enoch's
     ascension + the people's 3-day feast). Kahana's Hebrew CONTINUES past
     that point with ~133 more verses covering the well-known "Story of
     Melchizedek" appendix (Methuselah's own priestly installation, his
     death, Nir made priest, Sofonim/Melchizedek's miraculous birth,
     Michael taking the child to Eden ahead of the Flood, Noah's ark). This
     material has NO English (or any other) counterpart anywhere in this
     app's corpus.db for canon_id 136. Rather than drop ~133 already-
     transcribed and translated verses, they were assigned the STANDARD
     scholarly chapter numbers 69-73 used for this appendix in mainstream
     2 Enoch editions (R.H. Charles 1896/1913, Vaillant, Andersen/OTP) --
     ch.69 Methuselah's installation, ch.70 Nir made priest, ch.71
     Melchizedek's birth, ch.72 Michael takes the child to Eden, ch.73
     Noah/the ark + the book's closing doxology. This means this HEB
     source's own n_verses/chapter range (1-73) now extends 5 chapters
     PAST this book's existing ENG source (1-68) -- by design, flagged
     here in case that surprises a future maintainer. No other source
     (ENG/SYR/LXX/GEZ/etc.) has rows in chapters 69-73 for canon_id 136,
     so the app's chapter-picker UI should simply show nothing for those
     chapters in any other language column, same as any other
     partial-coverage source.
  6. An audit trail mapping every display (chapter,verse) back to Kahana's
     own native (chapter,verse) was kept during the rekeying process (see
     heb_2enoch_import_AUDIT.json in the working notes) in case any
     verse-boundary judgment call needs revisiting later -- NOT shipped
     with this script, ask fieldy/Claude to regenerate it from session
     history if ever needed.

THIS SCRIPT WRITES text_paleo DIRECTLY AT INSERT TIME, same as every HEB
ingest from server/ingest_heb_baruch.py onward. Straight Python port of
paleo-migrate.mjs's own sqToPaleo(): strips niqqud (U+0591-U+05C7), maps
final-form letters to base form, maps each square-Hebrew letter to its
PALEO_LETTERS entry from src/lib/books.js. Re-copy from src/lib/books.js if
that file's PALEO_LETTERS array ever changes.

NOT YET RUN. Device-bridge sandbox cannot reliably touch corpus.db live in
WAL mode -- run this directly on the machine that holds the file.

Usage (from paleo-studio/server, cwd containing corpus.db and
heb_2enoch_import.json):

    python3 ingest_heb_2enoch.py            # apply
    python3 ingest_heb_2enoch.py --dry       # show plan only, no writes

WAL-safe: BEGIN IMMEDIATE + busy-timeout + retry loop, single transaction,
verify-before-commit, duplicate-guarded.
"""
import argparse
import json
import os
import sqlite3
import sys
import time
import unicodedata

DB_PATH = "corpus.db"
IMPORT_JSON = "heb_2enoch_import.json"
NEW_CODE = "2_ENOCH"
CORPUS = "HEB"
CANON_ID = 136
SRC = "kahana1936:chanoch-b"
CONF = "kahana-pd"
CATEGORY = "pseudepigrapha"
TITLE = "2 Enoch (Hebrew)"
EXPECTED_COUNTS = {
    "1": 12, "2": 5, "3": 3, "4": 1, "5": 1, "6": 1, "7": 7, "8": 7, "9": 2,
    "10": 3, "11": 5, "12": 2, "13": 3, "14": 3, "15": 4, "16": 5,
    "18": 13, "19": 8, "20": 4, "21": 4, "22": 17, "23": 6, "24": 7,
    "25": 7, "26": 6, "27": 6, "28": 7, "29": 8, "30": 29, "31": 7,
    "32": 3, "33": 14, "34": 2, "35": 3, "36": 2, "37": 4, "38": 4,
    "39": 10, "40": 17, "41": 2, "42": 15, "43": 3, "44": 6, "45": 4,
    "46": 2, "47": 1, "48": 15, "49": 3, "50": 6, "51": 5, "52": 15,
    "53": 5, "54": 1, "55": 3, "56": 4, "57": 3, "58": 8, "59": 5,
    "60": 6, "61": 5, "62": 4, "63": 2, "64": 7, "65": 9, "66": 11,
    "67": 3, "68": 8, "69": 24, "70": 32, "71": 31, "72": 35, "73": 11,
}
# Chapter 17 is deliberately ABSENT (0 rows) -- see docstring point 4.

# --- paleo conversion (ported from paleo-migrate.mjs / src/lib/books.js) ---
SQUARE = list("אבגדהוזחטיכלמנסעפצקרשת")
PALEO_LETTERS = ['𐤀','𐤁','𐤂','𐤃','𐤄','𐤅','𐤆','𐤇','𐤈','𐤉','𐤊',
                 '𐤋','𐤌','𐤍','𐤎','𐤏','𐤐','𐤑','𐤒','𐤓','𐤔','𐤕']
FINALS = {'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ'}
SQ_TO_PALEO_MAP = {s: p for s, p in zip(SQUARE, PALEO_LETTERS)}


def sq_to_paleo(t):
    if not t:
        return t
    out = []
    for ch in unicodedata.normalize("NFC", t):
        cp = ord(ch)
        if 0x0591 <= cp <= 0x05C7:   # niqqud / cantillation -- drop
            continue
        base = FINALS.get(ch, ch)
        out.append(SQ_TO_PALEO_MAP.get(base, ch))
    return "".join(out)


def connect_with_retry(path, attempts=6, base_delay=0.5):
    last_err = None
    for i in range(attempts):
        try:
            con = sqlite3.connect(path, timeout=30)
            con.execute("PRAGMA busy_timeout=30000")
            return con
        except sqlite3.OperationalError as e:
            last_err = e
            time.sleep(base_delay * (2 ** i))
    raise last_err


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DB_PATH)
    ap.add_argument("--json", default=IMPORT_JSON)
    ap.add_argument("--dry", action="store_true")
    A = ap.parse_args()

    if not os.path.exists(A.db):
        sys.exit(f"corpus.db not found at {A.db!r} -- run this from server/, or pass --db")
    if not os.path.exists(A.json):
        sys.exit(f"{A.json!r} not found")

    data = json.load(open(A.json, encoding="utf-8"))
    for ch, verses in data.items():
        expect = EXPECTED_COUNTS.get(ch)
        if expect is not None and len(verses) != expect:
            sys.exit(f"chapter {ch}: expected {expect} verses, JSON has {len(verses)} -- aborting")
    if set(data.keys()) != set(EXPECTED_COUNTS.keys()):
        sys.exit(f"chapter set mismatch: JSON has {sorted(data.keys(), key=int)}, "
                  f"expected {sorted(EXPECTED_COUNTS.keys(), key=int)}")

    rows = []
    for ch, verses in sorted(data.items(), key=lambda kv: int(kv[0])):
        for v in sorted(verses, key=lambda r: r["verse"]):
            text = v["text"]
            if not text or not text.strip():
                sys.exit(f"chapter {ch} verse {v['verse']}: empty text -- aborting (should have been dropped)")
            rows.append((ch, str(v["verse"]), int(ch), int(v["verse"]), text, sq_to_paleo(text)))
    total = len(rows)
    print(f"loaded {total} verse rows from {A.json} across {len(data)} chapters "
          f"(chapter 17 intentionally absent; paleo computed inline)")

    con = connect_with_retry(A.db)
    cur = con.cursor()

    for attempt in range(6):
        try:
            cur.execute("BEGIN IMMEDIATE")
            break
        except sqlite3.OperationalError as e:
            if "locked" in str(e).lower() and attempt < 5:
                time.sleep(0.5 * (2 ** attempt))
                continue
            raise
    else:
        sys.exit("could not acquire a write lock after retries -- aborting, nothing changed")

    try:
        dupe = cur.execute(
            "SELECT COUNT(*) FROM books WHERE corpus=? AND code=?",
            (CORPUS, NEW_CODE)).fetchone()[0]
        if dupe:
            sys.exit(f"books already has a ({CORPUS},{NEW_CODE}) row -- aborting, nothing changed")

        existing_verses = cur.execute(
            "SELECT COUNT(*) FROM verses WHERE corpus=? AND canon_id=? AND code=?",
            (CORPUS, CANON_ID, NEW_CODE)).fetchone()[0]
        if existing_verses:
            sys.exit(f"verses already has {existing_verses} rows for ({CORPUS}, canon_id={CANON_ID}, code={NEW_CODE}) -- aborting")

        new_book_id = (cur.execute("SELECT MAX(book_id) FROM books").fetchone()[0] or 0) + 1
        print(f"new book_id = {new_book_id}")

        if A.dry:
            print(f"[dry] would insert 1 books row (book_id={new_book_id}, corpus={CORPUS}, code={NEW_CODE}) "
                  f"and {total} verses rows (canon_id={CANON_ID}, chapters 1-73 except 17), text_paleo populated inline")
            con.rollback()
            return

        cur.execute(
            "INSERT INTO books (book_id, corpus, code, title, category, n_verses) VALUES (?, ?, ?, ?, ?, ?)",
            (new_book_id, CORPUS, NEW_CODE, TITLE, CATEGORY, total))

        insert_sql = (
            "INSERT INTO verses "
            "(ref_key, book_id, corpus, code, chapter, verse, ord_c, ord_v, "
            " text, category, src, conf, canon_id, text_paleo, text_src) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)")
        for ch, verse_s, ord_c, ord_v, text, paleo in rows:
            ref_key = f"{CORPUS}:{NEW_CODE}:{ch}:{verse_s}"
            cur.execute(insert_sql, (
                ref_key, new_book_id, CORPUS, NEW_CODE, ch, verse_s,
                ord_c, ord_v, text, CATEGORY, SRC, CONF, CANON_ID, paleo))

        cur.execute(
            "SELECT chapter, COUNT(*) FROM verses WHERE corpus=? AND canon_id=? AND code=? GROUP BY chapter",
            (CORPUS, CANON_ID, NEW_CODE))
        got = {ch: n for ch, n in cur.fetchall()}
        if got != EXPECTED_COUNTS:
            diffs = [(k, got.get(k), EXPECTED_COUNTS.get(k)) for k in set(got) | set(EXPECTED_COUNTS) if got.get(k) != EXPECTED_COUNTS.get(k)]
            raise RuntimeError(f"post-insert count mismatch -- rolling back: {diffs}")

        cur.execute(
            "SELECT COUNT(*) FROM verses WHERE corpus=? AND canon_id=? AND code=? AND (text_paleo IS NULL OR text_paleo='')",
            (CORPUS, CANON_ID, NEW_CODE))
        n_missing_paleo = cur.fetchone()[0]
        if n_missing_paleo:
            raise RuntimeError(f"{n_missing_paleo} rows have no text_paleo after insert -- rolling back")

        con.commit()
        print(f"COMMITTED: book_id={new_book_id}, {total} verse rows, {len(got)} chapters "
              f"(1-73 except 17), text_paleo populated on all rows")

        print()
        print("Spot-check (verify square + paleo both render correctly, not mojibake):")
        for ch, v in (("1", "1"), ("30", "1"), ("52", "1"), ("69", "1"), ("73", str(EXPECTED_COUNTS["73"]))):
            cur.execute(
                "SELECT text, text_paleo FROM verses WHERE corpus=? AND code=? AND chapter=? AND verse=?",
                (CORPUS, NEW_CODE, ch, v))
            r = cur.fetchone()
            if r:
                print(f"  {ch}:{v} square -> {r[0]}")
                print(f"  {ch}:{v} paleo  -> {r[1]}")
            else:
                print(f"  {ch}:{v} -> (MISSING)")

    except Exception:
        con.rollback()
        raise
    finally:
        con.close()

    print()
    print("server/assign-canon-ids.py was already edited by hand this session:")
    print('   136: ("2 Enoch", [("ENG","2_ENOCH"), ("HEB","2_ENOCH")]),')
    print("No further manual edit needed for that file.")


if __name__ == "__main__":
    main()
