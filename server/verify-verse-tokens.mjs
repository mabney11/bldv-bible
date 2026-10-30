#!/usr/bin/env node
// verify-verse-tokens.mjs — GATE: every verse's tokens are that verse's words (fieldy, 2026-10-30:
// "i need to guarantee every row has tokens that matches its corresponding verse").
//
//   node verify-verse-tokens.mjs [corpus.db] [surface-index.db] [heb-settled.db] [--report f.txt]
//
// Exit 1 on ANY failure. Read-only. Checks:
//  1. HEB EDITION (every corpus.db HEB verse with a canon_id — what the reader serves): the
//     surface index's HEB tokens for it are its words, in order, ordinals 1..N with no gap — split
//     exactly as heb-align.js splits it (wordsOf: text_paleo, with `text`'s maqaf boundaries when it
//     spells the same letters), keyed through heb_offsets (Psalms superscriptions). Compared by
//     Paleo LETTERS: a punctuation-only token (׃) is not a word. No index verse without a text row.
//  2. HEB-SETTLED (heb-settled.db, if present): every etched reading sits on the word it was etched
//     for — a frozen reading may never land on another word.
//  3. BHS: the index's BHS tokens are corpus.db tokens_bhs, row for row (same place, same word).
import Database from 'better-sqlite3';
import { createRequire } from 'node:module';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { splitWords } = require('./heb-align.js');
const args = process.argv.slice(2);
const flagVal = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const pos = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--report');
const CORPUS = pos[0] || path.join(HERE, 'corpus.db');
const SURF = pos[1] || path.join(HERE, 'surface-index.db');
const SETTLED = pos[2] || path.join(HERE, 'heb-settled.db');
const REPORT = flagVal('--report') || path.join(HERE, 'verse-tokens-report.txt');

const L = s => [...(s || '')].filter(c => { const x = c.codePointAt(0); return x >= 0x10900 && x <= 0x10915; }).join('');
const wordsOf = (text, paleo) => {
  const a = splitWords(paleo); if (!a.length) return splitWords(text);
  const b = splitWords(text); if (b.length > a.length && b.join('') === a.join('')) return b; return a;
};
const fails = {}, lines = [];
const fail = (kind, ref, info) => { fails[kind] = (fails[kind] || 0) + 1; if (fails[kind] <= 200) lines.push(`${kind}\t${ref}\t${info}`); };

const cdb = new Database(CORPUS, { readonly: true, fileMustExist: true });
const sdb = new Database(SURF, { readonly: true, fileMustExist: true });

// offsets: text verse v is index verse v + offset
const off = new Map();
try { for (const r of sdb.prepare('SELECT canon_id, chapter, offset FROM heb_offsets WHERE offset != 0').all()) off.set(`${r.canon_id}|${r.chapter}`, r.offset); }
catch { /* old index: no offsets */ }

// index HEB tokens, per verse
const idx = new Map();
for (const r of sdb.prepare("SELECT book_id b, chapter c, verse v, token_ordinal o, word_raw w FROM surface_occurrences WHERE source = 'HEB'").iterate()) {
  const k = `${r.b}|${r.c}|${r.v}`; let a = idx.get(k); if (!a) idx.set(k, a = []); a.push([r.o, r.w]);
}

