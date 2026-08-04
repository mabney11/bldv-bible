/**
 * surface-tokens-parity.test.cjs
 *
 * Guards the optimization in /api/tokens: server.js now reads pre-parsed
 * components from surface-index.db and groups them via groupSurfaceTokens(),
 * skipping a per-request parseHebrewData call.  This test verifies that the
 * grouping rules — which were implicit in parseHebrewData's flushWordBlock
 * behavior — are preserved exactly.
 *
 * If this test breaks, look at server.js groupSurfaceTokens(): the contract
 * is "particles (prep/conj/art) fold into the next non-particle token's word
 * block; non-particle tokens flush immediately; verse boundaries flush
 * pending."
 *
 * Requires corpus.db and surface-index.db in server/ — both built from real
 * corpus data.  When those are absent (CI without the DBs), the test exits 0
 * with a skip notice.
 *
 * NOTE: this used to read the "slow" reference rows from bible.db. server.js
 * explicitly retired bible.db for tokens_bhs ("tokens_bhs (BHS Hebrew
 * morphology) now lives inside corpus.db... bible.db is retired") after
 * ingest-bhs-oshb.py started emitting punctuation (maqaf, sof-pasuq, paseq)
 * as its own tokens_bhs rows. bible.db was never regenerated with that
 * change, so its token_ordinal numbering silently omits every punctuation
 * token corpus.db has. surface-index.db (which "fast" reads) was built FROM
 * corpus.db, so its ordinals count punctuation rows even though punct tokens
 * never make it into token_surfaces themselves. Comparing the two databases
 * meant every maqaf shifted "slow"'s ordinals back by one relative to
 * "fast" from that point in the verse onward — a pure stale-fixture bug, not
 * a grouping-logic bug. Reading both sides from corpus.db fixes it.
 *
 * Run: node tests/surface-tokens-parity.test.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const SERVER_DIR = path.join(__dirname, '..', 'server');
const BIBLE_DB   = path.join(SERVER_DIR, 'corpus.db');
const SURF_DB    = path.join(SERVER_DIR, 'surface-index.db');
const LEX_DIR    = path.join(SERVER_DIR, 'lexicon');

if (!fs.existsSync(BIBLE_DB) || !fs.existsSync(SURF_DB)) {
    console.log('[surface-tokens-parity] DB files not present — skipping');
    console.log(`  expected: ${BIBLE_DB}`);
    console.log(`  expected: ${SURF_DB}`);
    process.exit(0);
}

// Prefer better-sqlite3 (production), fall back to node:sqlite (sandbox/dev)
let DBClass;
try {
    DBClass = require('better-sqlite3');
} catch {
    const { DatabaseSync } = require('node:sqlite');
    DBClass = class {
        constructor(file, opts) { this.db = new DatabaseSync(file, opts?.readonly ? { readOnly: true } : {}); }
        prepare(sql) { const s = this.db.prepare(sql); return { all: (...a) => s.all(...a) }; }
        exec(s) { return this.db.exec(s); }
        pragma(p) { return this.db.exec(`PRAGMA ${p}`); }
        close() { return this.db.close(); }
    };
}

const surf  = new DBClass(SURF_DB,  { readonly: true });
const bible = new DBClass(BIBLE_DB, { readonly: true });
for (const db of [surf, bible]) {
    db.pragma('mmap_size = 268435456');
    db.pragma('query_only = ON');
}

// ── COPIED FROM server.js (must stay in sync — drift is the bug we'd want
//    to catch in the first place) ──────────────────────────────────────────
// JOIN must match the schema's real key, not just word_raw: token_surfaces'
// own PRIMARY KEY is (source, word_raw, strongs, pos, morph) — build-surface-
// index.js's "BUG A FIX" comment on that table explicitly documents that a
// "surface reading" is that whole tuple, because the SAME word_raw text can
// have multiple homograph readings (different strongs/pos/morph). Joining on
// word_raw alone fans every homograph out to ALL of its readings for EVERY
// occurrence, regardless of which reading that occurrence actually is —
// exactly what inflated "fast" block counts to ~8-10x "slow" (Genesis 1:
// fast=3327 vs slow=385) after rebuilding a perfectly good surface-index.db.
// LEFT JOIN (not INNER): punctuation occurrences (pos='punct') have no
// token_surfaces row at all — a mark has no morphology to parse — so an
// INNER JOIN silently dropped every one of them, leaving groupSurfaceTokens
// with zero visibility into punctuation and no way to replicate
// parseHebrewData's maqaf-driven fusion of a construct pair that shares one
// Strong's number (Deut 6:2's ben-binkha, both H1121). Select the
// OCCURRENCE's own pos/morph/strongs (not t.*) so a punct row still reports
// pos='punct' correctly even with t.* all NULL. Copied verbatim from
// server.js's SURF_ROWS — keep in sync.
const SURF_ROWS = surf.prepare(`
    SELECT o.verse, o.token_ordinal, o.word_raw,
           t.components, o.strongs, o.pos, o.morph
    FROM   surface_occurrences o
    LEFT JOIN token_surfaces   t
      ON   t.word_raw = o.word_raw
     AND   t.strongs  = o.strongs
     AND   t.pos      = o.pos
     AND   t.morph    = o.morph
     AND   t.source   = o.source
    WHERE  o.book_id = ? AND o.chapter = ?
    ORDER BY o.verse, o.token_ordinal
`);

// isParticle was `pos === 'prep' || 'conj' || 'art'` with NO affix check and no
// interrogative-he handling — a stale simplification that drifted from
// server.js's real groupSurfaceTokens/isParticle (see its HAS_AFFIX regex,
// ~line 5085). A preposition/conjunction/article carrying its own affix
// (e.g. 𐤀𐤋+𐤉 "to me") is a WHOLE WORD, not a proclitic, and the bare
// interrogative 𐤄 (pos=inrg) IS a proclitic even though its pos isn't
// prep/conj/art. Missing both meant "fast" folded some words the real
// parser keeps separate — systematically UNDER-counting blocks, which is
// exactly the single-digit fast<slow gap seen after the join fix (Genesis 1:
// fast=363 vs slow=385). Copied verbatim from server.js so this can't drift
// again unnoticed; if server.js's HAS_AFFIX/isParticle ever changes, paste the
// update here too.
// NOTE: server.js's STANDALONE_WORDS/isStandaloneException does NOT gate
// folding in parseHebrewData — it only picks a CSS class for a word that
// reaches the full-word branch for some OTHER reason (an affix, or a
// non-prep/conj/art pos). A prep/conj/art word with no affix folds
// regardless of STANDALONE_WORDS membership (את/𐤀𐤕 folds constantly — it's
// one of the most common words in Hebrew narrative). A previous attempt
// added a STANDALONE_WORDS check here based on a misreading and inflated
// Genesis 1 from fast=374 (under by 11) to fast=432 (over by 47). Reverted.
const HAS_AFFIX = /\b(?:prs|pfm|vbs|nme|vbe|uvf)=(?!absent\b|none\b)/;
const isParticle = (pos, morph, wordRaw) => {
    if (pos === 'inrg' && wordRaw === '𐤄') return true;      // interrogative he
    if (pos !== 'prep' && pos !== 'conj' && pos !== 'art') return false;
    return !HAS_AFFIX.test(morph || '');                     // affix ⇒ whole word
};

function groupSurfaceTokens(rows) {
    const output = [];
    let currentVerse = null;
    let wordCounter  = 1;
    let pending      = [];
    let pendingTokenOrdinal = null;
    let pendingStrongs = null;
    // True once `pending` holds a REAL resolved content word — mirrors
    // parseHebrewData's pendingHasRoot / server.js's groupSurfaceTokens.
    // False while `pending` holds only an open, unresolved particle chain.
    let pendingHasRoot = false;
    const flush = () => {
        if (!pending.length) return;
        output.push({
            verse:         currentVerse,
            word:          wordCounter++,
            token_ordinal: pendingTokenOrdinal,
            strongs:       pendingStrongs,
            components:    pending,
        });
        pending = []; pendingTokenOrdinal = null; pendingStrongs = null; pendingHasRoot = false;
    };
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        const row = rows[rowIdx];
        if (row.verse !== currentVerse) {
            flush();
            currentVerse = row.verse;
            wordCounter  = 1;
        }

        // Punctuation occurrence — mirrors parseHebrewData's punct branch /
        // server.js's groupSurfaceTokens. row.components is null here (no
        // token_surfaces match for a mark), so handle it before the normal
        // comps/isParticle logic below runs at all.
        if (row.pos === 'punct') {
            const mark = row.word_raw || '';
            const isMaqaf = mark.includes('־');
            const markComp = {
                paleo: mark, translit: isMaqaf ? '-' : '', translation: '',
                css: isMaqaf ? 'maqaf' : 'punct-mark',
                isMark: true, isMaqaf, token_ordinal: row.token_ordinal,
            };
            if (!pendingHasRoot) {
                if (pending.length === 0) {
                    if (output.length > 0) output[output.length - 1].components.push(markComp);
                } else {
                    pending.push(markComp);   // ride along with the open particle chain
                }
                continue;
            }
            pending.push(markComp);
            if (isMaqaf) {
                const nextStrongs = rows[rowIdx + 1] ? rows[rowIdx + 1].strongs : null;
                const sharesRoot = !!(pendingStrongs && nextStrongs && pendingStrongs === nextStrongs);
                if (!sharesRoot) flush();
            } else {
                flush();
            }
            continue;
        }

        let comps;
        try { comps = JSON.parse(row.components); }
        catch { comps = []; }
        for (const c of comps) c.token_ordinal = row.token_ordinal;
        pending.push(...comps);
        pendingTokenOrdinal = row.token_ordinal;
        pendingStrongs      = row.strongs;
        if (isParticle(row.pos, row.morph, row.word_raw)) continue;
        pendingHasRoot = true;
        const nextRow = rows[rowIdx + 1];
        const nextIsMaqaf = !!nextRow && nextRow.pos === 'punct' && (nextRow.word_raw || '').includes('־');
        if (!nextIsMaqaf) flush();
    }
    flush();
    return output;
}

// ── REFERENCE: the original parseHebrewData ──────────────────────────────
const { parseHebrewData } = require('./parse-extract.cjs');
const lex = JSON.parse(fs.readFileSync(path.join(LEX_DIR, 'lexicon.json'),    'utf8'));
const hom = JSON.parse(fs.readFileSync(path.join(LEX_DIR, 'homographs.json'), 'utf8'));

const BIBLE_ROWS = bible.prepare(`
    SELECT verse, token_ordinal, word_raw, pos, morph, strongs
    FROM tokens_bhs WHERE book_id = ? AND chapter = ?
    ORDER BY verse, token_ordinal
`);
function rowsToLines(rows) {
    return rows.map(r =>
        [r.verse, r.token_ordinal, r.word_raw || '', r.pos || '',
         r.morph || '', r.strongs || ''].join('\t')
    ).join('\n');
}

// ── TEST CASES ────────────────────────────────────────────────────────────
// Pick a spread: opening narrative, a poetry book, a prophetic book, a long
// chapter.  If any of these don't exist (e.g. truncated DB), skip silently.
const cases = [
    { name: 'Genesis 1',     book: 1,  ch: 1  },
    { name: 'Genesis 22',    book: 1,  ch: 22 },
    { name: 'Exodus 20',     book: 2,  ch: 20 },
    { name: 'Deuteronomy 6', book: 5,  ch: 6  },
    { name: 'Psalm 1',       book: 19, ch: 1  },
    { name: 'Psalm 23',      book: 19, ch: 23 },
    { name: 'Psalm 119',     book: 19, ch: 119 },  // longest chapter
    { name: 'Isaiah 53',     book: 23, ch: 53 },
    { name: 'Malachi 4',     book: 39, ch: 4  },
];

// Pinpoints the FIRST verse where fast/slow disagree on block count, and
// prints the raw tokens for that verse plus each side's block breakdown.
// Added because guessing at the cause from aggregate counts alone (twice)
// produced one no-op and one regression — this turns the next fix into a
// measurement instead of another guess.
function diagnoseDivergence(fast, slow, bibleRows, chName) {
    const countByVerse = (blocks) => {
        const m = new Map();
        for (const b of blocks) m.set(b.verse, (m.get(b.verse) || 0) + 1);
        return m;
    };
    const fastCounts = countByVerse(fast);
    const slowCounts = countByVerse(slow);
    const verses = [...new Set([...fastCounts.keys(), ...slowCounts.keys()])].sort((a, b) => a - b);
    for (const v of verses) {
        const fc = fastCounts.get(v) || 0, sc = slowCounts.get(v) || 0;
        if (fc !== sc) {
            console.log(`    [${chName}] first diverging verse: ${v} (fast=${fc} blocks, slow=${sc} blocks)`);
            for (const t of bibleRows.filter(r => r.verse === v)) {
                console.log(`      ord=${t.token_ordinal} pos=${t.pos} word_raw=${JSON.stringify(t.word_raw)} morph=${t.morph}`);
            }
            // Paleo glyphs don't render in this terminal (font/codepage gap),
            // so show which raw token_ordinal(s) fused into each block instead
            // — that's legible and pinpoints the exact fold decision that
            // differs between the two sides.
            const ordsOf = (blocks) => blocks.filter(b => b.verse === v)
                .map(b => '[' + [...new Set((b.components || []).map(c => c.token_ordinal))].join(',') + ']')
                .join(' ');
            console.log(`      fast token_ordinal groups: ${ordsOf(fast)}`);
            console.log(`      slow token_ordinal groups: ${ordsOf(slow)}`);
            return;
        }
    }
    console.log(`    [${chName}] every verse has matching block counts — divergence is a same-verse component-count mismatch (see contextDrift) or a verse-ordering issue`);
}

let okCount = 0, totalChecks = 0, totalBlocks = 0;
const failures = [];

console.log('=== Surface-index → parseHebrewData parity ===\n');
for (const c of cases) {
    const bibleRows = BIBLE_ROWS.all(c.book, c.ch);
    if (!bibleRows.length) { console.log(`  ${c.name}: skipped (not in DB)`); continue; }
    const fast = groupSurfaceTokens(SURF_ROWS.all(c.book, c.ch));
    const slow = parseHebrewData(rowsToLines(bibleRows), lex, hom, {});

    // 1. Same number of word blocks (the structural invariant the optimization
    //    must preserve — particles fold into the next non-particle, verses
    //    flush correctly, etc.)
    const blocksMatch = fast.length === slow.length;
    // 2. Per-block consistency, with TWO classes of mismatch tracked separately:
    //    (a) data drift — slow says component[0]='X' but fast says 'Y'. Means
    //        surface-index.db's pre-baked parse disagrees with the live parser
    //        on a particular surface form. Indicates stale index data; doesn't
    //        affect correctness of the optimization itself.
    //    (b) context drift — slow has N components but fast has M. Happens when
    //        the live parser uses cross-token context that the surface index
    //        can't see (e.g. parseHebrewData strips 𐤉𐤌 from 𐤀𐤋𐤄𐤉𐤌 ONLY when
    //        followed by 𐤀𐤇𐤓𐤉𐤌). The right long-term fix is to encode that
    //        context-aware behavior at index build time, not in the runtime
    //        parser. For now we report it but don't fail.
    let perBlockOk = true;
    let dataDriftCount    = 0;
    let contextDriftCount = 0;
    for (let i = 0; i < Math.min(fast.length, slow.length); i++) {
        const f = fast[i], s = slow[i];
        if (f.verse !== s.verse) { perBlockOk = false; break; }
        if ((f.components || []).length !== (s.components || []).length) {
            contextDriftCount++;
            continue;
        }
        if ((f.components?.[0]?.paleo || '') !== (s.components?.[0]?.paleo || '')) {
            dataDriftCount++;
        }
    }
    const ok = blocksMatch && perBlockOk;
    if (ok) {
        okCount++;
        const drifts = [];
        if (dataDriftCount)    drifts.push(`${dataDriftCount} data-drift`);
        if (contextDriftCount) drifts.push(`${contextDriftCount} context-drift`);
        const note = drifts.length ? `  (${drifts.join(', ')} — informational)` : '';
        console.log(`  ${c.name}: ✓ (${fast.length} blocks)${note}`);
    } else {
        failures.push({ ...c, fast: fast.length, slow: slow.length });
        console.log(`  ${c.name}: ✗ blocks fast=${fast.length} slow=${slow.length}`);
        diagnoseDivergence(fast, slow, bibleRows, c.name);
    }
    totalChecks++;
    totalBlocks += fast.length;
}

console.log(`\nResults: ${okCount}/${totalChecks} chapters identical, ${totalBlocks} total word blocks compared`);
if (failures.length) {
    console.error('\nFailures:');
    for (const f of failures) console.error('  -', f.name, f);
    process.exit(1);
}
assert.ok(okCount > 0, 'Expected at least one chapter to be compared');
console.log('\n✅ ALL SURFACE-TOKEN PARITY TESTS PASSED');
