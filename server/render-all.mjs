// render-all.mjs — ONE command to rebuild every rendered ENG verse from source.
// Same spirit as build-concordance / build-surface-index: you run one thing, it does
// the whole pipeline deterministically, and it stops the moment a step fails so a
// half-run can never leave the corpus in a weird state.
//
//   node render-all.mjs            full rebuild: OT from Hebrew Strong's, NT+Apocrypha
//                                  from the surface map, then reseed translation.db
//   node render-all.mjs --surface  ONLY re-render the untagged books from the read-only
//                                  source copy (text_src). Fast path for when you edited a
//                                  surface rule (term-forms / term-caps / theonyms /
//                                  divine-*) — skips the whole reload, no re-download.
//   node render-all.mjs --dry      print the exact steps without running any of them
//
// READ-ONLY SOURCE COPIES
//   Your originals stay untouched: the OT renders from web-strongs.jsonl, the NT from
//   english-nt-baseline.jsonl, the Apocrypha from its backup — all local, no re-download.
//   A full run also snapshots the pristine untagged English into an immutable text_src
//   column (step 6) and renders FROM it, so every later --surface rebuild is a clean
//   render of the source, not a re-render of already-rendered text.
//
// The pipeline, in order:
//   1 apply-web-strongs   OT: web-strongs.jsonl -> english-baseline.jsonl (+ word-map.json)
//   2 merge-baseline      stitch OT + recovered NT -> english-baseline.jsonl (all 66)
//   3 load-english-baseline --reset-baseline   load the 66-book baseline into corpus.db ENG
//   4 reingest-apocrypha --bak                 re-add Apocrypha/pseudepigrapha from backup
//   5 fix-apocrypha-ords                        backfill ord_c/ord_v on those fresh rows
//   6 de-archaic-corpus                        modernize archaic English (idempotent)
//   6 render-corpus --reset-src                snapshot pristine untagged text -> text_src
//   7 render-corpus --from-src --apply         surface render NT+Apoc from text_src
//   8 reseed-translations                      rebuild translation.db from corpus.db ENG
//
// If any of these flag names differ in your tree, edit the STEPS arrays below — that's
// the only place the sequence is defined. --dry prints them so you can eyeball first.

import { spawnSync } from 'node:child_process';

const args    = process.argv.slice(2);
const DRY     = args.includes('--dry');
const SURFACE = args.includes('--surface');

// [command, [args], human description]
const OT_STEPS = [
  ['node', ['apply-web-strongs.mjs'],                        "render OT from Hebrew Strong's (+ regenerate word-map.json)"],
  ['node', ['merge-baseline.mjs'],                           'stitch OT + recovered NT into the 66-book baseline'],
  ['node', ['load-english-baseline.js', '--reset-baseline'], 'load the 66-book baseline into corpus.db ENG'],
  ['node', ['reingest-apocrypha.mjs', '--bak'],              're-add Apocrypha/pseudepigrapha from backup'],
  // reingest DELETES and re-INSERTS every apocrypha row straight from Scrollmapper, and
  // those inserts carry chapter/verse as TEXT with ord_c/ord_v NULL. Every downstream
  // reader keys on ord_c/ord_v, so without this the books go invisible again on EVERY
  // rebuild — the verse list comes back empty and the reader says "not translated".
  // This must run after reingest and before anything that reads chapters.
  ['node', ['fix-apocrypha-ords.mjs'],                       'backfill ord_c/ord_v on the re-inserted apocrypha rows'],
  ['node', ['de-archaic-corpus.js'],                         'modernize archaic English (idempotent)'],
];
// Snapshot the pristine untagged English into the immutable text_src column, right after
// the reload — this is the read-only source copy the surface render (and every future
// --surface rebuild) reads from, so re-rendering never touches your originals.
const SNAPSHOT_STEP = [
  ['node', ['render-corpus.mjs', '--reset-src'],             'snapshot pristine untagged text -> immutable text_src (read-only source)'],
];
const SURFACE_STEPS = [
  ['node', ['render-corpus.mjs', '--from-src', '--apply'],   'surface render NT + Apocrypha FROM text_src (names, terms, theonyms, adam)'],
];
const TAIL_STEPS = [
  ['node', ['reseed-translations.mjs'],                      'reseed translation.db from corpus.db ENG'],
  ['node', ['verify-integration.mjs'],                       'verify: baseline reaches Studio+reader, report missing chapters'],
];

// Full run reloads pristine sources, refreshes the read-only snapshot, then renders from
// it. --surface skips the reload entirely and rebuilds the untagged books straight from
// the existing text_src — idempotent, rule-change-safe, no re-download.
const steps = SURFACE
  ? [...SURFACE_STEPS, ...TAIL_STEPS]
  : [...OT_STEPS, ...SNAPSHOT_STEP, ...SURFACE_STEPS, ...TAIL_STEPS];

console.log(SURFACE ? '── SURFACE-ONLY rebuild ──' : '── FULL rebuild (OT + surface) ──');
if (DRY) console.log('(dry run — printing steps only, nothing will execute)');

const t0 = Date.now();
let i = 0;
for (const [cmd, cmdArgs, desc] of steps) {
  i++;
  console.log(`\n[${i}/${steps.length}] ${desc}\n    $ ${cmd} ${cmdArgs.join(' ')}`);
  if (DRY) continue;
  const started = Date.now();
  // shell:true on Windows/MINGW so "node" resolves the same way it does in your terminal
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.error) { console.error(`\n\u2717 step ${i} could not start: ${r.error.message}`); process.exit(1); }
  if (r.status !== 0) {
    console.error(`\n\u2717 step ${i} failed (exit ${r.status}). Stopping — no later step ran, corpus left as step ${i - 1} left it.`);
    process.exit(r.status || 1);
  }
  console.log(`    \u2713 ${((Date.now() - started) / 1000).toFixed(1)}s`);
}
console.log(DRY
  ? '\n(dry run complete — nothing executed)'
  : `\n\u2713 all ${steps.length} steps complete in ${((Date.now() - t0) / 1000).toFixed(1)}s. Restart the server.`);
