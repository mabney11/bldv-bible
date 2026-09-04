'use strict';
/**
 * Prerendering — real static HTML for a bounded, well-understood set of
 * reader/tool pages, so a crawler (or a slow first paint) gets actual
 * title/description/content immediately instead of the bare
 * `<div id="root"></div>` shell every route otherwise ships. This app has no
 * server-side rendering — see CLAUDE.md / the 2026-08-14 SEO pass — and a
 * full SSR migration would mean rewriting how ~20 page components fetch
 * data. This is the low-risk alternative: snapshot a URL using the SAME
 * already-correct /api/* endpoints the real app calls (via a loopback HTTP
 * request — the server is already listening on PORT by the time any request
 * reaches this file), then serve that snapshot to anyone who requests that
 * exact URL, cached in memory (bounded — see `cache` below).
 *
 * This is NOT hydration. src/main.jsx does
 * `ReactDOM.createRoot(el).render(<App/>)`, which — unlike hydrateRoot —
 * unconditionally replaces #root's children the instant the JS bundle runs.
 * So there is zero hydration-mismatch risk: a real user sees this snapshot
 * for an instant on first load, then the interactive app takes over exactly
 * as it does today. Nothing about how any page/tool behaves changes.
 *
 * 2026-08-14: covered exactly the ~15 URLs in public/sitemap.xml (Genesis 1
 * only). 2026-08-14 (later same day): generalized the reader/parallel/
 * translate routes to any real book+chapter, and added the Greek/Ge'ez/
 * Latin reader — this is a real page-load-time win for actual traffic
 * (people don't only ever read Genesis 1), not just a crawler nicety.
 * 2026-08-14 (later still): added the Hebrew root explorer (/roots?sn=X,
 * ~8,600+ real Strong's-number entries, each with its own real title/
 * gloss/occurrence content) after a search for a real word ("yabanaal")
 * surfaced a generic /lexicon-page and an unrelated root instead of the
 * actual entry — there was no per-page content OR title to distinguish one
 * root from another. Deliberately still NOT covering the true unbounded
 * long tail (every concordance entry, every surface/inflected word form) —
 * that's what produced a flood of thin/broken indexed pages in the first
 * place (see the "bad corpus" fix); a wrong/missing canonical-identity
 * validation there would repeat that mistake. The root explorer is exempt
 * from that concern because its identity space is exact and bounded (every
 * `sn` comes straight from getRootNavIndex(), the same source the sitemap
 * is generated from — nothing free-text or guessable). Anything not
 * matched by ROUTES below falls through to the ordinary SPA shell, exactly
 * as before this file existed.
 *
 * 2026-08-15: /bible's verse route (englishVerseRoute) shipped as phase 1 of
 * "I want my entire corpus indexable and easily searchable like the other
 * bible tools" — a real per-verse page (translation text + that verse's
 * Hebrew tokens), not just a chapter snapshot with ?verse= collapsed away.
 * 2026-08-16 (phases 2 and 3): extended that same genuine-per-verse-body
 * treatment to /parallel, /translate (parallelVerseRoute/translateVerseRoute
 * — their body used to be identical for every verse in a chapter, which is
 * exactly why they were skipped in phase 1), the default "/" reader covering
 * BOTH Hebrew OT and Greek NT off one endpoint (hebrewVerseRoute — the
 * earlier version of this comment called the risk of reconstructing that
 * route's body "getting it subtly wrong"; a plain transliteration word list
 * turned out to carry none of that risk, since it's real text rather than a
 * glyph-shape reconstruction), and the Greek/Ge'ez/Latin source readers
 * (sourceChapterRoute's own new verseRoute). Also added slug resolution
 * (normalizeBookParam/ensureSlugMap): every route above validates `book` as
 * numeric-only, but real URLs use human-readable slugs (?book=luke, not just
 * ?book=42) — found via a real report asking to index
 * "https://www.bldbible.com/?book=luke&chapter=21&verse=1" — so without this
 * fix, slug URLs (the ones actually linked from the site's own nav) were
 * silently falling through to the bare SPA shell no matter how complete
 * ROUTES was otherwise.
 *
 * 2026-08-17: added the clean per-verse path route (/:bookSlug/:chapter/
 * :verse, e.g. /genesis/1/1 — VersePage.jsx) — see the "CLEAN VERSE-URL PATH
 * ROUTE" section below. Unlike everything above, this isn't an entry in
 * ROUTES (which only does exact-pathname lookups); renderSnapshot() pattern-
 * matches it separately, since the identity space is "any real book +
 * chapter + verse", not a fixed list of pathnames.
 */

const fs = require('fs');
const http = require('http');

const SITE = 'https://www.bldbible.com';
// 2026-08-15: "BLD Bible" is the primary brand everywhere now — mirrors
// src/hooks/usePageTitle.js's BRAND constant, so every snapshot's title uses
// exactly the same suffix the client sets on hydration (no title flash/
// mismatch). The older, longer "Blood-Line Descendant Bible Study Tool" name
// (itself a 2026-08-15 rebrand from "Paleo-Hebrew Translation Studio")
// survives only as index.html's JSON-LD alternateName, for search
// disambiguation — it is no longer used in any title or heading.
const BRAND = 'BLD Bible';
const LANDING_TITLE = `${BRAND}: Online Bible Study Tool`;
const APP_DESC = "Read Hebrew, Greek, Latin, Ge'ez and Syriac scripture word by word with Strong's numbers, a concordance, root and lexicon tools, and a Hebrew-backed English Bible translation.";

// Canonical 66-book table — mirrors server.js's TX_BOOK_NAMES exactly (kept
// as a separate copy on purpose: this module has no access to that
// function-scoped const, and duplicating a static 66-line lookup table is
// simpler and safer than reaching into server.js's internals from here).
const BOOK_NAMES = {
  1: 'Genesis', 2: 'Exodus', 3: 'Leviticus', 4: 'Numbers', 5: 'Deuteronomy',
  6: 'Joshua', 7: 'Judges', 8: 'Ruth', 9: '1 Samuel', 10: '2 Samuel',
  11: '1 Kings', 12: '2 Kings', 13: '1 Chronicles', 14: '2 Chronicles',
  15: 'Ezra', 16: 'Nehemiah', 17: 'Esther', 18: 'Job', 19: 'Psalms',
  20: 'Proverbs', 21: 'Ecclesiastes', 22: 'Song of Songs', 23: 'Isaiah',
  24: 'Jeremiah', 25: 'Lamentations', 26: 'Ezekiel', 27: 'Daniel', 28: 'Hosea',
  29: 'Joel', 30: 'Amos', 31: 'Obadiah', 32: 'Jonah', 33: 'Micah', 34: 'Nahum',
  35: 'Habakkuk', 36: 'Zephaniah', 37: 'Haggai', 38: 'Zechariah', 39: 'Malachi',
  40: 'Matthew', 41: 'Mark', 42: 'Luke', 43: 'John', 44: 'Acts', 45: 'Romans',
  46: '1 Corinthians', 47: '2 Corinthians', 48: 'Galatians', 49: 'Ephesians', 50: 'Philippians',
  51: 'Colossians', 52: '1 Thessalonians', 53: '2 Thessalonians', 54: '1 Timothy', 55: '2 Timothy',
  56: 'Titus', 57: 'Philemon', 58: 'Hebrews', 59: 'James', 60: '1 Peter', 61: '2 Peter',
  62: '1 John', 63: '2 John', 64: '3 John', 65: 'Jude', 66: 'Revelation',
};
// Psalms (19) is the longest book at 150 chapters — the real upper bound
// against which a `chapter` value is validated below.
const MAX_CHAPTER = 150;

