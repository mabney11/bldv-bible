// Audit: every root_paleo in the surface index (OT + NT + Heb Extra, whatever
// 'source' values exist) that has NO entry in lexicon.json — the file that
// /api/root-explorer/root reads via `lexicon[entry.root]`. Sorted by total
// occurrence count (descending) so the highest-value gaps surface first.
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const surf = new Database(path.join(__dirname, 'surface-index.db'), { readonly: true });
const lexicon = JSON.parse(fs.readFileSync(path.join(__dirname, 'lexicon', 'lexicon.json'), 'utf8'));
const definitions = JSON.parse(fs.readFileSync(path.join(__dirname, 'lexicon', 'definitions.json'), 'utf8'));

// What source values actually exist in this DB (HEB combined? BHS-only rows too?)
const sources = surf.prepare(`SELECT DISTINCT source, COUNT(*) c FROM token_surfaces GROUP BY source`).all();
console.log('--- sources in token_surfaces ---');
console.log(sources);

const rows = surf.prepare(`
  SELECT root_paleo, GROUP_CONCAT(DISTINCT strongs) AS strongs_list, COUNT(*) AS occ
  FROM token_surfaces
  WHERE root_paleo IS NOT NULL AND root_paleo != ''
  GROUP BY root_paleo
`).all();

console.log(`\nTotal distinct roots across all sources: ${rows.length}`);

const missingLexicon = rows.filter(r => !lexicon[r.root_paleo]);
const missingDefinitions = rows.filter(r => !definitions[r.root_paleo]);
const missingBoth = rows.filter(r => !lexicon[r.root_paleo] && !definitions[r.root_paleo]);

console.log(`Missing from lexicon.json:    ${missingLexicon.length}`);
console.log(`Missing from definitions.json: ${missingDefinitions.length}`);
console.log(`Missing from BOTH:            ${missingBoth.length}`);

missingBoth.sort((a, b) => b.occ - a.occ);

console.log('\n--- Top 60 highest-occurrence roots missing from BOTH lexicon.json and definitions.json ---');
for (const r of missingBoth.slice(0, 60)) {
  console.log(`${r.root_paleo}\tSN=${r.strongs_list}\tocc=${r.occ}`);
}

fs.writeFileSync(
  path.join(__dirname, 'lex-gap-report.json'),
  JSON.stringify({ totalRoots: rows.length, missingBoth, missingLexicon, missingDefinitions }, null, 2),
  'utf8'
);
console.log(`\nFull report written to server/lex-gap-report.json (${missingBoth.length} entries missing both).`);
