#!/usr/bin/env python3
"""
ingest-gnostic-priority.py — the 6 priority Nag Hammadi / NT Apocrypha works into
corpus.db (corpus 'ENG'), matching the existing Jasher/Enoch/Testaments pattern:
plain English verse text, no word-level Strong's tokenization (these texts have no
Strong's-numbered originals in this app the way the Hebrew OT / Greek NT do).

Sourced live at run time (same pattern as ingest-coptic.py / ingest-pseudepigrapha.py
— nothing is embedded in this file), from translations verified public-domain or
explicitly author-released:

  - Gospel of Thomas   — gospels.net (Mark M. Mattison, explicitly public domain)
  - Gospel of Philip   — gospels.net (Mark M. Mattison, explicitly public domain)
  - Pistis Sophia      — sacred-texts.com (G.R.S. Mead, 1921 — public domain)
  - Acts of Paul and Thecla — newadvent.org (Alexander Walker, Ante-Nicene Fathers
    vol. 8, 1886 — public domain)
  - Third Corinthians  — earlychristianwritings.com (M.R. James, The Apocryphal
    New Testament, 1924 — public domain)

NOT included here — Secret Book of John (Apocryphon of John): see the big comment
near SKIP_APOCRYPHON_OF_JOHN below. The only translation explicitly declared public
domain (Samuel Zinner, ed. Mark Mattison, "The Secret Writing According to John")
is currently only distributed as an academia.edu PDF, which this script can't fetch
and parse reliably. The web page that LOOKS like an HTML version of it
(othergospels.com/john/) actually interleaves that translation with a DIFFERENT,
rights-reserved translation (Stevan Davies') on the same page and says so in its own
footer ("All rights ... reserved by the author"), and separately flags its own verse
numbering as still in progress. Pulling text from that page risks ingesting the
wrong (rights-reserved) translation under a public-domain label. Fix this by hand:
download the academia.edu PDF, extract the Zinner/Mattison text only, and either
paste it into a local .txt file for a follow-up pass or extend this script once
you've confirmed which paragraphs are whose.

Run order (matches this repo's existing deploy order in CLAUDE.md):
  python ingest-gnostic-priority.py           # fetch + ingest
  python ingest-gnostic-priority.py --dry     # fetch + report only, write nothing
  node load-english-baseline.js               # (only if you also reseeded the OT/NT baseline)
  node sanitize-english.js                    # sanitizes ALL corpus.db ENG verses,
                                               # these included — no extra step needed
  python assign-canon-ids.py                  # promotes the ones registered there
  # restart the server
"""
import sqlite3, argparse, re, time, urllib.request, urllib.error
import html as html_entities
import unicodedata

# Two true ligatures (not decomposable via Unicode's own combining-mark data, so
# fold_diacritics() below can't catch them generically) seen in scholarly Greek
# transliteration: æ/œ. Expand to their plain-letter spelling.
LIGATURES = {'æ': 'ae', 'Æ': 'Ae', 'œ': 'oe', 'Œ': 'Oe'}

def fold_diacritics(s):
    """ASCII-fold Latin diacritics (macrons, accents, ...) so a scholarly-transliterated
    word reads as ONE plain-ASCII word to this app's name matcher. name-passthrough.js's
    single-word regex only recognizes [A-Za-z] — a word like "Sabaōth" (o-with-macron,
    what "Saba&#333;th" decodes to) isn't one contiguous match to that regex at all, the
    macron silently splits it into unmatched fragments ("Saba"/"th") that never reach the
    name map, no matter what's added there. Applies generically via Unicode NFKD
    decomposition + stripping combining marks, so any FUTURE accented transliteration
    (macron, acute, grave, ...) is covered without a hand-typed replacement table — only
    true ligatures (LIGATURES above) need a manual entry, since those have no combining-
    mark decomposition to strip."""
    for lig, expanded in LIGATURES.items():
        s = s.replace(lig, expanded)
    s = unicodedata.normalize('NFKD', s)
    return ''.join(c for c in s if not unicodedata.combining(c))

# A standard browser UA — the earlier custom string ("paleo-studio ingest script...")
# looked bot-ish to some sites' basic filtering.
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'}

