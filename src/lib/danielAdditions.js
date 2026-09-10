/**
 * danielAdditions.js — where the Greek Daniel 3 and the Hebrew Daniel 3 part ways.
 *
 * The Hebrew/English Daniel 3 has 33 verses. The Greek (Theodotion and Old
 * Greek), Latin, Syriac and Ge'ez Daniel 3 run to 100: after Hebrew 3:23 they
 * carry the Prayer of Azariah and the Song of the Three (3:24–90), and the
 * Hebrew 3:24–33 become 3:91–100. In this app that insertion lives as its own
 * book beside Daniel — Words of Azariah (canon 148, Hebrew and English,
 * 68 verses in the traditional numbering) — the same way Susanna and Bel do,
 * so Daniel 3 keeps its Hebrew numbering everywhere.
 *
 * These maps let the language switcher land on the SAME words instead of the
 * same verse number: Greek Daniel 3:77 ("O ye fountains") ↔ Words of Azariah
 * 1:55, Greek 3:92 (the fourth man) ↔ Hebrew 3:25. The verse table is
 * Theodotion's order (which the Vulgate follows): the song's cold/frost/nights
 * verses sit in a different order there than in the traditional 68-verse
 * numbering, and Greek 3:52 holds two of its verses (29 and 30).
 */
export const DANIEL = 27;
export const AZARIAH = 148;

// Which sources number Daniel 3 the Greek way. The Syriac (Peshitta) as
// ingested here is a hybrid: 3:1–33 follow the Hebrew numbering and the
// addition is appended under its Greek numbers 34–90 (so its Azariah 1–10,
// which would collide with Hebrew 24–33, are absent) — see remapLocation.
const GREEK_NUMBERED = new Set(['LXX', 'GRC', 'GNT', 'LAT', 'GEZ', 'COP']);
const HEBREW_NUMBERED = new Set(['BHS', 'HEB', 'ENG']);
const SYRIAC = 'SYR';

// Words of Azariah verse → Greek Daniel 3 verse (Theodotion / Vulgate order).
const AZ_TO_GREEK = {
   1: 24,  2: 25,  3: 26,  4: 27,  5: 28,  6: 29,  7: 30,  8: 31,  9: 32, 10: 33,
  11: 34, 12: 35, 13: 36, 14: 37, 15: 38, 16: 39, 17: 40, 18: 41, 19: 42, 20: 43,
  21: 44, 22: 45, 23: 46, 24: 47, 25: 48, 26: 49, 27: 50, 28: 51, 29: 52, 30: 52,
  31: 53, 32: 54, 33: 55, 34: 56, 35: 57, 36: 59, 37: 58, 38: 60, 39: 61, 40: 62,
  41: 63, 42: 64, 43: 65, 44: 66, 45: 67, 46: 68, 47: 71, 48: 72, 49: 69, 50: 70,
  51: 73, 52: 74, 53: 75, 54: 76, 55: 77, 56: 78, 57: 79, 58: 80, 59: 81, 60: 82,
  61: 83, 62: 84, 63: 85, 64: 86, 65: 87, 66: 88, 67: 89, 68: 90,
};
const GREEK_TO_AZ = {};
for (const [az, gk] of Object.entries(AZ_TO_GREEK)) if (!(gk in GREEK_TO_AZ)) GREEK_TO_AZ[gk] = +az;

const HEB_SHIFT = 67;          // Hebrew 3:24–33 = Greek 3:91–100

const norm = (s) => String(s || 'BHS').toUpperCase();
export const isGreekNumbered = (source) => GREEK_NUMBERED.has(norm(source));
export const isHebrewNumbered = (source) => HEBREW_NUMBERED.has(norm(source));

/**
 * Where the same words are in another source. Returns {book, chapter, verse}
 * (verse may be null for a chapter-level jump) or null when no remap applies —
 * every book and chapter other than Daniel 3 / Words of Azariah, and every
 * switch between two sources that number the chapter the same way.
 */
export function remapLocation(fromSource, toSource, book, chapter, verse) {
  const b = +book, c = +chapter, v = verse == null ? null : +verse;
  const from = norm(fromSource), to = norm(toSource);
  const fromGreek = isGreekNumbered(from), toGreek = isGreekNumbered(to);
  const fromHeb = isHebrewNumbered(from), toHeb = isHebrewNumbered(to);

  // Words of Azariah → a Greek-numbered Daniel: land inside Daniel 3.
  if (b === AZARIAH && toGreek) {
    return { book: DANIEL, chapter: 3, verse: v != null && AZ_TO_GREEK[v] ? AZ_TO_GREEK[v] : 24 };
  }
  if (b === AZARIAH && to === SYRIAC) {
    const gk = v != null ? AZ_TO_GREEK[v] : null;
    return { book: DANIEL, chapter: 3, verse: gk && gk >= 34 ? gk : 34 };
  }
  if (b !== DANIEL || c !== 3) return null;
  // Syriac hybrid: 1–33 are the Hebrew verses, 34–90 the addition.
  if (from === SYRIAC) {
    if (v == null || v <= 33) return null;
    if (toHeb) return { book: AZARIAH, chapter: 1, verse: GREEK_TO_AZ[v] || Math.max(11, Math.min(68, v - 22)) };
    if (toGreek) return { book: DANIEL, chapter: 3, verse: v };
    return null;
  }
  if (to === SYRIAC) {
    if (v == null) return null;
    if (fromHeb) return null;                                  // same numbers for 1–33
    if (fromGreek && v >= 24 && v <= 90) return v >= 34 ? { book: DANIEL, chapter: 3, verse: v } : { book: DANIEL, chapter: 3, verse: 34 };
    if (fromGreek && v >= 91) return { book: DANIEL, chapter: 3, verse: v - HEB_SHIFT };
    return null;
  }
  if (fromGreek && toHeb) {
    if (v == null || v <= 23) return null;                    // same numbering below the insertion
    if (v >= 91) return { book: DANIEL, chapter: 3, verse: v - HEB_SHIFT };
    return { book: AZARIAH, chapter: 1, verse: GREEK_TO_AZ[v] || Math.max(1, Math.min(68, v - 23)) };
  }
  if (fromHeb && toGreek) {
    if (v == null || v <= 23) return null;
    return { book: DANIEL, chapter: 3, verse: v + HEB_SHIFT };
  }
  return null;
}
