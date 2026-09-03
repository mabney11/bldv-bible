#!/usr/bin/env python3
"""
ingest_heb_testmoses.py -- add the new HEB (Hebrew) source for canon_id 126
("Assumption of Moses" / "Testament of Moses"), from
server/heb_testmoses_import.json.

Source: Abraham Kahana's 1936 anthology, the volume "עלית משה" (Assumption
of Moses) -- Kahana's own solo translation (public domain: he died 1946, PD
in Israel since 2016). 12-page scan (real text is pages 4-12; pages 1-3 are
title/מבוא introduction and bibliography, skipped), downloaded from
Wikimedia Commons via browser-triggered blob download, fieldy moved the
file into server/.

Chapter mapping: STRAIGHT 1:1 with this app's existing English chapter
numbers -- confirmed via the page's own running headers throughout (e.g.
"עלית משה א יד-ב ו" = ch.1:14-ch.2:6, "עלית משה ט א-י ז" = ch.9:1-ch.10:7,
ending cleanly at "עלית משה יא יח-יב יג" = ch.11:18-ch.12:13, the book's
own historically-abrupt ending -- no hidden appendix, unlike 2 Enoch).
Kahana's own verse numbering is considerably denser/different from the
English's (e.g. his ch.1 alone runs to 18 verses vs the English's 8) -- this
is normal cross-translation variance, same as several earlier books in this
series; verse numbers in the import JSON are simply sequential (1..N) in
Kahana's own reading order per chapter, not forced to match English's
verse splits. A handful of native verse-numbers are genuinely skipped in
Kahana's own margin printing (9:6, 11:4 -- confirmed via high-res crops,
not a transcription gap) or merged into a single combined-marker verse
(e.g. 1:11-13); both cases are already folded into the sequential
renumbering, so EXPECTED_COUNTS below reflects the final post-renumbering
totals, not Kahana's raw native numbers. No sourceVerseRemap.js entry
needed (every chapter has full row coverage, 1:1 mapping).

THIS SCRIPT WRITES text_paleo DIRECTLY AT INSERT TIME, same as every HEB
ingest from server/ingest_heb_baruch.py onward. Straight Python port of
paleo-migrate.mjs's own sqToPaleo(): strips niqqud (U+0591-U+05C7), maps
final-form letters to base form, maps each square-Hebrew letter to its
PALEO_LETTERS entry from src/lib/books.js. Re-copy from src/lib/books.js if
that file's PALEO_LETTERS array ever changes.

NOT YET RUN. Device-bridge sandbox cannot reliably touch corpus.db live in
WAL mode -- run this directly on the machine that holds the file.

Usage (from paleo-studio/server, cwd containing corpus.db and
heb_testmoses_import.json):

    python3 ingest_heb_testmoses.py            # apply
    python3 ingest_heb_testmoses.py --dry       # show plan only, no writes

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
IMPORT_JSON = "heb_testmoses_import.json"
NEW_CODE = "ASSUMPTION_OF_MOSES"
CORPUS = "HEB"
CANON_ID = 126
SRC = "kahana1936:alit-moshe"
CONF = "kahana-pd"
CATEGORY = "pseudepigrapha"
TITLE = "Assumption of Moses (Hebrew)"
EXPECTED_COUNTS = {
    "1": 16, "2": 9, "3": 13, "4": 8, "5": 6, "6": 7, "7": 9, "8": 5,
    "9": 6, "10": 14, "11": 15, "12": 11,
}

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
                sys.exit(f"chapter {ch} verse {v['verse']}: empty text -- aborting")
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
            diffs = [(k, got.get(k), EXPECTED_COUNTS.get(k)) for k in set(got) | set(EXPECTED_COUNTS) if got.get(k) != EXPECTED_COUNTS.get(k)]
            raise RuntimeError(f"post-insert count mismatch -- rolling back: {diffs}")

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
        for ch, v in (("1", "1"), ("9", "1"), ("12", str(EXPECTED_COUNTS["12"]))):
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
    print('   126: ("Assumption of Moses", [("ENG","ASSUMPTION_OF_MOSES"), ("HEB","ASSUMPTION_OF_MOSES")]),')
    print("No further manual edit needed for that file.")


if __name__ == "__main__":
    main()
