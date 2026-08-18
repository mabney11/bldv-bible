#!/usr/bin/env python3
"""
Python port of server/load-english-baseline.js, with the alignChapter() bug
fixed: the original heuristic assumed EVERY MT(Hebrew)-vs-WEB verse-count
mismatch in a chapter was a Psalms-style leading superscription and blindly
right-aligned (blanking the first N MT verses, shifting the rest onto wrong
verse numbers). That's only correct for Psalms' small (1-2 verse) title gap.
For every other book, a mismatch means the WEB source is simply missing some
verses (usually at the chapter's end) — so those chapters now align WEB verse
N -> MT verse N directly, leaving truly-absent verses honestly blank instead
of mislabeling real content under the wrong verse number.

Run against LOCAL copies of corpus.db + translation.db (not the FUSE-mounted
originals — direct sqlite3 access over that mount throws "disk I/O error" on
files this size). Copy the results back to the real project folder after.
"""
import json, sqlite3, sys, os

DB_PATH = '/tmp/pstudio/corpus.db'
TDB_PATH = '/tmp/pstudio/translation.db'
BIBLE_PATH = '/tmp/pstudio/bible.db'
JSONL_PATH = os.path.expanduser('~/mnt/paleo-studio/server/english-baseline.jsonl')

SRC_TAG = 'web-passthrough'
CODE2CANON = {"GEN":1,"EXOD":2,"LEV":3,"NUM":4,"DEUT":5,"JOSH":6,"JUDG":7,"RUTH":8,"1SAM":9,"2SAM":10,"1KGS":11,"2KGS":12,"1CHR":13,"2CHR":14,"EZRA":15,"NEH":16,"EST":17,"JOB":18,"PSA":19,"PROV":20,"ECCL":21,"SONG":22,"ISA":23,"JER":24,"LAM":25,"EZK":26,"DAN":27,"HOS":28,"JOEL":29,"AMO":30,"OBA":31,"JONAH":32,"MIC":33,"NAM":34,"HAB":35,"ZEP":36,"HAG":37,"ZEC":38,"MAL":39,"MAT":40,"MRK":41,"LUK":42,"JHN":43,"ACT":44,"ROM":45,"1CO":46,"2CO":47,"GAL":48,"EPH":49,"PHP":50,"COL":51,"1TH":52,"2TH":53,"1TI":54,"2TI":55,"TIT":56,"PHM":57,"HEB":58,"JAS":59,"1PE":60,"2PE":61,"1JN":62,"2JN":63,"3JN":64,"JUD":65,"REV":66}
CANON2CODE = {v: k for k, v in CODE2CANON.items()}
PSALMS_CANON = 19

def die(m):
    print('X ' + m, file=sys.stderr)
    sys.exit(1)

if not os.path.exists(DB_PATH): die('corpus.db not found at ' + DB_PATH)
if not os.path.exists(JSONL_PATH): die('english-baseline.jsonl not found at ' + JSONL_PATH)
if not os.path.exists(TDB_PATH): die('translation.db not found at ' + TDB_PATH)

# ── load WEB baseline: canon_id -> {chapter -> {verse -> text}} ────────────
web = {}
with open(JSONL_PATH, encoding='utf8') as fh:
    for ln in fh:
        ln = ln.strip()
        if not ln:
            continue
        try:
            o = json.loads(ln)
        except Exception:
            continue
        c = CODE2CANON.get(o.get('code'))
        if not c:
            continue
        web.setdefault(c, {}).setdefault(o['chapter'], {})[o['verse']] = str(o.get('text') or '')

if not web:
    die('no baseline rows parsed')

def remap_chapters(canon, chapters):
    if canon == 39 and 4 in chapters:  # Malachi: Eng ch4 = MT ch3 tail
        c3 = dict(chapters.get(3, {}))
        base = len(c3)
        c4 = chapters.get(4, {})
        for v in sorted(c4.keys()):
            c3[base + v] = c4[v]
        return {1: chapters.get(1, {}), 2: chapters.get(2, {}), 3: c3}
    if canon == 29 and 2 in chapters:  # Joel: Eng 2:28-32 = MT ch3, Eng ch3 = MT ch4
        c2 = chapters.get(2, {})
        out2, out3 = {}, {}
        for v in c2:
            if v <= 27:
                out2[v] = c2[v]
            else:
                out3[v - 27] = c2[v]
        return {1: chapters.get(1, {}), 2: out2, 3: out3, 4: chapters.get(3, {})}
    return chapters

def align_chapter(canon, mt_verses, web_by_verse):
    """Returns dict: mt_verse -> text or None."""
    web_vs = sorted(web_by_verse.keys())
    M, W = len(mt_verses), len(web_vs)
    out = {}
    if W == 0:
        for v in mt_verses:
            out[v] = None
        return out

    is_psalms = (canon == PSALMS_CANON)
    lead = M - W

    if is_psalms and 0 < lead <= 2:
        # Psalms MT superscription: MT has 1-2 extra LEADING verses (the
        # title) that WEB doesn't count separately. Right-align: blank the
        # first `lead` MT verses, map the rest in order.
        for i, v in enumerate(mt_verses):
            out[v] = None if i < lead else web_by_verse[web_vs[i - lead]]
        return out

    # Every other case (including Psalms with an unexpectedly large gap):
    # align by VERSE NUMBER. WEB verse N is MT verse N's counterpart; a
    # verse WEB doesn't have is honestly missing, not "somewhere else in
    # this chapter's WEB text".
    for v in mt_verses:
        out[v] = web_by_verse.get(v)
    return out

