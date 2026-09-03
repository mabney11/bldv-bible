#!/usr/bin/env python3
"""
ingest_josephus_life.py -- pilot ingest for "Life of Flavius Josephus", the
first of four Josephus works planned for the app (Antiquities of the Jews,
The Jewish War, Against Apion, Life -- "major and minor works", per fieldy
2026-09-01). Adds THREE new corpus rows (ENG, GRC, HEB) sharing one new
canon_id=217, promoted into the book dropdown / parallel reader like
Jasher/the Testaments (fieldy's explicit choice, not Works-Library-only).

Sources (see project memory project_paleo-studio_josephus.md for the full
research writeup):
  - ENG: William Whiston's 1895 translation, Perseus Digital Library TEI
    edition tlg0526.tlg002.perseus-eng2 (CC BY-SA 4.0, Perseus Project).
  - GRC: Benedikt Niese's 1885-1890 critical Greek text, Perseus TEI edition
    tlg0526.tlg002.perseus-grc2 (same license).
    Both pulled from github.com/PerseusDL/canonical-greekLit (raw, master
    branch) and parsed from the EpiDoc TEI XML with lxml -- exact text, no
    AI summarization involved in extraction.
  - HEB: Menachem Stein's Hebrew translation (Masada, 1959), from Project
    Ben-Yehuda (benyehuda.org/read/22346) -- extracted verbatim via the
    browser tool's get_page_text (real DOM text, not summarized), footnote/
    endnote apparatus stripped, 76 chapter blocks recovered from the "פרק
    <number>: <title>" headers.

Numbering: Josephus's "Life" has no book subdivision -- one continuous
work, so chapter is constant '1' for every row in every language. GRC's
own TEI file uses Niese's fine section numbers (1-430) as its native
division -- used here as the master "verse" index, matching fieldy's
explicit instruction (2026-09-01) to use Greek granularity as source of
truth and make English/Hebrew match it verse-for-verse, not just show
duplicated paragraph blocks.

Neither the ENG (Whiston, 1737) nor the HEB (Stein, 1959) source actually
divides this work at Niese's 430-section granularity -- both only have 76
native paragraph/chapter breaks (confirmed: even the Loeb/Thackeray 1926
translation's own inline paragraph numbers only reach 76, the real Niese
numbers exist just in the printed margin and were not recoverable from any
OCR text tried). So getting real per-verse ENG/HEB text required actually
SPLITTING each of the 76 source paragraphs into per-Niese-verse pieces,
guided by the Greek content at each Niese verse (proper nouns, numbers,
narrative beats used as cross-language anchors) -- this is content
alignment, not just reformatting. Every word of the original ENG/HEB
paragraph text is preserved somewhere in the split (verified
programmatically: concatenating a paragraph's pieces back together
reproduces the original paragraph exactly) -- nothing was paraphrased,
summarized, or invented; only WHERE to cut was a judgment call. 9 of the
76 paragraphs needed a genuine judgment call on an ambiguous cut point
(noted per-span in project memory project_paleo-studio_josephus.md, e.g.
a clause that grammatically straddles two Niese verses) -- these are
defensible but not zero-ambiguity, worth fieldy's spot-check.

ONE KNOWN GAP: Niese verse 365's ENG text is empty (row_365_eng_empty
below) -- not a bug. The 1737 Whiston translation itself only paraphrases
one of "two letters" Josephus says he's quoting from King Agrippa (Niese
365-366); the second letter (365) simply isn't in Whiston's English at
all, verified directly against the source TEI XML. The HEB (Stein, 1959)
translation is more complete here and has real text for both letters --
so HEB verse 365 is NOT empty, only ENG is. Left as an empty string
per the no-invention rule rather than fabricating a translation.

A real bug was caught and fixed while building this: the first extraction
pass used lxml to strip <note> (footnote) elements out of the ENG XML, but
naively removing a note also deletes its lxml `.tail` text (everything
between </note> and the next tag) -- silently dropping real body text
immediately after 22 of the 76 footnotes. Fixed by re-parenting each
note's tail onto the previous sibling (or the parent's own text) before
removing it; all 22 affected paragraphs were re-extracted and re-aligned
from the corrected text. Worth remembering for any future TEI-XML note
stripping in this project -- the same bug will reappear silently if a
future ingest script removes <note> elements the naive way.

THIS SCRIPT WRITES text_paleo INLINE for the HEB rows only (ENG/GRC rows
get NULL text_paleo, matching every other non-Hebrew corpus in the DB) --
same sq_to_paleo() port as ingest_heb_baruch.py, copied verbatim from
src/lib/books.js's PALEO_LETTERS (re-copy it here if books.js ever changes
that array).

NOT YET RUN -- same device-bridge/WAL limitation as every other ingest
script in this repo (see ingest_heb_baruch.py's own docstring): the bridge
sandbox cannot reliably BEGIN IMMEDIATE against corpus.db while it's open
live in WAL mode. Run this directly on the machine that holds the file.

Usage (from paleo-studio/server, i.e. cwd containing corpus.db and
josephus_life_import.json):

    python3 ingest_josephus_life.py            # apply
    python3 ingest_josephus_life.py --dry       # show plan only, no writes

WAL-safe: BEGIN IMMEDIATE + busy-timeout + retry loop, single transaction,
verify-before-commit, duplicate-guarded (checks for existing books rows /
canon_id=217 verses before writing anything).

One more manual step after this succeeds (plain file edit, zero DB risk):
add canon_id 217 to server/assign-canon-ids.py's REGISTRY so re-runs of
that script keep it wired up, and add a book-order.json entry so it shows
up in the right place in the dropdown -- both left for fieldy / a follow-up
session, not touched by this script.
"""
import argparse
import json
import os
import sqlite3
import sys
import time
import unicodedata

