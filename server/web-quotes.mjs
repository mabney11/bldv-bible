// web-quotes.mjs — put the WEB's quotation marks back onto a rendered verse.
//
// The OT reading text is rendered from web-strongs.jsonl, a scrape of an
// interlinear page whose quotation marks are unreliable: closers stripped at
// verse ends, openers missing before direct speech, paragraph re-openers gone
// (see the 2026-08-22 entry in CLAUDE.md for the two fixes already made to
// apply-web-strongs.mjs — and the QUOTE-PROOFREAD.md scan of 2026-09-12 that
// still found ~950 OT verses whose marks disagree with the clean WEB text).
// english-web-raw.jsonl IS the clean WEB. This module aligns a rendered verse
// against it word by word and rebuilds the verse's quote marks from the WEB's,
// so a quotation opens and closes exactly where the WEB says it does, with the
// WEB's own curly glyphs (see toDb for why not straight quotes).
//
//   restoreWebQuotes(rendered, web) -> { text, changed, aligned }
//     rendered: the reading text ("Paraih (Pharaoh) said, "I will shalach …")
//     web:      the WEB verse ("Pharaoh said, “I will let you go …")
//     aligned:  false when the two do not look like the same verse (numbering
//               drift — Joel, Micah, Exodus 22 keep the Masoretic numbers —
//               or a hand rewrite); the text is then returned untouched.
//
// Alignment: both sides are cut into units (a word plus any "(gloss)" glued
// to it on the rendered side); units are matched on their bare word (quotes
// and punctuation stripped, lower-cased) with a longest-common-subsequence,
// which tolerates the rendered side's transliterated heads ("Paraih" for
// "Pharaoh") as unmatched gaps. Every leading/trailing quote glyph on a WEB
// unit is then carried to the rendered unit the match maps it to; the
// rendered side's own boundary glyphs are discarded first (apostrophes inside
// a word — don't, Yahawah’s — are never touched). A verse whose plain English
// words are less than 40% found in the WEB verse is treated as not aligned (the
// verse numbering is mapped by the caller, so this only guards a hand rewrite).

