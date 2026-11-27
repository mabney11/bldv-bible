#!/usr/bin/env python3
"""Attestation gate for the English-source Hebrew backfill: every Hebrew word of out/X.json is a word
of the corpus's own (non-AI) Hebrew, whole or after peeling <=3 proclitics (ו ה ב ל כ מ ש); only the
batch's listed "names" are exempt; every verse of the matching batches/X.json is answered; no niqqud.
usage: python3 check_heb.py out/esd2_001.json [...]"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
GZ = os.path.join(os.path.dirname(HERE), 'geez-heb-backfill')
sys.path.insert(0, GZ if os.path.isdir(GZ) else HERE)
from common import heb_norm, heb_words, heb_peels
ATTF = os.path.join(GZ, 'heb_attested.json') if os.path.exists(os.path.join(GZ, 'heb_attested.json')) else os.path.join(HERE, 'heb_attested.json')
ATT = {heb_norm(w) for w in json.load(open(ATTF, encoding='utf-8'))}
bad_total = 0
for fn in sys.argv[1:]:
    d = json.load(open(fn, encoding='utf-8'))
    bf = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(fn))), 'batches', os.path.basename(fn))
    want = [v['ref'] for v in json.load(open(bf, encoding='utf-8'))['verses']] if os.path.exists(bf) else []
    names = set()
    for x in d.get('names', {}).values():
        if x.get('heb'): names.update(heb_peels(heb_norm(x['heb'])))
    for r in want:
        if r not in d['verses']: print(f"{fn} {r}: MISSING"); bad_total += 1
    for ref, v in d['verses'].items():
        h = v.get('heb', '') if isinstance(v, dict) else v
        if not h.strip(): print(f"{fn} {ref}: EMPTY"); bad_total += 1; continue
        if any(0x0591 <= ord(c) <= 0x05C7 for c in h): print(f"{fn} {ref}: has niqqud"); bad_total += 1
        bad = [w for w in heb_words(h) if not any(p in ATT for p in heb_peels(w)) and not any(p in names for p in heb_peels(w))]
        if bad: bad_total += len(bad); print(f"{fn} {ref}: UNATTESTED {' '.join(bad)}")
print('unattested/problem words:', bad_total)
sys.exit(1 if bad_total else 0)