def fetch(url, _retries=3):
    """GET url, retrying on transient errors. A 429 (rate limited) gets a MUCH longer
    wait than any other error — honors Retry-After if the server sends one, otherwise
    backs off hard (20s, 40s, 60s) rather than the few-second backoff appropriate for
    an ordinary network hiccup. Crawling sacred-texts.com's per-chapter pages tripped
    this during testing; a short backoff just re-triggers the same 429 immediately."""
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
    """Very small HTML->text helper: drop script/style, tags, decode entities."""
    raw = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', raw)
    raw = re.sub(r'(?s)<br\s*/?>', '\n', raw)
    # Headings (<h1>-<h6>) and paragraphs both get treated as blank-line-separated
    # blocks, not just <p> — some sources wrap section headers in <h2>/<h3> rather
    # than <p>, and without this those headers silently fused onto the very next
    # sentence with no separator at all once tags were stripped.
    raw = re.sub(r'(?s)<(?:p|h[1-6])[^>]*>', '\n\n', raw)
    # Every REMAINING tag (inline formatting like <i>/<b>/<strong>, stray closing tags,
    # etc.) becomes a single space, not nothing. Found 2026-07-30: an inline-styled
    # sub-heading immediately followed by body text with no literal space in the source
    # HTML ("...scripture.</i>And Yawachanan answered...") collapsed straight into
    # "scripture.And" once the tag was deleted outright — replacing with a space instead,
    # then collapsing any resulting run of spaces below, fixes this generically for any
    # tag boundary instead of patching each instance found.
    text = re.sub(r'(?s)<[^>]+>', ' ', raw)
    text = re.sub(r'[ \t]{2,}', ' ', text)
    text = re.sub(r'[ \t]+\n', '\n', text)
    text = re.sub(r'\n[ \t]+', '\n', text)
    # A tag sitting directly before punctuation ("<sup>1</sup>.") now leaves a stray
    # space in front of it ("1 .") since the tag became a space rather than nothing —
    # spaces are never correct before these marks in English prose, so strip them.
    text = re.sub(r' +([.,;:!?])', r'\1', text)
    # A period directly followed by a comma ("...Treasury of the Light., and
    # which...") is never correct English punctuation — confirmed present
    # verbatim in Mead's own 1921 Pistis Sophia source (sacred-texts.com
    # ps068.htm), not something this pipeline introduces. The sentence plainly
    # continues past that point, so the comma is the real punctuation and the
    # period is the stray one; drop it. Two guards, found by dry-running the
    # equivalent fix (fix-period-comma.js) against the already-ingested corpus
    # before trusting this pattern blindly: (1) a genuine ELLIPSIS immediately
    # before a comma ("Māhawai ..., is spoilt" — three real dots) must never
    # lose a dot — the lookbehind below refuses to match a period that is
    # itself preceded by another period, so a "..." run is never touched;
    # (2) a sentence-internal abbreviation right before a list comma ("fruits,
    # vegetables, etc., are healthy") must keep its period.
    _ABBR_BEFORE_COMMA = re.compile(r'\b(?:etc|al|viz|cf|i\.e|e\.g)$', re.I)
    def _fix_period_comma(m):
        return m.group(0) if _ABBR_BEFORE_COMMA.search(m.string[:m.start()]) else ','
    text = re.sub(r'(?<!\.)\.\s*,', _fix_period_comma, text)
    # Decode ALL HTML entities (named + numeric/hex), not a hand-picked shortlist.
    # Found 2026-07-30: G.R.S. Mead's Pistis Sophia translation uses entities this
    # app's old curated list never covered — "&aelig;ons" (aeons/æons) and
    # "Saba&#333;th" (Sabaōth, numeric entity for o-with-macron) — leaking through
    # to the reader as literal "&aelig;ons"/"Saba&#333;th" text instead of being
    # decoded. html.unescape() covers the full HTML5 named-entity table plus every
    # numeric/hex entity, so no future source's entities need a manual add here.
    text = html_entities.unescape(text)
    text = fold_diacritics(text)
    return text

