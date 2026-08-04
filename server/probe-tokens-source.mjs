#!/usr/bin/env node
/**
 * probe-tokens-source.mjs — READ-ONLY.
 *
 * Answers one question: when the reader asks for a chapter, is /api/tokens'
 * fast path serving it the edition it asked for?
 *
 * It runs BOTH forms of the surface-index query — the source-blind one the
 * shipped server.js uses, and the source-filtered one — and reports the
 * difference, plus whether either integrity guard would have thrown the whole
 * chapter to the live parser.
 *
 * Usage (winpty eats `> file`, so this writes its own output):
 *   node probe-tokens-source.mjs --book 40 --chapter 1 --source HEB --out mat1.txt
 *   node probe-tokens-source.mjs --book 1 --chapter 1 --source BHS --out gen1.txt
 *
 * Flags: --book N --chapter N --source BHS|HEB --index surface-index.db
 *        --db corpus.db --out FILE --samples N
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const val  = (f, d = null) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };

const BOOK    = parseInt(val('--book', '40'), 10);
const CHAPTER = parseInt(val('--chapter', '1'), 10);
const SOURCE  = String(val('--source', 'HEB')).toUpperCase();
const SAMPLES = parseInt(val('--samples', '12'), 10);
const INDEX   = val('--index', path.join(__dirname, 'surface-index.db'));
const CORPUS  = val('--db',    path.join(__dirname, 'corpus.db'));
const OUT     = val('--out', null);

const lines = [];
const say = m => { lines.push(m); if (!OUT) console.log(m); };
const finish = () => {
    if (OUT) { fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8'); console.log(`wrote ${OUT} (${lines.length} lines)`); }
};

if (!fs.existsSync(INDEX)) { console.error(`✗ no surface-index.db at ${INDEX}`); process.exit(1); }
const sdb = new Database(INDEX, { readonly: true });
const cdb = fs.existsSync(CORPUS) ? new Database(CORPUS, { readonly: true }) : null;

// ── Schema capability ────────────────────────────────────────────────────────
const has = (table, col) => {
    try { sdb.prepare(`SELECT ${col} FROM ${table} LIMIT 1`).get(); return true; } catch { return false; }
};
const HAS_SOURCE = has('surface_occurrences', 'source');
const HAS_SN     = has('surface_occurrences', 'strongs');
const HAS_MORPH  = has('surface_occurrences', 'pos') && has('surface_occurrences', 'morph');

say(`probe-tokens-source — book ${BOOK} chapter ${CHAPTER}, asking for source=${SOURCE}`);
say(`index: ${INDEX}`);
say(`schema: source=${HAS_SOURCE ? 'YES' : 'no'}  per-occurrence strongs=${HAS_SN ? 'YES' : 'no'}  pos/morph=${HAS_MORPH ? 'YES' : 'no'}`);
if (!HAS_SOURCE) {
    say('');
    say('This index has no source column — it was built without --heb, so there is');
    say('nothing to mis-serve. Rebuild with: node build-surface-index.js --heb');
    finish();
    process.exit(0);
}

for (const r of sdb.prepare(`SELECT source, COUNT(*) n, COUNT(DISTINCT book_id) books
                             FROM surface_occurrences GROUP BY source`).all()) {
    say(`  ${r.source}: ${r.n.toLocaleString()} occurrences across ${r.books} books`);
}

const OCC_SN_JOIN = HAS_SN
    ? (HAS_MORPH ? 'AND t.strongs = o.strongs AND t.pos = o.pos AND t.morph = o.morph'
                 : 'AND t.strongs = o.strongs')
    : '';

const query = (srcJoin, srcWhere) => sdb.prepare(`
    SELECT o.source AS occ_source, t.source AS surf_source,
           o.verse, o.token_ordinal, o.word_raw, t.components, t.strongs
    FROM   surface_occurrences o
    JOIN   token_surfaces      t ON t.word_raw = o.word_raw ${OCC_SN_JOIN} ${srcJoin}
    WHERE  o.book_id = ? AND o.chapter = ? ${srcWhere}
    ORDER BY o.verse, o.token_ordinal
`);

const blind    = query('', '').all(BOOK, CHAPTER);
const filtered = query('AND t.source = o.source', 'AND o.source = ?').all(BOOK, CHAPTER, SOURCE);

say('');
say('── WHAT THE FAST PATH RETURNS ───────────────────────────────────────────');
say(`  source-blind (shipped server.js): ${blind.length.toLocaleString()} rows`);
say(`  source-filtered (patched):        ${filtered.length.toLocaleString()} rows`);

const crossed = blind.filter(r => r.occ_source !== r.surf_source);
const wrongEd = blind.filter(r => r.occ_source !== SOURCE);
say(`  rows whose surface row is from the OTHER edition: ${crossed.length.toLocaleString()}`);
say(`  rows belonging to an edition you did not ask for: ${wrongEd.length.toLocaleString()}`);

// How many distinct (verse, ordinal) slots got more than one row?
const slots = new Map();
for (const r of blind) {
    const k = `${r.verse}\u0000${r.token_ordinal}`;
    slots.set(k, (slots.get(k) || 0) + 1);
}
const dupes = [...slots.values()].filter(n => n > 1).length;
say(`  token slots served more than one row: ${dupes.toLocaleString()} of ${slots.size.toLocaleString()}`);

if (crossed.length) {
    say('');
    say(`  Examples of a cross-edition pairing (occurrence ↔ surface row):`);
    for (const r of crossed.slice(0, SAMPLES)) {
        let comps = [];
        try { comps = JSON.parse(r.components) || []; } catch {}
        const shape = comps.map(c => `${c.paleo || ''}[${c.css || ''}]`).join(' + ');
        say(`    v${r.verse}.${r.token_ordinal} ${r.word_raw}  occ=${r.occ_source} served by surf=${r.surf_source} ${r.strongs || ''}`);
        say(`        ${shape || '(no components)'}`);
    }
}

// ── Would the integrity guards have deferred to the live parser? ─────────────
say('');
say('── INTEGRITY GUARDS (each one sends the WHOLE chapter to the live parser) ');

if (!cdb) {
    say('  corpus.db not found — skipping the homograph check (pass --db).');
} else {
    let homSet = new Set();
    try {
        for (const r of cdb.prepare(`
            SELECT word_raw FROM (
                SELECT word_raw, COUNT(DISTINCT ('H' || REPLACE(strongs,'H',''))) AS n
                FROM tokens_bhs
                WHERE strongs IS NOT NULL AND strongs != ''
                  AND CAST(REPLACE(strongs,'H','') AS INTEGER) < 9000
                GROUP BY word_raw
            ) WHERE n > 1`).all()) homSet.add(r.word_raw);
    } catch (e) { say(`  (homograph set unavailable: ${e.message})`); }

    const hitRows = filtered.filter(r => r.word_raw && homSet.has(r.word_raw));
    say(`  homograph surfaces present in this chapter: ${hitRows.length}` +
        (hitRows.length ? `  e.g. ${[...new Set(hitRows.map(r => r.word_raw))].slice(0, 6).join(' ')}` : ''));

    if (hitRows.length) {
        // The shipped guard compares the baked SN against the token table for this
        // source. For HEB that table is tokens_nt — itself inferred.
        const table = SOURCE === 'HEB' ? 'tokens_nt' : 'tokens_bhs';
        let auth = new Map();
        try {
            for (const t of cdb.prepare(
                `SELECT verse, token_ordinal, strongs FROM ${table} WHERE book_id=? AND chapter=?`
            ).all(BOOK, CHAPTER)) {
                if (t.strongs) auth.set(`${t.verse}\u0000${t.token_ordinal}`, 'H' + String(t.strongs).replace(/^H+/, ''));
            }
        } catch (e) { say(`  (${table} unavailable: ${e.message})`); }

        const drift = hitRows.filter(r => {
            const a = auth.get(`${r.verse}\u0000${r.token_ordinal}`);
            const b = r.strongs ? 'H' + String(r.strongs).replace(/^H+/, '') : '';
            return a && b && a !== b;
        });
        say(`  baked SN vs ${table} SN — disagreements: ${drift.length}`);
        if (drift.length) {
            say(`  ⇒ the shipped guard FIRES: this chapter is live-parsed from ${table},`);
            say(`    which for HEB means untagged rows — no prefix decomposition, and the`);
            say(`    inferred SN goes straight onto the badge.`);
            for (const r of drift.slice(0, SAMPLES)) {
                say(`      v${r.verse}.${r.token_ordinal} ${r.word_raw}  baked=${r.strongs}  ${table}=${auth.get(`${r.verse}\u0000${r.token_ordinal}`)}`);
            }
        } else {
            say('  ⇒ guard does not fire on this chapter.');
        }
    }
}

// First-letter drift check (the other guard)
const badFirst = filtered.filter(r => {
    if (!r.word_raw || !r.components) return false;
    let comps; try { comps = JSON.parse(r.components); } catch { return true; }
    if (!Array.isArray(comps) || !comps.length) return false;
    const f = comps.find(c => c && c.paleo && c.paleo.length);
    if (!f) return false;
    return [...r.word_raw][0] !== [...f.paleo][0];
});
say(`  rows whose first component letter ≠ word_raw's first letter: ${badFirst.length}` +
    (badFirst.length ? `  e.g. ${badFirst.slice(0, 5).map(r => r.word_raw).join(' ')}` : ''));
if (badFirst.length) say('  ⇒ the "surface-index drift" guard FIRES: whole chapter live-parsed.');

say('');
say('── VERDICT ──────────────────────────────────────────────────────────────');
if (wrongEd.length || crossed.length || dupes) {
    say('  The source-blind query is serving this chapter wrong. The patched');
    say('  server.js (source filter + t.source = o.source on the join) fixes it.');
} else {
    say('  The fast-path query itself is clean for this chapter — if the render is');
    say('  still wrong, it is one of the guards above deferring to the live parser.');
}
finish();
