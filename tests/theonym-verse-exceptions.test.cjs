/**
 * theonym-verse-exceptions.test.cjs
 *
 * Regression guard for the "GOD BARISAT" -> "Yahawah BARISAT" bug (Apocalypse of
 * Abraham 5:4). The blanket theonym rule GOD -> Yahawah (sourced from
 * server/name-map-expanded.json, applied by both server/render-corpus.mjs and
 * server/apply-theonyms-apocrypha.mjs) fired on that verse's carved idol
 * inscription, which is styled in caps for epigraphic reasons and has nothing to
 * do with the divine name. The fix is server/render-verse-exceptions.mjs: a
 * data-driven, verse-scoped literal-phrase guard, wired into both scripts.
 *
 * Fixing the DB row directly does NOT stick — render-all.mjs re-renders
 * NT+Apocrypha from the read-only text_src snapshot on every baseline reset,
 * silently undoing any manual edit. So this test does two things:
 *
 *   1. Unit-tests the guard mechanism itself (no DB / corpus needed) against a
 *      synthetic stand-in for the real "GOD"->"Yahawah" rule, proving the
 *      exception protects the phrase no matter what a rule does.
 *   2. If corpus.db is present and readable, checks the LIVE row for
 *      Apoc. Ab. 5:4 and fails loudly if the corruption is back — this is
 *      the check that would have caught the original regression.
 *
 * Run: node tests/theonym-verse-exceptions.test.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GUARD_MODULE = path.join(ROOT, 'server', 'render-verse-exceptions.mjs');
const EXCEPTIONS_JSON = path.join(ROOT, 'server', 'render-verse-exceptions.json');
const CORPUS_DB = path.join(ROOT, 'server', 'corpus.db');

const KNOWN_REF = '121:5:4';           // Apocalypse of Abraham 5:4
const KNOWN_PHRASE = 'GOD BARISAT';
const CORRUPTED_PHRASE = 'Yahawah BARISAT';

let failures = 0;
function check(label, ok) {
  console.log(`  ${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failures++;
}

async function main() {
  if (!fs.existsSync(GUARD_MODULE)) {
    console.error(`[theonym-exceptions] ${GUARD_MODULE} not found — the guard module was removed or moved.`);
    process.exit(1);
  }
  if (!fs.existsSync(EXCEPTIONS_JSON)) {
    console.error(`[theonym-exceptions] ${EXCEPTIONS_JSON} not found — the exceptions data file was removed.`);
    process.exit(1);
  }

  const { loadVerseExceptions, renderWithExceptions } = await import(
    'file://' + GUARD_MODULE.replace(/\\/g, '/'));

  console.log('[theonym-exceptions] Part 1: guard mechanism (synthetic, no DB needed)');

  const byRef = loadVerseExceptions(EXCEPTIONS_JSON);
  check(`exceptions file has an entry for ${KNOWN_REF}`, byRef.has(KNOWN_REF));
  check(`that entry protects "${KNOWN_PHRASE}"`,
    !!byRef.get(KNOWN_REF) && byRef.get(KNOWN_REF).includes(KNOWN_PHRASE));

  // A stand-in for the real (buggy) blanket rule: exactly what name-map-expanded.json's
  // theonyms table does — replace bare "GOD" with "Yahawah" everywhere it appears.
  const naiveGodToYahawah = text => text.replace(/\bGOD\b/g, 'Yahawah');

  const pristine = 'and on his forehead was written: GOD BARISAT.';

  // Without the guard, the naive rule DOES corrupt the verse — confirms the synthetic
  // rule reproduces the original bug (so the "protected" result below is meaningful).
  check('naive rule alone reproduces the original bug on this text',
    naiveGodToYahawah(pristine).includes(CORRUPTED_PHRASE));

  // With the guard, applied at the known ref, the phrase must survive untouched.
  const guardedAtKnownRef = renderWithExceptions(pristine, KNOWN_REF, byRef, naiveGodToYahawah);
  check(`guard protects "${KNOWN_PHRASE}" at ${KNOWN_REF}`,
    guardedAtKnownRef.includes(KNOWN_PHRASE) && !guardedAtKnownRef.includes(CORRUPTED_PHRASE));

  // The guard must be scoped to the ref — a DIFFERENT verse with the same wording
  // (hypothetically) should still get the normal rule applied. This proves the fix
  // isn't a blanket "never touch GOD" carve-out, just this one verse.
  const guardedAtOtherRef = renderWithExceptions(pristine, '121:6:11', byRef, naiveGodToYahawah);
  check('guard does NOT protect the same phrase at an unrelated verse ref',
    guardedAtOtherRef.includes(CORRUPTED_PHRASE));

  // Every other Barisat verse (lowercase "god Barisat") must render normally —
  // the exception is verse-scoped, not word-scoped.
  const otherVerse = 'How much more worthy of honour is he than the god Barisat, who is made of wood.';
  const otherOut = renderWithExceptions(otherVerse, '121:6:11', byRef, naiveGodToYahawah);
  check('unrelated verse text is unaffected by the guard',
    otherOut === otherVerse);

  console.log('\n[theonym-exceptions] Part 2: live corpus.db row (skipped if unavailable)');
  if (!fs.existsSync(CORPUS_DB)) {
    console.log('  (corpus.db not present — skipping live check)');
  } else {
    try {
      let Database;
      try { Database = require('better-sqlite3'); }
      catch { Database = require(path.join(ROOT, 'server', 'node_modules', 'better-sqlite3-shim.cjs')); }
      const db = new Database(CORPUS_DB, { readonly: true });
      const row = db.prepare(
        `SELECT text FROM verses WHERE canon_id = 121 AND chapter = '5' AND verse = '4'`
      ).get();
      db.close();
      if (!row) {
        console.log('  (Apoc. Ab. 5:4 row not found in corpus.db — skipping live check)');
      } else {
        check('live corpus.db row does NOT contain "Yahawah BARISAT"',
          !row.text.includes(CORRUPTED_PHRASE));
        check('live corpus.db row still contains "BARISAT" (verse wasn\'t dropped/mangled)',
          row.text.includes('BARISAT'));
      }
    } catch (e) {
      console.log(`  (could not open corpus.db: ${e.message} — skipping live check)`);
    }
  }

  console.log('');
  if (failures > 0) {
    console.error(`❌ ${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('✅ THEONYM VERSE-EXCEPTION GUARD CHECK PASSED');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
