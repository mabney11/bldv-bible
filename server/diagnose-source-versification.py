#!/usr/bin/env python3
"""
diagnose-source-versification.py

Finds places where a source corpus in corpus.db stores a whole chapter's text
under a single "verse" (or a handful) — the pattern that makes /parallel line a
chapter's worth of paleo up against one short English verse (e.g. Jasher in the
Hebrew-extra 'HEB' corpus).

It is self-contained: it only reads corpus.db and never writes. For every
(corpus, book_id|doc_id, chapter) it looks at how the chapter's words are spread
across its verses and flags a chapter as a likely BLOB when almost all the words
sit in one verse, or when a single verse is very large in absolute terms.

Run on your machine, from the server/ directory:

    python diagnose-source-versification.py                 # scans corpus.db
    python diagnose-source-versification.py --corpus HEB     # one corpus only
    python diagnose-source-versification.py --db ../corpus.db --min-words 60

Nothing is modified. Use the report to decide which books/chapters to re-ingest
with proper verse boundaries (matching your English versification).
"""
import argparse, os, sqlite3, sys
from collections import defaultdict


def word_count(s):
    return len((s or "").split())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="corpus.db", help="path to corpus.db (default: ./corpus.db)")
    ap.add_argument("--corpus", default=None, help="limit to one corpus id (e.g. HEB, GEZ, LXX)")
    ap.add_argument("--min-words", type=int, default=60,
                    help="a single verse with more than this many words is 'large' (default 60)")
    ap.add_argument("--concentration", type=float, default=0.80,
                    help="flag a chapter when one verse holds >= this fraction of the "
                         "chapter's words AND the chapter has >1 English-scale verse worth "
                         "of text (default 0.80)")
    ap.add_argument("--limit", type=int, default=0, help="max rows to print (0 = all)")
    args = ap.parse_args()

    if not os.path.exists(args.db):
        sys.exit(f"corpus.db not found at {args.db} — pass --db with the right path")

    con = sqlite3.connect(args.db)
    con.row_factory = sqlite3.Row

    cols = {r["name"] for r in con.execute("PRAGMA table_info(verses)")}
    if not {"corpus", "chapter", "verse", "text"} <= cols:
        sys.exit(f"unexpected verses schema; found columns: {sorted(cols)}")
    key_col = "book_id" if "book_id" in cols else ("doc_id" if "doc_id" in cols else None)
    if key_col is None:
        sys.exit("verses has neither book_id nor doc_id")
    has_doc = "doc_id" in cols

    where = ""
    params = []
    if args.corpus:
        where = "WHERE corpus = ?"
        params.append(args.corpus)

    sel = f"corpus, {key_col} AS k, " + ("doc_id, " if has_doc and key_col != "doc_id" else "") + "chapter, verse, text"
    rows = con.execute(f"SELECT {sel} FROM verses {where}", params).fetchall()

    # chapter -> list of (verse, words)
    chapters = defaultdict(list)
    for r in rows:
        chapters[(r["corpus"], r["k"], r["chapter"])].append((r["verse"], word_count(r["text"])))

    flagged = []
    for (corpus, k, chapter), vs in chapters.items():
        total = sum(w for _, w in vs)
        if total == 0:
            continue
        nverses = len(vs)
        biggest_v, biggest_w = max(vs, key=lambda x: x[1])
        frac = biggest_w / total if total else 0
        # A blob is a chapter whose text is essentially one giant verse: either a
        # single verse holds nearly everything AND that verse is large, or the
        # chapter has just 1–2 verses but a lot of words.
        is_blob = (biggest_w >= args.min_words and
                   (frac >= args.concentration or nverses <= 2))
        if is_blob:
            flagged.append({
                "corpus": corpus, "key": k, "chapter": chapter,
                "nverses": nverses, "total": total,
                "biggest_verse": biggest_v, "biggest_words": biggest_w,
                "frac": frac,
            })

    flagged.sort(key=lambda d: (-d["biggest_words"], d["corpus"], str(d["key"]), d["chapter"]))

    print(f"Scanned {len(chapters)} chapters in {args.db}"
          + (f" (corpus={args.corpus})" if args.corpus else ""))
    print(f"Flagged {len(flagged)} likely single-verse BLOB chapters "
          f"(verse ≥ {args.min_words} words holding ≥ {int(args.concentration*100)}% of the chapter, "
          f"or ≤ 2 verses):\n")
    if not flagged:
        print("  none — every scanned chapter is split across verses. ✓")
        return

    print(f"  {'corpus':7} {'book/doc':>10} {'ch':>4} {'#v':>4} {'words':>7} "
          f"{'bigV':>5} {'bigW':>6} {'conc':>5}")
    print("  " + "-" * 58)
    shown = flagged if not args.limit else flagged[: args.limit]
    for d in shown:
        print(f"  {str(d['corpus']):7} {str(d['key']):>10} {d['chapter']:>4} "
              f"{d['nverses']:>4} {d['total']:>7} {d['biggest_verse']:>5} "
              f"{d['biggest_words']:>6} {d['frac']*100:>4.0f}%")
    if args.limit and len(flagged) > args.limit:
        print(f"  … and {len(flagged) - args.limit} more (raise --limit to see all)")

    # Per-corpus summary — which sources need the most attention.
    per = defaultdict(int)
    for d in flagged:
        per[d["corpus"]] += 1
    print("\nBy corpus:")
    for c, n in sorted(per.items(), key=lambda x: -x[1]):
        print(f"  {c:7} {n} blob chapters")


if __name__ == "__main__":
    main()