function validBook(v) {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && BOOK_NAMES[n] ? n : null;
}
function validChapter(v) {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n >= 1 && n <= MAX_CHAPTER ? n : null;
}
// Separate from validChapter/MAX_CHAPTER: Psalm 119 alone has 176 verses,
// past MAX_CHAPTER's 150-chapter cap — a verse number this validates is only
// ever used cosmetically (appended to a title), not as a DB lookup key like
// book/chapter are, so a generous upper bound is fine.
function validVerseNum(v) {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n >= 1 && n <= 200 ? n : null;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function truncate(s, n) {
  const str = String(s ?? '').trim();
  return str.length <= n ? str : `${str.slice(0, n - 1).trimEnd()}…`;
}

// Loopback call to this same server's own /api/* — by the time any inbound
// request reaches this module, app.listen(PORT) has already succeeded, so
// this never touches the real network. Reuses the exact same handler code
// (and therefore the exact same correctness/edge-case handling — chapter
// snapping, translation overrides, etc.) that the real client calls,
// instead of re-querying the databases separately here.
function fetchJSON(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path, timeout: 4000 }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`${path} -> HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`timeout: ${path}`)));
  });
}

// ── BOOK SLUG RESOLUTION (2026-08-16) ────────────────────────────────────────
// Real URLs use human-readable slugs (?book=luke, ?book=psalms), not just raw
// canon_id numbers — see src/lib/bookSlug.js, which every reader page already
// resolves a slug through before it ever queries an API. Every route below
// validates `book` via validBook() (numeric-only, matching corpus.db's actual
// key). Without this step, a slug URL — including ones the site's own nav
// links, sitemap entries, or a real visitor/crawler actually use — would
// silently fail validBook() and fall through to the bare SPA shell, no matter
// how much of ROUTES is otherwise correct. Found via a real report: "so
// https://www.bldbible.com/?book=luke&chapter=21&verse=1 should be indexed" —
// that URL's `book=luke` is a slug, not a number.
//
// Mirrors buildBookSlugs()/resolveBookParam() in src/lib/bookSlug.js exactly
// (same slugify rule, same "lower canon_id wins the clean slug" collision
// rule) so a book resolves to the identical slug here as it does client-side —
// duplicated rather than imported since this module is CommonJS and that one
// is ESM (same reasoning as BOOK_NAMES above).
function slugify(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/['".,:;!?()[\]]/g, '')
    .replace(/&/g, 'and')
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
let _slugToId = null;   // cached for the life of the process — book order rarely changes; see loadShell's identical once-per-process reasoning
let _idToSlug = null;   // reverse of _slugToId, built alongside it — see resolveParallelPathBook below
async function ensureSlugMap(port) {
  if (_slugToId) return _slugToId;
  try {
    const list = await fetchJSON(port, '/api/book-order');
    const map = {};
    const rev = {};
    const used = {};
    for (const e of [...list].filter((x) => x && x.id != null).sort((a, b) => a.id - b.id)) {
      const base = slugify(e.name) || `book-${e.id}`;
      let slug = base, n = 1;
      while (used[slug] != null && used[slug] !== e.id) { n += 1; slug = `${base}-${n}`; }
      used[slug] = e.id;
      map[slug] = e.id;
      if (rev[e.id] == null) rev[e.id] = slug;
    }
    _slugToId = map;
    _idToSlug = rev;
  } catch {
    _slugToId = {};   // fetch failed — fall back to numeric-only, same behavior as before this existed
    _idToSlug = {};
  }
  return _slugToId;
}
// Resolves a URLSearchParams' `book` value IN PLACE to a canonical numeric id
// string, when it's a slug. Numeric values pass through untouched. Must run
// BEFORE any route's match()/build() sees `query` (see renderSnapshot below),
// so every existing validBook() check downstream keeps working unchanged, and
// a slug URL and its numeric equivalent share the exact same cache entry —
// consolidating them is correct for SEO too, the same reason englishChapterRoute
// already collapses ?verse= variants onto one canonical.
async function normalizeBookParam(query, port) {
  const raw = query.get('book');
  if (!raw || /^\d+$/.test(raw)) return;
  const map = await ensureSlugMap(port);
  const id = map[raw.toLowerCase()];
  if (id != null) query.set('book', String(id));
}

function versesArticle(heading, verses) {
  const items = (verses || [])
    .filter((v) => v && v.text)
    .map((v) => `<p><strong>${escapeHtml(v.verse)}</strong> ${escapeHtml(v.text)}</p>`)
    .join('\n      ');
  if (!items) return null;
  return `<h1>${escapeHtml(heading)}</h1>\n      ${items}`;
}

const NAV_LINKS = `
      <nav>
        <a href="/landing">Home</a> ·
        <a href="/bible?book=1&amp;chapter=1">Novel English Bible</a> ·
        <a href="/?book=1&amp;chapter=1">Hebrew Reader</a> ·
        <a href="/?source=LXX&amp;book=1&amp;chapter=1&amp;verse=1">Greek Scriptures</a> ·
        <a href="/?source=GEZ&amp;book=1&amp;chapter=1&amp;verse=1">Ge'ez Bible</a> ·
        <a href="/?source=LAT&amp;book=1&amp;chapter=1&amp;verse=1">Latin Vulgate</a> ·
        <a href="/parallel?book=1&amp;chapter=1">English–Hebrew Parallel</a> ·
        <a href="/translate?book=1&amp;chapter=1&amp;verse=1">Translation Studio</a> ·
        <a href="/works">Works Library</a> ·
        <a href="/models">Renderings &amp; Models</a> ·
        <a href="/lexicon-page">Lexicon</a> ·
        <a href="/cheatsheet">Token Cheatsheet</a> ·
        <a href="/roots">Root Explorer</a> ·
        <a href="/search">Search</a>
      </nav>`;

// A book+chapter reader page backed by /api/translate/chapter (English —
// used identically by /bible, /parallel and /translate; those three pages
// show the same underlying chapter text in different tools around it).
//
// `path` (the route's own pathname, e.g. '/bible') is used ONLY to build
// canonicalPath below — see that field's comment.
//
// `tabLabel` matches the exact suffix each client page's own usePageTitle
// call sets for its chapter-level (no verse selected) title — Reader.jsx
// ("Reader"), Parallel.jsx ("Parallel"), Translate.jsx ("Translation
// Studio") — so "Genesis 1 | Reader" is what both the crawler snapshot and
// the hydrated client agree on. None of these three routes' snapshots fetch
// per-verse data, so (unlike sourceChapterRoute below) there's no verse
// number or text preview to add even when the URL has one — matches the
// canonicalPath collapse just below, which already treats every ?verse=N
// variant of a chapter as the same page.
function englishChapterRoute(path, labelSuffix, tabLabel, description) {
  return {
    match: (q) => validBook(q.get('book')) && validChapter(q.get('chapter')),
    build: async (q, port) => {
      const book = validBook(q.get('book'));
      const chapter = validChapter(q.get('chapter'));
      const name = BOOK_NAMES[book];
      const data = await fetchJSON(port, `/api/translate/chapter?book=${book}&chapter=${chapter}&lang=BHS`);
      const heading = `${name} ${chapter} — ${labelSuffix}`;
      const body = versesArticle(heading, data.verses);
      return {
        title: `${name} ${chapter} | ${tabLabel}`,
        description: description(name, chapter),
        body: (body || `<h1>${escapeHtml(heading)}</h1>`) + NAV_LINKS,
        // 2026-08-15: a `site:bldbible.com john 6 15` search was surfacing
        // inconsistent, stale-looking titles because every ?verse=N (and
        // ?lang=, ?source=, ...) variant of the SAME chapter was getting
        // its own self-referencing canonical — this build() only ever
        // reads `book`/`chapter` off the query (see above), so a request
        // for .../6?verse=13 renders byte-for-byte the same snapshot as
        // .../6 with no verse at all. Google was indexing each variant it
        // happened to crawl as a distinct near-duplicate URL, with
        // whichever title got cached for THAT variant surfacing at
        // unpredictable times — hence "Reader | John 6:13" showing up for
        // a query about verse 15. Collapsing the canonical to book+chapter
        // (matching sitemap-chapters.xml, which only ever lists that
        // granularity) tells Google to consolidate every variant's
        // ranking signal onto the one URL that's actually in the sitemap.
        // src/App.jsx's SelfCanonical strips `verse` the same way for
        // these same three routes once React mounts, so the client-side
        // canonical (which runs after prerender's and would otherwise
        // silently re-introduce verse) agrees with this.
        canonicalPath: `${path}?book=${book}&chapter=${chapter}`,
      };
    },
  };
}

// A single English-reader VERSE page. 2026-08-15: "I want my entire corpus
// indexable and easily searchable like the other bible tools" (e.g.
// BibleHub, which indexes one real page per verse). This is phase 1 of that
// three-phase project: the flagship "read one verse, see its own Hebrew word
// by word" page. This route's body genuinely differs per verse — real
// translation text plus that verse's actual Hebrew tokens off
// /api/translate/verse — which is what makes a self-referencing per-verse
// canonical honest here.
//
// 2026-08-16: phases 2 and 3 (parallelVerseRoute/translateVerseRoute below,
// and hebrewVerseRoute + sourceChapterRoute's own verse route further down)
// extend this same genuine-per-verse-body treatment to /parallel,
// /translate, the default "/" reader (Hebrew OT + Greek NT together, one
// endpoint), and the Greek/Ge'ez/Latin source readers — closing the gap this
// comment used to describe ("/parallel and /translate deliberately do NOT
// get this treatment yet... nowhere else (yet)").
//
// Deliberately a SEPARATE, self-contained route rather than a branch inside
// englishChapterRoute, so that function's already-working canonical-collapse
// logic stays completely untouched. Tried FIRST in ROUTES['/bible'] (array
// order = match priority) — see below — so a real ?verse= gets this page;
// anything else falls through to the plain chapter route.
//
// "Real" is checked against ACTUAL fetched data, not just numeric range: an
// out-of-range or never-translated verse (empty `text`) falls back to
// building the exact same chapter snapshot englishChapterRoute would, so a
// content-less URL never gets indexed under its own canonical.
function englishVerseRoute() {
  const chapterFallback = englishChapterRoute(
    '/bible', 'Novel English Bible', 'Reader',
    (name, ch) => `${name} chapter ${ch} in the Novel English Bible — a clean English translation with Hebrew-backed names and places.`,
  );
  return {
    match: (q) => validBook(q.get('book')) && validChapter(q.get('chapter')) && !!validVerseNum(q.get('verse')),
    build: async (q, port) => {
      const book = validBook(q.get('book'));
      const chapter = validChapter(q.get('chapter'));
      const verse = validVerseNum(q.get('verse'));
      const name = BOOK_NAMES[book];

      let data = null;
      try {
        data = await fetchJSON(port, `/api/translate/verse?book=${book}&chapter=${chapter}&verse=${verse}`);
      } catch { /* falls through to the chapter snapshot below */ }

      if (!data || !data.text) return chapterFallback.build(q, port);

      const heading = `${name} ${chapter}:${verse}`;
      // data.tokens: { word_raw, strongs, ... }[] straight off tokens_bhs/
      // tokens_nt (see /api/translate/verse's txVerseQuery in server.js) —
      // the same Hebrew word data the reader itself would show for this verse.
      const wordItems = (data.tokens || [])
        .filter((t) => t && t.word_raw)
        .map((t) => `<li>${escapeHtml(t.word_raw)}${t.strongs ? ` — <a href="/roots?sn=${encodeURIComponent(t.strongs)}">${escapeHtml(t.strongs)}</a>` : ''}</li>`)
        .join('\n        ');

      return {
        title: `${heading} | Reader`,
        description: `${heading} — ${truncate(data.text, 140)}`,
        body: `<h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(data.text)}</p>
      ${wordItems ? `<h2>Hebrew, word by word</h2>\n      <ul>\n        ${wordItems}\n      </ul>` : ''}${NAV_LINKS}`,
        // Self-referencing on purpose — NOT collapsed to book+chapter, unlike
        // englishChapterRoute — see this function's header comment for why a
        // verse-level identity is legitimate here.
        canonicalPath: `/bible?book=${book}&chapter=${chapter}&verse=${verse}`,
      };
    },
  };
}

// ── VERSE PREVIEW HELPERS (mirror src/lib/versePreview.js) ──────────────────
// Same reasoning as slugify/BOOK_NAMES above: this module is CommonJS, that
// one's ESM, so small stateless helpers are duplicated here rather than
// imported. Keep in sync with versePreview.js if that file's logic changes —
// the whole point is a prerendered title matching the client's hydrated
// title exactly (no title-flash mismatch), the same rule every route here
// follows. Unlike the client versions, these have no `translit(word_raw)`
// fallback for a token with no `components` (that fallback needs books.js's
// own translit(), a client-only ESM import) — acceptable here since real
// BHS/NT/HEB tokens always carry components, and a prerendered preview
// missing an occasional edge-case word degrades gracefully (still real text,
// just slightly less complete), unlike the client which must always show
// something.
function translitPreview(words) {
  if (!words || !words.length) return '';
  return words
    .map((w) => (w.components?.length
      ? w.components.filter((c) => !c.isMark).map((c) => c.translit).filter(Boolean).join('')
      : ''))
    .filter(Boolean)
    .join(' ');
}
function translitGlossPreview(words) {
  if (!words || !words.length) return '';
  return words
    .map((w) => {
      const comps = (w.components?.length ? w.components : []).filter((c) => !c.isMark);
      const tl = comps.map((c) => c.translit || '').join('');
      if (!tl) return '';
      const glosses = comps.map((c) => c.translation || c.gloss || '').filter(Boolean);
      return glosses.length ? `${tl} (${glosses.join('-')})` : tl;
    })
    .filter(Boolean)
    .join(' ');
}
function multiTokensPreview(tokens) {
  if (!tokens || !tokens.length) return '';
  return tokens
    .filter((t) => !t.is_punct)
    .map((t) => (t.gloss ? `${t.word} (${t.gloss})` : t.word))
    .filter(Boolean)
    .join(' ');
}

// A single Parallel VERSE page — phase 2 of the indexability project (see
// englishVerseRoute above for phase 1). Its prerendered body used to be
// identical no matter what ?verse= said; this makes it genuinely differ per
// verse by pulling that verse's own BHS tokens (/api/tokens) alongside its
// English text (/api/translate/verse) — real content a per-verse canonical
// can honestly claim, same reasoning as englishVerseRoute above.
//
// Title matches Parallel.jsx's titlePreviewParts exactly: "<ref> | Parallel
// | <English preview> | <source transliteration preview>" — see
// hooks/usePageTitle.js's documented convention and versePreviewTranslit
// (mirrored above as translitPreview).
function parallelVerseRoute() {
  const chapterFallback = englishChapterRoute(
    '/parallel', 'English–Hebrew Parallel', 'Parallel',
    (name, ch) => `Read ${name} ${ch} in English and Hebrew side by side, verse by verse.`,
  );
  return {
    match: (q) => validBook(q.get('book')) && validChapter(q.get('chapter')) && !!validVerseNum(q.get('verse')),
    build: async (q, port) => {
      const book = validBook(q.get('book'));
      const chapter = validChapter(q.get('chapter'));
      const verse = validVerseNum(q.get('verse'));
      const name = BOOK_NAMES[book];

      let txData = null, tokens = [];
      try {
        [txData, tokens] = await Promise.all([
          fetchJSON(port, `/api/translate/verse?book=${book}&chapter=${chapter}&verse=${verse}`),
          fetchJSON(port, `/api/tokens?book=${book}&chapter=${chapter}`).catch(() => []),
        ]);
      } catch { /* falls through to the chapter snapshot below */ }

      const verseWords = Array.isArray(tokens) ? tokens.filter((t) => t && t.verse === verse) : [];
      const enText = (txData && txData.text) || '';
      if (!enText && !verseWords.length) return chapterFallback.build(q, port);

      const heading = `${name} ${chapter}:${verse}`;
      const srcPreview = translitPreview(verseWords);
      const wordItems = verseWords
        .filter((w) => w && w.components?.length)
        .map((w) => {
          const label = w.components.filter((c) => !c.isMark).map((c) => c.translit).filter(Boolean).join('');
          return `<li>${escapeHtml(label)}${w.strongs ? ` — <a href="/roots?sn=${encodeURIComponent(w.strongs)}">${escapeHtml(w.strongs)}</a>` : ''}</li>`;
        })
        .join('\n        ');

      return {
        title: [heading, 'Parallel', truncate(enText, 60), truncate(srcPreview, 60)].filter(Boolean).join(' | '),
        description: `Read ${heading} in English and Hebrew side by side.${enText ? ` ${truncate(enText, 140)}` : ''}`,
        body: `<h1>${escapeHtml(heading)}</h1>
      ${enText ? `<p>${escapeHtml(enText)}</p>` : ''}
      ${wordItems ? `<h2>Hebrew, word by word</h2>\n      <ul>\n        ${wordItems}\n      </ul>` : ''}${NAV_LINKS}`,
        canonicalPath: `/parallel?book=${book}&chapter=${chapter}&verse=${verse}`,
      };
    },
  };
}

// A single Translation Studio VERSE page — phase 2, same reasoning as
// parallelVerseRoute above. Body shows this verse's actual translation
// (status + text) plus its Hebrew tokens, matching what a real visit shows.
// Title matches Translate.jsx's own convention exactly: "<ref> | Translation
// Studio" (formatRef already includes the verse number when present — see
// hooks/usePageTitle.js's documented convention) — no live preview segment,
// since Translate.jsx's own usePageTitle call doesn't build one either.
function translateVerseRoute() {
  const chapterFallback = englishChapterRoute(
    '/translate', 'Translation Studio', 'Translation Studio',
    (name, ch) => `Translate ${name} ${ch} verse by verse, linked back to the original Hebrew.`,
  );
  return {
    match: (q) => validBook(q.get('book')) && validChapter(q.get('chapter')) && !!validVerseNum(q.get('verse')),
    build: async (q, port) => {
      const book = validBook(q.get('book'));
      const chapter = validChapter(q.get('chapter'));
      const verse = validVerseNum(q.get('verse'));
      const name = BOOK_NAMES[book];

      let data = null;
      try {
        data = await fetchJSON(port, `/api/translate/verse?book=${book}&chapter=${chapter}&verse=${verse}`);
      } catch { /* falls through to the chapter snapshot below */ }

      if (!data || !data.text) return chapterFallback.build(q, port);

      const heading = `${name} ${chapter}:${verse}`;
      const wordItems = (data.tokens || [])
        .filter((t) => t && t.word_raw)
        .map((t) => `<li>${escapeHtml(t.word_raw)}${t.strongs ? ` — <a href="/roots?sn=${encodeURIComponent(t.strongs)}">${escapeHtml(t.strongs)}</a>` : ''}</li>`)
        .join('\n        ');
      const statusLabel = data.status === 'done' ? 'Complete' : data.status === 'in_progress' ? 'In progress' : 'Draft';

      return {
        title: `${heading} | Translation Studio`,
        description: `Translate ${heading} verse by verse, linked back to the original Hebrew. ${truncate(data.text, 120)}`,
        body: `<h1>${escapeHtml(heading)} — Translation Studio</h1>
      <p><em>${escapeHtml(statusLabel)}</em></p>
      <p>${escapeHtml(data.text)}</p>
      ${wordItems ? `<h2>Hebrew, word by word</h2>\n      <ul>\n        ${wordItems}\n      </ul>` : ''}${NAV_LINKS}`,
        canonicalPath: `/translate?book=${book}&chapter=${chapter}&verse=${verse}`,
      };
    },
  };
}

// A book+chapter reader page backed by /api/source/:src/chapter (Greek
// Septuagint/NT, Ge'ez, Latin Vulgate — sources with flat verse text, unlike
// Hebrew's tokenized glyph data; see the '/' route's comment below).
//
// `tabLabel` matches MultiViewer.jsx's SOURCE_LABELS entry for this source
// exactly (client: "<book> <ch>[:<verse>] | <tabLabel>[ | <preview>]") —
// `label` stays the fuller human-readable name used in this snapshot's own
// heading/description prose, which is free to differ. public/sitemap.xml's
// curated entries for this route always include `&verse=1` (see
// canonicalPath's comment below), so the title includes the verse number
// too when present, matching what a real visit to that exact URL shows —
// just without the word-by-word preview text, since this route only ever
// fetches flat per-verse text (no gloss data) and adding a second fetch
// just for the title isn't worth it for a component the crawler never runs.
//
// Returns [verseRoute, chapterRoute] — 2026-08-16, phase 3 of the
// indexability project (see englishVerseRoute/parallelVerseRoute/
// translateVerseRoute above for phases 1-2). verseRoute is backed by
// /api/source/:src/verse (the same call MultiViewer.jsx's own verse mode
// makes), so its body genuinely differs per verse — real flat verse text
// plus a translit(+gloss) preview off that verse's own tokens, the same data
// MultiViewer's tab title already previews via versePreviewMultiTokens
// (mirrored above as multiTokensPreview). Falls back to chapterRoute (this
// function's original, unchanged behavior) when a requested verse has no
// real data, so a content-less URL never gets indexed under its own
// canonical — same "real data check, not just numeric range" rule every
// other verse route here follows.
function sourceChapterRoute(src, label, tabLabel) {
  const chapterRoute = {
    match: (q) => q.get('source') === src && validBook(q.get('book')) && validChapter(q.get('chapter')),
    build: async (q, port) => {
      const book = validBook(q.get('book'));
      const chapter = validChapter(q.get('chapter'));
      const name = BOOK_NAMES[book];
      const verse = validVerseNum(q.get('verse'));
      const data = await fetchJSON(port, `/api/source/${src}/chapter?book=${book}&chapter=${chapter}`);
      const heading = `${name} ${chapter} — ${label}`;
      const body = versesArticle(heading, data.verses);
      return {
        title: `${name} ${chapter}${verse ? `:${verse}` : ''} | ${tabLabel}`,
        description: `${name} chapter ${chapter} in the ${label}.`,
        body: (body || `<h1>${escapeHtml(heading)}</h1>`) + NAV_LINKS,
        // Deliberately NOT collapsing ?verse= here the way
        // englishChapterRoute does below — public/sitemap.xml's curated
        // entries for this route intentionally include `&verse=1` (the
        // opening-verse convention for these source landing links), so
        // stripping it would make this page's own canonical disagree with
        // the URL the sitemap tells Google to index.
      };
    },
  };
  const verseRoute = {
    match: (q) => q.get('source') === src && validBook(q.get('book')) && validChapter(q.get('chapter')) && !!validVerseNum(q.get('verse')),
    build: async (q, port) => {
      const book = validBook(q.get('book'));
      const chapter = validChapter(q.get('chapter'));
      const verse = validVerseNum(q.get('verse'));
      const name = BOOK_NAMES[book];

      let data = null;
      try { data = await fetchJSON(port, `/api/source/${src}/verse?book=${book}&chapter=${chapter}&verse=${verse}`); }
      catch { /* falls through to the chapter snapshot below */ }

      if (!data || !data.text) return chapterRoute.build(q, port);

      const heading = `${name} ${chapter}:${verse}`;
      const preview = multiTokensPreview(data.tokens);

      return {
        title: [heading, tabLabel, truncate(preview, 70)].filter(Boolean).join(' | '),
        description: `${heading} in the ${label}.${data.text ? ` ${truncate(data.text, 140)}` : ''}`,
        body: `<h1>${escapeHtml(heading)} — ${escapeHtml(label)}</h1>
      <p>${escapeHtml(data.text)}</p>${NAV_LINKS}`,
        canonicalPath: `/?source=${src}&book=${book}&chapter=${chapter}&verse=${verse}`,
      };
    },
  };
  return [verseRoute, chapterRoute];
}

// A single default-reader ("/", no ?source=) VERSE page — phase 3, same
// reasoning as sourceChapterRoute's verseRoute above. This is the ORIGINAL
// Hebrew/Greek-NT tokenized reader (HebrewViewer.jsx) — the "/" route's
// chapter-only candidate below was deliberately left without verse-level
// treatment because "reconstructing real body text from [tokenized
// Paleo-Hebrew glyph data] risks getting it subtly wrong". That risk was
// about rendering actual GLYPH SHAPES; a plain transliteration word list —
// the same data + the same extraction versePreviewWithGloss already uses for
// this exact page's own tab title (mirrored above as translitGlossPreview)
// — carries none of that risk, since it's real text, not a glyph
// reconstruction. /api/tokens already unifies OT (tokens_bhs) and NT
// (tokens_nt) under one endpoint by book_id — see server.js's
// inBhsMeta/inNtTokens branch — so this single route covers the whole
// corpus, not just the Hebrew OT: "I want raw readers too... so
// https://www.bldbible.com/?book=luke&chapter=21&verse=1 should be indexed"
// (Luke is NT; /api/tokens serves it from tokens_nt automatically).
// Title matches HebrewViewer.jsx's hvTitleParts exactly: "<ref> | Hebrew |
// <translit+gloss preview>".
function hebrewVerseRoute() {
  const chapterFallback = {
    match: () => true,
    build: async (q) => {
      const book = validBook(q.get('book'));
      const chapter = validChapter(q.get('chapter'));
      const name = BOOK_NAMES[book];
      const verse = validVerseNum(q.get('verse'));
      return {
        title: `${name} ${chapter}${verse ? `:${verse}` : ''} | Hebrew`,
        description: `${name} chapter ${chapter} in the original Paleo-Hebrew, word by word, with roots, Strong's numbers and glosses.`,
        body: `<h1>${escapeHtml(name)} ${chapter} — Hebrew Reader</h1>
      <p>${escapeHtml(name)} ${chapter}, in the original Paleo-Hebrew script, word by word.</p>${NAV_LINKS}`,
      };
    },
  };
  return {
    match: (q) => validBook(q.get('book')) && validChapter(q.get('chapter')) && !q.get('source') && !!validVerseNum(q.get('verse')),
    build: async (q, port) => {
      const book = validBook(q.get('book'));
      const chapter = validChapter(q.get('chapter'));
      const verse = validVerseNum(q.get('verse'));
      const name = BOOK_NAMES[book];

      let tokens = null;
      try { tokens = await fetchJSON(port, `/api/tokens?book=${book}&chapter=${chapter}`); }
      catch { /* falls through to the chapter snapshot below */ }

      const verseWords = Array.isArray(tokens) ? tokens.filter((t) => t && t.verse === verse) : [];
      if (!verseWords.length) return chapterFallback.build(q, port);

      const heading = `${name} ${chapter}:${verse}`;
      const preview = translitGlossPreview(verseWords);
      const wordItems = verseWords
        .filter((w) => w && w.components?.length)
        .map((w) => {
          const label = w.components.filter((c) => !c.isMark).map((c) => c.translit).filter(Boolean).join('');
          return `<li>${escapeHtml(label)}${w.strongs ? ` — <a href="/roots?sn=${encodeURIComponent(w.strongs)}">${escapeHtml(w.strongs)}</a>` : ''}</li>`;
        })
        .join('\n        ');

      return {
        title: [heading, 'Hebrew', truncate(preview, 70)].filter(Boolean).join(' | '),
        description: `${heading} in the original Paleo-Hebrew, word by word, with roots, Strong's numbers and glosses.${preview ? ` ${truncate(preview, 140)}` : ''}`,
        body: `<h1>${escapeHtml(heading)} — Hebrew Reader</h1>
      ${wordItems ? `<ul>\n        ${wordItems}\n      </ul>` : ''}${NAV_LINKS}`,
        canonicalPath: `/?book=${book}&chapter=${chapter}&verse=${verse}`,
      };
    },
  };
}

