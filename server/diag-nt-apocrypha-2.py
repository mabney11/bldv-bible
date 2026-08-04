#!/usr/bin/env python3
"""
diag-nt-apocrypha-2.py — read-every-verse diagnostic for ingest-nt-apocrypha-2.py.

--dry only prints counts, not content, and CLAUDE.md's ingestion checklist requires
actually reading verses end to end before trusting a count. Run this from the SAME
directory as ingest-nt-apocrypha-2.py (server/):

    python diag-nt-apocrypha-2.py

It imports that file as a module (dashes in the filename mean a plain `import` won't
work, hence importlib below) and prints every row each ingest_*() function returns,
numbered, so we can see exactly where Gospel of Peter's 17-vs-14 discrepancy comes
from, whether any Acts of Barnabas footnote number leaked into visible text, and
whether Melchizedek's gap-notes look sane.
"""
import importlib.util, pathlib, re, sys

HERE = pathlib.Path(__file__).parent
TARGET = HERE / 'ingest-nt-apocrypha-2.py'
if not TARGET.exists():
    print(f'ERROR: {TARGET} not found — run this script from the same directory '
          f'(server/) as ingest-nt-apocrypha-2.py')
    sys.exit(1)

spec = importlib.util.spec_from_file_location('ingest_nt_apocrypha_2', TARGET)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def show(label, rows):
    print(f'\n{"="*70}\n{label} — {len(rows)} rows\n{"="*70}')
    for code, name, src, chapter, verse, text in rows:
        flags = []
        # crude footnote-leak check: a lone 3-4 digit number sitting in running text
        if re.search(r'(?<!\d)\d{3,4}(?!\d)', text):
            flags.append('possible leaked footnote number?')
        # an embedded literal newline within a single verse's text is never correct —
        # paragraphs are already split on blank lines, so any \n surviving inside one
        # is a source-page line-wrap artifact, not real structure. Terminal wrapping
        # of a long printed line can LOOK the same as a real \n in a chat paste, so
        # flag it explicitly here instead of relying on eyeballing the pasted output.
        if '\n' in text:
            flags.append(f'EMBEDDED NEWLINE ({text.count(chr(10))}x) — should be a space')
        flag = ('  <-- ' + '; '.join(flags)) if flags else ''
        preview = text if len(text) <= 300 else text[:300] + '…'
        print(f'[{verse:>3}]{flag} {preview!r}')

print('Fetching Gospel of Peter…')
gop = mod.ingest_gospel_of_peter()
show('GOSPEL OF PETER', gop)

print('\nFetching Acts of Barnabas…')
aob = mod.ingest_acts_of_barnabas()
show('ACTS OF BARNABAS', aob)

print('\nFetching Melchizedek…')
mel = mod.ingest_melchizedek()
show('MELCHIZEDEK (NHC IX,1)', mel)

print(f'\n\nTOTALS: Peter={len(gop)} (expect 14)  Barnabas={len(aob)}  Melchizedek={len(mel)}')
