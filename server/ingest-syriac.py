#!/usr/bin/env python3
"""
ingest-syriac.py — full Syriac Scriptures into corpus.db (corpus 'SYR'), original text.

Source: ETCBC Text-Fabric (SEDRA for the NT; Leiden Peshitta / Codex Ambrosianus
for the OT), Unicode Syriac.

  NT (syrnt)     -> 27 books, canon_id 40-66
  OT (peshitta)  -> 39 canonical (canon_id 1-39) + deuterocanon (canon_id 67-84)
                    + pseudepigrapha kept as works: 2 Baruch (Apocalypse of Baruch),
                    4 Ezra, Epistle of Baruch, alternate recensions, Apocryphal Psalms.

Re-running replaces all 'SYR'.

  python ingest-syriac.py            # NT + OT
  python ingest-syriac.py --dry      # report only
  python ingest-syriac.py --nt-only  # just the NT
"""
import sqlite3, argparse, urllib.request

SYRNT = "https://raw.githubusercontent.com/ETCBC/syrnt/master/tf/0.1"
PESH  = "https://raw.githubusercontent.com/ETCBC/peshitta/master/tf/0.1"

NT_CODES = ["MAT","MAR","LUK","JHN","ACT","ROM","1CO","2CO","GAL","EPH","PHP","COL",
            "1TH","2TH","1TI","2TI","TIT","PHM","HEB","JAM","1PE","2PE","1JN","2JN","3JN","JUD","REV"]

CANON_CODE = {1:'GEN',2:'EXOD',3:'LEV',4:'NUM',5:'DEUT',6:'JOSH',7:'JUDG',8:'RUTH',9:'1SA',10:'2SA',
 11:'1KGS',12:'2KGS',13:'1CH',14:'2CH',15:'EZRA',16:'NEH',17:'EST',18:'JOB',19:'PSA',20:'PROV',
 21:'ECCL',22:'SONG',23:'ISA',24:'JER',25:'LAM',26:'EZK',27:'DAN',28:'HOS',29:'JOEL',30:'AMO',
 31:'OBA',32:'JONAH',33:'MIC',34:'NAM',35:'HAB',36:'ZEP',37:'HAG',38:'ZEC',39:'MAL',
 69:'1MAC',70:'SIR',71:'WIS',72:'TOB',73:'JDT',74:'BAR',75:'EPJER',76:'2MAC',77:'3MAC',
 78:'4MAC',79:'SUS',80:'BEL',81:'1ES',82:'ODE',83:'PSS',84:'PRMAN'}

OT_CANON = {
 'Gn':1,'Ex':2,'Lv':3,'Nm':4,'Dt':5,'Jos':6,'Jd':7,'Ru':8,'Sm1':9,'Sm2':10,'Rg1':11,'Rg2':12,
 'Chr1':13,'Chr2':14,'Ezr':15,'Neh':16,'Est':17,'Jb':18,'Ps':19,'Pr':20,'Ec':21,'Ct':22,
 'Is':23,'Jr':24,'Thr':25,'Ez':26,'Dn':27,'Hs':28,'Jl':29,'Am':30,'Ob':31,'Jon':32,'Mi':33,
 'Na':34,'Hb':35,'Zf':36,'Hg':37,'Sa':38,'Ml':39,
 'Sap':71,'EpJr':75,'Bar':74,'BelDr':80,'Sus':79,'Jdt':73,'Sir':70,'Mc2':76,'Mc3':77,'Mc4':78,
 'Oda':82,'PsS':83,'Esr3':81,'Mc1_A':69,'OrM_A':84,'Tb_A':72,
}
OT_WORK = {
 'ApBar':('APBAR','2 Baruch (Syriac Apocalypse of Baruch)','pseudepigrapha'),
 'Esr4':('4EZRA','4 Ezra (Syriac)','pseudepigrapha'),
 'EpBar_A':('EPBAR_A','Epistle of Baruch (rec. A)','pseudepigrapha'),
 'EpBar_B':('EPBAR_B','Epistle of Baruch (rec. B)','pseudepigrapha'),
 'Mc1_B':('1MAC_B','1 Maccabees (rec. B)','deuterocanon'),
 'OrM_B':('PRMAN_B','Prayer of Manasseh (rec. B)','deuterocanon'),
 'ApcPs_A':('APCPS_A','Apocryphal Psalms (rec. A)','pseudepigrapha'),
 'ApcPs_B':('APCPS_B','Apocryphal Psalms (rec. B)','pseudepigrapha'),
 'ApcPs':('APCPS','Apocryphal Psalms','pseudepigrapha'),
 'Tb_B':('TOB_B','Tobit (rec. B)','deuterocanon'),
}

def fetch(base, name):
    with urllib.request.urlopen(f"{base}/{name}.tf", timeout=60) as r:
        return r.read().decode("utf-8")
def body(txt): return txt.split("\n\n", 1)[1] if "\n\n" in txt else txt

def feat(base, name):
    out, node = {}, 0
    for ln in body(fetch(base, name)).split("\n"):
        if ln == "": node += 1; continue
        if "\t" in ln:
            left, val = ln.split("\t", 1)
            if left[:1].isdigit():
                node = int(left.split("-")[0]); out[node] = val; continue
        node += 1; out[node] = ln
    return out

