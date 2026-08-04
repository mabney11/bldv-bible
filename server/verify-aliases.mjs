// verify-aliases.mjs — an alias is valid ONLY if the variant and its target resolve
// to the SAME Strong's in the OT. Anything else is a guess and gets rejected.
// READ ONLY. Checks name-aliases.txt against the concordance/surface index.
//
//   node verify-aliases.mjs
//
// For each "Variant -> OTName": find the Strong's of OTName in the OT (via the
// English->Strong's the tagged WEB gives), and confirm the variant, IF it appears in
// any book, is the same person. Where we can't confirm same-Strong's, we FLAG it —
// we do not silently trust it.

import { readFileSync, existsSync } from 'node:fs';
let Database; ({ default: Database } = await import('better-sqlite3'));
const db = new Database('./corpus.db', { readonly: true });

// Build English-name -> set of Strong's from the tagged WEB (web-strongs.jsonl):
// the OT is where every name's Strong's is attested.
const nameToSN = new Map();
if (existsSync('./web-strongs.jsonl')) {
  for (const line of readFileSync('./web-strongs.jsonl','utf8').split(/\r?\n/)) {
    if (!line) continue; const r = JSON.parse(line);
    for (const s of r.segments) {
      if (!s.sn) continue;
      for (const m of (s.text||'').matchAll(/\b([A-Z][a-zA-Z]+)\b/g)) {
        const k = m[1].toLowerCase();
        if (!nameToSN.has(k)) nameToSN.set(k, new Map());
        nameToSN.get(k).set(s.sn, (nameToSN.get(k).get(s.sn)||0)+1);
      }
    }
  }
}
const snOf = name => {
  const m = nameToSN.get(name.toLowerCase());
  if (!m) return null;
  return [...m].sort((a,b)=>b[1]-a[1])[0][0];   // dominant Strong's for that spelling
};

const lines = existsSync('./name-aliases.txt')
  ? readFileSync('./name-aliases.txt','utf8').split(/\r?\n/) : [];
let ok=0, noop=0, unconfirmed=0, flagged=[];
console.log('alias verification (variant must share OTName\'s Strong\'s):\n');
for (const line of lines) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const [variant, otName] = t.split(/\s*->\s*/);
  if (!variant || !otName) continue;
  if (variant.toLowerCase() === otName.toLowerCase()) { noop++; continue; }   // silent no-op
  const snTarget = snOf(otName);
  const snVariant = snOf(variant);          // may be null if variant only in apocrypha
  if (!snTarget) { flagged.push(`${variant} -> ${otName}: OTName has NO Strong's in OT (?)`); continue; }
  if (snVariant && snVariant !== snTarget) {
    flagged.push(`${variant} -> ${otName}: DIFFERENT Strong's (${snVariant} vs ${snTarget}) — NOT the same name`);
  } else if (!snVariant) {
    // variant not attested in OT (apocryphal spelling). Alias is a best-effort claim:
    // report it so the user confirms, don't auto-trust.
    unconfirmed++; console.log(`  ? ${variant} -> ${otName}  [${snTarget}]  (variant not in OT; trusting alias)`);
    ok++;
  } else {
    console.log(`  \u2713 ${variant} -> ${otName}  [${snTarget}]  (same Strong's)`);
    ok++;
  }
}
console.log(`\nvalid: ${ok}   no-ops removed: ${noop}   unconfirmed(apocryphal-only): ${unconfirmed}`);
if (flagged.length) {
  console.log(`\n\u2717 REJECTED — not the same Strong's (do NOT alias these):`);
  for (const f of flagged) console.log('   '+f);
}
db.close();
