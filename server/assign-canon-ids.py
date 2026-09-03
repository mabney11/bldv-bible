#!/usr/bin/env python3
"""
assign-canon-ids.py — promote curated writings to first-class, cross-language books.

Your reader's book dropdown is driven by canon_id (the source views alias
canon_id AS book_id). Anything with canon_id NULL is a "work", invisible to the
dropdown — which is why Jasher didn't show. This assigns a shared canon_id to each
curated writing across EVERY language that has it, so:

  • it appears in the book dropdown (ordered by book-order.json), and
  • the SAME writing in English / Hebrew / Syriac / Ge'ez shares one id, so the
    parallel view and language-switching line them up.

Canonical + deuterocanon already hold ids 1-90; pseudepigrapha get 100+. Re-runnable.

  python assign-canon-ids.py            # apply
  python assign-canon-ids.py --dry      # show plan only
"""
import sqlite3, argparse

# canon_id : (display name, [ (corpus, code) members that are the SAME writing ])
REGISTRY = {
 100: ("Jasher",                 [("HEB","YASHAR"), ("ENG","BOOK_OF_JASHER")]),
 101: ("1 Adam and Eve",         [("ENG","1_ADAM_AND_EVE")]),
 102: ("2 Adam and Eve",         [("ENG","2_ADAM_AND_EVE")]),
 103: ("Testament of Reuben",    [("ENG","TESTAMENT_OF_REUBEN")]),
 104: ("Testament of Simeon",    [("ENG","TESTAMENT_OF_SIMEON")]),
 105: ("Testament of Levi",      [("ENG","TESTAMENT_OF_LEVI")]),
 106: ("Testament of Judah",     [("ENG","TESTAMENT_OF_JUDAH")]),
 107: ("Testament of Issachar",  [("ENG","TESTAMENT_OF_ISSACHAR")]),
 108: ("Testament of Zebulun",   [("ENG","TESTAMENT_OF_ZEBULUN")]),
 109: ("Testament of Dan",       [("ENG","TESTAMENT_OF_DAN")]),
 110: ("Testament of Naphtali",  [("ENG","TESTAMENT_OF_NAPHTALI")]),
 111: ("Testament of Gad",       [("ENG","TESTAMENT_OF_GAD")]),
 112: ("Testament of Asher",     [("ENG","TESTAMENT_OF_ASHER")]),
 113: ("Testament of Joseph",    [("ENG","TESTAMENT_OF_JOSEPH")]),
 114: ("Testament of Benjamin",  [("ENG","TESTAMENT_OF_BENJAMIN")]),
 115: ("Joseph and Asenath",     [("ENG","JOSEPH_AND_ASENATH")]),
 116: ("Testament of Abraham",   [("ENG","TESTAMENT_OF_ABRAHAM")]),
 117: ("Testament of Isaac",     [("ENG","TESTAMENT_OF_ISAAC")]),
 118: ("Testament of Jacob",     [("ENG","TESTAMENT_OF_JACOB")]),
 119: ("Testament of Job",       [("ENG","TESTAMENT_OF_JOB"), ("HEB","TESTAMENT_OF_JOB")]),
 120: ("Testament of Solomon",   [("ENG","TESTAMENT_OF_SOLOMON")]),
 121: ("Apocalypse of Abraham",  [("ENG","APOCALYPSE_OF_ABRAHAM")]),
 122: ("Ascension of Isaiah",    [("ENG","ASCENSION_OF_ISAIAH")]),
 123: ("Apocalypse of Elijah",   [("ENG","APOCALYPSE_OF_ELIJAH")]),
 124: ("Apocalypse of Sedrach",  [("ENG","APOCALYPSE_OF_SEDRACH")]),
 125: ("Apocalypse of Peter",    [("ENG","APOCALYPSE_OF_PETER")]),
 126: ("Assumption of Moses",    [("ENG","ASSUMPTION_OF_MOSES"), ("HEB","ASSUMPTION_OF_MOSES")]),
 127: ("Ladder of Jacob",        [("ENG","LADDER_OF_JACOB")]),
 128: ("Lives of the Prophets",  [("ENG","LIVES_OF_THE_PROPHETS")]),
 129: ("Jannes and Jambres",     [("ENG","JANNES_AND_JAMBRES")]),
 130: ("History of the Rechabites",[("ENG","HISTORY_OF_THE_RECHABITES")]),
 131: ("Book of Giants",         [("ENG","BOOK_OF_GIANTS")]),
 132: ("Genesis Apocryphon",     [("ENG","GENESIS_APOCRYPHON")]),
 133: ("Wisdom of Ahikar",       [("ENG","WISDOM_OF_AHIKAR")]),
 134: ("Words of Gad the Seer",  [("ENG","GAD_THE_SEER")]),
 135: ("Odes of Solomon",        [("ENG","ODES_OF_SOLOMON")]),
 136: ("2 Enoch",                [("ENG","2_ENOCH"), ("HEB","2_ENOCH")]),
 137: ("3 Baruch",               [("ENG","3_BARUCH")]),
 # cross-language unifications (same writing, two tongues -> one id)
 138: ("2 Baruch",               [("ENG","2_BARUCH"), ("SYR","APBAR"), ("HEB","APBAR")]),
 139: ("2 Esdras / 4 Ezra",      [("ENG","2_ESDRAS"), ("SYR","4EZRA"), ("GEZ","4EZR_PARTIAL"), ("HEB","4EZRA")]),
 140: ("Songs of the Sabbath Sacrifice",[("ENG","SONGS_OF_THE_SABBATH_SACRIFICE")]),
 141: ("Five Psalms of David",   [("ENG","FIVE_PSALMS_OF_DAVID")]),
 142: ("Visions of Amram",       [("ENG","VISIONS_OF_AMRAM")]),
 # Split Ge'ez 1 Meqabyan off canon 69 (shared with 1 Maccabees) onto its own id
 143: ("1 Meqabyan",            [("GEZ","1MEQ")]),
 144: ("Testament of Kohath",   [("ENG","TESTAMENT_OF_KOHATH")]),
 145: ("Book of Nathan the Prophet",[("ENG","BOOK_OF_NATHAN_THE_PROPHET")]),
 146: ("Apocryphon of Joshua",  [("ENG","APOCRYPHON_OF_JOSHUA")]),
 147: ("Balaam Inscription",    [("ENG","BALAAM_INSCRIPTION")]),
 148: ("Words of Azariah",      [("ENG","AZAR")]),
 149: ("Gospel of Nicodemus",   [("ENG","GOSPEL_OF_NICODEMUS")]),
 150: ("Epistle of Barnabas",   [("ENG","EPISTLE_OF_BARNABAS")]),
 151: ("Shepherd of Hermas I",  [("ENG","1_HERMAS")]),
 152: ("Shepherd of Hermas II", [("ENG","2_HERMAS")]),
 153: ("Shepherd of Hermas III",[("ENG","3_HERMAS")]),
 154: ("Greek Esther",          [("ENG","GREEK_ESTHER")]),

 # Nag Hammadi / NT Apocrypha priority additions (2026-07-30, run after
 # ingest-gnostic-priority.py). 200+ reserved for this batch so it never collides
 # with any future 155-199 canonical/deuterocanon promotions. Positioned in
 # book-order.json under/near the NT per fieldy's request (Thomas moved into the
 # NT run rather than left at the tail with everything else) — reorder freely,
 # or use the Book Manager admin screen (/book-manager) instead of hand-editing.
 200: ("Gospel of Thomas",           [("ENG","GOSPEL_OF_THOMAS")]),
 201: ("Gospel of Philip",           [("ENG","GOSPEL_OF_PHILIP")]),
 202: ("Pistis Sophia I",            [("ENG","PISTIS_SOPHIA_1")]),
 203: ("Pistis Sophia II",           [("ENG","PISTIS_SOPHIA_2")]),
 204: ("Pistis Sophia III",          [("ENG","PISTIS_SOPHIA_3")]),
 205: ("Pistis Sophia IV",           [("ENG","PISTIS_SOPHIA_4")]),
 206: ("Acts of Paul and Thecla",    [("ENG","ACTS_OF_PAUL_AND_THECLA")]),
 207: ("Third Corinthians",         [("ENG","THIRD_CORINTHIANS")]),
 # Ingested 2026-08-02 via ingest-secret-book-of-john.py (Zinner/Mattison public-
 # domain synoptic translation, hand-pulled from academia.edu since that pipeline
 # can't fetch it — see that script's header comment).
 208: ("Secret Book of John", [("ENG","SECRET_BOOK_OF_JOHN")]),

 # NT_APOCRYPHA_BACKLOG.md Bucket A, first installment (2026-08-01, run after
 # ingest-nt-apocrypha-2.py). 209+ continues the 200-208 Nag Hammadi/NT Apocrypha
 # priority range above.
 209: ("Gospel of Peter",       [("ENG","GOSPEL_OF_PETER")]),
 210: ("Acts of Barnabas",      [("ENG","ACTS_OF_BARNABAS")]),
 211: ("Melchizedek",           [("ENG","MELCHIZEDEK_NHC")]),

 # Ethiopian Melchizedek devotional cycle, Ge'ez originals, no English translation
 # (found 2026-08-01 via /works search; sourced from Beta Masaheft, ingest_betmas.py
 # — real transcribed Ge'ez text, not catalog stubs, just short because that's all
 # Beta Masaheft has published an edition of). Distinct textual tradition from both
 # Hebrews' "no father/mother/genealogy" account and the Nag Hammadi Coptic
 # Melchizedek tractate (canon_id 211 above) — this is Ethiopian Orthodox homiletic/
 # devotional material, including an unusual "Melchizedek was of the sons of Ham"
 # genealogy claim in 212. GEZ-only, like 1 Meqabyan (143) — displays in the reader
 # via text_paleo/native Ethiopic script, no sanitize-english.js/glossify-terms.js
 # pipeline needed (that pipeline is ENG-only).
 212: ("Treatise on Melchizedek",        [("GEZ","LIT3332Melchiz")]),
 213: ("Salam to Melchizedek",           [("GEZ","LIT7232Melchiz")]),
 # Two homilies read together as one 2-chapter book — run
 # fix-melchiz-cyril-chapters.py BEFORE this script, or LIT3327Melchiz2's chapter-1
 # rows collide with LIT3326Melchiz1's own chapter 1.
 214: ("Homilies of Cyril on Melchizedek", [("GEZ","LIT3326Melchiz1"), ("GEZ","LIT3327Melchiz2")]),
 215: ("Story of Melchizedek",           [("GEZ","LIT2365Storyo")]),

 # "Book of Melchizedek" (found 2026-08-01, fieldy has confirmed rights to use it) —
 # a 2010 English/Spanish translation (Isaac & Ezequiel Ramirez Vargas, from Enoch
 # Mucheroni's Portuguese version) via ingest-book-of-melchizedek.py. NOT the genuine
 # Dead Sea Scroll 11Q13/11QMelchizedek (a short, badly-damaged 3-column academic
 # fragment about a Jubilee-year apocalypse) despite the source material's own framing
 # as a "Great Melchizedek Roll" find from Cave 11 — that framing did not check out
 # against any real archaeological/academic record; treat this as a modern composition,
 # not an ancient manuscript, when describing it anywhere in the app. Combines all 3 of
 # its named parts (History of the Vase, Salem's Story, History of the Universe) into
 # ONE book with continuously renumbered chapters, per fieldy's request to place it as
 # a single entry between Jasher (100) and 1 Adam and Eve (101) in book-order.json —
 # NOT via this numeric id, which just needs to be unused (book-order.json controls
 # display sequence independently, see that file's own _README).
 216: ("Book of Melchizedek",            [("ENG","BOOK_OF_MELCHIZEDEK")]),
 # Josephus's "Life" (canon 217) -- pilot for the 4-work Josephus project (2026-09-01,
 # see project memory project_paleo-studio_josephus.md). ENG=Whiston/Perseus,
 # GRC=Niese/Perseus (master verse numbering, 430 verses), HEB=Menachem Stein
 # (benyehuda.org) -- all 3 promoted together, not Works-Library-only, per fieldy's
 # explicit choice. ENG/HEB are REAL per-verse splits aligned to the Greek's 430
 # sections (not duplicated paragraphs -- fieldy asked for true verse granularity
 # 2026-09-01), built with AI-assisted content alignment guided by the Greek text;
 # verse 365's ENG cell is intentionally empty (documented gap in the 1737 Whiston
 # source itself, not a bug -- see ingest_josephus_life.py's docstring). Ingested via
 # server/ingest_josephus_life.py -- fieldy ran it 2026-09-01, LIVE in corpus.db
 # (book_id 6946/6947/6948, 1290 verses rows). book-order.json placement still open.
 217: ("Life of Flavius Josephus",     [("ENG","JOSEPHUS_LIFE"), ("GRC","urn:cts:greekLit:tlg0526.tlg002.perseus-grc2"), ("HEB","JOSLIFE")]),

 # canon 218: Josephus's "Against Apion" -- 2nd of 4 planned Josephus works,
 # same corrected real-per-verse-alignment methodology as Life (217). TWO books
 # (chapter='1'/'2', native to the work, no remap needed), 616 Niese verses total
 # (book 1: 320, book 2: 296). ENG=Whiston/Perseus, GRC=Niese/Perseus, HEB=Yaakov
 # Naftali Simchoni 1943 (benyehuda.org/read/22345) -- all 3 promoted together.
 # ENG/HEB real per-verse splits built via AI-assisted content alignment against
 # the Greek, same as Life; ZERO empty cells this time (better source coverage
 # than Life). NOTABLE: part of Book 2's "GRC" text (Niese verses 52-113, 62 of
 # 296) is actually a 6th-c. Latin translation, not Greek -- the sole surviving
 # Greek manuscript breaks off there; this is Niese's own edition faithfully
 # reproduced, not an extraction bug. Those rows are flagged conf=
 # "perseus-niese-latin-fallback" in the DB (see ingest_josephus_apion.py's
 # docstring for the full explanation). Ingested via server/ingest_josephus_apion.py
 # -- fieldy ran it 2026-09-01, LIVE in corpus.db (book_id 6950/6951/6952, 1848
 # verses rows, Latin-fallback spot-check confirmed correct). book-order.json
 # placement done (216/217/218 all appended, order TBD by fieldy).
 218: ("Against Apion",     [("ENG","JOSEPHUS_APION"), ("GRC","urn:cts:greekLit:tlg0526.tlg003.perseus-grc2"), ("HEB","JOSAPION")]),

 # canon 219: Josephus's "The Jewish War" -- 3rd of 4 planned Josephus works,
 # same corrected real-per-verse-alignment methodology as Life (217) and Against
 # Apion (218), scaled up per fieldy's explicit "full scale, same method"
 # instruction (2026-09-01) when this work's size (4001 Niese verses, 6.5x
 # Apion's 616) was discovered. SEVEN books (chapter='1'..'7', native to the
 # work), 4001 Niese verses total: book1=673, book2=654, book3=542, book4=663,
 # book5=572, book6=442, book7=455. ENG=Whiston 1737/Perseus
 # (tlg0526.tlg004.perseus-eng2), GRC=Niese/Perseus (tlg0526.tlg004.perseus-grc2),
 # HEB=Yaakov Naftali Simchoni (Masada, 1970 printing; benyehuda.org) -- all 3
 # promoted together. ENG/HEB real per-verse splits built via AI-assisted content
 # alignment against the Greek across 81 parallel batches (~9 English spans
 # each), same rigor as Life/Apion -- every split verified programmatically
 # (character-exact ENG reconstruction, verbatim-substring HEB reconstruction).
 # UNLIKE Apion, this work's Greek is confirmed 100% Greek script throughout --
 # ZERO Latin-fallback verses, so GRC has a single conf value ("perseus-niese"),
 # no per-row branching. LIVE in corpus.db as of 2026-09-01 (fieldy ran
 # ingest_josephus_war.py; book_id 6955/6956/6957, 12003 verses rows). ZERO
 # empty cells -- an earlier draft shipped 29 cells (1 ENG, 28 HEB) as
 # "documented pre-existing source gaps"; per fieldy's explicit correction
 # ("the source is not the most important, but the content, I need full text
 # and nothing omitted, even if that's combining sources"), all 29 were
 # re-investigated and found recoverable, not genuinely absent (1 real
 # Perseus/Whiston transcription truncation at book7:208-209, fixed from an
 # independent complete digitization; 28 HEB cells caused by a bug in this
 # project's OWN paragraph-extraction regex that silently dropped 2 whole
 # Hebrew paragraphs -- book5 vv491-501 and book6 vv177-192 -- plus 1
 # misattribution at book3 v190/191). Patched live via
 # fix_josephus_war_empty_cells.py (UPDATE-only, run after the ingest); see
 # that script's docstring and project memory project_paleo-studio_josephus.md
 # for the full writeup. NOTABLE METHODOLOGY LESSONS (useful for the still-larger
 # Antiquities of the Jews, ~7396 verses/20 books, the last Josephus work):
 # Hebrew source here has a 3-level structure (book > chapter > lettered
 # paragraph) unlike Life/Apion's 2-level (book > lettered paragraph); the
 # work's entire endnotes/chronology apparatus sits as ONE combined block at
 # the very end of the whole benyehuda.org page (not per-book), so real-content
 # end must be located precisely (real text ends at "...כִּוַנתּי בכל הכתובים
 # האלה."); and batch spans must be sorted by true document order (Niese verse
 # number), NOT by the English milestone's own attribute value (which resets
 # per chapter) -- a sort-key bug caught and fixed before any alignment agents
 # were dispatched, so no wasted work resulted, but would have been silently
 # catastrophic at this scale if missed; and MOST IMPORTANTLY, a
 # paragraph-marker regex that assumes one exact format ("letter + period +
 # space") will silently and invisibly drop real source paragraphs that use
 # any other format -- for Antiquities' much larger scale, check the
 # extraction regex against every distinct marker-format variant actually
 # present in the source BEFORE trusting any "this content is genuinely
 # absent" conclusion from an alignment agent. Ingested via
 # server/ingest_josephus_war.py (LIVE).
 219: ("The Jewish War",     [("ENG","JOSEPHUS_WAR"), ("GRC","urn:cts:greekLit:tlg0526.tlg004.perseus-grc2"), ("HEB","JOSWAR")]),

 # canon 220: Josephus's "Antiquities of the Jews" -- 4th and LAST of the
 # planned Josephus works, largest ingest in the project (20 books, 7376
 # Niese verses). Same corrected real-per-verse-alignment methodology as
 # Life/Apion/War for GRC (Niese, master granularity) and HEB books 1-8
 # (Alexander Shor's real 1939 translation, mechanically split on Shor's
 # own inline Niese verse-number markers). Shor's translation covers ONLY
 # books 1-8 of 20 (source-documented) -- HEB books 9-20 (4474 verses) are
 # an ORIGINAL Hebrew translation grounded in the Niese Greek content,
 # produced with a corpus-wide terminology guide for consistency, flagged
 # with a distinct conf value (ai-generated-corpus-terminology vs
 # benyehuda-shor) -- see project_paleo-studio_josephus.md. ENG uses
 # "containing section" mapping (each Niese verse shows the full Whiston
 # span it falls within, not split to per-verse granularity like GRC/HEB --
 # fieldy's explicit choice, 2026-09-02) so consecutive verses in one
 # Whiston span share identical English text; nothing omitted, just
 # coarser-grained, upgradeable later without touching GRC/HEB. Zero empty
 # cells across all 7376x3 rows. Ingested via server/ingest_josephus_antiquities.py.
 220: ("Antiquities of the Jews",     [("ENG","JOSEPHUS_ANT"), ("GRC","urn:cts:greekLit:tlg0526.tlg001.perseus-grc2"), ("HEB","JOSANT")]),
}

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--corpus",default="corpus.db")
    ap.add_argument("--dry",action="store_true"); A=ap.parse_args()
    db=sqlite3.connect(A.corpus); c=db.cursor()
    applied=0; touched=0
    for cid,(name,members) in sorted(REGISTRY.items()):
        parts=[]
        for corpus,code in members:
            n=c.execute("SELECT COUNT(*) FROM verses WHERE corpus=? AND code=? AND (canon_id IS NULL OR canon_id<>?)",
                        (corpus,code,cid)).fetchone()[0]
            present=c.execute("SELECT COUNT(*) FROM verses WHERE corpus=? AND code=?",(corpus,code)).fetchone()[0]
            if present:
                parts.append(f"{corpus}:{code}({present}v)")
                if not A.dry and n:
                    c.execute("UPDATE verses SET canon_id=? WHERE corpus=? AND code=?",(cid,corpus,code))
                    touched+=n
        if parts:
            applied+=1
            print(f"  {cid:>3}  {name:<28} <- {', '.join(parts)}")
    if A.dry:
        print(f"\n[dry] {applied} writings would be promoted")
    else:
        db.commit(); print(f"\npromoted {applied} writings ({touched} verse rows re-tagged)")
    db.close()

if __name__=="__main__":
    main()
