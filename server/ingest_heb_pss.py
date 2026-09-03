#!/usr/bin/env python3
"""
ingest_heb_pss.py -- add the new HEB (Hebrew) source for canon_id 83
("Psalms of Solomon"), from server/heb_pss_import.json.

Source: Menachem Stein's 1936 Hebrew translation ("מזמורי שלמה"), one of
the volumes in Abraham Kahana's anthology (public domain). 32-page scan
(real text is pages 7-32; pages 1-6 are title/מבוא introduction discussing
manuscript history and bibliography, skipped), downloaded from Wikimedia
Commons via browser-triggered blob download, staged into server/.

Chapter mapping: STRAIGHT 1:1 with the standard scholarly 18-chapter
division (same division used by every other source for this book already
in corpus.db -- ENG/PSALMS_OF_SOLOMON, LXX/Pss, SYR/PSS -- and referenced
explicitly in Stein's own bibliography, which cites Ryle & James 1891,
Swete 1894, Gebhardt 1895, etc.). No re-keying needed, confirmed via the
page's own running headers throughout (e.g. "מזמורי שלמה ב ב-טו" = ch.2
verses 2-15, "מזמורי שלמה יח יב" = ch.18 verse 12, the book's own final
verse).

Stein's own verse numbering is denser/sparser than English's in the usual
cross-translation way seen in every earlier book in this series -- verse
numbers in the import JSON are sequential (1..N) in Stein's own reading
order per chapter, not forced to match English's verse splits. A handful
of native verse-pairs are combined under Stein's own margin numbering
(2:14-15, 4:18-19, 8:3-4, 14:5-6, 15:6-7, 16:13-14, 17:29-30) -- each
folded into a single sequential row here, same handling as prior books.

VERIFICATION NOTE: this book uses a two-hemistich poetic line layout
(verse text often split into a right-hand and left-hand half-line for
parallelism) which caused real transcription disagreements between
independent transcription passes on chapters 4, 8, and 11 (verse-boundary
misalignment in ch.4 and ch.8; hemistich reading-order reversal in ch.11).
All three were resolved by a dedicated re-verification pass that examined
each chapter's page images directly, cross-checking every Hebrew
letter-numeral's exact row position rather than trusting either original
transcription. Chapter 12 also turned out to have only 6 verses (not the
larger count a preliminary page-header survey estimated) -- confirmed
directly from the transcribed page content, which is authoritative over
the earlier rough survey.

Chapter 18 in this Hebrew source ends at verse 12 (matching the standard
critical-edition verse count for ch.18, e.g. Wright/Ryle-James), while
this app's own existing ENG/PSALMS_OF_SOLOMON text has verses 0-14 for
ch.18 (title + 14 lines) -- the extra ENG verses 13-14 correspond to a
disputed appended "hymn of creation" fragment that different manuscript
traditions divide differently; Stein's edition folds that content into
verse 12. This is ordinary cross-edition versification variance for this
specific chapter, not a transcription gap -- do not be alarmed by the
ENG/HEB ch.18 verse-count mismatch.

THIS SCRIPT WRITES text_paleo DIRECTLY AT INSERT TIME, same as every HEB
ingest from server/ingest_heb_baruch.py onward. Straight Python port of
paleo-migrate.mjs's own sqToPaleo(): strips niqqud (U+0591-U+05C7), maps
final-form letters to base form, maps each square-Hebrew letter to its
PALEO_LETTERS entry from src/lib/books.js. Re-copy from src/lib/books.js if
that file's PALEO_LETTERS array ever changes.

NOT YET RUN. Device-bridge sandbox cannot reliably touch corpus.db live in
WAL mode -- run this directly on the machine that holds the file.

Usage (from paleo-studio/server, cwd containing corpus.db and
heb_pss_import.json):

    python3 ingest_heb_pss.py            # apply
    python3 ingest_heb_pss.py --dry       # show plan only, no writes

WAL-safe: BEGIN IMMEDIATE + busy-timeout + retry loop, single transaction,
verify-before-commit, duplicate-guarded.

NOTE: canon_id 83 is below the 100-threshold that server/assign-canon-ids.py
tracks for pseudepigrapha re-runnability -- canon_id is set directly at
INSERT time below, same as Baruch (74). No assign-canon-ids.py edit needed
for this book.
"""
import argparse
import json
import os
import sqlite3
import sys
import time
import unicodedata

DB_PATH = "corpus.db"
IMPORT_JSON = "heb_pss_import.json"
NEW_CODE = "PSALMS_OF_SOLOMON"
CORPUS = "HEB"
CANON_ID = 83
SRC = "kahana1936:mizmorei-shlomo-stein"
CONF = "kahana-pd"
CATEGORY = "pseudepigrapha"
TITLE = "Psalms of Solomon (Hebrew)"
EXPECTED_COUNTS = {
    "1": 8, "2": 36, "3": 12, "4": 24, "5": 19, "6": 6, "7": 10, "8": 33,
    "9": 11, "10": 8, "11": 9, "12": 6, "13": 12, "14": 9, "15": 12,
    "16": 14, "17": 45, "18": 12,
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
        for ch, v in (("1", "1"), ("17", "1"), ("18", str(EXPECTED_COUNTS["18"]))):
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
    print("canon_id 83 is below assign-canon-ids.py's 100-threshold -- no edit needed there")
    print("(canon_id was set directly at INSERT time, same as Baruch/canon 74).")


if __name__ == "__main__":
    main()