# ─── 1. Gospel of Thomas ─────────────────────────────────────────────────────
def ingest_thomas():
    html = fetch('https://www.gospels.net/thomas')
    text = strip_tags(html)
    # Body starts at "Prologue"; each saying is "Saying N: Title" as its own line.
    body = text.split('Prologue', 1)
    if len(body) < 2:
        print('  [thomas] could not find Prologue marker — page structure may have changed'); return []
    body = body[1]
    body = body.split('The Gospel', 1)[0]  # cut off the trailing "The Gospel According to Thomas" + notes
    rows = [(1, '0', body.split('Saying 1:', 1)[0].strip())] if 'Saying 1:' in body else []
    parts = re.split(r'\*{0,2}Saying (\d+):[^\n]*\n?', body)
    # parts[0] is prologue text (already captured above); parts[1::2] are numbers, parts[2::2] are bodies
    for i in range(1, len(parts) - 1, 2):
        n = parts[i].strip()
        t = parts[i + 1].strip()
        if t:
            rows.append((1, n, t))
    rows = [(c, v, t) for c, v, t in rows if t]
    print(f'  [thomas] {len(rows)} verses (prologue + 114 sayings expected)')
    return [('GOSPEL_OF_THOMAS', 'Gospel of Thomas', 'nag-hammadi-en', c, v, t) for c, v, t in rows]

# ─── 2. Gospel of Philip ─────────────────────────────────────────────────────
def ingest_philip():
    html = fetch('https://www.gospels.net/philip')
    text = strip_tags(html)
    # The page's own "Symbols" legend USES "51" as its example page number
    # ("Symbols / 51 Page Number / [ ] Gap in the text / / \ Editorial correction of
    # a scribal error / ( ) Editorial insertion") before the real content starts.
    # Stripping only up to the first newline after "Symbols" (the previous version
    # of this function) left that legend in the body — its own "51" then became a
    # SECOND, spurious page-51 boundary, right in front of the real one, so the
    # real page 51 paragraph ("A Hebrew creates a Hebrew...") ended up captured as
    # the tail of the legend's fake "verse 51" and the real one's actual text got
    # bumped/lost behind it. Strip the whole legend block by its fixed end-phrase
    # instead of by a line count.
    if 'Editorial insertion' in text:
        text = text.split('Editorial insertion', 1)[1]
    body = text.split('The Gospel', 1)[0]
    # The manuscript's own NHC page-number citations (51-86) appear inline as a
    # bare number, e.g. "... they create others [...] 52 it's good enough...".
    # An earlier version of this function used them as verse boundaries and kept
    # them in the visible text as "[p.52]" markers — citation-accurate, but it
    # read as clutter in a reading app ("[p.52] is odd"). Strip them out entirely;
    # the chapter:verse reference this app already shows is enough of a locator.
    body = re.sub(r'\s*\b(5[1-9]|6[0-9]|7[0-9]|8[0-6])\b(?=\s)', ' ', body)
    # Split into one verse PER PARAGRAPH/HEADING instead of one verse per
    # manuscript page. A single NHC page spans a heading plus several
    # paragraphs, so page-boundary verses read as one undifferentiated wall of
    # text ("Life, Death, Light, and Darkness Those who sow in the winter...")
    # with no visible break between the heading and the prose that follows.
    # strip_tags() turns each source heading/paragraph block into its own
    # blank-line-separated chunk — using that as the verse boundary gives the
    # same one-idea-per-verse granularity Thomas already has (one verse per
    # saying), so headings and paragraphs actually show as separate, readable
    # verses instead of being flattened together.
    paras = [re.sub(r' {2,}', ' ', p).strip() for p in re.split(r'\n\s*\n', body)]
    paras = [p for p in paras if p]
    rows = [(str(i), p) for i, p in enumerate(paras, 1)]
    print(f'  [philip] {len(rows)} verses (one per paragraph/heading; NHC page-number citations dropped)')
    return [('GOSPEL_OF_PHILIP', 'Gospel of Philip', 'nag-hammadi-en', '1', v, t) for v, t in rows]

