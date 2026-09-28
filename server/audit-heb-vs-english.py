#!/usr/bin/env python3
"""
audit-heb-vs-english.py — does each NT/Apocrypha Hebrew word's reading agree with the
English translation of the SAME verse?

WHY. The HEB-edition Hebrew for canon 40+ has NO tagging of its own. tokens_nt is only
a projection of surface-index.db (every row: source_id PROJECTED-FROM-SURFACE-INDEX).
Every Strong's number there was inferred by matching the SPELLING against words the OT
attests, so a spelling can land on the wrong OT word and nothing downstream notices:
𐤁𐤏𐤕𐤄 be'itah "in its time" matched H1205 be'atah "terror"; 𐤏𐤉𐤓𐤌 "their city" matched
H5903 "nakedness"; 𐤀𐤎𐤐 "gather" matched Asaph. The verse's English is the one
independent witness we have.

HOW. For each Strong's number, its English PROFILE = the words the WEB itself uses to
translate it in the OT (web-strongs.jsonl segments; a stem counts if it appears in
>=12% of that SN's segments). The NT/Apocrypha English is the WEB too (Josephus etc.
are older English but share the vocabulary), so "does this verse's English contain the
profile" is a direct test. Each score is compared with the profile's BASE RATE over
random verses, so common words ("went", "people") don't win by chance.

For every (written word, chosen SN) with >= --min-occ occurrences, every OTHER reading
the same spelling supports (token_surfaces rows of that word_raw, both editions, plus
all_strongs) is scored over the SAME verses.

  A  likely wrong reading — an alternative agrees with the English far better.
     High-confidence rows are written to lexicon/heb-context-readings.json (with
     --write), which build-surface-index.js applies PER OCCURRENCE: the switch happens
     unless that verse's English supports the original reading and not the new one.
     Delete an entry to veto it.
  B  chosen reading ~never matches the English and nothing better is on offer
     (review list: idioms, paraphrase, or a reading resolveAll never proposed)
  C  split words ending in a bare 𐤄 read as [Toward]

USAGE  (device sandbox: prefix with SQLITE_TMPDIR=/tmp)
  python audit-heb-vs-english.py [--write] [--min-occ 3] [--out heb-english-audit.txt]
"""
import sqlite3, json, re, os, random, collections, argparse

ap = argparse.ArgumentParser()
ap.add_argument('--min-occ', type=int, default=3)
ap.add_argument('--canon-min', type=int, default=40)
ap.add_argument('--out', default='heb-english-audit.txt')
ap.add_argument('--index', default=None, help='surface-index.db to audit (default ./surface-index.db)')
ap.add_argument('--write', action='store_true', help='write lexicon/heb-context-readings.json')
a = ap.parse_args()
here = os.path.dirname(os.path.abspath(__file__))

STOP = set('''a an the and of to in on at by for with from as is be are was were it its this that these those
he she they we you me my his her their our your him them us one ones thing things idiom phrase especially etc used
use shall will would should may might can could have has had did does do being been am'''.split())

# must stay identical to stemWord() in heb-align.js
SUFS = ('ings', 'ing', 'edly', 'ed', 'es', 's', 'ly', 'ness', 'ment')
def stem(w):
    w = w.lower()
    for suf in SUFS:
        if len(w) > len(suf) + 3 and w.endswith(suf):
            w = w[:-len(suf)]
            break
    return w[:6]
WORD = re.compile(r"[A-Za-z]{2,}")

strongs = json.load(open(os.path.join(here, 'strongs-hebrew-expanded.json'), encoding='utf8'))
def gl(sn):
    e = strongs.get(sn) or {}
    return (e.get('strongs_def') or e.get('kjv_def') or '')[:40]
def isname(sn):
    d = (strongs.get(sn) or {}).get('strongs_def', '')
    return bool(d[:1].isupper())

# ── English profile per SN, from the WEB's own OT translation choices ─────────────
cnt = collections.defaultdict(collections.Counter)
segs = collections.Counter()
for line in open(os.path.join(here, 'web-strongs.jsonl'), encoding='utf8'):
    d = json.loads(line)
    for s in d.get('segments') or []:
        sn = s.get('sn')
        if not sn:
            continue
        segs[sn] += 1
        for st in {stem(w) for w in WORD.findall(s.get('text') or '') if w.lower() not in STOP}:
            cnt[sn][st] += 1
PROF = {sn: {k for k, v in c.items() if v >= max(2, 0.12 * segs[sn])} for sn, c in cnt.items()}

# ── the English of every verse ────────────────────────────────────────────────────
cdb = sqlite3.connect('file:' + os.path.join(here, 'corpus.db') + '?mode=ro', uri=True)
cdb.execute('pragma temp_store=memory')
ENG = {}
for cid, ch, v, t in cdb.execute(
        "SELECT canon_id, chapter, verse, text FROM verses WHERE corpus='ENG' AND canon_id >= ?", (a.canon_min,)):
    try:
        ENG[(cid, int(ch), int(v))] = t or ''
    except (TypeError, ValueError):
        pass
