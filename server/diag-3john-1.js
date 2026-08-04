'use strict';
// One-off diagnostic: why does 3 John 1 (canon_id 64, HEB source) render
// without proper prefix/suffix component splitting?
//
// Checks, in order:
//   1. Is 3 John 1 actually baked into surface-index.db under source='HEB'?
//      (A 0-row answer means the FAST PATH never sees it — server.js falls
//      back to live-parsing raw tokens_nt, which build-nt-tokens.mjs writes
//      with NO morph at all, so no prefix/suffix split is even possible.)
//   2. If baked, what do the actual token_surfaces.components_json arrays
//      look like for this chapter's words? (Are they really flat, or does
//      the bake have real prefix/root/suffix pieces that something else
//      is failing to render?)
//   3. Does tokens_nt (corpus.db) have morph populated for this chapter?
//      (Blank across the board means it's still build-nt-tokens.mjs's
//      output, never re-projected by sync-heb-tokens.mjs --apply.)
//   4. Is there a tokens_nt_pre_sync_* backup table lying around, proving
//      sync-heb-tokens.mjs WAS run at some point?
//
// Run: node diag-3john-1.js   (writes diag-3john-1-out.txt, UTF-8)

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const src  = new Database(path.join(__dirname, 'corpus.db'), { readonly: true });
const surf = new Database(path.join(__dirname, 'surface-index.db'), { readonly: true });

const CANON = 64, CHAPTER = 1;

let out = '';
const log = (s) => { out += s + '\n'; };

log(`=== 1. surface_occurrences for book_id=${CANON} chapter=${CHAPTER} source='HEB' ===`);
let occ = [];
try {
    occ = surf.prepare(
        `SELECT verse, token_ordinal, word_raw, strongs, pos, morph
         FROM surface_occurrences
         WHERE source='HEB' AND book_id=? AND chapter=?
         ORDER BY verse, token_ordinal`
    ).all(CANON, CHAPTER);
    log(`row count: ${occ.length}`);
} catch (e) {
    log(`query failed: ${e.message} (does surface_occurrences even have a 'source' column?)`);
}

if (!occ.length) {
    log('');
    log('*** ZERO ROWS. This chapter is NOT baked under source=HEB. ***');
    log('The fast path (surfRowsFor) will return [] and server.js falls back to');
    log('live-parsing tokenQueryFor(64, "HEB") -> tokens_nt, which has no morph.');
} else {
    log('');
    log('=== 2. Components for each occurrence (from token_surfaces) ===');
    for (const o of occ) {
        log(`v${o.verse} ord${o.token_ordinal}: word_raw="${o.word_raw}" sn=${o.strongs} pos=${o.pos} morph=${o.morph}`);
        let ts = null;
        try {
            ts = surf.prepare(
                `SELECT * FROM token_surfaces WHERE word_raw=? AND strongs=? AND pos=? AND morph=? AND source='HEB'`
            ).get(o.word_raw, o.strongs, o.pos, o.morph);
        } catch (e) { /* older schema without source col on token_surfaces? try without */ }
        if (!ts) {
            try {
                ts = surf.prepare(
                    `SELECT * FROM token_surfaces WHERE word_raw=? AND strongs=?`
                ).get(o.word_raw, o.strongs);
            } catch (e) { /* ignore */ }
        }
        if (ts) {
            log(`   tier=${ts.tier} ambiguous=${ts.ambiguous} count=${ts.count}`);
            try {
                const comps = JSON.parse(ts.components);
                comps.forEach((c, i) => {
                    log(`   comp[${i}]: paleo="${c.paleo}" css=${c.css} translit="${c.translit || ''}" translation="${c.translation || ''}"${c.demoted ? ' (demoted)' : ''}${c.unresolved ? ' (unresolved)' : ''}`);
                });
            } catch (e) {
                log(`   components (raw): ${ts.components}`);
            }
        } else {
            log('   (no matching token_surfaces row — LEFT JOIN would serve this as components:null)');
        }
    }
}

log('');
log(`=== 3. tokens_nt for book_id=${CANON} chapter=${CHAPTER} (corpus.db) ===`);
try {
    const ntRows = src.prepare(
        `SELECT token_ordinal, word_raw, pos, morph, strongs, source_id
         FROM tokens_nt WHERE book_id=? AND chapter=? ORDER BY verse, token_ordinal LIMIT 20`
    ).all(CANON, CHAPTER);
    log(`sample rows (first 20): ${ntRows.length}`);
    for (const r of ntRows) {
        log(`   ord${r.token_ordinal} word_raw="${r.word_raw}" pos="${r.pos}" morph="${r.morph}" sn="${r.strongs}" source_id="${r.source_id}"`);
    }
    const morphCount = src.prepare(
        `SELECT COUNT(*) n FROM tokens_nt WHERE book_id=? AND chapter=? AND morph IS NOT NULL AND morph != ''`
    ).get(CANON, CHAPTER).n;
    const total = src.prepare(
        `SELECT COUNT(*) n FROM tokens_nt WHERE book_id=? AND chapter=?`
    ).get(CANON, CHAPTER).n;
    log(`   rows with non-empty morph: ${morphCount} / ${total}`);
} catch (e) {
    log(`tokens_nt query failed: ${e.message}`);
}

log('');
log('=== 4. Backup tables from a past sync-heb-tokens.mjs --apply run? ===');
try {
    const tables = src.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'tokens_nt_pre_sync%'`
    ).all();
    if (tables.length) tables.forEach(t => log(`   found: ${t.name}`));
    else log('   none found — sync-heb-tokens.mjs --apply has never been run (or the backup was deleted).');
} catch (e) {
    log(`   query failed: ${e.message}`);
}

fs.writeFileSync(path.join(__dirname, 'diag-3john-1-out.txt'), out, 'utf8');
console.log('Wrote diag-3john-1-out.txt (' + out.length + ' bytes)');
