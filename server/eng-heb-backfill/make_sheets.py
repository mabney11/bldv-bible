#!/usr/bin/env python3
"""Batch sheets for the English-source Hebrew backfill.
usage: make_sheets.py CANON_ID [--chapters 1,2,15,16] [--per 40] [--tag esd]
Without --chapters: every reader verse (corpus.db ENG) of that book with no HEB row.
English source: versions.db KJV when it has the verse, else corpus.db ENG text_src with the
reading text's "translit (gloss)" pairs unwrapped to the gloss."""
import argparse, json, os, re, sqlite3, sys
HERE = os.path.dirname(os.path.abspath(__file__)); SRV = os.path.dirname(HERE)
ap = argparse.ArgumentParser(); ap.add_argument('canon', type=int); ap.add_argument('--chapters')
ap.add_argument('--per', type=int, default=40); ap.add_argument('--tag', default=None)
A = ap.parse_args(); tag = A.tag or f"c{A.canon}"
H = json.load(open(os.path.join(HERE, 'hints.json'), encoding='utf-8'))
db = sqlite3.connect(f"file:{os.path.join(SRV,'corpus.db')}?immutable=1", uri=True)
vdb = sqlite3.connect(f"file:{os.path.join(SRV,'versions.db')}?immutable=1", uri=True)
k = lambda x: int(float(x))
eng = {(k(c), k(v)): (t or '', s or '') for c, v, t, s in db.execute(
    "select chapter, verse, text, text_src from verses where corpus='ENG' and canon_id=?", (A.canon,))}
heb = {(k(c), k(v)) for c, v in db.execute("select chapter, verse from verses where corpus='HEB' and canon_id=? and coalesce(text_paleo,text,'')<>''", (A.canon,))}
code = db.execute("select code from verses where corpus='ENG' and canon_id=? limit 1", (A.canon,)).fetchone()[0]
keys = sorted(eng)
keys = [x for x in keys if x[0] in {int(c) for c in A.chapters.split(',')}] if A.chapters else [x for x in keys if x not in heb]
PAIR = re.compile(r"(\S+) \(([^()]*)\)")
def unwrap(t): return PAIR.sub(lambda m: m.group(2) or m.group(1), t)
STOP = set("the a an and of to in for that is be he she it they them his her their him i me my we us our you your ye thee thou thy not shall will with as but by on at was were are have has had this these those which who whom so or from all unto upon there then when what".split())
def hint(w):
    w = w.lower()
    for c in (w, w[:-1], w[:-2], w[:-3], w[:-2]+'e', w[:-3]+'e', w[:-1] if w.endswith('s') else None):
        if c and c in H: return H[c]
verses = []
for c, v in keys:
    kj = vdb.execute("select text from verses where version='KJV' and canon_id=? and chapter=? and verse=?", (A.canon, c, v)).fetchone()
    en = kj[0] if kj else unwrap(eng[(c, v)][1] or eng[(c, v)][0])
    hints = {}
    for w in re.findall(r"[A-Za-z]+", en):
        if w.lower() in STOP or w.lower() in hints: continue
        h = hint(w)
        if h: hints[w.lower()] = [f"{sn} {'/'.join(f)}" for sn, p, n, f in h[:3]]
    verses.append({'ref': f"{c}:{v}", 'chapter': str(c), 'verse': str(v), 'eng': en, 'hints': hints})
os.makedirs(os.path.join(HERE, 'batches'), exist_ok=True)
n = 0
for i in range(0, len(verses), A.per):
    n += 1
    fn = os.path.join(HERE, 'batches', f"{tag}_{n:03d}.json")
    json.dump({'canon_id': A.canon, 'code': code, 'verses': verses[i:i+A.per]}, open(fn, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(code, len(verses), 'verses ->', n, 'batches', tag)
