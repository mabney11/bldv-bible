// fix-duplicate-links2.mjs — corrected version of fix-duplicate-links.mjs.
// BUG in the first version: selected `rowid` but translation_links' primary
// key column is declared `id` (an INTEGER PRIMARY KEY, which SQLite aliases
// to rowid internally, but reports back under its declared name "id" in the
// result set) — so `e.rowid` was `undefined` in JS, and every
// `DELETE ... WHERE rowid = ?` bound NULL and silently matched nothing. No
// error was thrown, so the script's own "cleared 81 rows" message was false.
// Confirmed via diag-verify-links-cleared.mjs: all 12 original rows for
// Matthew 1:6 were still present after the "successful" run. This version
// uses `id` explicitly, verified against the table's real schema first.
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APPLY = process.argv.includes('--apply');
const tdb = new Database(path.join(__dirname, 'translation.db'), { readonly: !APPLY });

const cols = tdb.prepare(`PRAGMA table_info(translation_links)`).all().map(c => c.name);
console.log('translation_links columns:', cols.join(', '));
const pkCol = cols.includes('id') ? 'id' : (cols.includes('rowid') ? 'rowid' : null);
if (!pkCol) { console.error('no id/rowid column found — aborting'); tdb.close(); process.exit(1); }
console.log('using primary key column:', pkCol);

const rows = tdb.prepare(`SELECT ${pkCol} AS pk, book_id, chapter, verse, token_ordinals FROM translation_links`).all();
const byVerse = new Map();
for (const r of rows) {
    let ords = [];
    try { ords = JSON.parse(r.token_ordinals || '[]'); } catch { continue; }
    const key = `${r.book_id}|${r.chapter}|${r.verse}`;
    if (!byVerse.has(key)) byVerse.set(key, []);
    byVerse.get(key).push({ ...r, ords });
}

const affected = [];
for (const [key, entries] of byVerse) {
    const ordCount = new Map();
    for (const e of entries) for (const o of e.ords) ordCount.set(o, (ordCount.get(o) || 0) + 1);
    if ([...ordCount.values()].some(n => n > 1)) affected.push({ key, entries });
}

console.log(`\nVerses with duplicate/overlapping links: ${affected.length}`);
for (const a of affected) console.log(`  ${a.key}  (${a.entries.length} link rows, pks: ${a.entries.map(e => e.pk).join(',')})`);

if (!APPLY) {
    console.log('\n[report only] nothing written. Re-run with --apply to clear these rows.');
    tdb.close();
    process.exit(0);
}

const del = tdb.prepare(`DELETE FROM translation_links WHERE ${pkCol} = ?`);
let n = 0, failed = 0;
tdb.transaction(() => {
    for (const a of affected) for (const e of a.entries) {
        const info = del.run(e.pk);
        if (info.changes === 1) n++; else failed++;
    }
})();
console.log(`\n✓ actually deleted ${n} link rows (verified via .changes). Failed to match: ${failed}.`);
if (failed) console.error('⚠ some deletes did not match a row — investigate before trusting this run.');
console.log('Next: node render-corpus.mjs --from-src --apply, then node reseed-translations.mjs, then restart the server.');
tdb.close();
