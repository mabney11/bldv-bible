# Tests

## `root-resolution.test.cjs` — synthetic unit tests
Proves the source-of-truth design (see `../ROOT_AND_LEXICON.md`) with five
assertions over crafted inputs:

1. lexicon overrides `GRAMMAR_MAP` for particles
2. `GRAMMAR_MAP` still works as a fallback when the lexicon is empty
3. the SN/morphology homograph tier beats a plain lexicon entry
4. the **true root shines through** in the root slot + gloss comes from the lexicon
5. the inline `𐤀𐤋𐤄𐤉𐤌→god` hack loses to a curated lexicon entry

## `surface-overrides.test.cjs` — SN-override mechanism
Validates the `surface-strongs-overrides.json` mechanism (see
`../CONSISTENCY_WORKFLOW.md`):

1. without override, the live parser's first-letter safety check already
   protects against wrong SNs (e.g. H3878=Levi tagged on `𐤍𐤐𐤔𐤕𐤌` does
   NOT contaminate the root — the parser rejects the unrelated canonical
   root and falls back to surface stripping)
2. with an override, the SN is corrected and the lexicon-driven gloss
   follows correctly
3. overrides are no-ops for words not in the override map
4. overrides only change the SN; lexicon priority order is unchanged

## `index-builder-consistency.test.cjs` — `build-surface-index.js` parity
Verifies that `build-surface-index.js`'s `parseToken` has the SAME
first-letter safety check that `server.js`'s `parseHebrewData` has, so the
cached DB never drifts from the live parse path. This is the critical fix:
without it, re-running `build-surface-index.js` would regenerate a DB with
the same SN-vs-root contradictions the audit found.

## `e2e-real-data.cjs` — real-data validation
Runs the modified `parseHebrewData` over a 220-token sample drawn from
`surface-index.db`, with the real curated `lexicon.json` / `homographs.json`
/ `strongs-roots.json` loaded. Confirms:

- no regression vs. the original server on non-particle tokens
- particle translations now prefer the lexicon over `GRAMMAR_MAP`
- the true root appears in the root slot in every mutation case
- `true_root` / `display_root` / `surface_form` contract fields are always set

## `share-richtext.test.cjs` — Share rich-text export pipeline
Validates the helpers that turn a contenteditable's HTML into per-segment
canvas-drawing instructions for PNG export (`extractStyledRuns`,
`layoutLines`). Mirrors the helpers from `Share.jsx` (so the test catches
unintended drift if those functions change). Confirms:

- plain text, `<b>`/`<i>`/`<u>`, and inline `<span style="color: ...">` all
  round-trip with the right per-segment style
- nested tags compose styles (e.g. `<b><i>both</i></b>` → bold + italic)
- `<br>` becomes a paragraph break
- word-wrap fires at the right boundary and preserves per-segment style

Requires `jsdom` for DOM parsing. Install once:
`npm install --no-save jsdom`

## `snap-test.cjs` — lexicon sidebar snap-fix
Demonstrates that back-jumping to an earlier letter after jumping to a later
one now scrolls correctly. See `../src/pages/Lexicon.jsx`.

## Running everything

```bash
node tests/extract-parse.cjs               # regenerate from server.js
node tests/root-resolution.test.cjs        # synthetic unit
node tests/surface-overrides.test.cjs      # override mechanism
node tests/index-builder-consistency.test.cjs  # builder parity
node tests/e2e-real-data.cjs               # real data (needs lexicon JSONs)
node tests/snap-test.cjs                   # lexicon UI snap
```

`extract-parse.cjs` slices the REAL `parseHebrewData` (plus its dependency
tables/helpers) out of `../server/server.js`, so the tests always exercise the
shipped server code — never a hand-copied duplicate. `parse-extract.cjs` is
generated; regenerate it whenever `server/server.js` changes.
