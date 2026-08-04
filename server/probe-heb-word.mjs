#!/usr/bin/env node
/**
 * probe-heb-word.mjs — READ ONLY. Traces one HEB word from the rendered chip
 * back to the BHS tokens that produced its Strong's number.
 *
 * Written because a screenshot cannot distinguish between three different ways a
 * wrong SN can reach the reader, and guessing between them is not diagnosis:
 *
 *   1. the OT form itself was baked with the wrong head Strong's
 *      (alignment matched the HEB word to the wrong BHS run)
 *   2. the form is right but AMBIGUOUS and the frequency pick chose the wrong
 *      reading (the NT has no per-occurrence tag to check against)
 *   3. the NT word resolved through the wrong PATH — e.g. the proclitic tier
 *      split it and the stem it landed on is a different word
 *
 * The output tells you which, by showing the baked row, every reading of that
 * form, and the actual BHS tokens at the OT locations that built it.
 *
 * USAGE
 *   node probe-heb-word.mjs --word 𐤅𐤀𐤕𐤉 --out trace.txt
 *   node probe-heb-word.mjs --ref 40:1:2 --out matthew-1-2.txt   # book:chapter:verse
 *   node probe-heb-word.mjs --gaps --out gloss-gaps.txt          # missing glosses, ranked
 *
 * FLAGS
 *   --word <paleo>   the surface to trace
 *   --ref b:c:v      trace every word of one verse instead
 *   --db <path>      corpus.db          (default ./corpus.db)
 *   --index <path>   surface-index.db   (default ./surface-index.db)
 *   --gaps           list baked components that render as bare paleo (no gloss),
 *                    ranked by how many times the reader would hit them. These are
 *                    LEXICON gaps, not bake defects — the same root shows the same
 *                    way in the OT — so this sizes the curation job rather than
 *                    sending you hunting chip by chip.
 *   --samples <n>    OT locations to show per form (default 5)
 *   --out <file>     write the report here (never shell-redirect: winpty)
 */

import Database from 'better-sqlite3';
import { writeFileSync } from 'fs';

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
    const i = argv.indexOf('--' + n);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const WORD    = arg('word');
const REF     = arg('ref');
const DB_PATH = arg('db', './corpus.db');
const IDX_PATH= arg('index', './surface-index.db');
const SAMPLES = parseInt(arg('samples', '5'), 10);
const OUT     = arg('out');

const GAPS = argv.includes('--gaps');
if (!WORD && !REF && !GAPS) { console.error('need --word <paleo>, --ref b:c:v, or --gaps'); process.exit(1); }

const LINES = [];
const say = (...a) => { const s = a.join(' '); LINES.push(s); console.log(s); };
const rule = t => { say(''); say('─'.repeat(76)); say(t); say('─'.repeat(76)); };

const db  = new Database(DB_PATH,  { readonly: true });
const idx = new Database(IDX_PATH, { readonly: true });

const hasCol = (t, c) => { try { idx.prepare(`SELECT ${c} FROM ${t} LIMIT 1`).get(); return true; } catch { return false; } };
const HAS_SOURCE = hasCol('token_surfaces', 'source');
const HAS_TIER   = hasCol('token_surfaces', 'tier');
if (!HAS_SOURCE) say('⚠ index has no `source` column — it was built without --heb. Nothing HEB to trace.');

const PROCLITICS = new Set(['𐤅','𐤄','𐤁','𐤋','𐤊','𐤌','𐤔']);
const matresKey = s => (s || '').replace(/[𐤉𐤅]/g, '');

const surfacesFor = (w) => idx.prepare(`
    SELECT ${HAS_SOURCE ? 'source,' : "'BHS' AS source,"} word_raw, strongs, pos, morph,
           rendered_paleo, root_paleo, all_strongs, components
           ${HAS_TIER ? ', tier, ambiguous' : ''}
    FROM token_surfaces WHERE word_raw = ?
`).all(w);

