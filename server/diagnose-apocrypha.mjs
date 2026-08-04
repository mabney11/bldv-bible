// diagnose-apocrypha.mjs — check exactly why apocrypha text isn't showing.
// Checks corpus.db ord_c/ord_v, canon_id, and translation.db state.
import { existsSync } from 'node:fs';
let Database; ({default:Database}=await import('better-sqlite3'));
const db = new Database('./corpus.db', {readonly:true});

console.log('=== corpus.db ENG for 1_ADAM_AND_EVE ===');
const rows = db.prepare("SELECT book_id, canon_id, chapter, verse, ord_c, ord_v, SUBSTR(text,1,50) t FROM verses WHERE corpus='ENG' AND code='1_ADAM_AND_EVE' LIMIT 5").all();
console.log('rows:', rows);

console.log('\n=== TEMP VIEW (what server actually sees) ===');
// Simulate the temp view
try {
  db.exec(`CREATE TEMP VIEW vtest AS SELECT id, canon_id AS book_id, ord_c AS chapter, ord_v AS verse, text FROM verses WHERE corpus='ENG'`);
  const vrows = db.prepare("SELECT book_id, chapter, verse, SUBSTR(text,1,50) t FROM vtest WHERE book_id=101 LIMIT 5").all();
  console.log('via TEMP VIEW (canon_id=101):', vrows);
} catch(e) { console.log('view error:', e.message); }

console.log('\n=== translation.db for canon_id 101 ===');
const tdb = new Database('./translation.db', {readonly:true});
const trows = tdb.prepare("SELECT book_id, chapter, verse, SUBSTR(text,1,50) t FROM translations WHERE book_id=101 LIMIT 5").all();
console.log('translation rows at book_id=101:', trows);
const trows2 = tdb.prepare("SELECT DISTINCT book_id FROM translations WHERE book_id BETWEEN 67 AND 120 ORDER BY book_id LIMIT 20").all();
console.log('translation.db apocrypha book_ids present:', trows2.map(r=>r.book_id));
db.close(); tdb.close();
