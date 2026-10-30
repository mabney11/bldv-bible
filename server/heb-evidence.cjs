// heb-evidence.cjs — does a verse's ORIGINAL English support a Strong's reading?
//
// fieldy, 2026-10-29: "we were supposed to harden so i dont advertise tokens that arent there --
// lets stop trying to hot fix and get a real solution". The HEB edition (NT / Apocrypha / Works)
// has no tagging of its own: every Strong's there is inferred from the SPELLING. This module is the
// one place that judges such an inferred tag against the verse's own English, used by
//   heb-align.js          — per occurrence, switch to the reading the English names (reported);
//   build-surface-index.js — the `evidence` of every HEB occurrence (badges mark guesses).
//
// The English PROFILE of a Strong's number is built only from published evidence, never a learned
// model (his rule, 2026-10-14): the WEB's own Strong's-tagged OT English (web-strongs.jsonl — a stem
// counts if it is in >= 12% of that number's segments), plus HIS lexicon / homograph gloss for the
// number's root; the Strong's dictionary (kjv_def) only for a number the WEB never uses.
// A profile is judged against its BASE RATE (share of random NT/Apocrypha verses that contain it), so
// everyday vocabulary cannot win by chance: base >= 0.25 = the English cannot judge it ('function').
'use strict';
const fs = require('fs');