const occsFor = (w, src) => idx.prepare(`
    SELECT book_id, chapter, verse, token_ordinal, strongs, pos, morph
    FROM surface_occurrences
    WHERE word_raw = ? ${HAS_SOURCE ? 'AND source = ?' : ''}
    ORDER BY book_id, chapter, verse
`).all(...(HAS_SOURCE ? [w, src] : [w]));

const bhsAt = db.prepare(`
    SELECT token_ordinal, word_raw, pos, morph, strongs, lemma
    FROM tokens_bhs WHERE book_id = ? AND chapter = ? AND verse = ?
    ORDER BY token_ordinal
`);
const offsetFor = (canon, ch) => {
    try { return idx.prepare('SELECT offset FROM heb_offsets WHERE canon_id=? AND chapter=?').get(canon, ch); }
    catch { return null; }
};

function showComponents(json) {
    let comps;
    try { comps = JSON.parse(json); } catch { return '(unparseable)'; }
    return comps.map(c => `${c.paleo || '∅'}[${c.css || '?'}]${c.translation ? ' ' + c.translation : ' ⟨NO GLOSS⟩'}`).join('  +  ');
}

function traceWord(w) {
    rule(`TRACE  ${w}`);

    const rows = surfacesFor(w);
    if (!rows.length) {
        say('No baked surface for this exact form. Checking how the NT would resolve it…');
    } else {
        say(`Baked rows (${rows.length}):`);
        for (const r of rows) {
            say(`  source=${r.source}  strongs=${r.strongs || '-'}  pos=${r.pos || '-'}  morph=${(r.morph || '-').slice(0, 40)}`);
            if (HAS_TIER) say(`    tier=${r.tier}  ambiguous=${r.ambiguous}${r.ambiguous ? '   ← SN is a frequency pick, not a per-occurrence tag' : ''}`);
            say(`    root=${r.root_paleo}  rendered=${r.rendered_paleo}  all_strongs=${r.all_strongs}`);
            say(`    components: ${showComponents(r.components)}`);
            const noGloss = (() => { try { return JSON.parse(r.components).filter(c => !c.translation).length; } catch { return 0; } })();
            if (noGloss) say(`    ⚠ ${noGloss} component(s) carry NO gloss — fabricated rather than attested`);
        }
    }

    // Where does this form come from in the OT?
    const otOccs = occsFor(w, 'HEB').filter(o => o.book_id <= 39);
    const ntOccs = occsFor(w, 'HEB').filter(o => o.book_id >= 40);
    say('');
    say(`OT occurrences of this form: ${otOccs.length}   ·   NT occurrences: ${ntOccs.length}`);

    if (otOccs.length) {
        say('');
        say('The BHS tokens at the OT locations that BUILT this form — this is where the');
        say('head Strong\'s comes from. If the run below is not this word, alignment is at fault:');
        for (const o of otOccs.slice(0, SAMPLES)) {
            const off = offsetFor(o.book_id, o.chapter);
            const d = off ? off.offset : 0;
            const toks = bhsAt.all(o.book_id, o.chapter, o.verse + d);
            say(`  canon ${o.book_id} ${o.chapter}:${o.verse} (BHS verse ${o.verse + d}, offset ${d}) ord ${o.token_ordinal}`);
            say('    BHS: ' + (toks.length
                ? toks.map(t => `${t.word_raw}/${t.strongs || '-'}/${t.pos || '-'}`).join('  ')
                : '(no tokens at this key)'));
        }
    } else {
        say('  → This form has NO OT occurrence, so any Strong\'s on it was inherited');
        say('    through a resolution path. Candidate paths:');
        // exact stem after a proclitic
        const chars = [...w];
        for (let k = 1; k <= 2 && k < chars.length - 1; k++) {
            if (!chars.slice(0, k).every(c => PROCLITICS.has(c))) break;
            const stem = chars.slice(k).join('');
            const st = surfacesFor(stem).filter(r => r.source === 'HEB');
            say(`    proclitic ${chars.slice(0, k).join('')} + ${stem}  →  ` +
                (st.length ? st.map(r => `${r.strongs || '-'} (tier ${r.tier || '?'}, amb ${r.ambiguous ?? '?'})`).join(' | ')
                           : 'stem NOT an attested form'));
            if (st.length) {
                say(`      stem components: ${showComponents(st[0].components)}`);
                say(`      → trace the stem next:  node probe-heb-word.mjs --word ${stem}`);
            }
        }
        // plene
        const mk = matresKey(w);
        if ([...mk].length >= 3) {
            const cands = idx.prepare(`SELECT DISTINCT word_raw FROM token_surfaces ${HAS_SOURCE ? "WHERE source='HEB'" : ''}`)
                .all().map(r => r.word_raw).filter(f => matresKey(f) === mk && f !== w);
            if (cands.length) say(`    plene/defective  →  ${cands.slice(0, 6).join(' , ')}`);
        }
    }
}

