/**
 * usePageTitle — one place that sets document.title (and, optionally, the
 * <meta name="description"> a crawler sees) from an already-built string.
 *
 * 2026-08-15 rewrite: this used to enforce one shared "<surface> | <ref>"
 * shape for every page. That stopped fitting once the reader asked for
 * per-tool conventions that genuinely differ — reference-first for the
 * reading tools, page-name-first for everything else, some with a live
 * verse-text preview appended (BibleHub-style, so a tab is identifiable/
 * searchable on its own):
 *
 *     Reader:             Genesis 1 | Reader
 *     Parallel (chapter):  Genesis 1 | Parallel
 *     Parallel (verse):    Genesis 1:1 | Parallel | In the beginning... | BaRaashayath...
 *     Hebrew/multi viewer: Revelation 6:15 | Hebrew | WaYaMalak (and-he/it)...
 *     Translation Studio:  Genesis 1:1 | Translation Studio
 *     everything else:     Works | BLD Bible
 *
 * Forcing all of those through one shared formatter fought the format
 * rather than serving it, so each page now builds its own title string —
 * see BRAND/pageTitle()/formatRef() below for the small shared pieces, and
 * each page's own usePageTitle call for which convention it follows.
 */
import { useEffect } from 'react';

// The short brand form used to suffix every page NOT covered by one of the
// reading tools' own conventions above — "<Page> | BLD Bible". "BLD Bible" is
// now the primary brand everywhere (landing hero, index.html's baseline SEO
// tags, server/prerender.js) — the older, longer "Blood-Line Descendant
// Bible Study Tool" name survives only as a JSON-LD alternateName in
// index.html, for search disambiguation.
export const BRAND = 'BLD Bible';

/** Build a reference string: "Genesis 1", "Genesis 1:5", "Genesis" */
export function formatRef(bookName, chapter, verse) {
  if (!bookName) return '';
  let s = String(bookName);
  if (chapter != null && chapter !== '') s += ` ${chapter}`;
  if (verse != null && verse !== '') s += `:${verse}`;
  return s;
}

/**
 * The generic "<Page> | BLD Bible" convention shared by every page that
 * isn't one of the reading tools with its own format above. Falls back to
 * the bare brand if `page` is still falsy (loading), so a tab never flashes
 * "undefined | BLD Bible".
 */
export function pageTitle(page) {
  return page ? `${page} | ${BRAND}` : BRAND;
}

/**
 * @param {string} title  the FULL title to set verbatim, e.g. "Genesis 1 | Reader"
 *                         or pageTitle('Works'). Falsy (e.g. still loading) leaves
 *                         document.title untouched — whatever the previous page or
 *                         prerender.js's snapshot already set stays put rather than
 *                         flashing something incomplete.
 * @param {string} [description]  optional <meta name="description"> override for
 *                         this page. Omit to leave the description tag alone.
 */
export function usePageTitle(title, description) {
  useEffect(() => {
    if (!title) return;
    document.title = title;
    if (description) {
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', description);
    }
    // No cleanup that resets the title/description: the next page sets its own
    // on mount, and resetting here would flash the bare brand/default
    // description during every navigation.
  }, [title, description]);
}

export default usePageTitle;
