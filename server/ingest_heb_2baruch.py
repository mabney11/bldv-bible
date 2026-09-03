#!/usr/bin/env python3
"""
ingest_heb_2baruch.py -- add the new HEB (Hebrew) source for canon_id 138
("2 Baruch" / Syriac Apocalypse of Baruch), chapters 1-87 (688 verse rows),
from server/heb_2baruch_import.json.

Source: Abraham Kahana's 1936 anthology, the volume "חזון ברוך א" (Vision of
Baruch 1) -- Kahana's own solo translation (public domain: he died 1946, PD
in Israel since 2016). 46-page scan, downloaded from Wikimedia Commons
("Category:Jewish apocrypha (Abraham Kahana)") via browser-triggered blob
download, fieldy moved the file into server/. NOT to be confused with
"חזון ברוך ב'" (Vision of Baruch 2 = the GREEK Apocalypse of Baruch, English
"3 Baruch") -- Hebrew scholarly numbering of "Baruch visions" runs opposite
to how this app's canon_ids are laid out; ב' is translated by Artom (d.1965,
NOT public domain) and is NOT used here.

Chapter mapping: Kahana's own chapter numbers match the DISPLAY (English/
Syriac) chapter numbers 1:1 throughout -- NO offset, unlike the 4 Ezra
Hebrew source. Verified: all 87 chapters present, each internally gapless
after combined-verse-range expansion (see below). Kahana's per-chapter verse
counts sometimes match this app's own English text, sometimes its Syriac
text, and are occasionally 1-3 off from both (e.g. ch.1: reaches v.4 vs
English's 5 verses; ch.48: reaches v.47 vs English's 50) -- consistent with
ordinary cross-edition textual variance (Kahana translated primarily from
the Syriac per Hebrew Wikipedia's own account of the book), same harmless
class of small delta already established for the 4 Ezra Hebrew and Syriac
ingestions. No chapter has zero rows, so no sourceVerseRemap.js entry is
needed for this book (that mechanism only matters when a whole chapter is
otherwise empty).

NOT YET RUN. Written because the device-bridge sandbox cannot reliably touch
corpus.db while it is open live in WAL mode -- run this instead directly on
the machine that actually holds the file (normal local filesystem, not
through the remote-device FUSE bridge), with the dev server left running.

Usage (from the paleo-studio/server directory, i.e. cwd containing corpus.db
and heb_2baruch_import.json):

    python3 ingest_heb_2baruch.py            # apply
    python3 ingest_heb_2baruch.py --dry       # show plan only, no writes

What it does, in one WAL-safe transaction (BEGIN IMMEDIATE ... COMMIT, with
a busy-timeout + retry loop):

  1. Reads server/heb_2baruch_import.json (688 verse rows across chapters
     1-87, validated against EXPECTED_COUNTS below before touching the DB).
  2. Inserts ONE new row into `books`:
       book_id = <1 + current MAX(book_id) in books>, recomputed live.
       corpus='HEB', code='APBAR' (mirrors the existing SYR/APBAR code;
                 free for HEB -- checked against the live DB before insert),
       title='2 Baruch (Hebrew)', category='pseudepigrapha' (matches the
                 existing SYR row's category), n_verses=688.
  3. Inserts 688 rows into `verses` with:
       ref_key   = f"HEB:APBAR:{chapter}:{verse}"
       chapter/verse = TEXT, native = display numbering (no remap)
       ord_c/ord_v = INTEGER versions, for the sort indexes
       text      = the Hebrew text, verbatim, UTF-8
       category  = 'pseudepigrapha'
       src       = 'kahana1936:chazon-baruch-a' (Abraham Kahana, 1936,
                 "חזון ברוך א", public domain)
       conf      = 'kahana-pd'
       canon_id  = 138, set directly at insert time
       text_paleo, text_src = NULL
  4. Verifies row counts per chapter against EXPECTED_COUNTS inside the SAME
     transaction before committing.
  5. On success, prints exactly what was written and leaves the transaction
     committed. On ANY failure (including the code already existing in
     `books`, or counts not matching expectations), rolls back and changes
     NOTHING.

This script does NOT touch server/assign-canon-ids.py -- see the printed
reminder at the end for the one small text edit to make by hand afterward
(or I can make it directly next session, it's a plain text file).
"""
import argparse
import json
import os
import sqlite3
import sys
import time

