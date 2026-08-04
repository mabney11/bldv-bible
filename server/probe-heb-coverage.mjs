#!/usr/bin/env node
/**
 * probe-heb-coverage.mjs — READ ONLY.
 *
 * fieldy: "The english is not the source of the truth, the hebrew is. The english
 * should reflect the hebrew, not the other way around."
 *
 * That inverts the renderer. Everything so far walks ENGLISH words and asks "is
 * there Hebrew for this?", which is why Matthew 1:2 glossed "father" as ab when
 * the verse contains no H1 at all — the Hebrew is 𐤄𐤅𐤋𐤉𐤃 (H3205, "begat"), one
 * word standing for the three English words "became the father of".
 *
 * A Hebrew-driven renderer walks TOKENS and asks "which English says this?" That
 * needs a token -> English-span mapping. Two possible sources, and which one we
 * have decides the whole design:
 *
 *   A. translation_links (token_ordinals <-> english_indices). Real alignment,
 *      authored, exact. If coverage is high, the renderer is straightforward and
 *      accurate: replace each linked English span with its token's transliteration.
 *
 *   B. kjv_def matching. A guess, and demonstrably not enough on its own —
 *      H3205's kjv_def has "beget/bear/bring forth" and the English says "became
 *      the father of", so no dictionary lookup connects them. Useful only as a
 *      fallback where no link exists.
 *
 * This measures A, so the choice is made on numbers rather than hope.
 *
 * USAGE
 *   node probe-heb-coverage.mjs --out heb-coverage.txt
 *   node probe-heb-coverage.mjs --canon 40 --out matthew.txt
 *
 * FLAGS
 *   --db <path>      corpus.db          (default ./corpus.db)
 *   --index <path>   surface-index.db   (default ./surface-index.db)
 *   --links <path>   translations db if separate (default: try corpus.db first)
 *   --min/--max <n>  canon range (default 40-66, the NT)
 *   --canon <n>      a single book
 *   --out <file>     write here (never shell-redirect: winpty)
 */

import Database from 'better-sqlite3';
import { writeFileSync, existsSync } from 'fs';

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
    const i = argv.indexOf('--' + n);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const DB    = arg('db', './corpus.db');
const IDX   = arg('index', './surface-index.db');
const CANON = arg('canon') ? parseInt(arg('canon'), 10) : null;
const MIN   = parseInt(arg('min', '40'), 10);
const MAX   = parseInt(arg('max', '66'), 10);
const OUT   = arg('out');

const LINES = [];
const say = (...a) => { const s = a.join(' '); LINES.push(s); console.log(s); };
const rule = t => { say(''); say('─'.repeat(76)); say(t); say('─'.repeat(76)); };

say('probe-heb-coverage — can the English be driven FROM the Hebrew?');

// ── find translation_links, wherever it lives ───────────────────────────────
const candidates = [arg('links'), DB, './translation.db', './translations.db', './links.db']
    .filter(Boolean).filter(existsSync);
let ldb = null, lpath = null;
for (const p of candidates) {
    try {
        const d = new Database(p, { readonly: true });
        d.prepare('SELECT 1 FROM translation_links LIMIT 1').get();
        ldb = d; lpath = p; break;
    } catch { /* not this one */ }
}
if (!ldb) {
    say('translation_links NOT FOUND in: ' + candidates.join(', '));
    say('');
    say('Without it, a Hebrew-driven renderer has no authored alignment to work');
    say('from and would have to infer every span from kjv_def — which provably');
    say('fails on the case that prompted this (H3205 "beget" vs "became the');
    say('father of"). Point me at the file with --links, or say where it lives.');
    if (OUT) writeFileSync(OUT, LINES.join('\n') + '\n');
    process.exit(0);
}
say(`translation_links found in ${lpath}`);

// ── the Hebrew per verse, from the bake ─────────────────────────────────────
const idx = new Database(IDX, { readonly: true });
const hasSource = (() => { try { idx.prepare('SELECT source FROM token_surfaces LIMIT 1').get(); return true; } catch { return false; } })();
if (!hasSource) { say('surface-index has no `source` column — rebuild with --heb'); process.exit(0); }

