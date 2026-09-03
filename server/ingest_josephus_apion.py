#!/usr/bin/env python3
"""
ingest_josephus_apion.py -- second of four Josephus works ("major and minor
works", per fieldy 2026-09-01). Adds THREE new corpus rows (ENG, GRC, HEB)
sharing one new canon_id=218, promoted into the book dropdown / parallel
reader like Life (canon_id 217) and Jasher/the Testaments.

Unlike Life, "Against Apion" has TWO books (chapter='1'/'2' by book number,
matching the work's own native division -- no remap needed, book number is
identical between the English and Greek TEI files). Total 616 Niese verses
(book 1: 1-320, book 2: 1-296).

Sources (see project memory project_paleo-studio_josephus.md for the full
research writeup):
  - ENG: William Whiston's 1895 translation, Perseus TEI edition
    tlg0526.tlg003.perseus-eng2 (CC BY-SA 4.0, Perseus Project).
  - GRC: Benedikt Niese's 1885-1890 critical Greek text, Perseus TEI edition
    tlg0526.tlg003.perseus-grc2 (same license). Both pulled from
    github.com/PerseusDL/canonical-greekLit (raw, master branch) and parsed
    from the EpiDoc TEI XML with lxml -- exact text, no AI summarization in
    extraction. Notes/footnotes stripped with a tail-preserving remover (see
    "LESSON CARRIED FORWARD FROM LIFE" below).
  - HEB: Yaakov Naftali Simchoni's Hebrew translation (Masada, 1943), from
    Project Ben-Yehuda (benyehuda.org/read/22345) -- extracted verbatim via
    the browser tool's get_page_text, footnote apparatus (which for this
    work sits as ONE combined block at the very end of the whole document,
    not per-chapter) cut off at its start, 76 paragraph blocks (35 in book
    1, 41 in book 2) recovered from the Hebrew-letter "<letter>. " markers.

*** IMPORTANT TEXTUAL-HISTORY NOTE: PART OF THE "GREEK" IS ACTUALLY LATIN ***
Niese's edition -- and therefore the Perseus GRC file, and therefore this
ingest's "grc" column -- is NOT pure Greek for all of Book 2. The single
surviving Greek manuscript of Against Apion breaks off partway through Book
2; sections Niese 52-113 (62 of Book 2's 296 verses) survive ONLY in a 6th
century Latin translation (attributed to Cassiodorus's circle), which is
what Niese's own critical edition prints for that stretch -- there is no
Greek text to give here, in this edition or any other. This is a genuine,
well-documented feature of the work's transmission, not an extraction bug;
verified independently (script-detected: those 62 rows are majority Latin
script, not Greek, forming one clean contiguous range). Each affected row
is flagged `grc_is_latin_fallback: true` in the import JSON and gets a
distinct `conf` value below ("perseus-niese-latin-fallback" vs
"perseus-niese") so this is traceable in the DB itself, not just in this
comment -- worth surfacing in the UI at some point (e.g. a footnote/badge
on those verses) but that's a follow-up, not blocking this ingest.

LESSON CARRIED FORWARD FROM LIFE: the first Life ingest silently lost real
English text because `note.getparent().remove(note)` also discards the
note's lxml `.tail` (text between </note> and the next tag). This script's
extraction (already run, not re-run here) used a tail-preserving remover
from the start, so that bug is NOT present in this data -- flagged here
only as a standing reminder for any future Perseus TEI extraction in this
project.

Numbering / alignment methodology (same corrected approach as Life, per
fieldy's 2026-09-01 instruction to use Greek granularity as source of truth
and make English/Hebrew match it verse-for-verse, not duplicate whole
paragraphs): Niese's Greek section numbers are the master verse index.
Neither Whiston's English (77 native paragraphs: 35+42) nor Simchoni's
Hebrew (76 native paragraphs: 35+41) divides the work anywhere near 616-way
granularity, so both were actually SPLIT into per-Niese-verse pieces via
AI-assisted content alignment (proper nouns, numbers, narrative beats as
cross-language anchors), executed across 9 parallel batches (4 for book 1,
5 for book 2). Every split was verified programmatically: concatenating a
paragraph's pieces reproduces the original source paragraph exactly
(character-exact for English, verbatim-substring for Hebrew) -- nothing
paraphrased, summarized, or invented; only WHERE to cut was ever a
judgment call.

Book 1's Hebrew paragraph count (35) matches Whiston's English exactly,
1:1. Book 2's does NOT (41 Hebrew vs 42 English) -- located precisely: the
Simchoni Hebrew merges Whiston paragraphs 8 and 9 into one Hebrew
paragraph, with no paragraph break of its own at that point; verified by
content and split at the matching Greek/Latin sentence boundary. From that
point on, Hebrew paragraph idx N corresponds to Whiston paragraph N+1 for
the remainder of book 2 (constant offset, confirmed by content in every
subsequent batch, not just by numbering).

DATA QUALITY: unlike Life (which had one documented empty English cell),
Against Apion's ingest has ZERO empty cells across all 616 verses x 3
languages -- every row has real eng/grc/heb text (verified programmatically
before writing this script). Several genuine, pre-existing translation
variances were left untouched per the "don't alter wording, only decide
where to cut" rule (e.g. a few numeral discrepancies between the Greek/
Hebrew and Whiston's 1737 English reign-length figures; the Hebrew's own
occasional omission or relocation of a clause relative to the Greek) --
these are real historical-translation phenomena, not splitting artifacts,
and are documented per-span in the batch result files under /tmp/josephus_
apion/apion_batch_*_result.json if a closer audit is ever wanted.

THIS SCRIPT WRITES text_paleo INLINE for the HEB rows only (ENG/GRC rows
get NULL text_paleo, matching every other non-Hebrew corpus in the DB) --
same sq_to_paleo() port as ingest_josephus_life.py / ingest_heb_baruch.py,
copied verbatim from src/lib/books.js's PALEO_LETTERS (re-copy it here if
books.js ever changes that array).

NOT YET RUN -- same device-bridge/WAL limitation as every other ingest
script in this repo: the bridge sandbox cannot reliably BEGIN IMMEDIATE
against corpus.db while it's open live in WAL mode. Run this directly on
the machine that holds the file.

Usage (from paleo-studio/server, i.e. cwd containing corpus.db and
josephus_apion_import.json):

    python3 ingest_josephus_apion.py            # apply
    python3 ingest_josephus_apion.py --dry       # show plan only, no writes

WAL-safe: BEGIN IMMEDIATE + busy-timeout + retry loop, single transaction,
verify-before-commit, duplicate-guarded (checks for existing books rows /
canon_id=218 verses before writing anything).

One more manual step after this succeeds (plain file edit, zero DB risk):
add canon_id 218 to server/assign-canon-ids.py's REGISTRY, and a
book-order.json entry -- both left for fieldy / a follow-up session, same
as canon_id 217 (Life) still needs its own book-order.json placement too).
"""
import argparse
import json
import os
import sqlite3
import sys
import time
import unicodedata

