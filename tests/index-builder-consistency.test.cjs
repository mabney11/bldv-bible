/**
 * index-builder-consistency.test.cjs — verifies that build-surface-index.js's
 * parseToken function has the same first-letter safety check as server.js's
 * parseHebrewData, AND that it honors surface-strongs-overrides.json. This
 * is the critical fix: without it, re-running build-surface-index.js would
 * regenerate a DB with the same bugs the audit found.
 */
const assert = require('assert');
const fs   = require('fs');
const path = require('path');

// Stage strongs-roots.json where the build script's lexDir would normally point.
const buildModule = path.join(__dirname, '..', 'server', 'build-surface-index.js');
const buildSrc    = fs.readFileSync(buildModule, 'utf8');

// We can't run the full build (it opens better-sqlite3 and reads bible.db).
// Extract parseToken + its dependencies into a standalone module, mirroring
// what tests/extract-parse.cjs does for server.js.
const lines = buildSrc.split(/\r?\n/);
const find  = (needle, from = 0) => { for (let i = from; i < lines.length; i++) if (lines[i].includes(needle)) return i; return -1; };

const charMapStart = find('const CHAR_MAP = {');
const parseTokenStart = find('function parseToken(');
// parseToken ends at the next top-level `function ` declaration or `// ─` divider
let parseTokenEnd = parseTokenStart;
let braceDepth = 0, opened = false;
for (let i = parseTokenStart; i < lines.length; i++) {
  for (const ch of lines[i]) {
    if (ch === '{') { braceDepth++; opened = true; }
    if (ch === '}') { braceDepth--; if (opened && braceDepth === 0) { parseTokenEnd = i; i = lines.length; break; } }
  }
}

// Stub out the lexicon dir constant so loadJSON returns empties; we don't need
// the JSON files for parseToken to work. Also stubs resolveGloss — parseToken
// calls it (createGlossResolver, from ../server/gloss-resolver.cjs) and this
// slice previously omitted it entirely (that construction lives before
// charMapStart in build-surface-index.js), so every invocation threw
// "resolveGloss is not defined" the moment any test called parseToken.
const stubHeader = `
const fs = require('fs'), path = require('path');
const LEX_DIR = path.join(__dirname, 'lexicon');
const strongsRootsLex = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server', 'lexicon', 'strongs-roots.json'), 'utf8'));
const lexicon = {}, homographs = {};
function loadStrongsRoots() { return strongsRootsLex; }
const { createGlossResolver } = require(path.join(__dirname, '..', 'server', 'gloss-resolver.cjs'));
const resolveGloss = createGlossResolver({ homographs, lexicon });
`;
const body = lines.slice(charMapStart, parseTokenEnd + 1).join('\n');
const extract = stubHeader + '\n' + body + '\nmodule.exports = { parseToken };';

// IMPORTANT: this must NOT be tests/build-parseToken.cjs — that path is a
// real, hand-maintained fixture other tests and tools (sample-heb-tokens.cjs,
// root-resolution.test.cjs) require directly. This test previously wrote its
// throwaway slice to that exact name and deleted it on success; when it threw
// instead (as the missing resolveGloss above did), cleanup never ran and the
// broken scratch slice was left sitting on disk in place of the real fixture,
// silently breaking every other consumer of that file. Use a private tmp name
// and always clean up, success or failure.
const tmp = path.join(__dirname, '.tmp-index-builder-parseToken.cjs');
fs.writeFileSync(tmp, extract);

try {
  // loadStrongsRoots inside parseToken reads from disk via __dirname; ensure
  // strongs-roots.json is reachable.
  const expectedSRPath = path.join(__dirname, 'lexicon', 'strongs-roots.json');
  if (!fs.existsSync(expectedSRPath)) {
    fs.mkdirSync(path.join(__dirname, 'lexicon'), { recursive: true });
    fs.copyFileSync(
      path.join(__dirname, '..', 'server', 'lexicon', 'strongs-roots.json'),
      expectedSRPath
    );
  }

  runTests(require(tmp).parseToken);
} finally {
  fs.unlinkSync(tmp);
}

function runTests(parseToken) {

console.log('=== TEST: build-surface-index.js parseToken now has the safety check ==='); {
  // Reproduce the Levi case: 𐤍𐤐𐤔𐤕𐤌 with SN=H3878 (Levi → 𐤋𐤅𐤉).
  // Surface starts with 𐤍, canonical root starts with 𐤋 → mismatch → safety
  // check should kick in and fall back to displayRoot stripping (𐤍𐤐𐤔).
  const result = parseToken(
    '𐤍𐤐𐤔𐤕𐤌', 'subs',
    'sp=subs|pdp=subs|gn=f|nu=pl|st=a|prs=M|uvf=absent|nme=WT',
    'H3878'
  );
  console.log(`  𐤍𐤐𐤔𐤕𐤌 with H3878: root_paleo=${result.root_paleo}`);
  assert.strictEqual(result.root_paleo, '𐤍𐤐𐤔',
    'index builder must reject wrong canonical root via first-letter safety check'
  );
  console.log('  ✓ first-letter safety check active in build-surface-index.js');
}

console.log('=== TEST: normal hollow-root case still resolves correctly ==='); {
  // 𐤀𐤁𐤀𐤌 with H935 (Bawaa → 𐤁𐤅𐤀). Surface starts with 𐤀, canonical starts
  // with 𐤁. After stripping pfm=>𐤀 and prs=M, displayRoot is 𐤁𐤀. First letter
  // of displayRoot is 𐤁, which matches the canonical root's first letter → safe.
  const result = parseToken(
    '𐤀𐤁𐤀𐤌', 'verb',
    'sp=verb|pdp=verb|vs=hif|vt=wayq|ps=p1|gn=unknown|nu=sg|prs=M|pfm=>|vbs=H|uvf=absent|nme=absent',
    'H935'
  );
  console.log(`  𐤀𐤁𐤀𐤌 with H935: root_paleo=${result.root_paleo}`);
  assert.strictEqual(result.root_paleo, '𐤁𐤅𐤀',
    'legitimate hollow-root canonical override still works (Bawaa)'
  );
  console.log('  ✓ legitimate canonical-root override preserved');
}

console.log('\n✅ ALL INDEX-BUILDER CONSISTENCY TESTS PASSED');
}
