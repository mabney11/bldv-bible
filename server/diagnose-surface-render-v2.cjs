#!/usr/bin/env node
/**
 * diagnose-surface-render-v2.cjs — READ ONLY.
 *
 * Fixes three things wrong with v1:
 *   1. SECTION 3 REPORTED A FALSE ZERO. v1 filtered morph with the FULL-WORD keys
 *      the descriptive panel displays (pronominal_suffix=…). tokens_bhs.morph
 *      actually stores SHORT keys (prs=1cs|uvf=absent|pfm=…), so the LIKE matched
 *      nothing and Bug B looked dormant. It is not: Section 0 shows pos is stored
 *      as short codes (prep/conj/art), which is exactly what arms the standalone
 *      branch. This version queries the real keys.
 *   2. Paleo glyphs printed as ??? on a Windows console. All Paleo is now shown
 *      transliterated (Latin) so it is readable anywhere.
 *   3. Verse targeting: --book 38 --chapter 4 --verse 5   (Zechariah = canon 38)
 *
 * Usage:
 *   node diagnose-surface-render-v2.cjs --book 38 --chapter 4 --verse 5
 *   node diagnose-surface-render-v2.cjs                 # corpus-wide only
 */
'use strict';
const path = require('path');
const fs   = require('fs');

let Database;
try { Database = require('better-sqlite3'); }
catch {
    const { DatabaseSync } = require('node:sqlite');
    Database = class {
        constructor(f){ this.db = new DatabaseSync(f, { readOnly: true }); }
        prepare(q){ const s = this.db.prepare(q); return { all:(...a)=>s.all(...a), get:(...a)=>s.get(...a) }; }
        close(){ this.db.close?.(); }
    };
}

const args = process.argv.slice(2);
const argv = (f, d=null) => { const i = args.indexOf(f); return i >= 0 ? args[i+1] : d; };
const CORPUS = argv('--db',   path.join(process.cwd(), 'corpus.db'));
const SURF   = argv('--surf', path.join(process.cwd(), 'surface-index.db'));
const BOOK = argv('--book'), CH = argv('--chapter'), VS = argv('--verse');

for (const [l,p] of [['corpus.db',CORPUS],['surface-index.db',SURF]])
    if (!fs.existsSync(p)) { console.error(`✗ ${l} not found: ${p}`); process.exit(1); }

const src  = new Database(CORPUS, { readonly:true });
const surf = new Database(SURF,   { readonly:true });

// ── console-safe Paleo: U+10900..U+10915 → Latin ─────────────────────────────
const TR = ['A','B','G','D','H','W','Z','Ch','T','Y','K','L','M','N','S','O','P','Tz','Q','R','Sh','Th'];
const tr = s => [...String(s||'')].map(c => {
    const cp = c.codePointAt(0);
    return (cp >= 0x10900 && cp <= 0x10915) ? TR[cp - 0x10900] : c;
}).join('');
const P = s => `${tr(s)}`;                    // print form
const rule = t => console.log('\n' + '─'.repeat(76) + (t ? '\n' + t : ''));

// ════════════════════════════════════════════════════════════════════════════
rule('SECTION 1 — stored row  vs  the baked row the reader actually serves');
const snNorm = s => s ? 'H' + String(s).replace(/^H+/,'') : '';
const SO_HAS_MORPH = (() => { try { surf.prepare('SELECT pos, morph FROM surface_occurrences LIMIT 1'); return true; } catch { return false; } })();
console.log(`surface_occurrences carries pos/morph : ${SO_HAS_MORPH}  ${SO_HAS_MORPH ? '(index is REBUILT — reading-accurate)' : '(index is OLD — readings COLLAPSED)'}\n`);

