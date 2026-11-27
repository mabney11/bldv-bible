#!/usr/bin/env python3
"""
ingest_eng_heb_backfill.py -- give reader verses that have English but NO Hebrew a Hebrew row.
Reads server/eng-heb-backfill/out/<tag>_NNN.json (+ the matching batches/ sheet for canon_id/code).

Provenance (same technique as Josephus Antiquities 9-20 and the Ge'ez backfill): an ORIGINAL
Hebrew translation of the verse's English (KJV from versions.db where it has the verse), made in
parallel batches under one guide (eng-heb-backfill/GUIDE.md). Every batch sheet lists, per English
word, the Hebrew the corpus's own tagged OT uses for it (build_hints.py, from align-table.json +
tokens_bhs), and eng-heb-backfill/check_heb.py is a hard gate: every Hebrew word is an attested
word of the corpus's own (non-AI) Hebrew, whole or after <=3 proclitics; only listed names exempt.
This script re-runs that gate and refuses on any failure.

Rows: corpus HEB, src 'paleo-studio:ai-original-translation', conf 'ai-generated-corpus-terminology'.
text AND text_paleo are stored Paleo (RULE ZERO: no square script in storage). Added to the book's
existing HEB edition (same book_id/code) or, if it has none, a new HEB book.
The ENG rows are left alone: render-all writes an untouched verse's reading text from its new
Hebrew (mechanical baseline).

Run from server/ on the machine that holds corpus.db (the device bridge cannot write WAL DBs):
    python ingest_eng_heb_backfill.py esd2 --dry
    python ingest_eng_heb_backfill.py esd2
    python ingest_eng_heb_backfill.py all --dry      # every c*_ batch in out/ in one transaction (esd2 was ingested on its own)
One transaction; refuses if any target (canon, chapter, verse) already has a HEB row.
"""
import argparse, glob, json, os, sqlite3, subprocess, sys, time, unicodedata
HERE = os.path.dirname(os.path.abspath(__file__)); BF = os.path.join(HERE, "eng-heb-backfill")
SRC, CONF = "paleo-studio:ai-original-translation", "ai-generated-corpus-terminology"
SQUARE = list("אבגדהוזחטיכלמנסעפצקרשת")
PALEO = ['𐤀','𐤁','𐤂','𐤃','𐤄','𐤅','𐤆','𐤇','𐤈','𐤉','𐤊','𐤋','𐤌','𐤍','𐤎','𐤏','𐤐','𐤑','𐤒','𐤓','𐤔','𐤕']
FINALS = {'ך':'כ','ם':'מ','ן':'נ','ף':'פ','ץ':'צ'}
S2P = dict(zip(SQUARE, PALEO))
def to_paleo(t):
    out = []
    for ch in unicodedata.normalize("NFC", t):
        if 0x0591 <= ord(ch) <= 0x05C7: continue
        out.append(S2P.get(FINALS.get(ch, ch), ch))
    s = "".join(out)
    if any(0x05D0 <= ord(c) <= 0x05EA for c in s): raise ValueError("square letter left: " + s)
    return s

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("tag"); ap.add_argument("--dry", action="store_true")
    ap.add_argument("--db", default=os.path.join(HERE, "corpus.db")); A = ap.parse_args()
    outs = sorted(glob.glob(os.path.join(BF, "out", "c*.json" if A.tag == "all" else f"{A.tag}_*.json")))
    if not outs: sys.exit(f"no out/{A.tag}_*.json")
    g = subprocess.run([sys.executable, os.path.join(BF, "check_heb.py"), *outs], capture_output=True, text=True)
    print(g.stdout.strip().splitlines()[-1] if g.stdout.strip() else g.stderr)
    if g.returncode: print(g.stdout); sys.exit("attestation gate failed -- nothing changed")
    rows = []
    for fn in outs:
        b = json.load(open(os.path.join(BF, "batches", os.path.basename(fn)), encoding="utf-8"))
        o = json.load(open(fn, encoding="utf-8"))["verses"]
        for v in b["verses"]:
            h = o[v["ref"]]; h = h["heb"] if isinstance(h, dict) else h
            rows.append((b["canon_id"], b["code"], v["chapter"], v["verse"], to_paleo(h.strip())))
    print(f"{len(rows)} verses from {len(outs)} batches")
    con = sqlite3.connect(A.db, timeout=30); cur = con.cursor()
    for i in range(6):
        try: cur.execute("BEGIN IMMEDIATE"); break
        except sqlite3.OperationalError as e:
            if "locked" in str(e).lower() and i < 5: time.sleep(0.5 * 2 ** i); continue
            raise
    try:
        books = {}
        next_bid = (cur.execute("SELECT MAX(book_id) FROM books").fetchone()[0] or 0) + 1  # one new id per new book
        for cid in sorted({r[0] for r in rows}):
            have = cur.execute("SELECT book_id, code, category FROM verses WHERE corpus='HEB' AND canon_id=? LIMIT 1", (cid,)).fetchone()
            if have: books[cid] = (have[0], have[1], have[2], False)
            else:
                e = cur.execute("SELECT code, category FROM verses WHERE corpus='ENG' AND canon_id=? LIMIT 1", (cid,)).fetchone()
                bid = next_bid; next_bid += 1
                books[cid] = (bid, e[0], e[1] or "pseudepigrapha", True)
        for cid, ch, v in {(r[0], r[2], r[3]) for r in rows}:
            n = cur.execute("SELECT COUNT(*) FROM verses WHERE corpus='HEB' AND canon_id=? AND CAST(chapter AS REAL)=? AND CAST(verse AS REAL)=?",
                            (cid, float(ch), float(v))).fetchone()[0]
            if n: sys.exit(f"HEB already has canon {cid} {ch}:{v} -- nothing changed")
        for cid, (bid, code, cat, new) in books.items():
            print(f"  canon {cid}: {'NEW' if new else 'existing'} HEB book_id {bid} ({code}) +{sum(1 for r in rows if r[0]==cid)} verses")
        if A.dry: con.rollback(); print("[dry] nothing written"); return
        for cid, (bid, code, cat, new) in books.items():
            if new:
                t = cur.execute("SELECT title FROM books b JOIN verses v ON v.book_id=b.book_id WHERE v.corpus='ENG' AND v.canon_id=? LIMIT 1", (cid,)).fetchone()
                cur.execute("INSERT INTO books (book_id, corpus, code, title, category, n_verses) VALUES (?,?,?,?,?,0)",
                            (bid, "HEB", code, (t[0] if t else code) + " (Hebrew)", cat))
        for cid, _code, ch, v, p in rows:
            bid, code, cat, _ = books[cid]
            cur.execute("INSERT INTO verses (ref_key, book_id, corpus, code, chapter, verse, ord_c, ord_v, text, category, src, conf, canon_id, text_paleo) "
                        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        (f"HEB:{code}:{ch}:{v}", bid, "HEB", code, ch, v, int(ch), int(v), p, cat, SRC, CONF, cid, p))
        for cid, (bid, *_x) in books.items():
            n = cur.execute("SELECT COUNT(*) FROM verses WHERE book_id=?", (bid,)).fetchone()[0]
            cur.execute("UPDATE books SET n_verses=? WHERE book_id=?", (n, bid))
        con.commit(); print(f"COMMITTED {len(rows)} HEB rows")
    except Exception:
        con.rollback(); raise
    finally: con.close()

if __name__ == "__main__": main()
