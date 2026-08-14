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

**Style correction, 2026-08-11:** initial Coptic entries carried explanatory
parentheticals/commentary ("was manifest (negated by ebol an pe: not) — thahaw
(formless)", "it was coming — marachapath (hovered)"). Fieldy: "the coptic seems to
have a lot of filler... lets shoot for simple entries that flow when reading." Reworked
to short slash-style glosses matching his own hand-edit of `ⲛⲉϥⲟⲩⲟⲛϩ` ("became thahaw /
formless"): `ⲉⲃⲟⲗ` "out / forth", `ⲇⲉ` "and / but", `ⲡⲉ` "is / was", `ⲉϥⲛⲏⲩ`
"marachapath / hovered", `ϩⲓϫⲛⲙⲙⲟⲟⲩ` "over the Mayam (waters)", `ϩⲓϫⲙⲡⲛⲟⲩⲛ` "over the
depths", `ⲛⲉⲩⲛⲟⲩⲕⲁⲕⲉ` "chashak / darkness". Apply this brevity standard to all future
entries across every language — no explanatory asides, no em-dash commentary.

**New convention, 2026-08-11:** a token added purely for grammar/flow with no
independent counterpart in the English translation gets a bare `"—"` gloss (fieldy's
own example: Greek `ὁ`). No Gen 1:2 token in any of the four languages below needed
this — all had a real corresponding English word — but apply it going forward whenever
one shows up.

## 2026-08-11 — Genesis 1:2, Ge'ez

Source: `node server/dump-verse-tokens.js 1 1 2` (Ge'ez token list). 4 of 12 tokens were
already glossed (`ወምድርሰ` "and the aratz / earth", `ኢታስተርኢ` "thahaw / was formless",
`ማይ` "water (archaic)", `እግዚአብሔር` "Yahawah Alahayam"). Added the remaining 7 unique
surface forms, aligned against the same English as Latin/Syriac/Coptic above: `ድሉተ`
"bahaw / void", `ወጽልመት` "and chashak / darkness", `መልዕልተ` "over" (appears twice in the
verse's token list — one lexicon entry covers both occurrences), `ቀላይ` "the depths",
`ወመንፈሰ` "and the rawach / spirit of", `ይጼልል` "marachapath / hovered". Genesis 1:2 is
now fully glossed across all 12 unique Ge'ez surface forms.

**Correction, 2026-08-14:** `ወኢኮነት` was first glossed "and was not" — fieldy flagged
that this introduces a concept the English translation doesn't have ("gez has 'and was
not' 'void' but english does not"). Grammatically it's real (ወ "and" + ኢ "not" + ኮነት
"was/became, 3fs"), but it's a negated auxiliary that pairs with the following `ድሉተ` to
express "void" as a two-word negated construction — Ge'ez idiom, not an extra idea.
Since the "void" content lives entirely in `ድሉተ`, `ወኢኮነት` carries no independent
counterpart of its own in the English and was switched to `"—"` per the bare-grammar-word
convention above, rather than spelling out a negation the English side never shows.

**Correction, 2026-08-14 — Coptic and Greek, same verse.** Same issue as the Ge'ez fix
above, two more places: fieldy flagged that Coptic's `ⲉⲃⲟⲗ`/`ⲁⲛ`/`ⲡⲉ` ("out/forth" /
"not" / "is/was") don't make sense as standalone glosses reading in sequence. All three
are the trailing pieces of the `ⲛⲉϥⲟⲩⲟⲛϩ ⲉⲃⲟⲗ ⲁⲛ ⲡⲉ` idiom ("was not manifest" =
formless) — `ⲛⲉϥⲟⲩⲟⲛϩ` alone already carries the full "became thahaw / formless" gloss,
so `ⲉⲃⲟⲗ`/`ⲁⲛ`/`ⲡⲉ` (completive particle / negation particle / copula) add no further
independent content. Switched all three to `"—"`.

Separately, fieldy asked whether it's OK to adjust Greek `ἡ`/`δέ` — reading in token
order they show "the" then "and", when natural English is "and the." Rather than
swapping which word says "and" and which says "the" (that would misattribute meaning
neither token actually carries), fixed the real inconsistency: `ἡ` is just the feminine
nominative form of the definite article already glossed `"—"` under `ὁ` — it had been
left as "the (fem nom)" instead of matching. Set `ἡ` to `"—"` too, so the visible
sequence naturally reads "— and Ge(arth)" i.e. just "and earth," no swap needed. `δέ`
stays "but / and" — postpositive particles normally sort second in Greek word order but
translate first in English; that's expected interlinear behavior, not a bug, and
resolves itself here now that the article contributes nothing to read around.

**General rule going forward:** when a token's content is already fully carried by a
neighboring token (idiom components, doubled grammatical marking), give the
content-bearing token the real gloss and the remaining piece(s) `"—"` — don't split one
concept's words into misleading fragments, and don't swap which word "means" what across
token boundaries.

## 2026-08-14 — Genesis 1:3, all five languages

English (live, via `/api/source/ENG/verse?book=1&chapter=1&verse=3`, NOT the static
baseline — confirmed the two differ, same as Gen 1:2): "And Alahayam amar (spoke), 'hayah
(be) awar (light)' and hayah (became) awar (light)." Four content words recur throughout:
Alahayam (God), amar (said/spoke), hayah (be/become — the same root covers both the
jussive "let there be" and the resulting "it became"), awar (light).

Source tokens fetched via `node server/dump-verse-tokens.js 1 1 3`. Every language here
fuses "and" + "said/became" into a single verb-initial token (waw/‑que consecutive) —
same pattern as Gen 1:2's Coptic/Ge'ez "and X" compounds, not a new phenomenon:

**Latin**: `Dixitque` "and amar / spoke" (dixit + enclitic ‑que "and"), `Deus` (existing,
Alahayam), `Fiat` "hayah / let it be", `lux` "awar / light", `Et` "and" (capitalized
verse-initial form — a separate lexicon key from lowercase `et`, case is NOT folded),
`facta`+`est` — the periphrastic passive "was made." Content lives in the participle
`facta` ("hayah / became"); `est` is the bare auxiliary "is/was" copula with nothing of
its own beyond what `facta` already carries, so `"—"` per the bare-grammar-word rule.

**Syriac**: filled 4 remaining empty scaffolds — `ܘܐܡ̣ܪ` "and amar / spoke", `ܢܗܘܐ`
"hayah / let it be", `ܢܘܗܪܐ` "awar / light", `ܘܗܘ̣ܐ` "and hayah / became". `ܐܠܗܐ`
(bare "God") was already glossed "Alahayam" from earlier work.

**Coptic**: this edition's Gen 1:3 is one condensed clause, not two — `ϣⲱⲡⲉ` ("became")
appears once at the end with no second explicit "light" repeated after it, unlike the
English's own doubled "awar (light)." Not a mismatch, just this edition's own economy
(same caveat class as Gen 1:2's Syriac verse-initial omission). Filled: `ⲁⲩⲱ` "and",
`ⲡⲉϫⲁϥ` "amar / said", `ⲛϭⲓⲡⲛⲟⲩⲧⲉ` "Alahayam (God)" (the whole fused surface —
`ⲛϭⲓ` is a postposed-subject marker with no separate content once merged into one
token), `ϫⲉⲙⲁⲣⲉⲩⲟⲩⲉⲓⲛ` "hayah (be) awar (light)" (a three-morpheme fusion — recitative
`ϫⲉ` + causative jussive `ⲙⲁⲣⲉ` + the noun "light" — all packed into one surface token,
so one combined gloss rather than three fragments), `ϣⲱⲡⲉ` "hayah / became".

**Ge'ez**: `ወይቤ` "and amar / spoke" (new — distinct surface from the already-glossed
bare `ይቤ` "he said"), `ለይኩን` "hayah / let it be", `ወኮነ` "and hayah / became". Also
tightened the pre-existing `ብርሃን` entry from bare "light" to "awar / light" to match
this session's Translit-first convention.

**Greek**: `καὶ` "and", `Γενηθήτω` "hayah / let it be", `φῶς` "awar / light" — `εἶπεν`,
`θεός`, `ἐγένετο` were already curated from earlier work and left as-is.
