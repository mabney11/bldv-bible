#!/usr/bin/env node
/**
 * apply-reviewed-suggestions.js
 * ---------------------------------------------------------------------------
 * Companion to backfill-root-glosses.js's Pass C. That pass never writes to
 * translation.db — it only proposes candidate word->root replacements in
 * root-gloss-suggestions.json, because deciding whether "wicked" in THIS verse
 * should become "rasha (wicked)" is an editorial call, not a mechanical one.
 *
 * Workflow:
 *   1. node backfill-root-glosses.js [--book N --chapter N]
 *   2. Open root-gloss-suggestions.json. DELETE every entry you don't want
 *      applied (open the array, remove the objects, keep valid JSON).
 *   3. node apply-reviewed-suggestions.js
 *
 * Each surviving entry is applied ONLY if the verse's CURRENT saved text still
 * matches current_text exactly — i.e. nobody edited that verse in the Studio
 * between step 1 and step 3. If it drifted, the entry is skipped and reported,
 * never force-applied over unknown newer text.
 *
 * Writes go through the same saveVerseWithHistory pattern as the rest of the
 * app, so every change is visible and revertible in the Translate Studio
 * history UI.
 * ---------------------------------------------------------------------------
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DIR = __dirname;
const SUGGESTIONS_PATH = path.join(DIR, 'root-gloss-suggestions.json');
if (!fs.existsSync(SUGGESTIONS_PATH)) {
    console.error(`✗ ${SUGGESTIONS_PATH} not found — run backfill-root-glosses.js first.`);
    process.exit(1);
}
const suggestions = JSON.parse(fs.readFileSync(SUGGESTIONS_PATH, 'utf8'));
if (!Array.isArray(suggestions) || !suggestions.length) {
    console.log('No suggestions left in the file (empty array) — nothing to apply.');
    process.exit(0);
}

const translationDb = new Database(path.join(DIR, 'translation.db'));
translationDb.pragma('journal_mode = WAL');

const getVerseStmt = translationDb.prepare(`SELECT * FROM translations WHERE book_id=? AND chapter=? AND verse=?`);
const upsertStmt = translationDb.prepare(`
    INSERT INTO translations(book_id, chapter, verse, status, text, rich_text, updated_at)
    VALUES(?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(book_id,chapter,verse) DO UPDATE SET
        status=excluded.status, text=excluded.text, rich_text=excluded.rich_text, updated_at=excluded.updated_at
`);
const insertHistoryStmt = translationDb.prepare(`
    INSERT INTO translation_history(book_id, chapter, verse, status, text, rich_text, saved_at)
    VALUES (?,?,?,?,?,?,?)
`);
function saveVerseWithHistory(book_id, chapter, verse, status, text, rich_text) {
    const run = translationDb.transaction(() => {
        const existing = getVerseStmt.get(book_id, chapter, verse);
        if (existing && (existing.text !== text || existing.status !== status || existing.rich_text !== rich_text)) {
            insertHistoryStmt.run(book_id, chapter, verse, existing.status, existing.text, existing.rich_text, existing.updated_at);
        }
        upsertStmt.run(book_id, chapter, verse, status, text, rich_text);
    });
    run();
}

let applied = 0, skippedDrift = 0, skippedNoMatch = 0;
for (const s of suggestions) {
    const current = getVerseStmt.get(s.book_id, s.chapter, s.verse);
    if (!current || current.text !== s.current_text) {
        console.warn(`⚠ skip ${s.book_id}:${s.chapter}:${s.verse} — verse text changed since the report was generated, not touching it.`);
        skippedDrift++;
        continue;
    }
    const idx = current.text.indexOf(s.match_word);
    if (idx === -1) {
        console.warn(`⚠ skip ${s.book_id}:${s.chapter}:${s.verse} — "${s.match_word}" not found (unexpected).`);
        skippedNoMatch++;
        continue;
    }
    const newText = current.text.slice(0, idx) + s.proposed_replacement + current.text.slice(idx + s.match_word.length);
    saveVerseWithHistory(s.book_id, s.chapter, s.verse, current.status, newText, current.rich_text);
    applied++;
}

console.log(`Applied ${applied} suggestion(s). Skipped ${skippedDrift} (verse changed since report), ${skippedNoMatch} (word not found).`);
console.log(`Every write is revertible from the Translate Studio history UI per verse.`);
