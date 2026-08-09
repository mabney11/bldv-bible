const path = require('path');
const Database = require('better-sqlite3');

const WORD = '𐤌𐤔𐤁𐤉𐤏𐤊';

// 1) Raw corpus tagging (tokens_nt): pos/morph/strongs as originally tagged.
const corpus = new Database(path.join(__dirname, 'corpus.db'), { readonly: true });
const rawRows = corpus.prepare(`
  SELECT book_id, chapter, verse, token_ordinal, word_raw, pos, morph, strongs
  FROM tokens_nt
  WHERE word_raw LIKE ?
`).all(`%${WORD}%`);
console.log('--- corpus.db tokens_nt (raw tagging) ---');
console.log(rawRows);

// 2) Baked surface-index components: what the app actually renders (css classes,
//    tier, rendered_paleo vs root_paleo).
const surf = new Database(path.join(__dirname, 'surface-index.db'), { readonly: true });
const surfRows = surf.prepare(`
  SELECT word_raw, strongs, rendered_paleo, root_paleo, tier, components
  FROM token_surfaces
  WHERE source='HEB' AND word_raw LIKE ?
`).all(`%${WORD}%`);
console.log('\n--- surface-index.db token_surfaces (baked render) ---');
for (const r of surfRows) {
  console.log({ ...r, components: undefined });
  try {
    console.log('components:', JSON.stringify(JSON.parse(r.components), null, 2));
  } catch { console.log('components: <unparseable>', r.components); }
}

// 3) For comparison: how H7650 (Shaba, "swear") is defined as a canonical root,
//    to see whether the Yod is treated as part of the root or as an addable mater.
try {
  const rootsPath = path.join(__dirname, 'lexicon', 'strongs-roots.json');
  const roots = JSON.parse(require('fs').readFileSync(rootsPath, 'utf8'));
  console.log('\n--- strongs-roots.json H7650 ---');
  console.log(roots['H7650'] || roots['7650'] || '(not found under H7650/7650)');
} catch (e) {
  console.log('\n(could not read strongs-roots.json: ' + e.message + ')');
}
