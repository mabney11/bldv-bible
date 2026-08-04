#!/usr/bin/env node
// Translation Studio was showing "English Source" instead of the Paleo blocks.
// Two causes, four edits:
//   A. /api/translate/languages listed ENG as a *source* language, so a verse with
//      no Hebrew returned a one-item list ["English"], the client took list[0].id,
//      and there was no picker (rendered only when langs.length > 1) to get back.
//   B. The Studio's Hebrew lookups hardcoded tokens_bhs. Canon 40-66 Hebrew lives
//      in tokens_nt, so every NT verse reported "no Hebrew" AND would have returned
//      zero tokens even if offered.
// Aborts without writing if ANY anchor is missing or ambiguous. Keeps a .bak.
import fs from 'fs';

const FILE = process.argv[2] || 'server.js';
let src = fs.readFileSync(FILE, 'utf8');
const L = (...lines) => lines.join('\n');

const EDITS = [

// ── 1. prepared statements + router, after the tokens_nt startup log ─────────
{ name: 'add txVerseQuery',
  find: `if (NT_TOKENS_READY) console.log('tokens_nt present — NT Hebrew tokens enabled for canon 40-66');`,
  repl: L(
`if (NT_TOKENS_READY) console.log('tokens_nt present — NT Hebrew tokens enabled for canon 40-66');`,
``,
`// ── STUDIO PER-VERSE HEBREW TOKENS ──────────────────────────────────────────`,
`// The Studio needs ONE verse's Hebrew, and it must come from the same table`,
`// /api/tokens would use for that book: tokens_bhs for the OT, tokens_nt for`,
`// canon 40-66. Hardcoding tokens_bhs made every NT verse report "no Hebrew"`,
`// AND return zero tokens. The 40-66 range mirrors tokenQueryFor's own`,
`// no-source default — not a new rule.`,
'const TX_VERSE_BHS = db.prepare(`',
`    SELECT token_ordinal, word_raw, pos, morph, strongs`,
`    FROM tokens_bhs WHERE book_id=? AND chapter=? AND verse=? ORDER BY token_ordinal`,
'`);',
'const TX_VERSE_NT = NT_TOKENS_READY ? db.prepare(`',
`    SELECT token_ordinal, word_raw, pos, morph, strongs`,
`    FROM tokens_nt WHERE book_id=? AND chapter=? AND verse=? ORDER BY token_ordinal`,
'`) : null;',
`function txVerseQuery(bookId) {`,
`    return (TX_VERSE_NT && bookId >= 40 && bookId <= 66) ? TX_VERSE_NT : TX_VERSE_BHS;`,
`}`) },

// ── 2. /api/translate/verse — route through txVerseQuery ────────────────────
{ name: 'translate/verse tokens',
  find: L(
'        const tokens = db.prepare(`',
`            SELECT token_ordinal, word_raw, pos, morph, strongs`,
`            FROM tokens_bhs WHERE book_id=? AND chapter=? AND verse=? ORDER BY token_ordinal`,
'        `).all(bookId, chapter, verse);'),
  repl: L(
`        // Same table the reader would use for this book (OT: tokens_bhs,`,
`        // canon 40-66: tokens_nt) — see txVerseQuery.`,
`        const tokens = txVerseQuery(bookId).all(bookId, chapter, verse);`) },

// ── 3. /api/translate/languages — BHS probe must match the token source ─────
{ name: 'languages BHS probe',
  find: L(
`                if (src.id === 'BHS') {`,
'                    has = !!db.prepare(`SELECT 1 FROM tokens_bhs WHERE book_id=? AND chapter=? AND verse=? LIMIT 1`).get(book, ch || 1, v || 1);'),
  repl: L(
`                if (src.id === 'BHS') {`,
`                    // Must probe the SAME table the Studio will then read from,`,
`                    // or an NT verse reports "no Hebrew" while tokens_nt has it.`,
`                    has = !!txVerseQuery(book).get(book, ch || 1, v || 1);`) },

// ── 4. /api/translate/languages — ENG is the target, never a source ─────────
{ name: 'exclude ENG from source languages',
  find: L(
`        for (const src of Object.values(SOURCES)) {`,
`            if (src.worksOnly) continue;`),
  repl: L(
`        for (const src of Object.values(SOURCES)) {`,
`            if (src.worksOnly) continue;`,
`            // English is the translation TARGET (this endpoint's own contract`,
`            // says so). Listing it as a source meant a verse with no Hebrew`,
`            // returned exactly one language — English — which the client picked`,
`            // as list[0] and then rendered as "English Source", with no picker`,
`            // (that needs langs.length > 1) to switch back to Paleo.`,
`            if (src.id === 'ENG') continue;`) },
];

// verify every anchor first — exactly one match, no writes until all pass
let failed = false;
for (const e of EDITS) {
    const n = src.split(e.find).length - 1;
    if (n !== 1) { console.error(`ABORT: "${e.name}" matched ${n} times (need exactly 1)`); failed = true; }
}
if (failed) { console.error('Nothing written.'); process.exit(1); }

for (const e of EDITS) { src = src.replace(e.find, e.repl); console.log(`applied: ${e.name}`); }

fs.copyFileSync(FILE, FILE + '.bak');
fs.writeFileSync(FILE, src);
console.log(`\n${FILE} patched (backup at ${FILE}.bak). Restart the server.`);
