#!/usr/bin/env node
/**
 * migrate-clean-lexicon-keys.js
 *
 * Rewrites lexicon JSON keys to the canonical form the server uses (_canonKey),
 * so the key that resolves a gloss is EXACTLY what the reader copies — a word
 * copied from any language will Ctrl-F-match its lexicon entry:
 *
 *   • sentence punctuation + editorial brackets stripped   (μου.  → μου)
 *   • Greek positional grave accents folded to acute        (καὶ   → καί)
 *   • case PRESERVED                                         (Καί ≠ καί)
 *
 * Script is auto-detected from the filename (greek/ge'ez/ethiopic/coptic/syriac/
 * latin/hebrew); anything else gets punctuation-stripping only.
 *
 * Usage:
 *   node migrate-clean-lexicon-keys.js [dir-or-file ...] [--in-place]
 *
 * With no args it processes ./lexicon/<lang>-lexicon.json. Without --in-place it
 * writes <file>.cleaned.json (safe to diff first); with --in-place it overwrites
 * and leaves a <file>.bak backup. Re-running is idempotent.
 *
 * Merge policy: if two raw keys canonicalize to the same key, the FIRST wins; the
 * dropped value is reported only when it differs (so you can reconcile by hand).
 * Keys beginning with "_" (e.g. "_doc") pass through untouched.
 */
'use strict';
const fs = require('fs');
const path = require('path');

// Mirror server.js _canonKey EXACTLY.
const STOPS = /[\u1360-\u1368\u00B7.,:;!?\u037E\u0387\u2026\u2024\[\]\u27e6\u27e7\u2e22\u2e23\u2e24\u2e25\u230a\u230b]/g;
const greekAcute    = s => s.normalize('NFD').replace(/\u0300/g, '\u0301').normalize('NFC');
const ethiopicStrip = s => s.replace(/[\u1360-\u1368]/g, '').trim();
// Square (modern) Hebrew → Paleo (U+10900): 22 consonants 1:1, finals fold to
// base, niqqud/cantillation/maqaf/sof-pasuq dropped, Paleo passes through.
const _HEB_TO_PALEO = (() => {
    const base = 'אבגדהוזחטיכלמנסעפצקרשת';
    const paleo = [...'𐤀𐤁𐤂𐤃𐤄𐤅𐤆𐤇𐤈𐤉𐤊𐤋𐤌𐤍𐤎𐤏𐤐𐤑𐤒𐤓𐤔𐤕'];
    const m = {};
    [...base].forEach((h, i) => { m[h] = paleo[i]; });
    for (const [f, b] of Object.entries({ 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' })) m[f] = m[b];
    return m;
})();
const squareToPaleo = s => {
    let out = '';
    for (const ch of String(s || '')) {
        if (_HEB_TO_PALEO[ch]) { out += _HEB_TO_PALEO[ch]; continue; }
        const cp = ch.codePointAt(0);
        if (cp >= 0x0591 && cp <= 0x05C7) continue;
        out += ch;
    }
    return out;
};

function scriptOf(file) {
    const b = path.basename(file).toLowerCase();
    if (b.includes('greek')) return 'greek';
    if (b.includes('geez') || b.includes("ge'ez") || b.includes('ethiopic')) return 'ethiopic';
    if (b.includes('coptic')) return 'coptic';
    if (b.includes('syriac')) return 'syriac';
    if (b.includes('latin')) return 'latin';
    if (b.includes('hebrew')) return 'hebrew';
    return 'generic';
}
function canonKey(script, s) {
    let w = String(s || '').normalize('NFC').replace(STOPS, '').trim();
    if (script === 'greek')    w = greekAcute(w);
    if (script === 'ethiopic') w = ethiopicStrip(w);
    if (script === 'hebrew')   w = squareToPaleo(w);   // app is Paleo-only
    return w;
}

function processFile(file, inPlace) {
    const script = scriptOf(file);
    let raw;
    try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { console.error(`\u2717 ${file}: parse failed \u2014 ${e.message}`); return; }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        console.error(`\u2717 ${file}: not a JSON object`); return;
    }

    const out = {};
    let changed = 0, merged = 0, conflicts = 0, dropped = 0;
    const log = [];
    for (const [k, v] of Object.entries(raw)) {
        if (k.startsWith('_')) { out[k] = v; continue; }          // meta passthrough
        const ck = canonKey(script, k);
        if (!ck) { dropped++; log.push(`  drop empty-after-clean: ${JSON.stringify(k)}`); continue; }
        if (ck !== k) changed++;
        if (ck in out) {
            merged++;
            if (out[ck] !== v) { conflicts++; log.push(`  conflict @ "${ck}": kept ${JSON.stringify(out[ck])}, dropped ${JSON.stringify(v)} (from "${k}")`); }
        } else {
            out[ck] = v;
        }
    }

    const before = Object.keys(raw).filter(k => !k.startsWith('_')).length;
    const after  = Object.keys(out).filter(k => !k.startsWith('_')).length;
    const json   = JSON.stringify(out, null, 2) + '\n';

    if (inPlace) {
        fs.copyFileSync(file, file + '.bak');
        fs.writeFileSync(file, json);
        console.log(`\u2713 ${path.basename(file)} [${script}] keys ${before}\u2192${after} | changed ${changed} merged ${merged} conflicts ${conflicts} dropped ${dropped} (backup ${path.basename(file)}.bak)`);
    } else {
        const dst = file.replace(/\.json$/, '.cleaned.json');
        fs.writeFileSync(dst, json);
        console.log(`\u2713 ${path.basename(file)} [${script}] keys ${before}\u2192${after} | changed ${changed} merged ${merged} conflicts ${conflicts} dropped ${dropped} \u2192 ${path.basename(dst)}`);
    }
    if (log.length) console.log(log.join('\n'));
}

function expand(args) {
    const files = [];
    for (const a of args) {
        if (fs.existsSync(a) && fs.statSync(a).isDirectory()) {
            for (const f of fs.readdirSync(a)) if (/-lexicon\.json$/.test(f)) files.push(path.join(a, f));
        } else if (fs.existsSync(a)) {
            files.push(a);
        } else {
            console.error(`(skip, not found) ${a}`);
        }
    }
    return files;
}

const argv = process.argv.slice(2);
const inPlace = argv.includes('--in-place');
let targets = argv.filter(a => !a.startsWith('--'));
if (!targets.length) targets = ['./lexicon'];
const files = expand(targets);
if (!files.length) { console.error('No *-lexicon.json files found.'); process.exit(1); }

console.log(`Cleaning ${files.length} lexicon file(s)${inPlace ? ' IN PLACE (with .bak backups)' : ' \u2192 *.cleaned.json'}\n`);
for (const f of files) processFile(f, inPlace);
console.log('\nReview the output (.cleaned.json or .bak), then deploy. Re-running is idempotent.');
