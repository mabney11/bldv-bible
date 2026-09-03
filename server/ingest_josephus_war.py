#!/usr/bin/env python3
"""
ingest_josephus_war.py -- third of four Josephus works ("major and minor
works", per fieldy 2026-09-01). Adds THREE new corpus rows (ENG, GRC, HEB)
sharing one new canon_id=219, promoted into the book dropdown / parallel
reader like Life (217), Against Apion (218), Jasher/the Testaments.

"The Jewish War" ("The Wars of the Jews" in Whiston's title) has SEVEN
books, by far the largest Josephus work ingested so far: 4001 Niese verses
total (book1=673, book2=654, book3=542, book4=663, book5=572, book6=442,
book7=455) -- 6.5x Against Apion's 616 verses, and this project's largest
single ingest to date (Antiquities of the Jews, ~7396 verses / 20 books,
remains as the final and largest Josephus work still to come).

Sources (see project memory project_paleo-studio_josephus.md for the full
research writeup):
  - ENG: William Whiston's 1737 translation (Whiston_section milestones),
    Perseus TEI edition tlg0526.tlg004.perseus-eng2 (CC BY-SA 4.0, Perseus
    Project).
  - GRC: Benedikt Niese's 1885-1895 critical Greek text, Perseus TEI
    edition tlg0526.tlg004.perseus-grc2 (same license). Both pulled from
    github.com/PerseusDL/canonical-greekLit (raw, master branch) and parsed
    from the EpiDoc TEI XML with lxml -- exact text, no AI summarization in
    extraction. Notes/footnotes stripped with a tail-preserving remover
    (remove_note_preserve_tail(), same pattern as Life/Apion). Unlike
    Against Apion, War's Greek text is confirmed 100% Greek script
    throughout -- ZERO Latin-fallback verses (script-checked verse-by-verse
    before this ingest was written), so there is no grc_is_latin_fallback
    flag or conf-splitting logic needed here.
  - HEB: Yaakov Naftali Simchoni's Hebrew translation, from Project
    Ben-Yehuda (benyehuda.org, edition per its own colophon: Givatayim-Ramat
    Gan: Masada, 1970 printing of the Simchoni translation), extracted
    verbatim via the browser tool's get_page_text across 12 chunked
    javascript_tool calls (the whole ~1.15M-character page reconstructed
    with content-anchor-based stitching, not naive position offsets --
    UTF-16-vs-codepoint surrogate-pair drift from the page's own 🔗 link-icon
    glyphs made raw offsets unreliable at this scale). 703 paragraph blocks
    recovered from a THREE-level structure unique to this work among the
    Josephus ingests so far -- book > chapter > lettered paragraph (Life and
    Apion are only book > lettered paragraph, no distinct chapter level) --
    via chapter-header regex ("ספר <ordinal>" for book, "פרק <text>" or
    "פתיחה" for preface/chapter) and paragraph-letter regex. The work's
    entire endnotes/commentary apparatus ("הערות ובאורים") sits as ONE
    combined block at the very end of the whole page (covering all 7 books
    internally, not per-book/per-chapter) -- real content ends at "...כִּוַנתּי
    בכל הכתובים האלה." (position 807596 in the raw extracted text); this
    boundary was located precisely and double-checked by the final
    alignment batch, which confirmed the last Hebrew paragraph used is
    genuine closing narrative, not apparatus.

*** THIS WORK HAS NO LATIN-FALLBACK GREEK, UNLIKE AGAINST APION ***
Against Apion's Book 2 has a well-documented 62-verse Latin-only stretch
(the sole Greek manuscript breaks off mid-work). The Jewish War's Greek
manuscript tradition is complete and continuous -- verified verse-by-verse
via majority-script character counting (Greek vs Latin Unicode ranges)
across all 4001 rows before this ingest was written: zero rows flagged.
So unlike ingest_josephus_apion.py, there is only one `conf` value for GRC
here, no per-row branching needed.

NUMBERING / ALIGNMENT METHODOLOGY (same corrected approach as Life and
Apion, per fieldy's 2026-09-01 instruction to use Greek granularity as
source of truth and make English/Hebrew match it verse-for-verse, not
duplicate whole paragraphs): Niese's Greek section numbers are the master
verse index. Neither Whiston's English (707 native Whiston_section-marked
spans) nor Simchoni's Hebrew (703 native lettered paragraphs) divides the
work anywhere near 4001-way granularity, so both were SPLIT into
per-Niese-verse pieces via AI-assisted content alignment (proper nouns,
numbers, narrative beats as cross-language anchors), executed across 81
parallel batches of ~9 English spans each (batch size and rigor identical
to Life/Apion, per fieldy's explicit "Full scale, same method" choice when
asked how to handle this work's much larger scope). Every split was
verified programmatically: concatenating a span's eng pieces reproduces the
original Whiston paragraph exactly character-for-character; concatenating a
span's heb pieces (whitespace-normalized) is a verbatim substring of its
matched Hebrew source paragraph -- nothing paraphrased, summarized, or
invented; only WHERE to cut was ever a judgment call. A batching bug (an
early sort-key mistake -- sorting spans by the Whiston section number,
which resets to 1 at the start of every chapter, instead of by true
document order) was caught and fixed BEFORE any of the 81 alignment agents
were dispatched, so no wasted agent work resulted; flagged here as a
standing lesson for any future Josephus-scale (Antiquities) ingest.

DATA QUALITY -- ZERO empty cells out of 12003 total (4001 verses x 3
languages). An earlier draft of this script/docstring documented 29 cells
(1 ENG, 28 HEB) as "genuine pre-existing source gaps" and shipped them
empty; per fieldy's 2026-09-01 instruction -- "the source is not the most
important, but the content, I need full text and nothing omitted, even if
that's combining sources" -- every one of those was re-investigated and
turned out to be RECOVERABLE, not genuinely absent. See
fix_josephus_war_empty_cells.py (run once, after this script, directly
against the live corpus.db) for the patch and its full writeup, and
project memory project_paleo-studio_josephus.md for the methodology
lesson. Summary of what was actually wrong:
  - ENG book 7:208-209: NOT a source gap -- Perseus's TEI transcription of
    Whiston's 1737 translation is genuinely truncated mid-sentence at this
    exact point (confirmed against the raw TEI XML and cross-checked
    against multiple independent public digitizations of Whiston, which
    all show the identical truncation -- a shared upstream defect). The
    missing continuation was located at an independent, complete
    digitization (lexundria.com) and cross-validated against the Greek
    (Niese) content.
  - HEB book 5:491-501 and book 6:177-192: NOT gaps in Simchoni's Hebrew
    translation -- both spans of real, complete Hebrew text were silently
    dropped by a bug in this project's OWN paragraph-extraction regex
    (`r'(?:^|\n)([א-ת]{1,3})\. '`, which requires a Hebrew-letter paragraph
    marker followed by a literal period AND a literal space, and silently
    skips any paragraph whose marker doesn't match that exact shape --
    book 5 ch.12's first paragraph has no letter marker at all; book 6
    ch.3's paragraphs use "letter + space, no period" and "letter +
    period, no space" respectively). Both were recovered directly from the
    raw full-text extraction (bypassing the buggy parser) and re-split
    into per-Niese-verse pieces via the same content-anchor methodology as
    the rest of this ingest.
  - HEB book 3:190-191: not a gap -- a misattribution. The alignment agent
    had the correct Hebrew text available but assigned all of it to verse
    191 instead of splitting off verse 190's opening clause.
No cell was ever filled with invented, back-translated, or paraphrased
text -- every recovered cell is verbatim source text, verified by exact
reconstruction against its source paragraph, just like every other row in
this ingest.

THIS SCRIPT WRITES text_paleo INLINE for the HEB rows only (ENG/GRC rows
get NULL text_paleo, matching every other non-Hebrew corpus in the DB) --
same sq_to_paleo() port as ingest_josephus_life.py / ingest_josephus_apion.py
/ ingest_heb_baruch.py, copied verbatim from src/lib/books.js's
PALEO_LETTERS (re-copy it here if books.js ever changes that array). Empty
HEB cells get text_paleo='' (not NULL), consistent with an empty (not
missing) source text.

NOT YET RUN -- same device-bridge/WAL limitation as every other ingest
script in this repo: the bridge sandbox cannot reliably BEGIN IMMEDIATE
against corpus.db while it's open live in WAL mode. Run this directly on
the machine that holds the file.

Usage (from paleo-studio/server, i.e. cwd containing corpus.db and
josephus_war_import.json):

    python3 ingest_josephus_war.py            # apply
    python3 ingest_josephus_war.py --dry       # show plan only, no writes

WAL-safe: BEGIN IMMEDIATE + busy-timeout + retry loop, single transaction,
verify-before-commit, duplicate-guarded (checks for existing books rows /
canon_id=219 verses before writing anything).

One more manual step after this succeeds (plain file edit, zero DB risk):
add canon_id 219 to server/assign-canon-ids.py's REGISTRY, and a
book-order.json entry (per fieldy's "just add what we are getting, I'll
rearrange later" instruction already applied to 217/218).
"""
import argparse
import json
import os
import sqlite3
import sys
import time
import unicodedata

