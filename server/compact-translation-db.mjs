#!/usr/bin/env node
/**
 * compact-translation-db.mjs — shrink translation.db for production.
 *
 * translation_history was meant to hold Translation Studio saves (a row per
 * overwrite of a hand-edited verse). Whole-corpus script passes (fix-name-forms
 * above all) also wrote a row for every seeded verse they touched — ~282k rows,
 * 223 MB, on a database whose real content is ~40 MB (2026-09-11: 377 MB file).
 * Those rows are never shown anywhere useful: the Studio's History button lists
 * them for verses nobody ever edited, and the reader never reads history.
 *
 * A history row is SCRIPT-WRITTEN when it snapshots a seeded row: status 'none'
 * AND rich_text '' (only the Studio writes rich_text). Everything else — every
 * real Studio save — is kept.
 *
 *   node compact-translation-db.mjs [--db=/path/translation.db]       report
 *   node compact-translation-db.mjs --apply                            backup, delete, VACUUM
 * Stop the local server first (VACUUM wants the file to itself). On prod run it
 * in the container: docker run --rm -v /mnt/paleo-data:/data paleo-studio node compact-translation-db.mjs --db=/data/translation.db --apply
 */
import Database from 'better-sqlite3';
import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { backupDb } = createRequire(import.meta.url)('./db-backup.cjs');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(k + '=')); return a ? a.slice(k.length + 1) : d; };
const APPLY = args.includes('--apply');
const DB = opt('--db', path.join(HERE, 'translation.db'));
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';

const db = new Database(DB, { readonly: !APPLY });
db.pragma('busy_timeout = 30000');
const SCRIPT_ROWS = `FROM translation_history WHERE status = 'none' AND COALESCE(rich_text, '') = ''`;
const total = db.prepare(`SELECT COUNT(*) n FROM translation_history`).get().n;
const junk = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(LENGTH(text)), 0) bytes ${SCRIPT_ROWS}`).get();
const keep = total - junk.n;
const verses = db.prepare(`SELECT COUNT(DISTINCT book_id || ':' || chapter || ':' || verse) n FROM translation_history WHERE NOT (status = 'none' AND COALESCE(rich_text, '') = '')`).get().n;
console.log(`${DB}: ${mb(statSync(DB).size)}`);
console.log(`translation_history: ${total.toLocaleString()} rows — ${junk.n.toLocaleString()} script-written (${mb(junk.bytes)} of text), ${keep.toLocaleString()} real Studio saves across ${verses} verses (kept)`);
if (!APPLY) { console.log('\n[report only] add --apply to delete the script-written rows and VACUUM.'); db.close(); process.exit(0); }

db.close();
backupDb(DB, 'pre-compact');
const w = new Database(DB);
w.pragma('busy_timeout = 30000');
const del = w.prepare(`DELETE ${SCRIPT_ROWS}`).run();
console.log(`deleted ${del.changes.toLocaleString()} history rows`);
w.pragma('wal_checkpoint(TRUNCATE)');
w.exec('VACUUM');
console.log(`integrity: ${w.pragma('integrity_check', { simple: true })}`);
w.close();
console.log(`${DB}: now ${mb(statSync(DB).size)}`);
