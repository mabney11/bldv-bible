#!/usr/bin/env node
// build-name-glosses.mjs — every name's English, for the reading text (2026-10-30, fieldy: "Treat the names the same as
// every other hebrew word -- no need for standalone hebrew names ... My text would have been 'Yawasap ()' if i didnt
// manually add 'Joseph' as the gloss"). Baked from name-map-expanded.json (English -> the app's transliteration) and
// web-strongs.jsonl (which English the WEB actually writes, by count): name-glosses.json { translit: English }.
// name-form-lib loads it into "glossed": a bare name or "Name ()" becomes "Yawasap (Joseph)" on every row.
// The Name and the titles of Yah (theonyms in name-map-expanded.json) are left out — they keep their own rules.
// Run: node build-name-glosses.mjs   (render-all runs it before the name passes)
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const nm = JSON.parse(readFileSync(path.join(here, 'name-map-expanded.json'), 'utf8'));
const theo = new Set(Object.values(nm.theonyms || {}).map(String));
// how often the WEB writes each English word (capitalised, as a name)
const freq = new Map(), lower = new Map();
for (const line of readFileSync(path.join(here, 'web-strongs.jsonl'), 'utf8').split('\n')) {
  if (!line) continue;
  let d; try { d = JSON.parse(line); } catch { continue; }
  for (const w of String(d.text || '').match(/[A-Z][A-Za-z-]+/g) || []) freq.set(w, (freq.get(w) || 0) + 1);
  for (const w of String(d.text || '').match(/\b[a-z][a-z]+\b/g) || []) lower.set(w, (lower.get(w) || 0) + 1);
}
const cands = new Map();   // translit -> [english…]
const add = (en, tr) => {
  tr = String(tr || '').trim(); en = String(en || '').trim();
  if (en === tr) return;   // the name map lists the transliteration itself too
  if (!tr || !en || theo.has(tr) || !/^[A-Z]/.test(en) || /\s/.test(tr)) return;
  // a transliteration that is also an ordinary English word ("Away", "Than", "Bad") would gloss a sentence's first word
  if ((lower.get(tr.toLowerCase()) || 0) >= 3) return;
  if (!cands.has(tr)) cands.set(tr, new Set());
  cands.get(tr).add(en);
};
for (const [en, tr] of Object.entries(nm.single || {})) add(en, tr);
for (const [en, tr] of Object.entries(nm.phrases || {})) add(en, tr);
const out = {};
let ties = 0;
for (const [tr, set] of [...cands].sort()) {
  const ranked = [...set].sort((a, b) => (freq.get(b.split(/\s/)[0]) || 0) - (freq.get(a.split(/\s/)[0]) || 0) || a.length - b.length);
  if (ranked.length > 1 && (freq.get(ranked[0].split(/\s/)[0]) || 0) === 0) ties++;
  out[tr] = ranked;   // the verse's own English picks among them (Marayam: Miriam / Mary); the first is the fallback
}
writeFileSync(path.join(here, 'name-glosses.json'), JSON.stringify({ _note: 'build-name-glosses.mjs — generated: translit -> its English names, the one the WEB writes most first (the verse own English chooses). Do not edit; a correction goes in lexicon/name-form-rules.json "glossed" (it wins).', ...out }, null, 1) + '\n');
console.log(`name-glosses.json: ${Object.keys(out).length.toLocaleString()} names (${theo.size} theonyms left to their own rules; ${ties} picked without WEB evidence)`);
