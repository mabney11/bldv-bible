
const fs = require('fs'), path = require('path');
const LEX_DIR = path.join(__dirname, 'lexicon');
const strongsRootsLex = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server', 'lexicon', 'strongs-roots.json'), 'utf8'));
const lexicon = {}, homographs = {};
function loadStrongsRoots() { return strongsRootsLex; }
// parseToken calls resolveGloss() below; lexicon/homographs are deliberately
// empty stubs here (this harness tests morphology/structure, not curated
// gloss content) — mirrors build-surface-index.js's wiring with empty tables.
const { createGlossResolver } = require(path.join(__dirname, '..', 'server', 'gloss-resolver.cjs'));
const resolveGloss = createGlossResolver({ homographs, lexicon });

const CHAR_MAP = {
    '𐤀': { med: 'a',   fin: 'a'   }, '𐤁': { med: 'ba',  fin: 'b'  },
    '𐤂': { med: 'ga',  fin: 'g'   }, '𐤃': { med: 'da',  fin: 'd'  },
    '𐤄': { med: 'ha',  fin: 'h'   }, '𐤅': { med: 'wa',  fin: 'w'  },
    '𐤆': { med: 'za',  fin: 'z'   }, '𐤇': { med: 'cha', fin: 'ch' },
    '𐤈': { med: 'ta',  fin: 't'   }, '𐤉': { med: 'ya',  fin: 'y'  },
    '𐤊': { med: 'ka',  fin: 'k'   }, '𐤋': { med: 'la',  fin: 'l'  },
    '𐤌': { med: 'ma',  fin: 'm'   }, '𐤍': { med: 'na',  fin: 'n'  },
    '𐤎': { med: 'sa',  fin: 's'   }, '𐤏': { med: 'i',   fin: 'i'  },
    '𐤐': { med: 'pa',  fin: 'p'   }, '𐤑': { med: 'tza', fin: 'tz' },
    '𐤒': { med: 'qa',  fin: 'q'   }, '𐤓': { med: 'ra',  fin: 'r'  },
    '𐤔': { med: 'sha', fin: 'sh'  }, '𐤕': { med: 'tha', fin: 'th' },
};

const GRAMMAR_MAP = {
    prep: { '𐤁': 'in', '𐤋': 'to', '𐤌': 'from', '𐤊': 'as', '𐤀𐤕': 'entirety/whole',
            '𐤏𐤋': 'upon', '𐤀𐤋': 'toward', '𐤋𐤊': 'you', '𐤏𐤌': 'with', '𐤌𐤍': 'from' },
    conj: { '𐤅': 'And' },
    art:  { '𐤄': 'The' },
    // INTERROGATIVE HE — a homograph of the article: same letter 𐤄, different
    // part of speech. It is a PREFIX on the following word (𐤄+𐤋𐤅𐤀 = "is it not?"),
    // never a suffix, and it must NOT inherit the article's "The" gloss.
    inrg: { '𐤄': '[?]' },
    pfm: {
        'J':  { paleo: ['𐤅𐤉','𐤅','𐤉'], trans: 'He/It',    css: 'pfm-3ms' },
        'T':  { paleo: ['𐤕'],            trans: 'She/You',  css: 'pfm-2or3f' },
        'T=': { paleo: ['𐤕'],            trans: 'She',      css: 'pfm-2or3f' },
        '>':  { paleo: ['𐤀'],            trans: 'I',        css: 'pfm-1cs' },
        '<':  { paleo: ['𐤀'],            trans: 'I',        css: 'pfm-1cs' },
        'N':  { paleo: ['𐤍'],            trans: 'We',       css: 'pfm-1cp' },
        'M':  { paleo: ['𐤌'],            trans: 'Active',   css: 'pfm-ptcp' },
    },
    vbs: {
        'H':   { paleo: ['𐤄'],       trans: 'Causing',   css: 'vbs-hif' },
        'N':   { paleo: ['𐤍'],       trans: 'Passive',   css: 'vbs-nif' },
        'HCT': { paleo: ['𐤄𐤕','𐤕'], trans: 'Reflexive', css: 'vbs-hit' },
        'HT':  { paleo: ['𐤄𐤕','𐤕'], trans: 'Reflexive', css: 'vbs-hit' },
    },
    prs: {
        'J':  { paleo: ['𐤉'],       trans: 'My',            css: 'prs-1cs' },
        'NJ': { paleo: ['𐤍𐤉'],      trans: 'Me',            css: 'prs-1cs' },
        'NW': { paleo: ['𐤍𐤅'],      trans: 'Our',           css: 'prs-1cp' },
        'K':  { paleo: ['𐤊'],       trans: 'Your',          css: 'prs-2ms' },
        'KM': { paleo: ['𐤊𐤌'],      trans: 'Your (plural)', css: 'prs-2mp' },
        'KN': { paleo: ['𐤊𐤍'],      trans: 'Your (her pl)', css: 'prs-2fp' },
        'W':  { paleo: ['𐤄𐤅','𐤅'], trans: 'His',           css: 'prs-3ms' },
        'HW': { paleo: ['𐤄𐤅','𐤅'], trans: 'His',           css: 'prs-3ms' },
        'H':  { paleo: ['𐤄'],       trans: 'Her',           css: 'prs-3fs' },
        'M':  { paleo: ['𐤌'],       trans: 'Their',         css: 'prs-3mp' },
        'HM': { paleo: ['𐤄𐤌','𐤌'], trans: 'Their',         css: 'prs-3mp' },
        'N':  { paleo: ['𐤍'],       trans: 'Their (her)',   css: 'prs-3fp' },
        'HN': { paleo: ['𐤄𐤍','𐤍'], trans: 'Their (her)',   css: 'prs-3fp' },
    },
    nme: {
        'H':   { paleo: ['𐤄'],        trans: 'Feminine/Toward', css: 'nme-h'  },
        'T':   { paleo: ['𐤕'],        trans: 'Feminine',        css: 'nme-f'  },
        'J':   { paleo: ['𐤉'],        trans: 'Of/My',           css: 'nme-j'  },
        'J=':  { paleo: ['𐤉'],        trans: 'Of/My',           css: 'nme-j'  },
        'JM':  { paleo: ['𐤉𐤌','𐤌'],  trans: 'Plural (masc)',   css: 'nme-jm' },
        'JM=': { paleo: ['𐤉𐤌','𐤌'],  trans: 'Plural (masc)',   css: 'nme-jm' },
        'WT':  { paleo: ['𐤅𐤕','𐤕'],  trans: 'Plural (fem)',    css: 'nme-wt' },
        'WTJ': { paleo: ['𐤅𐤕𐤉','𐤕𐤉'], trans: 'Plural of',    css: 'nme-wtj'},
        'NH':  { paleo: ['𐤍𐤄'],      trans: 'They (fem)',      css: 'nme-nh' },
    },
    vbe: {
        'TJ': { paleo: ['𐤕𐤉'],     trans: 'I did',           css: 'vbe-1cs'   },
        'NW': { paleo: ['𐤍𐤅'],     trans: 'We did',          css: 'vbe-1cp'   },
        'T':  { paleo: ['𐤕'],      trans: 'You/She did',     css: 'vbe-2or3f' },
        'TM': { paleo: ['𐤕𐤌'],     trans: 'You all did',     css: 'vbe-2mp'   },
        'TN': { paleo: ['𐤕𐤍'],     trans: 'You all did (f)', css: 'vbe-2fp'   },
        'W':  { paleo: ['𐤅'],      trans: 'They did',        css: 'vbe-3mp'   },
        'WN': { paleo: ['𐤅𐤍'],     trans: 'They did (f)',    css: 'vbe-3fp'   },
        'NH': { paleo: ['𐤍𐤄'],     trans: 'They did (f)',    css: 'vbe-3fp'   },
        'H=': { paleo: ['𐤕𐤄','𐤄'], trans: 'She did',         css: 'vbe-3fs'   },
        'H':  { paleo: ['𐤕𐤄','𐤄'], trans: 'She did',         css: 'vbe-3fs'   },
    },
    uvf: {
        'H': { paleo: ['𐤄'], trans: 'Toward',   css: 'uvf-dir'  },
        'J': { paleo: ['𐤉'], trans: 'Emphatic', css: 'uvf-conn' },
        'N': { paleo: ['𐤍'], trans: 'Emphatic', css: 'uvf-conn' },
    },
};

