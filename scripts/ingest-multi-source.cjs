#!/usr/bin/env node
/**
 * ingest-multi-source.cjs
 *
 * Reads a pipe-delimited dump (refs.txt) of multi-source verse data and builds
 * server/multi-source.db with a clean schema optimized for the paleo-studio
 * app's navigation needs.
 *
 * INPUT FORMAT (refs.txt lines):
 *   <source>|<source>|<book_id>|<chapter>|<verse>|<ref_type>|<text>
 *
 * Where <source> ∈ {LXX, GNT, BETMAS_GEZ, BETMAS_GEZ_V, BETMAS_GEZ_W,
 *                    BETMAS_GEZ_ETH, BETMAS_ENG}.
 *
 * Special cases:
 *   - LXX, GNT use numeric book_id (1=Genesis, 40=Matthew, etc.) that aligns
 *     with the existing bible.db convention.
 *   - BETMAS_GEZ_V uses 3-letter book CODES (GEN, MAT, etc.) in field 4 and
 *     `chapter:verse` notation in field 5. We translate codes to numeric
 *     book_ids so cross-source joins work.
 *   - BETMAS_GEZ / BETMAS_GEZ_W are NOT verse-aligned bible texts — they're
 *     a corpus of Ethiopic LITERATURE works (3,379 documents), indexed by
 *     doc_id and ordinal. We ingest them but flag them as ref_type='doc'
 *     so the navigation UI treats them differently (no chapter:verse jump).
 *
 * OUTPUT SCHEMA (server/multi-source.db):
 *
 *   sources(source_id PK, name, language, script, ref_kind, n_units, notes)
 *     ref_kind ∈ {'bible_verse', 'literature_doc'}
 *     - bible_verse: book_id is a real Bible book number; navigation uses
 *       (book_id, chapter, verse) and cross-source joins work
 *     - literature_doc: book_id is an arbitrary work identifier; navigation
 *       is linear within the doc; no cross-source joins
 *
 *   verses(source_id, book_id, chapter, verse, ord, text_raw, doc_id, book_code,
 *          PRIMARY KEY (source_id, book_id, chapter, verse))
 *     ord is the linear position within the source (1, 2, 3, ...) — used for
 *     "next/previous verse" navigation that flows across chapter/book
 *     boundaries without UI logic having to think about it.
 *
 *   book_aliases(source_id, book_code, book_id) — maps 3-letter codes (GEN)
 *     to numeric book_ids (1) for BETMAS_GEZ_V. Keeps the join consistent.
 *
 * INDEXES:
 *   - PRIMARY KEY on (source_id, book_id, chapter, verse) — direct lookup
 *   - (source_id, ord) — linear navigation
 *   - (book_id, chapter, verse) without source_id — cross-source parallel view
 *
 * Performance: 208k rows, ~100MB on disk uncompressed. Indexed inserts wrapped
 * in a single transaction completes in seconds.
 *
 * USAGE:
 *   node scripts/ingest-multi-source.cjs \
 *     --refs /path/to/refs.txt \
 *     --out  server/multi-source.db
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const readline = require('readline');

const args = process.argv.slice(2);
const argv = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };

const REFS = argv('--refs', '/mnt/user-data/uploads/refs.txt');
const OUT  = argv('--out',  path.join(__dirname, '..', 'server', 'multi-source.db'));

if (!fs.existsSync(REFS)) {
    console.error(`refs file not found: ${REFS}`);
    process.exit(1);
}

// Load sqlite (better-sqlite3 native or node:sqlite shim)
let Database;
try { Database = require('better-sqlite3'); }
catch {
    try { Database = require(path.join(__dirname, '..', 'server', 'node_modules', 'better-sqlite3-shim.cjs')); }
    catch {
        const { DatabaseSync } = require('node:sqlite');
        Database = class {
            constructor(file, opts = {}) { this.db = new DatabaseSync(file, opts.readonly ? { readOnly: true } : {}); }
            prepare(q) { const s = this.db.prepare(q); return { all: (...a) => s.all(...a), get: (...a) => s.get(...a), run: (...a) => s.run(...a) }; }
            exec(s) { return this.db.exec(s); }
            close() { this.db.close(); }
        };
    }
}

// ── BETMAS_GEZ_V book code → numeric book_id ────────────────────────────────
// Maps 3-letter codes used in the Ge'ez Bible source to the same numeric
// book_ids used by the rest of the corpus (LXX, GNT, the user's bible.db).
// Codes follow the Paratext / USFM convention.
const BOOK_CODE_TO_ID = {
    'GEN': 1, 'EXO': 2, 'LEV': 3, 'NUM': 4, 'DEU': 5,
    'JOS': 6, 'JDG': 7, 'RUT': 8, '1SA': 9, '2SA': 10,
    '1KI': 11, '2KI': 12, '1CH': 13, '2CH': 14,
    'EZR': 15, 'NEH': 16, 'EST': 17, 'JOB': 18, 'PSA': 19,
    'PRO': 20, 'ECC': 21, 'SNG': 22, 'ISA': 23, 'JER': 24,
    'LAM': 25, 'EZK': 26, 'DAN': 27, 'HOS': 28, 'JOL': 29,
    'AMO': 30, 'OBA': 31, 'JON': 32, 'MIC': 33, 'NAM': 34,
    'HAB': 35, 'ZEP': 36, 'HAG': 37, 'ZEC': 38, 'MAL': 39,
    'MAT': 40, 'MRK': 41, 'LUK': 42, 'JHN': 43, 'ACT': 44,
    'ROM': 45, '1CO': 46, '2CO': 47, 'GAL': 48, 'EPH': 49,
    'PHP': 50, 'COL': 51, '1TH': 52, '2TH': 53, '1TI': 54,
    '2TI': 55, 'TIT': 56, 'PHM': 57, 'HEB': 58, 'JAS': 59,
    '1PE': 60, '2PE': 61, '1JN': 62, '2JN': 63, '3JN': 64,
    'JUD': 65, 'REV': 66,
};

// Source metadata used to seed the `sources` table. ref_kind determines
// whether the source supports cross-source verse navigation.
const SOURCE_META = {
    'LXX':              { name: 'Septuagint (LXX)',                 language: 'Greek',   script: 'Greek',     ref_kind: 'bible_verse' },
    'GNT':              { name: 'Greek New Testament',              language: 'Greek',   script: 'Greek',     ref_kind: 'bible_verse' },
    'BETMAS_GEZ_V':     { name: "Ge'ez Bible (Beta Maṣāḥǝft)",      language: 'Geez',    script: 'Ethiopic',  ref_kind: 'bible_verse' },
    'BETMAS_GEZ':       { name: "Ge'ez Literature Corpus",           language: 'Geez',    script: 'Ethiopic',  ref_kind: 'literature_doc' },
    'BETMAS_GEZ_W':     { name: "Ge'ez Works (work-level dump)",     language: 'Geez',    script: 'Ethiopic',  ref_kind: 'literature_doc' },
    'BETMAS_GEZ_ETH':   { name: "Ge'ez Ethiopic Subset",            language: 'Geez',    script: 'Ethiopic',  ref_kind: 'literature_doc' },
    'BETMAS_ENG':       { name: 'BETMAS English Translations',      language: 'English', script: 'Latin',     ref_kind: 'literature_doc' },
};

console.log(`Reading ${REFS}`);
console.log(`Writing ${OUT}`);

// Replace if exists
if (fs.existsSync(OUT)) {
    const bak = OUT + '.bak-' + Date.now();
    fs.renameSync(OUT, bak);
    console.log(`Existing target moved to ${bak}`);
}

const db = new Database(OUT);
db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous  = NORMAL;

    CREATE TABLE sources (
        source_id  TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        language   TEXT NOT NULL,
        script     TEXT NOT NULL,
        ref_kind   TEXT NOT NULL,            -- 'bible_verse' | 'literature_doc'
        n_units    INTEGER NOT NULL DEFAULT 0,
        notes      TEXT
    );

    CREATE TABLE verses (
        source_id  TEXT    NOT NULL,
        ord        INTEGER NOT NULL,         -- linear position within source (1..N)
        book_id    INTEGER NOT NULL,         -- 0 for literature_doc, real Bible book otherwise
        chapter    INTEGER NOT NULL,         -- per-doc ordinal for literature_doc, real chapter otherwise
        verse      INTEGER NOT NULL,         -- always 1 for literature_doc
        text_raw   TEXT    NOT NULL,
        doc_id     TEXT,                     -- doc identifier (literature_doc + BETMAS_GEZ_V)
        book_code  TEXT,                     -- BETMAS_GEZ_V: 3-letter source code
        PRIMARY KEY (source_id, ord)
    );

    -- Cross-source verse lookups by Bible reference. Includes doc_id in the
    -- uniqueness tuple because some Ge'ez sources have multiple docs sharing
    -- the same book_code (e.g. LIT2697Sam and LIT2698Sam both tagged '1SA'
    -- but representing 1 Samuel and 2 Samuel respectively). The parallel
    -- viewer resolves which doc is canonical via the preferred_docs table.
    CREATE UNIQUE INDEX idx_verses_bcv ON verses (source_id, book_id, chapter, verse, COALESCE(doc_id, ''))
        WHERE book_id > 0;

    -- Cross-source parallel view: "give me Genesis 1:1 in every source".
    -- Skips source_id in the leading key so all sources are scanned.
    CREATE INDEX idx_verses_parallel ON verses (book_id, chapter, verse) WHERE book_id > 0;

    -- Literature_doc lookups: navigate within a doc by (doc_id, ord).
    CREATE INDEX idx_verses_docid ON verses (source_id, doc_id, ord) WHERE doc_id IS NOT NULL;

    -- User-curated mapping from (source_id, book_id) → preferred doc_id.
    -- The verse-by-reference lookup picks this doc when present. Initially
    -- the table is empty; the user fills it via lexicon-audit/doc-preferences
    -- or by running the seed script that picks the most common doc per book.
    CREATE TABLE preferred_docs (
        source_id TEXT    NOT NULL,
        book_id   INTEGER NOT NULL,
        doc_id    TEXT    NOT NULL,
        note      TEXT,
        PRIMARY KEY (source_id, book_id)
    );

    -- BETMAS_GEZ_V book code lookups, useful when a downstream tool wants to
    -- show "GEN" instead of "1".
    CREATE TABLE book_aliases (
        source_id  TEXT NOT NULL,
        book_code  TEXT NOT NULL,
        book_id    INTEGER NOT NULL,
        PRIMARY KEY (source_id, book_code)
    );
`);

// Pre-seed source metadata; n_units will be filled at the end.
const insSource = db.prepare(`
    INSERT INTO sources (source_id, name, language, script, ref_kind, n_units)
    VALUES (?, ?, ?, ?, ?, 0)
`);
for (const [sid, meta] of Object.entries(SOURCE_META)) {
    insSource.run(sid, meta.name, meta.language, meta.script, meta.ref_kind);
}

const insVerse = db.prepare(`
    INSERT INTO verses (source_id, ord, book_id, chapter, verse, text_raw, doc_id, book_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const insAlias = db.prepare(`
    INSERT OR IGNORE INTO book_aliases (source_id, book_code, book_id) VALUES (?, ?, ?)
`);

// Track linear ordinal per source so navigation is O(1) lookup
const ordCounter = {};

// Parse all rows into memory first — 208k rows × ~200 bytes ≈ 40MB fits
// comfortably. Then sort each source's rows by canonical reading order
// before inserting. This avoids the cost of post-hoc UPDATE passes that
// were 10x slower than the parse itself.
const rowsBySource = new Map();
let processed = 0;
let skipped   = 0;
const unknownCodes = new Set();
const unknownSources = new Set();

const rl = readline.createInterface({
    input: fs.createReadStream(REFS, { encoding: 'utf8' }),
    crlfDelay: Infinity,
});

rl.on('line', (line) => {
    if (!line) return;
    const parts = line.split('|');
    if (parts.length < 6) { skipped++; return; }

    const source_id = parts[0];
    const meta = SOURCE_META[source_id];
    if (!meta) { unknownSources.add(source_id); skipped++; return; }

    let book_id, chapter, verse, doc_id = null, book_code = null, text_raw;

    if (source_id === 'BETMAS_GEZ_V') {
        if (parts.length < 7) { skipped++; return; }
        doc_id    = parts[2];
        book_code = parts[3];
        book_id   = BOOK_CODE_TO_ID[book_code];
        if (!book_id) { unknownCodes.add(book_code); skipped++; return; }
        const cv = parts[4].split(':');
        if (cv.length !== 2) { skipped++; return; }
        chapter = parseInt(cv[0], 10);
        verse   = parseInt(cv[1], 10);
        if (!Number.isFinite(chapter) || !Number.isFinite(verse)) { skipped++; return; }
        text_raw = parts.slice(6).join('|');
        insAlias.run(source_id, book_code, book_id);
    } else if (meta.ref_kind === 'bible_verse') {
        if (parts.length < 7) { skipped++; return; }
        book_id = parseInt(parts[2], 10);
        chapter = parseInt(parts[3], 10);
        verse   = parseInt(parts[4], 10);
        if (!Number.isFinite(book_id) || !Number.isFinite(chapter) || !Number.isFinite(verse)) {
            skipped++; return;
        }
        text_raw = parts.slice(6).join('|');
    } else {
        doc_id  = parts[2];
        book_id = 0;
        chapter = parseInt(parts[3], 10) || 0;
        verse   = 1;
        text_raw = parts.slice(5).join('|');
    }

    let arr = rowsBySource.get(source_id);
    if (!arr) { arr = []; rowsBySource.set(source_id, arr); }
    arr.push({ book_id, chapter, verse, text_raw, doc_id, book_code });
    processed++;
});

rl.on('close', () => {
    console.log(`Parsed ${processed.toLocaleString()} rows; sorting & inserting in canonical order...`);

    // Sort each source's rows so ord follows canonical reading order:
    //   bible_verse → (book_id, chapter, verse)   (numerical, NOT lexicographic)
    //   literature_doc → (doc_id, per_doc_ord)
    // Where docs disambiguate (BETMAS_GEZ_V's 1SA/2SA dual mapping), doc_id
    // is a tiebreaker so all of one doc's verses cluster together in ord.
    db.exec('BEGIN');
    for (const [source_id, rows] of rowsBySource) {
        rows.sort((a, b) => {
            // bible_verse (book_id > 0) before literature_doc (book_id = 0)
            const akind = a.book_id > 0 ? 0 : 1;
            const bkind = b.book_id > 0 ? 0 : 1;
            if (akind !== bkind) return akind - bkind;
            if (a.book_id !== b.book_id) return a.book_id - b.book_id;
            const ad = a.doc_id || '';
            const bd = b.doc_id || '';
            if (ad !== bd) return ad < bd ? -1 : 1;
            if (a.chapter !== b.chapter) return a.chapter - b.chapter;
            return a.verse - b.verse;
        });
        let ord = 0;
        for (const r of rows) {
            ord++;
            insVerse.run(source_id, ord, r.book_id, r.chapter, r.verse, r.text_raw, r.doc_id, r.book_code);
        }
    }
    db.exec('COMMIT');

    // Backfill n_units per source
    db.exec(`
        UPDATE sources SET n_units = (
            SELECT COUNT(*) FROM verses WHERE verses.source_id = sources.source_id
        )
    `);

    // Auto-seed preferred_docs: for each (source, book_id) where multiple
    // doc_ids exist (e.g. BETMAS_GEZ_V has LIT2697Sam AND LIT2698Sam both
    // labeled book 1SA), pick the doc with the MOST verses as the canonical
    // one. This is a heuristic — the user can override by editing the table
    // directly or via lexicon-audit/preferred-docs.json (future).
    db.exec(`
        INSERT INTO preferred_docs (source_id, book_id, doc_id, note)
        SELECT source_id, book_id, doc_id, 'auto: most verses'
        FROM (
            SELECT source_id, book_id, doc_id, COUNT(*) AS n,
                   ROW_NUMBER() OVER (PARTITION BY source_id, book_id ORDER BY COUNT(*) DESC, doc_id) AS rn
            FROM verses
            WHERE book_id > 0 AND doc_id IS NOT NULL
            GROUP BY source_id, book_id, doc_id
        )
        WHERE rn = 1
    `);

    // Optimize
    db.exec('ANALYZE');

    const sourcesSummary = db.prepare(`
        SELECT source_id, n_units, ref_kind FROM sources ORDER BY n_units DESC
    `).all();

    console.log('\nIngestion complete:');
    console.log(`  rows processed: ${processed.toLocaleString()}`);
    console.log(`  rows skipped:   ${skipped.toLocaleString()}`);
    if (unknownSources.size) console.log(`  unknown sources: ${[...unknownSources].join(', ')}`);
    if (unknownCodes.size)   console.log(`  unknown book codes: ${[...unknownCodes].join(', ')}`);
    console.log('\nPer-source counts:');
    for (const s of sourcesSummary) {
        console.log(`  ${s.source_id.padEnd(20)}  ${String(s.n_units).padStart(8)}  (${s.ref_kind})`);
    }
    db.close();
});
