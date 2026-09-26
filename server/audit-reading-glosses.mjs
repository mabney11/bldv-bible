#!/usr/bin/env node
/**
 * audit-reading-glosses.mjs — flag reading-text glosses whose Hebrew is NOT in the verse.
 *
 * fieldy, 2026-09-26: "there should be flags for translations that use glosses that
 * dont exist in the hebrew, that'd flag the 'hamah' case and other like it."
 *
 * For every verse's reading text (translation.db — what the reader shows — falling back
 * to corpus.db ENG), each `word (gloss)` pair claims a Hebrew word. The pair is OK when
 * the verse's own Hebrew tokens (tokens_bhs for canon 1-39, tokens_nt otherwise) carry a
 * Strong's number whose root transliterates to that word (or the word is an inflection
 * of it, or matches a token's own surface). Names/theonyms from name-map-expanded.json
 * are skipped (the name pass is spelling-based by design). Everything else is a FLAG:
 * a blanket term pin (term-forms.txt / word-map terms) or a kjv_def verse-gloss that
 * put a word into the English the Hebrew does not have.
 *
 * Read-only. Usage:
 *   node audit-reading-glosses.mjs [--out reading-gloss-audit.txt] [--canon 66] [--top 200]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const arg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const OUT = arg('--out', 'reading-gloss-audit.txt');
const ONLY = arg('--canon', null);
const TOP = +arg('--top', 300);

function openRO(file) {
  try { const D = require('better-sqlite3'); return new D(file, { readonly: true }); }
  catch {
    const { DatabaseSync } = require('node:sqlite');
    return new DatabaseSync(`file:${new URL(file, import.meta.url).pathname}?immutable=1`, { readOnly: true });
  }
}
const corpus = openRO('./corpus.db');
const tdb = existsSync('./translation.db') ? openRO('./translation.db') : null;

const ROOTS = JSON.parse(readFileSync(['./lexicon/strongs-roots.json', './strongs-roots.json'].find(existsSync), 'utf8'));
const { translit } = await import(new URL(['../src/lib/books.js', './src/lib/books.js'].find(existsSync), import.meta.url).href);
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
const trCache = new Map();
const trSn = sn => { const k = 'H' + String(sn).replace(/^H+/i, '').replace(/[^0-9a-z].*$/i, '');
  if (!trCache.has(k)) trCache.set(k, ROOTS[k] ? norm(translit(ROOTS[k])) : ''); return trCache.get(k); };

// Names/theonyms: spelling-based on purpose — not auditable against tokens.
const names = new Set();
try {
  const nm = JSON.parse(readFileSync('./name-map-expanded.json', 'utf8'));
  for (const sec of ['single', 'phrases', 'theonyms']) for (const v of Object.values(nm[sec] || {}))
    { names.add(norm(v)); for (const w of String(v).split(/[\s-]+/)) names.add(norm(w)); }
} catch { /* no name map */ }

// Hebrew per verse: canon|ch|v -> { roots:Set, surf:Set }
const heb = new Map();
const addTok = (c, ch, v, sn, raw) => {
  const k = `${c}|${ch}|${v}`; let e = heb.get(k); if (!e) heb.set(k, e = { roots: new Set(), surf: new Set() });
  for (const one of String(sn || '').split(/[+＋]/)) { const t = trSn(one); if (t) e.roots.add(t); }
  if (raw) e.surf.add(norm(translit(raw)));
};
for (const r of corpus.prepare(`SELECT book_id, chapter, verse, strongs, word_raw FROM tokens_bhs WHERE strongs != ''`).iterate())
  addTok(r.book_id, r.chapter, r.verse, r.strongs, r.word_raw);
for (const r of corpus.prepare(`SELECT book_id, chapter, verse, strongs, word_raw FROM tokens_nt WHERE book_id > 39`).iterate())
  addTok(r.book_id, r.chapter, r.verse, r.strongs, r.word_raw);

const PAIR = /\b([A-Za-z][A-Za-z'’-]*)\s+\(([^()]{1,60})\)/g;
const flags = new Map();   // "word (gloss)" -> {n, refs[], why}
let pairs = 0, ok = 0, skippedNames = 0, noHeb = 0;
const texts = new Map();
for (const r of corpus.prepare(`SELECT canon_id AS c, chapter AS ch, verse AS v, text FROM verses WHERE corpus='ENG' AND canon_id IS NOT NULL`).iterate())
  texts.set(`${r.c}|${+r.ch}|${+r.v}`, r.text);
if (tdb) for (const r of tdb.prepare(`SELECT book_id AS c, chapter AS ch, verse AS v, text FROM translations`).iterate())
  if (r.text) texts.set(`${r.c}|${+r.ch}|${+r.v}`, r.text);

for (const [key, text] of texts) {
  if (ONLY && !key.startsWith(ONLY + '|')) continue;
  const h = heb.get(key);
  for (const m of String(text).matchAll(PAIR)) {
    const word = norm(m[1]); if (!word || word.length < 2) continue;
    pairs++;
    if (names.has(word)) { skippedNames++; continue; }
    if (!h) { noHeb++; continue; }
    let hit = h.surf.has(word);
    if (!hit) for (const r of h.roots) { if (r && (word === r || (r.length >= 3 && word.startsWith(r)))) { hit = true; break; } }
    if (hit) { ok++; continue; }
    const fk = `${m[1].toLowerCase()} (${m[2]})`;
    let f = flags.get(fk); if (!f) flags.set(fk, f = { n: 0, refs: [] });
    f.n++; if (f.refs.length < 6) f.refs.push(key.replace(/\|/g, ':'));
  }
}
const rows = [...flags.entries()].sort((a, b) => b[1].n - a[1].n);
const total = rows.reduce((s, [, f]) => s + f.n, 0);
const lines = [
  `reading-gloss audit — ${new Date().toISOString()}`,
  `pairs ${pairs.toLocaleString()} · ok ${ok.toLocaleString()} · names skipped ${skippedNames.toLocaleString()} · verses without Hebrew tokens ${noHeb.toLocaleString()}`,
  `FLAGGED ${total.toLocaleString()} pairs, ${rows.length.toLocaleString()} distinct "word (gloss)" — the word is not any Hebrew root in its verse`,
  `(refs are canon:chapter:verse)`, '',
  ...rows.slice(0, TOP).map(([k, f]) => `${String(f.n).padStart(6)}  ${k}   e.g. ${f.refs.join(' ')}`),
];
writeFileSync(OUT, lines.join('\n') + '\n');
console.log(lines.slice(0, 3).join('\n') + `\nwrote ${OUT}`);
