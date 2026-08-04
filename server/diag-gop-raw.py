#!/usr/bin/env python3
"""
diag-gop-raw.py — dump Gospel of Peter's RAW paragraph split (before any verse-number
regex is applied), with repr() so leading digits/whitespace are unambiguous, to find
exactly where sacred-texts.com's page breaks are splitting one verse into two paragraphs.

Run from server/:
    python diag-gop-raw.py
"""
import importlib.util, pathlib, re

HERE = pathlib.Path(__file__).parent
TARGET = HERE / 'ingest-nt-apocrypha-2.py'
spec = importlib.util.spec_from_file_location('ingest_nt_apocrypha_2', TARGET)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

html = mod.fetch('https://sacred-texts.com/bib/lbob/lbob30.htm')
text = mod.strip_tags(html)
body = text.split('BUT of the Jews', 1)[1]
body = 'BUT of the Jews' + body
body = body.split('Next: Table I.', 1)[0]
body_before_pstrip = body
body = re.sub(r'\bp\.\s*\d{1,4}\b', ' ', body)

paras = [re.sub(r' {2,}', ' ', p).strip() for p in re.split(r'\n\s*\n', body)]
paras = [p for p in paras if p]

print(f'{len(paras)} raw paragraphs (blank-line-separated blocks) after p.N stripping:\n')
for i, p in enumerate(paras):
    m = re.match(r'^(\d{1,4})\b', p)
    lead = f'leads with digits={m.group(1)!r}' if m else 'no leading digit'
    print(f'--- para[{i}] len={len(p)} {lead} ---')
    print(repr(p[:200]))
    print()
