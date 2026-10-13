#!/usr/bin/env python3
"""
ingest_geez_heb_backfill.py -- add HEB (Hebrew) and ENG (English) editions to the books that
exist ONLY in Ge'ez: 1 Meqabyan (143), 2 Meqabyan (87), 3 Meqabyan (88), and the four small
Melchizedek works (212-215). Reads server/geez-heb-backfill/geez_heb_import.json.

Provenance (same technique as Josephus Antiquities books 9-20): an ORIGINAL translation from
the Ge'ez (betmas text already in corpus.db), made in 48 parallel batches under one shared guide
(geez-heb-backfill/GUIDE.md). What is new here, per fieldy 2026-10-12 ("for every word there
will be an instance that exists that also has hebrew text in my corpus"):
  * build_table.py learned Ge'ez -> Hebrew word correspondences from the corpus's own parallels
    (31,274 verses present in both GEZ and HEB); every batch sheet lists, for each Ge'ez word,
    the Hebrew words that stand for it elsewhere in the corpus, and the translation uses them.
  * check_heb.py is a hard gate: EVERY Hebrew word is an attested word of the corpus's own
    (non-AI) Hebrew, whole or after peeling <=3 proclitics (ו ה ב ל כ מ ש). Only listed proper
    names (Meqabis, Tsirutsaydan, ...) are exempt. All 1,393 verses pass with 0 unattested.
  * The English is translated with the Hebrew, clause for clause, so render-corpus /
    merge-modforms can pair each English word with its Hebrew word (the reading text).
Ge'ez rows that share one verse number (a split verse) get ONE merged HEB/ENG row.

HEB: src='paleo-studio:ai-original-translation', conf='ai-generated-corpus-terminology'
     (the same provenance tag as Josephus books 9-20 and Azariah), text = square Hebrew,
     text_paleo filled inline.
ENG: src='paleo-studio:ai-original-translation', conf='ai-from-heb-backfill', plain English
     (render-all renders it like every other Apocrypha book; text_src = the same English).

Run from server/ on the machine that holds corpus.db (the device bridge cannot write WAL DBs):
    python ingest_geez_heb_backfill.py --dry
    python ingest_geez_heb_backfill.py
One WAL-safe transaction; refuses if any (corpus, code) or (corpus, canon_id) row already
exists; verifies counts before COMMIT.
"""
import argparse, json, os, sqlite3, sys, time, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
IMPORT = os.path.join(HERE, "geez-heb-backfill", "geez_heb_import.json")
SRC = "paleo-studio:ai-original-translation"
CONF = {"HEB": "ai-generated-corpus-terminology", "ENG": "ai-from-heb-backfill"}
TITLES = {143: "1 Meqabyan", 87: "2 Meqabyan", 88: "3 Meqabyan",
          212: "Treatise on Melchizedek", 213: "Salam to Melchizedek",
          214: "Homilies of Cyril on Melchizedek", 215: "Story of Melchizedek"}

