// Which Strong's numbers a word block shows (fieldy, 2026-10-14, Habakkuk 2:3: "There is no
// strongs link for 'Am' or 'kay' here ... They must all be visible that way I can modify any
// word within my app").
//
// A display block can hold SEVERAL corpus tokens: a standalone particle folded onto its host
// (כִּי־בֹא = Kay H3588 + Bawaa H935), a maqaf compound, a conjunction + verb. The server sends
// every one of them in `sourceTokens` ({token_ordinal, word_raw, strongs}), and each component
// carries the token_ordinal it came from. Badges are taken from THOSE, never from the block's
// single head `strongs`, so no token's number can disappear behind its neighbour's.

export const fmtSN = sn => (sn ? 'H' + String(sn).replace(/^[Hh]+/, '') : '');
// H9000+ are grammar codes (connectors, prepositions, articles) with no root page.
export const isVirtualSN = sn => {
  const n = parseInt(String(sn).replace(/^[Hh]/, ''), 10);
  return !isNaN(n) && n >= 9000;
};

/** the source tokens these components came from, matched by token_ordinal (not position) */
export function tokensOfComps(comps, sourceTokens) {
  const src = sourceTokens || [];
  const ords = new Set((comps || []).filter(c => c && !c.isMark && c.token_ordinal != null).map(c => c.token_ordinal));
  return src.filter(t => ords.has(t.token_ordinal));
}

/** every Strong's number of these tokens, in order, deduplicated. Grammar codes (H9xxx) are
 *  shown only when the tokens carry nothing else (a bare 𐤅 still shows its H9000). */
export function badgeSNs(tokens, fallbackSN) {
  const all = [];
  for (const t of tokens || []) { const s = fmtSN(t.strongs); if (s && !all.includes(s)) all.push(s); }
  if (!all.length && fallbackSN) all.push(fmtSN(fallbackSN));
  const real = all.filter(s => !isVirtualSN(s));
  return real.length ? real : all.slice(0, 1);
}

// EVIDENCE (2026-10-29, server/heb-evidence.cjs). A HEB-edition (NT / Apocrypha) Strong's is
// inferred from the spelling; the index records how it was established. 'guess' and 'unconfirmed'
// are drawn marked ("H6862?", dashed) so an inference the verse's English never confirmed is never
// presented like a tag the source itself carries. fieldy: "harden so i dont advertise tokens that
// arent there".
export const UNCONFIRMED = new Set(['guess', 'unconfirmed']);
const EV_WHY = {
  guess: 'other readings of this spelling exist and this verse\'s English names none of them',
  unconfirmed: 'the only reading of this spelling, and this verse\'s English does not name it',
};
/** the weakest evidence among these tokens for this Strong's ('guess'/'unconfirmed'/null) */
export function snEvidence(tokens, sn) {
  let ev = null;
  for (const t of tokens || []) {
    if (fmtSN(t.strongs) !== fmtSN(sn) || !t.evidence) continue;
    if (t.evidence === 'guess') return 'guess';
    if (t.evidence === 'unconfirmed') ev = 'unconfirmed';
  }
  return ev;
}
export function snTitle(sn, ev) {
  return ev && EV_WHY[ev] ? `${sn} — not confirmed: ${EV_WHY[ev]}. Explore root ${sn}` : `Explore root ${sn}`;
}