def vtext(L):
    t = ENG.get(L)
    if t:
        return t
    return ' '.join(ENG.get((L[0], L[1], x), '') for x in (L[2] - 1, L[2] + 1))   # versification drift
VS = {}
def vst(L):
    if L not in VS:
        VS[L] = {stem(w) for w in WORD.findall(vtext(L))}
    return VS[L]
random.seed(1)
SAMPLE = random.sample(list(ENG.keys()), min(3000, len(ENG)))
BASE = {}
def base(sn):
    if sn not in BASE:
        k = PROF.get(sn)
        BASE[sn] = sum(1 for L in SAMPLE if k & vst(L)) / len(SAMPLE) if k else 1.0
    return BASE[sn]
def agree(sn, locs):
    k = PROF.get(sn)
    return sum(1 for L in locs if k & vst(L)) / len(locs) if k else None

# ── what the index says ───────────────────────────────────────────────────────────
sdb = sqlite3.connect('file:' + (a.index or os.path.join(here, 'surface-index.db')) + '?mode=ro', uri=True)
sdb.execute('pragma temp_store=memory')
H = lambda s: 'H' + str(s).lstrip('Hh')
occ = collections.defaultdict(list)
for w, sn, b, ch, v in sdb.execute(
        "SELECT word_raw, strongs, book_id, chapter, verse FROM surface_occurrences WHERE source='HEB' AND book_id >= ?",
        (a.canon_min,)):
    if sn:
        occ[(w, H(sn))].append((b, ch, v))
alts = collections.defaultdict(set)
heb_comps = {}
heb_all = {}          # every SN the chosen reading already shows (compounds: 𐤌𐤄+𐤆𐤄)
for src, w, sn, alls, comps in sdb.execute(
        "SELECT source, word_raw, strongs, all_strongs, components FROM token_surfaces"):
    s = {H(sn)} if sn else set()
    try:
        s |= {H(x) for x in json.loads(alls or '[]')}
    except ValueError:
        pass
    alts[w] |= {x for x in s if x in strongs}
    if src == 'HEB' and sn:
        heb_comps[(w, H(sn))] = comps
        heb_all[(w, H(sn))] = heb_all.get((w, H(sn)), set()) | s

# Names: the NT/Apocrypha English carries them TRANSLITERATED by the name map
# (Boaz -> Baiz), independently of the index, so a name's profile also gets its own
# transliteration(s) — otherwise every genuine name would look unsupported.
for (comps,) in sdb.execute("SELECT components FROM token_surfaces"):
    try:
        cl = json.loads(comps or '[]')
    except ValueError:
        continue
    for c in cl:
        sn = c.get('sn')
        if not sn or not c.get('lemmaTranslit'):
            continue
        sn = H(sn)
        if not isname(sn):
            continue
        for t in (c.get('lemmaTranslit'), c.get('translit')):
            if t and len(t) >= 2:
                PROF.setdefault(sn, set()).add(stem(re.sub('[^A-Za-z]', '', t)))
BASE.clear()

# ── A / B ─────────────────────────────────────────────────────────────────────────
A, B = [], []
for (w, sn), locs in occ.items():
    n = len(locs)
    if n < a.min_occ or not PROF.get(sn):
        continue
    if base(sn) >= 0.25:          # function words / everyday verbs: English can't judge them
        continue
    a0 = agree(sn, locs)
    lift0 = a0 - base(sn)
    best = None
    for s in alts.get(w, ()):
        if s == sn or s in heb_all.get((w, sn), ()) or isname(s) or not PROF.get(s) or base(s) >= 0.5:
            continue
        a1 = agree(s, locs)
        l1 = a1 - base(s)
        if l1 >= 0.3 and l1 - lift0 >= 0.3 and (best is None or l1 > best[1]):
            best = (s, l1, a1)
    if best:
        conf = 'high' if (best[2] >= 0.5 and best[1] - lift0 >= 0.35) else 'review'
        A.append(dict(word=w, frm=sn, to=best[0], n=n, a0=a0, a1=best[2], gap=best[1] - lift0, conf=conf, locs=locs[:4]))
    elif a0 <= 0.05 and base(sn) > 0 and not isname(sn):
        # base 0 = the NT English never uses this vocabulary (transliterated names,
        # Alahayam, archaic KJV-only words): the English cannot judge it
        B.append(dict(word=w, frm=sn, n=n, a0=a0, locs=locs[:4]))
A.sort(key=lambda r: -r['gap'] * r['n'])
B.sort(key=lambda r: -r['n'])

