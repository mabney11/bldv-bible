// api.js — thin wrappers around the existing backend endpoints. All of these
// hit the same routes the legacy HTML pages used; the Vite dev proxy
// (vite.config.js) forwards them to your Paleo-Hebrew server.

import {
  getAdminStatus, getLocalVerse, getLocalVersesForChapter,
  mergeVerseWithLocal, mergeChapterVersesWithLocal,
} from './localOverlay.js';

// ── TRANSIENT-FAILURE RETRY ──────────────────────────────────────────────────
// The server takes a second or two to boot (it builds the nav index over 400k+
// rows first), and until it answers, ngrok returns 502. A page opened in that
// window used to dead-end: every request failed, the book list came back empty,
// the reader showed "Error: 502", and the only way out was a manual refresh —
// which "worked" purely because by then the server was up.
//
// Nothing about that needed a human. Retry the handful of statuses that mean
// "not ready yet" and the page heals itself.
//
// Retried: a thrown fetch (server not listening / connection reset) and
// 502/503/504 (upstream unavailable). NEVER 4xx — a 404 for a book that does
// not exist is a real answer, and retrying it would just delay the truth.
const TRANSIENT = new Set([502, 503, 504]);
const RETRY_DELAYS = [400, 900, 1800];   // ~3.1s total, then give up honestly

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Generic JSON-or-throw fetch. On non-2xx we throw an Error whose .body is
// the parsed JSON body (if any). Callers like apiSurfaceDetail can inspect
// .body.redirect_to to do a graceful redirect instead of showing the error.
async function jsonFetch(url, init) {
  let lastErr;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS[attempt - 1]);
    let r;
    try {
      r = await fetch(url, init);
    } catch (netErr) {
      // Server not listening at all. Indistinguishable from "still booting",
      // so treat it the same way.
      lastErr = netErr;
      continue;
    }
    if (!r.ok) {
      let body = null;
      let msg;
      try { body = await r.json(); msg = body?.error || `${r.status} ${r.statusText}`; }
      catch { msg = `${r.status} ${r.statusText}`; }
      const err = new Error(msg);
      err.status = r.status;
      err.body   = body;
      if (TRANSIENT.has(r.status)) { lastErr = err; continue; }
      throw err;                       // a real error — surface it immediately
    }
    return r.json();
  }
  throw lastErr;                       // still down after every retry
}

// ── Bible navigation & content ────────────────────────────────────────────────
export const apiBooks    = ()                => jsonFetch('/api/books');
// `source` is optional and only matters for the OT, where both tokens_bhs (Masoretic)
// and tokens_nt (the HEB edition) have rows for the same book. Pass 'HEB' to read the
// Heb Extra tokens, 'BHS' to force Masoretic; omit it and the server infers from the
// book range, which is unambiguous only for the NT.
export const apiTokens   = (book, chapter, source) => jsonFetch(
  `/api/tokens?book=${book}&chapter=${chapter}` + (source ? `&source=${encodeURIComponent(source)}` : ''));
// Doc-based (Works Library, canon_id NULL) HEB tokens — Dead Sea Scrolls and any
// future non-canonical Hebrew work. Separate function rather than overloading
// apiTokens's `book` param with a doc id: the server route branches on `doc` vs
// `book` too (see /api/tokens in server.js), so this mirrors that split 1:1.
export const apiDocTokens = (doc, chapter) => jsonFetch(
  `/api/tokens?doc=${encodeURIComponent(doc)}&chapter=${chapter}`);
export const apiRaw      = (book, chapter)   => jsonFetch(`/api/raw?book=${book}&chapter=${chapter}`).catch(() => []);

// ── Search ─────────────────────────────────────────────────────────────────────
export const apiSearch   = (q, offset, mode) =>
  jsonFetch(`/api/search?q=${encodeURIComponent(q)}&offset=${offset}&mode=${mode}`);

