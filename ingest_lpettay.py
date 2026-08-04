#!/usr/bin/env python3
"""
ingest_lpettay.py — convert the LPettay/ethiopian-bible JSON into our new
corpus interchange format.

WHY a new format (not the old refs.txt):
  • JSONL, one record per verse  -> no delimiter-collision risk, diff-friendly,
    streamable, trivially validated, easy to hand-correct after OCR.
  • Stable STRING book code (corpus+code) -> kills the shared-integer collision
    that made deuterocanon render as "Book 76".
  • Per-verse provenance (`src`) + trust level (`conf`) -> because sources vary
    in trust and some books will be our own OCR. Every verse says where it came
    from and how much to trust it.
  • Tokens preserved when the source has them (LPettay ships g/t/gl already).

Outputs to out/: corpus.geez.jsonl, books.geez.json, sources.json
"""
import json, os, glob, sys

DATA = 'repo/public/data'
OUT  = 'out'

# Canonical EOTC ordering hint (for sort only; partial is fine).
ORDER = {c:i for i,c in enumerate([
  'GEN','EXOD','LEV','NUM','DEUT','JOSH','JUDG','RUTH','KINGS','JOB','PSA',
  'PROV','ECCL','SONG','ISA','JER','LAM','EZK','DAN','JOEL','JONAH','EZRA',
  'APEZ','TOB','JDT','SIR','WIS','1MEQ','2MEQ','3MEQ','JUB','1EN','4BAR',
  'SINOD','CLEM','TESTLD','TEACH','MYSHE','LEF','KN','SYNAX'])}

def book_code(abbrev):
    return abbrev.upper()

def main():
    os.makedirs(OUT, exist_ok=True)
    books = json.load(open(f'{DATA}/books.json'))
    reg, sources, n_v, n_t = [], {}, 0, 0
    fout = open(f'{OUT}/corpus.geez.jsonl', 'w', encoding='utf-8')

    for b in books:
        code = book_code(b['abbrev'])
        src_id = f"betmas:{b.get('source_id','?')}"
        sources.setdefault(src_id, {
            "id": src_id, "title": "Beta maṣāḥǝft TEI (via LPettay/ethiopian-bible)",
            "license": "CC BY-SA 4.0", "trust": "betmas",
            "url": "https://github.com/LPettay/ethiopian-bible"})
        cdir = f'{DATA}/chapters/{b["abbrev"]}'
        if not os.path.isdir(cdir):
            continue
        bk_verses = 0
        for cf in sorted(glob.glob(f'{cdir}/*.json'),
                         key=lambda p: int(os.path.splitext(os.path.basename(p))[0])):
            ch = json.load(open(cf, encoding='utf-8'))
            for verse in ch.get('verses', []):
                toks = [{"w": w.get("g",""), "tr": w.get("t",""), "gl": w.get("gl","")}
                        for w in verse.get('words', [])]
                rec = {
                    "corpus": "GEZ",
                    "book": code,
                    "ch": ch.get('chapter'),
                    "v": verse.get('num'),
                    "text": verse.get('geez',''),
                    "tokens": toks,
                    "src": src_id,
                    "conf": "betmas",       # scholarly-derived, not our OCR
                }
                fout.write(json.dumps(rec, ensure_ascii=False) + "\n")
                n_v += 1; n_t += len(toks); bk_verses += 1
        reg.append({"code": code, "corpus": "GEZ", "name": b['name'],
                    "geez_name": b.get('geez_name',''), "section": b.get('section',''),
                    "order": ORDER.get(code, 900), "n_chapters": b.get('chapters'),
                    "verses": bk_verses, "src": src_id})
    fout.close()
    reg.sort(key=lambda r: r['order'])
    json.dump(reg, open(f'{OUT}/books.geez.json','w',encoding='utf-8'),
              ensure_ascii=False, indent=2)
    json.dump(list(sources.values()), open(f'{OUT}/sources.json','w',encoding='utf-8'),
              ensure_ascii=False, indent=2)
    print(f"books: {len(reg)}  verses: {n_v:,}  tokens: {n_t:,}")
    print("by section:")
    secs={}
    for r in reg: secs.setdefault(r['section'],[0,0]); secs[r['section']][0]+=1; secs[r['section']][1]+=r['verses']
    for s,(nb,nv) in secs.items(): print(f"  {s or '(none)':24} {nb:2} books  {nv:,} verses")

if __name__ == '__main__':
    main()