const GLYPH = /["“”‘’']/;
const LEAD = /^["“”‘’']+/;
// everything after the unit's last word character (or its gloss): the tail
// mixes closing glyphs and punctuation in either order — `master.”`, `Yahweh”.`,
// `garden’?”` — and is rebuilt from the WEB's tail with the unit's own
// punctuation kept (see rebuildTail)
const TAIL = /[^\w)]*$/;
// a word, its glued "(gloss)" if any, and whatever punctuation/glyphs follow the
// gloss; a dash joins two units (`camels,”—let`) and splits here
const UNIT_RE = /[^\s(—–]+(?:\s*\((?:[^()]|\([^()]*\))*\))?[^\s(—–]*/g;
const GLOSS_RE = /\s*\((?:[^()]|\([^()]*\))*\)/g;

// The WEB's curly glyphs are kept: an opener and a closer are different
// characters, so the reader never has to guess which way a mark faces (a
// straight " toggles, and one lost mark flips every quote after it — the
// failure the 600-character dissolve in Reader.jsx exists to contain). Measured
// 2026-09-12 over the whole OT: curly output leaves 41 dissolved spans and the
// WEB's own chapter structure; straight output 60 and more mis-toggles. Only
// a straight ' (a scraped single-quote closer) is normalised, to ’.
function toDb(ch) {
  if (ch === "'") return '’';
  return ch;
}
function core(unit) {
  return unit.replace(GLOSS_RE, '').replace(/["“”‘’']/g, '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}
function units(text) { return text.match(UNIT_RE) || []; }
// The WEB sets nested closers apart with spaces (`place.’ ” ’ ”`) and opens a
// paragraph-inside-a-quote as `“ ‘Six days…`: fold a glyph-only unit into its
// neighbour — closers onto the unit before, openers onto the unit after — so
// every glyph belongs to a real word before alignment.
function foldGlyphUnits(us) {
  const out = [];
  let pendingLead = '';
  for (const u of us) {
    if (/^["“”‘’']+$/.test(u)) {
      if (/^[“‘]+$/.test(u) || !out.length) pendingLead += u;
      else out[out.length - 1] += u;
      continue;
    }
    out.push(pendingLead + u); pendingLead = '';
  }
  if (pendingLead && out.length) out[out.length - 1] += pendingLead;
  return out;
}

// LCS on the bare words -> array of [i, j] matched pairs.
function lcsPairs(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = (a[i] && a[i] === b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] && a[i] === b[j]) { pairs.push([i, j]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

export function restoreWebQuotes(rendered, web) {
  if (!rendered || !web) return { text: rendered, changed: false, aligned: false };
  const du = units(rendered), wu = foldGlyphUnits(units(web));
  const dc = du.map(core), wc = wu.map(core);
  const pairs = lcsPairs(dc, wc);
  // aligned? plain (unglossed) rendered words mostly present in the WEB verse
  const heads = new Set();
  for (const u of du) { const m = /^["“”‘’']*([A-Za-z][A-Za-z\-']*)\s*\(/.exec(u); if (m) heads.add(m[1].toLowerCase()); }
  const plain = dc.filter((w, i) => w && !heads.has(w) && !/\(/.test(du[i]));
  const wset = new Set(wc);
  // (a name list — "Chesed, Hazo, Pildash…" — has no plain words at all; then
  // the unit counts have to agree instead)
  const ratio = du.length / Math.max(1, wu.length);
  if (plain.length < 3 ? (ratio < 0.6 || ratio > 1.6) : plain.filter(w => wset.has(w)).length / plain.length < 0.4) {
    return { text: rendered, changed: false, aligned: false };
  }
  // WEB unit j -> rendered unit index. Matched units map directly; an unmatched
  // WEB unit rides along with the nearest match before it (same offset).
  const w2d = new Array(wu.length);
  let pi = 0;
  for (let j = 0; j < wu.length; j++) {
    while (pi < pairs.length && pairs[pi][1] < j) pi++;
    if (pi < pairs.length && pairs[pi][1] === j) { w2d[j] = pairs[pi][0]; continue; }
    const prev = pi > 0 ? pairs[pi - 1] : null, next = pi < pairs.length ? pairs[pi] : null;
    if (prev) w2d[j] = Math.min(prev[0] + (j - prev[1]), next ? next[0] - 1 : du.length - 1);
    else if (next) w2d[j] = Math.max(0, next[0] - (next[1] - j));
    else w2d[j] = Math.min(j, du.length - 1);
    if (w2d[j] < 0) w2d[j] = 0;
  }
  const lead = du.map(() => ''), webTail = du.map(() => null);
  for (let j = 0; j < wu.length; j++) {
    const lm = LEAD.exec(wu[j]);
    // the verse's first opener belongs on its first word and the last closer on
    // its last, whatever the alignment says about a differing first/last word
    if (lm) lead[j === 0 ? 0 : w2d[j]] += lm[0].split('').map(toDb).join('');
    const tail = TAIL.exec(wu[j].replace(LEAD, ''))[0];
    if (GLYPH.test(tail)) {
      const i = j === wu.length - 1 ? du.length - 1 : w2d[j];
      webTail[i] = (webTail[i] || '') + tail;
    }
  }
  // The unit's new tail: the WEB tail's glyphs in the WEB's order, with the
  // unit's own punctuation standing in for the WEB's (`priest):` stays `:` even
  // where the WEB has `priest.”`); with no WEB glyphs the unit just loses its
  // own boundary glyphs.
  const rebuildTail = (own, web) => {
    const ownPunct = own.replace(/["“”‘’']/g, '').split('');
    if (web == null) return ownPunct.join('');
    let out = '';
    for (const ch of web) {
      if (GLYPH.test(ch)) out += toDb(ch);
      else out += ownPunct.length ? ownPunct.shift() : ch;
    }
    return out + ownPunct.join('');
  };
  const out = du.map((u, i) => {
    const s = u.replace(LEAD, '');
    const tm = TAIL.exec(s);
    return lead[i] + s.slice(0, tm.index) + rebuildTail(tm[0], webTail[i]);
  });
  // Rejoin with the original whitespace between units.
  let text = '', pos = 0, k = 0;
  UNIT_RE.lastIndex = 0;
  let m;
  while ((m = UNIT_RE.exec(rendered))) {
    text += rendered.slice(pos, m.index) + out[k++];
    pos = m.index + m[0].length;
  }
  text += rendered.slice(pos);
  return { text, changed: text !== rendered, aligned: true };
}
