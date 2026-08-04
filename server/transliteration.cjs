// transliteration.cjs
//
// Greek and Ge'ez transliteration utilities. The same code is consumed by:
//   - scripts/tokenize-multilang.cjs (to populate the word_translit column
//     in surface_counts at tokenize time, so lookups are free at request time)
//   - server/server.js (for ad-hoc verse-text transliteration)
//
// Greek follows the standard academic / ALA-LC romanization conventions:
//   α=a β=b γ=g δ=d ε=e ζ=z η=ē θ=th ι=i κ=k λ=l μ=m ν=n ξ=x ο=o
//   π=p ρ=r σ/ς=s τ=t υ=y φ=ph χ=ch ψ=ps ω=ō
//   Diphthongs: αι=ai, ει=ei, οι=oi, υι=yi, αυ=au, ευ=eu, ηυ=ēu, ου=ou
//   Rough breathing on initial vowel = prefix 'h'
//   Iota subscript marked with underscore (.ι below the long vowel)
//   γ before γ/κ/χ/ξ is rendered 'n' (gamma nasal) per academic convention
//
// Ge'ez transliteration uses the Encyclopaedia Aethiopica system:
//   each syllable in the Ethiopic block U+1200–U+135F is at position
//   (consonant_idx * 8) + vowel_idx within an 8-cell column for that
//   consonant. We map consonant_idx → consonant letter, vowel_idx → vowel.
//
// Both functions are pure, deterministic, and side-effect-free.
'use strict';

// ── GREEK ──────────────────────────────────────────────────────────────────

// Base lowercase Greek (and final sigma) → Latin. Capital letters and the
// Greek Extended block (U+1F00–U+1FFE) decompose to base+combining marks
// under NFD, which is how we strip accents while preserving the underlying
// letter.
const GREEK_BASE = {
    α: 'a', β: 'b', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'ē', θ: 'th',
    ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o',
    π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'ph',
    χ: 'ch', ψ: 'ps', ω: 'ō',
};

const GREEK_DIPHTHONGS = {
    αι: 'ai', ει: 'ei', οι: 'oi', υι: 'ui',
    αυ: 'au', ευ: 'eu', ηυ: 'ēu', ου: 'ou',
};

const VOWELS = new Set(['α','ε','η','ι','ο','υ','ω']);
const NASAL_BEFORE = new Set(['γ','κ','χ','ξ']);

/**
 * Transliterate a single Greek word. Returns the Latin form with macrons on
 * η/ω (ē, ō) and 'h' for rough-breathing initial vowels. Diacritic marks
 * other than the breathing diacritic on the first vowel are dropped — the
 * goal is a readable pronunciation guide, not lossless round-tripping.
 */
function transliterateGreekWord(word) {
    if (!word) return '';
    // NFD lets us inspect combining marks (especially U+0314 rough breathing
    // on the first vowel) before we strip them.
    const nfd  = word.normalize('NFD');
    const orig = [...nfd];

    // Detect rough breathing on the first vowel: U+0314 (combining rough
    // breathing) attached to a vowel anywhere in the first syllable. Greek
    // breathing diacritics always sit on the first vowel of a word.
    let roughBreathing = false;
    for (let i = 0; i < orig.length; i++) {
        if (orig[i] === '\u0314') { roughBreathing = true; break; }
        // Stop scanning once we leave the initial diacritic cluster
        if (i > 4) break;
    }

    // Strip combining marks (accents, breathings, iota subscripts, etc) so
    // we work on a pure-letter stream.
    const letters = orig.filter(c => c.codePointAt(0) < 0x0300 || c.codePointAt(0) > 0x036F);
    const lower   = letters.join('').toLowerCase();

    const out = [];
    let i = 0;
    let firstAlpha = true;
    while (i < lower.length) {
        const ch    = lower[i];
        const next  = lower[i + 1];

        // Diphthong check (only on a vowel followed by another vowel)
        const pair = ch + (next || '');
        if (GREEK_DIPHTHONGS[pair]) {
            let rendered = GREEK_DIPHTHONGS[pair];
            if (firstAlpha && roughBreathing) {
                rendered = 'h' + rendered;
                roughBreathing = false;
            }
            out.push(rendered);
            i += 2;
            firstAlpha = false;
            continue;
        }

        // γ nasal: gamma directly before γ/κ/χ/ξ → 'n'
        if (ch === 'γ' && NASAL_BEFORE.has(next)) {
            out.push('n');
            i++;
            firstAlpha = false;
            continue;
        }

        // ρ initial / after another ρ usually carries rough breathing; we
        // don't render that as 'h' by default (the convention varies). Just
        // map ρ→r.
        const mapped = GREEK_BASE[ch];
        if (mapped) {
            let rendered = mapped;
            // First-letter rough breathing on a vowel adds h-prefix
            if (firstAlpha && VOWELS.has(ch) && roughBreathing) {
                rendered = 'h' + rendered;
                roughBreathing = false;
            }
            out.push(rendered);
            firstAlpha = false;
        } else if (/[a-zA-Z]/.test(ch)) {
            // Latin letter from a partially-romanized source — pass through
            out.push(ch);
            firstAlpha = false;
        }
        // Unknown character: silently drop
        i++;
    }
    return out.join('');
}

