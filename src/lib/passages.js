/**
 * passages.js — the app's own text, live, for every model, map and image.
 *
 * fieldy (2026-09-11): "I need the models and quotes to remain consistent and
 * powered by the text in my translation db — if a verse is updated, the context
 * must also be updated for anything referring to it." So no model carries a copy
 * of a verse. Prose that quotes scripture writes a TEMPLATE instead:
 *
 *     {{Daniel 2:35 | hawaa a rab … arai}}
 *
 * which resolves, at render time, to the slice of the CURRENT verse from the first
 * unit matching the `from` anchor to the first unit after it matching the `to`
 * anchor (both inclusive, each with its "(gloss)"). A unit is one "word (gloss)"
 * pair or one bare word; anchors are transliterations or English words, compared
 * case-insensitively on the WORD, so editing a gloss in Translation Studio never
 * breaks a quote — the quote simply shows the new gloss. Multi-word anchors match
 * consecutive units ("hawaa a rab" picks the second hawaa of Daniel 2:35). A
 * single-word `to` anchor may also match a gloss ("pieces" → "daqaq (pieces)").
 * Anchors are optional: {{Daniel 2:35}} is the whole verse; {{Daniel 2:35 | aban}}
 * runs from aban to the end. An anchor that is not found falls back to the verse
 * boundary, so a heavily rewritten verse degrades to "more of the verse", never to
 * stale text. Whole-chapter fetches are cached for the session.
 */
import { apiTransChapter } from './api.js';
import { parseRefs } from './models/refs.js';

const _chapters = new Map();
export function loadChapter(bookId, chapter) {
  const k = `${bookId}:${chapter}`;
  if (!_chapters.has(k)) _chapters.set(k, apiTransChapter(bookId, chapter).then((d) => d?.verses || []).catch(() => []));
  return _chapters.get(k);
}
/** Forget cached chapters (after a save in the Studio, or to force a refetch). */
export function forgetChapters() { _chapters.clear(); }

/** "Daniel 2:35" → { bookId, chapter, verse } for a single-verse reference, else null. */
export function parseVerseRef(ref) {
  const [r] = parseRefs(ref);
  if (!r || !r.ranges.length) return null;
  const [v, e] = r.ranges[0];
  return { bookId: r.bookId, chapter: r.chapter, verse: v, verseEnd: e, label: r.label };
}

/** The verse text (verses joined with a space for a short range), or '' while unknown. */
export async function verseText(ref) {
  const p = parseVerseRef(ref);
  if (!p) return '';
  const verses = await loadChapter(p.bookId, p.chapter);
  return verses.filter((v) => +v.verse >= p.verse && +v.verse <= p.verseEnd).map((v) => v.text).join(' ');
}

// One "word (gloss)" pair, or a bare word. Apostrophes and hyphens stay in a word
// (potters', Yashar-Al); the gloss may hold anything but parentheses.
const UNIT_RE = /([A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’-]*)(\s*\(([^()]*)\))?/g;
function units(text) {
  const out = []; let m;
  UNIT_RE.lastIndex = 0;
  while ((m = UNIT_RE.exec(text))) out.push({ start: m.index, end: m.index + m[0].length, word: m[1].toLowerCase(), gloss: (m[3] || '').toLowerCase() });
  return out;
}
const norm = (s) => String(s || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
function matchAt(us, i, words, glossOk) {
  for (let j = 0; j < words.length; j++) {
    const u = us[i + j]; if (!u) return false;
    if (u.word === words[j]) continue;
    if (glossOk && j === words.length - 1 && words.length === 1 && u.gloss && u.gloss.split(/[^a-zà-ɏ'’-]+/).includes(words[j])) continue;
    return false;
  }
  return true;
}
/**
 * sliceQuote("…text…", "hawaa a rab", "arai") → the slice between the anchors.
 * Missing/unfound anchors fall back to the start/end of the text.
 */
export function sliceQuote(text, from, to) {
  const t = String(text || '');
  const us = units(t);
  const fw = norm(from), tw = norm(to);
  let a = 0, b = t.length, i0 = 0;
  if (fw.length) {
    const i = us.findIndex((_, i) => matchAt(us, i, fw, false));
    if (i >= 0) { a = us[i].start; i0 = i; }
  }
  if (tw.length) {
    for (let i = i0; i < us.length; i++) if (matchAt(us, i, tw, true)) { b = us[i + tw.length - 1].end; break; }
  }
  return t.slice(a, b).trim();
}

/** {{Ref | from … to}} — the template a model's prose uses to quote the live text. */
export const QUOTE_RE = /\{\{\s*([^{}|]+?)\s*(?:\|([^{}]*))?\}\}/g;
/** Split prose into literal strings and { ref, from, to } quote specs, in order. */
export function parseQuotes(text) {
  const t = String(text ?? ''); const out = []; let last = 0, m;
  QUOTE_RE.lastIndex = 0;
  while ((m = QUOTE_RE.exec(t))) {
    if (m.index > last) out.push(t.slice(last, m.index));
    const [from = '', to = ''] = String(m[2] || '').split(/…|\.\.\./).map((x) => x.trim());
    out.push({ ref: m[1].trim(), from, to });
    last = m.index + m[0].length;
  }
  if (last < t.length) out.push(t.slice(last));
  return out;
}
/** Resolve every quote in `text` against the live chapters (async; cached). */
export async function resolveQuotes(text) {
  const parts = parseQuotes(text);
  return Promise.all(parts.map(async (p) => (typeof p === 'string' ? p : sliceQuote(await verseText(p.ref), p.from, p.to))));
}
