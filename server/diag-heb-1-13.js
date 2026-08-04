'use strict';
// One-off diagnostic: dump the exact raw letters and resolved components for
// Hebrews 1:13 (canon_id 58), so we stop guessing from mangled console output
// (Windows can't render paleo) and mis-transliterated syllable labels.
// Run: node diag-heb-1-13.js   (writes diag-heb-1-13-out.txt, UTF-8)
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { toPaleo, splitWords } = require('./heb-align.js');

const src = new Database(path.join(__dirname, 'corpus.db'), { readonly: true });
const surf = new Database(path.join(__dirname, 'surface-index.db'), { readonly: true });

let out = '';
const log = (s) => { out += s + '\n'; };

const CANON = 58, CHAPTER = 1, VERSE = 13;

const row = src.prepare(
    `SELECT text, text_paleo FROM verses WHERE corpus='HEB' AND canon_id=? AND ord_c=? AND ord_v=?`
).get(CANON, CHAPTER, VERSE);

if (!row) {
    log(`No verse row found for canon_id=${CANON} chapter=${CHAPTER} verse=${VERSE}`);
} else {
    log('=== RAW VERSE TEXT (as stored) ===');
    log(row.text || '(null text)');
    log('');
    log('=== text_paleo column ===');
    log(row.text_paleo || '(none — deriving from text)');
    log('');
    const words = (row.text_paleo ? splitWords(row.text_paleo) : []).length
        ? splitWords(row.text_paleo)
        : splitWords(row.text);
    log('=== SPLIT WORDS (index: raw paleo, codepoint-by-codepoint) ===');
    words.forEach((w, i) => {
        const cps = [...w].map(ch => `U+${ch.codePointAt(0).toString(16).toUpperCase()}`).join(' ');
        log(`${i}: ${w}   [${cps}]`);
    });
}

log('');
log('=== surface_occurrences for book_id=58 chapter=1 verse=13 (source=HEB) ===');
let occ = [];
try {
    occ = surf.prepare(
        `SELECT token_ordinal, word_raw, strongs, pos, morph
         FROM surface_occurrences
         WHERE source='HEB' AND book_id=? AND chapter=? AND verse=?
         ORDER BY token_ordinal`
    ).all(CANON, CHAPTER, VERSE);
} catch (e) {
    log(`query failed: ${e.message}`);
}
for (const o of occ) {
    log(`ord ${o.token_ordinal}: word_raw="${o.word_raw}" sn=${o.strongs} pos=${o.pos} morph=${o.morph}`);
    const cps = [...(o.word_raw || '')].map(ch => `U+${ch.codePointAt(0).toString(16).toUpperCase()}`).join(' ');
    log(`   codepoints: [${cps}]`);
    let ts = null;
    try {
        ts = surf.prepare(
            `SELECT * FROM token_surfaces WHERE word_raw=? AND strongs=?`
        ).get(o.word_raw, o.strongs);
    } catch (e) { /* ignore */ }
    if (ts) {
        log(`   tier=${ts.tier} ambiguous=${ts.ambiguous} count=${ts.count}`);
        log(`   root_paleo: ${ts.root_paleo}   rendered_paleo: ${ts.rendered_paleo}`);
        try {
            const comps = JSON.parse(ts.components);
            comps.forEach((c, i) => {
                log(`   comp[${i}]: paleo="${c.paleo}" css=${c.css} translit="${c.translit || ''}" translation="${c.translation || ''}" ${c.derived ? '(derived, unattested)' : ''}${c.reconstructed ? '(reconstructed, attested)' : ''}`);
            });
        } catch (e) {
            log(`   components (raw): ${ts.components}`);
        }
    } else {
        log('   (no matching token_surfaces row)');
    }
    // ALSO show every OTHER (strongs,pos,morph) reading this exact word_raw
    // has anywhere in the index — this is the full candidate set resolve()
    // was choosing among, not just whichever one this occurrence points to.
    let alts = [];
    try {
        alts = surf.prepare(
            `SELECT strongs, pos, morph, tier, ambiguous, count, root_paleo FROM token_surfaces WHERE word_raw=?`
        ).all(o.word_raw);
    } catch (e) { /* ignore */ }
    log(`   -- all readings on record for this exact word_raw (${alts.length}) --`);
    for (const a of alts) {
        log(`      sn=${a.strongs} tier=${a.tier} ambiguous=${a.ambiguous} count=${a.count} root_paleo=${a.root_paleo} pos=${a.pos}`);
    }
}

fs.writeFileSync(path.join(__dirname, 'diag-heb-1-13-out.txt'), out, 'utf8');
console.log('Wrote diag-heb-1-13-out.txt (' + out.length + ' bytes)');
