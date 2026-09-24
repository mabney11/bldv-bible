#!/usr/bin/env node
'use strict';
// Restore English (corpus='ENG') rows for canonical books that have NONE in
// corpus.db, copying them from a backup copy of corpus.db. Written 2026-09-24
// after load-english-baseline.js, fed an OT-only english-baseline.jsonl, wiped the
// NT's English (canon 40-66) and Rebake pushed it to prod.
//
//   node restore-eng-from-backup.js [backup.db] [--apply]
//     backup.db  default: corpus.db.bak-uvf (2026-09-21, has all 66 books)
//     --apply    actually write; without it this is a dry run (prints what it would do)
//
// Only ADDS rows, only for a canon_id with zero ENG rows now — never overwrites a
// book that still has its English. Stop the server first (Windows keeps the file
// locked). Then Rebake pushes the repaired corpus.db to prod.
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const backup = path.resolve(args.find(a => !a.startsWith('--')) || path.join(__dirname, 'corpus.db.bak-uvf'));
const live = path.join(__dirname, 'corpus.db');
if (!fs.existsSync(backup)) { console.error(`✗ backup not found: ${backup}`); process.exit(1); }

const db = new Database(live, apply ? {} : { readonly: true });
db.exec(`ATTACH DATABASE '${backup.replace(/'/g, "''")}' AS bak`);
const now = new Map(db.prepare(`SELECT canon_id, COUNT(*) n FROM main.verses WHERE corpus='ENG' AND canon_id IS NOT NULL GROUP BY canon_id`).all().map(r => [r.canon_id, r.n]));
const had = db.prepare(`SELECT canon_id, code, COUNT(*) n FROM bak.verses WHERE corpus='ENG' AND canon_id IS NOT NULL GROUP BY canon_id, code ORDER BY canon_id`).all();
const todo = had.filter(r => !now.has(r.canon_id));
if (!todo.length) { console.log('✓ every book the backup has English for still has it — nothing to restore'); process.exit(0); }
console.log(`${todo.length} book(s) have English in the backup but none now:`);
for (const r of todo) console.log(`  canon ${r.canon_id} ${r.code}: ${r.n} verses`);
if (!apply) { console.log('\n(dry run — re-run with --apply to restore)'); process.exit(0); }

const cols = db.prepare(`PRAGMA main.table_info(verses)`).all().map(c => c.name).filter(c => c !== 'rowid');
const list = cols.map(c => `"${c}"`).join(',');
const ins = db.prepare(`INSERT INTO main.verses (${list}) SELECT ${list} FROM bak.verses WHERE corpus='ENG' AND canon_id=?`);
const total = db.transaction(() => todo.reduce((a, r) => a + ins.run(r.canon_id).changes, 0))();
console.log(`✓ restored ${total} ENG verses into corpus.db`);
