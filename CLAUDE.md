# CLAUDE.md — project rules for paleo-studio

## Production deployment: AWS Lightsail, NOT Fly.io (added 2026-08-11)

**fly.toml and the Fly-Volume assumptions in entrypoint.sh's comments are stale.** The
project was migrated off Fly.io to an AWS Lightsail instance — this was hammered out in a
separate "Fly.io web app deployment" chat and never carried over into this file, which
caused a real time-waste (2026-08-11: spent a round-trip handing fieldy `fly deploy`
commands for an app that isn't on Fly anymore). Don't trust fly.toml/Fly-Volume framing
in code comments at face value — verify against what's below, and if they visibly
diverge further, fix the comments too.

**Actual deploy flow, confirmed 2026-08-11 by watching a real `~/deploy.sh` run:**
- Lightsail Ubuntu box, reached via `ssh paleo-lightsail` (an SSH config alias — see
  `~/.ssh/config` on fieldy's machine; resolves to `ubuntu@<lightsail-ip>`). Holds a
  `~/paleo-studio` checkout of `https://github.com/mabney11/bldv-bible`, branch `main`.
- Deploying is `~/deploy.sh` on that box (not a repo file — lives in fieldy's home dir
  there, not mirrored here). It: `git pull`, `docker build` (this repo's `Dockerfile`,
  legacy builder, not yet on buildx), then a blue/green swap between two containers
  named `paleo-a`/`paleo-b` on ports 3000/3001 behind Caddy — builds the new one on the
  free port, health-checks it, cuts Caddy over, retires the old one. No Fly-specific
  tooling anywhere in this path.
- Getting a change live = commit + `git push origin main` from wherever fieldy's GitHub
  credentials already are (his own dev machine, not necessarily wherever an agent's
  sandbox is), then `~/deploy.sh` on the Lightsail box.
- **`~/deploy.sh` used to be a plain file, not a symlink — this caused a real bug, fixed
  2026-08-14.** Because `~/deploy.sh` lives outside the `~/paleo-studio` git checkout,
  `git pull` (the first step deploy.sh itself runs) never updated it. `deploy-blue-green.sh`
  in the repo was retuned 2026-08-13 (health-check retry budget: 60 tries*2s=~2m ->
  150 tries*2s=~5m, see the RETUNED comment in that file for why), but a real deploy on
  2026-08-14 still failed at ~2m — `~/deploy.sh` was a stale manual copy predating that
  fix. **Fixed by replacing `~/deploy.sh` with a symlink to `~/paleo-studio/deploy-blue-green.sh`**,
  so every future edit to the repo file takes effect on the box the moment `git pull`
  runs, with no separate manual copy step to forget. If `~/deploy.sh` is ever NOT a
  symlink again (e.g. someone recreates it by hand), assume it can silently drift out of
  date the same way — check `ls -la ~/deploy.sh` before trusting its behavior matches
  what's in this repo.
- **DB persistence, confirmed 2026-08-11 from `deploy-blue-green.sh` (checked into this
  repo — this IS what `~/deploy.sh` on the box runs):** `docker run ... -v
  /mnt/paleo-data:/data ...` — a plain bind mount from a host directory into every
  container, `paleo-a` and `paleo-b` alike. `entrypoint.sh` symlinks `corpus.db`,
  `translation.db`, `bible.db`, `concordance.db`, `surface-index.db`, `morph-grc.db` out of
  `$DATA_DIR` (defaults to `/data`) into `/app/server/` at boot. Because it's a bind mount
  (not a copy baked into the image), anything written to `translation.db` — every
  Translation Studio save (`PUT /api/translate/verse`, `POST`/`PUT /api/translate/link`,
  all via `translationDb.stmts`, i.e. real SQLite writes) — lands on
  `/mnt/paleo-data/translation.db` on the HOST, independent of which container is
  currently running. A redeploy rebuilds the image and swaps containers, but the new
  container mounts the same host directory and sees the same file. **So: yes, Translation
  Studio edits persist across deploys**, no manual step needed — don't confuse this with
  the DIFFERENT admin-panel case below.
- **Admin-panel writes are NOT the same as Translation Studio writes — do not conflate
  them.** `/admin` actions like promoting/demoting canon books or saving baked glyphs write
  to plain files INSIDE the container's own filesystem (`book-order.json` and similar) —
  NOT on the `/data` volume, NOT in git. Per WORKBOOK.md section 4: those changes vanish on
  the next `~/deploy.sh` (fresh image, fresh container) unless manually pulled out with
  `docker cp` and committed to git first. Translation Studio's own verse text and links are
  safe (see above, they're real DB writes on the mounted volume) — this caveat is
  specifically about the OTHER admin-panel file-based edits.

**Concretely found & fixed this session from this gap:** `Dockerfile`'s runtime stage
never copied `src/lib/books.js` into the image, so `entrypoint.sh`'s post-boot
`build-headings.mjs` run (regenerates `headings.json` — Psalm/Habakkuk superscriptions,
acrostic stanza letters like Psalm 119's Alap/Bayath headers) died on
`locate('books.js')` failing, silently (entrypoint.sh treats it as a non-fatal warning),
leaving `/headings.json` 404ing in prod for who knows how long with zero visible error.
Separately, `Dockerfile`'s frontend-build stage doesn't even copy `server/` before
running `npm run build`, so build-headings.mjs can't run there either (confirmed via a
real deploy log: `Error: Cannot find module '/app/server/build-headings.mjs'`) — swallowed
by the `|| true` in package.json's `build` script, so `npm run build` "succeeds" anyway.
The real, load-bearing regeneration is entrypoint.sh's at container boot (after the DB is
available); the frontend-build-stage attempt was already dead code before this fix and
still is — worth deciding at some point whether to rip it out or make it work for real.

## Execution environment preference (added 2026-08-01)

Fieldy runs commands directly on his own machine. When the agent's sandboxed shell is
unavailable (down, out of disk, etc.) or otherwise not the right fit, hand fieldy ready-
to-run commands (exact scripts, in order, with flags) to execute locally himself rather
than blocking the work on sandbox recovery. When the sandbox IS available, prefer running
things there as normal — this is a fallback preference, not a rule to always ask first.

## Ingestion checklist — EVERY new non-canonical text must go through all of this (added 2026-07-31)

This is the standard the Pistis Sophia/Gospel of Philip/Nag Hammadi batch (2026-07-30/31) was
built to, after a long back-and-forth of finding real bugs by actually reading the output.
**Do not skip steps because a text "looks fine" after just the first pass** — every step below
was added because an earlier text passed the step before it and still had a real problem.
Treat this as the definition of "done" for adding any text, not a suggestion.

1. **Fetch + strip_tags() correctly** (`server/ingest-gnostic-priority.py`'s `strip_tags()` is
   the reference implementation — new ingestion scripts should reuse or mirror it exactly, not
   write a fresh ad-hoc HTML stripper):
   - Decode HTML entities with `html.unescape()` (Python) — a hand-picked shortlist of entities
     WILL miss something a scholarly translation uses (found via `&aelig;ons`/`Saba&#333;th`
     leaking through literally in Pistis Sophia).
   - Fold Latin diacritics to plain ASCII (`fold_diacritics()`: NFKD decompose + strip combining
     marks, plus an explicit æ/œ ligature table) — a decoded macron/accent character is
     genuinely invisible to this app's `[A-Za-z]`-only name/term matchers, so an unfolded
     "Sabaōth" can NEVER be transliterated no matter what's added to the name map; it silently
     splits into unmatched fragments instead.
   - Replace remaining tags with a SPACE, not empty string, then collapse whitespace and strip
     any space left dangling before `.,;:!?` — deleting a tag outright can glue two words
     together with zero space between them ("scripture.</i>And" → "scripture.And").
   - Treat `<h1>`-`<h6>` as paragraph breaks (`\n\n`), same as `<p>` — a heading in a different
     tag than `<p>` otherwise fuses straight onto the next sentence with no separator at all.

2. **Verse/paragraph structure — one idea per verse, no fabricated verse numbers:**
   - Split on the source's actual paragraph/heading boundaries (blank-line-separated blocks),
     NOT on the original manuscript's page-citation markers. A page of a codex or a printed
     book commonly spans a heading plus several paragraphs — using page boundaries as verse
     boundaries produces a wall-of-text verse with no visible internal structure (Gospel of
     Philip's original bug).
   - Strip inline page-citation markers from the visible text entirely (NHC-style "[p.N]"
     brackets, G.R.S. Mead-style inline "|127." pipe-markers, "[paragraph continues]" notes) —
     these are citation/transcription apparatus, not content, and read as clutter.
   - If the source embeds a multi-verse scripture quotation typeset as several short paragraphs
     (one per quoted verse, e.g. Psalm 85:10 then 85:11 each on their own line), merge the
     continuation paragraph into the one before it instead of giving it its own app verse — a
     paragraph starting with a quote-mark-plus-number pattern (`^["'‘’“”]{1,2}\d{1,3}\.\s`) is
     "more of the quotation already open", not a new verse.
   - If the source numbers chapters/sections CONTINUOUSLY across what this app treats as
     separate "books" (Pistis Sophia's four books share one running chapter count — Book I
     ends at ch.62, Book II's very next page is ch.63, not ch.1), remap each book's own raw
     numbers to a local 1, 2, 3... sequence. Otherwise every book after the first has NO
     chapter 1 at all, and the reader (which defaults to chapter 1) shows it as "not
     translated" even though the text is really there under some much higher chapter number.
   - Filter out the SOURCE SITE's own page-navigation chrome (its own "Previous:/Next:" links,
     "Buy this Book", site-name boilerplate) — this app has its own Previous/Next controls, and
     the source's nav text otherwise ends up baked in as extra fake verses at chapter ends.

3. **Run the full post-ingestion pipeline, in this order, every time:**
   ```
   node sanitize-english.js       # names/places/theonyms -> name-map-expanded.json
   node glossify-terms.js         # common Hebrew-rooted terms -> word-map.json's "terms"
   node de-archaic-corpus.js --dry-run   # check for archaic verb forms BEFORE applying
   ```
   Read the dry-run's residue report. If it lists any stems, add them to `modernize-english.js`'s
   `VERBS` list (or the irregulars block for doubled-consonant/suppletive forms) and re-run
   `--dry-run` until residue is empty — do not apply with known residue outstanding.
   ```
   node de-archaic-corpus.js             # apply, once residue is clean
   node fix-self-referential-glosses.js --apply   # repair any "X (X)" self-referential gloss
   python assign-canon-ids.py            # promote into the book dropdown (or use /book-manager)
   ```
   Then restart the server.

4. **Verify before calling it done — required, not optional:**
   ```
   node sample-corpus.js --src=<this batch's src tag>   # random verses, only the new text(s)
   node sample-corpus.js                                # random verses, whole corpus
   ```
   Read the output. Don't just check that it ran — actually read several verses end to end,
   the way a reader would. Every bug this batch found (wrong chapter numbers, mangled glosses,
   missing spaces, leftover citation markers, un-transliterated names, archaic verbs) was caught
   this way, not by a script reporting "success". Run the sampler again after ANY further change
   — it's meant to be part of the loop, not a one-time gate.

5. **New Hebrew/Greek terms — evidence first, never invented.** If a term genuinely has no
   established root anywhere in the existing corpus (check `word-map.json`'s `terms` section
   first), don't guess a transliteration to fill the gap — multiple valid Hebrew synonyms often
   exist for the same English word (sword/spear/weapon all have several), and picking one from
   a raw Strong's dictionary listing without corpus evidence risks contradicting what the
   canonical books already, consistently use elsewhere. Flag it and get confirmation instead.

## Name/place "sanitization" — how English text gets its transliterated names (added 2026-07-30)

Every English verse anywhere in this app — canonical OT/NT, deuterocanon, pseudepigrapha
(Jasher, Enoch, the Testaments, …), and any new non-canonical work added the same way —
goes through a single, generic pass that rewrites ordinary English proper nouns and divine
titles into the app's own transliteration, so "Abraham, Isaac, and Jacob" reads "Abaraham,
Yatzachaq, and Yaiqab", "Israel" reads "Yasharaal", "God"/"Jesus" read as their Hebrew-
transliterated equivalents, etc. This is what makes an unfamiliar apocryphal text still read
with the SAME familiar OT/NT names as everything else in the app — it needs no per-text work.

**The three files that do this, in order of "what to touch":**
- `server/name-map-expanded.json` — the actual data: `single` (one-word names), `phrases`
  (multi-word names), and `theonyms` (divine titles, matched case-SENSITIVE so capitalized
  "God" differs from lowercase generic "gods"). Add a name here if a text uses a spelling
  variant this map doesn't already catch.
- `server/name-passthrough.js` — `makePassthrough(map, opts)` builds the actual regex-based
  replacer: theonyms first (longest match, case-sensitive), then multi-word phrases
  (case-insensitive), then single words including hyphenated compounds. Replacements are
  stashed behind `\x00N\x00` placeholders while scanning so an already-transliterated name
  is never re-matched by a later, shorter rule.
- `server/sanitize-english.js` — the actual pass: `SELECT ... FROM verses WHERE corpus='ENG'`
  (literally every English verse in `corpus.db`, canonical + every promoted/unpromoted work),
  runs each through `pass()`, writes back any verse that changed. Idempotent (an
  already-sanitized verse contains no English name keys left to match, and the `ALREADY`
  regex skips verses that already carry a glossed divine title) — safe to re-run any time,
  including after ingesting a brand new work. **This is the ONE step that makes new text
  read with the app's familiar names — there is no separate "sanitize this specific book"
  path, and none is needed.**

**Known gap, fixed 2026-07-30: NT names were missing from `name-map-expanded.json`.**
The canonical NT reader always looked fine, but that's misleading — its text arrives
PRE-sanitized as a static baseline (`english-nt-baseline.jsonl`, already containing
"Yashawai" for Jesus etc.), loaded verbatim by `load-english-baseline.js`, bypassing the
generic pass entirely. The OLDER, flat `name-map.json` (superseded by `name-map-expanded.json`
above) has ~700 entries including NT people/places — Jesus, Christ, Messiah, Mary, Peter,
Paul, Philip, Thomas, Andrew, James, Simon, John, Judas, Judea, Nazareth, Herod, Pilate,
Matthew, Timothy, Lazarus, Martha, Bartholomew, Cephas, Stephen, Barnabas, Caesar, etc. —
but when `name-map-expanded.json` was rebuilt with the single/phrases/theonyms structure,
only the OT names carried over; none of the NT ones did. So any text that actually goes
THROUGH the generic `sanitize-english.js` pass (Gospel of Thomas, Gospel of Philip, Pistis
Sophia, Acts of Paul and Thecla, Third Corinthians, and anything else mentioning these
names) never got them transliterated — this is what was behind "Christ"/"Jesus"/"Mary"/
"Nazarene" etc. still showing up in plain English in Gospel of Philip. Fixed with
`server/backfill-name-map.js`, a one-time migration that merges every `name-map.json` key
not already reachable via `name-map-expanded.json`'s single/phrases/theonyms into `single`
(idempotent-safe to re-run). Run it once, then `node sanitize-english.js` retroactively
fixes every affected book with no re-ingestion needed. If a FUTURE name is still missing,
add it directly to `name-map-expanded.json` — don't reach for `name-map.json` as a
fallback data source, it's legacy/superseded except as the one-time backfill source above.

**Practical implication for adding any new text (Nag Hammadi, further NT Apocrypha, etc.):**
ingest it as plain English verse rows into `corpus.db` under `corpus='ENG'` (see
`server/ingest-gnostic-priority.py` for the pattern — same shape as
`ingest-pseudepigrapha.py`), then just run `node sanitize-english.js` same as after any other
re-ingest. Do NOT write a bespoke per-book name-substitution step — if a name isn't coming out
right, the fix belongs in `name-map-expanded.json`/`name-passthrough.js` so every OTHER text
using that name benefits too, not in a one-off script.

**What this does NOT do:** it does not give a text word-level Strong's numbers, morphology,
or paleo-Hebrew per-token rendering — that machinery (`apply-web-strongs.mjs`,
`render-corpus.mjs`'s verse-gloss pass, the whole "no-eliding" rule below) is specific to the
canonical Hebrew OT / Greek NT, which actually carry Strong's-tagged tokens. Deuterocanon,
pseudepigrapha, and any Nag Hammadi/NT Apocrypha additions are plain sanitized English prose,
exactly like Jasher/Enoch/the Testaments already are — that's the deliberate, precedented
scope, not a shortcut.

## Hebrew word transliteration: no eliding, ever

**Rule:** every letter that the Strong's number's canonical root/lemma has, and every
letter a genuine prefix/suffix morpheme adds, must show up in the rendered word. The
displayed transliteration is never allowed to be shorter than "prefix letters + full
canonical root letters" — even when that produces two of the same letter back to back.

- **Full word only.** If Strong's says the root is Yarah (ירה, Yod-Resh-He) and the
  surface carries a Hiphil "Ha-" prefix, the rendered word must be **HaYarahay** (or
  whatever the correct full concatenation is) — never a shortened form like "HaWaray"
  that drops or swaps out root letters because the manuscript's weak-verb spelling
  merged/elided them.
- **Duplicate letters are correct, not a bug.** `AAmar` (1cs prefix Aleph + root Amar,
  which also starts with Aleph) is the RIGHT output. Do not add logic that collapses
  or de-duplicates adjacent identical letters — that is eliding by another name.
- **The Strong's-tagged root is the source of truth**, not the manuscript's defective/
  weak-verb spelling. Hebrew orthography regularly merges an assimilated nun, elides a
  weak Yod, or substitutes Vav for a root's Yod in certain stems (Hiphil, etc.). None
  of that is a reason to render fewer letters than the root actually has. Add the
  root's letters back in; never subtract.
- This mirrors the "additive-only rule" already documented in
  `server/apply-web-strongs.mjs` / `tests/build-parseToken.cjs` (`mergeRootDisplay`,
  the `trueRoot`/`rootDisplay` logic, and the big comment block starting "THE STRONG'S
  ROOT IS THE ROOT"). That logic exists specifically to satisfy this rule — when a
  rendered word comes out short (a real Strong's-tagged letter missing, not just an
  affix), that is a bug in that logic, not an acceptable alternate spelling.
- Applies everywhere a Hebrew word is transliterated for display: the Reader, the
  Parallel/Hebrew-viewer widget, the Root explorer, and any future surface.

### Known open case (as of 2026-07-26)
Psalm 119:33, הוֹרֵנִי (Hiphil imperative + 1cs suffix "teach me", root Yarah/H3384)
renders as **HaWaray** in the Parallel Hebrew (BHS) viewer. Expected: **HaYarahay**
(Ha- Hiphil prefix + full Yarah root + the "-ni" suffix chip, à la AAmar). This is a
weak Pe-Yod root where the surface substitutes Vav for the root's Yod — exactly the
class of case the additive-root logic is supposed to catch and correct, so it's a bug
in that path (likely in the `_canonMissing`/`isRootSubsequence`/`mergeRootDisplay`
chain in `server.js` and its synced copy in `tests/build-parseToken.cjs`), not a new
behavior to design from scratch.

## Exception lists like NME_EXCLUSIONS are artifacts, not the design (added 2026-07-29)

`server.js`'s `NME_EXCLUSIONS` (and any similar hand-maintained "don't strip this specific
word" list) exists because SOME code path derives a word's displayed root by taking the
manuscript surface and SUBTRACTING letters that a morphology tag (nme/prs/vbe/etc.) says are
a suffix — i.e. eliding-by-shape, then patching the specific words where that shape-match
happened to eat real root letters (`𐤀𐤋𐤄𐤉𐤌`/Elohim looks like it has an `nme=JM` plural
suffix but doesn't; the JM letters are root-final). That is backwards from the no-eliding
rule directly above this section, and the exclusion list is a symptom of it, not a fix for
it — every entry in that list is one more word where subtract-then-patch got the wrong
answer at least once. **Fieldy, verbatim: "a lot of those manual strippings are artifacts...
we show the full root and add any letters that cause modification."**

The robust fix is additive-only, same as the rest of this rule: start from the KNOWN
canonical root (Strong's lemma, `ROOTS[sn]`, or an attested full form from `hebIndex`/
`bhsIndex` in `build-heb-index.mjs`) and construct the displayed word by ADDING recognized
prefix/suffix morphemes around that intact root — never by stripping the surface down to
whatever's left and hoping it matches. Anywhere a "does this look like a suffix, strip it"
check exists without first confirming the residual against a real attested root, that is the
bug class this list is patching one word at a time instead of fixing structurally. When
touching this area again: prefer growing the additive/evidence-based path (`mergeRootDisplay`,
`hebIndex`/`bhsIndex` attestation checks) over adding another word to an exclusion list.

## Two display surfaces, two different rules — do not conflate them (added 2026-07-27)

This project has TWO separate places a Hebrew word's transliteration shows up, and they
follow OPPOSITE rules. Every regression so far in this area has come from applying one
surface's rule to the other.

1. **Chip / component breakdown** — the Hebrew Viewer, and every per-word badge in the
   Parallel view (prefix chip, root chip, suffix chip, e.g. root "Achaya" + suffix
   "[His]" = "w"). This is where the **no-eliding rule above applies in full**: every
   morpheme is reconstructed and shown, duplicate letters and all. Do not change this
   surface to show bare roots — it is supposed to show the whole inflected word, split
   into its parts. Driven by `server.js`'s `parseHebrewData` / `build-surface-index.js`'s
   `parseToken` / `tests/build-parseToken.cjs` (all three kept in sync).

2. **Reading / "Novel English" prose** — the flowing sentence text (Parallel's left
   column, `/bible` reader, Studio). **Rule: always the bare Strong's root, computed
   fresh as `translit(ROOTS[sn])`, and nothing else — never the verse's own inflected
   surface, never a suffix reconstruction, never a per-token variant.** The SAME Strong's
   number must transliterate to the IDENTICAL spelling in every verse it appears in, OT
   or NT, with no exceptions.
   - Correct: **Ashar** (H835), **Ach** (H251) — always, everywhere, regardless of
     whether that occurrence is construct, plural, absolute, or carries a possessive
     suffix in the actual Hebrew.
     "Rendered from the verse's SURFACE form rather than the lemma" and any per-verse
     component-concatenation are the wrong mechanism for this surface, even though they
     are exactly the RIGHT mechanism for surface #1 above.
   - fieldy, verbatim: "make my parallel/novel english show strictly my transliteration
     of the strongs characters of the word... ensure the base root word is consistent.
     I expect Ashar (not asharay), ach (not achayam)... I can manually add suffixes
     correctly" (via term-forms.txt pins, when a specific spelling is wanted on purpose
     — that is an intentional, curated override, not the automatic default).
   - Driven by `server/apply-web-strongs.mjs` (OT baseline: `rootPaleo = ROOTS[useSn]`,
     no surface-form override) and `server/render-corpus.mjs`'s verse-gloss pass (NT/
     Apocrypha: computes `translit(ROOTS[sn])` directly, does NOT read a baked token's
     `components`/`translit` field at all for this purpose).

**Regression history in this exact spot** (so the next fix doesn't repeat one of these):
- `apply-web-strongs.mjs` used to let a `SURFACE_SN` opt-in list substitute the verse's
  own written form for the bare root on certain Strong's numbers — removed 2026-07-27.
- `render-corpus.mjs`'s verse-gloss pass used to read `components[0].translit` (the root
  component's OWN translit, which is correctly medial-at-its-tail whenever a real suffix
  follows it in surface #1's sense) and print that alone — this silently truncated the
  word ("achaya" instead of "achayaw"/"ach"). Fixed 2026-07-27 to compute the bare root
  independently instead of reading it off a baked token at all.
- `build-term-candidates.mjs` (which PROPOSES term-forms.txt pins from surface-index.db)
  had the same root-component-only bug — likely the actual origin of the 151 stale
  term-forms.txt pins found and mechanically fixed the same day. Fixed alongside it.
- `render-corpus.mjs`'s `applyLinks`/step 1b (driven by `translation_links` in
  translation.db) had the SAME bug a THIRD time, and it's the most dangerous instance:
  it runs FIRST, before names/terms/verse-gloss, and its output is guarded as
  untouchable by every later pass — so a stale baked-component read here silently
  overrides a correct fix made anywhere else in the pipeline, including fixes made
  the SAME day. Found 2026-07-27 chasing "Matthew 1:7 shows 'abaya (father)' instead
  of 'ab'": `TOK_TR`'s builder did `comps.find(c => c.css === 'root').translit` read
  straight off `token_surfaces` — H1's chip component legitimately carries suffix
  material (correct for the chip view), wrong for reading text. Same investigation
  also caught a second bug this same code path exposed: the `tokens_nt` fallback
  added earlier in `heb-align.js` (for fused-particle NT words like "Atha"+name)
  concatenates the prefix's own attested components ahead of the stem's without
  demoting either — so a fused word like Solomon (Atha+H8010) ends up with TWO
  components both claiming `css:'root'`, and `comps.find` picked the PREFIX's
  ("Ath") instead of the name's. Fixed by making `TOK_TR` compute
  `translit(ROOTS[sn])` directly too, bypassing `components` entirely — the same
  fix as the other two spots, sidestepping the double-root bug as a side effect
  rather than needing a separate `demoteNonHead` call in the fallback itself.
  **Lesson: `comps.find(c => c.css === 'root')` is not a safe way to get a word's
  transliteration ANYWHERE that feeds the reading-text surface — audit for this
  exact pattern before adding any new rendering pass, not just the three found
  so far.**
- `heb-align.js`'s `FUSED_PARTICLES` (the fused-prefix split feeding `tokens_nt` for
  HEB/NT text) only ever had one entry, `𐤀𐤕`. Widened 2026-07-29 to accept an
  injected list via `o.fusedParticles`, and `build-surface-index.js` now passes its
  own `STANDALONE_WORDS` (𐤀𐤕/𐤏𐤋/𐤀𐤋/𐤁𐤉𐤍/𐤊𐤉/𐤊𐤍/𐤀𐤔𐤓) into it — one source of truth,
  no new hand-typed particle guesses. This closes the Hebrews-1 "Ilaha-" case
  (𐤏𐤋 al "over" + 𐤄 "the" fused onto 𐤌𐤋𐤀𐤊𐤉𐤌 "angels", `nme=JM` plural tail) the
  same evidence-gated way `𐤀𐤕`+name always worked: the split only wins if the
  stem left over after stripping the particle is an EXACT, independently
  attested whole word — never a fuzzy match, never assumed. **This is the model
  for "systematically robust" prefix/suffix handling going forward: widen an
  EXISTING, already-vetted list to a code path that didn't use it yet, rather
  than hand-typing new candidate letters** (see `NME_EXCLUSIONS` section above
  for why the latter breaks down). Not yet rebuilt/tested — run
  `build-surface-index.js` and check Hebrews 1 for `𐤏𐤋`-prefixed words.
- Same day, second gap found in the same file: `resolveAll()`/`resolve()` had
  prefix-splitting tiers (`particle`, `proclitic`) but NO suffix-splitting tier
  at all — a fused word ending in a real pronominal/nominal suffix (𐤀𐤋𐤄𐤉𐤌𐤊,
  Alahayam+𐤊 "your") could never split, which is why "Alahayamak" rendered as
  bare "Alahayam" with the "[your]" silently absorbed. Added a `suffix` tier:
  `SUFFIX_TAILS` (every letter-sequence `NME_PALEO`/`VBE_PALEO`/`UVF_PALEO`/
  `PRS_ALLO` can produce, tried longest-first) and `SUF_COMPS` (the suffix-side
  mirror of the existing `PROC_COMPS` — each tail's gloss comes from a REAL
  attested BHS token carrying that exact morphology, gated by `morphAttrs`,
  never a hand-typed translation). Wired into `resolveAll()`, `resolve()`'s
  `PREFER_SPLIT` tier list, and the NT compositing loop (`isSuffixTail`,
  mirroring `nPre`'s "position decides it, not a lookup" rule at the other end
  of the word). Also fixed in passing: the existing proclitic fallback emitted
  css `mod-pref` but the stylesheet only defines `mod-pref-unk` — no rule ever
  styled it. Not yet rebuilt/tested — same rebuild as above will exercise this.
  **Known limitation**: this pass only strips ONE tier per word (prefix OR
  suffix, not both in the same reading) — a word needing both a stripped
  prefix AND a stripped suffix simultaneously is not yet handled.
- First real-world rebuild (2026-07-29) confirmed the above two fixes work:
  `nt_proclitic=7,397`, `nt_suffix=4,633`, `nt_particle=3,592` all firing, and
  "HaAlahayam"/"HaNabayaayam" etc. now correctly show `[the]`/`[the-Plural]`
  instead of silently absorbing the prefix. Two words still stood out:
  - "Manahamalaakayam" needed a STACKED read (𐤌𐤍 "min/from" + 𐤄 "the" + 𐤌𐤋𐤀𐤊𐤉𐤌
    "angels") that `resolveAll()` couldn't do — one prefix tier only, and 𐤌𐤍
    wasn't even a recognized particle (unlike bare 𐤌, "min" doesn't assimilate
    before a guttural like the article, so it stays two letters here). Added
    stacking to the `particle` tier in `resolveAll()` (try 1-2 further single-
    letter `PROCLITIC_SET` strips off the residual before requiring the FINAL
    stem to be exactly FORMS-attested — same evidence gate, applied twice).
    Verified 𐤌𐤍 is genuinely attested (~852x as pos=prep/H4480-4481 in
    `tokens_bhs`, dominant over rare inrg/prde/subs homograph readings) BEFORE
    adding it to `STANDALONE_WORDS` (server.js, canonical) + its
    `build-surface-index.js` copy + `GRAMMAR_MAP.prep['𐤌𐤍']='from'` in both —
    never added on a hunch. Not yet rebuilt/tested.
  - "Wahashathachawawalaw" is a DIFFERENT class of gap: fully `nt_unresolved`
    (no Strong's match at all, one of 10,347 such words) — not a segmentation
    problem the affix tiers can fix, since there's no attested reading to
    split around. Needs its own investigation into why OT alignment never
    matched this spelling, separate from the prefix/suffix work above.
- Rebuild #2 (2026-07-29) confirmed the 𐤌𐤍 addition + stacking: "ManaHaMalaakayam"
  now correctly reads `[from-the-Plural (masc)]`. User found a NEXT case the
  same day: "Athahaiwalamawath" (Hebrews 1:2, "he made the worlds") is 𐤀𐤕 (eth)
  + 𐤄 (the) + 𐤏𐤅𐤋𐤌 (Iwalam, "age" — attested BARE elsewhere in this exact
  corpus, e.g. plain "Iwalam" a few verses later) + 𐤅𐤕 (feminine plural). This
  needed a prefix strip AND a suffix strip in the SAME reading — exactly the
  "known limitation" flagged above. Added a new `affixed` tier: recomputes the
  same prefix candidates as the particle/proclitic tiers (kept as a separate,
  self-contained block rather than threading shared state, so it can be
  disabled independently if it ever misbehaves) crossed with every
  `SUFFIX_TAILS` entry; same one rule as every tier in this file — the
  residual after BOTH strips must be an exact, independently attested whole
  word, nothing fuzzy. Updated `stemOfR`/`stemOf` (used by `PREFER_SPLIT` and
  the ambiguity report) to know `affixed`'s stem is the SECOND-TO-LAST form
  (prefix(es), stem, tail — tail is last), and `isSuffixTail` in the NT
  compositing loop to treat `affixed`'s last form as a tail the same way
  `suffix` does. Not yet rebuilt/tested.
  Also flagged same day, NOT investigated yet: "LaBanayamayanay" → raw paleo
  𐤉𐤌𐤉𐤍𐤉 fully unresolved even after `La` strips. User's read: root ימין
  ("Yamayan", right hand) + bare 𐤉 (1cs "my") suffix. If so, the suffix tier
  SHOULD catch it (bare 𐤉 is in `PRS_ALLO['1cs']`) — unless the residual stem
  𐤉𐤌𐤉𐤍 is never independently attested BARE anywhere in this edition's own 39
  OT books (plausible — "right hand" may always appear possessed/prefixed
  here), in which case this isn't a code bug but a coverage gap needing a
  different strategy (e.g. checking against the Strong's root lexicon, not
  just this edition's own whole-word attestation). Needs a DB check
  (`SELECT ... WHERE word_raw='𐤉𐤌𐤉𐤍'`-style, same pattern as the 𐤌𐤍 check
  above) before assuming either explanation.
- Rebuild #3 confirmed `affixed` works ("AthaHaIwalamawath" now reads
  `[entirety-the-Plural (fem)]` with the root "eternity" showing correctly),
  but "LaBanayamayanay" was STILL unresolved in that same build — and the DB
  check proved the bare residual genuinely IS attested (H3225, `prs=absent`),
  ruling out the coverage-gap theory above. Root cause found: `LOSABLE` (the
  set of tiers `PREFER_SPLIT` is allowed to override) never included
  `proclitic`/`particle` — same bug class as the original `adjacent` note two
  bullets up, one tier later. This word's plain `proclitic` reading (La + a
  5-letter residual that HAPPENS to also be attested once, coincidentally)
  became `all[0]` and, because `proclitic` wasn't losable, was never even
  compared against the far-better-attested `affixed` reading (La + Yamayan +
  bare-𐤉, residual attested independently many times). Widened `LOSABLE` to
  include `proclitic`/`particle`, reordered `cands` to try the MOST-decomposed
  tier first (`affixed`, `suffix`, then `particle`, `proclitic`) so a
  simultaneously-eligible better reading wins instead of whichever sorts
  first, and added an explicit `split === chosen` skip — now that
  `proclitic`/`particle` can appear as their OWN candidate, `all.find` can
  return the literal entry already chosen, which previously would "confirm
  itself" and break the loop before ever reaching a genuinely different,
  better candidate. Not yet rebuilt/tested.
- Rebuild #4 surfaced a DIFFERENT, deeper bug via the actual app (Hebrews
  1:13, "sit at my right hand" — Psalm 110:1 quote): the word-block panel
  showed "LaYawamay (day, H3117)" where "right hand" (H3225) belongs — no
  "right hand" chip anywhere in the verse, even though `token_surfaces`
  DEFINITELY has a correct La+Yamayan+bare-𐤉 → H3225 row (confirmed by direct
  query). Cause: `all.find(r => r.tier === 'affixed')` (and the same pattern
  for every other tier) returns whichever candidate resolveAll() happened to
  push FIRST while iterating prefix-candidates × suffix-tails — an artifact
  of loop order, not a comparison of evidence. Two different `affixed`
  splits existed for this exact word (one landing on common "day", one on
  rarer "right hand"), and "day" simply got discovered first.
  Fixed with `bestOfTier(tier)`: scan every candidate in a tier and keep the
  one with the HIGHEST stem attestation, instead of the first found. Also
  widened `LOSABLE` to include `affixed`/`suffix` themselves — previously,
  if a WRONG `affixed` reading became `all[0]`, nothing could ever
  reconsider it even after `bestOfTier` could identify a better alternative,
  because the whole `PREFER_SPLIT` block was gated on `LOSABLE.has(chosen.tier)`.
  **Caveat, not yet resolved**: this is a frequency-based heuristic. If "day"
  is simply a FAR more common stem than "right hand" across the corpus (very
  plausible), picking the higher-attested candidate could still pick "day"
  even after this fix — frequency alone can't fully distinguish "this is the
  right analysis" from "this word coincidentally has a common stem." A
  stronger signal spotted in the same diagnostic: the wrong "day" reading's
  own components included an UNATTESTED filler piece (`css: 'mod-suff-unk'`,
  `derived: true`, empty translation) it had to invent to make its own split
  work, while the correct "right hand" reading's suffix component was
  properly attested (`reconstructed: true`, real BHS-sourced gloss). Preferring
  a candidate whose components are ALL attested over one that needs an
  invented filler is a more principled tie-breaker than raw frequency and
  the natural next step if this rebuild still gets Hebrews 1:13 wrong. Not
  yet rebuilt/tested.
- Traced Hebrews 1:13 with an exact-letter diagnostic (`diag-heb-1-13.js`,
  reads codepoints directly rather than trusting console output, which
  cannot render paleo) and confirmed precisely what was wrong. Raw word
  (ordinal 6): `L,Y,M,Y,N,Y` (6 letters, verified by codepoint). The chosen
  reading matched the first 2 post-`L` letters (`Y,M`) against an attested
  construct-plural form of "day" (canonical root Y-W-M — Hebrew day-words
  commonly drop the middle vav in construct/plural spellings, so a bare
  `Y,M` legitimately CAN be contracted "day"), took 1 more letter as a normal
  nme-j suffix, and was left with 2 letters (`N,Y`) it could not explain at
  all — so it emitted an empty, unattested `mod-suff-unk` filler just to
  account for them. Meanwhile H3225 (Yamayan, "right hand") is spelled with
  those exact 4 middle letters (`Y,M,Y,N`) as its OWN real, independently-
  attested root (confirmed earlier: ~61 bare occurrences, `prs=absent`), so
  `L` + `Yamayan` + `y` ("my") explains all 6 letters with nothing invented.
  Root cause: `resolveAll()`'s suffix/`affixed` loops only checked
  `FORMS.has(stem)` — never whether the TAIL itself had a real, attested
  gloss (`SUF_COMPS.has(tail)`) before accepting the candidate. A tail this
  file cannot gloss is not evidence for a split at all, so fixed by gating
  candidate GENERATION on `SUF_COMPS.has(tail)` in both the `suffix` and
  `affixed` loops, rather than comparing attested-vs-invented after the
  fact. Should mean the "day" candidate is never proposed for this word,
  leaving the fully-attested "right hand" `affixed` candidate (confirmed to
  already work correctly elsewhere in the corpus with La/Ma/Ba/Wa prefixes)
  as the only real option. Not yet rebuilt/tested.
- Rebuild proved the `affixed`/`suffix` fix worked exactly as intended
  (`ambiguous=1` is now set on the row, confirming `FORMS` genuinely carries
  BOTH readings for this bare 5-letter spelling), but exposed that this is
  NOT a segmentation bug at all — it's a true homograph. `𐤉𐤌𐤉𐤍𐤉` (bare, after
  stripping `L`) is independently attested BOTH as H1145 ("Binyamini",
  Benjamite, a gentilic adjective — `pos=adjv` confirms it) and H3225 ("my
  right hand"). H1145 wins on raw frequency (Benjamite is a common epithet
  throughout Judges/Samuel; "my right hand" 1cs is a narrower case), which is
  wrong specifically at Hebrews 1:13 (quoting Psalm 110:1, "sit at my right
  hand") but is presumably CORRECT wherever this exact spelling occurs as an
  actual Benjamite reference elsewhere. No amount of frequency-based
  tie-breaking can fix this correctly, because frequency is exactly what's
  failing — the less common reading is the right one here. This needs
  external context (recognizing the verse as a quotation) a whole-word
  matcher structurally cannot have.
  **Fix: occurrence-level override**, not another heuristic. Added
  `occurrenceOverrides` (Map, `"book_id|chapter|verse|token_ordinal"` ->
  forced Strong's) as a `buildHebSurfaces()` option, threaded into `bestOf()`
  (which is where H1145-vs-H3225 actually gets decided, for EVERY tier —
  `exact`'s `hit.forms=[w]` still runs through `bestOf(w)` same as any split
  tier). `bestOf(form, forcedSN)` only overrides if the form's OWN attested
  readings actually include `forcedSN` — it can never fabricate a reading
  that isn't independently attested, same evidence discipline as everything
  else in this file. Deliberately occurrence-keyed, NOT word-shape-keyed like
  `surface-strongs-overrides.json` (BHS-only, and explicitly skipped for HEB
  source in server.js already) — a blanket "this spelling always means X"
  rule would break every OTHER (correct) Benjamite occurrence of the same
  letters. New file: `server/lexicon/heb-occurrence-overrides.json`
  (`"58|1|13|6": "H3225"` pinned for this exact case), loaded by
  `build-surface-index.js` exactly like `heb-offset-pins.json` already is.
  Not yet rebuilt/tested.
- NOT YET FIXED (lower priority, flagged 2026-07-27): `build-align-links.mjs` (the
  script that CREATES `translation_links` rows in the first place) has this same
  `comps.find(c => c.css === 'root')` read, and appears to use the resulting `tr`
  as part of its own English-word-to-Hebrew-token matching/scoring, not just
  display. This doesn't affect any EXISTING link (those are already fine now that
  render-corpus.mjs bypasses components for display), but if this script is ever
  RERUN to regenerate links from scratch, a reconstructed/suffixed `tr` could bias
  which token gets linked to which English word. Worth the same audit before that
  script is next used for a real rebuild, not urgent before then.
- `translation.db` can silently freeze a verse's rendered text at whatever it was the
  FIRST time it was ever seeded (see `load-english-baseline.js` / `reseed-translations.mjs`
  history in git/session notes, 2026-07-27) — meaning a correct code fix can be made and
  still not be visible until the seeding scripts are rerun. **After ANY change to
  `apply-web-strongs.mjs`, `render-corpus.mjs`, or the CHAR_MAP/transliteration logic,
  the full pipeline must be rerun in order** (`apply-web-strongs.mjs` ->
  `load-english-baseline.js` -> `render-all.mjs --surface` -> `verify-no-eliding.js` ->
  restart the server) **before concluding a fix did or didn't work.** A screenshot taken
  without rerunning the pipeline proves nothing about whether the code fix is correct.
- `corpus.db`'s `verses` table already carries `code` (book code, e.g. `MAT`) and `canon_id`
  directly as columns on every row — a diagnostic script never needs to load a separate
  book-order/book-meta file to map one to the other. (fieldy, 2026-07-27: "my api.js has
  relevant info for canon mappings, this should be preserved in CLAUDE.md" — the general
  point: canon/book-code mapping lives on the `verses` rows themselves, not in a side file,
  so don't go hunting for one.)
- `text_src` (the "pristine, immutable" baseline `--from-src` rebuilds read from) is only as
  pristine as whatever `text` contained the FIRST time `--init-src` ever ran for that row —
  if a names/terms substitution pass had already dirtied `text` before that, the substituted
  form gets frozen into `text_src` as if it were the original English, and every future
  rebuild treats the wrong word as ground truth (the real English word is gone from the
  snapshot, so no rule can ever match it again to correct it). Found 2026-07-27: "Salmon"
  (Matthew 1:4-5, ancestor of Boaz) had already been substituted to "Shalamah" before capture,
  and because "salmon" later became an ambiguous/excluded name in `word-map.json` (a second,
  different OT spelling exists), nothing could ever re-derive or correct it — worse, "Shalamah"
  collides with Solomon's own CORRECT transliteration (H8010), so the two distinct people
  render identically in the English prose. `english-web-raw.jsonl` holds the true untouched
  WEB wording and is the only reliable way to detect/repair this class of corruption — compare
  `text_src` against it, but expect MOST diffs to be correct, intentional name transliteration
  (Jesus->Yashawai, David->Dawad, etc.), not corruption. Only a diff that collides with, or is
  orphaned from, ANY current rule is the bug.

## "book_id" means two different things — do not mix them (added 2026-07-27)

The single biggest source of "I fixed it, reran the whole pipeline, and the reader STILL
shows the old text" this session turned out to be this, not a rendering bug at all: the
column name `book_id` is reused across this codebase for **two incompatible numbering
schemes**, and several places silently passed a value from one scheme into a query that
needed the other. Every such mismatch fails silently — it just matches zero rows — so
nothing ever errors, it just quietly never updates.

**Scheme A — canon_id.** One stable number per canonical book, the SAME across every
corpus/edition. Matthew is always 40. This is what's stored in:
- `translation.db`'s `translations.book_id` column (confirmed empirically 2026-07-27 —
  querying for known text found Matthew rows under `book_id=40`)
- `translation.db`'s `translation_links.book_id`
- `corpus.db`'s `tokens_bhs.book_id` and `tokens_nt.book_id`
- `surface-index.db`'s `book_id` columns (`token_surfaces`, `surface_occurrences`)
- `corpus.db`'s `verses.canon_id` column itself (the source of truth for this scheme)
- the `/api/translate/*` and `/api/parallel/*` server.js routes' `?book=`/`book_id` request
  params — these all treat the param as canon_id directly (confirmed: `/api/translate/chapter`
  literally does `WHERE corpus='ENG' AND canon_id=?` with that param)

**Scheme B — the per-corpus-ingest surrogate key.** A different, arbitrary auto-increment
number for EVERY corpus/edition of the same book, assigned by insertion order into
`corpus.db`, with no relationship to canon order. Example, Matthew: GNT/HEB book_id=138,
ENG book_id=6097, LAT=1921, GEZ=2727, SYR=5806, COP=5898. This is what's stored in:
- `corpus.db`'s `verses.book_id` column
- `corpus.db`'s `books.book_id` column (the metadata/title lookup table — confirmed to use
  the SAME values as `verses.book_id`, so these two at least agree with each other)
