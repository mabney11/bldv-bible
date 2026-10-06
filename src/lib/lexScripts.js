// lexScripts.js — per-script letter sets + "which letter does this word file
// under" for the lexicon letter rails (admin page; the public page keeps its
// own copy of the Greek / Ge'ez sets).
import { PALEO_LETTERS } from './books.js';

export const GREEK_LETTERS = ['α','β','γ','δ','ε','ζ','η','θ','ι','κ','λ','μ','ν','ξ','ο','π','ρ','σ','τ','υ','φ','χ','ψ','ω'];
export const GEEZ_LETTERS  = ['ሀ','ለ','ሐ','መ','ሠ','ረ','ሰ','ሸ','ቀ','በ','ተ','ቸ','ኀ','ነ','ኘ','አ','ከ','ኸ','ወ','ዐ','ዘ','ዠ','የ','ደ','ጀ','ገ','ጠ','ጨ','ጰ','ጸ','ፀ','ፈ','ፐ'];
// Syriac base letters Alaph … Taw (22), by code point so nothing here depends
// on how the editor renders RTL text.
export const SYRIAC_LETTERS = [0x710,0x712,0x713,0x715,0x717,0x718,0x719,0x71A,0x71B,0x71D,0x71F,0x720,0x721,0x722,0x723,0x725,0x726,0x728,0x729,0x72A,0x72B,0x72C]
  .map(c => String.fromCharCode(c));
export const LATIN_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Drop combining marks (Greek accents/breathings, Latin diacritics, Syriac
// points) so "ἕκτῃ" files under ε and "Istæ" under I.
export const stripMarks = s =>
  String(s || '').normalize('NFD').replace(/[\u0300-\u036f\u0483-\u0489\u0730-\u074a]/g, '');

export function letterSet(script) {
  switch (script) {
    case 'paleo':  return PALEO_LETTERS;
    case 'greek':  return GREEK_LETTERS;
    case 'geez':   return GEEZ_LETTERS;
    case 'syriac': return SYRIAC_LETTERS;
    case 'latin':  return LATIN_LETTERS;
    default:       return [];
  }
}

// The rail letter a word belongs to, or null when it has none.
export function firstLetter(script, word) {
  const w = String(word || '');
  if (!w) return null;
  switch (script) {
    case 'paleo': {
      const c = [...w][0];
      return PALEO_LETTERS.includes(c) ? c : null;
    }
    case 'greek': {
      let c = (stripMarks(w)[0] || '').toLowerCase();
      if (c === '\u03c2') c = '\u03c3';           // final sigma -> sigma
      return GREEK_LETTERS.includes(c) ? c : null;
    }
    case 'geez': {
      const code = [...w][0].codePointAt(0);
      if (code >= 0x1200 && code <= 0x137F) {
        const base = String.fromCodePoint(code - (code % 8));
        return GEEZ_LETTERS.includes(base) ? base : null;
      }
      return null;
    }
    case 'syriac': {
      const c = [...w][0];
      return SYRIAC_LETTERS.includes(c) ? c : null;
    }
    case 'latin': {
      const c = (stripMarks(w)[0] || '').toUpperCase();
      return LATIN_LETTERS.includes(c) ? c : null;
    }
    default: return null;
  }
}
