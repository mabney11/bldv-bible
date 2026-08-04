// render-verse-exceptions.mjs -- permanent, data-driven guard against false-positive
// renders in specific verses.
//
// WHY THIS EXISTS
//   render-corpus.mjs's theonym pass is a blanket find/replace (e.g. "GOD" -> "Yahawah",
//   sourced from name-map-expanded.json). That's correct almost everywhere, but source
//   texts occasionally use a theonym-shaped word for a reason that has nothing to do with
//   naming God -- e.g. Apocalypse of Abraham 5:4 has an idol's carved name rendered in
//   caps ("on his forehead was written: GOD BARISAT"), which is epigraphic styling, not a
//   reference to YHWH. The blanket rule turned that into "Yahawah BARISAT".
//
//   Fixing the live corpus.db row doesn't stick: render-all.mjs / render-corpus.mjs
//   --from-src --apply re-renders NT+Apocrypha from the read-only text_src snapshot on
//   every baseline reset, so any manual DB edit is silently wiped out the next time
//   someone resets. The fix has to live in the render pipeline itself.
//
// HOW IT WORKS
//   Each exception names an exact literal phrase in one specific verse (canon_id:chapter:
//   verse, matching the verses table's raw TEXT chapter/verse columns). Before that verse's
//   source text reaches ANY render pass, the phrase is swapped for an opaque placeholder;
//   after every pass runs, the placeholder is swapped back for the untouched original
//   phrase. So the protection is total and rule-agnostic -- it doesn't matter which pass
//   would have touched the phrase, or whether a future rule change would too.
//
// ADDING A NEW EXCEPTION
//   Append an entry to render-verse-exceptions.json:
//     { "ref": "<canon_id>:<chapter>:<verse>", "phrase": "<exact substring>", "reason": "..." }
//   No code change needed. Re-run render-all.mjs --surface (or render-corpus.mjs
//   --from-src --apply) to pick it up.

import { existsSync, readFileSync } from 'node:fs';

// render-corpus.mjs's own passes use char code 0 (gloss guard) and char code 1
// (verse-gloss guard) as sentinel bytes around protected spans. This uses char code 2 --
// distinct from both, and never legal in source verse text -- so this placeholder can
// never collide with content those passes emit.
const PLACEHOLDER_CHAR = String.fromCharCode(2);

/** Load exceptions.json -> Map<ref, string[]> (phrases to protect, longest-first so a
 *  longer phrase is swapped out before a shorter one that might be its substring). */
export function loadVerseExceptions(path) {
  const byRef = new Map();
  if (!existsSync(path)) return byRef;
  let data;
  try { data = JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { throw new Error('render-verse-exceptions.mjs: could not parse ' + path + ': ' + e.message); }
  for (const e of data.exceptions || []) {
    if (!e || !e.ref || !e.phrase) continue;
    if (!byRef.has(e.ref)) byRef.set(e.ref, []);
    byRef.get(e.ref).push(e.phrase);
  }
  for (const phrases of byRef.values()) phrases.sort((a, b) => b.length - a.length);
  return byRef;
}

/**
 * Run `renderFn(text)` over `text`, but guarantee every protected phrase for `ref`
 * (per `byRef`, as returned by loadVerseExceptions) passes through byte-for-byte
 * unchanged, regardless of what renderFn does.
 *
 * If a protected phrase isn't found in the text verbatim (source wording changed
 * upstream), it's silently skipped -- nothing to protect, nothing to restore, and
 * renderFn still runs normally on the rest of the text.
 */
export function renderWithExceptions(text, ref, byRef, renderFn) {
  const phrases = byRef.get(ref);
  if (!phrases || !phrases.length) return renderFn(text);

  let guarded = text;
  const restore = [];
  for (const phrase of phrases) {
    const idx = guarded.indexOf(phrase);
    if (idx === -1) continue;
    const token = PLACEHOLDER_CHAR + restore.length + PLACEHOLDER_CHAR;
    guarded = guarded.slice(0, idx) + token + guarded.slice(idx + phrase.length);
    restore.push(phrase);
  }
  if (!restore.length) return renderFn(text);

  let out = renderFn(guarded);
  for (let i = 0; i < restore.length; i++) {
    out = out.split(PLACEHOLDER_CHAR + i + PLACEHOLDER_CHAR).join(restore[i]);
  }
  return out;
}
