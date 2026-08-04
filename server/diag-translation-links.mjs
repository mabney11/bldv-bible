// Diagnostic: does translation_links (translation.db) hold a pre-computed
// link for "Salmon" and/or "father" in Matthew 1:4-7, and what transliteration
// does applyLinks actually read for it (straight from the baked
// token_surfaces.components, NOT translit(ROOTS[sn]))? This is step 1b in
// render-corpus.mjs — it runs BEFORE names/terms/verse-gloss and its output is
// guarded as untouchable, so if it holds a stale/wrong link, nothing else in
// the pipeline can ever correct it.
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const tdb = new Database(path.join(__dirname, 'translation.db'), { readonly: true });
const rows = tdb.prepare(`
    SELECT book_id, chapter, verse, english_indices, token_ordinals
    FROM translation_links
    WHERE book_id=40 AND chapter=1 AND verse IN (4,5,6,7)
    ORDER BY verse
`).all();
console.log(`translation_links rows for Matthew 1:4-7: ${rows.length}`);
for (const r of rows) {
    console.log(`\nverse ${r.verse}: english_indices=${r.english_indices}  token_ordinals=${r.token_ordinals}`);
}

// Cross-reference: for each linked token_ordinal, show the surface-index.db
// occurrence + its baked component translit (what applyLinks actually reads)
// vs. what translit(ROOTS[sn]) would produce (the bare-root formula everything
// else now uses).
const idx = new Database(path.join(__dirname, 'surface-index.db'), { readonly: true });
import { readFileSync } from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOTS = JSON.parse(readFileSync(path.join(__dirname, 'strongs-roots.json'), 'utf8'));
const { translit } = require(path.resolve(__dirname, '../src/lib/books.js'));

for (const r of rows) {
    let ords = [];
    try { ords = JSON.parse(r.token_ordinals || '[]'); } catch {}
    for (const ord of ords) {
        const occ = idx.prepare(`
            SELECT o.word_raw, o.strongs, o.pos, o.morph, t.components
            FROM surface_occurrences o
            JOIN token_surfaces t ON t.word_raw=o.word_raw AND t.source=o.source
                 AND t.strongs=o.strongs AND t.pos=o.pos AND t.morph=o.morph
            WHERE o.source='HEB' AND o.book_id=40 AND o.chapter=1 AND o.verse=? AND o.token_ordinal=?
        `).get(r.verse, ord);
        if (!occ) { console.log(`  verse ${r.verse} ord ${ord}: no occurrence/token_surfaces match found`); continue; }
        let comps = [];
        try { comps = JSON.parse(occ.components); } catch {}
        const rootComp = comps.find(c => c.css === 'root') || comps.find(c => c.translit);
        const bakedTr = rootComp && String(rootComp.translit || '').trim();
        const sn = occ.strongs ? 'H' + String(occ.strongs).replace(/^H+/i, '') : null;
        const bareRoot = sn && ROOTS[sn] ? translit(ROOTS[sn]) : '(no root)';
        console.log(`  verse ${r.verse} ord ${ord}: sn=${occ.strongs} pos=${occ.pos}  baked-component-tr="${bakedTr}"  bare-root-tr="${bareRoot}"`);
    }
}
