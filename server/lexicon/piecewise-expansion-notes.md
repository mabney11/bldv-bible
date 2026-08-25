# Lexicon piecewise-expansion notes (latin/syriac/geez-lexicon.json)

## Coptic dropped 2026-08-15 — see "why" below before reusing any Coptic notes

`server/lexicon/coptic-lexicon.json` was deleted and Coptic (COP) was fully removed as a
language/source across the app (server.js's SOURCES/GENERIC_GS_SOURCES/GS_LANG_LIST, the
reader, Parallel, Gloss Studio, Concordance, Search, the on-screen keyboard). Cause:
`corpus.db`'s COP rows were checked and found to be ~2.8% literal `"..."` placeholder text
corpus-wide, concentrated as high as 51.6% in some books (Nahum 16/31, Zechariah 60/145,
Daniel 40/111, Judith 20/63, Ezekiel 228/1067) — real gaps in the ingested Sahidic source,
not a rendering bug (confirmed directly against `corpus.db`, not inferred from the app).
Before dropping, confirmed every one of the 73 books with any COP text also has at least
one other original-language corpus (Latin/Syriac/Ge'ez/Greek/Hebrew) covering it — nothing
in the app was Coptic-exclusive, so removal loses no unique work, only the Sahidic-specific
rendering of works available elsewhere too. Fieldy, in production: "im in prod now, I need
the data or i scrap the entire language" → "lets drop it" → "full purge" (app-wide removal
+ delete every COP row from corpus.db + delete coptic-lexicon.json, not just hide it).
The Gen 1:2–1:3 Coptic entries logged below are kept as a historical record of the
piecewise-expansion methodology, not as live data — they no longer back anything running.

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
3. Entries go straight into `lexicon/{latin,syriac,geez}-lexicon.json` (Coptic dropped, see
   above), in the same `Translit (gloss)` shorthand already used throughout (e.g.
   `"Aratz (earth)"`).

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

## 2026-08-15 — Genesis 1:4, Latin/Syriac/Ge'ez/Greek (Coptic has no text this verse)

English (live): "Alahayam raah (saw) the entirety of the awar (light); kay (surely) it
was tawab (good / proper) function. And Alahayam badal (divided) bayan (between) the
awar (light) bayan (between) the chashak (darkness)." Five new content words this verse:
raah (saw), kay (that/surely), tawab (good), badal (divided), bayan (between).

**Coptic**: `dump-verse-tokens.js` returned an empty token list — no COP row exists for
Genesis 1:4 in `corpus.db` at all, not a gloss gap. Flagging rather than skipping
silently: worth checking later whether this is a real lacuna in the ingested Sahidic
source or a gap in ingestion, but out of scope for a lexicon-gloss pass — nothing to
align against.

**Latin**: `vidit` "raah / saw", `lucem` "awar / light" (accusative — separate key from
nominative `lux`), `quod` "kay / that", `esset` "—" (bare subjunctive copula in the
"quod esset bona" clause — same bare-auxiliary treatment as `est` in v3; `bona` alone
carries "good"), `bona` "tawab / good", `divisit` "badal / divided", `a` "bayan /
between", `tenebris` "chashak / darkness". Note: Latin's `divisit lucem a tenebris`
uses ONE preposition ("light FROM darkness"), where English's Hebraized idiom doubles
"bayan...bayan" ("between the light, between the darkness") — glossed `a` as the closest
match (bayan/between) rather than forcing a second, nonexistent token to carry it.

**Syriac**: filled 6 scaffolds — `ܘܚ̣ܙܐ` "and raah / saw", `ܠܢܘܗܪܐ` "awar / light"
(object-marked form, separate key from bare `ܢܘܗܪܐ`), `ܕܫܦܝܪ` "kay (that) tawab (good)"
(relative ܕ + shapir fused into one token, both concepts kept), `ܘܦ̣ܪܫ` "and badal /
divided", `ܒܝܬ` "bayan / between" (Syriac's single preposition covers what English
doubles, same economy as Latin's `a` above), `ܠܚܫܘܟܐ` "chashak / darkness".

