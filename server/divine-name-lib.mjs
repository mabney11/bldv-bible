// divine-name-lib.mjs — ONE implementation of "the English divine name must agree with the
// verse's own Hebrew word", shared by fix-divine-names.mjs (repair + gate).
//
// fieldy 2026-10-06, Matthew 1:20: the word-by-word table reads 𐤉𐤄𐤅𐤄 Yahawah (H3068) while the
// reading text said "an angel of the Adanay". The NT baseline (english-nt-baseline.jsonl) already
// carries every "the Lord" as "the Adanay" (sanitize-english's theonym 'Lord' -> Adanay), so no
// render step ever consulted the verse's Hebrew for it. "I dont want to have to be the one who
// finds this mismatched tokens."
//
// Hebrew divine words (spelling, not the Strong's tag — the HEB edition's tags are inferred and a
// tagged "𐤁𐤄𐤅𐤄" is not the Name): [up to 3 proclitic letters] + 𐤉𐤄𐤅𐤄  => Y (Yahawah)
//                                                                  + 𐤀𐤃𐤍𐤉  => A (Adanay)
// English divine words: Yahawah / Adanay, optionally carrying proclitic syllables (WaAdanay,
// LaYahawah), outside every "(gloss)".
//
// Per verse:
//   1. same multiset of Y/A in Hebrew and English            -> agrees, nothing to do
//   2. same COUNT                                            -> the n-th English word takes the
//                                                               n-th Hebrew word's name (both ways)
//   3. Hebrew has Y and no A                                 -> every English Adanay is Yahawah
//   4. anything else                                         -> ambiguous: reported, never rewritten
//      (rule 2's Yahawah -> Adanay direction only with { reverse: true }; fix-divine-names
//       passes it for canon <= 66, the Apocrypha's Hebrew is a retranslation)
// "the Lord" -> "Yahawah" drops the article ("an angel of the Adanay" -> "an angel of Yahawah"),
// exactly as render-corpus's THEONYMS does for 'the LORD'. One word for one word otherwise, so
// translation_links english_indices stay valid (dropping "the" is reported via `shifts`).

const PRO = '𐤅𐤄𐤁𐤋𐤌𐤊𐤔';
const YW = '𐤉𐤄𐤅𐤄', AD = '𐤀𐤃𐤍𐤉';

export function hebKind(word) {
  let w = String(word || '');
  for (let i = 0; i < 3; i++) {
    if (w === YW) return 'Y';
    if (w === AD) return 'A';
    const ch = [...w][0];
    if (!ch || !PRO.includes(ch)) return null;
    w = [...w].slice(1).join('');
  }
  return w === YW ? 'Y' : w === AD ? 'A' : null;
}

// Hebrew divine words of a verse, in order. tokens: [{word_raw}] already ordered.
export const hebDivine = (tokens) => tokens.map(t => hebKind(t.word_raw)).filter(Boolean);

// English divine words: walk the verse with the SAME tokeniser translation_links' word indices use
// (name-form-lib TOK: words + parentheses). Only depth-0 words count — a word inside a "(gloss)" is
// never counted or touched. Adanay / Yahawah may carry glued proclitic syllables (WaAdanay) and a
// straight-quote possessive ("Adanay's"); Adanayah / Yahawadah etc. are other words.
const TOK = /[A-Za-zÀ-ɏ'-]+|\(|\)/g;
const WORD_RE = /^((?:Wa|Ha|Ba|La|Ma|Ka|Sha)*)(Adanay|Yahawah)((?:'s)?)$/;
const kindOf = (name) => (name === 'Yahawah' ? 'Y' : 'A');
const nameOf = (k) => (k === 'Y' ? 'Yahawah' : 'Adanay');

function scan(text) {
  const toks = [...text.matchAll(TOK)];
  const found = [];
  let depth = 0, wordIx = -1, prev = null;                       // prev: previous depth-0 word token
  for (const m of toks) {
    const w = m[0];
    if (w === '(') { depth++; prev = null; continue; }
    if (w === ')') { depth = Math.max(0, depth - 1); prev = null; continue; }
    wordIx++;
    if (!depth) {
      const d = WORD_RE.exec(w);
      if (d) found.push({ m, wordIx, pre: d[1], kind: kindOf(d[2]), poss: d[3], prev });
      prev = { m, wordIx, w };
    } else prev = null;
  }
  return found;
}

export const engDivine = (text) => scan(text || '').map(f => f.kind);
const sameMultiset = (a, b) => a.length === b.length && [...a].sort().join('') === [...b].sort().join('');

// Returns { fixed, hits:[{text,fix}], drops:[wordIx of a dropped "the"], status }
//   status: 'ok' | 'fixed' | 'ambiguous' | 'none' (no Hebrew divine word / no English one)
export function checkDivine(text, hebKinds, { reverse = true } = {}) {
  const none = { fixed: text, hits: [], drops: [], status: 'none' };
  if (!text || !hebKinds.length) return none;
  const F = scan(text);
  if (!F.length) return none;
  const E = F.map(f => f.kind);
  if (sameMultiset(E, hebKinds)) return { ...none, status: 'ok' };
  let target = null;
  if (E.length === hebKinds.length) target = hebKinds;                                  // rule 2
  else if (!hebKinds.includes('A') && hebKinds.includes('Y')) target = E.map(() => 'Y'); // rule 3
  // every English divine word is a name the Hebrew has (Hebrew [A], English "Adanay ... Adanay"): nothing to say
  if (!target && E.every(k => hebKinds.includes(k))) return { ...none, status: 'ok' };
  // Yahawah -> Adanay only where the caller trusts the Hebrew that far (the canonical NT, not the
  // Apocrypha's retranslated Hebrew); otherwise it is listed, not rewritten.
  if (target && !reverse && F.some((f, i) => f.kind === 'Y' && target[i] === 'A')) target = null;
  if (!target) return { ...none, status: 'ambiguous' };
  const hits = [], drops = [];
  let out = '', last = 0;
  F.forEach((f, i) => {
    if (f.kind === target[i]) return;
    let start = f.m.index;
    const now = f.pre + nameOf(target[i]) + f.poss;
    // "the Lord" -> "Yahawah": swallow the bare article right before it (one space between),
    // as render-corpus's THEONYMS does for 'the LORD'. Adanay keeps the NT's own "the Adanay".
    if (target[i] === 'Y' && !f.pre && f.prev && /^[Tt]he$/.test(f.prev.w) && text.slice(f.prev.m.index + 3, f.m.index) === ' ' && f.prev.m.index >= last) {
      start = f.prev.m.index; drops.push(f.prev.wordIx);
    }
    out += text.slice(last, start) + now;
    last = f.m.index + f.m[0].length;
    hits.push({ text: text.slice(start, last), fix: now });
  });
  if (!hits.length) return { ...none, status: 'ok' };     // e.g. Hebrew [Y] over English Yahawah x2: already all Yahawah
  out += text.slice(last);
  return { fixed: out, hits, drops, status: 'fixed' };
}

/** english_indices after dropping the words at `drops`: a link that sat on a dropped "the" moves to the
 *  word that takes its place (the Yahawah that replaced "the Adanay"); the rest close up. Deduplicated. */
export function dropIndices(indices, drops) {
  const out = [];
  for (const ix of indices) {
    const n = ix - drops.filter(x => x < ix).length;
    if (!out.includes(n)) out.push(n);
  }
  return out;
}
