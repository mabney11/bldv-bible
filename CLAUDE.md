# CLAUDE.md — project rules for paleo-studio

## Divine names & titles of Yah: gold chips + "Divine Titles" tab on /lexicon-page (added 2026-09-24)

fieldy: "lets make Alahayam and all honorific titles of Yah golden like His name ...
identify all divine titles of Yah with their verse references ... group them in their
own tab ... instances throughout the entire corpus." His calls when asked: exclude clear
false-god uses (listed separately, not gold), and the full compound set.

- **Data: `server/lexicon/divine-titles.json`** (edit this, not code; it's in
  `server/lexicon/` so `lexicon-watch` auto-commits it). `singles` (every occurrence of
  H3068/H3069, H3050, H430, H410, H433, H426, H136, H7706, H5945, H5943/H5946, H3071),
  `compounds` (Strong's sequences of consecutive words, e.g. H410+H7706 Al Shaday,
  H3068+H6635 Yahawah Tzabaawath, H6918+H3478 Qadawash Yasharal; `gold` = which members
  paint gold, `only_refs` for pairs that are ordinary words elsewhere, e.g. Yahawah Yireh
  = Gen 22:14 only), and `false_god` rules (H430/H410/H426/H433 before acher/zar/nekar/
  chadash/masekah/pesel, or in a bare construct — st=c, no suffix — before idol metals/
  nations/"the peoples", or after a named idol; plural El/Elah) + `exclude_refs`/
  `include_refs` hand overrides keyed `book:chapter:verse:H###` in the TOKENS' own (BHS)
  numbering. No transliteration is typed anywhere: labels are `nameTranslit(sn,
  getCanonicalRoot(sn))`; `en` is only an English caption.
