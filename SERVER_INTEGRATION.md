# Integrating with your existing `server.js`

This React app is **frontend only**. It does not replace `server.js` or touch
your database — it calls the same HTTP API your old HTML pages called. Here's
exactly how the pieces fit.

```
your-project/
├── server.js              ← your existing server (Express/Node assumed)
├── <database files>       ← unchanged; server.js owns these
├── paleo-glyphs.js        ← the OLD lib; the React app has its own copy now,
│                             so this is only still needed if you keep serving
│                             the legacy .html files in parallel
└── paleo-studio/          ← THIS React app
    ├── src/  vite.config.js  package.json  ...
    └── dist/              ← created by `npm run build`
```

## How they talk

The React app makes relative requests: `/api/tokens`, `/api/search`,
`/api/nav/surfaces`, `/lexicon/definitions.json`, `/admin/rebuild-indexes`,
etc. Those must reach `server.js`.

### Development (two processes)

```bash
# terminal 1 — your backend
node server.js               # say it listens on :8080

# terminal 2 — the React dev server
cd paleo-studio
PALEO_API_HOST=http://localhost:8080 npm run dev   # serves UI on :5173
```

`vite.config.js` proxies `/api`, `/lexicon`, and `/admin` from `:5173` to
`PALEO_API_HOST`. You edit React files and get hot reload; API calls hit your
real server and real DB.

### Production (one process — server.js serves the built app)

```bash
cd paleo-studio
npm run build                # emits paleo-studio/dist/
```

Then in `server.js`, after all your `/api`, `/lexicon`, `/admin` routes are
registered, add static serving + a SPA catch-all. **Order matters** — the
catch-all must come LAST so it doesn't intercept your API routes:

```js
const path = require('path');
const express = require('express');

// ... all your existing app.get('/api/...'), app.get('/lexicon/...'), etc.

// ── Serve the built React app ────────────────────────────────────────────
const DIST = path.join(__dirname, 'paleo-studio', 'dist');
app.use(express.static(DIST));

// SPA fallback: any non-API GET returns index.html so client-side routing
// (/, /parallel, /lexicon-page, /roots, /surfaces, /cheatsheet, ...) works
// on hard refresh and deep links. Keep this AFTER your API routes.
app.get('*', (req, res, next) => {
  // Let genuine API/asset paths 404 normally instead of returning HTML.
  if (req.path.startsWith('/api') ||
      req.path.startsWith('/lexicon') ||
      req.path.startsWith('/admin')) {
    return next();
  }
  res.sendFile(path.join(DIST, 'index.html'));
});

app.listen(8080);
```

That's it — now `http://localhost:8080/` serves the React app, and
`http://localhost:8080/api/...` serves your data, same origin, no proxy.

## Important: the old app was multi-page; this one is a SPA

Your old `server.js` very likely mapped routes to HTML files, e.g.:

```js
app.get('/parallel',  (req,res) => res.sendFile('parallel.html'));
app.get('/translate', (req,res) => res.sendFile('translate.html'));
app.get('/roots',     (req,res) => res.sendFile('root.html'));
// ...etc
```

**Remove or comment those out** once you switch to the SPA — the single
catch-all above replaces all of them. If you leave them in, they'll shadow
the catch-all and serve stale HTML for those paths.

If you want to run both old and new side by side during migration, mount the
React app under a sub-path instead (e.g. serve `dist/` at `/v2` and set
Vite's `base: '/v2/'` in `vite.config.js`), leaving your legacy routes intact
at the root.

## The API contract the frontend expects

These are the endpoints `src/lib/api.js` calls. **Verified against your actual
`server.js`** — the routes and shapes below match what the server returns.

> Note: `/api/tokens` returns the **parsed** array directly:
> `[{ verse, word, token_ordinal, strongs, components[] }]`. Each `components[]`
> entry has `{ paleo, translit, translation, css, sn?, true_root?, display_root?,
> surface_form? }`. The root component's `paleo` is the **true root** (see
> ROOT_AND_LEXICON.md).

| Endpoint | Used by | Expected response (shape) |
|----------|---------|---------------------------|
| `GET /api/books` | all readers | `[{ book_id, first_chapter, last_chapter }]` |
| `GET /api/tokens?book=&chapter=` | viewer, parallel | `[{ verse, token_ordinal, word_raw, components[], ... }]` |
| `GET /api/raw?book=&chapter=` | viewer token panel | `[{ verse, token_ordinal, word_raw, pos, morph }]` |
| `GET /api/search?q=&offset=&mode=` | viewer search | `{ results[], total, hasMore, mode }` |
| `GET /api/translate/chapter?book=&chapter=` | parallel, translate | `{ verses: [{ verse, text }] }` |
| `GET /api/translate/verse?book=&chapter=&verse=` | parallel, translate | `{ rich_text, links[] }` |
| `GET /api/translate/progress` | translate | `{ books: [...] }` |
| `GET /lexicon/lexicon.json` | lexicon | `{ "<paleo>": "<def>" }` |
| `GET /lexicon/homographs.json` | lexicon | `{ "<paleo>_<pos>": "<def>" }` |
| `GET /lexicon/definitions.json` | lexicon, root | `{ "<paleo>": "<def>" }` |
| `GET /api/nav/roots` | lexicon "All Roots" | `[{ root, paleo, sn, strongs[], count }]` |
| `GET /api/nav/surfaces` | lexicon "All Surfaces" | `[{ surface, paleo, sn, count }]` |
| `GET /api/nav/roots/neighbors?root=|sn=` | root explorer | `{ index, total, current, prev, next }` |
| `GET /api/nav/surfaces/neighbors?surface=|sn=` | surface explorer | `{ index, total, current, prev, next }` |
| `GET /api/root/by-strongs?sn=` | root explorer | `{ sn, root_paleo, total, bookTotals, surfaces[] }` |
| `GET /api/root/by-strongs/verses?sn=&limit=&offset=&book=&surface=` | root verses | `{ total, hasMore, verses[] }` |
| `GET /api/root?root=&sns=` | root fallback | `{ total, bookTotals, surfaces[], strongs[] }` |
| `GET /api/surface?word=` | surface explorer | `{ strongs, all_strongs[], root_paleo }` |
| `GET /api/surface/verses?word=&limit=&offset=&book=` | surface counts | `{ total, hits[] }` |
| `GET /api/surface/verses/rendered?word=&limit=&offset=&book=` | surface verses | `{ total, hasMore, verses[] }` |
| `POST /admin/rebuild-indexes` | cheatsheet | (status only) |

> Contract verified against the actual `server.js` you provided. The static
> file routes it serves (`/lexicon/*.json`) and the SPA page routes
> (`/parallel`, `/translate`, `/roots`, `/surfaces`, `/cheatsheet`,
> `/glyph-editor`, `/landing`, `/lexicon-page`, `/share`, `/root`) are the ones
> the catch-all above must replace when you switch to the SPA.
