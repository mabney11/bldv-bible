#!/usr/bin/env python3
"""
cleanup_psalms_stale_tokens.py -- unblocks sync-heb-tokens.mjs --apply.

WHAT THIS DOES: deletes tokens_nt rows for book_id=19 (Hebrew Psalms) whose
(chapter, verse) is not present in the freshly-built surface-index.db. See
diagnose_psalms_offset.py (run that first) for the full explanation: this is
NOT data loss. heb-align.js's 2026-08-13 fix renumbers Psalm-superscription
chapters from HEB's native 1-indexed (title=verse 1) convention to BHS/
English's 0-indexed (title=verse 0) convention. tokens_nt was last built
before that fix, so ~62 chapters still carry one stale trailing verse number
(the chapter's OLD final verse N, which the new 0-indexed scheme doesn't
use -- the content itself is fully present at verses 0..N-1). Confirmed by
diagnose_psalms_offset.py: all 62 rows fit this exact shift pattern, none
are a genuine content gap.

sync-heb-tokens.mjs --apply refuses to run while ANY tokens_nt verse is
absent from the index (a blanket, whole-corpus safety check) -- it can't
tell "stale renumbered label" from "real data loss" on its own. Since these
62 rows are the former, deleting them clears the check; --apply will then
rebuild tokens_nt as a full projection of the current (correct) index for
every book, Psalms included, at the new verse numbers.

SAFETY: backs up the exact rows it deletes to a timestamped JSON file next
to corpus.db BEFORE deleting anything. Dry-run by default -- pass --apply to
actually delete. Touches ONLY book_id=19; every other book (including this
project's new HEB books) is untouched. WAL-safe (BEGIN IMMEDIATE + retry).

Usage (from paleo-studio/server):
    python3 cleanup_psalms_stale_tokens.py            # dry run, shows what would be deleted
    python3 cleanup_psalms_stale_tokens.py --apply     # backs up + deletes for real

Then re-run:
    node sync-heb-tokens.mjs --check --out sync-check.txt   # should show 0 "only in tokens_nt"
    node sync-heb-tokens.mjs --apply --out sync-apply.txt   # should now succeed
"""
import argparse
import json
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone

DB_PATH = "corpus.db"
INDEX_PATH = "surface-index.db"
BOOK_ID = 19  # canon_id for Psalms -- surface_occurrences/tokens_nt both key HEB rows by canon_id


def connect_with_retry(path, attempts=6, base_delay=0.5):
    last_err = None
    for i in range(attempts):
        try:
            con = sqlite3.connect(path, timeout=30)
            con.execute("PRAGMA busy_timeout=30000")
            return con
        except sqlite3.OperationalError as e:
            last_err = e
            time.sleep(base_delay * (2 ** i))
    raise last_err


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DB_PATH)
    ap.add_argument("--index", default=INDEX_PATH)
    ap.add_argument("--apply", action="store_true")
    A = ap.parse_args()

    if not os.path.exists(A.db):
        sys.exit(f"corpus.db not found at {A.db!r} -- run this from server/, or pass --db")
    if not os.path.exists(A.index):
        sys.exit(f"surface-index.db not found at {A.index!r} -- run build-surface-index.js --heb first")

    idb = sqlite3.connect(f"file:{A.index}?immutable=1", uri=True)
    new_verses = set(idb.execute(
        "SELECT chapter, verse FROM surface_occurrences WHERE source='HEB' AND book_id=?",
        (BOOK_ID,)).fetchall())
    idb.close()

    con = connect_with_retry(A.db)
    cur = con.cursor()

    old_rows = cur.execute(
        "SELECT rowid, book_id, chapter, verse, token_ordinal, word_raw, pos, morph, strongs, source_id "
        "FROM tokens_nt WHERE book_id=?", (BOOK_ID,)).fetchall()
    cols = ["rowid", "book_id", "chapter", "verse", "token_ordinal", "word_raw", "pos", "morph", "strongs", "source_id"]

    stale = [r for r in old_rows if (r[2], r[3]) not in new_verses]
    stale_verses = sorted({(r[2], r[3]) for r in stale}, key=lambda cv: (int(cv[0]), int(cv[1])))

    print(f"tokens_nt has {len(old_rows)} rows for book_id={BOOK_ID} (Psalms)")
    print(f"{len(stale)} of them ({len(stale_verses)} distinct verses) are stale -- not in the current index:")
    for ch, vs in stale_verses:
        print(f"  {ch}:{vs}")

    if not A.apply:
        print()
        print("[dry run] nothing changed. Re-run with --apply to back up and delete these rows.")
        con.close()
        return

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_path = f"tokens_nt_psalms_stale_backup_{ts}.json"
    with open(backup_path, "w", encoding="utf-8") as f:
        json.dump([dict(zip(cols, r)) for r in stale], f, ensure_ascii=False, indent=2)
    print(f"\nbacked up {len(stale)} rows to {backup_path}")

    for attempt in range(6):
        try:
            cur.execute("BEGIN IMMEDIATE")
            break
        except sqlite3.OperationalError as e:
            if "locked" in str(e).lower() and attempt < 5:
                time.sleep(0.5 * (2 ** attempt))
                continue
            raise
    else:
        sys.exit("could not acquire a write lock after retries -- aborting, nothing changed")

    try:
        rowids = [r[0] for r in stale]
        cur.executemany("DELETE FROM tokens_nt WHERE rowid=?", [(rid,) for rid in rowids])
        deleted = cur.rowcount if cur.rowcount >= 0 else len(rowids)
        remaining = cur.execute(
            "SELECT COUNT(*) FROM tokens_nt WHERE book_id=?", (BOOK_ID,)).fetchone()[0]
        expected_remaining = len(old_rows) - len(stale)
        if remaining != expected_remaining:
            raise RuntimeError(f"post-delete count mismatch: expected {expected_remaining}, got {remaining} -- rolling back")
        con.commit()
        print(f"COMMITTED: deleted {len(stale)} stale rows, {remaining} rows remain for book_id={BOOK_ID}")
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()

    print()
    print("Next: node sync-heb-tokens.mjs --check --out sync-check.txt   (should show 0 only-in-tokens_nt)")
    print("      node sync-heb-tokens.mjs --apply --out sync-apply.txt   (should now succeed)")


if __name__ == "__main__":
    main()
