#!/usr/bin/env python3
"""Per-verse evidence sheets for the translation batches."""
import json, sys, os
sys.path.insert(0, '.')
from common import *
T = json.load(open('geez_heb_table.json', encoding='utf-8'))
LEX = json.load(open('../lexicon/geez-lexicon.json', encoding='utf-8'))
BOOKS = [(143, '1MEQ'), (87, '2MEQ'), (88, '3MEQ'), (212, 'LIT3332Melchiz'), (213, 'LIT7232Melchiz'), (214, 'LIT3326Melchiz1'), (215, 'LIT2365Storyo')]
db = open_db('../corpus.db'); c = db.cursor()
os.makedirs('batches', exist_ok=True)
verses = []
for cid, code in BOOKS:
    for ch, v, t in c.execute("select chapter,verse,text from verses where corpus='GEZ' and canon_id=? order by ord_c,ord_v", (cid,)):
        verses.append((cid, code, ch, v, t))
def ev(w):
    out = []
    for lvl, k in zip(('full', 'stem', 'skel'), gez_keys(w)):
        e = T.get(k)
        if not e: continue
        cs = [cd for cd in e['cands'] if cd['dice'] >= 0.04][:3]
        if not cs: continue
        out.append(f"{lvl}: " + '; '.join(f"{cd['stem']} {cd['dice']:.2f} [{','.join(cd['forms'][:3])}]" for cd in cs))
        if lvl == 'full' and cs[0]['dice'] >= 0.25: break
        if len(out) == 2: break
    g = LEX.get(w)
    if g: out.insert(0, f"lex: {g}")
    return ' | '.join(out) or '(no parallel evidence — choose an attested Hebrew word yourself)'
BATCH = 30
n = 0
manifest = []
for i in range(0, len(verses), BATCH):
    chunk = verses[i:i+BATCH]; n += 1
    lines = []
    for cid, code, ch, v, t in chunk:
        ref = f"{code} {ch}:{v}"
        lines.append(f"### {ref}  (canon {cid})")
        lines.append(f"GEZ: {t}")
        seen = set()
        for w in gez_words(t):
            if w in seen: continue
            seen.add(w)
            lines.append(f"  {w} — {ev(w)}")
        lines.append('')
    fn = f"batches/batch_{n:03d}.txt"
    open(fn, 'w', encoding='utf-8').write('\n'.join(lines))
    manifest.append({'batch': n, 'file': fn, 'refs': [f"{code} {ch}:{v}" for _, code, ch, v, _ in chunk]})
json.dump(manifest, open('batches/manifest.json', 'w'), ensure_ascii=False, indent=0)
# full Ge'ez text for the terminology pre-pass
with open('batches/all_geez.txt', 'w', encoding='utf-8') as f:
    for cid, code, ch, v, t in verses: f.write(f"{code} {ch}:{v}\t{t}\n")
print(len(verses), 'verses,', n, 'batches')
