#!/usr/bin/env python3
"""
fix-melchizedek-31-48.py -- cut the stray second English rendering off Book of Melchizedek 31:48.

The source file carries, after Universe CHAPTER 6, a second rougher rendering ("THE HISTORY OF THE
UNIVERSE - Chapter VI" .. "Chapter IX", no verse numbers). ingest-book-of-melchizedek.py never split
on those headings, so ~15,800 words were stored inside verse 31:48 (canon 216). Found 2026-11-27 by the
English -> Hebrew backfill (batch c216_015). The ingest now stops at that heading; this repairs the rows
already written. Nothing of the source is lost: Chapters VI-IX are still in sources/book-of-melchizedek.txt.

corpus.db  ENG 216 31:48 -- text, text_src, text_base cut at the first such heading.
translation.db 216 31:48 -- text + original_text cut the same way, ONLY if the row is untouched
               (status 'none', no rich_text). A saved verse is listed, never written.

Run from server/ on fieldy's machine (the device bridge cannot write WAL databases):
    python fix-melchizedek-31-48.py --dry
    python fix-melchizedek-31-48.py
Idempotent: a second run finds nothing to cut.
"""
import argparse, re, sqlite3

CANON, CH, V = 216, 31, 48
HEAD = re.compile(r'\s*(?:THE\s+)?HISTORY OF THE UNIVERSE\s*-\s*Chapter\s+[IVXL]+\b')

def cut(s):
    if not s: return s, False
    m = HEAD.search(s)
    return (s[:m.start()].rstrip(), True) if m else (s, False)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--corpus', default='corpus.db'); ap.add_argument('--translation', default='translation.db')
    ap.add_argument('--dry', action='store_true'); A = ap.parse_args()

    con = sqlite3.connect(A.corpus, timeout=30)
    cols = [r[1] for r in con.execute('PRAGMA table_info(verses)')]
    fields = [f for f in ('text', 'text_src', 'text_base') if f in cols]
    rows = con.execute(f"SELECT id, {', '.join(fields)} FROM verses WHERE corpus='ENG' AND canon_id=? "
                       "AND CAST(chapter AS INT)=? AND CAST(verse AS INT)=?", (CANON, CH, V)).fetchall()
    n = 0
    for r in rows:
        upd = {}
        for f, val in zip(fields, r[1:]):
            new, hit = cut(val)
            if hit: upd[f] = new; print(f'corpus.db ENG {CH}:{V} {f}: {len(val):,} -> {len(new):,} chars | {new[-90:]!r}')
        if upd and not A.dry:
            con.execute(f"UPDATE verses SET {', '.join(k + '=?' for k in upd)} WHERE id=?", (*upd.values(), r[0]))
        n += bool(upd)
    if not A.dry: con.commit()
    con.close()

    t = sqlite3.connect(A.translation, timeout=30)
    row = t.execute('SELECT status, text, rich_text, original_text FROM translations WHERE book_id=? AND chapter=? AND verse=?',
                    (CANON, CH, V)).fetchone()
    if row:
        status, text, rich, orig = row
        nt, h1 = cut(text); no, h2 = cut(orig)
        if (h1 or h2) and (status != 'none' or (rich or '')):
            print(f'translation.db {CH}:{V} is a SAVED verse (status {status}) -- not written; fix it in the Studio')
        elif h1 or h2:
            print(f'translation.db {CH}:{V} text: {len(text or ""):,} -> {len(nt or ""):,}; original_text: {len(orig or ""):,} -> {len(no or ""):,}')
            if not A.dry:
                t.execute('UPDATE translations SET text=?, original_text=? WHERE book_id=? AND chapter=? AND verse=?',
                          (nt, no, CANON, CH, V)); t.commit(); n += 1
    t.close()
    print(('[dry] ' if A.dry else '') + (f'{n} row(s) repaired' if n else 'nothing to cut'))

if __name__ == '__main__': main()