# ── C: bare-𐤄 [Toward] tails vs possessive English ──────────────────────────────────
HE = '\U00010904'
POSS = re.compile(r"\b(its|her|hers)\b", re.I)
C = []
for (w, sn), locs in occ.items():
    try:
        cl = json.loads(heb_comps.get((w, sn)) or '[]')
    except ValueError:
        continue
    if cl and cl[-1].get('paleo') == HE and cl[-1].get('css') == 'uvf-dir':
        C.append((w, sn, len(locs), sum(1 for L in locs if POSS.search(vtext(L))) / len(locs), locs[:4]))
C.sort(key=lambda r: -r[2] * r[3])

refs = lambda L: ' '.join(f'{x}:{y}:{z}' for x, y, z in L)
with open(os.path.join(here, a.out), 'w', encoding='utf8') as f:
    f.write(f'# HEB-edition readings (canon >= {a.canon_min}) vs the English of the same verse\n')
    f.write('# agree = share of the word\'s verses whose English uses the WEB\'s own words for that SN\n\n')
    hi = [r for r in A if r['conf'] == 'high']
    f.write(f'## A. LIKELY WRONG READING ({len(A)} words, {sum(r["n"] for r in A)} occ; {len(hi)} high-confidence)\n')
    f.write('conf\tocc\tword\tchosen (agree)\t-> better (agree)\tbetter reads as\tsample refs canon:ch:v\n')
    for r in A:
        f.write(f'{r["conf"]}\t{r["n"]}\t{r["word"]}\t{r["frm"]} {gl(r["frm"])} ({r["a0"]:.0%})\t-> {r["to"]} {gl(r["to"])} '
                f'({r["a1"]:.0%})\t{",".join(sorted(PROF[r["to"]])[:5])}\t{refs(r["locs"])}\n')
    f.write(f'\n## B. CHOSEN READING NEVER MATCHES THE ENGLISH, no better reading on offer ({len(B)} words, {sum(r["n"] for r in B)} occ)\n')
    f.write('#   idioms/paraphrase, or a reading resolveAll never proposed: review, not auto-fixed\n')
    for r in B:
        f.write(f'{r["n"]}\t{r["word"]}\t{r["frm"]} {gl(r["frm"])}\texpects {",".join(sorted(PROF[r["frm"]])[:5])}\t{refs(r["locs"])}\n')
    f.write(f'\n## C. SPLIT WORDS STILL READING A BARE 𐤄 AS [Toward] ({len(C)} words); share of their verses with its/her in the English\n')
    for w, sn, n, p, L in C:
        f.write(f'{n}\t{w}\t{sn} {gl(sn)}\tits/her {p:.0%}\t{refs(L)}\n')

if a.write:
    out = {
        '_README': 'GENERATED by audit-heb-vs-english.py --write. HEB-edition (canon 40+) words whose '
                   'spelling-matched reading disagrees with the English of their verses while another '
                   'attested reading of the same spelling agrees. build-surface-index.js applies each entry '
                   'PER OCCURRENCE: the reading carrying `sn` is used unless that verse\'s English contains '
                   'the old reading\'s words (from_words) and none of the new one\'s (to_words). Evidence-gated: '
                   'only a reading resolveAll() itself proposes can be picked. Delete an entry to veto it; '
                   'regenerate after a rebuild with --write.',
    }
    for r in sorted((r for r in A if r['conf'] == 'high'), key=lambda r: r['word']):
        out[r['word']] = {
            'sn': r['to'], 'from': r['frm'],
            'to_words': sorted(PROF[r['to']]), 'from_words': sorted(PROF[r['frm']]),
            'from_agree': round(r['a0'], 3), 'to_agree': round(r['a1'], 3),
            'note': f'{gl(r["frm"])} ({r["a0"]:.0%}) -> {gl(r["to"])} ({r["a1"]:.0%}) over {r["n"]} occ',
        }
    p = os.path.join(here, 'lexicon', 'heb-context-readings.json')
    # merge: keep hand-kept entries for words this run did not flag (e.g. already fixed by them)
    try:
        old = json.load(open(p, encoding='utf8'))
        for k, v in old.items():
            if not k.startswith('_') and k not in out:
                out[k] = v
    except (OSError, ValueError):
        pass
    with open(p, 'w', encoding='utf8') as f:   # one entry per line: easy to review/delete
        f.write('{\n' + ',\n'.join(f'  {json.dumps(k, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)}'
                                    for k, v in out.items()) + '\n}\n')
    print('wrote', p, len(out) - 1, 'entries')

print(f'A likely wrong : {len(A)} words, {sum(r["n"] for r in A)} occ ({sum(1 for r in A if r["conf"]=="high")} high-confidence)')
print(f'B never matches: {len(B)} words, {sum(r["n"] for r in B)} occ')
print(f'C [Toward] 𐤄   : {len(C)} words, {sum(r[2] for r in C)} occ')
print('wrote', a.out)
