#!/usr/bin/env node
/**
 * verify-english-versification.mjs — HARD GATE: for every book in
 * versification-differences.json, the English-authoritative chapter/verse
 * resolution server.js computes (resolveEnglishChapter/ENG_CHAPTER_SEGMENTS)
 * must be internally consistent — no gaps, no duplicated verse numbers, and
 * every BHS verse claimed by exactly one English chapter/verse.
 *
 * WHY THIS EXISTS (fieldy, 2026-08-20: "I want my app to line up with what
 * everyone will line up with in their bible. My Deuteronomy 12 has 31 verses
 * instead of 32."): display authority for the ~23 non-Psalms OT books in
 * versification-differences.json flipped from BHS/Masoretic numbering to
 * English/KJV-tradition numbering. Unlike the old resolveChapter()
 * (VERSIFICATION_MAP), which only ever expressed "one display chapter = one
 * BHS chapter + a constant offset," an English chapter is now often
 * ASSEMBLED from two adjacent BHS chapters (e.g. English Numbers 16 = BHS
 * Numbers 16 in full + BHS Numbers 17:1-15). That's real reflow logic, not a
 * lookup table — an off-by-one in versification-differences.json or in the
 * segment-building code could silently duplicate a verse number, skip one
 * entirely, or drop content from the site, exactly the class of bug a
 * mistyped verse-range boundary would cause. This is 100% mechanical and
 * needs no external reference data or human judgement, so it belongs in the
 * deploy hot path like the other DATA GATES, not as a manual spot-check.
 *
 * THIS SCRIPT DUPLICATES server.js's buildEnglishVersificationSegments logic
 * (KEEP IN SYNC WITH server.js if that logic ever changes) rather than
 * importing server.js directly — same convention verify-versification.mjs
 * already uses for VERSIFICATION_MAP/resolveChapter().
 *
 * WHAT IT CHECKS, per affected book:
 *   1. Every English chapter's segments tile verses 1..N with NO gaps and NO
 *      duplicates (each segment's engStart must be exactly the previous
 *      segment's engEnd + 1, starting at 1).
 *   2. Every BHS (chapter, verse) that actually exists in tokens_bhs for that
 *      book is claimed by EXACTLY ONE English segment — nothing dropped,
 *      nothing double-counted across a chapter boundary.
 *
 * WHAT IT DOES NOT CHECK:
 *   - Whether versification-differences.json's verse-range boundaries are
 *     THEMSELVES correct against a real Hebrew/English Bible (that's the
 *     live browser spot-check against biblehub.com the original Deuteronomy
 *     13/Numbers 17/Jonah 2 finding used — this gate only checks the data is
 *     INTERNALLY consistent, not that it's the right data).
 *   (Malachi and Joel are ordinary entries since 2026-11-26.)
 *   - Psalms (19) — still out of scope everywhere in this feature.
 *
 * USAGE:
 *   node verify-english-versification.mjs [dbPath] [--force]
 * (exit 0 = pass, exit 1 = fail. dbPath defaults to corpus.db next to this
 * script; in production it's /data/corpus.db. --force bypasses the
 * skip-if-unchanged cache.) Wired into deploy-blue-green.sh's DATA GATES,
 * run against /data/corpus.db on the live volume BEFORE swapping traffic —
 * same spirit, same place as the other verify-*.mjs/.js gates.
 *
 * SKIP-IF-UNCHANGED CACHE — same reasoning and placement rule as
 * verify-parallel-alignment.mjs (see that file's header for the full
 * explanation): fingerprints dbPath (cheap stat — it's on the persistent
 * data volume, untouched by image rebuilds) plus versification-differences.json
 * (content hash — it lives in the image, and Docker's COPY resets mtimes on
 * every build even when content is unchanged). Cache file lives next to
 * dbPath, NOT next to this script, because this runs inside an ephemeral
 * `docker run --rm` container — anything written next to the script vanishes
 * the instant that container exits.
 */
import { createRequire } from 'node:module';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const positional = args.filter(a => !a.startsWith('--'));
const dbPath = positional[0] || path.join(__dirname, 'corpus.db');
const VD_PATH = path.join(__dirname, 'versification-differences.json');
// Next to dbPath (persistent data volume), NOT next to __dirname (ephemeral
// --rm image) — see SKIP-IF-UNCHANGED CACHE above.
const CACHE_PATH = path.join(path.dirname(dbPath), '.english-versification-verify-cache.json');

if (!fs.existsSync(dbPath)) {
  console.log(`[english-versification gate] SKIPPED — ${dbPath} not found, nothing to gate yet`);
  process.exit(0);
}
if (!fs.existsSync(VD_PATH)) {
  console.log(`[english-versification gate] SKIPPED — ${path.basename(VD_PATH)} not found, nothing to gate yet`);
  process.exit(0);
}

function fingerprint() {
  const statFP = (p) => {
    try { const s = fs.statSync(p); return { size: s.size, mtimeMs: s.mtimeMs }; }
    catch { return null; }
  };
  const hashFP = (p) => {
    try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
    catch { return null; }
  };
  return { dbPath, db: statFP(dbPath), vdHash: hashFP(VD_PATH), vsHash: hashFP(path.join(__dirname, 'eng-versification.cjs')) };
}
const fpEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

