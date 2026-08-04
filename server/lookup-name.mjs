// lookup-name.mjs — look up ONE name's candidate OT Strong's, so you can pin it in
// name-strongs.txt with confidence. Not a bulk guesser — a research aid for the name
// you're deciding on right now.
//
//   node lookup-name.mjs Zorobabel
//   node lookup-name.mjs Josias
//
// Shows: (1) exact OT-name matches by consonant, each WITH its Strong's and translit,
//        (2) what that Strong's renders as, so you confirm before pinning.

import { readFileSync, existsSync } from 'node:fs';
const q = process.argv[2];
if (!q) { console.error('usage: node lookup-name.mjs <Name>'); process.exit(1); }
let Database; ({ default: Database } = await import('better-sqlite3'));
const db = new Database('./corpus.db', { readonly: true });

const rootsPath = ['./lexicon/strongs-roots.json','./strongs-roots.json'].find(existsSync);
const ROOTS = rootsPath ? JSON.parse(readFileSync(rootsPath,'utf8')) : {};
// translit
let translit = x=>x;
try {
  const { readdirSync } = await import('node:fs');
  const { join, dirname, resolve } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const locate=(n,s=process.cwd(),u=4)=>{let b=resolve(s);for(let i=0;i<=u;i++){const st=[b];while(st.length){const d=st.pop();let es;try{es=readdirSync(d,{withFileTypes:true})}catch{continue}for(const e of es){if(e.isDirectory()){if(/^(node_modules|\.git|dist|build)$/.test(e.name))continue;st.push(join(d,e.name))}else if(e.name===n)return join(d,e.name)}}b=dirname(b)}return null};
  const bp=locate('books.js'); if(bp) translit=(await import(pathToFileURL(bp).href)).translit;
} catch {}

const cons = w => w.toLowerCase().replace(/[^a-z]/g,'').replace(/[aeiou]/g,'');
const qc = cons(q.replace(/(us|os|as|es|is|s)$/i,''));

// find every OT name (from tokens_bhs nmpr) whose consonants match, with its Strong's
const rows = db.prepare(`
  SELECT DISTINCT ('H'||REPLACE(strongs,'H','')) sn, word_raw
  FROM tokens_bhs WHERE pos='nmpr' AND strongs<>''
`).all();
db.close();

// also try to match on the ENGLISH gloss if present — but primary is consonant of translit
const seen = new Map();
for (const r of rows) {
  const pal = ROOTS[r.sn];
  if (!pal) continue;
  const tr = translit(pal);
  if (cons(tr) === qc || cons(tr).includes(qc) || qc.includes(cons(tr))) {
    if (!seen.has(r.sn)) seen.set(r.sn, tr);
  }
}

console.log(`\nname: "${q}"   (consonant skeleton: ${qc})\n`);
if (!seen.size) { console.log('  no OT nmpr Strong\'s matches those consonants.'); process.exit(0); }
console.log('  candidate Strong\'s (each rendered from its own root):');
for (const [sn, tr] of [...seen].sort((a,b)=>parseInt(a[0].slice(1))-parseInt(b[0].slice(1))))
  console.log(`     ${sn.padStart(7)}  ->  ${tr}`);
console.log('\n  Pick the correct one and add to name-strongs.txt:');
console.log(`     ${q} -> ${[...seen][0][0]}`);
