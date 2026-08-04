#!/usr/bin/env python3
"""
ingest-pseudepigrapha.py — the full pseudepigrapha/apocrypha library into corpus.db.

Source: Scrollmapper bible_databases_deuterocanonical (sources/en/<slug>/<slug>.json),
public-domain English translations (R.H. Charles APOT and others), verse-structured.

These are TRANSLATIONS (corpus 'ENG'), the baseline so every book is in the app now;
original-language digitization remains the end goal and is layered in where it exists
(1 Enoch in Ge'ez, 2 Baruch in Syriac, etc.). Books that have an original-language
counterpart are mapped to the same canon_id so the English aligns in the parallel view;
the rest are works (canon_id NULL) in the Works Library.

  python ingest-pseudepigrapha.py          # fetch + ingest all
  python ingest-pseudepigrapha.py --dry    # report only
"""
import sqlite3, argparse, urllib.request, json

RAW = "https://raw.githubusercontent.com/scrollmapper/bible_databases_deuterocanonical/master/sources/en"

# every pseudepigraphon / apocryphon in the collection
SLUGS = [
 "1-adam-and-eve","2-adam-and-eve","1-enoch","2-enoch","book-of-jubilees","book-of-jasher",
 "book-of-giants","genesis-apocryphon","ladder-of-jacob","apocalypse-of-abraham",
 "apocalypse-of-elijah","apocalypse-of-peter","apocalypse-of-sedrach","ascension-of-isaiah",
 "assumption-of-moses","lives-of-the-prophets","jannes-and-jambres","history-of-the-rechabites",
 "visions-of-amram","wisdom-of-ahikar","songs-of-the-sabbath-sacrifice","five-psalms-of-david",
 "odes-of-solomon","psalms-of-solomon","prayer-of-manasseh","gad-the-seer",
 "book-of-nathan-the-prophet","apocryphon-of-joshua","balaam-inscription","azar",
 "joseph-and-asenath","gospel-of-nicodemus","epistle-of-barnabas",
 "1-hermas","2-hermas","3-hermas",
 "testament-of-abraham","testament-of-isaac","testament-of-jacob","testament-of-job",
 "testament-of-solomon","testament-of-kohath",
 "testament-of-reuben","testament-of-simeon","testament-of-levi","testament-of-judah",
 "testament-of-issachar","testament-of-zebulun","testament-of-dan","testament-of-naphtali",
 "testament-of-gad","testament-of-asher","testament-of-joseph","testament-of-benjamin",
 # deuterocanon (English alongside the originals)
 "1-esdras","2-esdras","1-baruch","2-baruch","3-baruch","4-baruch","1-maccabees","2-maccabees",
 "book-of-sirach","wisdom-of-solomon","book-of-tobit","book-of-judith","susanna",
 "bel-and-the-dragon","greek-esther",
]
# slug -> canon_id where an original-language counterpart already exists (align in parallel)
CANON = {
 "1-enoch":67,"book-of-jubilees":68,"1-maccabees":69,"book-of-sirach":70,"wisdom-of-solomon":71,
 "book-of-tobit":72,"book-of-judith":73,"1-baruch":74,"2-maccabees":76,"susanna":79,
 "bel-and-the-dragon":80,"1-esdras":81,"psalms-of-solomon":83,"prayer-of-manasseh":84,"4-baruch":89,
}

def code_for(slug):
    return slug.upper().replace("-", "_")

def fetch_json(slug):
    url = f"{RAW}/{slug}/{slug}.json"
    try:
        with urllib.request.urlopen(url, timeout=40) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print(f"    [skip] {slug}: {e}"); return None

def to_int(x):
    try: return int(x)
    except: return 0

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", default="corpus.db")
    ap.add_argument("--dry", action="store_true")
    A = ap.parse_args()

    rows = []   # (canon_id, code, title, category, ch, v, text)
    print(f"fetching {len(SLUGS)} books from Scrollmapper…")
    for slug in SLUGS:
        d = fetch_json(slug)
        if not d: continue
        cid = CANON.get(slug)
        code = code_for(slug)
        cat = "deuterocanon-en" if slug in CANON and cid and cid < 82 else "pseudepigrapha-en"
        for bk in d.get("books", []):
            title = bk.get("name", slug)
            for ch in bk.get("chapters", []):
                cn = ch.get("chapter", 1)
                for vs in ch.get("verses", []):
                    t = (vs.get("text") or "").strip()
                    if t: rows.append((cid, code, title, cat, str(cn), str(vs.get("verse", 1)), t))

    books = len({r[1] for r in rows})
    aligned = len({r[1] for r in rows if r[0] is not None})
    print(f"reconstructed {len(rows)} verses across {books} books ({aligned} canon-aligned)")
    for label, code in [("Jasher 1:1","BOOK_OF_JASHER"),("Testament of Reuben 1:1","TESTAMENT_OF_REUBEN"),
                        ("Joseph & Asenath 1:1","JOSEPH_AND_ASENATH")]:
        m=[r for r in rows if r[1]==code and r[4]=="1" and r[5]=="1"]
        if m: print(f"  {label}: {m[0][6][:62]}")

    if A.dry: print("dry run — nothing written"); return
    db = sqlite3.connect(A.corpus); cur = db.cursor()
    cur.execute("DELETE FROM verses WHERE corpus='ENG'")
    cur.execute("DELETE FROM books  WHERE corpus='ENG'")
    counts, meta = {}, {}
    for cid, code, title, cat, ch, vv, text in rows:
        counts[code] = counts.get(code, 0) + 1; meta[code] = (cid, title, cat)
    bid = {}
    for code, n in counts.items():
        cid, title, cat = meta[code]
        cur.execute("INSERT INTO books(corpus,code,title,category,n_verses) VALUES('ENG',?,?,?,?)",
                    (code, title, cat, n)); bid[code] = cur.lastrowid
    for cid, code, title, cat, ch, vv, text in rows:
        rk = f"ENG:{code}:{ch}:{vv}"
        cur.execute("""INSERT INTO verses(ref_key,book_id,corpus,code,chapter,verse,ord_c,ord_v,
                       text,category,src,canon_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (rk, bid[code], "ENG", code, ch, vv, to_int(ch), to_int(vv), text, cat,
                     "scrollmapper-en", cid))
    db.commit(); db.close()
    print(f"ingested {len(rows)} verses into {A.corpus} (corpus 'ENG')")

if __name__ == "__main__":
    main()
