#!/usr/bin/env node
'use strict';
/*
 * sample-heb-tokens.cjs — pull random verses from the BHS Hebrew corpus and print
 * every token run through the REAL parser (tests/build-parseToken.cjs, which
 * mirrors server.js parseHebrewData/build-surface-index.js parseToken), broken
 * into its components exactly as the reader would show them: root + every
 * prefix/suffix chip, each labeled.
 *
 * This is the spot-check tool for the "harden the tokens" pass: after any change
 * to server.js / build-surface-index.js / tests/build-parseToken.cjs, run this
 * fresh (it's deliberately non-deterministic — same spirit as server/sample-corpus.js)
 * and read through the output. A "⚑" marks any chip the hardening safety net had
 * to flag (css mod-suff-unk / bakedSplit) — those are modifications the parser
 * could not name from the morphology tag alone; eyeball them by hand.
 *
 * Usage:
 *   node tests/sample-heb-tokens.cjs                   5 random verses, 5 different books
 *   node tests/sample-heb-tokens.cjs --n=10             10 verses instead of 5
 *   node tests/sample-heb-tokens.cjs --book=Ps --chapter=119   every verse of a specific chapter
 *   node tests/sample-heb-tokens.cjs --db=/path/to/corpus.db
 */
const path = require('path');
// Prefer better-sqlite3 (production), fall back to node:sqlite — same pattern
// as surface-tokens-parity.test.cjs / sn-mismatch-baseline.test.cjs, needed
// because better-sqlite3's native binding doesn't load in every environment.
let Database;
try {
  Database = require('better-sqlite3');
} catch {
  const { DatabaseSync } = require('node:sqlite');
  Database = class {
    constructor(file, opts) { this.db = new DatabaseSync(file, opts?.readonly ? { readOnly: true } : {}); }
    prepare(sql) {
      const s = this.db.prepare(sql);
      return { all: (...a) => s.all(...a), get: (...a) => s.get(...a) };
    }
    close() { return this.db.close(); }
  };
}
const { parseToken } = require('./build-parseToken.cjs');

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
}));

const BOOKS = [
  ['Gen',1],['Exod',2],['Lev',3],['Num',4],['Deut',5],['Josh',6],['Judg',7],['Ruth',8],
  ['1Sam',9],['2Sam',10],['1Kgs',11],['2Kgs',12],['1Chr',13],['2Chr',14],['Ezra',15],
  ['Neh',16],['Esth',17],['Job',18],['Ps',19],['Prov',20],['Eccl',21],['Song',22],
  ['Isa',23],['Jer',24],['Lam',25],['Ezek',26],['Dan',27],['Hos',28],['Joel',29],['Amos',30],
  ['Obad',31],['Jonah',32],['Mic',33],['Nah',34],['Hab',35],['Zeph',36],['Hag',37],
  ['Zech',38],['Mal',39],
];
const BOOK_ID = new Map(BOOKS);
const BOOK_NAME = new Map(BOOKS.map(([c, id]) => [id, c]));

const DB = args.db || path.join(__dirname, '..', 'server', 'corpus.db');
const db = new Database(DB, { readonly: true });

const flag = c => (c.css === 'mod-suff-unk' || c.bakedSplit) ? '⚑' : ' ';

function printVerse(bookId, chapter, verse) {
  const rows = db.prepare(`
    SELECT word_raw, pos, morph, strongs, token_ordinal
    FROM tokens_bhs
    WHERE book_id = ? AND chapter = ? AND verse = ? AND pos != 'punct'
    ORDER BY token_ordinal
  `).all(bookId, chapter, verse);
  if (!rows.length) return false;

  console.log(`\n── ${BOOK_NAME.get(bookId) || bookId} ${chapter}:${verse} ──`);
  for (const row of rows) {
    const { rendered_paleo, root_paleo, components } = parseToken(row.word_raw, row.pos, row.morph, row.strongs);
    const chipStr = components.map(c => `${flag(c)}[${c.paleo || '∅'}:${c.translation}]`).join(' ');
    console.log(`  ${row.word_raw}  →  ${rendered_paleo}  (root ${root_paleo})  strongs=${row.strongs || '-'}`);
    console.log(`      ${chipStr}`);
  }
  return true;
}

if (args.book) {
  const bookId = BOOK_ID.get(args.book);
  if (!bookId) { console.log(`Unknown book code "${args.book}". Use an OSIS code, e.g. Ps, Gen, Isa.`); process.exit(1); }
  const chapter = parseInt(args.chapter, 10) || 1;
  const verses = db.prepare(`SELECT DISTINCT verse FROM tokens_bhs WHERE book_id=? AND chapter=? ORDER BY verse`).all(bookId, chapter);
  if (!verses.length) { console.log('No verses found for that book/chapter.'); process.exit(0); }
  console.log(`${verses.length} verse(s) in ${args.book} ${chapter}:`);
  for (const { verse } of verses) printVerse(bookId, chapter, verse);
} else {
  const N = parseInt(args.n, 10) || 5;
  const bookRows = db.prepare(`SELECT DISTINCT book_id FROM tokens_bhs`).all();
  const bookIds = bookRows.map(r => r.book_id);
  // Fisher-Yates shuffle, take up to N distinct books — non-deterministic on
  // purpose so repeated runs cover different corners of the corpus.
  for (let i = bookIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bookIds[i], bookIds[j]] = [bookIds[j], bookIds[i]];
  }
  const chosen = bookIds.slice(0, N);
  console.log(`${chosen.length} random verse(s) from ${chosen.length} different book(s):`);
  for (const bookId of chosen) {
    const row = db.prepare(`
      SELECT chapter, verse FROM tokens_bhs WHERE book_id=? AND pos != 'punct'
      ORDER BY RANDOM() LIMIT 1
    `).get(bookId);
    if (row) printVerse(bookId, row.chapter, row.verse);
  }
}

db.close();
