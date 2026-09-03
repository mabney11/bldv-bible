#!/usr/bin/env python3
"""
ingest_heb_testjob.py -- add the new HEB (Hebrew) source for canon_id 119
("Testament of Job"), from server/heb_testjob_import.json.

Source: Abraham Kahana's 1936 anthology, the volume "דברי איוב" (Divrei
Iyov / "The Words of Job", i.e. the Testament of Job) -- Kahana's own solo
translation (public domain: he died 1946, PD in Israel since 2016). 24-page
scan (real text is pages 6-24; pages 1-5 are title/מבוא introduction and
bibliography, skipped), downloaded from Wikimedia Commons via
browser-triggered blob download, staged into server/.

STRUCTURAL MISMATCH (the inverse of 2 Enoch's problem): this app's own
existing English text for canon_id 119 uses a non-standard, CONDENSED
12-chapter division (343 verses) -- not the well-known scholarly ~53-chapter
division (M.R. James' 1897 edition, which Kahana's own introduction
explicitly references). Kahana's Hebrew translation instead uses the
standard FINE-GRAINED division: 52 native chapters, 360 verses total,
confirmed via running page headers throughout the scan. So instead of
2 Enoch's problem (coarse native chapters needing to be split across many
English chapters), this book has the opposite problem: many small native
chapters need to be MERGED into this app's 12 broad display chapters.

Per fieldy's explicit decision for 2 Enoch's version of this same category
of problem ("Full manual re-key to standard [N] chapters" -- the most
correct of the offered options), the same full-manual-re-key approach was
applied here without re-asking, given the already-stated preference.

METHODOLOGY (mirrors 2 Enoch): all 52 native chapters (360 verses) were
transcribed in full from the Kahana scan by parallel agents, preserving
Kahana's own chapter:verse numbers. A header-survey agent first confirmed
the native chapter range (1-52) and page spans. Separately, this app's own
12-chapter English text was read in full (by me, directly) to establish
content anchor points. Then 7 parallel content-alignment agents, each
given a contiguous block of native chapters plus a generous candidate
window of 2-3 app display chapters, matched every native verse to a
specific app chapter by MEANING (not by verse-number arithmetic -- there
is no fixed ratio). All 360 native verse-entries were successfully
assigned with zero gaps and zero duplicate assignments; alignment
boundaries were independently cross-checked between adjacent agent batches
(e.g. native ch.41:1 "Eliphaz and the others sat by me... spoke boastful
words" is a near-verbatim match to this app's own English 10:1, confirming
the ch.9/ch.10 boundary falls at the native ch.40/ch.41 seam). Within each
resulting app chapter, verses were renumbered sequentially in native
reading order (native chapter ascending, then native verse ascending) --
these new sequential numbers are NOT Kahana's own verse numbers (which
include combined-verse markers like "4-5" throughout his text; those
combined verses became single sequential rows here, same convention as
every earlier book in this series).

NOTE on cross-checking against this app's ENG table: canon_id 119's
existing ENG chapter 9 has a pre-existing duplicate-row artifact (39 raw
rows but only 20 distinct verse numbers) already present in corpus.db,
unrelated to this HEB ingest -- do not be alarmed if a row-count diff
against ENG chapter 9 looks off; it is a pre-existing ENG-side data
artifact, not a HEB alignment problem. (Not fixed here -- out of scope for
this ingest; flagging for awareness only.)

A handful of native verse-pairs are combined under Kahana's own margin
numbering (e.g. native 3:"4-5", 41:"6-7") -- these are folded into a single
sequential row here, same handling as prior books.

Chapter-level verse totals after re-keying (app chapter: HEB verse count):
  1:31  2:23  3:39  4:31  5:26  6:30  7:44  8:33  9:22  10:29  11:33  12:19
  (total 360; the app's own ENG text has 343 verses across the same 12
  chapters -- the discrepancy is ordinary cross-translation verse-density
  variance, same as every earlier book in this series, not a structural
  problem.)

THIS SCRIPT WRITES text_paleo DIRECTLY AT INSERT TIME, same as every HEB
ingest from server/ingest_heb_baruch.py onward. Straight Python port of
paleo-migrate.mjs's own sqToPaleo(): strips niqqud (U+0591-U+05C7), maps
final-form letters to base form, maps each square-Hebrew letter to its
PALEO_LETTERS entry from src/lib/books.js. Re-copy from src/lib/books.js if
that file's PALEO_LETTERS array ever changes.

NOT YET RUN. Device-bridge sandbox cannot reliably touch corpus.db live in
WAL mode -- run this directly on the machine that holds the file.

Usage (from paleo-studio/server, cwd containing corpus.db and
heb_testjob_import.json):

    python3 ingest_heb_testjob.py            # apply
    python3 ingest_heb_testjob.py --dry       # show plan only, no writes

WAL-safe: BEGIN IMMEDIATE + busy-timeout + retry loop, single transaction,
verify-before-commit, duplicate-guarded.

IMPORTANT -- after this script commits, server/assign-canon-ids.py needs a
manual one-line edit (this script prints the exact line to add at the end,
same as every prior canon_id >= 100 book): the existing line for canon 119
currently reads
    119: ("Testament of Job",       [("ENG","TESTAMENT_OF_JOB")]),
and needs a ("HEB","TESTAMENT_OF_JOB") tuple added to the list.
"""
import argparse
import json
import os
import sqlite3
import sys
import time
import unicodedata

DB_PATH = "corpus.db"
IMPORT_JSON = "heb_testjob_import.json"
NEW_CODE = "TESTAMENT_OF_JOB"
CORPUS = "HEB"
CANON_ID = 119
SRC = "kahana1936:divrei-iyov"
CONF = "kahana-pd"
CATEGORY = "pseudepigrapha"
TITLE = "Testament of Job (Hebrew)"
EXPECTED_COUNTS = {
    "1": 31, "2": 23, "3": 39, "4": 31, "5": 26, "6": 30,
    "7": 44, "8": 33, "9": 22, "10": 29, "11": 33, "12": 19,
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
    print("server/assign-canon-ids.py NEEDS a manual one-line edit -- change:")
    print('   119: ("Testament of Job",       [("ENG","TESTAMENT_OF_JOB")]),')
    print("to:")
    print('   119: ("Testament of Job",       [("ENG","TESTAMENT_OF_JOB"), ("HEB","TESTAMENT_OF_JOB")]),')


if __name__ == "__main__":
    main()
