/**
 * usePageTitle — one place that decides what the browser TAB says (and,
 * optionally, the <meta name="description"> a crawler sees).
 *
 * Feature first, reference after (changed 2026-08-11, fieldy: "put the
 * feature first and then details"):
 *
 *     Blood-Line Descendant Bible Study Tool | Deuteronomy 6
 *     Parallel | Deuteronomy 6:4
 *     Translation Studio | 1 Adam and Eve 1:12
 *     Blood-Line Descendant Bible Study Tool | Apocalypse of Abraham 1 · not translated
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
 *
 * 2026-08-14: added the optional 4th `description` param for the root/
 * surface explorer (see Root.jsx) — unlike Reader/Parallel/Translate, each
 * root/surface entry has real distinct content (a gloss, occurrence counts)
 * worth describing to a crawler, not just a distinct title. Every existing
 * call site is unaffected: omit the 4th argument and this behaves exactly
 * as it always has.
 */
import { useEffect } from 'react';

// 2026-08-15: rebranded from "Paleo Studio" (née "Paleo-Hebrew Translation
// Studio") — same rationale as index.html/prerender.js's title strings.
export const APP_NAME = 'Blood-Line Descendant Bible Study Tool';

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
 * @param {string} [description]  optional <meta name="description"> override for this
 *                          page. Omit to leave the description tag alone.
 */
export function usePageTitle(ref, surface, note, description) {
  useEffect(() => {
    const head = surface && surface !== APP_NAME ? surface : APP_NAME;
    const tail = [ref, note].filter(Boolean).join(' · ');
    const title = tail ? `${head} | ${tail}` : head;
    document.title = title;
    if (description) {
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', description);
    }
    // No cleanup that resets the title/description: the next page sets its own
    // on mount, and resetting here would flash the bare app name/default
    // description during every navigation.
  }, [ref, surface, note, description]);
}

export default usePageTitle;
