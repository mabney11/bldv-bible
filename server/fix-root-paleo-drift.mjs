#!/usr/bin/env node
/**
 * fix-root-paleo-drift.mjs — ONE-OFF corrective tool, NOT a gate.
 *
 * verify-parallel-alignment.mjs's check 4 caught rows where `root_paleo`
 * (the DB column the Roots/grouping page groups by) disagrees with what the
 * row's OWN `components` root chip implies (`true_root || paleo`) — the
 * exact invariant build-surface-index.js's parseToken() guarantees at build
 * time (see that file's line ~1017: "root_paleo stays the CLEAN lemma").
 * Some later patch script wrote to `components` (or to `root_paleo`)
 * in-place without keeping the other in sync, breaking that guarantee for a
 * handful of rows.
 *
 * This script does the SAME check verify-parallel-alignment.mjs's check 4
 * does, and where it finds a mismatch, sets `root_paleo` to exactly the
 * value the row's own `components` already implies — nothing external, no
 * judgement call, no guessing which patch script caused it. It does NOT
 * touch `components` or `rendered_paleo` (the values that actually drive
 * what the Parallel/Reader UI renders) — only the derived grouping column.
 *
 * USAGE:
 *   node fix-root-paleo-drift.mjs <dbPath> [--dry-run]
 * (--dry-run prints what WOULD change without writing anything.)
 *
 * After running for real, re-run verify-parallel-alignment.mjs --force
 * against the same dbPath to confirm 0 NEW violations remain.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const dbPath = args.find(a => !a.startsWith('--'));

if (!dbPath || !fs.existsSync(dbPath)) {
  console.error('Usage: node fix-root-paleo-drift.mjs <dbPath> [--dry-run]');
  process.exit(1);
}

const db = new Database(dbPath, { readonly: DRY_RUN });
const rows = db.prepare(
  `SELECT source, word_raw, strongs, pos, morph, root_paleo, components FROM token_surfaces`
).all();

const update = DRY_RUN ? null : db.prepare(
  `UPDATE token_surfaces SET root_paleo = ?
   WHERE source = ? AND word_raw = ? AND strongs = ? AND pos = ? AND morph = ?`
);

let fixed = 0, skippedBadJson = 0;
const applyAll = DRY_RUN ? null : db.transaction((changes) => {
  for (const c of changes) {
    update.run(c.expected, c.source, c.word_raw, c.strongs, c.pos, c.morph);
  }
});

const changes = [];
for (const r of rows) {
  let comps;
  try { comps = JSON.parse(r.components); } catch { skippedBadJson++; continue; }
  if (!Array.isArray(comps)) continue;
  const rootComp = comps.find(c => c && c.css === 'root');
  if (!rootComp) continue; // no root chip — root_paleo legitimately falls back to rawPaleo, not this script's job
  const expected = rootComp.true_root || rootComp.paleo || '';
  if (!expected || expected === r.root_paleo) continue;
  changes.push({ ...r, expected });
}

console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}${changes.length} row(s) to fix (of ${rows.length.toLocaleString()} checked, ` +
  `${skippedBadJson} skipped for malformed components):`);
for (const c of changes) {
  console.log(`  word_raw=${c.word_raw} strongs=${c.strongs}: root_paleo "${c.root_paleo}" -> "${c.expected}"`);
}

if (!DRY_RUN && changes.length) {
  applyAll(changes);
  fixed = changes.length;
}
db.close();

if (DRY_RUN) {
  console.log('\nDry run only — nothing written. Re-run without --dry-run to apply.');
} else {
  console.log(`\n✓ Fixed ${fixed} row(s). Re-run: node verify-parallel-alignment.mjs ${dbPath} --force to confirm.`);
}
