// How many verses in translation_links have duplicate/overlapping entries for
// the SAME token_ordinal (the bug behind Matthew 1:6's garbled "dawad (of)"
// output)? Report only.
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tdb = new Database(path.join(__dirname, 'translation.db'), { readonly: true });

const rows = tdb.prepare(`SELECT book_id, chapter, verse, english_indices, token_ordinals FROM translation_links`).all();
console.log(`total translation_links rows: ${rows.length}`);

const byVerse = new Map();
for (const r of rows) {
    let ords = [];
    try { ords = JSON.parse(r.token_ordinals || '[]'); } catch { continue; }
    const key = `${r.book_id}|${r.chapter}|${r.verse}`;
    if (!byVerse.has(key)) byVerse.set(key, []);
    byVerse.get(key).push({ ords, eng: r.english_indices });
}

let dupVerses = 0, dupRows = 0;
const examples = [];
for (const [key, entries] of byVerse) {
    const ordCount = new Map();
    for (const e of entries) for (const o of e.ords) ordCount.set(o, (ordCount.get(o) || 0) + 1);
    const dupped = [...ordCount.entries()].filter(([, n]) => n > 1);
    if (dupped.length) {
        dupVerses++;
        dupRows += dupped.reduce((s, [, n]) => s + n, 0);
        if (examples.length < 10) examples.push({ key, dupped, entries });
    }
}
console.log(`verses with a token_ordinal appearing in 2+ link rows: ${dupVerses} (of ${byVerse.size} verses total with any links)`);
console.log(`\nfirst 10 examples:`);
for (const ex of examples) {
    console.log(`\n${ex.key}  duplicated ordinals: ${ex.dupped.map(([o, n]) => `${o}(x${n})`).join(', ')}`);
    for (const e of ex.entries) console.log(`    eng=${e.eng}  ord=${JSON.stringify(e.ords)}`);
}
