// tests/transliteration.test.cjs
//
// Unit tests for server/transliteration.cjs. Pure-function tests, no server
// boot required. Locks in known mappings:
//   - Greek standard transliteration including diphthongs and rough breathing
//   - Ge'ez Unicode-block-driven syllable transliteration
//   - Heuristic root extraction (accent-strip for Greek, consonant skeleton for Ge'ez)

'use strict';

const {
    transliterateWord,
    transliterateGreekWord,
    transliterateGeezWord,
    heuristicRoot,
} = require('../server/transliteration.cjs');

let passed = 0, failed = 0;
function check(label, expr, detail) {
    if (expr) { console.log('  ✓ ' + label); passed++; }
    else      { console.log('  ✗ ' + label + (detail ? '  — ' + detail : '')); failed++; }
}

// ── Greek transliteration ──────────────────────────────────────────────────
console.log('== Greek transliteration ==');
const greekCases = [
    ['Ἰησοῦς',   'iēsous',   'Jesus — rough breathing + iota + tonos'],
    ['Χριστός',  'christos', 'Christ'],
    ['ἐν',       'en',       'preposition'],
    ['ἀρχῇ',     'archē',    'beginning (dat) — iota subscript ignored'],
    ['θεός',     'theos',    'God — eta as ē'],
    ['λόγος',    'logos',    'word'],
    ['Ἀβραάμ',   'abraam',   'Abraham — initial smooth breathing'],
    ['Μωϋσῆς',   'mōysēs',   'Moses — omega as ō'],
    ['ἄνθρωπος', 'anthrōpos','human — anthros'],
    ['εἰς',      'eis',      'into — ei diphthong'],
    ['καί',      'kai',      'and — ai diphthong'],
    ['οὐρανός',  'ouranos',  'heaven — ou diphthong'],
    ['ψαλμός',   'psalmos',  'psalm — psi as ps'],
    ['ξύλον',    'xylon',    'wood — xi as x'],
];
for (const [input, expected, label] of greekCases) {
    const got = transliterateGreekWord(input);
    check(`${input} → ${expected}`, got === expected, `got "${got}"; ${label}`);
}

// ── Ge'ez transliteration ──────────────────────────────────────────────────
console.log('\n== Ge\'ez transliteration ==');
const geezCases = [
    ['ኢየሱስ',     'ʾiyäsus',     'Jesus — alif + ye + sa + sa (silent)'],
    ['እግዚአብሔር', 'ʾəgəziʾäbəḥer','Lord-God — compound'],
    ['ሰማይ',      'sämay',       'heaven — trailing schwa trimmed'],
    ['ምድር',      'mədər',       'earth — m-d-r'],
    ['አብርሃም',    'ʾäbərəham',   'Abraham'],
    ['ሙሴ',       'muse',        'Moses — clean two syllables'],
    ['ቤት',       'bet',         'house — be + t (silent)'],
    ['ወልድ',      'wäləd',       'son — non-final 6th-order schwa kept (only word-final ə dropped)'],
];
for (const [input, expected, label] of geezCases) {
    const got = transliterateGeezWord(input);
    check(`${input} → ${expected}`, got === expected, `got "${got}"; ${label}`);
}

// ── Heuristic root ─────────────────────────────────────────────────────────
console.log('\n== Heuristic root ==');
// Greek: accent-stripped + lowercase + final-sigma normalized
const greekRoots = [
    ['Ἰησοῦς', 'ιησουσ'],
    ['Χριστός', 'χριστοσ'],
    ['λόγος',  'λογοσ'],
    ['ἐν',     'εν'],
    ['ἀρχῇ',   'αρχη'],
    ['θεὸς',   'θεοσ'],   // grave → still maps to same accent-stripped form
];
for (const [input, expected] of greekRoots) {
    const got = heuristicRoot(input, 'greek');
    check(`root(${input}) → ${expected}`, got === expected, `got "${got}"`);
}

// Ge'ez: consonant skeleton (vowels dropped from transliteration)
const geezRoots = [
    ['ምድር',   'mdr'],
    ['ሰማይ',   'smy'],
    ['ሙሴ',    'ms'],
    ['ኢየሱስ',  'ʾyss'],
];
for (const [input, expected] of geezRoots) {
    const got = heuristicRoot(input, 'ethiopic');
    check(`root(${input}) → ${expected}`, got === expected, `got "${got}"`);
}

// ── Dispatch ───────────────────────────────────────────────────────────────
console.log('\n== Dispatch ==');
check('dispatch greek',     transliterateWord('Ἰησοῦς', 'greek')    === 'iēsous');
check('dispatch ethiopic',  transliterateWord('ኢየሱስ',   'ethiopic') === 'ʾiyäsus');
check('dispatch unknown passes through', transliterateWord('hello', 'klingon') === 'hello');
check('empty input → empty',  transliterateWord('', 'greek') === '');
check('null input → empty',   transliterateWord(null, 'greek') === '');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
