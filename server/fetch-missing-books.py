#!/usr/bin/env python3
"""
fetch-missing-books.py — fetch 3Mac, 4Mac, Letter of Jeremiah from Sefaria API,
and 1/2/3 Meqabyan from LPettay GitHub.

Run from paleo-studio/paleo-studio/server/:
  python ../fetch-missing-books.py --dry
  python ../fetch-missing-books.py
"""
import sqlite3, urllib.request, urllib.parse, json, sys, re, time
from collections import defaultdict

DRY = '--dry' in sys.argv

def fetch(url):
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (compatible)',
            'Accept': 'application/json, text/html'
        })
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.read().decode('utf-8')
    except Exception as e:
        print(f'    ! {url.split("/")[-1]}: {e}')
        return None

def clean(s):
    s = re.sub(r'<[^>]+>', '', str(s or ''))
    return re.sub(r'\s+', ' ', s).strip()

# ── Sefaria book fetcher ──────────────────────────────────────────────────────
def fetch_sefaria(ref, n_chapters, canon_id, code):
    rows = []
    # Method 1: full book
    data = fetch(f'https://www.sefaria.org/api/texts/{urllib.parse.quote(ref)}?lang=en&context=0&pad=0')
    if data:
        try:
            d = json.loads(data)
            text = d.get('text', [])
            if isinstance(text, str): text = [text]
            if text and isinstance(text[0], str): text = [text]   # single chapter
            for ci, chapter in enumerate(text):
                if isinstance(chapter, str): chapter = [chapter]
                for vi, verse in enumerate(chapter):
                    if isinstance(verse, list): verse = ' '.join(str(x) for x in verse)
                    t = clean(verse)
                    if t: rows.append((canon_id, code, ci+1, vi+1, t))
            if rows:
                print(f'  {code}: {len(rows)} verses (full book)')
                return rows
        except: pass

    # Method 2: chapter by chapter
    for ch in range(1, n_chapters + 1):
        data = fetch(f'https://www.sefaria.org/api/texts/{urllib.parse.quote(ref)}.{ch}?lang=en&context=0&pad=0')
        if not data: continue
        try:
            d = json.loads(data)
            text = d.get('text', [])
            if isinstance(text, str): text = [text]
            for vi, verse in enumerate(text):
                if isinstance(verse, list): verse = ' '.join(str(x) for x in verse)
                t = clean(verse)
                if t: rows.append((canon_id, code, ch, vi+1, t))
        except: pass
        time.sleep(0.2)
    if rows: print(f'  {code}: {len(rows)} verses (chapter-by-chapter)')
    return rows

# ── Books to fetch ────────────────────────────────────────────────────────────
SEFARIA_BOOKS = [
    # (canon_id, code, title, sefaria_ref, n_chapters)
    (75,  'LETTER_OF_JEREMIAH', 'Letter of Jeremiah', 'Letter of Jeremiah',  1),
    (77,  '3_MACCABEES',        '3 Maccabees',        'III Maccabees',        7),
    (78,  '4_MACCABEES',        '4 Maccabees',        'IV Maccabees',        18),
]

MEQABYAN_SOURCES = {
    '1_MEQABYAN': [
        'https://raw.githubusercontent.com/lpettay/ethiopian-bible/master/books/1Meqabyan.json',
        'https://raw.githubusercontent.com/lpettay/ethiopian-bible/master/books/1Meq.json',
        'https://raw.githubusercontent.com/scrollmapper/bible_databases_deuterocanonical/master/sources/en/1-meqabyan/1-meqabyan.json',
        'https://raw.githubusercontent.com/scrollmapper/bible_databases_deuterocanonical/master/sources/en/meqabyan-1/meqabyan-1.json',
    ],
    '2_MEQABYAN': [
        'https://raw.githubusercontent.com/lpettay/ethiopian-bible/master/books/2Meqabyan.json',
        'https://raw.githubusercontent.com/lpettay/ethiopian-bible/master/books/2Meq.json',
        'https://raw.githubusercontent.com/scrollmapper/bible_databases_deuterocanonical/master/sources/en/2-meqabyan/2-meqabyan.json',
    ],
    '3_MEQABYAN': [
        'https://raw.githubusercontent.com/lpettay/ethiopian-bible/master/books/3Meqabyan.json',
        'https://raw.githubusercontent.com/lpettay/ethiopian-bible/master/books/3Meq.json',
        'https://raw.githubusercontent.com/scrollmapper/bible_databases_deuterocanonical/master/sources/en/3-meqabyan/3-meqabyan.json',
    ],
}
MEQABYAN_CANON = {'1_MEQABYAN': 143, '2_MEQABYAN': 87, '3_MEQABYAN': 88}

