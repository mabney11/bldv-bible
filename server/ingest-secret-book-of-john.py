#!/usr/bin/env python3
"""
ingest-secret-book-of-john.py — ingest "The Secret Writing According to John: A
Public Domain Synoptic Translation" (Samuel Zinner, ed. Mark M. Mattison — explicitly
committed to the public domain, based on Waldstein & Wisse's Coptic synopsis of
Nag Hammadi Codices II,1 / III,1 / IV,1 and Berlin Codex 8502,2) into corpus.db
(corpus 'ENG'), following the same checklist as every other addition (CLAUDE.md).

Canon_id 208 has been reserved for this since the 209-262 NT Apocrypha batch
(see assign-canon-ids.py) — this is the text that reservation was waiting on.

SOURCE FILE: this script does NOT fetch anything — academia.edu gates the actual PDF
behind a JS/login-only download button this pipeline can't fetch reliably (confirmed
2026-08-01). fieldy downloaded it by hand; point --src at that local plain-text copy.

Structure, found by inspecting the file directly:
  - Opens with the manuscript's own bracketed title complex (3 lines: "[The Teaching
    of the Savior]" / "The Revelation of the Mysteries Hidden in Silence" / "[Those
    Things that He Taught to John, His Disciple]") before "Prologue" — translator/
    title framing, not body text. SKIPPED, same treatment as dropping front matter
    before the first real content marker elsewhere in this app (Melchizedek, Thomas).
  - No chapter or verse numbers anywhere in the source — it's a continuous narrative
    broken into named sections ("Prologue", "The Inexpressible One", ...) each
    followed by one or more paragraphs. Same shape as Gospel of Philip's source
    (headings + paragraphs, no numbering) — reuses that same solution: ONE chapter,
    one verse per blank-line-separated paragraph/heading (headings become their own
    short verse, same as Philip's).
  - Many paragraphs are internally hymn/poetry-formatted — single newlines with
    varying leading whitespace for visual indentation (e.g. the "I am the Father /
    The Mother / The Son" passage). Flattened to normal flowing prose within its
    verse via collapse_para(), the same helper already used for Gospel of Peter /
    Acts of Barnabas' embedded-newline fix (ingest-nt-apocrypha-2.py) — this app's
    reader has no poetry-preserving layout, and every other ingested text is stored
    as plain flowing prose, so this keeps Secret Book of John consistent with that
    rather than inventing a one-off exception.
  - fieldy asked (2026-08-02) that quotes of the 66 canonical books be "formatted
    like they are in Pistis Sophia" — i.e. ingest_pistis_sophia()'s rule of never
    fabricating a separate verse number for quoted material, letting a quotation
    read as one continuous block instead (see ingest-gnostic-priority.py's long
    comment on this). Checked this source specifically for that pattern (a
    multi-paragraph quotation split across several numbered lines) — NOT present.
    The only canonical (Genesis) references here are short, self-contained bracketed
    asides that already sit inside a single paragraph on their own
    ("[It did not happen the way Moses said it did: 'he took a rib and made the
    woman.']") — paragraph-per-verse already keeps these as one continuous verse
    with no fabricated internal numbering, so no extra merge logic is needed here;
    the Pistis Sophia rule is satisfied by the existing paragraph boundary.
  - One line of trailing apparatus after the text ends ("Jesus the Christ. Amen."):
    a final colophon line, "The Apocryphon of John" — an alternate-title label, same
    kind of thing as the opening title block, not body text. Found via --dry (it
    showed up as a stray final verse 284) — SKIPPED, same as the opening title block.

ORIGINAL-LANGUAGE COPTIC TEXT: fieldy also asked for the original text this was
translated from, matching the app's Hebrew/Greek/Ge'ez/Coptic/Syriac/Latin pattern.
Checked two options 2026-08-02, neither works:
  - naghammadi.org (Bibliothèque copte de Nag Hammadi, Université Laval) explicitly
    states "Any reproduction of these provisional translations for publication
    purposes is strictly forbidden" — rights-reserved, not usable.
  - The Cambridge University Press 2025 monograph fieldy uploaded (Litwa, "The
    Secret Book of John") is a copyrighted commercial edition (© M. David Litwa
    2025, "This publication is in copyright") — not public domain, and in any case
    only contains ~17 lines with actual Coptic script (isolated terms cited in
    discussion/footnotes, not a running parallel Coptic text) — it wouldn't build a
    real Coptic reading even setting copyright aside.
  No public-domain running Coptic transcription of the Apocryphon of John was found.
  This is flagged back to fieldy rather than decided here — see the chat message
  alongside this script.

Run order (same checklist as every other addition, CLAUDE.md):
  python ingest-secret-book-of-john.py --src=sources/secret-book-of-john.txt --dry
  python ingest-secret-book-of-john.py --src=sources/secret-book-of-john.txt
  node sanitize-english.js
  node glossify-terms.js
  node de-archaic-corpus.js --dry-run   # then apply once residue is clean
  node de-archaic-corpus.js
  node fix-self-referential-glosses.js --apply
  python assign-canon-ids.py            # uncomment the 208 REGISTRY line first
  node sample-corpus.js --src=secret-book-of-john-2026-08
  # hand-edit (or /book-manager) book-order.json to place it
  # restart the server
"""
import re, sqlite3, argparse, unicodedata

