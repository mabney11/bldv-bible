import { useEffect, lazy, Suspense, Component } from 'react';
import { Routes, Route, Navigate, useSearchParams, useLocation } from 'react-router-dom';
import { ToastProvider } from './components/Toast.jsx';

// Landing stays a static import: it's small (a few KB), it's the entry point
// most visits land on, and the prerender snapshot (server/prerender.js)
// already ships its real HTML up front — lazy-loading it would only add a
// pointless extra network round trip for the most common case.
import Landing from './pages/Landing.jsx';

// Everything else is lazy. Before this, App.jsx statically imported every
// page — Translate.jsx (88K), Reader.jsx (76K), CheatsheetLong.js (76K),
// Parallel.jsx (56K), MultiViewer.jsx (48K), Share.jsx (44K), Root.jsx (40K),
// Lexicon/HebrewViewer/GlossStudio (~36K each), GlyphEditor (28K) — so a
// visit to ANY single page downloaded the code for all of them: one 549KB
// (170KB gzipped) chunk regardless of which tool you actually opened. Vite/
// Rollup code-splits each dynamic import() into its own chunk automatically,
// so a Hebrew-reader visit no longer pays for Translate/Share/GlyphEditor/
// admin tooling it never uses. This changes ONLY how/when the code is
// downloaded — no component's behavior changes.
const HebrewViewer     = lazy(() => import('./pages/HebrewViewer.jsx'));
const Parallel         = lazy(() => import('./pages/Parallel.jsx'));
const Lexicon          = lazy(() => import('./pages/Lexicon.jsx'));
const Translate        = lazy(() => import('./pages/Translate.jsx'));
const Share            = lazy(() => import('./pages/Share.jsx'));
const Root             = lazy(() => import('./pages/Root.jsx'));
const Cheatsheet       = lazy(() => import('./pages/Cheatsheet.jsx'));
const GlyphEditor      = lazy(() => import('./pages/GlyphEditor.jsx'));
const MultiViewer      = lazy(() => import('./pages/MultiViewer.jsx'));
const Concordance      = lazy(() => import('./pages/Concordance.jsx'));
const Works            = lazy(() => import('./pages/Works.jsx'));
const Reader           = lazy(() => import('./pages/Reader.jsx'));
const AdminLogin       = lazy(() => import('./pages/AdminLogin.jsx'));
const BookManager      = lazy(() => import('./pages/BookManager.jsx'));
const Search           = lazy(() => import('./pages/Search.jsx'));
const StrongsOverrides = lazy(() => import('./pages/StrongsOverrides.jsx'));
const GlossStudio      = lazy(() => import('./pages/GlossStudio.jsx'));
const LexiconAdmin     = lazy(() => import('./pages/LexiconAdmin.jsx'));
const VersePage        = lazy(() => import('./pages/VersePage.jsx'));

