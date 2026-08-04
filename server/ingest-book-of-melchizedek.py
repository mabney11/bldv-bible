#!/usr/bin/env python3
"""
ingest-book-of-melchizedek.py — ingest "The Book of Melchizedek" (Isaac & Ezequiel
Ramirez Vargas' 2010 Spanish translation, English rendering, from Enoch Mucheroni's
Portuguese version) into corpus.db (corpus 'ENG'), following the same ingestion
checklist as every other non-canonical text in this app (see CLAUDE.md).

fieldy has confirmed rights to use this text (2026-08-01). Per fieldy's own research
this is NOT the genuine Dead Sea Scroll 11Q13/11QMelchizedek (a short, fragmentary
academic text) — it's a modern (2010) composition presented with a Dead Sea Scrolls
framing narrative. That's a provenance/labeling question for the app's book title and
description, not a blocker to ingesting the text fieldy has rights to; the canon_id
REGISTRY entry below should carry an honest description, not "Dead Sea Scroll".

SOURCE FILE: this script does NOT fetch anything — point --src at your own local copy
of the plain-text source (the same file you already have). Expected structure, found
by inspecting the file directly:

  - Front matter (credits, preliminary explanation, acknowledgement) BEFORE the first
    book title line ("The History of the Vase") — translator/publisher apparatus, not
    the scroll text itself. Same treatment as Platt's 1926 editorial intro getting
    dropped from Gospel of Peter (ingest-nt-apocrypha-2.py) — SKIPPED here.
  - Three books, found by their exact title lines:
      "The History of the Vase"     (written by Abraham)
      "Salem’s Story"                 (written by Abraham)
      "The HISTORY OF THE UNIVERSE" (written by Melchizedek)
    Combined into ONE app book with continuously renumbered chapters (Vase's own
    chapters 1-11 -> book chapters 1-11, Salem's own 1-N -> continuing from there,
    Universe's own 1-N -> continuing from there) so there's a single dropdown entry,
    per fieldy's request to place ONE book between Jasher and Adam & Eve. Mirrors the
    same local-renumbering rule CLAUDE.md documents for Pistis Sophia's 4 books
    sharing one running count in the source but needing independent chapter-1s here.
  - Each book opens with "(A story written by X)" and a synopsis paragraph before the
    first "CHAPTER N" -- both translator-added framing per the file's own "Preliminary
    explanation" section ("the synopsis of each CHAPTER... were added to present more
    clearly the writings of the scroll") -- SKIPPED, same as the per-chapter synopsis
    immediately after every "CHAPTER N" heading.
  - "CHAPTER N" headings are inconsistently spaced in the source ("CHAPTER 1" vs
    "CHAPTER10", "CHAPTER11" with no space) -- regex handles both.
  - Inline "(See Chrono. 1, 2 and 3)"-style cross-references point at graphic
    chronology charts the file's own preliminary explanation says were "not part of
    the original scroll... added to facilitate... understanding" -- stripped from the
    running text as translator apparatus, same reasoning as page-citation brackets
    elsewhere in this app.
  - Verses are numbered paragraphs ("1 text...", "2 text..."). Uses the SAME
    "no leading digit = continuation of the previous verse, not a new one" rule fixed
    in ingest-nt-apocrypha-2.py's Gospel of Peter parser 2026-08-01 (a source-page
    line break mid-sentence must not desync verse numbering) -- apply here too in
    case this source has the same class of artifact; --dry / the diagnostic companion
    script will show if it actually does.

Run order (same checklist as every other addition, CLAUDE.md):
  python ingest-book-of-melchizedek.py --src=sources/book-of-melchizedek.txt --dry
  python ingest-book-of-melchizedek.py --src=sources/book-of-melchizedek.txt
  node sanitize-english.js
  node glossify-terms.js
  node de-archaic-corpus.js --dry-run   # then apply once residue is clean
  node de-archaic-corpus.js
  node fix-self-referential-glosses.js --apply
  python assign-canon-ids.py            # add the REGISTRY entry first (see below)
  node sample-corpus.js --src=book-of-melchizedek-2026-08
  # then hand-edit (or /book-manager) book-order.json to place it after Jasher (id 100)
  # restart the server
"""
import re, sqlite3, argparse, unicodedata

CODE = 'BOOK_OF_MELCHIZEDEK'
SRC_TAG = 'book-of-melchizedek-2026-08'