**Ge'ez**: `ወርእዮ` "and raah / saw", `ለብርሃን` "awar / light" (object-marked, separate key
from bare `ብርሃን`), `ሠናይ` "tawab / good" (`ከመ` "that/so that/as" was already curated and
left as-is — already covers "kay"), `ወፈለጠ` "and badal / divided", `ማእከለ` "bayan /
between", `ወማእከለ` "and bayan / between" (separate key, ወ-prefixed second occurrence),
`ጽልመት` "chashak / darkness" (bare form — distinct from the already-glossed ወ-prefixed
`ወጽልመት` from Gen 1:2).

**Greek**: `ἴδεν` "raah / saw", `τὸ` "—" (neuter article — same bare-grammar treatment
as `ὁ`/`ἡ`), `ὅτι` "kay / that", `καλόν` "tawab / good", `διεχώρισεν` "badal / divided",
`ἀνὰ` "—" (half of the fixed idiom `ἀνὰ μέσον` "between" — all content lives in `μέσον`,
same idiom-piece rule as Coptic's `ⲉⲃⲟⲗ`/`ⲁⲛ`/`ⲡⲉ`), `μέσον` "bayan / between", `φωτὸς`
"awar / light" (genitive, separate key from nominative `φῶς`), `σκότους` "chashak /
darkness" (genitive, separate key from nominative `σκότος`). `θεὸς` (grave accent) needed
no new entry — `_canonKey`'s Greek grave→acute normalization already resolves it to the
existing `θεός` entry automatically.

## 2026-08-15 — Genesis 1:5, Latin/Syriac/Ge'ez/Greek

English (from Gloss Studio's browse pane): "And Alahayam () qaraa (called) the awar
(light) 'Yawam (Day),' and the chashak (darkness) He qaraa (called) 'Layalah (Night).'
Hayah (came) irab (evening) and hayah (came) baqar (morning) — yawam (day) achad (one)."
Four new content words: qaraa (called), Layalah (night), irab (evening), baqar
(morning), achad (one) — Yawam (day)/chashak (darkness)/hayah (became) already curated.

**Latin**: `Appellavitque` "and qaraa / called" (appellavit + enclitic -que, same
pattern as v3's `Dixitque`), `Diem` "Yawam / day" (accusative), `tenebras` "chashak /
darkness" (accusative — separate key from v4's ablative `tenebris`), `Noctem` "Layalah
/ night", `factumque` "and hayah / became", `vespere` "irab / evening", `mane` "baqar /
morning", `dies` "Yawam / day" (nominative, separate key from `Diem`), `unus` "achad /
one".

**Syriac**: filled 9 scaffolds — `ܘܩ̣ܪܐ` "and qaraa / called", `ܩ̣ܪܐ` "qaraa / called"
(bare, no waw — separate key), `ܐܝܡܡܐ` "Yawam / day" and `ܝܘܡܐ` "Yawam / day" (two
distinct Syriac day-words in this one verse — "Day" as a proper name vs. "day" as a
count unit — both map to the same transliterated concept), `ܘܠܚܫܘܟܐ` "and chashak /
darkness" (waw-prefixed, separate key from v4's `ܠܚܫܘܟܐ`), `ܠܠܝܐ` "Layalah / night",
`ܪܡܫܐ` "irab / evening", `ܨܦܪܐ` "baqar / morning", `ܚܕ` "achad / one". Also filled
`ܘܗܘܐ` (no combining dot — a distinct Unicode string from v3's `ܘܗܘ̣ܐ`, same meaning)
"and hayah / became".

**Ge'ez**: `ወሰመዮ` "and qaraa / called", `ዕለተ` and `መዓልተ` both "Yawam / day" (two
distinct Ge'ez day-words in one verse, same pattern as Syriac above), `ወለጽልመት` "and
chashak / darkness" (separate key from `ጽልመት`/`ወጽልመት`), `ሌሊተ` "Layalah / night",
`ወጸብሐ` "and baqar / morning" (from the root "to dawn"), `፩` "achad / one" (Ge'ez
numeral digit, U+1369).

**Greek**: `ἐκάλεσεν` "qaraa / called", `νύκτα` "Layalah / night", `ἑσπέρα` "irab /
evening", `πρωί` "baqar / morning", `μία` "achad / one". Also tightened pre-existing
`ἡμέραν` from "day (acc)" to "yawam / day" to match `ἡμέρα`'s own style and the
session's Translit-first convention.

Coptic step skipped entirely — dropped from the app 2026-08-15, see the section above.

## 2026-08-25 — Genesis 1:6, Latin/Syriac/Ge'ez/Greek

English (fieldy's own hand translation in Gloss Studio, replacing the prior machine
draft): "And amar (said) Alahayam (), 'Hayah (come into existence) Raqayai (firmament)
in the thawak (midst) of the mayam (waters), and mabadayal (cause separation) bayan
(between) mayam (the waters) to mayam (waters).'" Four new content words: Raqayai
(firmament), thawak (midst), mabadayal (cause/separate) — amar/Alahayam/Hayah/bayan/
mayam already curated from v1-v5.

**Sourcing note, this session only:** `device_bash` (the tool this agent normally runs
`node dump-verse-tokens.js` through) was down all session, same standing gotcha as
prior sessions — see the project's device_bash-reliability note. fieldy ran `node
dump-verse-tokens.js 1 1 6` himself on his own machine and pasted the raw output back
— still real tokens off `corpus.db`, not retyped from memory or a screenshot, just
sourced by fieldy's hand instead of this agent's own tool call. Flagging so a future
session doesn't assume this agent regained shell access.

**New pattern this verse — periphrastic "let it be [participle]" auxiliary, same rule
as `est`/`esset`.** V6's second clause ("and mabadayal...") is built in Latin, Greek,
and Syriac alike as [jussive "be"] + [present participle "dividing"], not a single
finite verb the way Latin's `dividat` (its OWN v6 rendering, see below) or v4's
`divisit`/`badal` were. Applying the same rule already used for Latin `est`/`esset`
(bare periphrastic copula → `"—"`, all content on the participle): the auxiliary
(Greek `ἔστω`, Syriac `ܘܢܗܘܐ`) gets `"—"`, the participle (Greek `διαχωρίζον`, Syriac
`ܦܪܫ̇`) carries `mabadayal / cause separation`. Latin doesn't need this split — its own
v6 uses the single finite subjunctive `dividat`, not a periphrastic, so it gets the
full gloss directly, same as `divisit` did in v4.

**Edition divergence, flagged not silently absorbed:** the Greek (LXX) and Ge'ez texts
both tack a "consummation formula" onto the end of v6 — `καὶ ἐγένετο οὕτως` / `ወኮነ
ከማሁ` ("and it was so") — that has no counterpart anywhere in this app's own v6
English (which follows the Masoretic Hebrew, where that clause belongs to v7, not v6).
Latin and Syriac's v6 tokens end cleanly at "waters" with no such tail. `ἐγένετο`/
`ወኮነ` already existed as curated keys (`hayah / it became`) and needed no change —
genuinely the same word, reused correctly in both contexts. The NEW words specific to
this tail (`οὕτως`, `ከማሁ`, both "thus/so") have no Hebrew root to transliterate
against at all, so per the "flag rather than guess" standard they got a plain English
gloss with no Translit prefix, same treatment as any other edition-only addition
(cf. Gen 1:2's flagged, unglossed Coptic `ⲉϥⲛⲁ`) — except here the meaning is not in
doubt (well-attested LXX/Ge'ez-vs-MT divergence at this verse), so a gloss was
confidently given rather than left as an empty scaffold entry.

**Latin**: `Dixit` "amar / said" + `quoque` "and" (this edition doesn't fuse them into
one `Dixitque` enclitic form the way v3 did — two separate tokens here, same meaning),
`Deus`/`Fiat`/`et`/`aquas` all already curated, reused unchanged. `firmamentum`
"Raqayai / firmament", `in` "in" (bare — no Hebrew root of its own in the English
here, same treatment as v2's `super` "over"), `medio` "thawak / midst", `aquarum`
"Mayam (waters)" (genitive — separate key from the existing accusative `aquas` and the
new ablative `aquis` below), `dividat` "mabadayal / cause separation" (single finite
verb, no periphrastic split needed — see above), `ab` "bayan / between" (stands in for
the Hebraized doubled "bayan...bayan" idiom with one preposition, same pattern as v4's
`a` — note `ab`/`a` are the same Latin word, before-consonant vs before-vowel spelling,
kept as separate surface-form keys per this file's existing convention), `aquis`
"Mayam (waters)" (ablative, third distinct case-form key for "waters" now in this
file alongside `aquas`/`aquarum`).

**Syriac**: `ܘܐܡ̣ܪ`/`ܐܠܗܐ`/`ܢܗܘܐ` already curated, reused unchanged. Filled 5 empty
scaffolds: `ܐܪܩܝܥܐ` "Raqayai / firmament", `ܒܡܨܥܬ` "in thawak / midst" (the `ܒ`-prefix
"in" is fused into this one token, unlike Latin/Greek where it's a separate word — so
the whole compound gets one combined gloss, same rule as any other fused-prefix
token in this file), `ܘܢܗܘܐ` "—" (periphrastic auxiliary, see above), `ܦܪܫ̇`
"mabadayal / cause separation" (the participle, see above), `ܠܡ̈ܝܐ` "Mayam (waters)"
(ܠ-prefixed "to the waters" — actually the clearest cross-language confirmation this
verse: Syriac's own `ܒܝܬ...ܠ` structure ("between water, to water") is exactly what
the English's own "bayan (between) mayam...to mayam" already mirrors). `ܡ̈ܝܐ` and
`ܒܝܬ` were already curated from earlier verses, reused unchanged.

**Ge'ez**: `ወይቤ`/`እግዚአብሔር`/`ለይኩን`/`ማይ`/`ከመ`/`ወኮነ` all already curated, reused
unchanged. `ማእከለ` (appears twice, bare, no `ወ`-prefix on either occurrence this verse)
kept its existing `bayan / between` gloss rather than adding a `thawak/midst`-specific
variant — Ge'ez's own `ማእከለ...ማእከለ` doubled construction genuinely covers both
"in the midst of" and "between X and Y" as one continuous idiom spanning the verse,
so this is the same kind of this-language's-own-economy case already documented
above for Latin/Coptic, not a real gap. New: `ጠፈር` "Raqayai / firmament", `ይፍልጥ`
"mabadayal / cause separation" (cognate root to the already-curated `ወፈለጠ`/`badal`
from v4-5, jussive form here), `ከማሁ` "thus / so" (the "and it was so" tail, see
edition-divergence note above).

**Greek**: `Καὶ`/`εἶπεν`/`ὁ`/`θεός`/`Γενηθήτω`/`ἐν`/`τοῦ`/`ὕδατος`/`ἀνὰ`/`μέσον`/
`ἐγένετο` all already curated, reused unchanged (all three `ὕδατος` occurrences in
this verse are the same genitive-singular surface form as the existing key). New:
`στερέωμα` "Raqayai / firmament", `μέσῳ` "thawak / midst" (dative — separate key from
the existing accusative `μέσον`, and a different sense besides: "in the midst of" here
vs. "between" in the `ἀνὰ μέσον` idiom), `ἔστω` "—" and `διαχωρίζον` "mabadayal /
cause separation" (periphrastic split, see above), `οὕτως` "thus / so" (edition-tail,
see above).
