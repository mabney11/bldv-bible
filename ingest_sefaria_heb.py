#!/usr/bin/env python3
"""Ingest Sefaria Hebrew apocrypha JSON -> corpus JSONL (corpus=HEB).
Run after download_apocrypha.sh:  python3 ingest_sefaria_heb.py
Globs json/**/Hebrew/merged.json, maps known titles to codes/categories."""
import json, glob, re, unicodedata
CODE={
 'Ben Sira':('SIR','deuterocanon'),
 'Book of Jubilees':('JUB','pseudepigrapha'),
 'Book of Judith':('JDT','deuterocanon'),
 'Book of Tobit':('TOB','deuterocanon'),
 'The Book of Susanna':('SUS','deuterocanon'),
 'The Wisdom of Solomon':('WIS','deuterocanon'),
 'The Testaments of the Twelve Patriarchs':('TEST12','pseudepigrapha'),
 'Letter of Aristeas':('ARISTEAS','pseudepigrapha'),
 'Prayer of Manasseh':('PRMAN','deuterocanon'),
 'Psalm 151':('PS151','pseudepigrapha'),'Psalm 154':('PS154','pseudepigrapha'),
 'The Book of Maccabees I':('1MAC','deuterocanon'),
 'The Book of Maccabees II':('2MAC','deuterocanon'),
 'Megillat Antiochus':('MEGANT','pseudepigrapha'),
 'Megillat Taanit':('MEGTAAN','hebrew-literary'),
 'Seder Olam Rabbah':('SEDOLAM','hebrew-literary'),
}
HEB=re.compile(r'[\u0590-\u05FF]')
def strip(t):
    t=re.sub(r'<[^>]+>','',str(t)); return re.sub(r'\s+',' ',unicodedata.normalize('NFC',t)).strip()
def walk(node,path,out):
    if isinstance(node,str): out.append((path,node)); return
    if isinstance(node,list):
        for i,c in enumerate(node,1): walk(c,path+[i],out)
recs=0
with open('out_sefaria.jsonl','w',encoding='utf-8') as fo:
    for fp in glob.glob('json/**/Hebrew/merged.json',recursive=True):
        title=fp.replace('\\','/').split('/')[-3]
        if title not in CODE: continue
        code,cat=CODE[title]
        d=json.load(open(fp,encoding='utf-8'))
        leaves=[]; walk(d.get('text',[]),[],leaves)
        for path,txt in leaves:
            t=strip(txt)
            if not t or not HEB.search(t): continue
            ch=str(path[0]) if path else '1'; v=str(path[1]) if len(path)>1 else '1'
            fo.write(json.dumps({"corpus":"HEB","book":code,"work":code,"title":title,
              "cat":cat,"ch":ch,"v":v,"text":t,"src":f"sefaria:{title}","conf":"sefaria"},ensure_ascii=False)+'\n')
            recs+=1
print("Sefaria Hebrew apocrypha verses:",recs,"-> out_sefaria.jsonl")
