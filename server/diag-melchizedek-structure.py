#!/usr/bin/env python3
"""
diag-melchizedek-structure.py — sanity-check the book/chapter structure of the local
Book of Melchizedek source file BEFORE trusting ingest-book-of-melchizedek.py's counts.

Checks:
  1. Where each of the 3 book title lines actually matched (line number + the line
     itself), so a wrong match is obvious at a glance.
  2. Every "CHAPTER N" match found, per book, in order -- gaps in the sequence (e.g.
     1,2,4,5... skipping 3) are flagged. A gap could mean the source genuinely skips
     a number, OR that chapter's heading is formatted differently (extra whitespace,
     different case, a typo) and isn't matching the regex at all.
  3. For each flagged gap, shows a widened case-insensitive search for that missing
     number near "CHAPTER" so you can see the actual text if the source used a
     different format for just that one heading.

Run from server/:
    python diag-melchizedek-structure.py --src=sources/book-of-melchizedek.txt
"""
import re, argparse

TITLE_VASE_RX = re.compile(r'^\s*The History of the Vase\s*$', re.M)
TITLE_SALEM_RX = re.compile(r'^\s*Salem.s Story\s*$', re.M)
TITLE_UNIV_RX = re.compile(r'^\s*The HISTORY OF THE UNIVERSE\s*$', re.M)
CHAPTER_RX = re.compile(r'^\s*CHAPTER\s*(\d+)\s*$', re.M)

ap = argparse.ArgumentParser()
ap.add_argument('--src', required=True)
A = ap.parse_args()

raw = open(A.src, encoding='utf-8').read()
lines = raw.split('\n')

def line_no(pos):
    return raw.count('\n', 0, pos) + 1

def show_match(label, rx):
    m = rx.search(raw)
    if not m:
        print(f'{label}: NOT FOUND')
        return None
    ln = line_no(m.start())
    print(f'{label}: line {ln}: {lines[ln-1]!r}')
    return m.start()

print('=== book title positions ===')
i_vase = show_match('Vase', TITLE_VASE_RX)
i_salem = show_match('Salem', TITLE_SALEM_RX)
i_univ = show_match('Universe', TITLE_UNIV_RX)

if None in (i_vase, i_salem, i_univ):
    raise SystemExit('\nfix the NOT FOUND title(s) above before continuing')
if not (i_vase < i_salem < i_univ):
    raise SystemExit(f'\ntitles found OUT OF ORDER (Vase={i_vase}, Salem={i_salem}, '
                      f'Universe={i_univ}) -- one of them matched the wrong place')

bounds = [('Vase', i_vase, i_salem), ('Salem', i_salem, i_univ), ('Universe', i_univ, len(raw))]

print('\n=== CHAPTER sequence per book ===')
for label, start, end in bounds:
    body = raw[start:end]
    nums = [int(m.group(1)) for m in CHAPTER_RX.finditer(body)]
    print(f'\n{label}: {len(nums)} chapter markers found: {nums}')
    expected = list(range(1, max(nums) + 1)) if nums else []
    gaps = [n for n in expected if n not in nums]
    if gaps:
        print(f'  !! GAPS (numbers missing from the sequence): {gaps}')
        for g in gaps:
            # widened case-insensitive search near the number, anywhere in this book's
            # text, to see if that chapter heading is just formatted differently
            rx = re.compile(rf'(?i)chapter\D{{0,3}}{g}\b')
            hits = list(rx.finditer(body))
            if hits:
                for h in hits[:3]:
                    ln = line_no(start + h.start())
                    print(f'    possible alt-format match for {g} at line {ln}: '
                          f'{lines[ln-1]!r}')
            else:
                print(f'    no match at all for chapter {g} anywhere in this book '
                      f'(case-insensitive, loose) -- may genuinely be absent from '
                      f'the source')
    else:
        print('  no gaps -- sequence is complete 1..N')
