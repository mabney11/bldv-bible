#!/usr/bin/env node
/**
 * ingest-refs.cjs
 *
 * Reads `refs.txt` (pipe-delimited verse dump from the master DB) and produces
 * three new SQLite databases alongside `bible.db`:
 *   - server/lxx.db   (Septuagint Greek, 29,427 verses across 56 books)
 *   - server/gnt.db   (Greek New Testament, 7,943 verses across 27 books)
 *   - server/geez.db  (Ge'ez biblical text, 23,991 verses across 22 books)
 *
 * Schema mirrors the existing `bhs_verses` table so the rest of the app can
 * treat all four sources uniformly. Each DB has:
 *
 *   verses(
 *     ref_key   TEXT PRIMARY KEY,   -- '<SOURCE>|<book_id>|<chapter>|<verse>'
 *     book_id   INTEGER NOT NULL,
 *     chapter   INTEGER NOT NULL,
 *     verse     INTEGER NOT NULL,
 *     text      TEXT NOT NULL
 *   )
 *
 * Ge'ez uses 3-letter book codes (GEN, EXO, PSA, ...) in the dump; this
 * script maps them to the same integer book IDs the Hebrew DB uses so cross-
 * source linkage is trivial (Heb book 1 ↔ LXX book 1 ↔ Ge'ez book 1).
 *
 * Usage:
 *   node scripts/ingest-refs.cjs --source /path/to/refs.txt
 *
 * Idempotent: drops and recreates the verses table on each run.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const argv = (flag, def) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : def;
};

const SOURCE = argv('--source', '/mnt/user-data/uploads/refs.txt');
const OUT_DIR = argv('--out', path.join(__dirname, '..', 'server'));

if (!fs.existsSync(SOURCE)) {
    console.error(`refs file not found: ${SOURCE}`);
    process.exit(1);
}

// Loud version banner so it's obvious which version of this script ran.
// The OLD ingest doesn't print this; if you don't see this line in your
// console output, you're running an outdated copy. Re-extract the zip,
// making sure to OVERWRITE existing files (Windows: select "Replace the
// files in the destination" when prompted, or delete the old folder first).
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  ingest-refs.cjs v2 — all-Ge\'ez ingest (BETMAS_GEZ_V/ETH/W)');
console.log('  Expected output: GEZ canonical ~28,167 rows, GEZ literary ~69,923 rows');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// ── 3-letter book code → integer book ID ────────────────────────────────────
// Matches the IDs used by bhs_verses / tokens_bhs so a Ge'ez Genesis 1:1
// shares book_id=1 with Hebrew Genesis 1:1. The standard 66-book Protestant
// canon is 1-66; we extend with the Ethiopic-canon-additional books at 67+
// so the same `verses` table can hold all Ethiopic biblical material.
const BOOK_CODE_TO_ID = {
    GEN: 1,  EXO: 2,  LEV: 3,  NUM: 4,  DEU: 5,
    JOS: 6,  JDG: 7,  RUT: 8,  '1SA': 9,  '2SA': 10,
    '1KI': 11, '2KI': 12, '1CH': 13, '2CH': 14, EZR: 15,
    NEH: 16, EST: 17, JOB: 18, PSA: 19, PRO: 20,
    ECC: 21, SNG: 22, ISA: 23, JER: 24, LAM: 25,
    EZK: 26, DAN: 27, HOS: 28, JOL: 29, AMO: 30,
    OBA: 31, JON: 32, MIC: 33, NAM: 34, HAB: 35,
    ZEP: 36, HAG: 37, ZEC: 38, MAL: 39,
    MAT: 40, MRK: 41, LUK: 42, JHN: 43, ACT: 44,
    ROM: 45, '1CO': 46, '2CO': 47, GAL: 48, EPH: 49,
    PHP: 50, COL: 51, '1TH': 52, '2TH': 53, '1TI': 54,
    '2TI': 55, TIT: 56, PHM: 57, HEB: 58, JAS: 59,
    '1PE': 60, '2PE': 61, '1JN': 62, '2JN': 63, '3JN': 64,
    JUD: 65, REV: 66,
    // Ethiopic biblical canon additions (BETMAS_GEZ_ETH)
    ENO: 67, JUB: 68, MAC: 69, SIR: 70, WIS: 71,
};

// ── load sqlite shim ────────────────────────────────────────────────────────
let Database;
try { Database = require('better-sqlite3'); }
catch {
    const { DatabaseSync } = require('node:sqlite');
    Database = class {
        constructor(file, opts = {}) {
            this.db = new DatabaseSync(file, opts.readonly ? { readOnly: true } : {});
        }
        prepare(q) {
            const s = this.db.prepare(q);
            return { all: (...a) => s.all(...a), get: (...a) => s.get(...a), run: (...a) => s.run(...a) };
        }
        exec(sql) { return this.db.exec(sql); }
        transaction(fn) {
            return (...args) => {
                this.db.exec('BEGIN');
                try { const r = fn(...args); this.db.exec('COMMIT'); return r; }
                catch (e) { this.db.exec('ROLLBACK'); throw e; }
            };
        }
        close() { this.db.close(); }
    };
}

// ── parse the source file into rows grouped by destination DB ───────────────
console.log(`Reading ${SOURCE}…`);
const t0 = Date.now();
const lxx  = [];
const gnt  = [];
// Ge'ez has multiple subcorpora and we want ALL of them:
//   geezCanonical = verse-level canonical Bible (BETMAS_GEZ_V + BETMAS_GEZ_ETH).
//                    Has book_id 1-71 + ch:v.
//   geezLiterary  = verse-level literary corpus (BETMAS_GEZ_W).
//                    Has NO canonical book_id — accessed only by doc_id.
const geezCanonicalAll = []; // { doc_id, book_id, chapter, verse, text }
const geezLiteraryAll  = []; // { doc_id, chapter, verse, text }

let totalLines = 0;
let skipped    = { unknown_source: 0, unknown_book_code: 0, bad_format: 0, intentionally_skipped: 0 };
let countsBySrc = {};
const skippedSamples = [];

const lines = fs.readFileSync(SOURCE, 'utf8').split('\n');
for (const rawLine of lines) {
    if (!rawLine) continue;
    totalLines++;
    const parts = rawLine.split('|');
    if (parts.length < 6) { skipped.bad_format++; continue; }
    const src = parts[0];
    countsBySrc[src] = (countsBySrc[src] || 0) + 1;

    if (src === 'LXX' || src === 'GNT') {
        // Format: SRC|SRC|bookId|ch|v|verse|text  (book is already numeric)
        const refType = parts[5];
        if (refType !== 'verse') { skipped.bad_format++; continue; }
        const book = parseInt(parts[2], 10);
        const ch   = parseInt(parts[3], 10);
        const v    = parseInt(parts[4], 10);
        const text = parts.slice(6).join('|');
        if (!Number.isFinite(book) || !Number.isFinite(ch) || !Number.isFinite(v)) {
            skipped.bad_format++; continue;
        }
        (src === 'LXX' ? lxx : gnt).push({
            ref_key: `${src}|${book}|${ch}|${v}`,
            book_id: book, chapter: ch, verse: v, text,
        });
    } else if (src === 'BETMAS_GEZ_V' || src === 'BETMAS_GEZ_ETH') {
        // Format: SRC|SRC|doc_id|bookCode|ch:v|verse|text
        // Both variants share the same format; ETH covers Enoch/Jubilees/etc.
        const refType = parts[5];
        if (refType !== 'verse') { skipped.bad_format++; continue; }
        const docId    = parts[2];
        const bookCode = parts[3];
        const bcv      = parts[4];
        const text     = parts.slice(6).join('|');
        const bookId   = BOOK_CODE_TO_ID[bookCode];
        if (!bookId) {
            skipped.unknown_book_code++;
            if (skippedSamples.length < 5) skippedSamples.push(`unknown book code: ${bookCode}`);
            continue;
        }
        const colon = bcv.indexOf(':');
        if (colon < 0) { skipped.bad_format++; continue; }
        const ch = parseInt(bcv.slice(0, colon), 10);
        const v  = parseInt(bcv.slice(colon + 1), 10);
        if (!Number.isFinite(ch) || !Number.isFinite(v)) { skipped.bad_format++; continue; }
        geezCanonicalAll.push({ doc_id: docId, book_id: bookId, chapter: ch, verse: v, text });
    } else if (src === 'BETMAS_GEZ_W') {
        // Format: SRC|SRC|doc_id|doc_id|ch:v|verse|text
        // Ethiopic literary corpus — hagiographies, hymns, theology, etc.
        // No canonical book_id; we access these by doc_id.
        const refType = parts[5];
        if (refType !== 'verse') { skipped.bad_format++; continue; }
        const docId = parts[2];
        const bcv   = parts[4];
        const text  = parts.slice(6).join('|');
        const colon = bcv.indexOf(':');
        if (colon < 0) { skipped.bad_format++; continue; }
        const ch = parseInt(bcv.slice(0, colon), 10);
        const v  = parseInt(bcv.slice(colon + 1), 10);
        if (!Number.isFinite(ch) || !Number.isFinite(v)) { skipped.bad_format++; continue; }
        geezLiteraryAll.push({ doc_id: docId, chapter: ch, verse: v, text });
    } else if (src === 'BETMAS_GEZ' || src === 'BETMAS_ENG') {
        // BETMAS_GEZ is the doc-level view of the same content as BETMAS_GEZ_W
        // (we prefer _W because it has ch:v structure). BETMAS_ENG is English
        // summaries of a small subset of literary works — could be loaded
        // into a parallel translation table later.
        // Intentionally not ingested; not an error.
        skipped.intentionally_skipped++;
    } else {
        skipped.unknown_source++;
    }
}

// Dedupe canonical Ge'ez: for each (book, ch, v), keep the row whose doc_id
// sorts first. The chosen doc_id is preserved so the UI shows provenance.
const geezCanonMap = new Map();
for (const r of geezCanonicalAll) {
    const key = `${r.book_id}|${r.chapter}|${r.verse}`;
    const existing = geezCanonMap.get(key);
    if (!existing || r.doc_id < existing.doc_id) geezCanonMap.set(key, r);
}
const geezCanonicalDedup = [...geezCanonMap.values()].map(r => ({
    ref_key: `GEZ|${r.book_id}|${r.chapter}|${r.verse}`,
    doc_id:  r.doc_id,
    book_id: r.book_id, chapter: r.chapter, verse: r.verse, text: r.text,
}));

// Literary works keep ALL rows — each (doc, ch, v) is unique already.
// book_id is null; ref_key is doc-scoped.
//
// CRITICAL: a manuscript can appear in BOTH the canonical verse corpus
// (BETMAS_GEZ_V/ETH, which gives it a book_id and an aligned ch:v) AND the
// literary corpus (BETMAS_GEZ_W, which has its own, often off-by-one
// versification and sometimes blobs an entire prologue into "verse 1"). When
// that happens, the SAME doc_id ends up with two conflicting sets of rows, so
// reading the doc shows every verse twice and the tokenizer produces a
// hundreds-of-token "verse 1". A manuscript that is already a canonical
// witness does not also need its literary-corpus duplicate, so drop those
// literary rows. Purely-literary docs (no canonical counterpart) are untouched.
const canonicalWitnessIds = new Set(geezCanonicalDedup.map(r => r.doc_id));
const geezLiteraryKept = geezLiteraryAll.filter(r => !canonicalWitnessIds.has(r.doc_id));
const droppedLiteraryDupes = geezLiteraryAll.length - geezLiteraryKept.length;
const geezLiterary = geezLiteraryKept.map(r => ({
    ref_key: `GEZ|${r.doc_id}|${r.chapter}|${r.verse}`,
    doc_id:  r.doc_id,
    book_id: null,
    chapter: r.chapter, verse: r.verse, text: r.text,
}));

const geez = [...geezCanonicalDedup, ...geezLiterary];
const geezCanonDuplicates = geezCanonicalAll.length - geezCanonicalDedup.length;

console.log(`  Parsed ${totalLines.toLocaleString()} lines in ${Date.now() - t0}ms`);
console.log(`  Rows per source:`);
for (const [s, n] of Object.entries(countsBySrc)) console.log(`    ${s.padEnd(18)} ${n.toLocaleString()}`);
console.log(`  Ingested:`);
console.log(`    LXX  ............ ${lxx.length.toLocaleString()} rows`);
console.log(`    GNT  ............ ${gnt.length.toLocaleString()} rows`);
console.log(`    GEZ canonical ... ${geezCanonicalDedup.length.toLocaleString()} rows across ${new Set(geezCanonicalDedup.map(r=>r.book_id)).size} books (${geezCanonDuplicates.toLocaleString()} secondary witnesses dropped)`);
console.log(`    GEZ literary .... ${geezLiterary.length.toLocaleString()} rows across ${new Set(geezLiterary.map(r=>r.doc_id)).size} docs (${droppedLiteraryDupes.toLocaleString()} redundant copies of canonical witnesses dropped)`);
console.log(`  Skipped: ${JSON.stringify(skipped)}`);
if (skippedSamples.length) console.log(`    samples: ${skippedSamples.join('; ')}`);

// ── write each DB ───────────────────────────────────────────────────────────
function writeDb(filename, rows, opts = {}) {
    const target = path.join(OUT_DIR, filename);
    console.log(`Writing ${target} (${rows.length.toLocaleString()} rows)…`);
    const t0 = Date.now();
    if (fs.existsSync(target)) fs.unlinkSync(target);
    const db = new Database(target);
    const hasDocId = !!opts.hasDocId;
    const bookIdNullable = !!opts.bookIdNullable;
    const docIdCol = hasDocId ? 'doc_id TEXT, ' : '';
    const bookIdCol = bookIdNullable ? 'book_id INTEGER, ' : 'book_id INTEGER NOT NULL, ';
    db.exec(`
        CREATE TABLE verses (
            ref_key TEXT PRIMARY KEY,
            ${docIdCol}${bookIdCol}chapter INTEGER NOT NULL,
            verse   INTEGER NOT NULL,
            text    TEXT    NOT NULL
        );
        CREATE INDEX idx_verses_bcv ON verses(book_id, chapter, verse);
        ${hasDocId ? 'CREATE INDEX idx_verses_doc ON verses(doc_id, chapter, verse);' : ''}
    `);
    const sql = hasDocId
        ? `INSERT INTO verses (ref_key, doc_id, book_id, chapter, verse, text) VALUES (?,?,?,?,?,?)`
        : `INSERT INTO verses (ref_key, book_id, chapter, verse, text) VALUES (?,?,?,?,?)`;
    const ins = db.prepare(sql);
    const txn = db.transaction(rows => {
        for (const r of rows) {
            if (hasDocId) ins.run(r.ref_key, r.doc_id, r.book_id, r.chapter, r.verse, r.text);
            else ins.run(r.ref_key, r.book_id, r.chapter, r.verse, r.text);
        }
    });
    txn(rows);
    const stats = db.prepare(`
        SELECT COUNT(*) AS n,
               COUNT(DISTINCT book_id) AS books,
               COUNT(DISTINCT CASE WHEN book_id IS NULL THEN ${hasDocId ? 'doc_id' : 'null'} END) AS lit_docs
        FROM verses
    `).get();
    db.close();
    console.log(`  ✓ ${stats.n.toLocaleString()} rows, ${stats.books} canonical book(s)` +
                (stats.lit_docs ? `, ${stats.lit_docs.toLocaleString()} literary docs` : '') +
                ` in ${Date.now() - t0}ms`);
}

writeDb('lxx.db',  lxx);
writeDb('gnt.db',  gnt);
writeDb('geez.db', geez, { hasDocId: true, bookIdNullable: true });

console.log('\n✓ Ingestion complete.');
console.log('Next: re-run scripts/tokenize-multilang.cjs to repopulate tokens + surface_counts.');