SQUARE = list("אבגדהוזחטיכלמנסעפצקרשת")
PALEO = ['𐤀','𐤁','𐤂','𐤃','𐤄','𐤅','𐤆','𐤇','𐤈','𐤉','𐤊','𐤋','𐤌','𐤍','𐤎','𐤏','𐤐','𐤑','𐤒','𐤓','𐤔','𐤕']
FINALS = {'ך':'כ','ם':'מ','ן':'נ','ף':'פ','ץ':'צ'}
S2P = dict(zip(SQUARE, PALEO))
def sq_to_paleo(t):
    out = []
    for ch in unicodedata.normalize("NFC", t):
        if 0x0591 <= ord(ch) <= 0x05C7: continue
        out.append(S2P.get(FINALS.get(ch, ch), ch))
    return "".join(out)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.path.join(HERE, "corpus.db"))
    ap.add_argument("--dry", action="store_true")
    A = ap.parse_args()
    rows = json.load(open(IMPORT, encoding="utf-8"))["rows"]
    for r in rows:
        if not r["heb"].strip() or not r["eng"].strip():
            sys.exit(f"empty cell in import: {r['code']} {r['chapter']}:{r['verse']}")
    by = {}
    for r in rows: by.setdefault((r["canon_id"], r["code"]), []).append(r)
    print(f"{len(rows)} verses across {len(by)} books")

    con = sqlite3.connect(A.db, timeout=30); cur = con.cursor()
    for i in range(6):
        try: cur.execute("BEGIN IMMEDIATE"); break
        except sqlite3.OperationalError as e:
            if "locked" in str(e).lower() and i < 5: time.sleep(0.5 * 2 ** i); continue
            raise
    try:
        for (cid, code) in by:
            for corp in ("HEB", "ENG"):
                n = cur.execute("SELECT COUNT(*) FROM verses WHERE corpus=? AND canon_id=?", (corp, cid)).fetchone()[0]
                b = cur.execute("SELECT COUNT(*) FROM books WHERE corpus=? AND code=?", (corp, code)).fetchone()[0]
                if n or b: sys.exit(f"{corp} already present for canon {cid}/{code} ({n} verses, {b} books) -- nothing changed")
        next_id = (cur.execute("SELECT MAX(book_id) FROM books").fetchone()[0] or 0) + 1
        plan = []
        for (cid, code), vs in by.items():
            cat = cur.execute("SELECT b.category FROM books b JOIN verses v ON v.book_id=b.book_id "
                              "WHERE v.corpus='GEZ' AND v.canon_id=? LIMIT 1", (cid,)).fetchone()
            cat = cat[0] if cat else "pseudepigrapha"
            for corp in ("HEB", "ENG"):
                plan.append((corp, cid, code, cat, next_id, vs)); next_id += 1
        for corp, cid, code, cat, bid, vs in plan:
            print(f"  {corp} {code:18s} canon {cid:3d} book_id {bid}  {len(vs)} verses  ({cat})")
        if A.dry:
            con.rollback(); print("[dry] nothing written"); return
        for corp, cid, code, cat, bid, vs in plan:
            title = TITLES.get(cid, code) + (" (Hebrew)" if corp == "HEB" else "")
            cur.execute("INSERT INTO books (book_id, corpus, code, title, category, n_verses) VALUES (?,?,?,?,?,?)",
                        (bid, corp, code, title, cat, len(vs)))
            for r in vs:
                txt = r["heb"] if corp == "HEB" else r["eng"]
                cur.execute("INSERT INTO verses (ref_key, book_id, corpus, code, chapter, verse, ord_c, ord_v, text, "
                            "category, src, conf, canon_id, text_paleo, text_src) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                            (f"{corp}:{code}:{r['chapter']}:{r['verse']}", bid, corp, code, r["chapter"], r["verse"],
                             int(r["chapter"]), int(r["verse"]), txt, cat, SRC, CONF[corp], cid,
                             sq_to_paleo(txt) if corp == "HEB" else None,
                             txt if corp == "ENG" else None))
        for corp, cid, code, cat, bid, vs in plan:
            n = cur.execute("SELECT COUNT(*) FROM verses WHERE book_id=?", (bid,)).fetchone()[0]
            if n != len(vs): raise RuntimeError(f"{corp} {code}: {n} rows != {len(vs)} -- rolling back")
        con.commit()
        print(f"COMMITTED {sum(len(p[5]) for p in plan)} verse rows in {len(plan)} books")
        for code in ("1MEQ", "2MEQ", "3MEQ"):
            for corp in ("HEB", "ENG"):
                t = cur.execute("SELECT text FROM verses WHERE corpus=? AND code=? AND chapter='1' AND verse='1'", (corp, code)).fetchone()
                print(f"  {corp} {code} 1:1  {t[0][:110] if t else '(missing)'}")
    except Exception:
        con.rollback(); raise
    finally:
        con.close()

if __name__ == "__main__":
    main()
