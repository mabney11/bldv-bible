const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const CORPUS = path.join(__dirname, 'corpus.db');
const OVERRIDES_PATH = path.join(__dirname, 'lexicon', 'strongs-location-overrides.json');

const db = new Database(CORPUS, { readonly: true });
const rows = db.prepare(`
  SELECT book_id, chapter, verse, token_ordinal, word_raw
  FROM tokens_nt
  WHERE word_raw LIKE '%𐤁𐤍%𐤀𐤋𐤄𐤉𐤌%'
`).all();

// Every paleo letter is a UTF-16 SURROGATE PAIR (Supplementary Multilingual
// Plane) — plain string .slice()/.length operate on UTF-16 code UNITS, not
// letters, so mixing them with [...str].length (which correctly counts code
// points) silently corrupts any slice by a factor of 2. Working entirely in
// code-point ARRAYS here sidesteps the whole bug class, same fix applied to
// matresEquivalent() in heb-align.js earlier tonight.
const cp = s => [...s];
const BEN = cp('𐤁𐤍'), HA = cp('𐤄'), ELOHIM = cp('𐤀𐤋𐤄𐤉𐤌');
const startsWithCP = (arr, prefix) => prefix.every((c, i) => arr[i] === c);
const eqCP = (a, b) => a.length === b.length && a.every((c, i) => b[i] === c);

const PREFIXES = [
  { letters: cp('𐤀𐤕'), strongs: 'H853', gloss: 'entirety' },  // Eth, direct-object marker
  { letters: cp('𐤋'),   strongs: '',     gloss: 'to' },        // Le
];

// Ben[Ha]Elohim is a CONSTRUCT relationship — "son OF God" — not two
// independent standalone words. Elohim is the head (css 'root', unbracketed,
// the gloss shown), Ben modifies it (css 'mod-cstr', bracketed, same shape
// as any other prefix+root word in the app), Ha/article is a normal fused
// article (css 'mod-art', bracketed). This mirrors how "(Alahayam [son, the])"
// should read, matching every other prefixed word's rendering convention.
function decompose(word) {
  let rest = cp(word);
  const parts = [];

  if (rest[0] === '𐤁' && rest[1] === '𐤁') {
    parts.push({ paleo: '𐤁', strongs: '', gloss: 'in', css: 'mod-prep' });
    rest = rest.slice(1);
  } else {
    for (const p of PREFIXES) {
      if (startsWithCP(rest, p.letters) && !startsWithCP(rest, BEN)) {
        parts.push({ paleo: p.letters.join(''), strongs: p.strongs, gloss: p.gloss, css: 'mod-prep' });
        rest = rest.slice(p.letters.length);
        break;
      }
    }
  }

  if (!startsWithCP(rest, BEN)) return null;
  parts.push({ paleo: BEN.join(''), strongs: 'H1121', gloss: 'son', css: 'mod-cstr' });
  rest = rest.slice(BEN.length);

  if (rest[0] === HA[0]) {
    parts.push({ paleo: HA.join(''), strongs: '', gloss: 'the', css: 'mod-art' });
    rest = rest.slice(HA.length);
  }

  if (!eqCP(rest, ELOHIM)) return null;
  parts.push({ paleo: ELOHIM.join(''), strongs: 'H430', gloss: 'Alahayam', css: 'root' });

  return parts;
}

const raw = JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8'));
let added = 0, skipped = 0;

for (const r of rows) {
  const key = `${r.book_id}:${r.chapter}:${r.verse}:${r.token_ordinal}`;
  const parts = decompose(r.word_raw);
  if (!parts) {
    console.log(`SKIP (unexpected shape, needs manual review): ${key}  word_raw=${r.word_raw}`);
    skipped++;
    continue;
  }

  raw[key] = {
    strongs: parts.filter(p => p.strongs).map(p => p.strongs).join('＋'),
    word_raw: r.word_raw,
    parts,
    note: 'Ben + [prefix/article] + Elohim — construct compound, Elohim is head. Auto-generated.',
  };
  added++;
  console.log(`SET: ${key}  word_raw=${r.word_raw}  parts=${parts.map(p => `${p.paleo}(${p.css})`).join('+')}`);
}

// Also fix up the 3 hand-added Ban-Al (H1121＋H410) entries from earlier
// tonight, which used the OLD equal-roots-with-maqaf convention — bring them
// to the same construct-modifier convention for consistency.
for (const [key, ov] of Object.entries(raw)) {
  if (key === '_comment') continue;
  if (!Array.isArray(ov.parts) || ov.parts.length !== 2) continue;
  const [a, b] = ov.parts;
  if (a.strongs === 'H1121' && b.strongs === 'H410' && a.css !== 'mod-cstr') {
    ov.parts = [
      { paleo: a.paleo, strongs: 'H1121', gloss: 'son', css: 'mod-cstr' },
      { paleo: b.paleo, strongs: 'H410', gloss: 'Alahayam', css: 'root' },
    ];
    ov.note = (ov.note || '') + ' [css convention updated to construct-modifier]';
    console.log(`UPDATED (Ban-Al convention fix): ${key}`);
    added++;
  }
}

fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(raw, null, 2), 'utf8');
console.log(`\n${added} override(s) set/updated, ${skipped} skipped. Written to ${OVERRIDES_PATH}`);
