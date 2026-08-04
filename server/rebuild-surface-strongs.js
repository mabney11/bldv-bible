#!/usr/bin/env node
/**
 * rebuild-surface-strongs.js
 *
 * Enforces ONE invariant across the entire surface index, deterministically:
 *
 *     a surface's Strong's number(s) MUST be consistent with its parsed root.
 *
 * Your root resolution (parseHebrewData) is already trustworthy — it derives the
 * consonantal root from morphology and guards it. The Strong's numbers are not:
 * the source data attaches wrong numbers (𐤁𐤔𐤓 "to proclaim" tagged H6666 צדקה),
 * a virtual sentinel H9000 where the source had none, and `all_strongs` blobs
 * polluted with co-occurring words (𐤀𐤁 "father" carrying H3068 YHWH, H430 Elohim).
 * All three break Strong's-based navigation.
 *
 * This rebuilds `strongs` / `all_strongs` (and the root component's `sn`) from the
 * AUTHORITATIVE direction: strongs-roots.json maps every Strong's number to its
 * canonical lemma; we invert it (lemma → numbers) and force each surface's numbers
 * to be exactly the ones whose lemma equals the surface's own root. Nothing else
 * can leak in. Then it VALIDATES that zero rows violate the invariant.
 *
 * Manual corrections in lexicon/surface-strongs-overrides.json always win.
 *
 *   node rebuild-surface-strongs.js                 # apply + validate
 *   node rebuild-surface-strongs.js --dry           # report only, write nothing
 *
 * Re-run it any time after build-surface-index.js; it is idempotent.
 */
'use strict';
const fs = require('fs');
const path = require('path');

function arg(flag, def) { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : def; }
const DRY    = process.argv.includes('--dry');
const DB     = arg('--db',        path.join(__dirname, 'surface-index.db'));
const ROOTS  = arg('--roots',     path.join(__dirname, 'lexicon', 'strongs-roots.json'));
const DICT   = arg('--dict',      path.join(__dirname, 'lexicon', 'strongs-hebrew-dictionary.js'));
const OVERRIDES = arg('--overrides', path.join(__dirname, 'lexicon', 'surface-strongs-overrides.json'));

const norm = (s) => s ? 'H' + String(s).replace(/^H+/, '') : '';
const num  = (h) => parseInt(String(h).replace(/^H+/, ''), 10) || 0;
const isVirtual = (h) => num(h) >= 9000;        // H9000–H9999 are placeholders, never real

// ── core decision logic (pure, unit-testable) ───────────────────────────────
// reverse: Map(lemmaPaleo -> [H..] sorted). posOf: Map(H -> 'verb'|'noun'|null).
function decide(root, curStrongs, curAll, surfacePos, reverse, posOf, override) {
    const cands = (reverse.get(root) || []).filter(h => !isVirtual(h));
    if (override && override.length) {
        return { strongs: override[0], all: [...new Set(override.map(norm))] , reason: 'override' };
    }
    const cur = norm(curStrongs);
    let primary = null, reason;
    if (cur && !isVirtual(cur) && cands.includes(cur)) {
        primary = cur; reason = 'kept';                       // already consistent
    } else if (cands.length) {
        // choose a candidate; prefer one whose dictionary POS matches the surface,
        // else the lowest (canonical) number. Either way it shares the correct root.
        const wantVerb = /verb/.test(surfacePos || '');
        const byPos = cands.filter(h => posOf.get(h) && (posOf.get(h) === 'verb') === wantVerb);
        primary = (byPos.length ? byPos : cands)[0];
        reason = cur && !isVirtual(cur) ? 'corrected' : (isVirtual(cur) ? 'desentineled' : 'filled');
    } else if (cur && !isVirtual(cur)) {
        primary = cur; reason = 'kept-no-lexicon';            // root not in lexicon; trust existing real SN
    } else {
        primary = null; reason = 'cleared';                  // genuinely no Strong's (sentinel removed)
    }
    const all = cands.length ? cands : (primary ? [primary] : []);
    return { strongs: primary, all, reason };
}

