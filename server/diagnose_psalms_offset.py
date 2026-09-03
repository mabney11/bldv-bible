#!/usr/bin/env python3
"""
diagnose_psalms_offset.py -- explains (does NOT change anything) why
sync-heb-tokens.mjs --apply refuses: 62 verses in tokens_nt (book_id=19,
Hebrew Psalms) aren't in the freshly-built surface-index.db.

FINDING: not a bug. heb-align.js already has an intentional, documented fix
(dated 2026-08-13, search that file for "NORMALIZE to BHS verse numbering")
that renumbers Psalm superscription chapters from HEB's native 1-indexed
title-as-verse-1 convention to BHS/English's 0-indexed title-as-verse-0
convention. tokens_nt was last built BEFORE that fix and still uses the old
1-indexed numbering for the 62 chapters that have a superscription. Confirmed
across 5 sampled chapters: native source range == old tokens_nt range == 1..N
in every case, and new index range == 0..(N-1) in every case -- a uniform
whole-chapter shift, not a dropped verse. Content is fully present under the
new (correct) verse numbers; only the trailing "verse N" label is stale.

Run with --db to point at a different corpus.db. Read-only.
"""
import argparse
import sqlite3

ap = argparse.ArgumentParser()
ap.add_argument("--db", default="corpus.db")
ap.add_argument("--index", default="surface-index.db")
A = ap.parse_args()

cdb = sqlite3.connect(f"file:{A.db}?immutable=1", uri=True)
sdb = sqlite3.connect(f"file:{A.index}?immutable=1", uri=True)

old = set(cdb.execute("SELECT chapter, verse FROM tokens_nt WHERE book_id=19").fetchall())
new = set(sdb.execute(
    "SELECT chapter, verse FROM surface_occurrences WHERE source='HEB' AND book_id=19"
).fetchall())

only_old = sorted(old - new, key=lambda cv: (int(cv[0]), int(cv[1])))
print(f"{len(only_old)} (chapter,verse) pairs are in tokens_nt but not the new index (book_id=19 only)")

bad = 0
for ch, vs in only_old:
    native = sorted(int(v) for v, in cdb.execute(
        "SELECT verse FROM verses WHERE corpus='HEB' AND code='PSA' AND chapter=?", (ch,)).fetchall())
    idx_verses = sorted(int(v) for v, in sdb.execute(
        "SELECT DISTINCT verse FROM surface_occurrences WHERE source='HEB' AND book_id=19 AND chapter=?", (ch,)).fetchall())
    is_trailing_of_shifted_chapter = (
        int(vs) == native[-1] and idx_verses and idx_verses[0] == 0
        and idx_verses[-1] == native[-1] - 1
    )
    if not is_trailing_of_shifted_chapter:
        bad += 1
        print(f"  ch{ch} v{vs}: DOES NOT MATCH the shift pattern -- native={native[0]}..{native[-1]} "
              f"index={idx_verses[0] if idx_verses else '?'}..{idx_verses[-1] if idx_verses else '?'} -- INVESTIGATE")

print()
if bad == 0:
    print("Every single one of the 62 fits the shift pattern exactly: old tokens_nt's verse N "
          "is that chapter's last native verse, and the new index for that chapter runs 0..N-1. "
          "Nothing is missing -- it's a stale numbering label from before the Aug 13 renumbering fix.")
else:
    print(f"{bad} rows do NOT fit the shift pattern -- do not treat those as safe to drop "
          "without a closer look.")
