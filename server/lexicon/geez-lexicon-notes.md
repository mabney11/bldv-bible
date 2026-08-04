# geez-lexicon.json provenance notes

`geez-lexicon.json` itself must contain ONLY real `{"ge'ez word": "gloss"}` entries —
`/api/source/:src/lexicon/curated` (server.js) iterates every key in the file and
renders each as a browsable row on the Lexicon page, so a comment/metadata key
embedded in the JSON shows up as a garbage entry in the UI (found and fixed
2026-08-01 — a `_comment_2026_08_01` key briefly existed in the file and would have
rendered as a fake lexicon word with count 0). Any provenance/process notes for this
file belong here instead, never as a key in the JSON itself.

## 2026-08-01 — Melchizedek cycle additions

~248 entries (192 net new after de-dup with the pre-existing ~60) added to cover the
5 Ge'ez Melchizedek works promoted the same day (canon_id 212–215, see
assign-canon-ids.py): LIT3332Melchiz (Treatise on Melchizedek), LIT7232Melchiz (Salam
to Melchizedek), LIT3326Melchiz1 + LIT3327Melchiz2 (Homilies of Cyril on Melchizedek,
combined as one 2-chapter book), LIT2365Storyo (Story of Melchizedek).

**Sourcing caveat:** these are best-effort glosses from general Ge'ez / comparative-
Semitic knowledge, entered because no live authoritative Ge'ez dictionary tool was
available in-session (web search did not return granular per-word lexicon data for
Dillmann's *Lexicon Linguae Aethiopicae* or Leslau's *Comparative Dictionary of
Ge'ez*, and no local TEI source with embedded glosses was cached). **NOT verified
against a live dictionary** — treat as a reasonable first pass, not ground truth.

7 entries are marked `(uncertain)` inline in the gloss itself (visible to readers,
consistent with "evidence first, don't invent silently" — these are flagged rather
than presented with false confidence):

- `ኢያህኪክሙ` — "it may not weary you" — uncertain verb root
- `ለያትሉ` — "may it follow / accompany" — uncertain verb, low confidence
- `ህንደኬ` — "India" — plausible geographic identification, unconfirmed
- `ቀምጠራት` — "storehouses / vaults" — uncertain, genuinely unclear
- `ዘጊሖሙ` — "having secured them" — uncertain verb root
- `አርአዮታ` — "his manifestation of it" — uncertain exact form
- `ወኢሐረ` — "and he did not defile / approach" — uncertain verb, context-inferred

If you get access to a real Ge'ez dictionary (Leslau's *Comparative Dictionary of
Ge'ez*, Beta Masaheft's own glossary tooling, or similar), these 7 plus a general
spot-check of the rest would be the right place to start.

## Architectural note

This flat surface-form → gloss lookup does not scale the way the Hebrew OT's
Strong's/root-based system does. Ge'ez is heavily inflected (prefixes, suffixes,
pronominal object/possessive endings), so most entries added for a given new text are
one-off inflected forms (e.g. `ወኢያእሚሮሙ` "and they did not know them") that will
essentially never recur verbatim in a different text — coverage doesn't compound the
way a root-based system's does. Filling this file per-text is fine for occasional
glosses sprinkled through otherwise-transliterated corpora (its original design
intent, shared with greek-/latin-/syriac-/coptic-lexicon.json), but is not a
sustainable path to Hebrew-OT-grade reading quality for a fully-Ge'ez text. A real
fix, if ever wanted, would be a Ge'ez root/lemma system analogous to the Hebrew
pipeline (`apply-web-strongs.mjs`, `ROOTS[sn]`, the additive-morpheme rules in
CLAUDE.md) — a much larger undertaking, not something to back into via this file.
