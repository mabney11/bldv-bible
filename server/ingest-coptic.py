#!/usr/bin/env python3
"""
ingest-coptic.py — Sahidic Coptic Scriptures into corpus.db (corpus 'COP'), original text.

Source: Coptic SCRIPTORIUM (NT = Sahidica / J. Warren Wells; OT = CoptOT), Unicode
Coptic, fetched as the small TreeTagger SGML bundles. Books map to your canon_id
(NT 40-66, OT 1-39 + deuterocanon 70-84) so Coptic aligns verse-for-verse with the
other languages. Note: the Sahidica NT is licensed for academic use only.

  python ingest-coptic.py          # fetch + ingest NT + OT
  python ingest-coptic.py --dry    # reconstruct + report only
"""
import sqlite3, argparse, urllib.request, io, zipfile, re

RAW = "https://raw.githubusercontent.com/CopticScriptorium/corpora/master"
NT_ZIP = f"{RAW}/sahidica.nt/sahidica.nt_TT.zip"
OT_ZIP = f"{RAW}/sahidic.ot/sahidic.ot_TT.zip"

NT_NAME = {"Matthew":40,"Mark":41,"Luke":42,"John":43,"Acts_of_the_Apostles":44,"Romans":45,
 "1_Corinthians":46,"2_Corinthians":47,"Galatians":48,"Ephesians":49,"Philippians":50,
 "Colossians":51,"1_Thessalonians":52,"2_Thessalonians":53,"1_Timothy":54,"2_Timothy":55,
 "Titus":56,"Philemon":57,"Hebrews":58,"James":59,"1_Peter":60,"2_Peter":61,"1_John":62,
 "2_John":63,"3_John":64,"Jude":65,"Revelation":66}
OT_NAME = {"Genesis":1,"Exodus":2,"Leviticus":3,"Numbers":4,"Deuteronomy":5,"Joshua":6,
 "Judges":7,"Ruth":8,"I_Samuel":9,"II_Samuel":10,"I_Kings":11,"II_Kings":12,"I_Chronicles":13,
 "II_Chronicles":14,"Esther":17,"Job":18,"Psalms":19,"Proverbs":20,"Ecclesiastes":21,
 "Song_of_Solomon":22,"Isaiah":23,"Jeremiah":24,"Lamentations":25,"Ezekiel":26,"Daniel":27,
 "Hosea":28,"Joel":29,"Amos":30,"Obadiah":31,"Jonah":32,"Micah":33,"Nahum":34,"Habakkuk":35,
 "Zephaniah":36,"Haggai":37,"Zechariah":38,
 "Tobit":72,"Judith":73,"Wisdom":71,"Sirach":70,"Baruch":74,"Epistle_of_Jeremiah":75,
 "Susanna":79,"Bel_and_the_Dragon":80,"II_Maccabees":76,"Prayer_of_Manasses":84}
CANON_CODE = {1:'GEN',2:'EXOD',3:'LEV',4:'NUM',5:'DEUT',6:'JOSH',7:'JUDG',8:'RUTH',9:'1SA',10:'2SA',
 11:'1KGS',12:'2KGS',13:'1CH',14:'2CH',17:'EST',18:'JOB',19:'PSA',20:'PROV',21:'ECCL',22:'SONG',
 23:'ISA',24:'JER',25:'LAM',26:'EZK',27:'DAN',28:'HOS',29:'JOEL',30:'AMO',31:'OBA',32:'JONAH',
 33:'MIC',34:'NAM',35:'HAB',36:'ZEP',37:'HAG',38:'ZEC',
 40:'MAT',41:'MAR',42:'LUK',43:'JHN',44:'ACT',45:'ROM',46:'1CO',47:'2CO',48:'GAL',49:'EPH',
 50:'PHP',51:'COL',52:'1TH',53:'2TH',54:'1TI',55:'2TI',56:'TIT',57:'PHM',58:'HEB',59:'JAM',
 60:'1PE',61:'2PE',62:'1JN',63:'2JN',64:'3JN',65:'JUD',66:'REV',
 70:'SIR',71:'WIS',72:'TOB',73:'JDT',74:'BAR',75:'EPJER',76:'2MAC',79:'SUS',80:'BEL',84:'PRMAN'}

