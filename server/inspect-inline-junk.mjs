// inspect-inline-junk.mjs — READ ONLY. Find junk EMBEDDED IN verse text (not verse-0
// rows): scroll sigla (4Q400, 11Q17), inline verse numbers baked into one verse, and
// fragment/column locators mid-text. These come from ingesting a fragmentary text as
// one blob per chapter instead of split verses.
//
//   node inspect-inline-junk.mjs           summary by book
//   node inspect-inline-junk.mjs --show 5  full text of N examples per pattern

import { existsSync } from 'node:fs';
const args = process.argv.slice(2);
const SHOW = args.includes('--show') ? Number(args[args.indexOf('--show')+1]) : 0;
const die = m => { console.error('\u2717 '+m); process.exit(1); };
let Database; try { ({ default: Database } = await import('better-sqlite3')); } catch { die('run from server/'); }
const db = new Database('./corpus.db', { readonly: true });

const PATTERNS = [
  { name: 'scroll siglum',   re: /\b\d?\d?Q\d{2,}\b/ },                 // 4Q400, 11Q17
  { name: 'Frag/Col mid-text', re: /\bFrag(ment|s)?\.?\s*\d+|\bCol\.?\s*[ivx\d]+/i },
  { name: 'inline verse nums', re: /\S\s*\d+\[/ },                      // "...Praise 2[the God"
  { name: 'leading locator',  re: /^\s*\d?\d?Q\d/ },
];

const rows = db.prepare(`
  SELECT canon_id, code, chapter, verse, text
  FROM verses WHERE corpus='ENG' AND text IS NOT NULL AND TRIM(text) <> ''
`).all();
db.close();

const byBook = new Map();
const examples = new Map();
for (const r of rows) {
  for (const p of PATTERNS) {
    if (p.re.test(r.text)) {
      const k = `${r.canon_id}|${r.code}`;
      byBook.set(k, (byBook.get(k) || 0) + 1);
      if (!examples.has(p.name)) examples.set(p.name, []);
      if (examples.get(p.name).length < SHOW) examples.get(p.name).push(r);
      break;
    }
  }
}

if (!byBook.size) { console.log('\u2713 no inline junk found.'); process.exit(0); }
console.log('BOOKS WITH INLINE JUNK (embedded in verse text)\n');
for (const [k, n] of [...byBook].sort((a,b) => b[1]-a[1])) {
  const [cid, code] = k.split('|');
  console.log(`   ${code.padEnd(30)} canon ${cid.padStart(3)}   ${n} verses`);
}
console.log(`\ntotal: ${[...byBook.values()].reduce((a,b)=>a+b,0)} verses across ${byBook.size} books`);

if (SHOW) {
  for (const [pat, list] of examples) {
    console.log(`\n── ${pat} ──`);
    for (const r of list) console.log(`  ${r.code} ch${r.chapter} v${r.verse}:\n    ${r.text.slice(0, 200)}\n`);
  }
}
console.log('\nRe-run with --show 5 to see full examples of each pattern.');
