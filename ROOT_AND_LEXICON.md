# True Root & Lexicon: the source-of-truth design

This document describes how word **roots** and **translations** are resolved,
after the standardization pass. The short version:

> **All text comes from the lexicon JSONs. The true root of every word shines
> through in the rendering, regardless of what the surface token looks like.**

## The two layers

```
        lexicon/lexicon.json          ← gloss per true root
        lexicon/homographs.json       ← disambiguated gloss per root+morphology / root+SN
        lexicon/strongs-roots.json    ← canonical root consonants per Strong's number
                    │
                    ▼
   server.js : parseHebrewData()      ← THE source of truth
                    │   resolves true root, picks gloss, emits components[]
                    ▼
   surface-index.db : token_surfaces  ← cached components[] + root_paleo
                    │
                    ▼
   React client                       ← renders ONLY what the server sent.
                                         No linguistic tables. No re-derivation.
```

The server decides; the database caches the server's decision; the client
draws it. There is exactly one brain.

## Resolution order (server, `parseHebrewData`)

### True root (which consonants are the root)

1. **`strongs-roots.json`** — canonical root for the token's Strong's number,
   used when its first consonant matches the stripped surface (guards against a
   wrong SN injecting an unrelated root). This catches cases where suffix
   stripping ate a root radical — e.g. `nme=WT` strips `𐤅𐤕` from `𐤋𐤇𐤅𐤕`
   leaving `𐤋𐤇`, but `strongs-roots` says the root is `𐤋𐤅𐤇`, so the full
   root is restored.
2. **`STRONGS_NO_MUTATE`** — SNs whose stripped surface already *is* the root
   (so the mutation table must not touch them).
3. **`MUTATED_ROOTS`** — hand-curated contraction/assimilation table
   (hollow Ayin-Waw, Pe-Nun, lamed-Hay, …), used only when `strongs-roots`
   has no entry. **Kept as a fallback**, not the primary source.
4. **`displayRoot`** — the surface after affix stripping, as a last resort.

The chosen value is `trueRoot`, and it is what the root component renders.

### Translation (which gloss to show)

For the **root** component:

1. **`homographs.json`** keyed by SN (`H1234`, `H1234_verb`, `H1234_qal_perfect`) —
   most authoritative disambiguator for true homographs sharing root letters.
2. **`homographs.json`** keyed by root + morphology tiers
   (`root_noun_feminine`, `root_qal`, `root_verb`, …).
3. **`lexicon.json[trueRoot]`**, then `lexicon[surface]`, then `lexicon[displayRoot]`.
4. **`[bracketed trueRoot]`** placeholder if nothing matched.

For **standalone particles** (conj / prep / art):

1. **`homographs.json`** (`𐤅_conjunction`, `𐤁_preposition`, `𐤄_article`).
2. **`lexicon.json[surface]`**.
3. **`GRAMMAR_MAP`** hardcoded table — **fallback only** (was primary before).
4. **`[bracketed surface]`** placeholder.

> The previously-unconditional inline hack `𐤀𐤋𐤄𐤉𐤌 → "god"` is now demoted: it
> only fires if the lexicon produced nothing. Curated data always wins.

## "The true root shines through" — what the glyph line shows

When a word has prefixes/suffixes, the main glyph line renders:

```
[prefix glyphs] · [ TRUE ROOT glyphs ] · [suffix glyphs]
```

The root slot shows `component.paleo`, which the server set to the **true root**
— even when that differs from the letters actually present in the surface form.

Example — `𐤀𐤁𐤀𐤌` (wayyabo + 3mp suffix, H935, a hollow root):

| | value |
|---|---|
| surface (`word_raw`) | `𐤀𐤁𐤀𐤌` |
| after stripping (`display_root`) | `𐤀` (collapsed — useless on its own) |
| **true root** (`paleo` / `true_root`) | **`𐤁𐤅𐤀`** (“to come”) |
| rendered root slot | **`𐤁𐤅𐤀`** ✔ |

The collapsed `𐤀` never reaches the screen; the dictionary root `𐤁𐤅𐤀` does.

## Component shape the client receives

```jsonc
{
  "paleo":        "𐤁𐤅𐤀",   // root component: the TRUE ROOT
  "translit":     "Bawaa",
  "translation":  "to come",  // from the lexicon, keyed on the true root
  "css":          "root",
  "sn":           "H935",
  "true_root":    "𐤁𐤅𐤀",   // explicit (root component only)
  "display_root": "𐤀",       // what stripping produced (for reference)
  "surface_form": "𐤀𐤁𐤀𐤌"   // the literal surface (for reference)
}
```