// ── GE'EZ (Ethiopic) ───────────────────────────────────────────────────────

// Vowel orders for each Ethiopic syllable. Position N within a consonant's
// 8-cell row corresponds to a fixed vowel; the 7th cell (index 6) is the
// 'sadəs' / 6th order which is typically the consonant with no vowel (or a
// silent əə depending on phonetic context — we render it as bare 'ə').
const GEEZ_VOWELS = ['ä', 'u', 'i', 'a', 'e', 'ə', 'o'];

// Consonant letters at the start of each row (vowel order 0 = ä). The
// Ethiopic block has these at code points 0x1200, 0x1208, 0x1210, ...
// (every 8). A few rows have gaps or labialized variants we map separately.
const GEEZ_CONSONANTS = {
    0x1200: 'h',   // ሀ (he/hä)
    0x1208: 'l',   // ለ (lawe)
    0x1210: 'ḥ',   // ሐ (ḥawt — pharyngeal h)
    0x1218: 'm',   // መ (mai)
    0x1220: 'ś',   // ሠ (śawt)
    0x1228: 'r',   // ረ (rəʾəs)
    0x1230: 's',   // ሰ (sat)
    0x1238: 'š',   // ሸ (extension — sha)
    0x1240: 'q',   // ቀ (qaf)
    0x1248: 'ḳ',   // ቐ (qha — extension)
    0x1250: 'q',   // ቐ region cont., labialized; we approximate
    0x1258: 'q̌',
    0x1260: 'b',   // በ (bet)
    0x1268: 'v',   // ቨ
    0x1270: 't',   // ተ (tawe)
    0x1278: 'č',   // ቸ (extension che)
    0x1280: 'ḫ',   // ኀ (ḫarm)
    0x1288: 'n',   // ነ (nähas)
    0x1290: 'ñ',   // ኘ (extension nya)
    0x1298: 'ʾ',   // ኘ region cont.
    0x12A0: 'ʾ',   // አ (ʾalf)
    0x12A8: 'k',   // ከ (kaf)
    0x12B0: 'ḵ',   // ኸ (extension)
    0x12B8: 'k̬',
    0x12C0: 'ḵ̬',
    0x12C8: 'w',   // ወ (wawe)
    0x12D0: 'ʿ',   // ዐ (ʿain)
    0x12D8: 'z',   // ዘ (zai)
    0x12E0: 'ž',   // ዠ (zhe)
    0x12E8: 'y',   // የ (yaman)
    0x12F0: 'd',   // ደ (dant)
    0x12F8: 'ḍ',   // ዸ (extension)
    0x1300: 'j',   // ጀ (gemə)
    0x1308: 'g',   // ገ (gaml)
    0x1310: 'ǧ',
    0x1318: 'g̬',
    0x1320: 'ṭ',   // ጠ (ṭait)
    0x1328: 'č̣',  // ጨ
    0x1330: 'p̣',   // ጰ (peit)
    0x1338: 'ṣ',   // ጸ (ṣaday)
    0x1340: 'ṣ́',  // ፀ (ṣ́appä)
    0x1348: 'f',   // ፈ (af)
    0x1350: 'p',   // ፐ (psa)
};

