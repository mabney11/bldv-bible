// find-untransliterated.mjs — READ ONLY. Find English proper nouns in the applied
// corpus that did NOT get transliterated: words with J (no J in Hebrew), plus known
// archaic/Greek name endings, that still appear capitalized in ENG verses.
//
//   node find-untransliterated.mjs           ranked list of untransliterated names
//   node find-untransliterated.mjs --book 81 one book
//
// It cross-checks against word-map.json: a name here means the map either lacks that
// spelling (Josias vs Josiah) or the word never mapped. These are the gaps to fix.

import { existsSync, readFileSync } from 'node:fs';
const args = process.argv.slice(2);
const BOOK = args.includes('--book') ? +args[args.indexOf('--book')+1] : null;
let Database; ({ default: Database } = await import('better-sqlite3'));
const db = new Database('./corpus.db', { readonly: true });

const map = existsSync('./word-map.json') ? JSON.parse(readFileSync('./word-map.json','utf8')) : {};
const known = new Set([...Object.keys(map.names||{}), ...Object.keys(map.peoples||{}),
                       ...Object.keys(map.divine||{}), ...Object.keys(map.terms||{})]);

const rows = db.prepare(`SELECT canon_id, code, text FROM verses WHERE corpus='ENG'
  AND text IS NOT NULL AND TRIM(text)<>'' ${BOOK?'AND canon_id=?':''}`).all(...(BOOK?[BOOK]:[]));
db.close();

// a suspect = capitalized word containing J, OR a capitalized word not in the map that
// isn't already a transliteration (transliterations are lowercase-in-paren-glossed or
// known name forms). Focus on the clear tell: the letter J, plus 'Lord'/'God' leaks.
const suspects = new Map();   // word -> count
const JRE = /\b([A-Z][a-zA-Z]*)\b/g;
for (const r of rows) {
  // skip anything already inside a gloss paren
  const t = r.text.replace(/\([^)]*\)/g, '');
  let m;
  while ((m = JRE.exec(t))) {
    const w = m[1];
    const lw = w.toLowerCase();
    if (/j/i.test(w) || lw === 'lord' || lw === 'god' || lw === 'jesus') {
      if (!known.has(lw)) suspects.set(w, (suspects.get(w)||0)+1);
    }
  }
}

const sorted = [...suspects].sort((a,b)=>b[1]-a[1]);
console.log(`untransliterated proper nouns (contain J, or Lord/God): ${sorted.length} distinct\n`);
for (const [w,n] of sorted.slice(0, 60)) console.log(`   ${String(n).padStart(4)}  ${w}`);
if (sorted.length > 60) console.log(`   … and ${sorted.length-60} more`);
console.log('\nThese need OT-spelling aliases (Josias->Josiah) or explicit map entries.');