// ── NME_EXCLUSIONS — kept in sync with server.js ──────────────────────────
// See server.js for full documentation of categories A/B/C.
// EDIT IN server.js ONLY — paste updated Set here after any server.js change.
const NME_EXCLUSIONS = new Set([
    '𐤀𐤋𐤄𐤉𐤌',  // Alahayam (H430)
    '𐤔𐤌𐤉𐤌',   // Shamayam (H8064)
    '𐤌𐤉𐤌',    // Mayam (H4325)
    '𐤉𐤌𐤉𐤌',   // Yamayim seas (H3220)
    '𐤉𐤅𐤌𐤉𐤌',  // Yawamayim days (H3117)
    '𐤐𐤍𐤉',    // Panay (H6440)
    '𐤀𐤋𐤄𐤉𐤊',  // Alahayak
    '𐤕𐤌𐤅𐤍𐤄',  // Thamawnah
    '𐤌𐤑𐤅𐤕',   // Matzawath (H4687)
    '𐤐𐤒𐤇𐤉𐤌',  // (H6491)
    '𐤆𐤊𐤅𐤓',   // Zakawar (H2143)
    '𐤓𐤀𐤔𐤉𐤕',  // Raashayath (H7225)
    '𐤔𐤍𐤉',    // shanay = two
    '𐤔𐤕𐤉𐤌',   // shatayim = two (feminine dual)
]);
// 𐤌𐤍 (min, "from") added 2026-07-29 — verified attested first (~852x as
// pos=prep/H4480-4481 in tokens_bhs), see server.js's STANDALONE_WORDS for
// the full note. Keep in sync with server.js — same convention as MUTATED_ROOTS.
const STANDALONE_WORDS = new Set(['𐤀𐤕','𐤏𐤋','𐤁𐤉𐤍','𐤊𐤉','𐤊𐤍','𐤀𐤔𐤓','𐤀𐤋','𐤌𐤍']);

// Paste MUTATED_ROOTS from server.js verbatim — do NOT edit here, edit server.js
const MUTATED_ROOTS = {
    '𐤉𐤌':'𐤉𐤅𐤌','𐤌𐤕':'𐤌𐤅𐤕','𐤒𐤌':'𐤒𐤅𐤌','𐤁𐤀':'𐤁𐤅𐤀','𐤓𐤑':'𐤓𐤅𐤑',
    '𐤎𐤓':'𐤎𐤅𐤓','𐤒𐤅':'𐤒𐤅𐤄','𐤁𐤅':'𐤁𐤅𐤀','𐤓𐤅':'𐤓𐤅𐤄','𐤂𐤅':'𐤂𐤅𐤄',
    '𐤄𐤅':'𐤄𐤅𐤄','𐤑𐤅':'𐤑𐤅𐤄','𐤊𐤄':'𐤊𐤅𐤄','𐤌𐤀𐤓':'𐤌𐤀𐤅𐤓','𐤔𐤁':'𐤔𐤅𐤁',
    '𐤁𐤔':'𐤁𐤅𐤔','𐤍𐤌':'𐤍𐤅𐤌','𐤍𐤎':'𐤍𐤅𐤎','𐤓𐤌':'𐤓𐤅𐤌','𐤑𐤌':'𐤑𐤅𐤌',
    '𐤃𐤍':'𐤃𐤅𐤍','𐤊𐤍':'𐤊𐤅𐤍','𐤋𐤍':'𐤋𐤅𐤍','𐤈𐤁':'𐤈𐤅𐤁','𐤏𐤐':'𐤏𐤅𐤐',
    '𐤒𐤉𐤐':'𐤍𐤒𐤐','𐤎𐤁':'𐤎𐤁𐤁','𐤆𐤍':'𐤆𐤅𐤍','𐤔𐤃':'𐤔𐤅𐤃','𐤓𐤊':'𐤓𐤅𐤊',
    '𐤄𐤋':'𐤄𐤅𐤋','𐤔𐤇':'𐤔𐤅𐤇','𐤔𐤌':'𐤔𐤉𐤌','𐤓𐤍':'𐤓𐤉𐤍',
    '𐤔𐤀':'𐤍𐤔𐤀','𐤂𐤔':'𐤍𐤂𐤔','𐤐𐤋':'𐤍𐤐𐤋','𐤕𐤍':'𐤍𐤕𐤍','𐤑𐤋':'𐤍𐤑𐤋',
    '𐤂𐤏':'𐤍𐤂𐤏','𐤎𐤏':'𐤍𐤎𐤏','𐤂𐤃':'𐤍𐤂𐤃','𐤐𐤔':'𐤍𐤐𐤔','𐤐𐤈':'𐤍𐤐𐤈',
    '𐤐𐤑':'𐤍𐤐𐤑','𐤃𐤏':'𐤉𐤃𐤏','𐤑𐤀':'𐤉𐤑𐤀','𐤓𐤃':'𐤉𐤓𐤃','𐤋𐤃':'𐤉𐤋𐤃',
    '𐤔𐤕':'𐤔𐤉𐤕','𐤅𐤓𐤔':'𐤉𐤓𐤔','𐤅𐤃𐤏':'𐤉𐤃𐤏','𐤅𐤑𐤀':'𐤉𐤑𐤀','𐤅𐤓𐤃':'𐤉𐤓𐤃',
    '𐤅𐤋𐤃':'𐤉𐤋𐤃','𐤅𐤋𐤉𐤃':'𐤉𐤋𐤃','𐤅𐤓𐤉𐤃':'𐤉𐤓𐤃','𐤅𐤃𐤉𐤏':'𐤉𐤃𐤏','𐤅𐤓𐤉𐤔':'𐤉𐤓𐤔',
    '𐤅𐤑𐤉𐤀':'𐤉𐤑𐤀','𐤅𐤋𐤉𐤇':'𐤉𐤋𐤇','𐤏𐤔':'𐤏𐤔𐤄','𐤓𐤀':'𐤓𐤀𐤄','𐤄𐤉':'𐤄𐤉𐤄',
    '𐤒𐤍':'𐤒𐤍𐤄','𐤁𐤍':'𐤁𐤍𐤄','𐤂𐤋':'𐤂𐤋𐤄','𐤊𐤋':'𐤊𐤋𐤄','𐤐𐤍':'𐤐𐤍𐤄',
    '𐤇𐤍':'𐤇𐤍𐤄','𐤄𐤉𐤕':'𐤄𐤉𐤄','𐤏𐤔𐤕':'𐤏𐤔𐤄','𐤑𐤕':'𐤑𐤅𐤄','𐤁𐤕':'𐤁𐤍',
    '𐤔𐤉𐤁':'𐤔𐤅𐤁','𐤑𐤃𐤉𐤒':'𐤑𐤃𐤒','𐤔𐤇𐤅𐤄':'𐤔𐤇𐤄','𐤔𐤇𐤅':'𐤔𐤇𐤄',
    '𐤔𐤒':'𐤔𐤒𐤄','𐤍𐤇𐤄':'𐤍𐤅𐤇','𐤐𐤇':'𐤍𐤐𐤇','𐤅𐤔𐤏':'𐤉𐤔𐤏','𐤅𐤋𐤃':'𐤉𐤋𐤃',
    '𐤅𐤃𐤏':'𐤉𐤃𐤏','𐤅𐤑𐤀':'𐤉𐤑𐤀','𐤅𐤒𐤃':'𐤉𐤒𐤃','𐤅𐤔𐤁':'𐤉𐤔𐤁','𐤅𐤒𐤔':'𐤉𐤒𐤔',
    '𐤅𐤎𐤃':'𐤉𐤎𐤃','𐤅𐤑𐤒':'𐤉𐤑𐤒','𐤅𐤎𐤐':'𐤉𐤎𐤐','𐤁𐤔𐤔':'𐤁𐤅𐤔','𐤊𐤍𐤍':'𐤊𐤅𐤍',
    '𐤓𐤌𐤌':'𐤓𐤅𐤌','𐤔𐤁𐤁':'𐤔𐤅𐤁','𐤑𐤌𐤌':'𐤑𐤅𐤌','𐤃𐤍𐤍':'𐤃𐤅𐤍',
    '𐤆𐤓𐤉𐤏':'𐤆𐤓𐤏','𐤁𐤃𐤉𐤋':'𐤁𐤃𐤋','𐤀𐤉𐤓':'𐤀𐤅𐤓','𐤌𐤈𐤉𐤓':'𐤌𐤈𐤓',
    '𐤊𐤉𐤋':'𐤊𐤅𐤋','𐤔𐤉𐤓':'𐤔𐤅𐤓','𐤔𐤓':'𐤔𐤅𐤓','𐤍𐤓':'𐤍𐤅𐤓',
    '𐤈𐤊':'𐤍𐤈𐤊','𐤈𐤄':'𐤈𐤄𐤓','𐤌𐤀':'𐤌𐤀𐤄','𐤔𐤍':'𐤔𐤍𐤄',
    // Section 14 — lamed-waw safety net (see server.js for docs)
    '𐤋𐤇':'𐤋𐤅𐤇',  // lawach (H3871) tablet
};