def parse_meqabyan(d, canon_id, code):
    rows = []
    # various JSON structures from different sources
    if isinstance(d, list):
        chapters = d
    elif 'chapters' in d:
        chapters = d['chapters']
    elif 'books' in d and d['books']:
        chapters = d['books'][0].get('chapters', [])
    elif 'text' in d:
        text = d['text']
        if isinstance(text, list):
            if text and isinstance(text[0], str):
                text = [text]
            for ci, ch in enumerate(text):
                for vi, v in enumerate(ch if isinstance(ch, list) else [ch]):
                    t = clean(v)
                    if t: rows.append((canon_id, code, ci+1, vi+1, t))
            return rows
        chapters = []
    else:
        chapters = []

    for ci, ch in enumerate(chapters):
        verses = ch if isinstance(ch, list) else ch.get('verses', [])
        for vi, v in enumerate(verses):
            t = clean(v if isinstance(v, str) else v.get('text', ''))
            if t: rows.append((canon_id, code, ci+1, vi+1, t))
    return rows

# ── Fetch everything ──────────────────────────────────────────────────────────
all_rows = []

print('=== Sefaria (3Mac, 4Mac, Letter of Jeremiah) ===')
for canon_id, code, title, ref, n_ch in SEFARIA_BOOKS:
    rows = fetch_sefaria(ref, n_ch, canon_id, code)
    if rows:
        all_rows.extend(rows)
        print(f'    e.g. "{rows[0][4][:65]}"')
    else:
        print(f'  {code}: FAILED — check sefaria.org is reachable')

print('\n=== Meqabyan (LPettay / Scrollmapper) ===')
for code, sources in MEQABYAN_SOURCES.items():
    canon_id = MEQABYAN_CANON[code]
    found = False
    for url in sources:
        data = fetch(url)
        if not data: continue
        try:
            d = json.loads(data)
            rows = parse_meqabyan(d, canon_id, code)
            if rows:
                all_rows.extend(rows)
                print(f'  {code}: {len(rows)} verses from {url.split("/")[-1]}')
                found = True; break
        except Exception as e:
            print(f'    parse error: {e}')
    if not found:
        print(f'  {code}: FAILED')

# ── Summary ───────────────────────────────────────────────────────────────────
print(f'\n=== Summary ===')
print(f'Total: {len(all_rows)} verses across {len({r[1] for r in all_rows})} books')
for _, code, title, *_ in SEFARIA_BOOKS:
    n = sum(1 for r in all_rows if r[1] == code)
    print(f'  {code}: {n} verses' if n else f'  {code}: MISSING')
for code in MEQABYAN_SOURCES:
    n = sum(1 for r in all_rows if r[1] == code)
    print(f'  {code}: {n} verses' if n else f'  {code}: MISSING')

if DRY or not all_rows:
    if DRY: print('\n[dry] nothing written.')
    sys.exit(0)

# ── Write to corpus.db ────────────────────────────────────────────────────────
db = sqlite3.connect('corpus.db')
cur = db.cursor()
by_code = defaultdict(list)
for r in all_rows: by_code[r[1]].append(r)

title_map = {b[1]: b[2] for b in SEFARIA_BOOKS}
title_map.update({'1_MEQABYAN': '1 Meqabyan', '2_MEQABYAN': '2 Meqabyan', '3_MEQABYAN': '3 Meqabyan'})

for code, rows in by_code.items():
    cur.execute("DELETE FROM verses WHERE corpus='ENG' AND code=?", (code,))
    cur.execute("DELETE FROM books  WHERE corpus='ENG' AND code=?", (code,))
    cur.execute("INSERT INTO books(corpus,code,title,category,n_verses) VALUES('ENG',?,?,?,?)",
                (code, title_map.get(code, code), 'deuterocanon-en', len(rows)))
    bid = cur.lastrowid
    for cid, c2, ch, v, text in rows:
        cur.execute("INSERT INTO verses(corpus,code,book_id,canon_id,chapter,verse,text) VALUES('ENG',?,?,?,?,?,?)",
                    (c2, bid, cid, str(ch), str(v), text))

db.commit(); db.close()
print(f'\n✓ {len(all_rows)} verses written to corpus.db')
print('\nNow continue:')
print('  node reingest-apocrypha.mjs --bak')
print('  node de-archaic-corpus.js')
print('  node apply-word-map.mjs --apply')
print('  node reseed-translations.mjs')
