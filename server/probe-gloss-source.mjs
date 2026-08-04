#!/usr/bin/env node
/**
 * probe-gloss-source.mjs — READ ONLY. Writes nothing but its report.
 *
 * --gaps established that 24% of reader impressions have no English gloss, that
 * the HEB bake is NOT responsible (BHS 76.9% vs HEB 76.2% occurrence-weighted),
 * and that proper nouns are the worst class by far (~15% vs 70-99% for every
 * other modifier class).
 *
 * This answers the next question, which is the one that decides the fix:
 *
 *     Is the English MISSING, or is it PRESENT in a file the surface-index
 *     builder never reads?
 *
 * build-surface-index.js glosses from lexicon.json / homographs.json /
 * definitions.json. The render pipeline (apply-web-strongs, render-corpus) also
 * has word-map.json, name-map-expanded.json, name-strongs.txt, name-aliases.txt
 * and the Strong's dictionaries with their kjv_def field. If the un-glossed
 * components turn up in THOSE, the fix is wiring, not authoring — and the report
 * below names which file would have supplied each one.
 *
 * USAGE
 *   node probe-gloss-source.mjs --out gloss-source.txt
 *   node probe-gloss-source.mjs --class mod-nmpr --top 40 --out names.txt
 *
 * FLAGS
 *   --index <path>   surface-index.db (default ./surface-index.db)
 *   --lex <dir>      lexicon dir      (default ./lexicon)
 *   --class <css>    only this component class (e.g. mod-nmpr, root)
 *   --source <s>     BHS | HEB   (default: both)
 *   --top <n>        how many ranked gaps to check (default 400)
 *   --samples <n>    examples to print per finding (default 10)
 *   --out <file>     write the report here (never shell-redirect: winpty)
 */

