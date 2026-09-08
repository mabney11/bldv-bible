#!/usr/bin/env node
/**
 * hyphenate-compound-names.mjs — normalize compound proper names to the
 * hyphenated form fieldy wants everywhere the app renders English prose:
 *
 *     Bayathalacham  →  Bayath-Lacham     (בית לחם, H1035 — "house of bread")
 *     Bayathaal      →  Bayath-Al         (בית־אל,  H1008)
 *     Yasharaal      →  Yashar-Al         (ישראל,   H3478 — fused, split by derivation)
 *
 * so each piece can be enunciated on its own (2026-09-08). EVIDENCE ONLY:
 * a name is split where the Strong's dictionary (server/strongs-hebrew-expanded.json)
 * splits it — a space/maqaf in the lemma, or, for a fused word, where its
 * `derivation` components begin/end the spelling. Same rules as the server's
 * /api/strongs/:sn (splitFusedCompound) so the Reader, the Root Explorer and
 * the map all agree. Nothing is guessed: no dictionary evidence → untouched.
 *
 * Modes:
 *   node hyphenate-compound-names.mjs                 dry run: print every old → new pair
 *   node hyphenate-compound-names.mjs --apply          rewrite name-map-expanded.json values
 *                                                      + write lexicon/compound-hyphenation.json
 *   node hyphenate-compound-names.mjs --corpus         ALSO rewrite already-substituted ENG
 *                                                      verse text in corpus.db (whole-word
 *                                                      old → new), since sanitize-english.js
 *                                                      is idempotent and will not revisit them.
 *                                                      Needs better-sqlite3 — run on your machine.
 * After --apply: node sanitize-english.js (new ingests pick the new forms up), then the usual
 * render pipeline + restart. translation.db (Translation Studio's own saved verses) is NOT
 * touched by this script — those are real edits and stay as saved.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { transliterate } from '../src/lib/translit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply') || process.argv.includes('--corpus');
const CORPUS = process.argv.includes('--corpus');

const SQ = { 'א':'𐤀','ב':'𐤁','ג':'𐤂','ד':'𐤃','ה':'𐤄','ו':'𐤅','ז':'𐤆','ח':'𐤇','ט':'𐤈','י':'𐤉','כ':'𐤊','ך':'𐤊','ל':'𐤋','מ':'𐤌','ם':'𐤌','נ':'𐤍','ן':'𐤍','ס':'𐤎','ע':'𐤏','פ':'𐤐','ף':'𐤐','צ':'𐤑','ץ':'𐤑','ק':'𐤒','ר':'𐤓','ש':'𐤔','ת':'𐤕' };
const paleo = (s) => [...s].map((c) => SQ[c] ?? c).join('');
const lemmaParts = (lemma) => String(lemma || '').replace(/־/g, ' ').replace(/[֑-ׇ׳״͏]/g, '').split(/[\s-]+/).filter(Boolean);
const tr = (he) => transliterate(paleo(he));

const dictPath = ['strongs-hebrew-expanded.json', 'strongs-hebrew.json'].map((f) => path.join(__dirname, f)).find((f) => fs.existsSync(f));
const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));

function splitFused(he, partHes) {
  if (!he || partHes.length < 2) return null;
  const last = partHes[partHes.length - 1], first = partHes[0];
  // Both pieces must be real words (≥ 2 letters) — never split off a single letter.
  if (last && last.length >= 2 && he.length - last.length >= 2 && he.endsWith(last)) return [he.slice(0, -last.length), last];
  if (first && first.length >= 2 && he.length - first.length >= 2 && he.startsWith(first)) return [first, he.slice(first.length)];
  return null;
}

// old joined transliteration → { new hyphenated, sn, he }
const pairs = new Map();
for (const [snRaw, e] of Object.entries(dict)) {
  const sn = 'H' + String(snRaw).replace(/^H+/i, '');
  const parts = lemmaParts(e.lemma);
  if (!parts.length) continue;
  let split = parts.length >= 2 ? parts : null;
  if (!split) {
    const comps = [...String(e.derivation || '').matchAll(/H0*(\d+[a-z]?)/g)].map((m) => 'H' + m[1]).filter((p) => p !== sn)
      .map((p) => lemmaParts((dict[p] || dict[p.slice(1)] || {}).lemma).join(''));
    split = splitFused(parts[0], comps);
  }
  if (!split) continue;
  const oldTr = tr(parts.join(''));
  const newTr = split.map(tr).join('-');
  if (oldTr === newTr || newTr.includes('--')) continue;
  if (!pairs.has(oldTr)) pairs.set(oldTr, { to: newTr, sn, he: split.join(' '), paleo: split.map(paleo).join('-') });
}

// Which of these actually occur in the name map (the reading-text source)?
const nmPath = path.join(__dirname, 'name-map-expanded.json');
const nm = JSON.parse(fs.readFileSync(nmPath, 'utf8'));
const used = new Map();
for (const sect of ['single', 'phrases', 'theonyms']) {
  for (const [k, v] of Object.entries(nm[sect] || {})) {
    const hit = pairs.get(v);
    if (hit) { used.set(v, hit); if (APPLY) nm[sect][k] = hit.to; }
  }
}
console.log(`${pairs.size} hyphenation rules from the dictionary; ${used.size} distinct forms in use in name-map-expanded.json:`);
for (const [from, { to, sn, paleo: p }] of [...used].sort()) console.log(`  ${from.padEnd(22)} → ${to.padEnd(22)} ${p}  ${sn}`);

if (APPLY) {
  fs.writeFileSync(nmPath, JSON.stringify(nm, null, 2) + '\n');
  const outPath = path.join(__dirname, 'lexicon', 'compound-hyphenation.json');
  fs.writeFileSync(outPath, JSON.stringify(Object.fromEntries([...used].map(([k, v]) => [k, v])), null, 2) + '\n');
  console.log(`\nname-map-expanded.json rewritten; ${used.size} rules saved to lexicon/compound-hyphenation.json`);
}
if (CORPUS) {
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(path.join(__dirname, 'corpus.db'));
  const sel = db.prepare(`SELECT rowid, text FROM verses WHERE corpus='ENG' AND text LIKE ?`);
  const upd = db.prepare(`UPDATE verses SET text=? WHERE rowid=?`);
  let changed = 0;
  const tx = db.transaction(() => {
    for (const [from, { to }] of used) {
      const re = new RegExp(`\\b${from}\\b`, 'g');
      for (const r of sel.all(`%${from}%`)) {
        const t = r.text.replace(re, to);
        if (t !== r.text) { const info = upd.run(t, r.rowid); changed += info.changes; }
      }
    }
  });
  tx();
  console.log(`corpus.db: ${changed} ENG verses updated (counted from .changes, re-query to confirm)`);
}
