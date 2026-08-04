import { readFileSync, existsSync } from 'node:fs';
let Database; ({ default: Database } = await import('better-sqlite3'));
const db = new Database('./corpus.db', { readonly: true });
// How does the OT render Judah / Joseph / Jerusalem right now?
for (const [name, code, ch, v] of [['Judah','GEN',29,35],['Joseph','GEN',30,24],['Jerusalem','JOSH',10,1],['Benjamin','GEN',35,18]]) {
  const r = db.prepare("SELECT text FROM verses WHERE corpus='ENG' AND code=? AND chapter=? AND verse=?").get(code,ch,v);
  console.log(`${name} (${code} ${ch}:${v}):`);
  console.log('   '+(r?r.text.slice(0,140):'(verse not found)')+'\n');
}
// and the map's divine bucket + a few names
const M = JSON.parse(readFileSync('./word-map.json','utf8'));
console.log('divine bucket:', JSON.stringify(M.divine));
console.log('termsAmbiguous has judah?', (M.termsAmbiguous||{}).judah || (M.ambiguous||{}).judah || 'no');
console.log('is Judah a people?', (M.peoples||{}).judah || 'no');
db.close();