DB_PATH = "corpus.db"
IMPORT_JSON = "heb_2baruch_import.json"
NEW_CODE = "APBAR"
CORPUS = "HEB"
CANON_ID = 138
SRC = "kahana1936:chazon-baruch-a"
CONF = "kahana-pd"
CATEGORY = "pseudepigrapha"
TITLE = "2 Baruch (Hebrew)"
EXPECTED_COUNTS = {
    "1": 4, "2": 2, "3": 9, "4": 7, "5": 7, "6": 10, "7": 2, "8": 5, "9": 2,
    "10": 19, "11": 6, "12": 4, "13": 11, "14": 18, "15": 8, "16": 1,
    "17": 4, "18": 2, "19": 8, "20": 6, "21": 26, "22": 8, "23": 7, "24": 4,
    "25": 4, "26": 1, "27": 14, "28": 6, "29": 8, "30": 5, "31": 5, "32": 9,
    "33": 3, "34": 2, "35": 5, "36": 11, "37": 1, "38": 4, "39": 8, "40": 4,
    "41": 6, "42": 8, "43": 5, "44": 15, "45": 2, "46": 7, "47": 2, "48": 47,
    "49": 3, "50": 4, "51": 16, "52": 7, "53": 12, "54": 22, "55": 8,
    "56": 16, "57": 3, "58": 2, "59": 12, "60": 2, "61": 8, "62": 8,
    "63": 11, "64": 9, "65": 2, "66": 8, "67": 9, "68": 7, "69": 5, "70": 10,
    "71": 3, "72": 6, "73": 7, "74": 4, "75": 8, "76": 5, "77": 26, "78": 7,
    "79": 3, "80": 7, "81": 4, "82": 9, "83": 23, "84": 11, "85": 15,
    "86": 3, "87": 1,
}


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
        sys.exit(f"corpus.db not found at {A.db!r} -- run this from server/, "
                  f"or pass --db")
    if not os.path.exists(A.json):
        sys.exit(f"{A.json!r} not found")

    data = json.load(open(A.json, encoding="utf-8"))
    for ch, verses in data.items():
        expect = EXPECTED_COUNTS.get(ch)
        if expect is not None and len(verses) != expect:
            sys.exit(f"chapter {ch}: expected {expect} verses, JSON has "
                      f"{len(verses)} -- aborting before touching the DB")
    if set(data.keys()) != set(EXPECTED_COUNTS.keys()):
        sys.exit(f"chapter set mismatch: JSON has {sorted(data.keys(), key=int)}, "
                  f"expected {sorted(EXPECTED_COUNTS.keys(), key=int)}")

    rows = []
    for ch, verses in sorted(data.items(), key=lambda kv: int(kv[0])):
        for v in sorted(verses, key=lambda r: r["verse"]):
            rows.append((ch, str(v["verse"]), int(ch), int(v["verse"]), v["text"]))
    total = len(rows)
    print(f"loaded {total} verse rows from {A.json} across {len(data)} chapters")

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
        sys.exit("could not acquire a write lock after retries -- aborting, "
                  "nothing changed")

    try:
        dupe = cur.execute(
            "SELECT COUNT(*) FROM books WHERE corpus=? AND code=?",
            (CORPUS, NEW_CODE)).fetchone()[0]
        if dupe:
            sys.exit(f"books already has a ({CORPUS},{NEW_CODE}) row -- "
                      f"aborting, nothing changed")

        existing_verses = cur.execute(
            "SELECT COUNT(*) FROM verses WHERE corpus=? AND canon_id=? "
            "AND code=?", (CORPUS, CANON_ID, NEW_CODE)).fetchone()[0]
        if existing_verses:
            sys.exit(f"verses already has {existing_verses} rows for "
                      f"({CORPUS}, canon_id={CANON_ID}, code={NEW_CODE}) -- "
                      f"aborting to avoid duplicating, nothing changed")

        new_book_id = (cur.execute("SELECT MAX(book_id) FROM books").fetchone()[0] or 0) + 1
        print(f"new book_id = {new_book_id}")

        if A.dry:
            print(f"[dry] would insert 1 books row (book_id={new_book_id}, "
                  f"corpus={CORPUS}, code={NEW_CODE}) and {total} verses rows "
                  f"(canon_id={CANON_ID})")
            con.rollback()
            return

        cur.execute(
            "INSERT INTO books (book_id, corpus, code, title, category, n_verses) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (new_book_id, CORPUS, NEW_CODE, TITLE, CATEGORY, total))

        insert_sql = (
            "INSERT INTO verses "
            "(ref_key, book_id, corpus, code, chapter, verse, ord_c, ord_v, "
            " text, category, src, conf, canon_id, text_paleo, text_src) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)")
        for ch, verse_s, ord_c, ord_v, text in rows:
            ref_key = f"{CORPUS}:{NEW_CODE}:{ch}:{verse_s}"
            cur.execute(insert_sql, (
                ref_key, new_book_id, CORPUS, NEW_CODE, ch, verse_s,
                ord_c, ord_v, text, CATEGORY, SRC, CONF, CANON_ID))

        cur.execute(
            "SELECT chapter, COUNT(*) FROM verses WHERE corpus=? AND canon_id=? "
            "AND code=? GROUP BY chapter", (CORPUS, CANON_ID, NEW_CODE))
        got = {ch: n for ch, n in cur.fetchall()}
        if got != EXPECTED_COUNTS:
            raise RuntimeError(f"post-insert count mismatch -- rolling back. "
                                f"diffs: {[(k, got.get(k), EXPECTED_COUNTS.get(k)) for k in set(got)|set(EXPECTED_COUNTS) if got.get(k) != EXPECTED_COUNTS.get(k)]}")

        con.commit()
        print(f"COMMITTED: book_id={new_book_id}, {total} verse rows, "
              f"{len(got)} chapters")

        print()
        print("Spot-check (verify these render as real Hebrew, not mojibake):")
        for ch, v in (("1", "1"), ("48", "1"), ("87", "1")):
            cur.execute(
                "SELECT text FROM verses WHERE corpus=? AND code=? AND "
                "chapter=? AND verse=?", (CORPUS, NEW_CODE, ch, v))
            r = cur.fetchone()
            print(f"  {ch}:{v} -> {r[0] if r else '(MISSING)'}")

    except Exception:
        con.rollback()
        raise
    finally:
        con.close()

    print()
    print("One source-file edit still to make by hand (plain file, zero DB risk):")
    print()
    print("server/assign-canon-ids.py -- extend the 138 entry's member "
          "list for re-runnability (add HEB alongside whatever's already there):")
    print(f'   ("HEB","{NEW_CODE}")')


if __name__ == "__main__":
    main()
