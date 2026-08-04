#!/usr/bin/env python3
"""Load all corpus JSONL files into a single SQLite DB your app can read.
Keeps your verses(ref_key, book_id, chapter, verse, text) shape AND adds
corpus/code/category/src so you can filter or prune in SQL. Stable integer
book_id is assigned per (corpus, code). Run:  python3 load_corpus.py corpus.db file1.jsonl file2.jsonl ..."""
import sys, json, sqlite3, re
from categories import categorize
def ordnum(s):
    m=re.match(r'\d+', str(s) or ''); return int(m.group()) if m else 0
def main():
    dbpath=sys.argv[1]; files=sys.argv[2:]
    db=sqlite3.connect(dbpath); c=db.cursor()
    c.executescript("""
      PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
      DROP TABLE IF EXISTS verses; DROP TABLE IF EXISTS books; DROP TABLE IF EXISTS meta;
      CREATE TABLE books(book_id INTEGER PRIMARY KEY, corpus TEXT, code TEXT, title TEXT,
                         category TEXT, n_verses INTEGER, UNIQUE(corpus,code));
      CREATE TABLE verses(id INTEGER PRIMARY KEY, ref_key TEXT, book_id INTEGER, corpus TEXT,
                         code TEXT, chapter TEXT, verse TEXT, ord_c INTEGER, ord_v INTEGER,
                         text TEXT, category TEXT, src TEXT, conf TEXT);
      CREATE TABLE meta(corpus TEXT, category TEXT, source TEXT, records INTEGER);
    """)
    bookid={}; bookmeta={}; nrec=0
    ins=db.prepare if False else None
    for fp in files:
        for line in open(fp,encoding='utf-8'):
            r=json.loads(line)
            corpus=r.get('corpus'); code=r.get('book') or r.get('work')
            key=(corpus,code)
            if key not in bookid:
                bookid[key]=len(bookid)+1
                bookmeta[key]=[r.get('title') or code, categorize(r), 0]
            bid=bookid[key]; cat=categorize(r)
            ch=str(r.get('ch') if r.get('ch') is not None else r.get('chapter') or '')
            v=str(r.get('v') if r.get('v') is not None else r.get('verse') or '')
            rk=f"{corpus}:{code}:{ch}:{v}"
            c.execute("INSERT INTO verses(ref_key,book_id,corpus,code,chapter,verse,ord_c,ord_v,text,category,src,conf) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                      (rk,bid,corpus,code,ch,v,ordnum(ch),ordnum(v),r.get('text',''),cat,r.get('src',''),r.get('conf','')))
            bookmeta[key][2]+=1; nrec+=1
            if nrec % 100000==0: db.commit()
    for key,bid in bookid.items():
        t,cat,n=bookmeta[key]
        c.execute("INSERT INTO books(book_id,corpus,code,title,category,n_verses) VALUES (?,?,?,?,?,?)",
                  (bid,key[0],key[1],t,cat,n))
    c.executescript("""
      CREATE INDEX idx_v_bcv ON verses(book_id, ord_c, ord_v);
      CREATE INDEX idx_v_code ON verses(corpus, code, ord_c, ord_v);
      CREATE INDEX idx_v_cat ON verses(category);
      CREATE INDEX idx_v_corpus ON verses(corpus);
    """)
    c.execute("INSERT INTO meta SELECT corpus, category, conf, COUNT(*) FROM verses GROUP BY corpus,category,conf")
    db.commit()
    print(f"loaded {nrec:,} verses, {len(bookid):,} works into {dbpath}")
if __name__=='__main__': main()
