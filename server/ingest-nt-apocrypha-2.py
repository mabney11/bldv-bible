#!/usr/bin/env python3
"""
ingest-nt-apocrypha-2.py — first installment of the NT_APOCRYPHA_BACKLOG.md Bucket A
batch ("full surviving text exists, public-domain source identified"), into corpus.db
(corpus 'ENG'), following the ingestion checklist added to CLAUDE.md 2026-07-31.

This is a SIBLING to ingest-gnostic-priority.py, not a merge into it — same helper
functions (strip_tags/fold_diacritics/fetch), duplicated rather than imported, so a
change here can never accidentally destabilize that already-verified script.

Sourced live at run time, nothing embedded in this file:

  - Gospel of Peter (the Akhmim fragment) — sacred-texts.com, "The Lost Books of the
    Bible" (ed. Rutherford H. Platt Jr., 1926) — public domain.
  - Acts of Barnabas — sacred-texts.com, Ante-Nicene Fathers vol. 8 (tr. Alexander
    Walker, 1886) — public domain. Same collection/translator already used for Acts
    of Paul and Thecla in ingest-gnostic-priority.py.
  - Melchizedek (NHC IX,1) — earlychristianwritings.com, tr. Søren Giversen & Birger
    A. Pearson, from *The Nag Hammadi Library in English* (ed. Robinson) — the same
    freely-republished-with-permission "Gnostic Society Library" text this app already
    trusts for Third Corinthians (ingest-gnostic-priority.py). fieldy, 2026-07-31: "I
    only need the data that others used to make their translations, any open source
    translation is fine too" — not public domain in the strict legal sense (Robinson's
    volume is still in copyright), but openly and freely republished online for
    decades, same standing as gospels.net's Thomas/Philip translations already in this
    app. This tractate is EXTREMELY fragmentary — 19 of 750 original lines complete,
    264 lines lost outright (per Wikipedia's summary of Ehrman 2012) — so most verses
    here are short and gap-riddled by nature, not a defect of this ingester. The
    translators' own "(N lines unrecoverable)" notes are kept as bracketed editorial
    asides rather than silently dropped or invented over, consistent with CLAUDE.md's
    "evidence first, never invented" rule.

Only 2 of the ~20 Bucket A titles this pass — deliberately. The rest (Acts of
Philip/Andrew/Thomas/Peter/Peter-and-Paul, Revelation of Moses, Revelation of Esdras,
Coptic Apocalypse of Paul, the Pilate-cycle appendices, Assumption of Mary narratives,
Apocalypse of the Virgin/Thomas/Stephen, Liturgy of James — see NT_APOCRYPHA_BACKLOG.md)
each need their own confirmed, fetched-and-read source URL before a real extractor can
be written for them — guessing a URL or a page's section-boundary text risks silently
ingesting the wrong content or a 404 masquerading as "0 verses". Add them here as
additional ingest_X() functions + WORKS entries, ONE AT A TIME, only after actually
fetching and reading that source page (same as these two were).

KNOWN RISK, not yet verified — Acts of Barnabas footnote markers: sacred-texts.com
renders each footnote reference as a superscript link right in the middle of a
sentence (e.g. "...reveal them.[2133] And I..."); strip_tags()'s catch-all tag
removal turns the surrounding <sup>/<a> tags into spaces, which should leave the bare
footnote NUMBER sitting inline in the prose ("reveal them. 2133 And I..."). This
script strips those with a targeted regex (_strip_footnote_markers, below) based on
this page's actual footnote-number range (2132-2157) as read directly off the fetched
page — but that range is specific to THIS page; a different ANF page will have
different footnote numbers. TREAT THIS AS UNVERIFIED until you've actually run
--dry-run and read the samples: if a real footnote number leaks through as visible
text, or a real narrative number gets wrongly eaten, fix the regex before applying,
per CLAUDE.md's ingestion checklist (no guessing, no applying past known residue).

Run order (same as ingest-gnostic-priority.py / CLAUDE.md checklist):
  python ingest-nt-apocrypha-2.py --dry       # fetch + report, write nothing
  python ingest-nt-apocrypha-2.py             # fetch + write
  node sanitize-english.js
  node glossify-terms.js
  node de-archaic-corpus.js --dry-run         # extend modernize-english.js's VERBS
  node de-archaic-corpus.js                   #   if residue is reported, then re-run
  node fix-self-referential-glosses.js --apply
  python assign-canon-ids.py                  # add REGISTRY entries (canon_id 209+)
  node sample-corpus.js --src=nt-apocrypha-2-2026-07
  # restart the server
"""
import sqlite3, argparse, re, time, urllib.request, urllib.error
import html as html_entities
import unicodedata

