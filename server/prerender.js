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

// A single English-reader VERSE page — /bible ONLY, for now. 2026-08-15:
// "I want my entire corpus indexable and easily searchable like the other
// bible tools" (e.g. BibleHub, which indexes one real page per verse). This
// is phase 1 of that: the flagship "read one verse, see its own Hebrew word
// by word" page. /parallel and /translate deliberately do NOT get this
// treatment yet — their prerendered body is identical no matter what
// ?verse= says (see englishChapterRoute's canonical-collapse comment right
// above), so giving them their own verse-level canonical would be exactly
// the thin/duplicate-URL mistake the "bad corpus" fix and that canonical
// collapse both existed to clean up. This route's body genuinely differs
// per verse — real translation text plus that verse's actual Hebrew tokens
// off /api/translate/verse — which is what makes a self-referencing
// per-verse canonical honest here and nowhere else (yet).
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
function sourceChapterRoute(src, label, tabLabel) {
  return {
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

  // englishVerseRoute (a real ?verse=) is tried BEFORE the plain chapter
  // route — see its own comment for why only /bible gets this treatment.
  '/bible': [englishVerseRoute(), englishChapterRoute(
    '/bible', 'Novel English Bible', 'Reader',
    (name, ch) => `${name} chapter ${ch} in the Novel English Bible — a clean English translation with Hebrew-backed names and places.`,
  )],

  '/parallel': [englishChapterRoute(
    '/parallel', 'English–Hebrew Parallel', 'Parallel',
    (name, ch) => `Read ${name} ${ch} in English and Hebrew side by side, verse by verse.`,
  )],

  '/translate': [englishChapterRoute(
    '/translate', 'Translation Studio', 'Translation Studio',
    (name, ch) => `Translate ${name} ${ch} verse by verse, linked back to the original Hebrew.`,
  )],

  // "/" serves three different things depending on ?source=: the default
  // Hebrew reader (no source param), or one of the flat-text sources below.
  // Order matters — the Hebrew (no-source) candidate must be checked with
  // !q.get('source') so it doesn't swallow the source-specific requests.
  '/': [
    // tabLabel args match MultiViewer.jsx's SOURCE_LABELS exactly (LXX/GEZ/LAT).
    sourceChapterRoute('LXX', 'Greek Septuagint & New Testament', 'Greek Scriptures'),
    sourceChapterRoute('GEZ', "Ge'ez Bible", "Ge'ez (BETMAS)"),
    sourceChapterRoute('LAT', 'Latin Vulgate', 'Latin (Vulgate)'),
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
        // Matches HebrewViewer.jsx's title exactly: "<book> <ch>[:<verse>] |
        // Hebrew[ | <preview>]" — no preview here since this route doesn't
        // fetch the tokenized glyph data a preview would need (see the
        // comment on this route's `match`/`build` above).
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
  if (!candidates) return null;
  const route = candidates.find((r) => r.match(query));
  if (!route) return null;

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

module.exports = { renderSnapshot, ROUTES, MAX_CACHE_ENTRIES };
