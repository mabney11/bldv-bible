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

def full_parts(word, cs):
    """The word as the reader draws it: every component letter in order, each marked
    written (in the scroll) or added (a root letter the scribe left out, restored by the
    no-eliding rule). A synthesized chip with no written letter at all (the 3ms perfect 𐤉)
    is left out: it is not a letter of the word."""
    L = list(word); i = 0; out = []
    for cpt in cs:
        css = cpt.get('css') or 'root'
        if len(cs) == 1 or css == 'mod-advb':
            css = 'mod-nmpr' if css == 'mod-nmpr' else 'root'
        label = (cpt.get('translation') or '').strip()
        letters = list(cpt.get('paleo', ''))
        hits = []
        j = i
        for ch in letters:
            if j < len(L) and L[j] == ch: hits.append(True); j += 1
            else: hits.append(False)
        if not any(hits):
            continue
        first = True
        for ch, w in zip(letters, hits):
            out.append({'l': ch, 'css': css, 'label': label, 'written': w, 'start': first})
            first = False
        i = j
    assert i == len(L), (word, cs)
    return out

# Genesis 2:4, word by word as the reader joins them (proclitics onto their word).
GEN_2_4 = [('𐤀𐤋𐤄', [1]), ('𐤕𐤅𐤋𐤃𐤅𐤕', [2]), ('𐤄𐤔𐤌𐤉𐤌', [3, 4]), ('𐤅𐤄𐤀𐤓𐤑', [5, 6, 7]), ('𐤁𐤄𐤁𐤓𐤀𐤌', [8, 9]),
           ('𐤁𐤉𐤅𐤌', [10, 11]), ('𐤏𐤔𐤅𐤕', [12]), ('𐤉𐤄𐤅𐤄', [13]), ('𐤀𐤋𐤄𐤉𐤌', [14]), ('𐤀𐤓𐤑', [15]), ('𐤅𐤔𐤌𐤉𐤌', [16, 17])]

res = {}
for w, o in [('𐤁𐤓𐤀𐤔𐤉𐤕', [1, 2]), ('𐤁𐤓𐤀', [3]), ('𐤀𐤋𐤄𐤉𐤌', [4]), ('𐤀𐤕', [5]), ('𐤄𐤔𐤌𐤉𐤌', [6, 7]), ('𐤅𐤀𐤕', [8, 9]), ('𐤄𐤀𐤓𐤑', [10, 11])]:
    res[w] = roles(w, from_verse(1, 1, 1, o))
for w, o in [('𐤅𐤕𐤀𐤌𐤓', [7, 8]), ('𐤏𐤅𐤃', [3]), ('𐤉𐤄𐤅𐤄', [14]), ('𐤔𐤌𐤅', [19]), ('𐤉𐤄𐤅𐤃𐤄', [20])]:
    res[w] = roles(w, from_verse(1, 29, 35, o))
res['𐤅𐤉𐤀𐤌𐤓'] = roles('𐤅𐤉𐤀𐤌𐤓', from_verse(1, 44, 18, [5, 6]))
for w in ['𐤃𐤅𐤃', '𐤔𐤋𐤅𐤌', '𐤉𐤓𐤅𐤔𐤋𐤌', '𐤌𐤔𐤄', '𐤉𐤏𐤒𐤁', '𐤔𐤁𐤕', '𐤀𐤋𐤄𐤉𐤌']:
    res[w] = roles(w, bare(w))
res['_sample'] = [{'paleo': w, 'parts': full_parts(w, from_verse(1, 2, 4, o))} for w, o in GEN_2_4]
with open(os.path.join(HERE, 'paleo-hebrew-bible-morph.json'), 'w', encoding='utf-8') as f:
    json.dump(res, f, ensure_ascii=False, indent=1)
for x in res['_sample']:
    print(x['paleo'], ' '.join(('' if p['written'] else '+') + p['l'] + ':' + p['css'] for p in x['parts']))
