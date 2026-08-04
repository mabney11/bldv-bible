#!/usr/bin/env python3
"""
probe-norm.py — why does a Greek concordance click return NT only?

Replicates your exact norm_greek (from build-concordance.py) and asks the
concordance.db two questions:

  1. Under the norm computed from the NT word (default βασιλεὺς), how many
     occurrences exist in EACH corpus? If LXX/GRC are 0 here but the word is
     obviously in the OT, the OT forms are stored under a DIFFERENT norm —
     i.e. an accentuation mismatch, not a route/union bug.

  2. What norms actually exist across corpora for that word's letters? This
     shows the divergence directly (e.g. GNT 'βασιλεύς' vs LXX 'βασιλευς').

    python probe-norm.py                       # uses βασιλεὺς
    python probe-norm.py --word λόγος
    python probe-norm.py --db concordance.db --word βασιλεὺς
"""
import argparse, sqlite3, unicodedata, sys

# stdout as UTF-8 (Git Bash / Windows consoles otherwise choke on Greek)
try: sys.stdout.reconfigure(encoding='utf-8')
except Exception: pass

ap = argparse.ArgumentParser()
ap.add_argument('--db', default='concordance.db')
ap.add_argument('--word', default='βασιλεὺς')
A = ap.parse_args()

# ── exact copy of build-concordance.py norm_greek ────────────────────────────
def is_punct(ch): return unicodedata.category(ch).startswith('P')
def norm_greek(w):
    w = unicodedata.normalize('NFC', w)
    w = ''.join(c for c in w if not is_punct(c))
    w = unicodedata.normalize('NFD', w).replace('\u0300', '\u0301')   # grave→acute
    w = unicodedata.normalize('NFC', w).replace('\u03C2', '\u03C3')   # final sigma→sigma
    return w.lower()
def stripacc(w):  # accent-insensitive form, for comparison only
    w = ''.join(c for c in unicodedata.normalize('NFC', w) if not is_punct(c))
    return ''.join(c for c in unicodedata.normalize('NFD', w)
                   if unicodedata.category(c) != 'Mn').lower().replace('\u03c2', '\u03c3')

def cps(s): return ' '.join(f'U+{ord(c):04X}' for c in s)

db = sqlite3.connect(A.db)
nm = norm_greek(A.word)
print(f'word           : {A.word}   ({cps(A.word)})')
print(f'norm_greek     : {nm}   ({cps(nm)})')
print(f'accent-stripped: {stripacc(A.word)}\n')

print('1) occurrences under the NT-derived norm, per corpus:')
rows = db.execute("SELECT corpus, COUNT(*) n FROM tokens WHERE norm=? GROUP BY corpus ORDER BY n DESC", (nm,)).fetchall()
print('   ', dict(rows) or '(none — this norm matches nothing)')

print('\n2) every norm carrying these letters, per corpus (what actually got stored):')
like = stripacc(A.word)[:5] + '%'
rows = db.execute(
    "SELECT corpus, norm, COUNT(*) n FROM tokens WHERE lower(norm) LIKE ? GROUP BY corpus, norm "
    "ORDER BY n DESC LIMIT 25", (like,)).fetchall()
for corpus, norm, n in rows:
    flag = '  <- matches NT norm' if norm == nm else ''
    print(f'    {corpus:4} {norm:16} {n:6}{flag}')

print('\n3) accent-insensitive totals (what a folded norm WOULD unify), per corpus:')
agg = {}
for corpus, norm, n in db.execute(
        "SELECT corpus, norm, COUNT(*) n FROM tokens WHERE lower(norm) LIKE ? GROUP BY corpus, norm", (like,)):
    if stripacc(norm) == stripacc(A.word):
        agg[corpus] = agg.get(corpus, 0) + n
print('   ', agg or '(none)')
db.close()

print('\nReading:')
print('  • If (1) already shows LXX/GRC > 0, the data is fine — restart the server; it was a stale process.')
print('  • If (1) is NT-only but (3) shows LXX/GRC > 0, the OT forms exist under a different')
print('    accentuation: norm_greek needs to fold accents so NT and LXX unify (a concordance rebuild).')