if (!FORCE) {
  let cache = null;
  try { cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch { /* no cache yet */ }
  if (cache && cache.ok && fpEqual(cache.fingerprint, fingerprint())) {
    console.log(`verify-english-versification: SKIPPED — ${dbPath} and ${path.basename(VD_PATH)} are ` +
      `byte-identical to the last verified-clean pass (${cache.verifiedAt}); no recompute needed. ` +
      `Use --force to re-scan anyway.`);
    process.exit(0);
  }
}

const VERSIFICATION_DIFFERENCES = JSON.parse(fs.readFileSync(VD_PATH, 'utf8')).differences || {};

const db = new Database(dbPath, { readonly: true });
let failures = [];
let booksChecked = 0;
let versesChecked = 0;

try {
  // 2026-11-26: built from eng-versification.cjs — the ONE reader server.js and the pipeline share (fieldy: modern numbers
  // everywhere unless something is completely dropped; folds, a split verse and an added verse are listed in the file).
  const VS = createRequire(import.meta.url)('./eng-versification.cjs');
  const affectedBooks = new Set([
    ...Object.keys(VERSIFICATION_DIFFERENCES).map(k => parseInt(k.split(':')[0], 10)),
    ...Object.keys(VS.DATA.added || {}).map(k => parseInt(k.split(':')[0], 10)),
  ]);
  for (const bookId of affectedBooks) {
    const rows = db.prepare(`SELECT chapter, verse, MAX(token_ordinal) AS m FROM tokens_bhs WHERE book_id=? AND verse > 0 GROUP BY chapter, verse`).all(bookId);
    if (!rows.length) continue;
    booksChecked++;
    const maxOrd = new Map(rows.map(r => [`${r.chapter}:${r.verse}`, r.m]));
    // every English verse of the book
    const site = new Map();   // engChapter -> Set(verse)
    const addSite = (c, v) => { if (!site.has(c)) site.set(c, new Set()); site.get(c).add(v); };
    for (const r of rows) for (const [, c, v] of VS.mtToSite(bookId, r.chapter, r.verse)) addSite(c, v);
    for (const k of Object.keys(VS.DATA.added || {})) { const [b, c, v] = k.split(':').map(Number); if (b === bookId) addSite(c, v); }
    // ── CHECK 1: every English chapter is verses 1..N, each with a Hebrew verse (or a listed addition) of its own
    const used = new Map();   // "c:v" -> [ [from, to] … ] word ranges of the Hebrew verse that are shown
    for (const [c, set] of site) {
      const vs = [...set].sort((a, b) => a - b);
      vs.forEach((v, i) => { if (v !== i + 1) failures.push(`book=${bookId} English ${c}: verse ${i + 1} missing (have ${v}) — gap`); });
      for (const v of vs) {
        const src = VS.siteSources(bookId, c, v);
        if (!src.some(x => x.role !== 'fold')) failures.push(`book=${bookId} English ${c}:${v}: no Hebrew verse of its own`);
        for (const x of src) {
          if (x.role === 'added') continue;
          if (x.b !== bookId) { failures.push(`book=${bookId} English ${c}:${v}: source in another book`); continue; }
          const key = `${x.c}:${x.v}`, top = maxOrd.get(key) || 0;
          if (!top) { failures.push(`book=${bookId} English ${c}:${v}: Hebrew ${key} does not exist`); continue; }
          (used.get(key) || used.set(key, []).get(key)).push(x.words ? [x.words[0], Math.min(x.words[1], top)] : [1, top]);
        }
      }
    }
    // ── CHECK 2: every Hebrew verse is shown exactly once, all its words, none twice
    for (const r of rows) {
      versesChecked++;
      const key = `${r.chapter}:${r.verse}`, ranges = (used.get(key) || []).sort((a, b) => a[0] - b[0]);
      if (!ranges.length) { failures.push(`book=${bookId} BHS ${key}: DROPPED — shown under no English verse`); continue; }
      let next = 1;
      for (const [f, t] of ranges) { if (f !== next) failures.push(`book=${bookId} BHS ${key}: words ${next}..${f - 1} ${f > next ? 'dropped' : 'shown twice'}`); next = t + 1; }
      if (next !== r.m + 1) failures.push(`book=${bookId} BHS ${key}: words ${next}..${r.m} dropped`);
    }
  }
} finally {
  db.close();
}

console.log(`verify-english-versification: ${booksChecked} book(s), ${versesChecked.toLocaleString()} BHS ` +
  `verse(s) checked, ${failures.length.toLocaleString()} problem(s) found.`);

if (failures.length) {
  console.error(`\n✗ verify-english-versification: ${failures.length.toLocaleString()} problem(s):\n`);
  for (const f of failures.slice(0, 200)) console.error(`  - ${f}`);
  if (failures.length > 200) console.error(`  ...and ${failures.length - 200} more.`);
  console.error(`\nCheck versification-differences.json for a bad verse-range boundary, or server.js's ` +
    `buildEnglishVersificationSegments if the segment logic itself changed.\n`);
  process.exit(1);
} else {
  console.log('✓ verify-english-versification: every affected book resolves to a clean, gap-free, ' +
    'non-duplicated English verse sequence.');
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify({
      ok: true,
      verifiedAt: new Date().toISOString(),
      fingerprint: fingerprint(),
    }, null, 2) + '\n');
  } catch { /* cache write is an optimization, never fatal */ }
  process.exit(0);
}