# Line-ANCHORED matches only -- these exact phrases ("Salem's Story" especially) get
# mentioned by name in the preface's own prose, well before the real section header.
# A plain substring search (the original bug, found 2026-08-01 from a live --dry run:
# it locked onto the preface's early mention of "Salem's Story" instead of the real
# header, so body_vase's start-to-end slice went negative/empty and ALL of Vase's
# real content silently ended up inside what got labeled "Salem" instead) will find
# that early mention first. Requiring the title to be alone on its own line (optional
# surrounding whitespace only) is what actually distinguishes the heading from prose
# that happens to contain the same words.
# Leading \s* tolerates indentation -- found 2026-08-01: the Salem heading in the
# actual source has leading whitespace before "Salem" that a bare ^ anchor rejects,
# even though Vase/Universe's headers happen not to. Applied to all three defensively.
TITLE_VASE_RX = re.compile(r'^\s*The History of the Vase\s*$', re.M)
TITLE_SALEM_RX = re.compile(r'^\s*Salem.s Story\s*$', re.M)  # . matches straight or curly apostrophe
TITLE_UNIV_RX = re.compile(r'^\s*The HISTORY OF THE UNIVERSE\s*$', re.M)

CHRONO_RX = re.compile(r'\(\s*See\s+Chrono\.?[^)]*\)', re.I)
# Leading \s* tolerates a leftover \x0c (form feed / page break, from the source
# PDF-to-text conversion) before "CHAPTER" -- found 2026-08-01: exactly the chapters
# that looked "missing" from the sequence (Vase 3, Salem 5, Universe 2) all had this
# leading form feed, so the plain ^CHAPTER anchor never matched them at all, and their
# real content was silently swallowed into the PRECEDING chapter's block with
# duplicate/restarting verse numbers -- same failure class as the Gospel of Peter
# page-break bug, one level up (chapter boundaries instead of verse boundaries).
CHAPTER_RX = re.compile(r'^\s*CHAPTER\s*(\d+)\s*$', re.M)
LIGATURES = {'æ': 'ae', 'Æ': 'Ae', 'œ': 'oe', 'Œ': 'Oe'}

def fold_diacritics(s):
    for lig, expanded in LIGATURES.items():
        s = s.replace(lig, expanded)
    s = unicodedata.normalize('NFKD', s)
    return ''.join(c for c in s if not unicodedata.combining(c))

def clean(text):
    text = CHRONO_RX.sub('', text)
    # \x0c (form feed / page break) can land mid-paragraph too, not just before a
    # CHAPTER heading -- confirmed 2026-08-01 that at least 3 chapter headings had
    # one immediately before them; a stray one inside running verse text would
    # otherwise leak into the stored text as a literal control character. Replace
    # with a space (it's a page-boundary artifact, not real punctuation) then let the
    # normal space-collapsing below clean up any resulting double space.
    text = text.replace('\x0c', ' ')
    text = fold_diacritics(text)
    text = re.sub(r'[ \t]{2,}', ' ', text)
    text = re.sub(r' +([.,;:!?])', r'\1', text)
    return text.strip()

def split_chapters(body):
    """Yield (chapter_num_in_source, chapter_text) for every 'CHAPTER N' block in
    body, dropping everything before the first CHAPTER marker (the book's own
    "(A story written by X)" + synopsis intro -- translator framing, not the text)."""
    marks = list(CHAPTER_RX.finditer(body))
    for i, m in enumerate(marks):
        num = int(m.group(1))
        start = m.end()
        end = marks[i + 1].start() if i + 1 < len(marks) else len(body)
        yield num, body[start:end]

def parse_chapter_verses(chapter_text):
    """Paragraphs (blank-line separated). The FIRST paragraph is the translator's
    per-chapter synopsis in parentheses -- dropped, not verse 1 (mirrors how Gospel
    of Peter's editorial intro is dropped, just at chapter granularity here instead
    of book granularity). Every subsequent paragraph either starts with its own verse
    number (trust it) or doesn't (merge into the previous verse as a continuation --
    same rule fixed for Gospel of Peter 2026-08-01)."""
    paras = [p.strip() for p in re.split(r'\n\s*\n', chapter_text)]
    paras = [p for p in paras if p]
    if paras and paras[0].startswith('('):
        paras = paras[1:]
    rows = []  # [verse_num, text]
    for p in paras:
        m = re.match(r'^(\d{1,3})\s+(.*)$', p, re.S)
        if m:
            rows.append([int(m.group(1)), m.group(2).strip()])
        elif rows:
            rows[-1][1] = (rows[-1][1].rstrip() + ' ' + p.strip()).strip()
        # a stray non-numbered paragraph before any real verse in this chapter
        # (residual translator note) is silently dropped rather than guessed at --
        # --dry will show if this ever actually happens so it can be checked by eye.
    return [(v, clean(t)) for v, t in rows if t]