DB_PATH = "corpus.db"
IMPORT_JSON = "josephus_apion_import.json"
CANON_ID = 218
TITLE = "Against Apion"
BOOKS = {1: 320, 2: 296}          # book number -> verse count
TOTAL_VERSES = sum(BOOKS.values())  # 616

# one books-row + one verses-block per language. GRC's own conf is decided
# per-row (see LANGS["grc"]["conf_normal"] / conf_latin below) because part
# of Book 2 is a Latin fallback, not Greek -- see module docstring.
LANGS = {
    "eng": dict(corpus="ENG", code="JOSEPHUS_APION", category="josephus-en",
                src="perseus:tlg0526.tlg003.perseus-eng2", conf="perseus-whiston"),
    "grc": dict(corpus="GRC", code="urn:cts:greekLit:tlg0526.tlg003.perseus-grc2", category="josephus",
                src="perseus:tlg0526.tlg003.perseus-grc2",
                conf_normal="perseus-niese", conf_latin="perseus-niese-latin-fallback"),
    "heb": dict(corpus="HEB", code="JOSAPION", category="josephus",
                src="benyehuda:22345:simchoni1943", conf="benyehuda-simchoni"),
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

    # validate structure: every (book, verse) 1..N present exactly once, sequential per book
    seen = {}
    for row in data:
        b, v = row["book"], row["verse"]
        if b not in BOOKS:
            sys.exit(f"row has unknown book {b!r} -- aborting")
        seen.setdefault(b, set()).add(v)
        for lang in ("eng", "grc", "heb"):
            if not row.get(lang, "").strip():
                sys.exit(f"row book={b} verse={v}: empty '{lang}' text -- aborting "
                          f"(Against Apion's data has zero documented empty cells; any empty "
                          f"cell here is unexpected and must be investigated before ingest)")
    for b, n in BOOKS.items():
        expected = set(range(1, n + 1))
        if seen.get(b) != expected:
            missing = expected - seen.get(b, set())
            extra = seen.get(b, set()) - expected
            sys.exit(f"book {b}: verse set mismatch -- missing={sorted(missing)[:10]} "
                      f"extra={sorted(extra)[:10]} -- aborting")

    n_latin = sum(1 for r in data if r.get("grc_is_latin_fallback"))
    print(f"loaded {len(data)} verse rows from {A.json} across {len(BOOKS)} books "
          f"({n_latin} rows flagged as Latin-fallback GRC text, book 2 Niese 52-113, "
          f"zero documented empty-cell exceptions)")

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
                  f"(canon_id={CANON_ID}, books={BOOKS}), text_paleo populated inline for heb only")
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
                b, v = row["book"], row["verse"]
                text = row[lang]
                paleo = sq_to_paleo(text) if lang == "heb" else None
                if lang == "grc":
                    conf = cfg["conf_latin"] if row.get("grc_is_latin_fallback") else cfg["conf_normal"]
                else:
                    conf = cfg["conf"]
                ref_key = f"{cfg['corpus']}:{cfg['code']}:{b}:{v}"
                # ord_c/ord_v: book number carries the chapter ordering, verse is the
                # Niese section number within that book (matches Life's chapter='1' pattern,
                # extended to book='1'/'2' here since Apion has real book subdivision)
                cur.execute(insert_verse_sql, (
                    ref_key, book_id, cfg["corpus"], cfg["code"], str(b), str(v),
                    b, v, text, cfg["category"], cfg["src"], conf, CANON_ID, paleo))

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

        n_latin_db = cur.execute(
            "SELECT COUNT(*) FROM verses WHERE corpus='GRC' AND code=? AND canon_id=? AND conf=?",
            (LANGS["grc"]["code"], CANON_ID, LANGS["grc"]["conf_latin"])).fetchone()[0]
        if n_latin_db != n_latin:
            raise RuntimeError(f"GRC latin-fallback row count mismatch after insert -- got {n_latin_db}, "
                                f"expected {n_latin}, rolling back")

        con.commit()
        print(f"COMMITTED: {len(plan)} books rows, {len(plan) * TOTAL_VERSES} verses rows total, "
              f"canon_id={CANON_ID}, text_paleo populated on all HEB rows, "
              f"{n_latin_db} GRC rows correctly marked as Latin-fallback text")

        print()
        print("Spot-check (verify square + paleo both render correctly, not mojibake):")
        for b, v in ((1, 1), (1, 320), (2, 1), (2, 296)):
            cur.execute(
                "SELECT text, text_paleo FROM verses WHERE corpus='HEB' AND code=? AND chapter=? AND verse=?",
                (LANGS["heb"]["code"], str(b), str(v)))
            r = cur.fetchone()
            if r:
                print(f"  HEB book {b} verse {v} square -> {r[0][:80]}")
                print(f"  HEB book {b} verse {v} paleo  -> {r[1][:80]}")
        print()
        print("Spot-check (confirm the Latin-fallback stretch reads as Latin, not Greek, and is flagged):")
        for v in (51, 52, 113, 114):
            cur.execute(
                "SELECT text, conf FROM verses WHERE corpus='GRC' AND code=? AND chapter='2' AND verse=?",
                (LANGS["grc"]["code"], str(v)))
            r = cur.fetchone()
            if r:
                print(f"  GRC book 2 verse {v} conf={r[1]} -> {r[0][:80]}")

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
    print("  2. server/book-order.json -- add canon_id 218 wherever fieldy wants it to sort")
    print("     (near canon_id 217/Life and the other promoted historical writings, not")
    print("     inside the Bible canon proper). Same still-open placement as 216 and 217.")


if __name__ == "__main__":
    main()
