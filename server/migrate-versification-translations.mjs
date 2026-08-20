#!/usr/bin/env node
/**
 * migrate-versification-translations.mjs — ONE-OFF migration, NOT a gate.
 *
 * Display authority for the ~23 non-Psalms OT books in
 * versification-differences.json just flipped from BHS/Masoretic numbering to
 * English/KJV-tradition numbering (server.js's resolveEnglishChapter /
 * ENG_CHAPTER_SEGMENTS). translation.db's `translations`, `translation_links`,
 * and `translation_history` tables are keyed directly by (book_id, chapter,
 * verse) using DISPLAY numbers — which up to now meant BHS numbers for these
 * books. Any saved status/text/links/history for a verse that's being
 * renumbered (e.g. what was Deuteronomy 13:1 under BHS numbering is now
 * Deuteronomy 12:32) needs to move to its new key, or it will look orphaned
 * (silently reset to an untouched draft) once the server starts reading
 * translation.db with the new numbering.
 *
 * versification-differences.json is the same file server.js loads — this
 * script duplicates just enough of its segment logic to compute the flat list
 * of (oldChapter,oldVerse) -> (newChapter,newVerse) moves (KEEP IN SYNC WITH
 * server.js's buildEnglishVersificationSegments if that logic ever changes).
 * Only verses named by an EXPLICIT entry ever move — every chapter without an
 * entry maps identity (old key === new key) under both the old and new
 * schemes, so this does NOT need tokens_bhs's per-chapter verse counts the
 * way server.js's full segment builder does; it only needs tokens_bhs to
 * sanity-check that each entry's source verse actually exists, catching a bad
 * transcription in the JSON before it moves someone's real translation work
 * to the wrong place.
 *
 * USAGE:
 *   node migrate-versification-translations.mjs <corpusDbPath> <translationDbPath> [--dry-run] [--force]
 * (--dry-run prints what WOULD move without writing anything. ALWAYS run
 * --dry-run first and read the output before running for real.)
 *
 * NOT SAFE TO BLINDLY RE-RUN, despite an earlier version of this comment
 * claiming otherwise — caught in testing before this ever touched real data.
 * A chapter's OLD (source) verse range and NEW (destination) verse range
 * overlap (e.g. Genesis 32: sources are heb verses 1-33, destinations are
 * eng verses 1-32, in the SAME chapter 32) — so after a successful run, the
 * "old key" a second run would check is no longer empty, it's just been
 * refilled by a DIFFERENT verse's migrated data, which a naive re-run would
 * then move AGAIN, cascading the shift and corrupting the chapter. To make
 * accidental re-runs safe, this script stamps a marker file (next to
 * translationDbPath, containing a hash of versification-differences.json)
 * after a real run completes, and refuses to run again — for --dry-run too,
 * so the preview can't lie about it either — unless that JSON has changed OR
 * --force is passed. Only pass --force if you understand the risk above.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const positional = args.filter(a => !a.startsWith('--'));
const [corpusDbPath, translationDbPath] = positional;

if (!corpusDbPath || !translationDbPath || !fs.existsSync(corpusDbPath) || !fs.existsSync(translationDbPath)) {
    console.error('Usage: node migrate-versification-translations.mjs <corpusDbPath> <translationDbPath> [--dry-run] [--force]');
    process.exit(1);
}

const vdPath = path.join(__dirname, 'versification-differences.json');
const vdHash = crypto.createHash('sha256').update(fs.readFileSync(vdPath)).digest('hex');
const VERSIFICATION_DIFFERENCES = JSON.parse(fs.readFileSync(vdPath, 'utf8')).differences || {};

// Marker lives next to translationDbPath (the persistent data volume), not
// next to this script — same placement rule the verify-*.mjs gates use for
// their skip-if-unchanged caches, and for the same reason: this can run
// inside an ephemeral `docker run --rm` container.
const MARKER_PATH = path.join(path.dirname(translationDbPath), '.versification-migration-applied.json');
if (!FORCE) {
    let marker = null;
    try { marker = JSON.parse(fs.readFileSync(MARKER_PATH, 'utf8')); } catch { /* not applied yet */ }
    if (marker && marker.vdHash === vdHash) {
        console.log(`Already migrated — ${path.basename(vdPath)} (this exact version) was applied to ` +
                     `${translationDbPath} on ${marker.appliedAt} (${marker.migratedCount} row(s) moved). ` +
                     `Nothing to do. Pass --force to re-run anyway (only if you understand the overlapping-` +
                     `verse-range risk described in this script's header — re-running is NOT simply idempotent).`);
        process.exit(0);
    }
}

