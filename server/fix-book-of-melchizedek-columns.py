#!/usr/bin/env python3
"""
fix-book-of-melchizedek-columns.py — one-off backfill for BOOK_OF_MELCHIZEDEK rows
that ingest-book-of-melchizedek.py inserted with an incomplete column set.

Root cause (found 2026-08-01 debugging "has not been translated" in the live reader,
despite sample-corpus.js reading the text back fine): the original INSERT only set
(corpus, code, chapter, verse, text, src), leaving book_id/ord_c/ord_v/ref_key/category
NULL. sample-corpus.js apparently doesn't filter on these, so it looked fine — but
/api/translate/chapter's ENG fallback query (server.js) is:
    SELECT DISTINCT ord_v AS verse FROM verses
    WHERE corpus='ENG' AND canon_id=? AND ord_c=? ORDER BY ord_v
ord_c/ord_v are SEPARATE numeric columns from chapter/verse (which can be non-numeric
in other sources) — every other ingest script (ingest-nt-apocrypha-2.py,
ingest-pseudepigrapha.py) sets them at insert time. This script backfills them plus
book_id (a proper `books` table row, matching the Scheme B per-corpus surrogate key
CLAUDE.md documents — used by /api/source/:src/* routes even though this specific bug
was in the canon_id/ord_c path) and ref_key/category to match the established pattern,
rather than re-running the whole ingest+sanitize+glossify+de-archaic pipeline again
for a metadata-only gap.

Run once from server/:
    python fix-book-of-melchizedek-columns.py --dry
    python fix-book-of-melchizedek-columns.py
"""
import sqlite3, argparse

CODE = 'BOOK_OF_MELCHIZEDEK'
TITLE = 'Book of Melchizedek'
CATEGORY = 'pseudepigrapha-en'   # matches Jasher/Adam & Eve's convention (ingest-pseudepigrapha.py)

ap = argparse.ArgumentParser()
ap.add_argument('--corpus', default='corpus.db')
ap.add_argument('--dry', action='store_true')
A = ap.parse_args()

db = sqlite3.connect(A.corpus)
c = db.cursor()

n_verses = c.execute("SELECT COUNT(*) FROM verses WHERE corpus='ENG' AND code=?", (CODE,)).fetchone()[0]
n_missing_ord = c.execute(
    "SELECT COUNT(*) FROM verses WHERE corpus='ENG' AND code=? AND (ord_c IS NULL OR ord_v IS NULL)",
    (CODE,)
).fetchone()[0]
existing_book = c.execute("SELECT book_id FROM books WHERE corpus='ENG' AND code=?", (CODE,)).fetchone()

print(f'{n_verses} verse rows found for {CODE}, {n_missing_ord} missing ord_c/ord_v.')
print(f'existing books table row: {existing_book}')

if A.dry:
    sample = c.execute(
        "SELECT id, chapter, verse, ord_c, ord_v, book_id, ref_key, category FROM verses "
        "WHERE corpus='ENG' AND code=? ORDER BY id LIMIT 3", (CODE,)
    ).fetchall()
    print('sample rows (id, chapter, verse, ord_c, ord_v, book_id, ref_key, category):')
    for row in sample:
        print(f'  {row}')
    print('\n[dry-run] nothing written.')
else:
    if existing_book:
        bid = existing_book[0]
        print(f'reusing existing books row, book_id={bid}')
    else:
        c.execute("INSERT INTO books(corpus,code,title,category,n_verses) VALUES('ENG',?,?,?,?)",
                   (CODE, TITLE, CATEGORY, n_verses))
        bid = c.lastrowid
        print(f'inserted new books row, book_id={bid}')

    n = c.execute("""
        UPDATE verses
        SET book_id = ?,
            ord_c = CAST(chapter AS INTEGER),
            ord_v = CAST(verse AS INTEGER),
            ref_key = 'ENG:' || ? || ':' || chapter || ':' || verse,
            category = COALESCE(category, ?)
        WHERE corpus='ENG' AND code=?
    """, (bid, CODE, CATEGORY, CODE)).rowcount
    db.commit()
    print(f'updated {n} verse rows.')

    # re-verify
    still_missing = c.execute(
        "SELECT COUNT(*) FROM verses WHERE corpus='ENG' AND code=? AND (ord_c IS NULL OR ord_v IS NULL)",
        (CODE,)
    ).fetchone()[0]
    sample = c.execute(
        "SELECT chapter, verse, ord_c, ord_v, book_id FROM verses WHERE corpus='ENG' AND code=? "
        "AND chapter='1' ORDER BY ord_v LIMIT 3", (CODE,)
    ).fetchall()
    print(f'still missing ord_c/ord_v after update: {still_missing} (should be 0)')
    print('sample chapter-1 rows after fix (chapter, verse, ord_c, ord_v, book_id):')
    for row in sample:
        print(f'  {row}')

db.close()
