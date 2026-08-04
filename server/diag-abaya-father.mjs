// Diagnostic: why does Matthew 1:7 render "abaya (father)" instead of the
// bare root "ab" (H1)? Replicates render-corpus.mjs's exact word-extraction
// logic (lines ~214-224) to see EVERY Strong's number that legitimately maps
// to the English word "father" via kjv_def, then checks which of Matthew
// 1:7's actual Hebrew tokens (surface-index.db, source=HEB) would be picked
// by the verse-gloss matching logic (toks.find(), first-unused-match-wins).
import Database from 'better-sqlite3';
import { readFileSync, existsSync } from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const dictPath = ['./strongs-hebrew-expanded.json', './strongs-hebrew.json'].find(existsSync);
const dict = JSON.parse(readFileSync(path.join(__dirname, dictPath), 'utf8'));
const rootsPath = ['./lexicon/strongs-roots.json', './strongs-roots.json'].find(existsSync);
const ROOTS = JSON.parse(readFileSync(path.join(__dirname, rootsPath), 'utf8'));
const { translit } = require(path.resolve(__dirname, '../src/lib/books.js'));

// Exact replica of render-corpus.mjs lines 214-224.
const englishMap = new Map();
const norm = sn => 'H' + String(sn).replace(/^H+/i, '');
for (const [rawSn, e] of Object.entries(dict)) {
    const def = typeof e === 'string' ? e : (e && (e.kjv_def || e.strongs_def || e.def));
    if (!def) continue;
    const sn = norm(rawSn);
    for (const piece of String(def).split(/[,;]/)) {
        const word = piece.replace(/\([^)]*\)/g, ' ').replace(/[^A-Za-z\s'-]/g, ' ').trim().toLowerCase();
        if (!/^[a-z][a-z'-]{2,}$/.test(word)) continue;
        if (!englishMap.has(word)) englishMap.set(word, new Set());
        englishMap.get(word).add(sn);
    }
}

const fatherSNs = englishMap.get('father') || new Set();
console.log(`"father" maps to ${fatherSNs.size} Strong's number(s) via kjv_def/strongs_def extraction:`);
for (const sn of fatherSNs) {
    const root = ROOTS[sn];
    const tr = root ? translit(root) : '(no root)';
    console.log(`  ${sn}  root=${root ? [...root].map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase()).join(' ') : '?'}  translit="${tr}"`);
}

// Matthew = book_id 40. Verse 7.
const db = new Database(path.join(__dirname, 'surface-index.db'), { readonly: true });
const toks = db.prepare(`
    SELECT o.token_ordinal, o.word_raw, o.strongs, o.pos, o.morph
    FROM surface_occurrences o
    WHERE o.source='HEB' AND o.book_id=40 AND o.chapter=1 AND o.verse=7
    ORDER BY o.token_ordinal
`).all();
console.log(`\nMatthew 1:7 tokens (source=HEB), in order:`);
for (const t of toks) {
    const inFatherSet = fatherSNs.has('H' + String(t.strongs).replace(/^H+/i, ''));
    console.log(`  ord=${t.token_ordinal}  sn=${t.strongs || '(none)'}  pos=${t.pos}${inFatherSet ? '   <-- IN "father" SN set' : ''}`);
}
