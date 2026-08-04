// verify-integration.mjs
// Post-rebuild verification of the seam that actually matters: the curated baseline in
// corpus.db must reach the Translation Studio AND the novel reader (both read
// /api/translate/chapter, which serves saved translation.db text OR — for every untouched
// verse — the LIVE englishBaseline() from corpus.db). This checks that end-to-end and
// surfaces the missing chapters you flagged, so nothing is silently blank.
//
//   node verify-integration.mjs              full report
//   node verify-integration.mjs --strict     exit 1 if any English chapter is missing
//
// Always safe to run; read-only. Without --strict it always exits 0 (it's a report, so
// render-all can run it last without aborting on known gaps).

import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';

const STRICT = process.argv.includes('--strict');
const die = m => { console.error('\u2717 ' + m); process.exit(1); };
if (!existsSync('./corpus.db')) die('corpus.db not found — run from server/');
const cdb = new Database('./corpus.db', { readonly: true });
const tdb = existsSync('./translation.db') ? new Database('./translation.db', { readonly: true }) : null;

const NL = n => n.toLocaleString();

// ── 0. NULL ord_c/ord_v — the failure that makes a whole book vanish ────────────────
// Every reader keys a verse by ord_c/ord_v. An ENG row with NULL ords is INVISIBLE: the
// verse list comes back empty and the reader says "has not been translated into English
// yet" even though the text is right there. It also hides from the coverage report below
// (which groups by ord_c), so it must be checked FIRST and on its own terms.
// reingest-apocrypha deletes and re-inserts these rows with chapter/verse as TEXT and the
// ords NULL, so this reappears on every rebuild unless fix-apocrypha-ords.mjs runs after it.
const nullOrds = cdb.prepare(`
  SELECT canon_id, MIN(code) code, COUNT(*) n
  FROM verses WHERE corpus='ENG' AND text IS NOT NULL AND TRIM(text)<>''
    AND (ord_c IS NULL OR ord_v IS NULL)
  GROUP BY canon_id ORDER BY n DESC`).all();
const nullTotal = nullOrds.reduce((s, r) => s + r.n, 0);
console.log('\n=== INVISIBLE VERSES (English present, ord_c/ord_v NULL) ===');
if (nullTotal) {
  console.log(`\u2717 ${NL(nullTotal)} English verses across ${nullOrds.length} books are UNREACHABLE.`);
  console.log('  These books show "not translated" in the reader despite having text.');
  console.table(nullOrds.slice(0, 25));
  console.log('  FIX: node fix-apocrypha-ords.mjs   (and keep it in render-all right after');
  console.log('       reingest-apocrypha, which re-creates this every run).');
} else {
  console.log('\u2713 none — every English verse has ord_c/ord_v and is reachable.');
}

// ── 1. Expected vs English coverage, per canonical book+chapter ─────────────────────
// "Expected" = any (canon_id, ord_c) that ANY corpus has, plus every tokens_bhs chapter.
// That makes corpus.db its own source of truth — no external chapter-count table to drift.
const expected = new Map();   // canon_id -> Set(chapter)
const engHas   = new Map();   // canon_id -> Set(chapter)
const codeOf   = new Map();   // canon_id -> code
const otherCorpora = new Map(); // "canon_id:chapter" -> Set(corpus) present (non-ENG)

for (const r of cdb.prepare(
    `SELECT canon_id, ord_c, corpus, MIN(code) code FROM verses
     WHERE canon_id IS NOT NULL AND ord_c IS NOT NULL GROUP BY canon_id, ord_c, corpus`).all()) {
  (expected.get(r.canon_id) || expected.set(r.canon_id, new Set()).get(r.canon_id)).add(r.ord_c);
  if (!codeOf.has(r.canon_id)) codeOf.set(r.canon_id, r.code);
  if (r.corpus === 'ENG') (engHas.get(r.canon_id) || engHas.set(r.canon_id, new Set()).get(r.canon_id)).add(r.ord_c);
  else (otherCorpora.get(`${r.canon_id}:${r.ord_c}`) || otherCorpora.set(`${r.canon_id}:${r.ord_c}`, new Set()).get(`${r.canon_id}:${r.ord_c}`)).add(r.corpus);
}
// tokens_bhs chapters (OT verse-list source) count as expected too
try {
  for (const r of cdb.prepare(`SELECT DISTINCT book_id canon_id, chapter FROM tokens_bhs WHERE chapter IS NOT NULL`).all())
    (expected.get(r.canon_id) || expected.set(r.canon_id, new Set()).get(r.canon_id)).add(r.chapter);
} catch { /* no tokens_bhs */ }

