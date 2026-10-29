#!/usr/bin/env python3
"""
build-compare-versions.py — OWNER-ONLY English comparison texts for Translation Studio.

fieldy, 2026-10-29: "a few english versions for verification -- all hidden from users ...
every version better say the same things in general because it is translating from a
source that they did not create. I dont want my text to be in the category of those that
mistranslate" / "in translation studio i can see whats written in the different versions".

PUBLIC-DOMAIN texts only (scrollmapper/bible_databases, formats/json). NKJV / NLV are
under copyright and are NOT stored — the Studio panel links to them on BibleGateway.

  KJVA   King James Version 1769, with the Apocrypha
  ASV    American Standard Version 1901
  YLT    Young's Literal Translation 1898
  Darby  Darby Bible 1889
  DRC    Douay-Rheims, Challoner revision (deuterocanon; Vulgate numbering -> aligned)
  BBE    Bible in Basic English 1949/1964
  JPS    Jewish Publication Society 1917 (Tanakh; Hebrew numbering -> aligned)
  BSB    Berean Standard Bible (dedicated to the public domain 2023)

Keys are the app's own (canon_id, chapter, verse) in KJV/WEB numbering — the numbering
the reader and corpus.db ENG use. KJVA is the spine. A version whose chapter has the same
verse count as KJV's is taken as numbered alike; JPS and DRC are aligned verse by verse to
the KJV text (content-word overlap, same book, chapter ±1, verse ±4), and a verse with no
confident match is left out rather than shown under the wrong number.

Output: server/versions.db (gitignored, lives on the volume like precepts.db). Nothing that
serves public pages reads it; server.js serves it only under /api/admin (owner session).

USAGE  python build-compare-versions.py <dir with the *.json files> [out.db]
"""
import json, os, re, sqlite3, sys, unicodedata

SRC = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'server', 'versions.db')

VERSIONS = [
    # id, file, label, year, note
    ('KJV',   'KJVA',  'King James Version',            '1769', 'with the Apocrypha'),
    ('ASV',   'ASV',   'American Standard Version',     '1901', ''),
    ('YLT',   'YLT',   "Young's Literal Translation",   '1898', 'very literal'),
    ('DARBY', 'Darby', 'Darby Bible',                   '1889', ''),
    ('DRC',   'DRC',   'Douay-Rheims (Challoner)',      '1752', 'from the Latin Vulgate; renumbered to KJV verses'),
    ('JPS',   'JPS',   'JPS Tanakh',                    '1917', 'Jewish translation of the Hebrew; this edition writes HaShem and G-d; renumbered to KJV verses'),
    ('BBE',   'BBE',   'Bible in Basic English',        '1965', 'plain, limited vocabulary'),
    ('BSB',   'BSB',   'Berean Standard Bible',         '2023', 'modern; public domain'),
]
ALIGN = {'DRC', 'JPS'}
# The Douay Tobit and Judith follow the Vulgate — a different, shorter form of those books
# than the Greek behind the KJV, so their verses do not pair; left out. Elsewhere in the
# Apocrypha a DRC verse needs a closer match.
SKIP = {('DRC', 72), ('DRC', 73)}
FLOOR = {'DRC': lambda cid: 0.30 if cid > 66 else 0.18}

OT = ['Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth','I Samuel','II Samuel',
      'I Kings','II Kings','I Chronicles','II Chronicles','Ezra','Nehemiah','Esther','Job','Psalms','Proverbs',
      'Ecclesiastes','Song of Solomon','Isaiah','Jeremiah','Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos',
      'Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah','Haggai','Zechariah','Malachi']
NT = ['Matthew','Mark','Luke','John','Acts','Romans','I Corinthians','II Corinthians','Galatians','Ephesians',
      'Philippians','Colossians','I Thessalonians','II Thessalonians','I Timothy','II Timothy','Titus','Philemon',
      'Hebrews','James','I Peter','II Peter','I John','II John','III John','Jude','Revelation of John']
CANON = {n: i + 1 for i, n in enumerate(OT)}
CANON.update({n: 40 + i for i, n in enumerate(NT)})
# the app's canon ids for the Apocrypha (corpus.db ENG)
CANON.update({'I Maccabees': 69, 'Sirach': 70, 'Wisdom': 71, 'Tobit': 72, 'Judith': 73, 'Baruch': 74,
              'II Maccabees': 76, 'Susanna': 79, 'Bel and the Dragon': 80, 'I Esdras': 81,
              'Prayer of Manasses': 84, 'II Esdras': 139, 'Prayer of Azariah': 148, 'Additions to Esther': 154})
# not in the app: Laodiceans, the Additional Psalm (151) — skipped

HEB = re.compile('[\u0590-\u05FF\uFB1D-\uFB4F]')   # Rule Zero: no square script anywhere on the site
def clean(t):
    t = unicodedata.normalize('NFC', t or '')
    t = re.sub(r'<[^>]+>', '', t)            # any stray markup
    t = re.sub(r'\s+', ' ', t).strip()
    if HEB.search(t):
        t = HEB.sub('', t).strip()
    return t

