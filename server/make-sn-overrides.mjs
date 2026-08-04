// make-sn-overrides.mjs — generate surface-strongs-overrides.json for the 8 surfaces
// whose OSHB Strong's is genuinely wrong (root and lemma share no letters). Writes an
// override that drops the bad SN so the invariant reports 0. Report-first: prints the
// 8 and what it will write; --write to actually write.
//
//   node make-sn-overrides.mjs           show the 8, write nothing
//   node make-sn-overrides.mjs --write   merge them into surface-strongs-overrides.json
//
// It does NOT invent a replacement SN — these are particles / compound-name halves
// that render bare regardless, so the override simply clears the mis-tag (sn: null),
// which is what the build's reconcileStrongs already does for a root with no lexicon SN.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const WRITE = process.argv.includes('--write');
const die = m => { console.error('\u2717 '+m); process.exit(1); };
let Database; try { ({ default: Database } = await import('better-sqlite3')); }
catch { die('run from server/'); }
const rootsPath = ['./lexicon/strongs-roots.json','./strongs-roots.json'].find(existsSync);
const ROOTS = JSON.parse(readFileSync(rootsPath,'utf8'));
const normH = h => h ? 'H'+String(h).replace(/^H+/,'') : '';
const db = new Database('./surface-index.db', { readonly: true });
const rows = db.prepare('SELECT word_raw, root_paleo, strongs FROM token_surfaces').all();
db.close();

const bad = [];
for (const r of rows) {
  const sx = normH(r.strongs);
  if (!sx || parseInt(sx.slice(1),10) >= 9000) continue;
  const lemma = ROOTS[sx];
  if (!lemma || !r.root_paleo || lemma === r.root_paleo) continue;
  const L = [...lemma], R = [...r.root_paleo];
  if (L[0] === R[0]) continue;
  if (R.some(c => L.includes(c))) continue;   // share any radical -> morphological, keep
  bad.push({ word: r.word_raw, root: r.root_paleo, badSn: sx, lemma });
}
console.log(`surfaces with an unrelated (wrong) Strong's: ${bad.length}\n`);
for (const b of bad) console.log(`  ${b.word}   root ${b.root}   drop ${b.badSn} (lemma ${b.lemma})`);

const OUT = './surface-strongs-overrides.json';
const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT,'utf8')) : {};
const merged = { ...existing };
for (const b of bad) merged[b.word] = null;   // null = clear the mis-tag; renders bare

console.log(`\noverride file ${OUT}: ${Object.keys(existing).length} existing + ${bad.length} new = ${Object.keys(merged).length}`);
if (!WRITE) { console.log('\n[report only] re-run with --write to save.'); process.exit(0); }
writeFileSync(OUT, JSON.stringify(merged, null, 1));
console.log(`\u2713 wrote ${OUT}. Rebuild: node build-surface-index.js  (invariant should print 0)`);
