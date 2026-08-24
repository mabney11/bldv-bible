# CLAUDE.md — project rules for paleo-studio

## Every H378a surface form now shows the canonical Yod, not just the root header — new `raw_root` splice mechanism (added 2026-08-24)

Follow-up to the two sections directly below (same day). Once those shipped,
`/roots?sn=H378a` correctly showed real occurrence counts, real by-book tallies, and
a working per-book drill-down — but the 106 entries in "SURFACE FORMS" still showed
the literal ATTESTED spelling (no Yod), while the page's own header showed the
reconstructed canonical root (with Yod). fieldy: "I want the occurrences of the
other surfaces to have the yod as well. Treat this word as the source of truth
despite its usage."

**Why this was showing the attested spelling at all.** This is intentional,
existing behavior working as designed — just not what's wanted for a
deliberately-reconstructed root. The reading-text prose and the word-by-word
component breakdown (Reader, VersePage, Parallel) already substitute the canonical
root at render time — that's the existing "Two display surfaces" rule elsewhere in
this doc. But the Root Explorer's Surface Forms list, and the underlying nav-index
`_surfNavIndex`/`bySurface` build it's sourced from (`foldRowsToWords()` in
server.js, plus its HEB-edition twin in `buildNavIndexes()`), work directly off
each token's raw `word_raw` — the literal written word, by design, so that a
surface is "the actual written word" for every OTHER (non-reconstructed) root in
the corpus, which is the correct default. H378a is the first root where that
default and the desired behavior diverge.

**New mechanism, general-purpose (not H378a-specific code):**
- `strongs-renumber.json` entries gained an optional `raw_root` field — the OLD,
  actually-attested root spelling that the new canonical root (`strongs-roots.json
  [to]`) is replacing. Set for H802: `raw_root: "𐤀𐤔𐤄"` (confirmed by diffing
  against H800/H801, which still carry this exact 3-codepoint spelling unchanged —
  H378a's canonical root is that same string with one Yod, U+10909, inserted after
  the Aleph). Omitting `raw_root` on a future renumber entry opts out of this
  entirely — a pure relabeling with no root respelling involved leaves surfaces
  untouched, which is the right default for most renumbers.
- New helper `canonicalizeRootSurface(rawPaleo, sn, snRenumber)` in server.js: if
  `rawPaleo` starts with a `raw_root` whose renumber entry targets `sn`, swap that
  LEADING SPAN for the canonical root and keep everything after it (a suffix, a
  construct-state ending, whatever) exactly as attested. Deliberately a plain
  leading-substring swap, not a real morphological re-parse — see the code comment
  for why (can't test against every real form in this sandbox, so a missed splice
  is the acceptable failure mode, not a wrong one).
