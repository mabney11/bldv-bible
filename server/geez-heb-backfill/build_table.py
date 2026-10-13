#!/usr/bin/env python3
"""Learn Ge'ez -> Hebrew word correspondences from the corpus's own parallels.
Every verse that exists in BOTH corpus='GEZ' and corpus='HEB' (same canon_id/chapter/verse)
is a sentence pair. For each Ge'ez key (full / de-prefixed / skeleton) of the TARGET books'
vocabulary we count the Hebrew stems (proclitic-peeled) in the paired verses, and keep the
whole Hebrew surface forms seen. Score = Dice. Output: geez_heb_table.json"""
import json, sys, collections, math
sys.path.insert(0, '.')
from common import *
TARGETS = [143, 87, 88, 212, 213, 214, 215]
db = open_db('../corpus.db'); c = db.cursor()
tvocab = set()
for (t,) in c.execute(f"select text from verses where corpus='GEZ' and canon_id in ({','.join(map(str,TARGETS))})"):
    for w in gez_words(t):
        tvocab.update(gez_keys(w))
print('target keys', len(tvocab))
def nk(x):
    try: return int(float(x))
    except Exception: return x
gez = {}
for cid, ch, v, t in c.execute("select canon_id,chapter,verse,text from verses where corpus='GEZ' and canon_id is not null and canon_id not in (%s)" % ','.join(map(str,TARGETS))):
    k = (cid, nk(ch), nk(v))
    gez[k] = (gez.get(k, '') + ' ' + (t or '')).strip()
heb = {}; allw = collections.Counter()
for cid, ch, v, t, tp, conf in c.execute("select canon_id,chapter,verse,text,text_paleo,conf from verses where corpus='HEB' and canon_id is not null"):
    k = (cid, nk(ch), nk(v)); txt = t or tp
    if conf != "ai-generated-corpus-terminology":
        for w in heb_words(txt): allw[w] += 1
    if k in gez: heb[k] = (heb.get(k, '') + ' ' + (txt or '')).strip()
json.dump({heb_display(w): n for w, n in allw.items()}, open('heb_attested.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('attested Hebrew whole words', len(allw))
print('pairs', len(heb))
cg = collections.Counter(); ch_ = collections.Counter(); joint = collections.Counter()
surf = collections.defaultdict(collections.Counter)  # stem -> full surface counts
nver = 0
for k, ht in heb.items():
    hw = heb_words(ht)
    if not hw: continue
    nver += 1
    hstems = set()
    for w in hw:
        for s in heb_peels(w):
            if s != w and s not in allw: continue   # a peel must itself be an attested word
            hstems.add(s); surf[s][w] += 1
    for s in hstems: ch_[s] += 1
    gk = set()
    for w in gez_words(gez[k]):
        for key in gez_keys(w):
            if key in tvocab: gk.add(key)
    for g in gk:
        cg[g] += 1
        for s in hstems: joint[(g, s)] += 1
print('verses', nver, 'joint pairs', len(joint))
by = collections.defaultdict(list)
for (g, s), n in joint.items():
    if n < 2: continue
    dice = 2 * n / (cg[g] + ch_[s])
    if dice < 0.02: continue
    by[g].append((dice, n, s))
out = {}
for g, lst in by.items():
    lst.sort(reverse=True)
    res = []
    for dice, n, s in lst[:6]:
        tops = [heb_display(w) for w, _ in surf[s].most_common(4)]
        res.append({'stem': heb_display(s), 'dice': round(dice, 3), 'n': n, 'forms': tops})
    out[g] = {'n': cg[g], 'cands': res}
json.dump(out, open('geez_heb_table.json', 'w', encoding='utf-8'), ensure_ascii=False)
cov = sum(1 for k in tvocab if k in out)
print('keys with evidence', cov, '/', len(tvocab))