# ─── 3. Pistis Sophia ────────────────────────────────────────────────────────
# sacred-texts.com serves one HTML page per section (ps002.htm, ps003.htm, ...),
# linked by "Next:". The book name does NOT appear in the body of a chapter page
# (confirmed by fetching ps010.htm directly) — it only shows up in that page's
# <title>, phrased as an ordinal word, e.g.:
#   "Pistis Sophia: The First Book of Pistis Sophia: Chapter 6"
# Book 4 is titled "The Books of the Saviour" rather than "The Fourth Book of...".
# Read book + chapter from <title> (far more reliable than scanning body prose,
# where "second"/"third" etc. show up constantly as ordinary English words).
# Real chapter content starts at ps005.htm ("Chapter 1") — ps001-ps004 are
# contents/preface/bibliography, which have no "Chapter N" in their title and
# are skipped (not counted as a fetch failure — the crawl just keeps going).
PS_START = 'https://sacred-texts.com/chr/ps/ps{}.htm'  # e.g. ps005.htm — pass a zero-padded 3-digit string
TITLE_RE       = re.compile(r'<title>(.*?)</title>', re.I | re.S)
PS_BOOK_ORD_RE = re.compile(r'\b(First|Second|Third|Fourth)\s+Book\b', re.I)
PS_SAVIOUR_RE  = re.compile(r'Books?\s+of\s+the\s+Saviour', re.I)
PS_CHAP_RE     = re.compile(r'\bChapter\s+([0-9]+)\b', re.I)
ORD_WORD = {'first': 1, 'second': 2, 'third': 3, 'fourth': 4}
PS_BOILERPLATE = ('Buy this Book', 'Internet Sacred Text Archive', 'Sacred Texts', 'Pistis Sophia,',
                   # sacred-texts.com's own page-navigation footer ("« Previous: Pistis
                   # Sophia: ...", "Next: Pistis Sophia: ... »") — page chrome from the
                   # SOURCE SITE, not book content. It wasn't reliably being cut before the
                   # paragraph split (the '---\n[Next' marker this code used to look for
                   # didn't match the real raw-HTML structure), so it was ending up as its
                   # own extra "verse" at the end of many chapters. Caught here instead,
                   # via the SAME boilerplate-paragraph filter already used for the site's
                   # "Buy this Book" clutter — these nav paragraphs already arrive as their
                   # own isolated blank-line-separated chunks, so this alone is enough.
                   'Previous: Pistis Sophia', 'Next: Pistis Sophia')

def ingest_pistis_sophia(max_pages=400, max_consecutive_fetch_failures=10):
    book = 1
    rows = []  # (book, chap, running-paragraph-index, text)
    n = 4
    fetch_failures = 0
    while n < max_pages and fetch_failures < max_consecutive_fetch_failures:
        url = PS_START.format(str(n).zfill(3))
        try:
            html = fetch(url)
        except Exception as e:
            print(f'    [pistis-sophia] fetch failed for {url}: {e}')
            fetch_failures += 1; n += 1; continue
        fetch_failures = 0
        time.sleep(2.0)  # be polite — a fast loop is exactly what triggered the 429 earlier

        tm = TITLE_RE.search(html)
        title_text = tm.group(1) if tm else ''
        bm = PS_BOOK_ORD_RE.search(title_text)
        if bm:
            book = ORD_WORD.get(bm.group(1).lower(), book)
        elif PS_SAVIOUR_RE.search(title_text):
            book = 4
        cm = PS_CHAP_RE.search(title_text)
        if not cm:
            n += 1; continue  # front matter / index / notes page — no numbered chapter, skip

        chap = int(cm.group(1))
        text = strip_tags(html)
        main = text.split('---\n[Next', 1)[0] if '---\n[Next' in text else text
        main = re.sub(r'\n\s*p\.\s*\d+\s*\n', '\n\n', main)  # strip standalone "p. N" page markers
        # Mead's own 1921-edition page-citation markers ("|127.", "|128.", ...) appear
        # INLINE mid-sentence ("...that you may have mercy |127. on the whole world"), not
        # on their own line, so the standalone-marker regex above never touched them — pure
        # citation clutter, same class of fix as Gospel of Philip's dropped "[p.N]" markers.
        main = re.sub(r'\|\s*\d{1,4}\.\s*', ' ', main)
        # "[paragraph continues]" is sacred-texts.com's own transcription note (this
        # printed page began mid-paragraph, continuing from the previous page) — scholarly
        # apparatus, not book content.
        main = re.sub(r'\[paragraph continues\]', '', main, flags=re.I)
        paras = [p.strip() for p in re.split(r'\n\s*\n', main) if len(p.strip()) > 40]
        paras = [p for p in paras if not any(b in p for b in PS_BOILERPLATE)]
        # The source typesets a multi-verse embedded scripture quotation as several
        # separate paragraphs, one per quoted verse (e.g. "'10. Grace and truth met
        # together...'" blank line "'11. Truth has sprouted forth...'"). Splitting those
        # into separate top-level app verses produced a confusing DOUBLE numbering — this
        # app's own verse number immediately followed by the quotation's OWN embedded
        # verse number. It's one continuous quotation, so merge a paragraph that's really
        # "the next line of the quotation already open" into the paragraph before it
        # instead of giving it its own app verse — no fabricated verse numbers, and the
        # quotation reads as a single, coherent block. (fieldy 2026-07-30: "no need to
        # fabricate verse numbers, instead lets make it read nicely".)
        merged = []
        for p in paras:
            if merged and re.match(r'^["\'‘’“”]{1,2}\d{1,3}\.\s', p):
                merged[-1] = merged[-1] + ' ' + p
            else:
                merged.append(p)
        paras = merged
        for i, p in enumerate(paras, 1):
            rows.append((book, chap, i, p))
        n += 1

    print(f'  [pistis-sophia] {len(rows)} paragraphs across books {sorted(set(r[0] for r in rows))}, '
          f'chapters up to {max((r[1] for r in rows), default=0)} (crawled to page ~{n})')
    # sacred-texts.com numbers chapters CONTINUOUSLY across all four books — confirmed by
    # fetching ps067.htm directly: Book 1's last page ("Chapter 62") links "Next: ... The
    # Second Book of Pistis Sophia: Chapter 63", not "Chapter 1". Using that raw number as
    # the stored chapter means every book after the first has NO "chapter 1" row at all,
    # which is exactly why the reader (defaults to chapter=1) showed Pistis Sophia
    # II/III/IV as "has not been translated" even though their paragraphs really are in
    # corpus.db, just filed under chapter 63+/etc. Remap each book's own raw chapter
    # numbers to a normal local 1, 2, 3... sequence (first-seen order within that book,
    # which is already the correct reading order since pages are crawled sequentially).
    remap, counters = {}, {}
    for book, raw_chap, i, t in rows:
        bm = remap.setdefault(book, {})
        if raw_chap not in bm:
            counters[book] = counters.get(book, 0) + 1
            bm[raw_chap] = counters[book]
    out = []
    for book, raw_chap, i, t in rows:
        local_chap = remap[book][raw_chap]
        code = f'PISTIS_SOPHIA_{book}'
        title = {1: 'Pistis Sophia I', 2: 'Pistis Sophia II', 3: 'Pistis Sophia III',
                 4: 'Pistis Sophia IV (Books of the Saviour)'}.get(book, f'Pistis Sophia {book}')
        out.append((code, title, 'nag-hammadi-en', str(local_chap), str(i), t))
    return out

