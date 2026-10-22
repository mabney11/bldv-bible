'use strict';
// stem-split.cjs — PREFIX / STEM LETTERS INSIDE A ROOT CHIP (fieldy, 2026-10-22)
//
// "yes they need to be fixed -- these are things that should already be established as my
// baseline". A root chip must hold the Strong's root (lexicon/strongs-roots.json); letters in
// front of it that are a modification become chips with the label your one-letter-one-meaning
// table gives them (build-surface-index / server.js FLAT_PREFIX):
//   proclitics (only where nothing is split yet — the HEB edition's fallback readings):
//     𐤅 [And] · 𐤔 [who] · 𐤁 [in] 𐤋 [to] 𐤊 [as] 𐤌 [from] · 𐤄 [The] (a noun / participle)
//   verb prefixes and stems:
//     𐤉 [He/it] 𐤕 [She/it] 𐤀 [I] 𐤍 [We] (imperfect person; Nifal 𐤍) · 𐤌 [One who] (participle)
//     𐤄 [Causing] (Hiphil / Nifal infinitive 𐤄) · 𐤄𐤕 𐤀𐤕, and 𐤕 after a prefix, [Reflexive]
// What is NOT a modification stays with the root: a vowel letter after the prefix (𐤀|𐤉𐤕𐤌𐤌,
// Hophal 𐤄|𐤅𐤇𐤃𐤃, plene 𐤉|𐤉𐤔𐤕𐤄), a noun's own spelling (𐤉𐤂𐤁𐤉𐤌 "plowmen"), a name, anything
// the rules below do not recognise. Nothing is ever dropped: the letters only move into chips.
//
// Morphology decides where it is known (BHS, and HEB words read from BHS: tier exact / plene /
// reconstructed); the letters decide for the HEB edition's fallback readings.

const W = s => [...s];
const VERB_DEF = /^(\([^)]*\)\s*)?(properly,?\s*)?to\s/i;

