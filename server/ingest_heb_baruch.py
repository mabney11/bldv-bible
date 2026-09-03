#!/usr/bin/env python3
"""
ingest_heb_baruch.py -- add the new HEB (Hebrew) source for canon_id 74
("Baruch", the deuterocanonical book), 5 chapters, 140 verse rows, from
server/heb_baruch_import.json.

Source: Abraham Kahana's 1936 anthology, the volume "ספר ברוך" -- Kahana's
own solo translation (public domain: he died 1946, PD in Israel since 2016).
12-page scan (real text is pages 6-12; pages 1-5 are title/מבוא introduction
and bibliography, skipped), downloaded from Wikimedia Commons via
browser-triggered blob download, fieldy moved the file into server/.

Chapter mapping: straight 1:1 with this app's existing English/Syriac/LXX/
Ge'ez chapter numbers (same as the 2 Baruch Hebrew ingestion, unlike 4 Ezra's
+2 offset). All 5 chapters transcribed to an EXACT verse-count match against
this app's own English text (22, 35, 37, 37, 9) -- the cleanest of the
Hebrew apocrypha ingestions so far, no discrepancies to investigate. No
sourceVerseRemap.js entry needed.

THIS SCRIPT WRITES text_paleo DIRECTLY AT INSERT TIME (fieldy flagged that
the two earlier scripts -- 4 Ezra, 2 Baruch -- left it NULL and had to be
backfilled separately via server/paleo-migrate.mjs; from this book onward,
every new HEB ingest computes it inline instead). The conversion below is a
straight Python port of paleo-migrate.mjs's own sqToPaleo(): strips niqqud
(Unicode range U+0591-U+05C7), maps final-form letters to their base form
(ך->כ etc.), then maps each square-Hebrew letter to its corresponding
PALEO_LETTERS entry from src/lib/books.js, in the SAME letter order that
file defines (א ב ג ד ה ו ז ח ט י כ ל מ נ ס ע פ צ ק ר ש ת). If books.js's
PALEO_LETTERS array ever changes, this hardcoded copy will drift -- the
authoritative source is always src/lib/books.js; re-copy it here if paleo
output ever looks wrong after a books.js change.

NOT YET RUN. Written because the device-bridge sandbox cannot reliably touch
corpus.db while it is open live in WAL mode -- run this instead directly on
the machine that actually holds the file (normal local filesystem, not
through the remote-device FUSE bridge), with the dev server left running.

Usage (from the paleo-studio/server directory, i.e. cwd containing corpus.db
and heb_baruch_import.json):

    python3 ingest_heb_baruch.py            # apply
    python3 ingest_heb_baruch.py --dry       # show plan only, no writes

WAL-safe: BEGIN IMMEDIATE + busy-timeout + retry loop, single transaction,
verify-before-commit, duplicate-guarded (checks for an existing (HEB,BAR)
books row / canon_id=74 HEB verses before writing anything).
"""
import argparse
import json
import os
import sqlite3
import sys
import time
import unicodedata

DB_PATH = "corpus.db"
IMPORT_JSON = "heb_baruch_import.json"
NEW_CODE = "BAR"
CORPUS = "HEB"
CANON_ID = 74
SRC = "kahana1936:sefer-baruch"
CONF = "kahana-pd"
CATEGORY = "pseudepigrapha"
TITLE = "Baruch (Hebrew)"
EXPECTED_COUNTS = {"1": 22, "2": 35, "3": 37, "4": 37, "5": 9}

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
        sys.exit(f"chapter set mismatch: JSON has {sorted(data.keys(), key=int)}, expected {sorted(EXPECTED_COUNTS.keys(), key=int)}")

    rows = []
    for ch, verses in sorted(data.items(), key=lambda kv: int(kv[0])):
        for v in sorted(verses, key=lambda r: r["verse"]):
            text = v["text"]
            rows.append((ch, str(v["verse"]), int(ch), int(v["verse"]), text, sq_to_paleo(text)))
    total = len(rows)
    print(f"loaded {total} verse rows from {A.json} across {len(data)} chapters (paleo computed inline)")

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
                  f"and {total} verses rows (canon_id={CANON_ID}), text_paleo populated inline")
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
            raise RuntimeError(f"post-insert count mismatch -- rolling back: got={got} expected={EXPECTED_COUNTS}")

        cur.execute(
            "SELECT COUNT(*) FROM verses WHERE corpus=? AND canon_id=? AND code=? AND (text_paleo IS NULL OR text_paleo='')",
            (CORPUS, CANON_ID, NEW_CODE))
        n_missing_paleo = cur.fetchone()[0]
        if n_missing_paleo:
            raise RuntimeError(f"{n_missing_paleo} rows have no text_paleo after insert -- rolling back")

        con.commit()
        print(f"COMMITTED: book_id={new_book_id}, {total} verse rows, {len(got)} chapters, text_paleo populated on all rows")

        print()
        print("Spot-check (verify square + paleo both render correctly, not mojibake):")
        for ch, v in (("1", "1"), ("3", "1"), ("5", "9")):
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
    print("One source-file edit still to make by hand (plain file, zero DB risk):")
    print("server/assign-canon-ids.py -- extend the 74 entry's member list for re-runnability:")
    print(f'   ("HEB","{NEW_CODE}")')


if __name__ == "__main__":
    main()
