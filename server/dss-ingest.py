#!/usr/bin/env python3
"""
dss-ingest.py — Dead Sea Scrolls (non-biblical) into corpus.db as corpus='HEB'.

Source: Martin Abegg's Hebrew/Aramaic transcriptions of the Qumran scrolls, via the
ETCBC/dss Text-Fabric dataset (CC-BY-NC — see DSS_INGESTION_PLAN.md for the licensing
rationale and required attribution). This is ORIGINAL-LANGUAGE text, not a translation
— it goes through this app's existing paleo-Hebrew pipeline the same way the OT does,
not through sanitize-english.js/glossify-terms.js/de-archaic-corpus.js (those are for
corpus='ENG' only).

Confirmed via dss-discover.py's real output (2026-07-31), NOT guessed:
  - Node hierarchy: scroll > fragment > line (T.sectionTypes == ['scroll','fragment','line'])
  - scroll count 1001 includes BOTH biblical and non-biblical scrolls — a `biblical`
    feature flags which is which; this script keeps ONLY biblical=False/unset material,
    since this app already has the Hebrew Bible from a separate, already-integrated
    source (BHS-based, not this dataset) — re-ingesting the biblical portion here would
    create a duplicate, inconsistent second copy.
  - Word-level features present on real word nodes: sp (part of speech), lex (lexeme).
    The discovery script's sample dump did NOT query `glyph`/`full`/`punc`/`after` (its
    hardcoded guess-list named the wrong fields), so this script uses Text-Fabric's own
    T.text() to reconstruct each line's reading text — that's what T.text() exists for,
    and it's driven by the app's own otext.tf config rather than this script's guesses
    about which features to concatenate and in what order.

STILL UNVERIFIED, because it can only be checked by actually looking at output:
  - Whether T.text() on a 'line' node produces the same word order / spacing a human
    reader would expect — this script's --probe mode prints real lines from two
    well-known scrolls (1QS, CD) so you can eyeball this BEFORE trusting a full run.
  - Whether `biblical` is set at word level, line level, or not perfectly aligned to
    the actual biblical/non-biblical boundary in every case (a few edge cases, e.g.
    lines that mix a biblical quotation into sectarian commentary, may not cleanly
    split) — --probe also prints the biblical/non-biblical split counts per scroll so
    you can sanity-check the numbers look plausible before a full run.

Usage:
    pip install text-fabric --break-system-packages   # one-time, if not already done
    python dss-ingest.py --probe                       # prints samples, writes nothing
    python dss-ingest.py --dry                          # full extraction, prints counts, writes nothing
    python dss-ingest.py                                 # full extraction + write to corpus.db

Attribution requirement (CC-BY-NC): every row written here gets
src='dss-etcbc-abegg-2026-07' — keep that value intact, and make sure the app's
credits/about surface (wherever that is) names Martin Abegg and the ETCBC/CACCHT
project, linking https://github.com/ETCBC/dss, per the license terms.
"""
import sqlite3, argparse, re
from tf.app import use

def to_int(x):
    try: return int(re.sub(r'[^0-9].*$', '', str(x)) or 0)
    except Exception: return 0

# Confirmed via --probe 2026-07-31: CD 1:1 came back as '\xa0 ועתה שמעו...' — a literal
# non-breaking space leaking in before the real text, presumably from how T.text()
# renders a line whose first word has no preceding gap marker of its own. Same class
# of fix as strip_tags()'s whitespace collapsing elsewhere in this app — normalize
# ALL Unicode whitespace variants to plain spaces, then collapse/strip, rather than
# leaving an invisible character that would look like a formatting bug to a reader.
def clean_line_text(t):
    t = t.replace('\xa0', ' ')
    t = re.sub(r'\s+', ' ', t).strip()
    return t

