#!/usr/bin/env python3
"""build-greek-witness.py — the Greek witness of every NT verse, as Hebrew Strong's numbers (2026-10-30).

fieldy: tokens "correct enough to be called consistent with other sources of the same texts" (open sources only).
  sources/abbott-smith.tei.xml  Abbott-Smith, Manual Greek Lexicon of the NT (1922) — PUBLIC DOMAIN
                                (github.com/translatable-exegetical-tools/Abbott-Smith): every entry's Greek Strong's and
                                the LXX Hebrew words it renders, with Hebrew Strong's.
  morph-grc.db                  the NT's Greek words with their Strong's (RP Byzantine, see build-morph-grc.py)
Writes greek-witness.json: {"g2h": {G: [H…]}, "verses": {"canon|ch|v": [[relpos, [H…]], …]}} — for each NT verse, the Hebrew numbers
its Greek words are LXX equivalents of. Read by build-surface-index.js (Greek witness in heb-align's judge).
Baked offline; nothing at request time. Run:  python build-greek-witness.py
"""
import json, os, re, sqlite3, collections
HERE = os.path.dirname(os.path.abspath(__file__))
AS = os.path.join(HERE, 'sources', 'abbott-smith.tei.xml')
MG = os.path.join(HERE, 'morph-grc.db')
x = open(AS, encoding='utf8').read()
g2h = collections.defaultdict(set)
for g, body in re.findall(r'<entry n="[^"|]*\|(G\d+)"[^>]*>(.*?)</entry>', x, re.S):
    for h in re.findall(r'xml:lang="heb"\s+n="(H\d+[a-z]?)"', body):
        g2h[g].add(h)
db = sqlite3.connect(f'file:{MG}?immutable=1', uri=True)
# per verse, in Greek word order: [relative position 0..1, [H…]] for every Greek word with an equivalent —
# the position lets a Hebrew word be judged only by the Greek word standing where it stands (a verse almost always
# holds SOME μετά / οὐ / θεός; the bag of the whole verse switched 𐤀𐤕 object-marker to "with", 2026-10-30)
rows = collections.defaultdict(list)
for c, ch, v, w, s in db.execute('SELECT canon_id, ch, v, w, strongs FROM words ORDER BY canon_id, ch, v, w'):
    rows[f'{c}|{ch}|{v}'].append(s or '')
verses = {}
nw = hit = 0
for k, ws in rows.items():
    n = len(ws); out = []
    for i, s in enumerate(ws):
        nw += 1
        hs = set()
        for g in re.findall(r'G\d+', s):
            hs |= g2h.get('G' + str(int(g[1:])), set())
        if hs: out.append([round(i / max(1, n - 1), 3), sorted(hs)]); hit += 1
    if out: verses[k] = out
out = {'_note': 'build-greek-witness.py — Abbott-Smith (public domain) LXX equivalents x morph-grc.db Greek NT. Do not edit.',
       'g2h': {g: sorted(h) for g, h in sorted(g2h.items())},
       'verses': verses}
json.dump(out, open(os.path.join(HERE, 'greek-witness.json'), 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
print(f'greek-witness.json: {len(g2h):,} Greek words with Hebrew equivalents ({sum(len(v) for v in g2h.values()):,} pairs); '
      f'{len(verses):,} NT verses, {hit:,} of {nw:,} Greek words carry an equivalent')