Prefix/suffix components carry the same `{ paleo, translit, translation, css }`
shape with their own morphology class (`pfm-1cs`, `prs-3mp`, …).

## What changed in this pass

**server.js**
- Standalone prep/conj/art: lexicon/homographs now consulted **before**
  `GRAMMAR_MAP` (was the reverse). `GRAMMAR_MAP` kept as fallback.
- Inline `𐤀𐤋𐤄𐤉𐤌 → god` override demoted to fire only when the lexicon yields
  no gloss.
- Root component now also emits explicit `true_root`, `display_root`, and
  `surface_form` fields so consumers never re-derive the root.

**React client**
- `Root.jsx`: **deleted** the mirrored hardcoded tables (`PREP_TRANS`,
  `CONJ_TRANS`, `ART_TRANS`, `PFM_MAP`, `VBS_MAP`, `PRS_MAP`, `NME_MAP`,
  `VBE_MAP`) and the `posClass()` / `parseMorph()` / `fromRaw()`
  client-side reconstruction path. `RootWordBlock` now renders strictly from
  the server's `components[]`.
- `WordBlock.jsx`: removed hardcoded word-suppression strings
  (`'Alahayam'`, `'ath'`, `'Ath'`); suppression is now purely structural
  (empty gloss, or gloss equals transliteration). Lemma hint is data-driven
  from server fields only.

**What was intentionally NOT removed** (per your "keep tables as fallback"):
- `server.js`: `MUTATED_ROOTS`, `KNOWN_ROOTS`, `STRONGS_ROOT_OVERRIDES`,
  `STANDALONE_WORDS`, `GRAMMAR_MAP`. These remain as last-resort fallbacks
  beneath the lexicon. To eventually retire them, migrate their entries into
  `lexicon.json` / `homographs.json` / `strongs-roots.json` and delete the
  tables — the resolution order already prefers the JSON, so each migrated
  entry makes the corresponding table line dead code.

## Tests

`tests/root-resolution.test.cjs` extracts `parseHebrewData` from `server.js` and
asserts (against synthetic inputs):

1. lexicon overrides `GRAMMAR_MAP` for particles,
2. `GRAMMAR_MAP` still works as a fallback when the lexicon is empty,
3. the SN/morphology homograph tier beats a plain lexicon entry,
4. the true root is preserved in the root slot and the gloss comes from the
   lexicon keyed on that true root,
5. the inline `god` hack loses to a curated lexicon entry.

`tests/e2e-real-data.cjs` validates against **real data** — runs the modified
`parseHebrewData` over a stratified sample of 220 tokens drawn from your
`surface-index.db`, with the real `lexicon.json` (182 entries), `homographs.json`
(265 entries), and `strongs-roots.json` (8,674 entries) loaded.

### What the real-data validation found

**No regression vs. original server** — comparing original and modified on the
213 non-particle tokens: 0 root-paleo differences, 0 translation differences.
My edits don't change anything that wasn't supposed to change.

**Particle changes activated exactly where designed** — on the particle sample,
two cases shifted:

| Particle | GRAMMAR_MAP | `lexicon.json` | Original output | Modified output |
|----------|-------------|----------------|-----------------|-----------------|
| `𐤏𐤋`     | "upon"      | **"over"**     | Upon            | **Over**        |
| `𐤀𐤋`     | "toward"    | **"Mighty One"** | Toward        | **Mighty One**  |

Particles without lexicon entries (`𐤅`, `𐤁`, `𐤄`, `𐤋`, `𐤌`, `𐤊`, `𐤀𐤕`)
correctly fall through to GRAMMAR_MAP and behave identically to the original.

**True root shines through** — every mutation-case token resolved the true
root in the root slot. Example, `𐤀𐤁𐤀𐤌` (Wayyabo, H935):

```
surface_form:  𐤀𐤁𐤀𐤌    (literally written)
display_root:  𐤁𐤀       (collapsed by affix stripping — useless on its own)
true_root:     𐤁𐤅𐤀     (restored from strongs-roots.json)
paleo  (rendered): 𐤁𐤅𐤀  ✓ true root in the root slot
translation:   "bring/come to"   ← lexicon.json[𐤁𐤅𐤀]
```

**Contract field coverage** — `true_root` / `display_root` / `surface_form`
fields are present on the root component in 213 of 213 multi-component
tokens (100%). Standalone particles correctly omit them.

**Strong's coverage** — 99.5% of sampled SNs are covered by
`strongs-roots.json`, so Step 1 of true-root resolution (canonical-lemma
override) is active across virtually the entire corpus.

```bash
node tests/extract-parse.cjs            # regen extract from current server.js
node tests/root-resolution.test.cjs     # synthetic unit tests
node tests/e2e-real-data.cjs            # real-data validation
```