// ── Translation studio ─────────────────────────────────────────────────────────
export const apiTransProgress = ()                          => jsonFetch('/api/translate/progress');
// Both of these overlay a non-admin's local edits (src/lib/localOverlay.js) on top
// of the server's published text before returning — so a local-only edit made in
// Translate Studio shows up everywhere the translation is read (Reader, Share,
// Parallel), not just back in the Studio editor. Admins always see exactly what's
// published, unchanged from before local overrides existed.
export const apiTransChapter = async (book, ch) => {
  const data = await jsonFetch(`/api/translate/chapter?book=${book}&chapter=${ch}`).catch(() => ({ verses: [] }));
  const { isAdmin } = await getAdminStatus();
  if (isAdmin) return data;
  const localOverrides = await getLocalVersesForChapter(book, ch).catch(() => []);
  return { ...data, verses: mergeChapterVersesWithLocal(data.verses, localOverrides) };
};
// Named sections spanning a chapter range within one book (e.g. Book of
// Melchizedek's 3 originally-separate parts) — empty array for a book with none,
// which is the normal case; this is an opt-in per-book feature.
export const apiBookSections = async (book) => {
  const data = await jsonFetch(`/api/book-sections?book=${book}`).catch(() => ({ sections: [] }));
  return (data && data.sections) || [];
};
export const apiTransVerse = async (book, ch, v) => {
  const data = await jsonFetch(`/api/translate/verse?book=${book}&chapter=${ch}&verse=${v}`).catch(() => null);
  if (!data) return null;
  const { isAdmin } = await getAdminStatus();
  if (isAdmin) return data;
  const local = await getLocalVerse(book, ch, v).catch(() => null);
  return local ? mergeVerseWithLocal(data, local) : data;
};

// Translate — write paths. Each wraps a POST/PUT/DELETE with the right method/body.
export const apiTransSaveVerse = (payload) => jsonFetch('/api/translate/verse', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
});
// Revision history — every prior version of a verse, newest first, captured
// automatically server-side on each save (see server.js's saveVerseWithHistory).
export const apiTransHistory = (book, chapter, verse) =>
  jsonFetch(`/api/translate/history?book=${book}&chapter=${chapter}&verse=${verse}`);
export const apiTransRevertToHistory = (book_id, chapter, verse, history_id) => jsonFetch('/api/translate/history/revert', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ book_id, chapter, verse, history_id }),
});
export const apiTransDeleteHistory = (history_id, book, chapter, verse) =>
  jsonFetch(`/api/translate/history/${history_id}?book=${book}&chapter=${chapter}&verse=${verse}`, { method: 'DELETE' });