// ── BUILD THE FLAT MOVE LIST ────────────────────────────────────────────────
const moves = []; // { bookId, oldChapter, oldVerse, newChapter, newVerse }
for (const key of Object.keys(VERSIFICATION_DIFFERENCES)) {
    const [bookIdStr, hebChapterStr] = key.split(':');
    const bookId = parseInt(bookIdStr, 10);
    const hebChapter = parseInt(hebChapterStr, 10);
    for (const seg of VERSIFICATION_DIFFERENCES[key]) {
        const [hebStart, hebEnd] = seg.heb;
        const engChapter = seg.engChapter;
        const engStart = seg.eng[0];
        for (let v = hebStart; v <= hebEnd; v++) {
            const newVerse = engStart + (v - hebStart);
            if (hebChapter === engChapter && v === newVerse) continue; // no-op, shouldn't occur but stay safe
            moves.push({ bookId, oldChapter: hebChapter, oldVerse: v, newChapter: engChapter, newVerse });
        }
    }
}

// Collision guard: two different source verses must never target the same
// destination key — if they do, versification-differences.json has an
// internal inconsistency that needs fixing before any data moves.
const destSeen = new Map();
for (const m of moves) {
    const dk = `${m.bookId}:${m.newChapter}:${m.newVerse}`;
    const sk = `${m.bookId}:${m.oldChapter}:${m.oldVerse}`;
    if (destSeen.has(dk)) {
        console.error(`Collision: both ${destSeen.get(dk)} and ${sk} map to ${dk} — aborting before any write. ` +
                       `Fix versification-differences.json first.`);
        process.exit(1);
    }
    destSeen.set(dk, sk);
}

// ── SANITY-CHECK SOURCES AGAINST tokens_bhs ─────────────────────────────────
const corpusDb = new Database(corpusDbPath, { readonly: true });
const hasBhsVerse = corpusDb.prepare(`SELECT 1 FROM tokens_bhs WHERE book_id=? AND chapter=? AND verse=? LIMIT 1`);
const missingSource = moves.filter(m => !hasBhsVerse.get(m.bookId, m.oldChapter, m.oldVerse));
if (missingSource.length) {
    console.error(`${missingSource.length} entr(y/ies) in versification-differences.json reference a BHS verse that ` +
                   `doesn't exist in tokens_bhs — aborting before any write:`);
    for (const m of missingSource.slice(0, 20)) {
        console.error(`  book=${m.bookId} ${m.oldChapter}:${m.oldVerse} (would move to ${m.newChapter}:${m.newVerse})`);
    }
    process.exit(1);
}
corpusDb.close();

// ── READ EVERY AFFECTED ROW BEFORE ANY WRITE ────────────────────────────────
// So a partial overlap in the affected range (already ruled out by the
// collision guard above, but belt-and-braces) can't clobber itself mid-run.
const tdb = new Database(translationDbPath, { readonly: DRY_RUN });
const getTranslation = tdb.prepare(`SELECT * FROM translations WHERE book_id=? AND chapter=? AND verse=?`);
const getLinks       = tdb.prepare(`SELECT * FROM translation_links WHERE book_id=? AND chapter=? AND verse=?`);
const getHistory     = tdb.prepare(`SELECT * FROM translation_history WHERE book_id=? AND chapter=? AND verse=?`);

const plan = moves.map(m => ({
    ...m,
    translation: getTranslation.get(m.bookId, m.oldChapter, m.oldVerse) || null,
    links:       getLinks.all(m.bookId, m.oldChapter, m.oldVerse),
    history:     getHistory.all(m.bookId, m.oldChapter, m.oldVerse),
}));
const withData = plan.filter(m => m.translation || m.links.length || m.history.length);

