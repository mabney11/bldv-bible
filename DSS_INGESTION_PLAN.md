# Dead Sea Scrolls ingestion plan

fieldy, 2026-07-31: "Dead sea scrolls? I need it all" → clarified: "if one of the
languages that my app supports, I want it" → clarified further: "I only need the
data that others used to make their translations, any open source translation is
fine too."

## Why this is a source (not a translation) ingestion, unlike everything else this app has added

Every other non-canonical text added this session (Pistis Sophia, Gospel of Philip/
Thomas, Acts of Barnabas, Gospel of Peter, Melchizedek) is a plain **English**
translation ingested as `corpus='ENG'`, because that's what was public-domain or
openly available for those works. The Dead Sea Scrolls are different: the actual
Qumran sectarian scrolls (Community Rule, War Scroll, Temple Scroll, Damascus
Document, Hodayot, the pesharim, and more) were only discovered in 1947, so every
modern *English* translation of them (Vermes, Wise/Abegg/Cook, García Martínez) is a
20th/21st-century work still under copyright — there is no public-domain or openly-
licensed English translation the way there is for 1 Enoch (R.H. Charles, 1917) or the
Nag Hammadi library.

What DOES exist, openly licensed: **Martin Abegg's Hebrew/Aramaic transcriptions**
of nearly every Hebrew and Aramaic scroll found at Qumran — the primary-source data
scholars used to MAKE those English translations, not a translation itself. Abegg
gave permission for this to be redistributed under **CC-BY-NC** (Creative Commons
Attribution-NonCommercial 4.0) via the ETCBC/dss project:
https://github.com/ETCBC/dss

This is squarely what fieldy asked for on both counts: it's in Hebrew (a language
this app already renders — `corpus='HEB'`, same pipeline as the OT), and it's the
underlying data other translators used, openly licensed. This app is personal/
non-commercial, so CC-BY-NC's terms are satisfiable — the ingestion script (once
written) needs to record the required attribution (Martin Abegg + ETCBC/CACCHT
project) somewhere durable, e.g. a `src` column value on the ingested rows and a
credits line in the app, not just this planning doc.

## What this unlocks

Once ingested as `corpus='HEB'`, these scrolls get the SAME paleo-Hebrew rendering
pipeline the Old Testament already has — no separate English-side name/term glossing
needed the way the ENG-corpus ingests required this session. They'd appear as
original-language works (Works Library, `canon_id NULL`, same two-tier visibility
as everything else), not "translations" needing sanitize-english.js at all.

## Format problem: Text-Fabric

The ETCBC/dss data isn't a simple flat file — it's distributed in **Text-Fabric**
format (`.tf` files, one per linguistic/structural feature, loaded via the `text-fabric`
Python package and its graph-node API), the standard format for ETCBC's whole family
of corpora (this is the same toolchain/convention used for their Hebrew Bible dataset,
BHSA). This is a real format, actively maintained, with a stable documented Python
API — but it is NOT a "fetch a URL, split on paragraph breaks" job like every other
ingester this session. It requires:

1. `pip install text-fabric --break-system-packages`
2. Loading the corpus via `tf.app.use('ETCBC/dss:hot')` (downloads the dataset)
3. Walking its node hierarchy (confirmed via `about.md`: data is organized by
   **scroll → fragment → line → word**, plus separate morphological features per
   word) to reconstruct each scroll's text in reading order
4. Mapping that hierarchy onto this app's `book_id/code/chapter/verse` columns —
   the natural mapping is scroll→book (code), fragment→chapter, line→verse, but this
   is a proposal, not confirmed against the real data yet
5. Writing it into `corpus.db` as `corpus='HEB'` rows, then running it through the
   SAME square-Hebrew/paleo conversion pipeline the OT already uses
   (`fix-square-hebrew.js` et al.)

## Status: step 1 only, not yet run

Because guessing Text-Fabric's exact feature names for this specific dataset risks
silently pulling the wrong field into the "text" column (exactly the class of bug
this whole session has been about catching), the actual extraction script hasn't
been written yet. What's ready now is `server/dss-discover.py` — a **read-only**
script that loads the dataset and prints its real node types, feature names, and a
sample of the first few nodes of each type. It writes nothing to corpus.db.

**Next step:** run `python dss-discover.py` (from `server/`) and paste the full
output back. From that real output, the actual `dss-ingest.py` (extraction + write
to corpus.db, following the same checklist as every other ingester this session —
dry-run first, sample-corpus.js review before greenlighting) can be written against
confirmed field names instead of guesses.

## Scope note

"Nearly every Hebrew and Aramaic scroll found in the Judaean Desert between 1947 and
today" is Abegg's own description of his dataset's coverage — this is not a curated
subset, it's close to comprehensive for the non-biblical corpus (the biblical-scrolls
half of the same dataset is a separate file and lower priority, since this app
already has the Hebrew Bible from a different, already-integrated source). Once
`dss-discover.py`'s output is in hand, a follow-up triage pass (same spirit as
`NT_APOCRYPHA_BACKLOG.md`) may be worth doing to name the actual major scrolls
(1QS, 1QM, 1QHa, 4QMMT, 11QT, the pesharim, etc.) as individual "books" with real
titles, rather than importing raw scroll siglum codes as-is.
