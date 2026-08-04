#!/usr/bin/env node
/**
 * tokenize-multilang.cjs
 *
 * Reads each multi-language source DB (lxx.db, gnt.db, geez.db), tokenizes
 * the verse text into surface tokens, and writes a `tokens` table per DB:
 *
 *   tokens(
 *     ref_key TEXT NOT NULL,
 *     book_id INTEGER NOT NULL,
 *     chapter INTEGER NOT NULL,
 *     verse INTEGER NOT NULL,
 *     ord INTEGER NOT NULL,
 *     word_raw TEXT NOT NULL,   -- exactly as it appears in the verse
 *     word_norm TEXT NOT NULL,  -- NFC + lowercase for collation
 *     PRIMARY KEY (ref_key, ord)
 *   )
 *
 * Also writes a `surface_counts` aggregation table for fast lexicon list:
 *
 *   surface_counts(
 *     word_norm TEXT PRIMARY KEY,
 *     word_display TEXT NOT NULL,  -- most-frequent raw form
 *     count INTEGER NOT NULL,
 *     book_count INTEGER NOT NULL  -- distinct books containing the word
 *   )
 *
 * Tokenization rules:
 *   - Greek: split on whitespace; strip leading/trailing punctuation
 *     (, . ; · : ! ? " ' « » ( ) [ ] etc.); token must contain a Greek letter.
 *     word_norm = NFC + lowercase (accents preserved — they distinguish words).
 *   - Ge'ez: split on whitespace AND ፡ (Ethiopic wordspace U+1361); strip
 *     other Ethiopic punctuation (። ፣ ፤ ፥ ፦ ፧ ፨); token must contain an
 *     Ethiopic syllable. word_norm = NFC normalized (no case folding).
 *
 * This is surface-level tokenization. It does NOT collapse word forms to
 * lemmas. For lemma-level lexicons and per-token morphology, the user's
 * `tokens_greek` table from the master DB would need to be ingested
 * separately.
 */
'use strict';

const path = require('path');

// Match the rest of the scripts/ folder: try better-sqlite3 first, then fall
// back to the bundled shim, then to node:sqlite. This makes the script work
// in production (where better-sqlite3 is installed) and in restricted
// environments where only the built-in SQLite is available.
let Database;
try { Database = require('better-sqlite3'); }
catch {
    try { Database = require(path.join(__dirname, '..', 'server', 'node_modules', 'better-sqlite3-shim.cjs')); }
    catch {
        const { DatabaseSync } = require('node:sqlite');
        class Statement {
            constructor(s) { this.s = s; }
            all(...a)  { return this.s.all(...a); }
            get(...a)  { return this.s.get(...a); }
            run(...a)  { return this.s.run(...a); }
        }
        Database = class {
            constructor(f, o = {}) {
                const ro = o.readonly || o.readOnly;
                this.db = new DatabaseSync(f, ro ? { readOnly: true } : {});
            }
            prepare(q) { return new Statement(this.db.prepare(q)); }
            exec(s)    { return this.db.exec(s); }
            pragma(p)  { this.db.exec('PRAGMA ' + p); }
            transaction(fn) {
                return (...a) => {
                    this.db.exec('BEGIN');
                    try { const r = fn(...a); this.db.exec('COMMIT'); return r; }
                    catch (e) { this.db.exec('ROLLBACK'); throw e; }
                };
            }
            close() { this.db.close(); }
        };
    }
}

const DBS = [
    { id: 'LXX', file: path.join(__dirname, '..', 'server', 'lxx.db'),  script: 'greek'    },
    { id: 'GNT', file: path.join(__dirname, '..', 'server', 'gnt.db'),  script: 'greek'    },
    { id: 'GEZ', file: path.join(__dirname, '..', 'server', 'geez.db'), script: 'ethiopic' },
];

// ── Tokenization helpers ────────────────────────────────────────────────────

// Greek letters: U+0370–U+03FF (basic) + U+1F00–U+1FFF (extended)
const GREEK_LETTER_RE = /[\u0370-\u03FF\u1F00-\u1FFF]/;

// Ethiopic syllables: U+1200–U+137F + U+1380–U+139F (Ethiopic Supplement) +
// U+2D80–U+2DDF (Ethiopic Extended)
const ETHIOPIC_LETTER_RE = /[\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF]/;

