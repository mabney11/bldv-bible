// finalize-aliases.mjs — keep an alias ONLY if its target name exists in word-map.json
// (names/peoples). An alias to a name the map doesn't have gives no transliteration,
// so it's dead. Prints the final valid set; writes name-aliases.clean.txt.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
const M = existsSync('./word-map.json') ? JSON.parse(readFileSync('./word-map.json','utf8')) : {};
const names = new Set([...Object.keys(M.names||{}), ...Object.keys(M.peoples||{})]);
const lines = readFileSync('./name-aliases.txt','utf8').split(/\r?\n/);
const keep=[], drop=[];
for (const l of lines) {
  const t=l.trim(); if(!t||t.startsWith('#')) continue;
  const [v,n]=t.split(/\s*->\s*/); if(!v||!n) continue;
  (names.has(n.toLowerCase()) ? keep : drop).push([v,n]);
}
console.log('KEEP (target in map, alias inherits its transliteration):');
for(const [v,n] of keep) console.log(`  ${v.padEnd(12)}-> ${n}  = ${M.names[n.toLowerCase()]||M.peoples[n.toLowerCase()]}`);
console.log('\nDROP (target NOT in map — alias would produce nothing):');
for(const [v,n] of drop) console.log(`  ${v.padEnd(12)}-> ${n}`);
const out = ['# verified aliases: variant not in OT, target present in word-map.',''];
for(const [v,n] of keep) out.push(`${v.padEnd(12)}-> ${n}`);
writeFileSync('./name-aliases.clean.txt', out.join('\n')+'\n');
console.log('\n-> name-aliases.clean.txt written. Replace name-aliases.txt with it if the KEEP list is right.');
