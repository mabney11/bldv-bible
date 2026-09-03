#!/usr/bin/env python3
"""
ingest_josephus_antiquities.py -- LAST and by far LARGEST of the four
Josephus works. Adds THREE new corpus rows (ENG, GRC, HEB) sharing one new
canon_id=220, promoted into the book dropdown / parallel reader like Life
(217), Against Apion (218), and The Jewish War (219).

"Antiquities of the Jews" ("Jewish Antiquities" / Ἰουδαϊκὴ ἀρχαιολογία) has
TWENTY books, 7376 Niese verses total:
  book1=346  book2=349  book3=322  book4=331  book5=362  book6=378
  book7=394  book8=420  book9=291  book10=281 book11=347 book12=434
  book13=433 book14=491 book15=425 book16=404 book17=355 book18=379
  book19=366 book20=268
1.8x The Jewish War's 4001 verses, 12x Against Apion's 616 -- this project's
largest single ingest.

Sources (see project memory project_paleo-studio_josephus.md for the full
research writeup):
  - ENG: William Whiston's 1737 translation, Perseus TEI edition
    tlg0526.tlg001.perseus-eng2 (CC BY-SA 4.0, Perseus Project). 1444 native
    Whiston_section-marked spans -- far coarser than Niese's 7376-way Greek
    granularity.
  - GRC: Benedikt Niese's 1885-1890 critical Greek text, Perseus TEI edition
    tlg0526.tlg001.perseus-grc2 (same license). Both pulled from
    github.com/PerseusDL/canonical-greekLit and parsed from the EpiDoc TEI
    XML with lxml, same extraction pattern as Life/Apion/War. GRC is 100%
    Greek script throughout -- no Latin-fallback branching needed (unlike
    Apion), single `conf` value for GRC.
  - HEB: TWO DISTINCT PROVENANCES, per-row `heb_is_ai_generated` flag,
    mirroring Apion's grc_is_latin_fallback per-row branching pattern:
      * Books 1-8 (2902 verses) -- Alexander Shor's real 1939 Hebrew
        translation, קדמוניות היהודים (from Greek), benyehuda.org/read/29430.
        Shor's translation covers ONLY books 1-8 of 20 (confirmed via an
        explicit footnote in the source itself) -- extracted via chunked
        browser-tool get_page_text (content-anchor stitching, same method
        as Life/Apion/War), then mechanically split into per-Niese-verse
        pieces using the inline Niese verse-number markers Shor himself
        embeds in the running prose (two coexisting formats: bare
        whitespace-delimited digits, and bracketed "[N]"/"[N " -- see
        split_heb_1_8.py). 2901/2902 markers found mechanically; the one
        genuine gap (book1 verse 315, no inline marker in the source) was
        recovered via content-verified splitting against the Greek, per
        fieldy's "full text, nothing omitted" standard -- real Shor prose,
        not invented. conf="benyehuda-shor".
      * Books 9-20 (4474 verses) -- Shor's translation does not cover these
        books at all (source-documented, not a defect). Per fieldy's
        explicit 2026-09-01 instruction -- "these people did not write the
        original documents, they have no right to keep the information out
        of my corpus... keep digging or better yet you could use the
        knowledge of my corpus... create hebrew text for the words that are
        used... and we reverse translate to get hebrew that would have the
        same usage anywhere else in my corpus" -- an ORIGINAL Hebrew
        translation was produced for these 12 books, grounded directly in
        the Niese Greek content verse-by-verse, using a shared/collabora-
        tively-extended terminology guide (terminology_guide.json) across
        ~120 parallel translation-batch agent dispatches to keep proper
        nouns, divine/institutional terminology, and register (unvocalized,
        vav-consecutive biblical-narrative Hebrew, sparing maqaf) consistent
        with the rest of this corpus's Hebrew lexicon. Every verse
        programmatically verified non-empty and free of full vocalization
        (a handful of isolated single-niqqud disambiguation marks in the
        REAL Shor text, books 1-8, are expected/genuine and left untouched;
        zero such marks appear anywhere in the AI-generated books 9-20 text).
        This is original translation work grounded in the Greek, not a
        paraphrase or summary -- distinct, honestly-labeled provenance:
        conf="ai-generated-corpus-terminology", src="paleo-studio:ai-original-translation".

NUMBERING / ALIGNMENT METHODOLOGY: Niese's Greek section numbers are the
master verse index (same corrected approach as Life/Apion/War). Whiston's
English has no per-Niese-verse granularity, and getting it there would mean
another alignment pass at roughly the same scale as the just-finished
Hebrew translation work -- when asked, fieldy explicitly chose (AskUserQuestion,
2026-09-02) "English by containing section (fast, still complete)" over
full per-verse alignment. So ENG is NOT split to per-verse content like
GRC/HEB: each Niese verse's `eng` cell holds the FULL TEXT of the Whiston
section/span it falls within (native Whiston_chapter/Whiston_section
milestones + div_n start-anchors, see build_eng_mapping.py) -- consecutive
verses inside one Whiston span show IDENTICAL English text. Nothing is
omitted or wrong, it is simply coarser-grained than GRC/HEB, and is
upgradeable later to full per-verse alignment (matching Life/Apion/War)
without touching any GRC or HEB data. One data glitch in book 17 (a stray
div_n="13" at Whiston 13.1, breaking monotonic order) was clamped during
mapping so ranges stay non-decreasing; harmless, affects only which of two
adjacent Whiston spans' text a handful of book-17 verses show.

DATA QUALITY -- ZERO empty cells out of 22128 total (7376 verses x 3
languages), verified programmatically before writing the import JSON
(build_import_json.py). Per fieldy's standing "full text, nothing omitted"
instruction, no cell was left blank and no "genuine source gap" shortcuts
were taken without full recovery (see book1 v315 above, the one candidate
gap, and how it was recovered).

THIS SCRIPT WRITES text_paleo INLINE for the HEB rows only (ENG/GRC rows get
NULL text_paleo, matching every other non-Hebrew corpus in the DB) -- same
sq_to_paleo() port as ingest_josephus_life.py / ingest_josephus_apion.py /
ingest_josephus_war.py, copied verbatim from src/lib/books.js's
PALEO_LETTERS (re-copy it here if books.js ever changes that array).

NOT YET RUN -- same device-bridge/WAL limitation as every other ingest
script in this repo: the bridge sandbox cannot reliably BEGIN IMMEDIATE
against corpus.db while it's open live in WAL mode. Run this directly on
the machine that holds the file.

Usage (from paleo-studio/server, i.e. cwd containing corpus.db and the three
josephus_antiquities_import.part{1,2,3}.json files):

    python3 ingest_josephus_antiquities.py            # apply
    python3 ingest_josephus_antiquities.py --dry       # show plan only, no writes

WAL-safe: BEGIN IMMEDIATE + busy-timeout + retry loop, single transaction,
verify-before-commit, duplicate-guarded (checks for existing books rows /
canon_id=220 verses before writing anything).

Two manual steps after this succeeds (plain file edits, zero DB risk):
  1. server/assign-canon-ids.py -- add canon_id 220 to REGISTRY.
  2. server/book-order.json -- add canon_id 220 (near 217/218/219, fieldy
     will rearrange later).
"""
import argparse
import json
import os
import sqlite3
import sys
import time
import unicodedata

