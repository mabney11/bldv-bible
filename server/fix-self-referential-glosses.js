#!/usr/bin/env node
'use strict';
/*
 * fix-self-referential-glosses.js — repair the corruption a name-passthrough.js
 * bug introduced during this session (fixed now, but already-written rows don't
 * self-heal): a word immediately followed by a gloss containing the EXACT SAME
 * word, e.g. "Idah (Idah)" which should read "Idah (Adah)".
 *
 * The earlier find-self-referential-glosses.js cast too wide a net — it flagged
 * 575 rows, but most (like "Adam (Adam)", "Charan (Charan)") are legitimate: those
 * names transliterate to themselves in this app's Strong's-based canonical system
 * and were NEVER touched by the bug. The bug's actual signature is narrower: it
 * only happens where the gloss word is a value in name-map-expanded.json (or the
 * legacy name-map.json) for a DIFFERENT English key — "Idah" is the value for
 * "Adah", so "Idah (Idah)" is only possible if the pass overwrote a correct
 * "Idah (Adah)". Anchoring the fix to that reverse lookup instead of a blind text
 * pattern means this only touches rows the bug could actually have produced.
 *
 * Where exactly ONE original English key maps to that transliteration value, this
 * repairs automatically. Where more than one English word maps to the same
 * transliteration (genuinely ambiguous — which one was it originally?), it's
 * reported instead of guessed at.
 *
 * CRITICAL: a self-identical entry ("Aran":"Aran") is a LEGITIMATE candidate too,
 * not just different-key entries ("Oren":"Aran") — a name can genuinely
 * transliterate to itself, and that's frequently the correct, unmodified original.
 * The first version of this script excluded self-identical entries from the
 * candidate pool, which made "Aran (Aran)" look falsely unambiguous (only "Oren"
 * as a candidate) and would have wrongly rewritten a correct verse (Genesis
 * 36:28, about Dishan's son Aran, into "Aran (Oren)" — a different, unrelated
 * person in Chronicles). Same flaw affected "Dan"/"Daniel" and "Hadar"/"Heder".
 * Self-identical entries are now counted as candidates, so these correctly land
 * in the ambiguous pile instead of being auto-"fixed" incorrectly.
 *
 * Usage:
 *   node fix-self-referential-glosses.js            report only, no changes
 *   node fix-self-referential-glosses.js --apply     write the unambiguous fixes
 */
const path = require('path');
const Database = require('better-sqlite3');
const APPLY = process.argv.includes('--apply');

const nameMapExpanded = require('./name-map-expanded.json');
const nameMapOld = require('./name-map.json');

// value -> Set of distinct English keys that map to it, INCLUDING self-identical
// entries (k === v) — those are legitimate candidates too (see header comment).
const valueToKeys = new Map();
function addMap(map) {
  if (!map) return;
  for (const [k, v] of Object.entries(map)) {
    if (!v) continue;
    if (!valueToKeys.has(v)) valueToKeys.set(v, new Set());
    valueToKeys.get(v).add(k);
  }
}
addMap(nameMapExpanded.single);
addMap(nameMapExpanded.phrases);
addMap(nameMapExpanded.theonyms);
addMap(nameMapOld);

const db = new Database(path.join(__dirname, 'corpus.db'), { readonly: !APPLY });
const rows = db.prepare(
  "SELECT id, canon_id, code, chapter, verse, text FROM verses WHERE corpus='ENG' AND text IS NOT NULL AND text <> ''"
).all();

const SELF_GLOSS = /\b([A-Za-z][A-Za-z']*)\s*\(\1\)/g;
const upd = APPLY ? db.prepare('UPDATE verses SET text=? WHERE id=?') : null;

let scanned = 0, candidateRows = 0, fixed = 0, ambiguousRows = 0;
const byBook = {};
const ambiguousSamples = [];
const fixedSamples = [];

const run = () => {
  for (const r of rows) {
    SELF_GLOSS.lastIndex = 0;
    if (!SELF_GLOSS.test(r.text)) continue;
    scanned++;

    let changed = false;
    let rowAmbiguous = false;
    const newText = r.text.replace(/\b([A-Za-z][A-Za-z']*)\s*\(\1\)/g, (whole, word) => {
      const keys = valueToKeys.get(word);
      if (!keys || keys.size === 0) return whole; // not a known corruption-prone value — leave alone
      if (keys.size > 1) { rowAmbiguous = true; return whole; }
      const original = [...keys][0];
      const replacement = `${word} (${original})`;
      if (replacement === whole) return whole; // sole candidate IS the word itself — no-op, not corruption
      changed = true;
      return replacement;
    });

    if (changed) {
      candidateRows++;
      const key = r.canon_id != null ? r.canon_id : `doc:${r.code}`;
      byBook[key] = (byBook[key] || 0) + 1;
      if (fixedSamples.length < 15) {
        fixedSamples.push({ ref: `${r.code} ${r.chapter}:${r.verse}`, before: r.text.slice(0, 120), after: newText.slice(0, 120) });
      }
      if (APPLY) { upd.run(newText, r.id); fixed++; }
    }
    if (rowAmbiguous) {
      ambiguousRows++;
      if (ambiguousSamples.length < 15) ambiguousSamples.push({ ref: `${r.code} ${r.chapter}:${r.verse}`, text: r.text.slice(0, 140) });
    }
  }
};
if (APPLY) db.transaction(run)(); else run();

console.log(`${scanned} row(s) had a self-referential gloss pattern`);
console.log(`${candidateRows} row(s) matched a KNOWN corruption-prone value (unambiguous single original) — ${APPLY ? 'fixed' : 'would fix'}: ${APPLY ? fixed : candidateRows}`);
console.log(`${ambiguousRows} row(s) had a self-reference for a value with MULTIPLE possible original English words — left alone, needs manual review`);
console.log('\nby book (rows fixed / would-fix):');
for (const [b, n] of Object.entries(byBook).sort((a, b) => b[1] - a[1])) console.log('  ' + String(n).padStart(5) + '  ' + b);

console.log('\nsample repairs:');
for (const s of fixedSamples) {
  console.log(`  [${s.ref}]\n    - ${s.before}\n    + ${s.after}`);
}
if (ambiguousSamples.length) {
  console.log('\nAMBIGUOUS — needs manual review (multiple English words share this transliteration):');
  for (const s of ambiguousSamples) console.log(`  [${s.ref}]\n    ${s.text}`);
}
console.log(APPLY ? '\nDone. Restart the server.' : '\nNo changes written. Re-run with --apply to write the unambiguous fixes.');
db.close();
