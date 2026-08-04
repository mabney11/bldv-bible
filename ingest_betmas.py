#!/usr/bin/env python3
"""
ingest_betmas.py — COMPREHENSIVE ingest of BetaMasaheft/Works.
Pulls EVERY work that carries Ge'ez edition text (not just the biblical canon).
Biblical books get a canon `book` code for the reader's canonical view; every
other work keeps its Clavis ID as `book` so nothing is lost — hagiographies,
homilies, hymns, Sinodos, Kebra Nagast, the lot.

Output (out/):
  corpus.geez.jsonl   one record per verse/unit, all works
  works.geez.json     registry of every ingested work (id, titles, counts, canon)
"""
import os, re, glob, json, unicodedata
import xml.etree.ElementTree as ET

TEI = '{http://www.tei-c.org/ns/1.0}'
XML = '{http://www.w3.org/XML/1998/namespace}'
def tag(e): return e.tag.split('}')[-1]

# Canon annotation (best-effort). English OR Ge'ez title cues. Non-matches are
# fine — they ingest as literary works keyed by Clavis ID. This does NOT limit
# what gets fetched; it only tags the reader's canonical slots.
CANON = [
 ('GEN',r'^Genesis'),('EXOD',r'^Exodus'),('LEV',r'Leviticus'),('NUM',r'Numbers'),
 ('DEUT',r'Deuteronomy'),('JOSH',r'Joshua'),('JUDG',r'Judges'),('RUTH',r'Ruth'),
 ('1SAM',r'Samuel 1\b'),('2SAM',r'Samuel 2\b'),('1KGS',r'Kings 1\b'),('2KGS',r'Kings 2\b'),
 ('1CHR',r'1 Chronicles'),('2CHR',r'2 Chronicles'),('EZRANEH',r'Ezra and Nehemiah'),
 ('EST',r'Esther'),('JOB',r'^Job\b|Book of Job|Iyob|ኢዮብ'),('PSA',r'Psalm|Psalter|Dawit|Mazmur|ዳዊት|መዝሙር|መዝገበ'),
 ('PROV',r'Proverb|Messale|Messaly|ምሳልያተ|ምሳሌ'),
 ('ECCL',r'Ecclesiastes'),('SONG',r'Song of Songs'),('ISA',r'Isaiah'),
 ('JER',r'Book of Jeremiah'),('LAM',r'Lamentations'),('BAR',r'Book of Baruch'),
 ('EPJER',r'Epistle of Jeremiah'),('EZK',r'Ezekiel'),('DAN',r'Daniel'),
 ('HOS',r'Hosea|ሆሴዕ'),('JOEL',r'Joel'),('AMO',r'Amos|አሞጽ'),('OBA',r'Obadiah'),('JONAH',r'Jonah'),
 ('MIC',r'Micah|ሚክያስ'),('NAM',r'Nahum'),('HAB',r'Habakkuk'),('ZEP',r'Zephaniah|ሶፎንያስ'),
 ('HAG',r'Haggai|ሐጌ'),('ZEC',r'Zechariah|ዘካርያስ'),('MAL',r'Malachi|ሚልክያስ'),
 ('TOB',r'Tobit'),('JDT',r'Judith'),('SIR',r'Sirach|Ecclesiasticus|Sir\u0101k|Sirak|ሲራክ'),('WIS',r'Wisdom|\u1e6c\u01dded?baba Salomon|\u0162ebab|\u1e6c\u01ddbab|ጥበበ'),
 ('1MEQ',r'First Ethiopian Book of Maccabees'),('2MEQ',r'Second Ethiopian Book of Maccabees'),
 ('3MEQ',r'Third Ethiopian Book of Maccabees'),
 ('1EN',r'Enoch|Henok|ሄኖክ'),('JUB',r'Jubilees|kuf\u0101le|Kufale|ኩፋሌ'),('4BAR',r'Paralipomena|4 Baruch|Rest of the Words'),
 ('APEZ',r'Apocalypse of Ezra'),
 ('MAT',r'Matthew|ብስራተ.*ማቴዎስ'),('MRK',r'^Mark|ብስራተ.*ማርቆስ'),('LUK',r'Luke|ብስራተ.*ሉቃስ'),
 ('JHN',r'Gospel of John|ብስራተ.*ዮሐንስ'),('ACT',r'Acts of|ሐዋርያት'),
 ('ROM',r'Romans'),('1CO',r'First Epistle to the Corinthians'),
 ('2CO',r'Second Epistle to the Corinthians|ዳግማዊ.*ቆሮንቶስ'),('GAL',r'Galatians'),('EPH',r'Ephesians'),
 ('PHP',r'Philippians'),('COL',r'Colossians'),('1TH',r'First Epistle to the Thessalonians'),
 ('2TH',r'Second Epistle to the Thessalonians'),('1TI',r'First Epistle to Timothy'),
 ('2TI',r'Second Epistle to Timothy'),('TIT',r'Titus'),('PHM',r'Philemon'),
 ('HEB',r'Hebrews'),('JAS',r'James'),('1PE',r'First Epistle of Peter'),
 ('2PE',r'Second Epistle of Peter'),('1JN',r'First Epistle of John'),
 ('2JN',r'Second Epistle of John'),('3JN',r'Third Epistle of John'),('JUD',r'Epistle of Jude'),
 ('REV',r'Revelation'),
]
CANON_RX = [(c, re.compile(p)) for c,p in CANON]

