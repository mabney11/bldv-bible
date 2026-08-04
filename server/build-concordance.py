#!/usr/bin/env python3
"""
build-concordance.py  —  Universal concordance / occurrence index.

Indexes EVERY word of EVERY verse in corpus.db (all six corpora, canonical
books AND literary works) into concordance.db, so the app knows every usage of
every form in every language. Real lemmas are attached where genuine morphology
exists (Greek NT via morph-grc.db); everywhere else matching is exact-surface
(same normalized orthographic form = same term, no guessing, no inflection
collapse). Occurrences carry the canonical reference (canon_id, ord_c, ord_v),
so a hit in one language navigates to the same verse in any other.

Run:  python build-concordance.py            (expects corpus.db + morph-grc.db here)
      python build-concordance.py --corpus /path/corpus.db --morph /path/morph-grc.db

Output: concordance.db  (tokens, forms, lemmas)

Display QA: `forms.display` is cleaned of critical-edition apparatus (supplied
letters in (parens), lacunae as / or ///, half-brackets ⸢ ⸣, edge punctuation)
so headwords read as "ἀνατολάς", not "ἀνατο///λὰς,". The grouping key (`norm`)
is unaffected — only the human-facing display string is tidied. (To fix an
ALREADY-built concordance.db without a full rebuild, run migrate-clean-forms.py.)
"""
import sqlite3, unicodedata, argparse, os, sys, re

ap = argparse.ArgumentParser()
ap.add_argument('--corpus', default='corpus.db')
ap.add_argument('--morph',  default='morph-grc.db')
ap.add_argument('--out',    default='concordance.db')
ap.add_argument('--corpora', default='', help='comma list to restrict (default: all)')
A = ap.parse_args()
ONLY = set(x.strip() for x in A.corpora.split(',') if x.strip())

def is_punct(ch): return unicodedata.category(ch).startswith('P')
def _stripacc(s):  # mirrors morph-grc.db .norm: drop accents, lowercase, keep final sigma
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn').lower()

# ── Display cleaning ─────────────────────────────────────────────────────────
# Strips editorial apparatus and trims edge punctuation for the human-facing
# display string, keeping letters and accents intact. Mirrors the client's
# cleanSurface() so render-cleaning and baked data agree.
_EDITORIAL = re.compile('[()\\[\\]{}\u27e6\u27e7\u2e22\u2e23\u2e24\u2e25\u230a\u230b/\\\\|]')
def clean_display(s):
    if not s:
        return s
    t = _EDITORIAL.sub('', s)
    edge = lambda ch: ch.isspace() or unicodedata.category(ch).startswith('P')
    i, j = 0, len(t)
    while i < j and edge(t[i]):
        i += 1
    while j > i and edge(t[j - 1]):
        j -= 1
    cleaned = t[i:j]
    return cleaned if cleaned else s   # never blank an all-apparatus token

# ── Per-language normalization. Conservative: folds only orthographic/positional
#    variants that are unambiguously the SAME term; never strips meaning-bearing
#    distinctions (Greek accents are kept; only positional grave→acute folds). ──
HEB_FINALS = {'\u05DA':'\u05DB','\u05DD':'\u05DE','\u05DF':'\u05E0','\u05E3':'\u05E4','\u05E5':'\u05E6'}
def norm_hebrew(w):
    w = ''.join(c for c in w if not (0x0591 <= ord(c) <= 0x05C7))      # drop points/cantillation
    w = ''.join(HEB_FINALS.get(c, c) for c in w)                       # fold final forms
    return ''.join(c for c in w if not is_punct(c))
def norm_greek(w):
    w = unicodedata.normalize('NFC', w)
    w = ''.join(c for c in w if not is_punct(c))
    w = unicodedata.normalize('NFD', w).replace('\u0300', '\u0301')    # grave→acute (positional)
    w = unicodedata.normalize('NFC', w).replace('\u03C2', '\u03C3')    # final sigma→sigma
    return w.lower()
def norm_latin(w):
    return ''.join(c for c in unicodedata.normalize('NFC', w) if not is_punct(c)).lower()
def norm_geez(w):
    return ''.join(c for c in w if not (0x1360 <= ord(c) <= 0x1368) and not is_punct(c))
NORM = {'HEB':norm_hebrew, 'LXX':norm_greek, 'GNT':norm_greek, 'GRC':norm_greek,
        'LAT':norm_latin, 'GEZ':norm_geez}

# ── Greek NT lemma/strongs lookup (morph-grc.db), keyed by (canon,ch,v,norm) ──
grc = {}
if os.path.exists(A.morph):
    m = sqlite3.connect(A.morph)
    for cid, ch, v, w, lemma, strongs in m.execute(
            "SELECT canon_id,ch,v,norm,lemma,strongs FROM words"):
        grc[(cid, ch, v, w)] = (lemma, strongs)   # w here is the morph 'norm' column
    m.close()
    print(f"[morph-grc] {len(grc)} Greek NT word forms loaded")
else:
    print("[morph-grc] not found — Greek NT lemmas will be omitted")

