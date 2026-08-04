#!/usr/bin/env node
// apply-kjv-patch.mjs — backfill the exact gaps find-nt-gaps.mjs identified,
// using kjv-patch.json's hand-verified KJV wording. WEB stays the base text
// everywhere else; this only touches the 7 rows in that file.
//
// Safety:
//   - UPDATE only fires if the existing row's text is empty/blank. A row that
//     already has real WEB content is never touched, patch file or not.
//   - INSERT (for rows WEB has no verse at all, e.g. Romans 16:26-27) clones
//     an adjacent ENG row in the same chapter for its column shape, so this
//     never has to guess the verses table's schema.
//   - Provenance is recorded in a new kjv_patch_notes table (canon_id,
//     chapter, verse, source, note) rather than silently passing patched text
//     off as WEB's own wording. The reader can read this table later to badge
//     these verses if wanted; nothing renders differently until that's wired up.
//
// Usage:
//   node apply-kjv-patch.mjs            preview only, writes nothing
//   node apply-kjv-patch.mjs --apply    write it

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');

const { patches } = JSON.parse(fs.readFileSync(path.join(__dirname, 'kjv-patch.json'), 'utf8'));

const db = new Database(path.join(__dirname, 'corpus.db'), { readonly: !APPLY });

const findRow = db.prepare(`
    SELECT * FROM verses WHERE corpus='ENG' AND canon_id=? AND ord_c=? AND ord_v=?
`);
const findNeighbor = db.prepare(`
    SELECT * FROM verses WHERE corpus='ENG' AND canon_id=? AND ord_c=?
    ORDER BY ABS(ord_v - ?) LIMIT 1
`);
const cols = db.prepare(`PRAGMA table_info(verses)`).all().map(c => c.name);

let toUpdate = 0, toInsert = 0, skippedHasText = 0;
const plan = [];

for (const p of patches) {
    const row = findRow.get(p.canon_id, p.chapter, p.verse);
    if (row) {
        if (row.text && row.text.trim()) {
            skippedHasText++;
            plan.push({ action: 'SKIP (already has text)', ref: `${p.code} ${p.chapter}:${p.verse}`, existing: row.text.slice(0, 60) });
            continue;
        }
        toUpdate++;
        plan.push({ action: 'UPDATE', ref: `${p.code} ${p.chapter}:${p.verse}`, id: row.id, text: p.text });
    } else {
        const neighbor = findNeighbor.get(p.canon_id, p.chapter, p.verse);
        if (!neighbor) {
            plan.push({ action: 'CANNOT INSERT (no neighbor row to clone shape from)', ref: `${p.code} ${p.chapter}:${p.verse}` });
            continue;
        }
        toInsert++;
        plan.push({ action: 'INSERT', ref: `${p.code} ${p.chapter}:${p.verse}`, clonedFrom: neighbor.id, text: p.text });
    }
}

console.log(`${APPLY ? 'APPLYING' : '[dry-run] would apply'}: ${toUpdate} update(s), ${toInsert} insert(s), ${skippedHasText} skipped (already has text)`);
console.log('');
for (const s of plan) console.log(`  ${s.action.padEnd(38)} ${s.ref}${s.text ? '  -> "' + s.text.slice(0, 70) + '..."' : ''}`);

if (!APPLY) {
    console.log('\nNo changes written. Re-run with --apply to write them.');
    db.close();
    process.exit(0);
}

db.exec(`CREATE TABLE IF NOT EXISTS kjv_patch_notes (
    canon_id INTEGER, chapter INTEGER, verse INTEGER,
    source TEXT, note TEXT, applied_at TEXT,
    PRIMARY KEY (canon_id, chapter, verse)
)`);

const updStmt = db.prepare(`UPDATE verses SET text=? WHERE id=?`);
const noteStmt = db.prepare(`
    INSERT OR REPLACE INTO kjv_patch_notes (canon_id, chapter, verse, source, note, applied_at)
    VALUES (?, ?, ?, 'KJV', ?, datetime('now'))
`);

const otherCols = cols.filter(c => !['id', 'ord_v', 'text'].includes(c));
const insStmt = db.prepare(`
    INSERT INTO verses (${otherCols.join(', ')}, ord_v, text)
    VALUES (${otherCols.map(c => '@' + c).join(', ')}, @ord_v, @text)
`);

const run = db.transaction(() => {
    for (const p of patches) {
        const row = findRow.get(p.canon_id, p.chapter, p.verse);
        if (row) {
            if (row.text && row.text.trim()) continue;
            updStmt.run(p.text, row.id);
        } else {
            const neighbor = findNeighbor.get(p.canon_id, p.chapter, p.verse);
            if (!neighbor) continue;
            const vals = {};
            for (const c of otherCols) vals[c] = neighbor[c];
            vals.ord_v = p.verse;
            vals.text = p.text;
            insStmt.run(vals);
        }
        noteStmt.run(p.canon_id, p.chapter, p.verse, p.note);
    }
});
run();

console.log('\nDone. Restart the server to serve the patched text.');
db.close();
