#!/usr/bin/env python3
"""
migrate-clean-forms.py — clean concordance.db `forms.display` IN PLACE.

Why: `forms.display` was filled with MIN(surface), which can pick a surface that
carries critical-edition apparatus — supplied letters in (parens), lacunae as
/ or ///, half-brackets ⸢ ⸣, trailing punctuation. That's why headwords show up
as "ἀνατο///λὰς," or "(δ)ὲ". The grouping key (`norm`) is already clean; only the
chosen *display* string is messy.

`forms` is the small aggregate table (one row per distinct norm per corpus), NOT
the 43.9M-row `tokens` table — so this rewrites the displays in seconds and needs
NO full reindex. Run it once against an existing concordance.db; re-running is
safe (idempotent).

    python migrate-clean-forms.py                 # expects ./concordance.db
    python migrate-clean-forms.py --db /path/concordance.db

For a from-scratch rebuild, build-concordance.py now bakes the same cleaning in,
so you won't need this again after the next rebuild.
"""
import sqlite3, unicodedata, argparse, re, sys

ap = argparse.ArgumentParser()
ap.add_argument('--db', default='concordance.db')
A = ap.parse_args()

# Editorial apparatus that should never reach a display string. Mirrors the
# client's cleanSurface() so render-cleaning and data-cleaning agree.
_EDITORIAL = re.compile('[()\\[\\]{}\u27e6\u27e7\u2e22\u2e23\u2e24\u2e25\u230a\u230b/\\\\|]')

def _is_edge(ch):
    # Trim anything that's whitespace or a punctuation category at either end.
    return ch.isspace() or unicodedata.category(ch).startswith('P')

def clean_display(s):
    if not s:
        return s
    t = _EDITORIAL.sub('', s)
    i, j = 0, len(t)
    while i < j and _is_edge(t[i]):
        i += 1
    while j > i and _is_edge(t[j - 1]):
        j -= 1
    cleaned = t[i:j]
    # Never blank a display: if cleaning ate everything (all-apparatus token),
    # keep the original so the row still shows *something*.
    return cleaned if cleaned else s

def main():
    db = sqlite3.connect(A.db)
    db.create_function('clean_disp', 1, clean_display, deterministic=True)
    cur = db.cursor()

    # Sanity: the table must exist and have a display column.
    cols = [r[1] for r in cur.execute("PRAGMA table_info(forms)").fetchall()]
    if not cols:
        sys.exit(f"[error] no `forms` table in {A.db} — is this a concordance.db?")
    if 'display' not in cols:
        sys.exit("[error] `forms` has no `display` column.")

    before = cur.execute("SELECT COUNT(*) FROM forms").fetchone()[0]
    # Count how many actually carry apparatus, just for the report.
    dirty = cur.execute(
        "SELECT COUNT(*) FROM forms WHERE display <> clean_disp(display)").fetchone()[0]

    cur.execute("UPDATE forms SET display = clean_disp(display) "
                "WHERE display <> clean_disp(display)")
    db.commit()
    print(f"[forms] {before} rows · cleaned {dirty} messy display(s)")

    # A few before/after-style spot checks so you can eyeball the result.
    sample = cur.execute(
        "SELECT corpus, norm, display, n FROM forms "
        "ORDER BY n DESC LIMIT 8").fetchall()
    print("[sample top forms]")
    for corpus, norm, disp, n in sample:
        print(f"   {corpus:4} {disp!r:24} n={n}")

    db.close()
    print("[done] forms.display normalized in place.")

if __name__ == '__main__':
    main()