// ── CLEAN VERSE-URL PATH ROUTE (/:bookSlug/:chapter/:verse) ────────────────
// 2026-08-17: VersePage.jsx's own header comment flagged this gap directly:
// "this page is intentionally a client-only route, not (yet) prerendered...
// If that's wanted later, prerender.js's ROUTES dispatch would need a
// pattern-matched entry for /:bookSlug/:chapter/:verse alongside the
// existing exact-pathname routes." That's what this section adds — every
// route above is keyed by an EXACT pathname in ROUTES (e.g. '/bible'), which
// can't represent "any of tens of thousands of /genesis/1/1-style paths";
// this one is pattern-matched instead, in renderSnapshot() below.
//
// IMPORTANT: the slug here resolves against /api/translate/progress's OWN
// book list — NOT /api/book-order, which every OTHER route above uses (see
// ensureSlugMap/normalizeBookParam). This is deliberate: VersePage.jsx
// itself (src/pages/VersePage.jsx, ~line 45) builds ITS slug map from
// apiTransProgress()'s `books`, not apiBookOrder() like Reader.jsx/
// Parallel.jsx/Translate.jsx do — a snapshot built off book-order could
// therefore resolve a slug differently than the real hydrated page does for
// the exact same URL. Two separate slug sources already coexist in this app
// pre-dating this change (worth eventually unifying — flagged, not fixed,
// here); this route mirrors the one the page it's snapshotting actually
// uses, so crawler and hydrated client always agree.
const VERSE_PATH_RE = /^\/([a-z0-9-]+)\/(\d{1,3})\/(\d{1,3})$/;

