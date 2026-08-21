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
// A segment marked "merge": true (currently only 1 Samuel 21's heb 20:42/21:1
// case — see versification-differences.json's header comment) targets a
// destination that's EXPECTED to already hold a different verse's own,
// never-moved data. Every other segment targets a destination that's either
// empty or is itself vacated by another move in this same batch (the
// "chain" case handled below) — those are NOT merges, just ordinary
// boundary shifts, and must still be treated as a hard collision if their
// destination is unexpectedly occupied by something unrelated.
const moves = []; // { bookId, oldChapter, oldVerse, newChapter, newVerse, merge }
for (const key of Object.keys(VERSIFICATION_DIFFERENCES)) {
    const [bookIdStr, hebChapterStr] = key.split(':');
    const bookId = parseInt(bookIdStr, 10);
    const hebChapter = parseInt(hebChapterStr, 10);
    for (const seg of VERSIFICATION_DIFFERENCES[key]) {
        const [hebStart, hebEnd] = seg.heb;
        const engChapter = seg.engChapter;
        const engStart = seg.eng[0];
        const merge = !!seg.merge;
        for (let v = hebStart; v <= hebEnd; v++) {
            const newVerse = engStart + (v - hebStart);
            if (hebChapter === engChapter && v === newVerse) continue; // no-op, shouldn't occur but stay safe
            moves.push({ bookId, oldChapter: hebChapter, oldVerse: v, newChapter: engChapter, newVerse, merge });
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
// occupied AND not itself one of those soon-to-be-vacated keys. This
// includes merge-move sources too (NOT just ordinary moves) — a merge move's
// OLD key is always deleted regardless of which resolution wins (see the
// apply step below), so anything chaining into that address is just as safe
// as chaining into an ordinary move's vacated address. Confirmed necessary
// by testing: 1 Samuel 21's heb21:2->eng21:1 chains directly into heb21:1's
// own address, and heb21:1 is itself the merge move's source.
// A destination occupied by an UNTOUCHED baseline placeholder (status='none',
// and its text is still exactly the frozen original_text snapshot — nobody
// ever edited it) is not "genuine pre-existing data this migration doesn't
// know about" — it's the same load-english-baseline.js/import-original
// scaffolding that seeds a row for essentially every verse in the corpus,
// sitting at an address that happens to coincide with a move's destination.
// Confirmed via diagnose-remigration.mjs against production data (2026-08-21):
// 750 of 752 "still has old-key data" verses were exactly this — both the old
// AND new key held a matching, unedited placeholder from the SAME original
// 2026-08-18 baseline-seed timestamp, nothing a live translator ever touched.
// Overwriting a placeholder with the real (moved) data loses nothing; this is
// the same "dest is untouched baseline -> overwrite" rule the merge-resolution
// step below already applies, just extended to ordinary (non-merge) moves.
const vacatedKeys = new Set(
    withData.filter(m => m.translation).map(m => `${m.bookId}:${m.oldChapter}:${m.oldVerse}`)
);
const isUntouchedPlaceholder = (row) =>
    !!row && row.status === 'none' && row.original_text != null && row.text === row.original_text;
const realCollisions = [];
const placeholderOverwrites = []; // { ...m, existing } — destination has only an untouched placeholder, safe to clear and overwrite
for (const m of withData) {
    if (!m.translation || m.merge) continue;   // merges are resolved separately below, not here
    const destKey = `${m.bookId}:${m.newChapter}:${m.newVerse}`;
    if (vacatedKeys.has(destKey)) continue;   // will be emptied by another move's delete — safe
    const existing = getTranslation.get(m.bookId, m.newChapter, m.newVerse);
    if (!existing) continue;
    if (isUntouchedPlaceholder(existing)) {
        placeholderOverwrites.push({ ...m, existing });
    } else {
        realCollisions.push({ ...m, existing });
    }
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
if (placeholderOverwrites.length) {
    console.log(`\n${placeholderOverwrites.length} destination(s) hold only an untouched baseline placeholder — ` +
                 `will be cleared and overwritten with the moved data:`);
    for (const p of placeholderOverwrites.slice(0, 20)) {
        console.log(`  book=${p.bookId} ${p.newChapter}:${p.newVerse} (placeholder from ${p.existing.updated_at}, ` +
                     `receiving data moving from ${p.oldChapter}:${p.oldVerse})`);
    }
    if (placeholderOverwrites.length > 20) console.log(`  ...and ${placeholderOverwrites.length - 20} more.`);
}

// ── MERGE RESOLUTION (segments flagged "merge": true) ───────────────────────
// A merge move's destination is EXPECTED to already hold a different verse's
// own data (that verse never moves — see versification-differences.json's
// header comment for the 1 Samuel 21 case this exists for). Two real rows
// can't occupy one primary key, so decide, per merge move, which side's data
// survives:
//   - source is untouched baseline (status 'none') and dest has anything  → keep dest, discard source. No real work lost.
//   - dest is untouched baseline (status 'none') and source has anything  → dest was never real work either; overwrite dest with source.
//   - both sides are 'none', or dest doesn't exist yet                    → trivial, either resolution is fine, prefer keeping dest if present.
//   - BOTH sides are real (non-'none') work                               → genuinely ambiguous, cannot safely auto-pick. Abort for manual review.
const mergeMoves = withData.filter(m => m.merge && m.translation);
const mergePlan = [];   // { m, action: 'keep-dest' | 'overwrite-dest' | 'insert' }
const mergeAmbiguous = [];
for (const m of mergeMoves) {
    const dest = getTranslation.get(m.bookId, m.newChapter, m.newVerse);
    if (!dest) {
        mergePlan.push({ m, action: 'insert' });
    } else if (m.translation.status !== 'none' && dest.status !== 'none') {
        mergeAmbiguous.push({ m, dest });
    } else if (dest.status === 'none') {
        mergePlan.push({ m, action: 'overwrite-dest' });
    } else {
        mergePlan.push({ m, action: 'keep-dest' });
    }
}
if (mergeAmbiguous.length) {
    console.error(`${mergeAmbiguous.length} merge destination(s) have REAL saved work on BOTH sides of the merge — ` +
                   `cannot safely auto-resolve which one wins. Aborting before any write. Investigate manually:`);
    for (const c of mergeAmbiguous) {
        console.error(`  book=${c.m.bookId}: source ${c.m.oldChapter}:${c.m.oldVerse} (status=${c.m.translation.status}) ` +
                       `vs destination ${c.m.newChapter}:${c.m.newVerse} (status=${c.dest.status}) — both non-'none'.`);
    }
    process.exit(1);
}
if (mergePlan.length) {
    console.log(`\n${mergePlan.length} merge move(s) resolved:`);
    for (const p of mergePlan) {
        const m = p.m;
        console.log(`  book=${m.bookId} ${m.oldChapter}:${m.oldVerse} -> ${m.newChapter}:${m.newVerse}: ${p.action} ` +
                     `(source status=${m.translation.status})`);
    }
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
// only ever fail on a genuine, already-ruled-out collision. Merge moves with
// action 'overwrite-dest' need one extra explicit delete of the destination
// row first, since that destination is a different verse that never moves
// through the normal source-deletion path. Ordinary moves whose destination
// held only an untouched baseline placeholder (placeholderOverwrites, see
// the collision-check above) need that exact same extra delete — their
// destination isn't reached by the source-deletion loop either, since it's
// never anyone's old key in this batch.
const run = tdb.transaction((items, mergePlanItems, placeholderItems) => {
    for (const m of items) {
        if (m.translation && !m.merge) deleteTranslation.run(m.bookId, m.oldChapter, m.oldVerse);
    }
    for (const p of mergePlanItems) {
        if (p.action === 'overwrite-dest') deleteTranslation.run(p.m.bookId, p.m.newChapter, p.m.newVerse);
        deleteTranslation.run(p.m.bookId, p.m.oldChapter, p.m.oldVerse); // source is always vacated, regardless of action
    }
    for (const p of placeholderItems) {
        deleteTranslation.run(p.bookId, p.newChapter, p.newVerse);
    }
    for (const m of items) {
        if (m.translation && !m.merge) {
            insertTranslation.run(
                m.bookId, m.newChapter, m.newVerse,
                m.translation.status, m.translation.text, m.translation.rich_text,
                m.translation.source_origin, m.translation.original_text, m.translation.updated_at
            );
        }
        for (const l of m.links)   updateLinks.run(m.newChapter, m.newVerse, l.id);
        for (const h of m.history) updateHistory.run(m.newChapter, m.newVerse, h.id);
    }
    for (const p of mergePlanItems) {
        if (p.action === 'insert' || p.action === 'overwrite-dest') {
            insertTranslation.run(
                p.m.bookId, p.m.newChapter, p.m.newVerse,
                p.m.translation.status, p.m.translation.text, p.m.translation.rich_text,
                p.m.translation.source_origin, p.m.translation.original_text, p.m.translation.updated_at
            );
        }
        // action 'keep-dest': source already deleted above, destination's own row is untouched.
    }
});
run(withData, mergePlan, placeholderOverwrites);

console.log(`\n✓ Migrated ${withData.length} verse's saved data to its new English-authoritative chapter:verse key.`);
try {
    fs.writeFileSync(MARKER_PATH, JSON.stringify({
        vdHash, appliedAt: new Date().toISOString(), migratedCount: withData.length,
    }, null, 2) + '\n');
} catch { /* marker write is a safety net, never fatal */ }
tdb.close();
