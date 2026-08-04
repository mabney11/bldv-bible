#!/usr/bin/env python3
"""
dss-discover.py — STEP 1 of the Dead Sea Scrolls ingestion (see DSS_INGESTION_PLAN.md).

This does NOT write anything to corpus.db. It loads Martin Abegg's Hebrew/Aramaic
DSS transcription (via the ETCBC/dss Text-Fabric dataset, CC-BY-NC licensed — see
DSS_INGESTION_PLAN.md for why this source and not an English translation) and prints
its actual node/feature structure, so the real ingestion script can be written against
CONFIRMED field names instead of guessed ones.

Why this extra step exists, instead of just writing the ingester directly: every fix
this session (Pistis Sophia's chapter numbering, the tag-boundary word-gluing, the
diacritic-splitting bug, ...) came from actually reading real output rather than
assuming a source's structure — see CLAUDE.md's ingestion checklist. Text-Fabric's
exact feature names for THIS dataset (word text, scroll/fragment/line identifiers)
aren't independently confirmed here (the docs/transcription.md page that documents
them wasn't fetchable during research) — better to print them and look than to guess
and risk silently mis-mapping the wrong feature into the "text" column.

Setup (one-time):
    pip install text-fabric --break-system-packages

Usage:
    python dss-discover.py

Paste the FULL output back — that's what the real dss-ingest.py extraction logic
(node types to walk, which feature holds the Hebrew word text, how scroll/fragment/
line map to this app's book/chapter/verse columns) will be built from.
"""
from tf.app import use

# 'hot' = the actively-developed version per ETCBC/dss's own docs (as of the CACCHT
# project's README); if this fails, try use('ETCBC/dss') without :hot, or check
# https://github.com/ETCBC/dss for the current recommended version string.
print('Loading ETCBC/dss (this downloads the dataset on first run — may take a while)…')
A = use('ETCBC/dss:hot', hoist=globals())

print('\n=== Node (otype) hierarchy ===')
print(list(F.otype.all))

print('\n=== Node counts by type ===')
for ot in F.otype.all:
    print(f'  {ot}: {F.otype.s(ot).__len__() if hasattr(F.otype.s(ot), "__len__") else "?"}')

print('\n=== All available features ===')
print(sorted(Fall()))

print('\n=== Section structure (what T.sectionTypes / T.text use) ===')
try:
    print('sectionTypes:', T.sectionTypes)
except Exception as e:
    print('  (could not read T.sectionTypes:', e, ')')

print('\n=== Sample: first 5 nodes of each otype, with their key features ===')
for ot in F.otype.all:
    nodes = list(F.otype.s(ot))[:5]
    print(f'\n--- {ot} (showing {len(nodes)} of {len(list(F.otype.s(ot)))}) ---')
    for n in nodes:
        feats = {}
        for feat_name in ('g_word_utf8', 'g_cons_utf8', 'text', 'label', 'name',
                           'book', 'scroll', 'fragment', 'line', 'sp', 'lex', 'lex_utf8'):
            try:
                fobj = Fs(feat_name) if feat_name not in dir(F) else getattr(F, feat_name)
                val = fobj.v(n) if fobj else None
                if val is not None:
                    feats[feat_name] = val
            except Exception:
                pass
        print(f'  node {n} ({ot}): {feats}')

print('\n=== Done. Paste this ENTIRE output back. ===')