const STRONGS_NO_MUTATE = new Set(['H3220','H251','H259']);

function getCssClass(pos) {
    switch (pos) {
        case 'conj': case 'conjunction': return 'mod-conj';
        case 'prep': case 'preposition': return 'mod-prep';
        case 'art':  case 'article':     return 'mod-art';
        case 'nega': case 'negation':    return 'mod-nega';
        case 'advb': case 'adverb':      return 'mod-advb';
        case 'intj': case 'interjection':return 'mod-intj';
        case 'inrg': case 'interrogative':return 'mod-inrg';
        case 'prde': case 'demonstrative pronoun': return 'mod-prde';
        case 'prps': case 'personal pronoun':      return 'mod-prps';
        case 'prin': case 'interrogative pronoun': return 'mod-prin';
        case 'nmpr': case 'proper noun':           return 'mod-nmpr';
        default: return 'root';
    }
}

function getTranslit(paleoStr) {
    if (!paleoStr) return '';
    const chars = [...paleoStr];
    let t = '';
    for (let i = 0; i < chars.length; i++) {
        const m = CHAR_MAP[chars[i]];
        if (m) t += i === chars.length - 1 ? m.fin : m.med;
        else t += chars[i];
    }
    return t.charAt(0).toUpperCase() + t.slice(1);
}

function transliterateBlock(components) {
    const combined = components.map(c => c.paleo).join('');
    const total = [...combined].length;
    let cur = 0;
    for (const comp of components) {
        const chars = [...comp.paleo];
        let t = '';
        for (let i = 0; i < chars.length; i++) {
            const m = CHAR_MAP[chars[i]];
            if (m) t += cur === total - 1 ? m.fin : m.med;
            else t += chars[i];
            cur++;
        }
        comp.translit = t;
    }
}

// True iff every consonant of `sub` appears in `full` in order — i.e. `sub` is a
// defective (letter-elided) spelling of `full`, not an unrelated root. Kept
// byte-identical to server.js so both parsers agree. `sub`/`full` are arrays of
// Paleo code points.
function isRootSubsequence(sub, full) {
    let i = 0;
    for (const ch of full) { if (i < sub.length && sub[i] === ch) i++; }
    return i === sub.length;
}

function extractPrefix(attributes, attrKey, mapKey, paleoArray) {
    if (!attributes[attrKey] || attributes[attrKey] === 'absent') return null;
    const rawTag = attributes[attrKey];
    const mapData = GRAMMAR_MAP[mapKey][rawTag];
    if (!mapData) return { paleo: '', translit: '', translation: `[?${rawTag}]`, css: 'mod-pref-unk' };
    const sibilants = ['𐤔','𐤎','𐤑','𐤆'];
    if (attrKey === 'vbs' && (rawTag === 'HCT' || rawTag === 'HT')) {
        if (paleoArray.length >= 2 && sibilants.includes(paleoArray[0]) && paleoArray[1] === '𐤕')
            return { paleo: '', translit: '', translation: `[${mapData.trans}]`, css: mapData.css || 'mod-pref' };
    }
    const cur = paleoArray.join('');
    let matched = '';
    for (const p of mapData.paleo) { if (cur.startsWith(p)) { matched = p; break; } }
    if (matched) {
        const charCount = [...matched].length;
        paleoArray.splice(0, charCount);
        return { paleo: matched, translit: '', translation: `[${mapData.trans}]`, css: mapData.css || 'mod-pref' };
    }
    return null;
}

function extractSuffix(attributes, attrKey, mapKey, paleoArray) {
    if (!attributes[attrKey] || attributes[attrKey] === 'absent') return null;
    const rawTag = attributes[attrKey];
    const mapData = GRAMMAR_MAP[mapKey][rawTag];
    if (!mapData) return { paleo: '', translit: '', translation: `[?${rawTag}]`, css: 'mod-suff-unk' };
    const cur = paleoArray.join('');
    let matched = '';
    for (const p of mapData.paleo) { if (cur.endsWith(p)) { matched = p; break; } }
    if (matched) {
        paleoArray.splice(paleoArray.length - [...matched].length, [...matched].length);
        return { paleo: matched, translit: '', translation: `[${mapData.trans}]`, css: mapData.css || 'mod-suff' };
    }
    return null;
}

