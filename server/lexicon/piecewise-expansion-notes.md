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

**Correction, same day — the English text this pass first aligned against was already
stale.** fieldy later pulled the actual v6 English straight from PROD's `translation.db`
(explicit instruction: prod, not dev, is the source of truth) and it reads "...and
**hayah (came to pass)** mabadayal (the separation) bayan (between) mayam..." — an extra
`hayah (came to pass)` clause this agent's first pass never saw (it worked from the
Gloss Studio screenshot text, captured before fieldy's own further edit to the verse,
and "cause separation" vs. the real "the separation" wording). This matters because the
first pass treated Greek `ἔστω`/Syriac `ܘܢܗܘܐ` as bare periphrastic auxiliaries (`"—"`,
content fully absorbed by the following participle) — reasonable given the text it had,
but wrong once the real English shows that clause DOES have its own independent English
word. Both are now corrected below (`ἔστω`/`ܘܢܗܘܐ` → `hayah / came to pass`); every
`mabadayal / cause separation` in this verse was also retextured to `mabadayal / the
separation` to match prod's actual wording exactly. General lesson: prefer pulling the
English straight from `translation.db` over trusting a screenshot or an in-session copy
that might predate a later hand-edit — same "never guess, always verify" standard this
file already holds tokens to, just as true for the English side of the alignment.

**Pattern this verse — periphrastic "let it be [participle]" auxiliary, corrected.**
V6's second clause ("and hayah (came to pass) mabadayal...") is built in Latin, Greek,
and Syriac alike as [jussive "be"] + [present participle "dividing"], not a single
finite verb the way Latin's `dividat` (its OWN v6 rendering, see below) or v4's
`divisit`/`badal` were — but UNLIKE Latin `est`/`esset` in v3/v4 (still correctly bare
`"—"`, since that English never named the copula separately), this clause's auxiliary
DOES have its own independent English word (`hayah (came to pass)`), so it gets a real
gloss rather than `"—"`: Greek `ἔστω` → `hayah / came to pass`, Syriac `ܘܢܗܘܐ` → `hayah
/ came to pass`; the participle carries the other half, Greek `διαχωρίζον` / Syriac
`ܦܪܫ̇` → `mabadayal / the separation`. Latin doesn't need this split — its own v6 uses
the single finite subjunctive `dividat`, which fuses both concepts into one word (same
as `Dixitque` fusing "and"+"said" in v3), so it gets the combined gloss directly, same
as `divisit` did in v4.

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
new ablative `aquis` below), `dividat` "mabadayal / the separation" (single finite
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
token in this file), `ܘܢܗܘܐ` "hayah / came to pass" (periphrastic auxiliary, see
above), `ܦܪܫ̇` "mabadayal / the separation" (the participle, see above), `ܠܡ̈ܝܐ` "Mayam (waters)"
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
"mabadayal / the separation" (cognate root to the already-curated `ወፈለጠ`/`badal`
from v4-5, jussive form here — single fused verb like Latin's `dividat`, no periphrastic
split needed), `ከማሁ` "thus / so" (the "and it was so" tail, see edition-divergence
note above).

**Greek**: `Καὶ`/`εἶπεν`/`ὁ`/`θεός`/`Γενηθήτω`/`ἐν`/`τοῦ`/`ὕδατος`/`ἀνὰ`/`μέσον`/
`ἐγένετο` all already curated, reused unchanged (all three `ὕδατος` occurrences in
this verse are the same genitive-singular surface form as the existing key). New:
`στερέωμα` "Raqayai / firmament", `μέσῳ` "thawak / midst" (dative — separate key from
the existing accusative `μέσον`, and a different sense besides: "in the midst of" here
vs. "between" in the `ἀνὰ μέσον` idiom), `ἔστω` "hayah / came to pass" and
`διαχωρίζον` "mabadayal / the separation" (periphrastic split, see above), `οὕτως`
"thus / so" (edition-tail, see above).

## 2026-08-25 — Hebrew (extra), added as a FIFTH piecewise-expansion language