// Shown for the brief moment a lazy page chunk is downloading (near-instant
// on repeat visits/navigations once a chunk is cached). Deliberately quiet —
// no layout-shifting spinner — since most transitions are fast enough that
// this never becomes visible at all.
function RouteFallback() {
  return (
    <div style={{ minHeight: '40vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 14 }}>
      Loading…
    </div>
  );
}

// 2026-08-15: fixes the "navigated to /parallel and got a blank page — a
// refresh fixes it, and it's not just Reader→Parallel" report. Root cause:
// every non-Landing page above is a React.lazy() dynamic import(), and
// NOTHING was catching what happens when one of those imports fails — which
// it reliably does for anyone with the app already open in a tab across a
// deploy. Each deploy's Vite build gives every chunk a NEW content hash
// (Parallel-B8sTx-9x.js today, something else next deploy); an already-open
// tab's JS still references the OLD hash, and the just-redeployed server no
// longer serves that exact filename — 404. React had no ErrorBoundary
// anywhere around <Suspense>/<Routes> to catch that, so it unmounted the
// whole tree: a blank page with the real error visible only in devtools.
// A plain refresh fetches the CURRENT index.html (current hashes), which is
// exactly why "if I refresh, it loads" — this makes that automatic instead
// of something a reader has to figure out. Limited to ONE silent auto-
// reload per tab session (sessionStorage flag) so a genuinely broken chunk
// (not just staleness) doesn't reload-loop forever; a second failure shows
// a real fallback with a manual retry.
const CHUNK_ERROR_RE = /dynamically imported module|Importing a module script failed|ChunkLoadError|loading chunk|loading css chunk/i;
const CHUNK_RELOAD_FLAG = 'bld-chunk-reload-attempted';
class ChunkErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) {
    const isChunkError = CHUNK_ERROR_RE.test(error?.message || '');
    let alreadyTried = true;
    try { alreadyTried = sessionStorage.getItem(CHUNK_RELOAD_FLAG) === '1'; } catch { /* private mode */ }
    if (isChunkError && !alreadyTried) {
      try { sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1'); } catch { /* non-fatal */ }
      window.location.reload();
    }
  }
  render() {
    if (!this.state.failed) return this.props.children;
    // Only ever seen if the auto-reload above already fired once this
    // session (or this wasn't a chunk error at all) — the common case
    // never reaches this, it silently reloads instead.
    return (
      <div style={{ minHeight: '50vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', gap: 14, color: 'var(--text2)', padding: 24, textAlign: 'center' }}>
        <div>Something didn’t load correctly.</div>
        <button
          onClick={() => window.location.reload()}
          style={{ padding: '9px 18px', borderRadius: 7, border: '1px solid var(--border2)',
                   background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer', font: 'inherit' }}
        >Reload</button>
      </div>
    );
  }
}

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
  // LXX, GNT, GEZ, LAT, GRC, SYR, and now HEB-with-doc — text-only sources
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

// Keeps <link rel="canonical"> (see index.html) pointed at the CURRENT
// route on every navigation. The SPA shell only ships one static index.html
// (no SSR), so without this every route would share whatever canonical URL
// happened to be hardcoded in the HTML — telling search engines that pages
// like /works or /translate are really just /landing, and should be dropped
// from the index in its favor. Self-referencing instead keeps every real
// page indexable on its own URL. Tracking params (utm_*, fbclid, ...) are
// stripped so a shared link with tracking junk on it doesn't get treated as
// a distinct canonical URL from the clean version.
// /parallel and /translate render the SAME chapter content regardless of
// ?verse= — it only scrolls-to/highlights a verse already on the page (see
// server/prerender.js's englishChapterRoute, which reads only book+chapter
// for these routes and produces byte-for-byte the same snapshot for any
// verse). Stripped here too, not just server-side: this effect runs after
// React mounts and OVERWRITES whatever canonical prerender.js already set,
// so without this a crawler that executes JS would see the self-referencing
// (verse-included) canonical again, undoing that consolidation. 2026-08-15:
// a `site:bldbible.com john 6 15` search was surfacing inconsistent titles
// because Google had indexed several ?verse=N variants of the same page as
// distinct near-duplicate URLs.
//
// 2026-08-15 (later): '/bible' removed from this set. server/prerender.js's
// englishVerseRoute now gives a real ?verse= on /bible its OWN
// self-referencing canonical — that verse's actual translation text plus
// its own Hebrew tokens, genuinely different content per verse, not a
// scroll-to on the same chapter body. Stripping `verse` here would silently
// contradict what the crawler snapshot just served for that exact URL,
// which is the same prerendered-vs-hydrated mismatch this component exists
// to prevent — just in the opposite direction.
const VERSE_AGNOSTIC_ROUTES = new Set(['/parallel', '/translate']);
function SelfCanonical() {
  const location = useLocation();
  useEffect(() => {
    const link = document.getElementById('canonical-link');
    if (!link) return;
    const params = new URLSearchParams(location.search);
    for (const key of [...params.keys()]) {
      if (key.startsWith('utm_') || IGNORED_PARAMS.has(key)) params.delete(key);
    }
    if (VERSE_AGNOSTIC_ROUTES.has(location.pathname)) params.delete('verse');
    const qs = params.toString();
    link.href = `${window.location.origin}${location.pathname}${qs ? '?' + qs : ''}`;
  }, [location.pathname, location.search]);
  return null;
}

export default function App() {
  return (
    <ToastProvider>
      <SelfCanonical />
      <ChunkErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
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
        <Route path="/gloss-studio"   element={<GlossStudio />} />
        <Route path="/admin/lexicon"  element={<LexiconAdmin />} />
        <Route path="/read"           element={<ReadRedirect />} />
        <Route path="/lexicon-source" element={<LexiconSourceRedirect />} />
        {/* Clean per-verse URL — /genesis/1/1 — exposing the verse-level content
            that server/prerender.js's englishVerseRoute already builds for /bible?
            verse= links, as a real navigable page (see VersePage.jsx). Three path
            segments never collide with any of the single/double-segment named
            routes above, so this is safe to keep last, right before the catch-all. */}
        <Route path="/:bookSlug/:chapter/:verse" element={<VersePage />} />
        <Route path="*" element={<Navigate to="/landing" replace />} />
      </Routes>
      </Suspense>
      </ChunkErrorBoundary>
    </ToastProvider>
  );
}
