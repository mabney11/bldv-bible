import { useEffect } from 'react';

// Kept in sync with index.html's static defaults on purpose — this is what
// gets restored when a page that customizes the title/description unmounts,
// so navigating away doesn't leave a stale word-specific title on a page
// that never asked for one.
const DEFAULT_TITLE = 'Paleo-Hebrew Translation Studio';
const DEFAULT_DESCRIPTION = "Read Hebrew, Greek, Latin, Ge'ez and Syriac scripture word by word with Strong's numbers, a concordance, root and lexicon tools, and a Hebrew-backed English Bible translation.";

/**
 * Sets document.title and <meta name="description"> for the current page.
 *
 * Why this exists: this is a client-rendered SPA with a single static
 * index.html, so every route shared the exact same generic title/description
 * — including per-word pages like /roots?sn=H2995, which gave crawlers (and
 * browser tabs/bookmarks) zero signal distinguishing one root or surface
 * form from another. 2026-08-14: added after "yabanaal" search results
 * surfaced a generic Lexicon page and an unrelated root instead of the real
 * H2995 entry, in part because nothing ever made that page's <title> say
 * "Yabanaal" (or anything else specific) in the first place.
 *
 * Pass null/undefined for either argument to leave that one at its current
 * value (useful while a detail fetch is still in flight).
 */
export default function usePageTitle(title, description) {
  useEffect(() => {
    if (title) document.title = title;
    if (description) {
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', description);
    }
    return () => {
      document.title = DEFAULT_TITLE;
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', DEFAULT_DESCRIPTION);
    };
  }, [title, description]);
}
