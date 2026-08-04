# SN-Root Consistency: Audit & Override Workflow

This document is the playbook for keeping `surface-index.db` aligned with
authoritative lexicon/Bible sources. It explains the bug, the two-layer fix,
and the workflow for resolving the remaining cases that need human judgement.

## The bug, in one sentence

The corpus tags some tokens with a Strong's number whose canonical root
(per `strongs-roots.json`) does not contain letters present in the surface
form — which means **the SN, the root, and the gloss disagree**.

The canonical example: `𐤍𐤐𐤔𐤕𐤌` (their souls) was tagged with **H3878 (Levi)**.
The root rendered as `𐤋𐤅𐤉` (Levi's lemma), but the translation came out as
"living being/soul" (from the lexicon entry for `𐤍𐤐𐤔`). SN says one thing,
root says another, gloss says a third.

## Why this happens

`build-surface-index.js` (the script that builds `surface-index.db`) used a
trueRoot resolution rule that accepted the canonical root from
`strongs-roots.json` whenever it was at least as long as `displayRoot`. There
was no check that the canonical root's letters actually appeared in the
surface form. So `H3878` → `𐤋𐤅𐤉` got plastered onto `𐤍𐤐𐤔𐤕𐤌` without
sanity-checking.

`server.js`'s live `parseHebrewData` already had a first-letter safety check
(it rejects the canonical root when its first letter differs from the
stripped surface's first letter), which is why **the live API and the cached
DB sometimes disagree on the same token** — the live path corrected itself,
the DB stored the bad data.

## The two-layer fix

### Layer 1: Safety check in `build-surface-index.js`

Mirrors the existing `server.js` check. When the SN's canonical root's
first letter doesn't match the stripped surface's first letter, the canonical
root is rejected and we fall back to standard mutation-table / displayRoot
resolution. This eliminates **~43% of contradictions** automatically — every
case where the safety check correctly identifies a mismatched first letter.

### Layer 2: `lexicon/surface-strongs-overrides.json`

For the remaining ~57% of cases, the SN's canonical root's first letter
**does** match the surface (so the safety check lets it through), but the
overall SN attachment is still linguistically wrong. These need human
judgement. The overrides file pins the correct SN per `word_raw`:

```json
{
  "_comment": "see scripts/audit-sn-consistency.cjs",
  "𐤍𐤐𐤔𐤕𐤌": "H5315",
  "𐤀𐤇𐤆𐤕": "H270"
}
```

Both `build-surface-index.js` and `server.js` read this file. The override
applies BEFORE any other resolution, so the corrected SN drives root
resolution, lexicon lookup, everything downstream.

## The audit & override workflow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   bible.db ─────► build-surface-index.js ──────► surface-index.db       │
│   (corpus)                ▲                          │                   │
│                           │                          │                   │
│                           │ apply                    │ audit              │
│                           │ overrides                │ for mismatches     │
│                           │                          ▼                   │
│   lexicon/surface-strongs-overrides.json  ◄──── scripts/audit-sn-       │
│                           ▲                          consistency.cjs     │
│                           │                          │                   │
│                           │ pick from _review        ▼                   │
│                           └────────  lexicon-audit/sn-audit-overrides.json
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Step 1 — Audit the current `surface-index.db`

```bash
# If you have better-sqlite3:
node scripts/audit-sn-consistency.cjs

# Or with a JSON dump (no native deps):
sqlite3 surface-index.db \
  "SELECT json_group_array(json_object(
     'word_raw', word_raw, 'root_paleo', root_paleo,
     'strongs', strongs, 'all_strongs', all_strongs,
     'pos', pos, 'morph', morph))
   FROM token_surfaces WHERE strongs IS NOT NULL AND strongs != ''" \
  > token-surfaces.json
node scripts/audit-sn-consistency.cjs --rows token-surfaces.json
```

This writes three files to `lexicon-audit/`:

- `sn-audit-report.txt`     — human-readable summary, HIGH first, then AMBIGUOUS
- `sn-audit-report.json`    — machine-readable, same data
- `sn-audit-overrides.json` — TEMPLATE for the override file

### Step 2 — Curate `sn-audit-overrides.json`

Open the template. Every contradiction sits in `_review` with structure:

```json
"𐤍𐤐𐤔𐤕𐤌": {
  "pos": "subs",
  "tagged_sn": "H3878",
  "tagged_root_letters": "𐤋𐤅𐤉",
  "confidence": "HIGH",
  "candidates": ["H5315 (root 𐤍𐤐𐤔)"],
  "pick": null
}
```

For each entry, decide:

- **Tagged SN is actually correct** (e.g. legitimate hollow root,
  proper noun, lamed-hay where letters legitimately disappear) → delete the
  entry from `_review` and leave the live data alone.
- **A candidate is correct** → add a top-level entry
  `"𐤍𐤐𐤔𐤕𐤌": "H5315"` (next to `_comment`), then delete the `_review` entry.

Anything in `_review` is **inert** — the override layer ignores everything
except top-level `word_raw → SN` mappings. The `_review` block is purely a
scratch pad for you.

**Be wary of "HIGH confidence" suggestions.** HIGH means *exactly one*
alternative SN in `all_strongs` has letters that fit the surface — but that
alternative might fit by coincidence and still be wrong. The Levi case
(`H5315` for `𐤍𐤐𐤔𐤕𐤌`) is unambiguous; many others are not. Check Strong's
definitions and standard lexicons before promoting.

### Step 3 — Activate the overrides

```bash
cp lexicon-audit/sn-audit-overrides.json server/lexicon/surface-strongs-overrides.json
```

The live `server.js` picks this up on next request (no restart needed — the
lexicon hot-reload watcher includes it).

### Step 4 — Rebuild the surface index

```bash
node server/build-surface-index.js
```

This regenerates `surface-index.db` with:
1. The safety check active (kills ~43% of contradictions automatically).
2. The overrides applied (kills your curated cases).

### Step 5 — Re-audit to confirm

```bash
node scripts/audit-sn-consistency.cjs
```

The new report should show many fewer findings. Anything still listed is
either a case where you decided the tagged SN was actually correct (and
deliberately didn't override), or a case the safety check + overrides
couldn't reach.

## Cross-checking against authoritative sources

This audit only flags **internal contradictions** (SN says root R but R's
letters don't appear in the surface). It does **not** verify that the
chosen SN matches the consensus of standard Hebrew lexicons (BDB, HALOT,
TWOT, etc.). If you find a verse where this app's gloss differs from those
references, the workflow is the same: figure out which SN your reference
sources use, add an entry to `surface-strongs-overrides.json`, rebuild.

A future enhancement could automate that cross-check by pulling the same
words from another tagged corpus and diffing — but that's outside the
current scope.

## What this guarantees

After running the workflow, you have this invariant:

> For every row in `token_surfaces`, the `root_paleo` letters are either a
> subset of the surface form OR the surface is a known hollow/lamed-hay form
> whose canonical root legitimately contains letters absent from the
> surface, AND the SN matches whichever value you chose in the override
> file (or the corpus's original tag if you accepted that).

That's the consistency promise — and the workflow above is how you keep it.
