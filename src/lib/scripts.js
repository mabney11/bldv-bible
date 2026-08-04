/**
 * scripts.js — language-agnostic script detection for the reader.
 *
 * The app is a script-agnostic original-text reader: corpus.db is just tagged
 * verses, so what decides whether text renders correctly is not the *source*
 * (HEB / LXX / GEZ …) but the actual Unicode of the text. detectScript()
 * inspects the characters and returns how to render ANY block — its writing
 * system, base direction, a web-safe font stack, and a BCP-47 lang tag — so a
 * Syriac verse lays out RTL in Estrangela and an Old Church Slavonic verse lays
 * out LTR in a Cyrillic face, with no per-language reader code.
 *
 * Add a script here once and every text in it renders forever after.
 */

// Unicode blocks per script. [lo, hi] inclusive code-point ranges.
const RANGES = [
  ['hebrew',     [[0x0590, 0x05FF], [0xFB1D, 0xFB4F]]],
  ['arabic',     [[0x0600, 0x06FF], [0x0750, 0x077F], [0x08A0, 0x08FF], [0xFB50, 0xFDFF], [0xFE70, 0xFEFF]]],
  ['syriac',     [[0x0700, 0x074F], [0x0860, 0x086F]]],   // + Syriac Supplement
  ['samaritan',  [[0x0800, 0x083F]]],
  ['mandaic',    [[0x0840, 0x085F]]],
  ['thaana',     [[0x0780, 0x07BF]]],
  ['greek',      [[0x0370, 0x03FF], [0x1F00, 0x1FFF]]],
  ['coptic',     [[0x2C80, 0x2CFF], [0x03E2, 0x03EF]]],
  ['cyrillic',   [[0x0400, 0x04FF], [0x0500, 0x052F], [0x2DE0, 0x2DFF], [0xA640, 0xA69F]]], // Slavonic
  ['glagolitic', [[0x2C00, 0x2C5F], [0x1E000, 0x1E02F]]], // older Slavonic
  ['armenian',   [[0x0530, 0x058F], [0xFB13, 0xFB17]]],
  ['georgian',   [[0x10A0, 0x10FF], [0x1C90, 0x1CBF], [0x2D00, 0x2D2F]]],
  ['ethiopic',   [[0x1200, 0x137F], [0x1380, 0x139F], [0x2D80, 0x2DDF], [0xAB00, 0xAB2F]]], // Ge'ez
  ['gothic',     [[0x10330, 0x1034F]]],
  ['glagolitic2',[[0x2C00, 0x2C5F]]],
  ['latin',      [[0x0041, 0x024F], [0x1E00, 0x1EFF]]],
];

const RTL = new Set(['hebrew', 'arabic', 'syriac', 'samaritan', 'mandaic', 'thaana']);

// Web-safe font stacks. Noto faces are pulled in by scripts.css so a verse
// renders even when the OS lacks the font; local faces are listed first.
const FONT = {
  hebrew:     "'SBL Hebrew','Ezra SIL','Taamey Frank CLM','Noto Serif Hebrew',serif",
  arabic:     "'Scheherazade New','Amiri','Noto Naskh Arabic',serif",
  syriac:     "'Estrangelo Edessa','East Syriac Adiabene','Serto Jerusalem','Noto Sans Syriac',serif",
  samaritan:  "'Noto Sans Samaritan',serif",
  mandaic:    "'Noto Sans Mandaic',serif",
  thaana:     "'Noto Sans Thaana',sans-serif",
  greek:      "'New Athena Unicode','Cardo','Noto Serif',serif",
  coptic:     "'Antinoou','New Athena Unicode','Noto Sans Coptic',serif",
  cyrillic:   "'Ponomar Unicode','Monomakh Unicode','PT Serif','Noto Serif',serif",
  glagolitic: "'Ponomar Unicode','Noto Sans Glagolitic',serif",
  armenian:   "'Mshtakan','Noto Serif Armenian',serif",
  georgian:   "'BPG Nino Mtavruli','Noto Serif Georgian',serif",
  ethiopic:   "'Abyssinica SIL','Noto Sans Ethiopic',serif",
  gothic:     "'Noto Sans Gothic',serif",
  latin:      "'Cardo','Gentium Plus',Georgia,serif",
};

const LANG = {  // BCP-47 for the lang attribute (helps shaping + a11y)
  hebrew:'hbo', arabic:'ar', syriac:'syr', samaritan:'smp', mandaic:'mid',
  thaana:'dv', greek:'grc', coptic:'cop', cyrillic:'cu', glagolitic:'cu',
  armenian:'hy', georgian:'ka', ethiopic:'gez', gothic:'got', latin:'la',
};

/**
 * Detect the dominant script of a text run.
 * @returns {{script, dir, font, lang, rtl}}
 */
export function detectScript(text) {
  const counts = {};
  for (const ch of String(text || '')) {
    const cp = ch.codePointAt(0);
    for (const [name, ranges] of RANGES) {
      for (const [lo, hi] of ranges) {
        if (cp >= lo && cp <= hi) { counts[name] = (counts[name] || 0) + 1; break; }
      }
    }
  }
  // dominant non-Latin script wins (Latin is the fallback baseline)
  let best = 'latin', bestN = -1;
  for (const k in counts) {
    if (k === 'latin') continue;
    if (counts[k] > bestN) { best = k; bestN = counts[k]; }
  }
  if (bestN <= 0 && counts.latin) best = 'latin';
  const rtl = RTL.has(best);
  return { script: best, rtl, dir: rtl ? 'rtl' : 'ltr', font: FONT[best] || FONT.latin, lang: LANG[best] || '' };
}

export const SCRIPT_RTL = RTL;
export default detectScript;
