#!/usr/bin/env node
/**
 * backfill-root-glosses.js
 * ---------------------------------------------------------------------------
 * Grew out of a real bug report on Psalm 91:9: "Yahweh" appearing instead of
 * "Yahawah", and words like llayawan/evil/plague/dwelling/lion/tread/love/
 * wicked not carrying the "root (gloss)" treatment that qatab/shawad already
 * have elsewhere in the same verse.
 *
 * Root cause (confirmed by reading the app's own code, not guessed): verse
 * text with "root (gloss)" annotations baked in is HAND-EDITED per verse —
 * there's no automated pipeline that does this. applyLiveGloss() in server.js
 * only ever REFRESHES an existing "word (gloss)" pair against the current
 * lexicon; it never inserts a first one. And rebuild-english-baseline.js's
 * applyNames() (the Yahweh->Yahawah name-map) explicitly skips any verse
 * you've already hand-edited, by design, so a name typed in before your
 * name-map had an entry for it stays wrong forever.
 *
 * This script does NOT try to be that missing pipeline in one shot. It runs
 * three passes of very different confidence, and treats them differently:
 *
 *   PASS A — bare-translit gloss insert (SAFE, auto-appliable)
 *     A word in the verse text is EXACTLY a root's own transliteration
 *     (e.g. "llayawan") with no "(...)" after it, and that root's Strong's
 *     number is confirmed present in this verse's Hebrew tokens. Insert
 *     "(gloss)" after it. No ambiguity: the word already IS the transliterated
 *     root, we're not choosing which English word to replace.
 *
 *   PASS B — name-map drift (SAFE, auto-appliable)
 *     Runs the exact same whole-word substitution rebuild-english-baseline.js
 *     already trusts (name-map.json, longest-key-first) against EVERY verse's
 *     current saved text, including hand-edited ones the normal pipeline
 *     skips. Fixes "Yahweh" -> "Yahawah" and any other stale proper noun.
 *
 *   PASS C — English-word-to-root suggestions (NOT auto-applied)
 *     For each Hebrew root actually present in the verse with a lexicon.json
 *     gloss, checks whether that gloss text appears as a literal whole word
 *     in the verse's English text and isn't already annotated. If exactly one
 *     candidate root matches that word (no collision), it's written to the
 *     suggestions report as a PROPOSED replacement — never written to the
 *     database directly. This is the "evil/plague/wicked" case: deciding
 *     which English word stands in for which Hebrew root is an editorial
 *     judgment call (wrong tense, wrong sense, coincidental word collision),
 *     so it goes through a human before touching a live public Bible site.
 *
 * USAGE
 *   node backfill-root-glosses.js                       dry run, whole OT (book_id 1-39)
 *   node backfill-root-glosses.js --book 19 --chapter 91 dry run, just Psalm 91
 *   node backfill-root-glosses.js --apply-safe           writes Pass A + B only
 *   node backfill-root-glosses.js --apply-safe --book 19 --chapter 91
 *
 * Every write goes through the SAME saveVerseWithHistory pattern the app's own
 * Translate Studio uses (snapshot-then-overwrite into translation_history), so
 * anything this script changes is visible and revertible from the existing
 * history UI — nothing here is a one-way door.
 *
 * Pass C never writes to translation.db. It writes
 * root-gloss-suggestions.json next to this script for manual review. A
 * SEPARATE script (apply-reviewed-suggestions.js) applies only the entries
 * you leave in that file after deleting the ones you don't want — see the
 * note printed at the end of a dry run.
 * ---------------------------------------------------------------------------
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const args = process.argv.slice(2);
const argv = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const APPLY_SAFE = args.includes('--apply-safe');
const ONLY_BOOK    = argv('--book', null)    ? parseInt(argv('--book', null), 10)    : null;
const ONLY_CHAPTER = argv('--chapter', null) ? parseInt(argv('--chapter', null), 10) : null;

const DIR = __dirname;
const corpusDb      = new Database(path.join(DIR, 'corpus.db'), { readonly: true });
const translationDb = new Database(path.join(DIR, 'translation.db'));
translationDb.pragma('journal_mode = WAL');

// ── shared data (mirrors server.js exactly — see comments there) ────────────
const lexicon    = JSON.parse(fs.readFileSync(path.join(DIR, 'lexicon', 'lexicon.json'), 'utf8'));
const strongsRoots = JSON.parse(fs.readFileSync(path.join(DIR, 'lexicon', 'strongs-roots.json'), 'utf8'));
const nameMap     = JSON.parse(fs.readFileSync(path.join(DIR, 'name-map.json'), 'utf8'));

// Copied verbatim from server.js's STRONGS_ROOT_OVERRIDES so root resolution
// matches what the reader actually shows. Keep in sync if server.js changes.
const STRONGS_ROOT_OVERRIDES = {
    H7646: '𐤔𐤁𐤏', H6030: '𐤏𐤍𐤄', H6031: '𐤏𐤍𐤄', H4929: '𐤌𐤔𐤌𐤓', H4931: '𐤌𐤔𐤌𐤓𐤕',
    H7200: '𐤓𐤀𐤄', H1254: '𐤁𐤓𐤀', H8034: '𐤔𐤌', H8010: '𐤔𐤋𐤌𐤄', H4428: '𐤌𐤋𐤊',
    H3588: '𐤊𐤉', H9000: '𐤕', H9003: '𐤁', H9009: '𐤄',
};
// Virtual/grammar SNs carry no lexical root — never candidates for a gloss.
const VIRTUAL_SN = new Set(['H9000', 'H9003', 'H9009']);

function navNormSN(v) { return 'H' + String(v || '').replace(/^H+/, '').trim(); }
function getCanonicalRoot(sn) { return strongsRoots[sn] || STRONGS_ROOT_OVERRIDES[sn] || ''; }

const CHAR_MAP = {
    '𐤀': { med: 'a', fin: 'a' },  '𐤁': { med: 'ba', fin: 'b' },
    '𐤂': { med: 'ga', fin: 'g' }, '𐤃': { med: 'da', fin: 'd' },
    '𐤄': { med: 'ha', fin: 'h' }, '𐤅': { med: 'wa', fin: 'w' },
    '𐤆': { med: 'za', fin: 'z' }, '𐤇': { med: 'cha', fin: 'ch' },
    '𐤈': { med: 'ta', fin: 't' }, '𐤉': { med: 'ya', fin: 'y' },
    '𐤊': { med: 'ka', fin: 'k' }, '𐤋': { med: 'la', fin: 'l' },
    '𐤌': { med: 'ma', fin: 'm' }, '𐤍': { med: 'na', fin: 'n' },
    '𐤎': { med: 'sa', fin: 's' }, '𐤏': { med: 'i', fin: 'i' },
    '𐤐': { med: 'pa', fin: 'p' }, '𐤑': { med: 'tza', fin: 'tz' },
    '𐤒': { med: 'qa', fin: 'q' }, '𐤓': { med: 'ra', fin: 'r' },
    '𐤔': { med: 'sha', fin: 'sh' }, '𐤕': { med: 'tha', fin: 'th' },
};
function getTranslit(paleoStr) {
    if (!paleoStr) return '';
    let out = '';
    const chars = [...paleoStr];
    chars.forEach((ch, i) => {
        const isLast = i === chars.length - 1;
        out += CHAR_MAP[ch] ? (isLast ? CHAR_MAP[ch].fin : CHAR_MAP[ch].med) : ch;
    });
    return out.charAt(0).toUpperCase() + out.slice(1);
}

// name-map applyNames, copied from rebuild-english-baseline.js so drift-checking
// hand-edited verses uses the identical matching rule the baseline itself uses.
const nameKeys = Object.keys(nameMap).sort((a, b) => b.length - a.length);
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NAME_RX = new RegExp('\\b(' + nameKeys.map(escRe).join('|') + ')\\b', 'g');

// ── translation.db access, mirroring saveVerseWithHistory in server.js ──────
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

// ── gather verses to process ─────────────────────────────────────────────────
let verseFilter = `book_id BETWEEN 1 AND 39`;   // Hebrew OT only — lexicon/name-map are Paleo-Hebrew specific
const params = [];
if (ONLY_BOOK) { verseFilter += ` AND book_id = ?`; params.push(ONLY_BOOK); }
if (ONLY_CHAPTER) { verseFilter += ` AND chapter = ?`; params.push(ONLY_CHAPTER); }

const verses = translationDb.prepare(
    `SELECT book_id, chapter, verse, status, text, rich_text FROM translations WHERE ${verseFilter} AND text != '' ORDER BY book_id, chapter, verse`
).all(...params);

const tokensByVerseStmt = corpusDb.prepare(
    `SELECT strongs FROM tokens_bhs WHERE book_id=? AND chapter=? AND verse=? AND strongs IS NOT NULL AND strongs != ''`
);

const BOOK_NAMES_PATH_HINT = '(see server.js BOOK_NAMES for full names — using book_id here to keep this script standalone)';

let passACount = 0, passBCount = 0;
const suggestions = [];
const changeLog = [];

for (const v of verses) {
    let text = v.text;
    let changed = false;
    const changesThisVerse = [];

    // Roots actually present in this verse's Hebrew, with translit + gloss.
    const tokenRows = tokensByVerseStmt.all(v.book_id, v.chapter, v.verse);
    const rootsHere = new Map();   // paleo -> { translit, gloss }
    for (const row of tokenRows) {
        const atomics = String(row.strongs).split('＋').map(navNormSN).filter(sn => sn && sn !== 'H' && !VIRTUAL_SN.has(sn));
        for (const sn of atomics) {
            const paleo = getCanonicalRoot(sn);
            if (!paleo) continue;
            const gloss = lexicon[paleo];
            if (!gloss) continue;
            if (!rootsHere.has(paleo)) rootsHere.set(paleo, { translit: getTranslit(paleo), gloss });
        }
    }

    // ── PASS A: bare transliteration missing its gloss ──────────────────────
    for (const [paleo, { translit, gloss }] of rootsHere) {
        const rx = new RegExp(`\\b(${escRe(translit)})\\b(?!\\s*\\()`, 'i');
        const m = rx.exec(text);
        if (m) {
            const before = text;
            text = text.slice(0, m.index + m[0].length) + ` (${gloss})` + text.slice(m.index + m[0].length);
            if (text !== before) {
                changed = true; passACount++;
                changesThisVerse.push(`PASS A: inserted "(${gloss})" after "${m[0]}"`);
            }
        }
    }

    // ── PASS B: name-map drift (Yahweh -> Yahawah class of fix) ─────────────
    if (nameKeys.length) {
        const before = text;
        text = text.replace(NAME_RX, m => nameMap[m]);
        if (text !== before) {
            changed = true; passBCount++;
            changesThisVerse.push(`PASS B: name-map substitution applied`);
        }
    }

    // ── PASS C: English-word-to-root suggestions (report only, no write) ────
    const usedWords = new Set();   // guard against two roots claiming the same literal word in this verse
    for (const [paleo, { translit, gloss }] of rootsHere) {
        // Only try single-word glosses for a literal match — multi-word glosses
        // ("The Eternal") essentially never appear verbatim in WEB prose and are
        // much more likely to false-positive on a fragment.
        const glossWord = gloss.trim();
        if (!glossWord || /\s/.test(glossWord)) continue;
        if (usedWords.has(glossWord.toLowerCase())) continue;   // ambiguous — two roots, same gloss word
        const rx = new RegExp(`\\b(${escRe(glossWord)})\\b(?!\\s*\\))`, 'i');
        // also make sure this exact word isn't already the parenthetical of an
        // existing "translit (gloss)" pair — skip if immediately preceded by "("
        const already = new RegExp(`\\(\\s*${escRe(glossWord)}\\s*\\)`, 'i').test(text);
        if (already) continue;
        const m = rx.exec(text);
        if (m) {
            usedWords.add(glossWord.toLowerCase());
            suggestions.push({
                book_id: v.book_id, chapter: v.chapter, verse: v.verse,
                current_text: v.text,
                match_word: m[0],
                proposed_replacement: `${translit} (${gloss})`,
                root_paleo: paleo,
            });
        }
    }

    if (changed) {
        changeLog.push({ book_id: v.book_id, chapter: v.chapter, verse: v.verse, before: v.text, after: text, notes: changesThisVerse });
        if (APPLY_SAFE) saveVerseWithHistory(v.book_id, v.chapter, v.verse, v.status, text, v.rich_text);
    }
}

// ── report ────────────────────────────────────────────────────────────────
const reportPath = path.join(DIR, 'root-gloss-backfill-report.json');
fs.writeFileSync(reportPath, JSON.stringify({ mode: APPLY_SAFE ? 'applied' : 'dry-run', passACount, passBCount, changeLog }, null, 2));
const suggestionsPath = path.join(DIR, 'root-gloss-suggestions.json');
fs.writeFileSync(suggestionsPath, JSON.stringify(suggestions, null, 2));

console.log(`${BOOK_NAMES_PATH_HINT}`);
console.log(`Scanned ${verses.length} verse(s)${ONLY_BOOK ? ` (book_id=${ONLY_BOOK}${ONLY_CHAPTER ? `, chapter=${ONLY_CHAPTER}` : ''})` : ' (whole OT)'}.`);
console.log(`PASS A (bare translit -> insert gloss): ${passACount} change(s)`);
console.log(`PASS B (name-map drift, e.g. Yahweh -> Yahawah): ${passBCount} change(s)`);
console.log(`PASS C (English-word suggestions, NOT applied): ${suggestions.length} candidate(s) written to ${suggestionsPath}`);
console.log(`Full change log: ${reportPath}`);
console.log(APPLY_SAFE
    ? `\n✓ Applied Pass A + B. Every change went through saveVerseWithHistory — revertible from the Translate Studio history UI per verse.`
    : `\nDRY RUN — nothing written. Re-run with --apply-safe to write Pass A + B changes.\nPass C is never auto-applied — review root-gloss-suggestions.json, delete entries you don't want, then run apply-reviewed-suggestions.js on what's left.`);
