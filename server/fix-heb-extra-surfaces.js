#!/usr/bin/env node
/**
 * fix-heb-extra-surfaces.js — corrects defective-vs-plene spelling drift in
 * HEB (Hebrew extra)'s own stored Genesis 1 verse text, using BHS's own
 * real, already-tokenized morphology (tokens_bhs, read through this app's
 * running /api/tokens endpoint) as ground truth.
 *
 * WHY THROUGH THE API AND NOT A FRESH SQL QUERY: turning tokens_bhs's raw
 * per-morpheme rows (proclitics like waw/conjunction are their own row) into
 * one whole displayed WORD (e.g. WaYaHayah as a single fused surface) is
 * exactly what server.js's groupSurfaceTokens()/parseHebrewData() already do
 * — proclitic-folding, maqaf-joining, all of it. Reimplementing that logic
 * independently here would risk silently disagreeing with what the app
 * actually shows. Reusing /api/tokens means "the full surface" is defined
 * as "whatever the app itself already computes", never a second guess.
 *
 * fieldy, 2026-08-25: "not from memory but the bhs tokens exist, changing
 * the words to be the corresponding full surfaces should be straight
 * forward." This script is exactly that cross-reference — no token here is
 * ever typed from memory; every HEB token and every BHS surface comes
 * straight off corpus.db / the running app.
 *
 * SCOPE: Genesis 1 ONLY (book_id 1, chapter 1) — fieldy's explicit answer
 * when asked, 2026-08-25: "Genesis 1 only, for now". Do not widen this
 * script's BOOK_ID/CHAPTER constants to "fix the whole corpus" without
 * asking again; the alignment safety checks below are conservative on
 * purpose but have only been validated against this one chapter.
 *
 * SAFETY — read before running with --apply:
 *   - Default mode is DRY RUN. Nothing is written to corpus.db unless you
 *     pass --apply explicitly. Run without --apply first, read the report,
 *     paste it back before ever using --apply.
 *   - A verse is skipped entirely (not guessed at) if HEB's whitespace-token
 *     count for that verse doesn't match BHS's word-block count — position
 *     alignment can't be trusted when the counts disagree.
 *   - A HEB/BHS pair is only proposed as an auto-fix when: they differ, BHS
 *     is strictly longer, EVERY character of the HEB form appears in the
 *     BHS form in the same order (a true subsequence — i.e. "some letters
 *     were dropped", not "this is a different word"), and the length gap is
 *     at most 2 letters. This is the same judgment fieldy made by hand for
 *     𐤅𐤉𐤄𐤉 -> 𐤅𐤉𐤄𐤉𐤄 earlier this session, generalized — not a new rule.
 *     Anything that doesn't clear this bar is reported as NEEDS REVIEW and
 *     is never auto-applied.
 *   - --apply takes an ONLINE backup of corpus.db (better-sqlite3's own
 *     .backup(), never a raw file copy — corpus.db runs in WAL mode, and a
 *     plain cp/scp of a live WAL-mode db can silently corrupt the copy).
 *     PRAGMA integrity_check runs against that backup, in a FRESH connection
 *     opened onto the backup file, before any write touches the live db.
 *     If that check fails, the script aborts and writes nothing.
 *   - After writing, PRAGMA integrity_check runs again on the live db (also
 *     a fresh connection) before the script reports success. Any failure is
 *     printed loudly — it does not attempt to auto-revert; you still have
 *     the pre-write backup file to restore from by hand if that ever fires.
 *   - Each fix replaces the exact whitespace-delimited token in verses.text
 *     — located by re-splitting the verse's raw text the SAME way
 *     splitTextToTokens()/dump-verse-tokens.js already do, at the SAME
 *     index the mismatch was found at — never a blind global string
 *     replace, so a word that happens to share letters elsewhere in the
 *     verse is never touched.
 *   - LOCAL corpus.db only. Prod is untouched — if these fixes look right,
 *     they still need to be replicated against prod's own corpus.db copy
 *     separately (same as the translation.db backfill earlier this
 *     session), never by pushing this local db to prod.
 *
 * Usage:
 *   node fix-heb-extra-surfaces.js                          (dry run)
 *   node fix-heb-extra-surfaces.js --dry-run
 *   node fix-heb-extra-surfaces.js --apply
 *   node fix-heb-extra-surfaces.js --apply --base-url http://localhost:3000
 *   node fix-heb-extra-surfaces.js --verse=17                (diagnostic —
 *       prints HEB's and BHS's word lists side by side for verse 17, with
 *       BHS's underlying sourceTokens per word, so a count mismatch can be
 *       DIAGNOSED instead of guessed at. Read-only, never writes anything.)
 *
 * Requires the app's dev server already running (reads /api/tokens off it).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const baseUrlArg = args.find(a => a.startsWith('--base-url='));
const BASE_URL = (baseUrlArg ? baseUrlArg.split('=')[1] : 'http://localhost:3000').replace(/\/$/, '');

const BOOK_ID = 1;  // Genesis (canon_id)
const CHAPTER = 1;  // Genesis 1 ONLY — see header. Do not widen without asking fieldy again.

const CORPUS_DB = path.join(__dirname, 'corpus.db');

if (!fs.existsSync(CORPUS_DB)) {
    console.error(`corpus.db not found at ${CORPUS_DB} — run this from the server/ folder.`);
    process.exit(1);
}
if (typeof fetch !== 'function') {
    console.error('global fetch() is not available in this Node version. Node 18+ is required.');
    process.exit(1);
}

// Identical strip-set to splitTextToTokens()'s norm regex in server.js and
// dump-verse-tokens.js's STOPS — kept in sync deliberately. Ethiopic
// punctuation is irrelevant to Hebrew text but harmless to include; keeping
// the exact same character class means this script's tokenization can never
// silently diverge from what the reader actually splits on.
const STOPS_RE = /[፠-፨·.,:;!?;·\[\]⟦⟧⸢⸣⸤⸥⌊⌋]/;
function isStop(ch) { return STOPS_RE.test(ch); }
function cleanToken(raw) {
    let out = '';
    for (const ch of raw) if (!isStop(ch)) out += ch;
    return out;
}

// True when `heb` is a genuine defective spelling of `bhs`: every character
// of heb appears in bhs, in the same order, bhs is strictly longer, and the
// gap is small. See the SAFETY section in the header for why this exact bar.
//
// Paleo-Hebrew glyphs (U+10900 block) are outside the BMP, so every letter
// is a UTF-16 SURROGATE PAIR (2 code units). Comparing/indexing with plain
// .length/[i] operates on code units, not letters — it would silently
// double-count the length gap and index into the middle of a surrogate
// pair, breaking the match entirely. Array.from() is codepoint-aware (it
// splits surrogate pairs back into single array entries), so every
// length/index below goes through codepoint arrays, never raw string
// indexing. Verified against the real 𐤅𐤉𐤄𐤉 -> 𐤅𐤉𐤄𐤉𐤄 case before shipping —
// naive string indexing returned false for that exact pair.
function isDefectiveOf(heb, bhs) {
    if (!heb || !bhs || heb === bhs) return false;
    const hebChars = Array.from(heb);
    const bhsChars = Array.from(bhs);
    if (bhsChars.length <= hebChars.length) return false;
    if (bhsChars.length - hebChars.length > 2) return false;
    let i = 0;
    for (const ch of bhsChars) {
        if (i < hebChars.length && hebChars[i] === ch) i++;
    }
    return i === hebChars.length;
}

// Splits raw verse text into {piece, isSep} parts, alternating word/sep,
// preserving EVERY character of the original string when rejoined. This is
// what lets a single-token fix be applied by replacing exactly one `piece`
// entry and rejoining — nothing else in the verse's text changes, byte for
// byte, including whatever whitespace pattern was already there.
function splitPreserving(text) {
    const raw = String(text || '');
    const parts = raw.split(/(\s+)/);
    return parts.map((piece, idx) => ({ piece, isSep: idx % 2 === 1 }));
}

// Within one non-separator piece, find the single contiguous run of
// non-stop characters (the "word" the reader would tokenize out of it) and
// return {pre, word, post} so a fix can rebuild pre + newWord + post. If the
// piece contains more than one such run (shouldn't happen for real verse
// text — punctuation only appears at token edges in this corpus), returns
// null and the caller reports it for manual review instead of guessing.
function splitWordFromPiece(piece) {
    let start = -1, end = -1;
    for (let i = 0; i < piece.length; i++) {
        if (!isStop(piece[i])) {
            if (start === -1) start = i;
            end = i;
        }
    }
    if (start === -1) return null; // no word characters in this piece at all
    // If any stop char lies BETWEEN start and end, the piece has more than
    // one non-stop run (e.g. "word,other") — refuse to guess which is meant.
    for (let i = start; i <= end; i++) {
        if (isStop(piece[i])) return null;
    }
    const word = piece.slice(start, end + 1);
    return { pre: piece.slice(0, start), word, post: piece.slice(end + 1) };
}

async function fetchBhsVerseWords() {
    const url = `${BASE_URL}/api/tokens?book=${BOOK_ID}&chapter=${CHAPTER}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) {
        throw new Error(`Unexpected /api/tokens response shape (expected a flat array): ${JSON.stringify(data).slice(0, 300)}`);
    }
    const byVerse = new Map();
    const detailByVerse = new Map(); // verse -> [{surface, sourceTokens}], for --verse diagnostic mode
    for (const w of data) {
        const surface = (w.sourceTokens || []).map(t => t.word_raw).filter(Boolean).join('');
        if (!surface) continue;
        if (!byVerse.has(w.verse)) byVerse.set(w.verse, []);
        byVerse.get(w.verse).push(surface);
        if (!detailByVerse.has(w.verse)) detailByVerse.set(w.verse, []);
        detailByVerse.get(w.verse).push({ surface, sourceTokens: w.sourceTokens || [] });
    }
    return { byVerse, detailByVerse };
}

// --verse=N diagnostic mode: prints HEB's and BHS's word lists SIDE BY SIDE
// for one verse, with BHS's underlying sourceTokens shown per word, instead
// of just a bare count. Use this whenever the main report says a verse's
// word counts don't match and you want to see exactly where they diverge,
// rather than guessing from the count alone. Read-only — never writes
// anything, no matter what other flags are passed alongside it.
async function diagnosticVerse(v) {
    console.log(`Fetching BHS surfaces for Genesis ${CHAPTER} from ${BASE_URL} ...`);
    const { detailByVerse } = await fetchBhsVerseWords();
    const dbRO = new Database(CORPUS_DB, { readonly: true });
    const row = dbRO.prepare(
        `SELECT text FROM verses WHERE corpus='HEB' AND canon_id=? AND ord_c=? AND ord_v=?`
    ).get(BOOK_ID, CHAPTER, v);
    dbRO.close();
    if (!row || !row.text) {
        console.error(`No HEB text found for Genesis ${CHAPTER}:${v}.`);
        return;
    }
    const hebWords = splitPreserving(row.text)
        .filter(p => !p.isSep && cleanToken(p.piece))
        .map(p => cleanToken(p.piece));
    const bhsDetail = detailByVerse.get(v) || [];

    console.log(`\n=== DIAGNOSTIC: Genesis ${CHAPTER}:${v} ===`);
    console.log(`HEB raw text: ${row.text}`);
    console.log(`\nHEB whitespace tokens (${hebWords.length}):`);
    hebWords.forEach((w, i) => console.log(`  [${i}] ${w}`));
    console.log(`\nBHS word-blocks (${bhsDetail.length}):`);
    bhsDetail.forEach((w, i) => {
        const srcStr = w.sourceTokens.map(t => `${t.word_raw}${t.strongs ? `(${t.strongs})` : ''}`).join(' + ') || '(none)';
        console.log(`  [${i}] ${w.surface}   <- sourceTokens: ${srcStr}`);
    });
    if (hebWords.length !== bhsDetail.length) {
        console.log(`\nCount differs: HEB=${hebWords.length}, BHS=${bhsDetail.length}. Compare the two lists above to see where they diverge.`);
    } else {
        console.log(`\nCounts match (${hebWords.length}). This verse would be walked position-by-position in the main run.`);
    }
}

async function backupAndCheck(dbRW) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(__dirname, `corpus.db.pre-heb-surface-fix.${stamp}.bak`);
    console.log(`\n[backup] taking online backup -> ${backupPath}`);
    await dbRW.backup(backupPath);
    const backupCheck = new Database(backupPath, { readonly: true });
    const result = backupCheck.pragma('integrity_check');
    backupCheck.close();
    const ok = Array.isArray(result) && result.length === 1 && result[0].integrity_check === 'ok';
    if (!ok) {
        console.error('[backup] PRAGMA integrity_check FAILED on the fresh backup:', result);
        console.error('[backup] Aborting — nothing will be written. The backup file above is untouched corpus.db state.');
        process.exit(1);
    }
    console.log('[backup] integrity_check ok on backup — safe to proceed.');
    return backupPath;
}

async function main() {
    const verseArg = args.find(a => a.startsWith('--verse='));
    if (verseArg) {
        const v = parseInt(verseArg.split('=')[1], 10);
        if (!Number.isFinite(v)) { console.error('--verse=N requires a verse number.'); process.exit(1); }
        await diagnosticVerse(v);
        return;
    }

    console.log(`Fetching BHS surfaces for Genesis ${CHAPTER} from ${BASE_URL} ...`);
    const { byVerse: bhsByVerse } = await fetchBhsVerseWords();

    const dbRO = new Database(CORPUS_DB, { readonly: true });
    const maxVerseRow = dbRO.prepare(
        `SELECT MAX(ord_v) AS maxV FROM verses WHERE corpus='HEB' AND canon_id=? AND ord_c=?`
    ).get(BOOK_ID, CHAPTER);
    const maxVerse = maxVerseRow && maxVerseRow.maxV;
    if (!maxVerse) {
        console.error(`No HEB verses found for book_id=${BOOK_ID} chapter=${CHAPTER} in corpus.db.`);
        process.exit(1);
    }

    const HEB_VERSE = dbRO.prepare(
        `SELECT text FROM verses WHERE corpus='HEB' AND canon_id=? AND ord_c=? AND ord_v=?`
    );

    const plan = [];      // [{verse, index, oldWord, newWord}]
    const skipped = [];   // [{verse, reason}]
    const needsReview = []; // [{verse, index, heb, bhs}]

    for (let v = 1; v <= maxVerse; v++) {
        const row = HEB_VERSE.get(BOOK_ID, CHAPTER, v);
        if (!row || !row.text) { skipped.push({ verse: v, reason: 'no HEB text for this verse' }); continue; }
        const bhsWords = bhsByVerse.get(v) || [];

        const parts = splitPreserving(row.text);
        const wordPieceIdx = []; // index into `parts` for each non-sep, non-empty piece
        const hebWords = [];
        parts.forEach((p, idx) => {
            if (p.isSep || !p.piece) return;
            const cleaned = cleanToken(p.piece);
            if (!cleaned) return; // standalone punctuation piece, not a word
            wordPieceIdx.push(idx);
            hebWords.push(cleaned);
        });

        if (hebWords.length !== bhsWords.length) {
            skipped.push({
                verse: v,
                reason: `word-count mismatch (HEB=${hebWords.length}, BHS=${bhsWords.length}) — cannot safely align, skipping whole verse`,
            });
            continue;
        }

        for (let i = 0; i < hebWords.length; i++) {
            const heb = hebWords[i];
            const bhs = bhsWords[i];
            if (heb === bhs) continue;
            if (isDefectiveOf(heb, bhs)) {
                plan.push({ verse: v, index: i, partsIdx: wordPieceIdx[i], oldWord: heb, newWord: bhs, rawPiece: parts[wordPieceIdx[i]].piece });
            } else {
                needsReview.push({ verse: v, index: i, heb, bhs });
            }
        }
    }

    console.log('\n=== REPORT: Genesis 1, HEB vs BHS surfaces ===\n');
    if (skipped.length) {
        console.log(`Skipped ${skipped.length} verse(s) (not touched, not analyzed further):`);
        for (const s of skipped) console.log(`  v${s.verse}: ${s.reason}`);
        console.log('');
    }
    if (needsReview.length) {
        console.log(`${needsReview.length} mismatch(es) NOT auto-fixable — needs human review (never applied):`);
        for (const n of needsReview) console.log(`  v${n.verse} word#${n.index + 1}: HEB="${n.heb}"  BHS="${n.bhs}"`);
        console.log('');
    }
    if (plan.length) {
        console.log(`${plan.length} defective-spelling fix(es) proposed:`);
        for (const p of plan) console.log(`  v${p.verse} word#${p.index + 1}: "${p.oldWord}" -> "${p.newWord}"`);
    } else {
        console.log('No auto-fixable defective-spelling mismatches found.');
    }

    if (!plan.length) {
        dbRO.close();
        console.log('\nNothing to apply. Done.');
        return;
    }

    if (!APPLY) {
        dbRO.close();
        console.log('\nDRY RUN — no changes written. Re-run with --apply after reviewing the plan above.');
        return;
    }

    // ── APPLY ────────────────────────────────────────────────────────────
    dbRO.close();
    const dbRW = new Database(CORPUS_DB);
    await backupAndCheck(dbRW);

    const byVerse = new Map();
    for (const p of plan) {
        if (!byVerse.has(p.verse)) byVerse.set(p.verse, []);
        byVerse.get(p.verse).push(p);
    }

    const UPDATE = dbRW.prepare(`UPDATE verses SET text=? WHERE corpus='HEB' AND canon_id=? AND ord_c=? AND ord_v=?`);
    const tx = dbRW.transaction(() => {
        for (const [v, fixes] of byVerse) {
            const row = HEB_VERSE_RW(dbRW).get(BOOK_ID, CHAPTER, v);
            const parts = splitPreserving(row.text);
            for (const f of fixes) {
                const piece = parts[f.partsIdx].piece;
                const split = splitWordFromPiece(piece);
                if (!split || split.word !== f.oldWord) {
                    throw new Error(`v${v} word#${f.index + 1}: piece "${piece}" didn't re-split as expected — aborting transaction, nothing committed.`);
                }
                parts[f.partsIdx].piece = split.pre + f.newWord + split.post;
            }
            const newText = parts.map(p => p.piece).join('');
            const beforeClean = cleanToken(row.text.replace(/\s+/g, ''));
            const afterClean = cleanToken(newText.replace(/\s+/g, ''));
            console.log(`\nv${v} before: ${row.text}`);
            console.log(`v${v} after:  ${newText}`);
            UPDATE.run(newText, BOOK_ID, CHAPTER, v);
        }
    });
    tx();

    console.log('\n[apply] write committed. Running fresh-connection integrity_check on live corpus.db ...');
    dbRW.close();
    const post = new Database(CORPUS_DB, { readonly: true });
    const postResult = post.pragma('integrity_check');
    post.close();
    const postOk = Array.isArray(postResult) && postResult.length === 1 && postResult[0].integrity_check === 'ok';
    if (!postOk) {
        console.error('\n[apply] POST-WRITE integrity_check FAILED:', postResult);
        console.error('[apply] The pre-write backup taken above is your restore point — do not continue using this corpus.db until reviewed.');
        process.exit(1);
    }
    console.log('[apply] integrity_check ok. Done — ' + plan.length + ' word(s) corrected in Genesis 1.');
}

function HEB_VERSE_RW(db) {
    return db.prepare(`SELECT text FROM verses WHERE corpus='HEB' AND canon_id=? AND ord_c=? AND ord_v=?`);
}

main().catch(err => {
    console.error('\nFATAL:', err.message);
    process.exit(1);
});
