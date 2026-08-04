// propose-name-strongs.mjs — for each untransliterated apocryphal name, PROPOSE its
// OT Strong's by finding an OT name whose transliteration/consonants match. You
// confirm each; nothing is auto-applied.
//
//   node propose-name-strongs.mjs           list proposals
//   node propose-name-strongs.mjs --write   append accepted-looking ones to a review file
//
// Method (deterministic, no guessing beyond consonant match):
//   1. collect capitalized words in ENG apocrypha (canon>=67) that AREN'T transliterated
//   2. for each, strip the Greek/Latin ending (-s,-as,-us,-os) to a stem
//   3. find OT names in word-map.json whose transliteration shares the stem's consonants
//   4. propose the best match WITH its Strong's — for you to confirm

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
let Database; ({ default: Database } = await import('better-sqlite3'));
const db = new Database('./corpus.db', { readonly: true });

const M = JSON.parse(readFileSync('./word-map.json','utf8'));
const otNames = { ...(M.names||{}), ...(M.peoples||{}) };   // name -> translit

// reverse: need each OT name's Strong's. Pull from web-strongs by finding the name's
// dominant SN (same as before but we only trust it for the NAME token itself).
const nameSN = new Map();
if (existsSync('./web-strongs.jsonl'))
  for (const line of readFileSync('./web-strongs.jsonl','utf8').split(/\r?\n/)) {
    if (!line) continue; const r = JSON.parse(line);
    for (const s of r.segments) { if (!s.sn) continue;
      const words = (s.text||'').trim().split(/\s+/);
      // only single-word name segments — avoids grabbing neighbors
      if (words.length <= 2) for (const m of s.text.matchAll(/\b([A-Z][a-zA-Z]+)\b/g)) {
        const k = m[1].toLowerCase();
        if (!nameSN.has(k)) nameSN.set(k, new Map());
        nameSN.get(k).set(s.sn, (nameSN.get(k).get(s.sn)||0)+1);
      }
    }
  }
const snOf = n => { const m = nameSN.get(n.toLowerCase()); return m ? [...m].sort((a,b)=>b[1]-a[1])[0][0] : null; };

const cons = w => w.toLowerCase().replace(/[^a-z]/g,'').replace(/[aeiou]/g,'');
const stem = w => w.replace(/(us|os|as|es|is|s)$/i,'');

// untransliterated apocryphal capitalized words
const rows = db.prepare("SELECT text FROM verses WHERE corpus='ENG' AND canon_id>=67 AND text<>''").all();
db.close();
const seen = new Map();
for (const r of rows) {
  const t = r.text.replace(/\([^)]*\)/g,'');
  for (const m of t.matchAll(/\b([A-Z][a-zA-Z]{2,})\b/g)) {
    const w = m[1], lw = w.toLowerCase();
    if (otNames[lw] || nameSN.has(lw)) continue;         // already handled
    seen.set(w, (seen.get(w)||0)+1);
  }
}

const proposals = [];
for (const [w, count] of [...seen].sort((a,b)=>b[1]-a[1])) {
  const target = cons(stem(w));
  if (target.length < 2) continue;
  // find an OT name whose consonants match
  let best = null;
  for (const [otn] of Object.entries(otNames)) {
    if (cons(otn) === target) { best = otn; break; }
  }
  if (best) {
    const sn = snOf(best);
    proposals.push({ variant: w, count, otName: best, sn: sn||'?', tr: otNames[best] });
  }
}

console.log(`untransliterated apocryphal names with an OT consonant-match: ${proposals.length}\n`);
console.log('  VARIANT        -> OT NAME      [Strong\'s]   translit    (occurrences)');
for (const p of proposals.slice(0, 50))
  console.log(`  ${p.variant.padEnd(14)}-> ${p.otName.padEnd(12)} [${String(p.sn).padStart(6)}]  ${String(p.tr).padEnd(12)} (${p.count})`);

console.log('\nThese are PROPOSALS by consonant match — confirm each before trusting.');
console.log('Add the correct ones to name-strongs.txt as "Variant -> H####".');
if (process.argv.includes('--write')) {
  const out = proposals.map(p => `# ${p.variant} -> ${p.otName}?  ${p.variant} -> ${p.sn}`).join('\n');
  writeFileSync('./name-strongs.proposed.txt', out+'\n');
  console.log('\n-> name-strongs.proposed.txt written (commented; uncomment the ones you accept).');
}
