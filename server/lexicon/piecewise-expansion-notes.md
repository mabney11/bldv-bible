# Lexicon piecewise-expansion notes (latin/syriac/coptic/geez-lexicon.json)

Provenance for entries added by aligning a verse's already-Hebrew-transliterated English
(from `english-baseline.jsonl` + Gloss Studio's live gloss overlay) against that verse's
own tokens, fetched straight from `corpus.db` via `server/dump-verse-tokens.js` — never
retyped from a screenshot, never guessed from memory of the source text. Workflow:

1. `node server/dump-verse-tokens.js <book_id> <chapter> <verse>` — prints the real token
   list per language for one verse, tokenized identically to `splitTextToTokens()` in
   server.js, so the tokens match exactly what the reader/Gloss Studio will look up.
2. Claude aligns each token to its corresponding piece of the English, verifying the verse
   actually lines up (token count vs. expected phrase count) before proposing anything —
   a mismatch is a reason to stop and flag it, not force a mapping.
3. Entries go straight into `lexicon/{latin,syriac,coptic,geez}-lexicon.json`, in the same
   `Translit (gloss)` shorthand already used throughout (e.g. `"Aratz (earth)"`).

Same disclosure as `geez-lexicon-notes.md`: this is alignment against the app's OWN
translation, cross-checked with each language's actual attested grammar where the mapping
isn't purely mechanical — not verified against a standalone print dictionary or critical
apparatus. Treat as a solid first pass, not final scholarship.

## 2026-08-11 — Genesis 1:2, Latin/Syriac/Coptic

Source tokens fetched via `node server/dump-verse-tokens.js 1 1 2`. English:
"And the Aratz (earth) hayathah (became) thahaw (formless) and bahaw (void). And chashak
(darkness) was over panayam (the face) of the depths. And the Rawach (spirit / wind) of
Alahayam marachapath (hovered) over the panayam (face) of the Mayam (waters)."

**Latin (Vulgate)** — 18 tokens, clean 1:1 match against the known Vulgate wording
("Terra autem erat inanis et vacua, et tenebræ erant super faciem abyssi: et spiritus Dei
ferebatur super aquas"). All 15 unique surface forms added/confirmed, no ambiguity.

**Syriac (Peshitta)** — 14 tokens, clean 1:1 match. Note the corpus's verse-initial token
is bare `ܐܪܥܐ` ("earth"), with no leading `ܘ` ("and") — this edition doesn't carry the
verse-opening conjunction as a separate token; not a mismatch, just this edition's own
wording. `ܘܪܘܚܗ` ("and-spirit-of-it") carries a resumptive 3ms suffix that's redundant with
the following explicit `ܕܐܠܗܐ` ("of God") — normal Aramaic double-marking, glossed on the
first word and left implicit on the second. All 12 unique surface forms added/confirmed.

**Coptic (Sahidic)** — 13 tokens. 12 of 13 added with reasonable confidence:
`ⲡⲕⲁϩ`/`ⲇⲉ` ("the earth, but/and"), `ⲛⲉϥⲟⲩⲟⲛϩ ⲉⲃⲟⲗ ⲁⲛ ⲡⲉ` (idiom "was not manifest" =
formless, glossed across its four component tokens), `ⲛⲉⲩⲛⲟⲩⲕⲁⲕⲉ` ("there was darkness"),
`ϩⲓϫⲙⲡⲛⲟⲩⲛ` ("upon the deep"), `ⲡⲉⲡⲛⲉⲩⲙⲁ ⲙⲡⲛⲟⲩⲧⲉ` ("the Spirit of God" — πνεῦμα is a Greek
loanword, common in Sahidic), `ⲉϥⲛⲏⲩ` ("it was coming," idiomatic for "hovering"),
`ϩⲓϫⲛⲙⲙⲟⲟⲩ` ("upon the waters").

**NOT glossed, flagged rather than guessed:** `ⲉϥⲛⲁ`. It sits directly before `ⲉϥⲛⲏⲩ`
("it was coming"), which already fully accounts for "hovered" on its own — two adjacent
circumstantial-looking forms for one verb is unusual. Possible explanations (textual
variant, an edition-specific spelling, an ingestion/OCR artifact) are all speculative;
none confirmed. Left as an empty scaffold entry rather than inventing a gloss — needs a
real look at this edition's source/apparatus before it's added.
