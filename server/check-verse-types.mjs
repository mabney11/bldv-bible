// check-verse-types.mjs — find rows where verse (or chapter) is stored as TEXT rather
// than a real integer, which would sort wrong in the app despite the INTEGER column.
import { existsSync } from 'node:fs';
let Database; ({ default: Database } = await import('better-sqlite3'));
const db = new Database('./corpus.db', { readonly: true });
// typeof() reports the actual stored type per value (SQLite is not strict by default)
const bad = db.prepare(`
  SELECT corpus, code, chapter, verse, typeof(verse) tv, typeof(chapter) tc
  FROM verses
  WHERE typeof(verse) <> 'integer' OR typeof(chapter) <> 'integer'
`).all();
console.log(`rows where verse/chapter is NOT stored as integer: ${bad.length}`);
const byBook = {};
for (const r of bad) { const k = r.code || '?'; byBook[k] = (byBook[k]||0)+1; }
for (const [k,n] of Object.entries(byBook).sort((a,b)=>b[1]-a[1])) console.log(`   ${k.padEnd(30)} ${n}`);
if (bad.length) {
  console.log('\nexamples:');
  for (const r of bad.slice(0,8)) console.log(`   ${r.code} ch${r.chapter}(${r.tc}) v${r.verse}(${r.tv})`);
  console.log('\nThese sort lexically (v1,v10,v100) instead of numerically. Fixable with one UPDATE.');
} else {
  console.log('\u2713 all verse/chapter values are true integers — sorting is correct app-wide.');
}
db.close();