DB_PATH = "corpus.db"
IMPORT_JSON = "josephus_life_import.json"
CANON_ID = 217
TITLE = "Life of Flavius Josephus"
TOTAL_VERSES = 430

# The one documented, verified exception to "every language non-empty on every
# row" -- see the module docstring's "ONE KNOWN GAP" note. Whiston's 1737
# English simply never translated this one letter; nothing was lost by us.
KNOWN_EMPTY = {(365, "eng")}

# one books-row + one verses-block per language
LANGS = {
    "eng": dict(corpus="ENG", code="JOSEPHUS_LIFE", category="josephus-en",
                src="perseus:tlg0526.tlg002.perseus-eng2", conf="perseus-whiston"),
    "grc": dict(corpus="GRC", code="urn:cts:greekLit:tlg0526.tlg002.perseus-grc2", category="josephus",
                src="perseus:tlg0526.tlg002.perseus-grc2", conf="perseus-niese"),
    "heb": dict(corpus="HEB", code="JOSLIFE", category="josephus",
                src="benyehuda:22346:stein1959", conf="benyehuda-stein"),
}

# --- paleo conversion (ported from paleo-migrate.mjs / src/lib/books.js --
# re-copy from there if PALEO_LETTERS ever changes) ---
SQUARE = list("אבגדהוזחטיכלמנסעפצקרשת")
PALEO_LETTERS = ['𐤀', '𐤁', '𐤂', '𐤃', '𐤄', '𐤅', '𐤆', '𐤇', '𐤈', '𐤉', '𐤊',
                 '𐤋', '𐤌', '𐤍', '𐤎', '𐤏', '𐤐', '𐤑', '𐤒', '𐤓', '𐤔', '𐤕']
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
    if len(data) != TOTAL_VERSES:
        sys.exit(f"expected {TOTAL_VERSES} verse rows in {A.json!r}, found {len(data)} -- aborting")
    for i, row in enumerate(data, start=1):
        if row["verse"] != i:
            sys.exit(f"row {i}: verse field is {row['verse']!r}, expected sequential {i} -- aborting")
        for lang in ("eng", "grc", "heb"):
            if not row.get(lang, "").strip() and (i, lang) not in KNOWN_EMPTY:
                sys.exit(f"row {i}: empty '{lang}' text -- aborting (no partial/placeholder rows "
                         f"outside the documented KNOWN_EMPTY exceptions)")

    print(f"loaded {len(data)} verse rows from {A.json} "
          f"({len(KNOWN_EMPTY)} documented empty-cell exception(s): {sorted(KNOWN_EMPTY)})")

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
        # duplicate guards
        for lang, cfg in LANGS.items():
            dupe = cur.execute(
                "SELECT COUNT(*) FROM books WHERE corpus=? AND code=?",
                (cfg["corpus"], cfg["code"])).fetchone()[0]
            if dupe:
                sys.exit(f"books already has a ({cfg['corpus']},{cfg['code']}) row -- aborting, nothing changed")
        existing_verses = cur.execute(
            "SELECT COUNT(*) FROM verses WHERE canon_id=?", (CANON_ID,)).fetchone()[0]
        if existing_verses:
            sys.exit(f"verses already has {existing_verses} rows for canon_id={CANON_ID} -- aborting")

        max_book_id = cur.execute("SELECT MAX(book_id) FROM books").fetchone()[0] or 0
        plan = []
        for lang, cfg in LANGS.items():
            max_book_id += 1
            plan.append((lang, cfg, max_book_id))
            print(f"  {lang}: book_id={max_book_id}  corpus={cfg['corpus']}  code={cfg['code']}")

        if A.dry:
            print(f"[dry] would insert {len(plan)} books rows and {len(plan) * TOTAL_VERSES} verses rows "
                  f"(canon_id={CANON_ID}), text_paleo populated inline for heb only")
            con.rollback()
            return

        insert_book_sql = (
            "INSERT INTO books (book_id, corpus, code, title, category, n_verses) VALUES (?, ?, ?, ?, ?, ?)")
        insert_verse_sql = (
            "INSERT INTO verses "
            "(ref_key, book_id, corpus, code, chapter, verse, ord_c, ord_v, "
            " text, category, src, conf, canon_id, text_paleo, text_src) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)")

        for lang, cfg, book_id in plan:
            cur.execute(insert_book_sql, (
                book_id, cfg["corpus"], cfg["code"], TITLE, cfg["category"], TOTAL_VERSES))
            for row in data:
                v = row["verse"]
                text = row[lang]
                paleo = sq_to_paleo(text) if lang == "heb" else None
                ref_key = f"{cfg['corpus']}:{cfg['code']}:1:{v}"
                cur.execute(insert_verse_sql, (
                    ref_key, book_id, cfg["corpus"], cfg["code"], "1", str(v),
                    1, v, text, cfg["category"], cfg["src"], cfg["conf"], CANON_ID, paleo))

        # verify before commit
        for lang, cfg, book_id in plan:
            n = cur.execute(
                "SELECT COUNT(*) FROM verses WHERE corpus=? AND code=? AND canon_id=?",
                (cfg["corpus"], cfg["code"], CANON_ID)).fetchone()[0]
            if n != TOTAL_VERSES:
                raise RuntimeError(f"{lang}: post-insert count mismatch -- got {n}, expected {TOTAL_VERSES}, rolling back")

        n_missing_paleo = cur.execute(
            "SELECT COUNT(*) FROM verses WHERE corpus='HEB' AND code=? AND canon_id=? "
            "AND (text_paleo IS NULL OR text_paleo='')",
            (LANGS["heb"]["code"], CANON_ID)).fetchone()[0]
        if n_missing_paleo:
            raise RuntimeError(f"{n_missing_paleo} HEB rows have no text_paleo after insert -- rolling back")

        con.commit()
        print(f"COMMITTED: {len(plan)} books rows, {len(plan) * TOTAL_VERSES} verses rows total, "
              f"canon_id={CANON_ID}, text_paleo populated on all HEB rows")

        print()
        print("Spot-check (verify square + paleo both render correctly, not mojibake):")
        for v in (1, 200, 430):
            cur.execute(
                "SELECT text, text_paleo FROM verses WHERE corpus='HEB' AND code=? AND verse=?",
                (LANGS["heb"]["code"], str(v)))
            r = cur.fetchone()
            if r:
                print(f"  HEB verse {v} square -> {r[0][:80]}")
                print(f"  HEB verse {v} paleo  -> {r[1][:80]}")

    except Exception:
        con.rollback()
        raise
    finally:
        con.close()

    print()
    print("Two source-file edits still to make by hand (plain files, zero DB risk):")
    print("  1. server/assign-canon-ids.py -- add a new REGISTRY entry:")
    print(f'       {CANON_ID}: ("{TITLE}", [("ENG","{LANGS["eng"]["code"]}"), '
          f'("GRC","{LANGS["grc"]["code"]}"), ("HEB","{LANGS["heb"]["code"]}")]),')
    print("  2. server/book-order.json -- add canon_id 217 wherever fieldy wants it to sort")
    print("     (probably near the other promoted pseudepigrapha/historical writings, not")
    print("     inside the Bible canon proper).")


if __name__ == "__main__":
    main()