let _progressSlugMaps = null; // { slugToId, idToSlug, idToName }
async function ensureProgressSlugMaps(port) {
  if (_progressSlugMaps) return _progressSlugMaps;
  try {
    const data = await fetchJSON(port, '/api/translate/progress');
    const list = (data && data.books) || [];
    const slugToId = {}, idToSlug = {}, idToName = {}, used = {};
    // Same sort-by-id + collision rule as src/lib/bookSlug.js's
    // buildBookSlugs (duplicated here — CommonJS vs ESM, same reasoning as
    // every other small duplicated helper in this file).
    for (const e of [...list].filter((x) => x && x.book_id != null).sort((a, b) => a.book_id - b.book_id)) {
      const id = e.book_id;
      const base = slugify(e.name) || `book-${id}`;
      let slug = base, n = 1;
      while (used[slug] != null && used[slug] !== id) { n += 1; slug = `${base}-${n}`; }
      used[slug] = id;
      if (idToSlug[id] == null) idToSlug[id] = slug;
      slugToId[slug] = id;
      idToName[id] = e.name;
    }
    _progressSlugMaps = { slugToId, idToSlug, idToName };
  } catch {
    _progressSlugMaps = { slugToId: {}, idToSlug: {}, idToName: {} };
  }
  return _progressSlugMaps;
}

