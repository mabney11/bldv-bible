#!/usr/bin/env python3
"""
remap-maqaf-ordinals.py — one-time migration for the 2026-09-30 maqaf tokenisation fix.

WHY: heb-align.js used to tokenise the HEB edition from verses.text_paleo, which was
ingested with every maqaf DELETED (בֶּן־הָאָדָם -> one word 𐤁𐤍𐤄𐤀𐤃𐤌). It now splits at
the maqaf (from verses.text, which kept the boundary), exactly like BHS. In every verse
that had a fused pair, every token AFTER the pair moves to a higher token_ordinal, so
anything keyed "book:chapter:verse:token_ordinal" would silently point at the wrong word.

WHAT IT DOES (dry run by default; --apply writes, keeping a .bak-maqaf copy):
  lexicon/strongs-location-overrides.json   keys  canon:ch:v:ord
  lexicon/heb-occurrence-overrides.json     keys  canon|ch|v|ord
  - a key on a token that was NOT fused, but moved  -> re-keyed to its new ordinal
  - a key on a FUSED token (now two or more words)  -> retired: moved, verbatim, under
    "_retired_maqaf_2026-09-30" in the same file with the new ordinals it became.
    These are the hand patches for the fused-word bug itself (Ben+HaElohim etc.);
    each half now resolves on its own, so re-applying one would stamp a compound
    Strong's onto a single half.
  - keys in verses with no fused pair are untouched.
Refuses to run twice (writes "_maqaf_remap_applied" into each file).

Run from server/:  python remap-maqaf-ordinals.py            (report)
                   python remap-maqaf-ordinals.py --apply    (write)
Run it BEFORE `node build-surface-index.js` — the bake reads heb-occurrence-overrides.
"""
import json, re, shutil, sqlite3, sys, os

APPLY = '--apply' in sys.argv
HERE = os.path.dirname(os.path.abspath(__file__))
STAMP = '2026-09-30'
M = dict(zip('אבגדהוזחטיכךלמםנןסעפףצץקרשת', '𐤀𐤁𐤂𐤃𐤄𐤅𐤆𐤇𐤈𐤉𐤊𐤊𐤋𐤌𐤌𐤍𐤍𐤎𐤏𐤐𐤐𐤑𐤑𐤒𐤓𐤔𐤕'))

def to_paleo(w):
    return ''.join(c if '\U00010900' <= c <= '\U00010915' else M.get(c, '') for c in w)

def split_words(t):  # mirror of heb-align.js splitWords()
    return [x for x in (to_paleo(w) for w in re.split(r'\s+', (t or '').replace('־', ' '))) if x]

db = sqlite3.connect(f'file:{os.path.join(HERE, "corpus.db")}?mode=ro', uri=True)
remap = {}   # (canon, ch, v) -> {old_ord: [new_ords], ...}, plus words for reporting
words = {}
for canon, ch, v, text, tp in db.execute(
        "SELECT canon_id, ord_c, ord_v, text, text_paleo FROM verses "
        "WHERE corpus='HEB' AND text_paleo IS NOT NULL AND text_paleo != '' AND canon_id IS NOT NULL"):
    a, b = split_words(tp), split_words(text)
    if not (len(b) > len(a) and ''.join(a) == ''.join(b)):
        continue  # same rule as wordsOf(): only when text spells the same letters
    m, j = {}, 0
    for i, w in enumerate(a):
        s, start = '', j
        while j < len(b) and len(s) < len(w):
            s += b[j]; j += 1
        if s != w:
            m = None; break
        m[i + 1] = list(range(start + 1, j + 1))
    if m:
        remap[(canon, ch, v)] = m
        words[(canon, ch, v)] = (a, b)
print(f'verses whose tokenisation changes: {len(remap):,}')

def migrate(fname, sep):
    path = os.path.join(HERE, 'lexicon', fname)
    data = json.load(open(path, encoding='utf-8'))
    if data.get('_maqaf_remap_applied'):
        print(f'\n{fname}: already migrated on {data["_maqaf_remap_applied"]} — skipping')
        return
    out, retired, moved, kept = {}, {}, 0, 0
    for k, val in data.items():
        if k.startswith('_'):
            out[k] = val; continue
        parts = k.split(sep)
        try:
            canon, ch, v, o = (int(x) for x in parts)
        except ValueError:
            out[k] = val; continue
        m = remap.get((canon, ch, v))
        if not m or o not in m:
            out[k] = val; kept += 1; continue
        new = m[o]
        a, b = words[(canon, ch, v)]
        if len(new) == 1:
            nk = sep.join(map(str, (canon, ch, v, new[0])))
            if nk != k:
                moved += 1
                print(f'  re-key  {k} -> {nk}   {a[o-1]}')
            out[nk] = val
        else:
            halves = ' + '.join(b[n - 1] for n in new)
            print(f'  retire  {k}   {a[o-1]}  ->  now {halves} (ordinals {new[0]}-{new[-1]})')
            retired[k] = {'value': val, 'became': [sep.join(map(str, (canon, ch, v, n))) for n in new],
                          'words': [b[n - 1] for n in new]}
    print(f'\n{fname}: {kept} untouched, {moved} re-keyed, {len(retired)} retired')
    if APPLY:
        shutil.copyfile(path, path + '.bak-maqaf')
        out['_maqaf_remap_applied'] = STAMP
        if retired:
            prev = data.get(f'_retired_maqaf_{STAMP}', {})
            prev.update(retired)
            out[f'_retired_maqaf_{STAMP}'] = prev
        json.dump(out, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        open(path, 'a', encoding='utf-8').write('\n')
        print(f'  written (backup: {fname}.bak-maqaf)')

migrate('strongs-location-overrides.json', ':')
migrate('heb-occurrence-overrides.json', '|')
if not APPLY:
    print('\nDry run. Re-run with --apply to write.')