const where = CANON ? 'o.book_id = ?' : 'o.book_id BETWEEN ? AND ?';
const params = CANON ? [CANON] : [MIN, MAX];
const toks = new Map();   // "book|ch|v" -> [{ord, sn, tr}]
for (const r of idx.prepare(`
    SELECT o.book_id, o.chapter, o.verse, o.token_ordinal, t.strongs, t.components
    FROM surface_occurrences o
    JOIN token_surfaces t ON t.word_raw = o.word_raw AND t.source = o.source
         AND t.strongs = o.strongs AND t.pos = o.pos AND t.morph = o.morph
    WHERE o.source = 'HEB' AND ${where}
    ORDER BY o.book_id, o.chapter, o.verse, o.token_ordinal`).all(...params)) {
    let comps; try { comps = JSON.parse(r.components); } catch { comps = []; }
    const root = comps.find(c => c.css === 'root') || comps.find(c => c.translit);
    const key = `${r.book_id}|${r.chapter}|${r.verse}`;
    if (!toks.has(key)) toks.set(key, []);
    toks.get(key).push({ ord: r.token_ordinal, sn: r.strongs || '', tr: (root && root.translit) || '' });
}
idx.close();
say(`Hebrew verses in range: ${toks.size.toLocaleString()}`);

// ── the links ───────────────────────────────────────────────────────────────
const lrows = ldb.prepare(`
    SELECT book_id, chapter, verse, english_indices, token_ordinals
    FROM translation_links
    WHERE ${CANON ? 'book_id = ?' : 'book_id BETWEEN ? AND ?'}`).all(...params);
ldb.close();

const linked = new Map();   // verse key -> Set(token_ordinal)
let spans = 0, multiWord = 0, multiToken = 0;
for (const l of lrows) {
    const key = `${l.book_id}|${l.chapter}|${l.verse}`;
    let ords = [], eng = [];
    try { ords = JSON.parse(l.token_ordinals || '[]'); } catch { /* skip */ }
    try { eng  = JSON.parse(l.english_indices || '[]'); } catch { /* skip */ }
    if (!ords.length || !eng.length) continue;
    spans++;
    if (eng.length > 1) multiWord++;
    if (ords.length > 1) multiToken++;
    if (!linked.has(key)) linked.set(key, new Set());
    for (const o of ords) linked.get(key).add(o);
}

let totalTok = 0, coveredTok = 0, versesAny = 0, versesFull = 0;
const worst = [];
for (const [key, list] of toks) {
    const cov = linked.get(key) || new Set();
    const c = list.filter(t => cov.has(t.ord)).length;
    totalTok += list.length; coveredTok += c;
    if (c > 0) versesAny++;
    if (c === list.length) versesFull++;
    if (c === 0) worst.push(key);
}

rule('ALIGNMENT COVERAGE');
say(`link rows in range        : ${lrows.length.toLocaleString()}`);
say(`usable spans              : ${spans.toLocaleString()}`);
say(`  spanning >1 English word: ${multiWord.toLocaleString()}   <- the "became the father of" case`);
say(`  spanning >1 Hebrew token: ${multiToken.toLocaleString()}`);
say('');
say(`Hebrew tokens in range    : ${totalTok.toLocaleString()}`);
say(`  with an English link    : ${coveredTok.toLocaleString()}  (${(100 * coveredTok / (totalTok || 1)).toFixed(1)}%)`);
say(`verses with ANY link      : ${versesAny.toLocaleString()} / ${toks.size.toLocaleString()}`);
say(`verses FULLY linked       : ${versesFull.toLocaleString()} / ${toks.size.toLocaleString()}`);

rule('WHAT THIS DECIDES');
const pct = 100 * coveredTok / (totalTok || 1);
if (pct >= 80) {
    say('HIGH. Drive the render from translation_links: walk each verse\'s tokens,');
    say('replace the linked English span with that token\'s transliteration. Exact,');
    say('multi-word spans handled, and no dictionary guessing. kjv_def matching');
    say('becomes a fallback for the unlinked remainder only.');
} else if (pct >= 25) {
    say('PARTIAL. Links carry the hard cases but not the bulk. Render linked spans');
    say('from the links, then fall back to kjv_def matching — and expect the gaps');
    say('to be exactly the idiomatic renderings a dictionary cannot bridge.');
} else {
    say('LOW. There is not enough authored alignment to drive the render from the');
    say('Hebrew yet. The realistic path is to GENERATE links first — align each');
    say('verse\'s tokens to English spans once, store them in translation_links,');
    say('review, and then render from them. That is a build, not a tweak, but it');
    say('is the only way to get "the English reflects the Hebrew" rather than a');
    say('dictionary approximation.');
}
say('');
say(`verses with Hebrew but NO link at all: ${worst.length.toLocaleString()}`);
if (worst.length) say('  e.g. ' + worst.slice(0, 12).join('  '));

if (OUT) { writeFileSync(OUT, LINES.join('\n') + '\n'); console.log(`\n[written to ${OUT}]`); }
