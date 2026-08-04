// show-context.mjs — show a name (or any word) in its verse context: N-1, N, N+1.
// Read-only. For judging which OT name an apocryphal spelling refers to.
//
//   node show-context.mjs Zorobabel          first 5 occurrences with context
//   node show-context.mjs Zorobabel 10        first 10
//   node show-context.mjs --book 81 Josias    limit to one book

import { existsSync } from 'node:fs';
const args = process.argv.slice(2);
let BOOK=null; const bi=args.indexOf('--book'); if(bi>=0){BOOK=+args[bi+1]; args.splice(bi,2);}
const word = args[0]; const LIMIT = args[1] ? +args[1] : 5;
if (!word) { console.error('usage: node show-context.mjs [--book N] <Word> [count]'); process.exit(1); }
let Database; ({ default: Database } = await import('better-sqlite3'));
const db = new Database('./corpus.db', { readonly: true });

const re = new RegExp('\\b'+word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b');
const hits = db.prepare(`SELECT canon_id, code, chapter, verse FROM verses
  WHERE corpus='ENG' AND text LIKE ? ${BOOK?'AND canon_id=?':''} ORDER BY canon_id,chapter,verse`)
  .all('%'+word+'%', ...(BOOK?[BOOK]:[])).filter(r=>{
    const t=db.prepare("SELECT text FROM verses WHERE corpus='ENG' AND canon_id=? AND chapter=? AND verse=?").get(r.canon_id,r.chapter,r.verse);
    return t && re.test(t.text);
  }).slice(0, LIMIT);

for (const h of hits) {
  console.log(`\n═══ ${h.code} ${h.chapter}:${h.verse} ═══`);
  for (const dv of [-1,0,1]) {
    const r = db.prepare("SELECT verse,text FROM verses WHERE corpus='ENG' AND canon_id=? AND chapter=? AND verse=?")
      .get(h.canon_id, h.chapter, h.verse+dv);
    if (r) console.log(`  ${dv===0?'▶':' '} v${r.verse}: ${r.text}`);
  }
}
console.log(`\n(${hits.length} shown)`);
db.close();