RE_VERSE = re.compile(r'<verse_n [^>]*\bverse_n="([^"]+)"')
RE_GROUP = re.compile(r'<norm_group [^>]*norm_group="([^"]*)"')

def parse_tt(text):
    """-> list of (verse_label, verse_text) for one chapter file."""
    out, cur, words = [], None, []
    for line in text.split("\n"):
        mv = RE_VERSE.match(line)
        if mv:
            if cur is not None and words: out.append((cur, " ".join(words)))
            cur, words = mv.group(1), []
            continue
        mg = RE_GROUP.match(line)
        if mg and cur is not None:
            w = mg.group(1).strip()
            if w: words.append(w)
    if cur is not None and words: out.append((cur, " ".join(words)))
    return out

def load_zip(url, name_map, category):
    print(f"  fetching {url.split('/')[-1]} …")
    data = urllib.request.urlopen(url, timeout=120).read()
    zf = zipfile.ZipFile(io.BytesIO(data))
    rows = []
    for fn in zf.namelist():
        base = fn.split("/")[-1]
        if not base.endswith(".tt"): continue
        stem = base[:-3]
        parts = stem.split("_")
        if len(parts) < 3 or not parts[-1].isdigit(): continue   # skip subscriptio etc.
        chap = parts[-1]; book = "_".join(parts[1:-1])
        cid = name_map.get(book)
        if cid is None: print(f"    [skip unmapped] {book}"); continue
        code = CANON_CODE.get(cid, book.upper())
        txt = zf.read(fn).decode("utf-8", "replace")
        for vlabel, vtext in parse_tt(txt):
            rows.append((cid, code, category, chap, vlabel, vtext))
    return rows

def to_int(x):
    try: return int(re.sub(r'[^0-9].*$','',str(x)) or 0)
    except: return 0

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", default="corpus.db")
    ap.add_argument("--dry", action="store_true")
    A = ap.parse_args()

    print("fetching Coptic SCRIPTORIUM (Sahidic)…")
    rows = load_zip(NT_ZIP, NT_NAME, "sahidic-nt")
    rows += load_zip(OT_ZIP, OT_NAME, "sahidic-ot")
    books = len({r[1] for r in rows})
    print(f"reconstructed {len(rows)} verses across {books} books")
    for cid, lbl in [(40,"Matthew 1:1"),(43,"John 1:1"),(1,"Genesis 1:1")]:
        m=[r for r in rows if r[0]==cid and r[3] in ("1","01") and r[4]=="1"]
        if m: print(f"  {lbl}: {m[0][5][:60]}")

    if A.dry: print("dry run — nothing written"); return
    db = sqlite3.connect(A.corpus); cur = db.cursor()
    cur.execute("DELETE FROM verses WHERE corpus='COP'")
    cur.execute("DELETE FROM books  WHERE corpus='COP'")
    counts, meta = {}, {}
    for cid, code, cat, ch, vv, text in rows:
        counts[code]=counts.get(code,0)+1; meta[code]=(cid,cat)
    bid={}
    for code,n in counts.items():
        cid,cat=meta[code]
        cur.execute("INSERT INTO books(corpus,code,title,category,n_verses) VALUES('COP',?,?,?,?)",
                    (code,code,cat,n)); bid[code]=cur.lastrowid
    for cid, code, cat, ch, vv, text in rows:
        rk=f"COP:{code}:{ch}:{vv}"
        cur.execute("""INSERT INTO verses(ref_key,book_id,corpus,code,chapter,verse,ord_c,ord_v,
                       text,category,src,canon_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (rk,bid[code],"COP",code,ch,vv,to_int(ch),to_int(vv),text,cat,"coptic-scriptorium",cid))
    db.commit(); db.close()
    print(f"ingested {len(rows)} Coptic verses into {A.corpus} (corpus 'COP')")

if __name__ == "__main__":
    main()