bdb = sqlite3.connect(BIBLE_PATH)
db = sqlite3.connect(DB_PATH)
db.execute('PRAGMA journal_mode = WAL')
tdb = sqlite3.connect(TDB_PATH)
tdb.execute('PRAGMA journal_mode = WAL')
for c in ['source_origin TEXT', 'original_text TEXT']:
    try:
        tdb.execute('ALTER TABLE translations ADD COLUMN ' + c)
    except Exception:
        pass

heb_books = set(r[0] for r in bdb.execute('SELECT DISTINCT book_id FROM tokens_bhs'))

aligned = []  # (canon, ch, v, text)
heb_books_n = 0
non_heb_n = 0
offset_chapters = 0
title_blank = 0

for canon, chapters_raw in web.items():
    if canon in heb_books:
        heb_books_n += 1
        chapters = remap_chapters(canon, chapters_raw)
        grid = {}
        for ch, v in bdb.execute('SELECT DISTINCT chapter, verse FROM tokens_bhs WHERE book_id=?', (canon,)):
            grid.setdefault(ch, set()).add(v)
        for ch, mt_set in grid.items():
            mt_vs = sorted(mt_set)
            web_ch = chapters.get(ch, {})
            if web_ch and len(mt_vs) != len(web_ch):
                offset_chapters += 1
            mapped = align_chapter(canon, mt_vs, web_ch)
            for v, text in mapped.items():
                if text is None:
                    title_blank += 1
                    continue
                aligned.append((canon, ch, v, text))
    else:
        non_heb_n += 1
        for ch, verses in chapters_raw.items():
            for v, text in verses.items():
                aligned.append((canon, ch, v, text))

print(f'Hebrew-grid books {heb_books_n} - non-Hebrew books {non_heb_n} - '
      f'versification-offset chapters {offset_chapters} - blank (no WEB match) {title_blank} - aligned rows {len(aligned)}')

# ── STEP 1 — corpus.db ENG source ───────────────────────────────────────────
removed = db.execute("DELETE FROM verses WHERE corpus='ENG' AND src=?", (SRC_TAG,)).rowcount
ins_rows = []
for canon, ch, v, text in aligned:
    code = CANON2CODE.get(canon, str(canon))
    ins_rows.append((f'ENG:{code}:{ch}:{v}', canon, code, ch, v, ch, v, text, SRC_TAG, canon))
db.executemany('''
    INSERT INTO verses (ref_key,book_id,corpus,code,chapter,verse,ord_c,ord_v,text,category,src,canon_id)
    VALUES (?,?, 'ENG', ?,?,?,?,?,?, 'scripture', ?, ?)
''', ins_rows)
db.commit()
print(f'[1] corpus.db ENG (reading): removed {removed}, inserted {len(aligned)} verses')

# ── STEP 2 — translation.db pre-save ────────────────────────────────────────
import_original = f'''
    INSERT INTO translations(book_id,chapter,verse,status,text,rich_text,source_origin,original_text,updated_at)
    VALUES(?,?,?, 'none', ?, '', '{SRC_TAG}', ?, datetime('now'))
    ON CONFLICT(book_id,chapter,verse) DO UPDATE SET
      source_origin = COALESCE(translations.source_origin, excluded.source_origin),
      original_text = COALESCE(translations.original_text, excluded.original_text)
'''
reset_untouched = f'''
    UPDATE translations SET text=?, original_text=?, updated_at=datetime('now')
      WHERE book_id=? AND chapter=? AND verse=? AND source_origin='{SRC_TAG}'
        AND status='none' AND (original_text IS NULL OR text=original_text)
'''
for canon, ch, v, text in aligned:
    tdb.execute(import_original, (canon, ch, v, text, text))
    tdb.execute(reset_untouched, (text, text, canon, ch, v))
tdb.commit()
print(f'[2] translation.db pre-save: {len(aligned)} verses pre-filled + untouched drafts refreshed')

# ── read-back proof ─────────────────────────────────────────────────────────
for c, ch, v, label in [(1,1,1,'Genesis 1:1'), (1,1,2,'Genesis 1:2 (untouched)'),
                         (19,23,1,'Psalm 23:1'), (19,51,1,'Psalm 51:1 (MT title)'),
                         (19,51,3,'Psalm 51:3 (body)'), (40,1,1,'Matthew 1:1'),
                         (13,5,1,'1 Chronicles 5:1 (was blank)'),
                         (13,5,16,'1 Chronicles 5:16 (was mislabeled v1 text)'),
                         (13,5,26,'1 Chronicles 5:26 (was mislabeled v11 text)'),
                         (13,5,27,'1 Chronicles 5:27 (genuinely absent from WEB source)')]:
    r = db.execute("SELECT text FROM verses WHERE corpus='ENG' AND book_id=? AND chapter=? AND verse=? LIMIT 1", (c, ch, v)).fetchone()
    print('  ' + label.ljust(46) + ' -> ' + ((r[0][:70] if r and r[0] else '(blank)')))

db.close()
tdb.close()
print('\ndone.')
