// sourceVerseRemap.js — a handful of books have a source-language edition
// whose OWN internal chapter and/or verse numbering doesn't match the display
// (English) numbering it's paired against in Reader/Parallel/MultiViewer. Not
// a bug in this app's data — a genuine textual-history divergence between
// editions. Verse-level divergence (within a matching chapter number) is
// SOURCE_VERSE_REMAP / remapSourceVerseToDisplay / remapDisplayVerseToSource;
// whole-chapter divergence is SOURCE_CHAPTER_REMAP / remapDisplayChapterToSource
// / remapSourceChapterToDisplay, further down this file. More can be added
// the same way if another book/source pair turns out to need it.
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

  // canon_id 139, chapter 7, Hebrew (Kahana 1936, "חזון עזרא" / "Vision of
  // Ezra", his own chapter 5 -- Kahana's chapters run 2 behind the English
  // display numbering throughout this book [his ch.N = display ch. N+2],
  // EXCEPT this one chapter, because his source also preserves the complete/
  // restored 1-140 numbering for the Missing Fragment natively, exactly like
  // the Syriac above -- content-matched 2026-08-31 at the same boundary the
  // Syriac note describes (Hebrew v.106 opens "ויען ויאמר ואיככה זה נמצא
  // לפנים את אברהם מתפלל..." = "...how is it found that Abraham prayed
  // first..." — the identical English v.36 / Syriac v.106 anchor point).
  // This ingestion's own Hebrew chapter 5 also stops at v.139 with no v.140
  // (same merge-of-139/140-into-one-row pattern as the Syriac ingestion),
  // so the segment shape is identical to the Syriac entry above.
  'HEB:139:7': {
    segments: [
      { synFrom: [36, 105], displayFrom: null },
      { synFrom: [106, 138], displayFrom: [36, 68] },
      { synFrom: [139, 139], displayFrom: [69, 70] },
      // synFrom 1-35 intentionally absent -- identity match with English 1-35.
    ],
  },

  // canon_id 81 (1 Esdras), Ge'ez (BETMAS: LIT1376Apocal, formerly its own
  // standalone canon_id 90 "1 Esdras (Ge'ez)" -- merged into 81 2026-09 to
  // sit alongside the ENG/HEB/LXX/SYR editions of the same book). This
  // edition's own chapter numbering has no chapter 1 at all and runs ONE
  // CHAPTER AHEAD of the other editions for the rest of the book (its ch.2 =
  // display ch.1, ... its ch.10 = display ch.9) -- see
  // remapDisplayChapterToSource/remapSourceChapterToDisplay below for that
  // half of the fix. On top of the chapter offset, most chapters also verse-
  // align 1:1 once shifted, but two of the nine (native ch.9 and ch.10, i.e.
  // display ch.8 and ch.9) have real internal split/merge points and one
  // native-numbering gap each. Every segment below is content-verified,
  // reading the Ge'ez against the English King-James-Apocrypha-style text
  // verse by verse (the same rigor as the 2 Enoch / Testament of Job re-keys)
  // -- see project memory for the full verse-by-verse writeup. Segment keys
  // here use the DISPLAY chapter number (matching how Reader.jsx/Parallel.jsx
  // already call remapSourceVerseToDisplay with the display chapter as `c`);
  // synFrom ranges inside each entry are this edition's own NATIVE verse
  // numbers for that (now-shifted) chapter.

  // Native ch.3 -> display ch.2. One 2-native-to-1-display merge: native
  // v.30 ("...the letter was read...began to hinder the builders") and v.31
  // ("...the building ceased until the second year of Darius") are one
  // combined English verse (v.30, the chapter's last). v.1-29 are already
  // identity (no segment needed -- the default passthrough handles them).
  'GEZ:81:2': {
    segments: [
      { synFrom: [30, 31], displayFrom: [30, 30] },
    ],
  },

  // Native ch.9 -> display ch.8 (Ezra's genealogy, the king's letter, and the
  // ~70-entry list of returning families). The most structurally complex
  // chapter in the book: the offset drifts from 0 up to +3 and back down to
  // +1 across five separate split/merge/gap points before settling for the
  // rest of the chapter.
  'GEZ:81:8': {
    segments: [
      // v.1-6 identity (offset 0, no segment needed).
      { synFrom: [7, 7],   displayFrom: [6, 6] },     // split: native 6 AND 7 both = English v.6
      { synFrom: [8, 19],  displayFrom: [7, 18] },    // offset -1
      { synFrom: [20, 20], displayFrom: null },       // native v.20 is an empty/corrupted verse ("።" only) -- no English counterpart
      { synFrom: [21, 23], displayFrom: [19, 21] },   // offset -2
      { synFrom: [24, 25], displayFrom: [22, 22] },   // merge: native 24+25 = English v.22 (the tax-exemption clause split across two Ge'ez verses)
      { synFrom: [26, 41], displayFrom: [23, 38] },   // offset -3
      { synFrom: [42, 42], displayFrom: [39, 40] },   // native v.42 alone covers English v.39-40 (two genealogy entries compressed into one Ge'ez verse)
      { synFrom: [43, 44], displayFrom: [41, 42] },   // offset -2
      { synFrom: [45, 45], displayFrom: [43, 44] },   // native v.45 alone covers English v.43-44 (same pattern as v.42)
      { synFrom: [46, 97], displayFrom: [45, 96] },   // offset -1, holds to the end of the chapter (native max 97 = English max 96)
    ],
  },

  // Native ch.10 -> display ch.9 (the public confession and mass divorce of
  // foreign wives). Much simpler: v.1-48 are identity, then one inserted
  // verse with no English counterpart, then a steady -1 offset to the end.
  'GEZ:81:9': {
    segments: [
      // v.1-48 identity (offset 0, no segment needed).
      { synFrom: [49, 49], displayFrom: null },       // native v.49 restates v.48's close ("taught them the law, and they all listened together") with no distinct English verse of its own
      { synFrom: [50, 56], displayFrom: [49, 55] },   // offset -1, holds to the end of the chapter (native max 56 = English max 55)
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

// The REVERSE of remapSourceVerseToDisplay: given a DISPLAY verse number,
// return the array of this source's own NATIVE verse number(s) whose content
// feeds it -- usually exactly one (identity, or a plain offset); more than
// one when this display verse is fed by a merge (e.g. GEZ:81:8's native
// v.24+v.25 both feeding English v.22 -- fetch and concatenate both); or a
// single native verse when a native verse stands for more than one display
// verse (e.g. GEZ:81:8's native v.42 alone covering English v.39-40 -- either
// display verse resolves back to that same native v.42). Used by callers that
// fetch by DISPLAY reference (a reader that only knows "show me verse 22")
// and need to know what to ask the source's own /verse endpoint for.
export function remapDisplayVerseToSource(corpus, canonId, chapter, displayVerse) {
  const def = SOURCE_VERSE_REMAP[`${corpus}:${canonId}:${chapter}`];
  if (!def) return [displayVerse];
  for (const seg of def.segments) {
    if (!seg.displayFrom) continue;   // a gap segment has no display verse to match against
    const [dLo, dHi] = seg.displayFrom;
    if (displayVerse < dLo || displayVerse > dHi) continue;
    const [sLo, sHi] = seg.synFrom;
    if (sHi - sLo === dHi - dLo) return [sLo + (displayVerse - dLo)];   // plain 1:1 offset
    const out = [];
    for (let s = sLo; s <= sHi; s++) out.push(s);                       // every native verse in this range feeds the requested display verse(s)
    return out;
  }
  return [displayVerse];   // remap table exists for this chapter but doesn't mention this display verse — identity fallback
}

// ── Whole-chapter offsets ───────────────────────────────────────────────────
// A handful of source editions also number their CHAPTERS differently from
// the display (English) numbering they're paired against -- distinct from the
// per-chapter verse remaps above, and checked first: the verse tables above
// are keyed by DISPLAY chapter, so a caller converts display -> native chapter
// with remapDisplayChapterToSource before fetching, then still passes the
// DISPLAY chapter as the `chapter` argument to remapSourceVerseToDisplay /
// remapDisplayVerseToSource for the verse-level lookup.
//
// GEZ:81 (1 Esdras, Ge'ez): this edition has no chapter 1 at all -- its own
// native numbering starts at chapter 2 and runs one chapter ahead of the
// other editions for the rest of the book (native ch.2 = display ch.1, ...
// native ch.10 = display ch.9). Content-verified end to end 2026-09 (see
// project memory and the SOURCE_VERSE_REMAP entries above for the per-chapter
// detail); `offset` is native-minus-display.
export const SOURCE_CHAPTER_REMAP = {
  'GEZ:81': { offset: 1 },
};

// Given a DISPLAY chapter number, return this source's own NATIVE chapter
// number to fetch. Identity when no chapter remap is registered.
export function remapDisplayChapterToSource(corpus, canonId, displayChapter) {
  const def = SOURCE_CHAPTER_REMAP[`${corpus}:${canonId}`];
  return def ? displayChapter + def.offset : displayChapter;
}

// The reverse: given this source's own NATIVE chapter number, return the
// DISPLAY chapter number it should be shown under. Identity when no chapter
// remap is registered.
export function remapSourceChapterToDisplay(corpus, canonId, nativeChapter) {
  const def = SOURCE_CHAPTER_REMAP[`${corpus}:${canonId}`];
  return def ? nativeChapter - def.offset : nativeChapter;
}