LIGATURES = {'æ': 'ae', 'Æ': 'Ae', 'œ': 'oe', 'Œ': 'Oe'}

def fold_diacritics(s):
    for lig, expanded in LIGATURES.items():
        s = s.replace(lig, expanded)
    s = unicodedata.normalize('NFKD', s)
    return ''.join(c for c in s if not unicodedata.combining(c))

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'}

def fetch(url, _retries=3):
    req = urllib.request.Request(url, headers=UA)
    last_err = None
    for attempt in range(_retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code == 429:
                wait = e.headers.get('Retry-After')
                wait = float(wait) if wait and wait.isdigit() else 20 * (attempt + 1)
                print(f'    [rate-limited] {url} -> 429, waiting {wait:.0f}s before retry '
                      f'{attempt + 1}/{_retries}')
                time.sleep(wait)
            else:
                time.sleep(1.5 * (attempt + 1))
        except Exception as e:
            last_err = e
            time.sleep(1.5 * (attempt + 1))
    raise last_err

def strip_tags(raw):
    """Same reference implementation as ingest-gnostic-priority.py — see that file's
    comments for why each step exists. Duplicated on purpose (see module docstring)."""
    raw = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', raw)
    raw = re.sub(r'(?s)<br\s*/?>', '\n', raw)
    raw = re.sub(r'(?s)<(?:p|h[1-6])[^>]*>', '\n\n', raw)
    text = re.sub(r'(?s)<[^>]+>', ' ', raw)
    text = re.sub(r'[ \t]{2,}', ' ', text)
    text = re.sub(r'[ \t]+\n', '\n', text)
    text = re.sub(r'\n[ \t]+', '\n', text)
    text = re.sub(r' +([.,;:!?])', r'\1', text)
    _ABBR_BEFORE_COMMA = re.compile(r'\b(?:etc|al|viz|cf|i\.e|e\.g)$', re.I)
    def _fix_period_comma(m):
        return m.group(0) if _ABBR_BEFORE_COMMA.search(m.string[:m.start()]) else ','
    text = re.sub(r'(?<!\.)\.\s*,', _fix_period_comma, text)
    text = html_entities.unescape(text)
    text = fold_diacritics(text)
    return text

def to_int(x):
    try: return int(re.sub(r'[^0-9].*$', '', str(x)) or 0)
    except Exception: return 0

def collapse_para(p):
    """A paragraph produced by splitting on BLANK-line (\\n\\s*\\n) boundaries is
    supposed to be single-block prose — any SINGLE \\n still inside it is not a
    paragraph break by definition, it's a source-page line-wrap that survived because
    strip_tags() turns <br> into \\n. Found 2026-08-01 in Acts of Barnabas AND
    Melchizedek: sacred-texts.com / earlychristianwritings.com hard-wrap long prose
    lines with <br> mid-sentence ("remained in Iconium\\nmany days", "one of the\\naeons,
    that I might tell..."), which without this landed as a literal embedded newline
    baked into the stored verse text. Collapse to a space, then collapse the resulting
    run of spaces — never drop or alter any actual word."""
    return re.sub(r' {2,}', ' ', p.replace('\n', ' ')).strip()

# ─── 1. Gospel of Peter (Akhmim fragment) ────────────────────────────────────
# sacred-texts.com/bib/lbob/lbob30.htm — "The Lost Gospel According to Peter", in
# Platt's "The Lost Books of the Bible" (1926). Verified by fetching the page directly
# 2026-07-31: a long bracketed EDITORIAL INTRODUCTION (publication history, list of
# variations from the canonical gospels) precedes the actual scripture text, which
# starts at the literal words "BUT of the Jews" — everything before that is Platt's
# 1926 editorial framing, not the ancient text itself, so it's dropped rather than
# ingested as verse 1. The scripture text itself is verse 1 (unnumbered, "BUT of the
# Jews...do.") followed by explicitly numbered paragraphs 2-14 in the source.
def ingest_gospel_of_peter():
    html = fetch('https://sacred-texts.com/bib/lbob/lbob30.htm')
    text = strip_tags(html)
    if 'BUT of the Jews' not in text:
        print('  [gospel-of-peter] could not find "BUT of the Jews" start marker — '
              'page structure may have changed'); return []
    body = text.split('BUT of the Jews', 1)[1]
    body = 'BUT of the Jews' + body  # keep it — it's the start of real verse 1
    # Cut off the trailing site footer/nav ("Next: Table I.", "Sacred Texts | Bible", ...)
    # — Table I./Table II. are Platt's own appendix tables (a book-name cross-reference),
    # not part of the Gospel of Peter text.
    body = body.split('Next: Table I.', 1)[0]
    # p. 282 / p. 283 / p. 284 ... print-page markers, same class of clutter as Gospel
    # of Philip's NHC page numbers — drop them (they're plain "p. N" mid-paragraph here,
    # not a page-per-paragraph split we'd want to preserve as structure).
    body = re.sub(r'\bp\.\s*\d{1,4}\b', ' ', body)
    paras = [collapse_para(p) for p in re.split(r'\n\s*\n', body)]
    paras = [p for p in paras if p]
    # sacred-texts.com's own print-page breaks land mid-sentence at least 3 times in this
    # text (found 2026-08-01 via diag-gop-raw.py: after verses 5, 10, and 13) — the HTML's
    # blank-line paragraph break there is a PAGE boundary, not a verse boundary, so the
    # resuming fragment has no leading source verse-number at all. A paragraph with no
    # leading digit is source text CONTINUING the previous verse, never a new verse — the
    # same "page boundary != verse boundary" rule as CLAUDE.md's ingestion checklist,
    # applied here to a single verse split by a mid-sentence page break rather than a
    # multi-paragraph quotation. (Previously this fell through to sequential-number
    # guessing, which desynced every verse number after the first split: 17 rows instead
    # of 14, with "6"/"12" each assigned twice and "16" printed before "14".)
    rows = []  # each entry: [verse_number, text] — mutable so continuations can extend text
    for i, p in enumerate(paras):
        m = re.match(r'^(\d{1,2})\s+(.*)$', p, re.S)
        if i == 0:  # never treat the FIRST paragraph's leading digits as a verse number
            rows.append([1, p])
        elif m:
            rows.append([int(m.group(1)), m.group(2).strip()])
        elif rows:  # no leading digit -> continuation of the previous verse, not a new one
            rows[-1][1] = (rows[-1][1].rstrip() + ' ' + p.strip()).strip()
        else:
            rows.append([1, p])
    rows = [(v, t) for v, t in rows if t]
    print(f'  [gospel-of-peter] {len(rows)} verses (expect 14 — unnumbered opening + 2-14)')
    return [('GOSPEL_OF_PETER', 'Gospel of Peter', 'nt-apocrypha-en', '1', str(v), t) for v, t in rows]

# ─── 2. Acts of Barnabas ──────────────────────────────────────────────────────
# sacred-texts.com/chr/ecf/008/0081360.htm — Ante-Nicene Fathers vol. 8, tr. Alexander
# Walker 1886. Continuous first-person narrative prose, no chapter/verse markers in the
# source at all (unlike Acts of Paul and Thecla, which does have them) — split one verse
# per paragraph, same pattern as Gospel of Philip. See module docstring's "KNOWN RISK"
# note re: the footnote-marker strip below — verify with --dry-run before trusting it.
_BARNABAS_FOOTNOTE_NUMS = re.compile(r'(?<=[a-zæœ.,;:])\s+\d{4}\b(?=\s)')
def _strip_footnote_markers(text):
    return _BARNABAS_FOOTNOTE_NUMS.sub(' ', text)

def ingest_acts_of_barnabas():
    html = fetch('https://sacred-texts.com/chr/ecf/008/0081360.htm')
    text = strip_tags(html)
    if 'Since from the descent' not in text:
        print('  [acts-of-barnabas] could not find start marker — page structure may '
              'have changed'); return []
    body = text.split('Since from the descent', 1)[1]
    body = 'Since from the descent' + body
    body = body.split('The journeyings and martyrdom of the holy apostle Barnabas '
                       'have been fulfilled', 1)
    closing = body[1] if len(body) > 1 else ''
    body = body[0] + 'The journeyings and martyrdom of the holy apostle Barnabas ' \
                      'have been fulfilled through God.'
    body = re.sub(r'\bp\.\s*\d{1,4}\b', ' ', body)
    body = _strip_footnote_markers(body)
    paras = [collapse_para(p) for p in re.split(r'\n\s*\n', body)]
    paras = [p for p in paras if p]
    print(f'  [acts-of-barnabas] {len(paras)} verses (one per paragraph — no source '
          f'chapter/verse markers to align to)')
    return [('ACTS_OF_BARNABAS', 'Acts of Barnabas', 'nt-apocrypha-en', '1', str(i), p)
            for i, p in enumerate(paras, 1)]

# ─── 3. Melchizedek (Nag Hammadi Codex IX,1) ─────────────────────────────────
# earlychristianwritings.com/text/melchizedek.html — see module docstring for sourcing
# rationale. No chapter/verse structure in the source at all (nor could there be, given
# how little survives) — split one verse per paragraph/gap-note block, same pattern as
# Gospel of Philip. The translators' own "[...]" in-line gap brackets are already used
# by this app's OTHER Nag Hammadi ingests (Thomas/Philip both keep them as-is) and are
# left untouched here for the same reason — they're the honest, standard scholarly
# convention for "text physically missing here", not something to paper over.
def ingest_melchizedek():
    html = fetch('https://www.earlychristianwritings.com/text/melchizedek.html')
    text = strip_tags(html)
    if 'Jesus Christ, the Son of God' not in text:
        print('  [melchizedek] could not find start marker — page structure may have '
              'changed'); return []
    body = text.split('Jesus Christ, the Son of God', 1)[1]
    body = 'Jesus Christ, the Son of God' + body
    end_marker = 'This translation was made by'
    if end_marker not in body:
        print('  [melchizedek] could not find end marker — check for trailing site nav '
              'leaking into the text before trusting this run'); return []
    body = body.split(end_marker, 1)[0]
    # "*... (N lines unrecoverable)*" and "***(pp.23-24 ... missing)***" are the
    # translators' own gap notes, rendered here in markdown italic/bold syntax by
    # whatever originally emphasized them in HTML (<em>/<i>/<b>/<strong>) — strip_tags()
    # already turns those tags into spaces, so by the time we get here they're just
    # plain parenthetical text ("... (2 lines unrecoverable) ..."), no markdown symbols
    # to clean up. Left as-is, on purpose (see function docstring).
    paras = [collapse_para(p) for p in re.split(r'\n\s*\n', body)]
    paras = [p for p in paras if p]
    print(f'  [melchizedek] {len(paras)} verses (this tractate is ~64% lost/unrecoverable '
          f'in the original codex — short, gap-riddled verses are expected, not a bug)')
    return [('MELCHIZEDEK_NHC', 'Melchizedek', 'nag-hammadi-en', '1', str(i), p)
            for i, p in enumerate(paras, 1)]

WORKS = {
    'gospel-of-peter':  ('Gospel of Peter (sacred-texts.com, Lost Books of the Bible 1926, public domain)', ingest_gospel_of_peter),
    'acts-of-barnabas': ('Acts of Barnabas (sacred-texts.com, ANF vol. 8, 1886, public domain)', ingest_acts_of_barnabas),
    'melchizedek':      ('Melchizedek / NHC IX,1 (earlychristianwritings.com, Giversen & Pearson tr., openly republished)', ingest_melchizedek),
}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--corpus', default='corpus.db')
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--only', default=None,
                     help=f'comma-separated subset, e.g. --only=gospel-of-peter. '
                          f'Choices: {",".join(WORKS)}. Default: all.')
    A = ap.parse_args()
    selected = [k.strip() for k in A.only.split(',')] if A.only else list(WORKS)
    unknown = [k for k in selected if k not in WORKS]
    if unknown:
        print(f'unknown --only value(s): {unknown} — choices are {list(WORKS)}'); return

    all_rows = []
    for key in selected:
        label, fn = WORKS[key]
        print(f'fetching {label}…')
        all_rows += fn()

    codes = sorted(set(r[0] for r in all_rows))
    print(f'\nreconstructed {len(all_rows)} verses across {len(codes)} works: {codes}')

    if A.dry:
        print('dry run — nothing written'); return

    db = sqlite3.connect(A.corpus); cur = db.cursor()
    ph = ','.join('?' for _ in codes)
    if codes:
        cur.execute(f"DELETE FROM verses WHERE corpus='ENG' AND code IN ({ph})", codes)
        cur.execute(f"DELETE FROM books  WHERE corpus='ENG' AND code IN ({ph})", codes)

    counts, meta = {}, {}
    for code, title, cat, ch, v, t in all_rows:
        counts[code] = counts.get(code, 0) + 1
        meta[code] = (title, cat)
    bid = {}
    for code, n in counts.items():
        title, cat = meta[code]
        cur.execute("INSERT INTO books(corpus,code,title,category,n_verses) VALUES('ENG',?,?,?,?)",
                    (code, title, cat, n))
        bid[code] = cur.lastrowid
    for code, title, cat, ch, v, t in all_rows:
        rk = f'ENG:{code}:{ch}:{v}'
        cur.execute("""INSERT INTO verses(ref_key,book_id,corpus,code,chapter,verse,ord_c,ord_v,
                       text,category,src,canon_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL)""",
                    (rk, bid[code], 'ENG', code, ch, v, to_int(ch), to_int(v), t, cat,
                     'nt-apocrypha-2-2026-07'))
    db.commit(); db.close()
    print(f'ingested {len(all_rows)} verses into {A.corpus} (corpus \'ENG\'). '
          f'Next: node sanitize-english.js, node glossify-terms.js, '
          f'node de-archaic-corpus.js --dry-run, python assign-canon-ids.py, '
          f'node sample-corpus.js --src=nt-apocrypha-2-2026-07 (read the samples '
          f'before greenlighting — see CLAUDE.md ingestion checklist).')

if __name__ == '__main__':
    main()
