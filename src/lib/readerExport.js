/**
 * readerExport — where the "download" buttons point, shared by the Reader
 * (/bible), the Detailed Verse page (/:book/:chapter/:verse) and the print page.
 *
 * fieldy, 2026-11-04: "Add a feature to my app for every verse, chapter, and
 * book to download as PDF -- keeping same style of my main reader."
 * The PDF is the browser's own "Save as PDF" over /print — a page drawn with
 * the reader's own renderer (Reader.jsx's quote tree, .rd-* classes), so the
 * file is real, selectable text in the reader's typeface and colours rather
 * than a picture of the screen.
 *
 *   printHref('genesis')                    whole book
 *   printHref('genesis', 1)                 one chapter
 *   printHref('genesis', 1, 3)              one verse
 *   printHref('genesis', 1, [3, 4, 5, 9])   a set of verses (the Reader's highlighted ones)
 */
export function printHref(bookSlug, chapter, verses) {
  const q = new URLSearchParams();
  q.set('book', String(bookSlug));
  if (chapter != null) q.set('chapter', String(chapter));
  if (Array.isArray(verses) && verses.length) {
    if (verses.length === 1) q.set('verse', String(verses[0]));
    else q.set('verses', compactVerseList(verses));
  } else if (verses != null && !Array.isArray(verses)) {
    q.set('verse', String(verses));
  }
  return `/print?${q.toString()}`;
}

/** [1,2,3,5,7,8] -> "1-3,5,7-8" */
export function compactVerseList(list) {
  const nums = [...new Set(list.map(Number).filter(n => Number.isFinite(n)))].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    out.push(j > i ? `${nums[i]}-${nums[j]}` : String(nums[i]));
    i = j;
  }
  return out.join(',');
}

/** "1-3,5" -> Set{1,2,3,5}; null when empty / unparseable */
export function parseVerseList(s) {
  if (!s) return null;
  const set = new Set();
  for (const part of String(s).split(',')) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const a = +m[1], b = m[2] ? +m[2] : a;
    for (let v = Math.min(a, b); v <= Math.max(a, b) && set.size < 500; v++) set.add(v);
  }
  return set.size ? set : null;
}

/** The same reading preferences the Reader persists — the export follows them. */
export function readerPrefs() {
  const read = (k, ok, d) => { try { const v = localStorage.getItem(k); return ok(v) ? v : d; } catch { return d; } };
  return {
    typeface: read('reader-typeface', v => !!v, 'alegreya'),
    glossMode: read('reader-gloss-mode', v => ['both', 'hebrew', 'gloss'].includes(v), 'both'),
    theme: read('theme', v => v === 'light' || v === 'dark', 'dark'),
  };
}
