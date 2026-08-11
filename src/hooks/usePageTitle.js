/**
 * usePageTitle — one place that decides what the browser TAB says.
 *
 * Feature first, reference after (changed 2026-08-11, fieldy: "put the
 * feature first and then details"):
 *
 *     Paleo Studio | Deuteronomy 6
 *     Parallel | Deuteronomy 6:4
 *     Translation Studio | 1 Adam and Eve 1:12
 *     Paleo Studio | Apocalypse of Abraham 1 · not translated
 *
 * This reverses an earlier reference-first convention (kept the surface name
 * readable even when a narrow tab truncates the tail) in favor of every tab
 * for the same tool sorting/grouping together in a crowded tab strip — the
 * tradeoff being accepted here: on a very narrow tab, the reference can
 * truncate away and leave only the surface name visible.
 *
 * Usage:
 *   usePageTitle(bookName && `${bookName} ${chapter}`, 'Parallel');
 *
 * Pass a falsy `ref` while data is still loading and the title falls back to the
 * surface alone, so you never flash "undefined 1" in the tab.
 */
import { useEffect } from 'react';

export const APP_NAME = 'Paleo Studio';

/** Build a reference string: "Genesis 1", "Genesis 1:5", "Genesis" */
export function formatRef(bookName, chapter, verse) {
  if (!bookName) return '';
  let s = String(bookName);
  if (chapter != null && chapter !== '') s += ` ${chapter}`;
  if (verse != null && verse !== '') s += `:${verse}`;
  return s;
}

/**
 * @param {string} ref      the reference, e.g. "Deuteronomy 6:4" (falsy while loading)
 * @param {string} surface  which reader/tool this is: 'Parallel', 'Translation Studio',
 *                          'Gloss Studio', 'Reader'… Omit (or pass APP_NAME) for the
 *                          plain reader.
 * @param {string} [note]   optional state shown after a middot: 'not translated', 'unsaved'…
 */
export function usePageTitle(ref, surface, note) {
  useEffect(() => {
    const head = surface && surface !== APP_NAME ? surface : APP_NAME;
    const tail = [ref, note].filter(Boolean).join(' · ');
    const title = tail ? `${head} | ${tail}` : head;
    document.title = title;
    // No cleanup that resets the title: the next page sets its own on mount, and
    // resetting here would flash the bare app name during every navigation.
  }, [ref, surface, note]);
}

export default usePageTitle;
