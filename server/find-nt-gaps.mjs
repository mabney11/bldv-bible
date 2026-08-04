#!/usr/bin/env node
// find-nt-gaps.mjs — systematic scan for the Romans-16:25 pattern: an English
// (corpus='ENG') NT verse with empty/blank text where the Greek NT (corpus='GNT')
// has real content for the SAME reference. That combination means the gap is a
// genuine WEB editorial omission/relocation, not a verse that simply doesn't
// exist in this corpus's versification.
//
// This does NOT decide how to fix anything — it only reports. Read the output,
// then hand the reference list to whatever patches the gaps (kjv-patch.json +
// apply-kjv-patch.mjs).
//
// Usage: node find-nt-gaps.mjs [--out find-nt-gaps-out.txt]

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const val = (f, d = null) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const OUT = val('--out', 'find-nt-gaps-out.txt');

const db = new Database(path.join(__dirname, 'corpus.db'), { readonly: true });

const lines = [];
const say = m => { lines.push(m); console.log(m); };

// Every ENG verse in the NT range (canon 40-66) that is empty or whitespace-only.
const engEmpty = db.prepare(`
    SELECT canon_id, code, ord_c AS chapter, ord_v AS verse
    FROM verses
    WHERE corpus = 'ENG' AND canon_id BETWEEN 40 AND 66
      AND (text IS NULL OR TRIM(text) = '')
    ORDER BY canon_id, ord_c, ord_v
`).all();

say(`ENG NT verses with empty text: ${engEmpty.length}`);
say('');

const gntHas = db.prepare(`
    SELECT text FROM verses
    WHERE corpus = 'GNT' AND canon_id = ? AND ord_c = ? AND ord_v = ?
`);

const gaps = [];
for (const r of engEmpty) {
    const g = gntHas.get(r.canon_id, r.chapter, r.verse);
    if (g && g.text && g.text.trim()) {
        gaps.push({ ...r, gnt_preview: g.text.trim().slice(0, 80) });
    }
}

say(`=== GENUINE GAPS (ENG empty, GNT has content) — ${gaps.length} ===`);
say('These are the only candidates for a KJV patch. Every other empty ENG row');
say('either has no GNT counterpart either (verse legitimately absent from this');
say('versification) or is empty in both, so there is nothing to patch it with.');
say('');
for (const g of gaps) {
    say(`${g.code} ${g.chapter}:${g.verse}  (canon_id=${g.canon_id})`);
    say(`  GNT: ${g.gnt_preview}${g.gnt_preview.length >= 80 ? '…' : ''}`);
}

say('');
say(`=== ENG-empty rows with NO GNT counterpart (${engEmpty.length - gaps.length}) ===`);
say('Not gaps — nothing to compare against, so not flagged for patching.');
for (const r of engEmpty) {
    if (!gaps.find(g => g.canon_id === r.canon_id && g.chapter === r.chapter && g.verse === r.verse)) {
        say(`  ${r.code} ${r.chapter}:${r.verse}`);
    }
}

fs.writeFileSync(path.join(__dirname, OUT), lines.join('\n') + '\n', 'utf8');
console.log(`\nwrote ${OUT}`);
db.close();
