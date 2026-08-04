/**
 * sn-mismatch-baseline.test.cjs
 *
 * Tracks corpus tokens where the corpus-assigned Strongs has ZERO letter
 * overlap with the surface form. These are objectively wrong assignments
 * in the source `bible.db` data (e.g. 𐤁𐤔𐤓𐤕𐤉 tagged H6666 "righteousness"
 * when it should be H1319 "to proclaim tidings").
 *
 * The test does NOT fail just because mismatches exist — the corpus has
 * known data-quality issues outside our control. Instead it tracks the
 * count against a baseline stored in tests/sn-mismatch-baseline.json.
 * The test passes if:
 *   - the number of mismatches not covered by surface-strongs-overrides.json
 *     is <= the recorded baseline.
 *   - i.e. you've either curated overrides (reducing the count) or held
 *     steady. It fails if a regression introduces NEW mismatches.
 *
 * Workflow when overrides land:
 *   1. Curate entries in lexicon/surface-strongs-overrides.json
 *   2. Run this test — it reports the new lower count and exits 0
 *   3. Commit the lowered baseline number (run with --update-baseline)
 *
 * Workflow when something regresses (corpus changes, parser breaks):
 *   1. Test fails with "+N new mismatches"
 *   2. Investigate via `node scripts/audit-sn-consistency.cjs`
 *   3. Either fix the underlying issue or add overrides
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT       = path.join(__dirname, '..');
const BIBLE_DB   = path.join(ROOT, 'server', 'bible.db');
const SR_PATH    = path.join(ROOT, 'server', 'lexicon', 'strongs-roots.json');
const OVR_PATH   = path.join(ROOT, 'server', 'lexicon', 'surface-strongs-overrides.json');
const BASELINE   = path.join(__dirname, 'sn-mismatch-baseline.json');

if (!fs.existsSync(BIBLE_DB)) { console.log('[sn-mismatch] bible.db not present — skipping'); process.exit(0); }
if (!fs.existsSync(SR_PATH))  { console.log('[sn-mismatch] strongs-roots.json not present — skipping'); process.exit(0); }

const strongsRoots = JSON.parse(fs.readFileSync(SR_PATH, 'utf8'));
let overrides = {};
if (fs.existsSync(OVR_PATH)) {
    overrides = JSON.parse(fs.readFileSync(OVR_PATH, 'utf8'));
    // Strip _comment / _review fields that aren't actual overrides
    for (const k of Object.keys(overrides)) {
        if (k.startsWith('_')) delete overrides[k];
    }
}

// "Letters all present" check: every codepoint in needle appears in haystack
// at least as many times as in needle. Same semantics as the audit script.
function lettersAllPresent(needle, haystack) {
    const have = new Map();
    for (const ch of [...haystack]) have.set(ch, (have.get(ch) || 0) + 1);
    for (const ch of [...needle]) {
        const n = have.get(ch);
        if (!n) return false;
        have.set(ch, n - 1);
    }
    return true;
}

// Load all corpus tokens. We use the standalone node:sqlite module if
// better-sqlite3 isn't compiled (sandbox limitation).
let rows;
try {
    let Database;
    try { Database = require('better-sqlite3'); }
    catch { Database = require(path.join(ROOT, 'server', 'node_modules', 'better-sqlite3-shim.cjs')); }
    const db = new Database(BIBLE_DB, { readonly: true });
    rows = db.prepare(`
        SELECT word_raw, strongs FROM tokens_bhs
        WHERE strongs IS NOT NULL AND word_raw IS NOT NULL
    `).all();
    db.close();
} catch (e) {
    console.error(`[sn-mismatch] failed to read bible.db: ${e.message}`);
    process.exit(1);
}

// Count tokens with zero-overlap mismatches AFTER applying overrides.
let totalMismatches = 0;
const uniqueSurfaces = new Set();
for (const r of rows) {
    // Apply override if present
    const sn = overrides[r.word_raw] || r.strongs;
    // Skip virtual particles
    const snNum = parseInt(sn.replace(/\D/g, ''), 10);
    if (!Number.isFinite(snNum) || snNum >= 9000) continue;
    const canon = strongsRoots[sn];
    if (!canon) continue;
    // Does the canonical root share ANY letter with the surface?
    const surfChars = new Set([...r.word_raw]);
    const anyOverlap = [...canon].some(c => surfChars.has(c));
    if (!anyOverlap) {
        totalMismatches++;
        uniqueSurfaces.add(r.word_raw);
    }
}

const result = {
    totalMismatches,
    uniqueSurfaces: uniqueSurfaces.size,
    overridesApplied: Object.keys(overrides).length,
};

// Baseline check
let baseline;
if (fs.existsSync(BASELINE)) {
    baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
} else {
    baseline = { totalMismatches: Infinity, uniqueSurfaces: Infinity };
}

console.log(`[sn-mismatch] zero-overlap surface↔SN mismatches:`);
console.log(`  tokens: ${result.totalMismatches.toLocaleString()} (baseline: ${baseline.totalMismatches})`);
console.log(`  unique surfaces: ${result.uniqueSurfaces.toLocaleString()} (baseline: ${baseline.uniqueSurfaces})`);
console.log(`  active overrides applied: ${result.overridesApplied}`);

const updateMode = process.argv.includes('--update-baseline');
if (updateMode) {
    fs.writeFileSync(BASELINE, JSON.stringify(result, null, 2));
    console.log(`✓ Updated baseline: ${BASELINE}`);
    process.exit(0);
}

if (result.totalMismatches > baseline.totalMismatches) {
    console.error(`\n❌ REGRESSION: ${result.totalMismatches - baseline.totalMismatches} new mismatches above baseline`);
    console.error(`   To investigate: node scripts/audit-sn-consistency.cjs`);
    console.error(`   To accept new baseline: node tests/sn-mismatch-baseline.test.cjs --update-baseline`);
    process.exit(1);
}

if (result.totalMismatches < baseline.totalMismatches) {
    console.log(`\n✓ ${baseline.totalMismatches - result.totalMismatches} mismatches fewer than baseline (curated via overrides).`);
    console.log(`  Run with --update-baseline to lock in the improvement.`);
}

console.log(`\n✅ SN-MISMATCH BASELINE CHECK PASSED`);
process.exit(0);
