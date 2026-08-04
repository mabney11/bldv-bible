// sqToPaleo.js — convert square/pointed Hebrew to paleo (U+10900–10915).
//
// Built on the app's own PALEO_LETTERS (from books.js), so it stays in lockstep
// with how the app already renders and transliterates paleo. Strips niqqud and
// cantillation, folds final forms (ך ם ן ף ץ) to their base, and maps each
// consonant positionally. Idempotent: characters that are already paleo (or are
// spaces/punctuation/latin) pass through unchanged, so it's safe to run on text
// that's a mix of square and paleo, or twice.
//
// Square Hebrew is kept elsewhere as the match/verification field — this is the
// display form only.

import { PALEO_LETTERS } from './books.js';

// square consonants in alphabet order — identical ordering to PALEO_LETTERS
const SQUARE = ['א','ב','ג','ד','ה','ו','ז','ח','ט','י','כ','ל','מ','נ','ס','ע','פ','צ','ק','ר','ש','ת'];
const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const MAP = {};
SQUARE.forEach((s, i) => { MAP[s] = PALEO_LETTERS[i]; });

export function sqToPaleo(text) {
  if (!text) return text;
  let out = '';
  for (const ch of text.normalize('NFC')) {
    if (ch >= '\u0591' && ch <= '\u05C7') continue;   // niqqud + cantillation + maqaf/sof-pasuq
    out += MAP[FINALS[ch] || ch] || ch;               // map consonant, else pass through (paleo/space/latin)
  }
  return out;
}

export default sqToPaleo;