# A handful of the best-known scrolls, so at least these show up with a real title
# instead of a bare siglum. NOT exhaustive — most of the 700+ scroll sigla in this
# dataset are small fragments with no widely-used English name; those keep their
# siglum as both code and title until/unless someone looks each one up. Verify any
# addition here against a real source before trusting it (same "no guessing" rule as
# everything else) — this list was written from general background knowledge, NOT
# independently re-verified against a citation the way every other sourced fact in
# this session's ingesters was, so treat it as a starting point to double check.
SCROLL_TITLES = {
    '1QS': 'Community Rule', '1QSa': 'Rule of the Congregation',
    '1QSb': 'Rule of Benedictions', '1QM': 'War Scroll',
    '1QHa': 'Thanksgiving Hymns (Hodayot)', '1QpHab': 'Pesher Habakkuk',
    'CD': 'Damascus Document', '11Q19': 'Temple Scroll', '11QT': 'Temple Scroll',
    '11QTa': 'Temple Scroll', '4QMMT': 'Some Works of the Torah (MMT)',
    '11QPsa': 'Great Psalms Scroll', '4QpNah': 'Pesher Nahum',
    '4QpPsa': 'Pesher Psalms', '3Q15': 'Copper Scroll',
}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--corpus', default='corpus.db')
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--probe', action='store_true',
                     help='print sample lines from 1QS and CD + biblical/non-biblical '
                          'counts, write nothing. Run this FIRST.')
    A = ap.parse_args()

    print('Loading ETCBC/dss…')
    Aapp = use('ETCBC/dss:hot', hoist=globals())

    has_biblical = 'biblical' in Fall()

    if A.probe:
        print(f'\nbiblical feature present: {has_biblical}')
        for scroll_name in ('1QS', 'CD'):
            scroll_nodes = [n for n in F.otype.s('scroll') if F.scroll.v(n) == scroll_name]
            if not scroll_nodes:
                print(f'  [probe] scroll {scroll_name} not found'); continue
            sn = scroll_nodes[0]
            lines = L.d(sn, otype='line')
            print(f'\n=== {scroll_name}: {len(lines)} lines total ===')
            bib_count = sum(1 for ln in lines if has_biblical and F.biblical.v(ln)) if has_biblical else 0
            print(f'  biblical-flagged lines: {bib_count} / {len(lines)}')
            print(f'  first 8 lines (fragment:line -> T.text()):')
            for ln in lines[:8]:
                frag = F.fragment.v(ln)
                lnum = F.line.v(ln)
                txt = clean_line_text(T.text(ln))
                bflag = F.biblical.v(ln) if has_biblical else '?'
                print(f'    {scroll_name} {frag}:{lnum} [biblical={bflag}]  {txt!r}')
        print('\n=== Done probing. Read the printed lines — do they look like real, '
              'correctly-ordered Hebrew text with sane word spacing? Check --dry next. ===')
        return

    print('Walking non-biblical scroll/fragment/line hierarchy…')
    rows = []  # (code, title, chapter, verse, text)
    skipped_biblical = 0
    for sn in F.otype.s('scroll'):
        scroll_name = F.scroll.v(sn)
        if not scroll_name:
            continue
        lines = L.d(sn, otype='line')
        chap_counter = {}
        for ln in lines:
            if has_biblical and F.biblical.v(ln):
                skipped_biblical += 1
                continue
            frag = F.fragment.v(ln) or '1'
            lnum = F.line.v(ln) or '1'
            txt = clean_line_text(T.text(ln))
            if not txt:
                continue
            chap_counter.setdefault(frag, 0)
            chap_counter[frag] += 1
            code = re.sub(r'[^A-Za-z0-9]+', '_', scroll_name).strip('_').upper()
            title = SCROLL_TITLES.get(scroll_name, scroll_name)
            rows.append((f'DSS_{code}', title, str(frag), str(lnum), txt))

    codes = sorted(set(r[0] for r in rows))
    print(f'\n{len(rows)} lines across {len(codes)} scrolls '
          f'(skipped {skipped_biblical} biblical-flagged lines)')
    print(f'sample scroll codes: {codes[:10]}{"..." if len(codes) > 10 else ""}')

    if A.dry:
        print('dry run — nothing written. Review the counts above, then run --probe '
              'again if anything looks off, before running for real.')
        return

    db = sqlite3.connect(A.corpus); cur = db.cursor()
    ph = ','.join('?' for _ in codes)
    if codes:
        cur.execute(f"DELETE FROM verses WHERE corpus='HEB' AND code IN ({ph})", codes)
        cur.execute(f"DELETE FROM books  WHERE corpus='HEB' AND code IN ({ph})", codes)

    counts, titles = {}, {}
    for code, title, ch, v, t in rows:
        counts[code] = counts.get(code, 0) + 1
        titles[code] = title
    bid = {}
    for code, n in counts.items():
        cur.execute("INSERT INTO books(corpus,code,title,category,n_verses) VALUES('HEB',?,?,?,?)",
                    (code, titles[code], 'dead-sea-scrolls-heb', n))
        bid[code] = cur.lastrowid
    for code, title, ch, v, t in rows:
        rk = f'HEB:{code}:{ch}:{v}'
        cur.execute("""INSERT INTO verses(ref_key,book_id,corpus,code,chapter,verse,ord_c,ord_v,
                       text,category,src,canon_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL)""",
                    (rk, bid[code], 'HEB', code, ch, v, to_int(ch), to_int(v), t,
                     'dead-sea-scrolls-heb', 'dss-etcbc-abegg-2026-07'))
    db.commit(); db.close()
    print(f'\ningested {len(rows)} lines into {A.corpus} (corpus \'HEB\'). Next:')
    print('  node fix-square-hebrew.js --apply   # or whatever this app\'s existing')
    print('                                       # OT square-Hebrew/paleo step is called')
    print('  python assign-canon-ids.py           # these are Works Library only —')
    print('                                       # DSS scrolls have no canon_id, by design')
    print('  node sample-corpus.js --src=dss-etcbc-abegg-2026-07')
    print('  Make sure Martin Abegg + ETCBC/CACCHT are credited somewhere in the app '
          '(CC-BY-NC requirement).')

if __name__ == '__main__':
    main()