// 1. HEB edition
let nVerses = 0, nWords = 0, unpromoted = 0;
const textWords = new Map();                         // index key -> words (for check 2)
const used = new Set();
for (const r of cdb.prepare("SELECT canon_id b, chapter c, verse v, text t, text_paleo p FROM verses WHERE corpus = 'HEB'").iterate()) {
  if (r.b == null) { unpromoted++; continue; }
  const C = parseInt(r.c, 10), V = parseInt(r.v, 10);
  const key = `${r.b}|${C}|${V + (off.get(`${r.b}|${C}`) || 0)}`, ref = `${r.b}|${C}|${V}`;
  if (used.has(key)) { fail('two verses on one index verse', ref, `→ ${key}`); continue; }
  used.add(key); nVerses++;
  const all = wordsOf(r.t, r.p); textWords.set(key, all);
  const W = all.filter(w => L(w));
  const T = (idx.get(key) || []).sort((x, y) => x[0] - y[0]);
  nWords += W.length;
  if (T.some(([o], i) => o !== i + 1)) { fail('token ordinals not 1..N', ref, T.map(x => x[0]).slice(0, 20).join(',')); continue; }
  const Tw = T.filter(([, w]) => L(w)).map(([, w]) => w);
  if (!W.length && !Tw.length) continue;
  if (!Tw.length) { fail('verse has no tokens', ref, `${W.length} words`); continue; }
  if (!W.length) { fail('tokens but no verse words', ref, `${Tw.length} tokens`); continue; }
  const n = Math.max(W.length, Tw.length);
  for (let i = 0; i < n; i++) {
    if (L(W[i]) !== L(Tw[i])) {
      fail(W.length === Tw.length ? 'word differs' : 'word count differs', ref,
        `text ${W.length} words, tokens ${Tw.length}; first difference at word ${i + 1}: text ${W[i] || '—'} | token ${Tw[i] || '—'}`);
      break;
    }
  }
}
for (const k of idx.keys()) if (!used.has(k)) fail('tokens with no verse', k, `${idx.get(k).length} tokens`);

// 2. heb-settled.db — each etched reading on the word it was etched for
let nSettled = 0;
if (existsSync(SETTLED)) {
  const zdb = new Database(SETTLED, { readonly: true });
  for (const r of zdb.prepare('SELECT k, w FROM occ').iterate()) {
    nSettled++;
    const j = r.k.lastIndexOf('|'), vk = r.k.slice(0, j), o = +r.k.slice(j + 1);
    const W = textWords.get(vk);
    if (!W) { fail('etched reading for a verse that does not exist', r.k, r.w); continue; }
    if (L(W[o - 1]) !== L(r.w)) fail('etched reading on another word', r.k, `etched for ${r.w}, verse word ${o} is ${W[o - 1] || '—'}`);
  }
  zdb.close();
}

// 3. BHS index = tokens_bhs
let nBhs = 0;
{
  const bi = new Map();
  for (const r of sdb.prepare("SELECT book_id b, chapter c, verse v, token_ordinal o, word_raw w FROM surface_occurrences WHERE source = 'BHS'").iterate())
    bi.set(`${r.b}|${r.c}|${r.v}|${r.o}`, r.w);
  for (const r of cdb.prepare('SELECT book_id b, chapter c, verse v, token_ordinal o, word_raw w FROM tokens_bhs').iterate()) {
    nBhs++; const k = `${r.b}|${r.c}|${r.v}|${r.o}`, w = bi.get(k);
    if (w === undefined) fail('BHS token missing from the index', k, r.w);
    else { if (L(w) !== L(r.w)) fail('BHS index word differs', k, `tokens_bhs ${r.w} | index ${w}`); bi.delete(k); }
  }
  for (const [k, w] of bi) fail('BHS index token not in tokens_bhs', k, w);
}
cdb.close(); sdb.close();

const total = Object.values(fails).reduce((a, b) => a + b, 0);
const head = [
  `verify-verse-tokens  ${new Date().toISOString()}`,
  `HEB edition: ${nVerses.toLocaleString()} verses, ${nWords.toLocaleString()} words (${unpromoted.toLocaleString()} rows with no canon_id not served, not judged)`,
  `heb-settled: ${existsSync(SETTLED) ? nSettled.toLocaleString() + ' etched readings' : 'none'}`,
  `BHS: ${nBhs.toLocaleString()} tokens`,
  total ? `FAILED: ${Object.entries(fails).map(([k, n]) => `${k} ${n}`).join(', ')}` : 'OK: every verse\'s tokens are its words',
];
writeFileSync(REPORT, head.join('\n') + '\n\n' + lines.join('\n') + '\n');
console.log(head.map(s => '  ' + s).join('\n') + (total ? `\n  (first 200 of each in ${path.basename(REPORT)})` : ''));
process.exit(total ? 1 : 0);
