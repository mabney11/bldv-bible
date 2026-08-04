#!/usr/bin/env node
/**
 * diagnose-surface-render.cjs   —  READ ONLY.  Opens nothing for writing.
 *
 * Confirms WHY a token renders with the wrong final letter (e.g. Zech 4:5
 * אֵלַי rendering 𐤀𐤋𐤄 instead of 𐤀𐤋𐤉) and — more importantly — enumerates
 * the ENTIRE corpus-wide class of tokens affected by the same two defects, so
 * you are not chasing one-offs.
 *
 * The two defects this probes (both proven from the code, not guessed):
 *
 *   BUG A — surface-index morph collapse.
 *     build-surface-index.js GROUPs distinct rows by (word_raw,pos,morph,strongs)
 *     but keys surfaceMap by (word_raw,strongs) ONLY, keeping the most-frequent
 *     morph reading and DISCARDING the rest. The reader
 *     (surface_occurrences JOIN token_surfaces ON word_raw AND strongs) then
 *     serves that one winning reading's baked `components` to EVERY occurrence
 *     of that (word_raw,strongs) — including occurrences whose real morph differs.
 *
 *   BUG B — standalone-particle branch swallows affixes.
 *     parseToken/parseHebrewData take the single-blob `isStandalonePos` branch
 *     for pos IN ('conj','prep','art'); that branch ignores prs/pfm/vbs/nme/
 *     vbe/uvf entirely, so a particle carrying a pronominal suffix loses it.
 *     (Only fires when the pos COLUMN holds the short code; this script reports
 *     which encoding your corpus uses, which tells you if Bug B is live.)
 *
 * Usage:
 *   node diagnose-surface-render.cjs
 *   node diagnose-surface-render.cjs --db corpus.db --surf surface-index.db
 *   node diagnose-surface-render.cjs --book 38 --chapter 4 --verse 5     # dump one verse
 *   node diagnose-surface-render.cjs --word 𐤀𐤋𐤉                          # inspect a surface
 */
'use strict';
const path = require('path');
const fs   = require('fs');

// ── driver: better-sqlite3, else node:sqlite (same fallback shape as server.js)
let Database;
try {
    Database = require('better-sqlite3');
} catch {
    const { DatabaseSync } = require('node:sqlite');
    Database = class {
        constructor(f){ this.db = new DatabaseSync(f, { readOnly: true }); }
        prepare(q){ const s = this.db.prepare(q); return { all:(...a)=>s.all(...a), get:(...a)=>s.get(...a) }; }
        pragma(p){ return this.db.prepare('PRAGMA ' + p).all(); }
        close(){ this.db.close?.(); }
    };
}

// ── args
const args = process.argv.slice(2);
const argv = (f, d=null) => { const i = args.indexOf(f); return i >= 0 ? args[i+1] : d; };
const CORPUS = argv('--db',   path.join(process.cwd(), 'corpus.db'));
const SURF   = argv('--surf', path.join(process.cwd(), 'surface-index.db'));
const BOOK   = argv('--book');
const CH     = argv('--chapter');
const VS     = argv('--verse');
const WORD   = argv('--word');

for (const [label, p] of [['corpus.db', CORPUS], ['surface-index.db', SURF]]) {
    if (!fs.existsSync(p)) { console.error(`✗ ${label} not found at: ${p}\n  pass --db / --surf`); process.exit(1); }
}

const src  = new Database(CORPUS, { readonly: true });
const surf = new Database(SURF,   { readonly: true });

const cols = (db, table) => {
    try { return db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name); }
    catch { return []; }
};
const has = (arr, c) => arr.includes(c);
const rule = (s='') => console.log('\n' + '─'.repeat(78) + (s ? '\n' + s : ''));

// ════════════════════════════════════════════════════════════════════════════
rule('SECTION 0 — schema & encoding probe');
const tsCols = cols(surf, 'token_surfaces');
const soCols = cols(surf, 'surface_occurrences');
const tbCols = cols(src,  'tokens_bhs');
console.log('token_surfaces columns   :', tsCols.join(', ') || '(table missing)');
console.log('surface_occurrences cols :', soCols.join(', ') || '(table missing)');
console.log('tokens_bhs columns       :', tbCols.join(', ') || '(table missing)');
const TS_HAS_SN    = has(tsCols, 'strongs');
const TS_HAS_MORPH = has(tsCols, 'morph');
const SO_HAS_MORPH = has(soCols, 'morph');
console.log(`\ntoken_surfaces keyed with strongs : ${TS_HAS_SN}`);
console.log(`token_surfaces stores morph       : ${TS_HAS_MORPH}  (present, but NOT part of the reader join)`);
console.log(`surface_occurrences stores morph  : ${SO_HAS_MORPH}  (needed for the Bug-A fix join)`);