def norm(t):
    t = unicodedata.normalize('NFC', t)
    t = re.sub(r'\s+', ' ', t)
    return t.strip()

def text_of(el):
    return norm(''.join(el.itertext()))

def titles(root):
    en, gz = '', ''
    for ts in root.iter(TEI+'titleStmt'):
        for ti in ts.iter(TEI+'title'):
            txt = norm(''.join(ti.itertext()))
            if not txt: continue
            lang = ti.get(XML+'lang','')
            if lang=='gez' and not gz: gz=txt
            elif not en: en=txt
        break
    return en, gz

def parse_edition(root):
    """Yield (chapter, verse, text) from gez edition div(s). Comprehensive:
    handles chapter textparts or none; l / seg / p units; missing @n -> seq."""
    out=[]
    ETH=re.compile(r'[\u1200-\u137F]')
    # Accept ANY edition div (lang may sit on <text>, an ancestor, or be absent);
    # we keep only units that actually contain Ethiopic script.
    eds=[d for d in root.iter(TEI+'div') if d.get('type')=='edition']
    for ed in eds:
        chapters=[d for d in ed.iter(TEI+'div')
                  if d.get('type')=='textpart' and d.get('subtype')=='chapter']
        groups = chapters if chapters else [ed]
        for ci, ch in enumerate(groups, 1):
            cn = ch.get('n') or ci
            units=[e for e in ch.iter() if tag(e) in ('l','seg')]
            if not units:
                units=[e for e in ch.iter() if tag(e)=='p']
            if not units:
                units=[e for e in ch.iter() if tag(e)=='ab']
            seq=0
            for u in units:
                txt=text_of(u)
                if not txt or not ETH.search(txt): continue
                n=u.get('n')
                if n is None:
                    # headings/untagged lines -> keep but sequential id with 'h' note
                    seq+=1; vn=f"{seq}"
                else:
                    vn=n
                out.append((str(cn), str(vn), txt))
    return out

def canon_code(en, gz):
    for c,rx in CANON_RX:
        if (en and rx.search(en)) or (gz and rx.search(gz)): return c
    return None

def main():
    files=sorted(glob.glob('works/*/*.xml'))
    recs=[]; reg=[]; canon_best={}
    parsed=0
    for fp in files:
        try: root=ET.parse(fp).getroot()
        except Exception: continue
        verses=parse_edition(root)
        if not verses: continue
        wid=os.path.basename(fp)[:-4]
        en,gz=titles(root)
        cc=canon_code(en,gz)
        reg.append({'work':wid,'title_en':en,'title_gez':gz,'units':len(verses),
                    'canon':cc})
        # track best (max units) per canon code to avoid tagging stubs
        if cc:
            if cc not in canon_best or len(verses)>canon_best[cc][1]:
                canon_best[cc]=(wid,len(verses))
        for cn,vn,txt in verses:
            recs.append((wid,cc,cn,vn,txt))
        parsed+=1

    # finalize: only the best work for each canon code keeps the book code;
    # other same-name works stay literary (book = work id). Nothing dropped.
    os.makedirs('out',exist_ok=True)
    fo=open('out/corpus.geez.jsonl','w',encoding='utf-8')
    nrec=0
    for wid,cc,cn,vn,txt in recs:
        book = cc if (cc and canon_best[cc][0]==wid) else wid
        toks=[{"w":w,"tr":"","gl":""} for w in txt.replace('፡',' ').split() if w]
        fo.write(json.dumps({"corpus":"GEZ","book":book,"work":wid,
            "ch":cn,"v":vn,"text":txt,"tokens":toks,
            "src":f"betmas:Works:{wid}","conf":"betmas"},ensure_ascii=False)+"\n")
        nrec+=1
    fo.close()
    for r in reg:
        r['book']= r['canon'] if (r['canon'] and canon_best[r['canon']][0]==r['work']) else r['work']
    json.dump(reg,open('out/works.geez.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
    ncanon=len({c for c,(w,n) in canon_best.items()})
    print(f"works ingested (have gez edition text): {parsed}")
    print(f"verse/unit records: {nrec:,}")
    print(f"distinct canon books matched: {ncanon}/ {len(CANON)}")
    missing=[c for c,_ in CANON if c not in canon_best]
    print("canon books NOT found:", ', '.join(missing) if missing else '(none)')

if __name__=='__main__': main()
