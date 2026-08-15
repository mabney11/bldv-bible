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
 */

const fs = require('fs');
const http = require('http');

const SITE = 'https://www.bldbible.com';
// 2026-08-15: rebranded from "Paleo-Hebrew Translation Studio" — see
// index.html and src/hooks/usePageTitle.js's APP_NAME for the same change.
const APP_TITLE = 'Blood-Line Descendant Bible Study Tool';
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

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
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
        <a href="/lexicon-page">Lexicon</a> ·
        <a href="/cheatsheet">Token Cheatsheet</a> ·
        <a href="/roots">Root Explorer</a> ·
        <a href="/search">Search</a>
      </nav>`;

// A book+chapter reader page backed by /api/translate/chapter (English —
// used identically by /bible, /parallel and /translate; those three pages
// show the same underlying chapter text in different tools around it).
function englishChapterRoute(labelSuffix, titleSuffix, description) {
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
        title: `${name} ${chapter}${titleSuffix} | ${APP_TITLE}`,
        description: description(name, chapter),
        body: (body || `<h1>${escapeHtml(heading)}</h1>`) + NAV_LINKS,
      };
    },
  };
}

// A book+chapter reader page backed by /api/source/:src/chapter (Greek
// Septuagint/NT, Ge'ez, Latin Vulgate — sources with flat verse text, unlike
// Hebrew's tokenized glyph data; see the '/' route's comment below).
function sourceChapterRoute(src, label) {
  return {
    match: (q) => q.get('source') === src && validBook(q.get('book')) && validChapter(q.get('chapter')),
    build: async (q, port) => {
      const book = validBook(q.get('book'));
      const chapter = validChapter(q.get('chapter'));
      const name = BOOK_NAMES[book];
      const data = await fetchJSON(port, `/api/source/${src}/chapter?book=${book}&chapter=${chapter}`);
      const heading = `${name} ${chapter} — ${label}`;
      const body = versesArticle(heading, data.verses);
      return {
        title: `${name} ${chapter} | ${label} — ${APP_TITLE}`,
        description: `${name} chapter ${chapter} in the ${label}.`,
        body: (body || `<h1>${escapeHtml(heading)}</h1>`) + NAV_LINKS,
      };
    },
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
      title: `${APP_TITLE} — BLD Bible`,
      description: APP_DESC,
      body: `<h1>${escapeHtml(APP_TITLE)}</h1>
      <p>Hebrew · Greek · Latin · Ge'ez — scriptures, plus a library of works.</p>${NAV_LINKS}`,
    }),
  }],

  '/bible': [englishChapterRoute(
    'Novel English Bible', '',
    (name, ch) => `${name} chapter ${ch} in the Novel English Bible — a clean English translation with Hebrew-backed names and places.`,
  )],

  '/parallel': [englishChapterRoute(
    'English–Hebrew Parallel', ' Parallel',
    (name, ch) => `Read ${name} ${ch} in English and Hebrew side by side, verse by verse.`,
  )],

  '/translate': [englishChapterRoute(
    'Translation Studio', ' | Translation Studio',
    (name, ch) => `Translate ${name} ${ch} verse by verse, linked back to the original Hebrew.`,
  )],

  // "/" serves three different things depending on ?source=: the default
  // Hebrew reader (no source param), or one of the flat-text sources below.
  // Order matters — the Hebrew (no-source) candidate must be checked with
  // !q.get('source') so it doesn't swallow the source-specific requests.
  '/': [
    sourceChapterRoute('LXX', 'Greek Septuagint & New Testament'),
    sourceChapterRoute('GEZ', "Ge'ez Bible"),
    sourceChapterRoute('LAT', 'Latin Vulgate'),
    {
      // Default Hebrew reader (the Landing page's primary CTA). Its
      // readable text lives in tokenized Paleo-Hebrew glyph data
      // (/api/tokens), not flat verse rows like the sources above —
      // reconstructing real body text from that here risks getting it
      // subtly wrong, which would be worse for SEO than omitting it.
      // Title + description are still real and book/chapter-specific,
      // which is most of the win anyway.
      match: (q) => validBook(q.get('book')) && validChapter(q.get('chapter')) && !q.get('source'),
      build: async (q) => {
        const book = validBook(q.get('book'));
        const chapter = validChapter(q.get('chapter'));
        const name = BOOK_NAMES[book];
        return {
          title: `${name} ${chapter} — Hebrew Reader | ${APP_TITLE}`,
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
        title: `Works Library | ${APP_TITLE}`,
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

      const title = `${name}${d.sn ? ` (${d.sn})` : ''} | ${APP_TITLE}`;
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
    title: `Lexicon | ${APP_TITLE}`,
    description: "Look up any Hebrew, Greek or Ge'ez word — roots, surface forms, Strong's numbers and glosses.",
    heading: 'Lexicon',
  },
  '/cheatsheet': {
    title: `Token Cheatsheet | ${APP_TITLE}`,
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
    title: `Search | ${APP_TITLE}`,
    description: "Search across Hebrew, Greek, Latin and Ge'ez scripture and literary works.",
    heading: 'Search',
  },
  '/share': {
    title: `Share & Export | ${APP_TITLE}`,
    description: `Export and share verses, word studies and translations from the ${APP_TITLE}.`,
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
  if (!candidates) return null;
  const route = candidates.find((r) => r.match(query));
  if (!route) return null;

  const qs = query.toString();
  const cacheKey = pathname + (qs ? '?' + qs : '');
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  loadShell(indexHtmlPath);
  const { title, description, body } = await route.build(query, port);
  const html = render({ title, description, canonicalPath: cacheKey, body });

  cacheSet(cacheKey, html);
  return html;
}

module.exports = { renderSnapshot, ROUTES, MAX_CACHE_ENTRIES };
