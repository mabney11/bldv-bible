#!/usr/bin/env python3
"""English -> attested Hebrew hint table for the English-source Hebrew backfill.
p(english|Strong's) from ../align-table.json (learned from the WEB's tagged OT), each Strong's
number's commonest BHS spellings from corpus.db tokens_bhs. Writes hints.json:
  english word -> [[SN, p, count, [square spellings...]], ...]   (best first)"""
import json, os, sqlite3, sys, collections, math
HERE = os.path.dirname(os.path.abspath(__file__)); SRV = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(SRV, 'geez-heb-backfill'))
from common import heb_norm, heb_display
tab = json.load(open(os.path.join(SRV, 'align-table.json'), encoding='utf-8'))
db = sqlite3.connect(f"file:{os.path.join(SRV,'corpus.db')}?immutable=1", uri=True)
cnt = collections.Counter(); forms = collections.defaultdict(collections.Counter)
for sn, w in db.execute("select strongs, word_raw from tokens_bhs where strongs like 'H%' and strongs not between 'H9000' and 'H9999'"):
    n = heb_norm(w)
    if len(n) < 1: continue
    cnt[sn] += 1; forms[sn][n] += 1
inv = collections.defaultdict(list)
for sn, d in tab['sn'].items():
    if not sn.startswith('H') or sn not in cnt: continue
    for e, p in d.items():
        if p >= 0.04: inv[e].append((sn, p, cnt[sn]))
out = {}
for e, L in inv.items():
    L.sort(key=lambda x: -(x[1] * math.log(1 + x[2])))
    out[e] = [[sn, round(p, 3), c, [heb_display(f) for f, _ in forms[sn].most_common(4)]] for sn, p, c in L[:4]]
json.dump(out, open(os.path.join(HERE, 'hints.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print(len(out), 'english words;', 'die ->', out.get('die'), '\nunfaithful ->', out.get('unfaithful'))