// Build a fast lookup table for the entire Ethiopic block. For each
// syllable codepoint, precompute its (consonant, vowel) transliteration.
const GEEZ_SYLLABLE_LOOKUP = new Map();
for (const [base, consonant] of Object.entries(GEEZ_CONSONANTS)) {
    const baseCode = parseInt(base, 10);
    for (let i = 0; i < 8; i++) {
        const code = baseCode + i;
        // i=7 is reserved/labialized 'wa' in many consonant rows
        if (i === 7) {
            GEEZ_SYLLABLE_LOOKUP.set(code, consonant + 'wa');
        } else {
            GEEZ_SYLLABLE_LOOKUP.set(code, consonant + GEEZ_VOWELS[i]);
        }
    }
}

/**
 * Transliterate a Ge'ez word. Each Ethiopic syllable maps to (consonant +
 * vowel); the 6th order ('ə') is rendered as a bare schwa. Non-Ethiopic
 * characters (digits, punctuation already stripped by the tokenizer, stray
 * Latin) pass through.
 *
 * Word-final schwa is silent in standard Ge'ez and Amharic reading
 * tradition, so we trim a trailing 'ə' after rendering.
 */
function transliterateGeezWord(word) {
    if (!word) return '';
    const out = [];
    for (const ch of word) {
        const code = ch.codePointAt(0);
        const mapped = GEEZ_SYLLABLE_LOOKUP.get(code);
        if (mapped) { out.push(mapped); continue; }
        if (code >= 0x1200 && code <= 0x137F) { out.push('?'); continue; }
        out.push(ch);
    }
    let result = out.join('');
    // Drop trailing silent schwa (e.g. "mədərə" → "mədər", "sämayə" → "sämay")
    if (result.endsWith('ə')) result = result.slice(0, -1);
    return result;
}

// ── Public API ─────────────────────────────────────────────────────────────

function transliterateWord(word, script) {
    if (!word) return '';
    if (script === 'greek')    return transliterateGreekWord(word);
    if (script === 'ethiopic') return transliterateGeezWord(word);
    return word;
}

/**
 * Heuristic root extraction. This is intentionally rough — full Greek
 * stemming requires a morphological analyzer, and Ge'ez consonantal-root
 * recovery is similarly complex. We provide a simple lexical-form (accent-
 * stripped, case-folded) for Greek and a consonant-skeleton for Ge'ez.
 *
 * For Greek: returns the NFD-stripped, lowercased base letters with no
 * combining marks. Words sharing the same lexical form group together — a
 * loose proxy for "same lemma family" but not authoritative.
 *
 * For Ge'ez: returns the consonant skeleton (vowels dropped). This is a
 * decent proxy for the Semitic triconsonantal root, though not perfect — it
 * also reflects derivational morphology not just the root.
 */
function heuristicRoot(word, script) {
    if (!word) return '';
    if (script === 'greek') {
        // Strip all diacritics, lowercase, drop final sigma normalization.
        return word.normalize('NFD')
            .replace(/[\u0300-\u036F]/g, '')   // combining marks
            .toLowerCase()
            .replace(/ς/g, 'σ');                // unify final sigma
    }
    if (script === 'ethiopic') {
        // Extract consonant letters by stripping the vowel-suffix from each
        // syllable's transliteration. A Ge'ez syllable's transliteration is
        // "C" + ("ä"|"u"|"i"|"a"|"e"|"ə"|"o"|"wa"); we drop the vowel suffix.
        const trans = transliterateGeezWord(word);
        return trans.replace(/(?<=[a-zžčǧṭṣṣ́ṗḍḫḥʾʿñ])(?:wa|[äaeiou ə])/gi, '')
                    .replace(/\s+/g, '');
    }
    return word;
}

module.exports = {
    transliterateWord,
    transliterateGreekWord,
    transliterateGeezWord,
    heuristicRoot,
};
