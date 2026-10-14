'use strict';
/**
 * lex-owner-lib.cjs — REPORT ONLY (2026-10-14). fieldy: "I never agreed for that stuff to be a
 * source of truth affecting my corpus. What I put in my lexicons/homographs are to be the source
 * of truth." A spelling-keyed lexicon gloss applies to EVERY Strong's spelled with those letters;
 * a Strong's-keyed homograph ("𐤀𐤌_H518") is how he gives one number its own gloss. `fits()` is
 * therefore always true — nothing here hides, resets or rewrites a gloss any more. What remains
 * is `contested()` / `review()`: a LIST for fieldy (server/lexicon-owner-review.txt) of spellings
 * whose gloss the Strong's dictionary does not name for one of its numbers. align-table.json is
 * not read at all.
 *
 * History (what this file USED to do, 2026-10-13 — retired):
 *
 * fieldy, Habakkuk 2:3 (2026-10-13): "I dont like the incorrect usage of 'Am' being translated
 * 'mother' despite my tokens disagreeing" / "i need a general solution, not a hotfix".
 *
 * lexicon/lexicon.json is keyed by SPELLING (𐤀𐤌 -> "mother"), but ~250 spellings are the root
 * of more than one Strong's number (𐤀𐤌 = H517 "mother" AND H518 "if/although"). Every lookup
 * that took the spelling's gloss for whatever Strong's the token carried put "mother" on
 * H518: 2,705 reading-text verses said "Am (mother)", only 29 of them have H517.
 *
 * Rule: the gloss belongs to the owner(s) whose OWN evidence names it — the Strong's dictionary
 * (strongs_def + kjv_def, strongs-hebrew-expanded.json) and the English the WEB's tagged OT
 * pairs with that number (align-table.json, p >= 0.05). Every owner with evidence keeps
 * it (H1/H2 "father": the Hebrew and Aramaic of one word); an owner is excluded only when it
 * has NO evidence for the gloss while another owner does. No evidence for ANY owner = all keep
 * it (fieldy's own coinages, e.g. 𐤀𐤕 "entirety", behave as before).
 *
 * Used by: gloss-resolver.cjs (the bake + server parse), server.js reGlossOne (live re-gloss),
 * merge-modforms.mjs (reading text), verify-reading-glosses.mjs (the parallel gate).
 * A spelling-keyed homograph entry is fieldy's explicit choice and is NOT subject to this.
 */
const fs = require('fs');
const path = require('path');
const J = f => { const p = [path.join(__dirname, 'lexicon', f), path.join(__dirname, f)].find(x => fs.existsSync(x)); try { return p ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; } catch { return null; } };

