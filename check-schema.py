#!/usr/bin/env python3
"""Run from server/ to show corpus.db and translation.db schemas."""
import sqlite3

print("=== corpus.db tables ===")
db = sqlite3.connect('corpus.db')
tables = db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
for t in tables: print(f"  {t[0]}")
print("\n=== verses columns ===")
for c in db.execute("PRAGMA table_info(verses)").fetchall():
    print(f"  {c[1]} {c[2]}")
print("\n=== code->book_id sample (GEN, MAT, JAS) ===")
for code in ['GEN','MAT','JAS','1PE','REV']:
    r = db.execute("SELECT DISTINCT book_id FROM verses WHERE code=? LIMIT 1",(code,)).fetchone()
    print(f"  {code}: book_id={r[0] if r else 'NOT FOUND'}")
db.close()

print("\n=== translation.db tables ===")
tdb = sqlite3.connect('translation.db')
for t in tdb.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall():
    print(f"  {t[0]}")
print("\n=== translations columns ===")
for c in tdb.execute("PRAGMA table_info(translations)").fetchall():
    print(f"  {c[1]} {c[2]}")
r = tdb.execute("SELECT COUNT(*),MIN(book_id),MAX(book_id) FROM translations WHERE text IS NOT NULL AND text!='none'").fetchone()
print(f"\ntranslations rows: {r[0]}, book_id range: {r[1]}-{r[2]}")
tdb.close()