import Database from 'better-sqlite3';
import { readFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
    const i = argv.indexOf('--' + n);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const IDX   = arg('index', './surface-index.db');
const LEX   = arg('lex', './lexicon');
const CLASS = arg('class');
const SRC   = arg('source');
const TOP   = parseInt(arg('top', '400'), 10);
const SAMP  = parseInt(arg('samples', '10'), 10);
const OUT   = arg('out');

const LINES = [];
const say = (...a) => { const s = a.join(' '); LINES.push(s); console.log(s); };
const rule = t => { say(''); say('─'.repeat(76)); say(t); say('─'.repeat(76)); };

// ── load every candidate data file we can find ──────────────────────────────
// v1 only looked in the lexicon dir and only at a fixed list, so it reported
// word-map.json and strongs-hebrew-expanded.json as "not found" when they simply
// live elsewhere — and it never opened hebrew-extra-lexicon.json, which was
// sitting in that directory the whole time.
const SEARCH_DIRS = [LEX, path.join(LEX, '..'), process.cwd(), path.join(process.cwd(), 'lexicon')];
const WHERE = {};
const load = (f) => {
    for (const d of SEARCH_DIRS) {
        const p = path.join(d, f);
        if (!existsSync(p)) continue;
        try { const j = JSON.parse(readFileSync(p, 'utf8')); WHERE[f] = p; return j; }
        catch (e) { say(`  ⚠ ${p}: ${e.message}`); return null; }
    }
    return null;
};
const CANDIDATES = ['lexicon.json', 'homographs.json', 'definitions.json',
                    'word-map.json', 'name-map-expanded.json',
                    'strongs-hebrew.json', 'strongs-hebrew-expanded.json',
                    'strongs-roots.json'];
// plus every *-lexicon.json sitting in the lexicon dir (hebrew-extra-lexicon.json!)
try {
    for (const f of readdirSync(LEX))
        if (/-lexicon\.json$/.test(f) && !CANDIDATES.includes(f)) CANDIDATES.push(f);
} catch { /* ignore */ }
const FILES = {};
for (const f of CANDIDATES) { const j = load(f); if (j) FILES[f] = j; }
say('probe-gloss-source — which file could supply each missing gloss');
say(`index=${IDX}  lex=${LEX}`);
say('files found:');
for (const f of Object.keys(FILES)) say(`  ${f.padEnd(32)} ${WHERE[f]}`);
const missing = CANDIDATES.filter(f => !FILES[f]);
if (missing.length) say(`NOT found in ${SEARCH_DIRS.join(' | ')}:\n  ${missing.join('  ')}`);
say('');
say('Anything above that build-surface-index.js does NOT load is a wiring candidate.');
say('It loads only: lexicon.json, homographs.json, definitions.json, strongs-roots.json,');
say('surface-strongs-overrides.json.');

// ── lookup helpers, each answering "would THIS file have glossed it?" ───────
const norm = sn => (sn ? 'H' + String(sn).replace(/^H+/, '') : '');
// H9000+ are OSHB placeholders — build-surface-index calls them "never real".
// v1 let them into the lookups, so a homographs entry for H9000 counted as a hit
// for a component whose real number is something else entirely. Upper bound, not
// a measurement. Excluded now.
const isVirtual = sn => (parseInt(String(sn || '').replace(/^H+/, ''), 10) || 0) >= 9000;

/** word-map.json is {names:{}, peoples:{}, terms:{}, divine:{}} in some builds and
 *  a flat map in others — probe both shapes rather than assume one. */
function wordMapHit(paleo, sn) {
    const wm = FILES['word-map.json'];
    if (!wm) return null;
    const buckets = ['names', 'peoples', 'terms', 'divine', 'termsDominant', 'termsAmbiguous'];
    for (const b of buckets) {
        const m = wm[b];
        if (!m || typeof m !== 'object') continue;
        for (const [k, v] of Object.entries(m)) {
            const val = typeof v === 'string' ? v : (v && (v.translit || v.gloss || v.paleo));
            if (k === paleo || val === paleo || k === sn) return `word-map.json:${b}`;
        }
    }
    for (const [k, v] of Object.entries(wm)) {
        if (typeof v === 'string' && (k === paleo || k === sn)) return 'word-map.json:flat';
    }
    return null;
}
function strongsDefHit(sn) {
    for (const f of ['strongs-hebrew-expanded.json', 'strongs-hebrew.json']) {
        const d = FILES[f];
        if (!d) continue;
        const e = d[sn] || d[sn.replace(/^H/, '')] || d[sn.toLowerCase()];
        if (!e) continue;
        const def = typeof e === 'string' ? e : (e.kjv_def || e.strongs_def || e.def || e.meaning);
        if (def && String(def).trim()) return f;
    }
    return null;
}
function nameMapHit(paleo, sn) {
    const nm = FILES['name-map-expanded.json'];
    if (!nm) return null;
    for (const [k, v] of Object.entries(nm)) {
        if (k === paleo || k === sn) return 'name-map-expanded.json';
        if (v && typeof v === 'object' && (v[paleo] || v[sn])) return `name-map-expanded.json:${k}`;
    }
    return null;
}
function lexHit(paleo) {
    const l = FILES['lexicon.json'];
    return (l && l[paleo]) ? 'lexicon.json' : null;
}
/** Any other *-lexicon.json — notably hebrew-extra-lexicon.json, which is the
 *  HEB corpus's own lexicon and which the builder never opens. */
function extraLexHit(paleo, root) {
    for (const [f, j] of Object.entries(FILES)) {
        if (!/-lexicon\.json$/.test(f) || f === 'lexicon.json') continue;
        if (j && (j[paleo] || j[root])) return f;
    }
    return null;
}
function homographHit(paleo, sn) {
    const h = FILES['homographs.json'];
    if (!h) return null;
    if (h[sn]) return 'homographs.json:by-strongs';
    for (const k of Object.keys(h)) if (k.startsWith(paleo + '_')) return 'homographs.json:by-paleo';
    return null;
}
function definitionsHit(paleo, sn) {
    const d = FILES['definitions.json'];
    if (!d) return null;
    return (d[paleo] || d[sn]) ? 'definitions.json' : null;
}

// ── collect the gaps from the index ─────────────────────────────────────────
const idx = new Database(IDX, { readonly: true });
const hasSource = (() => { try { idx.prepare('SELECT source FROM token_surfaces LIMIT 1').get(); return true; } catch { return false; } })();

const occ = new Map();
for (const r of idx.prepare(
    `SELECT ${hasSource ? 'source' : "'BHS' AS source"} AS source, word_raw, COUNT(*) n
     FROM surface_occurrences GROUP BY source, word_raw`).all())
    occ.set(`${r.source}\u0000${r.word_raw}`, r.n);

const gaps = new Map();
for (const r of idx.prepare(
    `SELECT ${hasSource ? 'source' : "'BHS' AS source"} AS source, word_raw, strongs, all_strongs, components
     FROM token_surfaces ${SRC && hasSource ? `WHERE source = '${SRC}'` : ''}`).all()) {
    let comps; try { comps = JSON.parse(r.components); } catch { continue; }
    let allSn = []; try { allSn = JSON.parse(r.all_strongs || '[]'); } catch { /* ignore */ }
    const hits = occ.get(`${r.source}\u0000${r.word_raw}`) || 0;
    for (const c of comps) {
        if (/^(prs-|nme-|vbe-|uvf-|pfm-|vbs-)/.test(c.css || '')) continue;
        if (CLASS && c.css !== CLASS) continue;
        const t = (c.translation || '').trim();
        if (t && t !== c.paleo && t !== `[${c.paleo}]`) continue;
        // the component's own SN is not stored; try its row's head and all_strongs
        const key = `${c.paleo}\u0000${c.css}`;
        if (!gaps.has(key)) gaps.set(key, {
            paleo: c.paleo, css: c.css || '-', hits: 0,
            sns: new Set(), ownSn: null, approx: false,
            example: r.word_raw, sources: new Set(),
            trueRoot: c.true_root || c.paleo,
        });
        const g = gaps.get(key);
        g.hits += hits;
        g.sources.add(r.source);
        // parseToken puts the component's OWN number on rootComp.sn. Prefer it;
        // fall back to the row's numbers only when it is absent, and SAY SO.
        if (c.sn && !isVirtual(c.sn)) { g.ownSn = norm(c.sn); g.sns.add(norm(c.sn)); }
        else {
            g.approx = true;
            if (r.strongs && !isVirtual(r.strongs)) g.sns.add(norm(r.strongs));
            for (const s of allSn) if (!isVirtual(s)) g.sns.add(norm(s));
        }
    }
}
idx.close();

const ranked = [...gaps.values()].sort((a, b) => b.hits - a.hits).slice(0, TOP);
rule(`CHECKING THE TOP ${ranked.length} GAPS${CLASS ? ` (class ${CLASS})` : ''} AGAINST EVERY DATA FILE`);

const tally = new Map();
const examples = new Map();
for (const g of ranked) {
    const sns = g.ownSn ? [g.ownSn] : [...g.sns];
    const found = [];
    for (const probe of [
        () => lexHit(g.paleo) || lexHit(g.trueRoot),
        () => extraLexHit(g.paleo, g.trueRoot),
        () => sns.map(s => homographHit(g.paleo, s)).find(Boolean),
        () => sns.map(s => definitionsHit(g.paleo, s)).find(Boolean),
        () => sns.map(s => wordMapHit(g.paleo, s)).find(Boolean),
        () => sns.map(s => nameMapHit(g.paleo, s)).find(Boolean),
        () => sns.map(s => strongsDefHit(s)).find(Boolean),
    ]) {
        const hit = probe();
        if (hit) found.push(hit);
    }
    const verdict = found.length ? found[0] : 'NOWHERE — genuinely unauthored';
    tally.set(verdict, (tally.get(verdict) || 0) + 1);
    if (!examples.has(verdict)) examples.set(verdict, []);
    if (examples.get(verdict).length < SAMP)
        examples.get(verdict).push(
            `${g.paleo} (${g.css}, ${g.ownSn || ([...g.sns].slice(0, 2).join('/') || 'no SN')}` +
            `${g.approx ? '~' : ''}, ${g.hits} hits, in ${g.example}, source=${[...g.sources].join('+')})`);
}

say('');
say('  count   would have been supplied by');
say('  ' + '-'.repeat(60));
for (const [k, n] of [...tally.entries()].sort((a, b) => b[1] - a[1]))
    say('  ' + String(n).padEnd(8) + k);

say('');
say('WHAT THIS MEANS');
say('  Anything but "NOWHERE" is a WIRING problem: the English already exists, in a');
say('  file build-surface-index.js does not consult. Fix = feed that file into the');
say('  gloss chain (or merge it into lexicon.json), then rebuild. No authoring.');
say('  "NOWHERE" is the genuine curation backlog.');
say('');
say('  source=BHS  -> pre-existing; the same gap shows in the OT, nothing to do with');
say('                the HEB bake. source=HEB only -> introduced by the whole-word path.');
say('  a ~ after the SN means the component carried no sn of its own and the row\'s');
say('  numbers were used instead, so that row is a candidate, not a certainty.');

for (const [k, ex] of examples) {
    say('');
    say(`${k}:`);
    for (const e of ex) say('  ' + e);
}

if (OUT) { const { writeFileSync } = await import('fs'); writeFileSync(OUT, LINES.join('\n') + '\n'); console.log(`\n[written to ${OUT}]`); }
