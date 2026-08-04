const fs = require('fs');
const path = require('path');
const { parseHebrewData } = require('./parse-extract.cjs');

// Load REAL lexicon JSONs from the lexicon dir (the path parseHebrewData reads)
const LEX_DIR = path.join(__dirname, '..', 'server', 'lexicon');
const lexicon    = JSON.parse(fs.readFileSync(path.join(LEX_DIR, 'lexicon.json'),    'utf8'));
const homographs = JSON.parse(fs.readFileSync(path.join(LEX_DIR, 'homographs.json'), 'utf8'));

console.log(`Loaded lexicon=${Object.keys(lexicon).length} homographs=${Object.keys(homographs).length}`);
// strongs-roots.json is loaded internally by loadStrongsRoots() using __dirname,
// which inside the extract is tests/. Symlink it where loadStrongsRoots will find it.
const expectedSRPath = path.join(__dirname, 'lexicon', 'strongs-roots.json');
if (!fs.existsSync(expectedSRPath)) {
  fs.mkdirSync(path.join(__dirname, 'lexicon'), { recursive: true });
  fs.copyFileSync(path.join(LEX_DIR, 'strongs-roots.json'), expectedSRPath);
}

const samples = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-tokens.json'), 'utf8'));
console.log(`Loaded ${samples.length} sample tokens`);

function line(s, ord = 1) {
  return [1, ord, s.word_raw || '', s.pos || '', s.morph || '', s.strongs || ''].join('\t');
}

const stats = {
  byCategory: {},
  trueRootShinesThrough: { ok: 0, mismatch: 0, examples: [] },
  lexiconHits: { hit: 0, miss: 0, particleFallback: 0 },
  componentShape: { hasTrueRoot: 0, hasDisplayRoot: 0, hasSurfaceForm: 0, total: 0 },
  errors: [],
};

for (const s of samples) {
  stats.byCategory[s.category] = (stats.byCategory[s.category] || 0) + 1;
  let parsed;
  try {
    parsed = parseHebrewData(line(s), lexicon, homographs);
  } catch (e) {
    stats.errors.push({ word: s.word_raw, err: e.message });
    continue;
  }
  const wb = parsed[0];
  if (!wb || !wb.components || !wb.components.length) continue;
  const rootComp = wb.components.find(c => c.css === 'root') || wb.components[0];
  if (!rootComp) continue;

  // === 1. TRUE ROOT IN ROOT SLOT ============================================
  // For non-particles with an expected_root from the DB, the new rootComp.paleo
  // should equal that expected_root (i.e. the server-resolved true root).
  if (s.expected_root && s.category !== 'particle') {
    if (rootComp.paleo === s.expected_root) {
      stats.trueRootShinesThrough.ok++;
    } else {
      stats.trueRootShinesThrough.mismatch++;
      if (stats.trueRootShinesThrough.examples.length < 8) {
        stats.trueRootShinesThrough.examples.push({
          word: s.word_raw, sn: s.strongs, expected: s.expected_root,
          got: rootComp.paleo, db_root: s.expected_root,
        });
      }
    }
  }

  // === 2. EXPLICIT CONTRACT FIELDS ==========================================
  if ('true_root'    in rootComp) stats.componentShape.hasTrueRoot++;
  if ('display_root' in rootComp) stats.componentShape.hasDisplayRoot++;
  if ('surface_form' in rootComp) stats.componentShape.hasSurfaceForm++;
  stats.componentShape.total++;

  // === 3. LEXICON-PRIMARY TRANSLATION =======================================
  const trans = rootComp.translation || '';
  if (!trans || trans.startsWith('[')) {
    stats.lexiconHits.miss++;
  } else {
    stats.lexiconHits.hit++;
    // For particles, verify lexicon won over GRAMMAR_MAP when a lexicon entry exists.
    if (s.category === 'particle' && lexicon[s.word_raw]) {
      const lexValue = lexicon[s.word_raw];
      const lower = trans.toLowerCase();
      if (lower === lexValue.toLowerCase() || lower === lexValue.charAt(0).toUpperCase() + lexValue.slice(1).toLowerCase()) {
        // Lexicon entry was used (case may have been adjusted by capitalisation rules)
      } else {
        stats.lexiconHits.particleFallback++;
      }
    }
  }
}

// === REPORT ==================================================================
console.log('\n=== CATEGORY BREAKDOWN ===');
for (const [k, v] of Object.entries(stats.byCategory)) console.log(`  ${k}: ${v}`);

console.log('\n=== TRUE ROOT SHINES THROUGH ===');
const trtot = stats.trueRootShinesThrough.ok + stats.trueRootShinesThrough.mismatch;
console.log(`  matches DB root_paleo: ${stats.trueRootShinesThrough.ok}/${trtot} (${(100 * stats.trueRootShinesThrough.ok / trtot).toFixed(1)}%)`);
if (stats.trueRootShinesThrough.mismatch) {
  console.log('  Mismatches (first 8):');
  for (const e of stats.trueRootShinesThrough.examples) {
    console.log(`    ${e.word} [${e.sn || '-'}] expected=${e.expected} got=${e.got}`);
  }
}

console.log('\n=== COMPONENT CONTRACT FIELDS ===');
console.log(`  has true_root:    ${stats.componentShape.hasTrueRoot}/${stats.componentShape.total}`);
console.log(`  has display_root: ${stats.componentShape.hasDisplayRoot}/${stats.componentShape.total}`);
console.log(`  has surface_form: ${stats.componentShape.hasSurfaceForm}/${stats.componentShape.total}`);

console.log('\n=== LEXICON COVERAGE ===');
const lextot = stats.lexiconHits.hit + stats.lexiconHits.miss;
console.log(`  resolved gloss: ${stats.lexiconHits.hit}/${lextot} (${(100 * stats.lexiconHits.hit / lextot).toFixed(1)}%)`);
console.log(`  bracket fallback: ${stats.lexiconHits.miss}/${lextot}`);
if (stats.lexiconHits.particleFallback) {
  console.log(`  WARNING: ${stats.lexiconHits.particleFallback} particles fell back to GRAMMAR_MAP despite lexicon entry`);
}

if (stats.errors.length) {
  console.log('\n=== ERRORS ===');
  for (const e of stats.errors.slice(0, 5)) console.log(`  ${e.word}: ${e.err}`);
}

// Specific assertions
const assert = require('assert');
assert.strictEqual(stats.errors.length, 0, 'parseHebrewData must not throw on real data');
assert.ok(stats.componentShape.hasTrueRoot >= stats.componentShape.total * 0.9,
  'most components should carry true_root field');
assert.strictEqual(stats.lexiconHits.particleFallback, 0,
  'particles with lexicon entries must use the lexicon, not GRAMMAR_MAP');
assert.ok(stats.trueRootShinesThrough.ok >= trtot * 0.85,
  `at least 85% of true roots should match DB (got ${stats.trueRootShinesThrough.ok}/${trtot})`);

console.log('\n✅ All end-to-end assertions passed against real lexicon + real DB tokens.');
