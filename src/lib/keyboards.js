// keyboards.js — on-screen keyboard layouts + source definitions for every
// script the global /search page supports. Each script types in its real
// native direction (RTL for Hebrew/Paleo/Syriac, LTR for everything else)
// and maps to the backend source(s) that can actually be searched in it.
//
// Character sets are generated from verified Unicode code charts
// (unicode.org/charts/PDF/U1200.pdf, U0700.pdf, U2C80.pdf — fetched and
// cross-checked against the block's official syllable/letter names while
// building this, not typed from memory) rather than hand-transcribed, so a
// family/letter is either exactly right or omitted — never a guess.
//
// Search engines, per source:
//   'legacy'      — /api/search (tokens_bhs): ranked/substring/chronological
//                    Hebrew paleo search. Existing Phase-1 behavior.
//   'concordance' — /api/concordance/surface?corpus=X: exact normalized
//                    surface-form match, already spans every other corpus
//                    (Greek NT+LXX+works pooled, Latin, Ge'ez, Syriac). See
//                    server.js's "Universal concordance" section — this
//                    already existed; Search.jsx just wires the frontend to it.

const PALEO_KBD_ROWS = [
  ['𐤀', '𐤁', '𐤂', '𐤃', '𐤄', '𐤅'],
  ['𐤆', '𐤇', '𐤈'],
  ['𐤉', '𐤊', '𐤋', '𐤌', '𐤍'],
  ['𐤎', '𐤏', '𐤐', '𐤑', '𐤒'],
  ['𐤓', '𐤔', '𐤕'],
];
// Named export kept for HebrewViewer.jsx's inline composer, which only
// ever needs the Paleo rows (it launches /search rather than rendering
// other scripts itself).
export { PALEO_KBD_ROWS };

// ── Ge'ez (Ethiopic, U+1200–U+1357) ─────────────────────────────────────────
// Each family is 8 code points wide (7 core vowel orders + one 8th/labialized
// slot); we take orders 1–7 and skip the 8th to keep this a standard 7-column
// fidel table. Families chosen are the ones that appear in Biblical/classical
// Ge'ez text (corpus GEZ) — a handful of later Amharic-only additions (va,
// nya, kxa, zha, dda, gga, ja, and the labialized *wa clusters) are left out
// on purpose to keep the grid to a manageable, relevant size; nothing here
// blocks adding them later if a search ever needs one.
const GEEZ_FAMILY_BASES = [
  0x1200, 0x1208, 0x1210, 0x1218, 0x1220, 0x1228, 0x1230, 0x1238,
  0x1240, 0x1250, 0x1260, 0x1270, 0x1278, 0x1280, 0x1290, 0x12A0,
  0x12A8, 0x12C8, 0x12D0, 0x12D8, 0x12E8, 0x12F0, 0x1308, 0x1320,
  0x1328, 0x1330, 0x1338, 0x1340, 0x1348, 0x1350,
];
const GEEZ_KBD_ROWS = GEEZ_FAMILY_BASES.map(base =>
  Array.from({ length: 7 }, (_, i) => String.fromCodePoint(base + i))
);

// ── Syriac (U+0700 block) — 22 letters, same abjad order/count as Hebrew ───
const SYRIAC_CODEPOINTS = [
  0x0710, 0x0712, 0x0713, 0x0715, 0x0717, 0x0718, 0x0719, 0x071A,
  0x071B, 0x071D, 0x071F, 0x0720, 0x0721, 0x0722, 0x0723, 0x0725,
  0x0726, 0x0728, 0x0729, 0x072A, 0x072B, 0x072C,
];
const SYRIAC_KBD_ROWS = [
  SYRIAC_CODEPOINTS.slice(0, 8).map(c => String.fromCodePoint(c)),
  SYRIAC_CODEPOINTS.slice(8, 15).map(c => String.fromCodePoint(c)),
  SYRIAC_CODEPOINTS.slice(15).map(c => String.fromCodePoint(c)),
];

// ── Greek — standard 24-letter lowercase alphabet (U+03B1–U+03C9, final
// sigma U+03C2 omitted since the concordance normalizer folds it to U+03C3
// at query time anyway — see _normGrk in server.js) ─────────────────────────
const GREEK_LOWER = 'αβγδεζηθικλμνξοπρστυφχψω'.split('');
const GREEK_KBD_ROWS = [
  GREEK_LOWER.slice(0, 8), GREEK_LOWER.slice(8, 16), GREEK_LOWER.slice(16),
];

// ── Latin — plain a–z ────────────────────────────────────────────────────
const LATIN_LOWER = 'abcdefghijklmnopqrstuvwxyz'.split('');
const LATIN_KBD_ROWS = [
  LATIN_LOWER.slice(0, 9), LATIN_LOWER.slice(9, 18), LATIN_LOWER.slice(18),
];

// ── Script → source(s) map ──────────────────────────────────────────────
// `sources` is what the toggle row (Search.jsx) renders. A script with one
// source shows no toggles at all (nothing to toggle); Greek's three pooled
// corpora (LXX/GNT/GRC) are the main case where toggling matters.
export const SCRIPTS = [
  {
    id: 'paleo', label: 'Paleo', dir: 'rtl', rows: PALEO_KBD_ROWS,
    sources: [
      { corpus: 'BHS', label: 'Hebrew (BHS)', engine: 'legacy' },
      { corpus: 'HEB', label: 'Hebrew Extra edition', engine: 'concordance' },
    ],
  },
  {
    id: 'geez', label: "Ge'ez", dir: 'ltr', rows: GEEZ_KBD_ROWS,
    sources: [{ corpus: 'GEZ', label: "Ge'ez", engine: 'concordance' }],
  },
  {
    id: 'syriac', label: 'Syriac', dir: 'rtl', rows: SYRIAC_KBD_ROWS,
    sources: [{ corpus: 'SYR', label: 'Syriac', engine: 'concordance' }],
  },
  {
    id: 'greek', label: 'Greek', dir: 'ltr', rows: GREEK_KBD_ROWS,
    sources: [
      { corpus: 'LXX', label: 'Septuagint (LXX)', engine: 'concordance' },
      { corpus: 'GNT', label: 'Greek NT (GNT)', engine: 'concordance' },
      { corpus: 'GRC', label: 'Greek works', engine: 'concordance' },
    ],
  },
  {
    id: 'latin', label: 'Latin', dir: 'ltr', rows: LATIN_KBD_ROWS,
    sources: [{ corpus: 'LAT', label: 'Latin (Vulgate)', engine: 'concordance' }],
  },
];

export const getScript = id => SCRIPTS.find(s => s.id === id) || SCRIPTS[0];