function makeSplitter({ strongsRoots, strongsDict, flatPrefix, surfaces }) {
    const ROOT = new Map();
    for (const [sn, p] of Object.entries(strongsRoots || {})) if (typeof p === 'string' && p && !sn.startsWith('_')) ROOT.set('H' + String(sn).replace(/^H+/i, ''), p);
    const VERBS = new Set(), NAMES = new Set();
    for (const [sn, e] of Object.entries(strongsDict || {})) {
        const d = String((e && e.strongs_def) || '').trim(), k = 'H' + String(sn).replace(/^H+/i, '');
        if (VERB_DEF.test(d)) VERBS.add(k);
        if (/^[A-Z]/.test(d)) NAMES.add(k);
    }
    // every ordinary (non-name) Strong's root spelling -> its numbers: a chip whose own opening
    // letters already spell ANOTHER word (𐤊𐤓𐤎𐤌 kirsem tagged H7450, 𐤌𐤔𐤊𐤍𐤅𐤕 mishkan tagged H3675) is
    // a wrong Strong's upstream, not a prefix — left alone and listed
    const WORD = new Map();
    for (const [sn, p] of ROOT) if (!NAMES.has(sn)) { if (!WORD.has(p)) WORD.set(p, new Set()); WORD.get(p).add(sn); }
    // the chip the index already gives each (css, letters) — the most common one — so a new chip
    // looks like every other chip of its kind (colour, gloss, translit casing)
    const CHIP = new Map();
    {
        const cnt = new Map();
        for (const v of surfaces || []) {
            let cs; try { cs = JSON.parse(v.components_json || '[]'); } catch { continue; }
            for (const c of cs) {
                if (!c || !c.paleo || !/^(mod-conj|mod-art|mod-prep|pfm-|vbs-)/.test(c.css || '')) continue;
                const k = c.css + '|' + c.paleo, j = JSON.stringify({ translit: c.translit || '', translation: c.translation || '' });
                const m = cnt.get(k) || new Map(); m.set(j, (m.get(j) || 0) + 1); cnt.set(k, m);
            }
        }
        for (const [k, m] of cnt) CHIP.set(k, JSON.parse([...m].sort((a, b) => b[1] - a[1])[0][0]));
    }
    const FP = flatPrefix || {};
    const chip = (paleo, css, label) => {
        const base = CHIP.get(css + '|' + paleo) || {};
        return { paleo, translit: base.translit || '', translation: label || base.translation || '', css, stemSplit: true };
    };
    const PREP = { '𐤁': 'in', '𐤋': 'to/towards', '𐤊': 'as', '𐤌': 'from', '𐤔': 'who' };
    // the preposition's own sense (the index's most common 𐤁 chip is "within him", from 𐤁𐤅 words)
    const prep = l => chip(l, 'mod-prep', PREP[l]);
    const flat = (l, css, extra = {}) => ({ ...chip(l, css, FP[l] ? `[${FP[l]}]` : ''), ...extra });
    const PFM_CSS = { '𐤉': 'pfm-3ms', '𐤕': 'pfm-2or3f', '𐤀': 'pfm-1cs', '𐤍': 'pfm-1cp' };
    const stat = { surfaces: 0, chips: 0, by: new Map(), ex: [], mistag: [] };

    function split(v, source) {
        let cs; try { cs = JSON.parse(v.components_json || '[]'); } catch { return false; }
        if (!Array.isArray(cs)) return false;
        const ri = cs.findIndex(c => c && c.css === 'root');
        if (ri < 0 || /nmpr/.test(v.pos || '')) return false;
        const sn = 'H' + String(v.strongs || '').replace(/^H+/i, '');
        const can = W(ROOT.get(sn) || '');
        const rp = W(cs[ri].paleo || '');
        if (!can.length || rp.length < 2 || rp[0] === can[0]) return false;
        // the first place the Strong's root starts and the rest still spells it
        let k = -1;
        for (let i = 1; i <= Math.min(4, rp.length - 1) && k < 0; i++) {
            if (rp[i] !== can[0]) continue;
            let q = 0; for (const ch of rp.slice(i)) if (q < can.length && ch === can[q]) q++;
            if (q === can.length) k = i;
        }
        if (k < 0) return false;
        const lead = rp.slice(0, k);
        const m = Object.fromEntries(String(v.morph || '').split('|').filter(x => x.includes('=')).map(x => x.split('=')));
        const vs = m.vs && m.vs !== 'absent' ? m.vs : '', vt = m.vt && m.vt !== 'absent' ? m.vt : '';
        const isVerb = /verb/.test(v.pos || '') || VERBS.has(sn);
        // (only where no morphology vouches for the form — a tagged imperfect 𐤀𐤃𐤓𐤔 is "I will seek")
        if (!vs && !vt)
            for (let L = rp.length; L >= k + 2; L--) {
                const w = WORD.get(rp.slice(0, L).join(''));
                if (w && !w.has(sn)) { if (stat.mistag.length < 2000) stat.mistag.push(`${v.word_raw}\t${sn}\t${rp.slice(0, L).join('')} is ${[...w].join('/')}`); return false; }
            }

        const before = cs.slice(0, ri);
        const hasPfm = before.some(c => /^(pfm-|vbs-)/.test((c && c.css) || ''));
        // the HEB edition's own fallback readings may carry proclitics; a reading taken from BHS
        // (exact / plene / reconstructed) never does — the OT splits them as tokens
        const procZone = source !== 'BHS' && !before.length && !/^(exact|plene|reconstructed)$/.test(v.tier || '');
        const reflexiveStem = /^(hit|htp|hotp|hsht|etp|itp|htt)/.test(vs);
        const out = []; let i = 0;
        if (procZone) {
            if (lead[i] === '𐤅') { out.push(chip('𐤅', 'mod-conj', (CHIP.get('mod-conj|𐤅') || {}).translation || 'And')); i++; }
            if (lead[i] === '𐤔' && i < lead.length) { out.push(prep('𐤔')); i++; }
            if (i < lead.length && '𐤁𐤋𐤊'.includes(lead[i])) { out.push(prep(lead[i])); i++; }
            else if (lead[i] === '𐤌' && !(isVerb && i === lead.length - 1)) { out.push(prep('𐤌')); i++; }   // 𐤌 right before a verb root is its participle
            // Mishnaic 𐤊𐤔 / 𐤌𐤔 "when / since": 𐤔 after the preposition
            if (lead[i] === '𐤔' && out.some(c => c.css === 'mod-prep') && !out.some(c => c.paleo === '𐤔')) { out.push(prep('𐤔')); i++; }
            if (lead[i] === '𐤄') {
                // the article on a noun or participle; on a verb after a preposition, or before more
                // stem letters, or in a non-participle form, it is the verb's own 𐤄 (below)
                const afterPrep = out.some(c => c.css === 'mod-prep');
                const stem = isVerb && (afterPrep || i < lead.length - 1 || (vt && !/^ptc/.test(vt)));
                if (!stem) { out.push(chip('𐤄', 'mod-art', (CHIP.get('mod-art|𐤄') || {}).translation || 'The')); i++; }
            }
        }
        if (isVerb && i < lead.length) {
            const two = (lead[i] || '') + (lead[i + 1] || '');
            if ((two === '𐤄𐤕' || two === '𐤀𐤕') && !hasPfm) { out.push(flat(two, 'vbs-hit')); i += 2; }
            else if (!hasPfm && '𐤉𐤕𐤀𐤍'.includes(lead[i]) && (!vt || /^(impf|wayq|juss|coho|impv)/.test(vt) || (lead[i] === '𐤍' && /^nif/.test(vs)))) {
                out.push(flat(lead[i], lead[i] === '𐤍' && /^nif/.test(vs) ? 'vbs-nif' : PFM_CSS[lead[i]])); i++;
                if (lead[i] === '𐤕' && (!vs || reflexiveStem)) { out.push(flat('𐤕', 'vbs-hit', { translation: '[Reflexive]', infixed: true })); i++; }
            }
            else if (!hasPfm && lead[i] === '𐤌') {
                out.push(flat('𐤌', 'pfm-ptcp')); i++;
                if (lead[i] === '𐤕' && (!vs || reflexiveStem)) { out.push(flat('𐤕', 'vbs-hit', { translation: '[Reflexive]', infixed: true })); i++; }
            }
            else if (!hasPfm && lead[i] === '𐤄') {
                out.push(flat('𐤄', 'vbs-hif')); i++;
                if (lead[i] === '𐤍') { out.push(flat('𐤍', 'vbs-nif')); i++; }
            }
            else if (!hasPfm && lead[i] === '𐤍' && (!vs || /^nif/.test(vs))) { out.push(flat('𐤍', 'vbs-nif')); i++; }
            else if (hasPfm && lead[i] === '𐤕' && (reflexiveStem || (!vs && source !== 'BHS'))) { out.push(flat('𐤕', 'vbs-hit', { translation: '[Reflexive]', infixed: true })); i++; }
            else if (hasPfm && lead[i] === '𐤄' && /^(hif|haf)/.test(vs)) { out.push(flat('𐤄', 'vbs-hif')); i++; }
        }
        if (!out.length) return false;
        const root = { ...cs[ri], paleo: [...lead.slice(i), ...rp.slice(k)].join(''), translit: '' };   // build-surface-index re-spells blank translits in the word
        cs.splice(ri, 1, ...out, root);
        v.components_json = JSON.stringify(cs);
        stat.surfaces++; stat.chips += out.length;
        const key = out.map(c => c.paleo).join('+'); stat.by.set(key, (stat.by.get(key) || 0) + 1);
        if (stat.ex.length < 8) stat.ex.push(`${v.word_raw} → ${cs.map(c => c.paleo).join(' + ')}`);
        return true;
    }
    return { split, stat };
}
module.exports = { makeSplitter };