// How is pos stored? Short codes (prep/conj/art) => Bug B is LIVE. Full words => Bug B dormant.
const posSample = src.prepare(`
    SELECT pos, COUNT(*) n FROM tokens_bhs
    WHERE pos IS NOT NULL AND pos!='' GROUP BY pos ORDER BY n DESC LIMIT 25
`).all();
const posSet = new Set(posSample.map(r => r.pos));
const posShort = ['prep','conj','art'].some(p => posSet.has(p));
const posFull  = ['preposition','conjunction','article'].some(p => posSet.has(p));
console.log(`\ntokens_bhs.pos encoding: ${posShort ? 'SHORT codes present (prep/conj/art)' : ''}${posFull ? ' FULL words present (preposition/…)' : ''}`);
console.log(`  → standalone-branch (Bug B) is ${posShort ? 'LIVE for short-code particles' : 'DORMANT (pos is full words; particles take the else/split branch)'}`);
console.log('  pos value distribution (top):');
for (const r of posSample) console.log(`     ${String(r.n).padStart(7)}  ${r.pos}`);

// ════════════════════════════════════════════════════════════════════════════
rule('SECTION 1 — the specific token(s): stored row  vs  the baked row the reader serves');

// Which stored rows to inspect
let tokRows = [];
if (BOOK && CH && VS) {
    tokRows = src.prepare(`
        SELECT book_id, chapter, verse, token_ordinal, word_raw, pos, morph, strongs
        FROM tokens_bhs WHERE book_id=? AND chapter=? AND verse=? ORDER BY token_ordinal
    `).all(+BOOK, +CH, +VS);
} else if (WORD) {
    tokRows = src.prepare(`
        SELECT book_id, chapter, verse, token_ordinal, word_raw, pos, morph, strongs
        FROM tokens_bhs WHERE word_raw=? ORDER BY book_id,chapter,verse,token_ordinal LIMIT 25
    `).all(WORD);
} else {
    // default: the two candidate spellings of "elay"
    tokRows = src.prepare(`
        SELECT book_id, chapter, verse, token_ordinal, word_raw, pos, morph, strongs
        FROM tokens_bhs WHERE word_raw IN ('𐤀𐤋𐤉','𐤀𐤋𐤄')
        ORDER BY word_raw, book_id, chapter, verse LIMIT 30
    `).all();
    console.log('(no --book/--verse/--word given; defaulting to word_raw IN 𐤀𐤋𐤉, 𐤀𐤋𐤄)');
}

const snNorm = s => s ? 'H' + String(s).replace(/^H+/, '') : '';
const bakedFor = (word_raw, strongs) => {
    if (TS_HAS_SN) {
        const r = surf.prepare(`SELECT * FROM token_surfaces WHERE word_raw=? AND strongs=?`).get(word_raw, snNorm(strongs));
        if (r) return r;
    }
    return surf.prepare(`SELECT * FROM token_surfaces WHERE word_raw=? LIMIT 1`).get(word_raw);
};

for (const t of tokRows) {
    const baked = bakedFor(t.word_raw, t.strongs);
    console.log(`\n• ${t.word_raw}  book ${t.book_id} ${t.chapter}:${t.verse} ord ${t.token_ordinal}`);
    console.log(`    tokens_bhs : pos=${t.pos}  strongs=${t.strongs||'—'}`);
    console.log(`               morph=${t.morph||'—'}`);
    if (!baked) { console.log('    surface-index: NO baked row (reader would live-parse — correct render)'); continue; }
    let comps = [];
    try { comps = JSON.parse(baked.components); } catch {}
    const rendered = comps.map(c => c.paleo).join('');
    console.log(`    SERVED baked row (word_raw=${baked.word_raw} strongs=${baked.strongs||'—'} pos=${baked.pos||'—'}):`);
    console.log(`               baked morph = ${baked.morph||'—'}`);
    console.log(`               RENDERED    = ${rendered}   ${rendered !== t.word_raw ? '  ← differs from stored surface' : ''}`);
    console.log(`               components  = ${comps.map(c => (c.paleo||'∅')+':'+c.translation).join('  ·  ')}`);
    const mismatch = baked.morph && t.morph && baked.morph !== t.morph;
    if (mismatch) console.log(`    ⚠ BUG A: this occurrence's morph ≠ the baked winner's morph → it is served the wrong reading.`);
    if (posShort && ['prep','conj','art'].includes(t.pos) && /pronominal_suffix=|prefix|verbal_ending|nominal_ending/.test(t.morph||''))
        console.log(`    ⚠ BUG B: standalone-pos particle carrying an affix → suffix swallowed by the single-blob branch.`);
}

