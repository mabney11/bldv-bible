// check-state.mjs — see exactly what text the reader is showing vs what's in corpus.db
// and inspect translation.db schema so reseed works correctly.
let Database; ({default:Database}=await import('better-sqlite3'));

// Check corpus.db ENG for a few specific verses
const db = new Database('./corpus.db', {readonly:true});
console.log('=== corpus.db ENG sample verses ===');
for (const [code, ch, v] of [['BOOK_OF_JASHER',1,1],['BOOK_OF_JASHER',1,2],
                               ['1_ESDRAS',1,1],['3_MACCABEES',1,1]]) {
  const r = db.prepare("SELECT text FROM verses WHERE corpus='ENG' AND code=? AND chapter=? AND verse=?").get(code,ch,v);
  console.log(`  ${code} ${ch}:${v}: ${r?r.text.slice(0,80):'(not found)'}`);
}
db.close();

// Check translation.db schema
const tdb = new Database('./translation.db', {readonly:true});
const schema = tdb.prepare("PRAGMA table_info(translations)").all();
console.log('\n=== translation.db schema ===');
schema.forEach(c => console.log(`  col: ${c.name} (${c.type})`));

// Check what's in translation.db for Jasher
const sample = tdb.prepare("SELECT * FROM translations WHERE text IS NOT NULL AND text != '' AND text != 'none' LIMIT 3").all();
console.log('\n=== sample translation.db rows ===');
sample.forEach(r => {
  const shown = Object.entries(r).filter(([k])=>k!=='text').map(([k,v])=>`${k}=${v}`).join(' ');
  console.log(`  ${shown}`);
  console.log(`  text: ${String(r.text||'').slice(0,70)}`);
});

// Count non-OT rows
try {
  const n = tdb.prepare("SELECT COUNT(*) n FROM translations WHERE text IS NOT NULL AND text != '' AND text != 'none'").get();
  console.log(`\ntranslation.db non-empty rows: ${n.n}`);
  const byCanon = tdb.prepare("SELECT canon_id, COUNT(*) n FROM translations WHERE text IS NOT NULL AND text!='none' GROUP BY canon_id ORDER BY canon_id").all();
  console.log(`canon_id range: ${byCanon[0]?.canon_id} - ${byCanon[byCanon.length-1]?.canon_id}`);
  const nonOT = byCanon.filter(r=>r.canon_id>39).reduce((s,r)=>s+r.n,0);
  console.log(`non-OT rows with text: ${nonOT}`);
} catch(e) { console.log('count error:', e.message); }
tdb.close();
