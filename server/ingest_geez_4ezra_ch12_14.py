#!/usr/bin/env python3
"""
ingest_geez_4ezra_ch12_14.py -- add the new GEZ (Ge'ez) source for canon_id 139
("2 Esdras / 4 Ezra"), chapters 12-14 only, from server/geez_4ezra_import.json.

NOT YET RUN. Written because this device-bridge sandbox cannot reliably touch
corpus.db while it is open live in WAL mode (see report) -- run this instead
directly on the machine that actually holds the file (normal local filesystem,
not through the remote-device FUSE bridge), with the dev server left running.

Usage (from the paleo-studio/server directory, i.e. cwd containing corpus.db
and geez_4ezra_import.json):

    python3 ingest_geez_4ezra_ch12_14.py            # apply
    python3 ingest_geez_4ezra_ch12_14.py --dry       # show plan only, no writes

What it does, in one WAL-safe transaction (BEGIN IMMEDIATE ... COMMIT, with a
busy-timeout + retry loop so it politely waits out the live dev server rather
than colliding with it):

  1. Reads server/geez_4ezra_import.json (157 verses: ch12=51, ch13=58, ch14=48).
  2. Inserts ONE new row into `books`:
       book_id = <1 + current MAX(book_id) in books>   (books.book_id is a
                 global INTEGER PRIMARY KEY across ALL corpora -- confirmed via
                 schema: `books(book_id INTEGER PRIMARY KEY, corpus, code, title,
                 category, n_verses, UNIQUE(corpus,code))`. At inspection time
                 MAX(book_id)=6941, so the new book_id would be 6942 -- but this
                 script recomputes it live at run time in case other ingests
                 have happened meanwhile.)
       corpus='GEZ', code=NEW_CODE ('4EZR_PARTIAL' -- not used elsewhere in
                 `books`, checked against the live DB before insert),
       title='4 Ezra (Ge\'ez, partial: ch. 12-14)', category='pseudepigrapha',
       n_verses=157.
  3. Inserts 157 rows into `verses` (columns: id [omitted, autoincrement],
     ref_key, book_id, corpus, code, chapter, verse, ord_c, ord_v, text,
     category, src, conf, canon_id, text_paleo, text_src) with:
       ref_key   = f"GEZ:{NEW_CODE}:{chapter}:{verse}"
       book_id   = the new book_id from step 2
       corpus    = 'GEZ'
       code      = NEW_CODE
       chapter/verse = TEXT, exactly as given in the JSON (chapter is the dict
                 key "12"/"13"/"14"; verse is each entry's "verse" field, cast
                 to str to match the column's declared TEXT type and existing
                 GEZ row convention, e.g. canon_id-90 rows store verse='1' not 1)
       ord_c/ord_v = INTEGER versions of chapter/verse, for the idx_v_bcv /
                 idx_v_canon sort indexes
       text      = the Ge'ez text, verbatim, UTF-8
       category  = 'pseudepigrapha'   (matches book_id=2520/APEZ's category,
                 the known-working GEZ precedent for this same canon family)
       src       = 'lpettay-mirror:4Ezra_ch12-14'
       conf      = 'betmas'   (matches ingest_lpettay.py's own convention: all
                 verses it produces from the LPettay/ethiopian-bible mirror of
                 the Beta maṣāḥəft TEI are tagged conf='betmas',
                 regardless of exactly which upstream file each came from)
       canon_id  = 139        (set directly at insert time, exactly like the
                 existing book_id=2520/APEZ rows already carry canon_id=90
                 directly on the row -- there is NO separate canon-id mapping
                 table; verses.canon_id is the sole source of truth, confirmed
                 by reading server/assign-canon-ids.py, whose own mechanism is
                 a plain `UPDATE verses SET canon_id=? WHERE corpus=? AND
                 code=?` -- setting it inline on INSERT is equivalent and saves
                 a second pass)
       text_paleo, text_src = NULL (unused for this corpus, matches APEZ rows)
  4. Verifies row counts per chapter (51/58/48) and a few spot-check texts
     inside the SAME transaction before committing.
  5. On success, prints exactly what was written and leaves the transaction
     committed. On ANY failure (including the code already existing in
     `books`, or counts not matching expectations), rolls back and changes
     NOTHING.

This script does NOT touch server/books.geez.json or server/assign-canon-ids.py
(both plain source files, not the DB) -- see the printed reminder at the end
for the two small text edits to make by hand afterward, so a human reviews the
exact wording before it lands in git.
"""
import argparse
import json
import os
import sqlite3
import sys
import time

DB_PATH = "corpus.db"
IMPORT_JSON = "geez_4ezra_import.json"
NEW_CODE = "4EZR_PARTIAL"
CORPUS = "GEZ"
CANON_ID = 139
SRC = "lpettay-mirror:4Ezra_ch12-14"
CONF = "betmas"
CATEGORY = "pseudepigrapha"
TITLE = "4 Ezra (Ge'ez, partial: ch. 12-14)"
EXPECTED_COUNTS = {"12": 51, "13": 58, "14": 48}


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

    rows = []
    for ch, verses in sorted(data.items(), key=lambda kv: int(kv[0])):
        for v in sorted(verses, key=lambda r: r["verse"]):
            rows.append((ch, str(v["verse"]), int(ch), int(v["verse"]), v["text"]))
    total = len(rows)
    print(f"loaded {total} verse rows from {A.json} "
          f"({', '.join(f'{c}={n}' for c, n in EXPECTED_COUNTS.items())})")

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
        print("Spot-check (verify these render as real Ge'ez, not mojibake):")
        for ch, v in (("12", "1"), ("13", "1"), ("14", "48")):
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
    print("Two source-file edits still to make by hand (not touched by this "
          "script, both plain files, zero DB risk):")
    print()
    print("1) server/books.geez.json -- append:")
    print(json.dumps({
        "code": NEW_CODE, "corpus": CORPUS,
        "name": "4 Ezra (Ge'ez, partial: ch. 12-14)",
        "geez_name": "", "section": "Other", "order": 900,
        "n_chapters": 3, "verses": total,
        "src": ("lpettay-mirror:4Ezra_ch12-14 -- Ethiopic manuscript witness "
                "to 4 Ezra's later chapters, via a community-maintained "
                "mirror of the Beta maṣāḥəft catalog; "
                "chapters 1-11 not present in this source")
    }, ensure_ascii=False, indent=2))
    print()
    print("2) server/assign-canon-ids.py -- extend the 139 entry's member "
          "list for re-runnability:")
    print('   139: ("2 Esdras / 4 Ezra", [("ENG","2_ESDRAS"), ("SYR","4EZRA"), '
          f'("GEZ","{NEW_CODE}")]),')


if __name__ == "__main__":
    main()
