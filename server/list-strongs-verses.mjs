// list-strongs-verses.mjs — every verse containing a given Hebrew word or Strong's.
//
//   node list-strongs-verses.mjs H1471          by Strong's
//   node list-strongs-verses.mjs 𐤂𐤅𐤉𐤌         by the exact Paleo surface form
//   node list-strongs-verses.mjs H1471 --forms  group by surface form (singular vs plural)
//
// For the gaway / gawayam question: --forms shows you exactly which verses carry
// which written form, so if the automatic surface lookup gets one wrong you have the
// list to correct by hand rather than hunting for them.

import { existsSync, writeFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const target = process.argv[2];
const FORMS  = process.argv.includes('--forms');
if (!target) { console.error('usage: node list-strongs-verses.mjs <H#### | paleo-word> [--forms]'); process.exit(1); }

function locate(name, start = process.cwd(), maxUp = 4) {
  let base = resolve(start);
  for (let up = 0; up <= maxUp; up++) {
    const stack = [base];
    while (stack.length) {
      const dir = stack.pop();
      let es; try { es = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of es) {
        if (e.isDirectory()) { if (/^(node_modules|\.git|dist|build)$/.test(e.name)) continue; stack.push(join(dir, e.name)); }
        else if (e.name === name) return join(dir, e.name);
      }
    }
    base = dirname(base);
  }
  return null;
}
const bp = locate('books.js');
const { translit } = bp ? await import(pathToFileURL(bp).href) : { translit: x => x };

const { default: Database } = await import('better-sqlite3');
const db = new Database('./corpus.db', { readonly: true });

const ID2CODE = {1:'GEN',2:'EXOD',3:'LEV',4:'NUM',5:'DEUT',6:'JOSH',7:'JUDG',8:'RUTH',9:'1SAM',
 10:'2SAM',11:'1KGS',12:'2KGS',13:'1CHR',14:'2CHR',15:'EZRA',16:'NEH',17:'EST',18:'JOB',19:'PSA',
 20:'PROV',21:'ECCL',22:'SONG',23:'ISA',24:'JER',25:'LAM',26:'EZK',27:'DAN',28:'HOS',29:'JOEL',
 30:'AMO',31:'OBA',32:'JONAH',33:'MIC',34:'NAM',35:'HAB',36:'ZEP',37:'HAG',38:'ZEC',39:'MAL'};

const isSN = /^H\d+$/i.test(target);
const rows = isSN
  ? db.prepare(`SELECT book_id,chapter,verse,word_raw,strongs FROM tokens_bhs
       WHERE ('H' || REPLACE(strongs,'H','')) = ? AND verse > 0
       ORDER BY book_id,chapter,verse,token_ordinal`).all(target.toUpperCase())
  : db.prepare(`SELECT book_id,chapter,verse,word_raw,strongs FROM tokens_bhs
       WHERE word_raw = ? AND verse > 0
       ORDER BY book_id,chapter,verse,token_ordinal`).all(target);
db.close();

if (!rows.length) { console.log(`no tokens found for ${target}`); process.exit(0); }

const byForm = new Map();
for (const r of rows) {
  if (!byForm.has(r.word_raw)) byForm.set(r.word_raw, []);
  byForm.get(r.word_raw).push(`${ID2CODE[r.book_id] || r.book_id} ${r.chapter}:${r.verse}`);
}

console.log(`${target} — ${rows.length} occurrences, ${byForm.size} distinct written form(s)\n`);
for (const [form, refs] of [...byForm].sort((a,b) => b[1].length - a[1].length)) {
  console.log(`${form}   ${translit(form)}   ${refs.length} verses`);
  if (FORMS || byForm.size <= 4) {
    for (let i = 0; i < refs.length; i += 8) console.log('   ' + refs.slice(i, i+8).join('  '));
  }
  console.log('');
}
const out = `strongs-${target.replace(/[^\w]/g,'_')}.json`;
writeFileSync(out, JSON.stringify([...byForm].map(([form, refs]) => ({ form, translit: translit(form), refs })), null, 1));
console.log(`\u2713 ${out}`);