`server.js`'s `SOURCES.HEB` ("Hebrew (extra)") is a separate, unsegmented Hebrew
corpus edition, read through the exact same generic `splitTextToTokens()`+
`_lookupGloss('paleo-hebrew', word)` path as Latin/Syriac/Ge'ez/Greek — i.e. it only
checks `hebrew-extra-lexicon.json` (a flat curated overlay), with NO connection to
BHS's own Strong's/root/homograph pipeline. fieldy flagged the resulting gloss
coverage in Translation Studio's Word Links panel as inconsistent (some HEB tokens
showed a translit+gloss, most didn't) and asked for it to be treated like a fifth
piecewise-expansion language rather than wired to fall back onto BHS's system —
**compound-phrase style, matching Syriac**, not BHS's granular root/prefix/suffix
decomposition. His own example: `𐤅𐤉𐤀𐤌𐤓` (vayomer, "and-he-said") → `"and he amar /
said"`, one whole-token gloss, not split into waw/yod-prefix/root pieces.

**House style already established in the file, discovered rather than invented:**
`hebrew-extra-lexicon.json` already had a handful of real entries scattered through
its ~56k-key scaffold (mostly empty strings) from earlier, undocumented work —
`"𐤀𐤋𐤄𐤉𐤌": "Alahayam / God"`, `"𐤅𐤉𐤄𐤉": "Hayah / and it came to pass"`, `"𐤅𐤉𐤒𐤓𐤀":
"Qaraa / and He called"`, `"𐤒𐤓𐤀": "Qaraa / called"`, `"𐤋𐤀𐤅𐤓": "Awar / for the
light"`, `"𐤅𐤋𐤇𐤔𐤊": "Chashak / and for the darkness"`, `"𐤋𐤉𐤋𐤄": "Layalah / night"`,
`"𐤏𐤓𐤁": "Irab / evening"`, `"𐤁𐤒𐤓": "Baqar / morning"`, `"𐤀𐤇𐤃": "Achad / one"` — this
is Genesis 1:5 in full, already fully curated before this session touched it, which
explains why the Word Links screenshot that started this showed a MIX of labeled and
blank chips rather than a uniformly empty verse. Two conventions read directly off
these real entries, followed rather than reinvented: (1) the translit half is
**Capitalized** (`Alahayam`, `Qaraa`, `Awar`...) — unlike the other four language
files, which use lowercase translit (`amar`, `bayan`...); this file's own established
practice wins for its own entries. (2) a waw-consecutive/vayyiqtol verb (explicit
imperfect-prefix morpheme, narrative "and X-ed") gets its subject spelled out —
`"and He called"` when the subject is God, `"and it came to pass"` when impersonal —
matching fieldy's own `"and he amar / said"` example exactly. Two pre-existing entries
used an OLDER, incomplete style (bare English, no translit: `"𐤀𐤕": "entirety"`,
`"𐤁𐤓𐤀𐤔𐤉𐤕": "in the beginning"`) — upgraded both to the dominant Capitalized-Translit
convention for consistency (`"AthaHa / the entirety of"`, `"Raashayath / in the
beginning"`), same "Raashayath" spelling already used for this exact word in
Ge'ez/Latin's own entries.

**Sourcing:** `dump-verse-tokens.js` extended this session (see below) to also dump
`HEB` tokens for a verse — real tokens off `corpus.db`, already stored in Paleo script
(no square→paleo conversion needed, unlike what this agent expected going in). fieldy
also pulled Genesis 1:1-6's English straight from PROD's `translation.db` this session
(see the Gen 1:6 correction note above) — that prod text is what every verse below was
aligned against, not the locally-cached copies this file had from earlier sessions.