// ════════════════════════════════════════════════════════════════════════════
rule('SECTION 2 — BUG A corpus-wide: (word_raw,strongs) groups with >1 morph reading');
console.log('Every such group bakes only its most-frequent morph; all other readings render wrong.\n');

const classA = src.prepare(`
    SELECT word_raw, strongs,
           COUNT(DISTINCT morph)  AS morph_readings,
           COUNT(*)               AS occurrences
    FROM tokens_bhs
    WHERE word_raw IS NOT NULL AND word_raw!='' AND pos!='punct'
    GROUP BY word_raw, strongs
    HAVING COUNT(DISTINCT morph) > 1
`).all();

const aGroups = classA.length;
const aOccur  = classA.reduce((s, r) => s + r.occurrences, 0);
// "minority" occurrences = those NOT in the winning morph => actually mis-served
let aMinority = 0;
const worst = [];
for (const g of classA) {
    const rows = src.prepare(`
        SELECT morph, COUNT(*) n FROM tokens_bhs
        WHERE word_raw=? AND (strongs IS ? OR strongs=?) GROUP BY morph ORDER BY n DESC
    `).all(g.word_raw, g.strongs, g.strongs);
    const winner = rows[0]?.n || 0;
    const minority = g.occurrences - winner;
    aMinority += minority;
    if (minority > 0) worst.push({ ...g, winner, minority, readings: rows.length });
}
worst.sort((a, b) => b.minority - a.minority);

console.log(`(word_raw,strongs) groups with multiple morph readings : ${aGroups.toLocaleString()}`);
console.log(`total occurrences inside those groups                  : ${aOccur.toLocaleString()}`);
console.log(`occurrences served the WRONG (non-winning) reading     : ${aMinority.toLocaleString()}  ← Bug A blast radius`);
console.log('\nTop 20 by mis-served occurrences:');
console.log('   miss   winner  readings  word_raw   strongs');
for (const w of worst.slice(0, 20))
    console.log(`   ${String(w.minority).padStart(5)}  ${String(w.winner).padStart(6)}  ${String(w.readings).padStart(7)}   ${w.word_raw}   ${w.strongs||'—'}`);

// ════════════════════════════════════════════════════════════════════════════
rule('SECTION 3 — BUG B corpus-wide: standalone-pos particles carrying an affix');
if (!posShort) {
    console.log('pos is stored as full words → the standalone short-code branch never fires →');
    console.log('Bug B is dormant in this corpus. (Nothing to enumerate.)');
} else {
    const affixLike = `(morph LIKE '%pronominal_suffix=%'
                     OR morph LIKE '%prefix%' OR morph LIKE '%verbal_ending%'
                     OR morph LIKE '%nominal_ending%' OR morph LIKE '%unclassified_final=%')`;
    const classB = src.prepare(`
        SELECT pos, COUNT(*) n, COUNT(DISTINCT word_raw) surfaces
        FROM tokens_bhs
        WHERE pos IN ('prep','conj','art')
          AND ${affixLike}
          AND morph NOT LIKE '%unclassified_final=none%'
        GROUP BY pos ORDER BY n DESC
    `).all();
    const bTotal = classB.reduce((s, r) => s + r.n, 0);
    console.log(`standalone-pos tokens that ALSO carry an affix : ${bTotal.toLocaleString()}  ← Bug B blast radius`);
    for (const r of classB) console.log(`   pos=${r.pos.padEnd(5)} tokens=${String(r.n).padStart(6)}  distinct surfaces=${r.surfaces}`);
    console.log('\n  sample (first 15):');
    const sample = src.prepare(`
        SELECT book_id,chapter,verse,token_ordinal,word_raw,pos,strongs,morph
        FROM tokens_bhs
        WHERE pos IN ('prep','conj','art') AND morph LIKE '%pronominal_suffix=%'
        LIMIT 15
    `).all();
    for (const s of sample) console.log(`     ${s.word_raw}  ${s.book_id} ${s.chapter}:${s.verse}  pos=${s.pos} sn=${s.strongs||'—'}  ${s.morph}`);
}

rule('DONE');
console.log(`Bug A mis-served occurrences : ${aMinority.toLocaleString()}`);
console.log(`Section 1 shows the exact stored-vs-served divergence for your target token.`);
console.log(`Nothing was modified. Both databases were opened read-only.`);

src.close?.(); surf.close?.();