def ingest(src_path):
    raw = open(src_path, encoding='utf-8').read()

    m_vase  = TITLE_VASE_RX.search(raw)
    m_salem = TITLE_SALEM_RX.search(raw)
    m_univ  = TITLE_UNIV_RX.search(raw)
    if not m_vase or not m_salem or not m_univ:
        missing = [n for n, ok in [('Vase', bool(m_vase)), ('Salem', bool(m_salem)),
                                    ('Universe', bool(m_univ))] if not ok]
        raise SystemExit(f'could not find book title marker(s) as a standalone line: '
                          f'{missing} -- check exact spelling/formatting in the source '
                          f'file (open it and search for the title text directly)')
    i_vase, i_salem, i_univ = m_vase.start(), m_salem.start(), m_univ.start()
    if not (i_vase < i_salem < i_univ):
        raise SystemExit(f'book title markers found out of expected order '
                          f'(Vase={i_vase}, Salem={i_salem}, Universe={i_univ}) -- '
                          f'one of the regexes is matching the wrong place, stop and '
                          f'check before trusting any output past this point')

    body_vase  = raw[i_vase:i_salem]
    body_salem = raw[i_salem:i_univ]
    body_univ  = raw[i_univ:]

    all_rows = []   # (book_chapter, verse, text)
    offset = 0
    part_counts = []
    for label, body in [('Vase', body_vase), ('Salem', body_salem), ('Universe', body_univ)]:
        chapters = list(split_chapters(body))
        n_verses_this_part = 0
        max_local_ch = 0
        for local_ch, ch_text in chapters:
            max_local_ch = max(max_local_ch, local_ch)
            verses = parse_chapter_verses(ch_text)
            book_ch = offset + local_ch
            for v, t in verses:
                all_rows.append((book_ch, v, t))
            n_verses_this_part += len(verses)
        part_counts.append((label, len(chapters), n_verses_this_part, offset + 1, offset + max_local_ch))
        offset += max_local_ch

    return all_rows, part_counts

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True, help='path to your local copy of the source .txt')
    ap.add_argument('--corpus', default='corpus.db')
    ap.add_argument('--dry', action='store_true')
    A = ap.parse_args()

    rows, part_counts = ingest(A.src)

    print('parts (book-level chapter range after continuous renumbering):')
    for label, n_chapters, n_verses, ch_start, ch_end in part_counts:
        print(f'  {label:<10} {n_chapters:>3} chapters, {n_verses:>4} verses, '
              f'book chapters {ch_start}-{ch_end}')
    print(f'\ntotal: {len(rows)} verse rows across {rows[-1][0] if rows else 0} book chapters')

    if A.dry:
        print('\ndry run -- nothing written. Sample first/last verse of each part:')
        seen = set()
        for label, _, _, ch_start, ch_end in part_counts:
            first = next((r for r in rows if r[0] == ch_start), None)
            last = next((r for r in reversed(rows) if r[0] == ch_end), None)
            print(f'  [{label}] ch{ch_start} v{first[1] if first else "?"}: '
                  f'{(first[2][:120] + "...") if first else "(none found)"}')
            print(f'  [{label}] ch{ch_end} v{last[1] if last else "?"}: '
                  f'{(last[2][:120] + "...") if last else "(none found)"}')
        return

    db = sqlite3.connect(A.corpus)
    c = db.cursor()
    # A `books` row (Scheme B per-corpus surrogate key, per CLAUDE.md's book_id notes)
    # is needed for /api/source/:src/* and other routes that key off it, same as every
    # other ingest script (ingest-nt-apocrypha-2.py, ingest-pseudepigrapha.py).
    existing = c.execute("SELECT book_id FROM books WHERE corpus='ENG' AND code=?", (CODE,)).fetchone()
    if existing:
        bid = existing[0]
    else:
        c.execute("INSERT INTO books(corpus,code,title,category,n_verses) VALUES('ENG',?,?,?,?)",
                   (CODE, 'Book of Melchizedek', 'pseudepigrapha-en', len(rows)))
        bid = c.lastrowid
    n = 0
    for ch, v, t in rows:
        # ord_c/ord_v are SEPARATE integer columns from chapter/verse (which can be
        # non-numeric text in other sources) -- /api/translate/chapter's ENG fallback
        # query filters on ord_c specifically. Found missing 2026-08-01 (the reader
        # showed "not translated" despite the text genuinely being there) -- every
        # other ingest script already sets these; this one didn't, and got fixed only
        # after live-testing caught it. ref_key mirrors the 'ENG:CODE:ch:v' pattern
        # ingest-nt-apocrypha-2.py uses.
        rk = f'ENG:{CODE}:{ch}:{v}'
        c.execute(
            "INSERT INTO verses (ref_key, book_id, corpus, code, chapter, verse, "
            "ord_c, ord_v, text, category, src) "
            "VALUES (?, ?, 'ENG', ?, ?, ?, ?, ?, ?, ?, ?)",
            (rk, bid, CODE, str(ch), str(v), ch, v, t, 'pseudepigrapha-en', SRC_TAG)
        )
        n += 1
    db.commit()
    db.close()
    print(f'\ningested {n} verses into {A.corpus} (corpus \'ENG\', code {CODE}). '
          f'Next: node sanitize-english.js, node glossify-terms.js, '
          f'node de-archaic-corpus.js --dry-run, python assign-canon-ids.py '
          f'(add a REGISTRY entry for {CODE} first), '
          f'node sample-corpus.js --src={SRC_TAG} (read the samples before '
          f'greenlighting -- see CLAUDE.md ingestion checklist).')

if __name__ == '__main__':
    main()
