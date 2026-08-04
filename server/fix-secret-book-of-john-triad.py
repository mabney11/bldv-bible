#!/usr/bin/env python3
"""
fix-secret-book-of-john-triad.py — one-off patch for the already-ingested Secret
Book of John row whose "Thrice Male / Thrice Powerful / Thrice Named" 3-line
epithet triad got flattened by collapse_para() into an unpunctuated run
("Thrice Male Thrice Powerful Thrice Named" — flagged live 2026-08-02, "doesnt
read right"). ingest-secret-book-of-john.py's clean() now has a TRIAD_RX fix so a
future full re-ingest reproduces this correctly; this script patches the row that's
already sitting in corpus.db without re-running the whole sanitize/glossify/
de-archaic/canon-id pipeline for one string.

  python fix-secret-book-of-john-triad.py --dry
  python fix-secret-book-of-john-triad.py
  # restart the server
"""
import sqlite3, argparse

OLD = 'Thrice Male Thrice Powerful Thrice Named'
NEW = 'Thrice-Male, Thrice-Powerful, Thrice-Named'

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--corpus', default='corpus.db')
    ap.add_argument('--dry', action='store_true')
    A = ap.parse_args()

    db = sqlite3.connect(A.corpus)
    c = db.cursor()
    rows = c.execute(
        "SELECT id, chapter, verse, text FROM verses "
        "WHERE corpus='ENG' AND code='SECRET_BOOK_OF_JOHN' AND text LIKE ?",
        (f'%{OLD}%',)
    ).fetchall()

    if not rows:
        print('no matching rows found -- nothing to do (already fixed, or the '
              'stored text differs from what was expected; check by hand before '
              'assuming this is a no-op)')
        return

    for rid, ch, v, t in rows:
        new_t = t.replace(OLD, NEW)
        print(f'[{ch}:{v}] id={rid}')
        print(f'  - {t}')
        print(f'  + {new_t}')
        if not A.dry:
            c.execute("UPDATE verses SET text=? WHERE id=?", (new_t, rid))

    if A.dry:
        print(f'\ndry run -- {len(rows)} row(s) would be updated. Nothing written.')
    else:
        db.commit()
        print(f'\nupdated {len(rows)} row(s). Restart the server to serve the fixed text.')
    db.close()

if __name__ == '__main__':
    main()