if (BOOK && CH && VS) {
    const toks = src.prepare(`
        SELECT token_ordinal, word_raw, pos, morph, strongs FROM tokens_bhs
        WHERE book_id=? AND chapter=? AND verse=? ORDER BY token_ordinal`).all(+BOOK,+CH,+VS);
    for (const t of toks) {
        // what the reader serves TODAY (join on word_raw+strongs only)
        const served = surf.prepare(
            `SELECT * FROM token_surfaces WHERE word_raw=? AND strongs=?`).all(t.word_raw, snNorm(t.strongs));
        const win = served[0];
        let comps = []; try { comps = JSON.parse(win?.components || '[]'); } catch {}
        const rendered = comps.map(c=>c.paleo).join('');
        console.log(`• ord ${t.token_ordinal}  surface=${P(t.word_raw)}  pos=${t.pos}  sn=${t.strongs||'—'}`);
        console.log(`    stored morph : ${t.morph||'—'}`);
        if (!win) { console.log('    served       : (no baked row — live-parsed)\n'); continue; }
        console.log(`    served morph : ${win.morph||'—'}`);
        console.log(`    RENDERS AS   : ${P(rendered)}`);
        console.log(`    components   : ${comps.map(c=>`${P(c.paleo)||'∅'}:${c.translation}`).join(' · ')}`);
        if (win.morph && t.morph && win.morph !== t.morph)
            console.log(`    ⚠ BUG A — this occurrence's morph ≠ the served reading's morph. Wrong reading.`);
        if (['prep','conj','art'].includes(t.pos) && /\b(prs|pfm|vbs|nme|vbe|uvf)=(?!absent|none)/.test(t.morph||''))
            console.log(`    ⚠ BUG B — standalone-pos particle carrying an affix: suffix swallowed.`);
        console.log('');
    }
} else console.log('(pass --book/--chapter/--verse to inspect a verse, e.g. --book 38 --chapter 4 --verse 5)');

// ════════════════════════════════════════════════════════════════════════════
rule('SECTION 3 (CORRECTED) — BUG B: standalone-pos particles carrying an affix');
// The REAL morph keys: prs / pfm / vbs / nme / vbe / uvf, value != absent|none.
const AFFIX = `(
     (morph LIKE '%prs=%' AND morph NOT LIKE '%prs=absent%' AND morph NOT LIKE '%prs=none%')
  OR (morph LIKE '%pfm=%' AND morph NOT LIKE '%pfm=absent%' AND morph NOT LIKE '%pfm=none%')
  OR (morph LIKE '%vbs=%' AND morph NOT LIKE '%vbs=absent%' AND morph NOT LIKE '%vbs=none%')
  OR (morph LIKE '%nme=%' AND morph NOT LIKE '%nme=absent%' AND morph NOT LIKE '%nme=none%')
  OR (morph LIKE '%vbe=%' AND morph NOT LIKE '%vbe=absent%' AND morph NOT LIKE '%vbe=none%')
  OR (morph LIKE '%uvf=%' AND morph NOT LIKE '%uvf=absent%' AND morph NOT LIKE '%uvf=none%')
)`;
const byPos = src.prepare(`
    SELECT pos, COUNT(*) n, COUNT(DISTINCT word_raw) surfaces
    FROM tokens_bhs WHERE pos IN ('prep','conj','art') AND ${AFFIX}
    GROUP BY pos ORDER BY n DESC`).all();
const bTotal = byPos.reduce((s,r)=>s+r.n,0);
console.log(`standalone-pos tokens that ALSO carry an affix : ${bTotal.toLocaleString()}  ← Bug B blast radius\n`);
for (const r of byPos) console.log(`   pos=${r.pos.padEnd(5)} tokens=${String(r.n).padStart(6)}  distinct surfaces=${r.surfaces}`);

const withPrs = src.prepare(`
    SELECT COUNT(*) n FROM tokens_bhs
    WHERE pos IN ('prep','conj','art')
      AND morph LIKE '%prs=%' AND morph NOT LIKE '%prs=absent%' AND morph NOT LIKE '%prs=none%'`).get();
console.log(`\n   of which carry a PRONOMINAL SUFFIX (the אֵלַי class): ${withPrs.n.toLocaleString()}`);
console.log('\n   sample:');
for (const s of src.prepare(`
    SELECT book_id,chapter,verse,token_ordinal,word_raw,pos,strongs,morph FROM tokens_bhs
    WHERE pos IN ('prep','conj','art')
      AND morph LIKE '%prs=%' AND morph NOT LIKE '%prs=absent%' AND morph NOT LIKE '%prs=none%'
    LIMIT 12`).all())
    console.log(`     ${P(s.word_raw).padEnd(8)} ${s.book_id} ${s.chapter}:${s.verse} ord ${s.token_ordinal}  pos=${s.pos} sn=${s.strongs||'—'}  ${s.morph}`);

rule('DONE — nothing was modified.');
src.close?.(); surf.close?.();
