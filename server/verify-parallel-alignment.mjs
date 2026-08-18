#!/usr/bin/env node
/**
 * verify-parallel-alignment.mjs — HARD GATE: every Hebrew word's stored
 * prefix/root/suffix breakdown (its `components`) must reassemble, letter
 * for letter, into the SAME string already stored as `rendered_paleo` — the
 * exact value the Parallel/Reader views show as the word.
 *
 * WHY THIS EXISTS (fieldy, 2026-08-18, comparing bldbible.com/parallel's
 * Deuteronomy 13:3 against biblehub.com's interlinear for the same verse:
 * "there are clear regressions in my app and misaligned text ... My data
 * should not differ, I thought that's what the aligner scripts did but
 * there are clearly major lapses"): build-surface-index.js's parseToken()
 * computes `rendered_paleo`, `root_paleo`, and `components` from ONE parse
 * of ONE token and writes all three into the SAME row from the SAME
 * `surfaceMap.set(...)` call (see parseToken()'s return and the
 * `insertAllSurfs` transaction right after it) — so at build time they can
 * never disagree. They CAN disagree LATER: token_surfaces is also touched
 * by a growing family of narrower patch scripts (apply-lex-batch1.cjs,
 * generate-ben-elohim-overrides.cjs, the various fix-*.js/mjs scripts,
 * hand edits via admin endpoints, ...) that exist specifically to correct
 * one thing without re-running the full build. Any one of those that
 * updates `rendered_paleo` without also regenerating `components` (or vice
 * versa) produces exactly the bug class fieldy found by eye: the chip-by-
 * chip breakdown shown in the Parallel view (prefix chip + root chip +
 * suffix chip) no longer matches the word actually rendered next to it.
 * Nothing re-checked that the two stayed in sync — render-all.mjs's
 * pipeline runs verify-no-eliding.js (a DIFFERENT invariant, see that
 * file) right after a full rebuild, but neither script ran again at DEPLOY
 * time against whatever surface-index.db happened to be on the live
 * volume, and the volume persists across deploys untouched by a plain code
 * deploy (see DEPLOY.md / entrypoint.sh). A manual patch script run
 * between deploys could silently introduce this drift and no deploy would
 * ever have caught it — same shape of gap verify-verse-completeness.mjs's
 * header describes for blank verses, just on the Hebrew alignment side.
 *
 * WHAT IT CHECKS (mechanical, 100% of token_surfaces, no external
 * reference data or human judgement required):
 *   1. `components` parses as JSON and is a non-empty array.
 *   2. Every component's `paleo` field is a string (a missing/undefined
 *      field would corrupt the reassembly below — caught by check 3 too,
 *      but flagged here with a clearer message).
 *   3. `components.map(c => c.paleo).join('')` — recomputed fresh from the
 *      row's OWN stored `components` — equals the row's OWN stored
 *      `rendered_paleo`, EXACTLY. Whatever chips the Parallel/Reader UI
 *      renders for a word must sum to the same word actually shown.
 *   4. When `components` contains a root chip (`css === 'root'`), the
 *      row's stored `root_paleo` equals that chip's `true_root` (if set)
 *      else its `paleo` — the same "two derived fields, one source of
 *      truth" logic as check 3, applied to the other field parseToken()
 *      derives from the same parse. Rows with NO root chip (standalone
 *      proclitics — bare conj/prep/art/interrogative-he, see
 *      `isStandalonePos` in build-surface-index.js) are skipped for this
 *      check on purpose, not a gap — see WHAT IT DOES NOT CHECK.
 *
 * WHAT IT DOES NOT CHECK:
 *   - Whether the SN/root/gloss triplet agrees with itself internally —
 *     that's scripts/audit-sn-consistency.cjs, a curation tool rather than
 *     a hard gate, because many of its findings need a human linguistic
 *     call (hollow roots, lamed-hay forms, etc; see CONSISTENCY_WORKFLOW.md).
 *   - Whether a trusted canonical root's letters survive elision in the
 *     DISPLAYED root — that's verify-no-eliding.js's job, wired in as its
 *     own gate right next to this one in deploy-blue-green.sh.
 *   - Whether the word/root/gloss/Strong's-number this app shows agrees
 *     with an external interlinear (BibleHub, a standard lexicon, etc).
 *     That needs network access and per-case human judgement on genuine
 *     scholarly disagreement, not something to run in the deploy hot path —
 *     see CONSISTENCY_WORKFLOW.md's "Cross-checking against authoritative
 *     sources" section, which explicitly scopes this out for the same
 *     reason. A periodic, non-blocking audit against an external source is
 *     a separate tool from this gate, not this script.
 *
 * USAGE:
 *   node verify-parallel-alignment.mjs [dbPath] [--write-allowlist]
 * (exit 0 = pass, exit 1 = fail, prints every NEW violation.) Wired into
 * deploy-blue-green.sh's DATA GATES, run against /data/surface-index.db on
 * the live volume BEFORE swapping traffic — same spirit, same place as the
 * existing verify-versification.mjs / verify-verse-completeness.mjs /
 * verify-no-eliding.js calls.
 *
 * ALLOWLIST RATCHET (same reason as versification-known-gaps.json /
 * verse-completeness-known-gaps.json — see those files' headers): this
 * gate has never run against the real, years-of-patch-scripts production
 * surface-index.db before. If it finds pre-existing drift on its first
 * run, failing every future deploy on debt that predates the gate isn't
 * fair to whoever's deploying something unrelated. Run once, review what
 * it finds, fix what you can, then snapshot whatever's left:
 *     node verify-parallel-alignment.mjs --write-allowlist
 * A normal run only fails on keys NOT in that snapshot.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const WRITE_ALLOWLIST = args.includes('--write-allowlist');
const positional = args.filter(a => !a.startsWith('--'));
const dbPath = positional[0] || path.join(__dirname, 'surface-index.db');
const ALLOWLIST_PATH = path.join(__dirname, 'parallel-alignment-known-gaps.json');

if (!fs.existsSync(dbPath)) {
  console.log(`[parallel-alignment gate] SKIPPED — ${dbPath} not found, nothing to gate yet`);
  process.exit(0);
}

const db = new Database(dbPath, { readonly: true });
let rows;
try {
  rows = db.prepare(
    `SELECT source, word_raw, strongs, pos, morph, rendered_paleo, root_paleo, components
     FROM token_surfaces`
  ).all();
} finally {
  db.close();
}

const failures = []; // { key, msg }
const note = (key, msg) => failures.push({ key, msg });

for (const r of rows) {
  const key = `${r.source}|${r.word_raw}|${r.strongs}|${r.pos}|${r.morph}`;

  let comps;
  try { comps = JSON.parse(r.components); }
  catch { note(key, `word_raw=${r.word_raw} strongs=${r.strongs}: components is not valid JSON`); continue; }

  if (!Array.isArray(comps) || comps.length === 0) {
    note(key, `word_raw=${r.word_raw} strongs=${r.strongs}: components is empty/not an array`);
    continue;
  }

  if (comps.some(c => typeof (c && c.paleo) !== 'string')) {
    note(key, `word_raw=${r.word_raw} strongs=${r.strongs}: a component is missing a string 'paleo' field`);
    // fall through — the reassembly check below will also fail and show
    // exactly what came out, which is useful for diagnosis.
  }

  const assembled = comps.map(c => (c && c.paleo) || '').join('');
  if (assembled !== r.rendered_paleo) {
    note(key,
      `word_raw=${r.word_raw} strongs=${r.strongs} pos=${r.pos}: components reassemble to ` +
      `"${assembled}" but rendered_paleo stores "${r.rendered_paleo}" — the Parallel/Reader chip ` +
      `breakdown no longer matches the word it's attached to`);
  }

  const rootComp = comps.find(c => c && c.css === 'root');
  if (rootComp) {
    const expectedRoot = rootComp.true_root || rootComp.paleo || '';
    if (expectedRoot !== r.root_paleo) {
      note(key,
        `word_raw=${r.word_raw} strongs=${r.strongs}: root chip implies root_paleo "${expectedRoot}" ` +
        `but the row stores "${r.root_paleo}"`);
    }
  }
}

if (WRITE_ALLOWLIST) {
  const gaps = failures.map(f => f.key).sort();
  fs.writeFileSync(ALLOWLIST_PATH, JSON.stringify({
    _comment: 'Pre-existing parallel-alignment drift accepted as known debt at the time this gate went ' +
      'live, NOT new regressions — see the ALLOWLIST RATCHET note in verify-parallel-alignment.mjs\'s ' +
      'header. A normal run only fails on keys NOT in this list. Regenerate with: ' +
      'node verify-parallel-alignment.mjs --write-allowlist',
    generated: new Date().toISOString(),
    count: gaps.length,
    gaps,
  }, null, 2) + '\n');
  console.log(`✓ wrote ${gaps.length} known gap(s) to ${path.basename(ALLOWLIST_PATH)}`);
  process.exit(0);
}

let allowlist = new Set();
if (fs.existsSync(ALLOWLIST_PATH)) {
  try { allowlist = new Set(JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8')).gaps || []); }
  catch { /* malformed allowlist — treat as empty, everything reports as new */ }
}
const known = failures.filter(f => allowlist.has(f.key));
const fresh = failures.filter(f => !allowlist.has(f.key));

console.log(`verify-parallel-alignment: ${rows.length.toLocaleString()} surface reading(s) checked, ` +
  `${failures.length.toLocaleString()} problem(s) found, ${known.length.toLocaleString()} pre-existing ` +
  `(allowlisted), ${fresh.length.toLocaleString()} NEW.`);

if (fresh.length) {
  console.error(`\n✗ verify-parallel-alignment: ${fresh.length.toLocaleString()} NEW alignment problem(s):\n`);
  for (const f of fresh.slice(0, 200)) console.error(`  - ${f.msg}`);
  if (fresh.length > 200) console.error(`  ...and ${fresh.length - 200} more.`);
  console.error(`\nIf this is genuine pre-existing debt (not caused by whatever you just changed), run ` +
    `\`node verify-parallel-alignment.mjs --write-allowlist\` to accept it. Otherwise: rebuild ` +
    `surface-index.db with node server/build-surface-index.js, or find and fix whatever patch script ` +
    `wrote rendered_paleo/root_paleo/components out of sync.\n`);
  process.exit(1);
} else {
  console.log('✓ verify-parallel-alignment: no new alignment drift.');
  process.exit(0);
}
