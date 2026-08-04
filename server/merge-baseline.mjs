// merge-baseline.mjs — combine the new OT baseline with the recovered NT, so a
// single english-baseline.jsonl covers all 66 books and a reset can't delete anything.
//
//   node merge-baseline.mjs
//
// WHY THIS EXISTS
//   apply-web-strongs.mjs only covers the books web-strongs.jsonl holds — Genesis to
//   Malachi, because the fetch was run without --all. Loading that with
//   --reset-baseline deleted the entire New Testament. This stitches the two together
//   BEFORE loading, so the file being loaded is complete and the reset is safe.
//
//   --ot   the new OT baseline from apply-web-strongs.mjs  (default english-baseline.jsonl)
//   --nt   the recovered NT baseline                       (default english-nt-baseline.jsonl)
//   --out  the merged file                                 (default english-baseline.jsonl)
//
// Books present in --ot win. Books only in --nt are carried over untouched, keeping
// the transliteration they already had (Yashawai Mashayach, Yarawashalam, Dawad).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const argv = (f,d) => { const i = process.argv.indexOf(f); return i>=0 ? process.argv[i+1] : d; };
const OT = argv('--ot','./english-baseline.jsonl');
const NT = argv('--nt','./english-nt-baseline.jsonl');
const OUT = argv('--out','./english-baseline.jsonl');
const die = m => { console.error('\u2717 '+m); process.exit(1); };
for (const f of [OT, NT]) if (!existsSync(f)) die('not found: '+f);

const read = f => readFileSync(f,'utf8').split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l));
const ot = read(OT), nt = read(NT);
const otCodes = new Set(ot.map(r=>r.code));
const carried = nt.filter(r => !otCodes.has(r.code));

const merged = [...ot, ...carried];
console.log(`OT baseline : ${ot.length.toLocaleString()} verses, ${otCodes.size} books`);
console.log(`carried over: ${carried.length.toLocaleString()} verses, ${new Set(carried.map(r=>r.code)).size} books`);
console.log(`merged      : ${merged.length.toLocaleString()} verses, ${new Set(merged.map(r=>r.code)).size} books`);

const NTC = ['MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH',
             '1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV'];
const missing = NTC.filter(c => !merged.some(r => r.code === c));
if (missing.length) die(`NT books STILL missing after merge: ${missing.join(' ')}`);

writeFileSync(OUT, merged.map(r=>JSON.stringify(r)).join('\n')+'\n');
console.log(`\n\u2713 ${OUT} — all 66 books. --reset-baseline is safe with this file.`);