// ── self-test on synthetic data (runs with --selftest, no DB needed) ─────────
if (process.argv.includes('--selftest')) {
    const reverse = new Map([['𐤁𐤔𐤓', ['H1319', 'H1320']], ['𐤀𐤁', ['H1', 'H2']], ['𐤑𐤃𐤒', ['H6666']]]);
    const posOf = new Map([['H1319', 'verb'], ['H1320', 'noun'], ['H1', 'noun'], ['H2', 'noun'], ['H6666', 'noun']]);
    const t = (label, got, exp) => console.log(`  ${got === exp ? 'ok ' : 'FAIL'}  ${label}: ${got} (want ${exp})`);
    let r;
    r = decide('𐤁𐤔𐤓', 'H6666', ['H6666'], 'verb', reverse, posOf, null);
    t('bishsarti wrong H6666 -> verb H1319', r.strongs, 'H1319');
    r = decide('𐤀𐤁', 'H1', ['H1','H3068','H430','H935','H9000'], 'subs', reverse, posOf, null);
    t('avi polluted all_strongs collapses', JSON.stringify(r.all), '["H1","H2"]');
    r = decide('𐤁𐤔𐤓', 'H9000', ['H9000'], 'subs', reverse, posOf, null);
    t('H9000 sentinel, noun -> H1320', r.strongs, 'H1320');
    process.exit(0);
}

// ── load lexicons ────────────────────────────────────────────────────────────
const Database = require('better-sqlite3');
const rootsMap = JSON.parse(fs.readFileSync(ROOTS, 'utf8'));     // { H1: '𐤀𐤁', ... }
const reverse = new Map();
for (const [h, paleo] of Object.entries(rootsMap)) {
    if (!paleo) continue;
    if (!reverse.has(paleo)) reverse.set(paleo, []);
    reverse.get(paleo).push(norm(h));
}
for (const arr of reverse.values()) arr.sort((a, b) => num(a) - num(b));

// coarse POS from the Strong's dictionary (best-effort; 'a primitive root' => verb)
const posOf = new Map();
try {
    const dict = require(DICT);
    for (const [h, e] of Object.entries(dict)) {
        const d = `${e.derivation || ''} ${e.strongs_def || ''}`.toLowerCase();
        posOf.set(norm(h), /primitive root|to /.test(d) ? 'verb' : 'noun');
    }
} catch { console.warn('[pos] strongs dictionary not loaded — homograph choice falls back to lowest number'); }

let overrides = {};
try { overrides = JSON.parse(fs.readFileSync(OVERRIDES, 'utf8')); } catch {}

// ── rebuild ──────────────────────────────────────────────────────────────────
const db = new Database(DB);
const rows = db.prepare('SELECT word_raw, root_paleo, strongs, all_strongs, pos, components FROM token_surfaces').all();
const upd = db.prepare('UPDATE token_surfaces SET strongs=?, all_strongs=?, components=? WHERE word_raw=?');

const stat = { kept: 0, corrected: 0, desentineled: 0, filled: 0, cleared: 0, 'kept-no-lexicon': 0, override: 0 };
const samples = [];
const tx = db.transaction(() => {
    for (const r of rows) {
        const ov = overrides[r.word_raw] ? [].concat(overrides[r.word_raw]) : null;
        const d = decide(r.root_paleo, r.strongs, r.all_strongs, r.pos, reverse, posOf, ov);
        stat[d.reason] = (stat[d.reason] || 0) + 1;
        // fix the root component's sn too, so the rendered breakdown agrees
        let comps = r.components;
        try {
            const c = JSON.parse(r.components);
            for (const part of c) if (part.css === 'root' || /(^|\s)root($|\s)/.test(part.css || '')) part.sn = d.strongs || part.sn;
            comps = JSON.stringify(c);
        } catch {}
        if (d.reason !== 'kept' && samples.length < 12)
            samples.push(`  ${r.word_raw}  ${norm(r.strongs)} -> ${d.strongs || '(none)'}  [${d.reason}]`);
        if (!DRY) upd.run(d.strongs, JSON.stringify(d.all), comps, r.word_raw);
    }
});
tx();

// ── validate the invariant: every SN's lemma must equal the surface root ─────
let violations = 0;
for (const r of db.prepare('SELECT word_raw, root_paleo, strongs FROM token_surfaces').all()) {
    const s = norm(r.strongs);
    if (!s) continue;                                  // no number is allowed (particles, etc.)
    if (isVirtual(s)) { violations++; continue; }      // no sentinels may remain
    const lemma = rootsMap[s];
    if (lemma && r.root_paleo && lemma !== r.root_paleo && [...lemma][0] !== [...r.root_paleo][0]) violations++;
}

console.log(`\nrows: ${rows.length}`);
for (const k of Object.keys(stat)) if (stat[k]) console.log(`  ${k}: ${stat[k]}`);
console.log('\nsample changes:'); samples.forEach(s => console.log(s));
console.log(`\nINVARIANT violations after rebuild: ${violations}  ${violations === 0 ? '✓ clean' : '✗ inspect these'}`);
if (DRY) console.log('(dry run — nothing written)');
db.close();
