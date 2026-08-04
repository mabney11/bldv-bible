import { readFileSync, existsSync } from 'node:fs';
const rootsPath = ['./lexicon/strongs-roots.json','./strongs-roots.json'].find(existsSync);
const ROOTS = JSON.parse(readFileSync(rootsPath,'utf8'));
// Judah = H3063. Check its root.
for (const h of ['H3063','H3061','H3068','H430','H113','H136']) {
  console.log(`  ${h} -> ${ROOTS[h] || '(NO ROOT IN strongs-roots.json)'}`);
}
// what does the tagged WEB say for Gen 29:35 Judah?
if (existsSync('./web-strongs.jsonl')) {
  for (const line of readFileSync('./web-strongs.jsonl','utf8').split(/\r?\n/)) {
    if (!line) continue; const r = JSON.parse(line);
    if (r.code==='GEN' && r.chapter===29 && r.verse===35) {
      console.log('\nGEN 29:35 segments:');
      for (const s of r.segments) if (/[Jj]udah|H3063/.test(s.text+' '+s.sn)) console.log('   ', JSON.stringify(s));
      // show the segment tagged H3063
      for (const s of r.segments) if (s.sn==='H3063') console.log('   H3063 segment:', JSON.stringify(s));
    }
  }
}