- Applied at the ONE place both the nav-index build and every occurrence-lookup
  path share: `foldRowsToWords()`'s content-morpheme row (BHS), and the equivalent
  single-row HEB paths in `buildNavIndexes()`'s `hebSurf` loop and
  `findWordOccurrences()`'s two HEB branches. Because `foldRowsToWords` is the same
  function `buildNavIndexes()` (nav index) AND `findWordOccurrences()` (occurrence
  lookups, incl. `/api/surface-explorer/surface`'s `w.surface === word` match) both
  call, canonicalizing it in ONE place keeps every consumer self-consistent — no
  separate reverse-lookup needed the way the SN-aliasing fix below required, since
  both sides of every surface-string comparison are now built the same way.
- `NAV_BUILD_VERSION` bumped to `wordsurf-v8-canonical-surfaces` to force a
  disk-cache rebuild (a cache built before this existed has surfaces baked with the
  old spelling).

**Scope check — what this does NOT touch:** `Search.jsx`'s `/api/search` route
queries `tokens_bhs.word_raw` directly via SQL, never through `_surfNavIndex`, so
literal-text search is unaffected either way. `getCanonicalRoot()` / the root
header / reading-text prose / word-table breakdown were already correct before
this and are unchanged.

**Not run or tested this session** — same standing constraint (broken
`better-sqlite3` binding). `node --check` only. After restarting with all three
fixes from today: confirm the Surface Forms list under H378a visibly contains the
Yod in every entry, that clicking one drills into real verses (not "not in text"),
and — importantly — spot-check a construct-state form if the text has one (e.g.
"wife of X") to see whether the leading-substring match missed it (expected,
documented limitation) rather than mangling it (would be a real bug to report
back).

## H378a's own Root Explorer page: occurrence drill-down returned "0 of 0 hits" — raw SQL was still searching for the old H802 tag (fixed 2026-08-24)

Follow-up to the `/api/tokens` fix directly below. Once that shipped, `/roots?sn=H378a`
correctly showed the header (Ayashah, 1,612 occurrences, right prev/next neighbours)
and correct-looking per-book counts (Genesis 151, Jasher 319, etc.) — but clicking
into any book ("BY BOOK — TAP TO FILTER") returned "0 of 0 hits" / "No occurrences
found" for every one of them. fieldy: "I see 378a, this happens when I click on the
number, the surface forms are off, and the matches within books dont hit."

**Root cause — a second, different flavor of the same class of bug.** The header/
by-book COUNTS come from the in-memory nav index (`buildNavIndexes()`'s
`_surfNavIndex`/`_wordBySn`), which the renumber fix from below already reaches — so
those numbers were right. But clicking a book calls `GET /api/root-explorer/verses`,
which calls `findWordOccurrences(entry.sn, ...)`, which builds a **raw SQL** query
(`strongWhere`) binding `entry.sn` — now `"H378a"` — directly against
`tokens_bhs.strongs`. That column is never physically rewritten by a renumber; it
still only ever contains `"H802"`. So the query legitimately matched zero rows.
Same story one level down in `hebOccForSN` (the token_surfaces/HEB-edition
equivalent), used for the HEB books BHS doesn't cover.

**Fix, in `server/server.js`:**
- New helper `rawSnAliasesFor(sn, snRenumber)`, the reverse of `applySnRenumber` —
  given a (possibly-new) SN, returns every OLD SN whose `snRenumber` entry points to
  it, plus the SN itself unchanged. For the overwhelmingly common case (a number
  that was never renumbered) this is just `[sn]` — zero behavior change.
- `findWordOccurrences()` now builds its `strongWhere` clause from
  `rawSnAliasesFor(sn, snRenumber)` instead of the bare requested `sn` — so a
  request for H378a searches tokens_bhs for H802 (what's actually stored), and the
  ALREADY-renumbered row data downstream (`applyLocOverridesToRawRows` still runs
  on every matched row) is what gets compared against `entry.sn` in the caller's
  `match()` predicate, so the equality check (`w.sn === entry.sn`, both now
  `"H378a"`) still holds.
- `hebOccForSN()` does the same: loops over every alias, queries
  `token_surfaces.strongs` for each, and merges/dedupes the results by
  book/chapter/verse/token_ordinal (normally one alias, one query, no behavior
  change).

**Re: "the surface forms are off"** — I could not reproduce or disprove this one
directly (same broken-`better-sqlite3`-binding constraint as everything else this
session), so treat this as a hypothesis, not a confirmed second bug. The SURFACE
FORMS list under a root entry shows the word's actual ATTESTED spelling as written
in the text (`word_raw` — a real Masoretic consonantal form), not the reconstructed
canonical root shown in the page header. H378a's canonical root was deliberately
respelled to `𐤀𐤉𐤔𐤄` (Ayashah, WITH a Yod) per the H802→H378a reasoning below — but
the actual Biblical Hebrew consonantal text for "wife/woman" essentially never
carries that Yod (the standard spelling is the 3-letter `𐤀𐤔𐤄`, doubled Shin). If
that's what's being seen, every surface form listed will visually look like it's
"missing" the header's Yod — which is the expected, deliberate consequence of the
root reconstruction, not a data bug. Please check, after restarting with the fix
above: do the 106 listed surface forms actually belong to wife/woman occurrences
(click through a couple — same book/verse coordinates the by-book counts now
correctly resolve to), or are they showing spellings that don't belong to this word
at all? The former is expected-but-worth-a-UI-note; the latter would be a real,
different bug I haven't found yet and would need to dig into `getSurfacesForSN`/
`_wordBySn` construction specifically.

**Not run or tested this session** — same standing constraint. `node --check`
only, on both the local edit and the copy pushed to the device. Verify after
restart: `/roots?sn=H378a` → click Genesis in "BY BOOK" → should show 151 real
verse cards, not "No occurrences found"; same for at least one more book in the
list to be sure it's not a Genesis-specific coincidence.

## The H378a renumber wasn't reaching the reader/Parallel STRONGS# link — `/api/tokens` never called the renumber helper (fixed 2026-08-23)

Follow-up to the H802 -> H378a renumber below. fieldy reported the STRONGS# badge in
the word-by-word table (e.g. `/genesis/2/24`) was still reading `H802` and still
linking to `/roots?sn=H802` — which now correctly 410s, but that's a dead end for a
reader clicking through from the text. Ask was: "build front end, i expect the numer
i can click on to point to the new permanent number."

**There is no frontend renumber logic to build.** Every `<a>`/`<Link>` in the app
that points at `/roots?sn=...` (VersePage.jsx, Reader.jsx via WordBlock.jsx,
Parallel.jsx, Root.jsx itself) just echoes back whatever SN string the API handed
it — `t.strongs`, `word.strongs`, `g.strongs`, `l.sn`, etc. There's no separate
place on the client where "H802" gets typed in or looked up. So the fix has to be
100% server-side: make sure every API response that carries a token's Strong's
number has already run it through `applySnRenumber` before it goes out. Once that's
true, every link in every one of those components is correct for free.

**The actual gap:** the renumber helper (`applySnRenumber`, wired into
`applyLocOverridesToRawRows` / `applyLocOverrideToSurfRow` per the section below)
was reachable from `buildNavIndexes()` (root explorer) and `bhsVerseWords()` (roots
page verse breakdown) — but NOT from `GET /api/tokens`, which is the actual endpoint
`apiTokens()` in `src/lib/api.js` hits, and which `VersePage.jsx`, `Reader.jsx`,
`HebrewViewer.jsx`, and `Parallel.jsx` *all* call for their word-by-word data. That
route's fast path (the one serving ~99.9% of requests, per its own comment) only
called `applyLocOverrideToSurfRow` when `hasLocOverrides` was true — i.e. only when
`strongs-location-overrides.json` had at least one entry. Since the H802 fix used
the separate blanket-alias file (`strongs-renumber.json`), not a location override,
that gate never opened, so the renumber never ran on this path. The two live-parse
fallback branches in the same route (empty-surface-index-cache and
drift/override/homograph-detected) had the same gap in a different shape: they
build raw text lines straight from `tokenQueryFor(...)` rows and hand them to
`parseHebrewData`, without ever calling `applyLocOverridesToRawRows` on those rows
first — so a live-parsed chapter would carry the old SN even though the fast-path
render (for a chapter without that drift) wouldn't.

**Fix, all in `server/server.js`'s `GET /api/tokens` handler:**
- `hasLocOverrides` gate → now `hasLocOverrides || hasSnRenumber`, where
  `hasSnRenumber = snRenumber && Object.keys(snRenumber).length`. The fast path now
  runs `applyLocOverrideToSurfRow` (which already applies the renumber
  unconditionally, see below) whenever a renumber table exists, not only when a
  location override does.
- Both live-parse fallback branches now call
  `applyLocOverridesToRawRows(mappedRows, {}, bookId, chapter)` on the merged raw
  rows before `rowsToLines(...)` — empty `{}` for `locationOverrides` deliberately,
  since these fallbacks never applied per-occurrence overrides before either and
  that's not this fix's job; only the renumber pass is new here.

Not touched: `/api/raw` (raw pipe-delimited token viewer, not used to render any
`/roots?sn=` link anywhere in the app) and `/api/root-explorer/*` /
`/api/surface-explorer/*` (already correct — they're built from
`buildNavIndexes()`, which was already patched in the section below).

**Not run or tested this session** — same constraint as the H378a work below: this
sandbox's `better-sqlite3` binding is broken here (`invalid ELF header`), so I could
only `node --check` the file, not exercise `/api/tokens` against a live server.
fieldy, after restarting the server (a route-logic change like this needs a full
process restart, not just the lexicon hot-reload), please check:
- `/genesis/2/24` (or any verse with the old Ayashah word) — the STRONGS# badge
  should read `H378a`, not `H802`, and clicking it should land on `/roots?sn=H378a`
  with no 410.
- Same for `/genesis/2/23` in the Parallel viewer and in HebrewViewer.
- `/roots?sn=H802` directly typed into the address bar should still 410 with the
  moved payload — that tombstone path is unaffected by this change.

## H802 renumbered to H378a, with a tombstone at the old number — data move + code, not just data (added 2026-08-22)

fieldy confirmed bldbible.com IS this app (renamed paleo-studio) and scoped this precisely: "Just
tombstone and API" — no new numeric-browse UI, just make the old number redirect/explain itself
and make the display number correct everywhere the app already shows one. Verified live against
production with Claude in Chrome before and after writing any code (see below) — this is not a
blind change.

**What was verified live, before touching code:** `/roots?sn=H377` on bldbible.com confirmed the
root explorer sorts **alphabetically by root spelling** ("roots, Hebrew-alphabetical" — visible in
the page itself), NOT by ascending Strong's number — fieldy: "the strongs #s are supposed to be
alphabetical by default... starting at H377 the next word is the next lexically ordered word."
That means the H802 root fix from earlier today (repointing it to derive from H376/Ayash instead
of colliding with H800/H801's fire-root) was, by itself, already enough to fix WHERE the word
shows up in that alphabetical list — no separate browse-ordering feature needed, which simplified
this from what I'd originally scoped as "build a new sequential-by-number browse mode." Confirmed
live at `/roots?sn=H802` (bldbible.com had already been redeployed with the earlier root fix by
this point): the sidebar showed H376 Ayash, H377 Ayash, H378 Ayashabashath, **H802 Ayashah** —
already sitting exactly between H378 and H379 (Ayashahawad), purely from the alphabetical sort.
fieldy's "378a" placement (from the H802-move session earlier today) is exactly right, confirmed
by what the live app already does, not a guess.

Also discovered live: the Reader's own word-by-word table ("STRONGS #" column, linking to
"Explore root H###" -> `/roots?sn=H###`) was STILL showing the old pre-fix data ("Ashah — fire /
offering made by fire") even though `/roots?sn=H802` itself showed the corrected "Ayashah — wife /
individual woman." That's `_strongsRootsCache` (strongs-roots.json) not being hot-reloaded — see
the earlier H802 entry in this file — production had the new FILES but hadn't been restarted yet.
Not something to fix in code; just confirms (again) that a restart is load-bearing here, not
optional.

**What "renumbered to H378a" actually means, mechanically:** the raw per-token Strong's number in
`tokens_bhs`/the HEB-edition surface index stays `H802` — that's ground-truth ingested data from
the source Hebrew morphology, ~1,614 occurrences corpus-wide, not something to rewrite in place.
Instead, added a new, small **blanket alias registry**, `server/lexicon/strongs-renumber.json`
(`{"H802": {"to": "H378a", "reason": "...", "date": "..."}}`), loaded via `loadLexicons()` in
`server.js` and applied by a new `applySnRenumber(sn, snRenumber)` helper. This is deliberately a
DIFFERENT mechanism from `strongs-location-overrides.json`: that file is for a handful of
individual mis-tagged OCCURRENCES (keyed by book:chapter:verse:token_ordinal, a real homograph
split at one specific spot); `strongs-renumber.json` is for renumbering a WHOLE Strong's number,
uniformly, everywhere — using the per-occurrence file for this would have meant generating ~1,614
individual entries for something that's actually a single, uniform fact ("H802 is now H378a"),
bloating a file meant to stay small and surgical. Also: this session's device-bridge sandbox can't
open `corpus.db` here (`better-sqlite3`'s native binding gives "invalid ELF header" through this
bridge, confirmed again this session), so a script that had to enumerate 1,614 individual
occurrences couldn't have been run or checked from here anyway — the blanket-alias design avoids
needing that enumeration at all, which matters given the sandbox limitation, not just for tidiness.

**Where the alias gets applied** (server.js): `applyLocOverridesToRawRows` and
`applyLocOverrideToSurfRow` — already the documented "every choke point that reads a token's
strongs value for display" for the reader/Parallel/Hebrew-Viewer live rendering — now apply
`applySnRenumber` unconditionally, before their existing per-occurrence override logic, so H802
displays as H378a (badge + `/roots?sn=` link) wherever a word's Strong's # is shown outside the
Root Explorer. Inside `buildNavIndexes()` (the Root Explorer's own index — `/api/root-explorer/*`,
`/sitemap-roots.xml`), the SAME alias is applied directly in the three raw-SN-reading loops that
don't go through those two shared functions: the BHS `snRows`/`bySn` loop, the HEB
`hebNavIterate()` loop, and the BHS `allRows` first-appearance loop. Net effect: after a rebuild,
`_rootNavIndex` has NO entry at all under `H802` any more — every occurrence folds into `H378a`
from the moment the index is built, so the Root Explorer, its sidebar list, and its sitemap all
just show H378a natively, with no separate patch needed in any of those three.

**The nav-index disk cache (`nav-index.cache.json`) would have silently shadowed all of this** —
its staleness check (`_navCacheStamp()`) hashes a fixed list of input file mtimes plus a
`NAV_BUILD_VERSION` string, and `strongs-renumber.json` wasn't in that list. Added it to the input
list AND bumped `NAV_BUILD_VERSION` (`wordsurf-v6-sn-scoped-surfaces` ->
`wordsurf-v7-sn-renumber`), per this file's own established rule: bump the version whenever
buildNavIndexes' LOGIC changes, not just when an input changes — this is a logic change (three new
call sites), and belt-and-suspenders with the input-list addition means a stale cache genuinely
cannot survive this deploy.

**The tombstone** (fieldy: "someone scanning 801->802->803 should allow a landing on 802 with a
message for my changing the strongs number and location of it"): `GET /api/root-explorer/root`
now checks `strongs-renumber.json` for the requested `?sn=` BEFORE calling `resolveRootIdx` (which
would otherwise just 404 it, since H802 has no nav-index entry any more after the change above).
A renumbered old number returns HTTP 410 Gone with `{ moved: true, from: "H802", to: "H378a",
reason, date }` instead of the normal root payload or a bare 404. This is the "just tombstone and
API" fieldy asked for — the FRONTEND (Root.jsx) doesn't yet render anything special for a 410 with
this shape; it'll show whatever its generic error-state does today. Rendering an actual "this
number moved, here's why, click through to H378a" UI is a follow-up if fieldy wants it — out of
scope for this pass on purpose.

**strongs-roots.json**: added `"H378a": "𐤀𐤉𐤔𐤄"` alongside the existing `"H802": "𐤀𐤉𐤔𐤄"` (same
value, both keys) — H802 has to stay mapped correctly too, because `apply-web-strongs.mjs` (the
Reader's baked-English-prose pipeline) reads the raw `tokens_bhs.strongs` value directly and knows
nothing about `strongs-renumber.json` — it never got wired into that offline path, only the live
server. That's deliberate for this pass, not an oversight: the baked Reader prose already renders
correctly as "Ayashah" today (from the H802 entry, done earlier this session) with no dependency
on the renumbering feature at all.

**Not run or tested this session** — same limitation as the earlier H802 fix: this device-bridge
sandbox's `better-sqlite3` binding can't open `corpus.db` here, so none of this was exercised
against a running server. `node --check` passed on the edited `server.js` (syntax only). Please
run the usual pipeline (`apply-web-strongs.mjs` -> `load-english-baseline.js` -> `render-all.mjs
--surface` -> `verify-no-eliding.js`), restart the server, and specifically check: `/roots?sn=H802`
should now return a 410 with the moved payload (or whatever the frontend shows for that status);
`/roots?sn=H378a` should show the Ayashah entry with correct prev/next neighbours (H378
Ayashabashath / H379 Ayashahawad); and the Reader/Parallel word-by-word table's STRONGS# badge for
any Ayashah occurrence (e.g. Genesis 2:23) should read H378a and link to `/roots?sn=H378a`.

## Reader.jsx's quote parser never closed a curly ‘ opened-single-quote if the source closed it with a straight ' — one runaway nested block per occurrence (added 2026-08-23)

**Follow-on to the entry directly below this one** — after the OT re-render, fieldy screenshotted
Genesis 2 and 3 live: verse 23's quote correctly opened and closed in the DATA (verified directly
against the regenerated `english-baseline.jsonl`: `"zaath (this) is...out of ayash (husband...)."`
— clean pair, both straight `"`), but verses 24 and 25 still rendered indented as if still inside
a quotation, and the closing `"` rendered stranded alone on its own line. Chapter 3 showed the
same shape one verse earlier.

**Root cause was in `src/pages/Reader.jsx`'s `parseQuoteMarks`, not the data.** `PLAIN_QUOTE_RE`
only ever matched `" “ ” ‘ ’` — a plain straight `'` was completely invisible to the parser, never
even considered as a candidate mark. Genesis 2:23's actual text has a NESTED single quote that
**opens with a real curly `‘`** ("She will be called `‘ayashah...,") **but closes with a plain
`'`** instead of a curly `’` — confirmed as a scrape artifact of `web-strongs.jsonl` specifically:
`english-web-raw.jsonl` (the clean WEB source) has the correctly-paired curly close in the exact
same spot. Since the parser couldn't see that `'` at all, the curly1 node it opened NEVER closed —
it just silently absorbed everything after it, including the verse's own OUTER closing `"` right
next to it (which then got misread as a brand-new unclosed straight-quote OPEN, since the parser's
`top` was still the never-closed curly1 node, not the straight one). Both of those bogus
still-open nodes then swallowed verse 24, verse 25, and everything else in the chapter after them
as their "content" — exactly the runaway-indent symptom in the screenshot. This is a data-format
mismatch the parser's own straight-quote design didn't anticipate: the big comment above
`dissolveOverlongQuotes` already explains at length why STRAIGHT quotes get capped/dissolved but
curly ones are trusted at any length — this bug is the flip side of that same fragility, just
triggered by a curly *open* meeting a straight *close* instead of two straight quotes drifting out
of sync.

**Fix:** `PLAIN_QUOTE_RE` now also matches a bare `'`, but it is deliberately never allowed to be
an OPENER (far too common as an ordinary apostrophe/possessive — Jacob's, wife's, don't — for that
to be safe) and never closes anything except a currently-open `curly1` (‘) node specifically. Every
other position a `'` appears in — no curly1 open, or already closed — falls through exactly as
before this change (inert, rendered as plain text), so this is additive: nothing that rendered
correctly before can regress from it. Verified standalone (extracted just `parseQuoteMarks` into a
throwaway Node script, no JSX/build tooling needed) against the live Genesis 2:22-25 and 3:1-3 text
pulled straight from the regenerated `english-baseline.jsonl` — both nested quotes now close inside
their own verse, and verses 24/25 (Genesis 2) and verse 2 (Genesis 3) render as plain, unindented
narrative the way they should. Full-file syntax verified with `esbuild` (no `--loader` flag needed
for a `.jsx` extension) since `node --check` can't parse JSX.

**Not yet re-verified live** — this was fixed and pushed to `src/pages/Reader.jsx` without a
browser in this loop; fieldy needs to reload the Reader (no pipeline rerun needed, this is a
front-end-only fix — the data was already correct) and re-check Genesis 2 and 3 look right now,
plus spot-check a few more chapters where a nested ‘…’ appears, since `web-strongs.jsonl`'s
curly-open/straight-close pattern is not unique to Genesis.

## OT English quotation marks: a single regex was stripping the closing quote off ~2,465 verses (added 2026-08-22)

**The ask:** corpus-wide English quotation consistency — "who said what," with the Reader's
existing nested-quote indentation actually showing up. Genesis 2:16-18 (Yah's speech to Adam)
was the reported example: no quote marks anywhere, even though verse 18 is a textbook direct
quotation ("It is not good that the man should be alone...").

**Important, checked first: the Reader-side feature already exists and is mature.** `src/pages/
Reader.jsx` (`parseQuoteMarks`, `sliceQuoteTree`, `dissolveOverlongQuotes`, `renderQuoteTree`,
~line 305-546) already parses quote characters out of the raw verse text, tracks nesting depth
across a whole chapter (so a quote opened in one verse and closed three verses later still
renders as one block), and renders each depth as its own indented `<span class="rd-quote-d1..4">`
(`Reader.css` ~line 833-940 has the full depth/margin/highlight styling, including the
`!important`-safe overrides the WordBlock.css section of this file warns about). None of that
needed to be built — Genesis 1:9's multi-verse "Let the waters..." quote is even cited in the
Reader.jsx comments as a working example. **This was entirely a data problem**: the OT English
baseline verse text itself had almost no quote marks in it, so the parser had nothing to find.

**Root cause #1 (the big one) — `server/apply-web-strongs.mjs`'s final text-cleanup chain ended
with `.replace(/\s*"\s*$/,'')`, commented "stray trailing quote from the page".** This
unconditionally deletes a `"` if it's the LAST character of a verse's assembled text — which is
exactly where a huge fraction of Biblical direct speech ends, since dialogue very often closes
right at the verse boundary. Measured directly against `web-strongs.jsonl` (the actual input this
script reads): **2,465 verses across 38 of the 39 OT books** end in a quote mark that this one
line was silently deleting on every rebuild. Genesis 2:17 ("...you will surely die.\"") and 2:18
("...I will make him a helper suitable for him.\"") are both this exact bug. No evidence was ever
left for why this line existed (squashed "Initial commit" repo, no prior blame to check) and no
comment anywhere names a real scraping artifact it was protecting against — given the measured
harm and zero found benefit, **removed outright**, replaced with a comment explaining why, should
anyone be tempted to re-add a blanket strip like it later.

**Root cause #2 (smaller, still systemic) — `web-strongs.jsonl` itself (scraped from an
interlinear/study-bible page, not the clean WEB text) is regularly missing the OPENING quote
mark before direct speech**, even though the corresponding close is present later. Measured: 178
of 1,674 `said,`/`saying,`/`answered,`/`spoke,`/`commanded,`/etc. constructs across the OT are
followed immediately by a capitalized word with NO quote mark — e.g. Numbers 36:6 ("saying, Let
them be married...") and Judges 2:3 (which already HAD its closing quote — "...snare to you.\"" —
just not the matching open). Fixed with a new evidence-gated regex, `SPEECH_VERBS_RE` (defined
just above the main verse loop in `apply-web-strongs.mjs`, applied in the same place the old
strip used to run): only fires when the very next non-space character after the comma is a
capital letter with **no** quote mark already there, so it can never double-insert and never
touches the common indirect-speech case ("he said, however, that...").

**Verified before handoff, without touching the DB:** wrote a standalone reproduction of just the
quote-handling half of the regex chain (no Strong's/OSHB lookup needed — word-level Hebrew
substitution doesn't add or remove quote characters, so this is a valid way to test quote
correctness in isolation) and ran it against `web-strongs.jsonl` directly. Genesis 2 and 3, Exodus
3, 1 Samuel 3, Job 1, and Judges 2 all came out correctly quoted and correctly nested (Exodus
3:14-18 in particular has a genuine THREE-level nest — outer "you shall tell..." containing 'Yahweh
has sent me...' containing "I have surely visited you..." — and it renders exactly right).

**Known residual gap, NOT fixed here, flagged for manual review:** `web-strongs.jsonl` has a small
number of verses with a genuinely MISPLACED quote mark (not missing — misplaced), where a stray
`"` sits right before a narrator tag ("He said," / "They said,") with nothing legitimate to its
left to close. Genesis 45:4 is the clean example: "...They came near. \"He said, I am Joseph,
your brother..." — that opening `"` has no reason to be there (the previous sentence is plain
narration, not dialogue), and with fix #2 above it now collides with the newly-inserted real
opening quote right after "He said,", producing a double-open. This is NOT something either fix
above can safely auto-correct — it requires knowing the mark is spurious, not just missing, which
a local regex can't distinguish from the very common and completely correct "...?\" He said,
\"..." exchange pattern (verified: a naive "quote directly before a narrator tag" detector flags
~250 instances, and all but a literal handful of them are normal, correctly-formed dialogue
exchanges). A proper sequential quote-depth scan (mirroring Reader.jsx's own `parseQuoteMarks`,
run chapter-wide) narrowed real candidates down to single digits (Genesis 45, Numbers 20, 1 Samuel
10, 2 Samuel 12, 1 Kings 18 ×2, 2 Kings 2) — small enough for a human pass, not safe to blanket-fix
by pattern. The Reader's own `MAX_QUOTE_CHARS` dissolve-on-overlong safety net (straight-quote
spans only, see the big comment above it in Reader.jsx) already limits how far any one of these
can visually cascade, so nothing breaks catastrophically in the meantime.

**NT (Matthew–Revelation) needed none of this.** `server/english-nt-baseline.jsonl` is loaded
verbatim (see the "Two display surfaces" section below on why NT bypasses this whole script) and
already carries correct, fully-nested curly quotes straight from source — spot-checked John 4:7-15
(the woman at the well) and it was already exactly right, including a correctly nested `'Give me a
drink,'` inside the surrounding `"..."`. Deuterocanon/pseudepigrapha/Nag Hammadi texts were not
audited this pass (different, much messier per-source ingestion — see the "Ingestion checklist"
section below) — out of scope for this fix, flagged here so it isn't assumed covered.

**Still needs, in order, before this is live anywhere** — same blocker as the H802 fix directly
below: **this session's sandbox has the identical broken/mismatched `better-sqlite3` native
binding reached through the desktop bridge** (`invalid ELF header` on `server/node_modules/
better-sqlite3/build/Release/better_sqlite3.node`), and `apply-web-strongs.mjs` needs a real DB
connection for its OSHB reconciliation step — so per the "Execution environment preference" rule,
nothing DB-touching was run. The code change itself (`server/apply-web-strongs.mjs`) is done and
was verified standalone as described above. fieldy needs to run, in order, on his own machine:
```
node apply-web-strongs.mjs
node load-english-baseline.js --reset-baseline
node render-all.mjs --surface
node verify-no-eliding.js
```
then restart the server. Three small scratch verification scripts were left in `server/`
(`test-quote-fix.mjs`, `scan-double-straight.mjs`, `scan-double-straight2.mjs`) — safe to delete,
kept only because this sandbox can't `rm` inside the mounted folder; not part of the pipeline.

## H802 no longer shares its root with H800/H801 — "Ashah" now means fire, never woman (added 2026-08-22)

**fieldy's call, and it matches Strong's own derivation field:** `strongs-hebrew-expanded.json`'s
own entry for H802 already says `"derivation": "feminine of H376 (איש) or H582..."` — the dictionary has always known H802 (אשה, "woman/wife") is the feminine of H376 (איש, "man/ish"), the app's own root data just never reflected it. `𐤀𐤔` ("Ash", Aleph-Shin, "fire") is a real 2-letter root (see H784 אש, "fire") but has nothing to do with "woman" — the ה that follows it in the old root does not turn "fire" into "woman" by itself. fieldy: "the word derives from 376 and should be ayashah... 'ash' is a strong 2 letter root and the 'hey suffix does not make sense to modify it to woman... by fire is the official use of אשה."

**What was actually wrong, found 2026-08-22:** `server/lexicon/strongs-roots.json` had **H800
("fire", correctly "the same as" a fire-word), H801 ("offering...by fire"), and H802 ("woman")
all three pointing at the identical root 𐤀𐤔𐤄** (Ash+He, translit "Ashah").
Because the "Two display surfaces" rule (see below in this file) makes the READING-TEXT surface
always `translit(ROOTS[sn])` with zero suffix reconstruction, every H802 occurrence anywhere in
the corpus rendered as bare "Ashah" — identical to H800/H801, no distinction at all. Worse, because
`server/lexicon/lexicon.json`'s gloss lookup is keyed by the PALEO ROOT STRING, not by Strong's
number (confirmed: `reGlossOne` in `server.js` checks `lexicon[paleo]` before ever looking at the
SN), all three shared the ONE gloss entry `"𐤀𐤔𐤄": "wife / individual
woman"` — which is why the Leviticus 23:13 Parallel screenshot that started this shows H801
("an offering made by fire") mislabeled with the chip gloss "wife / individual woman". H801 was
never wrong in the DB tagging; it was borrowing H802's gloss because they collided on root spelling.

**Fix: give H802 its own, distinct root, derived additively (never subtracted) from H376 +
the feminine ה** — exactly the "additive-only" pattern already used for H8010 Shelomoh/Solomon
(root `𐤁𐤓𐤐𐤄`, i.e. the full name spelled out as the "root" so the bare
reading-text surface renders the whole word with no suffix layer needed). Concretely:
- `server/lexicon/strongs-roots.json`: `"H802"` changed from `𐤀𐤔𐤄` to
  `𐤀𐤉𐤔𐤄` (H376's `𐤀𐤉𐤔` "Ayash" + ה)—
  confirmed via `translit()` this renders **Ayashah**, not "Ashah". H800 and H801 keep the old
  root `𐤀𐤔𐤄` ("Ashah") — unchanged, and now unambiguous since H802 no longer
  shares it.
- `server/lexicon/lexicon.json`: the old shared entry `"𐤀𐤔𐤄": "wife /
  individual woman"` was split in two — that key now reads `"fire / offering made by fire"`
  (correct for H800/H801), and a NEW key `"𐤀𐤉𐤔𐤄": "wife / individual
  woman"` carries the meaning forward for H802 alone.
- Nothing else referenced the old shared root string (checked `homographs.json`,
  `strongs-location-overrides.json`, `heb-occurrence-overrides.json`, `MUTATED_ROOTS` in both
  `server.js`/`build-surface-index.js`, and the hardcoded paleo-string literals across
  `server.js`/`apply-web-strongs.mjs`/`render-corpus.mjs` — zero hits besides the two files above),
  and `𐤀𐤉𐤔𐤄` collided with no other Strong's number in
  `strongs-roots.json` before this change, so this is a clean, isolated repoint.

**Still needs, in order, before this is live anywhere** (per the "translation.db can silently
freeze" rule elsewhere in this file — editing the JSON alone is not enough for the baked Reader/
Parallel/Studio prose):
```
node apply-web-strongs.mjs
node load-english-baseline.js
node render-all.mjs --surface
node verify-no-eliding.js
```
then restart the server. **The live Parallel/Hebrew-Viewer chip view (the screenshot's own
source) is served straight off `server.js`'s in-memory `_strongsRootsCache` and `lexicon.json`
via `loadLexicons()`** — `lexicon.json` IS hot-reloaded (it's in the `fs.watch` list at
`server.js` ~line 3302) so that half updates itself within ~300ms of the file write with no
restart, but `strongs-roots.json` is **not** on that watch list (`_strongsRootsCache` is loaded
once at startup only — see the comment at `server.js` ~line 3352) — so a plain server restart
is required at minimum even before the full bake above, or the chip view will show the new
gloss next to the OLD "Ashah" transliteration until restarted.

**Not run yet from this session** — this session's sandbox has a broken/mismatched
`better-sqlite3` native binding when reached through the desktop bridge (`invalid ELF header`
on `server/node_modules/better-sqlite3/build/Release/better_sqlite3.node`; `corpus.db
unavailable — lemma forms only`), so per the "Execution environment preference" rule below,
the pipeline commands above were handed to fieldy to run on his own machine rather than risk
writing degraded output through a broken binding. (One such degraded run of
`apply-web-strongs.mjs` briefly overwrote `server/english-baseline.jsonl` with lemma-only,
corpus.db-less output before this was caught — reverted immediately via
`git show HEAD:server/english-baseline.jsonl > server/english-baseline.jsonl`, confirmed clean
by `git status`. No pipeline stage past that point was ever run, so `translation.db`/`corpus.db`
were never touched.)

**Known adjacent gaps, not addressed by this fix, flagged for later:**
- `server/term-forms.txt` line 60 pins `every -> nashay # H802` — this is the irregular
  suppletive plural (נָשִׁים nashim / construct נְשֵׁי neshei, completely different
  consonants, Nun-Shin-Yod(-Mem)) that Hebrew uses for "women" instead of a regular plural of
  אִשָׁה. It is untouched by this change (different root entirely, keyed by its own spelling,
  not by H802's `strongs-roots.json` entry) and was already correct before this fix — noted only
  so a future reader doesn't assume this pin needs updating too.
- The chip/component breakdown (`MUTATED_ROOTS`, `mergeRootDisplay`) has no entry handling the
  same נשים irregular-plural surface form mapping back to H802's root at all (checked — no
  hollow-root or mutation entry for it in either `server.js` or `build-surface-index.js`). Not
  something this fix introduced or was asked to address, but worth knowing if "women" (plural)
  chip breakdowns still look wrong after the pipeline rerun above — that would be this
  pre-existing gap, not a regression from the H802 root change.

## `components/WordBlock.css`'s `!important` card-reset beats any new highlight rule that doesn't also use `!important` (added 2026-08-17)

`WordBlock.css` has a `body .word-block .visible-text, body .multi-word-block
.visible-text { background: transparent !important; padding: 0 !important; ... }`
block (search "NO WORD CARDS") that strips the grey card background EVERY
`.paleo`/`.visible-text` element would otherwise get from a bare `.paleo{…}`
rule, across every reader page. Its own comment says the fix for a NEW
highlight state that needs to survive it is to add a MORE specific selector,
ALSO marked `!important`, placed after it — and shows the pattern with `body
.clickable-comp.hl`. That existing exception only covers `.hl` sitting
directly on the glyph span itself. **A new page that puts `.hl` (or `.lnk`,
or any state class) on an ANCESTOR wrapper instead — as Parallel.jsx's
`.par-mwb-wrap.hl` does, so the click-to-link hover doesn't fight
MultiWordBlock's own internal markup — needs its OWN `body`-prefixed,
`!important` re-assert rule.** A plain, non-important rule (even with high
class-selector specificity) silently loses to the reset regardless of
specificity math, because `!important` always wins over non-important
regardless of selector weight. Found 2026-08-17: Parallel.css's `.par-mwb-wrap.hl
.multi-word-block .visible-text { background: color-mix(...) }` (no
`!important`) had the class correctly toggling on hover (confirmed via
`getComputedStyle` + `element.className` inspection) but painted nothing —
`background-color` computed to fully transparent every time. Any FUTURE
background/border/padding/box-shadow treatment added to `.paleo`/
`.visible-text`/`.multi-word-block` anywhere in the app needs the same
`body`-prefix + `!important` treatment or it will look identical: class
present, state correct, nothing visibly different on screen.

## Non-Hebrew lexicon entries must embed the Hebrew-root translit, or Auto-Link silently no-ops (added 2026-08-17)

**Rule, fieldy verbatim: "hebrew roots should be cast into other language lexicons for
matching."** Every `server/lexicon/{latin,syriac,geez,greek,hebrew-extra}-lexicon.json`
entry is a flat `{word: value}` map, and `value` does double duty — it's BOTH the literal
gloss text shown under the word in the Reader/Parallel/Studio views AND the only source
Auto-Link (`lexTranslitCandidates` in `src/pages/Translate.jsx`/`Parallel.jsx`) has to
find a Hebrew-cognate transliteration to match against the English column's
`translit (gloss)` pairs. If `value` is just a plain English gloss with no Hebrew
transliteration in it (e.g. `"in the beginning"`), Auto-Link has NOTHING to match against
that word ever — not a bug that throws, just a silent zero-match, indistinguishable from
"this word genuinely has no English counterpart" unless you go looking.

**Do not confuse this with the automatic per-word transliteration line.** Every word block
(`MultiWordBlock.jsx`'s `.mwb-translit`) already shows an auto-computed phonetic
transliteration of the word in ITS OWN script (Ge'ez ወምድረ → "Wamdra", Syriac ܒܪܫܝܬ →
"Barashayath") via `transliterate()` in `src/lib/translit.js` — this happens for every
word for free and needs no lexicon change. That is NOT the same string Auto-Link needs.
Auto-Link needs the word's Hebrew COGNATE's translit (Aratz, Raashayath, Shamayam, Alahayam,
etc.) — the same transliteration the English column already renders — which only a human
curating the lexicon can supply; nothing in this codebase can derive it automatically from
the word's own spelling.

**Convention (already used for most correctly-linking entries):** put the Hebrew-cognate
translit FIRST, then a separator (`/` or ` - `, either is parsed — see
`lexTranslitCandidates`), then the plain English gloss, e.g. `"Raashayath / in the
beginning"`, `"Aratz / earth"`, `"Baraa - created"`. The whole string still displays as-is
to readers, so this is not a display regression — `"Shamayam / heavens"` already reads
fine as prose gloss AND gives Auto-Link "shamayam" to match against the English word
"Shamayam" in `"the Shamayam (Heavens)"`.

**Found and fixed 2026-08-17 (Genesis 1:1, surfaced by live testing across Ge'ez/Syriac/
Latin/Greek Parallel views):** `geez-lexicon.json`'s `"በቀዳሚ": "in the beginning"`,
`"ወምድረ": "and the earth"`, and `"ምድር": "earth / land"`, plus `syriac-lexicon.json`'s
`"ܒܪܫܝܬ": "in the beginning"` — all plain English, all silently unmatchable — while their
sibling entries in the SAME files (`"ወምድርሰ": "and the aratz / earth"`, `"ገብረ": "baraa -
created"`) already had it right. Latin's `terram`/`principio` and Greek's `ΑΡΧΗ`/`γῆν`
already carried the translit for this verse and matched fine — this is exactly why the
Greek/Latin side of Genesis 1:1 partially worked while Ge'ez/Syriac didn't: it's a
per-entry data gap, not a code path difference between languages.

**Known outstanding gap, not yet audited:** `geez-lexicon.json` (likely `latin-lexicon.json`/
`syriac-lexicon.json`/`greek-lexicon.json` too) has hundreds of entries beyond Genesis 1
— mostly prose from other books/homilies — that are plain English glosses with NO embedded
Hebrew-root translit at all. Auto-Link will silently zero-match every one of those words
until someone goes through and adds the cognate translit, the same way this session did for
the four Genesis 1:1 entries above. Treat "Auto-Link found 0 matches" or "this word never
lights up gold" as a lexicon-data question first, not a code bug — check whether the
word's lexicon `value` actually contains the matching Hebrew translit before assuming
anything in `Translate.jsx`/`Parallel.jsx`/`server.js` is broken.

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
- **One-off data-maintenance commands against production (e.g. a `better-sqlite3`
  script touching `corpus.db`) go through `pexec`, not a hand-built `docker exec
  <name> ...`.** `pexec` is an existing helper on the Lightsail box (fieldy's own —
  not yet inspected its actual definition/location, e.g. `~/.bashrc` alias or a
  script, so don't assume details about it beyond usage) that already resolves
  whichever container is currently live and runs the command inside it. Correct
  form, confirmed by fieldy 2026-08-15:
  ```
  pexec node -e "
  const Database = require('better-sqlite3');
  const db = new Database('corpus.db', { readonly: true });
  ...
  "
  ```
  i.e. just `pexec <command>`, no container name, no `docker exec` at all — and the
  script addresses `corpus.db` with a plain relative path (`pexec` apparently runs
  with the right working directory already).
  **Why this matters — real failure, found the same day:** there IS no fixed "the
  live container name" to hardcode either — `deploy-blue-green.sh` swaps which of
  `paleo-a`/`paleo-b` is live on every deploy (whichever port was idle becomes the
  new live one, the old one is `docker rm`'d). A hand-built `docker exec paleo-a
  ...` command 404'd with "No such container: paleo-a" the first time this was
  tried, because `paleo-b` happened to be the one actually up. `pexec` exists
  specifically so this class of command doesn't need to know or guess the live
  name at all — use it instead of reconstructing the docker-exec/container-name
  dance by hand. (If `pexec` is ever unavailable for some reason, the fallback is
  `docker ps --format '{{.Names}}'` to find the one actually running, then target
  that name explicitly — never assume `paleo-a`.)
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
