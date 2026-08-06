import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { ToastProvider } from './components/Toast.jsx';

import Landing       from './pages/Landing.jsx';
import HebrewViewer  from './pages/HebrewViewer.jsx';
import Parallel      from './pages/Parallel.jsx';
import Lexicon       from './pages/Lexicon.jsx';
import Translate     from './pages/Translate.jsx';
import Share         from './pages/Share.jsx';
import Root          from './pages/Root.jsx';
import Cheatsheet    from './pages/Cheatsheet.jsx';
import GlyphEditor   from './pages/GlyphEditor.jsx';
import MultiViewer   from './pages/MultiViewer.jsx';
import Concordance   from './pages/Concordance.jsx';
import Works         from './pages/Works.jsx';
import Reader        from './pages/Reader.jsx';
import AdminLogin    from './pages/AdminLogin.jsx';
import BookManager   from './pages/BookManager.jsx';
import Search        from './pages/Search.jsx';
import StrongsOverrides from './pages/StrongsOverrides.jsx';

/**
 * URL mapping. The reader and lexicon are unified across all corpora —
 * Hebrew, Greek, Ge'ez share the same URLs and differ only by a `source` /
 * `lang` query param.
 *
 *   /             → bare visit (no query params) redirects to /landing.
 *                   With query params, same as before: Reader. source=hebrew
 *                   (default) → HebrewViewer; source=LXX | GNT | GEZ | LAT | GRC
 *                   → MultiViewer.
 *   /landing      → Landing
 *   /works        → Works Library (filterable list of all literary works)
 *   /parallel     → Parallel
 *   /translate    → Translation Studio
 *   /share        → Share & Export
 *   /lexicon-page → Lexicon Explorer (multi-language: ?lang=hebrew|greek|geez)
 *   /roots, /root → Root explorer (Hebrew)
 *   /surfaces     → Surface explorer
 *   /cheatsheet   → BHS token cheatsheet
 *   /glyph-editor → User glyph editor
 *
 * Legacy aliases redirect to the unified URLs:
 *   /read?source=X  → /?source=X
 *   /lexicon-source?src=X → /lexicon-page?lang=<src→lang>
 */

// Root at `/` — a bare visit (no query params) lands on the Landing page.
// Any *meaningful* query params (deep links like /?source=lxx) still go
// straight to the reader, so existing shared links keep working.
//
// Tracking params (utm_*, fbclid, gclid, igshid, ...) are ignored when
// making this decision — an Instagram bio link like
// bldbible.com/?utm_source=ig&fbclid=... has no real reader params, but
// isn't "empty" either, so it was wrongly falling through to the reader
// instead of landing on /landing. fieldy, 2026-08-05.
const IGNORED_PARAM_PREFIXES = ['utm_'];
const IGNORED_PARAMS = new Set(['fbclid', 'gclid', 'gbraid', 'wbraid', 'igshid', 'ig_mid', 'mc_cid', 'mc_eid', 'ref']);
function RootDispatcher() {
  const [sp] = useSearchParams();
  const meaningfulKeys = [...sp.keys()].filter(
    k => !IGNORED_PARAMS.has(k) && !IGNORED_PARAM_PREFIXES.some(p => k.startsWith(p))
  );
  if (meaningfulKeys.length === 0) return <Navigate to="/landing" replace />;
  return <ReaderDispatcher />;
}

// Picks the right viewer based on ?source param
function ReaderDispatcher() {
  const [sp] = useSearchParams();
  const source = (sp.get('source') || 'hebrew').toLowerCase();
  const hasDoc = !!sp.get('doc');
  // BHS and HEB both go to HebrewViewer. HEB ("Hebrew extra") used to fall through to
  // MultiViewer, which renders bare glyphs with "— not glossed —" because it never calls
  // /api/tokens. That was right when only BHS had tokens; since build-heb-index.mjs it is
  // not — tokens_nt carries Strong's for HEB across canon 1-66, so it belongs on the
  // token path with full word blocks, glosses and Strong's badges, sharing the same
  // lexicons as BHS. HebrewViewer forwards ?source= to apiTokens, which is what keeps the
  // two Hebrew editions apart now that BOTH have tokens for the same OT books.
  //
  // EXCEPTION — a `doc` param means this is a literary work from the Works Library
  // (e.g. a Dead Sea Scroll ingested as corpus='HEB'), not one of the 39 canonical OT
  // books. Those have no Strong's token stream at all (apiTokens needs a canonical
  // book_id and a tokens_bhs/tokens_nt row, neither of which exist for a scroll like
  // 1QS), so HebrewViewer can't render them — it silently fell back to book 1
  // (Genesis) instead of erroring. Doc-based HEB works need the same plain
  // chapter/verse text reader every other Works Library source (ENG, GEZ, ...)
  // already uses. fieldy, 2026-07-31: clicking a Dead Sea Scroll in the Works
  // Library landed on Genesis 1 instead of the scroll.
  if ((source === 'hebrew' || source === '' || source === 'bhs' || source === 'heb') && !hasDoc) {
    return <HebrewViewer />;
  }
  // LXX, GNT, GEZ, LAT, GRC, SYR, COP, and now HEB-with-doc — text-only sources
  // with no token stream.
  return <MultiViewer />;
}

// Redirect /read?source=X → /?source=X
function ReadRedirect() {
  const [sp] = useSearchParams();
  return <Navigate to={`/?${sp.toString()}`} replace />;
}

// Redirect /lexicon-source?src=X → /lexicon-page?lang=Y
function LexiconSourceRedirect() {
  const [sp] = useSearchParams();
  const src = (sp.get('src') || '').toUpperCase();
  const lang = (src === 'GEZ') ? 'geez'
             : (src === 'LXX' || src === 'GNT') ? 'greek'
             : 'hebrew';
  const out = new URLSearchParams({ lang });
  if (sp.get('word')) out.set('q', sp.get('word'));
  return <Navigate to={`/lexicon-page?${out.toString()}`} replace />;
}

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/"               element={<RootDispatcher />} />
        <Route path="/landing"        element={<Landing />} />
        <Route path="/admin-login"    element={<AdminLogin />} />
        <Route path="/book-manager"   element={<BookManager />} />
        <Route path="/works"          element={<Works />} />
        <Route path="/parallel"       element={<Parallel />} />
        <Route path="/bible"          element={<Reader />} />
        <Route path="/lexicon-page"   element={<Lexicon />} />
        <Route path="/lexicon"        element={<Lexicon />} />
        <Route path="/translate"      element={<Translate />} />
        <Route path="/share"          element={<Share />} />
        <Route path="/search"         element={<Search />} />
        <Route path="/roots"          element={<Root />} />
        <Route path="/root"           element={<Root />} />
        <Route path="/surfaces"       element={<Root mode="surface" />} />
        <Route path="/concordance"   element={<Concordance />} />
        <Route path="/cheatsheet"     element={<Cheatsheet />} />
        <Route path="/glyph-editor"   element={<GlyphEditor />} />
        <Route path="/admin/strongs-overrides" element={<StrongsOverrides />} />
        <Route path="/read"           element={<ReadRedirect />} />
        <Route path="/lexicon-source" element={<LexiconSourceRedirect />} />
        <Route path="*" element={<Navigate to="/landing" replace />} />
      </Routes>
    </ToastProvider>
  );
}
