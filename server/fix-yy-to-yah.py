#!/usr/bin/env python3
"""
fix-yy-to-yah.py [corpus.db] [--apply]   (default: dry run on server/corpus.db)

fieldy, 2026-10-16: the HEB edition writes the divine name as 𐤉𐤉 (יי, the printed
abbreviation) — 726 words, mostly 2 Enoch / Jubilees / the Testaments / Psalms of
Solomon / Sirach. "I'm certain that 𐤉𐤉 is a mistranslation" -> the text itself
reads 𐤉𐤄 (Yah). No tagging rule: the word is corrected, and the ordinary resolver
then reads 𐤉𐤄 as H3050 like every other Yah.

Changed, whole words only, canon_id >= 40 or a Works Library doc (canon_id NULL);
the OT is untouched (Gen 24:60 𐤄𐤉𐤉 "be", Ps 6:9 𐤁𐤊𐤉𐤉 "my weeping" are real words):
  𐤉𐤉 with an optional 𐤅 then one optional 𐤋/𐤁/𐤌/𐤊 (𐤋𐤉𐤉 "to Yah", 𐤌𐤉𐤉 "from Yah")
  - verses (corpus HEB): text_paleo, and text (square letters יי, same rule)
  - tokens_nt.word_raw (book_id >= 40), tokens_nt_docs.word_raw
NOT changed: 𐤔𐤁𐤅𐤉𐤉 "captives of", 𐤁𐤁𐤋𐤉𐤉 "Babylonian", 𐤇𐤉𐤉 … (no such prefix),
and the docs' 𐤉𐤉𐤉𐤉 (another abbreviation — not asked). Idempotent.
Then: node build-surface-index.js ; node render-all.mjs --surface ; restart ; Rebake.
"""
import re, sqlite3, sys, os, collections
args = [a for a in sys.argv[1:] if not a.startswith('--')]
APPLY = '--apply' in sys.argv
db = args[0] if args else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'corpus.db')
PALEO = re.compile('(?<![\U00010900-\U00010915])(\U00010905?[\U0001090B\U00010901\U0001090C\U0001090A]?)\U00010909\U00010909(?![\U00010900-\U00010915])')
SQUARE = re.compile('(?<![א-ת֑-ׇ])(ו?[לבמכ]?)יי(?![א-ת֑-ׇ])')
fix_p = lambda s: PALEO.sub(lambda m: m.group(1) + '\U00010909\U00010904', s) if s else s
fix_s = lambda s: SQUARE.sub(lambda m: m.group(1) + 'יה', s) if s else s
con = sqlite3.connect(db)
cur = con.cursor()
forms = collections.Counter(); books = collections.Counter(); verses = 0; samples = []
ups = []
for rid, cid, ch, v, t, tp in cur.execute("SELECT id, canon_id, chapter, verse, text, text_paleo FROM verses "
                                          "WHERE corpus='HEB' AND (canon_id IS NULL OR canon_id >= 40)").fetchall():
    ntp, nt = fix_p(tp), fix_s(t)
    if ntp == tp and nt == t: continue
    for m in PALEO.finditer(tp or ''): forms[m.group(0)] += 1
    verses += 1; books[cid] += 1
    if len(samples) < 5: samples.append(f'{cid}:{ch}:{v}  {tp[:90]}\n        -> {ntp[:90]}')
    ups.append((nt, ntp, rid))
tok = cur.execute("SELECT COUNT(*) FROM tokens_nt WHERE book_id >= 40 AND word_raw IN (%s)" % ','.join('?' * len(forms or {'x': 0})),
                  list(forms) or ['x']).fetchone()[0]
has_docs = cur.execute("SELECT 1 FROM sqlite_master WHERE name='tokens_nt_docs'").fetchone()
docs = [r for r in (cur.execute("SELECT rowid, word_raw FROM tokens_nt_docs").fetchall() if has_docs else []) if fix_p(r[1]) != r[1]]
print(f'{db}\n  verses to correct: {verses}  words: {sum(forms.values())}  {dict(forms)}')
print(f'  by canon_id: {dict(books.most_common())}')
print(f'  tokens_nt rows: {tok}   tokens_nt_docs rows: {len(docs)}')
for s in samples: print('  ' + s)
if not APPLY:
    print('\nDry run. Re-run with --apply.'); sys.exit(0)
with con:
    cur.executemany("UPDATE verses SET text = ?, text_paleo = ? WHERE id = ?", ups)
    n1 = 0
    for f in forms:
        n1 += cur.execute("UPDATE tokens_nt SET word_raw = ? WHERE book_id >= 40 AND word_raw = ?", (fix_p(f), f)).rowcount
    cur.executemany("UPDATE tokens_nt_docs SET word_raw = ? WHERE rowid = ?", [(fix_p(w), r) for r, w in docs])
left = cur.execute("SELECT COUNT(*) FROM verses WHERE corpus='HEB' AND (canon_id IS NULL OR canon_id >= 40)").fetchone()
remaining = sum(len(PALEO.findall(tp or '')) for (tp,) in cur.execute(
    "SELECT text_paleo FROM verses WHERE corpus='HEB' AND (canon_id IS NULL OR canon_id >= 40)"))
print(f'\nApplied: {len(ups)} verses, {n1} tokens_nt rows, {len(docs)} tokens_nt_docs rows. 𐤉𐤉 words left: {remaining}')
