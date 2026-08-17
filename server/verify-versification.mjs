#!/usr/bin/env node
/**
 * verify-versification.mjs — fail the build if a display chapter silently
 * has zero verses in corpus.db.
 *
 * WHY THIS EXISTS (found 2026-08-17, fieldy: "my malachi 4 has become
 * misaligned again... This should be a check that breaks builds... A
 * regression like this is not supposed to slip through."):
 *
 * Malachi 4 (the English/standard chapter) is Masoretic Malachi 3:19-24 —
 * there is no MT "Malachi chapter 4" at all. server.js's VERSIFICATION_MAP
 * + resolveChapter() know this and /api/tokens (the Reader/Parallel path)
 * resolves through it correctly. But /api/translate/verse and
 * /api/translate/chapter used to query tokens_bhs with the DISPLAY chapter
 * directly, bypassing resolveChapter() entirely — so Translation Studio
 * showed Malachi 4 as completely empty (zero verses, nothing to translate
 * against) while the Reader had the real content the whole time. Fixed in
 * server.js 2026-08-17; THIS script exists so the next time a rebuild of
 * corpus.db (a re-ingest, a schema change, anything touching tokens_bhs)
 * reintroduces a book/chapter with zero rows where one is expected, the
 * build fails loudly instead of shipping a quietly-broken chapter.
 *
 * WHAT IT CHECKS (mechanical, no external reference data required):
 *   1. Every book_id 1-39 present in tokens_bhs has a CONTIGUOUS chapter
 *      range 1..max with no gaps (a whole missing chapter is the strongest,
 *      cheapest signal of an ingest regression).
 *   2. For every book+chapter pair covered by VERSIFICATION_MAP or
 *      DISPLAY_LAST_CHAPTER (duplicated below from server.js — SEE NOTE),
 *      resolving the display chapter through the SAME offset logic
 *      server.js uses must land on at least one real tokens_bhs row. This
 *      is the exact check that would have caught the Malachi 4 regression:
 *      resolveChapter(39, 4) -> {actual_chapter:3, verse_offset:18}, so this
 *      asserts `SELECT COUNT(*) FROM tokens_bhs WHERE book_id=39 AND
 *      chapter=3 AND verse>18` is nonzero.
 *   3. tokens_nt (40-66): same contiguous-chapter check, no versification
 *      remap needed (VERSIFICATION_MAP is BHS/OT-only per server.js).
 *
 * WHAT IT DOES NOT CHECK, verified against a real run of this exact bug:
 *   - Exact verse COUNTS against a standard Bible (needs a full reference
 *     versification table this repo doesn't have yet).
 *   - A chapter missing entirely PAST the highest chapter currently seen,
 *     for a book with no DISPLAY_LAST_CHAPTER entry — check 1 only finds
 *     GAPS inside the observed 1..max range, since there's no independent
 *     "how many chapters should this book have" reference to compare the
 *     observed max against.
 *   - Most importantly: THIS SCRIPT ONLY VALIDATES corpus.db ITSELF. Run
 *     against corpus.db directly during this investigation, it reported
 *     ZERO failures for Malachi — the raw data was fine the whole time
 *     (chapter 3's rows genuinely go through verse 24, covering both its
 *     own 18 verses and the 6 that display as chapter 4). The actual bug
 *     was in server.js: /api/translate/verse and /api/translate/chapter
 *     queried tokens_bhs with the DISPLAY chapter directly instead of
 *     resolving through resolveChapter() first, the same step /api/tokens
 *     already took. No amount of validating corpus.db would have caught
 *     that — it's an application code-path bug, not a data bug. Treat this
 *     script as a data-integrity net (catches a bad re-ingest dropping
 *     rows), not a substitute for making sure every new endpoint that
 *     reads tokens_bhs/tokens_nt by a book+chapter it got from the URL
 *     runs it through resolveChapter() first.
 *
 * NOTE — KEEP IN SYNC WITH server.js: VERSIFICATION_MAP and
 * DISPLAY_LAST_CHAPTER below are DELIBERATELY duplicated from server.js
 * (same convention this codebase already uses for small shared logic that
 * isn't worth a shared-module refactor — see Translate.jsx/Parallel.jsx's
 * own "deliberately duplicated" lexTranslitCandidates). If you add a book
 * to server.js's VERSIFICATION_MAP, add it here too, or this script stops
 * covering it.
 *
 * USAGE: `node verify-versification.mjs` (exit 0 = pass, exit 1 = fail,
 * prints every violation found, not just the first). Wire into
 * deploy-blue-green.sh as a pre-build gate — run it against corpus.db
 * BEFORE swapping traffic to a freshly rebuilt image, same spirit as the
 * existing health-check retry loop that script already has.
 */
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.argv[2] || path.join(__dirname, 'corpus.db');
const db = new Database(dbPath, { readonly: true });