// Punctuation to strip from token boundaries. Includes Greek and Latin marks
// plus the typographic dashes commonly seen in critical editions.
const PUNCT_STRIP_RE = /^[\s,.;:!?·…‚‚„""''«»‹›()\[\]{}⟨⟩\u00A0\u2010-\u2015\u2018-\u201F\u2020-\u2027]+|[\s,.;:!?·…‚‚„""''«»‹›()\[\]{}⟨⟩\u00A0\u2010-\u2015\u2018-\u201F\u2020-\u2027]+$/g;

// Ethiopic punctuation to strip (matched in addition to PUNCT_STRIP_RE).
const ETH_PUNCT_RE = /[\u1360-\u1368]/g;

/**
 * Tokenize a Greek verse. Returns an array of token strings (in order).
 * Each token is NFC-normalized and stripped of surrounding punctuation,
 * preserving accents and case in the raw form.
 */
function tokenizeGreek(text) {
    if (!text) return [];
    const nfc = text.normalize('NFC');
    const raw = nfc.split(/\s+/);
    const out = [];
    for (const tok of raw) {
        const cleaned = tok.replace(PUNCT_STRIP_RE, '');
        if (!cleaned) continue;
        if (!GREEK_LETTER_RE.test(cleaned)) continue;  // must contain Greek
        out.push(cleaned);
    }
    return out;
}

/**
 * Tokenize a Ge'ez verse. Ge'ez separates words with ፡ (U+1361, Ethiopic
 * wordspace) and uses ። (U+1362) as a sentence terminator. Modern texts also
 * use regular ASCII spaces. We split on both.
 */
function tokenizeGeez(text) {
    if (!text) return [];
    const nfc = text.normalize('NFC');
    // Replace Ethiopic wordspace with regular space so the split is uniform.
    const spaced = nfc.replace(/\u1361/g, ' ');
    const raw = spaced.split(/\s+/);
    const out = [];
    for (const tok of raw) {
        // Strip Ethiopic punctuation entirely; strip generic boundary punct.
        const stripped = tok.replace(ETH_PUNCT_RE, '').replace(PUNCT_STRIP_RE, '');
        if (!stripped) continue;
        if (!ETHIOPIC_LETTER_RE.test(stripped)) continue;
        out.push(stripped);
    }
    return out;
}

/**
 * Normalize a token for collation. For Greek we lowercase but keep accents
 * (they distinguish lexemes like ἤ vs ἥ). For Ge'ez there is no case so we
 * just NFC-normalize.
 */
function normalize(token, script) {
    const nfc = token.normalize('NFC');
    if (script === 'greek') return nfc.toLowerCase();
    return nfc;
}

// ── Main per-DB tokenize ────────────────────────────────────────────────────

