/**
 * refs.js — parse the scripture references the model data carries
 * ("Joshua 15:11", "Ezekiel 48:1–7, 23–27", "Genesis 10:2; Daniel 8:21")
 * into reader links and verse ranges, so every reference on the map is a
 * real, clickable passage rather than a string.
 */
import { BOOK_NAMES } from '../books.js';

const NAME_TO_ID = Object.fromEntries(Object.entries(BOOK_NAMES).map(([id, name]) => [name.toLowerCase(), +id]));
const ALIASES = { 'song of solomon': 'song of songs', 'canticles': 'song of songs', 'psalm': 'psalms', 'revelations': 'revelation' };

function bookId(name) {
  const k = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return NAME_TO_ID[ALIASES[k] || k] ?? null;
}

/**
 * "Ezekiel 48:1–7, 23–27; Zechariah 14:8" →
 * [{ book:'Ezekiel', bookId:26, chapter:48, ranges:[[1,7],[23,27]] }, { book:'Zechariah', bookId:38, chapter:14, ranges:[[8,8]] }]
 * A chapter-only reference ("Ruth 1") gives ranges: [] (whole chapter).
 */
export function parseRefs(text) {
  const out = [];
  let lastBook = null;
  for (const part of String(text || '').split(';')) {
    // The book may be omitted after the first part: "Ezekiel 45:2; 42:15–20".
    // "Nahum 1–3" (a run of whole chapters) becomes one chip per chapter.
    const m = /^\s*(?:([1-3]?\s?[A-Za-z][A-Za-z .']*?)\s+)?(\d+)(?:\s*[–-]\s*(\d+))?(?::([\d\s,–\-]+))?\s*$/.exec(part);
    if (!m) continue;
    const book = (m[1] || lastBook || '').trim(), chapter = +m[2], id = bookId(book);
    if (!id) continue;
    lastBook = book;
    if (m[3] && !m[4]) {
      const last = Math.min(+m[3], chapter + 7);
      for (let ch = chapter; ch <= last; ch++) out.push({ book, bookId: id, chapter: ch, ranges: [], label: `${book} ${ch}` });
      continue;
    }
    const ranges = [];
    if (m[4]) {
      for (const r of m[4].split(',')) {
        const rm = /(\d+)\s*[–-]?\s*(\d+)?/.exec(r);
        if (rm) ranges.push([+rm[1], rm[2] ? +rm[2] : +rm[1]]);
      }
    }
    out.push({ book, bookId: id, chapter, ranges, label: m[1] ? part.trim() : `${book} ${part.trim()}` });
  }
  return out;
}

/** Reader URL for one parsed reference (first range highlighted). */
export function readerHref(ref) {
  const [v, e] = ref.ranges[0] || [];
  return `/bible?book=${ref.bookId}&chapter=${ref.chapter}${v ? `&verse=${v}${e && e !== v ? `&verseEnd=${e}` : ''}` : ''}`;
}

export function inRanges(verse, ranges) {
  return !ranges.length || ranges.some(([a, b]) => verse >= a && verse <= b);
}