// Resolves a /:bookSlug/... path segment — slug OR numeric id, mirroring
// resolveBookParam's "numbers pass through" rule — to { id, canonicalSlug,
// name }, or null if it doesn't resolve to any real, translatable book.
async function resolveVersePathBook(raw, port) {
  const maps = await ensureProgressSlugMaps(port);
  let id = null;
  if (/^\d+$/.test(raw)) id = parseInt(raw, 10);
  else id = maps.slugToId[String(raw).toLowerCase()] ?? null;
  if (id == null || !maps.idToName[id]) return null;
  return { id, canonicalSlug: maps.idToSlug[id] || String(id), name: maps.idToName[id] };
}

// Builds one clean verse-URL snapshot. Mirrors englishVerseRoute's shape
// (same /api/translate/verse call, same word+Strong's-number list body)
// rather than trying to reproduce VersePage.jsx's own richer word-by-word
// table (root/translit/definition/modifications columns via
// computeWordParts) — that logic is React-component-shaped and client-only;
// a simpler real word+Strong's list degrades gracefully for a crawler the
// same way every other route's preview here does (see translitPreview's own
// comment on this exact tradeoff).
async function buildVersePathSnapshot(match, port) {
  const [, slugRaw, chapterRaw, verseRaw] = match;
  const resolved = await resolveVersePathBook(slugRaw, port);
  const chapter = validChapter(chapterRaw);
  const verse = validVerseNum(verseRaw);
  // No snapshot for a bogus address — matches VersePage.jsx's own "That
  // verse address isn't recognized" state, same as every other route's
  // invalid-input case here (falls through to the plain SPA shell).
  if (!resolved || !chapter || !verse) return null;
  const { id: book, canonicalSlug, name } = resolved;
  const heading = `${name} ${chapter}:${verse}`;
  const canonicalPath = `/${canonicalSlug}/${chapter}/${verse}`;

  let data = null;
  try { data = await fetchJSON(port, `/api/translate/verse?book=${book}&chapter=${chapter}&verse=${verse}`); }
  catch { /* no text yet — falls through to the "doesn't have text yet" snapshot below, matching VersePage.jsx's own rd-state for this exact case (see the screenshot that prompted this section: /malachi/4/2 before the versification fix deployed) */ }

  if (!data || !data.text) {
    const chapterHref = `/bible?book=${encodeURIComponent(canonicalSlug)}&chapter=${chapter}&verse=${verse}`;
    return {
      title: `${heading} | Reader`,
      description: `${heading} doesn't have English text yet in ${BRAND}.`,
      body: `<h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(heading)} doesn't have English text yet.</p>
      <p><a href="${chapterHref}">Open the chapter in the Reader →</a></p>${NAV_LINKS}`,
      canonicalPath,
    };
  }

  const wordItems = (data.tokens || [])
    .filter((t) => t && t.word_raw)
    .map((t) => `<li>${escapeHtml(t.word_raw)}${t.strongs ? ` — <a href="/roots?sn=${encodeURIComponent(t.strongs)}">${escapeHtml(t.strongs)}</a>` : ''}</li>`)
    .join('\n        ');

  return {
    title: `${heading} | Reader`,
    description: `${heading} — ${truncate(data.text, 140)}`,
    body: `<h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(data.text)}</p>
      ${wordItems ? `<h2>Hebrew, word by word</h2>\n      <ul>\n        ${wordItems}\n      </ul>` : ''}${NAV_LINKS}`,
    canonicalPath,
  };
}

