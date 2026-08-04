#!/usr/bin/env python3
"""Remove anything from a corpus, cleanly. Examples:
  python3 prune.py corpus.grc.jsonl --list
  python3 prune.py corpus.grc.jsonl --drop-cat classical,patristic --out grc.clean.jsonl
  python3 prune.py corpus.lat.jsonl --keep-cat scripture,deuterocanon --out lat.clean.jsonl
  python3 prune.py corpus.geez.jsonl --drop-corpus '' --drop-src betmas:Works:LIT4032SenkessarS
Filters by category / corpus / src / work. Nothing is deleted in place — it
writes a new file, so removal is always reversible."""
import sys, json, argparse, collections
from categories import categorize
ap=argparse.ArgumentParser()
ap.add_argument('infile'); ap.add_argument('--out')
ap.add_argument('--list',action='store_true')
for opt in ('drop-cat','keep-cat','drop-corpus','keep-corpus','drop-src','drop-work'):
    ap.add_argument('--'+opt,default='')
a=ap.parse_args()
def S(x): return set(v for v in x.split(',') if v)
dc,kc=S(a.drop_cat),S(a.keep_cat); dco,kco=S(a.drop_corpus),S(a.keep_corpus)
ds,dw=S(a.drop_src),S(a.drop_work)
if a.list:
    bycat=collections.Counter(); bycorp=collections.Counter()
    for line in open(a.infile,encoding='utf-8'):
        r=json.loads(line); bycat[categorize(r)]+=1; bycorp[r.get('corpus')]+=1
    print("by corpus:",dict(bycorp)); print("by category:",dict(bycat)); sys.exit()
out=open(a.out,'w',encoding='utf-8'); kept=dropped=0
for line in open(a.infile,encoding='utf-8'):
    r=json.loads(line); cat=categorize(r); corp=r.get('corpus'); src=r.get('src',''); wk=r.get('work','')
    drop = (cat in dc) or (corp in dco) or (src in ds) or (wk in dw) \
        or (kc and cat not in kc) or (kco and corp not in kco)
    if drop: dropped+=1; continue
    out.write(line); kept+=1
out.close(); print(f"kept {kept:,}  dropped {dropped:,} -> {a.out}")
