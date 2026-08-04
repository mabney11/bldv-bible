'use strict';
/**
 * gloss-resolver.cjs — ONE curated-gloss lookup for the whole app.
 *
 * WHY THIS FILE EXISTS
 * The same lookup was written three times (build-surface-index.js, server.js
 * parseHebrewData, apply-web-strongs.mjs) and the copies had drifted apart:
 *   • the bake consulted hebrew-extra-lexicon.json; server.js did not, so a
 *     live-parsed chapter silently lost those glosses
 *   • the bake fell through to Strong's kjv_def; server.js did not, so the same
 *     word read differently depending on which path served it
 * Two implementations of one rule is how every other bug in this app started.
 *
 * WHAT COUNTS AS CURATED
 * fieldy's own files, and only those: homographs.json, lexicon.json,
 * hebrew-extra-lexicon.json (its entries shipped blank — everything populated in
 * it was typed by him). Anything else is UNCURATED and must say so, so the
 * reader can show a placeholder instead of pretending to know.
 *
 * Every result carries `src`, so provenance survives into the baked components
 * and the decision to SHOW or HIDE an uncurated gloss can be made at render
 * time — no rebuild to change your mind.
 */

const CURATED_SRC = new Set(['homograph', 'lexicon', 'heb-extra']);

/** Plene/defective tolerance: doubled yod U+10909 / waw U+10905 collapse. */
const collapseMatres = s => String(s || '')
    .replace(/\u{10909}\u{10909}+/gu, '\u{10909}')
    .replace(/\u{10905}\u{10905}+/gu, '\u{10905}');

const normH = s => (s ? 'H' + String(s).replace(/^H+/, '') : '');

/**
 * @param {object} o
 * @param {object} [o.homographs]  homographs.json          (curated)
 * @param {object} [o.lexicon]     lexicon.json             (curated)
 * @param {object} [o.hebExtra]    hebrew-extra-lexicon.json(curated)
 * @param {(sn:string)=>string|null} [o.uncurated]  e.g. Strong's kjv_def. Consulted
 *        LAST and only when `allowUncurated` is true. Its text is always labelled
 *        src:'kjv' so a caller can strip or grey it without re-deriving anything.
 * @param {boolean} [o.allowUncurated=false]
 * @returns {(q:{sn?:string, snKeys?:string[], roots?:string[]}) => {text:string, src:string}}
 */
function createGlossResolver(o = {}) {
    const {
        homographs = {}, lexicon = {}, hebExtra = {},
        uncurated = null, allowUncurated = false,
    } = o;

    /**
     * @param {object} q
     * @param {string}   [q.sn]      Strong's number for this component
     * @param {string[]} [q.snKeys]  Strong's-derived homograph keys, MOST SPECIFIC
     *                               FIRST (H123_vs_vt, H123_vs, H123_vt, H123_pdp, H123)
     * @param {string[]} [q.roots]   paleo keys, MOST SPECIFIC FIRST
     *                               (exact surface, then root, then display root)
     */
    return function resolveGloss(q = {}) {
        const snKeys = (q.snKeys || []).filter(Boolean);
        const roots  = (q.roots  || []).filter(Boolean);

        // Exact forms are tried before matres-collapsed ones throughout, so a
        // precise curated entry is never overridden by the collapse.
        const withPlene = keys => {
            const out = [];
            for (const k of keys) { out.push(k); const p = collapseMatres(k); if (p !== k) out.push(p); }
            return out;
        };

        // 1. Strong's-keyed homographs — the whole point of a homograph entry is
        //    that the number disambiguates what the letters cannot.
        for (const k of snKeys) if (homographs[k]) return { text: homographs[k], src: 'homograph' };

        // 2. Paleo-keyed homographs.
        for (const k of withPlene(roots)) if (homographs[k]) return { text: homographs[k], src: 'homograph' };

        // 3. lexicon.json, then the HEB edition's own lexicon. Both curated.
        for (const k of withPlene(roots)) if (lexicon[k])  return { text: lexicon[k],  src: 'lexicon'   };
        for (const k of withPlene(roots)) if (hebExtra[k]) return { text: hebExtra[k], src: 'heb-extra' };

        // 4. Uncurated dictionary text, only if the caller opted in.
        if (allowUncurated && uncurated && q.sn) {
            const t = uncurated(normH(q.sn));
            if (t) return { text: t, src: 'kjv' };
        }

        // 5. Nothing curated covers this word. The caller renders bare paleo.
        return { text: '', src: 'none' };
    };
}

module.exports = { createGlossResolver, CURATED_SRC, collapseMatres, normH };