**Genesis 1:1** ("In the raashayath (beginning), Alahayam () baraa (created) 𐤀𐤕 (the
entirety of) the Shamayam (Heavens) and 𐤀𐤕 (the entirety of) the Aratz (Earth)."):
tokens `𐤁𐤓𐤀𐤔𐤉𐤕`/`𐤁𐤓𐤀`/`𐤀𐤋𐤄𐤉𐤌`/`𐤀𐤕`/`𐤄𐤔𐤌𐤉𐤌`/`𐤅𐤀𐤕`/`𐤄𐤀𐤓𐤑`. `𐤀𐤋𐤄𐤉𐤌` already curated
(Alahayam), reused. Note the English literally embeds the bare Paleo glyphs `𐤀𐤕` as
its own gloss parenthetical ("𐤀𐤕 (the entirety of)") rather than a phonetic
transliteration — this app's convention for the untranslatable definite-object marker
everywhere else is the transliteration "AthaHa" (see Greek `τήν`/`τόν`: "AthaHa - the
entirety of"), so `𐤀𐤕`/`𐤅𐤀𐤕` got that same transliteration rather than a
self-referential Paleo-to-Paleo "gloss." New/upgraded: `𐤁𐤓𐤀𐤔𐤉𐤕` "Raashayath / in the
beginning" (upgrade), `𐤁𐤓𐤀` "Baraa / created", `𐤀𐤕` "AthaHa / the entirety of"
(upgrade), `𐤄𐤔𐤌𐤉𐤌` "HaShamayam / the heavens", `𐤅𐤀𐤕` "and AthaHa / the entirety of",
`𐤄𐤀𐤓𐤑` "HaAratz / the earth".

**Genesis 1:2:** tokens `𐤅𐤄𐤀𐤓𐤑`/`𐤄𐤉𐤕𐤄`/`𐤕𐤄𐤅`/`𐤅𐤁𐤄𐤅`/`𐤅𐤇𐤔𐤊`/`𐤏𐤋`/`𐤐𐤍𐤉`/`𐤕𐤄𐤅𐤌`/
`𐤅𐤓𐤅𐤇`/`𐤀𐤋𐤄𐤉𐤌`/`𐤌𐤓𐤇𐤐𐤕`/`𐤏𐤋`/`𐤐𐤍𐤉`/`𐤄𐤌𐤉𐤌` — this Hebrew vocabulary is the most
direct 1:1 match to the English of any of the five languages, since the English reading
text's own transliterated words ARE these Hebrew roots. `𐤀𐤋𐤄𐤉𐤌` reused. `𐤏𐤋`/`𐤐𐤍𐤉`
each appear twice, one entry each covers both. New: `𐤅𐤄𐤀𐤓𐤑` "and HaAratz / the
earth", `𐤄𐤉𐤕𐤄` "Hayathah / became" (matches the English's own "hayathah (became)"
exactly), `𐤕𐤄𐤅` "Thahaw / formless", `𐤅𐤁𐤄𐤅` "and Bahaw / void", `𐤅𐤇𐤔𐤊` "and Chashak
/ darkness", `𐤏𐤋` "over" (bare functional word, no translit content of its own — same
treatment as "over"/"in" in the other four languages), `𐤐𐤍𐤉` "Panayam / face", `𐤕𐤄𐤅𐤌`
"Thahawam / the depths", `𐤅𐤓𐤅𐤇` "and Rawach / spirit", `𐤌𐤓𐤇𐤐𐤕` "Marachapath /
hovered", `𐤄𐤌𐤉𐤌` "HaMayam / the waters".

**Genesis 1:3:** tokens `𐤅𐤉𐤀𐤌𐤓`/`𐤀𐤋𐤄𐤉𐤌`/`𐤉𐤄𐤉`/`𐤀𐤅𐤓`/`𐤅𐤉𐤄𐤉`/`𐤀𐤅𐤓`. `𐤀𐤋𐤄𐤉𐤌` reused;
`𐤅𐤉𐤄𐤉` and the second `𐤀𐤅𐤓` were ALREADY curated (`"Hayah / and it came to pass"`,
reusing the first `𐤀𐤅𐤓` entry below) — left unchanged. New: `𐤅𐤉𐤀𐤌𐤓` "and He Amar /
said" (fieldy's own example token, applied verbatim), `𐤉𐤄𐤉` "Hayah / let it be"
(distinct key/sense from `𐤅𐤉𐤄𐤉`'s "and it came to pass" — same root, different form:
jussive vs. waw-consecutive), `𐤀𐤅𐤓` "Awar / light".