- **Matcher: `server/divine-titles.js`** (`detectVerse`). BHS tags are trusted as-is. HEB-
  edition tokens (tokens_nt canon > 39, tokens_nt_docs) are `inferred`: their SN only
  counts if the written word (after ≤3 proclitics) starts with the root (found real junk:
  "ha-knesiyot" tagged H3071, "sho'alim" tagged H410), and the construct false-god rule is
  off for them (the NT's "God of this people Israel" is Yah).
- **Gold**: `/api/tokens` runs the matcher on the chapter's raw rows (per versification
  segment, keyed in the response's English verse space like the homograph guard) and
  wraps `res.json` to stamp `comp.divine = <title id>` on the head component of each hit
  token — every exit path (fast path, live-parse fallbacks, doc mode) gets it. Client:
  `divineCss(comp)` (WordBlock.jsx, also used by Parallel.jsx's own renderer) adds
  `divine-title` to the RENDER class only (comp.css untouched, so `css === 'root'` rules
  still work); `lib/morphColors.css` paints it the same gold as `.mod-nmpr` (Yahawah).
- **Tab**: `/lexicon-page?tab=divine` → `src/components/DivineTitles.jsx`, fed by
  `GET /api/divine-titles` (summary) + `GET /api/divine-titles/refs?id=` (per-book verse
  lists). BHS refs are converted to display numbering (`bhsToDisplayRef`, inverse of
  `resolveEnglishChapter`: Malachi 3:19 → 4:1). Index built once (~3 s full scan of
  tokens_bhs + tokens_nt + tokens_nt_docs), cached in memory and
  `server/divine-titles.cache.json` (gitignored), rebuilt when corpus.db,
  divine-titles.json or strongs-roots.json changes.

**Round 4, same day — the tab stays on the page.** fieldy: pick a written variant ("if i
click 'Yahaw' only those will show"), a chapter:verse loads IN the page with that word
highlighted, with an option to go to the verse; main-reader books first, other works behind
an expander. `divine_refs` now carries `form` (the hit's written word(s)); the refs endpoint
returns `[c, v, n, {form: count}]`; `forms_json` keeps up to 60 forms. DivineTitles.jsx: form
chips filter the refs; a ref opens a VersePanel (apiTokens / apiDocTokens + apiTransChapter,
cached per chapter) rendering WordBlocks, the focus word = carries a gold mark (comp.divine)
AND its source token's word_raw is one of the selected forms ("other gods" match on spelling
alone) → `.dt-focus`; "Open verse →" links out. Books: `apiBookOrder()` = what the main reader
lists (in its order); everything else (Works Library docs, unlisted books) under "More works".
Needs a re-bake (`node build-divine-titles.js`) — the old tables have no `form` column.

**Round 3, same day — BAKED, no runtime crunching.** fieldy: "this is something that'll be
baked into a database/index, my server doesnt need to be crunching for data that doesnt
change." The first version ran the matcher live (a ~3 s full-corpus scan on first tab load,
plus a per-chapter detection pass inside /api/tokens). Now `server/build-divine-titles.js`
bakes `divine_hits` (one row per gold word, tokens' own numbering, src BHS/HEB/DOC),
`divine_refs`, `divine_titles`, `divine_meta` INTO `surface-index.db`; it runs at the end of
`build-surface-index.js` and standalone (`node build-divine-titles.js`, ~30 s). `rebake.sh`
re-bakes just these tables when `lexicon/divine-titles.json` / `divine-titles.js` /
`build-divine-titles.js` is newer than the index, then pushes surface-index.db as usual.
server.js only reads (an indexed lookup per chapter for gold; the tab's summary is memoized;
BHS refs converted to display numbering on read). An index without these tables → no gold,
503 on the tab. Also tightened HEB-edition/DSS 2-letter titles (Yah, Al): the word must BE
the root, optionally after 𐤅 — Megillat Ta'anit's Aramaic 𐤁𐤉𐤄 "in it" was being counted as Yah.
Verified by baking into a scratch db with a node:sqlite shim for better-sqlite3 (this
sandbox's native binding can't load) and reading it through the real server.js block.
Hand-curation stays in divine-titles.json (`only_refs`, `exclude_refs`, `include_refs`).

**Round 2, same day** — fieldy: "ilayawan (most high) ... Yahawah-YaRaah ... AHayah Ashar
AHayah ... Yah ... can you think of others". (Ilayawan 327, Yah 67, Yahawah Yireh were already
in round 1.) Added 47 more, evidence-checked against the corpus: Ahayah Ashar Ahayah + the
second "Ahayah sent me" (Ex 3:14), Imanawal (H6005), ha-Shaym (Lev 24:11/16), Shaym Yahawah
(108), Yahawah Yahawah (Ex 34:6), Yah Yahawah, Halalaw-Yah, the Isaiah 9:5 names, Pachad
Yatzachaq, Malak HaKabawad (Ps 24), Adawan / Shapat Kal HaAratz, Natzach / Maqawah / Raah /
Abayn Yasharal, Qadawash Yaiqab, ten Al- and Alahay- epithets (faithfulness, knowledge,
vengeance, glory, of old, everlasting, truth, justice, spirits of all flesh ...), Ruach
Yahawah / Alahayam / HaQadash, and five Aramaic (Alah Ilaya, Mara Malkayn, Malak Shamaya ...).
Pairs that are ordinary adjacent words elsewhere are pinned with `only_refs` after reading
their hits (e.g. "Alahay Iwalam" hit Ps 45:6 "your throne, O God, is forever" — pinned to
Isa 40:28 + Rom 16:26). Matcher change: compound titles may now CHAIN through a shared word
("Shaym Yahawah" + "Yahawah Alahay Yasharal"); only a title wholly inside another is dropped.

**Verified** (device sandbox, no better-sqlite3): the matcher + the whole server block run
against every real BHS/HEB row piped in via python sqlite3 — 53 titles, e.g. Yahawah
7,133, Alahayam 6,369, Al Shaday 11 (Gen 17:1 … Ezek 10:5 + 4 HEB-edition books),
Yahawah Tzabaawath 248, 180 "other gods"; Gen 17:1 marks come out right (Al + Shaday =
al-shaday, Yahawah = yahawah, verbs untouched). `node --check` + esbuild on every edited
file. **Not run live** — restart the server and rebuild the frontend, then check Genesis
3:1 in Parallel (Alahayam glyphs/translit gold like Yahawah) and /lexicon-page → Divine
Titles. Known limits: rules miss some false-god uses (e.g. "gods" said by pagans with no
tell-tale neighbour — add them to `exclude_refs`), and the Reader's reading-text column
is unchanged (already gold for every transliteration).

## Widget didn't pop up after the scheduled-task restart -- added logging, still unconfirmed (added 2026-09-24)

fieldy re-ran `setup-observability-task.ps1` (it registered cleanly, printed its normal
success output), then restarted the `'bldbible observability widget'` task from Task
Scheduler's own UI -- and nothing appeared. No error, no window, nothing.

**Most likely cause, not yet confirmed**: `observability-widget.ps1`'s own single-instance
mutex (`Global\PaleoStudioObservabilityWidget`, added 2026-09-22 for exactly this class of
"two copies running" problem). fieldy had been running the widget "directly" in a visible
console earlier this same day (to verify the bake-freshness fix, per my own instructions in
the entry above) -- if that instance is STILL alive in the background (minimized, or just
never actually closed, since the widget's own "x" only hides to tray rather than quitting),
it's still holding the mutex, so the Task-Scheduler-launched copy hits the guard and exits
immediately and completely silently. Should show as an already-present crowned-lion icon in
the system tray (possibly in the hidden/overflow icons) that a click would bring back into
view -- or, if that process actually crashed after acquiring the mutex but before creating
its tray icon, as a leftover `powershell.exe` in Task Manager with no visible icon anywhere,
which would need to be ended by hand to free the mutex.

**A real, separate bug this surfaced**: BOTH the mutex-refusal exit in
`observability-widget.ps1` and any failure inside the new `observability-widget-hidden.vbs`
launcher (added earlier today) were completely silent -- no trace in any log, anywhere,
making "did this even run" and "why didn't it show up" both unanswerable from the outside.
Fixed:
- `observability-widget-hidden.vbs` now writes one line to `~\observability.log` on every
  single invocation attempt (what it's about to launch), and explicit, logged failures if
  `powershell.exe` or `observability-widget.ps1` itself can't be found -- mirroring the
  defensive `fso.FileExists` checks `observability-collector-hidden.vbs` already does for
  `bash.exe`.
- `observability-widget.ps1`'s single-instance mutex check now also logs to the same
  `~\observability.log` before its silent `exit 0`, spelling out exactly what to check
  (tray icon vs. Task Manager) rather than just disappearing.

**Not resolved yet** -- this only makes the NEXT occurrence diagnosable; it doesn't tell us
which of the above actually happened this time, since neither logging addition existed yet
when fieldy hit this. fieldy: please check (in this order, cheapest first) (1) the system
tray, including hidden/overflow icons, for an existing crowned-lion icon and click it; (2)
Task Manager for a `powershell.exe` process to end if no tray icon turns up; (3) after
pulling this fix and restarting the widget task again, `Get-Content ~\observability.log
-Tail 20` -- it should now show either a normal "launching ..." line followed by the window
actually appearing, or the specific reason it didn't (mutex held / file not found).

## Rebake button + no-console widget launch + Bake ToolTip (added 2026-09-24)

fieldy's follow-up after the "0 behind GitHub" bake-freshness entry above went live and
he restarted the widget to check it, verbatim: "its running now but its launching a
terminal window that must stay open, i dont like that -- also how do I know the corpus
status? id like a button in the widget for syncing the databases." Three separate small
asks, all handled in `scripts/observability-widget.ps1` (plus one new file and one
updated setup script):

**1. No more console window.** He'd run `observability-widget.ps1` "directly" (that
file's own dev/debug instructions, which I'd pointed him at to verify the previous fix)
-- that opens a normal visible PowerShell console the WPF window is a child of, so
closing it kills the widget. Fix: added `scripts/observability-widget-hidden.vbs`, the
same `wscript.exe` + `WshShell.Run(cmd, 0, False)` pattern this project already uses for
`observability-collector-hidden.vbs`/`lexicon-watch-hidden.vbs`/
`studio-sync-watch-hidden.vbs` -- genuinely hides the launched process's own window,
which is more reliable than trusting `powershell.exe -WindowStyle Hidden` by itself (the
scheduled task's PREVIOUS widget registration relied on exactly that flag, which is
apparently what let a console show through here). Updated
`scripts/setup-observability-task.ps1` so the `'bldbible observability widget'`
scheduled task now launches through this vbs too (via `wscript.exe`, matching the
collector's own registration), and removed the now-dead `$PowershellExe` lookup that
registration no longer needs. fieldy can either re-run that setup script (elevated, as
before) so this takes effect at next logon, or just double-click
`scripts\observability-widget-hidden.vbs` directly right now -- no elevation needed for
that, it's a plain `.vbs` double-click like the other watchers already use.

**2. "How do I know the corpus status?"** The Bake line only ever said OK/STALE, no
timestamps. Added a `ToolTip` on `$BakeText` built from the exact fields
`observability-status.mjs`'s `localBakeFreshness()`/`parseProdBakeStat()` already collect
-- hovering the Bake line now shows local `surface-index.db`/`corpus.db`/
`build-surface-index.js` mtimes and prod's `surface-index.db`/`corpus.db` mtimes (or "no
bake data" / "unreachable via ssh" when a side isn't known), no new data collection
needed, just surfacing what was already being polled.

**3. "A button... for syncing the databases."** New "Rebake" Action button, same 2-click
arm/confirm safety pattern as Deploy (it also ends in a prod container swap). Deliberately
does NOT invent new remote logic -- it chains three scripts this project already has and
already trusts, in the exact order this file's own "not run this session" instructions
have been telling fieldy to run by hand after every stale-bake diagnosis:
```
node build-surface-index.js                                        (rebuild locally)
DB=surface-index.db bash scripts/sync-corpus-to-prod.sh widget-rebake  (push to prod)
ssh paleo-prod "sudo -n bash -c 'cd /root/paleo-studio && ./deploy-blue-green.sh'"
```
Found `scripts/sync-corpus-to-prod.sh` while researching this (wasn't previously in this
file's own text) -- it's the SAME script the `feedback_prod-data-direction` project note
already documents as the accepted way to push a batch-built DB like `surface-index.db`
local-to-prod (checkpoints both copies' WAL, backs up prod's current file, uploads,
verifies the byte size matches EXACTLY before touching anything live, atomic swap,
prunes old backups) -- reusing it here instead of writing a new raw-ssh-rebuild path
means Rebake inherits all of that script's existing safety for free. The final
`deploy-blue-green.sh` step (same remote command the Deploy button already runs) is what
makes the running containers actually pick up the freshly-pushed file via prod's existing
zero-downtime swap, instead of a raw `docker restart` that would cause a real, if brief,
outage. All three steps run in one chained `&&` command so a failure at any step stops
the rest (a bad local rebuild never gets pushed; a bad push never gets deployed), logged
to a new `rebake.log` (mentioned in the Logs button's own comment alongside the other
per-action log files).

**Verified**: XAML re-parsed clean with the same standalone-file + `xml.etree.ElementTree`
method used to catch and fix the earlier `--`-in-a-comment bug (see the CORRECTION entry
above) -- this round's edits added zero new `<!-- -->` comments, only PowerShell `#`
comments (outside the XAML block, unaffected by that rule) plus new `$window.FindName`
wiring and click-handler code, so the main risk here was a different one: this session's
device-bridge sandbox ran out of local disk mid-edit (a SEPARATE, shared, already-nearly-
full filesystem on fieldy's own machine used for Claude's shell access there -- NOT
`paleo-studio`'s own disk or repo, nothing to clean up in this project over it) and its
shell access broke entirely partway through ("Failed to create bridge sockets"). Finished
this session's remaining edits by staging files through the (still-working) file-transfer
side of the bridge instead of the broken shell side, editing/verifying them in Claude's
own separate cloud workspace, and committing the results back -- same end result, just a
different path to it. Confirmed no duplicate XAML `Name`s, balanced braces/parens across
the whole script, and `RebakeBtn`'s `FindName` wiring + all its click-handler references
resolve consistently. **Could not actually run PowerShell** to confirm the button/tooltip
work end to end (same standing constraint as every widget change this session) -- fieldy,
please confirm: the widget opens with no console window at all when launched via the new
vbs or a fresh scheduled-task run, hovering Bake shows real timestamps, and Rebake's
"Confirm?" flow does what the log (`~\rebake.log`) says it did.

## Observability widget now watches surface-index.db bake freshness, not just git sync (added 2026-09-23)

fieldy, after the Badagahath/Mawath entries above sent him to check bldbible.com and it
was STILL showing the pre-fix output there even though the widget's "Prod: 0 behind
GitHub" line said prod was fully caught up: "the fact prod doesnt have it is the
problem, i thought my environments were synced. thats something that should be known
in my observability widget." He's right that this is a real, previously-unwatched gap,
not user error: git-sync status and bake freshness are two completely different axes.
`surface-index.db` is a **gitignored, per-box build artifact** — `entrypoint.sh`
symlinks it (along with `corpus.db` and the rest of `DB_FILES`) from the persistent
`/data` volume into the running container at boot, and nothing in the automated
`deploy-blue-green.sh` flow ever runs `node build-surface-index.js` — that's always been
a manual step (see the Badagahath entry's "Not run this session" instructions above). So
a box can show "0 behind GitHub" — meaning its CODE is current — while still serving a
`surface-index.db` baked before the latest `corpus.db` content or the latest parser fix
landed, exactly what happened here. Git sync literally cannot see this; it was never
going to self-report as "behind" on anything.

**What changed, concretely:**

- `scripts/observability-status.mjs`: added `localBakeFreshness()` (new consts
  `SURFACE_INDEX_PATH`/`CORPUS_DB_PATH`/`BUILD_SCRIPT_PATH`, all under `server/`) — plain
  `fs.statSync` mtime comparison, stale if `surface-index.db` predates EITHER
  `corpus.db` (new source data) or `build-surface-index.js` itself (a parser fix that
  hasn't been re-baked yet, which is exactly the Badagahath/Mawath shape). Returns
  `{known, surface_index_mtime, corpus_db_mtime, build_script_mtime, stale, stale_vs}` —
  `known: false` (distinct from `stale: false`) when either file is simply missing, so a
  fresh checkout with no bake yet reads as "no data," not a false "OK."
- `checkProd()` gained one more `ssh` call (`stat -c '%Y' <dir>/surface-index.db
  <dir>/corpus.db`, no `sudo` needed since `PALEO_PROD_DATA_DIR`, default
  `/mnt/paleo-data`, is the world-readable host path bind-mounted to `/data` — unlike
  `RREPO`'s root-owned checkout, which is why the git/docker checks above it DO need
  `sudo -n bash -c '...'`) — parsed by the new `parseProdBakeStat()` into the same
  `{known, surface_index_mtime, corpus_db_mtime, stale}` shape, attached as
  `prod.surface_index`. New env var: `PALEO_PROD_DATA_DIR` (default `/mnt/paleo-data`),
  same override pattern as `PALEO_PROD_HOST`/`PALEO_PROD_REPO`.
- `status.local.surface_index` and `status.prod.surface_index` both land in
  `status.json`; `pollOnce()`'s `problems[]` array gets two new lines
  (`local surface-index.db stale (older than ...)` / `prod surface-index.db stale
  (older than corpus.db)`) so this shows up in the collector's own console log the same
  way every other drift already does.
- `scripts/observability-widget.ps1`: one new XAML row (`BakeText`, row 7, right under
  Site — pushed Actions/AutoFix+LastChecked/Pending-files/Commit-box down one row each,
  window height 540→560) reading `"Bake: local <OK|STALE|?> / prod <OK|STALE|?>"`,
  color-coded via the existing `Get-Brush` helper: red if either side is known-stale,
  green only if both are known-fresh, gray (the "?" case) whenever either side is
  unknown — file missing locally, or prod unreachable so its own `stat` never ran.
  `Set-Waiting` also blanks `$BakeText.Text` now, same as every other status line.

**Verified**: `node --check scripts/observability-status.mjs` passes. Could NOT run
`scripts/observability-widget.ps1` itself this session — no PowerShell in this
device-bridge sandbox's Linux VM (same standing constraint documented throughout this
file for anything Windows-only) — so the XAML/row-shift edits were made surgically with
exact anchor-string matches (the same method used for `tests/extract-parse.cjs` and this
file's own splices above) and re-verified by `grep`-ing every `Grid.Row="N"` back out
afterward to confirm 0 through 11 are each used exactly once with no gaps or
duplicates, but **fieldy should actually open the widget once after pulling this** to
confirm the new row renders and doesn't clip at the bottom of the window before trusting
it unattended.

**Not done here, deliberately**: no auto-resolve for a stale bake — same reasoning this
file's "Auto-resolve — deliberately narrow" note already gives for uncommitted local
changes: running `node build-surface-index.js` (and, on prod, restarting the container
afterward) is not something that should ever fire unattended off a poll loop; the widget
surfaces it, fieldy decides when to rebake. Also didn't wire a one-click "Rebake" Action
button this session (the widget already has a whole Actions panel this would fit
naturally into, same pattern as Pull/Push/Deploy) — flagging as an obvious, low-risk
follow-up if fieldy wants it, but out of scope for what was actually asked ("that's
something that should be known" — visibility first).

Left in the connected folder, safe to delete: `_claude_scratch_bake_freshness_section.md`
(this session's own scratch file used only to splice the section above into this file —
same delete-permission wall as every other stray file already flagged in this session's
other entries; `rm` failed with `Operation not permitted`, not a new issue).

**CORRECTION, same day — the widget I shipped above broke on first run, and here's why:**
fieldy pasted back a wall of PowerShell errors — every single status line
(`$LocalGitText.Text`, `$ProdText.Foreground`, `$FileChecklistPanel.Children.Clear()`, etc,
not just the new `$BakeText` one) failing with "The property 'X' cannot be found on this
object" or "You cannot call a method on a null-valued expression." That pattern — literally
EVERY control null, not just the new one — means `$window` itself never got built:
`[xml]$xaml = @"..."@` (the PowerShell cast of the whole XAML heredoc to an `[xml]` object)
must have thrown, which left `$window` uninitialized, which makes every later
`$window.FindName(...)` return `$null` (a non-terminating error in PowerShell, so the script
keeps running its 5s timer forever, silently broken, rather than crashing outright — that's
why the SAME wall of errors repeats every 5 seconds in fieldy's paste instead of appearing
once).

**Root cause, found by re-parsing the XAML block standalone**: the NEW XML comment I added
for the BakeText row contained a literal `--` (two consecutive hyphens) in its body: `"...vs.
corpus.db / build-surface-index.js -- the drift..."`. **XML comments cannot contain `--`
anywhere in their content** — that's a hard rule of the XML spec, not a WPF quirk — and
`[xml]` in PowerShell is a strict `System.Xml.XmlDocument.LoadXml` cast that enforces it. My
own writing habit of using `--` as an em-dash stand-in (visible all over this very file's `#`
comments, which are outside the XAML block and totally unaffected) is exactly the wrong habit
to bring INSIDE an `<!-- -->` XAML comment. The three pre-existing XAML comments in this file
(Row 0, the Actions panel, the pending-files block) all happened to use single hyphens or
spelled words instead — so this bug was original to my edit, not a pre-existing landmine.

**Fixed**: reworded that one comment to use `:` instead of `--` (`"...build-surface-index.js:
the drift..."`) — no functional change, XML-comment text only. **Verified properly this
time**, not just by eyeballing it: extracted the XAML block (lines between `[xml]$xaml = @"`
and the closing `"@`) into its own file and ran it through a real XML parser
(`xml.etree.ElementTree.parse`) — confirms clean parse — and separately regex-scanned every
`<!--...-->` comment body in that block for a literal `--` — zero matches, all four comments
clean. Re-confirmed `Grid.Row="0"` through `Grid.Row="11"` still each appear exactly once with
no gaps. **Could not go further than that**: still no PowerShell in this sandbox to actually
run `[Windows.Markup.XamlReader]::Load` itself, so this is "provably valid XML with the right
row numbering," not "confirmed to run" — fieldy, please restart the widget (kill it from Task
Manager or `taskkill /F /IM powershell.exe` if the tray icon's Exit doesn't fully clear the
single-instance mutex, then re-launch via the scheduled task or directly) and confirm the
window actually opens with real status text again before trusting this.

**Lesson for future Claude edits to this file specifically**: any text going INSIDE an
`<!-- -->` block in `observability-widget.ps1`'s XAML heredoc must never contain `--`, and
should be spot-checked with an XML parser (not just `node --check`, which only validates
JavaScript — this file has zero JS in it — and not just visual inspection, which is exactly
what missed this the first time) before calling a XAML edit to this file done. This class of
bug is nasty specifically because it fails SILENTLY into a "wall of nulls" every-5-seconds
loop rather than a clean crash, so it looks like a deep structural problem when it's actually
one bad character in a comment.

## Genesis 3:3's "temutun" (H4191, "die/death") root not shining — ALREADY FIXED in code; local `surface-index.db` looks fresh, production (bldbible.com) is the one still stale (found 2026-09-23)

fieldy flagged a screenshot of Genesis 3:3 in Parallel (BHS, bldbible.com): the word tagged
H4191 shows "ThaMathaw" (gloss "death `[She/it·His]`") — fieldy, verbatim: "the true root
'mawath' is not shining in the tokens. should be ThaMawathaw". He's right about the target
spelling: H4191's canonical root (`strongs-roots.json["H4191"]` — same value in both the
live `server/lexicon/strongs-roots.json` and the stale top-level duplicate, so that's not the
culprit here either) is 𐤌𐤅𐤕, Mem-Vav-Tav, "Mawath" — but the Hebrew word in question,
תְּמֻתֽוּ/ן ("temutun", Qal imperfect 2mp of מות "die" — OSHB `lemma="4191"
morph="HVqi2mp/Sn"`, Gen.3.3, confirmed straight from the OSHB/morphhb WLC XML fetched fresh
from GitHub, same source + same no-DB-access method as the Badagahath entry above), is a
classic Ayin-Vav "hollow root" verb: the imperfect stem regularly drops the root's own MIDDLE
letter (the Vav), so the actually-written consonants are only Taw(prefix)-Mem-Tav-Vav(2mp
ending) — the root's own Vav never appears in the surface at all, just like Psalm 119:33's
long-standing "Known open case" (הוֹרֵנִי, a Pe-Yod root substituting Vav for its own Yod) —
same general class of gap (a canonical root letter absent from a weak-verb's written form),
different specific shape (missing MIDDLE letter here, not a substituted one).

**Verified against the CURRENT code, and it's already correct — this looks like the same
"stale bake" shape as the Badagahath entry above, not a live bug.** Built the token exactly
as OSHB tags it (`sp=verb|pdp=verb|vs=qal|vt=impf|ps=p2|gn=m|nu=pl|pfm=T=|...`, surface
𐤕𐤌𐤕𐤅 — Taw-Mem-Tav-Vav) and ran it through BOTH parsers with their real, current logic:
- `build-surface-index.js`'s `parseToken` (`PALEO_PARSE_ONLY=1` harness): root component
  comes back as the FULL restored 𐤌𐤅𐤕 (translit "Mawatha", `true_root`/`lemmaTranslit`
  both "Mawath", gloss "death") — the middle Vav is already being added back in, not
  dropped. Whole rendered word: 𐤕𐤌𐤅𐤕𐤅 = Tha + Mawath + w = "ThaMawathaw", exactly what
  fieldy expects.
- `server.js`'s `parseHebrewData` (via the now-fixed `tests/extract-parse.cjs`/
  `parse-extract.cjs` — see the Badagahath entry above for that fix): same result,
  `display_root` shows the raw defective surface (𐤌𐤕) was correctly recognized as an
  under-attested spelling of the FULL canonical root 𐤌𐤅𐤕, which is what actually renders.
  Only one token/one row is involved here (no standalone-prefix-token merging like
  Badagahath needed), so there's no extra `groupSurfaceTokens`/`WordBlock.jsx` layer to
  second-guess — whatever the bake says is what ships.

So the root-restoration logic for THIS shape of hollow-root defective spelling is already
solid in the code sitting in the connected folder. (The 𐤕 prefix chip reads "[She/it]" and
the 𐤅 suffix chip reads "[His]" — both look semantically odd for a 2mp verb, but that's the
FLAT_PREFIX/FLAT_SUFFIX "one letter, one meaning" system working exactly as designed
elsewhere in this file: bare 𐤕 always says "She/it", bare 𐤅 always says "His", regardless of
the real person/number — not a bug, not what fieldy flagged.)

**Timestamps point at production lag, not a code gap, but with a wrinkle worth fieldy's own
check.** `server/surface-index.db` on this dev machine is now dated **2026-09-22 15:38:44
UTC** — AFTER `server/corpus.db` (2026-09-21 23:55) and AFTER `build-surface-index.js` itself
(2026-09-21 18:12) — i.e. someone (presumably fieldy, following the Badagahath entry's
instructions) already reran `node build-surface-index.js` locally since that entry was
written. Since that rebuild used the exact same `build-surface-index.js` I just tested above,
**Genesis 3:3 should already read correctly on fieldy's own local server** if the running
process has been restarted since 15:38:44 UTC yesterday to pick up the fresh file. The
bldbible.com screenshot is production, a separate deploy (see "Production deployment" below)
that lags the local rebuild by definition — same standing gap as Badagahath, not a new one.
**Worth fieldy explicitly confirming, though**: check this exact verse against his own local
dev server (not bldbible.com) before assuming a rebuild+redeploy alone fixes it — if it's
STILL wrong locally despite the fresh bake, that would mean the local server process itself
hasn't been restarted since the rebuild (nothing here can tell the two apart without him
looking), not that the code is wrong.

**Separate, unconfirmed side-finding — flagging, not asserting:** OSHB tags this word's
morph as `Vqi2mp/Sn` — the trailing `Sn` segment is the paragogic Nun (the ן that makes
"temutun" rather than plain "temutu"), NOT a pronominal suffix. `server/ingest-bhs-oshb.py`'s
suffix-splitting block only recognizes a trailing morph segment starting with "Sp" (pattern
`Sp(\d)([mfbc])?([sp])?`) as a real pronominal suffix; `"Sn".startsWith("S")` still enters
that branch, `mm` fails to match, `prs_code` stays unset, but the code UNCONDITIONALLY does
`seg_morphs = seg_morphs[:-1]` and `seg_texts = seg_texts[:-1]` regardless of whether `mm`
matched — silently dropping the paragogic Nun's own morph AND its own text segment (the
literal ן letter) from the row that gets ingested, rather than keeping it as its own token or
folding it into the verb's own `nme`/`vbe`. **This was traced only in `ingest-bhs-oshb.py`
directly (line-read, no DB access) — I could not confirm whether this script is actually what
populated the real `corpus.db`/`tokens_bhs` currently on disk, or whether some earlier/
different ingestion path handled `Sn` correctly and this script (written to "reproduce the
exact format," per its own header) simply has its own bug that was never exercised on a
paragogic-Nun word before.** If it IS the real gap, the symptom would be a MISSING final
Nun letter on every paragogic-Nun form in the corpus (2mp/3mp imperfect emphatic forms) —
its own "no eliding" violation, independent of the root-restoration question fieldy actually
asked about. Not fixed or touched this session — flagging for fieldy to check against the
real `tokens_bhs` row for this exact word (`SELECT word_raw, morph FROM tokens_bhs WHERE
book_id=1 AND chapter=3 AND verse=3 AND strongs='H4191'`, from a machine that can actually
open `corpus.db`) before deciding whether it needs a fix at all.

**Not run this session** (same standing DB-access constraint as every entry above/below).
Nothing to rebuild for the root-restoration finding itself — the code was already right;
just confirm locally, then make sure production has the same `build-surface-index.js` rebuild
+ restart that Badagahath already needed. If fieldy's own `tokens_bhs` check above finds the
paragogic Nun really is missing corpus-wide, that's a new, separate ingestion fix — not
attempted here since it couldn't be verified against the real data.

## Badagahath (H1710, "fish", Genesis 1:28 Parallel/Hebrew-extra) missing its prefix/suffix chips — STALE `surface-index.db`, not a code bug (found 2026-09-22)

fieldy flagged a screenshot of Genesis 1:28 in Parallel (Hebrew extra, bldbible.com): every
other prefixed/suffixed word in the verse shows its modification bracket (WaBalwap "flying
thing `[And·in]`", IlaHaAratz "Earth/land `[over·Causing]`", HaRamashath "creep/move about
`[Causing·Feminine]`") but Badagahath (H1710, "fish") shows bare "fish" with NO bracket at
all — fieldy, verbatim: "Badagahath has modifications that are not emphasized, ba(in)
th(feminie)". He's right about what the word IS: בִּ/דְגַ֤ת = Bet preposition "in" (its own
OSHB token) + H1710's construct-state feminine singular noun, whose ATTESTED spelling ends
in Tav (the construct fem ending) where the canonical root (`strongs-roots.json["H1710"]` =
𐤃𐤂𐤄, "Dagah") ends in He — exactly the class of construct-state ending-mutation this file's
"no eliding" rule and the H6310 Peh/Pahay fix (see "No eliding regressions in Leviticus 24"
below) already cover for other roots.

**Traced with no DB access** (same standing sandbox constraint documented throughout this
file — this device-bridge sandbox's `better-sqlite3` binding is `invalid ELF header` through
this bridge too; confirmed again this session, and deliberately NOT worked around by
`npm rebuild`-ing a Linux-native binding in place, since `server/node_modules` lives in the
connected folder shared with fieldy's real Windows/MINGW64 checkout and overwriting the
working Windows binary there would break his actual dev environment for a diagnostic-only
need). Got the REAL morphology for this exact occurrence not by guessing but by fetching the
actual OSHB/morphhb WLC Genesis XML directly from GitHub (`raw.githubusercontent.com/
openscriptures/morphhb/master/wlc/Gen.xml` — the same public source `server/ingest-bhs-
oshb.py` itself pulls from) and reading Gen.1.28 straight out of it: `<w lemma="b/1710"
morph="HR/Ncfsc">בִּ/דְגַ֤ת</w>` — one OSHB `<w>` element, "/"-split (per `ingest-bhs-oshb.py`'s
own splitting logic) into TWO token rows: a standalone `prep` token (word_raw=𐤁, strongs
synthesized H9003) and an H1710 `subs` token tagged `gn=f|nu=sg|st=c` whose surface is the
construct spelling 𐤃𐤂𐤕 (Dalet-Gimel-**Tav**), not the root's own 𐤃𐤂**𐤄**.

**Verified the CURRENT code against this real data, two independent ways, and both are
already correct:**
- `build-surface-index.js`'s `parseToken` (the actual OFFLINE BAKER that writes
  `surface-index.db`'s `components_json` — confirmed by reading its call site,
  `components_json: JSON.stringify(components)` written verbatim with no post-filtering),
  run via the file's own `PALEO_PARSE_ONLY=1` harness against the H1710 token alone: returns
  the FULL restored root (𐤃𐤂𐤄, translit "Dagaha", gloss "fish") plus a SEPARATE suffix
  component (`{paleo:'𐤕', translit:'th', translation:'[Feminine]', css:'nme-f',
  bakedSplit:true}`) — exactly right, no eliding, modification visible.
- `server.js`'s `parseHebrewData` (the live-parse reference path) against BOTH tokens
  together, via `tests/extract-parse.cjs`/`tests/parse-extract.cjs`. **This extractor was
  itself broken** — it never sliced `nameTranslit` (added to `server.js` well after the
  extractor's 1500-line `parseHebrewData` window, for the Har-Al/Yashar-Al hyphenated-name
  spelling), so any word with a resolved root threw `nameTranslit is not defined` the moment
  it ran standalone. Fixed `tests/extract-parse.cjs` to also slice `nameTranslit` +
  `hyphenAllowlist`/`HYPHEN_ALLOW_PATH`/`_hyphenAllow` + `normSn`, the same targeted
  find-the-function-and-its-close pattern the file already uses for `loadLexicons` — this is
  a real, general fix to the test tooling (every future use of this extractor needed it, not
  just this diagnosis), not a one-off hack. Regenerated `tests/parse-extract.cjs` clean
  (`node tests/extract-parse.cjs`) and re-ran `tests/index-builder-consistency.test.cjs` —
  still passes. With the extractor fixed, `parseHebrewData` on the real two-token input
  correctly produces THREE components for one merged word block: prep "In" (`mod-prep`),
  root "fish" (full 𐤃𐤂𐤄 restored), suffix "[Feminine]" (`nme-f`) — confirming
  `groupSurfaceTokens` (the `/api/tokens` fast-path function that folds baked
  `surface-index.db` rows into displayed word blocks — traced it too: it correctly
  accumulates a standalone `prep`-pos row into `pending` without flushing, same as
  `parseHebrewData`'s `pendingComponents`/`flushWordBlock`) and `WordBlock.jsx`'s
  `computeWordParts` (the client-side bracket builder — strips `[...]` from each non-root
  component's `translation`, drops it only if empty or identical to its own transliteration,
  otherwise joins every surviving one with `·` inside one bracket) both already handle this
  combination — prefix-only standalone token immediately followed by a construct-state
  feminine noun — correctly. Nothing in the current code needed a change for this specific
  word.

**So why does production show nothing?** File-mtime evidence on fieldy's own dev machine
(not proof of production's exact state, but the same mechanism): `server/surface-index.db`
was last built **2026-09-21 18:24:38 UTC**, but `server/corpus.db` was modified **later the
same day, 23:55:21 UTC**, and `server/server.js` was edited later too (19:02:26 UTC) — i.e.
the surface index driving the Parallel/Reader chip display on fieldy's own machine already
predates both the current code and the current `corpus.db` content it should have been baked
from, before production (a separate, further-behind deploy — see "Production deployment"
below) even enters the picture. This is the identical "stale bake, not a live code bug"
failure mode as the Shanahayam entry directly below this one and the Leviticus 24 Nathan/
"YaThan" case — same file, same standing lesson: a correct code fix is invisible until
`surface-index.db` is actually rebuilt from it.

**Not run this session** (same standing DB-access constraint). Before calling this fixed:
```
node build-surface-index.js
```
then restart the server (this is the CHIP/component-breakdown surface — unlike the
Shanahayam entry below, this does NOT need the `apply-web-strongs.mjs` → `load-english-
baseline.js` → `render-all.mjs --surface` reading-text pipeline, since Badagahath's reading-
text prose was never the complaint; only `build-surface-index.js`, which reads straight from
the CURRENT `corpus.db` + CURRENT parser code and rewrites `surface-index.db`). Verify:
Genesis 1:28 in Parallel (Hebrew extra) — Badagahath's chip should read "fish `[in·Feminine]`"
(exact wording per the flat-label system: `GRAMMAR_MAP.prep['𐤁']`="in", `FLAT_SUFFIX['𐤕']`=
"Feminine"), matching the bracket style already showing correctly on WaBalwap/IlaHaAratz/
HaRamashath in the same verse. Then repeat the standard deploy step for production
(`git push` + `~/deploy.sh`/`pexec node build-surface-index.js` against the box's own
`corpus.db`, per "Production deployment" below) — fieldy's own machine being stale doesn't
by itself prove production needs the identical rebuild, but nothing suggests production is
AHEAD of fieldy's own dev checkout either, so treat both as needing the rebuild until
verified otherwise.

Left in the connected folder, safe to delete: `_diag_badagahath.cjs`, `_diag_badagahath2.cjs`
(this session's scratch verification scripts) and `tests/.tmp-index-builder-parseToken.cjs`
(a stray temp file `tests/index-builder-consistency.test.cjs`'s own cleanup step left behind
— its `unlinkSync` hit the same delete-permission wall this sandbox always hits inside the
connected folder, not a new bug in that test). `tests/extract-parse.cjs`'s fix and the freshly
regenerated `tests/parse-extract.cjs` are real, kept changes, not scratch.

## Shanahayam (H8141, "year") rendering as Shanayam/"two" in the reading text — STALE BAKE, not a live code bug; already fixed in code 2026-09-12, never rebaked (found 2026-09-21)

fieldy flagged Leviticus 25:8 in Parallel (BHS): every chip correctly reads "Shanahayam
[Year] [Plural]" tagged H8141, but the reading-text ("Novel English") surface shows "shanayam
(two)" for the identical words — "pretty much every occurrence that should be Shanahayam
(year) is getting shanayam (two) — need this fixed across the corpus."

**Traced with no DB access (same standing sandbox constraint — this device-bridge sandbox's
`better-sqlite3` binding is `invalid ELF header` through this bridge too, not just the
Windows-native one referenced elsewhere in this file) purely from git history, file mtimes,
and direct execution of the real functions against hand-built inputs — no guessing.**

**The two symptoms are two different bugs stacked on each other, both already understood:**

1. **The wrong TRANSLITERATION ("shanayam" instead of "Shanahayam") is baked into
   `server/english-baseline.jsonl` itself, and predates the code that would render it
   correctly.** `web-strongs.jsonl` tags every "years"/"year" segment in Lev 25:8 correctly as
   H8141 (confirmed by direct grep — this was never a WEB-vs-OSHB SN clash, ROOTS["H8141"] is
   correctly `Shin-Nun-He` "Shanah" in both `lexicon/strongs-roots.json` and the stale top-level
   `server/strongs-roots.json` copy — see the flag about that duplicate file below). The
   ACTUAL cause: `english-baseline.jsonl`'s mtime is **2026-09-11 22:59 UTC**;
   `apply-web-strongs.mjs`'s plene-plural fix (commit `3dc2f8e`, "apply-web-strongs: head-word
   aliases, 'so' -> kan, plene plurals, noun-only plurals") landed **2026-09-12 20:41 UTC** —
   nine hours AFTER the currently-baked file was generated. Before that commit, the plural-
   surface line read `drawPaleo = pl.w` — the raw ATTESTED Masoretic spelling, used as-is, no
   restoration. Leviticus 25:8's real written plural of "year" is the 4-letter Shin-Nun-Yod-Mem
   spelling — the He of Shanah is elided before the plural ending, completely normal Hebrew
   orthography — and that 4-letter elided spelling is BYTE-FOR-BYTE IDENTICAL to H8147's own
   canonical root (Shin-Nun-Yod-Mem, "two" — a genuine, well-known consonantal homograph:
   unpointed Hebrew is either "years" or "two" depending on vowels/context). The pre-fix code
   rendered that raw elided spelling directly, which happens to transliterate to "Shanayam" —
   indistinguishable from "two"'s own transliteration. **This is exactly the "no-eliding"
   violation this file has a standing rule against** — the same class of bug as the Genesis
   1:14/1:15 mem-alef-resh-taw ("maarath"/"maawarath") inconsistency that MOTIVATED the
   2026-09-12 fix in the first place (see that commit's own message).
   The CURRENT code (`plenePlural(pl.w, rootPaleo)`, unchanged since 3dc2f8e — verified this
   is still the tip of `git log -- server/apply-web-strongs.mjs`) is provably correct for this
   exact case: ran the real function standalone against `ROOTS["H8141"]` and `ROOTS["H8147"]`'s
   own codepoints (`plenePlural(shnayim_letters, shanah_root)` restores the He), `translit()`
   of the result gives **"Shanahayam"**, matching the chip exactly. **The fix already shipped
   nine days before fieldy hit this — it just has never been baked.**

2. **The wrong GLOSS ("(two)" instead of "(years)") is a live-server symptom of the SAME stale
   spelling, not a second independent bug.** The currently-baked `english-baseline.jsonl`
   actually still says `"shanayam (years)"` (checked directly) — the gloss text itself was
   fine in the bake (it falls back to the plural English word verbatim,
   `bare.toLowerCase()`, when `pluralHit` fires, never mind that the transliteration in front
   of it was wrong). But Lev 25:8 has certainly never been hand-edited in Translation Studio,
   so it's an "untouched baseline draft" and `applyLiveGloss()`/`isUntouchedBaselineDraft()`
   (server.js) re-derives its gloss LIVE, at request time, from the CURRENT `lexicon.json`.
   `applyLiveGloss`'s regex matches `word (gloss)` pairs and looks up `_translitGlossIndex`
   keyed by the WORD'S OWN transliteration, lowercased — i.e. it looks up `"shanayam"`, not
   H8141. `lexicon.json` legitimately has an entry for H8147's own root mapping to "two" and,
   until this session, had NO entry at all for H8141's bare singular root — so the live
   regloss found a real match under H8147's spelling and overwrote the baked "(years)" with
   "(two)". `applyLiveGloss` is doing exactly what it's designed to do; it's just operating on
   the wrong (stale, unrestored) spelling, which is why re-baking alone should also fix this
   half.

**Scope — this is corpus-wide, not H8141-specific, matching fieldy's own report.** The
pre-3dc2f8e `drawPaleo = pl.w` bug affects EVERY plural noun anywhere OSHB's attested plural
spelling elides a root letter (assimilated nun, dropped weak radical, etc.) — Shanah/Shanayim
is just the most visually confusing instance because the elided form happens to collide with
an unrelated, real Strong's number's own root. Re-baking fixes all of them in one pass, same
as it will fix Genesis 1:14/1:15's original elided-mem case that motivated the commit.

**Fixed this session (safe, additive, no live-DB access needed):**
- `server/lexicon/lexicon.json` — added the missing entry for H8141's bare root -> "year"
  (H8141's bare root had NO gloss at all before this; `strongs-hebrew-expanded.json`'s own
  `strongs_def` for H8141 is literally "a year (as a revolution of time)", so this is
  evidence-sourced, not guessed). This is real but minor: it only ever mattered for a
  SINGULAR, non-plural occurrence of "year" (curatedGloss falls back to the bare English word
  anyway when the lexicon has no entry, so nothing was rendering wrong from this gap — it just
  means a singular "year" now gets a proper curated-lexicon gloss like every other common
  noun, instead of always falling through to the plain English word).
- **Not fixed, only flagged**: `server/strongs-roots.json` (a second, stale, top-level copy of
  the lexicon's roots file, distinct from `server/lexicon/strongs-roots.json` — confirmed by
  diff to be missing `H378a`/`H1151a`/`H429z` and several other letter-restoration entries from
  fixes later than 2026-08-22, so it predates several sessions' worth of fixes documented
  elsewhere in this file). It agrees with the current file for H8141/H8147/H8140 specifically,
  so it is NOT the cause of this bug, but every script that does
  `['./lexicon/strongs-roots.json','./strongs-roots.json'].find(existsSync)` (apply-web-
  strongs.mjs and at least 14 other scripts grep confirms reference a bare `strongs-
  roots.json` path) silently falls back to this stale copy if `lexicon/strongs-roots.json`
  ever goes missing. Left untouched (didn't want to delete a file in the connected folder
  without asking — this sandbox needs the user's own approval to delete anything there
  anyway) — worth fieldy's call on whether it should be deleted outright or is kept
  deliberately for some reason not visible from this session.

**Nothing else needed a code change** — `apply-web-strongs.mjs`'s plural-restoration logic,
the OSHB reconciliation block, and `plenePlural()` itself are all already correct as of
commit `3dc2f8e` (verified by literally executing all three against real root data pulled
from this checkout, not by reading the code and assuming).

**Not run this session** (same standing DB-access constraint via this bridge). Before calling
this fixed, run the full pipeline, in order, then restart the server — same sequence this file
already documents elsewhere for "any change to apply-web-strongs.mjs, render-corpus.mjs, or
the CHAR_MAP/transliteration logic":
```
node apply-web-strongs.mjs
node load-english-baseline.js --reset-baseline
node render-all.mjs --surface
node verify-no-eliding.js
```
then restart the server (this also busts `_translitGlossIndex`/`_translitRenumberIndex` and
picks up the new `lexicon.json` entry). Verify: Leviticus 25:8 in `/bible` and `/parallel`
should read "Shanahayam (years)" (plural occurrences) and the chip/reading-text should agree
letter-for-letter with each other, not just glossed the same. Then spot-check Genesis 1:14/
1:15 (the original elided-mem case that motivated the 2026-09-12 commit) and a few other
plural nouns corpus-wide with `verify-no-eliding.js`'s own report — that script exists
specifically to catch this class of regression and should show a real count of what the stale
bake was hiding for over a week.


## STANDING RULE: a 3ms PERFECT verb's "he" subject is a synthesized Yod PREFIX, not an invisible suffix — explicit override of Hebrew grammar (fieldy, 2026-09-21)

Follow-up to the section directly below this one, same session. fieldy, on being told
the empty "[He did]" chip already existed in the data for H6213 Asah (Lev 24:19,
"כַּאֲשֶׁר עָשָׂה") but only showed up folded into a combined gloss string, verbatim:

> "we are not following 'hebrew grammar' thats what got me in this situation in the
> first place. We are exposing all modifications. it makes sense to have the exact
> behavior of the other words in relation to the subject. This becomes a 'yod
> prefix' and it should work how I requested `KaYaAsharaIshah`, any other 'he did'
> will also have a yod prefix"

**This is a deliberate, permanent policy decision, not a one-word patch — read it
before touching `pfm`/`vbe`/subject-marking logic anywhere in this app again.**
Real Biblical Hebrew grammar marks a Qal (or any binyan's) PERFECT 3ms verb with
**zero** letters — "𐤏𐤔𐤄" already means "he did/made" via the bare form, no subject
prefix or suffix at all, unlike every OTHER person/gender/number combination in the
perfect paradigm (which DO write a real suffix: 𐤕𐤉 "I did", 𐤕 "you/she did", 𐤍𐤅 "we
did", etc.) and unlike the IMPERFECT paradigm (which marks 3ms with a real, written
Yod PREFIX — 𐤉, "he/it," pfm='J', css `pfm-3ms`). This app's OWN longstanding rule
("no eliding, ever" — every modification visible, root or otherwise) had already
been extended to this exact gap once before (see "The 3ms perfect... adds no letter
at all, so it had no chip: emit an empty one" note in `git blame`/earlier in this
file's history) — but an EMPTY chip, however correctly it existed in the component
data, still visually disappears into a combined gloss parenthetical with nothing to
anchor it, and reads as inconsistent next to an imperfect verb's real, visible Yod.
fieldy's call: stop trying to be faithful to which forms Hebrew orthography marks
and which it doesn't — mark EVERY 3ms subject the same way, always, with the same
letter, in the same position, with the same styling. Grammatical accuracy on this
one narrow point is explicitly NOT the goal here.

**Fix, in both `server.js` and `build-surface-index.js`**: removed the old
empty-paleo `vbe-3ms` SUFFIX chip entirely (`{paleo:'', translation:'[He did]',
css:'vbe-3ms'}`, appended after the root) and replaced it with a synthesized
PREFIX — placed in the exact same `pfmObj` slot a REAL imperfect 3ms Yod occupies
(`{paleo:'𐤉', translation:'[He did]', css:'pfm-3ms'}`), guarded by `!pfmObj` (so it
never overrides a genuine tagged prefix) and the same person/gender/number/no-object
-suffix conditions the old rule used (`vt` perf or weqt, `ps`=p3, `nu`!=pl, `gn`!=f,
no `prs`). Because it reuses `pfm-3ms` — the identical css class a real imperfect
Yod gets — `applyFlatLabels`'s ordinary `FLAT_PREFIX` pass relabels it to `[He/it]`
automatically, same as every other 3ms subject marker in the corpus. **This means
the perfect/imperfect TENSE distinction is no longer visible on this chip at all —
confirmed, and understood to be intentional** ("the exact behavior of the other
words"), not an oversight; the root's own gloss is what still carries "did" vs.
"does/will do" if that matters in context. Deliberately does NOT touch
`paleoArray` — there is no real surface letter to remove, same as the vbs-hif
empty-paleo Hiphil-participle fix directly below.

Verified via the `PALEO_PARSE_ONLY` harness (see below): H6213 Asah, Qal perfect
3ms, now renders `𐤉𐤏𐤔𐤄` ("YaIshah" — Yod prefix + root), labeled `[He/it]`, in the
FIRST component slot exactly like an imperfect verb. Sanity-checked for
non-regression: an imperfect 3ms verb (Natan) is untouched (`!pfmObj` guard — the
real tagged prefix already wins, so this never double-fires); a perfect 3FS verb
(different gender) is untouched (still gets its own real `vbe-3fs` suffix,
unaffected by this new prefix rule, since `gn==='f'` excludes it).

**Not yet baked or verified live** — same standing constraint (this sandbox's
`better-sqlite3` binding still can't load `corpus.db`; verification here is limited
to the `parseToken`/`parseHebrewData` unit-level harness described in the section
below). Run `node build-surface-index.js` and restart the server (already covered
by the same rebuild instruction and `NAV_BUILD_VERSION` bump the section below
calls for — no separate rebuild needed for this on top of that one). After that,
Leviticus 24:19's "כַּאֲשֶׁר עָשָׂה" chip should show a real, visible Yod-prefixed
"He/it" ahead of the root wherever the perfect 3ms subject was previously invisible
— check that specific word again, since this session could not confirm what the
final rendered form of that particular multi-particle-chain word (Ka + Asher +
Asah all folded into one display block) looks like end-to-end without live DB
access; if the Asher-to-Asah letter boundary still looks garbled after this and the
rebuild below, that's a separate, so-far-unconfirmed bug worth reporting back with
the verse reference.

## "No eliding" regressions in Leviticus 24 — two real code bugs found and fixed, one turned out to be a stale bake (fixed 2026-09-21)

fieldy flagged three Parallel-view (BHS) words in Leviticus 24 that broke "let the
true root shine with all modifications visible": H5414 Nathan showing as "YaThan"
(missing the assimilated Nun), Lev 24:18's Hiphil participle of Nakah (H5221,
"WaManakah") combining 3 grammatical modifications into a label but showing only 2
visible chips, and Lev 24:12's construct of Peh/"mouth" (H6310) showing "Pay"
where it should show "Pahay" (root Peh-He + the construct Yod kept, not swapped in
for the root's own elided He). His ask, verbatim: "i dont want to have to go
looking for other instances" — so this pass looked for the SHARED mechanism behind
each, not a per-word patch, per this file's own standing rule ("Exception lists
like NME_EXCLUSIONS are artifacts, not the design," below).

**New tool for future sessions in this sandbox: a real, DB-free way to test
`parseToken` changes.** `build-surface-index.js` already has a `PALEO_PARSE_ONLY=1`
early-return (right before it opens `corpus.db`) that exports `{ parseToken,
GRAMMAR_MAP, isRootSubsequence, strongsRoots }` — built for `audit-modifications.cjs`
— but the file still unconditionally `require('better-sqlite3')`s at the top, which
throws immediately in this device-bridge sandbox (`invalid ELF header` — the native
binding is Windows-built, this sandbox is a Linux VM; same constraint documented
throughout this file for corpus.db access). Fix: a tiny Node `--require` preload
that monkey-patches `Module._load` to hand back a no-op fake constructor ONLY for
the string `'better-sqlite3'`, leaving every other require untouched:
```js
const Module = require('module');
const orig = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'better-sqlite3') {
    return function FakeDatabase() { return { prepare(){return{all:()=>[],get:()=>null,run:()=>({changes:0})};}, pragma(){}, exec(){} }; };
  }
  return orig.apply(this, arguments);
};
```
Then `PALEO_PARSE_ONLY=1 node --require preload.js -e "const {parseToken} =
require('./build-surface-index.js'); ..."` runs the REAL current parser against a
hand-built `(word_raw, pos, morph, strongs)` tuple with zero DB dependency — the
early-return fires before `new Database(...)` is ever called, so the fake never
even needs to do anything. This is how every diagnosis and fix below was actually
verified against the real code, not just `node --check`'d.

**Bug 1 — H6310 Peh, and every other 2-letter canonical root: `mergeRootDisplay`'s
overlap guard made elision-restoration structurally impossible.** The function's
null-guard was `if (lcs < 2 || lcs < n - 1 || (m - lcs) > 2) return null;` — three
conditions meant to read as "at most one radical elided, a real overlap, few
surface additions." But for a 2-letter canonical root (n=2), "at most one elided"
(`lcs >= n-1` = `lcs >= 1`) and "a real overlap" (`lcs >= 2`) are mutually
exclusive: losing 1 of 2 letters can never leave more than 1 behind. So the
`lcs < 2` clause is a silent no-op for every root of 3+ letters (there `lcs >=
n-1` is already `>= 2` and dominates) and is EXCLUSIVELY the thing that made
elision-restoration dead code for every 2-letter root. Confirmed via the harness:
`mergeRootDisplay([Peh,Yod], [Peh,He])` (construct "pi" dropping its root He)
returned `null` under the old guard. When it returns null, the caller's fallback
(`_canonTrusted` branch, since `_canonMissing<=2` trivially passes for a 1-letter
gap) does `rootDisplay = _canonicalRoot` — the bare canonical root ALONE, silently
DROPPING the construct Yod rather than keeping it as a surface addition. So this
was a double violation of "root + all modifications, nothing dropped": the elided
He never came back, and the attested Yod vanished too. **Fix**: `lcs < 2` ->
`lcs < 1` (requires at least one real letter of overlap, same protection level the
`m - lcs <= 2` / `_canonTrusted` upstream gates already provide against a wrong
Strong's number). This is a no-op for every 3+ letter root — verified against
H378a Ayashah's own known defective-spelling case (𐤀𐤔𐤄 -> restores to 𐤀𐤉𐤔𐤄
exactly as before) and against `tests/index-builder-consistency.test.cjs`'s
existing H3878-vs-unrelated-root rejection test (still passes — that guard fires
on a 3-letter canonical root, `lcs < n-1` alone already covers it, untouched by
this change). Verified fixed: `parseToken('𐤐𐤉', 'subs', 'st=c|...', '6310')` now
renders `𐤐𐤄𐤉` — root 𐤐𐤄 (Pah) restored in full, PLUS the construct Yod kept as
its own `nme-j` chip (the existing "HARDEN: NO BAKED MODIFICATION MAY LOOK LIKE A
BARE ROOT" splice already does this correctly once `mergeRootDisplay` actually
succeeds) — "Pahay," exactly the spelling asked for.

**Bug 2 — Hiphil (and likely Hofal) PARTICIPLES: OSHB never tags `vbs`, so the
causative modification had no chip at all — not even the empty "unwritten letter"
kind this codebase already has a working convention for.** This is the same shape
of bug as the already-fixed "participle Mem preformative" gap earlier in this file
(OSHB bakes the stem into the binyan pattern rather than tagging it, so a working
`GRAMMAR_MAP` entry + a whole "PARTICIPLE FALLBACK" branch in `extractPrefix`
already existed for exactly this case — but both are gated behind `attributes['vbs']`
actually being SET, and OSHB leaves it `absent` for a Hiphil participle the same
way it leaves `pfm` untagged there (no separate causative letter is written in
מַכֶּה makeh, only the Mem preformative + internal pattern). Confirmed via the
harness: `vbs=absent` on a Hiphil active participle of Nakah (H5221) produced a
SINGLE chip (Mem prefix folded away since `pfm` also needed its own synthesis,
root only) with the causative sense nowhere visible; forcing `vbs=H` correctly
triggered the pre-existing empty-paleo `[Causing]` chip. **Fix**: added a
synthesis rule right next to the existing Hishtaphel one (`vbs=hsht -> HT`):
`if ((!attributes['vbs']||absent) && pos==='verb' && vt.startsWith('ptc') &&
vs==='hif') attributes['vbs']='H';` — in both `server.js` and
`build-surface-index.js`. Verified: Lev 24:18's word now parses to 3 real
components — Mem "[One who]", empty "[Causing]" (vbs-hif), root "strike / kill" —
matching what fieldy expected to see. **Not covered, deliberately**: Hofal
(passive-causative participle, vt=ptcp). `GRAMMAR_MAP.vbs` has no entry for it at
all yet, and per this file's own evidence-only rule, I did not invent one — flag
to fieldy if a Hofal participle turns up showing the same "modification with no
chip" symptom; it needs its own `GRAMMAR_MAP.vbs` label decided by him, not a
guessed reuse of `'N'` (which currently means Nifal, a different binyan).

**Bug 3 — H5414 Nathan / "YaThan" did NOT reproduce against current code.**
`parseToken('𐤉𐤕𐤍', 'verb', 'vt=impf|pfm=J|...', '5414')` — the ordinary Qal
imperfect 3ms case (assimilated first Nun, the classic Pe-Nun elision) — correctly
returned `𐤉𐤍𐤕𐤍` ("YaNathan," full root restored) on the FIRST try, no code change
needed, against both the pre- and post-fix guard (n=3 here, so Bug 1's fix is a
no-op for this word specifically). Every other 3-letter-root elision case checked
the same way (H378a) also already works. This means Bug 3 is almost certainly a
STALE BAKE, not a live code defect — production is very likely serving an old
`surface-index.db` (or the server's own in-memory `nav-index.cache.json`, see the
`NAV_BUILD_VERSION` mechanism elsewhere in this file) from before whatever earlier
session last touched this exact path, not something this session can fully rule
out without corpus.db access. Only the reading-text/chip-breakdown SURFACE could
be re-verified here; the nav-index/root-explorer surface (which reads a separately
cached `nav-index.cache.json`) is even more likely to be showing pre-fix data
since it survives independently of a `surface-index.db` rebuild — see the
`NAV_BUILD_VERSION` bump below.

**Bumped `NAV_BUILD_VERSION`** (`server.js`, root explorer's in-memory cache)
`wordsurf-v10-first-by-sn` -> `wordsurf-v11-merge-guard-vbs-ptc` — Bug 1 and Bug 2
are both LOGIC changes to the same parsing path `buildNavIndexes()` shares with
the reader, so a v10 cache built under the old logic would keep both bugs alive
in the Root Explorer specifically even after this fix, per this file's own
established rule ("bump the version whenever buildNavIndexes' LOGIC changes, not
just when an input changes").

**Also kept in sync (same `lcs < 2` -> `lcs < 1` edit only — NOT the vbs/participle
fix, see below)**: `tests/parse-extract.cjs`, `tests/build-parseToken.cjs`. These
two are standalone test-fixture copies of the parsers, already visibly stale
relative to `server.js`/`build-surface-index.js` (neither had the Hishtaphel `vbs`
synthesis this session found sitting right next to the code it's patching, despite
comments elsewhere claiming everything is "kept in sync") — I did not try to thread
the participle-`vbs` fix through them without being able to verify it against
their already-drifted surrounding code. `tests/surface-overrides.test.cjs`
independently FAILS on this checkout (`H3878` canonical-root-mismatch guard not
rejecting an unrelated root) — confirmed via direct analysis (H3878's canonical
root is 3 letters, so Bug 1's fix is provably a no-op there) that this is a
PRE-EXISTING failure unrelated to anything in this session, not a regression from
this fix — worth a look separately.

**Also noticed, not touched**: a stale `.git/index.lock` blocked `git stash` in
this session's sandbox the same way this file's own "Desktop observability
widget" section (2026-09-18) describes — confirms that failure mode is still live
if it resurfaces; the widget's auto-resolve (removes a lock file once it's >2 min
old) should still clear it on its own on fieldy's machine.

**Not run against a live server this session** (same standing sandbox
constraint — this device-bridge sandbox's `better-sqlite3` binding is
Windows-built and can't load here at all, `invalid ELF header`, so the ONLY
verification possible was the new `PALEO_PARSE_ONLY` harness above plus
`node --check` on both edited files, both clean). Before calling this fixed:
```
node build-surface-index.js
```
(rebuilds `surface-index.db` fresh — picks up Bug 1 + Bug 2 automatically, no
flag needed) then restart the server (loads the new `NAV_BUILD_VERSION`, forcing
`nav-index.cache.json` to rebuild too). Then check, in the Parallel/BHS view:
Leviticus 24:12's Peh chip should read "Pahay" with a separate Yod modifier chip,
not bare "Pay"; Leviticus 24:18's Hiphil participle of Nakah should show 3 visible
chips (And / One who / Causing) before the root, not 2; and Leviticus 24:19's
Nathan should already be showing "YaNathan" correctly even before the rebuild —
if it's STILL "YaThan" after restart, that's new information (means this really
is a live code path this session's synthetic `parseToken` calls didn't reach) and
worth flagging back rather than assuming the rebuild alone fixed it.

## Desktop observability widget (added 2026-09-18)

fieldy, 2026-09-18, after a lexicon-sync stall sat unnoticed for hours — first a
stale `.git/index.lock` (my own diagnostic `git status`/`git fetch` calls from
the device-bridge sandbox created it and couldn't clean it up), then separately
my own uncommitted edits to `studio-sync.sh`/`studio-sync-watch.sh`/`CLAUDE.md`/
`DEPLOY-LIGHTSAIL.md` blocking `lexicon-sync.sh`'s `git pull --rebase` step —
and a near-identical silent stall on 2026-09-16 (a day and a half, per
`notify.sh`'s own header comment): "the observability of my app needs to be
improved" — wants a way to SEE the moment local/prod come out of sync or back
into sync, general app "upness", and safe auto-resolution where possible.

**What it is**: two Windows Scheduled Tasks (registered together by
`scripts/setup-observability-task.ps1`, run as Administrator):
- `bldbible observability collector` — hidden, runs
  `scripts/observability-status.mjs` forever via the same hidden-VBS pattern
  as the lexicon/studio watchers (`observability-collector-hidden.vbs`). Polls
  every ~20s: local git ahead/behind `origin/main`, the `lexicon-watch`/
  `studio-sync` `.failing` marker files, `bldbible.com/health` (reachability +
  latency + uptime, from `server/production.js`'s existing public `/health`
  route — no ssh needed for this part), and via `ssh paleo-prod`: the box's own
  git HEAD vs `origin/main`, running docker containers, and whether
  `lexicon-pull-watch.sh`'s pid is still alive. Writes the whole picture to
  `server/.observability/status.json` (write-then-rename, so the widget never
  reads a half-written file; directory is gitignored, per-machine only).
- `bldbible observability widget` — visible (that's the point): a small
  always-on-top WPF window (`scripts/observability-widget.ps1`, top-right of
  the screen) that polls `status.json` every 5s and color-codes each line
  (green = fine, orange = drift/failure, gray = no data yet). Its own
  PowerShell console is hidden; the WPF window itself is not a console and
  stays visible — separate from the collector so a widget crash/close never
  stops the underlying polling+auto-resolve.

**Auto-resolve — deliberately narrow, fieldy's own choice (asked directly,
picked "retry safe, idempotent operations" over the wider "auto-restart the
app" option)**: the collector auto-removes a `.git/index.lock` once it's
>2 minutes old (well past anything a real git process would legitimately hold
it for) — the exact failure that jammed things for the first stretch of the
2026-09-18 incident. Deliberately NOT auto-fixed, surfaced in the widget
instead:
- `lexicon-watch.sh`/`studio-sync-watch.sh` already retry every ~15s on their
  own poll loop regardless of `.failing` — that flag is a notify.sh status
  signal, not a gate blocking retries, so there's no "stuck and not retrying"
  state to kick them out of.
- Uncommitted local file changes blocking `git pull --rebase` (the SECOND,
  bigger cause of the 2026-09-18 stall) are NOT auto-committed — deciding what
  an unknown local change should become is fieldy's call, not a safe/
  idempotent operation. `git add`+commit is still Claude's job when Claude is
  the one who left files uncommitted (see the existing "he pushes" workflow
  rule elsewhere in this file) — just not something the widget does blindly.

**Setup** (one-time, on fieldy's machine): `Register-ScheduledTask` needs an
elevated PowerShell —
```
powershell -ExecutionPolicy Bypass -File scripts\setup-observability-task.ps1
```
— then either log off/on or `Start-ScheduledTask` both tasks by name (the
script prints the exact commands). Safe to re-run any time.

**Gotcha for future Claude sessions**: `PALEO_PROD_HOST`/`PALEO_PROD_REPO` env
vars work the same as in `studio-sync.sh` (default `paleo-prod` /
`/root/paleo-studio`). The `ssh`/`docker`/`git` calls to prod run through
`node`'s `child_process.execFile` directly (array-of-args, no local shell
involved) specifically so the `sudo -n bash -c '...'` remote-command strings
never need double-escaping — don't "simplify" this into a shell string without
re-testing the quoting. The collector cannot be smoke-tested end-to-end from
the device-bridge sandbox: `bldbible.com` and the `paleo-prod` SSH alias both
only resolve from fieldy's actual machine (confirmed working there
2026-09-18), so those two checks showed "unreachable" in-sandbox purely from
network/DNS scoping, not a bug — don't re-diagnose that as a real problem
without first confirming it fails on fieldy's own machine too.

## Moved off AWS Lightsail to OVH (added 2026-09-17)

fieldy moved production off the Lightsail box to a new OVH box — confirmed from
`deploy-blue-green.sh`'s own tuning comment (2026-09-17): "found 2026-09-17 moving to a
6c/12t / 32GB OVH box: 12 workers repeatedly SIGKILLed under the old 1400m/1700m boot cap."
A `deploy-tuning.env` (gitignored, per-box) override was already added there for the new
box's bigger CPU/RAM specs — this section is about everything ELSE in this file and
DEPLOY-LIGHTSAIL.md that still assumes Lightsail and hasn't caught up yet.

**Resolved same day:** fieldy confirmed the new box is `ubuntu@15.204.220.73`
(`ssh ubuntu@15.204.220.73` already works from his machine — no new key needed) and chose
a NEW alias, `paleo-prod`, rather than reusing `paleo-lightsail` — so `~/.ssh/config` on
his machine needs a `Host paleo-prod` block pointing at that IP/user (this session can't
write that file — outside the mounted folder — so fieldy adds it by hand). `studio-sync.sh`'s
`HOST="${PALEO_PROD_HOST:-paleo-lightsail}"` default, `studio-sync-watch.sh`'s identical
default, and DEPLOY-LIGHTSAIL.md's `ssh paleo-lightsail` instructions were all updated to
`paleo-prod` in the same session. **`paleo-lightsail` as an alias name is now dead
everywhere in this repo** — if it resurfaces in a future edit or a stale branch, that's
the OLD box, not the current one.

**Correction #2, same day — the SSH server itself settles this:** direct root login
is REJECTED. `ssh paleo-prod` (then aliased to `User root`) got back a hard refusal from
sshd itself: `Please login as the user "ubuntu" rather than the user "root". Connection
closed.` So the `~/.ssh/config` block must use **`User ubuntu`**, not `User root` — that
earlier "Correction" paragraph above was wrong and is superseded by this one.

Reconciling this with the terminal paste that showed `root@ns1020995:~/paleo-studio#`,
`/root/.ssh/bldbible_deploy`, and `/root/paleo-studio`: that session must have logged in
as `ubuntu` and then elevated (`sudo -i` or similar) before running the
`lightsail-lexicon-sync-setup.sh` setup commands — sshd blocking root doesn't stop a
logged-in user from `sudo`-ing to root once connected. So the real state of the box is:
SSH access is `ubuntu`-only, but the actual checkout, deploy key, and registered
cron/`@reboot` jobs all live under **`/root`**, not `/home/ubuntu`.

This matters for automation: any *scripted* remote command that connects as `ubuntu` and
runs something like `ssh paleo-prod "cd ~/paleo-studio && ..."` will fail, because `~`
resolves to `/home/ubuntu` for that user, not `/root` — and `/home/ubuntu` likely has no
checkout in it at all. `studio-sync.sh`/`studio-sync-watch.sh` (which do exactly this
pattern) have NOT yet been verified to work against the OVH box for this reason.
**Not yet confirmed:** whether `ubuntu` has passwordless sudo (which would let scripted
commands do `ssh paleo-prod "sudo bash -c 'cd /root/paleo-studio && ...'"`
non-interactively), or whether the intent is instead to move the checkout/deploy
key/cron jobs to live under `/home/ubuntu` so no sudo is needed for automation at all.
Ask fieldy before assuming either way — don't guess a workaround into `studio-sync.sh`
until this is settled.

**Resolved same day — confirmed on the box:**
- `sudo -i` as `ubuntu` drops straight into a root shell, no password prompt — `ubuntu`
  has passwordless sudo. Confirmed.
- `/home/ubuntu/paleo-studio` does not exist at all. `/root/paleo-studio` is the real
  (and only) checkout, readable only via `sudo` (parent dir `/root` is `drwx------`).
- `/mnt/paleo-data` (the docker data volume — `translation.db` lives here) is
  `drwxr-xr-x root root` with world-readable files inside, so it does NOT need sudo —
  `ubuntu` can `stat`/read it directly.

`studio-sync.sh` has been patched accordingly:
- `RREPO` default changed from `/home/ubuntu/paleo-studio` to `/root/paleo-studio`.
- The `test -f $RREPO/server/studio-sync.mjs` existence check and both `$RDOCKER`
  invocations (export and restore — each bind-mounts `$RREPO/server/studio-sync.mjs`)
  now run as `sudo -n bash -c '...'` over the ssh call, so they can actually reach
  `/root`. `-n` (non-interactive) makes a misconfigured/missing sudo fail fast with a
  clear error instead of hanging a script or the watcher loop.
- The export step's `mkdir -p /tmp/studio-sync/export` (now running as root via sudo)
  also does `chmod 777 /tmp/studio-sync` in the same call — needed so that the LATER
  `mkdir -p /tmp/studio-sync/merged` (intentionally left un-sudo'd, since `scp` uploads
  into it next as plain `ubuntu`) can still create a sibling directory there. Without
  this, `/tmp/studio-sync` would end up root-owned `755` from the export step and block
  `ubuntu` from writing into it at all for the upload half of the round trip.
- `studio-sync-watch.sh` needed NO changes — its only remote read is
  `stat $RDATA/translation.db` under `/mnt/paleo-data`, which `ubuntu` can already read
  directly (see above).

**Not yet live-tested end-to-end against the OVH box** (no way to SSH from this
session) — run `./studio-sync.sh` manually once and watch its `LOG` output before
trusting `studio-sync-watch.sh` to run it unattended in the background.

**Update, same day — the sudo/path fix was correct, but a separate bug surfaced behind
it:** running `./studio-sync.sh` manually hit
`mux_client_request_session: read from master failed: Connection reset by peer` /
`Failed to connect to new control master`, even right after `rm -f ~/.ssh/cm-studio-*`
and with `bldbible studio sync watch` confirmed NOT running (Task Scheduler showed it
`Ready`, not `Running` — so this wasn't a race with the watcher). Direct `ssh paleo-prod`
calls with no ControlMaster options worked fine (`sudo -n true` exited 0, the file
existence check passed) — the failure was specific to `SSH_OPTS`'s
`-o ControlMaster=auto -o ControlPersist=120s -o ControlPath=...` multiplexing setup.
Conclusion: Windows/Git-Bash's OpenSSH does not reliably support UNIX-domain-socket
ControlMaster multiplexing — a platform limitation, unrelated to the OVH move, the
`/root` path, or sudo. **Fix: ControlMaster disabled outright** in both
`studio-sync.sh` and `studio-sync-watch.sh` (`-o ControlMaster=no`, no `ControlPath`) —
every ssh/scp call now opens its own fresh connection. Slower per call (a full
handshake instead of a reused one, meaningful for the watcher's 15s polling loop) but
it actually works. If fieldy ever runs these scripts from a real Linux/macOS shell
instead of Windows, ControlMaster there is expected to be reliable and could be
re-enabled — but don't do this speculatively; only if asked. **Confirmed working end-to-end 2026-09-18**: a manual `./studio-sync.sh` run against the OVH box succeeded (exported 102 verses from prod, merged 14 changes in, logged to git) after this fix.

**What does NOT need fixing for this move — already host-agnostic by design:** the
lexicon git-sync mechanism (`lexicon-sync.sh` / `lexicon-watch.sh` / `lexicon-pull-
watch.sh`, DEPLOY-LIGHTSAIL.md §10/§10a) never hardcodes a host at all — it only ever
talks to `origin` (GitHub) over plain `git`. Getting it running "trigger style" on the new
box is the exact same one-time setup DEPLOY-LIGHTSAIL.md §10 already documents, run ON
the box, unchanged:
```bash
cd ~/paleo-studio && git pull && bash scripts/lightsail-lexicon-sync-setup.sh
./deploy-blue-green.sh        # so the container mounts server/lexicon from this checkout
```
(the script's FILENAME still says "lightsail" but its contents don't — it registers a
fresh GitHub deploy key for whatever box it's run on, and starts `lexicon-pull-watch.sh`,
which polls `git ls-remote origin main` every 15s and pulls within seconds of a push —
same as it did on Lightsail.) If this one-time setup hasn't been run yet on the OVH box,
that alone fully explains "the lexicon watch isn't working": fieldy's own machine
(`lexicon-watch.sh`) still pushes lexicon edits to GitHub fine — that half is local-only
and unaffected by the box move — the box just isn't pulling them because nothing there has
ever registered a deploy key or started the watcher on this box.

Not renamed/rewritten in this pass: the file is still literally called
DEPLOY-LIGHTSAIL.md and its prose says "AWS Lightsail" throughout. Leaving that alone for
now — renaming it is a bigger call (breaks any existing links/bookmarks to it, and it's
not clear what fieldy wants it called) than this addendum's scope.

## Lexicon curation: NEVER invent a transliteration — always pull it from the pre-existing BHS tokens / translation (added 2026-09-17)

fieldy, verbatim, correcting a Genesis 1:15 lexicon-curation session that fabricated "Hayir"
for 𐤄𐤀𐤉𐤓 (H215, hiphil infinitive "to give light"): "using my paleo hebrew transliterations
are required. 'Hayir' will never exist in my corpus... The only options we have for other
languages -- choose a full pre-existing transliteration from the pre-existing BHS tokens and
translation, make the rest of the lexicons conform around this translation and tokens." He
also separately confirmed "Hayu" (guessed for 𐤄𐤉𐤅 the same session, by analogy off the
existing "Hayah / let it be" entry for singular 𐤉𐤄𐤉) was likewise wrong — his own finished
Genesis 1:15 English already spells this word "WaYahayahaw", so the bare word is
"Yahayahaw", not a fresh guess. Both got corrected to match what his own translation already
uses: 𐤄𐤀𐤉𐤓 → "Awayar / shine", 𐤄𐤉𐤅 → "Yahayahaw / let them be".

**Rule for the standing verse-by-verse lexicon-curation project (see project memory's
lexicon-verse-by-verse note): when a Hebrew word in the verse being curated has no lexicon
entry yet, do NOT derive its transliteration from the paleo letters by pattern/analogy.**
Get the real one first, in this order:
1. Check whether Translation Studio's saved text for that verse (`translation.db`,
   `translations.text` — even an in-progress draft, not only `status='done'`) already spells
   this word out. If it does, copy that EXACT spelling, verbatim — do not "clean it up" or
   normalize its casing.
2. If not there, grep/jq the lexicon JSONs for another occurrence of the SAME Strong's number
   or root elsewhere in the corpus and reuse that spelling.
3. If genuinely nothing exists anywhere yet, that word is not safe to curate unsupervised —
   flag it to fieldy and ask, rather than fabricate a spelling. A made-up transliteration is
   worse than leaving the lexicon stub empty: it silently defeats Auto-Link (see "Non-Hebrew
   lexicon entries must embed the Hebrew-root translit" below) with a string that will never
   appear anywhere else in the corpus, and it plants a spelling fieldy never chose into files
   that auto-commit/auto-push (see the section directly below this one).

**For the other four languages (Greek/Latin/Ge'ez/Syriac):** the cognate translit embedded in
each of THEIR lexicon entries must be copied from that same already-established Hebrew
transliteration (step 1/2 above), never independently re-derived. The whole point of the
Auto-Link convention is that all five languages converge on ONE spelling per underlying
Hebrew word — five independent guesses defeats it even if each guess is individually
plausible-looking.

**Also: Translation Studio's saved wording (English) is fieldy's, not an agent's, to draft.**
If a verse already has translated text there — even in-progress — an agent's job in this
project is curating the LEXICON entries to conform to it, never proposing alternate English
phrasing for it "to review." Only propose English wording when a verse has no translation at
all yet and fieldy actually asks for a draft.

**2026-09-17 follow-up — casing convention, and "attempt it even if imperfect."** A first
pass at this rule copied "Yahayahaw" (single capital, at the start only) into new lexicon
entries for 𐤄𐤉𐤅, matching the literal current spelling of Genesis 1:15's own translation
text. fieldy's correction: **internal capitalization marks morpheme boundaries, and that's
the preferred house style** — "Yahayah sounds like one word, YaHayah looks like multiple
words coming together and that's what I prefer." This matches the multi-cap style already
used elsewhere in the corpus for the exact same root (Genesis 1:7/1:12/1:13's "WaYaHayah",
vs. 1:11's "WaYahayah" / 1:8-9's "WaHayah" — three different existing spellings for one
root, evidence the corpus was never fully consistent here even before any agent touched it).
So when copying a transliteration from the existing translation/BHS tokens (the rule above),
don't just copy the FIRST or MOST RECENT spelling byte-for-byte if the corpus already shows
multiple variants for the same root — prefer whichever variant carries capital letters at
real morpheme boundaries (prefix / root / suffix), since that's fieldy's stated preference,
and apply it consistently to every lexicon entry (all 5 languages) built around that root.

fieldy, in the same message: **"I don't mind inconsistency... I can easily edit a lexicon
file to correct them. What I don't want is a lack of an attempt when a clear target
exists."** Concretely: don't skip curating/correcting a shared root just because it also
appears in other, already-"done" verses — a small, well-evidenced casing fix (adding a
capital letter to an existing transliteration prefix, leaving the gloss text alone) is low-
risk and worth doing across every occurrence in the verse being worked, even the ones
belonging to an older, differently-cased entry (this session also fixed 𐤉𐤄𐤉's "Hayah / let
it be" → "YaHayah / let it be" this same way, plus its Greek/Latin/Ge'ez/Syriac siblings for
Genesis 1:15, even though 𐤉𐤄𐤉 is shared with roughly ten other already-completed verses).
An imperfect-but-attempted fix, flagged clearly, beats silently leaving a known-bad spelling
in place because "it's used elsewhere too."

## Local lexicon edits now auto-commit and auto-push — `lexicon-watch.sh` (added 2026-09-15)

fieldy, after a Gen 1:8 lexicon-fill session sat uncommitted and had to be manually pushed:
"I really just want the lexicon files saved and automatically updated... this is a fill+check
scenario, there shouldn't be much need for back and forth... I don't need you making the push,
my computer should do it." He does NOT want this for bigger features — scoped explicitly to
`server/lexicon/*.json` only, same as [[lexicon-sync]]'s existing scope.

**What existed before this:** `lexicon-sync.sh` (commit+pull-rebase+push, see the standing
[[lexicon-sync]] project note) already ran on the Lightsail box under a 5-minute cron. Nothing
equivalent ran locally — a lexicon edit made in this checkout (by fieldy or an agent working in
it) just sat as an uncommitted diff until he remembered `git push` himself. That's the gap this
closes, mirroring the exact pattern `studio-sync-watch.sh` already established for
`translation.db` on 2026-09-15 earlier the same day: a cheap local trigger layer on top of the
existing worker script, not a replacement for it.

**New pieces:**
- `scripts/lexicon-diff-summary.mjs` — real JSON-value diff (old = `git show HEAD:<path>`, new =
  the working-tree file), not a line-based grep. A line-based diff falsely flags the LAST key
  before a closing brace as "changed" every time a new entry is appended after it (only a
  trailing comma differs) — this compares actual parsed string values, so that case correctly
  reports nothing for that key. Outputs a compact `file (+n ~n -n)` line per file for the commit
  subject, then the same lines with capped added/removed/changed key-name lists for the body.
  Verified directly (scratch edit + revert, not committed): correctly reported one added key,
  one changed key, and did NOT flag the pre-existing last key that only picked up a trailing
  comma.
- `lexicon-sync.sh` — unchanged commit/pull-rebase/push logic, but now builds its commit message
  from the script above (`lexicon: <file summaries>` subject + added/removed/changed detail
  body), falling back to the old generic "edits from `<host>`, `<date>`" message if `node` isn't
  on PATH or the summary comes back empty — still has to be safe to run unattended (box cron,
  local watcher) either way.
- `lexicon-watch.sh` (new, repo root) — the local trigger. Polls `git status --porcelain --
  server/lexicon` every `PALEO_LEXWATCH_INTERVAL` seconds (default 15, same env-var naming
  convention as `studio-sync-watch.sh`'s `PALEO_WATCH_INTERVAL`). Unlike that script there's no
  remote box to poll — the signal is this checkout's own working tree, so it's plain local git,
  no ssh round trip. A one-poll debounce (the dirty-state hash — `git status --porcelain` +
  `git diff`, both scoped to `server/lexicon` — has to be IDENTICAL across two consecutive polls)
  guards against catching a lexicon file mid-write (an editor autosave, or an agent still
  appending entries) and shipping invalid JSON; worst case this adds one poll interval of latency
  before a settled edit gets synced.
- `scripts/lexicon-watch-hidden.vbs` + `scripts/setup-lexicon-watch-task.ps1` — same
  wscript.exe-hidden-window Windows Scheduled Task pattern as `studio-sync-watch-hidden.vbs` /
  `setup-studio-sync-watch-task.ps1` (task name `bldbible lexicon watch`, starts at logon,
  restarts on failure, logs to `~/lexicon-watch.log`). Same install step, same caveat: must be
  registered from an ELEVATED PowerShell —
  `powershell -ExecutionPolicy Bypass -File scripts\setup-lexicon-watch-task.ps1` — this session
  could write the files but cannot register a Scheduled Task itself (no elevation available from
  the device-bridge sandbox). Box-side cron and `studio-sync-watch` are untouched by this.

**A real bootstrapping gap, not yet resolved:** the device-bridge sandbox that edits this
checkout has no GitHub credentials — no `.netrc`, `.git-credentials`, or SSH key — because it's a
separate Linux VM (`hostname claude`) that only mounts fieldy's folder, distinct from his actual
MINGW64 environment where `git push` already works. So this session committed the Gen 1:8
lexicon-fill work locally but could not push it (confirmed: `git ls-remote origin` — read —
succeeds; `git push` fails with "could not read Username for 'https://github.com'"). That first
push, and this automation's own first push, both need fieldy to run `git push origin main` once
by hand; `lexicon-watch.sh` only takes over from the commit AFTER that point forward. If this
recurs and matters enough to fix, the fix is the same shape as the box's own deploy key — drop a
GitHub PAT or deploy key into the sandbox's git credential store — not attempted here since
fieldy scoped this request to "my computer should do it," not the agent.

**Not yet verified end-to-end** (would need a live push, which this session can't do — see
above): `lexicon-diff-summary.mjs`'s core diff logic WAS verified directly (scratch edit against
`greek-lexicon.json`, reverted, not committed — see above). The full `lexicon-watch.sh` polling
loop, the Scheduled Task registration, and a real commit-message-in-the-wild have not been run.
After fieldy runs the one bootstrap push and registers the task (elevated PowerShell, see above):
edit any `server/lexicon/*.json` file, wait ~30s (one settle poll + one sync poll), and confirm
`git log -1` shows a real added/removed/changed summary instead of the old generic message, and
that it actually reached GitHub.

## GSC "Alternate page with proper canonical tag" / "Page with redirect" — the client mutated the URL after hydration and the canonical tag blindly followed it (fixed 2026-09-07)

fieldy got a Search Console email flagging these two NEW reasons blocking pages from being
indexed, on top of "why doesn't a plain verse search ever surface bldbible.com the way it
does for other bible sites." Investigated live against production (WebFetch + the browser
pane, before touching any code) rather than guessing from the source alone.

**What was actually happening, confirmed live, three separate bugs sharing one root cause:**
this app's crawlability work (see the "indexability project" phases 1-3, 2026-08-15/16/17/18
entries further down this file) is genuinely solid — `server/prerender.js` snapshots real
per-verse content, `src/App.jsx`'s `SelfCanonical` keeps `<link rel="canonical">` pointed at
`location` on every route change, and robots.txt correctly lists all five sitemaps. But in
three places, something running AFTER hydration silently changed `window.location` (via
`history`/React Router, not a real HTTP redirect) to a URL that DISAGREED with what
`prerender.js` had just served and what the relevant sitemap had just submitted — and
`SelfCanonical` naively mirrored whatever `location` happened to be at that later moment
into the canonical tag, instead of staying anchored to the URL it was actually loaded at.
Confirmed each one by opening the live page in a real browser and reading
`document.getElementById('canonical-link').href` a few seconds after load, compared against
what `WebFetch`ing the bare URL (no JS) returned:

- **`/parallel?book=..&chapter=..[&verse=..]`** (sitemap-chapters.xml, ~1,454 URLs) — Parallel.jsx's
  own "URL sync" `useEffect` (added 2026-08-18 alongside the `/parallel/<slug>/<chapter>[-<verse>]`
  clean-path route) unconditionally calls `navigate(parallelHref(...), {replace:true})` on
  EVERY load, verse or not. So the prerendered snapshot Google's first crawl sees says "index
  this URL," then its JS-rendering pass sees the address bar silently jump to a totally
  different, un-sitemapped URL — textbook "Page with redirect."
- **`/bible?book=..&chapter=..&verse=..`** (sitemap-verses.xml, ~31,000 URLs) — Reader.jsx
  persists its Hebrew/English script toggle into the URL on mount (`?script=hebrew|english`)
  even when the loaded URL never had it, and `SelfCanonical` mirrored that addition straight
  into the canonical tag — so the hydrated canonical read `...&verse=1&script=english`, a
  different URL than the one actually crawled/submitted, on every single verse page.
- **`/translate?book=..&chapter=..&verse=..`** — two independent things compounding: (1)
  `VERSE_AGNOSTIC_ROUTES` in `src/App.jsx` still listed `/translate` (and `/parallel`),
  stripping `verse` from the hydrated canonical — stale since the 2026-08-16 phase-2 work gave
  `translateVerseRoute`/`parallelVerseRoute` their own genuine self-referencing per-verse
  canonicals (the exact reason `/bible` was already removed from that same Set on 2026-08-15,
  just never mirrored to the other two). (2) Translate's `setUrl` rewrote the numeric `book`
  query param to a SLUG (`bookToParam`) on every load — `server/prerender.js`'s `validBook()`
  only ever parses a plain integer, so `?book=genesis` doesn't even match the route that's
  supposed to own that canonical. Live-confirmed hydrated canonical:
  `/translate?book=genesis&chapter=1` for a URL sitemap-chapters.xml submits (and
  `translateVerseRoute` self-canonicalizes) as `/translate?book=1&chapter=1&verse=1`.

**Separately, a real duplicate-content architecture issue, not a bug exactly:** `sitemap-verses.xml`
(`/bible?book=..&verse=..`, ~31,000 URLs) and `sitemap-verse-pages.xml` (`/genesis/1/1`, the
SAME ~31,000 verses) were BOTH submitting a full URL set for identical rendered content
(confirmed live — byte-identical title/description/body for the same verse under both forms),
each self-canonicalizing independently since the clean-path route was added
"deliberately additive, not a canonical swap" (2026-08-18's own comment, explicitly flagging
"fully consolidating canonical/sitemap signal onto the path form... is a separate, deliberate
decision for later, not made here"). fieldy's call this session: the clean path is canonical.

**Fix, all four files:**
- `src/App.jsx`: added `'script'` to `IGNORED_PARAMS` (so `SelfCanonical` never mirrors it into
  the canonical tag); emptied `VERSE_AGNOSTIC_ROUTES` (both remaining entries retired — see
  each route's own fix below for why neither is stale anymore).
- `src/pages/Translate.jsx`: `setUrl` now writes `book` as a plain string of the numeric id,
  never the slug — matches what `translateVerseRoute`'s `validBook()` actually accepts.
- `server/prerender.js`: `englishVerseRoute`'s `canonicalPath` now points at the clean
  `/:bookSlug/:chapter/:verse` path (via `ensureProgressSlugMaps`, the SAME slug source
  `VersePage.jsx`'s own route already resolves against) instead of self — this is the "clean
  path is canonical" decision. New `parallelChapterRoute()` (factored out of the inline
  `englishChapterRoute(...)` call `ROUTES['/parallel']` and `parallelVerseRoute`'s own fallback
  both used) and `parallelVerseRoute` now both canonicalize onto
  `/parallel/<slug>/<chapter>[-<verse>]` — the exact URL Parallel.jsx's own client-side redirect
  already lands on, so prerendered and hydrated states finally agree instead of contradicting
  each other.
- `server/server.js`: new `GET /sitemap-parallel-pages.xml`, mirroring `sitemap-verse-pages.xml`
  exactly (same OT-only scope, same `sitemapSlugify(canonName(...))` slug — no collision risk,
  same reasoning as that route's own comment) but listing `/parallel/<slug>/<chapter>-<verse>` —
  the new canonical target needs to be directly discoverable, not just inferable from a
  canonical tag. `public/robots.txt` gained a matching `Sitemap:` line (`server/public/` is
  gitignored, regenerated at build/deploy — did not touch it directly).

**Also worth flagging, not fixed this session (out of scope for a canonical/redirect bug fix):**
`/bible/1/1`'s meta description embeds raw Paleo-Hebrew glyph characters and an empty-gloss
artifact ("Alahayam ()") straight into the `<meta name="description">` — cosmetic in a search
snippet, not an indexing blocker, but worth a look separately. And the deeper, non-technical
part of fieldy's original complaint — a plain `"genesis 1:1"` search not surfacing bldbible.com
at all, while BibleHub/ESV.org/BibleStudyTools/JW.org/BibleRef dominate that query — is normal
competitive reality against decades-old, high-authority reference sites for a generic query;
no code change here moves that needle. The site's OWN transliterated wording ("raashayath"
for "beginning", "Alahayam" for "God") also means the page's actual text doesn't literally
contain the phrasing most people search with, which likely holds back relevance matching even
once these pages get indexed cleanly — a content/wording tradeoff against the whole point of
the app, not something to auto-fix.

**Not run against a live server this session** (device-bridge sandbox reasons don't apply here —
this was investigated directly against PRODUCTION via WebFetch + a real browser, not this repo's
local dev server) — `node --check` (prerender.js, server.js) and `esbuild` (App.jsx,
Translate.jsx, since `node --check` can't parse JSX) both pass clean, but none of this was
exercised against a running server/rebuilt frontend. Before calling this actually fixed: `npm
run build` (or `vite build`) the frontend, restart the Node server, then verify live —
`/parallel?book=1&chapter=1&verse=1` should hydrate to a canonical of
`/parallel/genesis/1-1` (matching where it already redirects); `/bible?book=1&chapter=1&verse=1`
should hydrate to canonical `/genesis/1/1` with NO `?script=`; `/translate?book=1&chapter=1&verse=1`
should hydrate to canonical `/translate?book=1&chapter=1&verse=1` (numeric, verse intact);
`https://www.bldbible.com/sitemap-parallel-pages.xml` should return real `<url>` entries. Then
resubmit `sitemap-parallel-pages.xml` in Search Console (Sitemaps panel) and give Google a few
days/weeks — none of this makes existing "not indexed" pages jump to indexed instantly, it just
stops the app from actively contradicting its own sitemaps.


## The REAL reason NT reading text never live-reglosses — "untouched draft" only recognized OT's source_origin tag (fixed 2026-08-24)

Follow-up to the "ashah regression" section below, which I got half right and half
wrong. After the token-level fix (section above this one) shipped, fieldy confirmed
the word-by-word table now correctly shows Ayashah — but the READING TEXT still
said "ashah", and critically: "I never edited these verses in translation studio."
That directly disproved my "maybe it's a reviewed/frozen genuine translation"
hypothesis from the section below — fieldy would know, and he's saying it isn't.
That sent me back to find the REAL cause instead of resting on the earlier guess.

**Root cause.** `resolveChapterVerseTexts()` (and five other call sites — see
below) decide whether a verse is safe to live-reglossed with a 4-line check:
status must be 'none', text must still equal its own original_text snapshot, AND
`source_origin` must be exactly `'web-passthrough'`. That third condition is the
bug: `'web-passthrough'` is the tag ONLY `load-english-baseline.js` (the OT
loader) writes. `restore-nt-baseline.mjs` (the NT loader, canon_id 40-66) writes
`'web-en'`. `reseed-translations.mjs` (Apocrypha/Works Library, canon_id>66)
writes `'corpus-reseed'`. All three tags mean the identical thing — "auto-
imported, nobody has ever touched this verse" — but the check only ever
recognized one of them. So EVERY NT verse (Revelation included) and every
Apocrypha verse was being treated as `isUserOverride = true` — a frozen, "genuine"
translation — regardless of whether a human had ever actually saved anything for
it. This is why it looked exactly like a reviewed/frozen verse (my earlier guess)
while actually being nothing of the sort.

**Scale of it**: this exact 4-line check was copy-pasted into SIX separate route
handlers — `/api/translate/chapter` (what fieldy was looking at),
`/api/translate/verse` (Translation Studio's own editor prefill — meaning a
translator opening an untouched NT verse to review it was ALSO shown the stale
word, risking a human approving/saving text that only looked right because it was
frozen), `/api/parallel/verse`, and three `/api/admin/gloss-studio/*` routes. Every
one of them had to be fixed, or the same complaint would just resurface on a
different page.

**Fix**: consolidated into one function, `isUntouchedBaselineDraft(saved)`, right
after `applyLiveGloss` in server.js, backed by `UNTOUCHED_BASELINE_ORIGINS = new
Set(['web-passthrough', 'web-en', 'corpus-reseed'])`. All six call sites now call
this one function instead of repeating the check. A future 4th baseline-loader
(if one's ever added) only needs to add its tag to this one set, not hunt down six
copies again.

**Not run or tested this session** — same standing constraint, `node --check`
only. Verify after restart: Revelation 17:4's reading text (and any other
untouched NT verse using this word) should now read "Ayashah (woman)", not "ashah
(woman)" — and Translation Studio's editor, opened on an untouched NT verse,
should prefill with the live-reglossed text too, not the frozen baseline.

## The actual "378a is not ashah/fire" bug — the renumber fix patched the badge NUMBER but never the baked ROOT SPELLING (fixed 2026-08-24)

fieldy deployed and re-ran after the section directly below, then reported from
Revelation 17:4's word-by-word table: the STRONGS# badge correctly read H378a, but
the ROOT column, DEFINITION ("fire / offering made by fire" — H800/H801's post-
split gloss, not H378a's), TRANSLITERATION ("WaHaAshah", no Yod), and ROOT FIRST
APPEARANCE (Exodus 29:18 — the fire root's real first appearance, not Ayashah's)
all still showed the OLD 3-letter fire root's data. "378a is not ashah/fire.
whatever changes were made to the OT also needs to be made here [the NT/HEB
edition]." This is a DIFFERENT bug from the two sections below it (both of which
were real and are still correctly fixed) — this is the actual reason NT/HEB words
looked broken, not a missing OT-vs-NT code path.

**Root cause.** `applyLocOverrideToSurfRow`'s renumber-splice block (added earlier
today) patched `comps[idx].sn` — the root component's number, which is all the
STRONGS# badge reads — but never touched `comps[idx].paleo`, the baked ROOT
SPELLING that surface-index.db shipped with. Every OTHER display field is derived
from `.paleo`, not `.sn`, at render time: `reGlossOne` looks up the definition by
`paleo` (and `paleo_H<sn>`) in lexicon/homographs; `transliterateBlock` re-
transliterates from `.paleo` on every render; and the frontend's own root-first-
appearance lookup (`apiRootFirstByLetters`) is called with whatever paleo string
the component carries. So the badge got relabeled while everything describing the
WORD itself kept reading H800/H801's old, unrenumbered root (𐤀𐤔𐤄, "fire") — which,
after today's Phase 1 split, correctly resolves to fire's OWN new gloss ("fire /
offering made by fire") rather than raising an error, which is exactly what made
this look so plausible/silent instead of obviously broken.

This affected BOTH editions equally — it was never OT-vs-NT-specific code, just
that the OT (BHS) fast path happened to already have a CURRENT `.paleo` baked into
its surface-index (rebuilt during Phase 1's pipeline run), while the NT/HEB
edition's surface-index bake is older and still carries the pre-fix root — so the
exact same bug was invisible on Genesis 2:24 and visible on Revelation 17:4 purely
by coincidence of which surface-index happened to be fresher, not because the code
treated them differently.

**Fix**, in the same renumber block in `applyLocOverrideToSurfRow`: after setting
`comps[idx].sn`, also set `comps[idx].paleo = getCanonicalRoot(renamed, comps[idx].paleo) || comps[idx].paleo`.
Everything downstream (`reGlossOne`'s definition lookup, `transliterateBlock`'s
retransliteration, the frontend's first-appearance call) already recomputes fresh
from `.paleo` on every render — none of those needed their own separate patch,
this one field feeds all of them. Idempotent for rows that already had the correct
`.paleo` (e.g. BHS, most of the time) — `getCanonicalRoot` just returns the same
value back.

**Not run or tested this session** — same standing constraint. `node --check`
only. Verify after restart: Revelation 17:4's word-by-word table should now show
root 𐤀𐤉𐤔𐤄, "WaHaAyashah" (or similar, with the Yod), gloss "wife / individual
woman", and a first-appearance in the Ayashah cluster (not Exodus 29:18) — same
check for any other NT/HEB occurrence of this word, not just this one verse.

## "ashah" regression in the Revelation 17:3 reading text — NOT caused by anything today, and only partly fixable from here (found 2026-08-24)

fieldy reported bldbible.com's Revelation 17:3 reading text still showing "an ashah
(woman)" — old spelling, no Yod — with a screenshot from the normal reading view
(`/bible?book=...`), not the word-by-word table or Root Explorer this whole day's
work has been about.

**This is not a regression from anything in this session.** None of today's edits
(server.js route patches, lexicon files, strongs-renumber.json) touch the reading-
text rendering path at all. Tracing it down:

- `/bible?book=` reads verse text from `resolveChapterVerseTexts()` ->
  `translation.db`'s saved `text` column, falling back to `englishBaseline()` ->
  `applyLiveGloss()` only for an UNTOUCHED baseline draft (status='none', text still
  equal to its own original_text snapshot). A verse that's been reviewed/saved in
  Translation Studio is shown VERBATIM, frozen, and is deliberately never rewritten
  by anything — that's an intentional safety guarantee protecting real translation
  work (see the "BUG FOUND 2026-07-27" comment in restore-nt-baseline.mjs, which
  gates its own destructive reseed behind `--force` for the identical reason).
- Even where live-reglossing DOES run, `applyLiveGloss` (before today) only ever
  rewrote the GLOSS inside the parentheses — "ashah (**woman**)" -> "ashah
  (**current lexicon gloss for 'ashah'**)" — never the word "ashah" itself. Proof
  this session never touched this verse at all: if live-reglossing HAD run against
  the current lexicon.json, "ashah (woman)" would now read "ashah (fire / offering
  made by fire)" (H800/H801's new post-split gloss) — it doesn't, so this text is
  100% untouched by anything from today or from Phase 1.
- **The deeper finding**: the NT/HEB edition's English baseline
  (`english-nt-baseline.jsonl`) is a STATIC file with no generator script anywhere
  in this codebase (`grep -rl "english-nt-baseline.jsonl" *.mjs *.js` finds only
  READERS: merge-baseline.mjs, render-all.mjs, restore-nt-baseline.mjs,
  backfill-name-map.js — nothing writes it). Unlike the OT, whose baseline
  (`apply-web-strongs.mjs` -> `english-baseline.jsonl`) is regenerated from
  `web-strongs.jsonl` + CURRENT `strongs-roots.json` on every full `render-all.mjs`
  run, the NT baseline text was produced once (or hand-maintained) and nothing
  re-derives it from `strongs-roots.json` today. Confirmed empirically:
  `web-strongs.jsonl`'s `code` field only ever contains OT book codes (GEN...ZEP,
  zero NT codes) — the OT pipeline literally cannot reach Revelation. This means
  **even a full `render-all.mjs` run would NOT fix "ashah" in Revelation** — step 2
  (`merge-baseline.mjs`) pulls the NT portion from that same static file verbatim,
  root fix or no root fix. This is a real, pre-existing architectural gap between
  the OT and NT rendering pipelines, not something introduced this session.

**What I fixed, bounded to what's safe from here:** extended `applyLiveGloss`
(server.js) to also swap the WORD itself for a renumbered root, reusing the SAME
`raw_root` field the Root Explorer surface-splice reads (see the section below) —
a new `_translitRenumberIndex` maps the OLD transliteration ("ashah") to the NEW
canonical root's transliteration ("Ayashah"), checked before the existing
gloss-only swap, so both the word AND its gloss update together. This is correct
and safe, but **only reaches verses still in the "untouched draft" state** — the
exact same limitation `applyLiveGloss` already had for gloss-only swaps, just now
also covering the word. Whether this fixes Revelation 17:3 specifically depends on
whether the app's translation.db has that verse marked reviewed/saved (frozen,
untouched by this) or still an untouched pass-through draft (this fix reaches it) —
I can't check that from this sandbox (broken DB binding, same as everything else
today).

**What this does NOT fix, and would need real follow-up work if wanted:**
- A "genuine translation" verse frozen in translation.db needs a manual re-touch or
  revert-to-baseline (Translate Studio's existing history/revert feature — see
  `apiTransRevertToHistory` in `src/lib/api.js`) to pick up ANY lexicon/root change,
  today's or any prior one. That's existing, intentional behavior, not a gap.
- The static `english-nt-baseline.jsonl` itself has no code path that regenerates
  it from `tokens_nt`'s Strong's tags + current `strongs-roots.json` the way the OT
  baseline does. Building that (an NT-equivalent of `apply-web-strongs.mjs`) is a
  real, separate project — I did not attempt it: too large a change to make and
  ship untested in one pass, and I have no way to verify its output against real NT
  verses in this sandbox.

**Verify after restart:** find an NT/HEB-edition verse containing this word that is
STILL an untouched draft (not yet reviewed in Translate Studio) and confirm it now
reads "Ayashah (woman)". If Revelation 17:3 itself is the reviewed/frozen kind,
that's expected to still read "ashah (woman)" until someone touches it in Studio —
not evidence this fix failed.

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
**[SUPERSEDED 2026-09-17 — see "Moved off AWS Lightsail to OVH" at the top of this file.
The box, alias, and IP below are the OLD ones; the box itself is gone. Current alias is
`paleo-prod` (`ubuntu@15.204.220.73`). Everything else in this historical section —
`~/deploy.sh`, the blue/green swap, `pexec`, the `/data` bind mount — still describes how
the CURRENT box works too, just reached under the new alias.]**
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
