// hebrewPaleo.js — convert modern (square/Aramaic) Hebrew Unicode to Paleo-Hebrew.
//
// The app is a Paleo-Hebrew reader: modern Hebrew should never render. The BHS
// pipeline is already paleo-native, but corpus sources (e.g. Hebrew-extra) store
// square Hebrew text, so any reader/tool that shows those tokens must convert.
//
// Mapping: the 22 consonants map 1:1 onto the Phoenician/Paleo block
// (U+10900–U+10915, the same code points lib/books.js PALEO_LETTERS uses); the
// five final forms fold to their base letter; vowel points and cantillation
// (niqqud / te'amim, U+0591–U+05C7) are dropped; everything else passes through.

const HEB_BASE  = 'אבגדהוזחטיכלמנסעפצקרשת';                 // alef … tav (22)
const PALEO     = [...'𐤀𐤁𐤂𐤃𐤄𐤅𐤆𐤇𐤈𐤉𐤊𐤋𐤌𐤍𐤎𐤏𐤐𐤑𐤒𐤓𐤔𐤕']; // U+10900 … U+10915
const FINALS    = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

const HEB_TO_PALEO = {};
[...HEB_BASE].forEach((h, i) => { HEB_TO_PALEO[h] = PALEO[i]; });
for (const [fin, base] of Object.entries(FINALS)) HEB_TO_PALEO[fin] = HEB_TO_PALEO[base];

// True if the string contains any square-Hebrew consonant worth converting.
export function isModernHebrew(s) {
  for (const ch of String(s || '')) if (HEB_TO_PALEO[ch]) return true;
  return false;
}

// Convert square Hebrew → Paleo-Hebrew. Drops niqqud/te'amim; leaves any
// already-paleo glyphs, spaces and punctuation untouched. Idempotent.
export function toPaleo(s) {
  let out = '';
  for (const ch of String(s || '')) {
    if (HEB_TO_PALEO[ch]) { out += HEB_TO_PALEO[ch]; continue; }
    const cp = ch.codePointAt(0);
    if (cp >= 0x0591 && cp <= 0x05C7) continue;   // niqqud / cantillation / meteg
    out += ch;
  }
  return out;
}

export default toPaleo;
