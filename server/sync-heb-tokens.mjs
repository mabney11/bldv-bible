#!/usr/bin/env node
/**
 * sync-heb-tokens.mjs — ONE PRODUCER FOR HEB TOKENS.
 *
 * THE PROBLEM THIS ENDS
 * Two independent taggers have been reading the same Hebrew text and writing
 * different answers:
 *     A) heb-align.js, inside `build-surface-index.js --heb`
 *          -> surface-index.db, source='HEB'      (what the reader renders)
 *     B) build-heb-index.mjs
 *          -> corpus.db, tokens_nt                (what the guards check against)
 * They disagree on ~1 in 5 OT tokens and ~2 in 3 NT tokens. Every "wrong
 * Strong's number" chased so far has been one of them disagreeing with the
 * other, not a tagger being wrong in isolation.
 *
 * THE FIX IS NOT A BETTER TAGGER. It is having one. This script stops
 * tokens_nt being a second OPINION and makes it a PROJECTION of the index:
 * same rows, different shape, derived not inferred. After this runs they cannot
 * disagree, because there is only one thing to disagree with.
 *
 * WHOLE CORPUS, ONE PASS. No --ot flag, no OT/NT branch. Which books each
 * edition covers is read from the index; it is data, not code.
 *
 * ── READ THIS BEFORE --apply ────────────────────────────────────────────────
 * translation_links.token_ordinals stores per-verse ordinals, and HEB links
 * (lang='HEB') point at tokens_nt's ordinals. The two taggers TOKENIZE
 * differently — 88.5% of Matthew's verses are cut differently — so reprojecting
 * moves the ordinals under those links. This script therefore:
 *   1. reports link exposure BEFORE writing anything (--check does only this),
 *   2. remaps each link by matching word_raw old->new within its own verse,
 *   3. reports every link it could NOT remap unambiguously, and leaves it
 *      untouched rather than guessing.
 * The old table is RENAMED, never dropped.
 *
 * USAGE (winpty eats `> file`, so it writes its own output)
 *   node sync-heb-tokens.mjs --check --out sync-check.txt
 *   node sync-heb-tokens.mjs --apply --out sync-apply.txt
 *
 * FLAGS
 *   --check          survey only, change nothing (DEFAULT)
 *   --apply          rebuild tokens_nt + remap links, inside one transaction
 *   --db FILE        corpus.db          --index FILE  surface-index.db
 *   --tdb FILE       translation.db     --out FILE    write the report here
 *   --samples N      how many examples to print per section (default 12)
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const has  = f => args.includes(f);
const val  = (f, d = null) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };

const APPLY   = has('--apply');
const SAMPLES = parseInt(val('--samples', '12'), 10);
const CORPUS  = val('--db',    path.join(__dirname, 'corpus.db'));
const INDEX   = val('--index', path.join(__dirname, 'surface-index.db'));
const TDB     = val('--tdb',   path.join(__dirname, 'translation.db'));
const OUT     = val('--out', null);

const lines = [];
const say = m => { lines.push(m); if (!OUT) console.log(m); };
const finish = code => {
    if (OUT) { fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8'); console.log(`wrote ${OUT} (${lines.length} lines)`); }
    process.exit(code || 0);
};

for (const [p, n] of [[CORPUS, 'corpus.db'], [INDEX, 'surface-index.db']]) {
    if (!fs.existsSync(p)) { console.error(`✗ no ${n} at ${p}`); process.exit(1); }
}

const cdb = new Database(CORPUS, { readonly: !APPLY });
const sdb = new Database(INDEX,  { readonly: true });
const tdb = fs.existsSync(TDB) ? new Database(TDB, { readonly: !APPLY }) : null;

say(`sync-heb-tokens — ${APPLY ? 'APPLY' : 'CHECK (nothing will be written)'}`);
say(`corpus: ${CORPUS}`);
say(`index:  ${INDEX}`);
say('');

// ── 0. The index must be source-partitioned, or there is no HEB half to read ──
const idxHas = col => {
    try { sdb.prepare(`SELECT ${col} FROM surface_occurrences LIMIT 1`).get(); return true; } catch { return false; }
};
if (!idxHas('source')) {
    say('✗ surface-index.db has no `source` column — it was built without --heb, so it');
    say('  holds no HEB edition to project from. Run:  node build-surface-index.js --heb');
    finish(1);
}
const HAS_SN    = idxHas('strongs');
const HAS_MORPH = idxHas('pos') && idxHas('morph');
const OCC_SN_JOIN = HAS_SN
    ? (HAS_MORPH ? 'AND t.strongs = o.strongs AND t.pos = o.pos AND t.morph = o.morph'
                 : 'AND t.strongs = o.strongs')
    : '';

// Coverage, read from the data. This is the whole OT/NT distinction now.
const coverage = new Map();
for (const r of sdb.prepare(`SELECT source, COUNT(*) n, COUNT(DISTINCT book_id) books
                             FROM surface_occurrences GROUP BY source`).all()) {
    coverage.set(r.source, r);
    say(`  index ${r.source}: ${r.n.toLocaleString()} occurrences / ${r.books} books`);
}
if (!coverage.has('HEB')) { say('\n✗ no HEB rows in the index. Nothing to project.'); finish(1); }

// ── 1. What tokens_nt looks like now ────────────────────────────────────────
const tableExists = n => !!cdb.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(n);
const ntExists = tableExists('tokens_nt');
const ntCols = ntExists ? cdb.prepare(`PRAGMA table_info(tokens_nt)`).all().map(c => c.name) : [];
const ntCount = ntExists ? cdb.prepare(`SELECT COUNT(*) n FROM tokens_nt`).get().n : 0;

say('');
say(`  tokens_nt: ${ntExists ? `${ntCount.toLocaleString()} rows` : 'ABSENT'}`);
if (ntExists) say(`  columns:   ${ntCols.join(', ')}`);

// The server only ever SELECTs these from tokens_nt (TOKEN_QUERY_NT, TX_VERSE_NT).
// Anything else in the table is unread and need not be reproduced.
const REQUIRED = ['book_id', 'chapter', 'verse', 'token_ordinal', 'word_raw', 'pos', 'morph', 'strongs'];
const missing = ntExists ? REQUIRED.filter(c => !ntCols.includes(c)) : [];
if (missing.length) {
    say(`\n✗ tokens_nt is missing columns the server reads: ${missing.join(', ')}`);
    say('  Refusing to touch a table shaped differently than expected.');
    finish(1);
}

// ── 2. The projection ───────────────────────────────────────────────────────
const projectStmt = sdb.prepare(`
    SELECT o.book_id, o.chapter, o.verse, o.token_ordinal, o.word_raw,
           t.strongs, t.pos, t.morph
    FROM   surface_occurrences o
    JOIN   token_surfaces      t ON t.word_raw = o.word_raw ${OCC_SN_JOIN} AND t.source = o.source
    WHERE  o.source = 'HEB'
    ORDER BY o.book_id, o.chapter, o.verse, o.token_ordinal
`);

// ── 3. Compare, so the change is visible before it is made ──────────────────
say('');
say('── WHAT CHANGES ─────────────────────────────────────────────────────────');

const key = r => `${r.book_id}\u0000${r.chapter}\u0000${r.verse}`;
const normH = s => (s ? 'H' + String(s).replace(/^H+/, '') : '');

// Old side, grouped by verse.
const oldByVerse = new Map();
if (ntExists) {
    for (const r of cdb.prepare(`SELECT book_id, chapter, verse, token_ordinal, word_raw, strongs FROM tokens_nt`).iterate()) {
        const k = key(r);
        if (!oldByVerse.has(k)) oldByVerse.set(k, []);
        oldByVerse.get(k).push(r);
    }
}
// New side, grouped the same way.
const newByVerse = new Map();
let newTotal = 0;
for (const r of projectStmt.iterate()) {
    newTotal++;
    const k = key(r);
    if (!newByVerse.has(k)) newByVerse.set(k, []);
    newByVerse.get(k).push(r);
}

let vBoth = 0, vOnlyOld = 0, vOnlyNew = 0, vSameCut = 0, snAgree = 0, snDisagree = 0;
const snSamples = [];
for (const [k, nrows] of newByVerse) {
    const orows = oldByVerse.get(k);
    if (!orows) { vOnlyNew++; continue; }
    vBoth++;
    const sameCut = orows.length === nrows.length &&
                    orows.every((o, i) => o.word_raw === nrows[i].word_raw);
    if (sameCut) {
        vSameCut++;
        for (let i = 0; i < orows.length; i++) {
            const a = normH(orows[i].strongs), b = normH(nrows[i].strongs);
            if (!a || !b) continue;
            if (a === b) snAgree++;
            else {
                snDisagree++;
                if (snSamples.length < SAMPLES) {
                    const [bk, ch, vs] = k.split('\u0000');
                    snSamples.push(`    ${bk}:${ch}:${vs}.${nrows[i].token_ordinal} ${nrows[i].word_raw}  tokens_nt=${a}  index=${b}`);
                }
            }
        }
    }
}
for (const k of oldByVerse.keys()) if (!newByVerse.has(k)) vOnlyOld++;

const pct = (n, d) => d ? `${(n / d * 100).toFixed(1)}%` : '—';
say(`  rows:   tokens_nt ${ntCount.toLocaleString()}  ->  projection ${newTotal.toLocaleString()}`);
say(`  verses: in both ${vBoth.toLocaleString()}, only in tokens_nt ${vOnlyOld.toLocaleString()}, only in the index ${vOnlyNew.toLocaleString()}`);
say(`  of the shared verses, ${vSameCut.toLocaleString()} (${pct(vSameCut, vBoth)}) tokenize identically`);
say(`  where they do, Strong's agree on ${snAgree.toLocaleString()} and DISAGREE on ${snDisagree.toLocaleString()} (${pct(snDisagree, snAgree + snDisagree)})`);
if (snSamples.length) {
    say('');
    say('  Disagreements (the index value is the one the reader already shows):');
    for (const s of snSamples) say(s);
}
if (vOnlyOld) {
    say('');
    say(`  ⚠ ${vOnlyOld.toLocaleString()} verses exist in tokens_nt but NOT in the index. Projecting`);
    say('    would DROP them. That means the bake has not covered those books — rerun');
    say('    `node build-surface-index.js --heb` first, or those verses lose their tokens.');
}

// ── 4. Link exposure ────────────────────────────────────────────────────────
say('');
say('── TRANSLATION LINKS ────────────────────────────────────────────────────');

let hebLinks = [];
if (!tdb) {
    say('  translation.db not found — skipping (pass --tdb).');
} else if (!tdb.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='translation_links'`).get()) {
    say('  no translation_links table — nothing to remap.');
} else {
    hebLinks = tdb.prepare(`
        SELECT id, book_id, chapter, verse, token_ordinals, english_phrase
        FROM translation_links WHERE UPPER(lang) = 'HEB'
    `).all();
    const total = tdb.prepare(`SELECT COUNT(*) n FROM translation_links`).get().n;
    say(`  ${total.toLocaleString()} links total, ${hebLinks.length.toLocaleString()} bound to HEB.`);
    if (!hebLinks.length) {
        say('  None point at tokens_nt ordinals, so reprojecting cannot break any of them.');
    }
}

// Remap plan: for each HEB link, match old ordinals to new ones by word_raw
// WITHIN THE SAME VERSE. Unique match = safe. Anything else is reported, never
// guessed — a silently mis-pointed link is worse than one left alone.
const remap = [];      // {id, from, to}
const unmapped = [];   // {id, reason, ...}
for (const L of hebLinks) {
    let ords;
    try { ords = JSON.parse(L.token_ordinals) || []; } catch { ords = []; }
    if (!ords.length) continue;
    const k = key(L);
    const orows = oldByVerse.get(k) || [];
    const nrows = newByVerse.get(k) || [];
    if (!nrows.length) { unmapped.push({ id: L.id, reason: 'verse absent from the index', ref: k.split('\u0000').join(':') }); continue; }

    const out = [];
    let ok = true;
    for (const o of ords) {
        const oldRow = orows.find(r => r.token_ordinal === o);
        if (!oldRow) { ok = false; unmapped.push({ id: L.id, reason: `ordinal ${o} not in tokens_nt`, ref: k.split('\u0000').join(':') }); break; }
        const hits = nrows.filter(r => r.word_raw === oldRow.word_raw);
        if (hits.length === 1) out.push(hits[0].token_ordinal);
        else { ok = false; unmapped.push({ id: L.id, reason: hits.length ? `"${oldRow.word_raw}" occurs ${hits.length}x in the new cut — ambiguous` : `"${oldRow.word_raw}" not in the new cut`, ref: k.split('\u0000').join(':') }); break; }
    }
    if (!ok) continue;
    const changed = out.length !== ords.length || out.some((v, i) => v !== ords[i]);
    if (changed) remap.push({ id: L.id, from: ords, to: out });
}

if (hebLinks.length) {
    const unchanged = hebLinks.length - remap.length - new Set(unmapped.map(u => u.id)).size;
    say(`  already correct: ${unchanged}   remappable: ${remap.length}   NEEDS ATTENTION: ${new Set(unmapped.map(u => u.id)).size}`);
    for (const u of unmapped.slice(0, SAMPLES)) say(`    link ${u.id} @ ${u.ref}: ${u.reason}`);
    if (unmapped.length > SAMPLES) say(`    …and ${unmapped.length - SAMPLES} more`);
    if (unmapped.length) say('  Those are left EXACTLY as they are — relink them by hand in the Studio.');
}

// ── 5. Apply ────────────────────────────────────────────────────────────────
if (!APPLY) {
    say('');
    say('── NOTHING WAS WRITTEN ──────────────────────────────────────────────────');
    say('  Re-run with --apply to rebuild tokens_nt as a projection of the index.');
    say('  The current table will be RENAMED, not dropped.');
    finish(0);
}

if (vOnlyOld) {
    say('');
    say('✗ REFUSING TO APPLY: the index does not cover every verse tokens_nt has, so');
    say('  applying would lose data. Rebuild the index first:');
    say('      node build-surface-index.js --heb');
    finish(1);
}

// ALREADY IN SYNC? Then there is nothing to do, and saying so is better than
// rewriting 400k rows and renaming a table for no reason.
if (vBoth && vSameCut === vBoth && snDisagree === 0 && ntCount === newTotal) {
    say('');
    say('── ALREADY IN SYNC ──────────────────────────────────────────────────────');
    say(`  tokens_nt is already a projection of the index: ${vBoth.toLocaleString()} verses`);
    say('  tokenize identically and no Strong\'s disagree. Nothing to apply.');
    say('  (Re-running is safe; this is the check passing, not an error.)');
    finish(0);
}

// The backup name must be UNIQUE. Dating it to the day meant a second --apply on
// the same day died with "there is already another table or index with this
// name" — after the projection had already been rebuilt, so the run wasted its
// work and reported a failure that looked like data loss. Find the next free
// suffix instead.
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const tableTaken = n => !!cdb.prepare(
    `SELECT 1 FROM sqlite_master WHERE name = ?`).get(n);
let backup = `tokens_nt_pre_sync_${stamp}`;
for (let i = 2; tableTaken(backup); i++) backup = `tokens_nt_pre_sync_${stamp}_${i}`;

say('');
say('── APPLYING ─────────────────────────────────────────────────────────────');
try {
    // The staging table must EXIST before its INSERT can be prepared — SQLite
    // validates the statement against the schema at prepare time. DROP IF EXISTS
    // makes a failed earlier run self-cleaning.
    cdb.exec(`DROP TABLE IF EXISTS tokens_nt_new`);
    cdb.exec(`
        CREATE TABLE tokens_nt_new (
            book_id       INTEGER NOT NULL,
            chapter       INTEGER NOT NULL,
            verse         INTEGER NOT NULL,
            token_ordinal INTEGER NOT NULL,
            word_raw      TEXT    NOT NULL,
            pos           TEXT    NOT NULL DEFAULT '',
            morph         TEXT    NOT NULL DEFAULT '',
            strongs       TEXT    NOT NULL DEFAULT '',
            -- Provenance, so nobody has to wonder again where these came from.
            source_id     TEXT    NOT NULL DEFAULT 'PROJECTED-FROM-SURFACE-INDEX'
        )`);

    const cols = REQUIRED.join(', ');
    const ins = cdb.prepare(`INSERT INTO tokens_nt_new (${cols}) VALUES (@book_id, @chapter, @verse, @token_ordinal, @word_raw, @pos, @morph, @strongs)`);

    const run = cdb.transaction(() => {
        let n = 0;
        for (const r of projectStmt.iterate()) {
            ins.run({
                book_id: r.book_id, chapter: r.chapter, verse: r.verse,
                token_ordinal: r.token_ordinal, word_raw: r.word_raw,
                pos: r.pos || '', morph: r.morph || '', strongs: r.strongs || '',
            });
            n++;
        }
        if (ntExists) cdb.exec(`ALTER TABLE tokens_nt RENAME TO ${backup}`);
        cdb.exec(`ALTER TABLE tokens_nt_new RENAME TO tokens_nt`);
        cdb.exec(`CREATE INDEX IF NOT EXISTS idx_tokens_nt_bcv ON tokens_nt(book_id, chapter, verse, token_ordinal)`);
        cdb.exec(`CREATE INDEX IF NOT EXISTS idx_tokens_nt_sn  ON tokens_nt(strongs)`);
        return n;
    });
    const written = run();
    say(`  tokens_nt rebuilt: ${written.toLocaleString()} rows projected from the index.`);
    if (ntExists) say(`  previous table kept as ${backup} — delete it yourself once satisfied.`);

    if (remap.length && tdb) {
        const upd = tdb.prepare(`UPDATE translation_links SET token_ordinals = ? WHERE id = ?`);
        tdb.transaction(() => { for (const r of remap) upd.run(JSON.stringify(r.to), r.id); })();
        say(`  ${remap.length} translation link(s) remapped to the new ordinals.`);
    }
    if (unmapped.length) say(`  ${new Set(unmapped.map(u => u.id)).size} link(s) left untouched — see the list above.`);
} catch (e) {
    say(`✗ FAILED, nothing committed: ${e.message}`);
    finish(1);
}

say('');
say('── NEXT ─────────────────────────────────────────────────────────────────');
say('  1. Restart the server. tokens_nt and the index now agree BY CONSTRUCTION,');
say('     so /api/tokens\' homograph guard can no longer fire on a phantom');
say('     disagreement and drop a chapter to the live parser.');
say('  2. build-heb-index.mjs is now a SECOND OPINION with nothing to add. Move it');
say('     to archive/ — if it is ever run again with --apply it re-introduces the');
say('     split this script just closed.');
say('  3. Re-run this with --check any time; it is the drift alarm.');
finish(0);
