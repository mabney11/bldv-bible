// sourceVerseRemap.js — a handful of books have a source-language edition
// whose OWN internal verse numbering doesn't match the display (English)
// numbering it's paired against in Parallel/MultiViewer. Not a bug in this
// app's data — a genuine textual-history divergence between editions. Today
// covers exactly one case; more can be added the same way if another
// book/source pair turns out to need it.
//
// canon_id 139 (2 Esdras / 4 Ezra), chapter 7, Syriac (Peshitta): the
// Peshitta preserves the ~70-verse "Missing Fragment" (Latin/complete
// numbering 7:36-105) that's simply ABSENT from the English KJV-Apocrypha
// text this app uses — it was lost from every Latin manuscript until Robert
// Bensly's 1875 discovery, and English Bible tradition still numbers this
// chapter the old pre-discovery way: verse 35 is immediately followed by
// what the complete/restored numbering (which the Peshitta already used
// natively — Syriac never lost the passage) calls verse 106. Standard
// reference: Bensly & James's 1895 restoration (see e.g. the Revised
// Version 1895 Apocrypha, 2 Esdras 7, footnote at v.35), cross-checked
// 2026-08-31 against THIS app's own ingested text content (not just the
// secondary literature) — content-matched at English v.36 / Syriac v.106
// ("...Abraham prayed first for the Sodomites, and Moses for the fathers
// that sinned...") and end-to-end verse-by-verse through v.69/v.139.
//
// This app's own Syriac ingestion also merges what the complete numbering
// calls verses 139 and 140 into one verse (its own v.139's text runs on
// from "...blot out the multitude of offences" straight into "there would
// be very few left..." with no verse break) — confirmed by reading the
// full, untruncated text of that row. So English 69 AND 70 both point at
// the same Syriac verse 139.
//
// Segment shape: { synFrom: [lo, hi], displayFrom: [lo, hi] | null }.
// `synFrom` = this source's own native verse-number range. `displayFrom` =
// the display (English) verse-number range those correspond to — same
// length as synFrom for a plain offset, SHORTER for a merge (multiple
// native verses -> one display verse, not our case here) or a native verse
// standing for MULTIPLE display verses (our v.139 case), and `null` when
// this native range has no display counterpart at all (content untranslated
// in English — the Missing Fragment itself, synFrom [36,105]).
export const SOURCE_VERSE_REMAP = {
  'SYR:139:7': {
    segments: [
      { synFrom: [36, 105], displayFrom: null },      // the Missing Fragment — no English text exists for these
      { synFrom: [106, 138], displayFrom: [36, 68] },  // +70 offset, restored numbering -> old English numbering
      { synFrom: [139, 139], displayFrom: [69, 70] },  // this app's Syriac merges old-numbering verses 69 & 70 into one row
      // synFrom 1-35 is intentionally absent — those already match English 1-35 1:1, no remap needed.
    ],
  },
};

// Given this source's NATIVE verse number for (corpus, canonId, chapter),
// return the array of DISPLAY (English) verse numbers its content should be
// shown under: usually exactly one number (identity, when no remap table
// exists for this chapter, or the verse falls outside every listed segment);
// TWO numbers for a native verse that stands for more than one display verse
// (a merge, like Syriac 139 above); or an EMPTY array when this native verse
// has no display counterpart at all (e.g. the Missing Fragment) — callers
// should drop that verse's content rather than invent a label for it.
export function remapSourceVerseToDisplay(corpus, canonId, chapter, nativeVerse) {
  const def = SOURCE_VERSE_REMAP[`${corpus}:${canonId}:${chapter}`];
  if (!def) return [nativeVerse];
  for (const seg of def.segments) {
    const [sLo, sHi] = seg.synFrom;
    if (nativeVerse < sLo || nativeVerse > sHi) continue;
    if (!seg.displayFrom) return [];
    const [dLo, dHi] = seg.displayFrom;
    if (dHi - dLo === sHi - sLo) return [dLo + (nativeVerse - sLo)];   // plain 1:1 offset
    const out = [];
    for (let d = dLo; d <= dHi; d++) out.push(d);                      // this one native verse stands for a display range
    return out;
  }
  return [nativeVerse];   // remap table exists for this chapter but doesn't mention this verse — identity fallback
}

// Whether (corpus, canonId, chapter) has any remap table at all — lets a
// caller skip the per-token remap work entirely for the overwhelming
// majority of chapters that don't need it.
export function hasSourceVerseRemap(corpus, canonId, chapter) {
  return !!SOURCE_VERSE_REMAP[`${corpus}:${canonId}:${chapter}`];
}