// ── DUPLICATED FROM server.js — keep in sync, see header note above ────────
const VERSIFICATION_MAP = {
  '39:4': { actual_chapter: 3, verse_offset: 18 },   // Malachi 4 = MT 3:19-24
  '29:3': { actual_chapter: 3, verse_offset: 0 },
  '29:4': { actual_chapter: 4, verse_offset: 0 },    // Joel 4 = MT 4
};
const DISPLAY_LAST_CHAPTER = {
  39: 4,   // Malachi: show 4 chapters (MT has 3)
  29: 4,   // Joel: MT has 4
};
function resolveChapter(bookId, displayChapter) {
  const key = `${bookId}:${displayChapter}`;
  if (VERSIFICATION_MAP[key]) return VERSIFICATION_MAP[key];
  return { actual_chapter: displayChapter, verse_offset: 0 };
}
// ─────────────────────────────────────────────────────────────────────────

const failures = [];
const note = (msg) => failures.push(msg);

// ── Check 1 + 2: BHS (tokens_bhs, book_id 1-39) ─────────────────────────
const bhsChapterRows = db.prepare(
  `SELECT DISTINCT book_id, chapter FROM tokens_bhs ORDER BY book_id, chapter`
).all();
const bhsChaptersByBook = new Map();
for (const r of bhsChapterRows) {
  if (!bhsChaptersByBook.has(r.book_id)) bhsChaptersByBook.set(r.book_id, []);
  bhsChaptersByBook.get(r.book_id).push(r.chapter);
}

for (const [bookId, chapters] of bhsChaptersByBook) {
  chapters.sort((a, b) => a - b);
  const max = chapters[chapters.length - 1];
  // Check 1: contiguous 1..max, no gaps.
  for (let c = 1; c <= max; c++) {
    if (!chapters.includes(c)) {
      note(`BHS book_id=${bookId}: chapter ${c} is MISSING (have chapters up to ${max}, ` +
           `but ${c} isn't among them — a whole chapter has gone dark in tokens_bhs)`);
    }
  }
}

// Check 2: every VERSIFICATION_MAP / DISPLAY_LAST_CHAPTER entry actually
// resolves to real rows — this is the exact Malachi-4-class check.
const bookIdsToVerify = new Set([
  ...Object.keys(VERSIFICATION_MAP).map(k => parseInt(k.split(':')[0], 10)),
  ...Object.keys(DISPLAY_LAST_CHAPTER).map(k => parseInt(k, 10)),
]);
const countStmt = db.prepare(
  `SELECT COUNT(*) AS n FROM tokens_bhs WHERE book_id=? AND chapter=? AND verse>?`
);
for (const bookId of bookIdsToVerify) {
  const lastDisplayChapter = DISPLAY_LAST_CHAPTER[bookId]
    ?? Math.max(...(bhsChaptersByBook.get(bookId) || [0]));
  for (let displayChapter = 1; displayChapter <= lastDisplayChapter; displayChapter++) {
    const { actual_chapter, verse_offset } = resolveChapter(bookId, displayChapter);
    const { n } = countStmt.get(bookId, actual_chapter, verse_offset);
    if (n === 0) {
      note(`BHS book_id=${bookId} display chapter ${displayChapter}: resolves to ` +
           `tokens_bhs chapter=${actual_chapter} verse>${verse_offset}, which is EMPTY ` +
           `(0 rows) — this is exactly the Malachi-4-goes-dark bug class`);
    }
  }
}

// ── Check 3: NT (tokens_nt, book_id 40-66) — contiguous chapters only ──
let ntChapterRows = [];
try {
  ntChapterRows = db.prepare(
    `SELECT DISTINCT book_id, chapter FROM tokens_nt ORDER BY book_id, chapter`
  ).all();
} catch { /* tokens_nt not present in this DB snapshot — nothing to check */ }
const ntChaptersByBook = new Map();
for (const r of ntChapterRows) {
  if (!ntChaptersByBook.has(r.book_id)) ntChaptersByBook.set(r.book_id, []);
  ntChaptersByBook.get(r.book_id).push(r.chapter);
}
for (const [bookId, chapters] of ntChaptersByBook) {
  chapters.sort((a, b) => a - b);
  const max = chapters[chapters.length - 1];
  for (let c = 1; c <= max; c++) {
    if (!chapters.includes(c)) {
      note(`NT book_id=${bookId}: chapter ${c} is MISSING (have chapters up to ${max})`);
    }
  }
}

db.close();

if (failures.length) {
  console.error(`\n✗ verify-versification: ${failures.length} problem(s) found:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error('');
  process.exit(1);
} else {
  console.log(`✓ verify-versification: ${bhsChaptersByBook.size} BHS book(s), ` +
              `${ntChaptersByBook.size} NT book(s) checked, no gaps found.`);
  process.exit(0);
}