# ─── 4. Acts of Paul and Thecla ──────────────────────────────────────────────
def ingest_thecla():
    html = fetch('https://www.newadvent.org/fathers/0816.htm')
    text = strip_tags(html)
    text = text.split('# The Acts of Paul and Thecla', 1)[-1]
    text = text.split('About this page', 1)[0]
    text = text.split('help support the mission', 1)[-1]
    paras = [p.strip() for p in re.split(r'\n\s*\n', text) if len(p.strip()) > 60]
    print(f'  [acts-of-paul-and-thecla] {len(paras)} paragraphs')
    return [('ACTS_OF_PAUL_AND_THECLA', 'Acts of Paul and Thecla', 'nt-apocrypha-en', '1', str(i), p)
            for i, p in enumerate(paras, 1)]

# ─── 5. Third Corinthians ────────────────────────────────────────────────────
# Hosted as part of the combined "Acts of Paul" page; the correspondence has real
# roman-numeral.verse markers in the source (I.1-I.16 = Corinthians' letter,
# II.1-5 = narrative, III.1-40 = Paul's reply) — use those directly as chapter:verse.
def ingest_3corinthians():
    html = fetch('https://earlychristianwritings.com/text/actspaul.html')
    text = strip_tags(html)
    m = re.search(r"We begin with a short narrative.*", text, re.S)
    if not m:
        print('  [3-corinthians] could not find start marker — page structure may have changed'); return []
    body = m.group(0)
    body = body.split('VIII', 1)[0]  # next section heading ("AT EPHESUS") starts the next episode

    # Chapter markers look like "I. 1", "II. 1", "III.1" (roman numeral + verse 1).
    # Only the FIRST verse of each chapter carries the roman numeral; every verse
    # after that is a bare number ("2 There have come...", "40 and peace..."), which
    # can follow a comma just as often as a period — so don't require any specific
    # preceding punctuation, just a word boundary before the digits. Many verses are
    # mid-sentence continuations of the previous verse ("...evil (CORRUPT) words,
    # 3 which do thou prove AND EXAMINE:") and start with a LOWERCASE word, not a
    # fresh capitalized sentence — so the lookahead accepts any letter, not just
    # capitals (an earlier version required a capital and silently dropped every
    # verse like this one).
    chap_starts = list(re.finditer(r'\b(I{1,3})\.\s*1\b', body))
    if len(chap_starts) < 3:
        print(f'  [3-corinthians] only found {len(chap_starts)} of 3 expected chapter markers '
              f'(I./II./III.) — check source formatting before trusting this run')

    VERSE_RE = re.compile(r'\b(\d{1,3})(?=\s+[\"\'(]*[A-Za-z])')
    rows = []
    for idx, cm in enumerate(chap_starts):
        chap = {'I': 1, 'II': 2, 'III': 3}.get(cm.group(1), idx + 1)
        start = cm.end()
        end = chap_starts[idx + 1].start() if idx + 1 < len(chap_starts) else len(body)
        chunk = body[start:end]
        parts = VERSE_RE.split(chunk)
        # parts[0] is verse 1's text (up to the first inline verse-number marker);
        # parts[1::2] are the verse numbers found inline, parts[2::2] their text.
        v1 = parts[0].strip()
        if v1:
            rows.append((chap, 1, v1))
        for i in range(1, len(parts) - 1, 2):
            vnum, t = to_int(parts[i]), parts[i + 1].strip()
            if t:
                rows.append((chap, vnum, t))
    print(f'  [3-corinthians] {len(rows)} verses across {len(chap_starts)} chapters '
          f'(Corinthians\' letter, narrative, Paul\'s reply — ~16+5+40 expected)')
    return [('THIRD_CORINTHIANS', 'Third Corinthians', 'nt-apocrypha-en', str(c), str(v), t) for c, v, t in rows]