const noEng = [];      // books with expected chapters but ZERO English
const partialEng = []; // books with SOME English, missing chapters
for (const [cid, chaps] of [...expected].sort((a, b) => a[0] - b[0])) {
  const eng = engHas.get(cid) || new Set();
  const missing = [...chaps].filter(c => !eng.has(c)).sort((a, b) => a - b);
  if (!missing.length) continue;
  const langs = new Set();
  for (const c of missing) for (const l of (otherCorpora.get(`${cid}:${c}`) || [])) langs.add(l);
  const row = { canon_id: cid, code: codeOf.get(cid) || '?', expected: chaps.size,
                english: eng.size, missing_ch: missing.length,
                missing: missing.length > 14 ? missing.slice(0, 14).join(',') + '…' : missing.join(','),
                source_langs: [...langs].join(',') || '(none)' };
  (eng.size === 0 ? noEng : partialEng).push(row);
}

console.log('\n=== ENGLISH BASELINE COVERAGE ===');
if (noEng.length) {
  console.log(`\nBooks with NO English at all (${noEng.length}) — reader shows "not translated":`);
  console.table(noEng);
}
if (partialEng.length) {
  console.log(`\nBooks MISSING some English chapters (${partialEng.length}) — those chapters blank in Studio+reader:`);
  console.table(partialEng);
}
if (!noEng.length && !partialEng.length) console.log('\u2713 every expected chapter has an English baseline.');

// ── 2. Baseline-shadow risk in translation.db ───────────────────────────────────────
// If reseed wrote the baseline into translations.text for untouched verses, line 6403
// serves that STALE snapshot instead of the live englishBaseline — re-renders wouldn't
// show. Untouched = status 'none'; those rows should have empty text.
if (tdb) {
  const shadow = tdb.prepare(
    `SELECT COUNT(*) n FROM translations WHERE status='none' AND text IS NOT NULL AND TRIM(text)<>''`).get().n;
  const saved = tdb.prepare(`SELECT COUNT(*) n FROM translations WHERE status<>'none'`).get().n;
  console.log('\n=== translation.db ===');
  console.log(`saved (status<>none): ${NL(saved)}`);
  if (shadow > 0) {
    console.log(`\u26a0 SHADOW RISK: ${NL(shadow)} untouched rows (status='none') carry non-empty text.`);
    console.log('  Line 6403 serves saved text over the live baseline, so those verses will show the');
    console.log('  snapshot reseed wrote, NOT your latest render. reseed should leave status="none"');
    console.log('  rows with empty text (baseline stays live). Check reseed-translations.mjs.');
  } else {
    console.log('\u2713 no shadowing: untouched verses fall through to the live baseline.');
  }
} else {
  console.log('\n(translation.db not found — skipping shadow check)');
}

// ── 3. Live endpoint sanity: does a real chapter resolve verses like the API would? ──
// Mirror /api/translate/chapter's non-Hebrew verse-list query for one covered chapter.
const sample = cdb.prepare(
  `SELECT canon_id, ord_c FROM verses WHERE corpus='ENG' AND canon_id>66 AND ord_c IS NOT NULL LIMIT 1`).get();
if (sample) {
  const n = cdb.prepare(
    `SELECT COUNT(DISTINCT ord_v) n FROM verses WHERE corpus='ENG' AND canon_id=? AND ord_c=?`)
    .get(sample.canon_id, sample.ord_c).n;
  console.log('\n=== endpoint sanity (apocrypha sample) ===');
  console.log(`canon_id ${sample.canon_id} ch ${sample.ord_c}: ${n} verses via the baseline verse-list query ` +
    (n > 0 ? '\u2713' : '\u2717 (chapter would open EMPTY)'));
}

const totalExpected = [...expected.values()].reduce((s, x) => s + x.size, 0);
const totalEng = [...engHas.values()].reduce((s, x) => s + x.size, 0);
console.log(`\n=== SUMMARY ===\nexpected chapters: ${NL(totalExpected)} · with English: ${NL(totalEng)} · missing: ${NL(totalExpected - totalEng)}`);

cdb.close(); tdb?.close();
if (STRICT && (noEng.length || partialEng.length)) process.exit(1);
