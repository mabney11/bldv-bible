// inspect-invariants.mjs — categorize the [strongs↔root] invariant violations so we
// can tell real breakage from benign prefix-elision, WITHOUT changing anything.
//
//   node inspect-invariants.mjs            summary by category
//   node inspect-invariants.mjs --list N   show N examples per category
//   node inspect-invariants.mjs --sn H559  everything about one Strong's
//
// WHAT A VIOLATION IS (from build-surface-index.js):
//   a surface's Strong's SN has a canonical lemma (strongs-roots.json[SN]) that
//   differs from the surface's parsed root_paleo, past even the first letter.
//
// WHY MOST ARE PROBABLY BENIGN:
//   Hebrew prefixes (be-, le-, wa-, mi-) and I-aleph/I-nun/I-yod verbs eat the first
//   radical off the written form, so the PARSED root legitimately starts with a
//   different letter than the dictionary lemma. The build's display path already
//   handles this (isRootSubsequence); the raw counter does not, so it over-reports.
//   This tool separates "parsed root is a subsequence of the lemma" (benign) from
//   "parsed root shares nothing with the lemma" (a real wrong-SN, worth fixing).

import { existsSync } from 'node:fs';
const args = process.argv.slice(2);
const argv = (f,d) => { const i = args.indexOf(f); return i>=0 ? args[i+1] : d; };
const LIST = args.includes('--list') ? Number(argv('--list', 5)) : 0;
const ONE_SN = argv('--sn', null);
const die = m => { console.error('\u2717 '+m); process.exit(1); };

let Database;
try { ({ default: Database } = await import('better-sqlite3')); }
catch { die('better-sqlite3 not found — run from server/'); }
for (const f of ['./surface-index.db','./corpus.db']) if (!existsSync(f)) die(f+' not found');

// load strongs-roots.json (lemma per SN) the same way the build does
import { readFileSync } from 'node:fs';
const rootsPath = ['./lexicon/strongs-roots.json','./strongs-roots.json'].find(existsSync);
if (!rootsPath) die('strongs-roots.json not found');
const ROOTS = JSON.parse(readFileSync(rootsPath,'utf8'));
const normH = h => h ? 'H'+String(h).replace(/^H+/,'') : '';

// subsequence test: is a a letter-elided subsequence of b? (𐤌𐤓 ⊂ 𐤀𐤌𐤓)
const isSubseq = (a, b) => {
  let i = 0; for (const ch of b) if (i < a.length && a[i] === ch) i++;
  return i === a.length;
};

const db = new Database('./surface-index.db', { readonly: true });
// pull the surfaces with their root and SN
let rows;
try {
  rows = db.prepare(`SELECT word_raw, root_paleo, strongs FROM token_surfaces`).all();
} catch (e) { die('could not read token_surfaces: '+e.message); }

const cats = { prefixElided: [], suffixOrMutation: [], firstLetterOnly: [], unrelated: [], noLemma: [] };
let total = 0, clean = 0;
for (const r of rows) {
  const sx = normH(r.strongs);
  if (!sx || parseInt(sx.slice(1),10) >= 9000) continue;   // virtual/blank skip
  const lemma = ROOTS[sx];
  if (!lemma || !r.root_paleo) { continue; }
  if (lemma === r.root_paleo) { clean++; continue; }
  const L = [...lemma], R = [...r.root_paleo];
  if (L[0] === R[0]) { continue; }        // build counts only first-letter-different as violation
  total++;
  const rec = { word: r.word_raw, root: r.root_paleo, sn: sx, lemma };
  if (isSubseq(R, L))                cats.prefixElided.push(rec);      // 𐤌𐤓 ⊂ 𐤀𐤌𐤓 — benign
  else if (isSubseq(L, R))           cats.suffixOrMutation.push(rec);  // lemma ⊂ root — added letters
  else if (R.some(c => L.includes(c))) cats.firstLetterOnly.push(rec); // share letters, diff order
  else                               cats.unrelated.push(rec);         // share nothing — real problem
}

console.log(`token_surfaces: ${rows.length.toLocaleString()}`);
console.log(`invariant-clean (lemma === root or same first letter): counted by build as OK`);
console.log(`invariant violations (first letter differs): ${total.toLocaleString()}\n`);

const show = (name, arr, note) => {
  console.log(`  ${name.padEnd(20)} ${String(arr.length).padStart(5)}   ${note}`);
  if (LIST) for (const r of arr.slice(0, LIST))
    console.log(`        ${r.word}   root ${r.root}   ${r.sn}   lemma ${r.lemma}`);
};
console.log('BY CATEGORY (most benign first):');
show('prefix-elided', cats.prefixElided, 'root ⊂ lemma — a prefix ate radical 1. BENIGN.');
show('mutation/added', cats.suffixOrMutation, 'lemma ⊂ root — surface added letters. usually benign.');
show('reordered', cats.firstLetterOnly, 'share letters, different order. inspect.');
show('unrelated', cats.unrelated, 'root and lemma share NOTHING — wrong SN. REAL.');

console.log(`\nThe "unrelated" bucket is the one that matters: ${cats.unrelated.length} of ${total}.`);
if (cats.unrelated.length && !LIST) console.log('Re-run with --list 20 to see them.');

if (ONE_SN) {
  const sn = normH(ONE_SN);
  console.log(`\n── all surfaces for ${sn} (lemma ${ROOTS[sn]||'?'}) ──`);
  for (const r of rows.filter(x => normH(x.strongs) === sn).slice(0, 40))
    console.log(`   ${r.word_raw}   root ${r.root_paleo}`);
}
db.close();
