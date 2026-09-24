'use strict';
// ── DIVINE NAMES & TITLES OF YAH ────────────────────────────────────────────
// One detector, two consumers (added 2026-09-24, fieldy: "lets make Alahayam and
// all honorific titles of Yah golden like His name ... identify all divine titles
// of Yah with their verse references ... group them in their own tab ... instances
// throughout the entire corpus"):
//   1. /api/tokens marks every hit component with `divine` so the chip renderers
//      paint it gold (the same gold a proper noun like Yahawah already gets).
//   2. /api/divine-titles lists every title and every verse it occurs in, for the
//      Divine Titles tab on /lexicon-page.
// All data lives in lexicon/divine-titles.json (hot-reloaded on mtime) — this file
// only knows HOW to match. Input is one verse's tokens in reading order:
//   [{ ord, sn, raw, morph, pos, inferred }]   (sn '' / pos 'punct' = punctuation;
//   inferred: true for the HEB edition's alignment-projected tags — see surfaceCarriesRoot)
// Output: { hits: [{ id, kind, ords, gold }], falseGods: [{ ord, sn }] }.
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'lexicon', 'divine-titles.json');
let _cfg = { mtime: -1, data: null };

const normSn = s => (s ? 'H' + String(s).replace(/^H+/i, '') : '');

function compileConfig(raw) {
    const singles = (raw.singles || []).map(s => ({ ...s, sns: new Set((s.sns || []).map(normSn)) }));
    const singleBySn = new Map();
    for (const s of singles) for (const sn of s.sns) singleBySn.set(sn, s);
    const compounds = (raw.compounds || []).map(c => ({
        ...c,
        seq: (c.seq || []).map(m => new Set(m.map(normSn))),
        gold: Array.isArray(c.gold) ? new Set(c.gold) : null,
        onlyRefs: Array.isArray(c.only_refs) && c.only_refs.length ? new Set(c.only_refs) : null,
        once: !!c.once,
    })).sort((a, b) => b.seq.length - a.seq.length);   // longest match wins
    const fg = raw.false_god || {};
    const memberSns = new Set();
    for (const c of compounds) for (const m of c.seq) for (const sn of m) memberSns.add(sn);
    return {
        raw, singles, singleBySn, compounds, memberSns,
        falseGod: {
            sns: new Set((fg.sns || []).map(normSn)),
            pluralSns: new Set((fg.plural_sns || []).map(normSn)),
            next: new Set((fg.next_sns || []).map(normSn)),
            constructNext: new Set((fg.construct_next_sns || []).map(normSn)),
            prev: new Set((fg.prev_sns || []).map(normSn)),
            exclude: new Set(fg.exclude_refs || []),
            include: new Set(fg.include_refs || []),
        },
    };
}

function loadConfig() {
    try {
        const st = fs.statSync(CONFIG_PATH);
        if (st.mtimeMs !== _cfg.mtime) {
            _cfg = { mtime: st.mtimeMs, data: compileConfig(JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))) };
        }
    } catch (e) {
        if (!_cfg.data) _cfg = { mtime: -1, data: compileConfig({}) };
    }
    return _cfg.data;
}
function configMtime() { loadConfig(); return _cfg.mtime; }

// strongs-roots.json — for the HEB-edition surface check below.
const ROOTS_PATH = path.join(__dirname, 'lexicon', 'strongs-roots.json');
let _roots = { mtime: -1, data: {} };
function roots() {
    try {
        const st = fs.statSync(ROOTS_PATH);
        if (st.mtimeMs !== _roots.mtime) _roots = { mtime: st.mtimeMs, data: JSON.parse(fs.readFileSync(ROOTS_PATH, 'utf8')) };
    } catch { /* keep last */ }
    return _roots.data;
}

// The HEB edition (tokens_nt: NT, Apocrypha, Josephus) has morphology AND
// Strong's numbers that are both INFERRED by alignment — so "ha-knesiyot" (synagogues)
// comes through tagged H3071 and "sho'alim" (asking) tagged H410. For an
// inferred token (inferred: true), a title only counts when the written word, after at most three
// proclitic letters (w h b l k m sh), actually begins with the title's root
// (minus its last letter for 3+-letter roots, so construct Elohei/Eloheinu and
// Shaddai's forms still pass). BHS tokens carry an authoritative per-token tag
// and are never second-guessed.
const PROCLITICS = new Set(['\u{10905}', '\u{10904}', '\u{10901}', '\u{1090B}', '\u{1090A}', '\u{1090C}', '\u{10915}']);
function surfaceCarriesRoot(t) {
    if (!t.inferred || !t.raw) return true;
    const root = [...(roots()[t.sn] || '')];
    if (!root.length) return true;
    const need = (root.length >= 3 ? root.slice(0, -1) : root).join('');
    let w = [...t.raw];
    for (let k = 0; k <= 3; k++) {
        if (w.join('').startsWith(need)) return true;
        if (!w.length || !PROCLITICS.has(w[0])) break;
        w = w.slice(1);
    }
    return false;
}

const ARTICLE = 'H9009';
const isPunct = t => !t.sn || t.pos === 'punct';
// Plural El / Elah / Eloah — "elim", "elahin", "elahei". Morph when the table has
// it (BHS: nu=pl); the HEB edition's morph is only projected, so there use the
// written plural ending on El (𐤀𐤋𐤉𐤌 / 𐤀𐤋𐤉) — Elah's endings collide with "my God"
// (𐤀𐤋𐤄𐤉), so Elah/Eloah are only judged by morph.
function isPluralToken(t) {
    if (!t.inferred && /(^|\|)nu=pl(\||$)/.test(t.morph || '')) return true;
    if (t.sn === 'H410' && t.raw) return /\u{1090B}\u{10909}(\u{1090C})?$/u.test(t.raw);
    return false;
}