DB_PATH = "corpus.db"
IMPORT_JSON = "josephus_war_import.json"
CANON_ID = 219
TITLE = "The Jewish War"
BOOKS = {1: 673, 2: 654, 3: 542, 4: 663, 5: 572, 6: 442, 7: 455}  # book number -> verse count
TOTAL_VERSES = sum(BOOKS.values())  # 4001

# HISTORICAL NOTE: these 29 cells were flagged empty at the ORIGINAL ingest
# (see module docstring) and validated against this set at that time. All
# 29 were subsequently found to be recoverable, not genuine gaps, and were
# patched in place by fix_josephus_war_empty_cells.py -- corpus.db now has
# zero empty cells for canon_id=219. This set is kept only so this script
# still reproduces its original (pre-patch) validation behavior if ever
# run again from scratch against a fresh, empty corpus.db (e.g. to rebuild
# the DB from this repo); a from-scratch rebuild would need
# fix_josephus_war_empty_cells.py run afterward too, or josephus_war_import.json
# (which already has the corrected text baked in) used instead of relying
# on this script's original EXPECTED_EMPTY validation path.
EXPECTED_EMPTY = {
    ("eng", 7, 209),
    ("heb", 3, 190),
    ("heb", 5, 491), ("heb", 5, 492), ("heb", 5, 493), ("heb", 5, 494),
    ("heb", 5, 495), ("heb", 5, 496), ("heb", 5, 497), ("heb", 5, 498),
    ("heb", 5, 499), ("heb", 5, 500), ("heb", 5, 501),
    ("heb", 6, 177), ("heb", 6, 178), ("heb", 6, 179), ("heb", 6, 180),
    ("heb", 6, 181), ("heb", 6, 182), ("heb", 6, 183), ("heb", 6, 184),
    ("heb", 6, 185), ("heb", 6, 186), ("heb", 6, 187), ("heb", 6, 188),
    ("heb", 6, 189), ("heb", 6, 190), ("heb", 6, 191), ("heb", 6, 192),
}

