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
 *   - Malachi (39) / Joel (29), which stay on the older, narrower
 *     VERSIFICATION_MAP/resolveChapter() path — verify-versification.mjs
 *     already covers those.
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
  return { dbPath, db: statFP(dbPath), vdHash: hashFP(VD_PATH) };
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
  const affectedBooks = new Set(
    Object.keys(VERSIFICATION_DIFFERENCES).map(k => parseInt(k.split(':')[0], 10))
  );

  for (const bookId of affectedBooks) {
    const range = db.prepare(
      `SELECT MIN(chapter) AS first, MAX(chapter) AS last FROM tokens_bhs WHERE book_id=?`
    ).get(bookId);
    if (!range || range.first == null) continue; // book not present in this build's tokens_bhs
    booksChecked++;

    const counts = {};
    for (const row of db.prepare(
      `SELECT chapter, MAX(verse) AS maxV FROM tokens_bhs WHERE book_id=? GROUP BY chapter`
    ).all(bookId)) {
      counts[row.chapter] = row.maxV;
    }

    // ── Rebuild the segment table — KEEP IN SYNC WITH server.js's
    // buildEnglishVersificationSegments ────────────────────────────────────
    const segMap = {}; // engChapter -> [{hebChapter, hebStart, hebEnd, engStart}]
    // Verses that are the SOURCE of a "merge": true segment (currently only 1
    // Samuel 21's heb 20:42/21:1 — see versification-differences.json and
    // server.js's buildEnglishVersificationSegments) are deliberately left
    // unclaimed here, matching server.js's real behavior — CHECK 2 below treats
    // membership in this set as an expected 0, not a DROPPED error.
    const mergeSources = new Set();
    for (let heb = range.first; heb <= range.last; heb++) {
      const entries = VERSIFICATION_DIFFERENCES[`${bookId}:${heb}`];
      const maxV = counts[heb] || 0;
      if (entries && entries.length) {
        // `covered` = every explicit heb range for this chapter, merge included —
        // used only to find verses this chapter's entry never mentioned at all, so
        // they get an implicit identity segment (KEEP IN SYNC WITH server.js).
        const covered = [];
        for (const seg of entries) {
          covered.push([seg.heb[0], seg.heb[1]]);
          if (seg.merge) {
            for (let v = seg.heb[0]; v <= seg.heb[1]; v++) mergeSources.add(`${heb}:${v}`);
            continue;
          }
          (segMap[seg.engChapter] ||= []).push({
            hebChapter: heb, hebStart: seg.heb[0], hebEnd: seg.heb[1], engStart: seg.eng[0],
          });
        }
        if (maxV) {
          covered.sort((a, b) => a[0] - b[0]);
          let cursor = 1;
          for (const [s, e] of covered) {
            if (s > cursor) {
              (segMap[heb] ||= []).push({ hebChapter: heb, hebStart: cursor, hebEnd: s - 1, engStart: cursor });
            }
            cursor = Math.max(cursor, e + 1);
          }
          if (cursor <= maxV) {
            (segMap[heb] ||= []).push({ hebChapter: heb, hebStart: cursor, hebEnd: maxV, engStart: cursor });
          }
        }
      } else {
        if (!maxV) continue;
        (segMap[heb] ||= []).push({ hebChapter: heb, hebStart: 1, hebEnd: maxV, engStart: 1 });
      }
    }
    for (const eng of Object.keys(segMap)) segMap[eng].sort((a, b) => a.engStart - b.engStart);

    // ── CHECK 1: every English chapter tiles 1..N, no gaps, no duplicates ──
    for (const engChapter of Object.keys(segMap)) {
      const segs = segMap[engChapter];
      let expectedNext = 1;
      for (const seg of segs) {
        if (seg.hebEnd < seg.hebStart) {
          failures.push(`book=${bookId} eng${engChapter}: malformed segment from BHS ${seg.hebChapter} ` +
            `(hebStart=${seg.hebStart} > hebEnd=${seg.hebEnd})`);
          continue;
        }
        if (seg.engStart !== expectedNext) {
          failures.push(`book=${bookId} eng${engChapter}: segment from BHS ${seg.hebChapter}:${seg.hebStart}-` +
            `${seg.hebEnd} starts at English verse ${seg.engStart}, expected ${expectedNext} — gap or overlap`);
        }
        expectedNext = seg.engStart + (seg.hebEnd - seg.hebStart) + 1;
      }
    }

    // ── CHECK 2: every real BHS verse claimed by exactly one segment ───────
    const claimCount = new Map(); // "hebChapter:hebVerse" -> times claimed
    for (const engChapter of Object.keys(segMap)) {
      for (const seg of segMap[engChapter]) {
        for (let v = seg.hebStart; v <= seg.hebEnd; v++) {
          const k = `${seg.hebChapter}:${v}`;
          claimCount.set(k, (claimCount.get(k) || 0) + 1);
        }
      }
    }
    for (let heb = range.first; heb <= range.last; heb++) {
      const maxV = counts[heb] || 0;
      for (let v = 1; v <= maxV; v++) {
        versesChecked++;
        const k = `${heb}:${v}`;
        const claimed = claimCount.get(k) || 0;
        if (mergeSources.has(k)) {
          if (claimed !== 0) {
            failures.push(`book=${bookId} BHS ${heb}:${v}: merge-source verse unexpectedly claimed by ` +
              `${claimed} segment(s) (expected 0 — see "merge" handling)`);
          }
          continue;
        }
        if (claimed !== 1) {
          failures.push(`book=${bookId} BHS ${heb}:${v}: claimed by ${claimed} English segment(s), expected ` +
            `exactly 1 (${claimed === 0 ? 'DROPPED — this verse would vanish from the site' : 'DUPLICATED'})`);
        }
      }
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
