#!/usr/bin/env python3
"""
load-tyndale-baseline.py — Tyndale Bible (66 books) into translation.db.

Run from server/:
  python ../load-tyndale-baseline.py --dry
  python ../load-tyndale-baseline.py
"""
import sqlite3, urllib.request, json, sys, re, os

DRY = '--dry' in sys.argv

# Always find DBs relative to THIS script (server/)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_DIR = SCRIPT_DIR if os.path.exists(os.path.join(SCRIPT_DIR, 'corpus.db')) \
             else os.path.join(SCRIPT_DIR, 'server')
CORPUS_DB  = os.path.join(SERVER_DIR, 'corpus.db')
TRANS_DB   = os.path.join(SERVER_DIR, 'translation.db')
for f in [CORPUS_DB, TRANS_DB]:
    if not os.path.exists(f): sys.exit(f'Not found: {f}')

URL = "https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/Tyndale.json"

BOOK_MAP = {
  'Genesis':'GEN','Exodus':'EXOD','Leviticus':'LEV','Numbers':'NUM','Deuteronomy':'DEUT',
  'Joshua':'JOSH','Judges':'JUDG','Ruth':'RUTH','1 Samuel':'1SAM','2 Samuel':'2SAM',
  '1 Kings':'1KGS','2 Kings':'2KGS','1 Chronicles':'1CHR','2 Chronicles':'2CHR',
  'Ezra':'EZRA','Nehemiah':'NEH','Esther':'EST','Job':'JOB','Psalms':'PSA',
  'Proverbs':'PROV','Ecclesiastes':'ECCL','Song of Solomon':'SONG','Song of Songs':'SONG',
  'Isaiah':'ISA','Jeremiah':'JER','Lamentations':'LAM','Ezekiel':'EZK','Daniel':'DAN',
  'Hosea':'HOS','Joel':'JOEL','Amos':'AMO','Obadiah':'OBA','Jonah':'JONAH','Micah':'MIC',
  'Nahum':'NAM','Habakkuk':'HAB','Zephaniah':'ZEP','Haggai':'HAG','Zechariah':'ZEC',
  'Malachi':'MAL',
  'Matthew':'MAT','Mark':'MRK','Luke':'LUK','John':'JHN','Acts':'ACT',
  'Romans':'ROM','1 Corinthians':'1CO','2 Corinthians':'2CO','Galatians':'GAL',
  'Ephesians':'EPH','Philippians':'PHP','Colossians':'COL',
  '1 Thessalonians':'1TH','2 Thessalonians':'2TH','1 Timothy':'1TI','2 Timothy':'2TI',
  'Titus':'TIT','Philemon':'PHM','Hebrews':'HEB','James':'JAS',
  '1 Peter':'1PE','2 Peter':'2PE','1 John':'1JN','2 John':'2JN','3 John':'3JN',
  'Jude':'JUD','Revelation of John':'REV','Revelation':'REV',
}

print("Fetching Tyndale.json...")
req = urllib.request.Request(URL, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req, timeout=60) as r:
    data = json.loads(r.read().decode('utf-8'))
books = data['books']
print(f"  {len(books)} books")

# Map code -> book_id from the books table in corpus.db
cdb = sqlite3.connect(CORPUS_DB)
code_to_bid = {}
for row in cdb.execute("SELECT code, book_id FROM books"):
    code_to_bid[row[0]] = row[1]
# Fallback: use verses table for any missing
for row in cdb.execute("SELECT DISTINCT code, book_id FROM verses WHERE book_id IS NOT NULL"):
    if row[0] not in code_to_bid:
        code_to_bid[row[0]] = row[1]
cdb.close()
print(f"  {len(code_to_bid)} book_id mappings from corpus.db")

# Parse verses
all_rows = []   # (book_id, chapter, verse, text)
ok, missing = [], []
for bk in books:
    name = bk.get('name','')
    code = BOOK_MAP.get(name)
    if not code:
        missing.append(name); continue
    bid = code_to_bid.get(code)
    if not bid:
        missing.append(f'{name}({code})'); continue
    ok.append(name)
    for ch in bk.get('chapters',[]):
        cn = ch.get('chapter',1)
        for v in ch.get('verses',[]):
            t = re.sub(r'\s+', ' ', str(v.get('text','')).strip())
            if t: all_rows.append((bid, cn, v.get('verse',1), t))

print(f"\nMapped: {len(ok)} books, {len(all_rows)} verses")
if missing: print(f"Missing book_ids: {missing}")

# Samples
for r in all_rows[:1]: print(f"  GEN 1:1  book_id={r[0]}: {r[3][:65]}")
mat = next((r for r in all_rows if r[0]==code_to_bid.get('MAT')), None)
if mat: print(f"  MAT 1:1  book_id={mat[0]}: {mat[3][:65]}")
rev = next((r for r in all_rows if r[0]==code_to_bid.get('REV')), None)
if rev: print(f"  REV 22:? book_id={rev[0]}: {rev[3][:65]}")

if DRY: print("\n[dry] nothing written."); sys.exit(0)

# Write to translation.db — replace only the 66 Tyndale book_ids
tdb = sqlite3.connect(TRANS_DB)
tdb.execute("PRAGMA journal_mode=WAL")
bids = list({r[0] for r in all_rows})
ph = ','.join('?'*len(bids))
n_del = tdb.execute(f"DELETE FROM translations WHERE book_id IN ({ph})", bids).rowcount
print(f"\nCleared {n_del} old rows for those {len(bids)} books")

cols = [c[1] for c in tdb.execute("PRAGMA table_info(translations)").fetchall()]
has_orig = 'original_text' in cols
has_src  = 'source_origin' in cols
has_stat = 'status' in cols

col_str = 'book_id,chapter,verse,text'
if has_stat: col_str += ',status'
if has_src:  col_str += ',source_origin'
if has_orig: col_str += ',original_text'

val_str = '?,?,?,?'
if has_stat: val_str += ",'none'"
if has_src:  val_str += ",'tyndale'"
if has_orig: val_str += ',?'

ins = f"INSERT OR REPLACE INTO translations ({col_str}) VALUES ({val_str})"

n = 0
tdb.execute("BEGIN")
for bid, ch, v, text in all_rows:
    params = [bid, ch, v, text]
    if has_orig: params.append(text)
    tdb.execute(ins, params)
    n += 1
tdb.commit(); tdb.close()
print(f"\u2713 {n} Tyndale verses written to translation.db")
print("Next: node apply-word-map.mjs --apply  (normalize names + terms)")
print("      npm run build  (rebuild frontend)")
print("      restart server")
