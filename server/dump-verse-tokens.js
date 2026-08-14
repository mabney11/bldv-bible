#!/usr/bin/env node
/**
 * dump-verse-tokens.js — prints the raw token list for ONE verse, in every
 * non-Hebrew language, straight off corpus.db.
 *
 * Built for the Gloss Studio lexicon-expansion workflow: Claude aligns each
 * token to the corresponding piece of the (already-Hebrew-transliterated)
 * English translation and proposes a gloss, the same "Translit (gloss)"
 * shorthand already used in lexicon/{geez,latin,syriac,coptic}-lexicon.json.
 * This script only does the fetching — no guessing, no memory-of-the-text —
 * so every token handed to Claude is verified straight from this app's own
 * corpus, never assumed. Copy the tokens (and the English from Gloss
 * Studio's browse pane) into the chat.
 *
 * Tokenization mirrors server.js's splitTextToTokens() EXACTLY (same
 * punctuation-strip regex) so what you see here is what the reader/Gloss
 * Studio actually tokenize — not a fresh ad-hoc split that could disagree.
 *
 * Usage: node dump-verse-tokens.js <book_id> <chapter> <verse>
 *   e.g. node dump-verse-tokens.js 1 1 2        (Genesis 1:2)
 *   e.g. node dump-verse-tokens.js 1 1 2 --raw  (also print the untouched source row, no token split)
 *
 * book_id is canon_id (Genesis=1 ... Revelation=66), same numbering Gloss
 * Studio's book pane and /parallel?book= already use.
 */
'use strict';
const path = require('path');
const Database = require('better-sqlite3');

const args = process.argv.slice(2);
const [bookArg, chapterArg, verseArg] = args.filter(a => !a.startsWith('--'));
const showRaw = args.includes('--raw');
const book_id = parseInt(bookArg, 10);
const chapter = parseInt(chapterArg, 10);
const verse   = parseInt(verseArg, 10);
if (!book_id || !chapter || !Number.isInteger(verse)) {
    console.error('Usage: node dump-verse-tokens.js <book_id> <chapter> <verse> [--raw]');
    console.error('  e.g. node dump-verse-tokens.js 1 1 2   (Genesis 1:2)');
    process.exit(1);
}

const dbPath = path.join(__dirname, 'corpus.db');
const db = new Database(dbPath, { readonly: true });

// Identical to splitTextToTokens's STOPS regex in server.js — Ethiopic
// wordspace/punctuation, common Latin/Greek stops, and critical-edition
// brackets. Keep these two in sync if server.js's ever changes.
const STOPS = /[፠-፨·.,:;!?;·\[\]⟦⟧⸢⸣⸤⸥⌊⌋]/g;
function tokenize(text) {
    return String(text || '')
        .split(/\s+/)
        .map(w => w.replace(STOPS, ''))
        .filter(Boolean);
}

// { label, corpora } — corpora tried in order, first match wins. Greek's
// canonical text is split across two corpora (LXX = OT, GNT = NT), same as
// server.js's SOURCES.LXX = { corpora: ['LXX','GNT'] }.
const LANGS = [
    { id: 'LAT', label: 'Latin (Vulgate)',   corpora: ['LAT'] },
    { id: 'SYR', label: 'Syriac (Peshitta)', corpora: ['SYR'] },
    { id: 'COP', label: 'Coptic (Sahidic)',  corpora: ['COP'] },
    { id: 'GEZ', label: "Ge'ez (BETMAS)",    corpora: ['GEZ'] },
    { id: 'GRC', label: 'Greek',             corpora: ['LXX', 'GNT'] },
];

const stmt = db.prepare(`SELECT text FROM verses WHERE corpus=? AND canon_id=? AND ord_c=? AND ord_v=?`);

console.log(`=== book_id ${book_id}, chapter ${chapter}, verse ${verse} ===`);
for (const lang of LANGS) {
    let row = null;
    for (const corpus of lang.corpora) {
        row = stmt.get(corpus, book_id, chapter, verse);
        if (row) break;
    }
    console.log(`\n${lang.label} (${lang.id}):`);
    if (!row) { console.log('  (no text for this verse in this corpus)'); continue; }
    if (showRaw) console.log(`  raw:    ${row.text}`);
    console.log(`  tokens: ${JSON.stringify(tokenize(row.text))}`);
}