// Kept in sync with server.js guessSuffixGloss — reverse-lookup a bare Paleo
// consonant-string against every known suffix table so a trailing addition
// that survives to rootDisplay unclaimed can still get its real grammatical
// label instead of a bare "unknown" stub.
function guessSuffixGloss(paleoStr) {
    if (!paleoStr) return null;
    for (const mapKey of ['nme', 'prs', 'vbe', 'uvf']) {
        const table = GRAMMAR_MAP[mapKey];
        for (const tag of Object.keys(table)) {
            const entry = table[tag];
            if (entry.paleo.includes(paleoStr)) return entry;
        }
    }
    return null;
}

// Merge a stripped SURFACE root-portion with the CANONICAL root so the full root
// shines through AND every surface modification is kept — kept in sync with
// server.js mergeRootDisplay (see there for full docs). Returns the merged Paleo
// string, or null when the surface is NOT a defective spelling of the canonical
// root. `surface`/`canonical` are arrays of Paleo code points.
function mergeRootDisplay(surface, canonical) {
    const S = surface, C = canonical, m = S.length, n = C.length;
    if (n < 2) return null;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            dp[i][j] = S[i - 1] === C[j - 1]
                ? dp[i - 1][j - 1] + 1
                : Math.max(dp[i - 1][j], dp[i][j - 1]);
    const lcs = dp[m][n];
    if (lcs < 2 || lcs < n - 1 || (m - lcs) > 2) return null;
    const pairs = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
        if (S[i - 1] === C[j - 1]) { pairs.push([i - 1, j - 1]); i--; j--; }
        else if (dp[i - 1][j] >= dp[i][j - 1]) i--; else j--;
    }
    pairs.reverse();
    const out = [];
    let si = 0, ci = 0;
    for (const [pi, pj] of pairs) {
        while (ci < pj) { out.push(C[ci]); ci++; }
        while (si < pi) { out.push(S[si]); si++; }
        out.push(C[pj]); ci = pj + 1; si = pi + 1;
    }
    while (ci < n) { out.push(C[ci]); ci++; }
    while (si < m) { out.push(S[si]); si++; }
    return out.join('');
}

// Pronominal-suffix consonants keyed by descriptive tag — kept in sync with
// server.js PRS_TAG. Append-only + bare-consonant peel (never feeds root_paleo).
const PRS_TAG = {
    '1cs': { paleo: '𐤉',  trans: 'My',            css: 'prs-1cs' },
    '1cp': { paleo: '𐤍𐤅', trans: 'Our',           css: 'prs-1cp' },
    '2ms': { paleo: '𐤊',  trans: 'Your',          css: 'prs-2ms' },
    '2fs': { paleo: '𐤊',  trans: 'Your',          css: 'prs-2fs' },
    '2mp': { paleo: '𐤊𐤌', trans: 'Your (plural)', css: 'prs-2mp' },
    '2fp': { paleo: '𐤊𐤍', trans: 'Your (fem pl)', css: 'prs-2fp' },
    '3ms': { paleo: '𐤅',  trans: 'His',           css: 'prs-3ms' },
    '3fs': { paleo: '𐤄',  trans: 'Her',           css: 'prs-3fs' },
    '3mp': { paleo: '𐤌',  trans: 'Their',         css: 'prs-3mp' },
    '3fp': { paleo: '𐤍',  trans: 'Their (fem)',   css: 'prs-3fp' },
};

const MORPH_KEY_NORM = {
    'parser_part_of_speech': 'pdp', 'speech_part': 'sp', 'verbal_stem': 'vs',
    'verbal_tense_form': 'vt', 'gender': 'gn', 'number': 'nu', 'state': 'st',
    'person': 'ps', 'pronominal_suffix': 'prs', 'prefix_marker': 'pfm',
    'verbal_stem_marker': 'vbs', 'verbal_ending': 'vbe', 'nominal_ending': 'nme',
    'unclassified_final': 'uvf', 'part_of_speech': 'pos_attr',
};
const MORPH_VAL_NORM = {
    'perfect':'perf','imperfect':'impf','wayyiqtol':'wayq','imperative':'impv',
    'infinitive_construct':'infc','infinitive_absolute':'infa','participle_active':'ptca',
    'participle_passive':'ptcp',
    'qal':'qal','nifal':'nif','piel':'piel','pual':'pual','hifil':'hif','hofal':'hof',
    'hitpael':'hit','hishtaphel':'hsht',
    'masculine':'m','feminine':'f','singular':'sg','plural':'pl','dual':'du',
    'absolute':'a','construct':'c',
    'first':'p1','second':'p2','third':'p3','first_person':'p1','second_person':'p2','third_person':'p3',
    'p1':'p1','p2':'p2','p3':'p3',
    'verb':'verb','noun':'subs','substantive':'subs','adjective':'adjv','preposition':'prep',
    'conjunction':'conj','article':'art','personal_pronoun':'prps','demonstrative_pronoun':'prde',
    'interrogative_pronoun':'prin','proper_noun':'nmpr','adverb':'advb','adverbial_use':'advb',
    'negation':'nega','interjection':'intj','interrogative':'inrg',
    '3ms_prefix':'J','3mp_prefix':'J','1cs_prefix':'>','1cp_prefix':'N',
    '2ms/2fs/3fs_prefix':'T=','3fs_prefix':'T=','2ms_prefix':'T=','2fs_prefix':'T=',
    'participial_prefix':'M',
    'hifil_marker_(causative)':'H','nifal_marker_(passive)':'N','hitpael_marker_(reflexive)':'HT',
    'piel_marker':'',
    '1cs_verbal_ending':'TJ','1cp_verbal_ending':'NW','2ms_verbal_ending':'T','2fs_verbal_ending':'T',
    '3fs_verbal_ending':'H=','2mp_verbal_ending':'TM','2fp_verbal_ending':'TN','3mp_verbal_ending':'W',
    '3fp_verbal_ending':'WN','3fp_verbal_ending_nh':'NH',
    'he_ending':'H','feminine_tav_ending':'T','construct_or_1cs_yod':'J','masculine_plural_ending':'JM',
    'feminine_plural_ending':'WT','feminine_plural_construct':'WTJ','they_feminine_ending':'NH',
};
const PDP_FULL = {
    'verb':'verb','subs':'noun','adjv':'adjective','prep':'preposition','conj':'conjunction',
    'art':'article','prde':'demonstrative pronoun','prps':'personal pronoun',
    'prin':'interrogative pronoun','nmpr':'proper noun','advb':'adverb','nega':'negation',
    'intj':'interjection','inrg':'interrogative',
};
const VS_FULL  = { 'qal':'qal','nif':'nifal','piel':'piel','pual':'pual','hif':'hifil','hof':'hofal','hit':'hitpael','hsht':'hishtaphel','htpo':'hitpolel','poel':'poel','polel':'polel' };
const VT_FULL  = { 'perf':'perfect','impf':'imperfect','wayq':'wayyiqtol','impv':'imperative','infc':'infinitive construct','infa':'infinitive absolute','ptca':'participle active','ptcp':'participle passive' };
const GN_FULL  = { 'm':'masculine','f':'feminine','unknown':'unknown' };
const NU_FULL  = { 'sg':'singular','pl':'plural','du':'dual','unknown':'unknown' };
const ST_FULL  = { 'a':'absolute','c':'construct' };
const PS_FULL  = { 'p1':'first person','p2':'second person','p3':'third person','unknown':'unknown' };