export const apiTransLink = (payload) => jsonFetch('/api/translate/link', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
});
export const apiTransUpdateLink = ({ id, ...payload }) => jsonFetch(`/api/translate/link/${id}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
});
export const apiTransUnlink = ({ id, book_id, chapter, verse }) => jsonFetch(
  `/api/translate/link/${id}?book_id=${book_id}&chapter=${chapter}&verse=${verse}`,
  { method: 'DELETE' }
);
export const apiTransClearLinks = ({ book, chapter, verse }) => jsonFetch(
  `/api/translate/links?book=${book}&chapter=${chapter}&verse=${verse}`,
  { method: 'DELETE' }
);

// ── Lexicon: NOTE we no longer cache here. Each call goes to the backend.
//    For the "All Surfaces" tab we go through /api/nav/surfaces (the same
//    "surface db" the old code hit — just without the localStorage cache layer).
export const apiLexicon      = ()                => jsonFetch('/lexicon/lexicon.json');
export const apiHomographs   = ()                => jsonFetch('/lexicon/homographs.json');
export const apiDefinitions  = ()                => jsonFetch('/lexicon/definitions.json');
export const apiNavRoots     = ()                => jsonFetch('/api/nav/roots');
export const apiNavSurfaces  = ()                => jsonFetch('/api/nav/surfaces');

// ── Multi-source (LXX, GNT, Ge'ez) ──────────────────────────────────────────
// These query the per-source DBs built by scripts/ingest-refs.cjs and the
// matching server endpoints. BHS continues to use the existing /api/tokens
// path; these helpers are for the simpler verse-text sources.
export const apiSources = () => jsonFetch('/api/sources');
// Master cross-language book order: [{ id, sources:[...] }] in your book-order.json sequence.
export const apiBookOrder = () => jsonFetch('/api/book-order');
export const apiSourceBooks = (src) => jsonFetch(`/api/source/${encodeURIComponent(src)}/books`);
// List of all manuscripts / witnesses in this source. For Ge'ez each book
// or literary work is a distinct Ethiopic doc (e.g. LIT1546Genesi).
export const apiSourceDocs = (src) => jsonFetch(`/api/source/${encodeURIComponent(src)}/docs`);
// Both /verse and /chapter accept EITHER a book id OR a doc id. Pass an
// opts object: { book } for canonical, { doc } for literary. Numbers come
// from the URL; the helper just URL-encodes safely.
export const apiSourceVerse = (src, opts, chapter, verse) => {
  // Back-compat: old callers passed (src, book, chapter, verse) positionally
  if (typeof opts === 'number') opts = { book: opts };
  const q = new URLSearchParams({ chapter: String(chapter), verse: String(verse) });
  if (opts.doc)  q.set('doc',  opts.doc);
  if (opts.book != null) q.set('book', String(opts.book));
  return jsonFetch(`/api/source/${encodeURIComponent(src)}/verse?${q}`);
};
export const apiSourceChapter = (src, opts, chapter) => {
  if (typeof opts === 'number') opts = { book: opts };
  const q = new URLSearchParams({ chapter: String(chapter) });
  if (opts.doc)  q.set('doc',  opts.doc);
  if (opts.book != null) q.set('book', String(opts.book));
  return jsonFetch(`/api/source/${encodeURIComponent(src)}/chapter?${q}`);
};

// chapter LIST for a book/doc (used by the chapter selector on long works)
export const apiSourceChapters = (src, opts = {}) => {
  if (typeof opts === 'number') opts = { book: opts };
  const q = new URLSearchParams();
  if (opts.doc) q.set('doc', opts.doc);
  if (opts.book != null) q.set('book', String(opts.book));
  return jsonFetch(`/api/source/${encodeURIComponent(src)}/chapters?${q}`);
};

// every literary work/doc across all sources (Works Library)
export const apiWorks = () => jsonFetch('/api/works');

// concordance dossiers — surface form (any language) or lemma (Greek NT)
export const apiConcordanceSurface = (corpus, word, limit = 100) =>
  jsonFetch(`/api/concordance/surface?corpus=${encodeURIComponent(corpus)}&word=${encodeURIComponent(word)}&limit=${limit}`);
export const apiConcordanceLemma = (corpus, lemma, limit = 100) =>
  jsonFetch(`/api/concordance/lemma?corpus=${encodeURIComponent(corpus)}&lemma=${encodeURIComponent(lemma)}&limit=${limit}`);
export const apiParallelSources = (book, chapter, verse) =>
  jsonFetch(`/api/parallel-sources?book=${book}&chapter=${chapter}&verse=${verse}`);
export const apiCrossLangEquivalents = (word) =>
  jsonFetch(`/api/cross-lang-equivalents${word ? `?word=${encodeURIComponent(word)}` : ''}`);

// Per-language surface lexicons (LXX / GNT / GEZ). Mirrors the BHS
// surface-explorer endpoints in shape — each non-BHS source has its own,
// independent lexicon built from the verse-text tokenization. No lemma
// collapse: these list surface forms only. Lemma-aware listing would need
// the user's tokens_greek table or a Ge'ez morphological analyzer.
export const apiSourceLexiconList = (src, params = {}) => {
  const qs = new URLSearchParams();
  if (params.q != null)     qs.set('q', params.q);
  if (params.limit != null) qs.set('limit', params.limit);
  if (params.offset != null)qs.set('offset', params.offset);
  const s = qs.toString();
  return jsonFetch(`/api/source/${encodeURIComponent(src)}/lexicon/list${s ? '?' + s : ''}`);
};
export const apiSourceLexiconWord = (src, word) =>
  jsonFetch(`/api/source/${encodeURIComponent(src)}/lexicon/word?word=${encodeURIComponent(word)}`);
// New: curated entries (from greek-/geez-lexicon.json) + heuristic roots.
// Both consumed by the unified /lexicon-page when lang != hebrew.
export const apiSourceLexiconCurated = (src) =>
  jsonFetch(`/api/source/${encodeURIComponent(src)}/lexicon/curated`);
export const apiSourceLexiconRoots = (src) =>
  jsonFetch(`/api/source/${encodeURIComponent(src)}/lexicon/roots`);
export const apiSourceLexiconVerses = (src, word, opts = {}) => {
  const qs = new URLSearchParams({ word });
  if (opts.book != null)  qs.set('book',  opts.book);
  if (opts.offset != null)qs.set('offset',opts.offset);
  if (opts.limit != null) qs.set('limit', opts.limit);
  return jsonFetch(`/api/source/${encodeURIComponent(src)}/lexicon/verses?${qs.toString()}`);
};

// ── Root/Surface explorer (NEW — surface-index driven) ──────────────────────
// These replace the older /api/nav/roots + /api/root + /api/surface chain
// for the BibleHub-style Root explorer page. They use token_surfaces.root_paleo
// for accurate aggregation and serve verse data with full token rendering.
export const apiRootList     = (q = '')               =>
  jsonFetch(`/api/root-explorer/list${q ? `?q=${encodeURIComponent(q)}` : ''}`);
export const apiRootDetail   = ({ sn, root } = {})    => {
  const p = new URLSearchParams();
  if (sn) p.set('sn', sn); else if (root) p.set('root', root);
  return jsonFetch(`/api/root-explorer/root?${p}`);
};
export const apiRootVerses   = ({ sn, root, book, offset = 0, limit = 25 }) => {
  const p = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (sn) p.set('sn', sn); else if (root) p.set('root', root);
  if (book != null) p.set('book', String(book));
  return jsonFetch(`/api/root-explorer/verses?${p}`);
};
// Batched "first canonical occurrence of these root LETTERS" lookup (see
// VersePage.jsx's word-by-word table) — one request for every distinct root
// a verse needs, aggregated server-side across every Strong's number that
// shares the exact spelling (so it isn't scoped to whichever number a
// particular occurrence happened to carry) and cached process-lifetime on
// the server, so this is fast even the first time a given root is asked
// for and instant every time after. Returns { results: { <paleo>:
// {book_id,book_name,chapter,verse} | null } }.
export const apiRootFirstByLetters = (roots) =>
  jsonFetch(`/api/root-explorer/first-by-letters?roots=${encodeURIComponent(roots.join(','))}`);
export const apiSurfaceList  = ({ q = '', offset = 0, limit = 200 } = {}) => {
  const p = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (q) p.set('q', q);
  return jsonFetch(`/api/surface-explorer/list?${p}`);
};
export const apiSurfaceDetail = (word, sn) => {
  const p = new URLSearchParams({ word });
  if (sn) p.set('sn', sn);
  return jsonFetch(`/api/surface-explorer/surface?${p}`);
};
export const apiSurfaceExplorerVerses = ({ word, book, offset = 0, limit = 25 }) => {
  const p = new URLSearchParams({ word, offset: String(offset), limit: String(limit) });
  if (book != null) p.set('book', String(book));
  return jsonFetch(`/api/surface-explorer/verses?${p}`);
};
// Batched sibling of apiRootFirstByLetters, same shape/caching, for exact
// surface forms (see VersePage.jsx's word-by-word table).
export const apiSurfaceFirstByWord = (words) =>
  jsonFetch(`/api/surface-explorer/first-by-word?words=${encodeURIComponent(words.join(','))}`);

// ── Legacy root-explorer (kept for back-compat — not used by new Root.jsx) ──
export const apiRootByStrongs = (sn)             => jsonFetch(`/api/root/by-strongs?sn=${encodeURIComponent(sn)}`);
export const apiRootByStrongsVerses = (qs)       => jsonFetch(`/api/root/by-strongs/verses?${qs}`);
export const apiRoot          = (qs)             => jsonFetch(`/api/root?${qs}`);
export const apiSurface       = (word)           => jsonFetch(`/api/surface?word=${encodeURIComponent(word)}`);
export const apiSurfaceVerses = (qs)             => jsonFetch(`/api/surface/verses?${qs}`);
export const apiSurfaceVersesRendered = (qs)     => jsonFetch(`/api/surface/verses/rendered?${qs}`);
export const apiNeighborsRoots    = (root)       => jsonFetch(`/api/nav/roots/neighbors?root=${encodeURIComponent(root)}`);
export const apiNeighborsSurfaces = (word)       => jsonFetch(`/api/nav/surfaces/neighbors?word=${encodeURIComponent(word)}`);

// ── Admin (cheatsheet rebuild + glyph save) ───────────────────────────────────
export const apiIndexStatus  = () => jsonFetch('/admin/index-status').catch(() => null);
export const apiRebuildIndexes = () => fetch('/admin/rebuild-indexes', { method:'POST' });
export const apiSaveGlyphs   = (payload) =>
  jsonFetch('/api/admin/save-glyphs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

// Location-keyed Strong's # overrides (one exact book/chapter/verse/token,
// not a whole spelling) — see strongs-location-overrides.json / the
// applyLocOverride* functions in server.js for why this exists separately
// from the surface-level lexicon overrides above.
export const apiAdminVerseTokens = (book, chapter, verse) =>
  jsonFetch(`/api/admin/verse-tokens?book=${book}&chapter=${chapter}&verse=${verse}`);
export const apiAdminListStrongsOverrides = () => jsonFetch('/api/admin/strongs-overrides');
export const apiAdminSaveStrongsOverride = (payload) => apiPost('/api/admin/strongs-override', payload);
export const apiAdminDeleteStrongsOverride = (key) => apiDelete(`/api/admin/strongs-override?key=${encodeURIComponent(key)}`);

// Gloss Studio — curation dashboard. All reads recompute live off the
// current lexicon.json + surface index; see server.js's getGlossCoverage().
// Both cover EVERY book with Hebrew material (BHS's 39 canonical OT books
// plus everything HEB-only: NT, Jubilees, Jasher, Book of Melchizedek, etc),
// each counted from its own natural edition server-side — no source param
// needed here. apiGlossCoverage fetches the WHOLE books->chapters->verses
// tree in one call (not a drill-down) — fetch once, cache client-side,
// navigate for free; call again only to explicitly re-sync with the server.
// source: 'BHS' (this book's natural edition — Masoretic for the 39
// canonical books, HEB for everything else) or 'HEB' (this project's OWN
// edition for every book it covers, including the canonical ones — its
// tokens for a canonical book can be different words than BHS's).
export const apiGlossMissing = (offset = 0, limit = 50, source = 'BHS') =>
  jsonFetch(`/api/admin/gloss-studio/missing?offset=${offset}&limit=${limit}&source=${source}`);
// source='ALL' (the default) is the cross-language aggregate that drives the
// Books/Chapters panes — glossed/total summed across every language, capped
// at 99% unless Translation Studio also has the verse marked 'done'. This
// does NOT change when the active language changes; only a specific
// language id (e.g. 'LXX'/'GEZ'/'BHS'/'HEB') asks for that one language's
// own tree instead.
export const apiGlossCoverage = (source = 'ALL') =>
  jsonFetch(`/api/admin/gloss-studio/coverage?source=${source}`);
// Book/chapter/verse NAVIGATION only (names + verse numbers + a total word
// count) — no glossed/pct/missing. Cheap and effectively static (doesn't
// change when lexicon.json is edited, only when surface-index.db itself is
// rebuilt), so the client fetches this FIRST to render the Books/Chapters
// pane instantly, then apiGlossCoverage() separately to fill percentages in
// once that (much more expensive, cross-language) computation resolves.
export const apiGlossStructure = (source = 'BHS') =>
  jsonFetch(`/api/admin/gloss-studio/structure?source=${source}`);
export const apiGlossVerse = (book, chapter, verse, source = 'BHS') =>
  jsonFetch(`/api/admin/gloss-studio/verse?book=${book}&chapter=${chapter}&verse=${verse}&source=${source}`);
export const apiGlossRootVerses = (root, offset = 0, limit = 20, source = 'BHS') =>
  jsonFetch(`/api/admin/gloss-studio/root-verses?root=${encodeURIComponent(root)}&offset=${offset}&limit=${limit}&source=${source}`);
// Per-language glossed/total for ONE verse, across every language at once —
// powers the vertical language pane's per-verse status badges.
export const apiGlossVerseStatus = (book, chapter, verse) =>
  jsonFetch(`/api/admin/gloss-studio/verse-status?book=${book}&chapter=${chapter}&verse=${verse}`);

// Generic — used by Translate to save a verse.
export async function apiPost(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json().catch(() => ({}));
}

export async function apiDelete(path) {
  const r = await fetch(path, { method: 'DELETE' });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json().catch(() => ({}));
}