// identical to heb-align.js stemWord() and audit-heb-vs-english.py stem()
const STEM_SUFS = ['ings', 'ing', 'edly', 'ed', 'es', 's', 'ly', 'ness', 'ment'];
function stemWord(w) {
    w = w.toLowerCase();
    for (const suf of STEM_SUFS) {
        if (w.length > suf.length + 3 && w.endsWith(suf)) { w = w.slice(0, -suf.length); break; }
    }
    return w.slice(0, 6);
}
const STOP = new Set(`a an the and of to in on at by for with from as is be are was were it its this that these those
he she they we you me my his her their our your him them us one ones thing things idiom phrase especially etc used
use shall will would should may might can could have has had did does do being been am into onto upon unto out up
down over under off all any not no nor so then when who whom whose what which also even very said
say says saying thus therefore because if but or yet now let make made let`.split(/\s+/));
// NOT stop words: here / there / now / where — they ARE the meaning of hennah H2008 "hither", sham H8033
// "there", attah H6258 "now", ayeh "where" (John 4:15 "come here to draw" read hinneh "behold", 2026-10-29);
// the base-rate test keeps them from deciding anything on their own
// EVIDENCE stems: stemWord, a trailing e dropped, first 5 letters — so word forms meet
// ("scribes"/"scribe" -> scrib, "faith"/"faithful" -> faith, "believe"/"believed" -> belie)
// a short word keeps its final e: "here" must not become "her" (the pronoun) — hennah H2008
const evStem = w => { const s = stemWord(w); return (s.length > 4 ? s.replace(/e$/, '') : s).slice(0, 5); };
// keep only the English of a "word (gloss)" pair: Josephus / 2 Esdras / the Works Library text_src
// is an earlier render, and a transliteration must never count as English
const englishOnly = t => String(t || '').replace(/[A-Za-z\u{10900}-\u{1091F}'’-]+\s*\(([^()]*)\)/gu, ' $1 ');
const stemsOf = t => new Set((englishOnly(t).match(/[A-Za-z]{2,}/g) || []).filter(w => !STOP.has(w.toLowerCase())).map(evStem));
const contentStems = t => new Set((String(t || '').replace(/\[[^\]]*\]/g, ' ').match(/[A-Za-z]{2,}/g) || [])
    .filter(w => !STOP.has(w.toLowerCase())).map(evStem));
const H = s => (s ? 'H' + String(s).replace(/^[Hh]+/, '') : '');

/**
 * @param o.webStrongsPath  web-strongs.jsonl
 * @param o.strongsDict     { H123: {strongs_def, kjv_def} }
 * @param o.strongsRoots    { H123: paleo root }
 * @param o.lexicon         his lexicon.json (paleo -> gloss)
 * @param o.homographs      his homographs.json (paleo_H123 -> gloss)
 * @param o.sampleTexts     English of NT/Apocrypha verses (base rates)
 * @param o.nameMap         name-map-expanded.json ({single, theonyms}) — the English's name forms
 */
function buildEvidence(o) {
    // The NT/Apocrypha English carries names and divine titles through HIS name map ("Lord" ->
    // "Adanay", "God" -> "Alahayam", "Moses" -> "Mashah"), so a profile also holds the mapped form
    // of every English word in it (name-map-expanded.json single + theonyms, word by word).
    const nm = o.nameMap || {};
    const mapWord = new Map();
    for (const tbl of [nm.single || {}, nm.theonyms || {}])
        for (const [k, v] of Object.entries(tbl)) if (!/\s/.test(k) && typeof v === 'string') mapWord.set(k, v);
    const withMapped = (text) => {
        let t = String(text || '');
        if (!mapWord.size) return t;
        const extra = [];
        for (const w of t.match(/[A-Za-z]+/g) || []) { const m = mapWord.get(w); if (m) extra.push(m); }
        return extra.length ? t + ' ' + extra.join(' ') : t;
    };
    const segs = new Map(), cnt = new Map(), segStems = new Map();
    for (const line of fs.readFileSync(o.webStrongsPath, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        let d; try { d = JSON.parse(line); } catch { continue; }
        for (const s of d.segments || []) {
            const sn = H(s.sn);
            if (!sn) continue;
            segs.set(sn, (segs.get(sn) || 0) + 1);
            if (!cnt.has(sn)) cnt.set(sn, new Map());
            const c = cnt.get(sn);
            const ss = contentStems(withMapped(s.text));
            for (const st of ss) c.set(st, (c.get(st) || 0) + 1);
            if (!segStems.has(sn)) segStems.set(sn, []);
            segStems.get(sn).push(ss);
        }
    }
    const dict = o.strongsDict || {}, roots = o.strongsRoots || {}, lex = o.lexicon || {}, homo = o.homographs || {};
    const _prof = new Map();
    const prof = (sn0) => {
        const sn = H(sn0);
        if (_prof.has(sn)) return _prof.get(sn);
        const out = new Set();
        const c = cnt.get(sn), n = segs.get(sn) || 0;
        if (c) for (const [st, k] of c) if (k >= Math.max(2, 0.12 * n)) out.add(st);
        const rp = roots[sn] || roots[sn.slice(1)];
        // his Strong's-keyed homograph is THIS number's gloss; the spelling-keyed lexicon gloss only when
        // there is none (𐤄𐤍𐤄 "Behold" must not enter H2008 hennah "here" once 𐤄𐤍𐤄_H2008 exists)
        const hg = rp && homo[`${rp}_${sn}`];
        for (const g of [hg || (rp && lex[rp])])
            if (typeof g === 'string' && !/[\u{10900}-\u{1091F}]/u.test(g)) for (const st of contentStems(g)) out.add(st);
        if (!out.size) {
            const e = dict[sn] || dict[sn.slice(1)] || {};
            for (const st of contentStems(String(e.kjv_def || '').replace(/\([^)]*\)/g, ' '))) out.add(st);
        }
        _prof.set(sn, out);
        return out;
    };
    // How well a profile predicts its own number where the tag is KNOWN (the WEB's tagged OT):
    // share of the number's segments whose English holds a profile stem. A particle ("to",
    // "upon", the object marker) has almost no content English — the English cannot judge it.
    const _self = new Map();
    const selfRate = (sn0) => {
        const sn = H(sn0);
        if (_self.has(sn)) return _self.get(sn);
        const list = segStems.get(sn) || [], p = prof(sn);
        let k = 0;
        for (const ss of list) { for (const st of ss) if (p.has(st)) { k++; break; } }
        const r = list.length ? k / list.length : 0;
        _self.set(sn, r);
        return r;
    };
    // The app's own transliteration of a number (the English carries names and divine titles
    // transliterated: "Alahayam", "Yashawai"), added by the caller from the readings it built.
    const _tl = new Map();   // sn -> the transliteration stems added for it
    const addTranslit = (sn0, word) => {
        const sn = H(sn0), w = String(word || '').replace(/[^A-Za-z]/g, '');
        if (!sn || w.length < 3) return;
        prof(sn).add(evStem(w));
        if (!_tl.has(sn)) _tl.set(sn, new Set());
        _tl.get(sn).add(evStem(w));
        _base.delete(sn);
    };
    const isName = (sn0) => {
        const e = dict[H(sn0)] || dict[H(sn0).slice(1)] || {};
        return /^[A-Z]/.test(String(e.strongs_def || '').trim());
    };
    const sample = (o.sampleTexts || []).map(stemsOf);
    const _base = new Map();
    const base = (sn0) => {
        const sn = H(sn0);
        if (_base.has(sn)) return _base.get(sn);
        const p = prof(sn);
        let b = 1;
        if (p.size && sample.length) { let k = 0; for (const vs of sample) { for (const st of p) if (vs.has(st)) { k++; break; } } b = k / sample.length; }
        _base.set(sn, b);
        return b;
    };
    const hits = (sn, vs) => { for (const st of prof(sn)) if (vs.has(st)) return true; return false; };
    // the verse names sn with an English the WEB itself uses for it (>= 5% of its tagged segments: yashab
    // "sat" is 7%, John 4:6) —
    // not only a word from a gloss: his lexicon's 𐤔𐤌 "place" must not turn shammah "there" into
    // sum "set" (John 4:20 "the place where people ought to worship", 2026-10-29)
    const hitsTagged = (sn0, vs) => { const sn = H(sn0), c = cnt.get(sn), n = segs.get(sn) || 0;
        if (c) for (const [st, k] of c) if (k >= Math.max(2, 0.05 * n) && vs.has(st)) return true; return false; };
    const virtual = sn => { const n = parseInt(String(sn).replace(/^[Hh]/, ''), 10); return !isNaN(n) && n >= 9000; };

    /**
     * judge(chosen, candidates (array or () => array), vs[, spellingAgree[, exactAlt]]) -> { evidence, switchTo? }
     *   evidence: 'english'     the verse's English names the chosen reading
     *             'function'    everyday vocabulary — the English cannot judge it
     *             'name'        a name (the English carries names transliterated)
     *             'no-english'  the verse has no English
     *             'guess'       other readings exist and the English names none of them
     *             'unconfirmed' the only reading, and the English does not name it
     *   switchTo: another candidate the English names while it does not name the chosen one
     *             (only a non-name, judgeable reading; and, given spellingAgree(sn) -> share of
     *             the spelling's verses naming sn, never one that fits the spelling worse overall)
     */
    // exactAlt(sn): sn is an attested reading of this EXACT spelling (the OT writes these letters
    // with that number — 𐤄𐤌𐤃𐤁𐤓 is both ha-midbar H4057 and ha-medabber H1696). Such a reading is
    // a proven homograph, not a coincidence, so the verse's own English decides it (John 4:26).
    // near-twins (Hebrew shatah / Aramaic shetah, qedem / qodam): when two readings share
    // most of their English, the English cannot tell them apart
    // Transliterations do not count: homographs of one spelling share it by definition (𐤄𐤍𐤄
    // "hanah" for both hinneh H2009 and hennah H2008 made them twins — John 4:15, 2026-10-29)
    const twins = (a, b) => {
        const ta = _tl.get(H(a)) || new Set(), tb = _tl.get(H(b)) || new Set();
        const P = [...prof(a)].filter(x => !ta.has(x) && !tb.has(x)), Q = new Set([...prof(b)].filter(x => !ta.has(x) && !tb.has(x)));
        let k = 0; for (const x of P) if (Q.has(x)) k++;
        return k / Math.max(1, Math.min(P.length, Q.size)) >= 0.5; };
    // specific enough for a witness to judge: a profile, rare in ordinary verses, and it predicts its own OT tags
    const judgeable = sn => !virtual(sn) && prof(sn).size > 0 && base(sn) < 0.25 && selfRate(sn) >= 0.5;
    function judge(chosen0, candidates, vs, spellingAgree, exactAlt) {
        const chosen = H(chosen0);
        if (!vs || !vs.size) return { evidence: 'no-english' };
        if (!chosen || virtual(chosen)) return { evidence: 'function' };
        if (isName(chosen)) return { evidence: 'name' };
        // near-twins (Hebrew shatah / Aramaic shetah, qedem / qodam): when two readings share
        // most of their English, the English cannot tell them apart
        // Transliterations do not count: homographs of one spelling share it by definition (𐤄𐤍𐤄
        // "hanah" for both hinneh H2009 and hennah H2008 made them twins — John 4:15, 2026-10-29)
        if (!judgeable(chosen)) return { evidence: 'function' };
        if (hits(chosen, vs)) return { evidence: 'english' };
        const cl = typeof candidates === 'function' ? candidates() : candidates;   // lazy: only needed here
        const others = [...new Set((cl || []).map(H))].filter(s => s && s !== chosen && !virtual(s));
        // a REPLACEMENT may be everyday vocabulary ("speak", "go") — only the current reading must be
        // specific enough to judge; chance hits are what the spelling-level test below is for
        // (2026-10-29: H1696 "speak" had base ~0.3 and could never replace ha-midbar in John 4:26)
        // A reading the OT writes with these exact letters (exactAlt) is proven, so its English need only
        // be usual for it, not dominant: hennah H2008 "here" is said "here" in ~42% of its verses (also
        // "hither", "this side", "until now") — John 4:15 "come here to draw" (2026-10-29)
        const candidateOk = sn => prof(sn).size && base(sn) < 0.5
            && selfRate(sn) >= (exactAlt && exactAlt(sn) ? 0.3 : 0.5);
        // a candidate is named by its profile OR by any English the WEB uses for it in >= 5% of its verses
        // (yashab H3427 "sat", 7% — below the profile's 12%; John 4:6 "sat down by the well")
        const named = others.filter(s => !isName(s) && candidateOk(s) && (hits(s, vs) || hitsTagged(s, vs)) && !twins(chosen, s)
            // the SPELLING's verses must back it too — one verse alone is a coincidence. Either the
            // new reading clearly beats the current one across the spelling (lift >= 0.3, and >= 0.3
            // more), or the spelling is a TRUE HOMOGRAPH: both readings fit a real share of its verses
            // (each lift >= 0.2: ha-midbar "the wilderness" / ha-medabber "the one speaking", John 4:26)
            // and each verse's own English decides (2026-10-29).
            && (!spellingAgree || (exactAlt && exactAlt(s) && hitsTagged(s, vs)) || (() => {
                const l1 = spellingAgree(s) - base(s), l0 = spellingAgree(chosen) - base(chosen);
                return (l1 >= 0.3 && l1 - l0 >= 0.3) || (l1 >= 0.2 && l0 >= 0.2);
            })()))
            .sort((a, b) => base(a) - base(b));
        if (named.length) return { evidence: 'english', switchTo: named[0] };
        return { evidence: others.length ? 'guess' : 'unconfirmed' };
    }
    return { prof, base, selfRate, isName, judgeable, twins, hits, hitsTagged, judge, addTranslit, stemsOf, stemWord, englishOnly };
}

module.exports = { buildEvidence, stemWord, evStem, stemsOf, englishOnly };