// ── CLEAN PARALLEL-VIEW PATH ROUTE (/parallel/:bookSlug/:chapterVerse) ─────
// 2026-08-18: fieldy wants Parallel's own URLs to look like
// /parallel/deuteronomy/13-3 (chapter and verse joined by a hyphen in one
// path segment, mirroring biblehub.com/interlinear/deuteronomy/13-3.htm) —
// see src/lib/bookSlug.js's parallelHref, which is what src/pages/Parallel.jsx
// itself now writes to the address bar, and what every in-app link into
// Parallel now points at. Same pattern-matched-after-ROUTES approach as
// VERSE_PATH_RE/buildVersePathSnapshot above, but resolves the slug against
// THIS module's own book-order-based ensureSlugMap (not
// ensureProgressSlugMaps) — Parallel.jsx builds its own slug map from
// /api/book-order, the same source every other route in this file already
// resolves against; VersePage.jsx is the one deliberate exception (see that
// route's own comment for why).
//
// DELIBERATELY ADDITIVE, NOT A CANONICAL SWAP: the existing '/parallel'
// ROUTES entry (parallelVerseRoute/englishChapterRoute above) still owns the
// query-string URL's own self-referencing canonical, and public/sitemap.xml /
// sitemap-chapters.xml still list that query-string form — none of that
// changes here. This just means a crawler or link-unfurl hitting the NEW path
// URL (which src/App.jsx's ParallelDispatcher sends real browsers to, and
// which every in-app link now generates) gets real content instead of a bare
// shell too, with an honest self-referencing canonical of its own. Fully
// consolidating canonical/sitemap signal onto the path form — the way
// VERSE_PATH_RE's own canonical works for VersePage — is a separate,
// deliberate decision for later, not made here.
const PARALLEL_PATH_RE = /^\/parallel\/([a-z0-9-]+)(?:\/(\d{1,3})(?:-(\d{1,3}))?)?$/;

async function resolveParallelPathBook(raw, port) {
  await ensureSlugMap(port);   // populates both _slugToId and _idToSlug together
  let id = null;
  if (/^\d+$/.test(raw)) id = parseInt(raw, 10);
  else id = _slugToId[String(raw).toLowerCase()] ?? null;
  if (id == null || !BOOK_NAMES[id]) return null;
  return { id, canonicalSlug: _idToSlug[id] || String(id), name: BOOK_NAMES[id] };
}

// Mirrors parallelVerseRoute()'s content exactly (same /api/translate/verse +
// /api/tokens calls, same title/description shape — see that function's own
// comments for the full rationale) fed from path segments instead of
// ?book=&chapter=&verse=, falling back to a chapter-only snapshot (mirrors
// englishChapterRoute's own body-building, book+chapter only) when the path
// has no chapter/verse segment at all (bare /parallel/deuteronomy, chapter
// defaults to 1 — matching Parallel.jsx's own default) or no verse segment
// (/parallel/deuteronomy/13).
async function buildParallelPathSnapshot(match, port) {
  const [, slugRaw, chapterRaw, verseRaw] = match;
  const resolved = await resolveParallelPathBook(slugRaw, port);
  const chapter = validChapter(chapterRaw || '1');
  if (!resolved || !chapter) return null;
  const { id: book, canonicalSlug, name } = resolved;
  const verse = verseRaw ? validVerseNum(verseRaw) : null;

  const buildChapterSnapshot = async () => {
    const data = await fetchJSON(port, `/api/translate/chapter?book=${book}&chapter=${chapter}&lang=BHS`);
    const heading = `${name} ${chapter} — English–Hebrew Parallel`;
    const body = versesArticle(heading, data.verses);
    return {
      title: `${name} ${chapter} | Parallel`,
      description: `Read ${name} ${chapter} in English and Hebrew side by side, verse by verse.`,
      body: (body || `<h1>${escapeHtml(heading)}</h1>`) + NAV_LINKS,
      canonicalPath: `/parallel/${canonicalSlug}/${chapter}`,
    };
  };

  if (!verse) return buildChapterSnapshot();

  let txData = null, tokens = [];
  try {
    [txData, tokens] = await Promise.all([
      fetchJSON(port, `/api/translate/verse?book=${book}&chapter=${chapter}&verse=${verse}`),
      fetchJSON(port, `/api/tokens?book=${book}&chapter=${chapter}`).catch(() => []),
    ]);
  } catch { /* falls through to the chapter snapshot below */ }

  const verseWords = Array.isArray(tokens) ? tokens.filter((t) => t && t.verse === verse) : [];
  const enText = (txData && txData.text) || '';
  if (!enText && !verseWords.length) return buildChapterSnapshot();

  const heading = `${name} ${chapter}:${verse}`;
  const srcPreview = translitPreview(verseWords);
  const wordItems = verseWords
    .filter((w) => w && w.components?.length)
    .map((w) => {
      const label = w.components.filter((c) => !c.isMark).map((c) => c.translit).filter(Boolean).join('');
      return `<li>${escapeHtml(label)}${w.strongs ? ` — <a href="/roots?sn=${encodeURIComponent(w.strongs)}">${escapeHtml(w.strongs)}</a>` : ''}</li>`;
    })
    .join('\n        ');

  return {
    title: [heading, 'Parallel', truncate(enText, 60), truncate(srcPreview, 60)].filter(Boolean).join(' | '),
    description: `Read ${heading} in English and Hebrew side by side.${enText ? ` ${truncate(enText, 140)}` : ''}`,
    body: `<h1>${escapeHtml(heading)}</h1>
      ${enText ? `<p>${escapeHtml(enText)}</p>` : ''}
      ${wordItems ? `<h2>Hebrew, word by word</h2>\n      <ul>\n        ${wordItems}\n      </ul>` : ''}${NAV_LINKS}`,
    canonicalPath: `/parallel/${canonicalSlug}/${chapter}-${verse}`,
  };
}

