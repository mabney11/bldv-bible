'use strict';
// ONE copy: the site's verse numbers (English, what the URL, translation.db, the Studio and
// /api/tokens use) vs the Masoretic numbers corpus.db ENG and tokens_bhs are stored under.
// Same rules as server.js ENG_CHAPTER_SEGMENTS / VERSIFICATION_MAP (KEEP IN SYNC):
//   - versification-differences.json entries move a Hebrew verse to its English chapter:verse;
//     a "merge" segment has no English verse of its own (it is folded into another);
//   - Malachi: English 4:1-6 = Hebrew 3:19-24, and the site's Malachi 3 still lists 19-24 too;
//   - Joel, Psalms and every chapter not listed: the same number.
// fieldy 2026-11-18 (Hosea 2:11 showed 2:9's English over 2:13's Hebrew): "I expect strictly
// the hebrew words with appropriate glosses in english ... I dont want to encounter it in other places".
const fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, 'versification-differences.json');
const m2e = new Map(), e2m = new Map(), merged = new Set();
const k = (b, c, v) => `${b}|${c}|${v}`;
for (const [key, ents] of Object.entries(JSON.parse(fs.readFileSync(FILE, 'utf8')).differences)) {
  const [b, h] = key.split(':').map(Number);
  for (const e of ents) for (let hv = e.heb[0], i = 0; hv <= e.heb[1]; hv++, i++) {
    if (e.merge) { merged.add(k(b, h, hv)); continue; }
    const to = [b, e.engChapter, e.eng[0] + i];
    if (to[1] === h && to[2] === hv) continue;
    m2e.set(k(b, h, hv), [to]);
    e2m.set(k(...to), [b, h, hv]);
  }
}
for (let v = 19; v <= 24; v++) { m2e.set(k(39, 3, v), [[39, 3, v], [39, 4, v - 18]]); e2m.set(k(39, 4, v - 18), [39, 3, v]); }
// Every site key a Masoretic verse is shown under ([] = none of its own).
function mtToSite(b, c, v) {
  b = +b; c = +c; v = +v;
  const key = k(b, c, v);
  if (merged.has(key)) return [];
  return m2e.get(key) || [[b, c, v]];
}
// The Masoretic verse a site key shows.
function siteToMt(b, c, v) {
  b = +b; c = +c; v = +v;
  return e2m.get(k(b, c, v)) || [b, c, v];
}
// True when the site key and the Masoretic key differ for this verse.
const moves = (b, c, v) => !!e2m.get(k(+b, +c, +v));
// Does the site show this number at all? (Hosea 2:24 is Hebrew-only: its verse is the site's 2:22.)
const siteShows = (b, c, v) => { const key = k(+b, +c, +v); return e2m.has(key) || (!m2e.has(key) && !merged.has(key)) || (m2e.get(key) || []).some(x => k(...x) === key); };
module.exports = { mtToSite, siteToMt, moves, siteShows };
