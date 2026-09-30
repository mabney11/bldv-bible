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

// ── Back-button contract (fieldy, 2026-09-30 — gated by
//    scripts/verify-reader-back-scroll.mjs, which runs before every build) ──
//
// Browser/phone Back into the Reader puts you EXACTLY where you were looking
// when you left — same verse at the same spot on screen. Which verse is
// highlighted/selected, or which verse's page you went to, never moves the
// view. Only a fresh arrival (Link, Next/Prev chapter, picker) starts at the
// top; an explicit ?verse= deep link goes to that verse.
//
// Regression history — both of these have silently broken it before:
//  1. The return trip scrolled to (and centred) the verse whose page you
//     opened, instead of the view you left.
//  2. The "was this a Back?" answer was read from react-router's
//     navigationType AFTER the ?script= sync had dispatched a replace() —
//     with slug URLs (?book=matthew) the chapter fetch can't start until the
//     slug map loads, so by then navigationType already said 'REPLACE' and
//     every Back was treated as a fresh arrival (top of chapter, memory wiped).
//     Fix: stamp the arrival type during RENDER, once per book:chapter
//     (stampArrival), and never dispatch a no-op setSearchParams.

// Returns the stamp to keep: unchanged while we're still on the same
// book:chapter (later REPLACEs of ?script=/?verse= can't overwrite it), a new
// one the first time a new book:chapter renders.
export function stampArrival(prev, locKey, navType) {
  if (prev && prev.locKey === locKey) return prev;
  return { locKey, navType };
}

// Serialise what's on screen: the first verse whose bottom is below the top
// of the scroller, and how far its top sits from the scroller's top. A verse
// anchor survives reflow (headings/fonts arriving late) where a raw
// scrollTop doesn't; scrollTop is kept as the fallback.
export function captureView(scroller) {
  if (!scroller) return null;
  const top = scroller.scrollTop;
  const sTop = scroller.getBoundingClientRect().top;
  const verses = scroller.querySelectorAll('[id^="rv-"]');
  for (const el of verses) {
    const r = el.getBoundingClientRect();
    if (r.bottom > sTop + 1) {
      const v = parseInt(el.id.slice(3), 10);
      if (v) return { top, v, off: Math.round(r.top - sTop) };
      break;
    }
  }
  return { top };
}

export function encodeView(view) { return view ? JSON.stringify(view) : null; }
export function decodeView(raw) {
  if (raw == null || raw === '') return null;
  // legacy format: a bare scrollTop number
  if (/^\d+(\.\d+)?$/.test(raw)) return { top: parseFloat(raw) };
  try {
    const o = JSON.parse(raw);
    if (o && typeof o.top === 'number') return o;
  } catch { /* fall through */ }
  return null;
}

// The whole decision, pure so the gate can exercise it:
//  - not a Back/Forward (PUSH / REPLACE)           → top, forget memories
//  - Back with a saved view                        → that view, whatever
//                                                    verse is marked/opened
//  - Back, no saved view, but a return verse       → that verse
//  - otherwise                                     → top
export function planRestore({ navType, savedView, returnVerse }) {
  if (navType !== 'POP') return { kind: 'top', forget: true };
  if (savedView) return { kind: 'view', view: savedView, flashVerse: returnVerse || null };
  if (returnVerse) return { kind: 'verse', verse: returnVerse };
  return { kind: 'top', forget: false };
}

// Put `view` back on screen, instantly (the reader's CSS has
// scroll-behavior: smooth, which would otherwise animate from the top).
export function applyView(scroller, view) {
  if (!scroller || !view) return;
  let target = view.top || 0;
  if (view.v) {
    const el = scroller.querySelector(`#rv-${view.v}`);
    if (el) {
      const sTop = scroller.getBoundingClientRect().top;
      target = scroller.scrollTop + (el.getBoundingClientRect().top - sTop) - (view.off || 0);
    }
  }
  scroller.scrollTo({ top: Math.max(0, target), behavior: 'instant' });
}
