#!/usr/bin/env node
// migrate-site-keys.mjs [translation.db] [--apply]      (default: dry run — prints what it would do)
//
// ONE-TIME, 2026-11-26. fieldy: "I dont want differences unless something is completely dropped -- if all the words are
// there, lets use the modern numbers". Joel, Malachi, 1 Kings 4-5 / 22, 1 Chronicles 12, Nehemiah 7, Ecclesiastes 4-5,
// Numbers 25-26 and Isaiah 63-64 now use the English numbers (eng-versification.cjs). translation.db rows were stored
// under the old numbers. This moves, by site-key-moves-2026-11-26.json (old key -> modern key, computed from the old
// and new tables):
//   - YOUR SAVED VERSES (status != 'none' or rich_text != ''): the row is re-keyed (an UPDATE of its numbers only, so the
//     provenance triggers never relabel the author), its translation_history rows and hand links go with it; a machine
//     row already at the target is removed first. A saved verse already at the target stops the run (nothing written).
//   - HEADINGS listed in the moves file go to the modern key (Joel's two: "Promise of Yahawah's Spirit" 3:1 -> 2:28 …).
//   - MACHINE rows under a number the site no longer shows (Joel 4, Malachi 3:19-24 …) are deleted, with their
//     automatic links; reseed-translations / load-english-baseline write every modern key from the Hebrew.
// Machine rows that stay under a still-shown number are left for the reseed to rewrite (their text is the old verse's).
// Records itself in site_key_migrations and never runs twice. Then run: node render-all.mjs (full).
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VS = createRequire(import.meta.url)('./eng-versification.cjs');
const args = process.argv.slice(2), APPLY = args.includes('--apply');
const DB = args.find(a => !a.startsWith('--')) || path.join(__dirname, 'translation.db');
const NAME = 'modern-numbers-2026-11-26';
const MOVES = JSON.parse(readFileSync(path.join(__dirname, 'site-key-moves-2026-11-26.json'), 'utf8')).moves;
const db = new Database(DB, { readonly: !APPLY });
db.pragma('busy_timeout = 10000');
const hasMarks = !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'site_key_migrations'`).get();
if (hasMarks && db.prepare(`SELECT 1 FROM site_key_migrations WHERE name = ?`).get(NAME)) { console.log(`${NAME}: already applied — nothing to do`); process.exit(0); }

const k = a => a.join(':');
const row = db.prepare(`SELECT book_id b, chapter c, verse v, status, rich_text rt, text FROM translations WHERE book_id = ? AND chapter = ? AND verse = ?`);
const isSaved = r => r && ((r.status || 'none') !== 'none' || (r.rt || '') !== '');
const fromSet = new Set(MOVES.map(m => k(m.from)));

const savedMoves = [], conflicts = [], headMoves = [], linkMoves = [], histMoves = [];
for (const m of MOVES) {
  const r = row.get(...m.from);
  if (isSaved(r)) {
    const t = row.get(...m.to);
    // the target holds a saved verse that is not itself moving away
    if (isSaved(t) && !(fromSet.has(k(m.to)) )) conflicts.push(`${k(m.from)} -> ${k(m.to)}: your saved verse is already at ${k(m.to)}`);
    savedMoves.push(m);
    for (const h of db.prepare(`SELECT id FROM translation_history WHERE book_id = ? AND chapter = ? AND verse = ?`).all(...m.from)) histMoves.push({ id: h.id, to: m.to });
    for (const l of db.prepare(`SELECT id FROM translation_links WHERE book_id = ? AND chapter = ? AND verse = ? AND lang NOT LIKE '%auto%'`).all(...m.from)) linkMoves.push({ id: l.id, to: m.to });
  }
}
// headings move only where listed: a heading may already have been written for the English chapter (1 Kings 5:1
// "Preparations with Chayaram", Ecclesiastes 5:1 "Vows") — those stay; Joel's were keyed the Hebrew way
for (const hm of JSON.parse(readFileSync(path.join(__dirname, 'site-key-moves-2026-11-26.json'), 'utf8')).headings || [])
  for (const h of db.prepare(`SELECT id, title FROM headings WHERE book_id = ? AND chapter = ? AND verse = ?`).all(...hm.from))
    headMoves.push({ id: h.id, title: h.title, from: hm.from, to: hm.to });
const orphanRows = db.prepare(`SELECT book_id b, chapter c, verse v, status, rich_text rt FROM translations WHERE book_id BETWEEN 1 AND 39`).all()
  .filter(r => !VS.siteShows(r.b, r.c, r.v));
const orphanMachine = orphanRows.filter(r => !isSaved(r) && !savedMoves.some(m => k(m.from) === k([r.b, r.c, r.v])));
const orphanSaved = orphanRows.filter(r => isSaved(r) && !savedMoves.some(m => k(m.from) === k([r.b, r.c, r.v])));

console.log(`${NAME} ${APPLY ? '(APPLY)' : '(dry run — add --apply to write)'} on ${DB}`);
console.log(`  your saved verses moved: ${savedMoves.length}`); for (const m of savedMoves) console.log(`    ${k(m.from)} -> ${k(m.to)}  (Hebrew ${k(m.heb)})`);
console.log(`  their history rows: ${histMoves.length}, hand links: ${linkMoves.length}`);
console.log(`  headings moved: ${headMoves.length}`); for (const h of headMoves) console.log(`    ${k(h.from)} -> ${k(h.to)}  "${h.title}"`);
console.log(`  machine rows under numbers the site no longer shows (deleted): ${orphanMachine.length}`);
if (orphanSaved.length) { console.log(`  ✗ your saved verses under numbers the site no longer shows, with no move listed:`); for (const r of orphanSaved) console.log(`    ${r.b}:${r.c}:${r.v}`); }
if (conflicts.length) { console.log('  ✗ conflicts:'); for (const c of conflicts) console.log('    ' + c); }
if (conflicts.length || orphanSaved.length) { console.log('Nothing written. Resolve the above first.'); process.exit(1); }
if (!APPLY) process.exit(0);

db.exec(`CREATE TABLE IF NOT EXISTS site_key_migrations (name TEXT PRIMARY KEY, applied_at TEXT)`);
db.transaction(() => {
  // 1. lift the saved rows out of the way (negative verse numbers), clear the targets' machine rows, put them down
  const lift = db.prepare(`UPDATE translations SET verse = ? WHERE book_id = ? AND chapter = ? AND verse = ?`);
  savedMoves.forEach((m, i) => lift.run(-1000 - i, ...m.from));
  const delMachine = db.prepare(`DELETE FROM translations WHERE book_id = ? AND chapter = ? AND verse = ? AND status = 'none' AND coalesce(rich_text,'') = ''`);
  const delAutoLinks = db.prepare(`DELETE FROM translation_links WHERE book_id = ? AND chapter = ? AND verse = ? AND lang LIKE '%auto%'`);
  for (const m of savedMoves) { delMachine.run(...m.to); delAutoLinks.run(...m.to); }
  const land = db.prepare(`UPDATE translations SET chapter = ?, verse = ? WHERE book_id = ? AND chapter = ? AND verse = ?`);
  savedMoves.forEach((m, i) => land.run(m.to[1], m.to[2], m.from[0], m.from[1], -1000 - i));
  const hist = db.prepare(`UPDATE translation_history SET chapter = ?, verse = ? WHERE id = ?`);
  for (const h of histMoves) hist.run(h.to[1], h.to[2], h.id);
  const link = db.prepare(`UPDATE translation_links SET chapter = ?, verse = ? WHERE id = ?`);
  for (const l of linkMoves) link.run(l.to[1], l.to[2], l.id);
  // 2. headings
  const head = db.prepare(`UPDATE headings SET chapter = ?, verse = ? WHERE id = ?`);
  for (const h of headMoves) head.run(h.to[1], h.to[2], h.id);
  // 3. machine rows under numbers the site no longer shows
  for (const r of orphanMachine) { delAutoLinks.run(r.b, r.c, r.v); delMachine.run(r.b, r.c, r.v); }
  db.prepare(`INSERT INTO site_key_migrations (name, applied_at) VALUES (?, datetime('now'))`).run(NAME);
})();
console.log('✓ applied. Next: node render-all.mjs (full), restart, Rebake.');