const STOP = new Set('the and for with from that this who which what are was were been being have has had his her its their our your you she they them him not but into onto unto upon made make one ones thing things picture also very used use idiom phrase such concept'.split(' '));
// irregular English forms a gloss and a dictionary entry name differently ("said" vs KJV "say"):
// without these, H559's own evidence never named its lexicon gloss "said" and the word was
// excluded from its own spelling (2026-10-14, Genesis 4:1 WaThaAmar showed the placeholder).
const IRREG = { said: 'say', saith: 'say', spoke: 'speak', spoken: 'speak', went: 'go', gone: 'go', came: 'come', saw: 'see', seen: 'see', gave: 'give', given: 'give', took: 'take', taken: 'take', made: 'make', knew: 'know', known: 'know', ate: 'eat', eaten: 'eat', bore: 'bear', born: 'bear', begot: 'beget', begotten: 'beget', brought: 'bring', sought: 'seek', taught: 'teach', thought: 'think', fought: 'fight', bought: 'buy', built: 'build', sent: 'send', spent: 'spend', kept: 'keep', slept: 'sleep', wept: 'weep', left: 'leave', felt: 'feel', dwelt: 'dwell', heard: 'hear', held: 'hold', told: 'tell', sold: 'sell', stood: 'stand', sat: 'sit', fell: 'fall', fallen: 'fall', rose: 'rise', risen: 'rise', drew: 'draw', drawn: 'draw', slew: 'slay', slain: 'slay', smote: 'smite', smitten: 'smite', wrote: 'write', written: 'write', drank: 'drink', drunk: 'drink', found: 'find', bound: 'bind', fled: 'flee', led: 'lead', fed: 'feed', met: 'meet', lay: 'lie', laid: 'lay', struck: 'strike', became: 'become', began: 'begin', begun: 'begin', chose: 'choose', chosen: 'choose', forgot: 'forget', forgave: 'forgive', hid: 'hide', hidden: 'hide', men: 'man', women: 'woman', children: 'child', feet: 'foot', teeth: 'tooth' };
const stem = w => { w = w.replace(/['’]s$/, ''); if (IRREG[w]) return IRREG[w]; return w.replace(/ies$/, 'y').replace(/(?<=[a-z]{3})s$/, ''); };
const wordsOf = s => (String(s || '').toLowerCase().match(/[a-z]+/g) || []);
/** a gloss's content words: "fire / offering made by fire" -> fire, offering */
const glossWords = g => [...new Set(wordsOf(String(g || '').replace(/\[[^\]]*\]/g, ' ').replace(/\([^()]*\)/g, ' ')).filter(w => w.length >= 3 && !STOP.has(w)).map(stem))];
const normH = s => (s ? 'H' + String(s).replace(/^H+/i, '') : '');

function loadOwnerEvidence(o = {}) {
    const ROOTS = o.roots || J('strongs-roots.json') || {};
    const DEF = o.defs || J('strongs-hebrew-expanded.json') || {};
    // evidence for the REVIEW list only: the Strong's dictionary. No learned table.
    const TAB = o.table || null;
    const owners = new Map();   // spelling -> Set(sn)
    for (const [sn, p] of Object.entries(ROOTS)) { if (!owners.has(p)) owners.set(p, new Set()); owners.get(p).add(sn); }
    const evCache = new Map();
    const evidence = sn => {
        if (evCache.has(sn)) return evCache.get(sn);
        const d = DEF[sn] || DEF[sn.replace(/[a-z]$/, '')] || {};
        const txt = `${d.strongs_def || ''} ${d.kjv_def || ''}`.toLowerCase().replace(/\[[^\]]*\]/g, ' ');
        const joined = txt.replace(/\(-/g, '').replace(/-\)/g, '').replace(/[()]/g, '');   // "to(-ward)" -> toward
        const set = new Set([...wordsOf(txt), ...wordsOf(joined)].map(stem));
        if (TAB && TAB.sn && TAB.sn[sn]) for (const [w, p] of Object.entries(TAB.sn[sn])) if (p >= 0.05) set.add(stem(w.toLowerCase()));
        evCache.set(sn, set); return set;
    };
    const fitCache = new Map();
    /** the owners of `spelling` that `gloss` belongs to; null = not a shared spelling */
    const fitting = (spelling, gloss) => {
        const own = owners.get(spelling);
        if (!own || own.size < 2 || !gloss) return null;
        const key = spelling + '\u0000' + gloss;
        if (fitCache.has(key)) return fitCache.get(key);
        const gw = glossWords(gloss);
        // a related form counts: sin/sinner, complete/completed, rest/resting (up to 4 more
        // letters either way) — leaning toward "this owner may keep it" is the safe side
        const near = (w, ev) => ev.has(w) || [...ev].some(e => e.length >= 3 && w.length >= 3 && (e.startsWith(w) ? e.length - w.length <= 4 : w.startsWith(e) && w.length - e.length <= 4 && e.length >= 4));
        // a Capitalised word no owner's evidence knows is fieldy's own Hebrew coinage ("Shabath /
        // Rest", "Idan / Eden"): it names the word family, so it counts for every owner
        //   (only the gloss's first segment: his coinage leads, "Holy / Set Apart" is English)
        const caps = new Set(glossWords((String(gloss).split(/\s[\/\-–]\s|\//)[0].match(/\b[A-Z][a-z]+/g) || []).join(' ')));
        const coined = gw.filter(w => caps.has(w) && ![...own].some(sn => near(w, evidence(sn))));
        const sc = [...own].map(sn => [sn, gw.filter(w => coined.includes(w) || near(w, evidence(sn))).length]);
        const best = Math.max(0, ...sc.map(x => x[1]));
        const out = best > 0 ? new Set(sc.filter(x => x[1] > 0).map(x => x[0])) : own;   // ANY evidence keeps it; none at all = every owner
        fitCache.set(key, out); return out;
    };
    /** may a token tagged `sn`, written `spelling`, show `gloss` (spelling-keyed)? — ALWAYS yes:
     *  fieldy's lexicon is the source of truth (2026-10-14). Kept so the callers need no change. */
    const fits = () => true;
    const _fitsRetired = (spelling, gloss, sn) => {
        if (!sn) return true;
        const f = fitting(spelling, gloss);
        if (!f) return true;
        const s = normH(sn);
        if (!owners.get(spelling).has(s) && !owners.get(spelling).has(s.replace(/[a-z]$/, ''))) return true;   // not an owner at all: other rules decide
        return f.has(s) || f.has(s.replace(/[a-z]$/, ''));
    };
    /** shared spellings whose lexicon gloss is NOT every owner's */
    const contested = lexicon => {
        const out = [];
        for (const [p, own] of owners) {
            if (own.size < 2 || !lexicon[p]) continue;
            const f = fitting(p, lexicon[p]);
            if (f.size === own.size) continue;
            out.push({ spelling: p, gloss: lexicon[p], fit: f, others: new Set([...own].filter(s => !f.has(s))) });
        }
        return out;
    };
    /** the review list: contested spellings minus owners fieldy already gave a homograph */
    const review = (lexicon, homographs = {}) => contested(lexicon)
        .map(x => ({ ...x, others: new Set([...x.others].filter(sn => !homographs[`${x.spelling}_${sn}`])) }))
        .filter(x => x.others.size);
    return { owners, fitting, fits, contested, review, glossWords };
}

let _shared = null;
/** one process-wide instance */
function shared() { return _shared || (_shared = loadOwnerEvidence()); }

module.exports = { loadOwnerEvidence, shared, glossWords };

