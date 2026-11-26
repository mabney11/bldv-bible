'use strict';
// ONE copy: the site's verse numbers (MODERN / English — what the URL, translation.db, the Studio and /api/tokens use) vs
// the Masoretic numbers corpus.db ENG and tokens_bhs are stored under. Read from versification-differences.json — server.js
// builds its token segments from the same file (KEEP THE TWO READERS IN STEP).
// fieldy 2026-11-18 (Hosea 2:11 showed 2:9's English over 2:13's Hebrew): "I expect strictly the hebrew words with
// appropriate glosses in english ... I dont want to encounter it in other places".
// fieldy 2026-11-26: "I dont want differences unless something is completely dropped -- if all the words are there, lets
// use the modern numbers". So besides plain moves the file has:
//   - "merge": "end"|"start" — a Hebrew verse FOLDED into an English verse (1 Samuel 21:1 -> 20:42, Numbers 25:19 -> 26:1,
//     1 Kings 22:44 -> 22:43, 1 Chronicles 12:5 -> 12:4): the English verse is its own Hebrew verse + the folded one;
//   - "words"/"pairs" — a SPLIT Hebrew verse (Isaiah 63:19 = English 63:19 + 64:1): each English verse takes a word range
//     of the Hebrew verse and the matching reading-text pairs [from, to);
//   - "added" — an English verse with NO Hebrew (Nehemiah 7:68): its text is its parallel's (Ezra 2:66).
// Joel and Malachi are ordinary entries now (the old special cases are retired).
const fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, 'versification-differences.json');
const k = (b, c, v) => `${b}|${c}|${v}`;
const unk = key => key.split('|').map(Number);

const DATA = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const m2e = new Map();    // MT key -> [site key …]  (only MT verses that are NOT simply shown under their own number)
const e2src = new Map();  // site key -> [{b,c,v,role,at?,words?,pairs?}]  (explicit sources only)
const ADDED = new Map();  // site key -> { parallel:[b,c,v], note }
const push = (m, key, x) => { if (!m.has(key)) m.set(key, []); m.get(key).push(x); };

for (const [key, ents] of Object.entries(DATA.differences || {})) {
  const [b, h] = key.split(':').map(Number);
  for (const e of ents) for (let hv = e.heb[0], i = 0; hv <= e.heb[1]; hv++, i++) {
    const site = [b, e.engChapter, e.eng[0] + i];
    const src = { b, c: h, v: hv, role: e.merge ? 'fold' : (e.words ? 'part' : 'move') };
    if (e.merge) src.at = e.merge === 'start' ? 'start' : 'end';
    if (e.words) { src.words = e.words; src.pairs = e.pairs || null; }
    if (src.role === 'move' && site[1] === h && site[2] === hv) continue;   // listed but not moved
    push(e2src, k(...site), src);
    push(m2e, k(b, h, hv), site);
  }
}
for (const [key, a] of Object.entries(DATA.added || {})) {
  const [b, c, v] = key.split(':').map(Number);
  ADDED.set(k(b, c, v), a);
  e2src.set(k(b, c, v), [{ b: a.parallel[0], c: a.parallel[1], v: a.parallel[2], role: 'added' }]);
  // the parallel's own verse first, then the added verse that borrows its text
  const pk = k(...a.parallel);
  if (!m2e.has(pk)) m2e.set(pk, [a.parallel.slice()]);
  m2e.get(pk).push([b, c, v]);
}

// The Masoretic verses (and word ranges) a site verse shows, in reading order. [] = the site has no such verse.
function siteSources(b, c, v) {
  b = +b; c = +c; v = +v;
  const key = k(b, c, v);
  const ex = (e2src.get(key) || []).slice();
  if (ex.some(s => s.role === 'added')) return ex;
  const hasMain = ex.some(s => s.role === 'move' || s.role === 'part');
  // the verse with the same numbers stands under its own number unless it was moved away (or folded / split)
  const movedAway = m2e.has(key) && !m2e.get(key).some(s => k(...s) === key);   // Ezra 2:66 lends its text and stays
  if (!hasMain && !movedAway) ex.push({ b, c, v, role: 'self' });
  if (!ex.some(s => s.role !== 'fold')) return [];   // only folds and no verse of its own — cannot happen in the file
  const rank = s => s.role === 'fold' ? (s.at === 'start' ? 0 : 2) : 1;
  return ex.sort((x, y) => rank(x) - rank(y));
}
// Every site key a Masoretic verse is shown under (a folded verse: its host; a split verse: both parts; Ezra 2:66 also
// Nehemiah 7:68).
function mtToSite(b, c, v) {
  b = +b; c = +c; v = +v;
  return (m2e.get(k(b, c, v)) || [[b, c, v]]).map(x => x.slice());
}
// The MAIN Masoretic verse a site key shows (a folded host: its own verse; an added verse: its parallel).
function siteToMt(b, c, v) {
  const src = siteSources(b, c, v);
  const main = src.find(s => s.role !== 'fold') || src[0];
  return main ? [main.b, main.c, main.v] : [+b, +c, +v];
}
// True when the site key shows anything but the whole Masoretic verse with the same numbers.
const moves = (b, c, v) => { const s = siteSources(b, c, v); return !(s.length === 1 && s[0].role === 'self'); };
// Does the site show this number at all?
const siteShows = (b, c, v) => siteSources(b, c, v).length > 0;
const addedVerse = (b, c, v) => ADDED.get(k(+b, +c, +v)) || null;

// The reading-text pairs of a text ("Form (gloss) Form (gloss) …"), each with the punctuation after it.
function textPairs(text) {
  const t = String(text || ''); const starts = []; const RE = /[^\s()]+\s+\(/g; let m;
  while ((m = RE.exec(t))) {
    let d = 1, j = RE.lastIndex; for (; j < t.length && d; j++) { if (t[j] === '(') d++; else if (t[j] === ')') d--; }
    starts.push(m.index); RE.lastIndex = j;
  }
  // anything before the first pair (an opening quote) stays with it; punctuation after a pair stays with that pair
  return starts.map((s, i) => t.slice(i ? s : 0, i + 1 < starts.length ? starts[i + 1] : t.length).trim());
}
// The pairs [from, to) of a verse text; a part that does not end the verse gets a full stop.
function slicePairs(text, [from, to]) {
  const pairs = textPairs(text);
  if (!pairs.length) return from === 0 ? String(text || '') : '';
  let s = pairs.slice(from, to).join(' ').trim();
  if (s && to < pairs.length && !/[.!?;:]["”’']?$/.test(s)) s = s.replace(/[,]$/, '') + '.';
  return s;
}
// A site verse's text from the Masoretic texts (textOf(b,c,v) -> string).
function composeText(b, c, v, textOf) {
  return siteSources(b, c, v).map(s => {
    let t = String(textOf(s.b, s.c, s.v) || '').trim();
    if (s.pairs) t = slicePairs(t, s.pairs);
    return t;
  }).filter(Boolean).join(' ');
}
// Every site key whose text uses more than one source or part of one (the writers compose these).
const composedKeys = () => [...e2src.keys()].map(unk).filter(([b, c, v]) => {
  const s = siteSources(b, c, v); return s.length > 1 || s.some(x => x.pairs || x.role === 'added');
});

module.exports = { mtToSite, siteToMt, moves, siteShows, siteSources, composeText, slicePairs, textPairs, addedVerse, composedKeys, DATA };
