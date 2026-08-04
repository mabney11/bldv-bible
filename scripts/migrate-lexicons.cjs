#!/usr/bin/env node
/**
 * scripts/migrate-lexicons.cjs
 *
 * Convert greek-lexicon.json / geez-lexicon.json from the legacy nested
 * shape:
 *
 *   { "_doc": [...], "entries": { "<word>": { "gloss": "...", "root": "...", "pos": "...", "notes": "..." } } }
 *
 * to the flat shape that matches Hebrew's lexicon.json:
 *
 *   { "<word>": "<gloss>", ... }
 *
 * The fields `root`, `pos`, and `notes` are dropped — heuristic root comes
 * from the DB (surface_counts.word_root, populated by tokenize-multilang.cjs)
 * and POS isn't surfaced in the UI any more. Only `gloss` survives.
 *
 * Idempotent: a file already in the flat shape is left unchanged (just
 * resorted alphabetically for stable diffs). The migration writes through a
 * temp file and rename so a crashed run can't corrupt anything.
 *
 *   node scripts/migrate-lexicons.cjs
 *   node scripts/migrate-lexicons.cjs path/to/some-lexicon.json
 */
'use strict';
const fs   = require('fs');
const path = require('path');

function migrate(file) {
    if (!fs.existsSync(file)) { console.log(`  skipping ${file} — not found`); return; }
    let raw;
    try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { console.error(`  ${file}: parse failed — ${e.message}`); return; }

    const out = {};
    const src = (raw && raw.entries && typeof raw.entries === 'object') ? raw.entries : raw;
    for (const [k, v] of Object.entries(src || {})) {
        if (k.startsWith('_') || k === 'entries') continue;
        if (typeof v === 'string')                 out[k] = v;
        else if (v && typeof v.gloss === 'string') out[k] = v.gloss;
    }

    // Sort alphabetically for stable diffs
    const ordered = {};
    for (const k of Object.keys(out).sort()) ordered[k] = out[k];

    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(ordered, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, file);
    console.log(`  ${file}: ${Object.keys(out).length} entries kept (gloss-only).`);
}

const args = process.argv.slice(2);
const defaults = [
    path.join(__dirname, '..', 'server', 'lexicon', 'greek-lexicon.json'),
    path.join(__dirname, '..', 'server', 'lexicon', 'geez-lexicon.json'),
];
const targets = args.length ? args : defaults;

console.log('Migrating lexicons to flat {word: "gloss"} format…');
for (const t of targets) migrate(t);
console.log('Done.');
