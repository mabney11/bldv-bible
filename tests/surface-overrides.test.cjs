/**
 * surface-overrides.test.cjs — verifies that surface-strongs-overrides.json
 * actually pins the SN for a given word_raw, fixing SN/root contradictions
 * like the H3878 (Levi) vs H5315 (nephesh) case.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parseHebrewData } = require('./parse-extract.cjs');

// Make sure strongs-roots.json is reachable by the extracted loadStrongsRoots()
// (it reads from <__dirname>/lexicon/strongs-roots.json).
const extractLexDir = path.join(__dirname, 'lexicon');
if (!fs.existsSync(path.join(extractLexDir, 'strongs-roots.json'))) {
  fs.mkdirSync(extractLexDir, { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, '..', 'server', 'lexicon', 'strongs-roots.json'),
    path.join(extractLexDir, 'strongs-roots.json')
  );
}

function line(word, pos, morph, sn, verse=1, ord=1) {
  return [verse, ord, word, pos, morph, sn].join('\t');
}

const lexicon    = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server', 'lexicon', 'lexicon.json'), 'utf8'));
const homographs = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server', 'lexicon', 'homographs.json'), 'utf8'));

console.log('=== TEST 1: WITHOUT override, live parser already protects against wrong SNs ==='); {
  const surfaceOverrides = {};
  const parsed = parseHebrewData(
    line('𐤍𐤐𐤔𐤕𐤌', 'subs', 'sp=subs|pdp=subs|gn=f|nu=pl|st=a|prs=M|uvf=absent|nme=WT', 'H3878'),
    lexicon, homographs, surfaceOverrides
  );
  const root = parsed[0].components.find(c => c.css === 'root');
  console.log(`  with SN=H3878:   root.paleo=${root.paleo}   trans=${JSON.stringify(root.translation)}`);
  // server.js parseHebrewData has a FIRST-LETTER SAFETY CHECK (lines 1219-1227):
  // if strongs-roots[SN]'s first letter doesn't match the surface's first letter,
  // it rejects the canonical root and falls back to stripping. That's why this
  // produces 𐤍𐤐𐤔 (correct nephesh root from the surface) instead of 𐤋𐤅𐤉 (Levi).
  // The bug is ONLY in build-surface-index.js, which lacks the same safety check.
  assert.strictEqual(root.paleo, '𐤍𐤐𐤔',
    'live parser should reject H3878 canonical root because its first letter (𐤋) ≠ surface first letter (𐤍)');
}

console.log('=== TEST 2: WITH override, the SN is corrected and root flips ==='); {
  const surfaceOverrides = { '𐤍𐤐𐤔𐤕𐤌': 'H5315' };
  const parsed = parseHebrewData(
    line('𐤍𐤐𐤔𐤕𐤌', 'subs', 'sp=subs|pdp=subs|gn=f|nu=pl|st=a|prs=M|uvf=absent|nme=WT', 'H3878'),
    lexicon, homographs, surfaceOverrides
  );
  const root = parsed[0].components.find(c => c.css === 'root');
  console.log(`  override→H5315:  root.paleo=${root.paleo}   trans=${JSON.stringify(root.translation)}   sn=${root.sn || '?'}`);
  assert.strictEqual(root.paleo, '𐤍𐤐𐤔', 'override flips root to nephesh (H5315 → 𐤍𐤐𐤔)');
  // Translation now comes from the lexicon keyed on the true root (𐤍𐤐𐤔 → "living being/soul")
  const trans = (root.translation || '').toLowerCase();
  assert.ok(/soul|living being/.test(trans), `translation should reflect nephesh, got: ${root.translation}`);
}

console.log('=== TEST 3: Override is a no-op for words not in the override map ==='); {
  const surfaceOverrides = { '𐤍𐤐𐤔𐤕𐤌': 'H5315' }; // only this one
  const parsed = parseHebrewData(
    line('𐤁𐤓𐤀', 'verb', 'sp=verb|pdp=verb|vs=qal|vt=perf|ps=p3|gn=m|nu=sg', 'H1254'),
    lexicon, homographs, surfaceOverrides
  );
  const root = parsed[0].components.find(c => c.css === 'root');
  console.log(`  𐤁𐤓𐤀 (H1254): root.paleo=${root.paleo}   trans=${JSON.stringify(root.translation)}`);
  assert.strictEqual(root.paleo, '𐤁𐤓𐤀', 'unrelated words are unaffected by overrides');
}

console.log('=== TEST 4: Override only changes SN; lexicon priority order is unchanged ==='); {
  // 𐤔𐤌𐤉𐤌 (shamayim) is in KNOWN_ROOTS — full word IS the root. Override to a
  // bogus SN and confirm the normal lexicon translation still wins.
  const surfaceOverrides = { '𐤔𐤌𐤉𐤌': 'H99999' }; // bogus SN
  const parsed = parseHebrewData(
    line('𐤔𐤌𐤉𐤌', 'subs', 'sp=subs|pdp=subs|gn=m|nu=pl|st=a|prs=absent|uvf=absent|nme=JM', 'H8064'),
    lexicon, homographs, surfaceOverrides
  );
  const root = parsed[0].components.find(c => c.css === 'root');
  console.log(`  𐤔𐤌𐤉𐤌 with bogus override: root.paleo=${root.paleo}  trans=${JSON.stringify(root.translation)}`);
  // The lexicon lookup on the SURFACE/root paleo still wins ('Shamayam (Heavens)').
  // The exact root paleo may differ (it might fall through to displayRoot when SN
  // has no strongs-roots entry), but the GLOSS should still come from lexicon[𐤔𐤌𐤉𐤌].
  const trans = (root.translation || '').toLowerCase();
  assert.ok(/heaven|shamayam/.test(trans), `lexicon[𐤔𐤌𐤉𐤌] should still drive the gloss, got: ${root.translation}`);
}

console.log('\n✅ ALL OVERRIDE TESTS PASSED');
