#!/usr/bin/env python3
"""Attestation gate: every Hebrew word in out/batch_NNN.json must exist in the corpus's own
(non-AI) Hebrew, as a whole word or after peeling up to 3 proclitics (ו ה ב ל כ מ ש).
Words listed in the batch's "names" (Hebrew spelling of a proper name with no corpus
attestation) are exempt. Usage: python3 check_heb.py out/batch_001.json [more...]"""
import json, sys
import os; HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from common import heb_norm, heb_words, heb_peels
ATT = {heb_norm(w) for w in json.load(open(os.path.join(HERE, 'heb_attested.json'), encoding='utf-8'))}
def attested(w):
    return any(p in ATT for p in heb_peels(w))
bad_total = 0
for fn in sys.argv[1:]:
    d = json.load(open(fn, encoding='utf-8'))
    names = {heb_norm(x['heb']) for x in d.get('names', {}).values() if x.get('heb')}
    for n in list(names):
        names.update(heb_peels(n))
    for ref, v in d['verses'].items():
        if not v.get('heb', '').strip() or not v.get('eng', '').strip():
            print(f"{fn} {ref}: EMPTY heb/eng"); bad_total += 1; continue
        if any(0x0591 <= ord(c) <= 0x05C7 for c in v['heb']):
            print(f"{fn} {ref}: has niqqud"); bad_total += 1
        bad = [w for w in heb_words(v['heb']) if not attested(w) and not any(p in names for p in heb_peels(w))]
        if bad:
            bad_total += len(bad); print(f"{fn} {ref}: UNATTESTED {' '.join(bad)}")
print('unattested/problem words:', bad_total)
sys.exit(1 if bad_total else 0)
