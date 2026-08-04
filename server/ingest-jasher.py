#!/usr/bin/env python3
"""
ingest-jasher.py — Sefer haYashar (the Hebrew "Book of Jasher" midrash) into corpus.db.

Source: Sefaria public export (Google Cloud bucket), Hebrew. This is the medieval
Hebrew midrash Sefer haYashar — Jasher's actual original language; there is no ancient
Greek/Syriac Jasher (the lost biblical Book of Jashar does not survive). Ingested as a
Hebrew work (corpus 'HEB', canon_id NULL) so it renders RTL and transliterates with the
rest of your Hebrew material. The English Jasher already loaded (corpus 'ENG') is a
separate witness; the two don't share versification, so they stay separate works.

Run on YOUR machine (the GCS bucket is reachable there):
  python ingest-jasher.py
  python ingest-jasher.py --dry
"""
import sqlite3, argparse, urllib.request, urllib.parse, json, re, html

HE = ("https://storage.googleapis.com/sefaria-export/json/Midrash/Aggadah/"
      "Sefer HaYashar (midrash)/Hebrew/merged.json")

TAG = re.compile(r"<[^>]+>")
FOOT = re.compile(r"\*[^*]*\*")          # Sefaria inline footnote markers
def clean(s):
    s = html.unescape(TAG.sub("", str(s)))
    s = FOOT.sub("", s)
    return re.sub(r"\s+", " ", s).strip()

def flatten(node, title, out):
    """Walk arbitrary Sefaria nesting; each leaf array of strings = one chapter."""
    if isinstance(node, str):
        out.append((title, [node])); return
    if isinstance(node, list):
        if all(isinstance(x, str) for x in node):
            out.append((title, list(node))); return
        for i, x in enumerate(node, 1):
            flatten(x, f"{title} {i}".strip(), out)
        return
    if isinstance(node, dict):
        for k, v in node.items():
            flatten(v, f"{title} {k}".strip(), out)

def fetch_json(url):
    url = urllib.parse.quote(url, safe=":/?&=%")   # encode spaces in the path
    req = urllib.request.Request(url, headers={"User-Agent": "paleo-studio"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode("utf-8"))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", default="corpus.db")
    ap.add_argument("--dry", action="store_true")
    A = ap.parse_args()

    print("fetching Sefer haYashar (Hebrew) from Sefaria…")
    doc = fetch_json(HE)
    text = doc.get("text", doc) if isinstance(doc, dict) else doc
    sections = []
    flatten(text, "", sections)

    rows = []          # (chapter_int, chapter_title, verse_int, text)
    cn = 0
    for title, verses in sections:
        vv = [clean(v) for v in verses]
        if not any(vv): continue
        cn += 1
        for vi, t in enumerate(vv, 1):
            if t: rows.append((cn, title or f"Section {cn}", vi, t))
    print(f"reconstructed {len(rows)} verses across {cn} sections")
    if rows:
        print("  first:", rows[0][3][:70])

    if A.dry:
        for c, ttl, v, t in rows[:3]: print(f"   [{c}:{v}] {ttl} :: {t[:50]}")
        print("dry run — nothing written"); return

    db = sqlite3.connect(A.corpus); cur = db.cursor()
    cur.execute("DELETE FROM verses WHERE corpus='HEB' AND code='YASHAR'")
    cur.execute("DELETE FROM books  WHERE corpus='HEB' AND code='YASHAR'")
    cur.execute("INSERT INTO books(corpus,code,title,category,n_verses) VALUES('HEB','YASHAR',?,?,?)",
                ("ספר הישר (Sefer haYashar)", "midrash", len(rows)))
    bid = cur.lastrowid
    for c, ttl, v, t in rows:
        rk = f"HEB:YASHAR:{c}:{v}"
        cur.execute("""INSERT INTO verses(ref_key,book_id,corpus,code,chapter,verse,ord_c,ord_v,
                       text,category,src,canon_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (rk, bid, "HEB", "YASHAR", str(c), str(v), c, v, t, "midrash", "sefaria-he", None))
    db.commit(); db.close()
    print(f"ingested {len(rows)} Hebrew Sefer haYashar verses into {A.corpus} (corpus 'HEB', code 'YASHAR')")

if __name__ == "__main__":
    main()
