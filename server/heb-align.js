'use strict';
const { progress } = require('./progress.cjs');
/**
 * heb-align.js — build fully-qualified HEB (extra) whole-word surfaces from BHS.
 *
 * WHY THIS EXISTS
 * The HEB edition is UNSEGMENTED: one word per orthographic word, proclitics and
 * suffixes attached. BHS is SEGMENTED: 𐤄𐤌𐤔𐤉𐤇 is [𐤄 art] + [𐤌𐤔𐤉𐤇 subs H4899].
 * surface-index.db is keyed one BHS token at a time, so a prefixed HEB word never
 * matched and rendered as one undivided blob.
 *
 * For the OT the two editions are THE SAME TEXT, so we don't surface-match — we
 * align verse by verse. A HEB word equals a RUN of consecutive BHS tokens, and
 * that run carries every morpheme's pos/morph/strongs/lemma, attested per
 * occurrence. Measured on the real corpus (probe-heb-align v7): 99.4% of 306,796
 * OT words align. The 0.6% that don't are ketiv/qere and genuine textual
 * differences between the editions — no rule closes those and none is attempted.
 *
 * The OT pass yields a table keyed by WHOLE-WORD forms with affixes intact —
 * the shape the NT is actually written in — so the NT inherits qualification
 * with no new tagging: 88.8% of 95,105 NT words, in tiers of decreasing
 * attestation (see TIERS).
 *
 * TIERS (recorded on every row; nothing is silently mixed)
 *   exact         BHS run concatenates to the HEB word letter for letter
 *   reconstructed the run plus a tail the last token's MORPH implies (BHS keeps
 *                 the pronominal suffix in the morph, not always in word_raw)
 *   plene         differs only by a mater lectionis (fenced: >=3 consonants
 *                 remaining, shared first letter, <=2 letters of difference)
 *   adjacent      NT only — the solid form equals a sequence of words that occur
 *                 NEXT TO EACH OTHER in the OT (𐤀𐤕 𐤄𐤀𐤋𐤄𐤉𐤌)
 *   proclitic     NT only — leading proclitic letter(s) + an EXACT attested form
 *
 * ONE INFERENCE PER RESOLUTION. The proclitic tier requires an exact stem; it
 * does not also fuzzy-match. Stacking the two produced 𐤄𐤕𐤋𐤌𐤉𐤃𐤉𐤌 -> 𐤄 + a verb
 * form during development, which looks authoritative and is wrong.
 *
 * WHAT THE NT CANNOT INHERIT. In the OT each token carries its own OSHB Strong's,
 * authoritative for that occurrence. The NT has no such tag, so where a form has
 * more than one attested reading the Strong's is a frequency pick (94% dominant
 * coverage; 48% of NT hits have only one reading and need no pick at all). That
 * is why `tier` and `ambiguous` are baked onto every row — it is the one thing
 * alignment cannot resolve, and it cannot be recovered later without a rebuild.
 */

// ── script + orthography ─────────────────────────────────────────────────────
const SQUARE_TO_PALEO = {
    'א':'𐤀','ב':'𐤁','ג':'𐤂','ד':'𐤃','ה':'𐤄','ו':'𐤅','ז':'𐤆','ח':'𐤇','ט':'𐤈',
    'י':'𐤉','כ':'𐤊','ך':'𐤊','ל':'𐤋','מ':'𐤌','ם':'𐤌','נ':'𐤍','ן':'𐤍','ס':'𐤎',
    'ע':'𐤏','פ':'𐤐','ף':'𐤐','צ':'𐤑','ץ':'𐤑','ק':'𐤒','ר':'𐤓','ש':'𐤔','ת':'𐤕',
};
function toPaleo(s) {
    if (!s) return '';
    let out = '';
    for (const ch of s) {
        if (ch >= '\u{10900}' && ch <= '\u{10915}') out += ch;
        else if (SQUARE_TO_PALEO[ch]) out += SQUARE_TO_PALEO[ch];
    }
    return out;
}
/** Maqaf is a word JOINER but a tokenisation BOUNDARY: BHS tokenises either side. */
function splitWords(text) {
    if (!text) return [];
    return String(text).replace(/\u05BE/g, ' ').split(/\s+/).map(toPaleo).filter(Boolean);
}
const matresKey = s => (s || '').replace(/[𐤉𐤅]/g, '');
function matresEquivalent(a, b) {
    if (!a || !b) return false;
    // Paleo letters live in the SMP (Supplementary Multilingual Plane) and are
    // all packed into ONE narrow Unicode block, so every paleo letter shares
    // the identical UTF-16 HIGH surrogate — plain string indexing (a[0]) only
    // ever sees that shared high surrogate, never the letter itself. a[0] ===
    // b[0] was therefore true for EVERY pair of paleo letters, no matter how
    // different they actually were, silently disabling the "must start with
    // the same letter" guard entirely. [...a][0] iterates by codepoint (each
    // full surrogate pair as one element), the same discipline this file
    // already uses everywhere else paleo length/indexing matters (see the
    // f.length===1 comment above). This is what let 𐤉𐤁𐤍𐤀𐤋 (Yabneel, starts
    // with Yod) register as a "plene" spelling variant of 𐤁𐤍𐤀𐤋 (starts with
    // Bet, an unrelated word this edition reuses H2995 for) — stripping
    // Yabneel's leading Yod as a matres vowel letter happens to leave exactly
    // that word's spelling, and the broken first-letter check let it through.
    if ([...a][0] !== [...b][0]) return false;
    if (Math.abs([...a].length - [...b].length) > 2) return false;
    const ka = matresKey(a);
    return ka === matresKey(b) && [...ka].length >= 3;
}

// ── morph normalisation ──────────────────────────────────────────────────────
// The DB stores full-word morph keys AND values ('unclassified_final=paragogic_nun').
const MORPH_KEY_NORM = {
    'pronominal_suffix':'prs', 'nominal_ending':'nme', 'verbal_ending':'vbe',
    'unclassified_final':'uvf', 'prefix_marker':'pfm', 'verbal_stem_marker':'vbs',
};
const MORPH_VAL_NORM = {
    'he_ending':'H', 'feminine_tav_ending':'T', 'construct_or_1cs_yod':'J',
    'masculine_plural_ending':'JM', 'feminine_plural_ending':'WT',
    'feminine_plural_construct':'WTJ', 'they_feminine_ending':'NH',
    '1cs_verbal_ending':'TJ', '1cp_verbal_ending':'NW', '2ms_verbal_ending':'T',
    '2fs_verbal_ending':'T', '3fs_verbal_ending':'H=', '2mp_verbal_ending':'TM',
    '2fp_verbal_ending':'TN', '3mp_verbal_ending':'W', '3fp_verbal_ending':'WN',
    '3fp_verbal_ending_nh':'NH',
    'paragogic_nun':'N', 'paragogic_he':'H', 'directional_he':'H',
    'energic_nun':'N', 'emphatic_nun':'N', 'connecting_yod':'J',
};
function morphAttrs(morph) {
    const out = {};
    for (const seg of String(morph || '').split('|')) {
        const eq = seg.indexOf('=');
        if (eq < 1) continue;
        const rawK = seg.slice(0, eq).trim(), rawV = seg.slice(eq + 1).trim();
        if (!rawK || !rawV || rawV === 'absent' || rawV === 'none') continue;
        const vNorm = rawV.replace(/_\([^)]*\)$/, '');
        out[MORPH_KEY_NORM[rawK] || rawK] =
            MORPH_VAL_NORM[rawV] || MORPH_VAL_NORM[vNorm] || vNorm.replace(/=+$/, '');
    }
    return out;
}

// ── reconstruction rules ─────────────────────────────────────────────────────
// Every entry was read off a measured required-tail table, not proposed from
// general Hebrew morphology. Each is gated on a tag the corpus already supplies,
// so adding forms does not loosen matching. Several are Aramaic — which is why
// Daniel and Ezra sat at the bottom of the per-book alignment table.
const NME_PALEO = { 'H':['𐤄'],'T':['𐤕'],'J':['𐤉'],'JM':['𐤉𐤌','𐤌'],'WT':['𐤅𐤕','𐤕'],'WTJ':['𐤅𐤕𐤉','𐤕𐤉'],'NH':['𐤍𐤄'] };
const VBE_PALEO = { 'TJ':['𐤕𐤉'],'NW':['𐤍𐤅'],'T':['𐤕'],'TM':['𐤕𐤌'],'TN':['𐤕𐤍'],'W':['𐤅'],'WN':['𐤅𐤍'],'NH':['𐤍𐤄'],'H':['𐤕𐤄','𐤄'],'J':['𐤉'] };
const UVF_PALEO = { 'H':['𐤄'],'J':['𐤉'],'N':['𐤍'] };
const PRS_ALLO = {
    '1cs': ['𐤉','𐤍𐤉','𐤄𐤉','𐤃𐤉'],
    '1cp': ['𐤍𐤅','𐤍𐤀'],
    '2ms': ['𐤊','𐤊𐤄','𐤍𐤊','𐤅𐤊','𐤊𐤌'],
    '2fs': ['𐤊','𐤊𐤉'],
    '2mp': ['𐤊𐤌','𐤊𐤅𐤍','𐤊'],
    '2fp': ['𐤊𐤍','𐤊𐤍𐤄'],
    '2cp': ['𐤊𐤌','𐤊𐤅𐤍'],
    '3ms': ['𐤅','𐤄𐤅','𐤍𐤅','𐤄𐤉','𐤅𐤄𐤉','𐤄','𐤌𐤅','𐤍𐤄𐤅'],
    '3fs': ['𐤄','𐤍𐤄','𐤊'],
    '3mp': ['𐤌','𐤄𐤌','𐤍𐤌','𐤌𐤅','𐤄𐤅𐤍'],
    '3fp': ['𐤍','𐤄𐤍','𐤍𐤄','𐤄𐤍𐤄'],
};
const ALL_PRS_FORMS = [...new Set(Object.values(PRS_ALLO).flat())];
const PARTICLE_POS = new Set(['prde','nega','advb','intj','prep','prps','inrg']);
const NOMINAL_POS  = new Set(['nmpr','subs','advb','intj']);
const PROCLITIC_SET = new Set(['𐤅','𐤄','𐤁','𐤋','𐤊','𐤌','𐤔']);

// Pick at most ONE alternative per category, then product ACROSS categories in
// surface order (ending, then pronominal suffix). Composing by repeatedly
// doubling a working set is both wrong — alternatives within a category are
// mutually exclusive — and exponential; it made an earlier build unable to
// finish. Memoised on pos+morph, which repeat heavily across 490k tokens.
const _tailCache = new Map();
function reconstructableTails(tok) {
    const key = (tok.pos || '') + '\u0000' + (tok.morph || '');
    const hit = _tailCache.get(key);
    if (hit) return hit;

    const a = morphAttrs(tok.morph);
    const pos = (tok.pos || a.sp || a.pdp || '').trim();
    const isVerb = pos === 'verb' || a.sp === 'verb';

    const endings = [''];
    if (a.nme && NME_PALEO[a.nme]) endings.push(...NME_PALEO[a.nme]);
    if (a.vbe && VBE_PALEO[a.vbe]) endings.push(...VBE_PALEO[a.vbe]);
    if (a.uvf && UVF_PALEO[a.uvf]) endings.push(...UVF_PALEO[a.uvf]);
    if (isVerb && ['impf','juss','wayq'].includes(a.vt) &&
        (a.nu === 'pl' || (a.ps === 'p2' && a.gn === 'f'))) endings.push('𐤍');
    if (!a.prs && NOMINAL_POS.has(pos)) endings.push('𐤄');
    if (isVerb && (a.vt === 'impv' || ((a.vt === 'wayq' || a.vt === 'impf') && a.ps === 'p1')))
        endings.push('𐤄');

    const suffixes = [''];
    if (a.prs && PRS_ALLO[a.prs]) suffixes.push(...PRS_ALLO[a.prs]);
    else if (!a.prs && PARTICLE_POS.has(pos)) suffixes.push(...ALL_PRS_FORMS);

    const out = new Set();
    for (const e of endings) for (const s of suffixes) { const t = e + s; if (t) out.add(t); }
    const arr = [...out];
    _tailCache.set(key, arr);
    return arr;
}

// ── run matching ─────────────────────────────────────────────────────────────
const MAXRUN = 6;
function matchAt(tk, s, w) {
    let acc = '', run = [];
    for (let j = s; j < tk.length && run.length < MAXRUN; j++) {
        acc += tk[j].paleo; run.push(tk[j]);
        if (acc === w) return { ok: true, tier: 'exact', end: j + 1, run: [...run] };
        for (const tail of reconstructableTails(run[run.length - 1]))
            if (acc + tail === w) return { ok: true, tier: 'reconstructed', end: j + 1, run: [...run] };
        if (matresEquivalent(acc, w)) return { ok: true, tier: 'plene', end: j + 1, run: [...run] };
        if (acc.length > w.length + 3) break;
    }
    return { ok: false };
}

/** Align one verse. On a miss, resync on the NEXT word rather than stepping
 *  blindly — a single disagreement must not throw the rest of the verse off by
 *  one, which silently destroys a whole verse's alignment. */
function alignVerse(hw, tk, window) {
    const res = [];
    let ti = 0;
    for (let i = 0; i < hw.length; i++) {
        let hit = null;
        for (let s = ti; s <= Math.min(ti + window, tk.length - 1); s++) {
            const m = matchAt(tk, s, hw[i]);
            if (m.ok) { hit = m; break; }
        }
        if (hit) { res.push({ word: hw[i], ...hit }); ti = hit.end; continue; }
        let resync = null;
        if (i + 1 < hw.length) {
            for (let s = ti; s <= Math.min(ti + window + 2, tk.length - 1); s++) {
                if (matchAt(tk, s, hw[i + 1]).ok) { resync = s; break; }
            }
        }
        res.push({ word: hw[i], ok: false, tier: 'unaligned' });
        if (resync !== null) ti = resync;
    }
    return res;
}

// ── surface composition ──────────────────────────────────────────────────────
const _numH = h => parseInt(String(h || '').replace(/^H+/, ''), 10) || 0;
const _normH = s => (s ? 'H' + String(s).replace(/^H+/, '') : '');
const _isReal = h => { const n = _numH(h); return n > 0 && n < 9000; };

/**
 * Compose one HEB whole word from its BHS run. The components of each token are
 * concatenated in reading order, so proclitics, root and suffixes all survive —
 * this is what makes the NT render like the OT rather than as one blob.
 * The HEAD is the last morpheme carrying a real Strong's (proclitics lead), and
 * its strongs/pos/morph key the row so the existing token_surfaces join is
 * unchanged.
 */
// A component that heads its own word in BHS is NOT the head once it is fused
// into a longer HEB word. build-surface-index's parseToken pins STANDALONE_WORDS
// (𐤀𐤕 𐤏𐤋 𐤁𐤉𐤍 𐤊𐤉 𐤊𐤍 𐤀𐤔𐤓 𐤀𐤋) to css 'root' — correct in BHS, where each is its own
// word block, and wrong here, where 𐤀𐤕 is glued to the following name. Two 'root'
// components in one block made the reader head the word with the PARTICLE:
// 𐤀𐤕𐤉𐤏𐤒𐤁 read "Ath -> entirety [Jacob]" instead of "Yaiqab -> Jacob [entirety]".
// Demote every root-class component that did not come from the head token.
const MOD_CSS = {
    conj: 'mod-conj', art: 'mod-art', prep: 'mod-prep', nega: 'mod-nega',
    advb: 'mod-advb', intj: 'mod-intj', inrg: 'mod-inrg',
    prde: 'mod-prde', prps: 'mod-prps', prin: 'mod-prin',
};
// Default mod-prep: a fused particle standing before the head behaves like one,
// and mod-prep is already styled everywhere the reader renders.
const modCssFor = pos => MOD_CSS[String(pos || '').trim()] || 'mod-prep';

/**
 * ONE ROOT PER WORD BLOCK. Everything that is not the head is a prefix or a
 * suffix — never a second root.
 *
 * Both assembly paths glue several OT forms into one HEB word: composeWord()
 * for the OT (a BHS run) and the NT tier loop (adjacent/proclitic matches).
 * Each form arrives carrying its OWN components, and each of those was parsed
 * as a standalone word, so each brought its own css:'root'. Concatenated, a
 * block ends up with two or three roots that render as competing head words —
 * 𐤀𐤕𐤀𐤔𐤓𐤄𐤉𐤄 read "Ath -> entirety" AND "Ashar -> who/that" AND "came to pass"
 * all at once, bumping into each other.
 *
 * @param {Array}  components  flat component list, in reading order
 * @param {Array}  spans       [{start, end, pos}] — which components each source
 *                             form produced, in the same order
 * @param {number} headSpan    index into spans of the form that owns the block's
 *                             Strong's; -1 falls back to the last span
 */
function demoteNonHead(components, spans, headSpan) {
    if (!spans.length) return components;
    const head = headSpan >= 0 ? headSpan : spans.length - 1;
    for (let i = 0; i < spans.length; i++) {
        if (i === head) continue;
        for (let j = spans[i].start; j < spans[i].end; j++) {
            if (components[j] && components[j].css === 'root') {
                components[j] = { ...components[j], css: modCssFor(spans[i].pos), demoted: true };
            }
        }
    }
    return components;
}

function composeWord(run, parseToken) {
    const components = [];
    const spans = [];              // one entry per token: which components it produced
    let head = null, headSpan = -1;
    const all = [];
    for (const t of run) {
        const parsed = parseToken(t.word_raw, t.pos, t.morph, t.strongs);
        const start = components.length;
        for (const c of parsed.components) components.push(c);
        spans.push({ start, end: components.length, pos: t.pos || '' });
        const sn = _normH(t.strongs);
        if (sn) all.push(sn);
        if (_isReal(sn)) {
            head = { sn, pos: t.pos || '', morph: t.morph || '', root: parsed.root_paleo };
            headSpan = spans.length - 1;
        }
    }
    if (!head) {
        const last = run[run.length - 1];
        const parsed = parseToken(last.word_raw, last.pos, last.morph, last.strongs);
        head = { sn: _normH(last.strongs), pos: last.pos || '', morph: last.morph || '', root: parsed.root_paleo };
        headSpan = spans.length - 1;
    }
    // Single-token runs never demote anything: headSpan is the only span, so a
    // standalone 𐤀𐤕 written as its own HEB word keeps its root class.
    demoteNonHead(components, spans, headSpan);
    return {
        components,
        strongs: head.sn,
        pos: head.pos,
        morph: head.morph,
        root_paleo: head.root,
        rendered_paleo: components.map(c => c.paleo).join(''),
        all_strongs: [...new Set(all)],
    };
}