DB_PATH = "corpus.db"
# Split into 3 part-files (~7-9MB each) because the combined ~25MB single
# JSON exceeds the device-bridge's 20MB per-file commit limit. Loaded and
# concatenated in order below -- semantically identical to one big file.
IMPORT_JSON_PARTS = [
    "josephus_antiquities_import.part1.json",
    "josephus_antiquities_import.part2.json",
    "josephus_antiquities_import.part3.json",
]
CANON_ID = 220
TITLE = "Antiquities of the Jews"
BOOKS = {
    1: 346, 2: 349, 3: 322, 4: 331, 5: 362, 6: 378, 7: 394, 8: 420,
    9: 291, 10: 281, 11: 347, 12: 434, 13: 433, 14: 491, 15: 425,
    16: 404, 17: 355, 18: 379, 19: 366, 20: 268,
}
TOTAL_VERSES = sum(BOOKS.values())  # 7376

# one books-row + one verses-block per language. HEB's own conf is decided
# per-row (see LANGS["heb"]["conf_shor"] / conf_ai below) because part of
# the Hebrew (books 9-20) is original AI translation, not Shor's real 1939
# translation (which covers only books 1-8) -- same per-row-branching
# pattern as Apion's grc_is_latin_fallback.
LANGS = {
    "eng": dict(corpus="ENG", code="JOSEPHUS_ANT", category="josephus-en",
                src="perseus:tlg0526.tlg001.perseus-eng2", conf="perseus-whiston"),
    "grc": dict(corpus="GRC", code="urn:cts:greekLit:tlg0526.tlg001.perseus-grc2", category="josephus",
                src="perseus:tlg0526.tlg001.perseus-grc2", conf="perseus-niese"),
    "heb": dict(corpus="HEB", code="JOSANT", category="josephus",
                src_shor="benyehuda:29430:shor1939", conf_shor="benyehuda-shor",
                src_ai="paleo-studio:ai-original-translation", conf_ai="ai-generated-corpus-terminology"),
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
    ap.add_argument("--json-parts", nargs="+", default=IMPORT_JSON_PARTS)
    ap.add_argument("--dry", action="store_true")
    A = ap.parse_args()

    if not os.path.exists(A.db):
        sys.exit(f"corpus.db not found at {A.db!r} -- run this from server/, or pass --db")
    for p in A.json_parts:
        if not os.path.exists(p):
            sys.exit(f"{p!r} not found -- expected all part-files alongside this script")

    data = []
    for p in A.json_parts:
        data.extend(json.load(open(p, encoding="utf-8")))
    if len(data) != TOTAL_VERSES:
        sys.exit(f"expected {TOTAL_VERSES} verse rows across {A.json_parts}, found {len(data)} -- aborting")

    # validate structure: every (book, verse) 1..N present exactly once per book,
    # and ZERO empty cells anywhere (per fieldy's "no omissions" standard --
    # unlike War's original ingest, there is no EXPECTED_EMPTY allowlist here).
    seen = {}
    unexpected_empty = []
    n_ai = 0
    for row in data:
        b, v = row["book"], row["verse"]
        if b not in BOOKS:
            sys.exit(f"row has unknown book {b!r} -- aborting")
        seen.setdefault(b, set()).add(v)
        for lang in ("eng", "grc", "heb"):
            if not row.get(lang, "").strip():
                unexpected_empty.append((lang, b, v))
        if row.get("heb_is_ai_generated"):
            n_ai += 1
    if unexpected_empty:
        sys.exit(f"found {len(unexpected_empty)} EMPTY cells (first 10: {unexpected_empty[:10]}) "
                  f"-- aborting, this ingest requires zero empty cells")
    for b, n in BOOKS.items():
        expected = set(range(1, n + 1))
        if seen.get(b) != expected:
            missing = expected - seen.get(b, set())
            extra = seen.get(b, set()) - expected
            sys.exit(f"book {b}: verse set mismatch -- missing={sorted(missing)[:10]} "
                      f"extra={sorted(extra)[:10]} -- aborting")

    print(f"loaded {len(data)} verse rows from {A.json_parts} across {len(BOOKS)} books, "
          f"zero empty cells confirmed. HEB provenance: {len(data) - n_ai} Shor (real, books 1-8), "
          f"{n_ai} AI-generated (books 9-20).")

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
                if lang == "heb":
                    is_ai = bool(row.get("heb_is_ai_generated"))
                    src = cfg["src_ai"] if is_ai else cfg["src_shor"]
                    conf = cfg["conf_ai"] if is_ai else cfg["conf_shor"]
                    paleo = sq_to_paleo(text)
                else:
                    src = cfg["src"]
                    conf = cfg["conf"]
                    paleo = None
                ref_key = f"{cfg['corpus']}:{cfg['code']}:{b}:{v}"
                # ord_c/ord_v: book number carries the chapter ordering, verse is the
                # Niese section number within that book (same pattern as Life/Apion/War)
                cur.execute(insert_verse_sql, (
                    ref_key, book_id, cfg["corpus"], cfg["code"], str(b), str(v),
                    b, v, text, cfg["category"], src, conf, CANON_ID, paleo))

        # verify before commit
        for lang, cfg, book_id in plan:
            n = cur.execute(
                "SELECT COUNT(*) FROM verses WHERE corpus=? AND code=? AND canon_id=?",
                (cfg["corpus"], cfg["code"], CANON_ID)).fetchone()[0]
            if n != TOTAL_VERSES:
                raise RuntimeError(f"{lang}: post-insert count mismatch -- got {n}, expected {TOTAL_VERSES}, rolling back")

        n_missing_paleo = cur.execute(
            "SELECT COUNT(*) FROM verses WHERE corpus='HEB' AND code=? AND canon_id=? "
            "AND text_paleo IS NULL",
            (LANGS["heb"]["code"], CANON_ID)).fetchone()[0]
        if n_missing_paleo:
            raise RuntimeError(f"{n_missing_paleo} HEB rows have NULL text_paleo after insert -- rolling back")

        n_shor_db = cur.execute(
            "SELECT COUNT(*) FROM verses WHERE corpus='HEB' AND code=? AND canon_id=? AND conf=?",
            (LANGS["heb"]["code"], CANON_ID, LANGS["heb"]["conf_shor"])).fetchone()[0]
        n_ai_db = cur.execute(
            "SELECT COUNT(*) FROM verses WHERE corpus='HEB' AND code=? AND canon_id=? AND conf=?",
            (LANGS["heb"]["code"], CANON_ID, LANGS["heb"]["conf_ai"])).fetchone()[0]
        if n_shor_db != 2902 or n_ai_db != 4474:
            raise RuntimeError(f"HEB provenance split mismatch after insert -- shor={n_shor_db} (expect 2902), "
                                f"ai={n_ai_db} (expect 4474), rolling back")

        con.commit()
        print(f"COMMITTED: {len(plan)} books rows, {len(plan) * TOTAL_VERSES} verses rows total, "
              f"canon_id={CANON_ID}, text_paleo populated on all HEB rows, zero empty cells, "
              f"HEB split confirmed: {n_shor_db} Shor (real) + {n_ai_db} AI-generated.")

        print()
        print("Spot-check (verify square + paleo both render correctly, not mojibake):")
        for b, v in ((1, 1), (1, 346), (8, 420), (9, 1), (20, 268)):
            cur.execute(
                "SELECT text, text_paleo, conf FROM verses WHERE corpus='HEB' AND code=? AND chapter=? AND verse=?",
                (LANGS["heb"]["code"], str(b), str(v)))
            r = cur.fetchone()
            if r:
                print(f"  HEB book {b} verse {v} conf={r[2]} square -> {r[0][:70]}")
                print(f"  HEB book {b} verse {v} paleo -> {r[1][:70]}")
        print()
        print("Spot-check (confirm GRC has no Latin-fallback conf, single conf value):")
        cur.execute(
            "SELECT COUNT(DISTINCT conf) FROM verses WHERE corpus='GRC' AND code=? AND canon_id=?",
            (LANGS["grc"]["code"], CANON_ID))
        print(f"  distinct GRC conf values: {cur.fetchone()[0]} (expect 1)")
        print()
        print("Spot-check (ENG containing-section: consecutive verses in same Whiston span share text):")
        cur.execute(
            "SELECT verse, text FROM verses WHERE corpus='ENG' AND code=? AND chapter='1' AND canon_id=? "
            "AND verse IN (7,8,9) ORDER BY verse",
            (LANGS["eng"]["code"], CANON_ID))
        for v, t in cur.fetchall():
            print(f"  ENG book1 verse {v} len={len(t)} -> {t[:50]!r}")

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
    print("  2. server/book-order.json -- add canon_id 220 wherever fieldy wants it to sort")
    print("     (near canon_id 217/218/219 and the other promoted historical writings, not")
    print("     inside the Bible canon proper).")


if __name__ == "__main__":
    main()