- the `/api/source/:src/*` server.js routes' `?book=` request param — these resolve against
  `src.handle`'s (i.e. `verses`) `book_id`, which is per-corpus, so this is CORRECT for
  querying the verse text itself. The bug is always downstream of this, when that same
  value then gets reused to query something in Scheme A.

**The rule:** any time code reads a row from `corpus.db`'s `verses`/`books` tables and then
uses ITS `book_id` to query `translation.db`, `tokens_bhs`, `tokens_nt`, or `surface-index.db`
— STOP. That row's `book_id` is Scheme B. Use its `canon_id` column instead (add it to the
SELECT if it isn't already there).

**Confirmed bugs from this exact mixup, all fixed 2026-07-27:**
- `reseed-translations.mjs` read `corpus.db verses.book_id` (Scheme B, e.g. 6097 for ENG
  Matthew) and wrote it straight into `translation.db.translations.book_id` (Scheme A,
  needs 40) — every "reseed" since this script existed wrote fresh corpus.db text into a
  NEW orphan row under the wrong book_id that no endpoint ever reads, while the REAL row
  (canon_id 40) that the API actually serves sat frozen at whatever it held from the last
  time it was correctly seeded. This is why Matthew 1:4-7's Salmon/Solomon and "abaya"
  fixes kept looking like they "didn't work" no matter how many times the render pipeline
  was rerun — corpus.db's own `text` column WAS being correctly updated the whole time;
  translation.db just never received it. Fixed to read `canon_id AS book_id` instead.