# one books-row + one verses-block per language. No Latin-fallback branching
# needed here (unlike Apion) -- see module docstring.
LANGS = {
    "eng": dict(corpus="ENG", code="JOSEPHUS_WAR", category="josephus-en",
                src="perseus:tlg0526.tlg004.perseus-eng2", conf="perseus-whiston"),
    "grc": dict(corpus="GRC", code="urn:cts:greekLit:tlg0526.tlg004.perseus-grc2", category="josephus",
                src="perseus:tlg0526.tlg004.perseus-grc2", conf="perseus-niese"),
    "heb": dict(corpus="HEB", code="JOSWAR", category="josephus",
                src="benyehuda:simchoni1970", conf="benyehuda-simchoni"),
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

    # validate structure: every (book, verse) 1..N present exactly once per book,
    # and every empty cell is one of the documented, expected gaps.
    seen = {}
    unexpected_empty = []
    for row in data:
        b, v = row["book"], row["verse"]
        if b not in BOOKS:
            sys.exit(f"row has unknown book {b!r} -- aborting")
        seen.setdefault(b, set()).add(v)
        for lang in ("eng", "grc", "heb"):
            if not row.get(lang, "").strip():
                if (lang, b, v) not in EXPECTED_EMPTY:
                    unexpected_empty.append((lang, b, v))
    if unexpected_empty:
        sys.exit(f"found {len(unexpected_empty)} UNEXPECTED empty cells not in EXPECTED_EMPTY "
                  f"(first 10: {unexpected_empty[:10]}) -- aborting, investigate before ingest")
    for b, n in BOOKS.items():
        expected = set(range(1, n + 1))
        if seen.get(b) != expected:
            missing = expected - seen.get(b, set())
            extra = seen.get(b, set()) - expected
            sys.exit(f"book {b}: verse set mismatch -- missing={sorted(missing)[:10]} "
                      f"extra={sorted(extra)[:10]} -- aborting")

    print(f"loaded {len(data)} verse rows from {A.json} across {len(BOOKS)} books "
          f"({len(EXPECTED_EMPTY)} documented pre-existing empty cells, zero unexpected -- "
          f"see module docstring for the full list and why each is empty)")

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
                conf = cfg["conf"]
                ref_key = f"{cfg['corpus']}:{cfg['code']}:{b}:{v}"
                # ord_c/ord_v: book number carries the chapter ordering, verse is the
                # Niese section number within that book (same book='N' pattern as Apion,
                # extended from 2 books to 7 here)
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
            "AND text_paleo IS NULL",
            (LANGS["heb"]["code"], CANON_ID)).fetchone()[0]
        if n_missing_paleo:
            raise RuntimeError(f"{n_missing_paleo} HEB rows have NULL text_paleo after insert -- rolling back")

        con.commit()
        print(f"COMMITTED: {len(plan)} books rows, {len(plan) * TOTAL_VERSES} verses rows total, "
              f"canon_id={CANON_ID}, text_paleo populated on all HEB rows. If {A.json!r} is the "
              f"current (fixed) josephus_war_import.json, zero cells are empty; if it's a stale "
              f"pre-fix copy, run fix_josephus_war_empty_cells.py afterward.")

        print()
        print("Spot-check (verify square + paleo both render correctly, not mojibake):")
        for b, v in ((1, 1), (1, 673), (4, 1), (7, 455)):
            cur.execute(
                "SELECT text, text_paleo FROM verses WHERE corpus='HEB' AND code=? AND chapter=? AND verse=?",
                (LANGS["heb"]["code"], str(b), str(v)))
            r = cur.fetchone()
            if r:
                print(f"  HEB book {b} verse {v} square -> {r[0][:80]}")
                print(f"  HEB book {b} verse {v} paleo  -> {r[1][:80]}")
        print()
        print("Spot-check (confirm GRC has no Latin-fallback conf, unlike Apion):")
        cur.execute(
            "SELECT COUNT(DISTINCT conf) FROM verses WHERE corpus='GRC' AND code=? AND canon_id=?",
            (LANGS["grc"]["code"], CANON_ID))
        print(f"  distinct GRC conf values: {cur.fetchone()[0]} (expect 1)")
        print()
        print("Spot-check (formerly-empty-cell rows -- if josephus_war_import.json is the fixed "
              "version these should all have real, non-empty text; if this prints empty, run "
              "fix_josephus_war_empty_cells.py next):")
        for lang, b, v in (("eng", 7, 209), ("heb", 3, 190), ("heb", 5, 491), ("heb", 6, 177)):
            cfg = LANGS[lang]
            cur.execute(
                "SELECT text, length(text) FROM verses WHERE corpus=? AND code=? AND chapter=? AND verse=? AND canon_id=?",
                (cfg["corpus"], cfg["code"], str(b), str(v), CANON_ID))
            r = cur.fetchone()
            print(f"  {lang.upper()} book {b} verse {v} -> len={r[1]}  {r[0][:60]!r}")

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
    print("  2. server/book-order.json -- add canon_id 219 wherever fieldy wants it to sort")
    print("     (near canon_id 217/218 and the other promoted historical writings, not")
    print("     inside the Bible canon proper). Same still-open placement as 216/217/218.")


if __name__ == "__main__":
    main()