/**
 * Parse a single raw DB row into component objects.
 * Returns an array of components (same shape as parseHebrewData output[i].components).
 * Also returns { word_raw, strongs, root_paleo, rendered_paleo, components }.
 */
function parseToken(wordRaw, pos, morph, strongs) {
    const rawPaleo = (wordRaw || '').trim().replace(/[^𐤀-𐤕]/gu, '');
    const originalRawPaleo = rawPaleo;

    const attributes = {};
    for (const seg of (morph || '').split('|')) {
        const eq = seg.indexOf('=');
        if (eq < 1) continue;
        const rawKey = seg.slice(0, eq).trim();
        const rawVal = seg.slice(eq + 1).trim();
        if (!rawKey || !rawVal || rawVal === 'absent' || rawVal === 'none') continue;
        attributes[MORPH_KEY_NORM[rawKey] || rawKey] = MORPH_VAL_NORM[rawVal] || rawVal;
    }

    // ── BUG B FIX ────────────────────────────────────────────────────────────
    // The single-blob standalone branch below IGNORES every affix morpheme
    // (pfm/vbs/prs/nme/vbe/uvf). A particle that carries one — e.g. a preposition
    // with a pronominal suffix (𐤀𐤋+𐤉 "to me", 𐤏𐤋+𐤅 "upon him") — must NOT take it,
    // or the suffix is silently swallowed: no suffix chip, no reconstruction.
    // Such tokens are routed to the else-branch, which splits root + affix
    // correctly via extractPrefix/extractSuffix and the PRS_TAG reconstruction.
    // Bare particles (inseparable 𐤁/𐤋/𐤊/𐤌, 𐤅 conj, 𐤄 art) carry no affix and are
    // unaffected — they still fold into the following word block exactly as before.
    // NOTE: `attributes` already drops 'absent'/'none' values, so a present key
    // here means a REAL morpheme.
    const AFFIX_KEYS = ['pfm', 'vbs', 'prs', 'nme', 'vbe', 'uvf'];
    const hasAffix = AFFIX_KEYS.some(k => attributes[k]);
    // A PROCLITIC is a particle that fuses onto the FOLLOWING word. Two rules:
    //  • conj/prep/art, but ONLY when carrying no affix of its own (a preposition
    //    with a pronominal suffix — 𐤀𐤋+𐤉 "to me", 𐤁+𐤉 "in me" — is a whole word).
    //  • the interrogative HE: pos=inrg AND the surface is exactly 𐤄. Other inrg
    //    tokens (𐤌𐤄 "what", 𐤌𐤉 "who") are standalone words, so gate on the surface.
    const isInterrogHe = (pos === 'inrg' && rawPaleo === '𐤄');
    const isStandalonePos = (['conj','prep','art'].includes(pos) && !hasAffix) || isInterrogHe;
    const isStandaloneException = STANDALONE_WORDS.has(rawPaleo);

    let components = [];

    if (isStandalonePos && !isStandaloneException) {
        let translation = `[${rawPaleo}]`;
        if (pos === 'prep') translation = GRAMMAR_MAP.prep[rawPaleo] || homographs[`${rawPaleo}_preposition`] || lexicon[rawPaleo] || `[${rawPaleo}]`;
        else if (pos === 'conj') translation = GRAMMAR_MAP.conj[rawPaleo] || homographs[`${rawPaleo}_conjunction`] || lexicon[rawPaleo] || `[${rawPaleo}]`;
        else if (pos === 'art') translation = GRAMMAR_MAP.art[rawPaleo] || homographs[`${rawPaleo}_article`] || lexicon[rawPaleo] || `[${rawPaleo}]`;
        // NOTE: deliberately NO bare lexicon[rawPaleo] fallback here. lexicon['𐤄']
        // is the ARTICLE gloss ("The"); letting it through is precisely what made
        // the interrogative render as "[the]". Only pos-keyed sources may answer.
        else if (pos === 'inrg') translation = homographs[`${rawPaleo}_interrogative`] || GRAMMAR_MAP.inrg[rawPaleo] || `[${rawPaleo}]`;
        // A particle tagged with one class but belonging to another still has a
        // fixed meaning. 𐤅 arrives tagged prep in 50,992 places; GRAMMAR_MAP.prep
        // has no 𐤅, so it rendered as bare [𐤅]. This only fires when the pos-keyed
        // lookup above already failed, so no existing gloss changes. The article
        // table stays excluded for the interrogative, per the note above.
        if (!translation || translation === `[${rawPaleo}]`) {
            const tables = pos === 'inrg' ? ['conj', 'prep'] : ['conj', 'prep', 'art'];
            for (const t of tables) {
                const g = GRAMMAR_MAP[t] && GRAMMAR_MAP[t][rawPaleo];
                if (g) { translation = g; break; }
            }
        }
        components = [{ paleo: rawPaleo, translit: '', translation, css: getCssClass(pos) }];
    } else {
        const paleoArray = [...rawPaleo];

        const pfmObj = extractPrefix(attributes, 'pfm', 'pfm', paleoArray);
        const vbsObj = extractPrefix(attributes, 'vbs', 'vbs', paleoArray);
        let prsObj = extractSuffix(attributes, 'prs', 'prs', paleoArray);
        const uvfObj = extractSuffix(attributes, 'uvf', 'uvf', paleoArray);

        let nmeObj = null;
        // ── SUFFIX STRIPPING IS STRONG'S-DRIVEN — NO PER-WORD SPECIAL CASES ──
        // Kept in sync with server.js parseHebrewData. The canonical root (from
        // the token's Strong's number) decides whether a nominal ending is a real
        // suffix or a root radical; the canonical restore + ending-absorption
        // below rebuild the true root and drop any ending it already carries. So
        // 𐤀𐤋𐤄𐤉𐤌 / 𐤀𐤋𐤄𐤉 / 𐤔𐤌𐤉𐤌 / 𐤌𐤉𐤌 keep their root-final letters while a
        // genuine plural (𐤎𐤅𐤎𐤉𐤌, H5483) keeps its chip — no surface exceptions.
        // The surface list is consulted ONLY when the token has no Strong's number.
        const _snEarly = strongs ? 'H' + strongs.replace(/^H+/, '') : '';
        const shouldExcludeNme = _snEarly ? false : NME_EXCLUSIONS.has(originalRawPaleo);

        // Plural participles — construct AND absolute — never get an nme tag
        // from OSHB at all — their plural info lives on vt/nu/st instead — but
        // they share the exact same masc-plural ending as a tagged noun (bare
        // Yod in construct, Yod-Mem in absolute). Previously gated on st==='c'
        // only, so an absolute-plural participle (e.g. "HaHalakayam" — the ones
        // who walk, Ps 119:1) had its whole "-ayim" ending silently baked into
        // the displayed root with no chip at all. Synthesize 'JM' for BOTH
        // states so the shared extraction path (with its bare-Yod candidate,
        // see GRAMMAR_MAP.nme above) catches it. Kept in sync with server.js
        // parseHebrewData.
        if (!attributes['nme'] && pos === 'verb' &&
            (attributes['vt'] || '').startsWith('ptc') &&
            attributes['nu'] === 'pl') {
            attributes['nme'] = 'JM';
        }

        if (!shouldExcludeNme) nmeObj = extractSuffix(attributes, 'nme', 'nme', paleoArray);

        // JM/JM= tagged but spelled with a bare Yod (construct plural "-ei",
        // e.g. ashrei/temimei/notzrei) instead of the absolute "-im" ending —
        // consonantal Hebrew can't distinguish that from the 1cs possessive "-i"
        // ("my") by the letter alone, so reuse the same "Of/My" label the
        // standalone nme='J' tag already gets, rather than inventing a separate
        // "construct plural" gloss. Kept in sync with server.js.
        if (!nmeObj && !shouldExcludeNme &&
            (attributes['nme'] === 'JM' || attributes['nme'] === 'JM=') &&
            paleoArray.join('').endsWith('𐤉')) {
            paleoArray.splice(paleoArray.length - 1, 1);
            const jData = GRAMMAR_MAP.nme['J'];
            nmeObj = { paleo: '𐤉', translit: '', translation: `[${jData.trans}]`, css: jData.css };
        }

        let vbeObj = extractSuffix(attributes, 'vbe', 'vbe', paleoArray);

        // Masculine plural imperative ("Praise!", "Keep!", …) always ends in ־וּ
        // (Waw) — a universal Hebrew inflectional rule, not a per-root guess.
        // extractSuffix() above only fires when the corpus's own `verbal_ending`
        // field is present on this token, and that field is reliably tagged for
        // the SUFFIX/perfect conjugation's person-agreement afformative but not
        // consistently tagged for the plain imperative (person/number already
        // lives in ps/gn/nu there). Left alone, the SAME verb baked two
        // different ways depending on whether it carried an object suffix.
        // Strip it here on the same grammatical grounds whenever nothing
        // upstream already accounted for it. Kept in sync with server.js
        // parseHebrewData.
        if (!vbeObj && !attributes['prs'] &&
            attributes['vt'] === 'impv' && attributes['nu'] === 'pl' && attributes['gn'] !== 'f' &&
            paleoArray.length && paleoArray[paleoArray.length - 1] === '𐤅') {
            paleoArray.pop();
            vbeObj = { paleo: '𐤅', translit: '', translation: '[you all]', css: 'vbe-2mp' };
        }

        const displayRoot = paleoArray.join('');

        // Pronominal suffix — root + all modifications, BAKED (kept in sync with
        // server.js). The suffix comes from the morphology tag, not the surface:
        // peel the bare consonant off the DISPLAY root-zone only where present, and
        // always emit the chip (reconstructed when the surface omitted it). The
        // GROUPING root (trueRoot / root_paleo) is resolved from displayRoot and is
        // NOT affected — that is what keeps the strongs↔root invariant clean.
        const _prsInfo = attributes['prs'] ? PRS_TAG[attributes['prs']] : null;
        let rootZone = displayRoot;
        if (_prsInfo && _prsInfo.paleo && rootZone.endsWith(_prsInfo.paleo)) {
            rootZone = rootZone.slice(0, rootZone.length - _prsInfo.paleo.length);
        }
        if (_prsInfo) {
            prsObj = { paleo: _prsInfo.paleo, translit: '',
                       translation: `[${_prsInfo.trans}]`, css: _prsInfo.css,
                       reconstructed: !displayRoot.endsWith(_prsInfo.paleo) };
        } else if (prsObj && !prsObj.paleo) {
            prsObj = null;   // drop the empty [?tag] stub for unknown suffix codes
        }
        const _rootZoneLen = [...rootZone].length;
        const pdp = attributes['pdp'] || '';
        const vs  = attributes['vs']  || '';
        const gn  = attributes['gn']  || '';
        const nu  = attributes['nu']  || '';
        const vt  = attributes['vt']  || '';
        const st  = attributes['st']  || '';
        const ps  = attributes['ps']  || '';

        // ── TRUE ROOT RESOLUTION — kept in sync with server.js ────────────────
        // Priority: strongs-roots.json > STRONGS_NO_MUTATE > MUTATED_ROOTS > displayRoot
        // See server.js for full documentation.
        const normStrongsForMutate = strongs ? 'H' + strongs.replace(/^H+/, '') : '';
        const STRONGS_NO_MUTATE = new Set(['H3220', 'H251', 'H259']);
        const skipMutate = STRONGS_NO_MUTATE.has(normStrongsForMutate);
        const displayRootLen = [...displayRoot].length;

        const _srl = loadStrongsRoots ? loadStrongsRoots() : (strongsRootsLex || {});
        const _canonicalRoot = normStrongsForMutate ? _srl[normStrongsForMutate] : null;
        const _canonLen = _canonicalRoot ? [..._canonicalRoot].length : 0;

        // How many letters of the canonical root are NOT written in the surface?
        // Elision (I-nun, I-yod) accounts for one or two; more than that means the
        // Strong's belongs to a different word — in practice a compound proper
        // noun whose lemma is the whole name and whose token is one half.
        // Computed once: it decides BOTH the lemma root and the displayed root.
        const _canonMissing = !_canonicalRoot ? Infinity : (() => {
            const surf = [...originalRawPaleo];
            let i = 0, missing = 0;
            for (const ch of _canonicalRoot) {
                const at = surf.indexOf(ch, i);
                if (at < 0) missing++; else i = at + 1;
            }
            return missing;
        })();
        // Proper names don't elide letters the way conjugated verb roots do —
        // no tolerance for pos='nmpr'. Kept in sync with build-surface-index.js
        // and server.js's parseHebrewData.
        const _canonTrusted = pos === 'nmpr' ? _canonMissing === 0 : _canonMissing <= 2;
        // A COMPOUND-NAME half (Ben-Gever H1127: surface "Ben" = 2 letters, lemma
        // "Ben-Gever" = 5) and a genuine SAME-WORD spelling variant (Mowcadah/
        // foundation H4146: surface 5 letters, lemma 5 letters, just a weak Yod->Vav
        // swap + reordering) can score IDENTICALLY on _canonMissing — both "3 letters
        // not found in order" — because that count can't tell "this token is only
        // half the word" from "this token has all the word's letters, just
        // rearranged". Surface LENGTH can: a compound half is drastically shorter
        // than its multi-word lemma; a spelling variant carries roughly as many
        // letters as its lemma. Used ONLY to decide whether rootDisplay may fall
        // back to the bare canonical root (never trueRoot, which is allowed to be
        // the whole compound for grouping).
        const _lengthTrusted = [...originalRawPaleo].length >= _canonLen - 2;

        let trueRoot;
        let rootDisplay;   // reader-facing root: canonical + kept surface modifications (baked)
        // `_canonLen >= displayRootLen` used to gate this whole branch, which
        // assumed the canonical root can never be SHORTER than what the parser
        // derived. Under the additive rule that assumption is backwards — the
        // root is the SEED and modifications are added to it, so a derived form
        // longer than its root is the normal case, not a red flag. That gate
        // alone blocked 1,875 of the 2,847 flagged surfaces from ever consulting
        // their canonical root.
        if (_canonicalRoot && !skipMutate) {
            // trueRoot (→ root_paleo) uses displayRoot — the BASELINE input, so the
            // grouping root and strongs↔root invariant are byte-identical to before.
            const canonFirst = [..._canonicalRoot][0];
            const dispFirst  = [...displayRoot][0];
            // FIRST-LETTER GUARD, WIDENED. The bare `canonFirst === dispFirst`
            // test rejected the canonical root whenever a PREFIX had consumed the
            // first radical — exactly the legitimate case. 𐤀𐤌𐤓 (H559, I-aleph):
            // the 1cs prefix aleph is also radical 1, so after stripping,
            // displayRoot = 𐤌𐤓, first letters differ, and the canonical root was
            // thrown away — leaving root_paleo = 𐤌𐤓, a root that does not exist,
            // and glossing it "[𐤌𐤓]". The letters on screen were never the issue;
            // the ROOT and its gloss were.
            //
            // The guard's real job is to stop a WRONG Strong's number injecting an
            // unrelated root. isRootSubsequence does that precisely: accept the
            // canonical root when displayRoot is a letter-elided subsequence of it
            // (𐤌𐤓 ⊂ 𐤀𐤌𐤓 ✓), reject when it is not (𐤌𐤓 ⊄ 𐤁𐤓𐤊 ✗).
            //
            // ── ADDITIVE-ONLY RULE ──────────────────────────────────────────
            // "Characters from a root are never removed. All modifications are
            // added to the original root." So the test that matters is not
            // whether the DERIVED root fits inside the canonical one — it is
            // whether the CANONICAL root's characters are all actually present
            // in the word. If they are, that root is the root, and everything
            // else in the surface is an added modification.
            //
            // The old direction, isRootSubsequence(displayRoot, canonical),
            // asked the reverse and therefore failed the moment a SUFFIX was
            // present: H559 𐤀𐤌𐤓 amar, surface 𐤀𐤌𐤓𐤄 — displayRoot came out 𐤌𐤓𐤄
            // (the 1cs-imperfect stripper had eaten the aleph, which here is
            // radical 1), 𐤌𐤓𐤄 ⊄ 𐤀𐤌𐤓 because of the added 𐤄, so the canonical
            // root was discarded and root_paleo kept 𐤌𐤓𐤄 — a root that does not
            // exist. Asking instead "is 𐤀𐤌𐤓 present in 𐤀𐤌𐤓𐤄?" gives yes.
            //
            // Measured on the 2,847 flagged surfaces: the old test accepted 3,
            // this accepts 1,303, and it restores the eaten first radical in 262
            // of the 285 cases where one was lost. The remaining 1,544 are
            // genuinely rejected — an assimilated nun or elided yod is not
            // written, so the root really is not fully present, and inventing it
            // would be adding a character rather than keeping one.
            // THE STRONG'S ROOT IS THE ROOT. Take it unless the Strong's is
            // plainly wrong for this word.
            //
            // A root letter missing from the surface is NOT a reason to reject:
            // Hebrew elides an I-nun and a I-yod in writing, but the root still
            // has them, and this app SHOWS them — root + modification, spelled
            // out, even where the orthography merges the two (𐤀𐤌𐤓 with the 1cs
            // "I" modifier renders 𐤀𐤀𐤌𐤓). Adding a letter back is the design,
            // not a violation of it.
            //
            // So the only question is whether this Strong's belongs to this word
            // at all. Measured on the real 2,847: allowing up to TWO absent
            // letters accepts 2,822 and rejects 25 — and all 25 are COMPOUND
            // PROPER NOUNS (H6307 Paddan-Aram, H7153 Kiryat-Arba, H5874 Ein-Dor,
            // H1145 ben-Yemini) where the lemma is the whole compound and the
            // surface token is only one half. Those should be rejected.
            if (!dispFirst || canonFirst === dispFirst || _canonTrusted) {
                trueRoot = _canonicalRoot;
            } else {
                trueRoot = MUTATED_ROOTS[displayRoot] || displayRoot;
            }
        } else if (skipMutate) {
            trueRoot = displayRoot;
        } else if (displayRootLen <= 1 && MUTATED_ROOTS[originalRawPaleo]) {
            trueRoot = MUTATED_ROOTS[originalRawPaleo];
        } else {
            trueRoot = MUTATED_ROOTS[displayRoot] || displayRoot;
        }

        // rootDisplay (reader/search) uses rootZone — canonical + root-zone surface
        // modifications with the pronominal suffix peeled off (it becomes a chip).
        if (_canonicalRoot && !skipMutate) {
            const rzMerged  = mergeRootDisplay([...rootZone], [..._canonicalRoot]);
            const canonFirst = [..._canonicalRoot][0];
            const rzFirst    = [...rootZone][0];
            // THE WORD ON SCREEN IS THE WHOLE ROOT PLUS ITS MODIFICATIONS.
            // The app does not reproduce the manuscript spelling; it shows the
            // full word, so a root letter the orthography merged or elided is put
            // back. 1cs of 𐤀𐤌𐤓 renders 𐤀 + 𐤀𐤌𐤓 = 𐤀𐤀𐤌𐤓, and an assimilated I-nun
            // returns to its root. This is the SAME rule as trueRoot above —
            // previously this branch kept its own stricter gate
            // (`_canonLen >= _rootZoneLen && canonFirst === rzFirst`), so the
            // lemma could be corrected while the displayed word still showed the
            // clipped surface form. One rule, both.
            // NMPR GUARD (kept in sync with build-surface-index.js / server.js).
            // Same-first-letter = same name/orthographic variant (Asshur
            // plene/defective); first-letter mismatch = different word reusing
            // the SN (Yabneel vs Ban-Al) — mirrors trueRoot's own test above.
            if (pos === 'nmpr' && canonFirst !== rzFirst) {
                rootDisplay = MUTATED_ROOTS[rootZone] || rootZone;
            } else if (rzMerged) {
                // mergeRootDisplay already returns canonical + surface additions,
                // which is additive by construction — prefer it when it fires.
                rootDisplay = rzMerged;
            } else if (_canonTrusted || _lengthTrusted) {
                rootDisplay = _canonicalRoot;
            } else {
                rootDisplay = MUTATED_ROOTS[rootZone] || rootZone;
            }
        } else if (skipMutate) {
            rootDisplay = rootZone;
        } else if (_rootZoneLen <= 1 && MUTATED_ROOTS[originalRawPaleo]) {
            rootDisplay = MUTATED_ROOTS[originalRawPaleo];
        } else {
            rootDisplay = MUTATED_ROOTS[rootZone] || rootZone;
        }

        // ── HARDEN: NO BAKED MODIFICATION MAY LOOK LIKE A BARE ROOT ─────────
        // Kept in sync with server.js. mergeRootDisplay tolerates up to 2 surface
        // letters not part of the canonical root so it can preserve a mid-word
        // mater lectionis or restored radical in place. But when those letters
        // land AFTER the full canonical root (rootDisplay literally starts with
        // trueRoot and then keeps going), they are an inflectional ending some
        // upstream tag failed to claim — not part of the root's own spelling.
        // Split it into its own chip so nothing renders as an undifferentiated
        // blob. NME_EXCLUSIONS words are untouched: trueRoot already contains
        // those trailing letters there, so rootDisplay === trueRoot.
        let bakedModObj = null;
        if (rootDisplay && trueRoot && rootDisplay !== trueRoot && rootDisplay.startsWith(trueRoot)) {
            const bakedExtra = rootDisplay.slice(trueRoot.length);
            if (bakedExtra) {
                const guess = guessSuffixGloss(bakedExtra);
                bakedModObj = {
                    paleo: bakedExtra,
                    translit: '',
                    translation: guess ? `[${guess.trans}]` : `[${getTranslit(bakedExtra)}]`,
                    css: guess ? (guess.css || 'mod-suff-unk') : 'mod-suff-unk',
                    bakedSplit: true,  // kept in sync with server.js reGlossOne guard
                };
                rootDisplay = trueRoot;
            }
        }

        const normStrongs = strongs ? 'H' + strongs.replace(/^H+/, '') : '';
        const fpdp = PDP_FULL[pdp] || pdp;
        const fpos = PDP_FULL[pos]  || pos;
        const fvs  = VS_FULL[vs]    || vs;
        const fvt  = VT_FULL[vt]    || vt;
        const fgn  = GN_FULL[gn]    || gn;
        const fnu  = NU_FULL[nu]    || nu;
        const fst  = ST_FULL[st]    || st;
        const fps  = PS_FULL[ps]    || ps;

        const buildKeys = (r) => [
            (normStrongs && fpdp)  ? `${r}_${normStrongs}_${fpdp}` : null,
            normStrongs            ? `${r}_${normStrongs}`          : null,
            (fpdp && fgn && fnu)   ? `${r}_${fpdp}_${fgn}_${fnu}`  : null,
            (fpdp && fgn)          ? `${r}_${fpdp}_${fgn}`          : null,
            (fpdp && fnu)          ? `${r}_${fpdp}_${fnu}`          : null,
            (fpdp && fst)          ? `${r}_${fpdp}_${fst}`          : null,
            (fvs && fvt)           ? `${r}_${fvs}_${fvt}`           : null,
            fvs                    ? `${r}_${fvs}`                   : null,
            fvt                    ? `${r}_${fvt}`                   : null,
            fpdp                   ? `${r}_${fpdp}`                  : null,
            (fpos && fpos !== fpdp)? `${r}_${fpos}`                  : null,
            (fgn && fnu)           ? `${r}_${fgn}_${fnu}`            : null,
            fps                    ? `${r}_${fps}`                   : null,
        ].filter(Boolean);

        // Homograph keys are built from the ROOTS ONLY. homographs.json is keyed
        // <root>_<STRONGS> ("𐤔𐤌𐤏_H8085": "hearken / hear") — a root and a number,
        // never a surface. Feeding the raw surface in here was the same mistake
        // as feeding it to the lexicon: the tokenizer strips characters, so a
        // surface matches a root entry only by accident.
        const lookupKeys = [
            ...buildKeys(trueRoot),
            ...buildKeys(displayRoot),
        ];

        const snNorm = strongs ? 'H' + strongs.replace(/^H+/, '') : '';
        // ── THE STRONG'S IS THE SOURCE OF TRUTH ─────────────────────────────
        // A gloss is looked up by the Strong's number, and by the ROOT that
        // Strong's names. The RAW SURFACE IS NEVER A KEY.
        //
        // The surface is root + modifications, and the tokenizer routinely
        // strips characters, so matching it against a root-keyed lexicon is a
        // coincidence either way — sometimes right, sometimes catastrophically
        // wrong. Gen 14:16: 𐤉𐤔𐤁 carries `prefix_marker=3ms_prefix_(he/it)`, so
        // the 𐤉 is the imperfect prefix and the root is 𐤔𐤅𐤁 shuv (H7725). But
        // 𐤉𐤔𐤁 is also the root of H3427 yashab, and `"𐤉𐤔𐤁": "inhabit/dwell"`
        // in lexicon.json matched the surface — printing yashab's gloss under an
        // H7725 badge.
        //
        // Guarding that with "only when no prefix was stripped" would be a patch
        // over the same mistake. The surface simply is not what a lexicon entry
        // is about. Strong's -> root -> gloss; modifications are then applied to
        // that root.
        const { text: finalTranslation, src: glossSrc } = resolveGloss({
            sn: normStrongs,
            snKeys: snNorm ? [
                (fvs && fvt) ? `${snNorm}_${fvs}_${fvt}` : null,
                fvs  ? `${snNorm}_${fvs}`  : null,
                fvt  ? `${snNorm}_${fvt}`  : null,
                fpdp ? `${snNorm}_${fpdp}` : null,
                snNorm,
            ] : [],
            roots: [...lookupKeys, trueRoot, displayRoot],
        });
        // src 'none' => nothing curated covers this word. Show the ROOT'S OWN
        // PALEO in the gloss slot. An empty gloss reads as "this word was
        // ignored"; the root letters read as "no entry yet, and HERE is the form
        // to add" — and the root is not always recoverable by eye from the
        // surface, which carries prefixes and suffixes (𐤄𐤀𐤋𐤄𐤉𐤌 -> 𐤀𐤋𐤄𐤉𐤌).
        // No brackets: the old `[root]` was itself a fake gloss.
        const glossText = glossSrc === 'none'
            ? (trueRoot || displayRoot || originalRawPaleo || '')
            : finalTranslation;
        // (Removed 𐤀𐤋𐤄𐤉𐤌 → "god" hardcode — the gloss comes from the Strong's-keyed
        // homograph/lexicon lookup above, matching server.js. Add H430 → "god" to
        // that data if needed; no code special-case.)

        const rootComp = {
            paleo: rootDisplay,          // canonical root + kept surface modifications (reader)
            true_root: trueRoot,         // clean dictionary lemma (grouping / lookups)
            translit: '',
            translation: glossText,
            gloss_src: glossSrc,          // homograph | lexicon | heb-extra | kjv | none
            lemmaTranslit: getTranslit(trueRoot),
            css: isStandaloneException ? 'root' : getCssClass(pos),
            sn: normStrongs || null,
        };

        components = [
            ...(pfmObj ? [pfmObj] : []),
            ...(vbsObj ? [vbsObj] : []),
            rootComp,
            ...(bakedModObj ? [bakedModObj] : []),
            ...(vbeObj ? [vbeObj] : []),
            // Ending-absorption (kept in sync with server.js): drop the nominal
            // ending chip when the true root already carries those letters, so a
            // root-final ending (𐤀𐤋𐤄𐤉𐤌, 𐤔𐤌𐤉𐤌 …) renders once instead of doubling.
            ...(nmeObj && !(nmeObj.paleo && trueRoot && trueRoot.endsWith(nmeObj.paleo)) ? [nmeObj] : []),
            ...(uvfObj ? [uvfObj] : []),
            ...(prsObj ? [prsObj] : []),
        ];
    }

    transliterateBlock(components);
    const SUFFIX_CSS = ['nme-','prs-','vbe-','mod-suff-unk'];
    for (const comp of components) {
        if (!comp.translit) continue;
        const isSuffix = SUFFIX_CSS.some(p => comp.css && comp.css.startsWith(p));
        comp.translit = isSuffix
            ? comp.translit.toLowerCase()
            : comp.translit.charAt(0).toUpperCase() + comp.translit.slice(1);
    }

    const rootComp = components.find(c => c.css === 'root') || components[0];
    // root_paleo stays the CLEAN lemma so the Roots page still groups every inflected
    // form under one entry; rendered_paleo carries the full reader display (root +
    // modifications + suffixes).
    const root_paleo = rootComp ? (rootComp.true_root || rootComp.paleo) : rawPaleo;
    const rendered_paleo = components.map(c => c.paleo).join('');

    return { rendered_paleo, root_paleo, components };
}
module.exports = { parseToken };