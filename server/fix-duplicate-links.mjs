// fix-duplicate-links.mjs
// Clears translation_links rows for the 6 verses found (2026-07-27) to have
// duplicate/overlapping token_ordinal entries from multiple past linking
// passes that were never cleaned up (see diag-duplicate-links.mjs). Without
// clean links, applyLinks (render-corpus.mjs step 1b) simply skips these
// verses; the verse-gloss pass (step 5b) still glosses them correctly using
// the same bare-root formula, just without the Hebrew-driven word ordering/
// authoritative positioning applyLinks would otherwise provide. Small,
// contained, low-risk: only 6 of 6,668 linked verses affected.
//
//   node fix-duplicate-links.mjs             report only, writes nothing
//   node fix-duplicate-links.mjs --apply     delete the affected rows
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APPLY = process.argv.includes('--apply');
const tdb = new Database(path.join(__dirname, 'translation.db'), { readonly: !APPLY });

const rows = tdb.prepare(`SELECT rowid, book_id, chapter, verse, token_ordinals FROM translation_links`).all();
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

console.log(`Verses with duplicate/overlapping links: ${affected.length}`);
for (const a of affected) {
    const [book_id, chapter, verse] = a.key.split('|').map(Number);
    console.log(`  book_id=${book_id} ${chapter}:${verse}  (${a.entries.length} link rows to clear)`);
}

if (!APPLY) {
    console.log('\n[report only] nothing written. Re-run with --apply to clear these rows.');
    tdb.close();
    process.exit(0);
}

const del = tdb.prepare(`DELETE FROM translation_links WHERE rowid = ?`);
let n = 0;
tdb.transaction(() => {
    for (const a of affected) for (const e of a.entries) { del.run(e.rowid); n++; }
})();
console.log(`\n✓ cleared ${n} link rows across ${affected.length} verses.`);
console.log('Next: node render-corpus.mjs --from-src --apply   (recompute these verses without the bad links)');
console.log('Then: node reseed-translations.mjs, restart the server.');
tdb.close();