CODE = 'SECRET_BOOK_OF_JOHN'
SRC_TAG = 'secret-book-of-john-2026-08'

TITLE_BLOCK_END_RX = re.compile(r'^\s*Prologue\s*$', re.M)
LIGATURES = {'æ': 'ae', 'Æ': 'Ae', 'œ': 'oe', 'Œ': 'Oe'}

def fold_diacritics(s):
    for lig, expanded in LIGATURES.items():
        s = s.replace(lig, expanded)
    s = unicodedata.normalize('NFKD', s)
    return ''.join(c for c in s if not unicodedata.combining(c))

def collapse_para(p):
    """Flatten a hymn/poetry-formatted paragraph (single newlines + variable leading
    whitespace used for visual indentation) into one line of normal prose. Same
    approach as ingest-nt-apocrypha-2.py's collapse_para() for the same class of
    source formatting."""
    p = re.sub(r'\s*\n\s*', ' ', p)
    p = re.sub(r'[ \t]{2,}', ' ', p)
    return p.strip()

# A bare 3-line epithet triad ("Thrice Male / Thrice Powerful / Thrice Named" —
# a standard Sethian divine-titulature formula) has no subject/verb, unlike most
# of this hymn's other multi-line passages (which read fine after collapse_para's
# plain space-join because each line already starts with its own repeated subject,
# e.g. "The One is..." / "The One is..."). Three bare adjective-noun fragments
# glued with only spaces reads as one garbled run ("Thrice Male Thrice Powerful
# Thrice Named") instead of three distinct titles — found live 2026-08-02 (fieldy:
# "doesnt read right"). Fixed narrowly (hyphenate + comma-separate this one known
# phrase) rather than broadening collapse_para's join rule for every multi-line
# paragraph, which risks turning OTHER passages' repeated-subject sentences (that
# already read fine) into awkward comma splices.
TRIAD_RX = re.compile(r'\bThrice Male Thrice Powerful Thrice Named\b')

def clean(text):
    text = fold_diacritics(text)
    text = TRIAD_RX.sub('Thrice-Male, Thrice-Powerful, Thrice-Named', text)
    text = re.sub(r' +([.,;:!?])', r'\1', text)
    return text.strip()

def ingest(src_path):
    raw = open(src_path, encoding='utf-8').read()

    m = TITLE_BLOCK_END_RX.search(raw)
    if not m:
        raise SystemExit('could not find the standalone "Prologue" marker that starts '
                          'the real body — check the source file\'s exact formatting '
                          'before trusting any output past this point')
    body = raw[m.start():]

    # Drop the trailing colophon line ("The Apocryphon of John") after the text's
    # own closing "Jesus the Christ. Amen." — an alternate-title label, not body
    # text (found via --dry: it showed up as a stray final verse).
    body = re.sub(r'\n\s*The Apocryphon of John\s*$', '', body)

    paras = [p.strip() for p in re.split(r'\n\s*\n', body)]
    paras = [p for p in paras if p]

    rows = []  # (verse_num, text)
    for i, p in enumerate(paras, 1):
        t = clean(collapse_para(p))
        if t:
            rows.append((i, t))
    return rows

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True, help='path to your local copy of the source .txt')
    ap.add_argument('--corpus', default='corpus.db')
    ap.add_argument('--dry', action='store_true')
    A = ap.parse_args()

    rows = ingest(A.src)
    print(f'{len(rows)} verses (one chapter, one verse per paragraph/heading)')

    if A.dry:
        print('\ndry run -- nothing written. First 3 / last 3 verses:')
        for v, t in rows[:3]:
            print(f'  v{v}: {t[:120]}{"..." if len(t) > 120 else ""}')
        print('  ...')
        for v, t in rows[-3:]:
            print(f'  v{v}: {t[:120]}{"..." if len(t) > 120 else ""}')
        return

    db = sqlite3.connect(A.corpus)
    c = db.cursor()
    existing = c.execute("SELECT book_id FROM books WHERE corpus='ENG' AND code=?", (CODE,)).fetchone()
    if existing:
        bid = existing[0]
    else:
        c.execute("INSERT INTO books(corpus,code,title,category,n_verses) VALUES('ENG',?,?,?,?)",
                   (CODE, 'Secret Book of John', 'nag-hammadi-en', len(rows)))
        bid = c.lastrowid
    n = 0
    for v, t in rows:
        rk = f'ENG:{CODE}:1:{v}'
        c.execute(
            "INSERT INTO verses (ref_key, book_id, corpus, code, chapter, verse, "
            "ord_c, ord_v, text, category, src) "
            "VALUES (?, ?, 'ENG', ?, '1', ?, 1, ?, ?, ?, ?)",
            (rk, bid, CODE, str(v), v, t, 'nag-hammadi-en', SRC_TAG)
        )
        n += 1
    db.commit()
    db.close()
    print(f'\ningested {n} verses into {A.corpus} (corpus \'ENG\', code {CODE}). '
          f'Next: node sanitize-english.js, node glossify-terms.js, '
          f'node de-archaic-corpus.js --dry-run, python assign-canon-ids.py '
          f'(uncomment the 208 REGISTRY line for {CODE} first), '
          f'node sample-corpus.js --src={SRC_TAG} (read the samples before '
          f'greenlighting -- see CLAUDE.md ingestion checklist).')

if __name__ == '__main__':
    main()