src = sqlite3.connect(A.corpus)
if os.path.exists(A.out): os.remove(A.out)
out = sqlite3.connect(A.out)
out.create_function('clean_disp', 1, clean_display, deterministic=True)
c = out.cursor()
c.execute("PRAGMA journal_mode=OFF"); c.execute("PRAGMA synchronous=OFF")
c.execute("""CREATE TABLE tokens(
  corpus TEXT, canon_id INT, code TEXT, ord_c INT, ord_v INT, ch TEXT, v TEXT,
  ord INT, surface TEXT, norm TEXT, lemma TEXT, strongs TEXT)""")

batch, n = [], 0
GREEK_NT = lambda corpus, cid: corpus == 'GNT' and cid is not None and 40 <= cid <= 66
q = src.execute("""SELECT corpus, canon_id, code, ord_c, ord_v, chapter, verse, text
                   FROM verses""")
for corpus, canon_id, code, ord_c, ord_v, ch, v, text in q:
    if not text: continue
    if ONLY and corpus not in ONLY: continue
    normf = NORM.get(corpus, norm_latin)
    ordn = 0
    # Maqaf (U+05BE) is a Hebrew word-joiner, not intra-word punctuation. Split on
    # it so each half (מלכי / צדק) is its own searchable form, matching how the
    # surface index (per tokens_bhs token) and the reader (per chip) treat it.
    # Harmless for other corpora — none contain U+05BE.
    for p in text.replace('\u05BE', ' ').split():
        nm = normf(p)
        if not nm: continue
        ordn += 1
        lemma = strongs = None
        if GREEK_NT(corpus, canon_id):
            gkey = _stripacc(''.join(ch2 for ch2 in unicodedata.normalize('NFC', p) if not is_punct(ch2)))
            hit = grc.get((canon_id, ord_c, ord_v, gkey))
            if hit: lemma, strongs = hit
        batch.append((corpus, canon_id, code, ord_c, ord_v, str(ch), str(v),
                      ordn, p, nm, lemma, strongs))
        if len(batch) >= 50000:
            c.executemany("INSERT INTO tokens VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", batch)
            out.commit(); n += len(batch); batch = []
if batch:
    c.executemany("INSERT INTO tokens VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", batch)
    out.commit(); n += len(batch)
print(f"[tokens] {n} word occurrences indexed")

# ── Aggregates: distinct forms (per corpus) + distinct lemmas (per corpus) ──
c.execute("CREATE INDEX ix_tok_norm  ON tokens(corpus, norm)")
c.execute("CREATE INDEX ix_tok_lemma ON tokens(corpus, lemma)")
c.execute("CREATE INDEX ix_tok_loc   ON tokens(corpus, canon_id, ord_c, ord_v)")
c.execute("""CREATE TABLE forms AS
  SELECT corpus, norm, MIN(surface) AS display, COUNT(*) AS n
  FROM tokens GROUP BY corpus, norm""")
# Bake the display cleaning into the small aggregate (NOT per-token): MIN(surface)
# may have picked an apparatus-laden form; clean it so the headword is tidy.
c.execute("UPDATE forms SET display = clean_disp(display) "
          "WHERE display <> clean_disp(display)")
c.execute("""CREATE TABLE lemmas AS
  SELECT corpus, lemma, MAX(strongs) AS strongs, COUNT(*) AS n
  FROM tokens WHERE lemma IS NOT NULL GROUP BY corpus, lemma""")

c.execute("CREATE INDEX ix_forms     ON forms(corpus, norm)")
c.execute("CREATE INDEX ix_forms_n   ON forms(corpus, n DESC)")
c.execute("CREATE INDEX ix_lemmas    ON lemmas(corpus, lemma)")

# ── Runtime indexes for the concordance API ──────────────────────────────────
# The API filters by `norm=? AND corpus IN (group)` and orders/aggregates by
# canon_id/code/ordinals. A norm-LEADING index turns the search term into one
# tiny range and carries the columns COUNT/by_corpus/by_book need, so they are
# answered from the index alone instead of touching the 43.9M-row table.
# (lemma index is partial — lemmas exist only where there's morphology.)
c.execute("CREATE INDEX ix_tok_conc     ON tokens(norm, corpus, canon_id, code, ord_c, ord_v, ord)")
c.execute("CREATE INDEX ix_tok_conc_lem ON tokens(lemma, corpus, canon_id, code, ord_c, ord_v, ord) WHERE lemma IS NOT NULL")
# ix_tok_norm / ix_tok_lemma were only needed to build forms/lemmas above and are
# superseded at runtime by the covering indexes — drop them so the file doesn't balloon.
c.execute("DROP INDEX ix_tok_norm")
c.execute("DROP INDEX ix_tok_lemma")
# ANALYZE writes statistics; without it SQLite often abandons the index and scans.
c.execute("ANALYZE")
out.commit()

print("[forms]  per corpus:", dict(c.execute(
    "SELECT corpus, COUNT(*) FROM forms GROUP BY corpus").fetchall()))
print("[lemmas] per corpus:", dict(c.execute(
    "SELECT corpus, COUNT(*) FROM lemmas GROUP BY corpus").fetchall()))
out.close(); src.close()
print(f"[done] wrote {A.out}")
