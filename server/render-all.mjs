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
//   9 fix-name-forms + verify-name-forms       deterministic name passes (bare names, gold () markers) + gate
//
// If any of these flag names differ in your tree, edit the STEPS arrays below — that's
// the only place the sequence is defined. --dry prints them so you can eyeball first.

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fmtDur } from './progress.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Every step is a script next to this file and reads corpus.db / *.jsonl relative to
// itself, so run them FROM server/ whatever directory you launched from
// (2026-09-09: `node server/render-all.mjs` from the repo root failed at step 1).
const HERE = path.dirname(fileURLToPath(import.meta.url));

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
  // 2026-09-09: the deterministic name passes run AFTER every seed — locked spellings
  // (Adawam), bare names → "Yawasap (Joseph)", the gold "()" markers the reader paints —
  // and the same gate the deploy runs closes the pipeline. Seeding no longer skips rows
  // these passes touched (status is the only edit signal), so nothing freezes again.
  ['node', ['fix-name-forms.mjs'],                           'name forms: locked spellings, bare names, gold () markers (re-applied every run)'],
  ['node', ['verify-name-forms.mjs'],                        'gate: fails the pipeline on any name the app would render wrong'],
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

// ── ETA ─────────────────────────────────────────────────────────────────────────
// Every step's duration is remembered in .render-all-timings.json (per step key, last
// 5 runs). Before a step: what it took last time. While it runs: a ticker every 15 s with
// elapsed, expected, and the whole pipeline's remaining time (sum of the remaining steps'
// last durations). A step with no history shows elapsed only, and earns an estimate for
// the next run.
const TIMINGS_PATH = path.join(HERE, '.render-all-timings.json');
let timings = {};
try { if (existsSync(TIMINGS_PATH)) timings = JSON.parse(readFileSync(TIMINGS_PATH, 'utf8')); } catch { timings = {}; }
const keyOf = ([cmd, cmdArgs]) => `${cmd} ${cmdArgs.join(' ')}`;
const expected = (step) => { const h = timings[keyOf(step)]; return h && h.length ? h.reduce((a, b) => a + b, 0) / h.length : null; };
const remainingAfter = (idx) => steps.slice(idx + 1).reduce((a, st) => a + (expected(st) || 0), 0);
const unknownAfter = (idx) => steps.slice(idx + 1).filter((st) => expected(st) === null).length;
const pipelineExpected = steps.reduce((a, st) => a + (expected(st) || 0), 0);
if (!DRY && pipelineExpected) console.log(`expected total ≈ ${fmtDur(pipelineExpected)} (from the last runs' timings${steps.some((st) => expected(st) === null) ? '; some steps have no history yet' : ''})`);

const run = (cmd, cmdArgs) => new Promise((resolve) => {
  // shell:true on Windows/MINGW so "node" resolves the same way it does in your terminal
  const child = spawn(cmd, cmdArgs, { stdio: 'inherit', shell: process.platform === 'win32', cwd: HERE });
  child.on('error', (error) => resolve({ error }));
  child.on('close', (status) => resolve({ status }));
});

const t0 = Date.now();
let i = 0;
for (const [cmd, cmdArgs, desc] of steps) {
  i++;
  const step = steps[i - 1], exp = expected(step);
  console.log(`\n[${i}/${steps.length}] ${desc}\n    $ ${cmd} ${cmdArgs.join(' ')}${exp ? `\n    expected ≈ ${fmtDur(exp)} (last runs)` : '\n    (no timing history yet — elapsed only)'}`);
  if (DRY) continue;
  const started = Date.now();
  const ticker = setInterval(() => {
    const el = Date.now() - started;
    const left = exp ? Math.max(exp - el, 0) : null;
    const rest = remainingAfter(i - 1) + (left ?? 0);
    const unk = unknownAfter(i - 1);
    console.log(`    ⏱ step ${i}: ${fmtDur(el)} elapsed${exp ? ` · ~${fmtDur(left)} left of ≈${fmtDur(exp)}` : ''} · pipeline: ${fmtDur(Date.now() - t0)} so far${rest ? `, ~${fmtDur(rest)} to go` : ''}${unk ? ` (+${unk} step${unk > 1 ? 's' : ''} without history)` : ''}`);
  }, 15000);
  const r = await run(cmd, cmdArgs);
  clearInterval(ticker);
  if (r.error) { console.error(`\n\u2717 step ${i} could not start: ${r.error.message}`); process.exit(1); }
  if (r.status !== 0) {
    console.error(`\n\u2717 step ${i} failed (exit ${r.status}). Stopping — no later step ran, corpus left as step ${i - 1} left it.`);
    process.exit(r.status || 1);
  }
  const took = Date.now() - started;
  timings[keyOf(step)] = [...(timings[keyOf(step)] || []).slice(-4), took];
  try { writeFileSync(TIMINGS_PATH, JSON.stringify(timings, null, 2) + '\n'); } catch { /* timings are a convenience */ }
  console.log(`    \u2713 ${fmtDur(took)}${exp ? ` (expected ≈ ${fmtDur(exp)})` : ''} · pipeline ${fmtDur(Date.now() - t0)} so far${remainingAfter(i - 1) ? `, ~${fmtDur(remainingAfter(i - 1))} to go` : ''}`);
}
console.log(DRY
  ? '\n(dry run complete — nothing executed)'
  : `\n\u2713 all ${steps.length} steps complete in ${fmtDur(Date.now() - t0)}. Restart the server.`);