def to_int(x):
    try: return int(re.sub(r'[^0-9].*$', '', str(x)) or 0)
    except Exception: return 0

WORKS = {
    'thomas':          ('Gospel of Thomas (gospels.net, public domain)',              ingest_thomas),
    'philip':          ('Gospel of Philip (gospels.net, public domain)',              ingest_philip),
    'pistis-sophia':   ('Pistis Sophia (sacred-texts.com, G.R.S. Mead 1921, public domain)', ingest_pistis_sophia),
    'thecla':          ('Acts of Paul and Thecla (newadvent.org, Ante-Nicene Fathers, public domain)', ingest_thecla),
    '3corinthians':    ('Third Corinthians (earlychristianwritings.com, M.R. James 1924, public domain)', ingest_3corinthians),
}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--corpus', default='corpus.db')
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--only', default=None,
                     help=f'comma-separated subset to (re-)ingest, e.g. --only=philip. '
                          f'Choices: {",".join(WORKS)}. Default: all. Only deletes/reinserts the '
                          f'codes belonging to the selected work(s) — everything else already in '
                          f'corpus.db is left untouched, so re-running one work to fix a bug does '
                          f"not require re-crawling e.g. Pistis Sophia's ~150 pages again.")
    A = ap.parse_args()
    selected = [k.strip() for k in A.only.split(',')] if A.only else list(WORKS)
    unknown = [k for k in selected if k not in WORKS]
    if unknown:
        print(f'unknown --only value(s): {unknown} — choices are {list(WORKS)}'); return

    all_rows = []  # (code, title, category, chapter, verse, text)
    for key in selected:
        label, fn = WORKS[key]
        print(f'fetching {label}…')
        all_rows += fn()
    if A.only is None:
        print('SKIPPED: Secret Book of John (Apocryphon of John) — see the big comment at the top '
              'of this file. Needs the academia.edu PDF pulled by hand before it can be ingested '
              'as public-domain text.')

    codes = sorted(set(r[0] for r in all_rows))
    print(f'\nreconstructed {len(all_rows)} verses across {len(codes)} works: {codes}')

    if A.dry:
        print('dry run — nothing written'); return

    db = sqlite3.connect(A.corpus); cur = db.cursor()
    # Defensive: only touch OUR OWN codes, never a blanket "DELETE FROM verses WHERE corpus='ENG'"
    # (that wipes the canonical baseline + every other pseudepigraphon — see CLAUDE.md book_id notes).
    ph = ','.join('?' for _ in codes)
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
                     'gnostic-priority-2026-07'))
    db.commit(); db.close()
    print(f'ingested {len(all_rows)} verses into {A.corpus} (corpus \'ENG\'). '
          f'Run node sanitize-english.js next, then python assign-canon-ids.py to promote '
          f'these into the main book dropdown.')

if __name__ == '__main__':
    main()