const surfKey = (word, sn, pos, morph) => `${word}\u0000${sn}\u0000${pos}\u0000${morph}`;

// ── main ─────────────────────────────────────────────────────────────────────
/**
 * @param {object} o
 * @param {import('better-sqlite3').Database} o.src   corpus.db (readonly ok)
 * @param {(w,p,m,s)=>object} o.parseToken            build-surface-index's parser
 * @param {Map<string,number>} [o.pins]               "canon|chapter" -> forced offset
 * @param {(msg:string)=>void} [o.log]
 * @returns {{surfaces:Map, occurrences:Array, audit:Array, stats:object}}
 */
function buildHebSurfaces(o) {
    // A whole-word match on a form attested this many times or fewer LOSES to a
    // compositional split whose stem is well attested. 0 disables.
    //
    // WHY THIS IS SAFE AT 1: a BHS hapax is a real word, but the odds that an NT
    // text uses one are far lower than the odds it is an ordinary prefixed common
    // word that happens to share the spelling. Sampled 19 evenly across the 772
    // words this rule flips — every one was a transparent prefix + common word:
    // 𐤅𐤄𐤓𐤅𐤇 "and the spirit" (stem x213), 𐤊𐤀𐤓𐤁𐤏𐤉𐤌 "like forty" (x93), 𐤁𐤌𐤄𐤓𐤄
    // "in haste" (x22), 𐤌𐤓𐤅𐤕 "from Ruth" (x10) — each beaten by a hapax.
    const PREFER_SPLIT_MAX  = o.preferSplitMax  === undefined ? 1  : o.preferSplitMax;
    const PREFER_SPLIT_STEM = o.preferSplitStem === undefined ? 10 : o.preferSplitStem;
    // 𐤀𐤕 GETS A MUCH HIGHER THRESHOLD. It is the direct-object marker: what
    // follows it is a noun or a name, essentially without exception. Of the 329
    // particle-tier alternatives in the report, every single sampled one was
    // 𐤀𐤕 + an ordinary word — 𐤀𐤕 + 𐤀𐤋𐤄𐤉𐤍𐤅 "our God" (x174), 𐤀𐤕 + 𐤋𐤅𐤉 Levi (x52),
    // 𐤀𐤕 + 𐤉𐤇𐤆𐤒𐤉𐤄𐤅 Hezekiah (x38), 𐤀𐤕 + 𐤄𐤌𐤋𐤊𐤉𐤌 "the kings" (x36). None was a
    // coincidence worth protecting, so this split needs far less caution than a
    // stacked single-letter proclitic split, where 𐤔 + 𐤋 + 𐤉𐤔𐤉 can wrongly
    // outrank 𐤔𐤋𐤉𐤔𐤉 "third".
    const PREFER_PARTICLE_MAX = o.preferParticleMax === undefined ? 10 : o.preferParticleMax;
    let preferredSplits = 0;
    let forcedReadingHits = 0;
    let lexiconOverSplit = 0;
    const forcedReadingMisses = new Map();   // word -> the readings resolveAll DID offer
    const {
        src, parseToken,
        corpus = 'HEB', otMax = 39, ntMin = 40, ntMax: ntMaxArg,
        offsets = [0, 1, -1], window = 3,
        pins = new Map(),
        // Occurrence-specific Strong's override, added 2026-07-29. Keyed by
        // "book_id|chapter|verse|token_ordinal" -> forced Strong's ("H3225").
        // EXISTS FOR TRUE HOMOGRAPHS ONLY: a case like Hebrews 1:13's 𐤉𐤌𐤉𐤍𐤉
        // (both "Benjamite" H1145 and "my right hand" H3225 are genuinely
        // attested for the IDENTICAL bare spelling — `ambiguous: 1` on the
        // record proves it, not a segmentation bug) where frequency alone
        // cannot pick correctly, because the LESS common reading is the right
        // one in that specific verse. This is deliberately occurrence-keyed,
        // not word-shape-keyed like surface-strongs-overrides.json (BHS-only,
        // and explicitly skipped for HEB source in server.js) — a blanket
        // "this spelling always means X" rule would just break every OTHER
        // occurrence where the majority reading is correct.
        occurrenceOverrides = new Map(),
        // SETTLED READINGS (fieldy, 2026-10-29: "this corpus is meant to be etched in stone. When we
        // determine something should be something, lets just make it that"). { occ: Map(occKey ->
        // {w, s: surfKey, e: evidence}), surf: Map(surfKey -> record), verses: Set('b|c|v') } from
        // heb-settled.db (build-surface-index.js --freeze). A settled word is taken AS IS: nothing
        // below re-decides it. Only his occurrence overrides (a correction) are worked out again.
        settled = null,
        // Spelling-keyed FORCED SEGMENTATION, added 2026-09-26. word_raw ->
        // the exact forms array resolveAll() must produce (e.g. 𐤔𐤋𐤉𐤇𐤉 ->
        // [𐤔𐤋𐤉𐤇, 𐤉] "apostles of"). For a word whose every occurrence the
        // automatic pick splits wrongly — Revelation 21:14's shlichei was read
        // as 𐤔 + 𐤋 + 𐤉𐤇𐤉 (a jussive of chayah, "may he live"). Evidence-gated
        // like everything else here: it only selects a reading resolveAll()
        // itself proposed (attested stem, attested tail); it can never invent
        // one. Data lives in lexicon/heb-forced-readings.json.
        forcedReadings = new Map(),
        // Whole-word Strong's lemmas (paleo consonants -> SN), unambiguous non-names only.
        lemmaIndex = new Map(),
        // CONTEXT READINGS (2026-09-27, lexicon/heb-context-readings.json, generated by
        // audit-heb-vs-english.py): word_raw -> {sn, to_words, from_words}. The NT/
        // Apocrypha Hebrew has no tagging of its own, so a spelling can match the wrong
        // OT word everywhere it occurs (𐤏𐤉𐤓𐤌 "their city" read as H5903 nakedness,
        // 𐤀𐤎𐤐 "gather" as Asaph). The verse's English is the only independent witness:
        // the audit found the words whose English systematically supports ANOTHER
        // attested reading of the same spelling. Applied PER OCCURRENCE below.
        contextReadings = new Map(),
        // (canon, chapter, verse) -> the English of that verse (string, '' if none).
        // Used by contextReadings and by the bare-𐤄 suffix choice.
        englishOf = null,
        // ROOT STRIP (2026-10-16, see the block after SUF_3FS). null = off.
        // { roots: Map(paleo -> [SN]), verbs: Set(SN), names: Set(SN),
        //   snText: Map(SN -> English of kjv_def + strongs_def + his lexicon gloss),
        //   freq: Map(SN -> BHS count) } — built by build-surface-index.js.
        rootStrip = null,
        // (canon, chapter, verse) -> the verse's ORIGINAL English (text_src), the
        // witness root-strip checks a Strong's against. Falls back to englishOf.
        englishSrcOf = null,
        // GREEK WITNESS (2026-10-30, build-greek-witness.py): (canon, ch, v) -> Set of Hebrew Strong's numbers the
        // verse's Greek words are LXX equivalents of (Abbott-Smith, public domain). NT only for now.
        greekOf = null,
        // EVIDENCE (2026-10-29, heb-evidence.cjs buildEvidence): judge every inferred reading
        // against its verse's original English; switch where the English names another
        // candidate of the same spelling. null = off (hand entries only, as before).
        evidence = null,
        log = () => {},
    } = o;
    // Same stemming as audit-heb-vs-english.py's stem() — keep them identical.
    const STEM_SUFS = ['ings', 'ing', 'edly', 'ed', 'es', 's', 'ly', 'ness', 'ment'];
    const stemWord = (w) => {
        w = w.toLowerCase();
        for (const suf of STEM_SUFS) {
            if (w.length > suf.length + 3 && w.endsWith(suf)) { w = w.slice(0, -suf.length); break; }
        }
        return w.slice(0, 6);
    };
    const _engCache = new Map();
    const verseEnglish = (c, ch, v) => {
        if (!englishOf) return '';
        const k = c + '|' + ch + '|' + v;
        if (!_engCache.has(k)) {
            let t = englishOf(c, ch, v) || '';
            if (!t) t = (englishOf(c, ch, v - 1) || '') + ' ' + (englishOf(c, ch, v + 1) || '');   // versification drift
            _engCache.set(k, t);
        }
        return _engCache.get(k);
    };
    const _stemCache = new Map();
    const verseStems = (c, ch, v) => {
        const k = c + '|' + ch + '|' + v;
        if (!_stemCache.has(k)) {
            _stemCache.set(k, new Set((verseEnglish(c, ch, v).match(/[A-Za-z]{2,}/g) || []).map(stemWord)));
        }
        return _stemCache.get(k);
    };
    // The ORIGINAL English (text_src) of a verse, as stems — for a context reading
    // marked witness:"src". The rendered text carries the glosses of the reading
    // being questioned ("Chamath (Hamath)"), so it would vouch for itself; the
    // original English cannot (same reason root strip reads text_src).
    // Josephus, 2 Esdras and the Works Library have no clean English in corpus.db: their
    // text_src is an earlier render ("achar (next) yawam (day)"). A witness keeps only the
    // English of each "word (gloss)" pair, so a transliteration (amath, laban, hamath)
    // never counts as English. Plain English barely ever writes "word (aside)".
    const englishOnly = (t) => t.replace(/[A-Za-z\u{10900}-\u{1091F}'’-]+\s*\(([^()]*)\)/gu, ' $1 ');
    const _srcStemCache = new Map();
    const verseSrcStems = (c, ch, v) => {
        if (!englishSrcOf) return verseStems(c, ch, v);
        const k = c + '|' + ch + '|' + v;
        if (!_srcStemCache.has(k)) {
            let t = englishSrcOf(c, ch, v) || '';
            if (!t) t = (englishSrcOf(c, ch, v - 1) || '') + ' ' + (englishSrcOf(c, ch, v + 1) || '');   // versification drift
            t = englishOnly(t);
            _srcStemCache.set(k, t.trim()
                ? new Set((t.match(/[A-Za-z]{2,}/g) || []).map(stemWord))
                : verseStems(c, ch, v));
        }
        return _srcStemCache.get(k);
    };
    let contextSwitches = 0, contextVetoed = 0, suffix3fs = 0, contextFromBhs = 0, contextFromRoot = 0;
    // The BHS token that writes `word` exactly with Strong's `sn` (most common pos/morph),
    // for a context reading whose target no aligned reading carries. Cached per word+SN.
    // Loaded ONCE (a per-call query scanned all of tokens_bhs: 17 s on five books).
    let _bhsTok = null;
    const bhsSpellIndex = () => {
        if (_bhsTok) return _bhsTok;
        _bhsTok = new Map();   // word -> Map(sn -> {pos, morph, n}) — the most common pos/morph
        try {
            for (const r of src.prepare(`SELECT word_raw, strongs, pos, morph, COUNT(*) AS n FROM tokens_bhs
                                         WHERE strongs != '' GROUP BY word_raw, strongs, pos, morph`).all()) {
                const sn = 'H' + String(r.strongs).replace(/^[Hh]+/, '');
                if (!_bhsTok.has(r.word_raw)) _bhsTok.set(r.word_raw, new Map());
                const m = _bhsTok.get(r.word_raw), cur = m.get(sn);
                if (!cur || r.n > cur.n) m.set(sn, { pos: r.pos, morph: r.morph, n: r.n });
            }
        } catch { /* no BHS tokens */ }
        return _bhsTok;
    };
    const bhsTokenFor = (word, sn) => {
        const m = bhsSpellIndex().get(word);
        return (m && m.get(sn)) || null;
    };
    const TRACE = new Set(String(process.env.HEB_TRACE || '').split(/[\s,]+/).filter(Boolean));
    const contextMisses = new Map();
    const contextLog = [];
    const occKey = (b, c, v, ord) => `${b}|${c}|${v}|${ord}`;
    // his correction for one occurrence: keyed "book|ch|v|ordinal", or "book|ch|v|word" (the word as
    // written — every occurrence of it in that verse), so a fix needs no counting
    const ovr = (b, c, v, ord, w) => occurrenceOverrides.get(occKey(b, c, v, ord)) || occurrenceOverrides.get(occKey(b, c, v, w)) || null;
    let settledHits = 0, settledUntagged = 0, settledChanged = 0, settledFresh = 0, settledBlank = 0;
    // ntMax defaulted to a hardcoded 66 (the NT's last canon_id), which silently
    // dropped every book past it — Jubilees(68), 1 Enoch(67), Jasher(100), and
    // every other pseudepigrapha book-order.json now assigns a canon_id to. Those
    // books have real HEB text and deserve the exact same whole-word alignment the
    // NT gets, so the upper bound is read from the data instead of hand-pinned.
    const ntMax = ntMaxArg != null ? ntMaxArg : (() => {
        const hi = src.prepare(`SELECT MAX(canon_id) AS hi FROM verses WHERE corpus = ?`).get(corpus);
        return Math.max(66, (hi && hi.hi) || 66);
    })();

    const verseCols = src.prepare(`PRAGMA table_info(verses)`).all().map(r => r.name);
    const hasPaleoCol = verseCols.includes('text_paleo');
    const VERSES = src.prepare(`
        SELECT canon_id, ord_c AS chapter, ord_v AS verse, text ${hasPaleoCol ? ', text_paleo' : ''}
        FROM verses
        WHERE corpus = ? AND canon_id BETWEEN ? AND ?
          AND ord_c IS NOT NULL AND ord_v IS NOT NULL
        ORDER BY canon_id, ord_c, ord_v
    `);
    const BHS = src.prepare(`
        SELECT token_ordinal, word_raw, pos, morph, strongs
        FROM tokens_bhs WHERE book_id = ? AND chapter = ? AND verse = ?
        ORDER BY token_ordinal
    `);
    const tokCache = new Map();
    // rawBhsTokens caches the UNFILTERED per-verse token list (marks included);
    // bhsTokens derives its filtered view from the same cache so alignment's
    // input is byte-for-byte what it always was. Marks (maqaf, sof-pasuq,
    // paseq …) toPaleo() to '' — they're punctuation, not letters — so the old
    // single-step `.filter(t => t.paleo)` dropped them before alignment ever
    // ran, and nothing downstream ever got a chance to re-add them: they don't
    // exist in `tk`, so they never appear in any matched word's `.run`, so
    // composeWord() never sees them, so no occurrence row is ever written for
    // them in the HEB edition. Confirmed against production data (Genesis 1:8
    // וַיְהִי־עֶרֶב): the raw tokens_bhs row for the maqaf is real (token_ordinal
    // 9, pos=punct), but HEB's /api/tokens response for that verse has no mark
    // anywhere. rawBhsTokens gives the interleave logic below something to
    // recover them from.
    const rawBhsTokens = (canon, ch, v) => {
        const k = `${canon}|${ch}|${v}`;
        if (!tokCache.has(k)) tokCache.set(k, BHS.all(canon, ch, v)
            .map(t => ({ ...t, paleo: toPaleo(t.word_raw) })));
        return tokCache.get(k);
    };
    const bhsTokens = (canon, ch, v) => rawBhsTokens(canon, ch, v).filter(t => t.paleo);
    // MAQAF BOUNDARIES (fixed 2026-09-30, fieldy: Matthew 16:27 read "Son of Ayash (man)").
    // text_paleo was ingested with every maqaf DELETED rather than turned into a
    // space, so construct pairs came through as one fused word — 𐤁𐤍𐤄𐤀𐤃𐤌 for
    // בֶּן־הָאָדָם — while `text` kept the boundary (𐤁𐤍 𐤄𐤀𐤃𐤌). splitWords()
    // already treats maqaf as a tokenisation boundary (BHS tokenises either side);
    // text_paleo simply erased it before splitWords could see it. Measured on the
    // real corpus: the two columns differ ONLY by these joins — 23,950 fused words
    // in 11,778 verses (every NT book, Enoch, Josephus …), 8,797 of the NT's
    // unresolved tokens, Son of Man x63, Son of God x38. A fused pair can only
    // resolve if that exact pair happens to sit adjacent somewhere in the OT (the
    // `adjacent` tier), so ben-ha'adam — never adjacent in the OT — got no Strong's
    // at all and the English aligner borrowed H376 from "every man" for it.
    // Rule: when `text` spells the SAME letters as text_paleo, its word boundaries
    // win. Anything else (a genuinely different text) keeps text_paleo as before.
    const wordsOf = (row) => {
        const a = hasPaleoCol ? splitWords(row.text_paleo) : [];
        if (!a.length) return splitWords(row.text);
        const b = splitWords(row.text);
        if (b.length > a.length && b.join('') === a.join('')) { maqafSplitVerses++; return b; }
        return a;
    };
    let maqafSplitVerses = 0;

    const surfaces = new Map();       // surfKey -> record
    const occurrences = [];           // rows for surface_occurrences
    const FORMS = new Map();          // heb word -> Map(snSig -> {count, key})
    const SEQ = new Map();            // concat of 2-3 adjacent OT words -> Map(partsKey -> {parts,count})
    const audit = [];                 // per-chapter offset decisions
    const stats = { ot_words: 0, ot_aligned: 0, nt_words: 0, nt_hit: 0, tiers: {}, unaligned_samples: [] };
    // Words that more than one reading fits. Not errors — DECISIONS, and they
    // should be visible rather than discovered by reading the app.
    // NB: the NT loop already has a local `let ambiguous`, so this must not
    // share that name or it gets shadowed exactly where it is written to.
    const ambiguousReadings = [];
    const bump = t => { stats.tiers[t] = (stats.tiers[t] || 0) + 1; };

    // ── AN UNRESOLVED WORD IS STILL A WORD ──────────────────────────────────
    // Both resolvers used to `continue` when they could not tag a word, so the
    // word produced NO row and vanished from the index — and therefore from the
    // reader, which serves whatever the index has. Verses rendered with holes in
    // them, and a verse whose words ALL failed disappeared outright.
    //
    // Emit it anyway, with an empty Strong's. That is exactly the case the
    // reader's placeholder already handles: bare paleo, no gloss, "here is a
    // word nothing covers yet". A missing word is a lie about the text; an
    // untagged word is the truth about our coverage.
    const unresolvedComp = word => ({
        strongs: '', pos: '', morph: '',
        rendered_paleo: word, root_paleo: word,
        all_strongs: [],
        components: [{ paleo: word, translit: '', translation: '', css: 'root', unresolved: true }],
    });

    const record = (word, comp, tier, ambiguous) => {
        const key = surfKey(word, comp.strongs, comp.pos, comp.morph);
        if (!surfaces.has(key)) {
            surfaces.set(key, {
                word_raw: word, strongs: comp.strongs, pos: comp.pos, morph: comp.morph,
                rendered_paleo: comp.rendered_paleo, root_paleo: comp.root_paleo,
                all_strongs_json: JSON.stringify(comp.all_strongs),
                components_json: JSON.stringify(comp.components),
                tier, ambiguous: ambiguous ? 1 : 0, count: 0,
            });
        }
        const rec = surfaces.get(key);
        rec.count++;
        return { key, rec };
    };

    // ── OT ────────────────────────────────────────────────────────────────────
    log('  OT: aligning HEB words against BHS token runs…');
    const otRows = VERSES.all(corpus, 1, otMax);
    const byChapter = new Map();
    for (const r of otRows) {
        const k = `${r.canon_id}|${r.chapter}`;
        if (!byChapter.has(k)) byChapter.set(k, []);
        byChapter.get(k).push(r);
    }

    const pOT = progress('OT: aligning chapters', byChapter.size);
    for (const [ckey, verses] of byChapter) {
        pOT.tick();
        const canon = verses[0].canon_id;
        // OFFSET: recomputed every build so it can never go stale, and WRITTEN
        // DOWN so a wrong choice is inspectable and pinnable. Psalms needs this
        // per CHAPTER, not per book — BHS counts the superscription as verse 1
        // in some psalms and not others.
        let chosen, chosenRate = 0, pinned = pins.has(ckey);
        if (pinned) {
            chosen = pins.get(ckey);
        } else {
            for (const d of offsets) {
                let ok = 0, tot = 0;
                for (const row of verses) {
                    const tk = bhsTokens(canon, row.chapter, row.verse + d);
                    if (!tk.length) continue;
                    const hw = wordsOf(row);
                    tot += hw.length;
                    for (const r of alignVerse(hw, tk, window)) if (r.ok) ok++;
                }
                const rate = tot ? ok / tot : 0;
                if (chosen === undefined || rate > chosenRate) { chosen = d; chosenRate = rate; }
                if (rate >= 0.95) break;      // good enough — skip the rest of the search
            }
        }
        audit.push({ canon_id: canon, chapter: verses[0].chapter, offset: chosen,
                     aligned_rate: +chosenRate.toFixed(4), pinned: pinned ? 1 : 0 });

        for (const row of verses) {
            const tk = bhsTokens(canon, row.chapter, row.verse + chosen);
            const rawTk = rawBhsTokens(canon, row.chapter, row.verse + chosen);   // includes punct
            const hw = wordsOf(row);
            const aligned = tk.length ? alignVerse(hw, tk, window) : hw.map(w => ({ word: w, ok: false, tier: 'unaligned' }));
            const seqWords = [];
            // Marks recovery: walk rawTk's punctuation in its true token_ordinal
            // order, interleaved with each aligned word's OWN consumed range
            // (r.run's tokens carry their real token_ordinal even though `tk`
            // itself is a filtered, differently-indexed array). `ord` is a
            // SEPARATE sequential counter for the row.token_ordinal actually
            // written to occurrences — decoupled from `i`, which keeps indexing
            // `aligned`/`hw` exactly as before, so seqWords/stats/FORMS/SEQ
            // below are entirely unaffected by marks being interleaved.
            let rawCursor = 0;
            let ord = 1;
            const emitMarksBefore = (ordExclusive) => {
                while (rawCursor < rawTk.length && rawTk[rawCursor].token_ordinal < ordExclusive) {
                    const rt = rawTk[rawCursor];
                    if (rt.pos === 'punct' && rt.word_raw) {
                        // NORMALIZE to BHS verse numbering (2026-08-13): `chosen` is the
                        // per-chapter offset that made this HEB row's words match BHS's
                        // tokens at row.verse + chosen (see the offset search above,
                        // aligned_rate scored against exactly this same shift). Storing
                        // the RAW row.verse here, unshifted, was the bug: it left every
                        // occurrence numbered in the HEB edition's own convention (Psalm
                        // superscription = verse 1) while translation.db/corpus.db ENG are
                        // aligned to BHS's convention (superscription = verse 0 in chapters
                        // that have one) — a title-bearing chapter would then serve, at any
                        // given verse number, HEB's actual verse N paired against
                        // BHS-aligned English for verse N, one real line apart. Found via
                        // Psalm 83:6 ("Adawam"/Edom) showing correct English against the
                        // WRONG Hebrew tokens (BHS's real verse 5) under the HEB source
                        // specifically — BHS itself, and English, were already fine; only
                        // HEB's stored verse was never corrected by the offset computed to
                        // fix exactly this.
                        occurrences.push({
                            source: corpus, word_raw: rt.word_raw, strongs: '', pos: 'punct', morph: '',
                            book_id: canon, chapter: row.chapter, verse: row.verse + chosen,
                            token_ordinal: ord++,
                        });
                    }
                    rawCursor++;
                }
            };
            for (let i = 0; i < aligned.length; i++) {
                const r = aligned[i];
                stats.ot_words++;
                if (!r.ok) {
                    bump('unaligned');
                    seqWords.push(null);
                    if (stats.unaligned_samples.length < 200)
                        stats.unaligned_samples.push({ canon_id: canon, chapter: row.chapter, verse: row.verse, word: r.word });
                    // Untagged, but present — the verse keeps all its words.
                    // No `.run` for an unaligned word, so we can't pin exactly
                    // where it sits in rawTk — any marks around it surface at
                    // the next aligned word's emitMarksBefore (or verse end)
                    // instead. Not lost, just not perfectly interleaved here.
                    const uc = unresolvedComp(r.word);
                    record(r.word, uc, 'unaligned', false);
                    // verse + chosen: see the NORMALIZE comment above emitMarksBefore's
                    // occurrences.push a few dozen lines up — same offset, same reason.
                    occurrences.push({
                        source: corpus, word_raw: r.word, strongs: '', pos: '', morph: '',
                        book_id: canon, chapter: row.chapter, verse: row.verse + chosen,
                        token_ordinal: ord++,
                    });
                    continue;
                }
                stats.ot_aligned++; bump(r.tier);
                seqWords.push(r.word);
                const minOrd = Math.min(...r.run.map(t => t.token_ordinal));
                emitMarksBefore(minOrd);   // a mark strictly before this word's own run (rare — verse-initial)
                const comp = composeWord(r.run, parseToken);
                const { rec } = record(r.word, comp, r.tier, false);
                // verse + chosen: see the NORMALIZE comment above emitMarksBefore's
                // occurrences.push near the top of this loop — same offset, same reason.
                occurrences.push({
                    source: corpus, word_raw: r.word, strongs: comp.strongs,
                    pos: comp.pos, morph: comp.morph,
                    book_id: canon, chapter: row.chapter, verse: row.verse + chosen,
                    token_ordinal: ord++,
                });
                // Skip rawCursor past this word's OWN consumed (real, non-mark)
                // tokens without re-emitting them — only a mark strictly AFTER
                // this run and before the next word's run should surface, via
                // the next emitMarksBefore call (or the trailing one below).
                const maxOrd = Math.max(...r.run.map(t => t.token_ordinal));
                while (rawCursor < rawTk.length && rawTk[rawCursor].token_ordinal <= maxOrd) rawCursor++;
                const snSig = comp.all_strongs.join('+') || comp.strongs || '-';
                if (!FORMS.has(r.word)) FORMS.set(r.word, new Map());
                const b = FORMS.get(r.word);
                if (!b.has(snSig)) b.set(snSig, { count: 0, key: surfKey(r.word, comp.strongs, comp.pos, comp.morph) });
                b.get(snSig).count++;
                void rec;
            }
            emitMarksBefore(Infinity);   // trailing marks — sof-pasuq at verse end, etc.
            // adjacency: concatenations of 2-3 CONSECUTIVE aligned words. Requiring
            // the parts to occur NEXT TO EACH OTHER is far stronger than requiring
            // each part to exist somewhere, which happily splits 𐤊𐤋𐤂𐤅𐤐𐤊 into three.
            for (let i = 0; i < seqWords.length; i++) {
                if (!seqWords[i]) continue;
                let concat = seqWords[i];
                const parts = [seqWords[i]];
                for (let k = 1; k <= 2 && i + k < seqWords.length; k++) {
                    if (!seqWords[i + k]) break;
                    concat += seqWords[i + k]; parts.push(seqWords[i + k]);
                    if ([...concat].length > 16) break;
                    if (!SEQ.has(concat)) SEQ.set(concat, new Map());
                    const pk = parts.join('|');
                    const m = SEQ.get(concat);
                    if (!m.has(pk)) m.set(pk, { parts: [...parts], count: 0 });
                    m.get(pk).count++;
                }
            }
        }
    }
    pOT.done();

    // Mark every surface whose FORM has more than one attested Strong's reading.
    // In the OT this is decoration (each token carries its own authoritative SN);
    // in the NT it is the honest flag that this row's SN is a frequency pick.
    for (const [, bucket] of FORMS) {
        if (bucket.size < 2) continue;
        for (const { key } of bucket.values()) {
            const rec = surfaces.get(key);
            if (rec) rec.ambiguous = 1;
        }
    }

    // ── attested components for a BARE proclitic letter ───────────────────────
    // The HEB edition never writes 𐤅/𐤄/𐤁/𐤋/𐤊/𐤌/𐤔 as a standalone word, so these
    // letters never enter FORMS and the proclitic tier had nothing to attach. It
    // used to emit a component with an EMPTY translation — fabricated, not
    // attested — which is why 𐤅𐤀𐤕𐤉 rendered "Waathay" with no [And] while the
    // same letter resolved through adjacency kept its gloss. BHS has these
    // letters as tokens tens of thousands of times; take the reading from there.
    const PROC_COMPS = new Map();
    {
        const q = src.prepare(`
            SELECT word_raw, pos, morph, strongs, COUNT(*) AS n
            FROM tokens_bhs
            WHERE word_raw = ? AND pos != 'punct'
            GROUP BY pos, morph, strongs
            ORDER BY n DESC
            LIMIT 1
        `);
        for (const letter of PROCLITIC_SET) {
            let row = null;
            try { row = q.get(letter); } catch { row = null; }
            if (!row) continue;
            const parsed = parseToken(row.word_raw, row.pos, row.morph, row.strongs);
            if (parsed && parsed.components && parsed.components.length)
                PROC_COMPS.set(letter, { components: parsed.components, pos: row.pos || '',
                                         morph: row.morph || '', strongs: _normH(row.strongs) });
        }
        log(`  proclitic glosses taken from BHS: ${[...PROC_COMPS.keys()].join(' ') || '(none found)'}`);
    }

    // ── proclitics glued INTO a fallback root chip (fieldy, 2026-10-22) ─────────
    // Revelation 6:15 𐤅𐤄𐤕𐤒𐤉𐤐𐤉𐤌 rendered "Wahathaqayapayam": the tokens_nt fallback took
    // the NT row's reading whole, and its ONE root chip was 𐤅𐤄𐤕𐤒𐤉𐤐 — 𐤅 [And] and 𐤄 [The]
    // inside the root, while the Strong's root H8630 is 𐤕𐤒𐤐 Thaqap. He expects
    // "WaHaThaqayapayam". Every letter before the Strong's root's first letter that is a
    // proclitic (≤3, 𐤅 only first, in Hebrew order) becomes the same chip the OT gives
    // that letter (PROC_COMPS); the root chip keeps the rest, which must still hold the
    // root's letters. Names are never peeled (Beer-sheba's 𐤁). Fallback tiers only — a
    // stem letter the OT itself keeps in its root chip (Niphal 𐤄, participle 𐤌) is not
    // a proclitic and is not touched here.
    const SN_ROOT = new Map();
    {
        let R = null;
        try { R = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'lexicon', 'strongs-roots.json'), 'utf8')); } catch { R = null; }
        if (R) for (const [sn, p] of Object.entries(R)) if (typeof p === 'string' && p) SN_ROOT.set(_normH(sn), p);
    }
    // Hebrew order: 𐤅, then 𐤔, then one of 𐤌 𐤁 𐤋 𐤊, then 𐤄 (𐤋+𐤄+𐤔 is not Hebrew)
    const PROC_RANK = new Map([['\u{10905}', 0], ['\u{10914}', 1], ['\u{1090C}', 2], ['\u{10901}', 2], ['\u{1090B}', 2], ['\u{1090A}', 2], ['\u{10904}', 3]]);
    let peeledFallback = 0;
    const peelGluedProclitics = (comp) => {
        const cs = comp && comp.components;
        if (!Array.isArray(cs) || /nmpr/.test(comp.pos || '')) return comp;
        const ri = cs.findIndex(c => c && c.css === 'root');
        if (ri < 0) return comp;
        const can = [...(SN_ROOT.get(_normH(comp.strongs)) || '')];
        const rp = [...(cs[ri].paleo || '')];
        if (!can.length || !rp.length || rp[0] === can[0]) return comp;
        const k = rp.indexOf(can[0]);
        if (k <= 0 || k > 3) return comp;
        let lead = rp.slice(0, k), rest = rp.slice(k);
        // a verb's 𐤄 after a preposition is its infinitive's stem letter (𐤁𐤄𐤈𐤁𐤋 "when immersing"), never
        // "the" — it stays with the root, as the OT keeps it
        if (/verb/.test(comp.pos || '') && lead.length > 1 && lead[lead.length - 1] === '\u{10904}' && PROC_RANK.get(lead[lead.length - 2]) === 2) { rest = [lead[lead.length - 1], ...rest]; lead = lead.slice(0, -1); }
        if (!lead.every(ch => PROCLITIC_SET.has(ch) && PROC_COMPS.has(ch))) return comp;
        for (let a = 1; a < lead.length; a++) if (!(PROC_RANK.get(lead[a]) > PROC_RANK.get(lead[a - 1]))) return comp;
        { let q = 0; for (const ch of rest) if (q < can.length && ch === can[q]) q++; if (q < can.length) return comp; }   // the rest still spells the root
        const pre = lead.flatMap(ch => PROC_COMPS.get(ch).components.map(c => ({ ...c })));
        const root = { ...cs[ri], paleo: rest.join(''), translit: '' };   // build-surface-index re-spells it in its word
        peeledFallback++;
        const components = [...cs.slice(0, ri), ...pre, root, ...cs.slice(ri + 1)];
        const all = [...new Set([...lead.map(ch => PROC_COMPS.get(ch).strongs).filter(Boolean), ...(comp.all_strongs || [])])];
        return { ...comp, components, all_strongs: all, rendered_paleo: components.map(c => c.paleo).join('') };
    };

    // ── attested components for a bare SUFFIX tail (added 2026-07-29) ────────
    // Every prefix tier above (particle, proclitic) has a mirror-image gap on
    // the SUFFIX side that this file never closed: a fused word ending in a
    // real pronominal/nominal/verbal suffix (𐤀𐤋𐤄𐤉𐤌𐤊 = Alahayam + 𐤊 "your")
    // had NO split at all. NME_PALEO/VBE_PALEO/UVF_PALEO/PRS_ALLO above only
    // fed `reconstructableTails`, which is OT-alignment-only — it verifies a
    // BHS RUN's tail against the HEB word during alignment; it never runs on
    // an NT word considered in isolation the way resolveAll() does for
    // prefixes. SUFFIX_TAILS is every letter-sequence those four tables can
    // produce, tried longest-first so a genuinely-2mp 𐤊𐤌 isn't chopped as
    // 2ms 𐤊 with a stray 𐤌 left dangling. Each tail's GLOSS is taken from a
    // real attested BHS token ending in it (same principle as PROC_COMPS just
    // above — nothing here is a hand-typed translation).
    const SUFFIX_TAILS = [...new Set([
        ...Object.values(NME_PALEO).flat(),
        ...Object.values(VBE_PALEO).flat(),
        ...Object.values(UVF_PALEO).flat(),
        ...ALL_PRS_FORMS,
    ])].sort((a, b) => [...b].length - [...a].length);
    const SUF_COMPS = new Map();
    {
        const q = src.prepare(`
            SELECT word_raw, pos, morph, strongs, COUNT(*) AS n
            FROM tokens_bhs
            WHERE word_raw LIKE '%' || ? AND pos != 'punct'
            GROUP BY pos, morph, strongs
            ORDER BY n DESC
            LIMIT 400
        `);
        // LIMIT was 30. Since the 2026-09-07 "the borrowed component must BE the
        // suffix" gate below, the top 30 rows ending in a tail are mostly words whose
        // last letter is a ROOT radical or an absorbed ending (𐤊𐤉, 𐤁𐤍𐤉 nme=JM, 𐤀𐤍𐤉 …),
        // so almost no tail ever found its evidence: a 2026-09-26 probe showed 4/38
        // tails attested, which silently disabled the whole `suffix`/`affixed` tier —
        // 𐤔𐤋𐤉𐤇𐤉 "apostles of" (𐤔𐤋𐤉𐤇 + 𐤉) could not even be proposed. The gates are
        // unchanged; they just get enough rows to find a real example.
        // What tail(s) does THIS token's OWN morphology (not its spelling)
        // actually imply? Gates the SQL's textual LIKE match against real
        // tagging, so a word ending in 𐤊 for some unrelated reason (a root
        // radical, say) can't be mistaken for an attested 2ms/2fs suffix.
        const impliedTails = (a) => {
            const out = [];
            if (a.nme && NME_PALEO[a.nme]) out.push(...NME_PALEO[a.nme]);
            if (a.vbe && VBE_PALEO[a.vbe]) out.push(...VBE_PALEO[a.vbe]);
            if (a.uvf && UVF_PALEO[a.uvf]) out.push(...UVF_PALEO[a.uvf]);
            if (a.prs && PRS_ALLO[a.prs]) out.push(...PRS_ALLO[a.prs]);
            return out;
        };
        for (const tail of SUFFIX_TAILS) {
            if (SUF_COMPS.has(tail)) continue;
            let rows = [];
            try { rows = q.all(tail); } catch { rows = []; }
            for (const row of rows) {
                if (!impliedTails(morphAttrs(row.morph)).includes(tail)) continue;
                const parsed = parseToken(row.word_raw, row.pos, row.morph, row.strongs);
                if (!parsed || !parsed.components || !parsed.components.length) continue;
                const last = parsed.components[parsed.components.length - 1];
                // The borrowed component must BE the suffix: a real ending chip
                // (nme/prs/vbe/uvf class) spelling exactly this tail. Without this
                // gate the most frequent 𐤌-final word is 𐤀𐤋𐤄𐤉𐤌, whose plural ending
                // is absorbed into its root, so "last component" was the Elohim
                // ROOT chip — and every NT word split as stem + 𐤌 grew an
                // "Alahayam" root (𐤌𐤊𐤌𐤌, 𐤔𐤋𐤅𐤉𐤌, 𐤋𐤁𐤋𐤅𐤌 … caught by
                // verify-parallel-alignment on the 2026-09-07 deploy).
                if (!last || last.paleo !== tail || !/^(nme|prs|vbe|uvf)-/.test(last.css || '')) continue;
                SUF_COMPS.set(tail, { component: last, pos: row.pos || '' });
                break;
            }
        }
        log(`  suffix glosses taken from BHS: ${SUF_COMPS.size}/${SUFFIX_TAILS.length} attested tails`);
    }
    // The 3fs possessive 𐤄 as the BHS renders it (see the bare-𐤄 choice in the NT loop).
    // ETCBC word_raw omits pronominal suffixes, so the LIKE query above never meets one;
    // take it from a real noun tagged prs=3fs instead.
    let SUF_3FS = null;
    try {
        for (const row of src.prepare(`SELECT word_raw, pos, morph, strongs, COUNT(*) AS n FROM tokens_bhs
                                        WHERE pos = 'subs' AND morph LIKE '%prs=3fs%'
                                        GROUP BY word_raw, pos, morph, strongs ORDER BY n DESC LIMIT 50`).all()) {
            const parsed = parseToken(row.word_raw, row.pos, row.morph, row.strongs);
            const last = parsed && parsed.components && parsed.components[parsed.components.length - 1];
            if (last && last.paleo === '\u{10904}' && /^prs-3fs/.test(last.css || '')) { SUF_3FS = { component: last, pos: row.pos }; break; }
        }
    } catch { SUF_3FS = null; }
    log(`  3fs possessive 𐤄 for NT splits: ${SUF_3FS ? 'from BHS' : 'NOT FOUND (all bare 𐤄 stay [Toward])'}`);

    // ── ROOT STRIP (added 2026-10-16) ─────────────────────────────────────────
    // fieldy, Revelation 16:21: 𐤅𐤉𐤂𐤃𐤐𐤅 "and they blasphemed" showed no Strong's.
    // "I literally just took off what looks like regular prefixes and searched for
    // the transliteration of what I assumed to be the root" — 𐤂𐤃𐤐 Gadap H1442. "I
    // want the NT tokens combed over again following this strategy."
    // Why every tier above missed it: they peel only 𐤅 𐤄 𐤁 𐤋 𐤊 𐤌 𐤔 (+ the fused
    // particles) and then need the stem to be a WHOLE word the OT spells that way.
    // A verb's own prefix (𐤉 𐤕 𐤀 𐤍, 𐤄 hiphil, 𐤄𐤕/𐤉𐤕 … hithpael) is never peeled, so
    // 𐤅+𐤉+𐤂𐤃𐤐+𐤅 had no path. Measured 2026-10-16: 14,970 HEB surfaces unresolved.
    // This tier does what he did, for words NOTHING ELSE resolved (it never changes
    // an existing reading): peel proclitics (+ particle), a verb preformative, and an
    // attested suffix tail (one piece, or ending + pronoun: 𐤉 + 𐤅 "his …s"); the stem
    // must then BE a Strong's root (strongs-roots.json) or an OT-attested form of that
    // Strong's (internal 𐤅/𐤉 ignored only when nothing matches exactly). Gates — each a
    // mistake the probe made before it was added:
    //  - a preformative only with a VERB Strong's (strongs_def "to …"); an imperfect
    //    one (𐤉 𐤕 𐤀 𐤍 𐤉𐤕 𐤕𐤕 𐤍𐤕, and 𐤌𐤕) only after 𐤅/𐤔/𐤄, never after a preposition
    //    (𐤌+𐤀+ra'ah for 𐤌𐤀𐤅𐤓𐤏𐤅𐤕 "from the events");
    //  - every chip is BHS evidence: proclitics PROC_COMPS, tails SUF_COMPS,
    //    preformatives PFM_COMPS (parseToken of real BHS verbs) — nothing typed here;
    //  - the verse's own English must name that Strong's (kjv_def / strongs_def / his
    //    lexicon gloss; ±1 verse in canon > 66) — OR the spelling must, in >= 2 of its
    //    occurrences and >= 30% of them. Without that witness the root-only guesses were
    //    often wrong (Goshen, Sivan, "scourge"), so those are LISTED in
    //    heb-rootstrip-review.txt, never tagged.
    const RS_PREFS = ['𐤌𐤕', '𐤄𐤕', '𐤉𐤕', '𐤕𐤕', '𐤍𐤕', '𐤉', '𐤕', '𐤀', '𐤍', '𐤄', '𐤌'];
    const RS_IMPF = new Set(['𐤉', '𐤕', '𐤀', '𐤍', '𐤉𐤕', '𐤕𐤕', '𐤍𐤕', '𐤌𐤕']);
    const RS_IMPF_AFTER = new Set(['𐤅', '𐤔', '𐤄']);
    const PFM_COMPS = new Map();
    if (rootStrip) {
        const q = src.prepare(`SELECT word_raw, pos, morph, strongs, COUNT(*) AS n FROM tokens_bhs
                               WHERE pos = 'verb' AND word_raw LIKE ? || '%'
                               GROUP BY morph ORDER BY n DESC LIMIT 60`);
        for (const pf of RS_PREFS) {
            let rows = [];
            try { rows = q.all(pf); } catch { rows = []; }
            const tally = new Map();
            for (const row of rows) {
                if ([...row.word_raw].length < [...pf].length + 3) continue;
                let parsed = null;
                try { parsed = parseToken(row.word_raw, row.pos, row.morph, row.strongs); } catch { continue; }
                const lead = []; let acc = '';
                for (const c of (parsed && parsed.components) || []) {
                    if (!/^(pfm|vbs)-/.test(c.css || '')) break;
                    lead.push(c); acc += c.paleo || '';
                    if (acc === pf) break;
                }
                if (acc !== pf) continue;
                const k = lead.map(c => c.css).join('+');
                if (!tally.has(k)) tally.set(k, { n: 0, comps: lead });
                tally.get(k).n++;
            }
            const best = [...tally.values()].sort((a, b) => b.n - a.n)[0];
            if (best) PFM_COMPS.set(pf, best.comps.map(c => ({ ...c })));
        }
        log(`  root-strip preformatives taken from BHS: ${[...PFM_COMPS.keys()].join(' ') || '(none)'}`);
    }
    const RS_TAILS = SUFFIX_TAILS.filter(t => SUF_COMPS.has(t));
    const RS_ENDINGS = new Set(['𐤉', '𐤕', '𐤅𐤕', '𐤅𐤕𐤉']);
    // Proclitics stack in one order only: 𐤅, then 𐤔, then 𐤌, then 𐤁/𐤋/𐤊, then 𐤄.
    // 𐤋+𐤄+𐤔 (𐤋𐤄𐤔𐤕𐤌𐤔 "to make use", a hithpael) is not Hebrew and read as "remove".
    const RS_PROC_RANK = { '𐤅': 0, '𐤔': 1, '𐤌': 2, '𐤁': 3, '𐤋': 3, '𐤊': 3, '𐤄': 4 };
    const rsRoots = (rootStrip && rootStrip.roots) || new Map();
    const rsMatres = (s) => {
        const a = [...s];
        return a.length > 2 ? a[0] + a.slice(1, -1).filter(c => c !== '𐤅' && c !== '𐤉').join('') + a[a.length - 1] : s;
    };
    const rsMatIdx = new Map();
    for (const [p, sns] of rsRoots) {
        if ([...p].length < 3) continue;
        const k = rsMatres(p);
        if (!rsMatIdx.has(k)) rsMatIdx.set(k, new Set());
        for (const sn of sns) rsMatIdx.get(k).add(sn);
    }
    const rsVerb = sn => !!(rootStrip && rootStrip.verbs.has(sn));
    const rsName = sn => !!(rootStrip && rootStrip.names.has(sn));
    const rsFreq = sn => (rootStrip && rootStrip.freq.get(sn)) || 0;
    const rsTailSplits = (chars) => {
        const out = [{ pieces: [], len: 0 }];
        for (const t1 of RS_TAILS) {
            const l1 = [...t1].length;
            if (chars.length < l1 + 3 || chars.slice(chars.length - l1).join('') !== t1) continue;
            out.push({ pieces: [t1], len: l1 });
            // Two pieces only as a NOUN ending + a PRONOUN suffix (𐤕𐤋𐤌𐤉𐤃+𐤉+𐤅 "his
            // disciples"). Any other pair invents morphology: 𐤅+𐤍 split "legion"
            // (𐤄𐤋𐤂𐤉𐤅𐤍) into 𐤋𐤂𐤉 "valley" + [His] + 𐤍.
            if (!ALL_PRS_FORMS.includes(t1)) continue;
            for (const t0 of RS_TAILS) {
                if (!RS_ENDINGS.has(t0)) continue;
                const l0 = [...t0].length;
                if (chars.length < l0 + l1 + 3) continue;
                if (chars.slice(chars.length - l1 - l0, chars.length - l1).join('') !== t0) continue;
                out.push({ pieces: [t0, t1], len: l0 + l1 });
            }
        }
        return out;
    };
    const _rsCache = new Map();
    // withLoose: also the internal-𐤅/𐤉 (matres) candidates even when an exact one exists —
    // only for a context reading, which already names the Strong's it wants.
    const _rsLooseCache = new Map();
    const rsCands = (w, withLoose = false) => {
        if (withLoose && _rsLooseCache.has(w)) return _rsLooseCache.get(w);
        if (!withLoose && _rsCache.has(w)) return _rsCache.get(w);
        const chars = [...w], n = chars.length;
        const starts = [{ pre: [], k: 0, particle: false }];
        for (const p of FUSED_PARTICLES) {
            const pl = [...p].length;
            if (n >= pl + 3 && chars.slice(0, pl).join('') === p) starts.push({ pre: [p], k: pl, particle: true });
        }
        const prefixes = [];
        for (const st of starts) {
            prefixes.push(st);
            let acc = [...st.pre], j = st.k;
            let rank = -1;
            for (let m = 0; m < 3 && j < n && PROCLITIC_SET.has(chars[j]); m++) {
                const r = RS_PROC_RANK[chars[j]];
                if (r < rank || (r === rank && r !== 3)) break;
                rank = r;
                acc = [...acc, chars[j]]; j++;
                prefixes.push({ pre: acc, k: j, particle: st.particle });
            }
        }
        const tails = rsTailSplits(chars);
        const exact = [], loose = [];
        for (const P of prefixes) {
            const procs = P.pre.filter(x => [...x].length === 1);
            for (const pf of ['', ...PFM_COMPS.keys()]) {
                const pl = [...pf].length;
                if (pf) {
                    if (chars.slice(P.k, P.k + pl).join('') !== pf) continue;
                    if (RS_IMPF.has(pf) && (P.particle || procs.some(c => !RS_IMPF_AFTER.has(c)))) continue;
                }
                for (const T of tails) {
                    const st = chars.slice(P.k + pl, n - T.len);
                    if (st.length < 3) continue;
                    if (!P.pre.length && !pf && !T.pieces.length) continue;
                    const stem = st.join('');
                    const lastProc = procs[procs.length - 1];
                    const add = (sn, how, arr) => {
                        if (!_isReal(sn)) return;
                        if (pf && !rsVerb(sn)) return;
                        arr.push({ pre: P.pre, pf, stem, tail: T.pieces, sn, how, stripped: n - st.length,
                                   // 𐤌 read as "from" before a VERB loses to 𐤌 read as the participle
                                   mProc: !pf && lastProc === '𐤌' && rsVerb(sn) });
                    };
                    const rootSNs = rsRoots.get(stem) || [];
                    for (const sn of rootSNs) add(sn, 'root', exact);
                    const b = FORMS.get(stem);
                    if (b) for (const v of b.values()) {
                        const rec = surfaces.get(v.key);
                        const sn = rec && _normH(rec.strongs);
                        if (sn && !rootSNs.includes(sn)) add(sn, 'form', exact);
                    }
                    for (const sn of rsMatIdx.get(rsMatres(stem)) || []) add(sn, 'matres', loose);
                }
            }
        }
        // Internal 𐤅/𐤉 only when nothing matches exactly — or when every exact match is a name.
        const out = exact.some(x => !rsName(x.sn)) ? exact : [...exact, ...loose];
        _rsCache.set(w, out);
        _rsLooseCache.set(w, [...exact, ...loose]);
        return withLoose ? _rsLooseCache.get(w) : out;
    };
    const RS_HOW = { root: 0, form: 1, matres: 2 };
    // A NAME loses to an ordinary word whenever both fit: the 2026-10-16 sample's misses
    // were mostly names (𐤋𐤂𐤌𐤅𐤓 "to finish" -> Gomer, 𐤀𐤆𐤓𐤇𐤉𐤌 "citizens" -> Ezrahite).
    const rsCmp = (a, b) => ((rsName(a.sn) ? 1 : 0) - (rsName(b.sn) ? 1 : 0)) || (RS_HOW[a.how] - RS_HOW[b.how])
        || (a.stripped - b.stripped) || ((a.mProc ? 1 : 0) - (b.mProc ? 1 : 0)) || (rsFreq(b.sn) - rsFreq(a.sn));
    const RS_STOP = new Set(('the and that this with from they them their there were what which shall will would should '
        + 'might have been being into upon unto over make made take took give gave come came went bring brought thing '
        + 'things cause also self such some many much other another away back again before after first time place part '
        + 'even about against among through without within thus therefore more most same idiom phrase margin compare '
        + 'very great like your yours ours whom when then than each every').split(' '));
    const rsStems = (t) => new Set(((t || '').match(/[A-Za-z]{4,}/g) || [])
        .filter(x => !RS_STOP.has(x.toLowerCase())).map(stemWord));
    const _rsW = new Map();
    const rsWords = (sn) => {
        if (!_rsW.has(sn)) _rsW.set(sn, rsStems(String((rootStrip && rootStrip.snText.get(sn)) || '').replace(/\[[^\]]*\]/g, ' ')));
        return _rsW.get(sn);
    };
    const _rsVS = new Map();
    const rsVerse = (c, ch, v) => {
        const k = c + '|' + ch + '|' + v;
        if (!_rsVS.has(k)) {
            const eo = englishSrcOf || englishOf || (() => '');
            let t = eo(c, ch, v) || '';
            if (c > 66 || !t) t += ' ' + (eo(c, ch, v - 1) || '') + ' ' + (eo(c, ch, v + 1) || '');
            _rsVS.set(k, rsStems(t));
        }
        return _rsVS.get(k);
    };
    const rsAgreeing = (w, c, ch, v) => {
        const vs = rsVerse(c, ch, v);
        return rsCands(w).filter(x => { for (const s of rsWords(x.sn)) if (vs.has(s)) return true; return false; }).sort(rsCmp);
    };
    let rootStripHits = 0;
    const rootStripLog = [], rootStripReview = new Map();   // word -> {n, best, refs}
    const rsSpellPick = new Map();                          // word -> SN its own occurrences support

    // ── NT ────────────────────────────────────────────────────────────────────
    log('  NT: resolving whole words against the OT-attested form table…');
    const MATRES_INDEX = new Map();
    for (const f of FORMS.keys()) {
        const k = matresKey(f);
        if ([...k].length >= 3 && !MATRES_INDEX.has(k)) MATRES_INDEX.set(k, f);
    }
    // How many times this exact form is attested in the OT. A whole-word match on
    // a form seen once is much weaker evidence than a decomposition whose stem is
    // seen hundreds of times — that ratio is what separates 𐤌𐤓𐤅𐤕 = Maroth (rare)
    // from 𐤌 + 𐤓𐤅𐤕 = "from Ruth" (common).
    const formCount = (f) => {
        const b = FORMS.get(f);
        if (!b) return 0;
        let n = 0;
        for (const v of b.values()) n += v.count || 0;
        return n;
    };

    const bestOf = (form, forcedSN) => {
        const b = FORMS.get(form);
        if (!b) return null;
        // Occurrence override: only takes effect if THIS form's own attested
        // readings actually include the forced SN — never fabricates a
        // reading that isn't independently attested somewhere in the OT
        // alignment. If the override doesn't apply here, falls through to
        // the normal best-by-count pick below.
        if (forcedSN) {
            for (const v of b.values()) {
                const rec = surfaces.get(v.key);
                if (rec && _normH(rec.strongs) === forcedSN) {
                    return { key: v.key, ambiguous: b.size > 1, overridden: true };
                }
            }
        }
        const opts = [...b.values()].sort((x, y) => y.count - x.count);
        return { key: opts[0].key, ambiguous: b.size > 1 };
    };
    // Does this form have an attested reading carrying `sn`?
    const formHasSN = (form, sn) => {
        const b = FORMS.get(form);
        if (!b) return false;
        for (const v of b.values()) {
            const rec = surfaces.get(v.key);
            if (rec && _normH(rec.strongs) === sn) return true;
        }
        return false;
    };
    // Multi-letter particles that FUSE onto the next word in this edition. 𐤀𐤕
    // (H853, the direct-object marker) is the one that matters: PROCLITIC_SET
    // holds single letters only, so 𐤀𐤕 could never be split off, and a name it
    // fused with had to be rescued by the fuzzier `adjacent` tier — or missed.
    // Matthew 1:5 is the demonstration: 𐤀𐤕𐤁𐤏𐤆 and 𐤀𐤕𐤏𐤅𐤁𐤃 came out as proper
    // names, but 𐤀𐤕𐤉𐤔𐤉 — eth + 𐤉𐤔𐤉 Yishai/Jesse — was resolved as a 1cs
    // imperfect of H5428 𐤍𐤕𐤔 nathash instead, so the last man in the genealogy
    // rendered as a verb.
    //
    // WIDENED 2026-07-29: 𐤀𐤕 was the only entry, so a fused prefix like 𐤏𐤋
    // (al, "over/upon" — Hebrews 1's 𐤏𐤋𐤄𐤌𐤋𐤀𐤊𐤉𐤌, "over the angels") had no path
    // at all — PROCLITIC_SET is single letters only, and 𐤏𐤋 is two. Every entry
    // below is NOT a new guess: it is build-surface-index.js's own
    // STANDALONE_WORDS (passed in as o.fusedParticles), the list that file
    // already trusts as real, independently-headed particle words rather than
    // silent proclitics. Reusing it here costs nothing new to trust, and every
    // one still goes through the same gate 𐤀𐤕 always did — resolveAll() only
    // accepts the split if the stem AFTER removing the particle is an EXACT,
    // independently attested whole word (FORMS.has(stem)); nothing here loosens
    // that. If o.fusedParticles is not supplied, behavior is unchanged (𐤀𐤕 only).
    const FUSED_PARTICLES = (o.fusedParticles && o.fusedParticles.length) ? o.fusedParticles : ['𐤀𐤕'];

    // Every reading this word supports, best-evidence first. resolve() still
    // takes [0], but collecting the rest is what makes a wrong pick FINDABLE
    // instead of something to stumble across in the reader.
    const resolveAll = (w) => {
        const out = [];
        if (FORMS.has(w)) out.push({ tier: 'exact', forms: [w] });
        const viaMatres = MATRES_INDEX.get(matresKey(w));
        if (viaMatres && matresEquivalent(viaMatres, w) && viaMatres !== w)
            out.push({ tier: 'plene', forms: [viaMatres] });
        const seq = SEQ.get(w);
        if (seq) {
            const opts = [...seq.values()].sort((a, b) => b.count - a.count);
            out.push({ tier: 'adjacent', forms: opts[0].parts, ways: opts.length,
                       count: opts[0].count });
        }
        const chars = [...w];
        // Fused multi-letter particles, then single-letter proclitics.
        for (const p of FUSED_PARTICLES) {
            const pl = [...p].length;
            if (chars.length <= pl + 1) continue;
            if (chars.slice(0, pl).join('') !== p) continue;
            const stem = chars.slice(pl).join('');
            if ([...stem].length >= 2 && FORMS.has(stem)) {
                out.push({ tier: 'particle', forms: [p, stem], proclitics: 1 });
                continue;  // residual already attested — no need to try stacking below
            }
            // STACKING (added 2026-07-29): the residual right after the particle
            // isn't itself attested, but this edition can still glue a following
            // single-letter proclitic onto it before the real stem — "min ha-"
            // (𐤌𐤍 + 𐤄 + noun) keeps the full particle before a guttural article
            // instead of assimilating, so "Manahamalaakayam" is 𐤌𐤍 (from) + 𐤄
            // (the) + 𐤌𐤋𐤀𐤊𐤉𐤌 (angels), not one big unresolved blob. Same
            // evidence gate as every tier here, just applied twice in sequence:
            // the FINAL residual, after both strips, must be an exact,
            // independently attested whole word — not the immediate one.
            const stemChars = chars.slice(pl);
            for (let k = 1; k <= 2 && k < stemChars.length - 1; k++) {
                if (!stemChars.slice(0, k).every(c => PROCLITIC_SET.has(c))) break;
                const innerStem = stemChars.slice(k).join('');
                if ([...innerStem].length >= 2 && FORMS.has(innerStem))
                    out.push({ tier: 'particle', forms: [p, ...stemChars.slice(0, k), innerStem], proclitics: 1 });
            }
        }
        for (let k = 1; k <= 2 && k < chars.length - 1; k++) {
            if (!chars.slice(0, k).every(c => PROCLITIC_SET.has(c))) break;
            const stem = chars.slice(k).join('');
            // EXACT stem only. Allowing a fuzzy stem here stacks two inferences
            // and yields confident nonsense.
            if ([...stem].length >= 2 && FORMS.has(stem))
                out.push({ tier: 'proclitic', forms: [...chars.slice(0, k), stem], proclitics: k });
        }
        // Suffix strip (added 2026-07-29, see SUFFIX_TAILS above). Same one-
        // inference-per-resolution discipline as every prefix tier: the tail
        // must be a real attested morpheme shape, and the residual stem must
        // be an EXACT, independently attested whole word — never fuzzy, never
        // stacked with a prefix strip in the same reading.
        //
        // GATED ON SUF_COMPS 2026-07-29 (Hebrews 1:13, "day" vs "right hand"):
        // requiring FORMS.has(stem) alone let through a tail with NO real
        // attested gloss — the composed reading then had to invent an empty
        // `mod-suff-unk` filler component just to account for those letters,
        // while a DIFFERENT, fully-attested reading (right hand, every letter
        // explained, nothing invented) was available and lost anyway because
        // this one came first / scored higher on raw stem frequency. A tail
        // this file cannot actually gloss is not real evidence for a split —
        // don't accept the candidate at all, rather than accept it and hope
        // a later comparison catches the fabrication.
        for (const tail of SUFFIX_TAILS) {
            if (!SUF_COMPS.has(tail)) continue;
            const tl = [...tail].length;
            if (chars.length <= tl + 1) continue;
            if (chars.slice(chars.length - tl).join('') !== tail) continue;
            const stem = chars.slice(0, chars.length - tl).join('');
            if ([...stem].length >= 2 && FORMS.has(stem))
                out.push({ tier: 'suffix', forms: [stem, tail], suffixLen: tl });
        }
        // Combined prefix + suffix (added 2026-07-29). "Athahaiwalamawath" is
        // 𐤀𐤕 (eth) + 𐤄 (the) + 𐤏𐤅𐤋𐤌 (Iwalam, "age/eternity" — attested BARE
        // elsewhere in this same corpus, e.g. plain "Iwalam" a few verses later)
        // + 𐤅𐤕 (feminine plural) — "the ages", the object of "he made" (Hebrews
        // 1:2). Neither a prefix-only nor a suffix-only tier can reach this: the
        // prefix-stripped residual (𐤏𐤅𐤋𐤌𐤅𐤕) isn't itself attested, and the
        // suffix-stripped residual (𐤀𐤕𐤄𐤏𐤅𐤋𐤌) isn't either — only stripping BOTH
        // reaches the attested stem. Recomputes the same prefix candidates as
        // the particle/proclitic loops above (cheap — a handful of known
        // particles/letters) rather than threading state out of them, to keep
        // this block a self-contained, independently-removable addition. Same
        // rule as everywhere else: the residual after BOTH strips must be an
        // exact, independently attested whole word.
        const prefixStrips = [];
        for (const p of FUSED_PARTICLES) {
            const pl = [...p].length;
            if (chars.length <= pl) continue;
            if (chars.slice(0, pl).join('') !== p) continue;
            prefixStrips.push({ forms: [p], len: pl });
            const afterP = chars.slice(pl);
            for (let k = 1; k <= 2 && k < afterP.length; k++) {
                if (!afterP.slice(0, k).every(c => PROCLITIC_SET.has(c))) break;
                prefixStrips.push({ forms: [p, ...afterP.slice(0, k)], len: pl + k });
            }
        }
        for (let k = 1; k <= 2 && k < chars.length; k++) {
            if (!chars.slice(0, k).every(c => PROCLITIC_SET.has(c))) break;
            prefixStrips.push({ forms: [...chars.slice(0, k)], len: k });
        }
        for (const ps of prefixStrips) {
            for (const tail of SUFFIX_TAILS) {
                // Same SUF_COMPS gate as the plain suffix loop above, same reason.
                if (!SUF_COMPS.has(tail)) continue;
                const tl = [...tail].length;
                if (chars.length <= ps.len + tl + 1) continue;
                if (chars.slice(chars.length - tl).join('') !== tail) continue;
                const stem = chars.slice(ps.len, chars.length - tl).join('');
                if ([...stem].length >= 2 && FORMS.has(stem))
                    out.push({ tier: 'affixed', forms: [...ps.forms, stem, tail],
                               prefixLen: ps.len, suffixLen: tl });
            }
        }
        return out;
    };

    const resolve = (w) => {
        const all = resolveAll(w);
        if (!all.length) return null;
        const forced = forcedReadings.get(w);
        if (Array.isArray(forced) && forced.length) {
            const key = forced.join('\u0000');
            const hitF = all.find(r => r.forms.join('\u0000') === key);
            if (hitF) { forcedReadingHits++; return hitF; }
            forcedReadingMisses.set(w, all.map(r => r.tier + ':' + r.forms.join('+')).join(' | '));
        }
        // A whole-word `exact` hit is usually right, but not always: a NT name
        // fused with a particle can coincide with an unrelated OT word, and the
        // coincidence wins because it is tried first. 𐤌𐤓𐤅𐤕 (𐤌 + 𐤓𐤅𐤕 Ruth)
        // matched H4796 Maroth; 𐤀𐤕𐤉𐤔𐤉 (𐤀𐤕 + 𐤉𐤔𐤉 Jesse) matched a verb.
        // Neither is decidable from spelling alone, so DO NOT silently reorder —
        // record the competing reading and report it.
        let chosen = all[0];
        // ── PREFER A COMPOSITIONAL SPLIT OVER A HAPAX COINCIDENCE ───────────
        // `exact`/`plene` win by default because a whole-word match is usually
        // right. But when that whole word is attested once or twice and the text
        // also parses as [particle] + [well-attested word], the coincidence is
        // the weaker reading. This is the 𐤌𐤓𐤅𐤕 case: Maroth attested 1x beat
        // 𐤌 + 𐤓𐤅𐤕 "from Ruth", stem attested 10x.
        // `adjacent` is included as a losable tier on purpose: it is a fuzzy
        // concatenation lookup, WEAKER evidence than an exact stem match behind a
        // known particle. Leaving it out is why 𐤀𐤕 + name kept losing — 329 rows,
        // almost all chosen as `adjacent` on a whole word attested once.
        //
        // WIDENED 2026-07-29: `proclitic`/`particle` were never losable either,
        // which is the SAME bug one layer in. "LaBanayamayanay" (right hand,
        // 1cs) has a `proclitic` reading (La + a 5-letter residual that happens
        // to ALSO be attested once, coincidentally) that became `all[0]` and,
        // because `proclitic` wasn't in LOSABLE, was never even compared
        // against the much better-attested `affixed` reading (La + Yamayan +
        // bare-𐤉, residual attested independently many times over) — it just
        // won by array position. Same fix, same principle, one tier later.
        //
        // WIDENED AGAIN same day: `affixed`/`suffix` themselves were not
        // losable, so if a WRONG `affixed` candidate (e.g. a "day" reading)
        // happened to be pushed before a RIGHT one (e.g. "right hand") during
        // resolveAll()'s prefix×suffix search and became `all[0]`, nothing
        // could ever reconsider it even after bestOfTier() (below) can now
        // correctly identify the better alternative. Every tier this file
        // produces is losable now, on the same evidence terms.
        const LOSABLE = new Set(['exact', 'plene', 'adjacent', 'proclitic', 'particle', 'affixed', 'suffix']);
        if (PREFER_SPLIT_MAX > 0 && LOSABLE.has(chosen.tier)) {
            // Which form in `r.forms` is the actual CONTENT stem, per tier shape:
            //  - particle/proclitic: prefix(es) first, stem last
            //  - suffix:             stem first, tail last
            //  - affixed:            prefix(es), stem, tail — stem is second-to-last
            //  - exact/plene/adjacent: no split; longest form is the closest analog
            const stemOfR = r => {
                if (r.tier === 'affixed') return r.forms[r.forms.length - 2];
                if (r.tier === 'suffix') return r.forms[0];
                if (r.tier === 'proclitic' || r.tier === 'particle') return r.forms[r.forms.length - 1];
                return r.forms.reduce((a, b) => ([...b].length > [...a].length ? b : a), '');
            };
            const readCount = r => r.tier === 'adjacent' ? (r.count || formCount(stemOfR(r)))
                                 : formCount(r.tier === 'exact' ? w : stemOfR(r));
            const wholeCount = readCount(chosen);
            // BUG FOUND 2026-07-29 (Hebrews 1:13, "sit at my right hand"): a
            // word can have MULTIPLE candidates within the SAME tier — e.g.
            // two different `affixed` splits, one landing on "day" (H3117,
            // extremely common), one on "right hand" (H3225, much rarer).
            // `all.find(r => r.tier === X)` returns whichever was pushed FIRST
            // while resolveAll() iterated prefix-candidates × suffix-tails —
            // an accident of loop order, not a comparison of evidence. "day"
            // won here purely because it was discovered first, not because it
            // was better attested; the render showed "LaYawamay (day)" with no
            // "right hand" chip anywhere in the verse. Fixed with bestOfTier():
            // scan ALL entries of a tier and keep the one with the highest
            // stem attestation, the same standard every OTHER comparison in
            // this function already uses.
            const bestOfTier = (tier) => {
                let best = null, bestCount = -1;
                for (const r of all) {
                    if (r.tier !== tier) continue;
                    const c = formCount(stemOfR(r));
                    if (c > bestCount) { best = r; bestCount = c; }
                }
                return best;
            };
            // Try the MOST-decomposed reading first (affixed, then suffix),
            // then the single-strip tiers (particle, then plain proclitic) —
            // when several are simultaneously eligible, prefer the one that
            // explains more of the word rather than whichever happens to sort
            // first by tier name. `split === chosen` is skipped explicitly:
            // now that `proclitic`/`particle` are themselves in LOSABLE,
            // `bestOfTier` can return the SAME entry that's already `chosen`
            // (a word that only has a proclitic reading, no better one), which
            // would otherwise "confirm itself" and break the loop before ever
            // reaching the genuinely different, better-attested candidates.
            const cands = [
                [bestOfTier('affixed'),   PREFER_SPLIT_MAX],
                [bestOfTier('suffix'),    PREFER_SPLIT_MAX],
                [bestOfTier('particle'),  PREFER_PARTICLE_MAX],
                [bestOfTier('proclitic'), PREFER_SPLIT_MAX],
            ];
            for (const [split, maxWhole] of cands) {
                if (!split || split === chosen || wholeCount > maxWhole) continue;
                // An ENDING split never overrides a whole word the OT actually attests.
                // 2026-09-26: once SUF_COMPS found evidence for more tails, Rev 21:18's
                // 𐤅𐤁𐤍𐤉𐤍 (attested exactly: 𐤅 + Aramaic banayin "building") lost to
                // 𐤅 + 𐤁𐤍 "son" + [My/Of] + [Emphatic] — a common stem beats a rare exact
                // word on frequency. Prefix splits (the 𐤌𐤓𐤅𐤕 "from Ruth" case this block
                // exists for) still may.
                if (chosen.tier === 'exact' && (split.tier === 'suffix' || split.tier === 'affixed')) continue;
                if (formCount(stemOfR(split)) < PREFER_SPLIT_STEM) continue;
                chosen = split;
                preferredSplits++;
                break;
            }
        }
        // Record EVERY alternative, not just the first one with a different tier.
        // That shortcut lost the motivating case: for 𐤌𐤓𐤅𐤕 resolveAll returns
        // [exact, plene, proclitic], the first differing tier is `plene`, so the
        // only row written was exact-over-plene — which the report then correctly
        // discards as a mere respelling. The proclitic reading (𐤌 + 𐤓𐤅𐤕, "from
        // Ruth") was never recorded at all, so the one word that started this
        // whole investigation was invisible in its own report.
        for (const alt of all.slice(1)) {
            if (alt.tier === chosen.tier) continue;
            {
                // How well attested is a READING — not the raw input word.
                //
                // My first version scored `formCount(w)` for the chosen side, which
                // is only meaningful for tier `exact`, where the reading IS the
                // whole word. For `plene` the evidence is the matres-variant form,
                // and for `adjacent`/`proclitic`/`particle` the whole word is not a
                // form at all — so formCount(w) returned 0 and every one of those
                // rows scored as maximally suspicious for a bookkeeping reason.
                // 1,935 plene + 674 adjacent rows floated to the top of the report
                // on nothing. Score each reading by its OWN evidence instead.
                // The content word is the LAST part for a prefix split — 𐤀𐤕 + 𐤓𐤌 is
                // eth + Ram, and the name is what matters. Picking the longest
                // part instead resolved 2+2 ties to the PARTICLE, and since 𐤀𐤕 is
                // attested 7,362x every such row scored as maximally suspicious
                // no matter how common the actual name was.
                const stemOf = r => {
                    if (r.tier === 'affixed') return r.forms[r.forms.length - 2];
                    if (r.tier === 'suffix') return r.forms[0];
                    if (r.tier === 'proclitic' || r.tier === 'particle') return r.forms[r.forms.length - 1];
                    return r.forms.reduce((a, b) => ([...b].length > [...a].length ? b : a), '');
                };
                const readingCount = r =>
                    r.tier === 'adjacent' ? (r.count || formCount(stemOf(r)))
                                          : formCount(r.tier === 'exact' ? w : stemOf(r));
                const stem = stemOf(alt);
                ambiguousReadings.push({
                    word: w, chose: chosen.tier, alsoFits: alt.tier,
                    altForms: alt.forms.join(' + '),
                    chosenCount: readingCount(chosen),
                    altStemCount: readingCount(alt),
                    altStem: stem,
                });
            }
        }
        return chosen;
    };

    // FALLBACK FOUND 2026-07-27: this whole NT loop only ever resolves a word by
    // matching its SPELLING against something already attested in the 39 OT
    // books (see `resolve` above) — it never once looks at tokens_nt, even
    // though tokens_nt already carries the correct Strong's tag for many words
    // whose exact spelling never occurs anywhere in the OT (a rare proper name,
    // e.g. Salmon's alternate 5-letter spelling H8012 in Matthew 1:4 — tagged
    // correctly in tokens_nt, but "nt_unresolved" here with an empty, badge-
    // less chip because no OT verse ever wrote that spelling). Fall back to
    // tokens_nt's own (book_id, chapter, verse, token_ordinal) row and parse it
    // the exact same way the BHS/OT pipeline does (via parseToken), but ONLY
    // when tokens_nt's word_raw at that exact position matches `w` exactly —
    // the two are independently tokenized (this loop splits raw HEB verse text
    // on whitespace; tokens_nt has its own ingest), so they are NOT guaranteed
    // to line up token-for-token, and a mismatch must never silently attach
    // the wrong word's tag.
    let ntTokenStmt = null;
    try {
        src.prepare('SELECT 1 FROM tokens_nt LIMIT 1').get();
        ntTokenStmt = src.prepare(`
            SELECT word_raw, pos, morph, strongs FROM tokens_nt
            WHERE book_id = ? AND chapter = ? AND verse = ? AND token_ordinal = ?
        `);
    } catch { /* tokens_nt not built yet — fallback simply never fires */ }
    let ntTokensNtFallback = 0;

    // Confirmed via diag-mat1-4b.mjs (2026-07-27): tokens_nt.word_raw is ALREADY
    // paleo (no script conversion needed — toPaleo() is a no-op on it), so an
    // ordinal-exact whole-word match is sound for a plain word. But it can
    // never catch the "Atha + rare name" case: this edition's raw HEB text
    // glues 𐤀𐤕 (the direct-object marker) onto the FOLLOWING word with no
    // space (see FUSED_PARTICLES above — documented, not new), so wordsOf()
    // yields ONE 8-letter word "AthaShalamawan" at some ordinal, while
    // tokens_nt keeps 𐤀𐤕 (H853) and the name as TWO separate tokens elsewhere
    // in the verse. An ordinal-position match against the glued word can never
    // succeed. Fix: strip the same prefix candidates resolve() itself tries
    // (FUSED_PARTICLES, then 1-2 letter PROCLITIC_SET), and look the STEM up
    // against ANY tokens_nt token in the SAME VERSE (not by position) — this
    // is safe because the verse's own tokens_nt row set is small and each
    // token is consumed at most once, so a repeated name (Aminadab/Nahshon
    // both occur twice per verse here) can't be double-claimed.
    const ntVerseStmt = ntTokenStmt && src.prepare(`
        SELECT token_ordinal, word_raw, pos, morph, strongs FROM tokens_nt
        WHERE book_id = ? AND chapter = ? AND verse = ? ORDER BY token_ordinal
    `);

    const buildFallbackComp = (headParsed, headSN, headPos, headMorph, prefixComponents) => {
        const components = [...prefixComponents.map(c => ({ ...c })), ...headParsed.components];
        return {
            components, strongs: headSN, pos: headPos || '', morph: headMorph || '',
            root_paleo: headParsed.root_paleo,
            rendered_paleo: components.map(c => c.paleo).join(''),
            all_strongs: [headSN],
        };
    };

    const ntRows = VERSES.all(corpus, ntMin, ntMax);
    // Root strip, spelling level: for each word nothing else resolves, how many of its
    // occurrences have English naming each candidate Strong's. Counted before the loop
    // so an occurrence whose own verse is silent can follow its spelling's evidence.
    if (rootStrip) {
        const _savedMaqaf = maqafSplitVerses;
        const resolvable = new Map(), tally = new Map();
        for (const row of ntRows) {
            for (const w of wordsOf(row)) {
                if (!resolvable.has(w)) {
                    const lf = forcedReadings.get(w);
                    // resolveAll, not resolve(): resolve() bumps report counters, and it is null exactly when resolveAll is empty
                    resolvable.set(w, !!(lf && !Array.isArray(lf) && lf.sn) || resolveAll(w).length > 0 || !rsCands(w).length);
                }
                if (resolvable.get(w)) continue;
                if (!tally.has(w)) tally.set(w, { n: 0, by: new Map() });
                const t = tally.get(w); t.n++;
                const ag = rsAgreeing(w, row.canon_id, row.chapter, row.verse);
                if (ag.length) t.by.set(ag[0].sn, (t.by.get(ag[0].sn) || 0) + 1);
            }
        }
        maqafSplitVerses = _savedMaqaf;   // wordsOf counts; the real loop counts again
        for (const [w, t] of tally) {
            const top = [...t.by].sort((a, b) => b[1] - a[1])[0];
            if (top && top[1] >= 2 && top[1] / t.n >= 0.3) rsSpellPick.set(w, top[0]);
        }
        log(`  root strip: ${tally.size.toLocaleString()} unresolved spellings have a root-strip candidate; `
            + `${rsSpellPick.size.toLocaleString()} backed by their own occurrences' English`);
    }
    const rsCompose = (x) => {
        const components = [], spans = [], all = [];
        const push = (comps, p) => {
            const start = components.length;
            for (const c of comps) components.push({ ...c });
            spans.push({ start, end: components.length, pos: p });
        };
        for (const p of x.pre) {
            if ([...p].length === 1) {
                const att = PROC_COMPS.get(p);
                if (att) { push(att.components, att.pos || 'prep'); if (att.strongs) all.push(att.strongs); }
                else push([{ paleo: p, translit: '', translation: '', css: 'mod-pref-unk', derived: true }], 'prep');
            } else {
                const b = bestOf(p);
                if (!b) return null;
                const rec = surfaces.get(b.key);
                push(JSON.parse(rec.components_json), rec.pos || 'prep');
                for (const sn of JSON.parse(rec.all_strongs_json)) all.push(sn);
            }
        }
        if (x.pf) push(PFM_COMPS.get(x.pf), 'verb');
        let pos = '', morph = '', root = '';
        const headSpan = spans.length;
        if (formHasSN(x.stem, x.sn)) {
            const rec = surfaces.get(bestOf(x.stem, x.sn).key);
            push(JSON.parse(rec.components_json), rec.pos || '');
            pos = rec.pos || ''; morph = rec.morph || ''; root = rec.root_paleo;
        } else {
            const cw = composeWord([{ word_raw: x.stem, pos: rsVerb(x.sn) ? 'verb' : 'subs', morph: '',
                                      strongs: x.sn, token_ordinal: 1 }], parseToken);
            push(cw.components, cw.pos);
            pos = cw.pos; morph = cw.morph; root = cw.root_paleo;
        }
        all.push(x.sn);
        for (const t of x.tail) {
            const att = SUF_COMPS.get(t);
            if (!att) return null;
            push([att.component], att.pos || '');
        }
        demoteNonHead(components, spans, headSpan);
        return { components, strongs: x.sn, pos, morph, root_paleo: root || x.stem,
                 rendered_paleo: components.map(c => c.paleo).join(''), all_strongs: [...new Set(all)] };
    };
    // ── EVIDENCE: per-occurrence reading choice (see the `evidence` option) ─────────
    // candidates of a spelling = every Strong's its aligned readings, the BHS tokens of the
    // same spelling, and the root-built readings (root strip) carry; the CURRENT choice is the
    // head form's best-attested Strong's. Switching goes through the context-reading path
    // below (aligned reading -> BHS token -> root-built), so it can never invent a reading.
    const _isVirt = sn => { const n = parseInt(String(sn).replace(/^[Hh]/, ''), 10); return !isNaN(n) && n >= 9000; };
    // spelling -> the Strong's numbers the BHS writes it with (shared with bhsTokenFor)
    const bhsSpellSNs = (w) => { const m = bhsSpellIndex().get(w); return m ? [...m.keys()].filter(sn => !_isVirt(sn)) : []; };
    const _headIdx = (r) => r.forms.map((f, k) => k).filter(k =>
        !(((r.tier === 'suffix' || r.tier === 'affixed') && k === r.forms.length - 1) || (r.tier === 'proclitic' && k < (r.proclitics || 0))));
    const headSN = (r) => {
        for (const k of _headIdx(r)) {
            const b = bestOf(r.forms[k]);
            const rec = b && surfaces.get(b.key);
            const sn = rec && _normH(rec.strongs);
            if (sn && !_isVirt(sn)) return sn;
        }
        return null;
    };
    const _candCache = new Map();
    const candidateSNs = (w) => {
        if (_candCache.has(w)) return _candCache.get(w);
        const out = new Set();
        for (const r of resolveAll(w)) for (const k of _headIdx(r)) {
            const b = FORMS.get(r.forms[k]);
            if (b) for (const v of b.values()) { const rec = surfaces.get(v.key); const sn = rec && _normH(rec.strongs); if (sn && !_isVirt(sn)) out.add(sn); }
        }
        for (const sn of bhsSpellSNs(w)) out.add(sn);
        if (rootStrip) for (const x of rsCands(w, true)) if (!_isVirt(x.sn)) out.add(x.sn);
        const arr = [...out];
        _candCache.set(w, arr);
        return arr;
    };
    // the Strong's numbers the OT attests for this EXACT spelling: its whole-word aligned readings
    // and the BHS tokens written with these letters (heb-evidence judge's exactAlt)
    const _exactCache = new Map();
    const exactSNs = (w) => {
        if (_exactCache.has(w)) return _exactCache.get(w);
        const out = new Set(bhsSpellSNs(w));
        const b = FORMS.get(w);
        if (b) for (const v of b.values()) { const rec = surfaces.get(v.key); const sn = rec && _normH(rec.strongs); if (sn && !_isVirt(sn)) out.add(sn); }
        _exactCache.set(w, out);
        return out;
    };
    // the spelling's own verses, for "does this reading fit the spelling overall?"
    const _spellVerses = new Map(), _spellAgree = new Map();
    if (evidence) {
        const _savedMaqaf = maqafSplitVerses;
        for (const row of ntRows) for (const w of new Set(wordsOf(row))) {
            if (!_spellVerses.has(w)) _spellVerses.set(w, []);
            _spellVerses.get(w).push([row.canon_id, row.chapter, row.verse]);
        }
        maqafSplitVerses = _savedMaqaf;
    }
    // the evidence module's own word stems of a verse's ORIGINAL English (its normalisation,
    // not stemWord's — the two must not mix)
    const _evVs = new Map();
    // greekOf(c, ch, v) -> [[relative position, [H…]], …] in Greek word order
    const _grkCache = new Map();
    const grk = (c, ch, v) => {   // CONFIRMING: every Hebrew number the verse's Greek stands for, ±1 verse (versification drift)
        if (!greekOf) return null;
        const k = c + '|' + ch + '|' + v;
        if (!_grkCache.has(k)) {
            const all = [greekOf(c, ch, v), greekOf(c, ch, v - 1), greekOf(c, ch, v + 1)].filter(Boolean);
            _grkCache.set(k, all.length ? new Set(all.flatMap(ws => ws.flatMap(x => x[1]))) : null);
        }
        return _grkCache.get(k);
    };
    // SWITCHING / CONTRADICTING: only the Greek words standing where this Hebrew word stands (within a quarter of the
    // verse) — a whole verse almost always holds SOME μετά / οὐ / θεός (2026-10-30: the bag of the verse switched
    // 𐤀𐤕 object-marker -> "with" 486x, 𐤀𐤋 "to" -> "not")
    const GREEK_WIN = 0.25;
    const grkNear = (c, ch, v, rel) => {
        const ws = greekOf ? greekOf(c, ch, v) : null;
        if (!ws) return null;
        const out = new Set();
        for (const [p, hs] of ws) if (Math.abs(p - rel) <= GREEK_WIN) for (const h of hs) out.add(h);
        return out;
    };
    // only CONTENT readings are switched by the Greek — particles are rendered too differently to judge.
    // The SAME test the English judge uses (evidence.judgeable: rare in ordinary verses AND predicts its own OT
    // tags >= 50%). The base rate alone let 𐤀𐤕 -> "with" (156), 𐤀𐤋 "to" -> "not" (250), 𐤌𐤉 "who" -> "what" (156),
    // 𐤀𐤌 "if" -> "mother" (16) through (2026-10-30 build on fieldy's DBs).
    const grkContent = sn => !!(evidence && sn && !_isVirt(sn) && evidence.judgeable(sn));
    // never between near-twins (profiles share >= 50%) or two numbers with the SAME letters (H3068/H3069 Yahawah,
    // dabar noun/verb) — the Greek cannot tell them apart any better than the English
    const _lemmaOf = sn => SN_ROOT.get(_normH(sn)) || SN_ROOT.get(_normH(String(sn).replace(/[a-z]$/, ''))) || '';
    const grkDistinct = (a, b) => !evidence.twins(a, b) && !(_lemmaOf(a) && _lemmaOf(a) === _lemmaOf(b));
    // ONE test for "the Greek may overrule this reading", used by the switch AND the contradicted label (2026-10-30):
    // both readings content vocabulary, the other not a name, and not a near-twin / same-letters number.
    // (An exact-letters requirement for names was tried and REMOVED the same day: it blocked prefixed forms the
    // Greek decides correctly — 𐤄𐤇𐤕𐤍 "the bridegroom" 14x, 𐤁𐤌𐤏𐤔𐤉𐤌 "in works", 𐤋𐤄𐤅𐤔𐤏 "to save", 𐤁𐤏𐤅𐤋𐤌 "forever".)
    const grkMayJudge = (c0) => grkContent(c0);
    const grkAltOk = (c0, s) => s !== c0 && grkContent(s) && !evidence.isName(s) && grkDistinct(c0, s);
    let greekSwitches = 0, greekConfirmed = 0;
    const evVerseStems = (c, ch, v) => {
        const k = c + '|' + ch + '|' + v;
        if (!_evVs.has(k)) {
            const src = englishSrcOf || englishOf || (() => '');
            let t = src(c, ch, v) || '';
            if (!t) t = (src(c, ch, v - 1) || '') + ' ' + (src(c, ch, v + 1) || '');   // versification drift
            _evVs.set(k, evidence.stemsOf(t));
        }
        return _evVs.get(k);
    };
    const spellAgree = (w, sn) => {
        const k = w + '|' + sn;
        if (!_spellAgree.has(k)) {
            const vv = _spellVerses.get(w) || [];
            let n = 0;
            for (const [c, ch, v] of vv) if (evidence.hits(sn, evVerseStems(c, ch, v))) n++;
            _spellAgree.set(k, vv.length ? n / vv.length : 0);
        }
        return _spellAgree.get(k);
    };
    // the app's own transliteration of each number, from the readings built so far (the OT
    // alignment): the English carries names and titles transliterated ("Alahayam")
    if (evidence) {
        for (const rec of surfaces.values()) {
            let cl; try { cl = JSON.parse(rec.components_json); } catch { continue; }
            for (const c of cl) {
                const sn = c && (c.sn || (c.css === 'root' ? rec.strongs : null));
                if (!sn) continue;
                for (const t of [c.lemmaTranslit, c.true_root_translit]) if (t) evidence.addTranslit(sn, t);
            }
        }
    }
    let autoSwitches = 0;
    const switchedKeys = new Map();   // occKey -> 'hand' | 'auto'
    const pNT = progress('NT: resolving whole words', ntRows.length);
    for (const row of ntRows) {
        pNT.tick();
        const hw = wordsOf(row);
        const ntVerseTokens = ntVerseStmt ? ntVerseStmt.all(row.canon_id, row.chapter, row.verse) : [];
        const ntVerseUsed = new Set();
        const findStemToken = (stemPaleo) => {
            for (const t of ntVerseTokens) {
                if (ntVerseUsed.has(t.token_ordinal)) continue;
                if (!t.strongs) continue;
                if (t.word_raw === stemPaleo) { ntVerseUsed.add(t.token_ordinal); return t; }
            }
            return null;
        };
        for (let i = 0; i < hw.length; i++) {
            const w = hw[i];
            stats.nt_words++;
            const _ovr = ovr(row.canon_id, row.chapter, row.verse, i + 1, w);
            // SETTLED: take the etched reading (its record and its evidence) and move on
            if (settled && !_ovr) {
                const fz = settled.occ.get(occKey(row.canon_id, row.chapter, row.verse, i + 1));
                if (fz && fz.w === w) {
                    const r0 = settled.surf.get(fz.s);
                    // a blank etched reading (no Strong's) is not a decision — it is worked out again
                    if (r0 && !r0.strongs) settledBlank++;
                    else if (r0) {
                        if (!surfaces.has(fz.s)) surfaces.set(fz.s, { ...r0, count: 0 });
                        surfaces.get(fz.s).count++;
                        occurrences.push({ source: corpus, word_raw: w, strongs: r0.strongs, pos: r0.pos, morph: r0.morph,
                                           book_id: row.canon_id, chapter: row.chapter, verse: row.verse, token_ordinal: i + 1,
                                           evidence: fz.e || '', settled: true });
                        settledHits++; stats.nt_hit++;
                        continue;
                    }
                }
                if (!fz && settled.verses.has(`${row.canon_id}|${row.chapter}|${row.verse}`)) {
                    // the verse is settled and this word had no reading: it stays without one
                    settledUntagged++;
                    continue;
                }
                if (fz && settled.surf.get(fz.s) && !settled.surf.get(fz.s).strongs) { /* blank: decide below */ }
                else if (fz) settledChanged++; else settledFresh++;   // text differs from what was etched / new text
            }
            // Forced LEXICON reading ({sn, pos, morph} in heb-forced-readings.json):
            // the whole written word IS a Strong's lemma the OT alignment never
            // attested (jasper 𐤉𐤔𐤐𐤄 H3471 — its 3 OT verses didn't align, so the
            // `adjacent` tier glued 𐤉𐤔 "there is" + 𐤐𐤄 "here" instead). The caller
            // (build-surface-index.js) only passes entries whose Strong's lemma
            // consonants equal the word exactly, so this cannot invent a reading.
            const emitLexicon = (sn, pos, morph, tag) => {
                const comp = composeWord([{ word_raw: w, pos: pos || 'subs', morph: morph || '',
                                            strongs: sn, token_ordinal: 1 }], parseToken);
                record(w, comp, 'lexicon', false);
                bump(tag); stats.nt_hit++;
                occurrences.push({
                    source: corpus, word_raw: w, strongs: comp.strongs, pos: comp.pos, morph: comp.morph,
                    book_id: row.canon_id, chapter: row.chapter, verse: row.verse, token_ordinal: i + 1,
                });
            };
            {
                const lf = forcedReadings.get(w);
                if (lf && !Array.isArray(lf) && lf.sn) { forcedReadingHits++; emitLexicon(lf.sn, lf.pos, lf.morph, 'nt_lexicon'); continue; }
            }
            let hit = resolve(w);
            // CONTEXT READING (see contextReadings above). Pick the reading resolveAll()
            // offers that contains a form attested with the target SN — the fewest forms
            // wins, so a whole-word homograph (𐤊𐤁𐤓 kvar vs Kebar) beats a split — unless
            // THIS verse's English supports the old reading and not the new one.
            let ctxSN = null;
            let autoCr = null;
            // HEB_TRACE="43:4:15,43:4:20" prints how each word of those verses was judged
            const _tr = TRACE.has(`${row.canon_id}:${row.chapter}:${row.verse}`)
                ? (...m) => console.log(`  [trace ${row.canon_id}:${row.chapter}:${row.verse} #${i + 1} ${w}]`, ...m) : null;
            if (_tr) _tr('hit', hit ? `${hit.tier}:${hit.forms.join('+')} head=${headSN(hit)}` : 'none',
                         contextReadings.has(w) ? '| hand context reading' : '', forcedReadings.has(w) ? '| forced' : '',
                         _ovr ? `| occurrence override ${_ovr}` : '');
            // THE GREEK FIRST (2026-10-30): when the verse's Greek confirms the reading, it stands; when it confirms
            // exactly one OTHER reading of this spelling and the English does not confirm the current one, switch
            // (same path as any automatic switch: aligned reading -> BHS token -> root; logged 'greek').
            let greekDone = false;
            if (greekOf && hit && !contextReadings.has(w) && !forcedReadings.has(w) && !_ovr) {
                const c0 = headSN(hit), G = grk(row.canon_id, row.chapter, row.verse);
                if (c0 && G) {
                    if (G.has(c0)) { greekDone = true; greekConfirmed++; }
                    else if (grkMayJudge(c0)) {
                        const N = grkNear(row.canon_id, row.chapter, row.verse, hw.length > 1 ? i / (hw.length - 1) : 0) || new Set();
                        const other = [...new Set(candidateSNs(w))].filter(s => N.has(s) && grkAltOk(c0, s));
                        const _vs = evVerseStems(row.canon_id, row.chapter, row.verse);
                        // the English confirming the chosen reading blocks the Greek — unless the SAME English word fits
                        // both readings ("hundred" is tower Hammeah H3968 and the centurion's hundred H3967: the Greek
                        // decides). Two DIFFERENT words naming each reading block it: "the kingdom of God … come" must not
                        // turn 𐤌𐤋𐤊𐤅𐤕 into "walk" (2026-10-30)
                        const _shared = other.length === 1 && [..._vs].some(st => evidence.prof(c0).has(st) && evidence.prof(other[0]).has(st));
                        const engOk = evidence && evidence.hits(c0, _vs)
                            && !(_shared && ![..._vs].some(st => evidence.prof(c0).has(st) && !evidence.prof(other[0]).has(st)));
                        if (other.length === 1 && !engOk) { autoCr = { sn: other[0], from: c0, auto: true, greek: true }; greekDone = true; }
                        if (_tr) _tr('greek', 'chosen', c0, 'not in the Greek; other readings it confirms:', other.join(' ') || '-', '| english confirms chosen:', !!engOk);
                    }
                }
            }
            if (evidence && hit && !contextReadings.has(w) && !forcedReadings.has(w)
                && !_ovr && !greekDone) {
                const c0 = headSN(hit);
                if (c0) {
                    const j = evidence.judge(c0, () => candidateSNs(w), evVerseStems(row.canon_id, row.chapter, row.verse),
                                             sn => spellAgree(w, sn), sn => exactSNs(w).has(sn));
                    if (j.switchTo) autoCr = { sn: j.switchTo, from: c0, auto: true };
                    if (_tr) { const vs = evVerseStems(row.canon_id, row.chapter, row.verse);
                        _tr('judge', JSON.stringify(j), '| candidates', candidateSNs(w).join(' '), '| exact', [...exactSNs(w)].join(' '),
                            '| english', [...vs].join(' '));
                        for (const sn of [c0, ...candidateSNs(w)]) _tr('  ', sn, '| prof', [...evidence.prof(sn)].join(','),
                            '| self', evidence.selfRate(sn).toFixed(2), '| base', evidence.base(sn).toFixed(3),
                            '| hit', evidence.hits(sn, vs), '| tagged', evidence.hitsTagged ? evidence.hitsTagged(sn, vs) : '-',
                            '| spelling', spellAgree(w, sn).toFixed(2)); }
                }
            }
            {
                // his correction, when none of this reading's own forms carries it: take it the way a
                // context reading is taken (aligned reading -> BHS token -> root), never vetoed
                const pinCr = _ovr && hit && !hit.forms.some(f => formHasSN(f, _ovr)) ? { sn: _ovr, from: headSN(hit), pin: true } : null;
                const cr = pinCr || contextReadings.get(w) || autoCr;
                if (cr && cr.sn && hit && !forcedReadings.has(w) && (pinCr || !_ovr)) {
                    // The ORIGINAL English is the witness for EVERY entry (2026-10-29): the
                    // rendered text holds the glosses of the reading under question, so it
                    // vouched for itself — Matt 13:24 "Dawamah (silence)" kept 𐤃𐤅𐤌𐤄 H1745
                    // in 26 "is like" verses. `"witness": "rendered"` opts an entry back out.
                    const vs = cr.witness === 'rendered'
                        ? verseStems(row.canon_id, row.chapter, row.verse)
                        : verseSrcStems(row.canon_id, row.chapter, row.verse);
                    const fromHit = (cr.from_words || []).some(x => vs.has(x));
                    const toHit = (cr.to_words || []).some(x => vs.has(x));
                    // Switch where the English supports the new reading. Where it
                    // supports NEITHER, switch only if the old reading is implausible
                    // across the whole corpus (from_agree <= 5%: porch for "but", the
                    // river Kebar for "already"); a reading that does fit elsewhere
                    // (𐤏𐤅𐤓 skin, 12% — "leather belt", Matt 3:4) stays.
                    const fromAgree = typeof cr.from_agree === 'number' ? cr.from_agree : 0;
                    if (!cr.auto && !cr.pin && ((fromHit && !toHit) || (!toHit && fromAgree > 0.05))) {
                        contextVetoed++;
                    } else {
                        const isTail = (r, k) => (r.tier === 'suffix' || r.tier === 'affixed') && k === r.forms.length - 1;
                        const isPre = (r, k) => r.tier === 'proclitic' && k < (r.proclitics || 0);
                        const pick = resolveAll(w)
                            .filter(r => r.forms.some((f, k) => !isTail(r, k) && !isPre(r, k) && formHasSN(f, cr.sn)))
                            .sort((x, y) => x.forms.length - y.forms.length)[0];
                        if (pick) {
                            if (contextLog.length < 200000) contextLog.push(`${row.canon_id}:${row.chapter}:${row.verse}\t${w}\t${cr.from || ''}->${cr.sn}\t${hit.tier}:${hit.forms.join('+')} -> ${pick.tier}:${pick.forms.join('+')}\t${cr.greek ? 'greek' : cr.auto ? 'auto' : 'hand'}`);
                            hit = pick; ctxSN = cr.sn; contextSwitches++; switchedKeys.set(occKey(row.canon_id, row.chapter, row.verse, i + 1), cr.greek ? 'greek' : cr.auto ? 'auto' : 'hand'); if (cr.auto) autoSwitches++; if (cr.greek) greekSwitches++;
                        } else {
                            // No aligned reading carries the target (the HEB edition's OT never
                            // aligned that word: 𐤔𐤃𐤉𐤌 "demons", Deut 32:17, 69 such entries on
                            // 2026-10-29). The BHS itself writes this exact spelling with that
                            // Strong's — take that token's morphology. Still OT evidence, never a
                            // guess: no BHS token of this spelling + Strong's = a miss, as before.
                            // The reading must spell THIS word's letters, no more: a BHS morph can
                            // carry a pronoun suffix the parser rebuilds (PRS_TAG is append-only —
                            // 𐤀𐤌𐤔𐤊 "I will draw" came back 𐤀𐤌𐤔𐤊𐤌). Retry without it, else a miss.
                            let bt = bhsTokenFor(w, cr.sn);
                            if (bt) {
                                // prefix chips must open the word and suffix chips close it; the root
                                // itself may carry restored letters (the no-eliding rule: 𐤌𐤅𐤃𐤉𐤏 -> 𐤉𐤃𐤏)
                                const spells = (m) => {
                                    const cs = composeWord([{ word_raw: w, pos: bt.pos || 'subs', morph: m || '',
                                        strongs: cr.sn, token_ordinal: 1 }], parseToken).components;
                                    const ri = cs.findIndex(c => c.css === 'root');
                                    if (ri < 0) return cs.map(c => c.paleo).join('') === w;
                                    const pre = cs.slice(0, ri).map(c => c.paleo).join('');
                                    const suf = cs.slice(ri + 1).map(c => c.paleo).join('');
                                    return w.startsWith(pre) && w.endsWith(suf) && [...pre + suf].length < [...w].length;
                                };
                                if (!spells(bt.morph)) {
                                    const m2 = (bt.morph || '').replace(/\bprs=[^|]*/, 'prs=absent');
                                    bt = spells(m2) ? { ...bt, morph: m2 } : null;
                                }
                            }
                            if (bt) {
                                if (contextLog.length < 200000) contextLog.push(`${row.canon_id}:${row.chapter}:${row.verse}\t${w}\t${cr.from || ''}->${cr.sn}\t${hit.tier}:${hit.forms.join('+')} -> bhs:${w}\t${cr.greek ? 'greek' : cr.auto ? 'auto' : 'hand'}`);
                                contextSwitches++; switchedKeys.set(occKey(row.canon_id, row.chapter, row.verse, i + 1), cr.greek ? 'greek' : cr.auto ? 'auto' : 'hand'); if (cr.auto) autoSwitches++; if (cr.greek) greekSwitches++; contextFromBhs++;
                                emitLexicon(cr.sn, bt.pos, bt.morph, 'nt_context_bhs');
                                continue;
                            }
                            // No BHS token either (later-Hebrew forms of a biblical root:
                            // 𐤑𐤓𐤉𐤊𐤉𐤌 tzrikhim "must" = root 𐤑𐤓𐤊 H6878 + 𐤉𐤌, 2026-10-29). Build it
                            // from the Strong's ROOT the way root strip does — prefixes, an
                            // attested tail, internal 𐤅/𐤉 — never a root the word does not spell.
                            if (rootStrip) {
                                let rs = rsCands(w, true).filter(x => x.sn === cr.sn).sort(rsCmp)[0] || null;
                                if (!rs && [...(rsRoots.get(w) || []), ...(rsMatIdx.get(rsMatres(w)) || [])].includes(cr.sn))
                                    rs = { pre: [], pf: '', stem: w, tail: [], sn: cr.sn, how: 'matres', stripped: 0 };
                                const comp = rs ? rsCompose(rs) : null;
                                if (comp) {
                                    if (contextLog.length < 200000) contextLog.push(`${row.canon_id}:${row.chapter}:${row.verse}\t${w}\t${cr.from || ''}->${cr.sn}\t${hit.tier}:${hit.forms.join('+')} -> root:${[...rs.pre, rs.pf].filter(Boolean).join('+')} ${rs.stem} ${rs.tail.join('+')}\t${cr.greek ? 'greek' : cr.auto ? 'auto' : 'hand'}`);
                                    contextSwitches++; switchedKeys.set(occKey(row.canon_id, row.chapter, row.verse, i + 1), cr.greek ? 'greek' : cr.auto ? 'auto' : 'hand'); if (cr.auto) autoSwitches++; if (cr.greek) greekSwitches++; contextFromRoot++;
                                    record(w, comp, 'nt_context_root', true);
                                    bump('nt_context_root'); stats.nt_hit++;
                                    occurrences.push({
                                        source: corpus, word_raw: w, strongs: comp.strongs, pos: comp.pos, morph: comp.morph,
                                        book_id: row.canon_id, chapter: row.chapter, verse: row.verse, token_ordinal: i + 1,
                                    });
                                    continue;
                                }
                            }
                            // a miss is listed too, so a switch that was decided but had no reading to
                            // take is visible in the report (it was silent past the first 30)
                            if (contextLog.length < 200000) contextLog.push(`${row.canon_id}:${row.chapter}:${row.verse}\t${w}\t${cr.from || ''}->${cr.sn}\t${hit.tier}:${hit.forms.join('+')} -> (no reading offered)\t${cr.greek ? 'greek' : cr.auto ? 'auto' : 'hand'} miss`);
                            if (_tr) _tr('MISS: no aligned reading, BHS token or root reading carries', cr.sn);
                            contextMisses.set(w, cr.sn);
                        }
                    }
                }
            }
            // LEXICON OVER A LOCATIVE-𐤄 SPLIT (2026-09-26 audit). A `suffix` reading whose
            // tail is a bare 𐤄 ("[Toward]") on a word that is ITSELF, letter for letter, a
            // non-name Strong's lemma is almost always a feminine noun split into a verb +
            // directional He: 𐤕𐤇𐤋𐤄 tehillah "beginning" read as 𐤕 + chalal + [Toward],
            // 𐤐𐤒𐤃𐤄 pekudah, 𐤕𐤔𐤅𐤁𐤄 teshuvah, 𐤍𐤇𐤌𐤄 nechamah … (50 words, 335 occurrences).
            // lemmaIndex (from build-surface-index.js) holds only unambiguous, non-name
            // lemmas, so this never invents a word the dictionary doesn't spell exactly.
            if (hit && !ctxSN && hit.tier === 'suffix' && hit.forms[hit.forms.length - 1] === '\u{10904}'
                && [...w].length >= 4 && lemmaIndex.has(w) && !forcedReadings.has(w)) {
                lexiconOverSplit++;
                emitLexicon(lemmaIndex.get(w), 'subs', '', 'nt_lexicon_pref');
                continue;
            }
            if (!hit) {
                let usedFallback = false;

                // 1. Prefix-stripped stem lookup — the fused-particle / glued-
                //    proclitic case (e.g. "AthaShalamawan").
                if (ntVerseStmt) {
                    const chars = [...w];
                    const candidates = [];
                    for (const p of FUSED_PARTICLES) {
                        const pl = [...p].length;
                        if (chars.length > pl + 1 && chars.slice(0, pl).join('') === p) {
                            candidates.push({ prefix: chars.slice(0, pl).join(''), stem: chars.slice(pl).join('') });
                        }
                    }
                    for (let k = 1; k <= 2 && k < chars.length - 1; k++) {
                        if (!chars.slice(0, k).every(c => PROCLITIC_SET.has(c))) break;
                        candidates.push({ prefix: chars.slice(0, k).join(''), stem: chars.slice(k).join('') });
                    }
                    for (const cand of candidates) {
                        if ([...cand.stem].length < 2) continue;
                        const ntRow = findStemToken(cand.stem);
                        if (!ntRow) continue;
                        try {
                            const parsed = parseToken(ntRow.word_raw, ntRow.pos, ntRow.morph, ntRow.strongs);
                            if (!parsed || !parsed.components || !parsed.components.length) continue;
                            const normSN = 'H' + String(ntRow.strongs).replace(/^H+/i, '');
                            // Give the prefix the same OT-attested reading every
                            // other Atha/Wa/Ha chip gets (e.g. 𐤀𐤕 -> "[entirety]"),
                            // falling back to a bare untranslated mark only if
                            // FORMS somehow doesn't have it either.
                            let prefixComponents;
                            const pb = bestOf(cand.prefix);
                            if (pb) prefixComponents = JSON.parse(surfaces.get(pb.key).components_json);
                            else prefixComponents = [{ paleo: cand.prefix, translit: '', translation: '', css: 'mod-pref', derived: true }];
                            const comp = peelGluedProclitics(buildFallbackComp(parsed, normSN, ntRow.pos, ntRow.morph, prefixComponents));
                            record(w, comp, 'nt_tokens_nt_fallback', false);
                            occurrences.push({
                                source: corpus, word_raw: w, strongs: normSN,
                                pos: comp.pos, morph: comp.morph,
                                book_id: row.canon_id, chapter: row.chapter, verse: row.verse,
                                token_ordinal: i + 1,
                            });
                            usedFallback = true;
                            ntTokensNtFallback++;
                            bump('nt_tokens_nt_fallback');
                            break;
                        } catch { /* try next prefix candidate */ }
                    }
                }

                // 2. Plain whole-word fallback: tokens_nt's own token at this
                //    exact position happens to equal `w` verbatim (no gluing).
                if (!usedFallback) {
                    const ntRow = ntTokenStmt && ntTokenStmt.get(row.canon_id, row.chapter, row.verse, i + 1);
                    if (ntRow && ntRow.word_raw === w && ntRow.strongs) {
                        try {
                            const parsed = parseToken(ntRow.word_raw, ntRow.pos, ntRow.morph, ntRow.strongs);
                            if (parsed && parsed.components && parsed.components.length) {
                                const normSN = 'H' + String(ntRow.strongs).replace(/^H+/i, '');
                                const comp = peelGluedProclitics({
                                    components: parsed.components,
                                    strongs: normSN, pos: ntRow.pos || '', morph: ntRow.morph || '',
                                    root_paleo: parsed.root_paleo, rendered_paleo: parsed.rendered_paleo,
                                    all_strongs: [normSN],
                                });
                                record(w, comp, 'nt_tokens_nt_fallback', false);
                                occurrences.push({
                                    source: corpus, word_raw: w, strongs: normSN,
                                    pos: comp.pos, morph: comp.morph,
                                    book_id: row.canon_id, chapter: row.chapter, verse: row.verse,
                                    token_ordinal: i + 1,
                                });
                                usedFallback = true;
                                ntTokensNtFallback++;
                                bump('nt_tokens_nt_fallback');
                            }
                        } catch { /* parseToken failed on this reading — fall through to unresolved */ }
                    }
                }

                // 3. ROOT STRIP (see the block after SUF_3FS): peel prefixes, a verb
                //    preformative and an attested tail; the stem must be a Strong's root
                //    and the verse's English (or the spelling's) must name it.
                if (!usedFallback && rootStrip) {
                    const ref = `${row.canon_id}:${row.chapter}:${row.verse}`;
                    // One spelling, one reading: when the spelling's own occurrences agree on
                    // a Strong's, every occurrence takes it. Per-verse English alone was noisy
                    // for a word with many candidate roots (𐤄𐤇𐤉𐤉𐤋𐤉𐤌 "the soldiers" read
                    // army in one verse and "dream" in the next).
                    let pick = null, why = '';
                    if (rsSpellPick.has(w)) {
                        pick = rsCands(w).filter(x => x.sn === rsSpellPick.get(w)).sort(rsCmp)[0] || null;
                        why = 'spelling';
                    }
                    if (!pick) {
                        const ag = rsAgreeing(w, row.canon_id, row.chapter, row.verse);
                        if (ag.length) { pick = ag[0]; why = 'english'; }
                    }
                    const comp = pick ? rsCompose(pick) : null;
                    if (comp) {
                        const snCount = new Set(rsCands(w).map(x => x.sn)).size;
                        record(w, comp, 'nt_rootstrip', snCount > 1);
                        occurrences.push({
                            source: corpus, word_raw: w, strongs: comp.strongs, pos: comp.pos, morph: comp.morph,
                            book_id: row.canon_id, chapter: row.chapter, verse: row.verse, token_ordinal: i + 1,
                        });
                        usedFallback = true; rootStripHits++; bump('nt_rootstrip');
                        rootStripLog.push(`${ref}\t${w}\t${why}\t${[...pick.pre, pick.pf ? '[' + pick.pf + ']' : ''].filter(Boolean).join('+')} ${pick.stem} ${pick.tail.join('+')}\t${pick.sn}\t${pick.how}`);
                    } else {
                        const cs = rsCands(w);
                        if (cs.length) {
                            if (!rootStripReview.has(w)) rootStripReview.set(w, { n: 0, best: [...cs].sort(rsCmp)[0], refs: [] });
                            const r = rootStripReview.get(w); r.n++;
                            if (r.refs.length < 5) r.refs.push(ref);
                        }
                    }
                }

                if (!usedFallback) {
                    bump('nt_unresolved');
                    const uc = unresolvedComp(w);
                    record(w, uc, 'nt_unresolved', false);
                    occurrences.push({
                        // row.canon_id, not `canon` — that const is scoped to the OT
                        // loop's chapter grouping and does not exist here.
                        source: corpus, word_raw: w, strongs: '', pos: '', morph: '',
                        book_id: row.canon_id, chapter: row.chapter, verse: row.verse,
                        token_ordinal: i + 1,
                    });
                }
                continue;
            }
            stats.nt_hit++; bump('nt_' + hit.tier);

            // Occurrence override lookup (see occurrenceOverrides above) — captured
            // BEFORE the forEach below, which reuses `i` for its own per-form index
            // and would otherwise shadow this one.
            const forcedSN = _ovr || ctxSN;

            // Compose the row from the resolved OT form(s). For adjacency and
            // proclitic tiers the NT word is several OT forms glued together, so
            // its components are theirs concatenated — same shape, one row.
            const parts = [];
            let ambiguous = hit.ways > 1;
            // A reading that came from a SPLIT already knows how many leading
            // forms are prefixes — `proclitics`. Trust that instead of
            // re-deciding per form, because re-deciding got it catastrophically
            // wrong two ways:
            //
            //  1. `f.length === 1` is FALSE FOR EVERY PALEO LETTER. Paleo lives in
            //     the Supplementary Multilingual Plane, so 𐤌 is a surrogate PAIR
            //     and .length is 2. The proclitic branch therefore never fired at
            //     all, and every prefix fell through to bestOf() — which looks the
            //     letter up as if it were a standalone word.
            //  2. `!FORMS.has(f)` then sent any letter that IS attested alone down
            //     the same path. For 𐤌 the best standalone record is H4519 𐤌𐤍𐤔𐤄
            //     MANASSEH, so "from Ruth" rendered its 𐤌 as Manasseh — the bug in
            //     the Matthew 1:5 screenshot.
            //
            // A letter placed by a split is a prefix BY CONSTRUCTION. Position
            // decides it, not a lookup.
            // ONLY the proclitic tier. The `particle` tier's prefix is 𐤀𐤕, which is
            // a genuine word with its own Strong's (H853), and looking it up is
            // what makes AthaBaiz read "[entirety]" rather than an unglossed
            // marker. Single LETTERS are the ones that must never be looked up.
            const nPre = hit.tier === 'proclitic' ? (hit.proclitics || 0) : 0;
            // A `suffix`- or `affixed`-tier hit's LAST form is the tail letters,
            // not a word — same "position decides it, not a lookup" rule as
            // nPre above, just at the other end. Looking a bare tail up via
            // bestOf() would ask FORMS whether e.g. 𐤊 alone is an attested
            // standalone word, which is the wrong question and the proclitic
            // bug (Matthew 1:5, above) all over again at the suffix end. For
            // `affixed`, everything BEFORE the tail (one or more prefix forms,
            // then the stem) is already handled correctly by the existing
            // branches below with no change: a particle/multi-letter prefix or
            // the stem itself falls through to bestOf() (real attested words),
            // and a bare single-letter proclitic is caught by the defensive
            // check right after this, regardless of its position in the array.
            const isSuffixTail = (i) =>
                (hit.tier === 'suffix' || hit.tier === 'affixed') && i === hit.forms.length - 1;
            hit.forms.forEach((f, i) => {
                if (isSuffixTail(i)) { parts.push({ kind: 'suffix', letter: f }); return; }
                if (i < nPre) { parts.push({ kind: 'proclitic', letter: f }); return; }
                // Defensive: a lone proclitic letter outside a split still should
                // not be looked up as a word.
                if (PROCLITIC_SET.has(f) && [...f].length === 1 && !FORMS.has(f)) {
                    parts.push({ kind: 'proclitic', letter: f });
                    return;
                }
                // forcedSN only ever changes the outcome for whichever form's
                // OWN attested readings happen to include it (see bestOf above);
                // passing it to every call in this loop is safe — it's a no-op
                // for every other form in the same word.
                const b = bestOf(f, forcedSN);
                if (!b) { parts.push({ kind: 'proclitic', letter: f }); return; }
                if (b.ambiguous) ambiguous = true;
                parts.push({ kind: 'form', rec: surfaces.get(b.key) });
            });

            const components = [];
            const spans = [];          // which components each glued form produced
            const all = [];
            let strongs = '', pos = '', morph = '', root = '', headSpan = -1;
            for (const p of parts) {
                const start = components.length;
                let partPos = '';
                if (p.kind === 'proclitic') {
                    const att = PROC_COMPS.get(p.letter);
                    if (att) {
                        // Attested BHS reading of this letter — same components the
                        // OT renders, so 𐤅 reads [And] in both testaments.
                        for (const c of att.components) components.push({ ...c });
                        if (att.strongs) all.push(att.strongs);
                        partPos = att.pos || 'prep';
                    } else {
                        // Was 'mod-pref' (no stylesheet rule — the class the
                        // stylesheet actually defines for this case is
                        // 'mod-pref-unk', see morphColors.css/Parallel.css).
                        // Fixed alongside adding the suffix-side equivalent below.
                        components.push({ paleo: p.letter, translit: '', translation: '',
                                          css: 'mod-pref-unk', derived: true });
                        partPos = 'prep';
                    }
                } else if (p.kind === 'suffix') {
                    // Mirror of the proclitic branch above, at the tail end: an
                    // attested BHS reading of this exact suffix shape if one was
                    // found (SUF_COMPS, built above), never a fabricated gloss.
                    let att = SUF_COMPS.get(p.letter);
                    // A bare 𐤄 tail is either directional "[Toward]" (𐤀𐤓𐤑𐤄 "to the land")
                    // or the 3fs possessive "[Hers · feminine]" (𐤁𐤏𐤕𐤄 "in ITS time").
                    // SUF_COMPS holds one reading per spelling, and the BHS evidence is
                    // almost all directional (the ETCBC keeps 3fs suffixes out of word_raw),
                    // so every NT split read [Toward]. Decide per occurrence from the
                    // verse's English: its/her -> possessive; after a 𐤁/𐤊/𐤌 preposition
                    // (which a directional ending almost never follows) -> possessive
                    // unless the English is directional. Otherwise directional stays.
                    if (att && p.letter === '\u{10904}' && SUF_3FS && att.component.css === 'uvf-dir') {
                        const eng = verseEnglish(row.canon_id, row.chapter, row.verse);
                        const poss = /\b(its|her|hers)\b/i.test(eng);
                        const dir = /\b(toward|towards|into|unto|homeward|upward|downward|westward|eastward|northward|southward)\b/i.test(eng);
                        const prep = hit.forms.length > 2 && ['\u{10901}', '\u{1090A}', '\u{1090C}'].includes(hit.forms[0]);
                        if ((poss && !dir) || (prep && (poss || !dir))) { att = SUF_3FS; suffix3fs++; }
                    }
                    if (att) {
                        components.push({ ...att.component });
                        partPos = att.pos || '';
                    } else {
                        // 'mod-suff-unk' — the stylesheet already has this class
                        // (morphColors.css / Parallel.css), for exactly this "no
                        // attested reading" case; the proclitic branch above emits
                        // the equivalent 'mod-pref' without its own '-unk' suffix,
                        // an existing mismatch (no rule styles it) — not repeated
                        // here.
                        components.push({ paleo: p.letter, translit: '', translation: '',
                                          css: 'mod-suff-unk', derived: true });
                        partPos = '';
                    }
                } else {
                    const rec = p.rec;
                    if (!rec) continue;
                    for (const c of JSON.parse(rec.components_json)) components.push(c);
                    for (const sn of JSON.parse(rec.all_strongs_json)) all.push(sn);
                    partPos = rec.pos || '';
                    // The head is the LAST form carrying a real Strong's — the same
                    // rule composeWord uses, so both testaments pick a head the
                    // same way.
                    if (_isReal(rec.strongs)) {
                        strongs = rec.strongs; pos = rec.pos; morph = rec.morph; root = rec.root_paleo;
                        headSpan = spans.length;
                    }
                    else if (!strongs) { pos = rec.pos; morph = rec.morph; root = rec.root_paleo; }
                }
                spans.push({ start, end: components.length, pos: partPos });
            }
            if (!components.length) { stats.nt_hit--; bump('nt_unresolved'); continue; }
            // ONE ROOT PER BLOCK. Without this the adjacent/proclitic tiers glue
            // several standalone OT forms together and every one keeps the root
            // class it was parsed with — 𐤀𐤕𐤀𐤔𐤓𐤄𐤉𐤄 rendering three head words.
            demoteNonHead(components, spans, headSpan);

            const comp = {
                components, strongs, pos, morph,
                root_paleo: root || components[0].paleo,
                rendered_paleo: components.map(c => c.paleo).join(''),
                all_strongs: [...new Set(all)],
            };
            record(w, comp, hit.tier, ambiguous);
            occurrences.push({
                source: corpus, word_raw: w, strongs: comp.strongs,
                pos: comp.pos, morph: comp.morph,
                book_id: row.canon_id, chapter: row.chapter, verse: row.verse,
                token_ordinal: i + 1,
            });
        }
    }
    pNT.done();

    // ONE SPELLING, ONE READING (fieldy, 2026-10-30: "im getting frustrated that I must be the one who
    // points out every issue in the tokens"). A word left with no Strong's takes the reading the SAME
    // written word has everywhere else in his corpus — the HEB edition's own readings of it this build
    // plus every BHS token of that spelling — when that reading is the only one, or carries >= 90% of
    // >= 20 occurrences (𐤋𐤅 "to him": H9005 1,123 vs lu 32). Nothing new is made up: the record is
    // the HEB edition's own record of that word+Strong's, else built from the BHS token (its letters
    // must be this word's). Hand corrections (occurrence overrides) are never touched.
    const spellingFill = { occ: 0, spellings: new Set(), multi: [] };
    {
        const tally = new Map();          // word -> Map(sn -> {n, key})
        const bump2 = (w, sn, n) => {
            if (!sn) return;
            if (!tally.has(w)) tally.set(w, new Map());
            const m = tally.get(w), cur = m.get(sn) || { n: 0 };
            cur.n += n; m.set(sn, cur);
        };
        const heKey = new Map();          // word|sn -> Map(surfKey -> n)
        for (const o of occurrences) {
            if (o.source !== corpus || !o.strongs) continue;
            const k = surfKey(o.word_raw, o.strongs, o.pos, o.morph);
            bump2(o.word_raw, o.strongs, 1);
            const hk = o.word_raw + '|' + o.strongs;
            if (!heKey.has(hk)) heKey.set(hk, new Map());
            heKey.get(hk).set(k, (heKey.get(hk).get(k) || 0) + 1);
        }
        const blanks = occurrences.filter(o => o.source === corpus && o.book_id >= ntMin && !o.strongs
            && !ovr(o.book_id, o.chapter, o.verse, o.token_ordinal, o.word_raw));
        const seen = new Set(blanks.map(o => o.word_raw));
        for (const w of seen) { const m = bhsSpellIndex().get(w); if (m) for (const [sn, t] of m) bump2(w, sn, t.n); }
        const pickFor = new Map();
        for (const w of seen) {
            const m = tally.get(w); if (!m || !m.size) continue;
            const arr = [...m].sort((a, b) => b[1].n - a[1].n), tot = arr.reduce((x, y) => x + y[1].n, 0);
            const [sn, t] = arr[0];
            if (!(arr.length === 1 || (tot >= 20 && t.n / tot >= 0.9))) { spellingFill.multi.push(`${w}\t${arr.slice(0, 4).map(([s, x]) => s + ' ' + x.n).join(', ')}`); continue; }
            // the record: the HEB edition's own record of this word + Strong's, else the BHS token's
            let key = null;
            const hm = heKey.get(w + '|' + sn);
            if (hm) key = [...hm].sort((a, b) => b[1] - a[1])[0][0];
            if (!key) {
                let bt = bhsTokenFor(w, sn);
                if (bt) {
                    const build = (m) => composeWord([{ word_raw: w, pos: bt.pos || 'subs', morph: m || '', strongs: sn, token_ordinal: 1 }], parseToken);
                    const spells = (comp) => {
                        const cs = comp.components, ri = cs.findIndex(c => c.css === 'root');
                        if (ri < 0) return cs.map(c => c.paleo).join('') === w;
                        const pre = cs.slice(0, ri).map(c => c.paleo).join(''), suf = cs.slice(ri + 1).map(c => c.paleo).join('');
                        return w.startsWith(pre) && w.endsWith(suf) && [...pre + suf].length < [...w].length;
                    };
                    let comp = build(bt.morph);
                    if (!spells(comp)) { comp = build((bt.morph || '').replace(/\bprs=[^|]*/, 'prs=absent')); if (!spells(comp)) comp = null; }
                    if (comp) key = record(w, comp, 'nt_spelling', false).key, surfaces.get(key).count--;
                }
            }
            if (key) pickFor.set(w, key);
        }
        for (const o of blanks) {
            const key = pickFor.get(o.word_raw); if (!key) continue;
            const rec = surfaces.get(key); if (!rec) continue;
            const uk = surfKey(o.word_raw, o.strongs, o.pos, o.morph), ur = surfaces.get(uk);
            if (ur) { ur.count--; if (ur.count <= 0) surfaces.delete(uk); }
            rec.count++;
            o.strongs = rec.strongs; o.pos = rec.pos; o.morph = rec.morph;
            if (o.settled) { o.settled = false; o.evidence = ''; }
            spellingFill.occ++; spellingFill.spellings.add(o.word_raw); bump('nt_spelling');
        }
        log(`  one spelling, one reading: ${spellingFill.occ.toLocaleString()} blank occurrence(s) of ${spellingFill.spellings.size.toLocaleString()} spellings took the reading their spelling has elsewhere; ${spellingFill.multi.length.toLocaleString()} spellings left blank (several readings, none >= 90%)`);
    }
    stats.spellingFill = { occ: spellingFill.occ, spellings: spellingFill.spellings.size, multi: spellingFill.multi };

    // Surface the competing readings so a wrong pick is a REPORT LINE, not
    // something to find by reading a verse in the app.
    stats.ambiguousReadings = ambiguousReadings;
    stats.preferredSplits = preferredSplits;
    stats.forcedReadingHits = forcedReadingHits;
    stats.lexiconOverSplit = lexiconOverSplit;
    stats.forcedReadingMisses = [...forcedReadingMisses].map(([w, alts]) => `${w} (offered: ${alts})`);
    stats.ntTokensNtFallback = ntTokensNtFallback;
    stats.peeledFallback = peeledFallback;
    log(`  fallback readings: ${peeledFallback.toLocaleString()} root chips had glued proclitics peeled into their own chips (𐤅𐤄𐤕𐤒𐤉𐤐 -> [And] [The] 𐤕𐤒𐤉𐤐)`);
    stats.contextSwitches = contextSwitches;
    stats.contextVetoed = contextVetoed;
    stats.contextFromBhs = contextFromBhs;
    stats.contextFromRoot = contextFromRoot;
    stats.autoSwitches = autoSwitches;
    stats.greekSwitches = greekSwitches; stats.greekConfirmed = greekConfirmed;
    stats.settled = settled ? { hits: settledHits, untagged: settledUntagged, changed: settledChanged, fresh: settledFresh, blank: settledBlank } : null;
    // EVIDENCE of every NT/Apocrypha occurrence (surface_occurrences.evidence; the badges mark the
    // last two): hand = his context entry / occurrence pin; english = the verse's original English
    // names it (auto switches included); function = everyday vocabulary the English cannot judge;
    // name; no-english; guess = other readings of the spelling exist and the English names none;
    // unconfirmed = the only reading and the English does not name it.
    if (evidence) {
        const ec = {};
        let G = null;
        const vLen = new Map();   // words per verse, for a word's relative position
        for (const o of occurrences) { const k = `${o.book_id}|${o.chapter}|${o.verse}`; if ((vLen.get(k) || 0) < o.token_ordinal) vLen.set(k, o.token_ordinal); }
        for (const o of occurrences) {
            if (o.source !== corpus || !(o.book_id >= ntMin)) continue;
            if (o.settled) { ec[o.evidence || 'untagged'] = (ec[o.evidence || 'untagged'] || 0) + 1; continue; }
            const k = occKey(o.book_id, o.chapter, o.verse, o.token_ordinal);
            let e = '';
            if (!o.strongs) e = '';
            else if (switchedKeys.get(k) === 'hand' || ovr(o.book_id, o.chapter, o.verse, o.token_ordinal, o.word_raw)) e = 'hand';
            else if ((G = grk(o.book_id, o.chapter, o.verse)) && G.has(_normH(o.strongs))) e = 'greek';   // the verse's Greek confirms it
            else {
                const j = evidence.judge(o.strongs, () => candidateSNs(o.word_raw), evVerseStems(o.book_id, o.chapter, o.verse));
                // CONTRADICTED only when the GREEK backs another reading of this spelling and nothing confirms this one;
                // an English-only "other reading" is a weak signal (chance words) and stays 'guess' (2026-10-30)
                const N = G && grkMayJudge(_normH(o.strongs)) ? grkNear(o.book_id, o.chapter, o.verse, (vLen.get(`${o.book_id}|${o.chapter}|${o.verse}`) || 1) > 1 ? (o.token_ordinal - 1) / (vLen.get(`${o.book_id}|${o.chapter}|${o.verse}`) - 1) : 0) : null;
                const gAlt = N ? [...new Set(candidateSNs(o.word_raw))].filter(s => N.has(s) && grkAltOk(_normH(o.strongs), s)) : [];
                if (gAlt.length && j.evidence !== 'english') { e = 'contradicted'; o.evidenceAlt = gAlt.join(' '); }
                else e = j.switchTo ? 'guess' : j.evidence;
            }
            o.evidence = e;
            ec[e || 'untagged'] = (ec[e || 'untagged'] || 0) + 1;
        }
        stats.evidence = ec;
    }
    stats.contextMisses = [...contextMisses].map(([w, sn]) => `${w}->${sn}`);
    stats.contextLog = contextLog;
    stats.suffix3fs = suffix3fs;
    stats.maqafSplitVerses = maqafSplitVerses;
    stats.rootStripHits = rootStripHits;
    stats.rootStripSpellings = rsSpellPick.size;
    stats.rootStripLog = rootStripLog;
    stats.rootStripReview = [...rootStripReview].sort((a, b) => b[1].n - a[1].n)
        .map(([w, r]) => `${r.n}\t${w}\t${[...r.best.pre, r.best.pf ? '[' + r.best.pf + ']' : ''].filter(Boolean).join('+')} ${r.best.stem} ${r.best.tail.join('+')}\t${r.best.sn}\t${r.best.how}\t${r.refs.join(' ')}`);
    return { surfaces, occurrences, audit, stats , switchedKeys };
}

module.exports = {
    buildHebSurfaces,
    // exported for tests
    toPaleo, splitWords, matresEquivalent, morphAttrs, reconstructableTails,
    matchAt, alignVerse, composeWord, demoteNonHead, surfKey, PROCLITIC_SET,
};