- `/api/source/:src/chapter`'s Studio-override block (added earlier the SAME day, to fix a
  DIFFERENT bug) used the route's own `book` param — Scheme B for this route — to query
  `translationDb.stmts.chapterProgress`, which needs Scheme A. It had been a no-op since
  the moment it was written, for every non-OT book. Fixed to use the fetched verse row's
  own `canon_id`.
- `/api/source/:src/verse`'s equivalent single-verse override had the identical bug
  (`row.book_id` instead of `row.canon_id`). Fixed the same way.
- **Not yet audited**: any OTHER spot that reads a `book_id` off a `corpus.db verses`/
  `books` row and forwards it to `translationDb`, `tokens_bhs`, `tokens_nt`, or
  `surface-index.db` without translating to `canon_id` first. The three above were found
  by chasing one specific symptom (Matthew 1 not updating) — this class of bug produces NO
  error, so grep for `book_id` reads from `src.handle`/`verses`/`books` queries feeding
  into translation.db calls before trusting any other code path that crosses this boundary.

## `SELECT rowid` can silently return under a different key — verify writes, don't trust the log line

Found 2026-07-27 fixing the Matthew 1:6 duplicate-link cleanup. `translation_links` has a
declared `id INTEGER PRIMARY KEY` column, which SQLite treats as a real alias for the
rowid — but a `SELECT rowid, ...` query against it comes back with the field labeled `id`
in the result object, not `rowid`. Code that does `const {rowid} = row` in that situation
silently gets `undefined`, and `DELETE ... WHERE rowid = ?` bound to `undefined` matches
zero rows with NO error — better-sqlite3 doesn't throw, SQLite doesn't complain, the
`.changes` count is just quietly 0. A first version of the cleanup script counted "cleared
81 rows" by incrementing a counter unconditionally after every `.run()` call instead of
checking `.changes`, so it printed a confident success message while deleting nothing at
all — confirmed only by re-querying the table afterward and finding all 12 rows for
Matthew 1:6 still present. **Two standing rules from this:** (1) when a table might have
its own declared primary-key column name, use that name directly instead of the generic
`rowid` alias; (2) any script that reports "deleted/updated N rows" must derive N from
`.changes`, never from a loop counter that increments regardless of whether the write
actually matched anything — and after any bulk write, re-query and print the actual
resulting state rather than trusting the write path's own success message.
