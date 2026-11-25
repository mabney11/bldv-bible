"""Writes scripts/paleo-hebrew-bible-morph.json: for each example word on the
/paleo-hebrew-bible page, the reader's own morpheme class (css) and label for every
letter, read from surface-index.db + corpus.db (the same components the Paleo Hebrew
reader draws). Run it again if the reader's parse of these words changes, then
node scripts/build-paleo-hebrew-bible-page.mjs.
"""
import sqlite3, json, os
HERE = os.path.dirname(os.path.abspath(__file__))
SRV = os.path.join(HERE, '..', 'server')
c = sqlite3.connect(f"file:{SRV}/surface-index.db?immutable=1", uri=True)
cc = sqlite3.connect(f"file:{SRV}/corpus.db?immutable=1", uri=True)

def comps(w, sn, pos, m):
    r = c.execute("select components from token_surfaces where source='BHS' and word_raw=? and strongs=? and pos=? and morph=?", (w, sn, pos, m)).fetchone()
    return json.loads(r[0])

def from_verse(b, ch, v, ords):
    out = []
    for o in ords:
        w, sn, pos, m = cc.execute("select word_raw,strongs,pos,morph from tokens_bhs where book_id=? and chapter=? and verse=? and token_ordinal=?", (b, ch, v, o)).fetchone()
        out += comps(w, sn, pos, m)
    return out

def bare(w):
    sn, pos, m, _ = cc.execute("select strongs,pos,morph,count(*) n from tokens_bhs where word_raw=? group by 1,2,3 order by n desc limit 1", (w,)).fetchone()
    return comps(w, sn, pos, m)

def roles(word, cs):
    """css + label per WRITTEN letter. A letter a component restores (not written) or a
    synthesized chip (the 3ms perfect 𐤉) has no written letter, so it is skipped here."""
    L = list(word); out = [None] * len(L); i = 0
    for cpt in cs:
        css = cpt.get('css') or 'root'
        if len(cs) == 1 or css == 'mod-advb':
            css = 'mod-nmpr' if css == 'mod-nmpr' else 'root'
        label = (cpt.get('translation') or '').strip()
        for ch in cpt.get('paleo', ''):
            if i < len(L) and L[i] == ch:
                out[i] = [css, label]; i += 1
    assert i == len(L) and None not in out, (word, cs, out)
    return out

res = {}
for w, o in [('𐤁𐤓𐤀𐤔𐤉𐤕', [1, 2]), ('𐤁𐤓𐤀', [3]), ('𐤀𐤋𐤄𐤉𐤌', [4]), ('𐤀𐤕', [5]), ('𐤄𐤔𐤌𐤉𐤌', [6, 7]), ('𐤅𐤀𐤕', [8, 9]), ('𐤄𐤀𐤓𐤑', [10, 11])]:
    res[w] = roles(w, from_verse(1, 1, 1, o))
for w, o in [('𐤅𐤕𐤀𐤌𐤓', [7, 8]), ('𐤏𐤅𐤃', [3]), ('𐤉𐤄𐤅𐤄', [14]), ('𐤔𐤌𐤅', [19]), ('𐤉𐤄𐤅𐤃𐤄', [20])]:
    res[w] = roles(w, from_verse(1, 29, 35, o))
res['𐤅𐤉𐤀𐤌𐤓'] = roles('𐤅𐤉𐤀𐤌𐤓', from_verse(1, 44, 18, [5, 6]))
for w in ['𐤃𐤅𐤃', '𐤔𐤋𐤅𐤌', '𐤉𐤓𐤅𐤔𐤋𐤌', '𐤌𐤔𐤄', '𐤉𐤏𐤒𐤁', '𐤔𐤁𐤕', '𐤀𐤋𐤄𐤉𐤌']:
    res[w] = roles(w, bare(w))
with open(os.path.join(HERE, 'paleo-hebrew-bible-morph.json'), 'w', encoding='utf-8') as f:
    json.dump(res, f, ensure_ascii=False, indent=1)
for w, r in res.items():
    print(w, ' '.join(f"{x[0]}:{x[1]}" for x in r))
