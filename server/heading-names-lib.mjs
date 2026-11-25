// heading-names-lib.mjs — the names in Part/Section/Chapter/Pericope headings written the way the
// reading text writes them (fieldy, 2026-11-22, Ezekiel 36 "The Mountains of Yasharaal Restored":
// "Yashar-Al should always be that in my app ... fix the subtitles across the board").
// ONE function, used by fix-heading-names.mjs (headings table) and its --seed-files pass.
//   1. compound names (lexicon/compound-hyphenation.json, name-form-lib's rule): Yasharaal -> Yashar-Al,
//      also with a possessive ("Yasharaal's") and glued proclitics; a tombstone hyphenation goes back.
//   2. retired spellings (lexicon/reading-form-rules.json): Abayanaw -> Abanaw.
//   3. an English name the reading text writes in Hebrew (name-map-expanded.json): Israel -> Yashar-Al,
//      Jesus -> Yashawai — only when that spelling is in the reading text at least MIN_USES times, and
//      not a word lexicon/heading-names.json keeps in English (Temple, Sabbath, …).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRules } from './name-form-lib.mjs';
import { respellRetired } from './modform-lib.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POSS = '';   // stands in for the apostrophe of "'s" while name-form-lib's regexes run (they stop at "'")
export const MIN_USES = 20;

export function makeHeadingFixer(textCounts /* Map word -> uses in the reading text */) {
  const R = loadRules();
  let keep = new Set();
  try { keep = new Set(JSON.parse(readFileSync(path.join(__dirname, 'lexicon', 'heading-names.json'), 'utf8')).keepEnglish || []); } catch { /* none */ }
  const uses = w => textCounts.get(w) || 0;
  const english = new Map();   // English name -> the app's spelling, as the reading text writes it
  for (const [k, v] of [...R.bare, ...R.phrases]) {
    if (keep.has(k) || !v || v === k) continue;
    const to = R.hyphenTo.get(v) || v;   // the map may still hold the joined form
    if (to.split(/\s+/).every(p => uses(p) >= MIN_USES)) english.set(k, to);
  }
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const engRe = english.size ? new RegExp(`(?<![A-Za-z'-])(${[...english.keys()].sort((a, b) => b.length - a.length).map(esc).join('|')})(?![A-Za-z-])`, 'g') : null;
  return function fix(s) {
    const hits = [];
    if (!s) return { text: s, hits };
    let x = String(s).replace(/([A-Za-z])['’]s\b/g, `$1${POSS}s`);
    if (R.unhyphenRe) x = x.replace(R.unhyphenRe, (m, pre, n) => { const to = pre + (R.unhyphenTo.get(n) || n); if (to !== m) hits.push([m, to, 'hyphen tombstone']); return to; });
    if (R.hyphenRe) x = x.replace(R.hyphenRe, (m, pre, n) => { const to = pre + (R.hyphenTo.get(n) || n); if (to !== m) hits.push([m, to, 'compound name']); return to; });
    { const y = respellRetired(x); if (y !== x) hits.push([x, y, 'retired spelling']); x = y; }
    if (engRe) x = x.replace(engRe, m => { const to = english.get(m); hits.push([m, to, 'English name']); return to; });
    x = x.split(POSS).join("'");
    return { text: x, hits };
  };
}