function reportGaps() {
    rule('GLOSS GAPS — baked components that render as bare paleo');
    say('A component whose translation is empty or just its own letters found no lexicon');
    say('entry. The bake carries the Strong\'s regardless; only the English is missing.');
    say('');
    say('READ THE COVERAGE TABLE FIRST. BHS rows and HEB rows are glossed by the SAME');
    say('parseToken chain against the SAME lexicon files, so their coverage should match.');
    say('  • both low   -> lexicon data gap; predates the HEB bake, shows in the OT too');
    say('  • HEB lower  -> the whole-word composition lost something; that one is mine');

    // ── coverage by source: the decisive comparison ──────────────────────────
    const occBy = new Map();
    for (const r of idx.prepare(
        `SELECT ${HAS_SOURCE ? 'source' : "'BHS' AS source"} AS source, word_raw, COUNT(*) n
         FROM surface_occurrences GROUP BY source, word_raw`).all())
        occBy.set(`${r.source}\u0000${r.word_raw}`, r.n);

    const cov = new Map();   // source -> {comps, bare, wComps, wBare}
    const byCss = new Map(); // source|css -> {comps, bare}
    for (const r of idx.prepare(
        `SELECT ${HAS_SOURCE ? 'source' : "'BHS' AS source"} AS source, word_raw, strongs, components
         FROM token_surfaces`).all()) {
        let comps; try { comps = JSON.parse(r.components); } catch { continue; }
        const w = occBy.get(`${r.source}\u0000${r.word_raw}`) || 0;
        if (!cov.has(r.source)) cov.set(r.source, { comps: 0, bare: 0, wComps: 0, wBare: 0 });
        const c0 = cov.get(r.source);
        for (const c of comps) {
            if (/^(prs-|nme-|vbe-|uvf-|pfm-|vbs-)/.test(c.css || '')) continue;
            const t = (c.translation || '').trim();
            const bare = !t || t === c.paleo || t === `[${c.paleo}]`;
            c0.comps++; c0.wComps += w;
            if (bare) { c0.bare++; c0.wBare += w; }
            const ck = `${r.source}|${c.css || '-'}`;
            if (!byCss.has(ck)) byCss.set(ck, { comps: 0, bare: 0 });
            const cc = byCss.get(ck); cc.comps++; if (bare) cc.bare++;
        }
    }
    say('');
    say('  source   components   glossed   by occurrence-weight');
    say('  ' + '-'.repeat(52));
    for (const [src, c] of cov)
        say('  ' + src.padEnd(9) + String(c.comps).padEnd(13) +
            (c.comps ? (100 * (c.comps - c.bare) / c.comps).toFixed(1) + '%' : 'n/a').padEnd(10) +
            (c.wComps ? (100 * (c.wComps - c.wBare) / c.wComps).toFixed(1) + '%' : 'n/a'));
    say('');
    say('  By component class (glossed / total):');
    for (const [k, v] of [...byCss.entries()].sort((a, b) => b[1].comps - a[1].comps).slice(0, 14))
        say(`    ${k.padEnd(22)} ${String(v.comps - v.bare).padStart(7)} / ${String(v.comps).padEnd(7)}` +
            `  ${v.comps ? (100 * (v.comps - v.bare) / v.comps).toFixed(1) + '%' : ''}`);

    const occCount = new Map();
    for (const r of idx.prepare(
        `SELECT word_raw, COUNT(*) n FROM surface_occurrences ${HAS_SOURCE ? "WHERE source='HEB'" : ''} GROUP BY word_raw`
    ).all()) occCount.set(r.word_raw, r.n);

    const gaps = new Map();   // "paleo\0strongs" -> {paleo, strongs, css, hits, example}
    const rows = idx.prepare(
        `SELECT word_raw, strongs, all_strongs, components FROM token_surfaces ${HAS_SOURCE ? "WHERE source='HEB'" : ''}`
    ).all();
    for (const r of rows) {
        let comps;
        try { comps = JSON.parse(r.components); } catch { continue; }
        const hits = occCount.get(r.word_raw) || 0;
        for (const c of comps) {
            const t = (c.translation || '').trim();
            const bare = !t || t === c.paleo || t === `[${c.paleo}]`;
            if (!bare) continue;
            // affix chips legitimately have bracketed grammar labels, not glosses
            if (/^(prs-|nme-|vbe-|uvf-|pfm-|vbs-)/.test(c.css || '')) continue;
            const k = `${c.paleo}\u0000${r.strongs || ''}`;
            if (!gaps.has(k)) gaps.set(k, { paleo: c.paleo, strongs: r.strongs || '-', css: c.css || '-', hits: 0, example: r.word_raw });
            gaps.get(k).hits += hits;
        }
    }
    const list = [...gaps.values()].sort((a, b) => b.hits - a.hits);
    const total = list.reduce((n, g) => n + g.hits, 0);
    say('');
    rule('RANKED GAPS');
    say(`distinct un-glossed components : ${list.length}`);
    // NOT "reader impressions": a word contributes its count to EVERY bare component
    // it contains, and the same letters appear once per head Strong's (𐤀𐤋 shows up
    // under H408/H413/H411/H3808/H409). Use it to RANK, not to size.
    say(`component instances (double-counted across a word's parts, and per head SN): ${total.toLocaleString()}`);
    say('');
    say('row_strongs is the WORD\'s head Strong\'s, not necessarily this component\'s —');
    say('a multi-part word has one head, so look the component up by its paleo, not the SN.');
    say('');
    say('  paleo            row_sn    css          hits   example word');
    say('  ' + '-'.repeat(66));
    for (const g of list.slice(0, 60))
        say('  ' + g.paleo.padEnd(16) + (g.strongs || '-').padEnd(9) + (g.css || '-').padEnd(13) +
            String(g.hits).padEnd(7) + g.example);
    if (list.length > 60) say(`  … and ${list.length - 60} more`);
}