def load(fn):
    d = json.load(open(os.path.join(SRC, fn + '.json'), encoding='utf8'))
    out = {}
    for b in d['books']:
        cid = CANON.get(b['name'])
        if not cid: continue
        for c in b['chapters']:
            for v in c['verses']:
                t = clean(v.get('text', ''))
                if t: out[(cid, int(c['chapter']), int(v['verse']))] = t
    return out

STOP = set('''a an the and of to in on at by for with from as is be are was were it its this that these those he she they
we you ye thee thou thy thine me my his her their our your him them us i not no shall will unto upon which who whom
what all so but or if then there when have has had do did said say saith also into out up one''' .split())
def words(t):
    return {w for w in re.findall(r"[a-z]+", t.lower()) if w not in STOP and len(w) > 2}

def align(kjv, other, min_score=None):
    """Map each KJV verse to the other version's verse(s) that say the same thing.
    Candidates: the same chapter (verse ±4) and the whole of the chapters either side
    (Mal 4:1 = Hebrew 3:19; the Vulgate's Psalms run one behind); a run of 1-3 consecutive
    verses (KJV Ps 51:1 = superscription + 'Have mercy' = Hebrew 51:1-3). Score = Jaccard of
    content words; same number +0.05, same chapter +0.03, each extra verse in a run -0.02.
    Below 0.18 the verse is left out rather than shown under the wrong number."""
    by_book = {}
    for k, t in other.items(): by_book.setdefault(k[0], {}).setdefault(k[1], {})[k[2]] = (t, words(t))
    res = {}
    for k, kt in sorted(kjv.items()):
        cid, ch, vs = k
        book = by_book.get(cid)
        if not book: continue
        kw = words(kt)
        if not kw: continue
        best, bs = None, 0.0
        for dc in (0, -1, 1):
            chap = book.get(ch + dc)
            if not chap: continue
            starts = [v for v in chap if abs(v - vs) <= 4] if dc == 0 else list(chap)
            for v0 in starts:
                txt, ow = [], set()
                for n in range(3):
                    if v0 + n not in chap: break
                    t, w = chap[v0 + n]
                    txt.append(t); ow = ow | w
                    if not ow: continue
                    s = len(kw & ow) / len(kw | ow) - 0.02 * n
                    if dc == 0: s += 0.03
                    if dc == 0 and v0 == vs and n == 0: s += 0.05
                    if s > bs: best, bs = ' '.join(txt), s
        floor = (min_score(cid) if min_score else 0.18)
        if best and bs >= floor:
            res[k] = best
    return res

def main():
    kjv = load('KJVA')
    con = sqlite3.connect(OUT + '.tmp') if True else None
    con.executescript('''
      DROP TABLE IF EXISTS versions; DROP TABLE IF EXISTS verses;
      CREATE TABLE versions (id TEXT PRIMARY KEY, label TEXT, year TEXT, note TEXT, ord INTEGER, n INTEGER);
      CREATE TABLE verses (version TEXT, canon_id INTEGER, chapter INTEGER, verse INTEGER, text TEXT,
                           PRIMARY KEY (canon_id, chapter, verse, version)) WITHOUT ROWID;''')
    kjv_ch = {}
    for (c, ch, v) in kjv: kjv_ch[(c, ch)] = kjv_ch.get((c, ch), 0) + 1
    for ord_, (vid, fn, label, year, note) in enumerate(VERSIONS):
        data = kjv if vid == 'KJV' else load(fn)
        data = {k: t for k, t in data.items() if (vid, k[0]) not in SKIP}
        if vid in ALIGN:
            rows = align(kjv, data, FLOOR.get(vid))
        else:
            # trust the numbering chapter by chapter only where the verse count agrees with KJV
            o_ch = {}
            for (c, ch, v) in data: o_ch[(c, ch)] = o_ch.get((c, ch), 0) + 1
            rows = {k: t for k, t in data.items() if vid == 'KJV' or o_ch.get(k[:2]) == kjv_ch.get(k[:2])}
            bad = sorted({k[:2] for k in data if vid != 'KJV' and o_ch.get(k[:2]) != kjv_ch.get(k[:2])})
            if bad:
                ali = align({k: t for k, t in kjv.items() if k[:2] in set(bad)}, data)
                rows.update(ali)
                print(f'  {vid}: {len(bad)} chapters numbered differently from KJV -> aligned ({len(ali)} verses)')
        con.executemany('INSERT OR REPLACE INTO verses VALUES (?,?,?,?,?)',
                        [(vid, c, ch, v, t) for (c, ch, v), t in rows.items()])
        con.execute('INSERT INTO versions VALUES (?,?,?,?,?,?)', (vid, label, year, note, ord_, len(rows)))
        print(f'{vid:6} {len(rows):6} verses  (source {len(data)})')
    con.commit()
    con.execute('VACUUM'); con.close()
    os.replace(OUT + '.tmp', OUT)
    print('wrote', OUT)

if __name__ == '__main__':
    main()
