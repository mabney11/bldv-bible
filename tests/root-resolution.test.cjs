const assert = require('assert');
const { parseHebrewData } = require('./parse-extract.cjs');

// Helper: build the tab-delimited line parseHebrewData expects.
// Format: verse \t token_ordinal \t word_raw \t pos \t morph \t strongs
function line(word, pos, morph, sn, verse=1, ord=1) {
  return [verse, ord, word, pos, morph, sn].join('\t');
}
function rootComp(parsed) {
  const wb = parsed[0];
  return wb.components.find(c => c.css === 'root') || wb.components[0];
}

console.log('=== TEST 1: lexicon is PRIMARY for standalone particles ===');
{
  // 𐤅 conj. GRAMMAR_MAP.conj likely maps 𐤅 -> "And". Provide a DIFFERENT lexicon
  // value and prove the lexicon wins now (it was GRAMMAR_MAP-first before).
  const lexicon = { '𐤅': 'LEXICON-AND' };
  const homographs = {};
  const parsed = parseHebrewData(line('𐤅','conj','sp=conj|pdp=conj'), lexicon, homographs);
  const c = parsed[0].components[0];
  console.log('  conj 𐤅 translation =', JSON.stringify(c.translation));
  assert.strictEqual(c.translation, 'LEXICON-AND', 'lexicon should override GRAMMAR_MAP for conj');
  console.log('  ✓ lexicon overrides GRAMMAR_MAP for particles');
}

console.log('=== TEST 2: GRAMMAR_MAP still used as FALLBACK when lexicon empty ===');
{
  const parsed = parseHebrewData(line('𐤅','conj','sp=conj|pdp=conj'), {}, {});
  const c = parsed[0].components[0];
  console.log('  conj 𐤅 fallback translation =', JSON.stringify(c.translation));
  // Should fall back to GRAMMAR_MAP (And) or bracket — must NOT be empty.
  assert.ok(c.translation && c.translation.length, 'must have a fallback translation');
  console.log('  ✓ fallback path intact');
}

console.log('=== TEST 3: homograph (lexicon-tier) is primary for particles ===');
{
  const homographs = { '𐤅_conjunction': 'HOMOGRAPH-AND' };
  const parsed = parseHebrewData(line('𐤅','conj','sp=conj|pdp=conj'), { '𐤅':'lex' }, homographs);
  const c = parsed[0].components[0];
  console.log('  conj 𐤅 translation =', JSON.stringify(c.translation));
  assert.strictEqual(c.translation, 'HOMOGRAPH-AND', 'homograph should beat plain lexicon + GRAMMAR_MAP');
  console.log('  ✓ homograph tier is most specific');
}

console.log('=== TEST 4: TRUE ROOT shines through (root slot = trueRoot, not surface) ===');
{
  // 𐤔𐤌𐤉𐤌 (shamayim) is a KNOWN_ROOT — nme=JM must NOT strip 𐤉𐤌; full word is the root.
  const lexicon = { '𐤔𐤌𐤉𐤌': 'heavens' };
  const parsed = parseHebrewData(
    line('𐤔𐤌𐤉𐤌','subs','sp=subs|pdp=subs|gn=m|nu=pl|st=a|prs=absent|uvf=absent|nme=JM','H8064'),
    lexicon, {});
  const rc = rootComp(parsed);
  console.log('  root paleo =', rc.paleo, '| true_root =', rc.true_root, '| display_root =', rc.display_root);
  assert.strictEqual(rc.paleo, '𐤔𐤌𐤉𐤌', 'root slot must show the true root, not a stripped form');
  assert.strictEqual(rc.true_root, rc.paleo, 'true_root field present and equals paleo');
  assert.ok('display_root' in rc, 'display_root field present');
  assert.ok('surface_form' in rc, 'surface_form field present');
  assert.strictEqual(rc.translation.toLowerCase(), 'heavens', 'translation pulled from lexicon by true root');
  console.log('  ✓ true root preserved + lexicon translation by true root');
}

console.log('=== TEST 5: inline 𐤀𐤋𐤄𐤉𐤌->god hack is DEMOTED to fallback ===');
{
  // When lexicon defines 𐤀𐤋𐤄𐤉𐤌, curated data wins over the inline 'god' hack.
  const lexicon = { '𐤀𐤋𐤄𐤉𐤌': 'God (curated)' };
  const parsed = parseHebrewData(
    line('𐤀𐤋𐤄𐤉𐤌','subs','sp=subs|pdp=subs|gn=m|nu=pl|st=a|prs=absent|uvf=absent|nme=JM','H430'),
    lexicon, {});
  const rc = rootComp(parsed);
  console.log('  𐤀𐤋𐤄𐤉𐤌 translation =', JSON.stringify(rc.translation));
  // KNOWN_ROOTS keeps it whole so displayRoot != 𐤀𐤋𐤄; the hack condition won't even match,
  // but most importantly the curated lexicon value must be what shows.
  assert.strictEqual(rc.translation.toLowerCase(), 'god (curated)', 'curated lexicon beats inline god hack');
  console.log('  ✓ curated lexicon wins over inline hack');
}

console.log('\nALL TESTS PASSED ✅');