def otype_ranges(base):
    rng = {}
    for ln in body(fetch(base, "otype")).split("\n"):
        if "\t" not in ln: continue
        span, typ = ln.split("\t", 1)
        a, b = (span.split("-") + [span])[:2]
        rng[typ] = (int(a), int(b))
    return rng

def parse_oslots(base, first_nonslot):
    out, node = {}, first_nonslot - 1
    for ln in body(fetch(base, "oslots")).split("\n"):
        if ln == "": node += 1; continue
        if "\t" in ln:
            left, val = ln.split("\t", 1)
            node = int(left.split("-")[0]) if left[:1].isdigit() else node + 1
        else:
            node += 1; val = ln
        lo = hi = None
        for part in val.split(","):
            a, b = (part.split("-") + [part])[:2]; a, b = int(a), int(b)
            lo = a if lo is None else min(lo, a); hi = b if hi is None else max(hi, b)
        out[node] = (lo, hi)
    return out

def reconstruct(base):
    ot = otype_ranges(base)
    words = feat(base, "word"); book_l = feat(base, "book")
    chap_l = feat(base, "chapter"); vers_l = feat(base, "verse")
    oslots = parse_oslots(base, ot["book"][0])
    bnodes = range(ot["book"][0], ot["book"][1] + 1)
    cnodes = range(ot["chapter"][0], ot["chapter"][1] + 1)
    vnodes = range(ot["verse"][0], ot["verse"][1] + 1)
    brng = [(nd, oslots[nd]) for nd in bnodes if nd in oslots]
    crng = [(nd, oslots[nd]) for nd in cnodes if nd in oslots]
    bidx = {nd: i for i, (nd, _) in enumerate(brng)}
    def find(ranges, slot):
        for nd, (lo, hi) in ranges:
            if lo <= slot <= hi: return nd
        return None
    rows = []
    for vn in vnodes:
        if vn not in oslots: continue
        lo, hi = oslots[vn]
        bn = find(brng, lo); cn = find(crng, lo)
        if bn is None: continue
        text = " ".join(words[s] for s in range(lo, hi + 1) if s in words)
        rows.append((book_l.get(bn, "?"), bidx[bn], chap_l.get(cn, "1"), vers_l.get(vn, "1"), text))
    return rows

def to_int(x):
    try: return int(x)
    except: return 0

def collect_nt():
    return [(40 + bi, NT_CODES[bi], NT_CODES[bi], "peshitta-nt", ch, vv, text)
            for name, bi, ch, vv, text in reconstruct(SYRNT)]

def collect_ot():
    out = []
    for name, bi, ch, vv, text in reconstruct(PESH):
        if name in OT_CANON:
            cid = OT_CANON[name]; code = CANON_CODE.get(cid, name)
            out.append((cid, code, code, "peshitta-ot", ch, vv, text))
        elif name in OT_WORK:
            code, title, cat = OT_WORK[name]
            out.append((None, code, title, cat, ch, vv, text))
        else:
            out.append((None, name.upper(), name, "peshitta-ot", ch, vv, text))
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", default="corpus.db")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--nt-only", action="store_true")
    A = ap.parse_args()

    print("fetching New Testament (SEDRA)…")
    rows = collect_nt()
    if not A.nt_only:
        print("fetching Old Testament + apocrypha (Leiden Peshitta / Ambrosianus)…")
        rows += collect_ot()

    canon = sum(1 for r in rows if r[0] is not None)
    works = len({r[1] for r in rows if r[0] is None})
    print(f"reconstructed {len(rows)} verses · {canon} canon-aligned · {works} works")
    g = [r for r in rows if r[0] == 1 and r[4] == "1" and r[5] == "1"]
    if g: print("  Genesis 1:1:", g[0][6][:64])
    ab = [r for r in rows if r[1] == 'APBAR' and r[4] == "1" and r[5] == "1"]
    if ab: print("  2 Baruch 1:1:", ab[0][6][:64])

    if A.dry: print("dry run — nothing written"); return
    db = sqlite3.connect(A.corpus); cur = db.cursor()
    cur.execute("DELETE FROM verses WHERE corpus='SYR'")
    cur.execute("DELETE FROM books  WHERE corpus='SYR'")
    counts, meta = {}, {}
    for cid, code, title, cat, ch, vv, text in rows:
        counts[code] = counts.get(code, 0) + 1; meta[code] = (cid, title, cat)
    bid = {}
    for code, n in counts.items():
        cid, title, cat = meta[code]
        cur.execute("INSERT INTO books(corpus,code,title,category,n_verses) VALUES('SYR',?,?,?,?)",
                    (code, title, cat, n)); bid[code] = cur.lastrowid
    for cid, code, title, cat, ch, vv, text in rows:
        rk = f"SYR:{code}:{ch}:{vv}"
        src = "syrnt-sedra" if cat == "peshitta-nt" else "peshitta-leiden"
        cur.execute("""INSERT INTO verses(ref_key,book_id,corpus,code,chapter,verse,ord_c,ord_v,
                       text,category,src,canon_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (rk, bid[code], "SYR", code, ch, vv, to_int(ch), to_int(vv), text, cat, src, cid))
    db.commit(); db.close()
    print(f"ingested {len(rows)} Syriac verses into {A.corpus} (corpus 'SYR')")

if __name__ == "__main__":
    main()
