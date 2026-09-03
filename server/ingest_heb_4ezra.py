#!/usr/bin/env python3
"""
ingest_heb_4ezra.py -- add the new HEB (Hebrew) source for canon_id 139
("2 Esdras / 4 Ezra"), chapters 3-14 (English/display numbering), from
server/heb_4ezra_import.json.

Source: Abraham Kahana's 1936 anthology "הספרים החיצונים" (Ha-Sefarim
Ha-Hitzonim), the volume "חזון עזרא" (Vision of Ezra) -- Kahana's own
translation (public domain: Kahana died 1946, PD in Israel since 2016).
Covers Kahana's own chapters 1-12, which correspond to English/display
chapters 3-14 (a clean +2 offset), EXCEPT Kahana's chapter 5 (-> display
chapter 7), which natively preserves the complete/restored 1-140
"Missing Fragment" numbering exactly like this app's existing Syriac
source for the same chapter -- handled by the SAME
src/lib/sourceVerseRemap.js mechanism already built for 'SYR:139:7', now
extended with a new 'HEB:139:7' entry (already added to that file).
Chapters 1-2 of Kahana's own numbering (-> display chapters 1-2, the
opening frame narrative) are NOT present in this source volume.

NOT YET RUN. Written because this device-bridge sandbox cannot reliably
touch corpus.db while it is open live in WAL mode -- run this instead
directly on the machine that actually holds the file (normal local
filesystem, not through the remote-device FUSE bridge), with the dev
server left running.

Usage (from the paleo-studio/server directory, i.e. cwd containing
corpus.db and heb_4ezra_import.json):

    python3 ingest_heb_4ezra.py            # apply
    python3 ingest_heb_4ezra.py --dry       # show plan only, no writes

What it does, in one WAL-safe transaction (BEGIN IMMEDIATE ... COMMIT,
with a busy-timeout + retry loop so it politely waits out the live dev
server rather than colliding with it):

  1. Reads server/heb_4ezra_import.json (711 verse rows across chapters
     3-14; chapter 7 uses NATIVE Kahana verse numbers 1-139, matching
     exactly how this app's existing SYR/4EZRA chapter 7 is stored --
     see EXPECTED_COUNTS below).
  2. Inserts ONE new row into `books`:
       book_id = <1 + current MAX(book_id) in books>, recomputed live.
       corpus='HEB', code='4EZRA' (free -- no existing (HEB,'4EZRA') row;
                 chosen to mirror the existing (SYR,'4EZRA') code),
       title='4 Ezra (Hebrew)', category='pseudepigrapha' (matches the
                 existing SYR/4EZRA row's category), n_verses=711.
  3. Inserts 711 rows into `verses` with:
       ref_key   = f"HEB:4EZRA:{chapter}:{verse}"
       chapter/verse = TEXT, exactly as given in the JSON
       ord_c/ord_v = INTEGER versions, for the sort indexes
       text      = the Hebrew text, verbatim, UTF-8
       category  = 'pseudepigrapha'
       src       = 'kahana1936:chazon-ezra' (Abraham Kahana, 1936,
                 "חזון עזרא", public domain)
       conf      = 'kahana-pd'   (mirrors this app's own 'wlc-pd'
                 convention for marking a confirmed-public-domain source)
       canon_id  = 139, set directly at insert time (matches this app's
                 established convention -- verses.canon_id is the sole
                 source of truth, no separate mapping table)
       text_paleo, text_src = NULL (unused for this corpus at ingest time)
  4. Verifies row counts per chapter against EXPECTED_COUNTS inside the
     SAME transaction before committing.
  5. On success, prints exactly what was written and leaves the
     transaction committed. On ANY failure (including the code already
     existing in `books`, or counts not matching expectations), rolls
     back and changes NOTHING.

This script does NOT touch src/lib/sourceVerseRemap.js (already edited
by hand, adds 'HEB:139:7') or server/assign-canon-ids.py -- see the
printed reminder at the end for the one small text edit to make by hand
afterward.
"""
import argparse
import json
import os
import sqlite3
import sys
import time

DB_PATH = "corpus.db"
IMPORT_JSON = "heb_4ezra_import.json"
NEW_CODE = "4EZRA"
CORPUS = "HEB"
CANON_ID = 139
SRC = "kahana1936:chazon-ezra"
CONF = "kahana-pd"
CATEGORY = "pseudepigrapha"
TITLE = "4 Ezra (Hebrew)"
EXPECTED_COUNTS = {
    "3": 34, "4": 53, "5": 56, "6": 59, "7": 139, "8": 62,
    "9": 47, "10": 60, "11": 46, "12": 50, "13": 58, "14": 47,
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
    print(f"loaded {total} verse rows from {A.json} "
          f"({', '.join(f'{c}={n}' for c, n in sorted(EXPECTED_COUNTS.items(), key=lambda kv: int(kv[0])))})")

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
                      f"aborting, nothing changed (choose a different code, "
                      f"or this was already run)")

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

        # verify inside the same transaction before committing
        cur.execute(
            "SELECT chapter, COUNT(*) FROM verses WHERE corpus=? AND canon_id=? "
            "AND code=? GROUP BY chapter ORDER BY chapter",
            (CORPUS, CANON_ID, NEW_CODE))
        got = {ch: n for ch, n in cur.fetchall()}
        if got != EXPECTED_COUNTS:
            raise RuntimeError(f"post-insert count mismatch: got {got}, "
                                f"expected {EXPECTED_COUNTS} -- rolling back")

        con.commit()
        print(f"COMMITTED: book_id={new_book_id}, {total} verse rows, "
              f"counts={got}")

        print()
        print("Spot-check (verify these render as real Hebrew, not mojibake):")
        for ch, v in (("3", "1"), ("7", "106"), ("14", "47")):
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
    print("One source-file edit still to make by hand (not touched by this "
          "script, plain file, zero DB risk):")
    print()
    print("server/assign-canon-ids.py -- extend the 139 entry's member "
          "list for re-runnability:")
    print('   139: ("2 Esdras / 4 Ezra", [("ENG","2_ESDRAS"), ("SYR","4EZRA"), '
          f'("GEZ","4EZR_PARTIAL"), ("{CORPUS}","{NEW_CODE}")]),')
    print()
    print("(src/lib/sourceVerseRemap.js already has the 'HEB:139:7' entry "
          "added, alongside the existing 'SYR:139:7' one.)")


if __name__ == "__main__":
    main()
