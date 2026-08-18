#!/usr/bin/env node
/**
 * verify-verse-completeness.mjs — fail the build if a canonical verse
 * renders BLANK in prod (the reader shows a verse number with no text).
 *
 * WHY THIS EXISTS (found 2026-08-18, investigating 1 Chronicles 5 — a
 * Strong's # lookup led to the verse, which led to discovering 15 blank
 * verses at the top of the chapter, which led to discovering the SAME bug
 * (alignChapter()'s leading-superscription heuristic in
 * load-english-baseline.js, applied to every book instead of just Psalms)
 * had silently corrupted 100 chapters / 181 verses across the whole Bible —
 * some blank, some showing another verse's text under the wrong number.
 * verify-versification.mjs (the existing sibling check) explicitly documents
 * that it does NOT catch this class of bug: "Exact verse COUNTS against a
 * standard Bible (needs a full reference versification table this repo
 * doesn't have yet)." This script IS that check — for every verse the
 * reference grid says should exist, does ANYTHING (translation.db's saved/
 * pre-seeded text, or corpus.db's ENG baseline) actually render non-blank
 * text for it? That's the exact question a reader is asking when they open
 * a chapter.
 *
 * REFERENCE SOURCE — deliberately corpus.db's OWN tokens_bhs, not bible.db's.
 * Found 2026-08-18: this repo has TWO separate tokens_bhs tables (bible.db's,
 * which server.js's main OT reading path queries, and corpus.db's, which
 * load-english-baseline.js and verify-versification.mjs both default to) and
 * they do NOT agree on Psalm verse numbering — corpus.db's gives a
 * superscription its own verse 0 (Psalm 51 = [0,1,...,19]); an earlier check
 * against bible.db implied plain 1..N numbering with the "extra" verse at
 * the END instead. Comparing corpus.db's WRITTEN data against bible.db's
 * reference would flag a false regression on every Psalm from that mismatch
 * alone. This script checks corpus.db against ITSELF — the same table
 * load-english-baseline.js aligns to — so a real gap is real regardless of
 * which tokens_bhs table is "more correct". That bible.db/corpus.db
 * discrepancy is a separate, worthwhile thing to chase down later; it's not
 * blocking this check, but don't be surprised if BHS-based reading views
 * (which use bible.db) and the English/Translation Studio views (which use
 * corpus.db) turn out to number a Psalm differently until it's resolved.
 *
 * VERSE 0 EXCEPTION: corpus.db's tokens_bhs numbers a few structural items
 * (a Psalm's superscription, etc) as verse 0. WEB never has a verse 0, so
 * it's expected to be permanently blank for any chapter that has one — a
 * real structural non-verse, not a data gap. Exempted unconditionally, for
 * every book.
 *
 * KNOWN-GAPS ALLOWLIST: some chapters are missing verses from the WEB source
 * ingestion itself (english-baseline.jsonl) — not a rendering bug, a genuine
 * "we don't have this verse's English yet" gap pending a re-fetch (see
 * fetch-missing-books.mjs / fetch-web-strongs.mjs). Failing the build on
 * every one of those forever isn't useful, so they're tracked in
 * verse-completeness-known-gaps.json (checked into the repo). A blank verse
 * NOT in that file fails the build (a regression). A blank verse IN that
 * file is reported but does not fail — shrink the file as gaps get
 * re-fetched. Regenerate after a deliberate re-ingest with:
 *     node verify-verse-completeness.mjs --write-allowlist
 *
 * USAGE:
 *     node verify-verse-completeness.mjs [corpus.db] [translation.db]
 *     node verify-verse-completeness.mjs --write-allowlist   # snapshot current gaps as accepted
 * Exit 0 = pass (no NEW blanks), exit 1 = fail (prints every violation).
 * Wire into deploy-blue-green.sh alongside the existing verify-versification.mjs
 * call — same spirit, same gate, run BEFORE swapping traffic to a freshly
 * rebuilt image.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbArg = (suffix) => process.argv.find(a => a.endsWith(suffix) && !a.startsWith('--'));
const CORPUS_DB = dbArg('corpus.db') || path.join(__dirname, 'corpus.db');
const TRANS_DB = dbArg('translation.db') || path.join(__dirname, 'translation.db');
const ALLOWLIST_PATH = path.join(__dirname, 'verse-completeness-known-gaps.json');
const WRITE_ALLOWLIST = process.argv.includes('--write-allowlist');

const STRUCTURAL_VERSE = 0; // MT's non-verse slot (superscriptions etc) — always exempt.

const BOOK_NAMES = {
   1:'Genesis',2:'Exodus',3:'Leviticus',4:'Numbers',5:'Deuteronomy',6:'Joshua',7:'Judges',8:'Ruth',
   9:'1 Samuel',10:'2 Samuel',11:'1 Kings',12:'2 Kings',13:'1 Chronicles',14:'2 Chronicles',15:'Ezra',
  16:'Nehemiah',17:'Esther',18:'Job',19:'Psalms',20:'Proverbs',21:'Ecclesiastes',22:'Song of Songs',
  23:'Isaiah',24:'Jeremiah',25:'Lamentations',26:'Ezekiel',27:'Daniel',28:'Hosea',29:'Joel',30:'Amos',
  31:'Obadiah',32:'Jonah',33:'Micah',34:'Nahum',35:'Habakkuk',36:'Zephaniah',37:'Haggai',38:'Zechariah',
  39:'Malachi',40:'Matthew',41:'Mark',42:'Luke',43:'John',44:'Acts',45:'Romans',46:'1 Corinthians',
  47:'2 Corinthians',48:'Galatians',49:'Ephesians',50:'Philippians',51:'Colossians',52:'1 Thessalonians',
  53:'2 Thessalonians',54:'1 Timothy',55:'2 Timothy',56:'Titus',57:'Philemon',58:'Hebrews',59:'James',
  60:'1 Peter',61:'2 Peter',62:'1 John',63:'2 John',64:'3 John',65:'Jude',66:'Revelation',
};

function die(m) { console.error('✗ ' + m); process.exit(1); }
for (const [label, p] of [['corpus.db', CORPUS_DB], ['translation.db', TRANS_DB]])
  if (!fs.existsSync(p)) die(`${label} not found at ${p}`);

const cdb = new Database(CORPUS_DB, { readonly: true });
const tdb = new Database(TRANS_DB, { readonly: true });

// ── reference verse grid: OT from corpus.db's OWN tokens_bhs, NT from its GNT source ──
const ref = new Map(); // "book:chapter" -> Set(verse)
for (const { book_id, chapter, verse } of cdb.prepare(
    'SELECT DISTINCT book_id, chapter, verse FROM tokens_bhs WHERE book_id BETWEEN 1 AND 39').all()) {
  const k = `${book_id}:${chapter}`;
  (ref.get(k) ?? ref.set(k, new Set()).get(k)).add(verse);
}
for (const { canon_id, ord_c, ord_v } of cdb.prepare(
    "SELECT canon_id, ord_c, ord_v FROM verses WHERE corpus='GNT' AND canon_id BETWEEN 40 AND 66").all()) {
  const k = `${canon_id}:${ord_c}`;
  (ref.get(k) ?? ref.set(k, new Set()).get(k)).add(ord_v);
}

// ── what actually renders: translation.db saved text, else corpus.db ENG ──────
const engText = new Map(); // "book:chapter:verse" -> text
for (const { canon_id, ord_c, ord_v, text } of cdb.prepare(
    "SELECT canon_id, ord_c, ord_v, text FROM verses WHERE corpus='ENG' AND canon_id BETWEEN 1 AND 66").all()) {
  engText.set(`${canon_id}:${ord_c}:${ord_v}`, text);
}
const transText = new Map(); // "book:chapter:verse" -> text
for (const { book_id, chapter, verse, text } of tdb.prepare(
    'SELECT book_id, chapter, verse, text FROM translations WHERE book_id BETWEEN 1 AND 66').all()) {
  transText.set(`${book_id}:${chapter}:${verse}`, text);
}

function isBlank(s) { return !s || !String(s).trim(); }

// ── find every canonical verse that renders blank, excluding verse 0 ───────
const flagged = []; // { book, chapter, verse }
for (const [key, verses] of ref) {
  const [bookStr, chStr] = key.split(':');
  const book = +bookStr, ch = +chStr;
  for (const v of verses) {
    if (v === STRUCTURAL_VERSE) continue; // MT's title/superscription slot — never a real verse
    const k = `${book}:${ch}:${v}`;
    if (isBlank(engText.get(k)) && isBlank(transText.get(k))) {
      flagged.push({ book, chapter: ch, verse: v });
    }
  }
}
flagged.sort((a, b) => a.book - b.book || a.chapter - b.chapter || a.verse - b.verse);

// ── --write-allowlist: snapshot current state as accepted ──────────────────
if (WRITE_ALLOWLIST) {
  const out = flagged.map(f => `${f.book}:${f.chapter}:${f.verse}`);
  fs.writeFileSync(ALLOWLIST_PATH, JSON.stringify({
    _comment: 'Verses genuinely absent from the WEB source ingestion (english-baseline.jsonl) as of the date below — ' +
              'not a rendering bug, a real gap pending re-fetch (see fetch-missing-books.mjs / fetch-web-strongs.mjs). ' +
              'Verse 0 (MT superscription slots) is never listed here — it is unconditionally exempt, see file header. ' +
              'Regenerate with: node verify-verse-completeness.mjs --write-allowlist',
    generated: new Date().toISOString(),
    count: out.length,
    gaps: out,
  }, null, 2) + '\n');
  console.log(`✓ wrote ${out.length} known gap(s) to ${path.basename(ALLOWLIST_PATH)}`);
  process.exit(0);
}

// ── compare against the checked-in allowlist ────────────────────────────────
let allowSet = new Set();
if (fs.existsSync(ALLOWLIST_PATH)) {
  try { allowSet = new Set(JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8')).gaps || []); }
  catch { die(`could not parse ${ALLOWLIST_PATH} — fix or regenerate with --write-allowlist`); }
}

const regressions = flagged.filter(f => !allowSet.has(`${f.book}:${f.chapter}:${f.verse}`));
const stillAllowed = flagged.filter(f => allowSet.has(`${f.book}:${f.chapter}:${f.verse}`));
const stale = [...allowSet].filter(k => !flagged.some(f => `${f.book}:${f.chapter}:${f.verse}` === k));

console.log(`verify-verse-completeness: ${ref.size} chapters checked, ` +
            `${flagged.length} blank verse(s) found (verse 0 / superscriptions excluded), ` +
            `${stillAllowed.length} pre-existing (allowlisted), ${regressions.length} NEW.`);
if (stale.length) {
  console.log(`  (note: ${stale.length} allowlist entr${stale.length === 1 ? 'y is' : 'ies are'} now fixed — ` +
              `safe to remove from ${path.basename(ALLOWLIST_PATH)})`);
}

if (regressions.length) {
  console.error(`\n✗ verify-verse-completeness: ${regressions.length} verse(s) render BLANK and are NOT in the ` +
                `known-gaps allowlist — this is a regression:\n`);
  for (const f of regressions) {
    console.error(`  - ${BOOK_NAMES[f.book] || `book${f.book}`} ${f.chapter}:${f.verse}`);
  }
  console.error(`\nIf this is a genuine, already-known source gap (not a new bug), run ` +
                `\`node verify-verse-completeness.mjs --write-allowlist\` to accept it. Otherwise fix the ` +
                `underlying ingestion/alignment bug.\n`);
  process.exit(1);
} else {
  console.log('✓ verify-verse-completeness: no new blank verses.');
  process.exit(0);
}