**Genesis 1:4:** tokens `𐤅𐤉𐤓𐤀`/`𐤀𐤋𐤄𐤉𐤌`/`𐤀𐤕`/`𐤄𐤀𐤅𐤓`/`𐤊𐤉`/`𐤈𐤅𐤁`/`𐤅𐤉𐤁𐤃𐤋`/`𐤀𐤋𐤄𐤉𐤌`/
`𐤁𐤉𐤍`/`𐤄𐤀𐤅𐤓`/`𐤅𐤁𐤉𐤍`/`𐤄𐤇𐤔𐤊`. `𐤀𐤋𐤄𐤉𐤌` and `𐤀𐤕` reused (from v1); `𐤄𐤀𐤅𐤓`/`𐤁𐤉𐤍` each
appear twice, one entry each. New: `𐤅𐤉𐤓𐤀` "and He Raah / saw" (same
subject-spelled-out treatment as `𐤅𐤉𐤀𐤌𐤓`), `𐤄𐤀𐤅𐤓` "HaAwar / the light" (distinct key
from v3's bare `𐤀𐤅𐤓`), `𐤊𐤉` "Kay / that", `𐤈𐤅𐤁` "Tawab / good", `𐤅𐤉𐤁𐤃𐤋` "and He
Badal / divided", `𐤁𐤉𐤍` "Bayan / between", `𐤅𐤁𐤉𐤍` "and Bayan / between", `𐤄𐤇𐤔𐤊`
"HaChashak / the darkness".

**Genesis 1:5:** tokens `𐤅𐤉𐤒𐤓𐤀`/`𐤀𐤋𐤄𐤉𐤌`/`𐤋𐤀𐤅𐤓`/`𐤉𐤅𐤌`/`𐤅𐤋𐤇𐤔𐤊`/`𐤒𐤓𐤀`/`𐤋𐤉𐤋𐤄`/`𐤅𐤉𐤄𐤉`/
`𐤏𐤓𐤁`/`𐤅𐤉𐤄𐤉`/`𐤁𐤒𐤓`/`𐤉𐤅𐤌`/`𐤀𐤇𐤃` — as noted above, every one of these was ALREADY
curated before this session (the pre-existing entries this whole section discovered).
No new entries needed; verified all thirteen tokens resolve, none left as a stray
empty scaffold.

**Genesis 1:6:** tokens `𐤅𐤉𐤀𐤌𐤓`/`𐤀𐤋𐤄𐤉𐤌`/`𐤉𐤄𐤉`/`𐤓𐤒𐤉𐤏`/`𐤁𐤕𐤅𐤊`/`𐤄𐤌𐤉𐤌`/`𐤅𐤉𐤄𐤉`/
`𐤌𐤁𐤃𐤉𐤋`/`𐤁𐤉𐤍`/`𐤌𐤉𐤌`/`𐤋𐤌𐤉𐤌` — 11 tokens, matching the Masoretic text's own 11 words
exactly (וַיֹּאמֶר אֱלֹהִים יְהִי רָקִיעַ בְּתוֹךְ הַמָּיִם וִיהִי מַבְדִּיל בֵּין מַיִם
לָמָיִם), no textual variant. Five already curated and reused unchanged: `𐤅𐤉𐤀𐤌𐤓`
(same key as v3's "and He Amar / said"), `𐤀𐤋𐤄𐤉𐤌` (Alahayam), `𐤉𐤄𐤉` (same key as v3's
"Hayah / let it be"), `𐤄𐤌𐤉𐤌` (same key as v2's "HaMayam / the waters"), `𐤅𐤉𐤄𐤉` (same
key as v3/v5's "Hayah / and it came to pass") — five of this verse's eleven words are
literally the same surface forms already glossed for earlier verses, the strongest
concordance-style payoff yet of curating this file by real surface form rather than
per-verse. New: `𐤓𐤒𐤉𐤏` "Raqayai / firmament", `𐤁𐤕𐤅𐤊` "in Thawak / midst" (ב+תוך
fused into one token, same combined-gloss treatment as Syriac's `ܒܡܨܥܬ` for this exact
concept), `𐤌𐤁𐤃𐤉𐤋` "Mabadayal / the separation" (hiphil participle "dividing" — this
Hebrew word IS the literal source of the English gloss's own "mabadayal," about as
direct a confirmation of the mapping as this project gets), `𐤁𐤉𐤍` reused ("Bayan /
between", already curated from v4), `𐤌𐤉𐤌` "Mayam / waters" (bare, no ה־ article —
distinct key from `𐤄𐤌𐤉𐤌`/HaMayam), `𐤋𐤌𐤉𐤌` "LaMayam / to the waters" (ל־ "to" prefix
— matches the English's own "to mayam (waters)" ending, and confirms the same
ל-prefix "to X" pattern already used for Syriac's `ܠܡ̈ܝܐ` in this verse).

Genesis 1:1-6 is now fully curated for Hebrew (extra), matching the other four
languages' coverage.

## 2026-08-25 — Genesis 1:7, Latin/Syriac/Ge'ez/Greek/Hebrew (extra)

English (fieldy's own hand translation, pulled from PROD's `translation.db` directly —
same "prod, not dev" standard as v6's correction): "And so ishah (made) Alahayam ()
𐤀𐤕 (the entirety of) the raqayai (firmament), and badal (separated) bayan (between)
the mayam (water) ashar (that) is from thachath (under) the raqayai (firmament) and
bayan (between) the mayam (waters) ashar (that) are from il (above) the raqayai
(firmament) — WaYaHayah (and this came to pass) Kan (for sure)." Tokens fetched via
`node dump-verse-tokens.js 1 1 7`, all five languages including HEB.

**Edition divergence, confirmed not just flagged this time.** V6's note predicted that
Greek/Ge'ez, having already tacked their "and it was so" tail onto the END of v6
(`καὶ ἐγένετο οὕτως` / `ወኮነ ከማሁ`, a LXX/Ge'ez-vs-Masoretic versification difference —
that clause belongs to v7 in the Hebrew/Latin/Syriac numbering), would NOT repeat it
here. Confirmed: v7's Greek/Ge'ez token lists have no `οὕτως`/`ከማሁ` this time, while
Latin/Syriac/Hebrew (extra) — which follow the Masoretic placement — all DO carry
their own "thus/so" word in v7 (`ita`/`ܗܟܢܐ`/`𐤊𐤍`, all new this verse, all glossed
`kan / for sure` matching fieldy's own `Kan (for sure)`).

**Reuse note — Greek's `ἐποίησεν`/`ἦν`.** V7 needs "made" and "was/were", and the
Greek text reuses the same `ἐποίησεν` ("Baraa - created", from v1) and `ἦν` ("became",
from v2) already curated for different English words in earlier verses — a real
language-economy mismatch (Greek doesn't lexically distinguish "created" from "made"
the way fieldy's English's `baraa`/`ishah` split does), not a mistake to fix. Left both
keys unchanged rather than overwriting v1/v2's meaning to chase this verse's nuance;
same principle as v6's `ἐγένετο`/`ወኮነ` reuse.

**Bare-grammar `"—"` calls, Latin `his` / Syriac `ܡܢ`.** Latin's `ab his, quæ erant
super firmamentum` ("from these, which were above...") and Syriac's mirroring `ܡܢ`
("from") both carry no independent word in fieldy's English — the English's own
`bayan (between)`/`il (above)` already cover the whole sense, same as v3/v4's bare
`est`/`esset`. Kept as `"—"`, not stretched into a translit that isn't really there.

**Latin**: `Et`/`Deus`/`firmamentum`/`aquas`/`erant`/`ab`/`super`/`est` all already
curated, reused unchanged (`firmamentum` covers both the object of `fecit` and the
`super firmamentum` occurrence — same accusative surface form). New: `fecit`
"ishah / made", `divisitque` "and badal / separated", `quæ` "ashar / that" (covers
both relative-clause occurrences, same surface form), `sub` "thachath / under",
`firmamento` "Raqayai / firmament" (ablative — separate key from the existing
accusative `firmamentum`, same case-variant convention as `aquas`/`aquarum`/`aquis`),
`his` "—" (see above), `factum` "hayah / came to pass", `ita` "kan / for sure".

**Syriac**: `ܐܪܩܝܥܐ` (Raqayai/firmament) and `ܦܪܫ̇` (mabadayal/the separation) both
already curated from v6, reused unchanged. `ܘܗܘ̣ܐ` — checked byte-for-byte against
the combining-mark form already curated in v3 (`"and hayah / became"`) — is an exact
match, reused unchanged, no new key needed. New: `ܘܥܒ̣ܕ` "and ishah / made", `ܕܠܬܚܬ`
"thachath / under", `ܡܢ` "—" (see above), `ܘܒܝܬ` "and bayan / between", `ܕܠܥܠ`
"il / above", `ܗܟܢܐ` "kan / for sure".

**Ge'ez**: `ጠፈር` (Raqayai/firmament) and `ይፍልጥ` (mabadayal/the separation) already
curated from v6, reused unchanged, along with `ማይ`/`ማእከለ`. New: `ወገብረ` "and ishah /
made" (distinct key from the unrelated pre-existing `ገብረ` "baraa - created" — fieldy's
own word choice for this verse is `ishah`, not `baraa`, so this is its own key/gloss
rather than a reuse), `ጠፈረ` "Raqayai / firmament" (accusative/oblique — separate key
from the bare `ጠፈር`, same case-variant convention as everywhere else in this file),
`ዘታሕተ` "thachath / under" (relative pronoun `ዘ` fused onto `under`, one combined
gloss, same treatment as this file's other fused-prefix tokens), `ዘመልዕልተ`
"il / above" (same fused-relative pattern).

**Greek**: `καὶ`/`ἐποίησεν`/`ὁ`/`θεὸς`/`τὸ`/`στερέωμα`/`διεχώρισεν`/`ἀνὰ`/`μέσον`/
`τοῦ`/`ὕδατος`/`ἦν`/`τοῦ`/`ἐπάνω`/`τοῦ` all already curated, reused unchanged (see
the `ἐποίησεν`/`ἦν` economy note above). New: `ὃ` "ashar / that", `ὑποκάτω`
"thachath / under", `στερεώματος` "Raqayai / firmament" (genitive — separate key from
the existing nominative/accusative `στερέωμα`).

**Hebrew (extra)**: Masoretic Gen 1:7 is 17 words (וַיַּעַשׂ אֱלֹהִים אֶת הָרָקִיעַ
וַיַּבְדֵּל בֵּין הַמַּיִם אֲשֶׁר מִתַּחַת לָרָקִיעַ וּבֵין הַמַּיִם אֲשֶׁר מֵעַל
לָרָקִיעַ וַיְהִי כֵן) and this verse's corpus tokens match it 1:1, no textual
variant. Ten already curated, reused unchanged: `𐤀𐤋𐤄𐤉𐤌` (Alahayam), `𐤀𐤕` (AthaHa),
`𐤅𐤉𐤁𐤃𐤋` (and He Badal / divided — same key as v4), `𐤁𐤉𐤍` (Bayan / between — same
key as v4/v6), `𐤄𐤌𐤉𐤌` (HaMayam / the waters — same key as v2/v6, appears twice this
verse), `𐤅𐤉𐤄𐤉` (Hayah / and it came to pass — same key as v3/v5/v6). New: `𐤅𐤉𐤏𐤔`
"and He Ishah / made" (same vayyiqtol subject-spelled-out treatment as `𐤅𐤉𐤀𐤌𐤓`/
`𐤅𐤉𐤓𐤀`/`𐤅𐤉𐤁𐤃𐤋`), `𐤄𐤓𐤒𐤉𐤏` "HaRaqayai / the firmament" (ה־ article fused, distinct
key from v6's bare `𐤓𐤒𐤉𐤏`), `𐤀𐤔𐤓` "Ashar / that" (covers both occurrences, same
surface form), `𐤌𐤕𐤇𐤕` "MiThachath / from under" (מ־ "from" prefix fused, matching
this file's own established fused-prefix convention, e.g. v6's `𐤁𐤕𐤅𐤊`/`𐤋𐤌𐤉𐤌`),
`𐤋𐤓𐤒𐤉𐤏` "LaRaqayai / to the firmament" (ל־ prefix fused, covers both occurrences),
`𐤌𐤏𐤋` "MeIl / above" (מ־ "from" + `il`, matching the same shared `il` root used for
this concept in Latin/Syriac/Ge'ez this verse — fieldy's own English spelling, not a
literal transliteration of Hebrew על), `𐤊𐤍` "Kan / for sure" (matches fieldy's own
`Kan (for sure)` exactly).

Genesis 1:7 is now fully curated across all five languages. Confirms the v6 divergence
note's prediction (Greek/Ge'ez's "thus" tail lands in v6, not v7) rather than just
asserting it.