function tokenizeDb({ id, file, script }) {
    const fs = require('fs');
    if (!fs.existsSync(file)) {
        console.log(`[${id}] skipped (db not present: ${file})`);
        return null;
    }
    const db = new Database(file);
    db.pragma('journal_mode = WAL');

    // Check whether the source verses table has a doc_id column (Ge'ez does).
    // If so, we propagate it through to tokens so literary docs (book_id NULL)
    // are still queryable by doc_id.
    const verseCols = db.prepare(`PRAGMA table_info(verses)`).all().map(c => c.name);
    const hasDoc   = verseCols.includes('doc_id');

    // Drop and recreate so re-running is idempotent.
    db.exec(`
        DROP TABLE IF EXISTS surface_counts;
        DROP TABLE IF EXISTS tokens;
        CREATE TABLE tokens (
            ref_key   TEXT NOT NULL,
            ${hasDoc ? 'doc_id    TEXT,' : ''}
            book_id   INTEGER,
            chapter   INTEGER NOT NULL,
            verse     INTEGER NOT NULL,
            ord       INTEGER NOT NULL,
            word_raw  TEXT NOT NULL,
            word_norm TEXT NOT NULL,
            PRIMARY KEY (ref_key, ord)
        );
        CREATE INDEX idx_tokens_word_norm ON tokens(word_norm);
        CREATE INDEX idx_tokens_book      ON tokens(book_id, chapter, verse);
        ${hasDoc ? 'CREATE INDEX idx_tokens_doc ON tokens(doc_id, chapter, verse);' : ''}
        CREATE TABLE surface_counts (
            word_norm    TEXT PRIMARY KEY,
            word_display TEXT NOT NULL,
            word_translit TEXT,
            word_root    TEXT,
            count        INTEGER NOT NULL,
            book_count   INTEGER NOT NULL
        );
        CREATE INDEX idx_surface_counts_root ON surface_counts(word_root);
    `);

    const tokenizer = script === 'greek' ? tokenizeGreek : tokenizeGeez;

    // Read all verses (canonical AND literary).
    const verses = db.prepare(`
        SELECT ref_key, ${hasDoc ? 'doc_id, ' : ''}book_id, chapter, verse, text
        FROM verses
        ORDER BY book_id, chapter, verse
    `).all();

    console.log(`[${id}] tokenizing ${verses.length.toLocaleString()} verses…`);

    const insTok = db.prepare(hasDoc
        ? `INSERT INTO tokens (ref_key, doc_id, book_id, chapter, verse, ord, word_raw, word_norm)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        : `INSERT INTO tokens (ref_key, book_id, chapter, verse, ord, word_raw, word_norm)
           VALUES (?, ?, ?, ?, ?, ?, ?)`);

    let total = 0;
    const t0 = Date.now();
    const txn = db.transaction(() => {
        for (const v of verses) {
            const toks = tokenizer(v.text);
            for (let i = 0; i < toks.length; i++) {
                const raw  = toks[i];
                const norm = normalize(raw, script);
                if (hasDoc) insTok.run(v.ref_key, v.doc_id, v.book_id, v.chapter, v.verse, i + 1, raw, norm);
                else        insTok.run(v.ref_key, v.book_id, v.chapter, v.verse, i + 1, raw, norm);
                total++;
            }
        }
    });
    txn();

    // Build surface_counts in one SQL pass.
    db.exec(`
        INSERT INTO surface_counts (word_norm, word_display, count, book_count)
        SELECT
            word_norm,
            (SELECT word_raw FROM tokens t2
              WHERE t2.word_norm = t.word_norm
              GROUP BY word_raw
              ORDER BY COUNT(*) DESC, word_raw
              LIMIT 1) AS word_display,
            COUNT(*) AS count,
            COUNT(DISTINCT book_id) AS book_count
        FROM tokens t
        GROUP BY word_norm
    `);

    // Populate transliteration + heuristic root columns. Iterate in JS
    // because the algorithms aren't expressible in pure SQL.
    const { transliterateWord, heuristicRoot } = require(require('path').join(__dirname, '..', 'server', 'transliteration.cjs'));
    const surfRows = db.prepare(`SELECT word_norm, word_display FROM surface_counts`).all();
    const updTr   = db.prepare(`UPDATE surface_counts SET word_translit = ?, word_root = ? WHERE word_norm = ?`);
    const trTxn = db.transaction(() => {
        for (const r of surfRows) {
            const tr   = transliterateWord(r.word_display, script);
            const root = heuristicRoot(r.word_norm, script);
            updTr.run(tr, root, r.word_norm);
        }
    });
    trTxn();

    const surfaceN = db.prepare('SELECT COUNT(*) AS n FROM surface_counts').get().n;
    const rootN    = db.prepare('SELECT COUNT(DISTINCT word_root) AS n FROM surface_counts WHERE word_root IS NOT NULL').get().n;
    const elapsed  = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`[${id}] ✓ ${total.toLocaleString()} tokens, ${surfaceN.toLocaleString()} surfaces, ${rootN.toLocaleString()} distinct roots (${elapsed}s)`);

    db.close();
    return { id, tokens: total, surfaces: surfaceN, roots: rootN };
}

// ── Entry point ─────────────────────────────────────────────────────────────

if (require.main === module) {
    const results = [];
    for (const cfg of DBS) {
        const r = tokenizeDb(cfg);
        if (r) results.push(r);
    }
    console.log('');
    console.log('=== summary ===');
    for (const r of results) {
        console.log(`  ${r.id.padEnd(4)}  ${String(r.tokens).padStart(8)} tokens   ${String(r.surfaces).padStart(6)} surfaces`);
    }
}

module.exports = { tokenizeGreek, tokenizeGeez, normalize };
