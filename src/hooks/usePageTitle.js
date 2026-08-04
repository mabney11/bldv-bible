/**
 * usePageTitle — one place that decides what the browser TAB says.
 *
 * The tab is the only label you have when a dozen of them are open and each one is
 * 24px wide, so the rule here is: the MOST specific thing first, the surface last.
 *
 *     Deuteronomy 6 — Paleo Studio
 *     Deuteronomy 6:4 — Parallel
 *     1 Adam and Eve 1:12 — Studio
 *     Apocalypse of Abraham 1 · not translated — Paleo Studio
 *
 * Put the reference first and the app name last: a narrow tab truncates from the
 * RIGHT, so "Deuteronomy 6 — Pale…" still tells you where you are, while
 * "Paleo Studio — Deut…" does not.
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
 * @param {string} surface  which reader/tool this is: 'Parallel', 'Studio', 'Hebrew Viewer'…
 *                          Omit (or pass APP_NAME) for the plain reader.
 * @param {string} [note]   optional state shown after a middot: 'not translated', 'unsaved'…
 */
export function usePageTitle(ref, surface, note) {
  useEffect(() => {
    const tail = surface && surface !== APP_NAME ? surface : APP_NAME;
    const head = [ref, note].filter(Boolean).join(' · ');
    const title = head ? `${head} — ${tail}` : tail;
    document.title = title;
    // No cleanup that resets the title: the next page sets its own on mount, and
    // resetting here would flash the bare app name during every navigation.
  }, [ref, surface, note]);
}

export default usePageTitle;