// "Elohei Mitsrayim" (gods of Egypt) vs "beit Elohai zahav" (the house of my God,
// gold ...): only a bare construct — st=c with no pronoun suffix — binds to the
// next noun. Inferred HEB-edition tokens (projected morph) never qualify: the NT
// says "the God of this people Israel" / "the God of the Gentiles too" of Yah
// himself, and a projected st=c can't tell those from "the gods of the nations".
function isTrueConstruct(t) {
    const m = t.morph || '';
    if (t.inferred) return false;
    if (!/(^|\|)st=/.test(m)) return true;
    return /(^|\|)st=c(\||$)/.test(m) && !/(^|\|)prs=(?!absent)/.test(m);
}

/**
 * Detect titles in one verse.
 * @param tokens  [{ord, sn, raw, morph, pos}] in reading order
 * @param ref     "book:chapter:verse" (used by only_refs / exclude_refs); may be null
 */
function detectVerse(tokens, ref, cfg = loadConfig()) {
    const content = [];
    for (const t of tokens) {
        if (isPunct(t)) continue;
        const tok = { ...t, sn: normSn(t.sn) };
        // An unverifiable HEB-edition tag stays a word (so it still breaks
        // adjacency) but can never match a title.
        if ((cfg.singleBySn.has(tok.sn) || cfg.memberSns.has(tok.sn)) && !surfaceCarriesRoot(tok)) tok.sn = 'H0';
        // A bare, morph-less plural-looking El (𐤀𐤋𐤉𐤌 / 𐤀𐤋𐤉) in the HEB edition is
        // as often "to me" / "asking" as "gods" — drop it rather than guess.
        else if (tok.inferred && tok.sn === 'H410' && isPluralToken(tok)) tok.sn = 'H0';
        content.push(tok);
    }
    const hits = [];
    const falseGods = [];
    const inCompound = new Set();          // content indexes claimed by a compound
    const usedOnce = new Set();            // ids of `once` compounds already matched here

    // 1) Compounds — at every start position the longest title wins. Titles may
    // CHAIN through a shared word ("Shaym Yahawah" + "Yahawah Alahay Yasharal" in
    // "the Name of Yahawah God of Israel" — both count); a title lying wholly
    // inside one already found ("Alahay Yasharal" inside "Yahawah Alahay
    // Yasharal") does not.
    const spans = [];
    const inside = idxs => spans.some(sp => idxs.every(x => sp.has(x)));
    for (let i = 0; i < content.length; i++) {
        let matched = null;
        for (const c of cfg.compounds) {
            if (c.onlyRefs && !(ref && c.onlyRefs.has(ref))) continue;
            if (c.once && usedOnce.has(c.id)) continue;
            let j = i; const idxs = [];
            let ok = true;
            for (let k = 0; k < c.seq.length; k++) {
                // Between members only: a bare article token (BHS splits ha- off) —
                // "Alahay HaAlahayam", "Alahay HaShamayam".
                if (k > 0) while (j < content.length && content[j].sn === ARTICLE) j++;
                if (j >= content.length || !c.seq[k].has(content[j].sn)) { ok = false; break; }
                idxs.push(j); j++;
            }
            if (ok && !inside(idxs)) { matched = { c, idxs }; break; }
        }
        if (!matched) continue;
        const { c, idxs } = matched;
        if (c.once) usedOnce.add(c.id);
        hits.push({
            id: c.id, kind: 'compound',
            ords: idxs.map(x => content[x].ord),
            gold: idxs.filter((_, k) => !c.gold || c.gold.has(k)).map(x => content[x].ord),
        });
        for (const x of idxs) inCompound.add(x);
        spans.push(new Set(idxs));
    }

    // 2) Singles — every listed number, minus words that name another god.
    const fg = cfg.falseGod;
    const neighbour = (i, dir) => {
        let j = i + dir;
        while (j >= 0 && j < content.length && content[j].sn === ARTICLE) j += dir;
        return content[j] || null;
    };
    for (let i = 0; i < content.length; i++) {
        const t = content[i];
        const single = cfg.singleBySn.get(t.sn);
        if (!single) continue;
        const key = ref ? `${ref}:${t.sn}` : null;
        let other = false;
        if (!inCompound.has(i) && fg.sns.has(t.sn)) {
            if (key && fg.include.has(key)) other = false;
            else if (key && fg.exclude.has(key)) other = true;
            else {
                const nx = neighbour(i, 1), pv = neighbour(i, -1);
                other = (fg.pluralSns.has(t.sn) && isPluralToken(t)) ||
                        !!(nx && fg.next.has(nx.sn)) ||
                        !!(nx && fg.constructNext.has(nx.sn) && isTrueConstruct(t)) ||
                        !!(pv && fg.prev.has(pv.sn));
            }
        }
        if (other) { falseGods.push({ ord: t.ord, sn: t.sn }); continue; }
        hits.push({ id: single.id, kind: 'single', ords: [t.ord], gold: [t.ord] });
    }
    return { hits, falseGods };
}

module.exports = { loadConfig, configMtime, detectVerse, normSn, CONFIG_PATH };