if (GAPS) {
    reportGaps();
} else if (WORD) {
    traceWord(WORD);
} else {
    const [b, c, v] = REF.split(':').map(n => parseInt(n, 10));
    rule(`VERSE ${b} ${c}:${v} — every baked word`);
    const rows = idx.prepare(`
        SELECT o.token_ordinal, o.word_raw, t.strongs, t.components
               ${HAS_TIER ? ', t.tier, t.ambiguous' : ''}
        FROM surface_occurrences o
        JOIN token_surfaces t ON t.word_raw = o.word_raw
             ${HAS_SOURCE ? 'AND t.source = o.source' : ''}
             AND t.strongs = o.strongs AND t.pos = o.pos AND t.morph = o.morph
        WHERE ${HAS_SOURCE ? "o.source='HEB' AND " : ''}o.book_id=? AND o.chapter=? AND o.verse=?
        ORDER BY o.token_ordinal
    `).all(b, c, v);
    if (!rows.length) say('  (no baked HEB rows for that verse)');
    for (const r of rows) {
        say(`  ${String(r.token_ordinal).padStart(3)}  ${r.word_raw}  ${r.strongs || '-'}` +
            (HAS_TIER ? `  tier=${r.tier} amb=${r.ambiguous}` : ''));
        say(`       ${showComponents(r.components)}`);
    }
    say('');
    say('Trace any suspicious one with:  node probe-heb-word.mjs --word <form>');
}

if (OUT) { writeFileSync(OUT, LINES.join('\n') + '\n'); console.log(`\n[written to ${OUT}]`); }
db.close(); idx.close();
