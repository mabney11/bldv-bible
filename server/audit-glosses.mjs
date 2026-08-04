// audit-glosses.mjs — show every distinct "translit (gloss)" pair in a book, and flag
// inconsistency: the same gloss word mapped to different transliterations, or the same
// translit given different glosses. That's the "all over the place" problem.
//
//   node audit-glosses.mjs 81            1 Esdras (by canon_id)
//   node audit-glosses.mjs --code 1_ESDRAS
//   node audit-glosses.mjs 81 --all      list every pair, not just conflicts

import { existsSync } from 'node:fs';
const args = process.argv.slice(2);
const ALL = args.includes('--all');
let where, param;
if (args.includes('--code')) { where='code=?'; param=args[args.indexOf('--code')+1]; }
else { where='canon_id=?'; param=+args[0]; }
let Database; ({ default: Database } = await import('better-sqlite3'));
const db = new Database('./corpus.db', { readonly: true });
const rows = db.prepare(`SELECT text FROM verses WHERE corpus='ENG' AND ${where} AND text<>''`).all(param);
db.close();

// collect translit (gloss) pairs
const glossToTr = new Map();   // gloss -> Map(translit -> count)
const trToGloss = new Map();   // translit -> Map(gloss -> count)
let total = 0;
for (const r of rows) {
  for (const m of r.text.matchAll(/([A-Za-z']+)\s*\(([^)]+)\)/g)) {
    const tr = m[1].toLowerCase(), gloss = m[2].toLowerCase().trim();
    if (!/^[a-z]/.test(tr)) continue;
    total++;
    if (!glossToTr.has(gloss)) glossToTr.set(gloss, new Map());
    glossToTr.get(gloss).set(tr, (glossToTr.get(gloss).get(tr)||0)+1);
    if (!trToGloss.has(tr)) trToGloss.set(tr, new Map());
    trToGloss.get(tr).set(gloss, (trToGloss.get(tr).get(gloss)||0)+1);
  }
}

console.log(`${param}: ${total} glossed tokens, ${glossToTr.size} distinct glosses, ${trToGloss.size} distinct translits\n`);

// CONFLICT 1: one English gloss -> multiple transliterations (the real inconsistency)
const gConflicts = [...glossToTr].filter(([g,m]) => m.size > 1);
console.log(`GLOSS -> MULTIPLE TRANSLITERATIONS (same English word, different Hebrew): ${gConflicts.length}`);
for (const [g,m] of gConflicts.sort((a,b)=>b[1].size-a[1].size).slice(0, ALL?999:25)) {
  const forms = [...m].sort((a,b)=>b[1]-a[1]).map(([t,n])=>`${t}×${n}`).join(', ');
  console.log(`   "${g}"  ->  ${forms}`);
}

// CONFLICT 2: one translit -> multiple glosses (often fine, but flag big spreads)
const tConflicts = [...trToGloss].filter(([t,m]) => m.size > 2);
console.log(`\nTRANSLIT -> MANY GLOSSES (same Hebrew, 3+ English words): ${tConflicts.length}`);
for (const [t,m] of tConflicts.sort((a,b)=>b[1].size-a[1].size).slice(0, ALL?999:15)) {
  const forms = [...m].sort((a,b)=>b[1]-a[1]).map(([g,n])=>`${g}×${n}`).join(', ');
  console.log(`   ${t}  ->  ${forms}`);
}
