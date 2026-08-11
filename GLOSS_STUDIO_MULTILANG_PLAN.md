# Scoping Gloss Studio beyond Hebrew

Written 2026-08-10, following up on the "Gloss Studio — context for next session" handoff.
That note flagged extending Gloss Studio (currently Hebrew-only) to Greek/Ge'ez/Latin/Syriac/
Coptic as its own dedicated project, "comparable in scope to the existing Hebrew pipeline, not
a quick add." This is that scoping pass — what already exists per language, what's actually
missing, and a recommended order. Nothing here is implemented yet.

## What Gloss Studio needs, structurally

Gloss Studio's coverage tree (`getGlossCoverage()`, server.js ~5523) is built from ONE query
(`GLOSS_COVERAGE_ROWS`) joining `surface_occurrences` (every token, by book/chapter/verse/
ordinal) to `token_surfaces` (one row per distinct rendered word, carrying `root_paleo` — the
thing coverage is actually measured against, not the raw surface form). Both tables live in
`surface-index.db`, built once by `build-surface-index.js` + `heb-align.js` from `tokens_bhs`/
`tokens_nt` (themselves Strong's-tagged per-token data). "Glossed" is then computed per root via
`gsIsGlossed()` against the three curated Hebrew lexicon files.

So the real dependency chain, per language, is:

1. **Per-token morphological data** — something that says, for every word in every verse,
   what its lemma/root and Strong's number are. Without this there's nothing to group
   occurrences by, and coverage can only ever be measured per raw surface string (which
   doesn't compound the way Hebrew's root-based counting does — see the Ge'ez note below).
2. **A root/lemma → rendered-word reconstruction step**, analogous to `apply-web-strongs.mjs`'s
   additive-morpheme logic — needed only for languages this app TRANSLITERATES into Hebrew's
   own display convention (paleo-Hebrew glyphs, prefix/suffix chips). Greek/Latin/Syriac/Coptic
   are NOT transliterated this way; they render in their own native script. So this step is
   Hebrew-specific and doesn't generalize — good news, it's the single largest chunk of the
   ~4,000 lines across `build-surface-index.js`/`heb-align.js`/`apply-web-strongs.mjs` and the
   entire "no-eliding" rule history in CLAUDE.md.
3. **A `surface_occurrences`/`token_surfaces`-equivalent table** (or a source-partitioned
   extension of the existing ones) so `GLOSS_COVERAGE_ROWS` can include the new language without
   a second, parallel coverage-computation code path.
4. **A curated gloss source** to check completeness against — this part already exists for every
   language (see below), it just isn't wired to anything root/lemma-aware yet.
5. **Frontend**: flip the relevant `enabled: false` in `GlossStudio.jsx`'s `LANGS` array once (1)-
   (4) exist for that language.

## What already exists per language (found by inspection, not assumed)

This is more than the handoff note implied — worth correcting the record before scoping effort:

- **Greek (GNT)** — `morph-grc.db` already has real, complete token-level data: 140,149 words
  across the 27 NT books, each with `lemma`, `strongs`, `parse` (morph code), `pos_name`, and a
  bundled Dodson `gloss` (Robinson-Pierpont Byzantine text). This is already wired into the live
  reader (`_attachGrcToVerse`/`_attachGrcToChapter`, server.js ~4100) to enrich Greek NT tokens on
  the fly. **This is functionally equivalent to what `tokens_bhs` gives Hebrew** — the hard part
  (getting a lemmatized, Strong's-tagged corpus) is already done. `greek-lexicon.json` is a small
  curated surface→gloss overlay (~150 entries) already read by `_lookupGloss('greek', lemma)` and
  preferred over the bundled Dodson gloss when present — i.e. Greek already has both the raw data
  AND the curation mechanism Hebrew has; it's missing only the surface-index/coverage-tree layer.
- **Ge'ez** — `geez-lexicon.json` has ~250 curated surface-form entries (added in the 2026-08-01
  Melchizedek batch, sourced from general Ge'ez/comparative-Semitic knowledge, NOT verified
  against a live dictionary — 7 entries explicitly flagged `(uncertain)`). No token-level
  lemma/morphology database exists at all (nothing like `morph-grc.db`) — every entry is a
  literal inflected surface form. `geez-lexicon-notes.md`'s own "Architectural note" already
  says this doesn't scale root-based the way Hebrew's does, and that a real fix needs "a Ge'ez
  root/lemma system analogous to the Hebrew pipeline... a much larger undertaking."
- **Latin** — `latin-lexicon.json` is essentially an empty template (6 example entries, mostly
  doc-comment). No morphology data. Lowest existing investment of the five.
- **Syriac** — `syriac-lexicon.json` is 1.7MB / 67,017 keys, which looks substantial until you
  check the values: **every single one is an empty string.** This is a bulk vocabulary
  extraction (every distinct surface form in the Syriac corpus, pre-populated as keys) with zero
  actual glosses filled in — a scaffold, not curated content. No morphology data either.
- **Coptic** — same situation as Syriac: `coptic-lexicon.json` is 2.6MB / 75,496 keys, **100%
  empty values**. Vocabulary scaffold only, no morphology data, zero curated glosses.

Net: Greek is a fundamentally different, much smaller problem than the other four (real
morphology data already exists, just needs a surface-index layer built on top). Ge'ez has some
real curated content but no morphology data and an explicit prior note that scaling it requires
a dedicated root/lemma system. Latin/Syriac/Coptic have essentially nothing usable yet — Syriac
and Coptic's large files are a false signal of progress (they're word LISTS, not glosses) and
would need real lexicographic sourcing before any tokenization pipeline is worth building on top.

## Recommended order

1. **Greek — build the surface-index layer on `morph-grc.db`, nothing else blocking.**
   This is the only language where step 1 (per-token morphological data) is already done to
   Hebrew-OT-grade completeness. Concretely: a `build-surface-index-grc.js` (or a `--grc` flag
   on the existing script) that reads `morph-grc.db`'s `words` table directly — no alignment
   ambiguity to resolve, no weak-root/homograph tier logic needed, because Greek isn't being
   reconstructed into a different script the way Hebrew's paleo rendering is; it's just grouping
   existing (word, lemma, strongs) rows into the same `token_surfaces`/`surface_occurrences`
   shape, keyed by `lemma` instead of `root_paleo`. `gsIsGlossed()`'s candidate-key logic would
   need a Greek-shaped equivalent (lemma + Strong's + POS, checked against `greek-lexicon.json`).
   Realistically the smallest of the five by a wide margin — no new dictionary data needs
   sourcing, only a new (smaller, simpler) version of a script that already exists.
2. **Ge'ez — real root/lemma system, deliberately scoped separately.** `geez-lexicon-notes.md`
   already recommends this exact next step. Needs actual lexicographic sourcing (Leslau's
   *Comparative Dictionary of Ge'ez*, Dillmann, or Beta Masaheft's tooling) before a coverage
   system is meaningful — building the pipeline first, with no real root data to check against,
   would just produce a coverage tree that says "0% glossed" everywhere and isn't actionable.
3. **Latin / Syriac / Coptic — not ready to scope a pipeline for yet.** These need real
   dictionary/gloss sourcing first (Syriac and Coptic already have the FULL vocabulary extracted
   as keys, so that part is done — what's missing is filling in actual glosses, which is a
   content problem, not an engineering one). Revisit once there's a real curated lexicon to
   measure coverage against; building tokenization infrastructure ahead of that would be
   scaffolding with nothing to scaffold.

## Suggested next concrete step

Build the Greek surface-index layer (item 1). It's the one case where "comparable in scope to
the Hebrew pipeline" does NOT apply — the expensive part (a lemmatized, Strong's-tagged corpus)
already exists and is already live in the reader. This would also be a good place to find out
whether `GLOSS_COVERAGE_ROWS` / `getGlossCoverage()` generalizes cleanly to a second language
sharing the same tables (source-partitioned like BHS/HEB already are) or needs its own tree —
useful signal before deciding how Ge'ez's eventual pipeline should be wired in.

## Open questions for fieldy before starting

- Confirm Greek is actually the priority — it's the technically cheapest, but if reading
  quality on Ge'ez/Syriac/Coptic texts matters more right now, that changes the order.
- For Greek: `token_surfaces`/`surface_occurrences` are currently declared Hebrew-shaped
  (`root_paleo`, paleo `components`) — worth deciding whether to reuse the same two tables with
  a `source='GRC'` partition (mirroring the existing BHS/HEB split) or give Greek its own
  table pair, before writing the script either way.
- None of this has been prototyped or tested against real data beyond the inspection above —
  treat the Greek effort estimate as "smallest of the five," not "small" outright.
