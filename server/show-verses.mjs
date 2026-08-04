// show-verses.mjs — dump full text of specific verses so we see the real artifacts.
//   node show-verses.mjs SONGS_OF_THE_SABBATH_SACRIFICE 1
import { existsSync } from 'node:fs';
let Database; ({ default: Database } = await import('better-sqlite3'));
const db = new Database('./corpus.db', { readonly: true });
const code = process.argv[2], ch = process.argv[3] ? +process.argv[3] : null;
const q = ch
  ? db.prepare("SELECT chapter,verse,text FROM verses WHERE corpus='ENG' AND code=? AND chapter=? ORDER BY verse")
  : db.prepare("SELECT chapter,verse,text FROM verses WHERE corpus='ENG' AND code=? ORDER BY chapter,verse LIMIT 30");
const rows = ch ? q.all(code, ch) : q.all(code);
for (const r of rows) console.log(`ch${r.chapter} v${r.verse}: ${r.text}\n`);
db.close();
