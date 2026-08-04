#!/usr/bin/env python3
"""
fix-melchiz-cyril-chapters.py — one-off prep for combining the two Cyril-on-Melchizedek
homilies (LIT3326Melchiz1, LIT3327Melchiz2) into a single 2-chapter book via a shared
canon_id in assign-canon-ids.py's REGISTRY.

Both currently sit at chapter=1 in corpus.db (each is its own single-chapter Beta
Masaheft work) — sharing one canon_id AS-IS would collide (two different verse-1
texts both claiming canon_id/chapter 1/verse 1). This remaps LIT3327Melchiz2's rows
from chapter 1 -> chapter 2 so it lands as "chapter 2" of the combined book once
assign-canon-ids.py runs. LIT3326Melchiz1 is untouched (stays chapter 1).

Run BEFORE assign-canon-ids.py:
    python fix-melchiz-cyril-chapters.py --dry     # verify what would change
    python fix-melchiz-cyril-chapters.py           # apply
    python assign-canon-ids.py                     # then promote as usual
"""
import sqlite3, argparse

ap = argparse.ArgumentParser()
ap.add_argument('--corpus', default='corpus.db')
ap.add_argument('--dry', action='store_true')
A = ap.parse_args()

db = sqlite3.connect(A.corpus)
c = db.cursor()

before = c.execute(
    "SELECT chapter, verse, substr(text,1,40) FROM verses "
    "WHERE corpus='GEZ' AND code='LIT3327Melchiz2' ORDER BY verse"
).fetchall()
print(f'LIT3327Melchiz2 — {len(before)} row(s) before:')
for ch, v, t in before:
    print(f'  [{ch}:{v}] {t}…')

if not before:
    print('No rows found for LIT3327Melchiz2 — nothing to do (check the code spelling).')
else:
    if A.dry:
        print('\n[dry-run] would UPDATE these rows to chapter=2. Nothing written.')
    else:
        n = c.execute(
            "UPDATE verses SET chapter=2 WHERE corpus='GEZ' AND code='LIT3327Melchiz2'"
        ).rowcount
        db.commit()
        after = c.execute(
            "SELECT chapter, verse, substr(text,1,40) FROM verses "
            "WHERE corpus='GEZ' AND code='LIT3327Melchiz2' ORDER BY verse"
        ).fetchall()
        print(f'\nupdated {n} row(s). After:')
        for ch, v, t in after:
            print(f'  [{ch}:{v}] {t}…')

db.close()