// pathname (req.path, no query string) -> ARRAY of { match(query), build }
// candidates, tried in order (first match wins) — needed because "/" now
// serves several different snapshots depending on ?source=. Query variations
// not covered by any candidate's `match` fall through to the plain SPA shell
// instead of serving a snapshot that doesn't actually match what was asked.
const ROUTES = {
  '/landing': [{
    match: () => true,
    build: async () => ({
      // Matches Landing.jsx's own usePageTitle call exactly — see that
      // file's comment for why this isn't the generic pageTitle() suffix.
      title: LANDING_TITLE,
      description: APP_DESC,
      // Mirrors the hero on Landing.jsx: "BLD Bible" (the h1) / "Online
      // Bible Study Tool" (the subheading span) — a real <h2>, not a <span>,
      // since this snapshot has no CSS to style a span as a subheading.
      body: `<h1>${escapeHtml(BRAND)}</h1>
      <h2>Online Bible Study Tool</h2>
      <p>Hebrew · Greek · Latin · Ge'ez — scriptures, plus a library of works.</p>${NAV_LINKS}`,
    }),
  }],

  // Verse routes (a real ?verse=) are tried BEFORE their plain chapter
  // fallback — see each verse route's own comment for why.
  '/bible': [englishVerseRoute(), englishChapterRoute(
    '/bible', 'Novel English Bible', 'Reader',
    (name, ch) => `${name} chapter ${ch} in the Novel English Bible — a clean English translation with Hebrew-backed names and places.`,
  )],

  '/parallel': [parallelVerseRoute(), englishChapterRoute(
    '/parallel', 'English–Hebrew Parallel', 'Parallel',
    (name, ch) => `Read ${name} ${ch} in English and Hebrew side by side, verse by verse.`,
  )],

  '/translate': [translateVerseRoute(), englishChapterRoute(
    '/translate', 'Translation Studio', 'Translation Studio',
    (name, ch) => `Translate ${name} ${ch} verse by verse, linked back to the original Hebrew.`,
  )],

  // "/" serves several different things depending on ?source=: the default
  // Hebrew+NT reader (no source param), or one of the flat-text sources
  // below. Order matters — the default-reader candidates must be checked
  // with !q.get('source') so they don't swallow the source-specific
  // requests; each verse candidate is tried before its own chapter fallback,
  // same rule as /bible/parallel/translate above.
  '/': [
    // tabLabel args match MultiViewer.jsx's SOURCE_LABELS exactly (LXX/GEZ/LAT).
    // sourceChapterRoute returns [verseRoute, chapterRoute] — spread both in.
    ...sourceChapterRoute('LXX', 'Greek Septuagint & New Testament', 'Greek Scriptures'),
    ...sourceChapterRoute('GEZ', "Ge'ez Bible", "Ge'ez (BETMAS)"),
    ...sourceChapterRoute('LAT', 'Latin Vulgate', 'Latin (Vulgate)'),
    hebrewVerseRoute(),
    {
      // Default Hebrew+NT reader's plain chapter fallback (the Landing
      // page's primary CTA, and what hebrewVerseRoute above falls back to
      // for a verse with no real token data). Title + description are still
      // real and book/chapter-specific even without a per-verse preview.
      match: (q) => validBook(q.get('book')) && validChapter(q.get('chapter')) && !q.get('source'),
      build: async (q) => {
        const book = validBook(q.get('book'));
        const chapter = validChapter(q.get('chapter'));
        const name = BOOK_NAMES[book];
        // Matches HebrewViewer.jsx's title exactly: "<book> <ch>[:<verse>] |
        // Hebrew[ | <preview>]" — no preview here since this route doesn't
        // fetch the tokenized data a preview would need (hebrewVerseRoute
        // above handles the real-?verse= case with one).
        const verse = validVerseNum(q.get('verse'));
        return {
          title: `${name} ${chapter}${verse ? `:${verse}` : ''} | Hebrew`,
          description: `${name} chapter ${chapter} in the original Paleo-Hebrew, word by word, with roots, Strong's numbers and glosses.`,
          body: `<h1>${escapeHtml(name)} ${chapter} — Hebrew Reader</h1>
      <p>${escapeHtml(name)} ${chapter}, in the original Paleo-Hebrew script, word by word.</p>${NAV_LINKS}`,
        };
      },
    },
  ],

  '/works': [{
    match: () => true,
    build: async (q, port) => {
      let list = [];
      try { list = await fetchJSON(port, '/api/works'); } catch { /* fall through to nav-only */ }
      const items = list.slice(0, 40)
        .map((w) => `<li>${escapeHtml(w.title)}${w.category ? ` — <em>${escapeHtml(w.category)}</em>` : ''}</li>`)
        .join('\n        ');
      return {
        // Matches Works.jsx's usePageTitle(pageTitle('Works')) exactly —
        // NOT "Works Library" (the descriptive prose below still says that).
        title: `Works | ${BRAND}`,
        description: "A library of literary works across Hebrew, Greek, Latin and Ge'ez — scrolls, apocrypha and more, alongside the canonical scriptures.",
        body: `<h1>Works Library</h1>${items ? `\n      <ul>\n        ${items}\n      </ul>` : ''}${NAV_LINKS}`,
      };
    },
  }],

  // A single Hebrew root/Strong's-number entry, e.g. /roots?sn=H2995
  // (Yaban-Al). 2026-08-14: added after "yabanaal" searches surfaced a
  // generic /lexicon-page and an unrelated root's snapshot instead of this
  // exact entry — Google had no real content OR title for any specific root
  // page to rank, and no way to discover one directly (see
  // sitemap-roots.xml in server.js). Backed by /api/root-explorer/root,
  // the same endpoint the real client-side page calls, so this can never
  // drift out of sync with what a real visitor sees.
  '/roots': [{
    match: (q) => !!(q.get('sn') || q.get('root')),
    build: async (q, port) => {
      const sn = q.get('sn');
      const root = q.get('root');
      const qs = sn ? `sn=${encodeURIComponent(sn)}` : `root=${encodeURIComponent(root)}`;
      const d = await fetchJSON(port, `/api/root-explorer/root?${qs}`);
      const name = d.lemmaTranslit || d.root;
      const gloss = d.lexicon || null;
      const total = d.total || 0;
      const occursText = `${total.toLocaleString()} time${total === 1 ? '' : 's'}`;

      const surfaceItems = (d.surfaces || []).slice(0, 20)
        .map((s) => `<li>${escapeHtml(s.word_raw)} — ${s.occ.toLocaleString()} occurrence${s.occ === 1 ? '' : 's'}</li>`)
        .join('\n        ');
      const bookItems = (d.by_book || []).slice(0, 15)
        .map((b) => `<li>${escapeHtml(b.name)} — ${b.occ.toLocaleString()}</li>`)
        .join('\n        ');

      // Matches Root.jsx's entryDetailText exactly (client:
      // "<sn>: <lemma> (<root>) : <gloss-or-occurs> | BLD Bible") — see that
      // file's `occursText`/`entryDetailText` consts, which this mirrors
      // field-for-field off the same /api/root-explorer/root response.
      const entryDetailText = `${d.sn ? `${d.sn}: ` : ''}${name} (${d.root}) : ${gloss || `${occursText} in Scripture`}`;
      const title = `${entryDetailText} | ${BRAND}`;
      const description = `${name}${d.sn ? ` (Strong's ${d.sn})` : ''}${gloss ? ` — ${gloss}` : ''}. Occurs ${occursText} in Scripture. Paleo-Hebrew root explorer with verse-by-verse occurrences.`;
      const body = `<h1>${escapeHtml(name)}${d.sn ? ` — Strong's ${escapeHtml(d.sn)}` : ''}</h1>
      ${gloss ? `<p>${escapeHtml(gloss)}</p>` : ''}
      <p>Occurs ${occursText} in Scripture.</p>
      ${surfaceItems ? `<h2>Surface forms</h2>\n      <ul>\n        ${surfaceItems}\n      </ul>` : ''}
      ${bookItems ? `<h2>By book</h2>\n      <ul>\n        ${bookItems}\n      </ul>` : ''}${NAV_LINKS}`;

      return { title, description, body };
    },
  }],
};

// Simple, static, description-only pages — no per-request DB fetch, just a
// real title/description instead of the generic app-wide default every
// route currently shares. Query-string variants (e.g. /lexicon-page?lang=X)
// all match, since `match` ignores query params for these.
const STATIC_PAGES = {
  '/lexicon-page': {
    title: `Lexicon | ${BRAND}`,
    description: "Look up any Hebrew, Greek or Ge'ez word — roots, surface forms, Strong's numbers and glosses.",
    heading: 'Lexicon',
  },
  '/cheatsheet': {
    title: `Token Cheatsheet | ${BRAND}`,
    description: 'A quick-reference guide to the grammatical tags and token fields used throughout the reader.',
    heading: 'Token Cheatsheet',
  },
  // NOTE: deliberately no '/roots' entry HERE — it has its own real,
  // per-entry ROUTES handler above instead (see "A single Hebrew root..."),
  // since every /roots?sn=X is a genuinely different page. A STATIC_PAGES
  // entry matches ANY query string (`match: () => true`), which would wrongly
  // swallow a bare /roots visit (no sn/root param) too — that case needs to
  // fall through to server.js's real handler, which 302-redirects it to the
  // alphabetically-first root (see the "ROOT / SURFACE EXPLORER ROUTES"
  // comment in server.js — until 2026-08-14 that redirect was dead code,
  // shadowed by an earlier duplicate route registration; fixed alongside
  // this change).
  '/search': {
    title: `Search | ${BRAND}`,
    description: "Search across Hebrew, Greek, Latin and Ge'ez scripture and literary works.",
    heading: 'Search',
  },
  '/share': {
    title: `Share & Export | ${BRAND}`,
    description: `Export and share verses, word studies and translations from ${BRAND}.`,
    heading: 'Share & Export',
  },
};
for (const [path, page] of Object.entries(STATIC_PAGES)) {
  ROUTES[path] = [{
    match: () => true,
    build: async () => ({
      title: page.title,
      description: page.description,
      body: `<h1>${escapeHtml(page.heading)}</h1>${NAV_LINKS}`,
    }),
  }];
}

// Bounded LRU cache: unlike the original Genesis-1-only version (a fixed
// ~15 keys, safe to cache forever), routes now cover every real book x
// chapter x source combination — tens of thousands of possible keys once
// real traffic and crawlers wander through the reader. A Map preserves
// insertion order, so "delete + re-set on hit" turns that into a cheap
// true-LRU: touching an entry moves it to the most-recently-used end, and
// eviction always removes the actual least-recently-used one, not just the
// oldest-inserted. Each cached page is a few KB of text, so even the max
// size here is a low-single-digit-MB ceiling.
const MAX_CACHE_ENTRIES = 3000;
const cache = new Map(); // "pathname?query" -> rendered HTML string
function cacheGet(key) {
  if (!cache.has(key)) return undefined;
  const val = cache.get(key);
  cache.delete(key);
  cache.set(key, val); // move to most-recently-used
  return val;
}
function cacheSet(key, val) {
  cache.delete(key);
  cache.set(key, val);
  if (cache.size > MAX_CACHE_ENTRIES) {
    cache.delete(cache.keys().next().value); // evict least-recently-used
  }
}

// Read the built index.html ONCE per process (it only changes on deploy,
// which restarts the process). Vite's build output has an EMPTY root div —
// `<div id="root"></div>`, verified against this project's actual build
// output — so injecting page content is one exact-string replace, not
// fragile HTML surgery.
let shell = null;
function loadShell(indexHtmlPath) {
  if (shell) return;
  shell = fs.readFileSync(indexHtmlPath, 'utf8');
  if (!shell.includes('<div id="root"></div>')) {
    throw new Error('prerender: built index.html does not have the expected empty <div id="root"></div> — bail out rather than risk mangled output');
  }
}

function render({ title, description, canonicalPath, body }) {
  const canonical = `${SITE}${canonicalPath}`;
  return shell
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeHtml(description)}" />`)
    .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${escapeHtml(title)}" />`)
    .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${escapeHtml(description)}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${escapeHtml(canonical)}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${escapeHtml(title)}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${escapeHtml(description)}" />`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${escapeHtml(canonical)}$2`)
    .replace('<div id="root"></div>', `<div id="root">\n      ${body}\n    </div>`);
}

/**
 * @param {string} pathname       req.path, e.g. '/bible' (no query string)
 * @param {URLSearchParams} query
 * @param {number} port           this process's own listening port (loopback calls)
 * @param {string} indexHtmlPath  absolute path to the built public/index.html
 * @returns {Promise<string|null>} full HTML document, or null if this URL isn't curated
 */
async function renderSnapshot(pathname, query, port, indexHtmlPath) {
  const candidates = ROUTES[pathname];
  if (candidates) {
    // Resolve a slug `book` param (e.g. ?book=luke) to its numeric id BEFORE any
    // route's match()/build() ever sees `query` — see normalizeBookParam above.
    if (query.has('book')) await normalizeBookParam(query, port);
    const route = candidates.find((r) => r.match(query));
    if (route) {
      const qs = query.toString();
      const cacheKey = pathname + (qs ? '?' + qs : '');
      const cached = cacheGet(cacheKey);
      if (cached !== undefined) return cached;

      loadShell(indexHtmlPath);
      const { title, description, body, canonicalPath } = await route.build(query, port);
      // A route may name its own canonical (see englishChapterRoute's
      // canonicalPath — collapses ?verse=/&lang=/etc. variants onto the
      // book+chapter URL that's actually in the sitemap). Falls back to this
      // exact request's own URL, same as before, for every route that doesn't.
      const html = render({ title, description, canonicalPath: canonicalPath || cacheKey, body });

      cacheSet(cacheKey, html);
      return html;
    }
  }

  // /:bookSlug/:chapter/:verse — VersePage.jsx's clean verse URL (e.g.
  // /genesis/1/1). Pattern-matched rather than an exact ROUTES[pathname]
  // lookup, since every book/chapter/verse combination is its own distinct
  // path — see VERSE_PATH_RE's own comment above for the full rationale.
  // Tried only after the exact-pathname ROUTES lookup above finds nothing,
  // so it can never shadow any named route.
  const verseMatch = VERSE_PATH_RE.exec(pathname);
  if (verseMatch) {
    const cacheKey = pathname; // no query string affects this page's content
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return cached;

    loadShell(indexHtmlPath);
    const built = await buildVersePathSnapshot(verseMatch, port);
    // Invalid book/chapter/verse — falls through to the plain SPA shell,
    // same as VersePage.jsx's own "address not recognized" state.
    if (!built) return null;
    const html = render(built);

    cacheSet(cacheKey, html);
    return html;
  }

  // /parallel/:bookSlug/:chapterVerse (and /parallel/:bookSlug) — Parallel's
  // own clean-URL form, e.g. /parallel/deuteronomy/13-3. Same pattern-matched
  // treatment as VERSE_PATH_RE above, tried after it (order between the two
  // doesn't matter — see PARALLEL_PATH_RE's own comment for why they can
  // never both match the same pathname) and after the exact-pathname ROUTES
  // lookup, so it can never shadow any named route either.
  const parallelMatch = PARALLEL_PATH_RE.exec(pathname);
  if (parallelMatch) {
    const cacheKey = pathname; // no query string affects this page's content
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return cached;

    loadShell(indexHtmlPath);
    const built = await buildParallelPathSnapshot(parallelMatch, port);
    // Invalid book/chapter/verse — falls through to the plain SPA shell.
    if (!built) return null;
    const html = render(built);

    cacheSet(cacheKey, html);
    return html;
  }

  return null;
}

module.exports = { renderSnapshot, ROUTES, MAX_CACHE_ENTRIES };
