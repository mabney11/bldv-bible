// ── Reader scroll-position / return-verse memory (sessionStorage) ──────────
//
// The Reader's reading surface (`.rd-scroll` in Reader.jsx) is an inner
// scrollable <main>, not the document/viewport — a browser only ever
// restores scroll position for the page itself on a back/forward
// navigation, never for a scrollable element like this one. So without this,
// tapping "back" out of a verse's own page (VersePage.jsx) — or out of any
// other page reached from the Reader — always landed back at the top of the
// chapter, with no memory of where the reader had actually been, and no
// indication of which verse they'd just come from.
//
// Two small sessionStorage memories, both keyed by book:chapter so they
// never leak across chapters and clear themselves on tab close (same
// lifetime as Reader.jsx's own `marks` highlight state):
//
//  - RD_SCROLL_KEY: the last scrollTop seen in this chapter. Reader.jsx
//    saves it on every scroll (debounced) and restores it whenever it's
//    mounted again with no explicit ?verse= target.
//  - RD_RETURN_VERSE_KEY: the verse currently open elsewhere for this
//    chapter — written by VersePage.jsx on every verse it resolves to (so
//    it stays accurate through Prev/Next-verse browsing, and works no
//    matter how VersePage was reached, not just via Reader's own "Go to
//    verse" link), and consumed (read, then removed) by Reader.jsx the
//    first time it's next mounted for this chapter with no ?verse= — so it
//    fires exactly once, on the return trip, then gets out of the way.
//
// A single shared module (rather than two independent copies of the same
// key format in Reader.jsx and VersePage.jsx) so the two pages can never
// drift out of agreement on what a key looks like.
export const RD_SCROLL_KEY = (book, chapter) => `rd-scroll:${book}:${chapter}`;
export const RD_RETURN_VERSE_KEY = (book, chapter) => `rd-return-verse:${book}:${chapter}`;

export const readSession = (k) => {
  try { return sessionStorage.getItem(k); } catch { return null; }   // private mode / storage disabled
};
export const writeSession = (k, v) => {
  try { sessionStorage.setItem(k, v); } catch { /* private mode / storage disabled */ }
};
export const removeSession = (k) => {
  try { sessionStorage.removeItem(k); } catch { /* ignore */ }
};
