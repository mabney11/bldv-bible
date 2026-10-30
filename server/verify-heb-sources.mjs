#!/usr/bin/env node
// verify-heb-sources.mjs — the SOURCES gate (2026-10-30, fieldy: tokens "consistent with other sources of the same texts").
// Reads surface-index.db surface_occurrences.evidence (set by heb-align: its verse's English versions, the Greek NT, the
// verse pairing) for every HEB-edition word and FAILS (exit 1) when
//   1. a word is 'contradicted' (another source names another reading of its spelling, nothing confirms this one)
//      that is not already listed in the baseline (lexicon/heb-source-baseline.json) — a NEW contradiction never ships;
//   2. a book's share of weak readings (guess + unconfirmed + contradicted, of everything judgeable) rises more than
//      0.5 points above its baseline (books with >= 200 judgeable readings).
// The baseline only ever moves when fieldy runs --update-baseline (after reviewing heb-source-review.txt).
// Usage: node verify-heb-sources.mjs [surface-index.db] [--baseline f] [--report f] [--update-baseline]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i && ['--baseline', '--report'].includes(args[i - 1])));
const IDX = pos[0] || path.join(here, 'surface-index.db');
const BASE = opt('--baseline') || path.join(here, 'lexicon', 'heb-source-baseline.json');
const REPORT = opt('--report') || path.join(here, 'heb-sources-report.txt');
const UPDATE = args.includes('--update-baseline');
const TOL = 0.005, MIN = 200;

const db = new Database(IDX, { readonly: true });
const cols = db.prepare(`PRAGMA table_info(surface_occurrences)`).all().map(c => c.name);
if (!cols.includes('evidence')) { console.log(`SOURCES gate: ${path.basename(IDX)} has no evidence column (built --no-evidence) — skipped`); process.exit(0); }
const books = new Map();   // book_id -> counts
const contra = [];
const STRONG = new Set(['english', 'greek', 'hand']), WEAK = new Set(['guess', 'unconfirmed', 'contradicted']);
for (const r of db.prepare(`SELECT book_id, chapter, verse, token_ordinal, word_raw, strongs, evidence FROM surface_occurrences WHERE source = 'HEB' AND book_id >= 40`).iterate()) {
    const e = r.evidence || '';
    let b = books.get(r.book_id); if (!b) books.set(r.book_id, b = { ok: 0, weak: 0 });
    if (STRONG.has(e)) b.ok++; else if (WEAK.has(e)) b.weak++;
    if (e === 'contradicted') contra.push(`${r.book_id}|${r.chapter}|${r.verse}|${r.token_ordinal}|${r.word_raw}|${r.strongs}`);
}
db.close();
const share = b => (b.ok + b.weak) ? b.weak / (b.ok + b.weak) : 0;
const now = { _note: 'verify-heb-sources.mjs --update-baseline. Per book: weak share of judgeable HEB readings; contradicted = known, to be worked down. Do not edit by hand.',
    updated: new Date().toISOString(),
    books: Object.fromEntries([...books].sort((a, z) => a[0] - z[0]).map(([k, b]) => [k, { judgeable: b.ok + b.weak, weak: +share(b).toFixed(4) }])),
    contradicted: contra.sort() };
if (UPDATE) {
    fs.writeFileSync(BASE, JSON.stringify(now, null, 1) + '\n');
    console.log(`SOURCES gate: baseline written (${books.size} books, ${contra.length} known contradicted) -> ${BASE}`);
    process.exit(0);
}
let base = null;
try { base = JSON.parse(fs.readFileSync(BASE, 'utf8')); } catch { }
if (!base) { console.error(`SOURCES gate: no baseline at ${BASE} — run with --update-baseline once`); process.exit(1); }
const known = new Set(base.contradicted || []);
const fails = [];
const fresh = contra.filter(k => !known.has(k));
for (const k of fresh) fails.push(`contradicted (new): ${k}`);
const lines = ['book\tjudgeable\tweak% now\tweak% baseline'];
for (const [id, b] of [...books].sort((a, z) => a[0] - z[0])) {
    const bb = base.books && base.books[id], s = share(b);
    lines.push(`${id}\t${b.ok + b.weak}\t${(100 * s).toFixed(1)}\t${bb ? (100 * bb.weak).toFixed(1) : '-'}`);
    if (bb && b.ok + b.weak >= MIN && s > bb.weak + TOL) fails.push(`book ${id}: weak readings ${(100 * s).toFixed(1)}% > baseline ${(100 * bb.weak).toFixed(1)}%`);
}
const gone = [...known].filter(k => !contra.includes(k)).length;
fs.writeFileSync(REPORT, [`SOURCES gate ${new Date().toISOString()} — ${fails.length ? 'FAIL' : 'PASS'}`, ...fails, '', ...lines, '',
    `contradicted now ${contra.length} (baseline ${known.size}; ${gone} resolved since)`].join('\n') + '\n');
if (fails.length) {
    console.error(`SOURCES gate FAILED: ${fails.length} problem(s) — ${path.basename(REPORT)}`);
    for (const f of fails.slice(0, 15)) console.error('  ' + f);
    process.exit(1);
}
console.log(`SOURCES gate: pass — ${books.size} books, contradicted ${contra.length} (baseline ${known.size}, ${gone} resolved since)${gone ? ' — --update-baseline to lock in the improvement' : ''}`);
