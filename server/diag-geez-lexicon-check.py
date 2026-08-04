#!/usr/bin/env python3
"""
diag-geez-lexicon-check.py — validate lexicon/geez-lexicon.json after the 2026-08-01
Melchizedek-cycle bulk addition: valid JSON, no duplicate keys silently overwritten
(Python's json.load keeps the LAST value on a dup key with no warning, same as JS —
this script checks the raw text for repeated keys BEFORE parsing, so a silent
overwrite is caught instead of hidden), and flags every entry marked "(uncertain)"
so they're easy to find for follow-up verification.

Run from server/:
    python diag-geez-lexicon-check.py
"""
import json, re, collections

PATH = 'lexicon/geez-lexicon.json'
raw = open(PATH, encoding='utf-8').read()

# find all "key": on their own -- collect and check for repeats before parsing
keys = re.findall(r'^\s*"((?:[^"\\]|\\.)*)"\s*:', raw, re.M)
counts = collections.Counter(keys)
dupes = {k: n for k, n in counts.items() if n > 1}

print(f'{len(keys)} total key occurrences, {len(counts)} distinct keys')
if dupes:
    print(f'\n!! {len(dupes)} DUPLICATE KEY(S) — last value silently wins, earlier ones lost:')
    for k, n in dupes.items():
        print(f'  {k!r} appears {n}x')
else:
    print('No duplicate keys found.')

try:
    data = json.loads(raw)
    print(f'\nJSON parses OK. {len(data)} entries after parsing (dedup applied by parser).')
except json.JSONDecodeError as e:
    print(f'\n!! JSON PARSE ERROR: {e}')
    raise SystemExit(1)

uncertain = {k: v for k, v in data.items() if '(uncertain)' in v}
print(f'\n{len(uncertain)} entries marked (uncertain) — flagged for follow-up verification:')
for k, v in uncertain.items():
    print(f'  {k} : {v}')
