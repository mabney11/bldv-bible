#!/usr/bin/env python3
"""
diag-melchiz-geez.py — dump the actual GEZ verse text for the 5 Melchizedek-related
Beta Masaheft works (found via works.geez.json / ingest_betmas.py), so we can see
what's really there before deciding how/whether to promote them into the reader.

Run from server/:
    python diag-melchiz-geez.py
"""
import sqlite3

CODES = ['LIT3332Melchiz', 'LIT7232Melchiz', 'LIT3326Melchiz1', 'LIT3327Melchiz2', 'LIT2365Storyo']

db = sqlite3.connect('corpus.db')
c = db.cursor()

# Confirm the corpus.db verses table's actual column names first, in case the schema
# differs from the OT/NT verses table CLAUDE.md documents.
cols = [r[1] for r in c.execute("PRAGMA table_info(verses)")]
print(f'verses table columns: {cols}\n')

for code in CODES:
    rows = c.execute(
        "SELECT chapter, verse, text FROM verses WHERE corpus='GEZ' AND code=? "
        "ORDER BY chapter, verse", (code,)
    ).fetchall()
    print(f'=== {code} — {len(rows)} row(s) ===')
    if not rows:
        print('  (no rows found — check the code spelling against works.geez.json)')
    for ch, v, t in rows:
        print(f'  [{ch}:{v}] {t}')
    print()