console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}${moves.length} verse(s) covered by known versification differences ` +
            `across ${new Set(moves.map(m => m.bookId)).size} book(s); ${withData.length} have saved data to migrate:`);
for (const m of withData) {
    const bits = [];
    if (m.translation) bits.push(`status=${m.translation.status}`);
    if (m.links.length) bits.push(`${m.links.length} link(s)`);
    if (m.history.length) bits.push(`${m.history.length} history row(s)`);
    console.log(`  book=${m.bookId} ${m.oldChapter}:${m.oldVerse} -> ${m.newChapter}:${m.newVerse} (${bits.join(', ')})`);
}

if (DRY_RUN) {
    console.log('\nDry run only — nothing written. Review the moves above, then re-run without --dry-run to apply.');
    process.exit(0);
}

if (!withData.length) {
    console.log('\nNothing to migrate — no translation work exists yet in these chapters.');
    if (!DRY_RUN) {
        try {
            fs.writeFileSync(MARKER_PATH, JSON.stringify({ vdHash, appliedAt: new Date().toISOString(), migratedCount: 0 }, null, 2) + '\n');
        } catch { /* marker write is a safety net, never fatal */ }
    }
    process.exit(0);
}

// Destination collision check. IMPORTANT: this is NOT as simple as "must be
// empty" — a `translations` row is EXPECTED to already sit at a destination
// key when that key is itself the OLD key of another move in this SAME
// batch. Every multi-segment versification-differences.json entry produces
// exactly this "chain": e.g. Genesis 32's entry moves heb32:1 -> eng31:55
// AND heb32:2 -> eng32:1 — the second move's destination, (32,1), is
// CURRENTLY occupied by heb32:1's own data, which the first move is about
// to vacate. An earlier version of this script treated any occupied
// destination as a hard error and aborted on this exact case for every
// affected book. The real, narrower danger is a destination that's occupied
// by something that will NOT be vacated by this migration — genuine
// pre-existing data this migration doesn't know about. So: only the OLD
// keys of moves that actually carry translation data will be vacated —
// build that set, and only flag a destination as a real collision if it's
// occupied AND not itself one of those soon-to-be-vacated keys.
const vacatedKeys = new Set(
    withData.filter(m => m.translation).map(m => `${m.bookId}:${m.oldChapter}:${m.oldVerse}`)
);
const realCollisions = [];
for (const m of withData) {
    if (!m.translation) continue;   // nothing being inserted at this destination, nothing to check
    const destKey = `${m.bookId}:${m.newChapter}:${m.newVerse}`;
    if (vacatedKeys.has(destKey)) continue;   // will be emptied by another move's delete — safe
    const existing = getTranslation.get(m.bookId, m.newChapter, m.newVerse);
    if (existing) realCollisions.push({ ...m, existing });
}
if (realCollisions.length) {
    console.error(`${realCollisions.length} destination(s) already hold saved translation data that this ` +
                   `migration does NOT account for — aborting before any write. Investigate before re-running:`);
    for (const c of realCollisions.slice(0, 20)) {
        console.error(`  book=${c.bookId} ${c.newChapter}:${c.newVerse} already has status=${c.existing.status} ` +
                       `(would receive data moving from ${c.oldChapter}:${c.oldVerse})`);
    }
    process.exit(1);
}

const deleteTranslation = tdb.prepare(`DELETE FROM translations WHERE book_id=? AND chapter=? AND verse=?`);
const insertTranslation = tdb.prepare(`
    INSERT INTO translations(book_id, chapter, verse, status, text, rich_text, source_origin, original_text, updated_at)
    VALUES(?,?,?,?,?,?,?,?,?)
`);
const updateLinks   = tdb.prepare(`UPDATE translation_links   SET chapter=?, verse=? WHERE id=?`);
const updateHistory = tdb.prepare(`UPDATE translation_history SET chapter=?, verse=? WHERE id=?`);

// Two clean passes, not interleaved delete-then-insert per move: ALL source
// rows are deleted first, THEN all destination rows are inserted. This is
// what actually makes the "chain" case above safe regardless of which order
// `withData` happens to iterate in — by the time any INSERT runs, every key
// that's a source ANYWHERE in this batch is already empty, so an INSERT can
// only ever fail on a genuine, already-ruled-out collision.
const run = tdb.transaction((items) => {
    for (const m of items) {
        if (m.translation) deleteTranslation.run(m.bookId, m.oldChapter, m.oldVerse);
    }
    for (const m of items) {
        if (m.translation) {
            insertTranslation.run(
                m.bookId, m.newChapter, m.newVerse,
                m.translation.status, m.translation.text, m.translation.rich_text,
                m.translation.source_origin, m.translation.original_text, m.translation.updated_at
            );
        }
        for (const l of m.links)   updateLinks.run(m.newChapter, m.newVerse, l.id);
        for (const h of m.history) updateHistory.run(m.newChapter, m.newVerse, h.id);
    }
});
run(withData);

console.log(`\n✓ Migrated ${withData.length} verse's saved data to its new English-authoritative chapter:verse key.`);
try {
    fs.writeFileSync(MARKER_PATH, JSON.stringify({
        vdHash, appliedAt: new Date().toISOString(), migratedCount: withData.length,
    }, null, 2) + '\n');
} catch { /* marker write is a safety net, never fatal */ }
tdb.close();
