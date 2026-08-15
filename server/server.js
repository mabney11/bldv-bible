const express = require('express');
const fs = require('fs');
const path = require('path');

// Database driver: prefer better-sqlite3 (native, fast). If unavailable —
// missing prebuild binary, blocked install script, build-tools not present —
// fall back to node:sqlite which is built into Node 22.5+ and stable in
// Node 24. The shim class wraps node:sqlite's DatabaseSync to expose the
// better-sqlite3 API surface we use (prepare, exec, pragma, transaction,
// close), so the rest of this file doesn't care which driver loaded.
let Database;
try {
    Database = require('better-sqlite3');
    console.log('[db] using better-sqlite3');
} catch (e) {
    const { DatabaseSync } = require('node:sqlite');
    console.log('[db] using node:sqlite (better-sqlite3 not available)');
    class Statement {
        constructor(s) { this.s = s; }
        all(...a)  { return this.s.all(...a); }
        get(...a)  { return this.s.get(...a); }
        run(...a)  { return this.s.run(...a); }
        iterate(...a) {
            // node:sqlite returns iterator from .iterate(); some callers
            // expect for-of compatibility. Both yield row objects.
            return this.s.iterate ? this.s.iterate(...a) : this.s.all(...a)[Symbol.iterator]();
        }
    }
    Database = class {
        constructor(f, o = {}) {
            const ro = o.readonly || o.readOnly;
            this.db = new DatabaseSync(f, ro ? { readOnly: true } : {});
        }
        prepare(q) { return new Statement(this.db.prepare(q)); }
        exec(s)    { return this.db.exec(s); }
        pragma(p, o) {
            const sql = `PRAGMA ${p}`;
            if (p.includes('=')) { this.db.exec(sql); return; }
            const r = this.db.prepare(sql).all();
            return r.length === 1 ? (o?.simple ? Object.values(r[0])[0] : r) : r;
        }
        transaction(fn) {
            return (...a) => {
                this.db.exec('BEGIN');
                try { const r = fn(...a); this.db.exec('COMMIT'); return r; }
                catch (e) { this.db.exec('ROLLBACK'); throw e; }
            };
        }
        close() { this.db.close(); }
    };
}

// ── NO-ELIDING GATE ─────────────────────────────────────────────────────────
// Hard requirement (see CLAUDE.md): a Hebrew word may never render with fewer
// letters than its Strong's-tagged canonical root actually has. This is the
// exact bug class that produced "HaWaray" instead of "HaYarahay" for Psalm
// 119:33 (H3384, Yarah) — a real regression, not a cosmetic one, since it
// means the reader is shown a word that isn't the word the Strong's number
// names. Checked BEFORE anything else boots: if the bake violates this, the
// server refuses to start rather than silently serving wrong Hebrew.
// Run `node verify-no-eliding.js --list 20` directly for the full report.
{
    const { runGate, printReport } = require('./verify-no-eliding');
    const gateResult = runGate();
    printReport(gateResult, { list: 10 });
    if (!gateResult.ok) {
        console.error('[no-eliding gate] Refusing to start — fix the violations above (or rebuild');
        console.error('  surface-index.db) and restart. Set SKIP_NO_ELIDING_GATE=1 to override (not recommended).');
        if (process.env.SKIP_NO_ELIDING_GATE !== '1') process.exit(1);
    }
}

const production = require('./production');

const app = express();
app.set('trust proxy', 1);  // behind ngrok / a platform proxy: use X-Forwarded-For for req.ip

// ── ADMIN AUTH ─────────────────────────────────────────────────────────────────
// One shared secret, ADMIN_KEY, is both your admin password and the signing key for
// the session cookie POST /admin/login sets. Three equivalent ways a request can
// prove it's you: (1) a valid ps_admin session cookie, (2) an x-admin-key header,
// (3) a ?key= query param. The cookie exists so logging in once in your browser is
// enough — you don't have to attach a header by hand on every request afterward.
// If ADMIN_KEY is unset, admin auth is off entirely (matches pre-existing behaviour
// for local/private forks) and isAdminRequest() always returns false.
const crypto = require('crypto');
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const SESSION_COOKIE = 'ps_admin';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function signSession(exp) {
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', ADMIN_KEY).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function verifySession(token) {
  if (!ADMIN_KEY || !token) return false;
  const i = token.indexOf('.');
  if (i < 0) return false;
  const payload = token.slice(0, i), sig = token.slice(i + 1);
  const expected = crypto.createHmac('sha256', ADMIN_KEY).update(payload).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof exp === 'number' && exp > Date.now();
  } catch { return false; }
}
function getCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}
function isAdminRequest(req) {
  if (!ADMIN_KEY) return false;
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key && key === ADMIN_KEY) return true;
  return verifySession(getCookie(req, SESSION_COOKIE));
}
function setSessionCookie(req, res, token, maxAgeMs) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${Math.floor(maxAgeMs / 1000)}; SameSite=Lax${secure ? '; Secure' : ''}`);
}
function clearSessionCookie(req, res) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure ? '; Secure' : ''}`);
}

// POST /admin/login { password } -> sets the session cookie on success.
// Deliberately reachable even under READ_ONLY (see blockWritesInReadOnly below) —
// otherwise there'd be no way to ever authenticate as admin on the public deployment.
app.post('/admin/login', express.json(), (req, res) => {
  if (!ADMIN_KEY) return res.status(503).json({ error: 'Admin login is not configured on this server.' });
  const password = req.body && req.body.password;
  if (typeof password !== 'string' || !password) return res.status(400).json({ error: 'password required' });
  const a = Buffer.from(password), b = Buffer.from(ADMIN_KEY);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) return res.status(401).json({ error: 'wrong password' });
  setSessionCookie(req, res, signSession(Date.now() + SESSION_MAX_AGE_MS), SESSION_MAX_AGE_MS);
  res.json({ ok: true });
});
// GET /admin/session -> whether THIS request is currently authenticated as admin.
// The frontend polls this once on load to decide whether to show admin controls
// (write straight to the server) or local-only controls (save to the browser).
app.get('/admin/session', (req, res) => {
  res.json({ isAdmin: isAdminRequest(req), configured: !!ADMIN_KEY });
});
app.post('/admin/logout', (req, res) => { clearSessionCookie(req, res); res.json({ ok: true }); });

// ── PUBLIC READ-ONLY MODE ────────────────────────────────────────────────────
// Set READ_ONLY=1 for the public deployment. Enforced server-side so no browser can
// bypass it: (1) every mutating route returns 403 UNLESS the request is authenticated
// as admin (see isAdminRequest above) — this is a per-REQUEST check, so the same
// running server serves the public read-only AND lets you keep writing once logged
// in; (2) translation.db skips its WAL/schema-migration setup when READ_ONLY is set,
// since the DB already exists and shouldn't be altered by the server starting up.
// Local forks run without the flag and keep full Studio editing for everyone, same
// as before this existed.
const READ_ONLY = process.env.READ_ONLY === '1' || process.env.READ_ONLY === 'true';
if (READ_ONLY) console.log('[read-only] PUBLIC MODE — writes disabled for non-admins, translation.db read-only');
function blockWritesInReadOnly(req, res, next) {
  if (!READ_ONLY) return next();
  const m = req.method.toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return next();
  // login/logout/session must stay reachable so admin auth is possible at all
  if (req.path === '/admin/login' || req.path === '/admin/logout' || req.path === '/admin/session') return next();
  if (isAdminRequest(req)) return next();
  return res.status(403).json({
    error: 'This is a public read-only instance. Log in as admin, or fork the project to run your own editable copy.'
  });
}
app.use(blockWritesInReadOnly);

// ── PUBLIC HARDENING (all opt-in via env; local dev unaffected) ───────────────
// CORS lock: by default the browser already blocks cross-origin reads, but set
// ALLOW_ORIGIN to your domain to send an explicit allow header and reject others.
// Rate limit: simple in-memory per-IP cap on /api to blunt scraping/abuse.
// Admin secret: /admin and /api/admin require ?key= or x-admin-key when ADMIN_KEY set.
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '';
if (ALLOW_ORIGIN) {
  app.use((req, res, next) => {
    const o = req.headers.origin;
    if (o && o === ALLOW_ORIGIN) res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

// In-memory rate limiter — no dependency. Per-IP token bucket over a rolling window.
// Defaults are generous (300 req/min/IP); tune with RATE_MAX / RATE_WINDOW_MS.
const RATE_MAX = parseInt(process.env.RATE_MAX || '300', 10);
const RATE_WINDOW = parseInt(process.env.RATE_WINDOW_MS || '60000', 10);
if (RATE_MAX > 0) {
  const hits = new Map();  // ip -> { n, resetAt }
  setInterval(() => { const now = Date.now(); for (const [ip, v] of hits) if (v.resetAt < now) hits.delete(ip); }, RATE_WINDOW).unref();
  app.use('/api', (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    let v = hits.get(ip);
    if (!v || v.resetAt < now) { v = { n: 0, resetAt: now + RATE_WINDOW }; hits.set(ip, v); }
    if (++v.n > RATE_MAX) {
      res.setHeader('Retry-After', Math.ceil((v.resetAt - now) / 1000));
      return res.status(429).json({ error: 'Too many requests — slow down.' });
    }
    next();
  });
}

// Admin secret. When ADMIN_KEY is set, every /admin and /api/admin route needs it —
// except /admin/login, /admin/session, /admin/logout (see ADMIN AUTH above), which
// must stay reachable so admin auth is possible at all. isAdminRequest() accepts
// either the session cookie POST /admin/login sets or a raw key/header, so once
// you've logged in once, Studio's existing "rebuild indexes" / "save glyphs" calls
// keep working with no changes on the frontend.
if (ADMIN_KEY) {
  const guard = (req, res, next) => {
    if (req.path === '/login' || req.path === '/session' || req.path === '/logout') return next();
    if (isAdminRequest(req)) return next();
    return res.status(404).end();   // 404 not 403: don't reveal the route exists
  };
  app.use('/admin', guard);
  app.use('/api/admin', guard);
}
const PORT = parseInt(process.env.PORT, 10) || 3000;

// Install timing, security, and gzip middleware BEFORE any routes register.
// production.js groups all the don't-think-about-it middleware in one place
// so this file can stay focused on routes.
production.install(app, { gzip: { threshold: 1024, level: 4 } });

// ── PRERENDERING (SEO) ───────────────────────────────────────────────────────
// Serves real, page-specific HTML (title/description/content already filled
// in) for a small, curated, bounded list of evergreen URLs — the same list
// as public/sitemap.xml. See server/prerender.js for the full rationale.
//
// Placed here, before express.static's default "/" -> index.html behavior
// and before every named route below, so it gets first look at every GET
// request. For any path NOT on the curated list (the overwhelming majority
// of traffic — every /api/* call, every asset, every deep reader/
// concordance URL) renderSnapshot resolves to null immediately and this
// calls next() straight away, so nothing else in this file changes
// behavior. Deliberately excludes /roots — that path's real handler below
// has its own redirect-to-first-root logic that must keep running.
const { renderSnapshot } = require('./prerender.js');
const INDEX_HTML_PATH = path.join(__dirname, 'public', 'index.html');
app.use(async (req, res, next) => {
    if (req.method !== 'GET') return next();
    try {
        const url = new URL(req.originalUrl, 'http://internal');
        const html = await renderSnapshot(url.pathname, url.searchParams, PORT, INDEX_HTML_PATH);
        if (!html) return next();
        // no-cache like spaShell/index.html below: the snapshot embeds the
        // current build's hashed asset filenames, so a stale cached copy
        // would point at assets a later deploy has already removed.
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.type('html').send(html);
    } catch (e) {
        console.warn('[prerender] snapshot failed, falling back to the plain SPA shell:', e.message);
        next();
    }
});

// --- DB CONNECTIONS (opened once at startup, stay open) ---
// Read-only handles for the corpus + surface index.  PRAGMA tuning here is
// load-bearing: mmap_size lets SQLite map up to 256 MB of the DB file into
// the OS page cache (negligible RSS impact, big perf win for repeat reads);
// cache_size carves out 20 MB of explicit page cache; query_only prevents
// accidental writes.  These are applied at connection-open time; later
// statements inherit them.
function openRead(dbPath) {
    const handle = new Database(dbPath, { readonly: true });
    handle.pragma('mmap_size = 268435456');   // 256 MB
    handle.pragma('cache_size = -20000');     // 20 MB (negative = KB)
    handle.pragma('temp_store = MEMORY');
    handle.pragma('query_only = ON');
    return handle;
}

// Null-DB stub: returned when an optional DB is missing. Any prepare/.all()
// returns []; .get() returns undefined; .run() throws (writes shouldn't be
// reaching a missing DB anyway). This lets startup code that unconditionally
// reads from `db` keep working without 50 conditional branches.
const NULL_STATEMENT = {
    all: () => [],
    get: () => undefined,
    run: () => { throw new Error('DB not available'); },
    iterate: function*() {},
};
const NULL_DB = {
    prepare: () => NULL_STATEMENT,
    exec:    () => undefined,
    pragma:  () => [],
    transaction: (fn) => fn,
    close:   () => undefined,
    _isNull: true,
};

function openReadOptional(dbPath, label) {
    if (!fs.existsSync(dbPath)) {
        console.warn(`[${label}] ${path.basename(dbPath)} not found — ${label} features will be unavailable`);
        return NULL_DB;
    }
    try {
        return openRead(dbPath);
    } catch (e) {
        console.warn(`[${label}] failed to open ${path.basename(dbPath)}: ${e.message}`);
        return NULL_DB;
    }
}

// tokens_bhs (BHS Hebrew morphology) now lives inside corpus.db alongside the
// multilingual `verses` table — this handle reads ONLY tokens_bhs from it. A
// second read/write handle to corpus.db is opened per-source below; multiple
// SQLite connections to one file are fine. bible.db is retired.
const db     = openReadOptional(path.join(__dirname, 'corpus.db'),        'bhs-tokens');
const surfDb = openReadOptional(path.join(__dirname, 'surface-index.db'), 'surface-index');
const grcDb  = openReadOptional(path.join(__dirname, 'morph-grc.db'),     'morph-grc');
if (!db._isNull)     console.log('[bhs-tokens] tokens_bhs from corpus.db opened');
if (!grcDb._isNull)  console.log('[morph-grc] opened');
const concDb = openReadOptional(path.join(__dirname, 'concordance.db'), 'concordance');
if (!concDb._isNull) console.log('[concordance] opened');
if (!surfDb._isNull) {
    console.log('[surface-index] opened');
} else {
    // surface-index.db is NOT built at server start — it is a prebuilt artifact.
    // Without it the Roots/Surfaces explorer pages return zero rows (the reader
    // still works via live-parse fallback, which masks the problem). Make this
    // impossible to miss.
    console.warn('');
    console.warn('  ┌────────────────────────────────────────────────────────────┐');
    console.warn('  │  surface-index.db MISSING — Roots & Surfaces explorer will   │');
    console.warn('  │  be EMPTY. The reader still works (live-parse fallback).     │');
    console.warn('  │  Build it once from the server/ directory:                   │');
    console.warn('  │      node build-surface-index.js                             │');
    console.warn('  └────────────────────────────────────────────────────────────┘');
    console.warn('');
}

// Does surface-index.db carry the per-occurrence `strongs` column? The
// homograph-accurate schema stores one token_surfaces row per (word_raw,
// strongs) and tags every surface_occurrences row with its authoritative SN,
// so joins can pick the correct reading. An OLD index (word_raw only) lacks it.
// We detect once and interpolate the extra join/filter accordingly, so this
// server runs correctly against either schema: exact on the new index, and on
// the old one the reader stays correct via the runtime homograph fallback in
// /api/tokens (rebuild surface-index.db to make the roots/surfaces pages exact
// too). Interpolating these fixed fragments into prepared SQL is safe — they
// are compile-time constants, never user input.
let SURF_HAS_SN = false;
if (!surfDb._isNull) {
    try { surfDb.prepare('SELECT strongs FROM surface_occurrences LIMIT 1'); SURF_HAS_SN = true; }
    catch { SURF_HAS_SN = false; }
    console.log(`[surface-index] per-occurrence strongs column: ${SURF_HAS_SN ? 'present (homograph-accurate)' : 'ABSENT — rebuild for homograph accuracy'}`);
}

// ── BUG A FIX ────────────────────────────────────────────────────────────────
// A surface *reading* is (word_raw, strongs, pos, morph). Joining token_surfaces
// on (word_raw, strongs) alone served every occurrence of a surface the SAME
// baked components — the most-frequent morph reading — so any occurrence whose
// real morphology differed rendered as a word it is not (67,523 occurrences
// corpus-wide). Join on the occurrence's OWN pos+morph as well.
//
// Detected separately from SURF_HAS_SN so an OLD surface-index.db still boots:
// without these columns the join silently matches nothing and the reader would
// go blank. If absent we keep the old (word_raw, strongs) join and warn.
let SURF_HAS_MORPH = false;
if (!surfDb._isNull) {
    try { surfDb.prepare('SELECT pos, morph FROM surface_occurrences LIMIT 1'); SURF_HAS_MORPH = true; }
    catch { SURF_HAS_MORPH = false; }
    console.log(`[surface-index] per-occurrence pos/morph columns: ${SURF_HAS_MORPH
        ? 'present (reading-accurate)'
        : 'ABSENT — morph readings are COLLAPSED; rebuild surface-index.db (node build-surface-index.js)'}`);
}

// Join fragment: match token_surfaces to the occurrence's OWN reading.
const OCC_SN_JOIN = SURF_HAS_SN
    ? (SURF_HAS_MORPH
        ? 'AND t.strongs = o.strongs AND t.pos = o.pos AND t.morph = o.morph'
        : 'AND t.strongs = o.strongs')
    : '';

// ── BUG C FIX — THE INDEX IS SOURCE-PARTITIONED, THE SERVER WAS NOT ──────────
// `build-surface-index.js --heb` bakes the unsegmented HEB (extra) edition into
// the SAME two tables as BHS, separated only by a `source` column that is part
// of BOTH primary keys. A query that does not name a source is therefore no
// longer well defined, and two things go wrong silently:
//
//   1. DOUBLE SERVING. Canon 1-39 exists in BOTH editions, so an OT chapter
//      comes back with every word twice, interleaved by (verse, token_ordinal).
//   2. CROSS-EDITION JOINS. token_surfaces JOIN surface_occurrences on
//      (word_raw, strongs, pos, morph) matches ACROSS sources whenever a form
//      carries the same reading in both — so a HEB occurrence can be rendered
//      with the BHS row's components (a single morpheme) instead of its own
//      composed whole word. That is a word losing its [The]/[And].
//
// Detected rather than assumed, so an index built before --heb still boots and
// behaves exactly as it did.
let SURF_HAS_SOURCE = false;
if (!surfDb._isNull) {
    try { surfDb.prepare('SELECT source FROM surface_occurrences LIMIT 1'); SURF_HAS_SOURCE = true; }
    catch { SURF_HAS_SOURCE = false; }
}

// source -> Set(book_id). Which edition actually covers which books, read from
// the index itself rather than hardcoding "OT is BHS, NT is HEB" a fourth time.
// Used to pick a default source per book and to tell "not baked yet" (fall back
// to the live parser) apart from "wrong source asked for".
const SURF_SOURCE_BOOKS = new Map();
if (SURF_HAS_SOURCE) {
    try {
        for (const r of surfDb.prepare('SELECT DISTINCT source, book_id FROM surface_occurrences').all()) {
            if (!SURF_SOURCE_BOOKS.has(r.source)) SURF_SOURCE_BOOKS.set(r.source, new Set());
            SURF_SOURCE_BOOKS.get(r.source).add(r.book_id);
        }
    } catch { /* leave empty; surfaceSourceFor degrades to BHS */ }
    console.log('[surface-index] source column: present — ' +
        ([...SURF_SOURCE_BOOKS].map(([s, b]) => `${s}: ${b.size} books`).join(', ') || 'no rows'));
} else if (!surfDb._isNull) {
    console.log('[surface-index] source column: ABSENT — single-edition index. ' +
        'Rebuild with `node build-surface-index.js --heb` to serve the HEB edition from the index.');
}

// Join fragment: a surface row only ever describes an occurrence of its OWN
// edition. Appended to every token_surfaces <-> surface_occurrences join.
const SRC_JOIN = SURF_HAS_SOURCE ? 'AND t.source = o.source' : '';

// WHERE fragment for the legacy single-edition endpoints (/api/surface*,
// /api/root/by-strongs, the Parallel BHS text). These pages are about the
// Masoretic text and their labels say so, so they stay pinned to BHS — which is
// also exactly what they returned before the HEB bake existed. The HEB edition
// reaches the client through /api/tokens?source=HEB.
const SRC_BHS_ONLY = SURF_HAS_SOURCE ? " AND source = 'BHS'" : '';

// ── MULTI-SOURCE DBs (LXX, GNT, Ge'ez) ───────────────────────────────────────
// Optional companion DBs produced by `scripts/ingest-refs.cjs`. If any are
// missing, the app degrades gracefully — the existing Hebrew flow is
// unaffected. Each DB has the same shape: a single `verses` table with
// (ref_key, book_id, chapter, verse, text). Ge'ez additionally has doc_id
// (the BETMAS manuscript witness identifier).
//
// SOURCES is the catalog the rest of the code reaches into. New sources
// added in the future just need an entry here + an ingested DB on disk.
const CORPUS_DB = path.join(__dirname, 'corpus.db');

// Multi-source text (LXX, Greek NT, Ge'ez, Latin) is served from the unified
// corpus.db. Each source opens its own handle and installs a TEMP VIEW named
// `verses` scoped to its corpus, so every /api/source/:src/* query runs
// unchanged — it just sees that one language. Canonical books expose canon_id
// as book_id (named via books.js); everything else (Ge'ez literary works,
// Latin extras, apocrypha without a canonical slot) stays reachable by doc_id.
const SOURCES = {
    BHS: { id: 'BHS', label: 'Hebrew (BHS)',     script: 'paleo-hebrew', has_tokens: true  },
    LXX: { id: 'LXX', label: 'Greek Scriptures', script: 'greek',    has_tokens: false, corpora: ['LXX', 'GNT'] },
    GEZ: { id: 'GEZ', label: "Ge'ez (BETMAS)",   script: 'ethiopic', has_tokens: false, corpora: ['GEZ'] },
    LAT: { id: 'LAT', label: 'Latin (Vulgate)',  script: 'latin',    has_tokens: false, corpora: ['LAT'] },
    SYR: { id: 'SYR', label: 'Syriac (Peshitta)',script: 'syriac',   has_tokens: false, corpora: ['SYR'] },
    COP: { id: 'COP', label: 'Coptic (Sahidic)', script: 'coptic',   has_tokens: false, corpora: ['COP'] },
    // Hebrew apocrypha / pseudepigrapha you ingested into corpus.db (Jasher, Aristeas,
    // Megillat Antiochus, …). BHS stays the paleo/morphology reader off bible.db; this
    // surfaces the corpus.db Hebrew material BHS can't see.
    HEB: { id: 'HEB', label: 'Hebrew (extra)',   script: 'paleo-hebrew', has_tokens: false, corpora: ['HEB'] },
    // English translations (pseudepigrapha baseline). Promoted ones appear as books.
    ENG: { id: 'ENG', label: 'English',          script: 'latin',    has_tokens: false, corpora: ['ENG'] },
    GRC: { id: 'GRC', label: 'Greek Literature', script: 'greek',    has_tokens: false, corpora: ['GRC'], worksOnly: true },
};

const corpusExists = fs.existsSync(CORPUS_DB);
if (!corpusExists) console.warn("[corpus] corpus.db not found \u2014 LXX/GNT/Ge'ez/Latin unavailable");

function installScopedVerses(handle, corpora) {
    const list = corpora.map(c => `'${c}'`).join(', ');
    handle.exec(`
        CREATE TEMP VIEW verses AS
        SELECT id AS rowid, canon_id AS book_id, ord_c AS chapter, ord_v AS verse, text,
               CASE WHEN canon_id IS NOT NULL THEN NULL ELSE code END AS doc_id
        FROM main.verses
        WHERE corpus IN (${list})
    `);
}

for (const src of Object.values(SOURCES)) {
    if (!src.corpora)  { src.handle = null; src.available = true;  continue; }  // BHS -> bible.db
    if (!corpusExists) { src.handle = null; src.available = false; continue; }
    try {
        // open a writable handle (we never write) so TEMP VIEW creation is always allowed
        src.handle = new Database(CORPUS_DB);
        installScopedVerses(src.handle, src.corpora);
        const meta = src.handle.prepare(`
            SELECT COUNT(*) AS n, COUNT(DISTINCT book_id) AS books,
                   COUNT(DISTINCT doc_id) AS docs,
                   MIN(book_id) AS min_b, MAX(book_id) AS max_b
            FROM verses
        `).get();
        src.verse_count = meta.n;
        src.book_count  = meta.books;
        src.book_range  = [meta.min_b, meta.max_b];
        src.available   = true;
        // has_tokens has a SPECIFIC PRE-EXISTING MEANING: "this source's own DB has a
        // `tokens` table" (joined against surface_counts by /api/source/:id/chapter, and
        // gated on at L3105/3225/3264/3758). corpus.db has NO such table, so this MUST
        // stay false for corpus.db-backed sources. Setting it true for HEB is what caused
        // "SqliteError: no such table: tokens" on /api/source/HEB/chapter.
        src.has_tokens  = false;
        // Strong's-tagged tokens are a DIFFERENT capability living in tokens_nt and served
        // by /api/tokens. It gets its own flag so the two are never conflated again.
        // The range is DERIVED, not hardcoded: build-heb-index.mjs --ot also tags HEB's
        // Old Testament, and a fixed [40,66] would then hide it.
        if (src.id === 'HEB') {
            try {
                const r = src.handle.prepare(`SELECT MIN(book_id) lo, MAX(book_id) hi FROM tokens_nt`).get();
                if (r && r.lo != null) { src.strongs_tokens = true; src.token_books = [r.lo, r.hi]; }
            } catch { /* tokens_nt not built yet — HEB behaves exactly as before */ }
        }
        console.log(`[source:${src.id}] corpus.db \u2192 ${meta.n} verses \u00b7 ${meta.books} canonical books \u00b7 ${meta.docs} works`);
    } catch (e) {
        console.error(`[source:${src.id}] failed to attach corpus.db: ${e.message}`);
        src.handle = null;
        src.available = false;
    }
}

// The Greek NT now lives inside the combined LXX 'Greek Scriptures' source,
// so old ?source=GNT links still resolve there.
const SOURCE_ALIASES = { GNT: 'LXX' };
function getSource(raw) {
    const id = (raw || '').toUpperCase();
    return SOURCES[id] || SOURCES[SOURCE_ALIASES[id]] || null;
}

// ── ENGLISH BASELINE (lazy prefill) ──────────────────────────────────────────
// The English baseline (World English Bible, every proper noun passed through
// your own transliteration — Yahawah / Mashah / Yashawai, nothing Greek-derived)
// is loaded into the ENG source of corpus.db by scripts/load-english-baseline.js,
// keyed by canon_id. That canon_id is exactly the book_id the Translation Studio
// (tokens_bhs) uses, and the ENG source view already exposes `canon_id AS book_id`
// + `ord_c AS chapter` + `ord_v AS verse`, so a single lookup on the ENG handle
// serves the Studio prefill below. It is READ-ONLY: your saved translation always
// wins and nothing is ever pre-baked into translation.db.
const englishBaselineStmt = (() => {
    const eng = getSource('ENG');
    if (!eng || !eng.handle) return null;
    try {
        return eng.handle.prepare(
            `SELECT text FROM verses WHERE book_id=? AND chapter=? AND verse=? ORDER BY rowid LIMIT 1`
        );
    } catch { return null; }
})();
function englishBaseline(canonId, chapter, verse) {
    if (!englishBaselineStmt) return '';
    try { const r = englishBaselineStmt.get(canonId, chapter, verse); return applyLiveGloss((r && r.text) || ''); }
    catch { return ''; }
}

// ── LIVE GLOSS OVERLAY FOR THE ENGLISH BASELINE ─────────────────────────────
// english-baseline.jsonl bakes each Hebrew root's gloss directly into the
// English prose as "root (gloss)" (e.g. "chasad (loyalty)") at load time. Like
// the surface-index re-gloss pass above, that baked string goes stale the
// moment the user edits lexicon.json: the reader keeps showing whatever gloss
// was current when the baseline was generated, not what lexicon.json says now.
// Rebuilding the baseline for every lexicon edit isn't realistic, so instead
// rewrite the parenthetical live, per request, from a reverse index of
// translit(root) -> current lexicon gloss. Only spans whose root has a CURRENT,
// non-blank lexicon entry are touched; everything else (ordinary English
// parentheticals, roots with no lexicon entry) passes through unchanged.
let _translitGlossIndex = null;
function _buildTranslitGlossIndex() {
    const { lexicon } = loadLexicons();
    const idx = new Map();
    for (const [paleo, gloss] of Object.entries(lexicon)) {
        if (!gloss) continue;
        const key = getTranslit(paleo).toLowerCase();
        if (key) idx.set(key, gloss);
    }
    return idx;
}
const ENGLISH_GLOSS_RX = /\b([A-Za-z]+)\s*\(([^()]*)\)/g;
function applyLiveGloss(text) {
    if (!text) return text;
    if (!_translitGlossIndex) _translitGlossIndex = _buildTranslitGlossIndex();
    return text.replace(ENGLISH_GLOSS_RX, (whole, word) => {
        const gloss = _translitGlossIndex.get(word.toLowerCase());
        return gloss ? `${word} (${gloss})` : whole;
    });
}



// ── TRANSLATION DB — schema init & prepared statements ───────────────────────
const translationDb = (() => {
    const tdb = new Database(path.join(__dirname, 'translation.db'));
    // WAL mode + reduced sync = small (single-user) write latency without
    // sacrificing crash safety.  WAL also lets reads proceed concurrently
    // with writes — critical because the React translate page reads progress
    // while you're typing.
    // Read-only-safe pragmas always apply.
    tdb.pragma('mmap_size = 268435456');
    tdb.pragma('cache_size = -10000');     // 10 MB — smaller than read DBs, write DB is much smaller
    tdb.pragma('temp_store = MEMORY');
    // WAL, foreign_keys, and all schema creation/migration are WRITES — skip them on a
    // read-only public handle (the DB already exists and must not be altered).
    if (!READ_ONLY) {
    tdb.pragma('journal_mode = WAL');
    tdb.pragma('synchronous = NORMAL');
    tdb.pragma('foreign_keys = ON');

    tdb.exec(`
        CREATE TABLE IF NOT EXISTS translations (
            book_id       INTEGER NOT NULL,
            chapter       INTEGER NOT NULL,
            verse         INTEGER NOT NULL,
            status        TEXT    NOT NULL DEFAULT 'none',
            text          TEXT    NOT NULL DEFAULT '',
            rich_text     TEXT    NOT NULL DEFAULT '',
            -- Source-of-truth model: when an English verse is first imported from a
            -- corpus (e.g. an English-only work), the corpus text is snapshotted into
            -- original_text (read-only reference) and source_origin records where it
            -- came from. \`text\` is the OWNED, editable English; reverting copies
            -- original_text back into text. Hand-written translations leave both NULL.
            source_origin TEXT,
            original_text TEXT,
            updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (book_id, chapter, verse)
        );
        CREATE TABLE IF NOT EXISTS translation_links (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id         INTEGER NOT NULL,
            chapter         INTEGER NOT NULL,
            verse           INTEGER NOT NULL,
            -- Which source language these links bind the shared English to. The
            -- English translation is one per verse; links are per (verse, lang), so
            -- switching language shows a different link set (you re-link per language).
            lang            TEXT    NOT NULL DEFAULT 'BHS',
            english_phrase  TEXT    NOT NULL DEFAULT '',
            english_indices TEXT    NOT NULL DEFAULT '[]',
            token_ordinals  TEXT    NOT NULL DEFAULT '[]',
            component_hint  TEXT    NOT NULL DEFAULT '',
            color_index     INTEGER NOT NULL DEFAULT 0,
            sort_order      INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_translations_book   ON translations(book_id);
        CREATE INDEX IF NOT EXISTS idx_translations_status ON translations(status);
        -- Revision history — one row per PRIOR version of a verse, written
        -- right before that version gets overwritten (see saveVerseWithHistory
        -- below). Every save so far has overwritten \`translations\` in place
        -- with no trail at all; fieldy, 2026-08-12, after a real edit briefly
        -- looked lost: "Keeping track of past versions in the UI that I can
        -- revert to would solve a lot of problems." saved_at is the prior
        -- version's OWN updated_at (when IT was written), not "now" — so
        -- entries read as a real timeline of what the verse actually was at
        -- each point, not a log of overwrite events.
        CREATE TABLE IF NOT EXISTS translation_history (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id    INTEGER NOT NULL,
            chapter    INTEGER NOT NULL,
            verse      INTEGER NOT NULL,
            status     TEXT,
            text       TEXT,
            rich_text  TEXT,
            saved_at   TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_translation_history_verse
            ON translation_history(book_id, chapter, verse, saved_at DESC, id DESC);
    `);

    // Migrations: add columns if upgrading from older schema (existing rows kept).
    try { tdb.exec(`ALTER TABLE translation_links ADD COLUMN english_indices TEXT NOT NULL DEFAULT '[]'`); } catch(e) { /* already exists */ }
    try { tdb.exec(`ALTER TABLE translations      ADD COLUMN rich_text TEXT NOT NULL DEFAULT ''`); } catch(e) { /* already exists */ }
    try { tdb.exec(`ALTER TABLE translation_links ADD COLUMN lang TEXT NOT NULL DEFAULT 'BHS'`); } catch(e) { /* already exists */ }
    try { tdb.exec(`ALTER TABLE translations      ADD COLUMN source_origin TEXT`); } catch(e) { /* already exists */ }
    try { tdb.exec(`ALTER TABLE translations      ADD COLUMN original_text TEXT`); } catch(e) { /* already exists */ }

    // The lang index is created AFTER the migration above, so it works whether the
    // table was freshly created (lang in CREATE) or upgraded in place (lang ALTERed).
    tdb.exec(`CREATE INDEX IF NOT EXISTS idx_links_verse_lang ON translation_links(book_id, chapter, verse, lang)`);
    }   // end if(!READ_ONLY): schema init/migration only runs on a writable handle

    const stmts = {
        getVerse:    tdb.prepare(`SELECT * FROM translations WHERE book_id=? AND chapter=? AND verse=?`),
        upsertVerse: tdb.prepare(`
            INSERT INTO translations(book_id, chapter, verse, status, text, rich_text, updated_at)
            VALUES(?,?,?,?,?,?,datetime('now'))
            ON CONFLICT(book_id,chapter,verse) DO UPDATE SET
                status=excluded.status, text=excluded.text, rich_text=excluded.rich_text, updated_at=excluded.updated_at
        `),
        chapterLinks: tdb.prepare(`
            SELECT * FROM translation_links
            WHERE book_id=? AND chapter=? AND lang=?
            ORDER BY verse, sort_order, id
        `),
        // Source-of-truth: snapshot the corpus original ONCE (never overwrite an
        // existing snapshot), creating the row if needed without disturbing text.
        importOriginal: tdb.prepare(`
            INSERT INTO translations(book_id, chapter, verse, status, text, rich_text, source_origin, original_text, updated_at)
            VALUES(?,?,?, 'none', ?, '', ?, ?, datetime('now'))
            ON CONFLICT(book_id,chapter,verse) DO UPDATE SET
                source_origin = COALESCE(translations.source_origin, excluded.source_origin),
                original_text = COALESCE(translations.original_text, excluded.original_text)
        `),
        revertVerse: tdb.prepare(`
            UPDATE translations
            SET text = original_text, rich_text = '', updated_at = datetime('now')
            WHERE book_id=? AND chapter=? AND verse=? AND original_text IS NOT NULL
        `),
        bookProgress: tdb.prepare(`
            SELECT
                SUM(CASE WHEN status='done'        THEN 1 ELSE 0 END) AS done_count,
                SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) AS in_progress_count
            FROM translations WHERE book_id=?
        `),
        chapterProgress: tdb.prepare(`SELECT verse, status, text, source_origin, original_text FROM translations WHERE book_id=? AND chapter=?`),
        allProgress:     tdb.prepare(`SELECT book_id, chapter, verse, status FROM translations`),
        // Links are scoped to a language.
        getLinks: tdb.prepare(`
            SELECT * FROM translation_links
            WHERE book_id=? AND chapter=? AND verse=? AND lang=?
            ORDER BY sort_order, id
        `),
        // Whole-chapter links in one query — lets a reader load a chapter without
        // a per-verse round trip (grouped by verse on the server).
        chapterLinks: tdb.prepare(`
            SELECT * FROM translation_links
            WHERE book_id=? AND chapter=? AND lang=?
            ORDER BY verse, sort_order, id
        `),
        // All links for a whole chapter in one query, so a reader can load a
        // chapter without one /translate/verse round-trip per verse.
        chapterLinks: tdb.prepare(`
            SELECT * FROM translation_links
            WHERE book_id=? AND chapter=? AND lang=?
            ORDER BY verse, sort_order, id
        `),
        insertLink: tdb.prepare(`
            INSERT INTO translation_links(book_id, chapter, verse, lang, english_phrase, english_indices, token_ordinals, component_hint, color_index, sort_order)
            VALUES(?,?,?,?,?,?,?,?,?,?)
        `),
        deleteLink:     tdb.prepare(`DELETE FROM translation_links WHERE id=? AND book_id=? AND chapter=? AND verse=?`),
        deleteAllLinks: tdb.prepare(`DELETE FROM translation_links WHERE book_id=? AND chapter=? AND verse=? AND lang=?`),
        updateLink: tdb.prepare(`
            UPDATE translation_links
            SET english_phrase=?, english_indices=?, token_ordinals=?, component_hint=?, color_index=?, sort_order=?
            WHERE id=? AND book_id=? AND chapter=? AND verse=?
        `),
        insertHistory: tdb.prepare(`
            INSERT INTO translation_history(book_id, chapter, verse, status, text, rich_text, saved_at)
            VALUES(?,?,?,?,?,?,?)
        `),
        // Newest first — the UI lists past versions most-recent-on-top.
        verseHistory: tdb.prepare(`
            SELECT id, status, text, rich_text, saved_at FROM translation_history
            WHERE book_id=? AND chapter=? AND verse=?
            ORDER BY saved_at DESC, id DESC
        `),
        historyEntry: tdb.prepare(`
            SELECT * FROM translation_history WHERE id=? AND book_id=? AND chapter=? AND verse=?
        `),
        deleteHistoryEntry: tdb.prepare(`
            DELETE FROM translation_history WHERE id=? AND book_id=? AND chapter=? AND verse=?
        `),
    };

    // Every save goes through here instead of calling stmts.upsertVerse
    // directly: if a row already exists AND the incoming value actually
    // differs from what's there (skip no-op re-saves — clicking Save twice
    // without changing anything shouldn't spam the history list), snapshot
    // the CURRENT row into translation_history BEFORE overwriting it. A
    // revert (see the /api/translate/history/revert route) calls this SAME
    // function with a past version's values, so reverting is itself just
    // another save — it also snapshots whatever it's replacing, meaning
    // reverting can never destroy anything either; the timeline only grows.
    function saveVerseWithHistory(book_id, chapter, verse, status, text, rich_text) {
        const run = tdb.transaction(() => {
            const existing = stmts.getVerse.get(book_id, chapter, verse);
            if (existing && (existing.text !== text || existing.status !== status || existing.rich_text !== rich_text)) {
                stmts.insertHistory.run(book_id, chapter, verse, existing.status, existing.text, existing.rich_text, existing.updated_at);
            }
            stmts.upsertVerse.run(book_id, chapter, verse, status, text, rich_text);
        });
        run();
    }

    return { tdb, stmts, saveVerseWithHistory };
})();

// --- VERSIFICATION MAP ---
// Keys are "book_id:display_chapter" -> { actual_chapter, verse_offset }
// verse_offset: display verse N maps to actual verse (N + verse_offset)
// Covers all known places where English/standard versification diverges from MT
const VERSIFICATION_MAP = {
    // Malachi: English ch4 = MT ch3 verses 19-24
    '39:4': { actual_chapter: 3, verse_offset: 18 },

    // Joel: English 2:28-32 = MT 3:1-5, English ch3 = MT ch4
    '29:3': { actual_chapter: 3, verse_offset: 0 },  // English 3 = MT 3 (no change needed, just ch4 below)
    '29:4': { actual_chapter: 4, verse_offset: 0 },  // English 4 = MT 4

    // 1 Samuel ch24 split: no token offset needed, data is correct in MT

    // Hosea: some traditions split differently — MT matches standard here

    // Extra display chapters needed per book (chapters not in DB but shown to user)
    // These are handled by DISPLAY_LAST_CHAPTER overrides below
};

// Override the last displayed chapter for books where English adds a chapter
const DISPLAY_LAST_CHAPTER = {
    39: 4,   // Malachi: show 4 chapters (MT has 3)
    29: 4,   // Joel: MT has 4, English splits ch2 — both end at 4 so no override needed
};

// Resolve a display (book, chapter) to actual DB (book, chapter, verse_offset)
function resolveChapter(bookId, displayChapter) {
    const key = `${bookId}:${displayChapter}`;
    if (VERSIFICATION_MAP[key]) {
        return VERSIFICATION_MAP[key];
    }
    return { actual_chapter: displayChapter, verse_offset: 0 };
}

// Preload the book list once at startup (stable data, never changes)
const BOOKS_RAW = db.prepare(`
    SELECT book_id, MIN(chapter) AS first_chapter, MAX(chapter) AS last_chapter
    FROM tokens_bhs
    GROUP BY book_id
    ORDER BY book_id
`).all();

// Map book_id -> chapter range for fast lookup, applying display overrides
const BOOK_META = {};
const BOOKS = BOOKS_RAW.map(b => {
    const last = DISPLAY_LAST_CHAPTER[b.book_id] || b.last_chapter;
    BOOK_META[b.book_id] = { first: b.first_chapter, last };
    return { ...b, last_chapter: last };
});

// Hebrew Bible (Old Testament) book names by 1-indexed book_id. Used wherever
// the response needs a human-readable book label (Root explorer by-book list,
// translation progress, etc).
const BOOK_NAMES = {
     1: 'Genesis',         2: 'Exodus',          3: 'Leviticus',
     4: 'Numbers',         5: 'Deuteronomy',     6: 'Joshua',
     7: 'Judges',          8: 'Ruth',            9: '1 Samuel',
    10: '2 Samuel',       11: '1 Kings',        12: '2 Kings',
    13: '1 Chronicles',   14: '2 Chronicles',   15: 'Ezra',
    16: 'Nehemiah',       17: 'Esther',         18: 'Job',
    19: 'Psalms',         20: 'Proverbs',       21: 'Ecclesiastes',
    22: 'Song of Songs',  23: 'Isaiah',         24: 'Jeremiah',
    25: 'Lamentations',   26: 'Ezekiel',        27: 'Daniel',
    28: 'Hosea',          29: 'Joel',           30: 'Amos',
    31: 'Obadiah',        32: 'Jonah',          33: 'Micah',
    34: 'Nahum',          35: 'Habakkuk',       36: 'Zephaniah',
    37: 'Haggai',         38: 'Zechariah',      39: 'Malachi',
    40: 'Matthew',        41: 'Mark',           42: 'Luke',
    43: 'John',           44: 'Acts',           45: 'Romans',
    46: '1 Corinthians',  47: '2 Corinthians',  48: 'Galatians',
    49: 'Ephesians',      50: 'Philippians',    51: 'Colossians',
    52: '1 Thessalonians',53: '2 Thessalonians',54: '1 Timothy',
    55: '2 Timothy',      56: 'Titus',          57: 'Philemon',
    58: 'Hebrews',        59: 'James',          60: '1 Peter',
    61: '2 Peter',        62: '1 John',         63: '2 John',
    64: '3 John',         65: 'Jude',           66: 'Revelation',
    // Ethiopic-canon additional books
    67: '1 Enoch',        68: 'Jubilees',       69: '1 Maccabees',
    70: 'Sirach',         71: 'Wisdom',
    // Deuterocanon / pseudepigrapha (served from corpus.db)
    72: 'Tobit',          73: 'Judith',         74: 'Baruch',
    75: 'Letter of Jeremiah', 76: '2 Maccabees', 77: '3 Maccabees',
    78: '4 Maccabees',    79: 'Susanna',        80: 'Bel and the Dragon',
    81: '1 Esdras',       82: 'Odes',           83: 'Psalms of Solomon',
    84: 'Prayer of Manasseh', 85: 'Psalm 151',  86: 'Psalm 154',
    87: '2 Meqabyan',     88: '3 Meqabyan',     89: '4 Baruch',
    90: 'Apocalypse of Ezra',
    // Promoted pseudepigrapha (assign-canon-ids.py) — cross-language books
    100: 'Jasher',        101: '1 Adam and Eve', 102: '2 Adam and Eve',
    103: 'Testament of Reuben', 104: 'Testament of Simeon', 105: 'Testament of Levi',
    106: 'Testament of Judah', 107: 'Testament of Issachar', 108: 'Testament of Zebulun',
    109: 'Testament of Dan', 110: 'Testament of Naphtali', 111: 'Testament of Gad',
    112: 'Testament of Asher', 113: 'Testament of Joseph', 114: 'Testament of Benjamin',
    115: 'Joseph and Asenath', 116: 'Testament of Abraham', 117: 'Testament of Isaac',
    118: 'Testament of Jacob', 119: 'Testament of Job', 120: 'Testament of Solomon',
    121: 'Apocalypse of Abraham', 122: 'Ascension of Isaiah', 123: 'Apocalypse of Elijah',
    124: 'Apocalypse of Sedrach', 125: 'Apocalypse of Peter', 126: 'Assumption of Moses',
    127: 'Ladder of Jacob', 128: 'Lives of the Prophets', 129: 'Jannes and Jambres',
    130: 'History of the Rechabites', 131: 'Book of Giants', 132: 'Genesis Apocryphon',
    133: 'Wisdom of Ahikar', 134: 'Words of Gad the Seer', 135: 'Odes of Solomon',
    136: '2 Enoch',       137: '3 Baruch',      138: '2 Baruch',
    139: '4 Ezra',        140: 'Songs of the Sabbath Sacrifice', 141: 'Five Psalms of David',
    142: 'Visions of Amram', 143: '1 Meqabyan',  144: 'Testament of Kohath',
    145: 'Book of Nathan the Prophet', 146: 'Apocryphon of Joshua', 147: 'Balaam Inscription',
    148: 'Words of Azariah', 149: 'Gospel of Nicodemus', 150: 'Epistle of Barnabas',
    151: 'Shepherd of Hermas I', 152: 'Shepherd of Hermas II', 153: 'Shepherd of Hermas III',
    154: 'Greek Esther',
};

// Prepared statement reused on every /api/tokens request
const TOKEN_QUERY = db.prepare(`
    SELECT verse, token_ordinal, word_raw, pos, morph, strongs
    FROM tokens_bhs
    WHERE book_id = ? AND chapter = ?
    ORDER BY verse, token_ordinal
`);

// NT Hebrew tokens (canon 40-66) live in a SEPARATE table, tokens_nt, built by
// build-nt-tokens.mjs. Their Strong's numbers are INFERRED — each NT Hebrew word is
// looked up in an index of the OT's attested surface forms (92.3% of the NT resolves;
// 53.8% by exact surface, 38.5% after prefix/suffix stripping). Keeping them out of
// tokens_bhs protects every OT statistic that reads that table (the nmpr/adjv dominance
// counts, the surface index, concordance frequencies) from inferred data.
// Selected with the same column shape so every downstream consumer — parseHebrewData,
// the Parallel viewer, the reader's transliteration mode — works unchanged.
const NT_TOKENS_READY = (() => {
    try { db.prepare(`SELECT 1 FROM tokens_nt LIMIT 1`).get(); return true; }
    catch { return false; }   // table not built yet: NT simply behaves as before
})();
const TOKEN_QUERY_NT = NT_TOKENS_READY ? db.prepare(`
    SELECT verse, token_ordinal, word_raw, pos, morph, strongs
    FROM tokens_nt
    WHERE book_id = ? AND chapter = ?
    ORDER BY verse, token_ordinal
`) : null;
/** Pick the token source for a book: BHS for the OT, the inferred NT table for 40-66. */
// Does tokens_nt carry this book? Used to admit NT-only books to /api/tokens, which
// otherwise gates on BOOK_META (BHS/OT only). Null when tokens_nt has not been built.
const NT_HAS_BOOK = TOKEN_QUERY_NT
    ? db.prepare(`SELECT 1 FROM tokens_nt WHERE book_id = ? LIMIT 1`)
    : null;
function tokenQueryFor(bookId, source) {
    if (!TOKEN_QUERY_NT) return TOKEN_QUERY;
    const src = String(source || '').toUpperCase();
    // An EXPLICIT source wins over the book range. This matters for the OT, where BOTH
    // tables have rows for the same book: tokens_bhs holds the Masoretic text and tokens_nt
    // (after build-heb-index.mjs --ot) holds the HEB edition. Without this the Heb Extra
    // viewer asking for Leviticus would silently get BHS tokens — different words, wrong
    // orthography — because book_id alone cannot say WHICH Hebrew you meant.
    if (src === 'HEB') return TOKEN_QUERY_NT;
    if (src === 'BHS') return TOKEN_QUERY;
    // No source given: only the NT is unambiguous, since BHS has no tokens there at all.
    return (bookId >= 40 && bookId <= 66) ? TOKEN_QUERY_NT : TOKEN_QUERY;
}
if (NT_TOKENS_READY) console.log('tokens_nt present — NT Hebrew tokens enabled for canon 40-66');

// ── STUDIO PER-VERSE HEBREW TOKENS ──────────────────────────────────────────
// The Studio needs ONE verse's Hebrew, and it must come from the same table
// /api/tokens would use for that book: tokens_bhs for the OT, tokens_nt for
// canon 40-66. Hardcoding tokens_bhs made every NT verse report "no Hebrew"
// AND return zero tokens. The 40-66 range mirrors tokenQueryFor's own
// no-source default — not a new rule.
const TX_VERSE_BHS = db.prepare(`
    SELECT token_ordinal, word_raw, pos, morph, strongs
    FROM tokens_bhs WHERE book_id=? AND chapter=? AND verse=? ORDER BY token_ordinal
`);
const TX_VERSE_NT = NT_TOKENS_READY ? db.prepare(`
    SELECT token_ordinal, word_raw, pos, morph, strongs
    FROM tokens_nt WHERE book_id=? AND chapter=? AND verse=? ORDER BY token_ordinal
`) : null;
function txVerseQuery(bookId) {
    return (TX_VERSE_NT && bookId >= 40 && bookId <= 66) ? TX_VERSE_NT : TX_VERSE_BHS;
}

// ── HOMOGRAPH SURFACE SET ───────────────────────────────────────────────────
// token_surfaces (surface-index.db) is keyed by word_raw ALONE, so it holds
// exactly one baked Strong's + one root parse per surface glyph string. A true
// homograph — the same consonants carrying two different roots, e.g. 𐤍𐤇𐤕 =
// H5148 "to lead" (Exod 13:21, hifil-inf, ה elided + ת ending) vs H5183 "rest"
// — cannot be represented there; the build keeps the most-frequent parse and
// the minority occurrence is served with the WRONG SN/root on the reader's fast
// path (while the roots page, which reads tokens_bhs, shows the right one).
//
// tokens_bhs carries the AUTHORITATIVE per-occurrence OSHB SN. Here we flag,
// once at startup, every word_raw that carries more than one distinct REAL
// (non-synthetic, i.e. not an H9xxx particle) Strong's across the corpus. Only
// these surfaces can be mis-served, so /api/tokens only pays the per-occurrence
// authoritative check on chapters that actually contain one. The set is small
// and lives in memory, keeping the hot path allocation-free for every chapter
// without a homograph. Normalizing with ('H'||REPLACE(strongs,'H','')) makes
// the check correct whether SNs are stored as 'H5148' or '5148'.
const HOMOGRAPH_SURFACES = new Set();
if (!db._isNull) {
    try {
        const homs = db.prepare(`
            SELECT word_raw FROM (
                SELECT word_raw,
                       COUNT(DISTINCT ('H' || REPLACE(strongs, 'H', ''))) AS n
                FROM   tokens_bhs
                WHERE  word_raw IS NOT NULL AND word_raw != ''
                  AND  strongs  IS NOT NULL AND strongs  != ''
                  AND  ('H' || REPLACE(strongs, 'H', '')) NOT GLOB 'H9[0-9][0-9][0-9]'
                GROUP BY word_raw
            ) WHERE n > 1
        `).all();
        for (const r of homs) HOMOGRAPH_SURFACES.add(r.word_raw);
        console.log(`[homographs] ${HOMOGRAPH_SURFACES.size} homograph surfaces flagged`);
    } catch (e) {
        console.warn('[homographs] precompute failed (reader falls back only on override/drift):', e.message);
    }
}

// Static file serving.  Two concerns:
//   1. Vite-built React assets (public/dist/assets/*) have content-hashed
//      filenames, so they're safe to cache "forever".
//   2. Lexicon JSONs change occasionally; 5 minutes is a good middle ground
//      between freshness and avoiding pointless revalidations.
//   3. Legacy HTML in /public (if any remain) gets a short cache to balance
//      iteration speed during development with reasonable production behavior.
app.use(express.static('public', {
    maxAge: '5m',
    setHeaders: (res, filePath) => {
        // Content-hashed bundle assets (Vite emits like `index-aBc123.js`) →
        // immutable.  We detect them by the 8+ hex-char dot-hash pattern that
        // Vite inserts before the extension.
        if (/\-[A-Za-z0-9_-]{8,}\.[a-z]+$/.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
        // index.html itself MUST be no-cache. It's tiny and points to the
        // current asset hashes — if the browser caches an old copy, it loads
        // outdated bundle references and the user sees stale UI forever.
        else if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    },
}));
app.use('/lexicon', express.static(path.join(__dirname, 'lexicon'), { maxAge: '5m' }));

// ── SPA PAGE ROUTES ──────────────────────────────────────────────────────────
// After the React migration, every page in the app is served by a single
// index.html bundle and React Router maps the URL to the right component.
// These named routes exist so direct deep-links (and bookmarks) still work
// — they all serve the same shell. If you visit /lexicon-page, the browser
// loads index.html, React Router sees the URL, and mounts the Lexicon page.
//
// IMPORTANT: every path registered in src/App.jsx's <Routes> needs an entry
// here, otherwise a hard refresh returns "Cannot GET /<path>". A generic
// catch-all at the bottom of the file covers anything we miss.
const spaShell = (req, res) => {
    // Send index.html with no-cache headers (same reason as the static block
    // above — index.html references hashed assets, must be re-fetched).
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
};
app.get('/lexicon-page',   spaShell);
app.get('/lexicon',        spaShell);
app.get('/lexicon-source', spaShell);   // legacy → redirect handled by React
app.get('/landing',        spaShell);
app.get('/share',          spaShell);
app.get('/cheatsheet',     spaShell);
app.get('/glyph-editor',   spaShell);
// NOTE: /root, /roots and /surfaces are deliberately NOT registered here.
// Each has its own more specific handler further down (search "ROOT /
// SURFACE EXPLORER ROUTES") that 302-redirects a bare visit to the
// alphabetically-first root/surface (or the /roots equivalent, for /root's
// legacy-alias case) instead of just serving the shell. Registering a
// spaShell catch-all here for these three would have shadowed those
// handlers completely — Express runs the FIRST matching app.get() for a
// path and never reaches the second — which is exactly what was happening
// until 2026-08-14: bare /roots and /surfaces silently served the shell
// with no redirect at all, and /root never redirected to /roots either.
// Found while investigating why Google indexed a generic /roots snapshot
// instead of any specific root entry. The later handlers still call
// res.sendFile(index.html) for the non-redirect case, so hard-refresh
// keeps working exactly as it did before — nothing here regresses.
app.get('/parallel',       spaShell);
app.get('/translate',      spaShell);
app.get('/read',           spaShell);   // legacy → redirect handled by React

// --- 1. HARD-WIRED MAPS ---
const CHAR_MAP = {
    '𐤀': { med: 'a', fin: 'a' }, '𐤁': { med: 'ba', fin: 'b' },
    '𐤂': { med: 'ga', fin: 'g' }, '𐤃': { med: 'da', fin: 'd' },
    '𐤄': { med: 'ha', fin: 'h' }, '𐤅': { med: 'wa', fin: 'w' },
    '𐤆': { med: 'za', fin: 'z' }, '𐤇': { med: 'cha', fin: 'ch' },
    '𐤈': { med: 'ta', fin: 't' }, '𐤉': { med: 'ya', fin: 'y' },
    '𐤊': { med: 'ka', fin: 'k' }, '𐤋': { med: 'la', fin: 'l' },
    '𐤌': { med: 'ma', fin: 'm' }, '𐤍': { med: 'na', fin: 'n' },
    '𐤎': { med: 'sa', fin: 's' }, '𐤏': { med: 'i', fin: 'i' },
    '𐤐': { med: 'pa', fin: 'p' }, '𐤑': { med: 'tza', fin: 'tz' },
    '𐤒': { med: 'qa', fin: 'q' }, '𐤓': { med: 'ra', fin: 'r' },
    '𐤔': { med: 'sha', fin: 'sh' }, '𐤕': { med: 'tha', fin: 'th' }
};

const GRAMMAR_MAP = {
    prep: { '𐤁': 'in', '𐤋': 'to', '𐤌': 'from', '𐤊': 'as', '𐤀𐤕': 'entirety/whole', '𐤏𐤋': 'upon', '𐤀𐤋': 'toward',
        '𐤋𐤊': 'you', '𐤏𐤌': 'with' , '𐤌𐤍': 'from',
    },
    conj: { '𐤅': 'And' },
    art:  { '𐤄': 'The' },
    // INTERROGATIVE HE — homograph of the article: same letter 𐤄, different POS.
    // It PREFIXES the following word (𐤄+𐤋𐤅𐤀 = "is it not?"), is never a suffix,
    // and must not inherit the article's "The" gloss.
    inrg: { '𐤄': '[?]' },
    // pfm — verbal prefix markers, each tagged with its own css class
    pfm: {
        'J':  { paleo: ['𐤅𐤉','𐤅','𐤉'], trans: 'He/It',          css: 'pfm-3ms' },
        'T':  { paleo: ['𐤕'],            trans: 'She/You',        css: 'pfm-2or3f' },
        'T=': { paleo: ['𐤕'],            trans: 'She',            css: 'pfm-2or3f' },
        '>':  { paleo: ['𐤀'],            trans: 'I',              css: 'pfm-1cs' },
        '<':  { paleo: ['𐤀'],            trans: 'I',              css: 'pfm-1cs' },
        'N':  { paleo: ['𐤍'],            trans: 'We',             css: 'pfm-1cp' },
        'M':  { paleo: ['𐤌'],            trans: 'Active',         css: 'pfm-ptcp' },
    },
    // vbs — verbal stem markers
    vbs: {
        'H':   { paleo: ['𐤄'],       trans: 'Causing',        css: 'vbs-hif' },
        'N':   { paleo: ['𐤍'],       trans: 'Passive',        css: 'vbs-nif' },  // Nifal: passive OR reflexive depending on root
        'HCT': { paleo: ['𐤄𐤕','𐤕'], trans: 'Reflexive',      css: 'vbs-hit' },
        'HT':  { paleo: ['𐤄𐤕','𐤕'], trans: 'Reflexive',      css: 'vbs-hit' },
    },
    // prs — pronominal suffixes, one css per person/gender/number
    prs: {
        'J':  { paleo: ['𐤉'],       trans: 'My',             css: 'prs-1cs' },
        'NJ': { paleo: ['𐤍𐤉'],      trans: 'Me',             css: 'prs-1cs' },
        'NW': { paleo: ['𐤍𐤅'],      trans: 'Our',            css: 'prs-1cp' },
        'K':  { paleo: ['𐤊'],       trans: 'Your',           css: 'prs-2ms' },
        'KM': { paleo: ['𐤊𐤌'],      trans: 'Your (plural)',  css: 'prs-2mp' },
        'KN': { paleo: ['𐤊𐤍'],      trans: 'Your (her pl)',  css: 'prs-2fp' },
        'W':  { paleo: ['𐤄𐤅','𐤅'], trans: 'His',            css: 'prs-3ms' },
        'HW': { paleo: ['𐤄𐤅','𐤅'], trans: 'His',            css: 'prs-3ms' },
        'H':  { paleo: ['𐤄'],       trans: 'Her',            css: 'prs-3fs' },
        'M':  { paleo: ['𐤌'],       trans: 'Their',          css: 'prs-3mp' },
        'HM': { paleo: ['𐤄𐤌','𐤌'], trans: 'Their',          css: 'prs-3mp' },
        'N':  { paleo: ['𐤍'],       trans: 'Their (her)',    css: 'prs-3fp' },
        'HN': { paleo: ['𐤄𐤍','𐤍'], trans: 'Their (her)',    css: 'prs-3fp' },
    },
    // nme — nominal/verbal endings
    nme: {
        'H':   { paleo: ['𐤄'],        trans: 'Feminine/At', css: 'nme-h' },
        'T':   { paleo: ['𐤕'],        trans: 'Feminine',        css: 'nme-f' },
        'J':   { paleo: ['𐤉'],        trans: 'Of/My',           css: 'nme-j' },
        'J=':  { paleo: ['𐤉'],        trans: 'Of/My',           css: 'nme-j' },
        'JM':  { paleo: ['𐤉𐤌','𐤌'],  trans: 'Plural (masc)',   css: 'nme-jm' },
        'JM=': { paleo: ['𐤉𐤌','𐤌'],  trans: 'Plural (masc)',   css: 'nme-jm' },
        'WT':  { paleo: ['𐤅𐤕','𐤕'],  trans: 'Plural (fem)',    css: 'nme-wt' },
        'WTJ': { paleo: ['𐤅𐤕𐤉','𐤕𐤉'], trans: 'Plural of',    css: 'nme-wtj' },
        'NH':  { paleo: ['𐤍𐤄'],      trans: 'They (fem)',      css: 'nme-nh' },
    },
    // vbe — verbal endings (person agreement)
    vbe: {
        'TJ': { paleo: ['𐤕𐤉'],    trans: 'I did',          css: 'vbe-1cs' },
        'NW': { paleo: ['𐤍𐤅'],    trans: 'We did',         css: 'vbe-1cp' },
        'T':  { paleo: ['𐤕'],     trans: 'You/She did',    css: 'vbe-2or3f' },
        'TM': { paleo: ['𐤕𐤌'],    trans: 'You all did',    css: 'vbe-2mp' },
        'TN': { paleo: ['𐤕𐤍'],    trans: 'You all did (f)',css: 'vbe-2fp' },
        'W':  { paleo: ['𐤅'],     trans: 'They did',       css: 'vbe-3mp' },
        'WN': { paleo: ['𐤅𐤍'],    trans: 'They did (f)',   css: 'vbe-3fp' },
        'NH': { paleo: ['𐤍𐤄'],    trans: 'They did (f)',   css: 'vbe-3fp' },
        'H=': { paleo: ['𐤕𐤄','𐤄'], trans: 'She did',      css: 'vbe-3fs' },
        'H':  { paleo: ['𐤕𐤄','𐤄'], trans: 'She did',      css: 'vbe-3fs' },
        // 'J' = 2fs verbal ending (yod suffix). Verified empirically: every
        // corpus token with vbe=J has ps=p2|gn=f|nu=sg and ends in 𐤉.
        // 497 occurrences across the OT — examples include 𐤕𐤃𐤁𐤓𐤉 (Isaiah
        // 29:4) and 𐤕𐤀𐤊𐤋𐤉.
        'J':  { paleo: ['𐤉'],     trans: 'You did (f)',    css: 'vbe-2fs' },
    },
    uvf: {
        'H': { paleo: ['𐤄'], trans: 'At',          css: 'uvf-dir' },
        'J': { paleo: ['𐤉'], trans: 'Emphatic',        css: 'uvf-conn' },
        'N': { paleo: ['𐤍'], trans: 'Emphatic',        css: 'uvf-conn' },
    }
};

// ── NME_EXCLUSIONS ──────────────────────────────────────────────────────────
// Words where the nominal-ending (nme) stripper must NOT fire.
// Three categories:
//   A) The word IS the dictionary form — suffix-like trailing letters are root
//      radicals (e.g. 𐤔𐤌𐤉𐤌 ends in 𐤉𐤌 which looks like nme=JM but IS the root).
//   B) Invariant lexemes — these never take productive inflectional suffixes in
//      the corpus (proper nouns, frozen forms, particles treated as roots).
//   C) Cardinal/ordinal numbers whose final radical looks like a suffix.
//
// IMPORTANT: Only list the exact word_raw surface as it appears in tokens_bhs.
// Prefixed forms (𐤁𐤔𐤌𐤉𐤌, 𐤄𐤔𐤌𐤉𐤌, etc.) are handled separately by the
// strongs-roots cross-check in the trueRoot resolution step below.
const NME_EXCLUSIONS = new Set([
    // ── Category A: root-final letters look like nme suffixes ──────────────
    '𐤀𐤋𐤄𐤉𐤌',  // Alahayam — plural ending is root (H430)
    '𐤔𐤌𐤉𐤌',   // Shamayam — dual heavens, YM are root radicals (H8064)
    '𐤌𐤉𐤌',    // Mayam — waters, YM are root (H4325)
    '𐤉𐤌𐤉𐤌',   // Yamayim — seas, the surface form for H3220 (yam); JM would strip to 𐤉 (wrong)
    '𐤉𐤅𐤌𐤉𐤌',  // Yawamayim — days plural (H3117); JM would strip 𐤉𐤌 → 𐤉𐤅𐤌 which is fine,
                //   but list here so the root 𐤉𐤅𐤌 is never collapsed to 𐤉𐤌 via mutation
    '𐤐𐤍𐤉',    // Panay — face/presence (H6440); YM-like ending is construct radical
    '𐤀𐤋𐤄𐤉𐤊',  // Alahayak — your Mighty One; suffix 𐤊 is possessive not nme
    '𐤕𐤌𐤅𐤍𐤄',  // Thamawnah — form/likeness; the 𐤄 is root, not nme=H
    '𐤌𐤑𐤅𐤕',   // Matzawath — commandment; the 𐤕 is root (H4687), not nme=T
    '𐤐𐤒𐤇𐤉𐤌',  // — eyes/springs (H6491); JM would strip incorrectly
    '𐤆𐤊𐤅𐤓',   // Zakawar — memorial; 𐤅𐤓 is root (H2143)
    '𐤓𐤀𐤔𐤉𐤕',  // Raashayath — beginning; 𐤉𐤕 is root (H7225)
    // ── Category C: cardinal/ordinal numbers ───────────────────────────────
    '𐤔𐤍𐤉',    // shanay = two — yod is a root radical, not nme=J construct suffix
    '𐤔𐤕𐤉𐤌',   // shatayim = two (feminine dual absolute)
]);
// 𐤌𐤍 (min, "from") added 2026-07-29 — verified attested BEFORE adding, per the
// no-hand-typed-particles rule: tokens_bhs has it ~852x as pos=prep/H4480-4481
// (the rare inrg/prde/subs homograph readings for the same letters are single
// digits by comparison). "min" doesn't assimilate before a guttural like the
// article, so it stays a full two letters there instead of reducing to bare
// 𐤌 — HEB/NT "Manahamalaakayam" = 𐤌𐤍 (from) + 𐤄 (the) + 𐤌𐤋𐤀𐤊𐤉𐤌 (angels).
const STANDALONE_WORDS = ['𐤀𐤕', '𐤏𐤋', '𐤁𐤉𐤍', '𐤊𐤉', '𐤊𐤍', '𐤀𐤔𐤓', '𐤀𐤋', '𐤌𐤍'];

const MUTATED_ROOTS = {
    // ═══════════════════════════════════════════════════════════════════════
    // 1. HOLLOW ROOTS — Peh-Waw / Peh-Yad (middle radical contracts)
    //    When the middle radical is Waw (𐤅) or Yad (𐤉) it contracts under
    //    conjugation leaving only the first and last consonant on the surface.
    // ═══════════════════════════════════════════════════════════════════════

    // Yam (Yad-Mayam) -> Yawam (Yad-Waw-Mayam): middle Waw contracts in construct/plural. TRUE ROOT: Yawam (𐤉𐤅𐤌) "day"
    '𐤉𐤌': '𐤉𐤅𐤌',
    // Math (Mayam-Thaw) -> Mawath (Mayam-Waw-Thaw): hollow Waw drops in perf/impf. TRUE ROOT: Mawath (𐤌𐤅𐤕) "to die"
    '𐤌𐤕': '𐤌𐤅𐤕',
    // Qam (Qap-Mayam) -> Qawam (Qap-Waw-Mayam): Waw contracts under conjugation. TRUE ROOT: Qawam (𐤒𐤅𐤌) "to arise/stand"
    '𐤒𐤌': '𐤒𐤅𐤌',
    // Baa (Bayath-Alap) -> Bawaa (Bayath-Waw-Alap): hollow Waw drops. TRUE ROOT: Bawaa (𐤁𐤅𐤀) "to come/enter"
    '𐤁𐤀': '𐤁𐤅𐤀',
    // Ratz (Rash-Tzad) -> Rawatz (Rash-Waw-Tzad): hollow Waw contracts. TRUE ROOT: Rawatz (𐤓𐤅𐤑) "to run"
    '𐤓𐤑': '𐤓𐤅𐤑',
    // Sar (Samak-Rash) -> Sawar (Samak-Waw-Rash): Waw contracts. TRUE ROOT: Sawar (𐤎𐤅𐤓) "to turn aside/depart"
    '𐤎𐤓': '𐤎𐤅𐤓',
    // Qaw (Qap-Waw) -> Qawah (Qap-Waw-Hay): hollow root; final Hay also drops alongside Waw. TRUE ROOT: Qawah (𐤒𐤅𐤄) "to call/gather/wait"
    '𐤒𐤅': '𐤒𐤅𐤄',
    // Baw (Bayath-Waw) -> Bawaa (Bayath-Waw-Alap): bare hollow residual after suffix stripping. TRUE ROOT: Bawaa (𐤁𐤅𐤀) "to come"
    '𐤁𐤅': '𐤁𐤅𐤀',
    // Raw (Rash-Waw) -> Rawah (Rash-Waw-Hay): hollow lamed-Hay residual. TRUE ROOT: Rawah (𐤓𐤅𐤄) "to be satisfied"
    '𐤓𐤅': '𐤓𐤅𐤄',
    // Gaw (Gamal-Waw) -> Gawah (Gamal-Waw-Hay): hollow lamed-Hay. TRUE ROOT: Gawah (𐤂𐤅𐤄) "verbal form (hollow lamed-Hay)"
    '𐤂𐤅': '𐤂𐤅𐤄',
    // Haw (Hay-Waw) -> Hawah (Hay-Waw-Hay): hollow lamed-Hay. TRUE ROOT: Hawah (𐤄𐤅𐤄) "to become/be (older form)"
    '𐤄𐤅': '𐤄𐤅𐤄',
    // Tzaw (Tzad-Waw) -> Tzawah (Tzad-Waw-Hay): final Hay drops; also catches stripped form. TRUE ROOT: Tzawah (𐤑𐤅𐤄) "to command/charge"
    '𐤑𐤅': '𐤑𐤅𐤄',
    // Kah (Kap-Hay) -> Kawah (Kap-Waw-Hay): lamed-Hay with hollow middle; Waw contracts to Hay. TRUE ROOT: Kawah (𐤊𐤅𐤄) "to burn/brand"
    '𐤊𐤄': '𐤊𐤅𐤄',

    // ── Hollow roots: 3-letter surface forms where medial Waw dropped ────────
    // These are NOUN surface forms (after article/suffix stripping) where the
    // Waw between two consonants has contracted out, leaving a 3-letter string
    // that looks like a regular root but points to a 4-letter true root.

    // Maar (Mayam-Alap-Rash) -> Maawar (Mayam-Alap-Waw-Rash):
    //   Waw contracts between Alap and Rash in luminary nouns (construct/plural).
    //   TRUE ROOT: Maawar (𐤌𐤀𐤅𐤓) "luminary/light" (Gen 1:16 𐤄𐤌𐤀𐤓𐤕 = the luminaries)
    '𐤌𐤀𐤓': '𐤌𐤀𐤅𐤓',

    // ── Additional hollow verb surface forms (Ayin-Waw pattern) ─────────────

    // Shab (Shin-Bayath) -> Shawab (Shin-Waw-Bayath): Waw drops. TRUE ROOT: Shawab (𐤔𐤅𐤁) "to return/repent"
    '𐤔𐤁': '𐤔𐤅𐤁',
    // Bash (Bayath-Shin) -> Bawash (Bayath-Waw-Shin): Waw drops. TRUE ROOT: Bawash (𐤁𐤅𐤔) "to be ashamed"
    '𐤁𐤔': '𐤁𐤅𐤔',
    // Nam (Nun-Mayam) -> Nawam (Nun-Waw-Mayam): hollow Waw. TRUE ROOT: Nawam (𐤍𐤅𐤌) "to sleep/slumber"
    '𐤍𐤌': '𐤍𐤅𐤌',
    // Nas (Nun-Samak) -> Nawas (Nun-Waw-Samak): Waw drops. TRUE ROOT: Nawas (𐤍𐤅𐤎) "to flee"
    '𐤍𐤎': '𐤍𐤅𐤎',
    // Rum (Rash-Mayam) -> Rawam (Rash-Waw-Mayam): Waw drops. TRUE ROOT: Rawam (𐤓𐤅𐤌) "to be high/exalted"
    '𐤓𐤌': '𐤓𐤅𐤌',
    // Tzam (Tzad-Mayam) -> Tzawam (Tzad-Waw-Mayam): Waw drops. TRUE ROOT: Tzawam (𐤑𐤅𐤌) "to fast"
    '𐤑𐤌': '𐤑𐤅𐤌',
    // Dan (Dalet-Nun) -> Dawan (Dalet-Waw-Nun): hollow Waw. TRUE ROOT: Dawan (𐤃𐤅𐤍) "to judge/contend"
    '𐤃𐤍': '𐤃𐤅𐤍',
    // Kan (Kap-Nun) -> Kawan (Kap-Waw-Nun): Waw drops in construct. TRUE ROOT: Kawan (𐤊𐤅𐤍) "to establish/be firm"
    '𐤊𐤍': '𐤊𐤅𐤍',
    // Lan (Lamad-Nun) -> Lawan (Lamad-Waw-Nun): Waw drops. TRUE ROOT: Lawan (𐤋𐤅𐤍) "to lodge/remain overnight"
    '𐤋𐤍': '𐤋𐤅𐤍',
    // Tab (Tet-Bayath) -> Tawab (Tet-Waw-Bayath): Waw drops. TRUE ROOT: Tawab (𐤈𐤅𐤁) "to be good/pleasant"
    '𐤈𐤁': '𐤈𐤅𐤁',
    // Iap (Ayin-Peh) -> Iawap (Ayin-Waw-Peh): hollow Waw. TRUE ROOT: Iawap (𐤏𐤅𐤐) "to fly"
    '𐤏𐤐': '𐤏𐤅𐤐',
    // Qayap (Qap-Yad-Peh): Pe-Nun root נקף (naqap). Nun assimilates into Qof in Hifil.
    //   𐤄𐤒𐤉𐤐: vbs=H strips Hay → 𐤒𐤉𐤐. Yod is internal Hifil vowel marker, not a root letter.
    //   TRUE ROOT: Naqap (𐤍𐤒𐤐) "to go around/encircle/strike off" (Strong's 5362)
    '𐤒𐤉𐤐': '𐤍𐤒𐤐',
    // Sab (Samak-Bayath) -> Sabab (Samak-Bayath-Bayath): geminate root, second Bet drops in qal perf 2mp (vbe=TM strips 𐤕𐤌).
    //   𐤎𐤁𐤕𐤌: vbe=TM strips 𐤕𐤌 → 𐤎𐤁. TRUE ROOT: Sabab (𐤎𐤁𐤁) "to go around/encircle" (Strong's 5437)
    '𐤎𐤁': '𐤎𐤁𐤁',
    // Zan (Zayn-Nun) -> Zawan (Zayn-Waw-Nun): Waw drops. TRUE ROOT: Zawan (𐤆𐤅𐤍) "to feed/nourish"
    '𐤆𐤍': '𐤆𐤅𐤍',
    // Shad (Shin-Dalet) -> Shawad (Shin-Waw-Dalet): Waw drops. TRUE ROOT: Shawad (𐤔𐤅𐤃) "to devastate/despoil"
    '𐤔𐤃': '𐤔𐤅𐤃',
    // Pal (Alap-Peh-Lamad... no: surface Alap-Lamad) -- skip; handled by Pe-Nun
    // Rak (Rash-Kap) -> Rawak (Rash-Waw-Kap): Waw drops. TRUE ROOT: Rawak (𐤓𐤅𐤊) "to be empty/pour out"
    '𐤓𐤊': '𐤓𐤅𐤊',
    // Hal (Hay-Lamad) -> Hawal (Hay-Waw-Lamad): hollow Waw. TRUE ROOT: Hawal (𐤄𐤅𐤋) "to be foolish/profane"
    '𐤄𐤋': '𐤄𐤅𐤋',
    // Shach (Shin-Khet) -> Shawach (Shin-Waw-Khet): Waw drops. TRUE ROOT: Shawach (𐤔𐤅𐤇) "to cry out"
    '𐤔𐤇': '𐤔𐤅𐤇',

    // ── Ayin-Yad hollow pattern (medial Yad drops) ───────────────────────────

    // Bain (Bayath-Nun) -- NOTE: 𐤁𐤍 is already lamed-Hay "to build", skip
    // Shaim (Shin-Mayam) -> Shayam (Shin-Yad-Mayam): Yad drops. TRUE ROOT: Shayam (𐤔𐤉𐤌) "to put/place/set"
    '𐤔𐤌': '𐤔𐤉𐤌',
    // Rak (not Yad pattern here)
    // Rain (Rash-Nun) -> Rayin (Rash-Yad-Nun): Yad drops. TRUE ROOT: Rayin (𐤓𐤉𐤍) "to sing/shout"
    '𐤓𐤍': '𐤓𐤉𐤍',
    // ═══════════════════════════════════════════════════════════════════════
    // 2. PEH-NUN VERBS — initial Nun (𐤍) assimilates into the next consonant
    //    Nun as first radical doubles the following consonant and disappears.
    //    Restore Nun (Nun) as the first radical.
    // ═══════════════════════════════════════════════════════════════════════

    // Shaa (Shin-Alap) -> Nashaa (Nun-Shin-Alap): initial Nun assimilates into Shin. TRUE ROOT: Nashaa (𐤍𐤔𐤀) "to lift/carry/take"
    '𐤔𐤀': '𐤍𐤔𐤀',
    // Gash (Gamal-Shin) -> Nagash (Nun-Gamal-Shin): Nun assimilates into Gamal. TRUE ROOT: Nagash (𐤍𐤂𐤔) "to approach/draw near"
    '𐤂𐤔': '𐤍𐤂𐤔',
    // Pal (Peh-Lamad) -> Napal (Nun-Peh-Lamad): Nun assimilates into Peh. TRUE ROOT: Napal (𐤍𐤐𐤋) "to fall"
    '𐤐𐤋': '𐤍𐤐𐤋',
    // Than (Thaw-Nun) -> Nathan (Nun-Thaw-Nun): first Nun assimilates in imperfect; both visible in perfect. TRUE ROOT: Nathan (𐤍𐤕𐤍) "to give"
    '𐤕𐤍': '𐤍𐤕𐤍',
    // Tzal (Tzad-Lamad) -> Natzal (Nun-Tzad-Lamad): Nun assimilates into Tzad. TRUE ROOT: Natzal (𐤍𐤑𐤋) "to deliver/rescue"
    '𐤑𐤋': '𐤍𐤑𐤋',
    // Gai (Gamal-Ayin) -> Nagai (Nun-Gamal-Ayin): Nun assimilates into Gamal. TRUE ROOT: Nagai (𐤍𐤂𐤏) "to touch/strike/reach"
    '𐤂𐤏': '𐤍𐤂𐤏',
    // Sai (Samak-Ayin) -> Nasai (Nun-Samak-Ayin): Nun assimilates into Samak. TRUE ROOT: Nasai (𐤍𐤎𐤏) "to journey/set out"
    '𐤎𐤏': '𐤍𐤎𐤏',
    // Gad (Gamal-Dalet) -> Nagad (Nun-Gamal-Dalet): Nun assimilates into Gamal. TRUE ROOT: Nagad (𐤍𐤂𐤃) "to declare/tell/announce"
    '𐤂𐤃': '𐤍𐤂𐤃',
    // Pash (Peh-Shin) -> NaPash (Nun-Peh-Shin): Nun assimilates into Peh.
    //   As NOUN: NaPash (𐤍𐤐𐤔) "living being/soul/self" (Gen 1:20, Gen 2:7)
    //   As VERB: NaPash (𐤍𐤐𐤔) "to refresh/rest/breathe" (Exod 23:12, 2 Sam 16:14)
    //   The pos field in the DB distinguishes these: subs vs verb.
    //   The homographs.json should carry: "𐤍𐤐𐤔_subs" and "𐤍𐤐𐤔_verb"
    '𐤐𐤔': '𐤍𐤐𐤔',
    // Pal (Peh-Lamad) -> NaPal (Nun-Peh-Lamad): already present above as '𐤐𐤋': '𐤍𐤐𐤋'
    // Pakad (Peh-Kap-Dalet) -> surface Pak (Peh-Kap): Nun assimilates.
    //   TRUE ROOT: NaPaKad (𐤍𐤐𐤒𐤃... wait — this is 4 letters not Pe-Nun pattern)
    // Pat (Peh-Tet) -> NaPaT: Nun assimilates into Peh. TRUE ROOT: NaPaT (𐤍𐤐𐤈) "to strike/smite"
    '𐤐𐤈': '𐤍𐤐𐤈',
    // Patz (Peh-Tzad) -> NaPatz (Nun-Peh-Tzad): TRUE ROOT: NaPatz (𐤍𐤐𐤑) "to shatter/scatter"
    '𐤐𐤑': '𐤍𐤐𐤑',
    // Tzan (Tzad-Nun) -> NaTzan (Nun-Tzad-Nun): surface Tzad-Nun after nun-assimilation. TRUE ROOT: NaTzan (𐤍𐤑𐤍) — less common; skip for now
    // ═══════════════════════════════════════════════════════════════════════
    // 3. PEH-YAD VERBS — initial Yad (𐤉) elides under conjugation
    //    Yad as first radical drops in the imperfect and nominal/infinitive forms.
    //    Restore Yad (Yad) as the first radical.
    // ═══════════════════════════════════════════════════════════════════════

    // Dai (Dalet-Ayin) -> Yadai (Yad-Dalet-Ayin): initial Yad drops in imperfect. TRUE ROOT: Yadai (𐤉𐤃𐤏) "to know"
    '𐤃𐤏': '𐤉𐤃𐤏',
    // Tzaa (Tzad-Alap) -> Yatzaa (Yad-Tzad-Alap): Yad elides. TRUE ROOT: Yatzaa (𐤉𐤑𐤀) "to go out/come forth"
    '𐤑𐤀': '𐤉𐤑𐤀',
    // Rad (Rash-Dalet) -> Yarad (Yad-Rash-Dalet): Yad elides in imperfect. TRUE ROOT: Yarad (𐤉𐤓𐤃) "to go down/descend"
    '𐤓𐤃': '𐤉𐤓𐤃',
    // Lad (Lamad-Dalet) -> Yalad (Yad-Lamad-Dalet): Yad elides. TRUE ROOT: Yalad (𐤉𐤋𐤃) "to bear/bring forth"
    '𐤋𐤃': '𐤉𐤋𐤃',
    // Shath (Shin-Thaw) -> Shayath (Shin-Yad-Thaw): Peh-Yad with hollow middle; Yad contracts. TRUE ROOT: Shayath (𐤔𐤉𐤕) "to set/place"
    '𐤔𐤕': '𐤔𐤉𐤕',

    // ── Waw-prefixed Peh-Yad residuals from Hifil wayyiqtol ──────────────
    // In Hifil wayyiqtol of Peh-Yad verbs the surface form is:
    //   waw-consec(𐤅) + hif-prefix(𐤄) + absorbed-Yad(𐤅) + root + suffix
    // pfm=J strips the first 𐤅, vbs=H strips 𐤄, leaving absorbed-Yad(𐤅)+root+suffix.
    // After vbe stripping, the residual stem opens with 𐤅 — the absorbed Yad.
    // These entries recover the true Peh-Yad root by restoring Yad as the first radical.

    // Waw-Rash-Shin (𐤅𐤓𐤔) residual of Yad-Rash-Shin (𐤉𐤓𐤔):
    //   Absorbed Yad remains as 𐤅 after prefix stripping. TRUE ROOT: Yarash (𐤉𐤓𐤔) "to possess/dispossess/inherit"
    '𐤅𐤓𐤔': '𐤉𐤓𐤔',
    // Waw-Dalet-Ayin (𐤅𐤃𐤏) residual of Yad-Dalet-Ayin (𐤉𐤃𐤏):
    //   Absorbed Yad remains as 𐤅. TRUE ROOT: Yadai (𐤉𐤃𐤏) "to know"
    '𐤅𐤃𐤏': '𐤉𐤃𐤏',
    // Waw-Tzad-Alap (𐤅𐤑𐤀) residual of Yad-Tzad-Alap (𐤉𐤑𐤀):
    //   Absorbed Yad remains as 𐤅. TRUE ROOT: Yatzaa (𐤉𐤑𐤀) "to go out/come forth"
    '𐤅𐤑𐤀': '𐤉𐤑𐤀',
    // Waw-Rash-Dalet (𐤅𐤓𐤃) residual of Yad-Rash-Dalet (𐤉𐤓𐤃):
    //   Absorbed Yad remains as 𐤅. TRUE ROOT: Yarad (𐤉𐤓𐤃) "to go down/descend"
    '𐤅𐤓𐤃': '𐤉𐤓𐤃',
    // Waw-Lamad-Dalet (𐤅𐤋𐤃) residual of Yad-Lamad-Dalet (𐤉𐤋𐤃):
    //   Absorbed Yad remains as 𐤅. TRUE ROOT: Yalad (𐤉𐤋𐤃) "to bear/bring forth/beget"
    '𐤅𐤋𐤃': '𐤉𐤋𐤃',

    // ── Pe-Yad Hifil infinitive construct (absorbed Yad + matres lectionis) ──
    // In Hifil infc of Pe-Yad roots the form is:
    //   hif-prefix(𐤄) + absorbed-Yad(𐤅) + root-C2-C3 + matres-Yad(𐤉) + suffix
    // After vbs=H strips 𐤄 and prs strips the suffix, the residual is
    //   𐤅 + C2 + 𐤉 + C3  (4 chars).
    // The 𐤅 is the absorbed initial Yad; the internal 𐤉 is the Hifil vowel letter.
    // Strip both: residual = C2-C3, then Pe-Yad section (𐤋𐤃→𐤉𐤋𐤃) handles the rest.
    // Shortcut: map the full 4-char surface directly to the true root.

    // Waw-Lamed-Yad-Dalet (𐤅𐤋𐤉𐤃): Hifil infc of Yalad (𐤉𐤋𐤃) "to bear/beget/bring forth"
    '𐤅𐤋𐤉𐤃': '𐤉𐤋𐤃',
    // Waw-Rash-Yad-Dalet (𐤅𐤓𐤉𐤃): Hifil infc of Yarad (𐤉𐤓𐤃) "to go down/descend"
    '𐤅𐤓𐤉𐤃': '𐤉𐤓𐤃',
    // Waw-Dalet-Yad-Ayin (𐤅𐤃𐤉𐤏): Hifil infc of Yadah (𐤉𐤃𐤏) "to know"
    '𐤅𐤃𐤉𐤏': '𐤉𐤃𐤏',
    // Waw-Rash-Yad-Shin (𐤅𐤓𐤉𐤔): Hifil infc of Yarash (𐤉𐤓𐤔) "to possess/inherit"
    '𐤅𐤓𐤉𐤔': '𐤉𐤓𐤔',
    // Waw-Tzad-Yad-Alap (𐤅𐤑𐤉𐤀): Hifil infc of Yatza (𐤉𐤑𐤀) "to go out/come forth"
    '𐤅𐤑𐤉𐤀': '𐤉𐤑𐤀',
    // Waw-Lamed-Yad-Khet (𐤅𐤋𐤉𐤇): Hifil infc of Yalach (𐤉𐤋𐤇) "to go/walk (causative)"
    '𐤅𐤋𐤉𐤇': '𐤉𐤋𐤇',

    // ═══════════════════════════════════════════════════════════════════════
    // 4. LAMED-HAY VERBS — final Hay (𐤄) of the root drops under conjugation
    //    Hay as third radical contracts or drops in most conjugations.
    //    Surface stem is often only two letters. Restore Hay (Hay).
    // ═══════════════════════════════════════════════════════════════════════

    // Ish (Ayin-Shin) -> Ishah (Ayin-Shin-Hay): final Hay drops. TRUE ROOT: Ishah (𐤏𐤔𐤄) "to make/do"
    '𐤏𐤔': '𐤏𐤔𐤄',
    // NOTE: '𐤀𐤇' was previously mapped to '𐤀𐤇𐤃' (achad, "one") to handle the
    // feminine form 𐤀𐤇𐤕 losing its tav. But 𐤀𐤇 is ALSO "ach" (brother, H251) —
    // a completely separate root. The collision caused every "brother" token to
    // display as "one". Instead, H259 (achad) and H251 (ach) are both in
    // STRONGS_NO_MUTATE so the lookup uses Strongs-keyed entries directly.
    // Raa (Rash-Alap) -> Raah (Rash-Alap-Hay): final Hay drops. TRUE ROOT: Raah (𐤓𐤀𐤄) "to see"
    '𐤓𐤀': '𐤓𐤀𐤄',
    // Hay (Hay-Yad) -> Hayah (Hay-Yad-Hay): final Hay drops. TRUE ROOT: Hayah (𐤄𐤉𐤄) "to be/exist/become"
    '𐤄𐤉': '𐤄𐤉𐤄',
    // Qan (Qap-Nun) -> Qanah (Qap-Nun-Hay): final Hay drops. TRUE ROOT: Qanah (𐤒𐤍𐤄) "to acquire/create/possess"
    '𐤒𐤍': '𐤒𐤍𐤄',
    // Ban (Bayath-Nun) -> Banah (Bayath-Nun-Hay): final Hay drops. TRUE ROOT: Banah (𐤁𐤍𐤄) "to build"
    '𐤁𐤍': '𐤁𐤍𐤄',
    // Gal (Gamal-Lamad) -> Galah (Gamal-Lamad-Hay): final Hay drops. TRUE ROOT: Galah (𐤂𐤋𐤄) "to uncover/reveal/go into exile"
    '𐤂𐤋': '𐤂𐤋𐤄',
    // Kal (Kap-Lamad) -> Kalah (Kap-Lamad-Hay): final Hay drops. TRUE ROOT: Kalah (𐤊𐤋𐤄) "to complete/finish/cease"
    '𐤊𐤋': '𐤊𐤋𐤄',
    // Pan (Peh-Nun) -> Panah (Peh-Nun-Hay): final Hay drops. TRUE ROOT: Panah (𐤐𐤍𐤄) "to turn/face"
    '𐤐𐤍': '𐤐𐤍𐤄',
    // Chan (Khet-Nun) -> Chanah (Khet-Nun-Hay): final Hay drops. TRUE ROOT: Chanah (𐤇𐤍𐤄) "to encamp/pitch tent"
    '𐤇𐤍': '𐤇𐤍𐤄',
    // ═══════════════════════════════════════════════════════════════════════
    // 5. LAMED-HAY RESIDUALS — stem exposed after vbe/nme suffix stripping
    //    The final Hay of the root was already present in the vbe ending;
    //    stripping vbe=Hay removes only that Hay leaving a 3fs afformative Thaw
    //    still attached, making the form look like a new root.
    // ═══════════════════════════════════════════════════════════════════════

    // Hayath (Hay-Yad-Thaw) -> Hayah (Hay-Yad-Hay): vbe=Hay strips only the final Hay; Thaw (3fs perf afformative) remains visible. e.g. Hay-Yad-Thaw-Hay "she was/came to pass". TRUE ROOT: Hayah (𐤄𐤉𐤄) "to be/exist/become"
    '𐤄𐤉𐤕': '𐤄𐤉𐤄',
    // Ishath (Ayin-Shin-Thaw) -> Ishah (Ayin-Shin-Hay): vbe suffix strips trailing Hay; Thaw remains as 3fs afformative. TRUE ROOT: Ishah (𐤏𐤔𐤄) "to make/do"
    '𐤏𐤔𐤕': '𐤏𐤔𐤄',
    // Tzath (Tzad-Thaw) -> Tzawah (Tzad-Waw-Hay): alternate stripped form of Tzad-Waw-Hay. TRUE ROOT: Tzawah (𐤑𐤅𐤄) "to command/charge"
    '𐤑𐤕': '𐤑𐤅𐤄',
    // ═══════════════════════════════════════════════════════════════════════
    // 6. NOMINAL MUTATIONS — irregular noun/stem alternations
    // ═══════════════════════════════════════════════════════════════════════

    // Bath (Bayath-Thaw) -> Ban (Bayath-Nun): both derive from Bayath-Nun-Hay "to build" — offspring = one who is built/produced. TRUE ROOT: Ban (𐤁𐤍) ""daughter" shares root with "son""
    '𐤁𐤕': '𐤁𐤍',

    // ═══════════════════════════════════════════════════════════════════════
    // 7. HIFIL CONTRACTED FORMS — matres lectionis Yad in imperfect
    //    In Hifil imperfect the characteristic vowel is written with Yad (𐤉)
    //    as a vowel letter (matres lectionis). When pfm strips the person prefix,
    //    the remaining stem has an extra 𐤉 that is purely vocalic, not a radical.
    //    Rule: strip the internal 𐤉 to recover the true 3-letter root.
    // ═══════════════════════════════════════════════════════════════════════

    // Shayab (Shin-Yad-Bayath) -> Shawab (Shin-Waw-Bayath):
    //   Hifil contracted impf of Shawab "to return". pfm=T strips 𐤕, vbs=H
    //   not consonant in this form (fuses with prefix vowel), leaving 𐤔𐤉𐤁.
    //   The 𐤉 is matres lectionis for the Hifil characteristic vowel.
    //   TRUE ROOT: Shawab (𐤔𐤅𐤁) "to return/repent/restore"
    '𐤔𐤉𐤁': '𐤔𐤅𐤁',

    // Tzadaq surface (Tzad-Dalet-Yad-Qap) -> Tzad-Dalet-Qap:
    //   Hifil impf 1cs of 𐤑𐤃𐤒 (tzadaq = to be righteous/justify).
    //   pfm=> strips 𐤀, leaving 𐤑𐤃𐤉𐤒. The 𐤉 is the Hifil vowel letter.
    //   TRUE ROOT: Tzadiq (𐤑𐤃𐤒) "to be righteous/justify"
    '𐤑𐤃𐤉𐤒': '𐤑𐤃𐤒',

    // Shachawah (Shin-Khet-Waw-Hay) -> Shachah (Shin-Khet-Hay):
    //   Hishtaphel/Hitpael of 𐤔𐤇𐤄 (shachah = to bow down/worship).
    //   After prefix stripping the 𐤅 is a vowel letter; true root is lamed-Hay.
    //   TRUE ROOT: Shachah (𐤔𐤇𐤄) "to bow down/worship/prostrate"
    '𐤔𐤇𐤅𐤄': '𐤔𐤇𐤄',
    '𐤔𐤇𐤅': '𐤔𐤇𐤄',

    // ═══════════════════════════════════════════════════════════════════════
    // 8. ADDITIONAL LAMED-HAY — common roots not yet listed
    //    These are 2-letter surface forms where the final Hay dropped.
    // ═══════════════════════════════════════════════════════════════════════

    // Shan (Shin-Nun) -> Shanah (Shin-Nun-Hay):
    //   Final Hay drops in plural 𐤔𐤍𐤉𐤌 (shanim = years) after nme=JM strips 𐤉𐤌.
    //   TRUE ROOT: Shanah (𐤔𐤍𐤄) "year"
    '𐤔𐤍': '𐤔𐤍𐤄',

    // Tah (Tet-Hay) -> Tahar (Tet-Hay-Rash):
    //   Hifil contracted form of 𐤈𐤄𐤓 (tahar = to be pure).
    //   pfm=T strips 𐤕, vbs=H contracts, leaving surface 𐤈𐤄.
    //   TRUE ROOT: Tahar (𐤈𐤄𐤓) "to be/make pure/clean"
    '𐤈𐤄': '𐤈𐤄𐤓',

    // Ram (Rash-Alap-Mayam) -> surface after article strip from 𐤄𐤓𐤀𐤄 class:
    //   𐤓𐤀𐤄 = true root (raah) -- already lamed-Hay, no further mutation needed

    // Zan (Zayn-Nun) surface -> Zawan (Zayn-Waw-Nun): already in hollow section

    // Ab (Alap-Bayath) -> Abad (Alap-Bayath-Dalet -- no):
    //   Actually 𐤀𐤁 is a standalone root "father" -- no mutation

    // Iy (Ayin-Yad) surface in construct: not a mutation

    // Yam (Yad-Mayam) = already in hollow section

    // Akal surface forms:
    // Ukhal (Alap-Kap-Lamad) = standalone root "to eat/consume" 
    //   but 𐤀𐤊𐤋 appears in token data - no mutation needed

    // Tzah (Tzad-Alap-Hay) -> Tzawa root issue:
    //   𐤑𐤀𐤕 = Tzad-Alap-Thaw, infc of 𐤉𐤑𐤀 (yatza = go out)
    //   pfm absent, nme=T strips 𐤕 -> 𐤑𐤀, MUTATED_ROOTS[𐤑𐤀]=𐤉𐤑𐤀 ✓ already there

    // ═══════════════════════════════════════════════════════════════════════
    // 14. LAMED-WAW ROOTS PROTECTED FROM nme=WT STRIPPING
    //     When a root ends in Waw (𐤅) and the word takes a feminine plural
    //     suffix (𐤅𐤕), extractSuffix strips both 𐤅 and 𐤕, eating the final
    //     radical. strongs-roots.json is the primary fix (Step 1 in trueRoot
    //     resolution), but these entries provide a safety net when the SN is
    //     absent or strongs-roots is not loaded.
    //     Pattern: stripped residual → full dictionary root
    // ═══════════════════════════════════════════════════════════════════════
    '𐤋𐤇': '𐤋𐤅𐤇',   // lawach (H3871) = tablet/board; 𐤋𐤇𐤅𐤕 strips WT -> 𐤋𐤇
    '𐤐𐤓': '𐤐𐤓𐤅',   // paro/paraw — any root ending 𐤅 stripped by WT that leaves 2 chars
    '𐤑𐤁': '𐤑𐤁𐤀',   // tsaba (H6635) = army/host; 𐤑𐤁𐤀𐤅𐤕 -> nme=WT strips -> 𐤑𐤁𐤀 ok
                     //   but if stripped further: safety net
    // Hollow lamed-waw nouns: the Waw IS the 3rd radical (not a vowel letter).
    // These differ from lamed-Hay where the He signals the root end.
    // When nme=WT fires on e.g. 𐤌𐤉𐤃𐤅𐤕 (knowledge/data) the 𐤅 belongs to root 𐤉𐤃𐤏:
    //   actually 𐤌𐤉𐤃𐤅𐤕 is a mem-prefix noun from 𐤉𐤃𐤏 — the 𐤅 is a matres lectionis
    //   vowel letter, not a root radical, so stripping 𐤅𐤕 IS correct there.
    // Rule: only add entries here for roots where the Waw IS a root letter per H lexicon.

    // Bikurim: 𐤁𐤊𐤅𐤓𐤉 with nme=J strips 𐤉 -> 𐤁𐤊𐤅𐤓
    //   Root 𐤁𐤊𐤅𐤓 = firstfruits -- standalone, no mutation

    // Matza: 𐤌𐤑𐤅𐤕 with nme=WT strips 𐤅𐤕 -> 𐤌𐤑
    //   But root is 𐤌𐤑𐤅𐤄 (mitzvah = commandment)? No: 𐤌𐤑𐤅𐤕 is the surface with WT ending
    //   Actually 𐤌𐤑𐤅𐤕 nme=WT strips 𐤅𐤕 -> 𐤌𐤑 -- too short
    //   This is a mem-prefix noun from root 𐤑𐤅𐤄 (tzawah = command)
    //   surface after WT strip = 𐤌𐤑 -> true root context: lexicon entry needed
    //   Add to MUTATED_ROOTS as a signal: '𐤌𐤑': no clean root via mutation
    //   Better: NME_EXCLUSIONS handles 𐤌𐤑𐤅𐤕 as a full lexeme

    // 𐤇𐤌𐤑 (hametz = leaven) -- standalone
    // 𐤄𐤓𐤂 (harag = kill) -- standalone 3-letter root ✓

    // Additional Pe-Nun missed:
    // Tak (Tet-Kap) -> NaTak (Nun-Tet-Kap): Nun assimilates. TRUE ROOT: NaTak (𐤍𐤈𐤊) "to pour out/cast metal"
    '𐤈𐤊': '𐤍𐤈𐤊',
    // Tan (Tet-Nun) -> NaTan (Nun-Tet-Nun) -- already '𐤕𐤍':'𐤍𐤕𐤍'
    // Tash (Tet-Shin) -> could be Pe-Nun? No, 𐤈𐤔 not common Pe-Nun

    // Paam surface forms:
    // 𐤐𐤏𐤌𐤉𐤌 -> nme=JM strips 𐤉𐤌 -> 𐤐𐤏𐤌, root 𐤐𐤏𐤌 (paam = time/step) ✓

    // Zakan (Zayn-Kap-Nun) -- standalone

    // Rosh/Raash: 
    // 𐤓𐤀𐤔𐤉𐤕 nme=T strips 𐤕 -> 𐤓𐤀𐤔𐤉, nme=J... let extractSuffix handle
    // root 𐤓𐤀𐤔 = head/beginning ✓

    // Additional hollow Ayin-Waw not yet listed:
    // Kul (Kap-Waw-Lamad -> surface Kap-Lamad): but 𐤊𐤋 = "all" standalone ≠ kawl
    // Shur (Shin-Waw-Rash -> surface Shin-Rash): 𐤔𐤓 -> 𐤔𐤅𐤓 (to see/behold/enemy)
    '𐤔𐤓': '𐤔𐤅𐤓',
    // Nur (Nun-Waw-Rash -> surface Nun-Rash): 𐤍𐤓 -> 𐤍𐤅𐤓 (to shine/give light)
    '𐤍𐤓': '𐤍𐤅𐤓',

    // ═══════════════════════════════════════════════════════════════════════
    // 12. NOMINAL CONTRACTED FORMS — nouns whose suffix-stripped residual
    //     points to a true root longer than the surface that remains.
    //     Fired via NOMINAL_MUTATIONS set (below), not by verb/standalone path.
    // ═══════════════════════════════════════════════════════════════════════

    // Mayam-Alap (𐤌𐤀) residual of Mayam-Alap-Hay (𐤌𐤀𐤄):
    //   "me'ah" (hundred). Plural 𐤌𐤀𐤅𐤕 strips nme=WT -> 𐤌𐤀; construct 𐤌𐤀𐤕 strips nme=T -> 𐤌𐤀.
    '𐤌𐤀': '𐤌𐤀𐤄',

    // Shin-Nun (𐤔𐤍) residual of Shin-Nun-Hay (𐤔𐤍𐤄):
    //   "shanah" (year). Singular 𐤔𐤍𐤄 strips nme=H -> 𐤔𐤍; plural 𐤔𐤍𐤉𐤌 strips nme=JM -> 𐤔𐤍.
    //   NOTE: 𐤔𐤍𐤄 as VERB means "repeat/do again" — discriminated by homographs pos key.
    '𐤔𐤍': '𐤔𐤍𐤄',

    // ═══════════════════════════════════════════════════════════════════════
    // 9. HITPAEL OF HOLLOW ROOTS — doubled final radical
    //    When a hollow Ayin-Waw/Ayin-Yad root enters Hitpael, the middle
    //    radical (Waw/Yad) contracts out AND the final radical doubles.
    //    After pfm+vbs stripping the doubled final consonant is the signal.
    //    Rule: displayRoot with geminated final -> true hollow root (restore Waw).
    // ═══════════════════════════════════════════════════════════════════════

    // Bash-Shin (𐤁𐤔𐤔) -> Bawash (𐤁𐤅𐤔):
    //   Hitpael of Bayath-Waw-Shin "to be ashamed". Waw contracts, Shin doubles.
    //   e.g. 𐤉𐤕𐤁𐤔𐤔𐤅 (yitbosheshu = they will be ashamed of themselves)
    '𐤁𐤔𐤔': '𐤁𐤅𐤔',

    // Kan-Nun (𐤊𐤍𐤍) -> Kawan (𐤊𐤅𐤍):
    //   Hitpael of Kap-Waw-Nun "to establish/prepare". Waw contracts, Nun doubles.
    //   e.g. hithkonen = to prepare oneself
    '𐤊𐤍𐤍': '𐤊𐤅𐤍',

    // Rum-Mayam (𐤓𐤌𐤌) -> Rawam (𐤓𐤅𐤌):
    //   Hitpael of Rash-Waw-Mayam "to exalt oneself". Waw contracts, Mayam doubles.
    '𐤓𐤌𐤌': '𐤓𐤅𐤌',

    // Shab-Bayath (𐤔𐤁𐤁) -> Shawab (𐤔𐤅𐤁):
    //   Hitpael of Shin-Waw-Bayath "to return repeatedly". Waw contracts, Bayath doubles.
    '𐤔𐤁𐤁': '𐤔𐤅𐤁',

    // Tzam-Mayam (𐤑𐤌𐤌) -> Tzawam (𐤑𐤅𐤌):
    //   Hitpael of Tzad-Waw-Mayam "to fast". Waw contracts, Mayam doubles.
    '𐤑𐤌𐤌': '𐤑𐤅𐤌',

    // Dan-Nun (𐤃𐤍𐤍) -> Dawan (𐤃𐤅𐤍):
    //   Hitpael of Dalet-Waw-Nun "to judge oneself". Waw contracts, Nun doubles.
    '𐤃𐤍𐤍': '𐤃𐤅𐤍',

    // ═══════════════════════════════════════════════════════════════════════
    // 10. HIFIL PARTICIPIAL MATRES LECTIONIS — Yad vowel letter in stem
    //     In Hifil participles and some Hifil perfects, the characteristic
    //     Hifil vowel (hireq yod) is written with Yad as a vowel letter.
    //     After prefix stripping the extra Yad remains.
    //     Rule: strip internal Yad to recover the 3-letter root.
    //     Pattern: C-Yad-C -> C-C (Yad is vocalic, not radical)
    // ═══════════════════════════════════════════════════════════════════════

    // Zayn-Rash-Yad-Ayin (𐤆𐤓𐤉𐤏) -> Zayn-Rash-Ayin (𐤆𐤓𐤏):
    //   Hifil ptca of 𐤆𐤓𐤏 (zara = to sow/seed). The 𐤉 is the hireq yod vowel letter.
    //   e.g. 𐤌𐤆𐤓𐤉𐤏 (mazria = seed-bearing/causing to sow)
    '𐤆𐤓𐤉𐤏': '𐤆𐤓𐤏',

    // Bayath-Dalet-Yad-Lamad (𐤁𐤃𐤉𐤋) -> Bayath-Dalet-Lamad (𐤁𐤃𐤋):
    //   Hifil ptca/infc of 𐤁𐤃𐤋 (badal = to separate/divide). Yad is vocalic.
    //   e.g. 𐤌𐤁𐤃𐤉𐤋 (mabdil = separator/one who divides)
    '𐤁𐤃𐤉𐤋': '𐤁𐤃𐤋',

    // Alap-Yad-Rash (𐤀𐤉𐤓) -> Alap-Waw-Rash (𐤀𐤅𐤓):
    //   Hifil infc of 𐤀𐤅𐤓 (awar = light/to give light). Hollow root with
    //   hireq yod in hifil infc: 𐤄𐤀𐤉𐤓 strips 𐤄 -> 𐤀𐤉𐤓, Yad is vocalic.
    '𐤀𐤉𐤓': '𐤀𐤅𐤓',

    // Mayam-Tet-Yad-Rash (𐤌𐤈𐤉𐤓) -> Mayam-Tet-Rash (𐤌𐤈𐤓):
    //   Hifil perf of 𐤌𐤈𐤓 (matar = to rain). Yad is hireq yod vowel letter.
    //   e.g. 𐤄𐤌𐤈𐤉𐤓 (hemtir = caused to rain)
    '𐤌𐤈𐤉𐤓': '𐤌𐤈𐤓',

    // Kap-Yad-Lamad (𐤊𐤉𐤋) -> Kap-Waw-Lamad (𐤊𐤅𐤋):
    //   Hifil forms of 𐤊𐤅𐤋 (kawl = to contain/sustain). Yad is vocalic.
    '𐤊𐤉𐤋': '𐤊𐤅𐤋',

    // Shin-Yad-Rash (𐤔𐤉𐤓) -> already would be caught? Check:
    //   𐤔𐤉𐤓 could be hifil of 𐤔𐤅𐤓 (shur = wall/behold)
    '𐤔𐤉𐤓': '𐤔𐤅𐤓',

    // ═══════════════════════════════════════════════════════════════════════
    // 11. ADDITIONAL LAMED-HAY AND HOLLOW RESIDUALS
    // ═══════════════════════════════════════════════════════════════════════

    // Shin-Qap (𐤔𐤒) -> Shin-Qap-Hay (𐤔𐤒𐤄):
    //   Hifil infc + nme=WT strips 𐤅𐤕: 𐤄𐤔𐤒𐤅𐤕 -> strip 𐤄 -> 𐤔𐤒𐤅𐤕 -> strip WT -> 𐤔𐤒
    //   TRUE ROOT: Shaqah (𐤔𐤒𐤄) "to give drink/water/irrigate"
    '𐤔𐤒': '𐤔𐤒𐤄',

    // Nun-Khet-Hay (𐤍𐤇𐤄) residual of Nun-Waw-Khet (𐤍𐤅𐤇):
    //   Hifil of 𐤍𐤅𐤇 (nuach = rest/settle): prs=HW strips 𐤅, leaves 𐤍𐤇𐤄.
    //   The 𐤄 is the lamed-Hay indicator of nuach's related form nacha.
    //   TRUE ROOT: Nawach (𐤍𐤅𐤇) "to rest/settle/cause to rest"
    '𐤍𐤇𐤄': '𐤍𐤅𐤇',

    // Peh-Khet (𐤐𐤇) -> Nun-Peh-Khet (𐤍𐤐𐤇):
    //   Pe-Nun root: Nun assimilates into Peh.
    //   TRUE ROOT: NaPach (𐤍𐤐𐤇) "to blow/breathe into/kindle"
    //   e.g. 𐤉𐤐𐤇 (yipach = he breathed) from Gen 2:7
    '𐤐𐤇': '𐤍𐤐𐤇',

    // Additional lamed-Hay commonly needed:
    // Alap-Kap-Lamad (𐤀𐤊𐤋) -> standalone root "to eat/consume" ✓ no mutation
    // Shin-Qap-Hay (𐤔𐤒𐤄) -> IS the true root ✓
    // Shin-Khet (𐤔𐤇) -> Shin-Waw-Khet (𐤔𐤅𐤇): hollow "to cry out"
    '𐤔𐤇': '𐤔𐤅𐤇',

    // ═══════════════════════════════════════════════════════════════════════
    // 13. NIFAL OF PE-YAD ROOTS
    //     After vbs=N strips leading Nun, display root = Waw+[2nd+3rd radical].
    //     The Waw is the Nifal characteristic vowel, not the missing Yad.
    //     Restore Yad as first radical.
    // ═══════════════════════════════════════════════════════════════════════
    '𐤅𐤔𐤏': '𐤉𐤔𐤏',  // yasha = save/deliver (Deut 33:29)
    '𐤅𐤋𐤃': '𐤉𐤋𐤃',  // yalad = beget/born
    '𐤅𐤃𐤏': '𐤉𐤃𐤏',  // yada = know
    '𐤅𐤑𐤀': '𐤉𐤑𐤀',  // yatza = go out
    '𐤅𐤒𐤃': '𐤉𐤒𐤃',  // yarad = descend
    '𐤅𐤔𐤁': '𐤉𐤔𐤁',  // yashav = sit/dwell
    '𐤅𐤒𐤔': '𐤉𐤒𐤔',  // yarash = inherit
    '𐤅𐤎𐤃': '𐤉𐤎𐤃',  // yasad = found
    '𐤅𐤑𐤒': '𐤉𐤑𐤒',  // yatzar = form
    '𐤅𐤎𐤐': '𐤉𐤎𐤐',  // yasap = add

};

// NOMINAL_MUTATIONS removed — nme stripping now fires universally for all tokens
// not in NME_EXCLUSIONS, regardless of pos. MUTATED_ROOTS handles root restoration.

// --- 2. ENGINE LOGIC (unchanged from original) ---
function getCssClass(pos) {
    switch (pos) {
        case 'conj':                  return 'mod-conj';
        case 'prep':                  return 'mod-prep';
        case 'art':                   return 'mod-art';
        case 'nega':                  return 'mod-nega';
        case 'advb':                  return 'mod-advb';
        case 'intj':                  return 'mod-intj';
        case 'inrg':                  return 'mod-inrg';
        case 'prde':                  return 'mod-prde';
        case 'prps':                  return 'mod-prps';
        case 'prin':                  return 'mod-prin';
        case 'nmpr':                  return 'mod-nmpr';
        // full-word fallbacks (pos column uses full words for preposition/verb/noun etc.)
        case 'conjunction':           return 'mod-conj';
        case 'preposition':           return 'mod-prep';
        case 'article':               return 'mod-art';
        case 'negation':              return 'mod-nega';
        case 'adverb':                return 'mod-advb';
        case 'interjection':          return 'mod-intj';
        case 'interrogative':         return 'mod-inrg';
        case 'demonstrative pronoun': return 'mod-prde';
        case 'personal pronoun':      return 'mod-prps';
        case 'interrogative pronoun': return 'mod-prin';
        case 'proper noun':           return 'mod-nmpr';
        default: return 'root';
    }
}

function getTranslit(paleoStr) {
    if (!paleoStr) return '';
    let translit = '';
    const chars = [...paleoStr];
    for (let i = 0; i < chars.length; i++) {
        const char = chars[i];
        const isLast = (i === chars.length - 1);
        if (CHAR_MAP[char]) translit += isLast ? CHAR_MAP[char].fin : CHAR_MAP[char].med;
        else translit += char;
    }
    return translit.charAt(0).toUpperCase() + translit.slice(1);
}

function transliterateBlock(components) {
    // A maqaf component (isMaqaf) splits the block into words joined by a dash.
    // Each word's LAST letter must take its FINAL form, so transliterate per
    // maqaf-segment rather than treating only the very last char of the whole
    // block as final (which would give Malki's 𐤉 a medial form in "Malakay-Tzadaq").
    let segment = [];
    const flushSeg = () => {
        const combinedWord = segment.map(c => c.paleo).join('');
        const totalChars = [...combinedWord].length;
        let currentIndex = 0;
        segment.forEach((comp) => {
            let translit = '';
            const paleoChars = [...comp.paleo];
            for (let i = 0; i < paleoChars.length; i++) {
                const char = paleoChars[i];
                const isVeryLastCharOfBlock = (currentIndex === totalChars - 1);
                if (CHAR_MAP[char]) translit += isVeryLastCharOfBlock ? CHAR_MAP[char].fin : CHAR_MAP[char].med;
                else translit += char;
                currentIndex++;
            }
            comp.translit = translit;
        });
        segment = [];
    };
    for (const comp of components) {
        if (comp.isMark) { flushSeg(); continue; }   // maqaf/punct: not letter transliteration
        segment.push(comp);
    }
    flushSeg();
}

function extractPrefix(attributes, attrKey, mapKey, paleoArray) {
    if (!attributes[attrKey] || attributes[attrKey] === 'absent') return null;
    const rawTag = attributes[attrKey];
    // First try the exact morph value; fall back to a "=-stripped" form so
    // corpus annotations like 'T=' / 'T==' resolve to the same data as 'T'.
    // The trailing-= pattern is used by the corpus to mark variant context
    // for the same morpheme; it's identical paleo and translation-wise.
    let mapData = GRAMMAR_MAP[mapKey][rawTag];
    if (!mapData) {
        const bareTag = rawTag.replace(/=+$/, '');
        if (bareTag && bareTag !== rawTag) mapData = GRAMMAR_MAP[mapKey][bareTag];
    }
    if (!mapData) {
        // Unknown prefix value. Don't pollute the render with [?TAG]; the
        // raw corpus row is still visible in the descriptive token viewer
        // for validation. Returning null tells the caller to skip this
        // component entirely.
        if (process.env.PALEO_DEBUG_MORPH) {
            console.warn(`[morph] unknown ${mapKey} value: ${rawTag}`);
        }
        return null;
    }
    // Sibilant special-case for hitpael/hithpael prefix metathesis. With
    // certain sibilant roots (𐤔/𐤎/𐤑/𐤆) the verb stem prefix transposes with
    // the first root letter, so we emit an empty-paleo component (the
    // metathesis already showed in the surface) rather than stripping anything.
    const sibilants = ['𐤔', '𐤎', '𐤑', '𐤆'];
    if (attrKey === 'vbs' && (rawTag === 'HCT' || rawTag === 'HT')) {
        if (paleoArray.length >= 2 && sibilants.includes(paleoArray[0]) && paleoArray[1] === '𐤕') {
            return { paleo: '', translit: '', translation: `[${mapData.trans}]`, css: mapData.css || 'mod-pref' };
        }
    }
    const currentStr = paleoArray.join('');
    let matchedPaleo = '';
    for (let p of mapData.paleo) {
        if (currentStr.startsWith(p)) { matchedPaleo = p; break; }
    }
    if (matchedPaleo) {
        const charCount = [...matchedPaleo].length;
        paleoArray.splice(0, charCount);
        return { paleo: matchedPaleo, translit: '', translation: `[${mapData.trans}]`, css: mapData.css || 'mod-pref' };
    }
    return null;
}

function extractSuffix(attributes, attrKey, mapKey, paleoArray) {
    if (!attributes[attrKey] || attributes[attrKey] === 'absent') return null;
    const rawTag = attributes[attrKey];
    // First try the exact morph value; fall back to a "=-stripped" form so
    // corpus annotations like 'K=' / 'T==' resolve to the same data as 'K'/'T'.
    // (The trailing '=' is a context annotation, not a different morpheme —
    // verified by inspecting matching pairs: pfm has both 'T' and 'T=' with
    // identical paleo+trans; the corpus uses '=' to mark variant cases.)
    let mapData = GRAMMAR_MAP[mapKey][rawTag];
    if (!mapData) {
        const bareTag = rawTag.replace(/=+$/, '');
        if (bareTag && bareTag !== rawTag) mapData = GRAMMAR_MAP[mapKey][bareTag];
    }
    if (!mapData) {
        // Unknown suffix value — silently skip rather than emitting a visible
        // [?TAG] placeholder. The raw morphology is still preserved in the
        // descriptive token viewer; we just don't pollute the rendered word.
        // Setting PALEO_DEBUG_MORPH=1 in the environment logs these so a
        // maintainer can spot missing GRAMMAR_MAP entries during development.
        if (process.env.PALEO_DEBUG_MORPH) {
            console.warn(`[morph] unknown ${mapKey} value: ${rawTag}`);
        }
        return null;
    }
    const currentStr = paleoArray.join('');
    let matchedPaleo = '';
    for (let p of mapData.paleo) {
        if (currentStr.endsWith(p)) { matchedPaleo = p; break; }
    }
    if (matchedPaleo) {
        const charCount = [...matchedPaleo].length;
        paleoArray.splice(paleoArray.length - charCount, charCount);
        return { paleo: matchedPaleo, translit: '', translation: `[${mapData.trans}]`, css: mapData.css || 'mod-suff' };
    }
    return null;
}

// ── HARDENING: NAME ANY LETTERS BAKED PAST THE ROOT ─────────────────────────
// Reverse-lookup a bare Paleo consonant-string against every known suffix
// table (nme/prs/vbe/uvf) so a trailing addition that survived to rootDisplay
// unclaimed (see the "baked suffix" split in parseHebrewData) can still be
// given its real grammatical label instead of a bare "unknown" stub. Longest
// paleo match wins within a table; first table with any match wins — order
// (nme, prs, vbe, uvf) is arbitrary among genuine ties and only matters for
// the rare exact collision, which is inherently ambiguous without the tag.
function guessSuffixGloss(paleoStr) {
    if (!paleoStr) return null;
    for (const mapKey of ['nme', 'prs', 'vbe', 'uvf']) {
        const table = GRAMMAR_MAP[mapKey];
        for (const tag of Object.keys(table)) {
            const entry = table[tag];
            if (entry.paleo.includes(paleoStr)) return entry;
        }
    }
    return null;
}

// ── STRONGS-ROOTS LEXICON ────────────────────────────────────────────────────
// Maps Strong's H numbers to canonical Paleo-Hebrew root consonants, built from
// the official Hebrew lemma in strongs-hebrew-dictionary.js via build-strongs-roots.js.
// This is Step 1 in trueRoot resolution inside parseHebrewData: if the NME/PRS
// suffix stripper ate a root consonant (e.g. nme=WT strips 𐤅𐤕 from 𐤋𐤇𐤅𐤕 but
// the root is 𐤋𐤅𐤇), the canonical root from this file corrects it automatically.
//
// FILE LOCATION: lexicon/strongs-roots.json  (generated by build-strongs-roots.js)
// If the file is missing, root resolution falls back to MUTATED_ROOTS only.
let _strongsRootsCache = null;
function loadStrongsRoots() {
    if (_strongsRootsCache) return _strongsRootsCache;
    try {
        const p = path.join(__dirname, 'lexicon', 'strongs-roots.json');
        _strongsRootsCache = JSON.parse(fs.readFileSync(p, 'utf8'));
        console.log(`[strongs-roots] Loaded ${Object.keys(_strongsRootsCache).length} entries`);
    } catch {
        _strongsRootsCache = {};
        console.warn('[strongs-roots] lexicon/strongs-roots.json not found — root resolution uses MUTATED_ROOTS only');
    }
    return _strongsRootsCache;
}

// Canonical root for a Strong's number: strongs-roots.json > STRONGS_ROOT_OVERRIDES > parserRoot.
// Called by /api/root/by-strongs to determine the display root for the root explorer header.
// parseHebrewData calls loadStrongsRoots() directly in the trueRoot resolution block.
function getCanonicalRoot(sn, parserRoot) {
    const lex = loadStrongsRoots();
    return lex[sn] || STRONGS_ROOT_OVERRIDES[sn] || parserRoot || '';
}

// True iff every consonant of `sub` appears in `full` in order — i.e. `sub` is a
// defective (letter-elided) spelling of `full`, not an unrelated root. This is how
// we tell a real weak-verb elision (𐤒𐤇 ⊂ 𐤋𐤒𐤇, the ל dropped in יקח) from a wrong
// Strong's number that would inject a totally different root. `sub`/`full` are
// arrays of Paleo code points.
function isRootSubsequence(sub, full) {
    let i = 0;
    for (const ch of full) { if (i < sub.length && sub[i] === ch) i++; }
    return i === sub.length;
}

// Merge a stripped SURFACE root-portion with the CANONICAL root so the full root
// always shines through: every canonical radical is emitted (restoring any that
// elided — the נ of natzal, the ל of laqach) AND every surface letter is kept
// (so an added vowel-letter/mater like the hifil yod in הצּיל survives). The two
// are aligned by their longest common subsequence; in each gap the restored
// radical comes first, then the surface mater. Returns the merged Paleo string,
// or null when this is NOT a defective spelling of the canonical root (guards a
// wrong Strong's number from injecting an unrelated root):
//   • at most one radical elided   (lcs ≥ canonLen − 1)
//   • a real overlap               (lcs ≥ 2)
//   • few surface additions        (surfaceLen − lcs ≤ 2)
// `surface`/`canonical` are arrays of Paleo code points.
function mergeRootDisplay(surface, canonical) {
    const S = surface, C = canonical, m = S.length, n = C.length;
    if (n < 2) return null;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            dp[i][j] = S[i - 1] === C[j - 1]
                ? dp[i - 1][j - 1] + 1
                : Math.max(dp[i - 1][j], dp[i][j - 1]);
    const lcs = dp[m][n];
    if (lcs < 2 || lcs < n - 1 || (m - lcs) > 2) return null;
    const pairs = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
        if (S[i - 1] === C[j - 1]) { pairs.push([i - 1, j - 1]); i--; j--; }
        else if (dp[i - 1][j] >= dp[i][j - 1]) i--; else j--;
    }
    pairs.reverse();
    const out = [];
    let si = 0, ci = 0;
    for (const [pi, pj] of pairs) {
        while (ci < pj) { out.push(C[ci]); ci++; }   // restored radical first
        while (si < pi) { out.push(S[si]); si++; }   // kept surface mater after
        out.push(C[pj]); ci = pj + 1; si = pi + 1;
    }
    while (ci < n) { out.push(C[ci]); ci++; }
    while (si < m) { out.push(S[si]); si++; }
    return out.join('');
}

// ── PRONOMINAL SUFFIX (DISPLAY ONLY) ─────────────────────────────────────────
// Maps a morphology pronominal_suffix tag to its BARE Paleo consonant. This is
// used purely to RENDER the suffix in the reader — "root + all modifications" —
// and is NEVER fed back into trueRoot / root_paleo (which stays the clean lemma
// for grouping). Two rules keep this safe where the old approach failed:
//   1. It is APPEND-only. The suffix is emitted from the tag itself, so an absent
//      surface consonant (e.g. Exod 13:21 𐤍𐤇𐤕 stores no final 𐤌 yet is prs=3mp)
//      is reconstructed rather than hunted for in the surface.
//   2. Where the consonant IS present it is peeled off the DISPLAY root-zone only
//      (never the grouping root) using the BARE form — 3ms=𐤅 (not 𐤄𐤅), 3mp=𐤌
//      (not 𐤄𐤌) — so a III-weak root's own 𐤄 can never be mistaken for the suffix.
const PRS_TAG = {
    '1cs': { paleo: '𐤉',  trans: 'My',            css: 'prs-1cs' },
    '1cp': { paleo: '𐤍𐤅', trans: 'Our',           css: 'prs-1cp' },
    '2ms': { paleo: '𐤊',  trans: 'Your',          css: 'prs-2ms' },
    '2fs': { paleo: '𐤊',  trans: 'Your',          css: 'prs-2fs' },
    '2mp': { paleo: '𐤊𐤌', trans: 'Your (plural)', css: 'prs-2mp' },
    '2fp': { paleo: '𐤊𐤍', trans: 'Your (fem pl)', css: 'prs-2fp' },
    '3ms': { paleo: '𐤅',  trans: 'His',           css: 'prs-3ms' },
    '3fs': { paleo: '𐤄',  trans: 'Her',           css: 'prs-3fs' },
    '3mp': { paleo: '𐤌',  trans: 'Their',         css: 'prs-3mp' },
    '3fp': { paleo: '𐤍',  trans: 'Their (fem)',   css: 'prs-3fp' },
};

// Strong's DERIVATION map for compound names: H#### -> [component H####, …], parsed once
// from the dictionary's "derivation" field ("from H4428 and H6664"). Lets a maqaf compound
// name (Malakay-Tzadaq, both halves tagged H4442) be decomposed into its component roots
// (king H4428 + righteous H6664) while keeping the shared Strong's as the two-word CORE
// root. No-ops safely if the dictionary or field is absent.
const STRONGS_DERIV = (() => {
    const p = ['strongs-hebrew-expanded.json', 'strongs-hebrew.json']
        .map(f => path.join(__dirname, f)).find(f => fs.existsSync(f));
    if (!p) return {};
    try {
        const dict = JSON.parse(fs.readFileSync(p, 'utf8'));
        const out = {};
        for (const [sn, e] of Object.entries(dict)) {
            const comps = [...String((e && e.derivation) || '').matchAll(/H0*(\d+)/g)].map(m => 'H' + m[1]);
            if (comps.length >= 2) out['H' + String(sn).replace(/^H+/i, '')] = comps;
        }
        return out;
    } catch { return {}; }
})();

function parseHebrewData(rawText, lexicon, homographs, surfaceOverrides = {}) {
    const lines = rawText.trim().split('\n');
    const output = [];
    let currentVerse = 1;
    let wordCounter = 1;
    let tokenOrdinal = 1;  // hoisted — assigned each iteration, read by flushWordBlock
    let pendingComponents = [];
    let strongs = null; // hoisted — assigned each iteration, read by flushWordBlock
    // Per maqaf-SEGMENT tracking so a joined chip (BaYawam-Apaw / Malakay-Tzadaq) carries
    // BOTH underlying words' surface + Strong's — each half stands alone in the badges.
    // Morphemes within one segment (prefix + root) merge; segments split at each maqaf.
    let pendingSegments = [{ surface: '', rootStrongs: null, ordinal: null }];
    // True once pendingComponents holds a REAL resolved root (set alongside
    // _curSeg.rootStrongs below) — false while it holds only bare, unresolved
    // particles/proclitics still waiting for their host word. The punctuation
    // branch uses this to tell "a real word is pending" apart from "nothing
    // but an open particle chain is pending" — see its comment for why that
    // distinction matters.
    let pendingHasRoot = false;

    const flushWordBlock = () => {
        if (pendingComponents.length === 0) return;
        transliterateBlock(pendingComponents);

        // Suffixes (nme-*, prs-*, vbe-*, and the hardened baked-addition fallback
        // mod-suff-unk) render lowercase — trailing morphemes. Every other
        // component (prefix, root) uppercases its first character.
        const SUFFIX_CSS_PREFIX = ['nme-', 'prs-', 'vbe-', 'mod-suff-unk'];
        pendingComponents.forEach(comp => {
            if (!comp.translit) return;
            const isSuffix = SUFFIX_CSS_PREFIX.some(p => comp.css && comp.css.startsWith(p));
            if (isSuffix) {
                comp.translit = comp.translit.toLowerCase();
            } else {
                comp.translit = comp.translit.charAt(0).toUpperCase() + comp.translit.slice(1);
            }
        });

        if (wordCounter === 1) {
            const first = pendingComponents[0];
            if (first.translation && !first.translation.startsWith('[')) {
                first.translation = first.translation.charAt(0).toUpperCase() + first.translation.slice(1);
            }
        }

        // One entry per maqaf-segment: the merged surface + that half's root Strong's,
        // so a joined chip exposes BOTH words (each half its own surf + root badge).
        const _fmtSN = s => s ? 'H' + String(s).replace(/^H+/i, '') : null;
        const sourceTokens = pendingSegments
            .filter(s => s.surface)
            .map(s => ({ token_ordinal: s.ordinal, word_raw: s.surface, strongs: _fmtSN(s.rootStrongs) }));

        // COMPOUND NAME: a maqaf chip whose halves share ONE Strong's (Malakay-Tzadaq —
        // both tagged H4442). Decompose it via the Strong's derivation into each half's
        // own component root (H4428 king / H6664 righteous, mapped in reading order) and
        // keep the shared Strong's as the two-word CORE root. Plain joins whose halves
        // carry DIFFERENT tags (day-anger: H3117/H639) are already their own roots — untouched.
        let coreStrongs = null;
        if (sourceTokens.length >= 2) {
            const shared = sourceTokens[0].strongs;
            const comps = shared && STRONGS_DERIV[shared];
            const allSame = sourceTokens.every(s => s.strongs === shared);
            if (allSame && comps && comps.length >= sourceTokens.length) {
                coreStrongs = shared;
                sourceTokens.forEach((s, i) => { s.componentOf = shared; s.strongs = comps[i]; });
            }
        }
        const all_strongs = sourceTokens.map(s => s.strongs).filter(Boolean);

        output.push({
            verse: currentVerse,
            word: wordCounter,
            token_ordinal: tokenOrdinal,
            strongs,
            all_strongs,      // one per maqaf-half — both words of a joined chip
            sourceTokens,     // per-half surface + Strong's, so each half stands alone
            coreStrongs,      // shared two-word root of a decomposed compound name (else null)
            components: [...pendingComponents]
        });

        wordCounter++;
        pendingComponents = [];
        pendingSegments = [{ surface: '', rootStrongs: null, ordinal: null }];
        pendingHasRoot = false;
    };

    lines.forEach((line, index) => {
        const parts = line.split('\t');
        if (parts.length < 4) return;

        const verseStr = parseInt(parts[0], 10);
        tokenOrdinal = parseInt(parts[1], 10) || wordCounter;
        let rawPaleo = (parts[2] || '').trim().replace(/[^𐤀-𐤕]/gu, '');
        const pos = (parts[3] || '').trim();
        strongs = (parts[5] || '').trim() || null;
        // SURFACE OVERRIDES ARE A FALLBACK ONLY. A surface-keyed pin must NEVER
        // replace a Strong's the corpus already assigned, because a surface can be
        // a homograph the surface alone cannot disambiguate. Canonical example:
        // 𐤍𐤇𐤕 is BOTH the hifil-infinitive of נחה "to lead" (H5148 — the root ה
        // elides and a ת infinitive-ending appears, so the surface loses the true
        // radical) AND the noun נחת "rest" (H5183). The per-token OSHB Strong's is
        // authoritative; it drives the true-root resolution below so the TRUE ROOT
        // (𐤍𐤇𐤄) always shines instead of the elided surface (𐤍𐤇𐤕). We therefore
        // only consult the override to FILL an SN the corpus left blank — never to
        // overwrite one it supplied. (A genuine corpus error must be corrected at
        // the token level, or with a reference/morphology-keyed override, not a
        // surface-keyed one that would mis-tag every homograph sharing the surface.)
        if (!strongs && rawPaleo && surfaceOverrides[rawPaleo]) {
            strongs = surfaceOverrides[rawPaleo];
        }
        const originalRawPaleo = rawPaleo;

        if (verseStr !== currentVerse) {
            flushWordBlock();
            currentVerse = verseStr;
            wordCounter = 1;
        }

        // Punctuation tokens (maqaf ־, sof-pasuq ׃, paseq ׀ …) render as HTML MARKS,
        // never as clickable/copyable text: push a mark component carrying the token's
        // own glyph — excluded from the copyable/searchable paleo and non-clickable on
        // the client. A MAQAF additionally JOINS words: keep the chip OPEN so the next
        // word appends into the same chip (𐤌𐤋𐤊𐤉־𐤑𐤃𐤒 / "Malakay-Tzadaq"). Every other
        // mark is a separator/ender — attach it and flush so it can't glue two words.
        if (pos === 'punct') {
            const mark = (parts[2] || '').trim();
            const isMaqaf = mark.includes('\u05BE');
            const markComp = {
                paleo: mark, translit: isMaqaf ? '-' : '', translation: '',
                css: isMaqaf ? 'maqaf' : 'punct-mark',
                isMark: true, isMaqaf, token_ordinal: tokenOrdinal,
            };
            // Nothing RESOLVED is pending \u2014 either pendingComponents is empty
            // (the previous full word already flushed itself, since the
            // _nextIsMaqaf peek below only holds a chip open ahead of a MAQAF,
            // never for an ordinary separator/ender like sof-pasuq or paseq),
            // or it holds only a bare, unresolved particle/proclitic still
            // waiting for its host word (pendingHasRoot false \u2014 rootStrongs is
            // only ever set once a real content word is processed). The old
            // code pushed the mark and force-flushed in both cases, which
            // either (a) spawned a one-component "word" that's nothing but
            // punctuation \u2014 WordBlock.jsx renders every parseHebrewData
            // output[] entry as its own clickable word, so a solo \u05C3 floated as
            // its own glyph-shaped "word" after literally every verse \u2014 or (b)
            // severed an open particle from the host it was legitimately
            // waiting to fold into (Deuteronomy 6:8's \u05E2\u05B7\u05DC\u05BE\u05D9\u05B8\u05D3\u05B6\u05DA\u05B8: "al" got
            // split from "yadekha" purely because a maqaf sat between them and
            // neither side had a root yet to compare Strong's numbers on).
            // Neither is a real word boundary, so don't flush for either.
            if (!pendingHasRoot) {
                if (pendingComponents.length === 0) {
                    // Attach as a trailing decoration on the last real word
                    // instead of starting a new pendingComponents-only block.
                    if (output.length > 0) output[output.length - 1].components.push(markComp);
                    else pendingComponents.push(markComp);   // verse/book opens with a mark
                } else {
                    // An open particle chain is still waiting for its host \u2014
                    // let the mark ride along without forcing a flush; it
                    // lands wherever that chain eventually resolves.
                    pendingComponents.push(markComp);
                }
                return;
            }
            // A real resolved root is pending (or a compound's first half held
            // open by _nextIsMaqaf below) \u2014 original decision logic applies.
            pendingComponents.push(markComp);
            // A maqaf is a TYPOGRAPHIC join (a common cantillation/prosody device),
            // not evidence the two halves are one lexical concept. Only keep the
            // chip OPEN when they share one Strong's number - a genuine compound
            // name (Malakay-Tzadaq, both tagged H4442). An ordinary construct pair
            // with DIFFERENT, unrelated Strong's (Psalm 119:13's mishpetei-pikha:
            // H4941 mishpat + H6310 peh, "ordinances of your mouth") is two separate
            // words that happen to be hyphenated - fusing them produced
            // "Mashapatay-Payak" as ONE chip carrying only H6310's badge, silently
            // dropping H4941's own badge and rendering H6310's own word as a
            // fragment ("-Payak") instead of standing alone ("Pahayak"). Peek at
            // the next line before deciding.
            if (isMaqaf) {
                const curSeg = pendingSegments[pendingSegments.length - 1];
                const nextParts = (lines[index + 1] || '').split('\t');
                const nextStrongs = (nextParts[5] || '').trim() || null;
                const sharesRoot = !!(curSeg.rootStrongs && nextStrongs && curSeg.rootStrongs === nextStrongs);
                if (sharesRoot) {
                    pendingSegments.push({ surface: '', rootStrongs: null, ordinal: null });
                } else {
                    flushWordBlock();
                }
            } else {
                flushWordBlock();
            }
            return;
        }

        // Track this token's surface in the current maqaf-segment (prefix + root merge
        // within a segment; segments split at each maqaf) for the per-half surf badge.
        pendingSegments[pendingSegments.length - 1].surface += originalRawPaleo;

        const attributes = {};
        // The DB morph uses full key names (verbal_stem, gender, number, etc.)
        // Normalize them to the short codes the rest of the engine expects.
        const MORPH_KEY_NORM = {
            'parser_part_of_speech':  'pdp',
            'speech_part':            'sp',
            'verbal_stem':            'vs',
            'verbal_tense_form':      'vt',
            'gender':                 'gn',
            'number':                 'nu',
            'state':                  'st',
            'person':                 'ps',
            'pronominal_suffix':      'prs',
            'prefix_marker':          'pfm',
            'verbal_stem_marker':     'vbs',
            'verbal_ending':          'vbe',   // ← was missing
            'nominal_ending':         'nme',
            'unclassified_final':     'uvf',
            'part_of_speech':         'pos_attr',
        };
        // Also normalize morph values that come as full words to the short codes
        const MORPH_VAL_NORM = {
            // verbal_tense_form
            'perfect':             'perf',
            'imperfect':           'impf',
            'wayyiqtol':           'wayq',
            'imperative':          'impv',
            'infinitive_construct':'infc',
            'infinitive_absolute': 'infa',
            'participle_active':   'ptca',
            'participle_passive':  'ptcp',
            // verbal_stem
            'qal':    'qal',  'nifal':  'nif',  'piel': 'piel', 'pual': 'pual',
            'hifil':  'hif',  'hofal':  'hof',  'hitpael': 'hit', 'hishtaphel': 'hsht',
            // gender
            'masculine': 'm', 'feminine': 'f',
            // number
            'singular': 'sg', 'plural': 'pl', 'dual': 'du',
            // state
            'absolute': 'a', 'construct': 'c',
            // person
            'first':  'p1', 'second': 'p2', 'third': 'p3',
            'first_person': 'p1', 'second_person': 'p2', 'third_person': 'p3',
            'p1': 'p1', 'p2': 'p2', 'p3': 'p3',
            // pdp / sp full words
            'verb': 'verb', 'noun': 'subs', 'substantive': 'subs',
            'adjective': 'adjv', 'preposition': 'prep', 'conjunction': 'conj',
            'article': 'art', 'personal_pronoun': 'prps', 'demonstrative_pronoun': 'prde',
            'interrogative_pronoun': 'prin', 'proper_noun': 'nmpr', 'adverb': 'advb',
            'adverbial_use': 'advb',
            'negation': 'nega', 'interjection': 'intj', 'interrogative': 'inrg',
            // prefix_marker full descriptions → pfm codes
            '3ms_prefix':             'J',
            '3mp_prefix':             'J',
            '1cs_prefix':             '>',
            '1cp_prefix':             'N',
            '2ms/2fs/3fs_prefix':     'T=',
            '3fs_prefix':             'T=',
            '2ms_prefix':             'T=',
            '2fs_prefix':             'T=',
            'participial_prefix':     'M',
            // verbal_stem_marker full descriptions → vbs codes
            'hifil_marker_(causative)':  'H',
            'nifal_marker_(passive)':    'N',
            'hitpael_marker_(reflexive)':'HT',
            'piel_marker':               '',   // Piel has no discrete prefix to strip
            // verbal_ending full descriptions → vbe codes
            '1cs_verbal_ending':     'TJ',
            '1cp_verbal_ending':     'NW',
            '2ms_verbal_ending':     'T',
            '2fs_verbal_ending':     'T',
            '3fs_verbal_ending':     'H=',
            '2mp_verbal_ending':     'TM',
            '2fp_verbal_ending':     'TN',
            '3mp_verbal_ending':     'W',
            '3fp_verbal_ending':     'WN',
            '3fp_verbal_ending_nh':  'NH',
            // nominal_ending full descriptions → nme codes
            'he_ending':                  'H',
            'feminine_tav_ending':        'T',
            'construct_or_1cs_yod':       'J',
            'masculine_plural_ending':    'JM',
            'feminine_plural_ending':     'WT',
            'feminine_plural_construct':  'WTJ',
            'they_feminine_ending':       'NH',
        };
        const morphSegments = (parts[4] || '').split('|');
        for (const seg of morphSegments) {
            const eq = seg.indexOf('=');
            if (eq < 1) continue;
            const rawKey = seg.slice(0, eq).trim();
            const rawVal = seg.slice(eq + 1).trim();
            if (!rawKey || !rawVal || rawVal === 'absent' || rawVal === 'none') continue;
            const key = MORPH_KEY_NORM[rawKey] || rawKey;
            // Strip trailing _(…) annotation before lookup so that DB values like
            // '3ms_prefix_(he/it)' resolve to '3ms_prefix' → 'J' correctly.
            // This normalises all parenthetical human-readable suffixes the DB may add.
            const rawValNorm = rawVal.replace(/_\([^)]*\)$/, '');
            const val = MORPH_VAL_NORM[rawVal] || MORPH_VAL_NORM[rawValNorm] || rawVal;
            attributes[key] = val;
        }

        // ── BUG B FIX (keep in sync with build-surface-index.js parseToken) ──
        // The single-blob standalone branch below IGNORES every affix morpheme
        // (pfm/vbs/prs/nme/vbe/uvf). A particle carrying one — e.g. a preposition
        // with a pronominal suffix (𐤀𐤋+𐤉 "to me") — must NOT take it, or the suffix
        // is silently swallowed: no chip, no reconstruction. Route those to the
        // else-branch, which splits root + affix correctly and reconstructs the
        // suffix via PRS_TAG. Bare particles (inseparable 𐤁/𐤋/𐤊/𐤌, 𐤅, 𐤄) carry no
        // affix and still fold into the following word block exactly as before.
        // `attributes` already drops 'absent'/'none', so a present key = a REAL morpheme.
        const AFFIX_KEYS = ['pfm', 'vbs', 'prs', 'nme', 'vbe', 'uvf'];
        const hasAffix = AFFIX_KEYS.some(k => attributes[k]);
        // Interrogative HE is a PROCLITIC (prefix on the next word). Gate on the
        // surface, not just pos: 𐤌𐤄 "what" / 𐤌𐤉 "who" are also inrg but are
        // standalone words. Only the bare letter 𐤄 is the interrogative prefix.
        const isInterrogHe = (pos === 'inrg' && rawPaleo === '𐤄');
        const isStandalonePos = (['conj', 'prep', 'art'].includes(pos) && !hasAffix) || isInterrogHe;
        const isStandaloneException = STANDALONE_WORDS.includes(rawPaleo);

        if (isStandalonePos) {
            let translation = `[${rawPaleo}]`;

            // SOURCE-OF-TRUTH ORDER (standardized): lexicon JSON first, hardcoded
            // GRAMMAR_MAP only as a last-resort fallback when the lexicon has no
            // entry. Previously GRAMMAR_MAP took priority; demoting it makes the
            // lexicon the single source of truth for particle glosses while
            // keeping the table as a safety net (per "keep tables as fallback").
            //   Priority: homographs[<paleo>_<pos>]  →  lexicon[<paleo>]  →  GRAMMAR_MAP  →  [paleo]
            if (pos === 'prep') {
                translation = homographs[`${rawPaleo}_preposition`] || lexicon[rawPaleo] || GRAMMAR_MAP.prep[rawPaleo] || `[${rawPaleo}]`;
            } else if (pos === 'conj') {
                translation = homographs[`${rawPaleo}_conjunction`] || lexicon[rawPaleo] || GRAMMAR_MAP.conj[rawPaleo] || `[${rawPaleo}]`;
            } else if (pos === 'art') {
                translation = homographs[`${rawPaleo}_article`] || lexicon[rawPaleo] || GRAMMAR_MAP.art[rawPaleo] || `[${rawPaleo}]`;
            } else if (pos === 'inrg') {
                // NO bare lexicon[rawPaleo] fallback: lexicon['𐤄'] is the ARTICLE
                // gloss, and letting it answer here is exactly what rendered the
                // interrogative as "[the]". Only pos-keyed sources may resolve it.
                translation = homographs[`${rawPaleo}_interrogative`] || GRAMMAR_MAP.inrg[rawPaleo] || `[${rawPaleo}]`;
            }

            pendingComponents.push({
                paleo: rawPaleo,
                translit: '',
                translation,
                css: getCssClass(pos),
                token_ordinal: tokenOrdinal
            });
        } else {
            let paleoArray = [...rawPaleo];

            // Maqaf compound: a name joined by ־ (e.g. מלכי־צדק) shares ONE Strong's
            // whose lemma is the WHOLE compound, so letting the true root shine through
            // renders the full lemma on each half ("Malakayatzadaq-Tzadaq"). When this
            // token is maqaf-adjacent, keep its SURFACE for the root display so each
            // half shows only its own letters (Malakay / Tzadaq).
            // A maqaf-adjacent word with an UNRELATED Strong's (Psalm 119:13's
            // mishpetei-pikha: H4941 mishpat + H6310 peh) is not part of any compound
            // - it's an ordinary word that happens to sit next to a hyphen, and its
            // own canonical root should restore normally like any other word. Bare
            // adjacency (the old `_prevIsMaqaf || _nextTokIsMaqaf`) suppressed
            // mishpat's own root restoration for no reason other than proximity to
            // the maqaf. _prevIsMaqaf is naturally false here anyway once the
            // chip-fusion fix above flushes on a non-shared pair (pendingComponents
            // resets first), but _nextTokIsMaqaf must explicitly check that the word
            // ACROSS the maqaf shares this token's own Strong's before treating it
            // as a compound half.
            const _prevIsMaqaf = pendingComponents.length > 0 &&
                                 pendingComponents[pendingComponents.length - 1].isMaqaf;
            const _nextTokIsMaqaf = (index + 1 < lines.length) &&
                                    ((lines[index + 1].split('\t')[2] || '').includes('\u05BE'));
            const _nextMaqafSharesRoot = _nextTokIsMaqaf && !!strongs && (() => {
                const afterMaqafStrongs = ((lines[index + 2] || '').split('\t')[5] || '').trim() || null;
                return afterMaqafStrongs === strongs;
            })();
            const _inMaqafCompound = _prevIsMaqaf || _nextMaqafSharesRoot;

            // This content token is the ROOT of its maqaf-segment — record its Strong's
            // + ordinal so the half gets its own root badge (both halves of a joined chip).
            const _curSeg = pendingSegments[pendingSegments.length - 1];
            _curSeg.rootStrongs = strongs;
            _curSeg.ordinal = tokenOrdinal;
            pendingHasRoot = true;

            let pfmObj = extractPrefix(attributes, 'pfm', 'pfm', paleoArray);
            let vbsObj = extractPrefix(attributes, 'vbs', 'vbs', paleoArray);
            let prsObj = extractSuffix(attributes, 'prs', 'prs', paleoArray);
            let uvfObj = extractSuffix(attributes, 'uvf', 'uvf', paleoArray);

            let nmeObj = null;
            // ── SUFFIX STRIPPING IS STRONG'S-DRIVEN — NO PER-WORD SPECIAL CASES ──
            // Whether a nominal ending is a real (separable) suffix or a root
            // radical is decided ENTIRELY by the token's canonical root, resolved
            // from its Strong's number (strongs-roots.json). Downstream the
            // canonical restore rebuilds the true root and ending-absorption drops
            // any ending the root already carries — so for EVERY token that has a
            // Strong's number this Just Works (𐤀𐤋𐤄𐤉𐤌 / 𐤀𐤋𐤄𐤉 / 𐤀𐤋𐤄𐤉𐤅,
            // 𐤔𐤌𐤉𐤌, 𐤌𐤉𐤌 …) while a genuine plural (𐤎𐤅𐤎𐤉𐤌, H5483) still keeps
            // its plural chip. No god/theonym checks, no surface exceptions.
            // The surface list is consulted ONLY when the corpus left the token
            // with no Strong's number at all — a data gap to close upstream.
            const _snEarly = strongs ? 'H' + strongs.replace(/^H+/, '') : '';
            const shouldExcludeNme = _snEarly ? false : NME_EXCLUSIONS.has(originalRawPaleo);

            // PLURAL PARTICIPLES — CONSTRUCT *AND* ABSOLUTE (notzrei/temimei-derekh's
            // "keep" word, Ps 119:2, but also plain "ha-holkhim" = "those who walk",
            // Ps 119:1): OSHB gives nouns/adjectives an explicit nme=JM tag for
            // masc-plural endings, but a VERB's participle form carries its plural
            // info on vt/nu/st instead — it never gets an nme tag AT ALL, in EITHER
            // state. Previously this only synthesized the tag for st==='c'
            // (construct), so an absolute-plural participle ("HaHalakayam" — the
            // ones who walk) had nothing to strip: no nme, no chip, and the whole
            // "-ayim" ending got silently folded into the displayed root by
            // mergeRootDisplay's surface-addition tolerance, rendering the article
            // + root + plural ending as one undifferentiated blob with no sign a
            // modification was even present. A participle used adjectivally/
            // substantivally in masc-plural — construct OR absolute (vt=ptc*,
            // nu=pl) — carries the identical morpheme as a plural noun; synthesize
            // the same 'JM' tag here so the one (Yod-aware) extraction path below
            // handles both states uniformly and always emits a labeled chip.
            if (!attributes['nme'] && pos === 'verb' &&
                (attributes['vt'] || '').startsWith('ptc') &&
                attributes['nu'] === 'pl') {
                attributes['nme'] = 'JM';
            }

            if (!shouldExcludeNme) {
                nmeObj = extractSuffix(attributes, 'nme', 'nme', paleoArray);
            }

            // JM/JM= tagged but the surface has NEITHER the Yod-Mem nor bare-Mem
            // absolute-plural ending — it's spelled with a bare Yod instead
            // (construct plural "-ei", e.g. ashrei/temimei/notzrei). Consonantal
            // Hebrew can't distinguish that spelling from the 1cs possessive "-i"
            // ("my") by the letter alone — the codebase already treats a bare
            // trailing Yod as ambiguous "Of/My" for the standalone nme='J' tag,
            // so a JM-tagged bare Yod gets the SAME label rather than a separate
            // "construct plural" gloss invented just for this case.
            if (!nmeObj && !shouldExcludeNme &&
                (attributes['nme'] === 'JM' || attributes['nme'] === 'JM=') &&
                paleoArray.join('').endsWith('𐤉')) {
                paleoArray.splice(paleoArray.length - 1, 1);
                const jData = GRAMMAR_MAP.nme['J'];
                nmeObj = { paleo: '𐤉', translit: '', translation: `[${jData.trans}]`, css: jData.css };
            }

            let vbeObj = extractSuffix(attributes, 'vbe', 'vbe', paleoArray);

            // ── MASCULINE PLURAL IMPERATIVE "-Ū" ENDING FALLBACK ────────────────
            // Masculine plural imperative ("Praise!", "Keep!", …) always ends in
            // ־וּ (Waw) — a universal Hebrew inflectional rule, true of every verb
            // in that mood/number/gender, not a per-root guess. extractSuffix()
            // above only fires when the corpus's own `verbal_ending` field is
            // present on this token, and that field is reliably tagged for the
            // SUFFIX/perfect conjugation's person-agreement afformative but not
            // consistently tagged for the plain imperative — there the person/
            // number already lives in ps/gn/nu, so the corpus doesn't always
            // duplicate it as a discrete vbe morpheme. Left alone, that produced
            // exactly the reported inconsistency: the SAME verb ("Halalaw")
            // rendered two different ways in one verse — an object-suffixed
            // occurrence ("Halalaw-Him") already split its trailing Waw via the
            // `prs` pronominal-suffix map below, while the bare occurrence (no
            // object, nothing but the corpus's sometimes-missing vbe tag) kept
            // the Waw fused to the root and fell back to an unglossed placeholder.
            // Strip it here on the same grammatical grounds whenever nothing
            // upstream already accounted for it — an explicit vbe tag, or an
            // object pronoun (checked directly against the raw morph attribute;
            // `prsObj` isn't computed until below) — so the ending gets the SAME
            // modifier treatment regardless of which path tagged it.
            if (!vbeObj && !attributes['prs'] &&
                attributes['vt'] === 'impv' && attributes['nu'] === 'pl' && attributes['gn'] !== 'f' &&
                paleoArray.length && paleoArray[paleoArray.length - 1] === '𐤅') {
                paleoArray.pop();
                vbeObj = { paleo: '𐤅', translit: '', translation: '[you all]', css: 'vbe-2mp' };
            }

            if (pfmObj) pendingComponents.push({...pfmObj, token_ordinal: tokenOrdinal});
            if (vbsObj) pendingComponents.push({...vbsObj, token_ordinal: tokenOrdinal});

            const displayRoot = paleoArray.join('');

            // ── PRONOMINAL SUFFIX: DISPLAY-ONLY SEGMENTATION ───────────────────
            // Root + all modifications: the morphology tag drives the suffix, not
            // the surface. `rootZone` is the display root with the bare suffix
            // consonant peeled off (only when it is actually there) so the merge
            // below doesn't fold the suffix into the root and then double it. The
            // GROUPING root (trueRoot / root_paleo) is resolved from `displayRoot`
            // and is deliberately NOT affected by any of this.
            const _prsInfo = attributes['prs'] ? PRS_TAG[attributes['prs']] : null;
            let rootZone = displayRoot;
            if (_prsInfo && _prsInfo.paleo && rootZone.endsWith(_prsInfo.paleo)) {
                rootZone = rootZone.slice(0, rootZone.length - _prsInfo.paleo.length);
            }
            // Emit the suffix from the tag (reconstructed if the surface omitted it).
            if (_prsInfo) {
                prsObj = { paleo: _prsInfo.paleo, translit: '',
                           translation: `[${_prsInfo.trans}]`, css: _prsInfo.css,
                           reconstructed: !displayRoot.endsWith(_prsInfo.paleo) };
            }
            const _rootZoneLen = [...rootZone].length;
            const pdp = attributes['pdp'] || '';
            const vs  = attributes['vs']  || '';
            const gn  = attributes['gn']  || '';   // gender: m / f / unknown
            const nu  = attributes['nu']  || '';   // number: sg / pl / du
            const vt  = attributes['vt']  || '';   // verb form: perf/impf/wayq/ptca/infc/impv/ptcp/infa
            const st  = attributes['st']  || '';   // state: a (absolute) / c (construct)
            const ps  = attributes['ps']  || '';   // person: p1 / p2 / p3 / unknown

            // ── TRUE ROOT RESOLUTION ──────────────────────────────────────────────
            // Priority (highest → lowest):
            //   1. strongs-roots.json (ground truth from the full Strong's lexicon,
            //      built from the canonical Hebrew lemma consonants). This catches any
            //      case where prefix/suffix stripping ate a root radical — e.g.
            //      nme=WT strips 𐤅𐤕 from 𐤋𐤇𐤅𐤕 (H3871 lawach=tablet) leaving 𐤋𐤇
            //      but strongs-roots says 𐤋𐤅𐤇, so we restore the full root.
            //   2. STRONGS_NO_MUTATE — SNs whose stripped surface IS their root.
            //      Prevents MUTATED_ROOTS from firing on e.g. H3220 𐤉𐤌 (yam=sea)
            //      which looks like a contracted hollow root but is the real root.
            //   3. MUTATED_ROOTS — hand-curated table that restores contracted/
            //      assimilated forms (hollow Ayin-Waw, Pe-Nun, lamed-Hay, etc.)
            //      when strongs-roots has no entry for that SN.
            //   4. displayRoot as-is.
            //
            // Rule: roots are NEVER displayed in collapsed/defective form.
            // Every inflected surface resolves to its full dictionary root.
            const displayRootLen = [...displayRoot].length;
            const normStrongsForMutate = strongs ? 'H' + strongs.replace(/^H+/, '') : '';

            // Step 1 — strongs-roots.json ground truth
            // Load the full-corpus lexicon built from canonical Hebrew lemma consonants.
            // Use it when: (a) the SN is known, AND (b) the canonical root is at least
            // as long as displayRoot (shorter means strongs-roots has a reduced form,
            // which can happen for pronouns/particles — trust the parser in that case).
            const _strongsRootsLex = loadStrongsRoots();
            const _canonicalRoot = normStrongsForMutate ? _strongsRootsLex[normStrongsForMutate] : null;
            const _canonLen = _canonicalRoot ? [..._canonicalRoot].length : 0;
            const _dispLen  = displayRootLen;

            // Step 2 — SNs whose stripped surface IS already their true root
            // (MUTATED_ROOTS must not touch these even if displayRoot looks short)
            const STRONGS_NO_MUTATE = new Set(['H3220', 'H251', 'H259']);
            const skipMutate = STRONGS_NO_MUTATE.has(normStrongsForMutate);

            // ── ADDITIVE-ONLY TOLERANCE (kept in sync with build-surface-index.js /
            // tests/build-parseToken.cjs) ─────────────────────────────────────────
            // How many of the canonical root's letters are NOT found (in order) in
            // the UNSTRIPPED surface? A weak-verb substitution (Hiphil Pe-Yod: Waw
            // written for the root's own Yod, as in Psalm 119:33's Horeni/H3384
            // Yarah) or an elided I-nun/I-yod can each account for one letter; two
            // missing is still trustworthy. More than that means this Strong's
            // likely names a different word (e.g. one half of a compound proper
            // noun) and should NOT override the parsed form. This is what the old
            // canonFirst===dispFirst / canonFirst===rzFirst gates below were
            // missing — a prefix that eats into (or a weak-verb form that
            // substitutes) the root's own first radical failed that literal check
            // even when the canonical root was clearly the right one, so the
            // result silently rendered fewer letters than the Strong's actually
            // has ("HaWaray" instead of "HaYarahay"). _canonTrusted is OR'd into
            // both gates below as an additional way to accept the canonical root,
            // never a way to reject it.
            const _canonMissing = !_canonicalRoot ? Infinity : (() => {
                const surf = [...originalRawPaleo];
                let i = 0, missing = 0;
                for (const ch of _canonicalRoot) {
                    const at = surf.indexOf(ch, i);
                    if (at < 0) missing++; else i = at + 1;
                }
                return missing;
            })();
            // Real elision (I-nun/I-yod assimilation, a weak-verb letter substitution)
            // is a VERB MORPHOLOGY phenomenon — Hebrew proper names don't "elide" a
            // letter the way conjugated roots do; a name is either spelled in full or
            // it's a different name/word. Tolerating up to 2 missing letters for a
            // pos='nmpr' (proper noun) token is what let an UNRELATED Strong's #'s
            // canonical spelling get silently painted onto a name that never had
            // those letters — e.g. H2995 Yabneel's leading Yod ending up "restored"
            // onto an unrelated proper-name token that happens to reuse H2995. Proper
            // names get NO tolerance: only an exact letter-for-order match (every
            // canonical letter actually present, in order) earns the restoration.
            // Verbs/nouns/etc. keep the up-to-2 tolerance this was designed for.
            // Kept in sync with build-surface-index.js.
            const _canonTrusted = pos === 'nmpr' ? _canonMissing === 0 : _canonMissing <= 2;
            // A COMPOUND-NAME half (Ben-Gever H1127: surface "Ben" = 2 letters,
            // lemma "Ben-Gever" = 5) and a genuine SAME-WORD spelling variant
            // (Mowcadah/foundation H4146: surface 5 letters, lemma 5 letters, just a
            // weak Yod->Vav swap + reordering) can score IDENTICALLY on _canonMissing
            // — both "3 letters not found in order" — because that count can't tell
            // "this token is only half the word" from "this token has all the word's
            // letters, just rearranged". Surface LENGTH can: a compound half is
            // drastically shorter than its multi-word lemma; a spelling variant
            // carries roughly as many letters as its lemma. Used ONLY to decide
            // whether rootDisplay may fall back to the bare canonical root (never
            // trueRoot, which is allowed to be the whole compound for grouping).
            const _lengthTrusted = [...originalRawPaleo].length >= _canonLen - 2;

            // THE ROOT SHINES *AND SO DO ITS MODIFICATIONS* — no morpheme dropped.
            // Two distinct values come out of this block:
            //   • trueRoot   — the clean dictionary lemma (strongs-roots.json), used
            //     for translation lookups and as the canonical root_paleo the Roots
            //     page groups by. NEVER carries inflectional residue, so every
            //     inflected form of 𐤍𐤇𐤄 still collapses to the one root entry.
            //   • rootDisplay — what the READER shows in the root slot: the canonical
            //     root with every surface modification kept in place. mergeRootDisplay
            //     restores elided radicals (the נ of natzal, the ה of III-he) AND
            //     preserves surface letters the lemma lacks (a mater, or the ת that
            //     replaces the ה in a III-he infinitive) in their correct positions.
            //
            //   Exod 13:21 לַנְחֹת : surface-root 𐤍𐤇𐤕, canonical H5148 = 𐤍𐤇𐤄
            //        → trueRoot 𐤍𐤇𐤄 (grouping) · rootDisplay 𐤍𐤇𐤄𐤕 (reader)
            //   pe-nun הַצִּיל  : 𐤂𐤔 + canonical 𐤍𐤂𐤔 → 𐤍𐤂𐤔 (נ restored, nothing extra)
            //   III-he וַיִּבֶן : 𐤁𐤍 + canonical 𐤁𐤍𐤄 → 𐤁𐤍𐤄 (ה restored)
            //   mater  הַנְחִיל: 𐤍𐤑𐤉𐤋 + canonical 𐤍𐤑𐤋 → 𐤍𐤑𐤉𐤋 (yod mater kept)
            let trueRoot;
            let rootDisplay;   // reader-facing root: canonical + kept surface modifications
            if (_canonicalRoot && !skipMutate) {
                // trueRoot (→ root_paleo) uses displayRoot — the BASELINE input.
                const merged     = mergeRootDisplay([...displayRoot], [..._canonicalRoot]);
                const canonFirst = [..._canonicalRoot][0];
                const dispFirst  = [...displayRoot][0];
                if (merged) {
                    trueRoot = _canonicalRoot;
                // FIRST-LETTER GUARD, WIDENED. The bare `canonFirst === dispFirst`
                // test rejected the canonical root whenever a PREFIX had consumed the
                // first radical — exactly the legitimate case. 𐤀𐤌𐤓 (H559, I-aleph):
                // the 1cs prefix aleph is also radical 1, so after stripping,
                // displayRoot = 𐤌𐤓, first letters differ, and the canonical root was
                // thrown away — leaving root_paleo = 𐤌𐤓, a root that does not exist,
                // and glossing it "[𐤌𐤓]". The letters on screen were never the issue;
                // the ROOT and its gloss were.
                //
                // The guard's real job is to stop a WRONG Strong's number injecting an
                // unrelated root. isRootSubsequence does that precisely: accept the
                // canonical root when displayRoot is a letter-elided subsequence of it
                // (𐤌𐤓 ⊂ 𐤀𐤌𐤓 ✓), reject when it is not (𐤌𐤓 ⊄ 𐤁𐤓𐤊 ✗).
                } else if (!dispFirst || canonFirst === dispFirst
                           || isRootSubsequence([...displayRoot], [..._canonicalRoot])
                           || _canonTrusted) {
                    trueRoot = _canonicalRoot;
                } else {
                    trueRoot = MUTATED_ROOTS[displayRoot] || displayRoot;
                }
                // rootDisplay (reader only) uses rootZone — the suffix has been
                // peeled off so the merge shows canonical + root-zone modifications
                // (mutated radical, mater) WITHOUT the suffix; the suffix is a chip.
                const rzMerged = mergeRootDisplay([...rootZone], [..._canonicalRoot]);
                const rzFirst  = [...rootZone][0];
                // NMPR GUARD (kept in sync with build-surface-index.js). FIRST CUT
                // (wrong): reject whenever pos==='nmpr' && any canonical letter is
                // missing — broke H804 Asshur (𐤀𐤔𐤅𐤓) vs its own defective
                // spelling 𐤀𐤔𐤓 (no internal Waw), a genuine plene/defective
                // spelling of the SAME name, both starting with Aleph. trueRoot
                // above already has the right test: canonFirst === dispFirst
                // admits the canonical root regardless of _canonTrusted, because
                // same-first-letter means "same name, orthographic variant" —
                // only a first-letter MISMATCH (Yabneel's Yod vs this word's Bet)
                // means "different word reusing the SN". Mirror that test here so
                // trueRoot and rootDisplay can never disagree (enforced by the
                // no-eliding startup gate).
                if (pos === 'nmpr' && canonFirst !== rzFirst) {
                    rootDisplay = MUTATED_ROOTS[rootZone] || rootZone;
                } else if (rzMerged) {
                    rootDisplay = rzMerged;
                } else if (!rzFirst || _canonTrusted || _lengthTrusted) {
                    rootDisplay = _canonicalRoot;
                } else {
                    rootDisplay = MUTATED_ROOTS[rootZone] || rootZone;
                }
            } else if (skipMutate) {
                // Surface after stripping IS the correct root — don't mutate
                trueRoot = displayRoot;
                rootDisplay = rootZone;
            } else if (displayRootLen <= 1 && MUTATED_ROOTS[originalRawPaleo]) {
                // Stripping reduced to a single char — too ambiguous; use full surface
                trueRoot = MUTATED_ROOTS[originalRawPaleo];
                rootDisplay = trueRoot;
            } else {
                // Standard mutation table lookup
                trueRoot = MUTATED_ROOTS[displayRoot] || displayRoot;
                rootDisplay = MUTATED_ROOTS[rootZone] || rootZone;
            }

            // ── HARDEN: NO BAKED MODIFICATION MAY LOOK LIKE A BARE ROOT ─────────
            // mergeRootDisplay deliberately tolerates up to 2 surface letters that
            // are not part of the canonical root, so it can preserve a mid-word
            // mater lectionis or a restored radical in its correct position — that
            // tolerance is what makes ha-holkhim ("the ones who walk"), Halakayam,
            // legible at all. But when the un-canonical letters land AFTER the
            // full canonical root rather than inside it (rootDisplay literally
            // starts with trueRoot and then keeps going), they are not part of the
            // root's own spelling — they are an inflectional ending some upstream
            // tag failed to claim (e.g. an absolute-plural participle's own -im
            // before the Fix A synthesis above covered it, or a suffix-shaped
            // letter OSHB simply left untagged, like a bare trailing 𐤅). Split
            // that trailing addition into its OWN chip instead of leaving it fused
            // to the root: root_paleo/trueRoot are unaffected (grouping never
            // changes), only the READER-facing rootDisplay is trimmed back to the
            // clean root, with the addition rendered right after it, labeled when
            // guessSuffixGloss can name it and flagged (never silent) when it
            // can't. NME_EXCLUSIONS words (Alahayam, Shamayam, …) are untouched by
            // this: for those, trueRoot itself already contains the trailing
            // letters, so rootDisplay === trueRoot and nothing here fires.
            let bakedModObj = null;
            if (rootDisplay && trueRoot && rootDisplay !== trueRoot && rootDisplay.startsWith(trueRoot)) {
                const bakedExtra = rootDisplay.slice(trueRoot.length);
                if (bakedExtra) {
                    const guess = guessSuffixGloss(bakedExtra);
                    bakedModObj = {
                        paleo: bakedExtra,
                        translit: '',
                        translation: guess ? `[${guess.trans}]` : `[${getTranslit(bakedExtra)}]`,
                        css: guess ? (guess.css || 'mod-suff-unk') : 'mod-suff-unk',
                        bakedSplit: true,  // see reGlossOne guard — never re-look-up by bare paleo
                    };
                    rootDisplay = trueRoot;
                }
            }

            // Expand short DB codes to fully-qualified key segment names.
            // pdp/sp use short codes (verb, subs, adjv, prep, conj, art, prde, prps, prin, nmpr, advb, nega, intj, inrg)
            // vs uses: qal, nif, piel, pual, hif, hof, hit, hsht
            // vt uses: perf, impf, wayq, impv, infc, infa, ptca, ptcp
            // gn uses: m, f, unknown
            // nu uses: sg, pl, du, unknown
            // st uses: a, c
            // ps uses: p1, p2, p3, unknown
            const PDP_FULL = {
                'verb': 'verb', 'subs': 'noun', 'adjv': 'adjective',
                'prep': 'preposition', 'conj': 'conjunction', 'art': 'article',
                'prde': 'demonstrative pronoun', 'prps': 'personal pronoun',
                'prin': 'interrogative pronoun', 'nmpr': 'proper noun',
                'advb': 'adverb', 'nega': 'negation', 'intj': 'interjection',
                'inrg': 'interrogative',
            };
            const VS_FULL = {
                'qal': 'qal', 'nif': 'nifal', 'piel': 'piel', 'pual': 'pual',
                'hif': 'hifil', 'hof': 'hofal', 'hit': 'hitpael', 'hsht': 'hishtaphel',
                'htpo': 'hitpolel', 'poel': 'poel', 'polel': 'polel',
            };
            const VT_FULL = {
                'perf': 'perfect', 'impf': 'imperfect', 'wayq': 'wayyiqtol',
                'impv': 'imperative', 'infc': 'infinitive construct',
                'infa': 'infinitive absolute', 'ptca': 'participle active',
                'ptcp': 'participle passive',
            };
            const GN_FULL = { 'm': 'masculine', 'f': 'feminine', 'unknown': 'unknown' };
            const NU_FULL = { 'sg': 'singular', 'pl': 'plural', 'du': 'dual', 'unknown': 'unknown' };
            const ST_FULL = { 'a': 'absolute', 'c': 'construct' };
            const PS_FULL = { 'p1': 'first person', 'p2': 'second person', 'p3': 'third person', 'unknown': 'unknown' };

            const fpdp = PDP_FULL[pdp] || pdp;
            const fpos = PDP_FULL[pos]  || pos;
            const fvs  = VS_FULL[vs]    || vs;
            const fvt  = VT_FULL[vt]    || vt;
            const fgn  = GN_FULL[gn]    || gn;
            const fnu  = NU_FULL[nu]    || nu;
            const fst  = ST_FULL[st]    || st;
            const fps  = PS_FULL[ps]    || ps;

            // Exhaustive lookup — most specific first, first match wins.
            // homographs.json keys are built from any underscore-joined combination of:
            //   root, pdp/pos (full word), gn (masculine/feminine), nu (singular/plural/dual),
            //   vt (perfect/imperfect/…), st (absolute/construct), vs (qal/nifal/…), ps (first person/…)
            //
            // Key format examples you can add to homographs.json:
            //   "𐤔𐤍𐤄_noun"                        any noun shanah  → "year"
            //   "𐤔𐤍𐤄_verb"                        any verb shanah  → "repeat/do again"
            //   "𐤔𐤍𐤄_noun_feminine"               noun, feminine   → "year"
            //   "𐤍𐤐𐤔_noun"                        noun naphash     → "living being/soul"
            //   "𐤍𐤐𐤔_verb"                        verb naphash     → "to refresh/breathe"
            //   "𐤀𐤌𐤓_noun_construct"              construct noun   → "word/matter of"
            //   "𐤒𐤓𐤀_verb_qal_perfect"            qal perfect qarah
            //   "𐤄𐤋𐤊_noun_feminine_singular"      feminine singular noun
            //   "𐤌𐤍𐤉_preposition"                 multi-char prep  → "From"
            //
            // Tiers (checked for trueRoot, then displayRoot, then originalRawPaleo):
            //   Key priority — most specific first, first match wins.
            //   Tiers checked for trueRoot, then displayRoot, then originalRawPaleo:
            //
            //   T1  root_pos_gn_nu        pos + gender + number      (most specific noun)
            //   T2  root_pos_gn           pos + gender
            //   T3  root_pos_nu           pos + number
            //   T4  root_pos_st           pos + state (absolute/construct)
            //   T5  root_vs_vt            verb stem + form           ← specific verb form (e.g. qal_participle active)
            //   T6  root_vs               verb stem only             ← e.g. _qal overrides all qal forms
            //   T7  root_vt               verb form only
            //   T8  root_pos              pos only                   ← general fallback (e.g. _verb, _noun)
            //   T9  root_surface_pos      surface pos when ≠ pdp
            //  T10  root_gn_nu            gender + number (pos-agnostic)
            //  T11  root_ps               person
            // Normalise strongs to "H<number>" — strips any leading zeros or extra H
            const normStrongs = strongs ? 'H' + strongs.replace(/^H+/, '') : '';

            const buildKeys = (r) => [
                // T0 — Strongs-keyed: most specific possible, unambiguous for homographs
                //      Format: root_H4910, root_H4910_noun, root_H4910_verb, etc.
                (normStrongs && fpdp)        ? `${r}_${normStrongs}_${fpdp}` : null,  // T0a
                normStrongs                  ? `${r}_${normStrongs}`         : null,  // T0b
                // T1–T11 — morphology tiers
                (fpdp && fgn && fnu)         ? `${r}_${fpdp}_${fgn}_${fnu}` : null,  // T1
                (fpdp && fgn)                ? `${r}_${fpdp}_${fgn}`         : null,  // T2
                (fpdp && fnu)                ? `${r}_${fpdp}_${fnu}`         : null,  // T3
                (fpdp && fst)                ? `${r}_${fpdp}_${fst}`         : null,  // T4
                (fvs && fvt)                 ? `${r}_${fvs}_${fvt}`          : null,  // T5
                fvs                          ? `${r}_${fvs}`                 : null,  // T6
                fvt                          ? `${r}_${fvt}`                 : null,  // T7
                fpdp                         ? `${r}_${fpdp}`                : null,  // T8
                (fpos && fpos !== fpdp)      ? `${r}_${fpos}`                : null,  // T9
                (fgn && fnu)                 ? `${r}_${fgn}_${fnu}`          : null,  // T10
                fps                          ? `${r}_${fps}`                 : null,  // T11
            ].filter(Boolean);

            // ROOTS ONLY — homographs.json is keyed <root>_<STRONGS>
            // ("𐤔𐤌𐤏_H8085": "hearken / hear"), never <surface>_<anything>. The
            // raw surface was fed in here too and had to come out for the same
            // reason as the lexicon chain below: the tokenizer strips characters,
            // so a surface matches a root entry only by accident.
            const lookupKeys = [
                ...buildKeys(trueRoot),
                ...buildKeys(displayRoot),
            ];

            let finalTranslation = null;

            // Tier 0 — Strongs-keyed lookup: most authoritative disambiguator.
            // Key format: "H<num>" or "H<num>_<pos>" or "H<num>_<vs>_<vt>".
            // This fires before the root-based tiers so that true homographs
            // sharing identical root letters (e.g. H4910 vs H4911 𐤌𐤔𐤋) always
            // resolve to the correct meaning regardless of morph ambiguity.
            if (strongs && !finalTranslation) {
                const snNorm = 'H' + strongs.replace(/^H+/, '');
                const snKeys = [
                    (fvs && fvt) ? `${snNorm}_${fvs}_${fvt}` : null,
                    fvs          ? `${snNorm}_${fvs}`         : null,
                    fvt          ? `${snNorm}_${fvt}`         : null,
                    fpdp         ? `${snNorm}_${fpdp}`        : null,
                    snNorm,
                ].filter(Boolean);
                for (const k of snKeys) {
                    if (homographs[k]) { finalTranslation = homographs[k]; break; }
                }
            }

            for (const key of lookupKeys) {
                if (!finalTranslation && homographs[key]) {
                    finalTranslation = homographs[key];
                    break;
                }
            }

            if (!finalTranslation) {
                // Plene/defective tolerance + surface specificity.
                //   • Hebrew matres lectionis (yod/waw) are written doubled in
                //     plene spelling, so a curated lexicon key in either spelling
                //     should match either surface (plene 𐤂𐤅𐤉𐤉𐤌 ⇄ defective 𐤂𐤅𐤉𐤌).
                //   • A curated SURFACE entry is more specific than the bare root,
                //     so it wins: 𐤂𐤅𐤉𐤌 → "heathen" overrides root 𐤂𐤅𐤉 →
                //     "nation / people". This only changes anything when BOTH a
                //     surface and a root entry are curated; exact forms are always
                //     tried before matres-collapsed ones, so a precise entry is
                //     never overridden by the collapse.
                const collapseMatres = s => (s || '').replace(/𐤉𐤉+/g, '𐤉').replace(/𐤅𐤅+/g, '𐤅');
                const surfacePlene = collapseMatres(originalRawPaleo);
                const rootPlene    = collapseMatres(trueRoot);
                const hebExtra = (loadLexicons().hebExtra) || {};
                finalTranslation =
                    // THE STRONG'S IS THE SOURCE OF TRUTH. A gloss is looked up
                    // by the ROOT that Strong's names — never by the raw surface.
                    // The surface is root + modifications and the tokenizer
                    // strips characters, so matching it against a root-keyed
                    // lexicon is coincidence: Gen 14:16's 𐤉𐤔𐤁 carries
                    // prefix_marker=3ms_prefix_(he/it), so its root is 𐤔𐤅𐤁 shuv
                    // (H7725) — but 𐤉𐤔𐤁 is also the root of H3427 yashab, and
                    // `"𐤉𐤔𐤁": "inhabit/dwell"` matched the surface, printing
                    // yashab's gloss under an H7725 badge. Same chain as the
                    // bake, so the two paths cannot disagree.
                    lexicon[trueRoot]         ||   // the Strong's root
                    lexicon[rootPlene]        ||   // matres-collapsed root
                    lexicon[displayRoot]      ||
                    // curated HEB-edition lexicon — the bake reads it, so this
                    // path must too or the same word reads differently depending
                    // on whether the index or the parser served the chapter
                    hebExtra[trueRoot] || hebExtra[displayRoot] ||
                    // PLACEHOLDER = THE ROOT'S OWN PALEO, unbracketed. Nothing
                    // curated covers this word yet. An EMPTY gloss reads as "this
                    // word was ignored"; the root letters read as "no entry yet,
                    // and here is the form to add" — and the root is not always
                    // recoverable by eye from the surface, which carries prefixes
                    // and suffixes (𐤄𐤀𐤋𐤄𐤉𐤌 -> 𐤀𐤋𐤄𐤉𐤌). The old `[root]` was the
                    // right instinct with fake-gloss brackets around it.
                    trueRoot || displayRoot || originalRawPaleo || '';
            }

            // (Removed: hardcoded 𐤀𐤋𐤄𐤉𐤌 → "god" fallback. The gloss now comes
            // purely from the Strong's-keyed homograph lookup and the lexicon —
            // add H430 → "god" there if it isn't already, so no code special-case
            // is needed for this or any other word.)

            // ROOT COMPONENT — the true root "shines through": its `paleo` is the
            // resolved trueRoot, not the collapsed surface stripping (displayRoot).
            // We also carry display_root/true_root explicitly so any consumer can
            // render the true root in the root slot without re-deriving it, and
            // surface_form to keep the literal surface available for reference.
            pendingComponents.push({
                paleo: _inMaqafCompound ? displayRoot : rootDisplay,  // surface for maqaf halves
                true_root: trueRoot,        // clean dictionary lemma (grouping / lookups)
                display_root: displayRoot,  // what surface stripping produced
                surface_form: originalRawPaleo,
                trueRoot: null,             // legacy annotation field — unused now
                translit: '',
                translation: finalTranslation,
                lemmaTranslit: getTranslit(trueRoot),
                css: isStandaloneException ? 'root' : getCssClass(pos),
                token_ordinal: tokenOrdinal
            });

            // Maqaf halves render their own raw displayRoot (untrimmed) above, so
            // the baked-addition split must not also fire there — it would print
            // the same letters twice (once inside displayRoot, once as this chip).
            if (bakedModObj && !_inMaqafCompound) pendingComponents.push({...bakedModObj, token_ordinal: tokenOrdinal});

            if (vbeObj) pendingComponents.push({...vbeObj, token_ordinal: tokenOrdinal});
            // A nominal/feminine ending that the resolved root ALREADY carries is
            // part of the lexeme, not a separable modification — emitting it again
            // duplicates the letter. The noun מִשְׁמֶרֶת (lemma 𐤌𐤔𐤌𐤓𐤕, H4931) already
            // ends in the feminine 𐤕, so a separate nme=T rendered 𐤌𐤔𐤌𐤓𐤕𐤕𐤉; with
            // the suffix it must be 𐤌𐤔𐤌𐤓𐤕𐤉 (only the 𐤉 is added). This generalizes:
            // ANY ending whose letters the canonical root already ends with is
            // absorbed, while a genuine ending on a root that lacks it (e.g. a
            // feminine 𐤕 on a triliteral verb root) is still shown.
            const _endingAbsorbed = nmeObj && nmeObj.paleo &&
                                    trueRoot && trueRoot.endsWith(nmeObj.paleo);
            if (nmeObj && !_endingAbsorbed) pendingComponents.push({...nmeObj, token_ordinal: tokenOrdinal});
            if (uvfObj) pendingComponents.push({...uvfObj, token_ordinal: tokenOrdinal});
            if (prsObj) pendingComponents.push({...prsObj, token_ordinal: tokenOrdinal});

            // Hold the chip OPEN if a maqaf token follows, so the joined word renders
            // as one chip with a dash (Malakay-Tzadaq) instead of two separate chips.
            const _nextIsMaqaf = (index + 1 < lines.length) &&
                                 ((lines[index + 1].split('\t')[2] || '').includes('\u05BE'));
            if (!_nextIsMaqaf) flushWordBlock();
        }
    });

    flushWordBlock();
    return output;
}

// --- Adapter: DB rows -> pipe-delimited lines parseHebrewData already understands ---
function rowsToLines(rows) {
    // Use TAB as outer field separator — morph uses | internally so pipe would corrupt field[5]
    // Format: verse\ttoken_ordinal\tword_raw\tpos\tmorph\tstrongs
    return rows.map(row =>
        [row.verse, row.token_ordinal, row.word_raw || '', row.pos || '', row.morph || '', row.strongs || ''].join('\t')
    ).join('\n');
}

// --- Load lexicon fresh from disk (called on every request so edits are instant) ---
// ── LEXICON CACHE — loaded once at startup ────────────────────────────────
let _lexiconCache = null;
// ── UNCURATED GLOSS POLICY ──────────────────────────────────────────────────
// Curated = the user's own files (homographs.json, lexicon.json,
// hebrew-extra-lexicon.json). The bake may also carry Strong's kjv_def, labelled
// gloss_src:'kjv'. Default is to HIDE that and render the word as bare paleo:
// an uncurated gloss looks exactly as authoritative as a curated one on screen,
// which makes the curation frontier invisible. Because provenance is baked per
// component, this is a render-time switch — flipping it needs no rebuild.
//   PALEO_SHOW_UNCURATED=1   env, server-wide
//   /api/tokens?glosses=all  per request, for spot-checking what Strong's says
const SHOW_UNCURATED_DEFAULT = process.env.PALEO_SHOW_UNCURATED === '1';
const wantsUncurated = q => (q === 'all' || q === '1' ? true
                           : q === 'curated' || q === '0' ? false
                           : SHOW_UNCURATED_DEFAULT);

function loadLexicons() {
    if (_lexiconCache) return _lexiconCache;
    const lexiconPath   = path.join(__dirname, 'lexicon', 'lexicon.json');
    const homographPath = path.join(__dirname, 'lexicon', 'homographs.json');
    // Surface-level SN overrides. When a word_raw is contradicted by its DB SN
    // (e.g. 𐤍𐤐𐤔𐤕𐤌 tagged H3878=Levi when it's H5315=nephesh), this file
    // pins the correct SN. Generated by scripts/audit-sn-consistency.cjs and
    // curated by the human.
    const overridePath  = path.join(__dirname, 'lexicon', 'surface-strongs-overrides.json');
    // Location-keyed Strong's # overrides. Unlike surfaceOverrides above (keyed
    // by bare surface string, fills-blanks-only, applies to EVERY occurrence of
    // that spelling), this is keyed by the exact occurrence — book:chapter:
    // verse:token_ordinal — so it can REPLACE an existing SN, and only at that
    // one token. This is what makes it possible for the same spelling to carry
    // different Strong's #s in different verses (a real homograph split, e.g.
    // OT 𐤉𐤁𐤍𐤀𐤋 "Yabneel" the place vs. this app's NT reuse of the same
    // spelling for "Son"), which a surface-keyed override structurally cannot
    // express. See applyLocOverride* below for where this gets applied.
    const locOverridePath = path.join(__dirname, 'lexicon', 'strongs-location-overrides.json');
    // hebrew-extra-lexicon.json is CURATED (it shipped blank; every populated
    // entry was typed by the user). The bake consulted it and this server did
    // not, so a live-parsed chapter silently lost those glosses. Same file, same
    // answer, both paths.
    const hebExtraPath  = path.join(__dirname, 'lexicon', 'hebrew-extra-lexicon.json');
    const lexicon    = fs.existsSync(lexiconPath)    ? JSON.parse(fs.readFileSync(lexiconPath,    'utf8')) : {};
    const homographs = fs.existsSync(homographPath)  ? JSON.parse(fs.readFileSync(homographPath,  'utf8')) : {};
    const hebExtra   = fs.existsSync(hebExtraPath)   ? JSON.parse(fs.readFileSync(hebExtraPath,   'utf8')) : {};
    let surfaceOverrides = {};
    if (fs.existsSync(overridePath)) {
        try {
            const raw = JSON.parse(fs.readFileSync(overridePath, 'utf8'));
            // Strip metadata keys (_comment, _review). Only top-level
            // word_raw → SN mappings are active overrides.
            for (const [k, v] of Object.entries(raw)) {
                if (k.startsWith('_')) continue;
                if (typeof v === 'string' && v.startsWith('H')) {
                    surfaceOverrides[k] = v;
                }
            }
        } catch (e) {
            console.warn(`[surface-overrides] Failed to parse ${overridePath}: ${e.message}`);
        }
    }
    let locationOverrides = {};
    if (fs.existsSync(locOverridePath)) {
        try {
            const raw = JSON.parse(fs.readFileSync(locOverridePath, 'utf8'));
            for (const [k, v] of Object.entries(raw)) {
                if (k.startsWith('_')) continue;
                // key = "book_id:chapter:verse:token_ordinal", value = { strongs, word_raw, note }
                if (v && typeof v === 'object' && typeof v.strongs === 'string' && v.strongs) {
                    locationOverrides[k] = v;
                }
            }
        } catch (e) {
            console.warn(`[location-overrides] Failed to parse ${locOverridePath}: ${e.message}`);
        }
    }
    _lexiconCache = { lexicon, homographs, hebExtra, surfaceOverrides, locationOverrides };
    return _lexiconCache;
}

// ── HOT RELOAD — watch lexicon files and rebuild indexes automatically ────
// Debounced so rapid successive saves (e.g. editor auto-save) only trigger once.
let _rebuildTimer = null;
let _rebuildInProgress = false;
let _lastRebuildAt = null;

function scheduleRebuild(changedFile) {
    if (_rebuildTimer) clearTimeout(_rebuildTimer);
    _rebuildTimer = setTimeout(() => {
        if (_rebuildInProgress) {
            // Already rebuilding — reschedule for after it finishes
            scheduleRebuild(changedFile);
            return;
        }
        console.log(`[hot-reload] ${path.basename(changedFile)} changed — rebuilding indexes...`);
        _rebuildInProgress = true;
        _lexiconCache = null;          // bust the cache so loadLexicons re-reads from disk
        _translitGlossIndex = null;    // bust the English-baseline live-gloss reverse index too
        _rootNavIndex = null;
        _surfNavIndex = null;
        _rootByValue  = null;
        _surfByValue  = null;
        _rootBySN     = null;
        try {
            buildNavIndexes();
            _lastRebuildAt = new Date();
            console.log(`[hot-reload] Done. ${_rootNavIndex.length} roots, ${_surfNavIndex.length} surfaces.`);
        } catch (err) {
            console.error('[hot-reload] Rebuild failed:', err.message);
        } finally {
            _rebuildInProgress = false;
        }
    }, 300); // 300 ms debounce
}

// Watch both lexicon files
const LEXICON_DIR = path.join(__dirname, 'lexicon');
['lexicon.json', 'homographs.json', 'surface-strongs-overrides.json', 'strongs-location-overrides.json'].forEach(file => {
    const filePath = path.join(LEXICON_DIR, file);
    if (fs.existsSync(filePath)) {
        fs.watch(filePath, (eventType) => {
            if (eventType === 'change') scheduleRebuild(filePath);
        });
        console.log(`[hot-reload] Watching ${file}`);
    }
});

// ── LOCATION-KEYED STRONG'S OVERRIDES — helpers ─────────────────────────────
// One occurrence, identified by book_id:chapter:verse:token_ordinal, can carry
// a different Strong's # than the corpus/bake assigned it. Applied at every
// choke point that reads a token's strongs value for display or for search/
// root grouping, so a split (e.g. H2995 → H2995a for one specific verse)
// shows up consistently everywhere: the reader, the Root/Surface Explorer,
// and root-based search expansion.
function locOverrideKey(book_id, chapter, verse, token_ordinal) {
    return `${book_id}:${chapter}:${verse}:${token_ordinal}`;
}

// For tokens_bhs-shaped raw rows (token_ordinal, strongs, ...) that don't
// necessarily carry their own book_id/chapter/verse — pass whichever of those
// aren't present on the row itself as fixed params. Mutates rows in place.
function applyLocOverridesToRawRows(rows, locationOverrides, book_id, chapter, verse) {
    if (!locationOverrides || !Object.keys(locationOverrides).length) return rows;
    for (const r of rows) {
        const bk = book_id != null ? book_id : r.book_id;
        const ch = chapter  != null ? chapter  : r.chapter;
        const vs = verse    != null ? verse    : r.verse;
        const ov = locationOverrides[locOverrideKey(bk, ch, vs, r.token_ordinal)];
        if (ov && ov.strongs) r.strongs = ov.strongs;
    }
    return rows;
}

// For surface_occurrences-shaped rows (the /api/tokens fast path) — these
// additionally carry a `components` JSON string whose ROOT component has its
// own `sn` field that the reader badge and the live re-gloss pass both read
// (see groupSurfaceTokens' reGlossOne). A plain row.strongs patch alone would
// leave the visible badge and gloss lookup untouched, so patch both.
function applyLocOverrideToSurfRow(row, locationOverrides, book_id, chapter) {
    if (!locationOverrides || !Object.keys(locationOverrides).length) return row;
    const ov = locationOverrides[locOverrideKey(book_id, chapter, row.verse, row.token_ordinal)];
    if (!ov || !ov.strongs) return row;
    row.strongs = ov.strongs;
    if (row.components) {
        try {
            const comps = JSON.parse(row.components);
            if (Array.isArray(comps) && comps.length) {
                const rootIdx = comps.findIndex(c => c && c.css === 'root');
                const idx = rootIdx >= 0 ? rootIdx : comps.length - 1;
                const root = comps[idx];
                if (root) {
                    if (Array.isArray(ov.parts) && ov.parts.length) {
                        // A genuine compound: two (or more) real, independently-
                        // meaningful roots fused into one written word — a Ben-X/
                        // X-el theophoric name is two morphemes, not one blended
                        // lexeme, so it gets one 'root' component PER part rather
                        // than a single component carrying a joined SN string.
                        // Each part rides the existing per-component rendering
                        // (badge, live re-gloss lookup by paleo+sn) unchanged.
                        // p.css lets a part declare its grammatical role —
                        // 'mod-cstr' for a construct-state noun standing in
                        // front of another noun ("Ben-Elohim" = son OF God:
                        // Elohim is the head, Ben modifies it, same shape as
                        // any other prefix+root word), 'mod-art'/'mod-prep' for
                        // a fused article/preposition — defaulting to 'root' for
                        // a plain two-independent-roots compound. Brackets are
                        // NOT added here: computeWordParts (WordBlock.jsx)
                        // already routes anything whose css isn't 'root' into
                        // the bracketed modifier group and wraps it in real `[`/
                        // `]` HTML spans — adding literal brackets to the string
                        // here would just get stripped back out by its
                        // `.replace(/[\[\]]/g,'')` and re-added, so passing the
                        // bare gloss through unchanged is correct, not lazy.
                        const builtParts = ov.parts.filter(p => p && p.paleo).map(p => ({
                            ...root,
                            paleo: p.paleo,
                            sn: String(p.strongs || '').replace(/^H+/i, ''),
                            css: p.css || 'root',
                            translit: '',
                            translation: p.gloss || root.translation,
                            // trueRoot/lemmaTranslit describe the ORIGINAL fused
                            // word (e.g. "Banaal", the whole pre-split surface) —
                            // spread in via ...root, they leaked onto EVERY part,
                            // so the head noun's gloss showed a stale, dash-less
                            // "Banaal →" hint that no longer matches this part's
                            // own (correctly dashed) transliteration. Each part's
                            // spelling+gloss is now fully explicit via p.paleo/
                            // p.gloss, so the hint is both redundant and wrong —
                            // drop it rather than let it disagree with the title.
                            trueRoot: undefined,
                            lemmaTranslit: undefined,
                        }));
                        // MAQAF-JOIN after any 'mod-cstr' part, and between two
                        // consecutive 'root' parts — not before/after a plain
                        // grammatical part (article/preposition). Without this,
                        // transliterateBlock (below) sees all parts as ONE
                        // unbroken segment and concatenates their transliterations
                        // with no separator (𐤁𐤍 + 𐤀𐤋 → "BanAl") — wrong on two
                        // counts: it reads as a single lexeme, not two morphemes,
                        // and it hides exactly the distinction this override
                        // exists to make visible. A dash belongs between two
                        // WORDS — 'mod-cstr' marks a construct-state noun that IS
                        // an independent word ("son OF ___"), so it gets a dash
                        // before whatever follows it (Ben-Elohim, Ben-HaElohim).
                        // A plain grammatical prefix ('mod-art'/'mod-prep') does
                        // NOT get its own dash ("Le-Ben" would be wrong — "the-Ben"
                        // reads as one prefixed word, same as anywhere else in the
                        // app), so "Ha" stays fused onto what follows it.
                        //
                        // Deliberately NOT setting isMaqaf (only isMark + css:
                        // 'maqaf') — isMaqaf is WordBlock.jsx's trigger for the
                        // full maqaf-CHIP layout (Malakay-Tzadaq: two independent
                        // side-by-side WordBlocks, each with its own title/gloss/
                        // badge). That flat two-block look is exactly what got
                        // rejected for this compound ("I dont want sidebyside grey
                        // words") in favor of ONE block whose gloss shows the head
                        // noun with a bracketed, colored construct modifier. A
                        // plain isMark component still renders as a visible dash
                        // character on the glyph + translit lines (computeWordParts'
                        // generic isMark branch) without forking the layout.
                        const newParts = [];
                        builtParts.forEach((p, i) => {
                            const prev = builtParts[i - 1];
                            const joins = prev && (prev.css === 'mod-cstr' || (prev.css === 'root' && p.css === 'root'));
                            if (i > 0 && joins) newParts.push({
                                paleo: '־', translit: '-', translation: '',
                                css: 'maqaf', isMark: true,
                            });
                            newParts.push(p);
                        });
                        if (newParts.length) comps.splice(idx, 1, ...newParts);
                    } else {
                        root.sn = String(ov.strongs).replace(/^H+/i, '');
                        // build-surface-index.js's baked `paleo` is deliberately NOT
                        // always the literal corpus word_raw — for a real elided root
                        // (I-nun/I-yod verbs etc.) it restores the FULL canonical
                        // spelling from strongs-roots.json[oldSN], on purpose (see its
                        // "ADDITIVE-ONLY RULE" section). That's correct when the old
                        // SN really is this word's root. It's exactly WRONG when the
                        // old SN was a mistagged/reused number (a homograph
                        // collision) — the "canonical restoration" then paints on
                        // letters (e.g. a leading Yod) that were never in this
                        // occurrence's text at all. An override existing at all
                        // means "the old SN doesn't apply here", so canonical-root
                        // restoration from it shouldn't either — fall back to the
                        // literal corpus spelling, which the admin editor captured
                        // as ov.word_raw when the override was created.
                        if (ov.word_raw) root.paleo = ov.word_raw;
                    }
                    try { transliterateBlock(comps); } catch { /* keep baked translit if this fails */ }
                    row.components = JSON.stringify(comps);
                }
            }
        } catch { /* malformed baked components — leave row.strongs patched, skip the badge */ }
    }
    return row;
}

// True if `strongsValue` names `wantSN` — either directly, or as one atomic
// half of a compound tag ("H1121＋H410", two real independently-meaningful
// roots fused into one written word — a Ben-X/X-el theophoric name). A plain
// string-equality check would miss the second half of any compound override.
function _strongsHasAtomic(strongsValue, wantSN) {
    const want = navNormSN(wantSN);
    return String(strongsValue || '').split('＋').map(navNormSN).includes(want);
}

// Reverse lookup: every override entry that targets a given Strong's # (used
// to pull in occurrences a raw "WHERE strongs=?" query can never find on its
// own, since a synthetic SN like H2995a — or either half of a compound like
// H1121＋H410 — never appears as a real column value).
function locOverridesTargeting(locationOverrides, sn) {
    const out = [];
    for (const [key, ov] of Object.entries(locationOverrides || {})) {
        if (!ov || !ov.strongs || !_strongsHasAtomic(ov.strongs, sn)) continue;
        const [book_id, chapter, verse, token_ordinal] = key.split(':').map(Number);
        out.push({ book_id, chapter, verse, token_ordinal, word_raw: ov.word_raw || '' });
    }
    return out;
}

// ── NAV INDEX — built once at startup, O(1) prev/next lookups ─────────────
//
// Strategy for canonical root resolution:
//   For each Strong's number, the canonical root is the SHORTEST surface form
//   that appears in the DB with that strongs value (after stripping any single-
//   character grammar prefixes).  This avoids mis-identifying prefixed forms
//   like 𐤔𐤓𐤉 (Sharay — a surface of H26 Abagayal that happens to be short)
//   as the root.  We also run navParsedRoot on the shortest candidate and keep
//   whichever of {shortest surface, parsed root} is shorter.
//
// For surfaces the key IS the raw word_raw — no parsing needed.

let _rootNavIndex   = null;   // sorted array of { root, paleo, sn, strongs, count }
let _surfNavIndex   = null;   // sorted array of { surface, paleo, root, sn, count, by_book }
let _rootByValue    = null;   // Map<root  → index in _rootNavIndex>
let _surfByValue    = null;   // Map<surface → index in _surfNavIndex>
let _rootBySN       = null;   // Map<'H26' → index in _rootNavIndex>
let _wordBySn       = null;   // Map<'H776' → [indices in _surfNavIndex]> (root's surface forms)

// Proclitic prefixes (conjunction/article/inseparable prepositions) that fold
// onto the following content morpheme when reconstructing orthographic words.
// Declared here (not beside foldRowsToWords) because buildNavIndexes() runs at
// module load, before that later block's `const`s would initialize.
const WORD_FOLD_POS = new Set(['conj', 'prep', 'art']);
const _paleoOnly = s => String(s || '').replace(/[^\u{10900}-\u{10915}]/gu, '');

// Disk cache for the nav indexes.  buildNavIndexes() is expensive (~1 second
// at startup because it re-parses 24,253 surfaces).  But its inputs only
// change when surface-index.db or the lexicon JSONs are rebuilt.  Cache the
// output JSON on disk, keyed by an mtime stamp of the inputs; skip the
// rebuild if the cache is current.
const NAV_CACHE_PATH = path.join(__dirname, 'nav-index.cache.json');

function _navCacheStamp() {
    // Compose a versioning stamp from a build-logic version tag + the mtimes of
    // every input file. Bump NAV_BUILD_VERSION whenever buildNavIndexes' logic
    // changes (not just its inputs), so a stale on-disk cache can't shadow it.
    // BUMPED for the HEB merge: an on-disk cache written by the OT-only build
    // would otherwise shadow it and the roots page would look unchanged.
    const NAV_BUILD_VERSION = 'wordsurf-v4-heb';   // roots by Strong's #, word-level surfaces, both editions
    const inputs = [
        path.join(__dirname, 'corpus.db'),             // tokens_bhs — the text the index is built from
        path.join(__dirname, 'surface-index.db'),      // the HEB half of the nav index
        path.join(__dirname, 'lexicon', 'lexicon.json'),
        path.join(__dirname, 'lexicon', 'homographs.json'),
        path.join(__dirname, 'lexicon', 'strongs-roots.json'),
        path.join(__dirname, 'lexicon', 'surface-strongs-overrides.json'),
        path.join(__dirname, 'lexicon', 'strongs-location-overrides.json'),
    ];
    return NAV_BUILD_VERSION + '|' + inputs.map(p => {
        try { return `${path.basename(p)}=${fs.statSync(p).mtimeMs}`; }
        catch { return `${path.basename(p)}=0`; }
    }).join('|');
}

function _loadNavCache() {
    if (!fs.existsSync(NAV_CACHE_PATH)) return null;
    try {
        const data = JSON.parse(fs.readFileSync(NAV_CACHE_PATH, 'utf8'));
        if (data.stamp !== _navCacheStamp()) return null;   // stale
        return data;
    } catch { return null; }
}

function _saveNavCache() {
    try {
        const payload = {
            stamp: _navCacheStamp(),
            root: _rootNavIndex,
            surf: _surfNavIndex,
        };
        // Write atomically so a crashed write can't leave a half-file
        const tmp = NAV_CACHE_PATH + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(payload));
        fs.renameSync(tmp, NAV_CACHE_PATH);
    } catch (e) {
        console.warn('[nav-cache] save failed (will rebuild next time):', e.message);
    }
}

// ── THE HEB EDITION IN THE CORPUS-WIDE INDEXES ──────────────────────────────
// The nav indexes (roots + surfaces — i.e. /roots and /surfaces) were built from
// tokens_bhs ALONE. So a word could occur all through the NT and the roots page
// would still report OT-only totals: click 𐤌𐤔𐤉𐤇 in Revelation 1:1, land on
// "H4899 Mashayach — 39 occurrences", and find no Revelation in the breakdown.
//
// The HEB half is read from surface-index.db, NOT from tokens_nt:
//   • its Strong's numbers are the ones the reader actually renders (tokens_nt
//     disagrees with them on ~2 in 3 NT tokens, and is the loser of that
//     disagreement wherever it has been checked by hand)
//   • its rows are already WHOLE WORDS, so none of foldRowsToWords' proclitic
//     folding is needed — that logic exists to reassemble BHS morphemes
//   • it carries `source`, so attested and inferred remain distinguishable
//
// ONLY books BHS does not cover. After `build-heb-index.mjs --ot` both editions
// hold the same OT verses, and counting both would double every OT number —
// which is the exact statistic-corruption the two tables were kept apart to
// prevent. Derived from the index itself, so it needs no OT/NT branch: whatever
// BHS covers is BHS's, the remainder is HEB's.
let _navHebBooks = null;
function navHebBooks() {
    if (_navHebBooks) return _navHebBooks;
    _navHebBooks = new Set();
    if (SURF_HAS_SOURCE) {
        const bhs = SURF_SOURCE_BOOKS.get('BHS');
        const heb = SURF_SOURCE_BOOKS.get('HEB');
        if (heb) for (const b of heb) if (!bhs || !bhs.has(b)) _navHebBooks.add(b);
    }
    return _navHebBooks;
}

function _hebBookPlaceholders() {
    return [...navHebBooks()].map(() => '?').join(',');
}

// Streamed, not .all() — the HEB half is ~390k rows and the nav build only ever
// needs one pass over it.
function hebNavIterate() {
    const books = [...navHebBooks()];
    if (surfDb._isNull || !books.length) return [];
    // chapter/verse/token_ordinal added (beyond the original book_id/word_raw/
    // strongs) so buildNavIndexes can apply location-keyed Strong's overrides
    // per exact occurrence before folding into the root/surface nav indexes —
    // without them a location override couldn't tell one occurrence of a
    // spelling from another here.
    return surfDb.prepare(`
        SELECT o.book_id, o.chapter, o.verse, o.token_ordinal, o.word_raw, t.strongs
        FROM   surface_occurrences o
        JOIN   token_surfaces      t ON t.word_raw = o.word_raw ${OCC_SN_JOIN} ${SRC_JOIN}
        WHERE  o.source = 'HEB' AND o.book_id IN (${_hebBookPlaceholders()})
    `).iterate(...books);
}

// Per-Strong's occurrence lookup for the verse lists. Queried on demand rather
// than cached: token_surfaces(strongs) is indexed, and holding 390k rows in
// memory to save a few ms is not a trade worth making.
let _hebOccStmt = null;
function hebOccForSN(sn, book = null) {
    const books = [...navHebBooks()];
    if (surfDb._isNull || !books.length || !sn) return [];
    if (!_hebOccStmt) {
        _hebOccStmt = surfDb.prepare(`
            SELECT o.book_id, o.chapter, o.verse, o.token_ordinal, o.word_raw
            FROM   surface_occurrences o
            JOIN   token_surfaces      t ON t.word_raw = o.word_raw ${OCC_SN_JOIN} ${SRC_JOIN}
            WHERE  o.source = 'HEB' AND o.book_id IN (${_hebBookPlaceholders()})
              AND  ('H' || REPLACE(t.strongs, 'H', '')) = ?
            ORDER BY o.book_id, o.chapter, o.verse, o.token_ordinal
        `);
    }
    let rows = _hebOccStmt.all(...books, navNormSN(sn));
    // Reconcile with location overrides: a raw "WHERE strongs=?" query only
    // ever finds what the DB itself tags, so (a) drop any row whose exact
    // location has been overridden AWAY from the requested sn, and (b) pull
    // in any location overridden TO this sn that the DB tags differently (or
    // that's a synthetic SN the DB never contains at all, e.g. H2995a).
    const { locationOverrides } = loadLexicons();
    if (locationOverrides && Object.keys(locationOverrides).length) {
        const wantSN = navNormSN(sn);
        rows = rows.filter(r => {
            const ov = locationOverrides[locOverrideKey(r.book_id, r.chapter, r.verse, r.token_ordinal)];
            return !ov || _strongsHasAtomic(ov.strongs, wantSN);
        });
        const existing = new Set(rows.map(r => locOverrideKey(r.book_id, r.chapter, r.verse, r.token_ordinal)));
        for (const add of locOverridesTargeting(locationOverrides, wantSN)) {
            if (!books.includes(add.book_id)) continue; // only HEB-covered books belong in this list
            const key = locOverrideKey(add.book_id, add.chapter, add.verse, add.token_ordinal);
            if (existing.has(key)) continue;
            rows.push(add);
        }
        rows.sort((a, b) => a.book_id - b.book_id || a.chapter - b.chapter || a.verse - b.verse || a.token_ordinal - b.token_ordinal);
    }
    return book != null ? rows.filter(r => r.book_id === book) : rows;
}

function buildNavIndexes() {
    // Try the disk cache first — saves ~1 second of startup time when nothing
    // has changed since the last build.
    const cached = _loadNavCache();
    if (cached) {
        _rootNavIndex = cached.root;
        _surfNavIndex = cached.surf;
        _rootByValue  = new Map(_rootNavIndex.map((e, i) => [e.root, i]));
        _surfByValue  = new Map(_surfNavIndex.map((e, i) => [e.surface, i]));
        _rootBySN     = new Map(_rootNavIndex.flatMap((e, i) =>
            (e.strongs || []).map(sn => [sn, i])));
        _wordBySn     = new Map();
        _surfNavIndex.forEach((e, idx) => {
            if (!_wordBySn.has(e.sn)) _wordBySn.set(e.sn, []);
            _wordBySn.get(e.sn).push(idx);
        });
        console.log(`[nav-cache] hit: ${_rootNavIndex.length} roots, ${_surfNavIndex.length} surfaces (saved ~1s)`);
        return;
    }
    return _buildNavIndexesUncached();
}

function _buildNavIndexesUncached() {
    const { lexicon, homographs, surfaceOverrides, locationOverrides } = loadLexicons();

    // ── 1. ROOTS = STRONG'S NUMBERS (BibleHub model) ──────────────────────────
    // Every distinct Strong's number in the text is its own root entry, exactly
    // like BibleHub's /hebrew/<N>.htm. No morphological parsing, no "canonical
    // root" bucketing that can drop or misroute a number — clicking H8064 always
    // lands on H8064. Compound tags (e.g. "H1237＋H206") are split into their
    // atomic numbers so each is reachable. Only grammar/virtual codes (H9000+)
    // are excluded (they aren't lexical roots). The Paleo form shown/sorted is
    // the canonical lemma (strongs-roots.json) when known, else the word's most
    // common surface — purely for display/ordering; identity is the number.
    const snRows = db.prepare(`
        SELECT strongs, word_raw, COUNT(*) AS cnt
        FROM tokens_bhs
        WHERE strongs IS NOT NULL AND strongs != ''
          AND word_raw IS NOT NULL AND word_raw != ''
        GROUP BY strongs, word_raw
    `).all();

    const bySn = new Map();  // 'H8064' → { sn, count, bestSurface, bestCnt }
    for (const r of snRows) {
        const atomics = String(r.strongs).split('＋').map(navNormSN).filter(s => s && s !== 'H');
        for (const sn of atomics) {
            const snNum = parseInt(sn.replace(/\D/g, ''), 10) || 0;
            if (snNum >= 9000 || snNum === 0) continue;     // skip grammar/virtual codes
            let e = bySn.get(sn);
            if (!e) { e = { sn, count: 0, bestSurface: r.word_raw, bestCnt: -1 }; bySn.set(sn, e); }
            e.count += r.cnt || 0;
            if ((r.cnt || 0) > e.bestCnt) { e.bestCnt = r.cnt || 0; e.bestSurface = r.word_raw; }
        }
    }

    // ── HEB EDITION, SAME MAPS ──────────────────────────────────────────────
    // One streamed pass fills the root counts here and stages the surface counts
    // for the section below, so the whole-corpus numbers come from one read.
    const hebSurf = new Map();   // surface -> {surface, count, byBook, snCnt}
    let hebSeen = 0;
    for (const r of hebNavIterate()) {
        hebSeen++;
        const locOv = locationOverrides[locOverrideKey(r.book_id, r.chapter, r.verse, r.token_ordinal)];
        if (locOv && locOv.strongs) r.strongs = locOv.strongs;
        // Compound tags ("H1121＋H410" — two real, independently-meaningful
        // roots fused into one written word, e.g. a Ben-X/X-el theophoric
        // name) credit EVERY atomic number, same as the BHS-side snRows loop
        // just above. Previously only the FIRST atomic was ever indexed here,
        // so the second half of any HEB compound tag was invisible to the
        // Root Explorer and root-based search no matter how it got tagged —
        // not just for location overrides, a latent gap for any compound-
        // tagged HEB word.
        const atomics = String(r.strongs || '').split('＋').map(navNormSN).filter(s => s && s !== 'H');
        const usableAtomics = atomics.filter(sn => {
            const n = parseInt(String(sn).replace(/\D/g, ''), 10) || 0;
            return n > 0 && n < 9000;
        });
        for (const sn of usableAtomics) {
            let e = bySn.get(sn);
            // A Strong's seen ONLY in the NT gets its display form from the HEB
            // spelling; one already seen in the OT keeps the OT form, since
            // getCanonicalRoot prefers strongs-roots.json anyway and the OT
            // spelling is the attested one.
            if (!e) { e = { sn, count: 0, bestSurface: r.word_raw, bestCnt: -1 }; bySn.set(sn, e); }
            e.count += 1;
        }

        const surface = _paleoOnly(r.word_raw);
        if (!surface) continue;
        let se = hebSurf.get(surface);
        if (!se) { se = { surface, count: 0, byBook: new Map(), snCnt: new Map() }; hebSurf.set(surface, se); }
        se.count++;
        se.byBook.set(r.book_id, (se.byBook.get(r.book_id) || 0) + 1);
        for (const sn of usableAtomics) se.snCnt.set(sn, (se.snCnt.get(sn) || 0) + 1);
    }

    // Guarantee every location-override target resolves as a root, even a
    // brand-new synthetic SN (e.g. H2995a) that never appears as a real DB
    // column value and so wouldn't otherwise earn a bySn entry from either
    // loop above. Doesn't try to reconcile counts precisely (the old SN's
    // count above still includes this occurrence) — that's a known, minor
    // display-only gap; what matters is /roots?sn=H2995a resolves at all
    // instead of 404ing, and the occurrence itself is correctly findable via
    // findWordOccurrences/hebOccForSN (fixed independently, above/below).
    for (const ov of Object.values(locationOverrides || {})) {
        if (!ov || !ov.strongs) continue;
        // Compound overrides ("H1121＋H410") need a root entry for EACH atomic
        // half, not one garbled entry for the joined string.
        for (const snRaw of String(ov.strongs).split('＋')) {
            const sn = navNormSN(snRaw);
            if (!sn || sn === 'H') continue;
            if (!bySn.has(sn)) bySn.set(sn, { sn, count: 0, bestSurface: ov.word_raw || '', bestCnt: 0 });
            const e = bySn.get(sn);
            if (e.count === 0) { e.count = 1; e.bestCnt = 1; if (!e.bestSurface) e.bestSurface = ov.word_raw || ''; }
        }
    }

    _rootNavIndex = [...bySn.values()].map(e => {
        // Canonical lemma Paleo if we have it; otherwise the commonest surface.
        const paleo = getCanonicalRoot(e.sn, e.bestSurface) || e.bestSurface || '';
        return { root: paleo, paleo, sn: e.sn, count: e.count, strongs: [e.sn] };
    }).filter(e => e.root).sort((a, b) => {
        const ka = navPaleoSortKey(a.root), kb = navPaleoSortKey(b.root);
        if (ka !== kb) return ka < kb ? -1 : 1;
        return a.sn.localeCompare(b.sn, undefined, { numeric: true });
    });

    // sn → index is total and exact (every number routes to itself).
    _rootBySN    = new Map(_rootNavIndex.map((e, i) => [e.sn, i]));
    // paleo → first index with that form (for legacy ?root=<paleo> links only).
    _rootByValue = new Map();
    _rootNavIndex.forEach((e, i) => { if (!_rootByValue.has(e.root)) _rootByValue.set(e.root, i); });


    // ── 2. SURFACES = ORTHOGRAPHIC WORDS (BibleHub model) ─────────────────────
    // Walk the whole text in reading order and fold morphemes into words. A
    // surface is the written word (proclitics included), counted once per
    // occurrence, tagged with the content morpheme's Strong's number. This is
    // what the reader shows and what a "surf" click passes, so they line up — and
    // it drops the single-letter prefix rows and the per-morpheme double-counting
    // that polluted the old morpheme-level list.
    const allRows = db.prepare(`
        SELECT book_id, chapter, verse, token_ordinal, word_raw, pos, strongs
        FROM tokens_bhs
        WHERE word_raw IS NOT NULL AND word_raw != ''
        ORDER BY book_id, chapter, verse, token_ordinal
    `).all();

    const bySurface = new Map();   // surface → { surface, count, byBook:Map, snCnt:Map }
    let i = 0;
    while (i < allRows.length) {
        const bk = allRows[i].book_id, ch = allRows[i].chapter, vs = allRows[i].verse;
        let j = i;
        const verseRows = [];
        while (j < allRows.length && allRows[j].book_id === bk && allRows[j].chapter === ch && allRows[j].verse === vs) {
            verseRows.push(allRows[j]); j++;
        }
        applyLocOverridesToRawRows(verseRows, locationOverrides, bk, ch, vs);
        for (const w of foldRowsToWords(verseRows)) {
            if (paleoCharCount(w.surface) < 1) continue;
            let e = bySurface.get(w.surface);
            if (!e) { e = { surface: w.surface, count: 0, byBook: new Map(), snCnt: new Map() }; bySurface.set(w.surface, e); }
            e.count++;
            e.byBook.set(bk, (e.byBook.get(bk) || 0) + 1);
            e.snCnt.set(w.sn, (e.snCnt.get(w.sn) || 0) + 1);
        }
        i = j;
    }

    // Merge the HEB surfaces staged above. A form occurring in BOTH editions
    // collapses into ONE entry whose by_book spans the whole corpus — which is
    // the point: 𐤄𐤌𐤔𐤉𐤇 should be one surface with Leviticus AND Revelation
    // under it, not two half-answers.
    for (const h of hebSurf.values()) {
        let e = bySurface.get(h.surface);
        if (!e) { e = { surface: h.surface, count: 0, byBook: new Map(), snCnt: new Map() }; bySurface.set(h.surface, e); }
        e.count += h.count;
        for (const [b, n] of h.byBook)  e.byBook.set(b, (e.byBook.get(b) || 0) + n);
        for (const [sn, n] of h.snCnt)  e.snCnt.set(sn, (e.snCnt.get(sn) || 0) + n);
    }
    if (hebSeen) console.log(`[nav] HEB edition: ${hebSeen.toLocaleString()} occurrences across ${navHebBooks().size} books BHS does not cover`);

    _surfNavIndex = [...bySurface.values()].map(e => {
        // Dominant Strong's number for this written form (handles homographs).
        let bestSn = '', best = -1;
        for (const [sn, c] of e.snCnt) { if (c > best) { best = c; bestSn = sn; } }
        const by_book = [...e.byBook.entries()]
            .map(([book_id, occ]) => ({ book_id, occ }))
            .sort((a, b) => b.occ - a.occ || a.book_id - b.book_id);
        return {
            surface: e.surface,
            paleo:   e.surface,
            sn:      bestSn,
            root:    getCanonicalRoot(bestSn, e.surface) || e.surface,
            count:   e.count,
            by_book,
        };
    }).sort((a, b) => {
        const ka = navPaleoSortKey(a.surface), kb = navPaleoSortKey(b.surface);
        if (ka !== kb) return ka < kb ? -1 : 1;
        return a.sn.localeCompare(b.sn, undefined, { numeric: true });
    });

    _surfByValue = new Map(_surfNavIndex.map((e, i) => [e.surface, i]));
    _wordBySn    = new Map();   // sn → [indices into _surfNavIndex] for root breakdowns
    _surfNavIndex.forEach((e, idx) => {
        if (!_wordBySn.has(e.sn)) _wordBySn.set(e.sn, []);
        _wordBySn.get(e.sn).push(idx);
    });

    console.log(`Nav indexes built: ${_rootNavIndex.length} roots, ${_surfNavIndex.length} surfaces`);
    // Persist to disk so the next process start can skip the rebuild.
    _saveNavCache();
}

// Build indexes at startup (synchronous — runs before any request is served)
// --- 3. API ROUTES ---

// GET /api/books
// Returns the list of books with their chapter ranges
app.get('/api/books', production.cache(3600), (req, res) => {
    res.json(BOOKS);
});

// == WORK TITLES =============================================================
// Human-readable names for literary works/docs. corpus.db stores a raw title
// per (corpus,code): proper for Latin (Perseus) and ~366 Greek works, but many
// are bare TLG/CTS codes. Resolution order:
//   user override (work-titles.json)  >  db title (if not a code)  >  derived
// work-titles.json maps "SRC:code" -> "Name" and hot-reloads, so you can name
// any work yourself and it shows everywhere (docs list, /works page, reader).
const WORK_TITLES_PATH = path.join(__dirname, 'work-titles.json');
let WORK_TITLES = {};
function loadWorkTitles() {
    try {
        WORK_TITLES = fs.existsSync(WORK_TITLES_PATH)
            ? JSON.parse(fs.readFileSync(WORK_TITLES_PATH, 'utf8')) : {};
        console.log(`[work-titles] ${Object.keys(WORK_TITLES).length} custom names loaded`);
    } catch (e) { console.error('[work-titles] parse error:', e.message); }
}
loadWorkTitles();
try { fs.watchFile(WORK_TITLES_PATH, { interval: 1000 }, loadWorkTitles); } catch (e) {}

// ── Custom book order ──────────────────────────────────────────
// book-order.json lets you place any canonical book anywhere in the sequence.
// Dropdown numbering, list order, and prev/next book transitions all follow it.
// Each source skips ids it does not contain. Hot-reloads.
const BOOK_ORDER_PATH = path.join(__dirname, 'book-order.json');
let BOOK_ORDER_POS = {};
let _orderedBooksCache = {};
function loadBookOrder() {
    try {
        const raw = fs.existsSync(BOOK_ORDER_PATH)
            ? JSON.parse(fs.readFileSync(BOOK_ORDER_PATH, 'utf8')) : {};
        const list = Array.isArray(raw.order) ? raw.order : [];
        const pos = {};
        list.forEach((e, i) => {
            const id = typeof e === 'number' ? e : (e && e.id);
            if (Number.isFinite(id) && pos[id] == null) pos[id] = i;
        });
        BOOK_ORDER_POS = pos;
        _orderedBooksCache = {};   // invalidate per-source ordered lists
        console.log(`[book-order] ${Object.keys(pos).length} books ordered`);
    } catch (e) { console.error('[book-order] parse error:', e.message); }
}
loadBookOrder();
try { fs.watchFile(BOOK_ORDER_PATH, { interval: 1000 }, loadBookOrder); } catch (e) {}

// ── Book sections (named ranges within one book, e.g. Book of Melchizedek's 3
// originally-separate parts combined into one continuously-chaptered book,
// added 2026-08-01) ─────────────────────────────────────────────────────────
const BOOK_SECTIONS_PATH = path.join(__dirname, 'book-sections.json');
let BOOK_SECTIONS = {};
function loadBookSections() {
    try {
        const raw = fs.existsSync(BOOK_SECTIONS_PATH)
            ? JSON.parse(fs.readFileSync(BOOK_SECTIONS_PATH, 'utf8')) : {};
        const out = {};
        for (const [k, v] of Object.entries(raw)) {
            if (k.startsWith('_') || !Array.isArray(v)) continue;
            out[k] = v.filter(e => e && Number.isFinite(e.from) && e.title)
                      .sort((a, b) => a.from - b.from);
        }
        BOOK_SECTIONS = out;
        console.log(`[book-sections] ${Object.keys(out).length} book(s) with named sections`);
    } catch (e) { console.error('[book-sections] parse error:', e.message); }
}
loadBookSections();
try { fs.watchFile(BOOK_SECTIONS_PATH, { interval: 1000 }, loadBookSections); } catch (e) {}
// GET /api/book-sections?book=<canon_id> -> { sections: [{from,title},...] }
// (empty array if this book has none — that's the normal case, opt-in feature).
// NOTE for whoever edits this: the reader UI that consumes this (Reader.jsx) is a
// Vite-built React app served as a static bundle from server/public/assets — unlike
// every other change in this file, a frontend change needs `npm run build` (from the
// paleo-studio/ root, not server/) before a server restart will actually serve it.
app.get('/api/book-sections', (req, res) => {
    const bookId = parseInt(req.query.book, 10);
    if (!Number.isFinite(bookId)) return res.status(400).json({ error: 'book (canon_id) required' });
    res.json({ sections: BOOK_SECTIONS[String(bookId)] || [] });
});
// Listed books sort by file position; unlisted books fall after in numeric id order.
function orderKey(id) {
    return BOOK_ORDER_POS[id] != null ? BOOK_ORDER_POS[id] : (10000 + id);
}
// A source's canonical book ids, sorted by the custom order (cached per source).
function orderedBooks(src) {
    if (_orderedBooksCache[src.id]) return _orderedBooksCache[src.id];
    let ids = [];
    try {
        ids = src.handle.prepare(
            'SELECT DISTINCT book_id FROM verses WHERE book_id IS NOT NULL'
        ).all().map(r => r.book_id);
    } catch (e) { ids = []; }
    ids.sort((a, b) => orderKey(a) - orderKey(b) || a - b);
    _orderedBooksCache[src.id] = ids;
    return ids;
}
// ─── GET /api/book-order ──────────────────────────────────────────────────
// The MASTER cross-language book list: every canon_id any source has, ordered
// by book-order.json, with the list of sources that contain each. Lets the UI
// show one unified dropdown for all languages and switch source when the current
// language lacks the selected book.
//   -> [ { id, sources: ['HEB','ENG',...] }, ... ]  (ordered)
// PLACEMENT: paste once, after orderedBooks() is defined (~line 2100 of server.js).
app.get('/api/book-order', production.cache(300), (req, res) => {
    const avail = {};                       // canon_id -> Set(sourceId)
    for (const src of Object.values(SOURCES)) {
        if (!src || !src.available || !src.handle) continue;
        try {
            // source views alias canon_id AS book_id; non-null = a canonical/promoted book
            const ids = src.handle
                .prepare('SELECT DISTINCT book_id FROM verses WHERE book_id IS NOT NULL')
                .all().map(r => r.book_id);
            for (const id of ids) (avail[id] = avail[id] || new Set()).add(src.id);
        } catch (e) { /* skip source */ }
    }
    const ordered = Object.keys(avail).map(Number)
        .sort((a, b) => orderKey(a) - orderKey(b) || a - b)
        .map(id => { const c = canonChapters(id); return { id, name: canonName(id), first: c.first, last: c.last, sources: [...avail[id]] }; });
    res.json(ordered);
});

// ─── Book Manager admin endpoints (added 2026-07-30) ───────────────────────
// Backs the /book-manager screen: list every promoted (canon_id-bearing) book
// plus every unpromoted Works-Library-only work, let admin drag-reorder
// book-order.json, and promote/demote works in or out of the main book
// dropdown. All routes live under /api/admin/*, so the existing ADMIN_KEY
// guard registered above (`app.use('/api/admin', guard)`) already protects
// them — no separate auth wiring needed here. When ADMIN_KEY is unset these
// are wide open, same as every other /api/admin route in this file.
let _bookMgrDb = null;
function bookMgrDb() {
    if (!_bookMgrDb) _bookMgrDb = new Database(CORPUS_DB);
    return _bookMgrDb;
}

// GET /api/admin/registry -> { promoted: [{id,name,order_index,members}], works: [{corpus,code,title,category,n_verses}] }
app.get('/api/admin/registry', (req, res) => {
    try {
        const dbh = bookMgrDb();
        const promotedRows = dbh.prepare(
            `SELECT DISTINCT canon_id AS id, corpus, code FROM verses WHERE canon_id IS NOT NULL`
        ).all();
        const promotedCodes = new Set(promotedRows.map(r => `${r.corpus}:${r.code}`));
        const byId = {};
        for (const r of promotedRows) {
            if (!byId[r.id]) byId[r.id] = { id: r.id, name: canonName(r.id), order_index: orderKey(r.id), members: [] };
            byId[r.id].members.push(`${r.corpus}:${r.code}`);
        }
        const promoted = Object.values(byId).sort((a, b) => a.order_index - b.order_index);

        const allBooks = dbh.prepare(`SELECT corpus, code, title, category, n_verses FROM books`).all();
        const works = allBooks
            .filter(b => !promotedCodes.has(`${b.corpus}:${b.code}`))
            .sort((a, b) => (a.title || '').localeCompare(b.title || ''));

        res.json({ promoted, works });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin/book-order  { order: [{id, name}, ...] } -> overwrite book-order.json's
// order array wholesale (the whole list, in the new sequence) and hot-reload it.
app.post('/api/admin/book-order', express.json({ limit: '256kb' }), (req, res) => {
    const order = req.body && req.body.order;
    if (!Array.isArray(order) || !order.every(e => e && Number.isFinite(e.id))) {
        return res.status(400).json({ error: 'body must be { order: [{id, name}, ...] }' });
    }
    try {
        let readme = 'Master book order for ALL languages.';
        try { readme = JSON.parse(fs.readFileSync(BOOK_ORDER_PATH, 'utf8'))._README || readme; } catch (e) {}
        fs.writeFileSync(BOOK_ORDER_PATH, JSON.stringify({ _README: readme, order }, null, 2));
        loadBookOrder();
        res.json({ ok: true, count: order.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin/promote  { corpus, code, canon_id, name } -> assign canon_id to every
// verse row for (corpus, code) (making it a first-class book) and append it to
// book-order.json (at the end — drag it into place afterward, or pass a full
// reordered list to /api/admin/book-order in the same request from the UI).
app.post('/api/admin/promote', express.json(), (req, res) => {
    const { corpus, code, canon_id, name } = req.body || {};
    if (!corpus || !code || !Number.isFinite(canon_id) || !name) {
        return res.status(400).json({ error: 'body must be { corpus, code, canon_id, name }' });
    }
    try {
        const dbh = bookMgrDb();
        const info = dbh.prepare('UPDATE verses SET canon_id=? WHERE corpus=? AND code=?').run(canon_id, corpus, code);
        if (info.changes === 0) return res.status(404).json({ error: `no verses found for ${corpus}:${code}` });
        let raw = { _README: '', order: [] };
        try { raw = JSON.parse(fs.readFileSync(BOOK_ORDER_PATH, 'utf8')); } catch (e) {}
        const order = Array.isArray(raw.order) ? raw.order : [];
        if (!order.some(e => e.id === canon_id)) order.push({ id: canon_id, name });
        fs.writeFileSync(BOOK_ORDER_PATH, JSON.stringify({ _README: raw._README, order }, null, 2));
        loadBookOrder();
        res.json({ ok: true, changes: info.changes });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin/demote  { canon_id } -> clear canon_id on every row that carries it
// (drops back to Works-Library-only — "don't include this book") and remove it from
// book-order.json. Never deletes any text; fully reversible with /api/admin/promote.
app.post('/api/admin/demote', express.json(), (req, res) => {
    const { canon_id } = req.body || {};
    if (!Number.isFinite(canon_id)) return res.status(400).json({ error: 'body must be { canon_id }' });
    try {
        const dbh = bookMgrDb();
        const info = dbh.prepare('UPDATE verses SET canon_id=NULL WHERE canon_id=?').run(canon_id);
        let raw = { _README: '', order: [] };
        try { raw = JSON.parse(fs.readFileSync(BOOK_ORDER_PATH, 'utf8')); } catch (e) {}
        const order = (Array.isArray(raw.order) ? raw.order : []).filter(e => e.id !== canon_id);
        fs.writeFileSync(BOOK_ORDER_PATH, JSON.stringify({ _README: raw._README, order }, null, 2));
        loadBookOrder();
        res.json({ ok: true, changes: info.changes });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


const _rawTitleCache = {};
function _rawTitles(src) {
    if (_rawTitleCache[src.id]) return _rawTitleCache[src.id];
    const m = {};
    if (src.handle && src.corpora) {
        const ph = src.corpora.map(() => '?').join(',');
        for (const r of src.handle.prepare(`SELECT code, title FROM books WHERE corpus IN (${ph})`).all(...src.corpora))
            m[r.code] = r.title;
    }
    return (_rawTitleCache[src.id] = m);
}
function _deriveTitle(code) {
    let c = String(code)
        .replace(/^urn:cts:[^:]*:/i, '')                           // drop CTS namespace prefix
        .replace(/\.[\w]+-(?:grc|lat)\d+$/i, '')                   // strip edition suffix (.1st1K-grc1, .opp-grc1, .perseus-lat2 …)
        .replace(/^LIT\d+/, '')                                    // Ge'ez BetaMasaheft id prefix
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')                    // camelCase -> spaced
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')                 // ACRONYMWord -> ACRONYM Word
        .replace(/\s+/g, ' ').trim();
    return c || String(code);
}
const _CODEISH = /1st1K|perseus|^urn:|^tlg\d|^phi\d|^stoa|^ggm|^ogl|^LIT\d/i;
function resolveWorkTitle(src, code) {
    if (!code) return code;
    const ov = WORK_TITLES[`${src.id}:${code}`] || WORK_TITLES[code];
    if (ov) return ov;
    const raw = _rawTitles(src)[code];
    if (raw && raw !== code && !_CODEISH.test(raw)) return raw;
    return _deriveTitle(code);
}

// ─── Canonical book naming for ALL ids (incl. promoted works) ──────────────
// BOOK_NAMES covers 1–66. Promoted works — deuterocanon / pseudepigrapha that
// were given a canon_id ≥ 67 (e.g. Psalm 151 = 141) — carry their real title in
// the books table, so canonName() resolves any id via BOOK_NAMES → the same
// work-title machinery the readers use → "Book N" only as a last resort.
// canonChapters() reports each book's chapter span across every corpus so the
// unified dropdown can drive real chapter navigation for the promoted books too.
// Both share one lazily-built map (built after DBs are open, on first call).
let _canonMeta = null;
function _srcForCorpus(c) {
    return Object.values(SOURCES).find(s => s && s.corpora && s.corpora.includes(c));
}
function buildCanonMeta() {
    const names = {}, chap = {};
    try {
        for (const r of db.prepare(
            `SELECT canon_id AS id, MIN(ord_c) AS f, MAX(ord_c) AS l
               FROM verses WHERE canon_id IS NOT NULL GROUP BY canon_id`).all())
            chap[r.id] = { first: r.f || 1, last: r.l || 1 };
    } catch (e) { /* chapters fall back to 1 */ }
    try {
        const byId = {};
        for (const r of db.prepare(
            `SELECT canon_id AS id, corpus, code, COUNT(*) AS n
               FROM verses WHERE canon_id IS NOT NULL AND code IS NOT NULL
               GROUP BY canon_id, corpus, code`).all())
            (byId[r.id] ||= []).push(r);
        for (const [id, list] of Object.entries(byId)) {
            if (BOOK_NAMES[id]) continue;
            list.sort((a, b) => b.n - a.n);          // prefer the corpus that carries it most
            for (const r of list) {
                const src = _srcForCorpus(r.corpus);
                const t = src ? resolveWorkTitle(src, r.code) : _deriveTitle(r.code);
                if (t && !/^Book\s+\d+$/i.test(String(t)) && !_CODEISH.test(String(t))) { names[id] = t; break; }
            }
        }
    } catch (e) { console.error('[canon-meta]', e.message); }
    return { names, chap };
}
function _ensureCanonMeta() { if (!_canonMeta) _canonMeta = buildCanonMeta(); return _canonMeta; }
function canonName(id)     { return BOOK_NAMES[id] || _ensureCanonMeta().names[id] || `Book ${id}`; }
function canonChapters(id) { return _ensureCanonMeta().chap[id] || { first: 1, last: 1 }; }

// GET /api/works  -> every literary work/doc across all sources, with resolved
// titles. Powers the dedicated Works page (filterable library).
app.get('/api/works', production.cache(300), (req, res) => {
    const out = [];
    for (const src of Object.values(SOURCES)) {
        if (!src.available || !src.handle || !src.corpora) continue;
        let rows = [];
        try {
            rows = src.handle.prepare(`
                SELECT doc_id, book_id,
                       COUNT(DISTINCT chapter) AS chapters,
                       COUNT(*) AS verses,
                       MIN(chapter) AS first_chapter
                FROM verses
                WHERE doc_id IS NOT NULL AND doc_id != ''
                GROUP BY doc_id, book_id
            `).all();
        } catch (e) { continue; }
        // category lives on the base table (not the scoped view), keyed by code
        const cat = {};
        try {
            const ph = src.corpora.map(() => '?').join(',');
            for (const r of src.handle.prepare(`SELECT code, category FROM books WHERE corpus IN (${ph})`).all(...src.corpora))
                cat[r.code] = r.category;
        } catch (e) {}
        for (const r of rows) {
            out.push({
                source:        src.id,
                doc_id:        r.doc_id,
                title:         resolveWorkTitle(src, r.doc_id),
                category:      cat[r.doc_id] || null,
                book_id:       r.book_id,
                chapters:      r.chapters,
                verses:        r.verses,
                first_chapter: r.first_chapter,
            });
        }
    }
    out.sort((a, b) => a.source.localeCompare(b.source) || a.title.localeCompare(b.title));
    res.json(out);
});

// GET /api/source/:src/chapters?doc=X | ?book=N  -> chapter list for the
// chapter/verse selectors (works with many chapters need real navigation).
app.get('/api/source/:src/chapters', production.cache(300), (req, res) => {
    const src = getSource(req.params.src);
    if (!src) return res.status(404).json({ error: `unknown source: ${req.params.src}` });
    if (!src.available || !src.handle) return res.status(503).json({ error: `${src.id} not ingested` });
    const docId = (req.query.doc || '').trim();
    const book  = parseInt(req.query.book, 10);
    const rows = docId
        ? src.handle.prepare(`SELECT chapter, COUNT(*) AS verses FROM verses WHERE doc_id=?  GROUP BY chapter ORDER BY chapter`).all(docId)
        : src.handle.prepare(`SELECT chapter, COUNT(*) AS verses FROM verses WHERE book_id=? GROUP BY chapter ORDER BY chapter`).all(book);
    res.json(rows);
});


// ── MULTI-SOURCE ENDPOINTS ──────────────────────────────────────────────────
// Source catalog: tells the UI which non-Hebrew sources are available, with
// per-source metadata (book range, verse count, has-tokens flag).
app.get('/api/sources', production.cache(3600), (req, res) => {
    const out = Object.values(SOURCES).map(s => ({
        id:            s.id,
        label:         s.label,
        script:        s.script,
        // CAREFUL: has_tokens means "this source's own DB has a `tokens` table"
        // and is FALSE for every corpus.db-backed source (see /api/source/:id).
        // It is NOT "this source has Strong's-tagged tokens" — that is
        // strongs_tokens, and confusing the two is what sent HEB to the
        // text-only renderer. Both are exposed so a client can ask the right
        // question instead of guessing from the language name.
        has_tokens:    s.has_tokens,
        strongs_tokens: !!s.strongs_tokens,
        token_books:   s.token_books  ?? null,
        available:     s.available,
        verse_count:   s.verse_count   ?? null,
        book_count:    s.book_count    ?? null,
        book_range:    s.book_range    ?? null,
        surface_count: s.surface_count ?? null,
    }));
    res.json(out);
});

// GET /api/source/:src/verse?book=X&chapter=Y&verse=Z
// Returns the verse text + adjacent verse refs so the UI can chain (next/prev)
// continuously across the entire corpus — when verse Z is the last verse of
// chapter Y, "next" rolls to chapter Y+1 verse 1; when Y is the last chapter
// of book X, "next" rolls to book X+1; at the end of the corpus, "next" is
// null. Same logic in reverse for "prev".
app.get('/api/source/:src/verse', production.cache(60), (req, res) => {
    const src = getSource(req.params.src);
    if (!src) return res.status(404).json({ error: `unknown source: ${req.params.src}` });
    if (src.id === 'BHS') {
        return res.status(400).json({ error: 'use /api/tokens for BHS' });
    }
    if (!src.available) return res.status(503).json({ error: `${src.id} not ingested; run scripts/ingest-refs.cjs` });

    // Accept either ?book=N&chapter=N&verse=N (canonical) or
    // ?doc=DOCID&chapter=N&verse=N (literary work). doc wins if both given.
    const docId = (req.query.doc || '').trim();
    const ch    = parseInt(req.query.chapter, 10);
    const v     = parseInt(req.query.verse, 10);
    const book  = parseInt(req.query.book, 10);
    if (!Number.isFinite(ch) || !Number.isFinite(v)) {
        return res.status(400).json({ error: 'chapter, verse required' });
    }
    if (!docId && !Number.isFinite(book)) {
        return res.status(400).json({ error: 'either book or doc parameter required' });
    }
    const byDoc = !!docId;

    const cols = src.handle.prepare(`PRAGMA table_info(verses)`).all().map(c => c.name);
    const hasDoc = cols.includes('doc_id');
    const docSelect = hasDoc ? 'doc_id, ' : '';

    const row = byDoc
        ? src.handle.prepare(`
            SELECT ${docSelect} book_id, chapter, verse, text
            FROM verses WHERE doc_id=? AND chapter=? AND verse=?
            ORDER BY rowid LIMIT 1
          `).get(docId, ch, v)
        : src.handle.prepare(`
            SELECT ${docSelect} book_id, chapter, verse, text
            FROM verses WHERE book_id=? AND chapter=? AND verse=?
            ORDER BY rowid LIMIT 1
          `).get(book, ch, v);
    if (!row) return res.status(404).json({ error: 'verse not found in this source' });

    // English source-of-truth: when reading English, prefer the studio's OWNED
    // text (translation.db) over the corpus original, so your edits are what the
    // reader shows. Canonical books only here — doc-based works (e.g. Apocalypse
    // of Peter) are keyed differently and need the doc-aware studio extension.
    // (This route is cached ~60s, so an edit appears within a minute.)
    //
    // CORRECTED 2026-07-28: a same-day-earlier "fix" (2026-07-27) assumed
    // `row.book_id` here was a per-corpus ingest surrogate key, and "fixed" it
    // by selecting a separate `canon_id` column. That column doesn't exist —
    // `installScopedVerses` already builds this route's `verses` TEMP VIEW with
    // `canon_id AS book_id` (see its definition near CORPUS_DB), so `book_id` on
    // rows from `src.handle` IS canon_id already (constant across every corpus,
    // e.g. Matthew=40), and NULL for doc-only works. Selecting `canon_id`
    // directly crashed every canonical (non-doc) query on this route with
    // "no such column: canon_id" for every corpus.db source (GEZ, LXX, LAT,
    // SYR, COP, HEB, GRC), not just ENG. Reverted to using `row.book_id`.
    if (src.id === 'ENG' && row.book_id != null) {
        try {
            const t = translationDb.stmts.getVerse.get(row.book_id, ch, v);
            if (t && t.text) row.text = t.text;
        } catch { /* studio text optional */ }
    }

    // Adjacent refs scoped by doc OR by book (with cross-book fallthrough)
    const next = byDoc
        ? src.handle.prepare(`
            SELECT chapter, verse FROM verses
            WHERE doc_id=? AND ((chapter = ? AND verse > ?) OR (chapter > ?))
            ORDER BY chapter, verse LIMIT 1
          `).get(docId, ch, v, ch)
        : src.handle.prepare(`
            SELECT book_id, chapter, verse FROM verses
            WHERE (book_id = ? AND chapter = ? AND verse > ?)
               OR (book_id = ? AND chapter > ?)
               OR (book_id > ?)
            ORDER BY book_id, chapter, verse LIMIT 1
          `).get(book, ch, v, book, ch, book);
    const prev = byDoc
        ? src.handle.prepare(`
            SELECT chapter, verse FROM verses
            WHERE doc_id=? AND ((chapter = ? AND verse < ?) OR (chapter < ?))
            ORDER BY chapter DESC, verse DESC LIMIT 1
          `).get(docId, ch, v, ch)
        : src.handle.prepare(`
            SELECT book_id, chapter, verse FROM verses
            WHERE (book_id = ? AND chapter = ? AND verse < ?)
               OR (book_id = ? AND chapter < ?)
               OR (book_id < ?)
            ORDER BY book_id DESC, chapter DESC, verse DESC LIMIT 1
          `).get(book, ch, v, book, ch, book);

    const _vtokens = src.has_tokens
        ? _verseTokens(src, { book, ch, v, docId, byDoc })
        : splitTextToTokens(row.text, src.script);
    if (src.id === 'LXX' && !byDoc) _attachGrcToVerse(book, ch, v, _vtokens);
    res.json({
        source:   src.id,
        ref_key:  byDoc ? `${src.id}|${docId}|${ch}|${v}` : `${src.id}|${book}|${ch}|${v}`,
        doc_id:   row.doc_id || (byDoc ? docId : null),
        doc_title: byDoc ? resolveWorkTitle(src, docId) : null,
        book_id:  row.book_id,
        chapter:  row.chapter,
        verse:    row.verse,
        text:     row.text,
        tokens:   _vtokens,
        next:     next  ? (byDoc ? { doc_id: docId, chapter: next.chapter,  verse: next.verse  } : next)  : null,
        prev:     prev  ? (byDoc ? { doc_id: docId, chapter: prev.chapter,  verse: prev.verse  } : prev)  : null,
    });
});

// Helper used by /verse and /chapter to pull tokens for a verse. Accepts an
// opts bag so we can query by book OR by doc.
// Split raw verse text into display tokens when a source has no token table
// (the multi-language corpus.db sources). Words render with no translit/gloss;
// standalone punctuation separators (Ethiopic ፡ ።, Greek/Latin marks) drop out.
function splitTextToTokens(text, script) {
    if (!text) return [];
    const out = [];
    let ord = 0;
    // Sentence-level terminal punctuation we PRESERVE as visible thought
    // boundaries: Ethiopic full-stop / section marks (። ፣ ፤ ፥ ፦ ፧ ፨, U+1362–1368)
    // and Latin/Greek stops (. ! ? ; · and Greek ano-teleia/erotimatiko). The
    // Ethiopic WORDSPACE ፡ (U+1361) is a word separator, NOT a sentence boundary,
    // so it is deliberately excluded here.
    const TERMINAL = /[\u1362-\u1368.!?;\u00B7\u037E\u0387]+$/;
    for (const p of String(text).split(/\s+/)) {
        if (!p) continue;
        // Strip Ethiopic punctuation, common stops, AND critical-edition brackets
        // ([ ] ⟦ ⟧ ⸢ ⸣ ⌊ ⌋) so a bracketed surface like "[καὶ" still matches its
        // lexicon key. The displayed surface (word) is cleaned client-side too.
        const norm = p.replace(/[\u1360-\u1368\u00B7.,:;!?\u037E\u0387\[\]\u27e6\u27e7\u2e22\u2e23\u2e24\u2e25\u230a\u230b]/g, '');
        if (!norm) {
            // Standalone punctuation (e.g. a space-separated "።"). This used to be
            // dropped, erasing the sentence boundary. Emit it as a punctuation
            // token (no gloss, flagged) so the reader can render a clear break.
            const t = p.replace(/[\[\]\u27e6\u27e7\u2e22\u2e23\u2e24\u2e25\u230a\u230b]/g, '');
            if (t) out.push({ ord: ++ord, word: t, word_norm: '', gloss_key: null,
                              transliteration: null, root: null, gloss: null, is_punct: true, punct: t });
            continue;
        }
        // Surface the user's curated lexical data (lexicon/<lang>-lexicon.json)
        // so Greek / Ge'ez / Latin words render as real word-blocks, not bare text.
        // gloss_key is the canonical key the client copies — copy === gloss key.
        const _gk = _canonKey(script, norm);
        // Surface any trailing sentence terminal so the client can mark the break
        // explicitly without it being mistaken for part of the lexeme.
        const tm = p.match(TERMINAL);
        out.push({ ord: ++ord, word: p, word_norm: norm, gloss_key: _gk, transliteration: null,
                   root: null, gloss: script ? _lookupGloss(script, _gk) : null,
                   trail_punct: tm ? tm[0] : null });
    }
    return out;
}
// ── Greek NT morphology enrichment (morph-grc.db, Robinson-Pierpont Byzantine) ──
// Attaches lemma / decoded parsing / gloss / Strong's to Greek-NT tokens by
// position, verifying the accent-stripped surface matches so the rare (~0.09%)
// edition divergences stay honest (mismatches simply carry no morph).
const _stripAcc = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const _grcChStmt = grcDb._isNull ? null : grcDb.prepare(
    'SELECT v,w,norm,lemma,strongs,parse,pos_name,parsed,gloss FROM words WHERE canon_id=? AND ch=? ORDER BY v,w');
const _grcVStmt = grcDb._isNull ? null : grcDb.prepare(
    'SELECT w,norm,lemma,strongs,parse,pos_name,parsed,gloss FROM words WHERE canon_id=? AND ch=? AND v=? ORDER BY w');
function _applyMorph(t, m) {
    if (m && _stripAcc(t.word_norm || t.word) === m.norm) {
        t.lemma = m.lemma; t.strongs = m.strongs; t.parse = m.parse;
        t.pos_name = m.pos_name; t.parsed = m.parsed; t.morph_gloss = m.gloss;
        // Inline gloss is YOUR curated data only — prefer a lemma entry (covers
        // every inflection), else a surface entry (already on the token). The
        // bundled Dodson gloss stays in morph_gloss as a labeled reference in
        // the card; it never masquerades as your gloss inline.
        const curated = _lookupGloss('greek', m.lemma);
        if (curated) t.gloss = curated;
        t.has_morph = true;
    }
}
function _attachGrcToVerse(canonId, ch, v, tokens) {
    if (_grcVStmt && canonId >= 40 && canonId <= 66) {
        const mr = _grcVStmt.all(canonId, ch, v);
        if (mr.length) for (const t of tokens) _applyMorph(t, mr[t.ord - 1]);
    }
    for (const t of tokens) _applyGrcByString(t);
}
function _attachGrcToChapter(canonId, ch, verses) {
    if (_grcChStmt && canonId >= 40 && canonId <= 66) {
        const rows = _grcChStmt.all(canonId, ch);
        if (rows.length) {
            const byV = {};
            for (const r of rows) (byV[r.v] = byV[r.v] || []).push(r);
            for (const v of verses) {
                const mr = byV[v.verse];
                if (mr) for (const t of (v.tokens || [])) _applyMorph(t, mr[t.ord - 1]);
            }
        }
    }
    for (const v of verses) for (const t of (v.tokens || [])) _applyGrcByString(t);
}

// ── Greek Strong's by STRING MATCH (any Greek word, including LXX/OT) ─────────
// The NT morph DB already pairs every Greek surface-norm with a Strong's number.
// Index those once, then any Greek token the positional NT morph didn't cover —
// every OT/LXX word, plus NT edition divergences — gets its Strong's by matching
// its accent-stripped norm against that index. This is exactly the Hebrew method:
// compare the strings, and if they match it's the right number. Coverage is the
// NT's vocabulary; words unique to the LXX have no NT witness and stay unnumbered.
// The reference (curated) gloss is never overwritten; the Dodson gloss only fills
// morph_gloss as a labeled reference.
let _grcNormIndex = null;
function _loadGrcNormIndex() {
    if (_grcNormIndex) return _grcNormIndex;
    _grcNormIndex = new Map();
    if (grcDb._isNull) return _grcNormIndex;
    try {
        const rows = grcDb.prepare(
            "SELECT norm, lemma, strongs, gloss, COUNT(*) c FROM words " +
            "WHERE strongs IS NOT NULL AND strongs <> '' " +
            "GROUP BY norm, strongs ORDER BY norm ASC, c DESC").all();
        for (const r of rows) {
            const key = _stripAcc(r.norm);          // same key _applyMorph matches on
            if (key && !_grcNormIndex.has(key)) {    // first row per norm = most frequent strongs
                _grcNormIndex.set(key, { strongs: r.strongs, lemma: r.lemma, gloss: r.gloss });
            }
        }
        console.log(`[grc-index] ${_grcNormIndex.size} Greek norms \u2192 Strong's`);
    } catch (e) {
        console.error('[grc-index] build failed:', e.message);
    }
    return _grcNormIndex;
}
function _applyGrcByString(t) {
    if (!t || t.strongs) return;                    // positional NT morph already won
    const idx = _loadGrcNormIndex();
    if (!idx.size) return;
    const hit = idx.get(_stripAcc(t.word_norm || t.word || ''));
    if (!hit) return;
    t.strongs = hit.strongs;
    if (!t.lemma && hit.lemma)       t.lemma = hit.lemma;
    if (!t.morph_gloss && hit.gloss) t.morph_gloss = hit.gloss;
    t.has_morph = true;                             // render the lemma / Strong's badge
}

function _verseTokens(src, opts) {
    if (!src.has_tokens) return [];
    const { book, ch, v, docId, byDoc } = opts;
    const rows = byDoc
        ? src.handle.prepare(`
            SELECT t.ord, t.word_raw, t.word_norm,
                   MIN(sc.word_translit) AS word_translit,
                   MIN(sc.word_root)     AS word_root,
                   MAX(sc.count)         AS count
            FROM tokens t
            LEFT JOIN surface_counts sc ON sc.word_norm = t.word_norm
            WHERE t.doc_id=? AND t.chapter=? AND t.verse=?
            GROUP BY t.ord, t.word_raw, t.word_norm
            ORDER BY t.ord
          `).all(docId, ch, v)
        : src.handle.prepare(`
            SELECT t.ord, t.word_raw, t.word_norm,
                   MIN(sc.word_translit) AS word_translit,
                   MIN(sc.word_root)     AS word_root,
                   MAX(sc.count)         AS count
            FROM tokens t
            LEFT JOIN surface_counts sc ON sc.word_norm = t.word_norm
            WHERE t.book_id=? AND t.chapter=? AND t.verse=?
            GROUP BY t.ord, t.word_raw, t.word_norm
            ORDER BY t.ord
          `).all(book, ch, v);
    return rows.map(r => {
        const _gk = _canonKey(src.script, r.word_norm);
        return {
            ord:             r.ord,
            word:            r.word_raw,
            word_norm:       r.word_norm,
            gloss_key:       _gk,
            transliteration: r.word_translit,
            root:            r.word_root,
            gloss:           _lookupGloss(src.script, _gk),
            corpus_count:    r.count,
        };
    });
}

// GET /api/source/:src/chapter?book=X&chapter=Y
// Returns all verses in the chapter, plus adjacent-chapter refs for "next
// chapter" / "prev chapter" navigation.
app.get('/api/source/:src/chapter', production.cache(60), (req, res) => {
    const src = getSource(req.params.src);
    if (!src) return res.status(404).json({ error: `unknown source: ${req.params.src}` });
    if (src.id === 'BHS') return res.status(400).json({ error: 'use /api/tokens for BHS' });
    if (!src.available) return res.status(503).json({ error: `${src.id} not ingested` });

    // Two access modes: by canonical book_id (e.g. ?book=1&chapter=1) for
    // biblical text, or by doc_id (e.g. ?doc=LIT0183EtanaMogar&chapter=1)
    // for Ge'ez literary works that have no canonical placement. The doc
    // parameter wins if both are present.
    const docId = (req.query.doc || '').trim();
    let   ch    = parseInt(req.query.chapter, 10);
    const book  = parseInt(req.query.book, 10);
    if (!Number.isFinite(ch)) {
        return res.status(400).json({ error: 'chapter required' });
    }
    if (!docId && !Number.isFinite(book)) {
        return res.status(400).json({ error: 'either book or doc parameter required' });
    }
    const byDoc = !!docId;

    // Check schema has doc_id (Ge'ez does)
    const cols = src.handle.prepare(`PRAGMA table_info(verses)`).all().map(c => c.name);
    const hasDoc = cols.includes('doc_id');
    const docSelect = hasDoc ? 'doc_id, ' : '';

    // Some ingested corpora contain DUPLICATE verse rows — more than one row
    // for the same (doc_id/book_id, chapter, verse). Left unchecked the reader
    // renders every such verse twice (the "duplicate text from docs" report).
    // Collapse to one row per verse, picking the earliest-inserted (MIN(rowid)),
    // which is the primary ingest pass. This is a read-layer stabilizer; the
    // correct fix is a clean re-ingest (see notes).
    const verses = byDoc
        ? src.handle.prepare(`
            SELECT ${docSelect} book_id, chapter, verse, text
            FROM verses
            WHERE rowid IN (
              SELECT MIN(rowid) FROM verses
              WHERE doc_id=? AND chapter=? GROUP BY verse
            )
            ORDER BY verse
          `).all(docId, ch)
        : src.handle.prepare(`
            SELECT ${docSelect} book_id, chapter, verse, text
            FROM verses
            WHERE rowid IN (
              SELECT MIN(rowid) FROM verses
              WHERE book_id=? AND chapter=? GROUP BY verse
            )
            ORDER BY verse
          `).all(book, ch);

    // Graceful empty-chapter handling: a few works don't begin at chapter 1
    // (e.g. the Ge'ez Apocalypse of Ezra has no chapter 1 — its data starts at
    // 2). If the requested chapter is empty but the book/doc has content
    // elsewhere, snap to its first available chapter rather than showing a dead
    // page. `ch` is reassigned so next/prev and the response all agree.
    if (verses.length === 0) {
        const firstRow = byDoc
            ? src.handle.prepare(`SELECT chapter FROM verses WHERE doc_id=?  ORDER BY chapter, verse LIMIT 1`).get(docId)
            : src.handle.prepare(`SELECT chapter FROM verses WHERE book_id=? ORDER BY chapter, verse LIMIT 1`).get(book);
        if (firstRow && String(firstRow.chapter) !== String(ch)) {
            ch = firstRow.chapter;
            const snapped = byDoc
                ? src.handle.prepare(`SELECT ${docSelect} book_id, chapter, verse, text FROM verses WHERE rowid IN (SELECT MIN(rowid) FROM verses WHERE doc_id=?  AND chapter=? GROUP BY verse) ORDER BY verse`).all(docId, ch)
                : src.handle.prepare(`SELECT ${docSelect} book_id, chapter, verse, text FROM verses WHERE rowid IN (SELECT MIN(rowid) FROM verses WHERE book_id=? AND chapter=? GROUP BY verse) ORDER BY verse`).all(book, ch);
            verses.push(...snapped);
        }
    }

    // NOTE: surface_counts can hold more than one row per word_norm, so a plain
    // LEFT JOIN fans out — one token becomes N rows, which is what produced the
    // visible "every word printed twice" bug. GROUP BY the token's own identity
    // (verse, ord, surface) collapses it back to exactly one row per token,
    // regardless of how many surface_counts rows match. MIN/MAX just pick a
    // single representative for the aggregated columns (the rows are identical
    // in practice, so the choice is immaterial).
    const tokenRows = src.has_tokens
        ? (byDoc
            ? src.handle.prepare(`
                SELECT t.verse, t.ord, t.word_raw, t.word_norm,
                       MIN(sc.word_translit) AS word_translit,
                       MIN(sc.word_root)     AS word_root,
                       MAX(sc.count)         AS count
                FROM tokens t
                LEFT JOIN surface_counts sc ON sc.word_norm = t.word_norm
                WHERE t.doc_id=? AND t.chapter=?
                GROUP BY t.verse, t.ord, t.word_raw, t.word_norm
                ORDER BY t.verse, t.ord
              `).all(docId, ch)
            : src.handle.prepare(`
                SELECT t.verse, t.ord, t.word_raw, t.word_norm,
                       MIN(sc.word_translit) AS word_translit,
                       MIN(sc.word_root)     AS word_root,
                       MAX(sc.count)         AS count
                FROM tokens t
                LEFT JOIN surface_counts sc ON sc.word_norm = t.word_norm
                WHERE t.book_id=? AND t.chapter=?
                GROUP BY t.verse, t.ord, t.word_raw, t.word_norm
                ORDER BY t.verse, t.ord
              `).all(book, ch))
        : [];
    const tokensByVerse = {};
    for (const r of tokenRows) {
        const _gk = _canonKey(src.script, r.word_norm);
        (tokensByVerse[r.verse] ||= []).push({
            ord:             r.ord,
            word:            r.word_raw,
            word_norm:       r.word_norm,
            gloss_key:       _gk,
            transliteration: r.word_translit,
            root:            r.word_root,
            gloss:           _lookupGloss(src.script, _gk),
            corpus_count:    r.count,
        });
    }
    for (const v of verses) v.tokens = src.has_tokens ? (tokensByVerse[v.verse] || []) : splitTextToTokens(v.text, src.script);
    if (src.id === 'LXX' && !byDoc) _attachGrcToChapter(book, ch, verses);

    // BUG FOUND 2026-07-27: this chapter route never consulted translation.db,
    // while its sibling /api/source/:src/verse (single-verse lookup) always
    // preferred the Studio's saved text over the corpus original (see the
    // comment there). The frontend's default reading view fetches by CHAPTER
    // (MultiViewer.jsx defaults to mode='chapter'; 'verse' mode only kicks in
    // behind an explicit ?verse= param), so a human's saved English edit for a
    // non-OT verse was invisible in ordinary reading — only a direct
    // single-verse deep link ever showed it. Apply the same override here,
    // batched per chapter instead of per verse.
    //
    // CORRECTED 2026-07-28: querying translationDb with the raw `?book=` param
    // is indeed wrong (it's a per-corpus-ingest surrogate key, e.g. ENG
    // Matthew=6097, vs. translation.db's own book_id column which stores
    // canon_id, Matthew=40 — see CLAUDE.md's "book_id means two different
    // things" section). But the fix added the same day mistakenly selected a
    // separate `canon_id` column from `verses`, which doesn't exist — the
    // route's scoped view (`installScopedVerses`) already aliases
    // `canon_id AS book_id`, so `verses[0].book_id` already IS canon_id (NULL
    // for doc-only works). Selecting `canon_id` directly crashed every
    // canonical chapter query on this route ("no such column: canon_id") for
    // every corpus.db source — GEZ, LXX, LAT, SYR, COP, HEB, GRC — not just
    // ENG. Reverted to using the row's own book_id.
    if (src.id === 'ENG' && !byDoc && verses.length) {
        try {
            const canonId = verses[0].book_id;
            const saved = canonId != null ? translationDb.stmts.chapterProgress.all(canonId, ch) : [];
            const savedByVerse = {};
            for (const s of saved) if (s.text) savedByVerse[s.verse] = s.text;
            for (const v of verses) if (savedByVerse[v.verse] != null) v.text = savedByVerse[v.verse];
        } catch { /* studio text optional */ }
    }

    // Adjacent-chapter navigation: scoped to within the same book OR same doc
    // In doc mode, nav stays inside the manuscript. In canonical mode, step
    // within the book first; at a book edge, cross to the adjacent book in the
    // *custom* order (book-order.json) rather than by numeric id.
    let nextChapter, prevChapter;
    if (byDoc) {
        nextChapter = src.handle.prepare(`
            SELECT chapter FROM verses
            WHERE doc_id=? AND chapter > ? ORDER BY chapter LIMIT 1
          `).get(docId, ch);
        prevChapter = src.handle.prepare(`
            SELECT chapter FROM verses
            WHERE doc_id=? AND chapter < ? ORDER BY chapter DESC LIMIT 1
          `).get(docId, ch);
    } else {
        nextChapter = src.handle.prepare(`
            SELECT book_id, chapter FROM verses
            WHERE book_id = ? AND chapter > ? ORDER BY chapter LIMIT 1
          `).get(book, ch);
        if (!nextChapter) {
            const ob = orderedBooks(src);
            const i = ob.indexOf(book);
            const nb = (i >= 0 && i + 1 < ob.length) ? ob[i + 1] : null;
            nextChapter = nb != null
                ? src.handle.prepare(`
                    SELECT book_id, chapter FROM verses
                    WHERE book_id = ? ORDER BY chapter LIMIT 1
                  `).get(nb)
                : null;
        }
        prevChapter = src.handle.prepare(`
            SELECT book_id, chapter FROM verses
            WHERE book_id = ? AND chapter < ? ORDER BY chapter DESC LIMIT 1
          `).get(book, ch);
        if (!prevChapter) {
            const ob = orderedBooks(src);
            const i = ob.indexOf(book);
            const pb = (i > 0) ? ob[i - 1] : null;
            prevChapter = pb != null
                ? src.handle.prepare(`
                    SELECT book_id, chapter FROM verses
                    WHERE book_id = ? ORDER BY chapter DESC LIMIT 1
                  `).get(pb)
                : null;
        }
    }
    res.json({
        source: src.id,
        // In doc mode, surface the canonical book the manuscript witnesses (its
        // verse rows carry it) rather than a flat null. A doc that maps to a
        // canonical book (LIT1546Genesi → Genesis) then reads truthfully in the
        // toolbar and can carry its chapter across a source switch; a purely
        // literary doc keeps book_id null and falls back to Gen 1:1.
        book_id: byDoc ? (verses[0]?.book_id ?? null) : book,
        doc_id:  byDoc ? docId : (verses[0]?.doc_id || null),
        doc_title: byDoc ? resolveWorkTitle(src, docId) : null,
        chapter: ch,
        verses,
        next_chapter: nextChapter ? (byDoc ? { doc_id: docId, chapter: nextChapter.chapter } : nextChapter) : null,
        prev_chapter: prevChapter ? (byDoc ? { doc_id: docId, chapter: prevChapter.chapter } : prevChapter) : null,
    });
});

// GET /api/source/:src/books
// Returns the list of book IDs this source covers, with verse counts. Used
// by the UI to populate the book selector when reading from a non-Hebrew
// source.
// ── Universal concordance (concordance.db) ───────────────────────────
// Every word of every verse, all languages + works. Matching is exact-surface
// (same normalized orthographic form) or by lemma where real morphology exists
// (Greek NT). Normalization below is byte-identical to build-concordance.py
// (parity-tested); index-time and query-time MUST stay in lockstep.
const _isP = ch => /\p{P}/u.test(ch);
const _HEBFIN = {'\u05DA':'\u05DB','\u05DD':'\u05DE','\u05DF':'\u05E0','\u05E3':'\u05E4','\u05E5':'\u05E6'};
function _normHeb(w){ w=[...w].filter(c=>{const x=c.codePointAt(0);return !(x>=0x0591&&x<=0x05C7);}).join(''); w=[...w].map(c=>_HEBFIN[c]||c).join(''); return [...w].filter(c=>!_isP(c)).join(''); }
function _normGrk(w){ w=w.normalize('NFC'); w=[...w].filter(c=>!_isP(c)).join(''); w=w.normalize('NFD').replace(/\u0300/g,'\u0301'); w=w.normalize('NFC').replace(/\u03C2/g,'\u03C3'); return w.toLowerCase(); }
function _normLat(w){ return [...w.normalize('NFC')].filter(c=>!_isP(c)).join('').toLowerCase(); }
function _normGez(w){ return [...w].filter(c=>{const x=c.codePointAt(0);return !(x>=0x1360&&x<=0x1368)&&!_isP(c);}).join(''); }
const _CONC_NORM = {HEB:_normHeb,LXX:_normGrk,GNT:_normGrk,GRC:_normGrk,LAT:_normLat,GEZ:_normGez};

// Corpora that share a script/orthography are searched as ONE pool, so a Greek
// word opened from the NT also returns its Septuagint (OT) and Greek-literature
// (works) occurrences. Greek = LXX + GNT + GRC; the rest stand alone (a Syriac
// and a Coptic word are not the same even though both default to the Latin norm).
const _CONC_GROUP = {
    HEB:['HEB'],
    LXX:['LXX','GNT','GRC'], GNT:['LXX','GNT','GRC'], GRC:['LXX','GNT','GRC'],
    LAT:['LAT'], GEZ:['GEZ'], SYR:['SYR'], COP:['COP'],
};
const _CONC_CORP = new Set(Object.keys(_CONC_GROUP));   // now incl. SYR, COP
function _concNorm(corpus,w){ return (_CONC_NORM[corpus]||_normLat)(w); }
function _concGroup(corpus){ return _CONC_GROUP[corpus] || [corpus]; }
function _ph(a){ return a.map(()=>'?').join(','); }

// corpus → reader source id. LXX & GNT both read out of the LXX 'Greek
// Scriptures' source (its scoped view spans both corpora); GRC works read out
// of GRC. The reader opens canonical rows by book_id and literary works by
// doc_id (which, for a work, is exactly the concordance `code`).
const _CONC_READ_SRC = { HEB:'HEB', LXX:'LXX', GNT:'LXX', GRC:'GRC', LAT:'LAT', GEZ:'GEZ', SYR:'SYR', COP:'COP' };
function _concSrcObj(corpus){
    const sid = _CONC_READ_SRC[corpus] || corpus;
    return SOURCES[sid] || getSource(corpus) || null;
}
// Resolve a readable label + the fields the reader needs to open a hit.
//   canonical (canon_id set): name from BOOK_NAMES, open by book_id
//   literary work (canon_id NULL): name via resolveWorkTitle, open by doc_id
// title is left null for canonical books outside BOOK_NAMES (NT/deutero) so the
// UI keeps whatever canon label it already renders rather than getting blanked.
function _concLoc(corpus, canon_id, code){
    const source = _CONC_READ_SRC[corpus] || corpus;
    if (canon_id != null)
        return { source, book_id: canon_id, doc_id: null, title: BOOK_NAMES[canon_id] || null };
    const src = _concSrcObj(corpus);
    return { source, book_id: null, doc_id: code,
             title: src ? resolveWorkTitle(src, code) : _deriveTitle(code) };
}
// Enrich a concordance row (by_book or occurrence) with title + reader-nav fields.
function _concRow(r){
    const loc = _concLoc(r.corpus, r.canon_id, r.code);
    return { ...r, title: loc.title, source: loc.source, doc_id: loc.doc_id, book_id: loc.book_id };
}

// GET /api/concordance/forms?corpus=&q=&limit=&offset=  — distinct surface forms + counts
// (counts summed across the script group, so a Greek form shows its full corpus total)
app.get('/api/concordance/forms', (req,res)=>{
    const corpus=(req.query.corpus||'').toUpperCase();
    if(!_CONC_CORP.has(corpus)) return res.status(400).json({error:'bad corpus'});
    if(concDb._isNull) return res.status(503).json({error:'concordance.db not built',hint:'python build-concordance.py'});
    const g=_concGroup(corpus), ph=_ph(g);
    const limit=Math.min(parseInt(req.query.limit,10)||200,1000), offset=parseInt(req.query.offset,10)||0;
    const q=(req.query.q||'').trim();
    const rows = q
      ? concDb.prepare(`SELECT norm, MIN(display) display, SUM(n) n FROM forms WHERE corpus IN (${ph}) AND (norm LIKE ? OR display LIKE ?) GROUP BY norm ORDER BY norm LIMIT ? OFFSET ?`)
          .all(...g, _concNorm(corpus,q)+'%', q+'%', limit, offset)
      : concDb.prepare(`SELECT norm, MIN(display) display, SUM(n) n FROM forms WHERE corpus IN (${ph}) GROUP BY norm ORDER BY norm LIMIT ? OFFSET ?`)
          .all(...g, limit, offset);
    res.json({corpus, group:g, count: rows.length, forms: rows});
});

// GET /api/concordance/surface?corpus=&word=&limit=  — every occurrence of a surface form
// across the whole script group (OT + NT + works), with a per-corpus breakdown.
app.get('/api/concordance/surface', (req,res)=>{
    const corpus=(req.query.corpus||'').toUpperCase();
    if(!_CONC_CORP.has(corpus)) return res.status(400).json({error:'bad corpus'});
    if(concDb._isNull) return res.status(503).json({error:'concordance.db not built'});
    const word=(req.query.word||'').trim(); if(!word) return res.status(400).json({error:'word required'});
    const norm=_concNorm(corpus,word);
    const g=_concGroup(corpus), ph=_ph(g);
    const limit=Math.min(parseInt(req.query.limit,10)||100,500);
    const total=concDb.prepare(`SELECT COUNT(*) n FROM tokens WHERE corpus IN (${ph}) AND norm=?`).get(...g,norm).n;
    const display=(concDb.prepare(`SELECT display FROM forms WHERE corpus IN (${ph}) AND norm=? ORDER BY n DESC LIMIT 1`).get(...g,norm)||{}).display||word;
    const by_corpus=concDb.prepare(`SELECT corpus, COUNT(*) n FROM tokens WHERE corpus IN (${ph}) AND norm=? GROUP BY corpus ORDER BY n DESC`).all(...g,norm);
    const by_book=concDb.prepare(`SELECT corpus,canon_id,code,COUNT(*) n FROM tokens WHERE corpus IN (${ph}) AND norm=? GROUP BY corpus,canon_id,code ORDER BY (canon_id IS NULL), canon_id, n DESC`).all(...g,norm).map(_concRow);
    // canonical books first (by canon_id), works (canon_id NULL) last
    const _fBook = (req.query.book!=null && req.query.book!=='') ? parseInt(req.query.book,10) : null;
    const _fDoc  = (req.query.doc||'').trim() || null;
    let _ocW = `corpus IN (${ph}) AND norm=?`, _ocP = [...g, norm];
    if (_fBook!=null && Number.isFinite(_fBook)) { _ocW += ' AND canon_id=?'; _ocP.push(_fBook); }
    else if (_fDoc)                              { _ocW += ' AND code=?';     _ocP.push(_fDoc);  }
    const occ=concDb.prepare(`SELECT corpus,canon_id,code,ord_c,ord_v,ch,v,surface FROM tokens WHERE ${_ocW} ORDER BY (canon_id IS NULL), canon_id, ord_c, ord_v, ord LIMIT ?`).all(..._ocP,limit).map(_concRow);
    const focus=(_fBook!=null||_fDoc) ? { book:_fBook, doc:_fDoc, count: concDb.prepare(`SELECT COUNT(*) n FROM tokens WHERE ${_ocW}`).get(..._ocP).n } : null;
    res.json({corpus, group:g, norm, display, count: total, focus, by_corpus, by_book, occurrences: occ});
});

// GET /api/concordance/lemma?corpus=&lemma=&limit=  — occurrences by lemma.
// Lemmas exist only where there's morphology (Greek NT today), but we still pool
// the group so the dossier is consistent and ready if LXX/GRC gain lemmas later.
app.get('/api/concordance/lemma', (req,res)=>{
    const corpus=(req.query.corpus||'').toUpperCase();
    if(!_CONC_CORP.has(corpus)) return res.status(400).json({error:'bad corpus'});
    if(concDb._isNull) return res.status(503).json({error:'concordance.db not built'});
    const lemma=(req.query.lemma||'').trim(); if(!lemma) return res.status(400).json({error:'lemma required'});
    const g=_concGroup(corpus), ph=_ph(g);
    const limit=Math.min(parseInt(req.query.limit,10)||100,500);

    // Lemmas are populated only where morphology exists (Greek GNT today), so a
    // bare lemma= filter returns NT-only by construction. Pool the script group by
    // expanding the lemma to its inflected surface-norms (known from GNT) and then
    // matching LXX/GRC by norm: GNT matches by lemma, LXX/GRC match by the lemma's
    // norms. That surfaces the OT (LXX) + Greek works (GRC) occurrences too.
    const norms = concDb.prepare(
        `SELECT DISTINCT norm FROM tokens
         WHERE corpus IN (${ph}) AND lemma=? AND norm IS NOT NULL`
    ).all(...g, lemma).map(r => r.norm);
    const nph   = norms.length ? norms.map(()=>'?').join(',') : `''`;
    const where = `corpus IN (${ph}) AND (lemma=? OR norm IN (${nph}))`;
    const pW    = [...g, lemma, ...norms];   // bind order for EVERY statement using `where`

    let gloss=null, strongs=null, pos_name=null;
    if(!grcDb._isNull){ const h=grcDb.prepare('SELECT strongs,gloss,pos_name FROM lemma_index WHERE lemma=?').get(lemma); if(h){gloss=h.gloss;strongs=h.strongs;pos_name=h.pos_name;} }
    const curated=_lookupGloss('greek', lemma); if(curated) gloss=curated;   // your data wins

    const total=concDb.prepare(`SELECT COUNT(*) n FROM tokens WHERE ${where}`).get(...pW).n;
    const by_surface=concDb.prepare(`SELECT norm, MIN(surface) display, COUNT(*) n FROM tokens WHERE ${where} GROUP BY norm ORDER BY n DESC`).all(...pW);
    const by_corpus=concDb.prepare(`SELECT corpus, COUNT(*) n FROM tokens WHERE ${where} GROUP BY corpus ORDER BY n DESC`).all(...pW);
    // scripture first (canonical by canon order), literary works after, each by count
    const by_book=concDb.prepare(`SELECT corpus,canon_id,code,COUNT(*) n FROM tokens WHERE ${where} GROUP BY corpus,canon_id,code ORDER BY (canon_id IS NULL), canon_id, n DESC`).all(...pW).map(_concRow);
    // canonical books first (by canon_id), works (canon_id NULL) last → OT-first
    // optional occurrence focus (a By-book click): ?book=<canon_id> or ?doc=<code>
    // narrows ONLY the occurrence list to one book/work; the breakdowns stay global
    // so the user can keep switching focus from the same dossier.
    const _fBook = (req.query.book!=null && req.query.book!=='') ? parseInt(req.query.book,10) : null;
    const _fDoc  = (req.query.doc||'').trim() || null;
    let _ocW = where, _ocP = [...pW];
    if (_fBook!=null && Number.isFinite(_fBook)) { _ocW += ' AND canon_id=?'; _ocP.push(_fBook); }
    else if (_fDoc)                              { _ocW += ' AND code=?';     _ocP.push(_fDoc);  }
    const occ=concDb.prepare(`SELECT corpus,canon_id,code,ord_c,ord_v,ch,v,surface FROM tokens WHERE ${_ocW} ORDER BY (canon_id IS NULL), canon_id, ord_c, ord_v, ord LIMIT ?`).all(..._ocP,limit).map(_concRow);
    const focus=(_fBook!=null||_fDoc) ? { book:_fBook, doc:_fDoc, count: concDb.prepare(`SELECT COUNT(*) n FROM tokens WHERE ${_ocW}`).get(..._ocP).n } : null;
    res.json({corpus, group:g, lemma, strongs, pos_name, gloss, count: total, focus, by_surface, by_corpus, by_book, occurrences: occ});
});


// GET /api/source/:src/lemma?lemma=...&limit=
// Greek NT lemma dossier from morph-grc.db: header (gloss, pos, total count) +
// occurrences. Powers click-to-usages on Greek word-cards, mirroring the Hebrew
// root/surface explorer. lemma is Greek-specific; :src keeps the route uniform.
app.get('/api/source/:src/lemma', (req, res) => {
    const lemma = (req.query.lemma || '').trim();
    if (!lemma) return res.status(400).json({ error: 'lemma required' });
    if (grcDb._isNull) return res.status(503).json({ error: 'morph-grc.db not available' });
    const limit = Math.min(parseInt(req.query.limit, 10) || 80, 400);
    const header = grcDb.prepare(
        'SELECT lemma,strongs,gloss,pos_name,n FROM lemma_index WHERE lemma=?').get(lemma);
    const occurrences = grcDb.prepare(
        'SELECT canon_id,ch,v,word,parsed,gloss FROM words WHERE lemma=? ORDER BY canon_id,ch,v,w LIMIT ?'
    ).all(lemma, limit);
    if (header) { const cur = _lookupGloss('greek', lemma); if (cur) header.gloss = cur; }
    res.json({ lemma, header: header || null, count: header ? header.n : occurrences.length, occurrences });
});

app.get('/api/source/:src/books', production.cache(3600), (req, res) => {
    const src = getSource(req.params.src);
    if (!src) return res.status(404).json({ error: `unknown source: ${req.params.src}` });
    if (src.id === 'BHS') return res.json(BOOKS);
    if (!src.available) return res.status(503).json({ error: `${src.id} not ingested` });
    const rows = src.handle.prepare(`
        SELECT book_id,
               COUNT(*) AS verses,
               COUNT(DISTINCT chapter) AS chapters,
               MIN(chapter) AS first_chapter,
               MAX(chapter) AS last_chapter
        FROM verses
        WHERE book_id IS NOT NULL
        GROUP BY book_id ORDER BY book_id
    `).all();
    const ordered = rows.slice().sort((a, b) =>
        orderKey(a.book_id) - orderKey(b.book_id) || a.book_id - b.book_id);
    res.json(ordered.map((r, i) => {
        const meta = BOOKS.find(b => b.book_id === r.book_id);
        return {
            book_id:       r.book_id,
            seq:           i + 1,
            name:          meta?.name || `Book ${r.book_id}`,
            verses:        r.verses,
            chapters:      r.chapters,
            first_chapter: r.first_chapter,
            last_chapter:  r.last_chapter,
        };
    }));
});

// Heuristic mapping from a substring of a Ge'ez doc_id to a canonical book.
// BETMAS doc_ids like LIT1019Actsof, LIT2473TobitB, LIT2698Sam name the
// underlying biblical book in their tail. Matching is ORDER-SENSITIVE — more
// specific keys come first (e.g. "ActsofJohn" must beat "Acts" alone, since
// Acts of John is apocrypha, not Luke's Acts).
const DOC_NAME_TO_BOOK = [
    // Apocrypha / non-canonical first (so they DON'T match canonical patterns)
    { match: /ActsofJohn/i,   book_id: null, label: 'Acts of John (apocryphal)' },
    { match: /ClemPeter/i,    book_id: null, label: 'Clement of Peter (apocryphal)' },
    // OT
    { match: /Genes/i,        book_id: 1,  label: 'Genesis' },
    { match: /Exodus/i,       book_id: 2,  label: 'Exodus' },
    { match: /Leviti/i,       book_id: 3,  label: 'Leviticus' },
    { match: /Number/i,       book_id: 4,  label: 'Numbers' },
    { match: /Deuteronomy/i,  book_id: 5,  label: 'Deuteronomy' },
    { match: /Joshua/i,       book_id: 6,  label: 'Joshua' },
    { match: /Judges/i,       book_id: 7,  label: 'Judges' },
    { match: /RuthBo|^Ruth/i, book_id: 8,  label: 'Ruth' },
    { match: /Sam/i,          book_id: 9,  label: 'Samuel' },
    { match: /Kings/i,        book_id: 11, label: 'Kings' },
    { match: /Chroni/i,       book_id: 13, label: 'Chronicles' },
    { match: /Ezra/i,         book_id: 15, label: 'Ezra' },
    { match: /Nehemi/i,       book_id: 16, label: 'Nehemiah' },
    { match: /Esther/i,       book_id: 17, label: 'Esther' },
    { match: /^Job|Jobus/i,   book_id: 18, label: 'Job' },
    { match: /Mazmur|Psalm/i, book_id: 19, label: 'Psalms' },
    { match: /Prover/i,       book_id: 20, label: 'Proverbs' },
    { match: /Eccles/i,       book_id: 21, label: 'Ecclesiastes' },
    { match: /Songof|SongS/i, book_id: 22, label: 'Song of Songs' },
    { match: /Isaiah/i,       book_id: 23, label: 'Isaiah' },
    { match: /Jeremiah/i,     book_id: 24, label: 'Jeremiah' },
    { match: /Lament/i,       book_id: 25, label: 'Lamentations' },
    { match: /Ezek/i,         book_id: 26, label: 'Ezekiel' },
    { match: /Daniel/i,       book_id: 27, label: 'Daniel' },
    { match: /Hosea/i,        book_id: 28, label: 'Hosea' },
    { match: /^Joel/i,        book_id: 29, label: 'Joel' },
    { match: /Amos/i,         book_id: 30, label: 'Amos' },
    { match: /Obadi/i,        book_id: 31, label: 'Obadiah' },
    { match: /Jonah/i,        book_id: 32, label: 'Jonah' },
    { match: /Micah/i,        book_id: 33, label: 'Micah' },
    { match: /Nahum/i,        book_id: 34, label: 'Nahum' },
    { match: /Habak/i,        book_id: 35, label: 'Habakkuk' },
    { match: /Zephan/i,       book_id: 36, label: 'Zephaniah' },
    { match: /Haggai/i,       book_id: 37, label: 'Haggai' },
    { match: /Zechar/i,       book_id: 38, label: 'Zechariah' },
    { match: /Malach/i,       book_id: 39, label: 'Malachi' },
    // NT
    { match: /Matthew/i,      book_id: 40, label: 'Matthew' },
    { match: /MarkGo|^Mark/i, book_id: 41, label: 'Mark' },
    { match: /GospelLuke|^Luke/i, book_id: 42, label: 'Luke' },
    { match: /^John/i,        book_id: 43, label: 'John' },
    { match: /Actsof|^Acts/i, book_id: 44, label: 'Acts' },
    { match: /Roman/i,        book_id: 45, label: 'Romans' },
    { match: /Corin/i,        book_id: 46, label: 'Corinthians' },
    { match: /Galat/i,        book_id: 48, label: 'Galatians' },
    { match: /Ephes/i,        book_id: 49, label: 'Ephesians' },
    { match: /Philip/i,       book_id: 50, label: 'Philippians' },
    { match: /Coloss/i,       book_id: 51, label: 'Colossians' },
    { match: /Thess/i,        book_id: 52, label: 'Thessalonians' },
    { match: /Timoth/i,       book_id: 54, label: 'Timothy' },
    { match: /Titus/i,        book_id: 56, label: 'Titus' },
    { match: /Philem/i,       book_id: 57, label: 'Philemon' },
    { match: /Hebrews/i,      book_id: 58, label: 'Hebrews' },
    { match: /James/i,        book_id: 59, label: 'James' },
    { match: /Peter/i,        book_id: 60, label: 'Peter' },
    { match: /Jude/i,         book_id: 65, label: 'Jude' },
    { match: /Apocal|Revel/i, book_id: 66, label: 'Revelation' },
    // Ethiopic canon additions
    { match: /Enoch/i,        book_id: 67, label: '1 Enoch' },
    { match: /Jubile/i,       book_id: 68, label: 'Jubilees' },
    { match: /Maccab/i,       book_id: 69, label: 'Maccabees' },
    { match: /Sirach/i,       book_id: 70, label: 'Sirach' },
    { match: /Wisdom/i,       book_id: 71, label: 'Wisdom' },
    // Deuterocanonical / Ethiopian extended canon (new book_ids)
    { match: /Tobit/i,        book_id: 72, label: 'Tobit' },
    { match: /Judith/i,       book_id: 73, label: 'Judith' },
    { match: /Baruch/i,       book_id: 74, label: 'Baruch' },
];
function _bookHintForDoc(docId) {
    if (!docId) return null;
    for (const m of DOC_NAME_TO_BOOK) {
        if (m.match.test(docId)) return { book_id: m.book_id, label: m.label };
    }
    return null;
}

// GET /api/source/:src/docs
// Returns every distinct doc_id (manuscript / witness) in this source's
// `verses` table. Each doc gets a `book_hint` field — if its name contains
// a recognized biblical book stem (e.g. "Actsof", "Genes", "Tobit"), we
// surface that so the frontend can GROUP literary docs by which canonical
// book they witness. This is the bridge between the verse-aligned canonical
// set and the much larger literary corpus.
app.get('/api/source/:src/docs', production.cache(3600), (req, res) => {
    const src = getSource(req.params.src);
    if (!src) return res.status(404).json({ error: `unknown source: ${req.params.src}` });
    if (src.id === 'BHS') return res.json([]);
    if (!src.available)   return res.status(503).json({ error: `${src.id} not ingested` });
    const cols = src.handle.prepare(`PRAGMA table_info(verses)`).all().map(c => c.name);
    if (!cols.includes('doc_id')) return res.json([]);
    const rows = src.handle.prepare(`
        SELECT doc_id,
               book_id,
               COUNT(*) AS verses,
               COUNT(DISTINCT chapter) AS chapters,
               MIN(chapter) AS first_chapter,
               MAX(chapter) AS last_chapter
        FROM verses
        WHERE doc_id IS NOT NULL AND doc_id != ''
        GROUP BY doc_id, book_id
        ORDER BY book_id, doc_id
    `).all();
    res.json(rows.map(r => {
        const meta = BOOKS.find(b => b.book_id === r.book_id);
        const hint = _bookHintForDoc(r.doc_id);
        return {
            doc_id:        r.doc_id,
            title:         resolveWorkTitle(src, r.doc_id),
            book_id:       r.book_id,
            book_name:     meta?.name || `Book ${r.book_id}`,
            book_hint:     hint,
            verses:        r.verses,
            chapters:      r.chapters,
            first_chapter: r.first_chapter,
            last_chapter:  r.last_chapter,
        };
    }));
});

// GET /api/parallel-sources?book=X&chapter=Y&verse=Z
// Returns the same verse from every available source. Powers the parallel-
// viewer source toggles: pass a verse, get back what each source has for it.
// Hebrew comes from the existing bible.db; the others from the source DBs.
app.get('/api/parallel-sources', production.cache(60), (req, res) => {
    const book = parseInt(req.query.book, 10);
    const ch   = parseInt(req.query.chapter, 10);
    const v    = parseInt(req.query.verse, 10);
    if (!Number.isFinite(book) || !Number.isFinite(ch) || !Number.isFinite(v)) {
        return res.status(400).json({ error: 'book, chapter, verse required' });
    }
    const out = {};
    // Hebrew: derive from surface-index.db (the canonical store the rest of
    // the app uses — bible.db is only a fallback for live-parse). We
    // reconstruct the surface text by joining tokenized word_raw values for
    // the verse in token-order. surface_occurrences has every position; ORDER
    // BY token_ordinal recovers verse word order.
    try {
        const tokens = surfDb.prepare(`
            SELECT word_raw FROM surface_occurrences
            WHERE book_id=? AND chapter=? AND verse=?${SRC_BHS_ONLY}
            ORDER BY token_ordinal
        `).all(book, ch, v);
        if (tokens.length) {
            out.BHS = { source: 'BHS', text: tokens.map(t => t.word_raw).join(' '), available: true };
        } else {
            out.BHS = { source: 'BHS', text: null, available: false };
        }
    } catch (e) {
        out.BHS = { source: 'BHS', text: null, available: false, error: e.message };
    }
    // Other sources
    for (const src of Object.values(SOURCES)) {
        if (src.id === 'BHS' || !src.available) {
            if (src.id !== 'BHS') {
                out[src.id] = { source: src.id, text: null, available: false };
            }
            continue;
        }
        const row = src.handle.prepare(`
            SELECT ${src.id === 'GEZ' ? 'doc_id, ' : ''} text
            FROM verses WHERE book_id=? AND chapter=? AND verse=?
        `).get(book, ch, v);
        out[src.id] = row
            ? { source: src.id, text: row.text, doc_id: row.doc_id || null, available: true }
            : { source: src.id, text: null, available: false };
    }
    res.json({ book_id: book, chapter: ch, verse: v, sources: out });
});

// GET /api/cross-lang-equivalents?word=X
// Looks up cross-language word equivalents from lexicon/cross-lang-equivalents.json.
// This is the JSON the user explicitly wants for linking e.g. Greek 'iesous'
// → Hebrew 'Yahawashai' / '𐤉𐤄𐤅𐤔𐤏'. Returns the entry if found.
// When called with no query param, returns the entire map (useful for the UI
// to know which words have equivalents and offer one-click cross-source jump).
app.get('/api/cross-lang-equivalents', production.cache(300), (req, res) => {
    try {
        const file = path.join(__dirname, 'lexicon', 'cross-lang-equivalents.json');
        if (!fs.existsSync(file)) return res.json({ entries: {}, _hint: 'create lexicon/cross-lang-equivalents.json' });
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        const word = (req.query.word || '').trim();
        if (!word) return res.json(data);
        // Allow lookup by ANY key in the entries map OR by any alias/lemma.
        // We do a small linear scan over the entries (the file is expected to
        // be < ~10k entries; if it grows beyond that we can index).
        const entries = data.entries || {};
        const direct = entries[word];
        if (direct) return res.json({ key: word, ...direct, source_keys: [word] });
        // Look in equivalents arrays
        const hits = [];
        for (const [k, v] of Object.entries(entries)) {
            if (k === word) continue;
            const all = [
                v.hebrew_lemma, v.hebrew_paleo, v.greek_lemma,
                v.geez_lemma, v.canonical_eng,
                ...(v.aliases || []),
            ].filter(Boolean);
            if (all.includes(word)) hits.push({ key: k, ...v });
        }
        res.json({ key: word, matches: hits });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── PER-SOURCE LEXICON ENDPOINTS ─────────────────────────────────────────────
// Surface-level lexicons for LXX / GNT / GEZ. Each language has its own,
// independent lexicon — we never merge across languages (matches the user's
// stated requirement that every language has its own lexicon).
//
// All three endpoints share the same shape; only the underlying DB differs.
// They are gated on src.has_tokens — the `tokens` and `surface_counts`
// tables are populated by scripts/tokenize-multilang.cjs. If they're missing
// (e.g. the user hasn't run the tokenizer yet), the endpoint returns a 503
// with a hint telling them how to fix it, rather than a confusing 500.

function _requireTokenized(req, res) {
    const src = getSource(req.params.src);
    if (!src)           { res.status(404).json({ error: `unknown source: ${req.params.src}` });        return null; }
    if (!src.available) { res.status(503).json({ error: `source ${src.id} not available`, hint: `run scripts/ingest-refs.cjs` }); return null; }
    if (!src.has_tokens){ res.status(503).json({ error: `source ${src.id} not tokenized yet`, hint: `run scripts/tokenize-multilang.cjs` }); return null; }
    return src;
}

// GET /api/source/:src/lexicon/curated
// Curated lexicon entries from greek-/geez-lexicon.json. Each row is the
// minimum the Lexicon page needs to render: the surface, its transliteration
// (computed from the corpus, not stored in JSON), the gloss string, and the
// corpus occurrence count. Heuristic root comes from the DB, not the JSON.
app.get('/api/source/:src/lexicon/curated', production.cache(60), (req, res) => {
    const src = _requireTokenized(req, res); if (!src) return;
    try {
        const c = _loadGlosses(src.script);
        const out = [];
        const stmt = src.handle.prepare(`SELECT word_display, word_translit, word_root, count FROM surface_counts WHERE word_norm = ?`);
        for (const [key, gloss] of Object.entries(c.entries)) {
            const sc = stmt.get(key);
            out.push({
                word:      sc?.word_display || key,
                word_norm: key,
                tl:        sc?.word_translit || null,
                root:      sc?.word_root || null,
                def:       gloss,
                count:     sc?.count || 0,
                type:      'lexicon',
            });
        }
        out.sort((a, b) => a.word_norm.localeCompare(b.word_norm));
        res.json({ source: src.id, script: src.script, entries: out });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Distinct heuristic roots with aggregated counts and the most-frequent
// surface that maps to each root. Powers the "All Roots" tab for Greek/Ge'ez.
app.get('/api/source/:src/lexicon/roots', production.cache(60), (req, res) => {
    const src = _requireTokenized(req, res); if (!src) return;
    try {
        const rows = src.handle.prepare(`
            SELECT word_root AS root,
                   SUM(count) AS count,
                   COUNT(*)   AS surface_count,
                   (SELECT word_display FROM surface_counts sc2
                     WHERE sc2.word_root = sc1.word_root
                     ORDER BY count DESC LIMIT 1) AS top_surface,
                   (SELECT word_translit FROM surface_counts sc2
                     WHERE sc2.word_root = sc1.word_root
                     ORDER BY count DESC LIMIT 1) AS top_translit
            FROM surface_counts sc1
            WHERE word_root IS NOT NULL AND word_root != ''
            GROUP BY word_root
            ORDER BY word_root
        `).all();
        const out = rows.map(r => ({
            word:          r.top_surface,
            word_norm:     r.root,
            root:          r.root,
            tl:            r.top_translit,
            count:         r.count,
            surface_count: r.surface_count,
            type:          'root',
        }));
        res.json({ source: src.id, script: src.script, entries: out });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/source/:src/lexicon/list', production.cache(60), (req, res) => {
    const src = _requireTokenized(req, res); if (!src) return;
    try {
        const q = (req.query.q || '').trim();
        const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
        const limit  = Math.min(60000, Math.max(1, parseInt(req.query.limit, 10) || 200));
        // word_norm is the collation key; word_display is the most-frequent
        // surface form to render. Sorting by word_norm gives the standard
        // alphabetical view; the React side adds the letter-rail anchors.
        const rows = q
            ? src.handle.prepare(`
                SELECT word_norm, word_display, word_translit, word_root, count, book_count
                FROM surface_counts
                WHERE word_norm LIKE ? OR word_display LIKE ? OR word_translit LIKE ?
                ORDER BY word_norm
                LIMIT ? OFFSET ?
              `).all(`%${q}%`, `%${q}%`, `%${q}%`, limit, offset)
            : src.handle.prepare(`
                SELECT word_norm, word_display, word_translit, word_root, count, book_count
                FROM surface_counts
                ORDER BY word_norm
                LIMIT ? OFFSET ?
              `).all(limit, offset);
        const totalRow = q
            ? src.handle.prepare(`SELECT COUNT(*) AS n FROM surface_counts WHERE word_norm LIKE ? OR word_display LIKE ? OR word_translit LIKE ?`).get(`%${q}%`, `%${q}%`, `%${q}%`)
            : src.handle.prepare(`SELECT COUNT(*) AS n FROM surface_counts`).get();
        // Augment each row with curated flag based on JSON presence. This is
        // a tiny O(n) loop over the in-memory gloss map — cheap even at the
        // 30k-row max limit.
        const glossCache = _loadGlosses(src.script);
        res.json({
            source: src.id,
            script: src.script,
            total: totalRow.n,
            offset, limit,
            surfaces: rows.map(r => ({
                surface:         r.word_display,
                word_norm:       r.word_norm,
                transliteration: r.word_translit,
                root:            r.word_root,
                count:           r.count,
                book_count:      r.book_count,
                curated:         !!glossCache.entries[r.word_norm],
            })),
        });
    } catch (e) {
        console.error(`/api/source/${src.id}/lexicon/list failed:`, e);
        res.status(500).json({ error: e.message });
    }
});

// GET /api/source/:src/lexicon/word?word=X
// Word detail: surface, normalized form, total occurrences, per-book breakdown,
// first 100 verse references for the inline preview.
// ── PER-LANGUAGE GLOSS / LEXICON OVERLAY ────────────────────────────────────
// The Greek and Ge'ez lexicons live in server/lexicon/{greek,geez}-lexicon.json.
// Format mirrors Hebrew's lexicon.json: a flat object of
//   { "<word_norm>": "<gloss string>", ... }
// Top-level keys starting with "_" (like "_doc") are ignored. We also tolerate
// the legacy { entries: { word: { gloss, root, pos, notes } } } shape that
// earlier turns of this work shipped — only the `gloss` field is read; root /
// pos / notes are dropped (root + pos come from the DB, notes aren't surfaced
// in the UI).
const _glossCache = {
    greek:          { mtime: 0, entries: null },
    ethiopic:       { mtime: 0, entries: null },
    latin:          { mtime: 0, entries: null },
    syriac:         { mtime: 0, entries: null },
    coptic:         { mtime: 0, entries: null },
    'paleo-hebrew': { mtime: 0, entries: null },   // corpus-Hebrew (HEB), distinct from BHS
};
function _glossFileFor(script) {
    if (script === 'greek')        return path.join(__dirname, 'lexicon', 'greek-lexicon.json');
    if (script === 'ethiopic')     return path.join(__dirname, 'lexicon', 'geez-lexicon.json');
    if (script === 'latin')        return path.join(__dirname, 'lexicon', 'latin-lexicon.json');
    if (script === 'syriac')       return path.join(__dirname, 'lexicon', 'syriac-lexicon.json');
    if (script === 'coptic')       return path.join(__dirname, 'lexicon', 'coptic-lexicon.json');
    if (script === 'paleo-hebrew') return path.join(__dirname, 'lexicon', 'hebrew-extra-lexicon.json');
    return null;
}
// Ge'ez/Ethiopic word separators & terminal punctuation — wordspace ፡ (U+1361),
// full stop ። (U+1362), and the comma/colon/section marks in U+1360–U+1368 — are
// orthography, not part of the lexeme, and the corpus normalizes them away (see
// _normGez). So a lexicon key copied straight off the page WITH a trailing
// wordspace (e.g. "አነ፡") must resolve to the bare token "አነ". Strip them for
// matching. (U+135D–U+135F gemination/combining marks are NOT punctuation and
// are deliberately preserved.)
function _ethiopicNorm(s) {
    return String(s || '').replace(/[\u1360-\u1368]/g, '').trim();
}
// Greek grave accents are positional. Lexically a grave-accented word is the
// same as its acute form, so we normalize via NFD: replace combining grave
// (U+0300) with combining acute (U+0301), then NFC. This is for LOOKUP only;
// the displayed surface keeps its original grave.
function _greekAcuteNorm(s) {
    return s.normalize('NFD').replace(/\u0300/g, '\u0301').normalize('NFC');
}

// Square (modern/Aramaic) Hebrew → Paleo (U+10900), mirroring lib/hebrewPaleo.js:
// the 22 consonants map 1:1, the 5 final forms fold to their base, niqqud /
// cantillation / maqaf / sof-pasuq (U+0591–U+05C7) are dropped, and anything
// already Paleo (or a space) passes through — so it is IDEMPOTENT. The app is
// Paleo-only: lexicons key on Paleo, so the Hebrew gloss/copy key must be Paleo
// too. This converts whether or not the corpus text was ingested as Paleo.
const _HEB_TO_PALEO = (() => {
    const base = 'אבגדהוזחטיכלמנסעפצקרשת';
    const paleo = [...'𐤀𐤁𐤂𐤃𐤄𐤅𐤆𐤇𐤈𐤉𐤊𐤋𐤌𐤍𐤎𐤏𐤐𐤑𐤒𐤓𐤔𐤕'];
    const m = {};
    [...base].forEach((h, i) => { m[h] = paleo[i]; });
    for (const [fin, b] of Object.entries({ 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' })) m[fin] = m[b];
    return m;
})();
function _squareToPaleo(s) {
    let out = '';
    for (const ch of String(s || '')) {
        if (_HEB_TO_PALEO[ch]) { out += _HEB_TO_PALEO[ch]; continue; }
        const cp = ch.codePointAt(0);
        if (cp >= 0x0591 && cp <= 0x05C7) continue;   // niqqud / cantillation / maqaf / sof-pasuq
        out += ch;
    }
    return out;
}

// ── Canonical gloss / copy key — ONE source of truth ────────────────────────
// The string that resolves a word's gloss must be EXACTLY the string the reader
// copies, so a word copied from any language Ctrl-F-matches its lexicon key. The
// key = surface with sentence punctuation + editorial brackets removed and, for
// Greek, positional grave accents folded to acute (καὶ → καί, μου. → μου). Case
// is PRESERVED so curated Καί ("and(Heb Waw)") and καί ("and / also / even")
// remain distinct entries. Used for (a) gloss lookup, (b) the per-token gloss_key
// the client copies, and (c) the lexicon key aliasing in _loadGlosses — so all
// three always agree.
const _STOPS = /[\u1360-\u1368\u00B7.,:;!?\u037E\u0387\u2026\u2024\[\]\u27e6\u27e7\u2e22\u2e23\u2e24\u2e25\u230a\u230b]/g;
function _canonKey(script, s) {
    let w = String(s || '').normalize('NFC').replace(_STOPS, '').trim();
    if (script === 'greek')    w = _greekAcuteNorm(w);
    if (script === 'ethiopic') w = _ethiopicNorm(w);
    // The app is Paleo-only: a Hebrew gloss/copy key is ALWAYS Paleo, so a Paleo
    // lexicon resolves and the (Paleo) copy equals the key — no modern Hebrew.
    if (script === 'paleo-hebrew' || script === 'hebrew') w = _squareToPaleo(w);
    return w;
}
function _loadGlosses(script) {
    const file = _glossFileFor(script);
    if (!file || !fs.existsSync(file)) {
        _glossCache[script] = { mtime: 0, entries: {} };
        return _glossCache[script];
    }
    const st = fs.statSync(file);
    if (_glossCache[script].mtime === st.mtimeMs) return _glossCache[script];
    try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        const entries = {};
        // Legacy nested shape: { entries: { word: {gloss, ...} } }
        if (raw && typeof raw === 'object' && raw.entries && typeof raw.entries === 'object') {
            for (const [k, v] of Object.entries(raw.entries)) {
                if (typeof v === 'string')                 entries[k] = v;
                else if (v && typeof v.gloss === 'string') entries[k] = v.gloss;
            }
        }
        // Simple flat shape: { word: "gloss", ... }, ignoring "_doc" etc.
        for (const [k, v] of Object.entries(raw || {})) {
            if (k.startsWith('_') || k === 'entries') continue;
            if (typeof v === 'string')                 entries[k] = v;
            else if (v && typeof v.gloss === 'string') entries[k] = v.gloss;
        }
        // Index every key by its CANONICAL form too (punctuation stripped, Greek
        // grave→acute) so a key saved with trailing punctuation (μου.) or a
        // positional grave (καὶ) still matches the canonical token. This is the
        // runtime safety net; the lexicon files themselves can be cleaned with
        // migrate-clean-lexicon-keys.js. Real keys always win over aliases.
        for (const [k, v] of Object.entries({ ...entries })) {
            const n = _canonKey(script, k);
            if (n && n !== k && !(n in entries)) entries[n] = v;
        }
        _glossCache[script] = { mtime: st.mtimeMs, entries };
    } catch (e) {
        console.error(`[gloss:${script}] parse failed:`, e.message);
        _glossCache[script] = { mtime: st.mtimeMs, entries: {} };
    }
    return _glossCache[script];
}

/**
 * Resolve a surface to its English gloss string. Returns null if not curated.
 * For Greek we also try the grave→acute normalized form so contextual grave
 * accents (καὶ, θεὸς, τὸν) match acute-accented lexicon entries.
 */
function _lookupGloss(script, word_norm) {
    const c = _loadGlosses(script);
    const direct = c.entries[word_norm];
    if (typeof direct === 'string') return direct;
    if (script === 'greek') {
        const acute = _greekAcuteNorm(word_norm);
        if (acute !== word_norm && typeof c.entries[acute] === 'string') {
            return c.entries[acute];
        }
    }
    if (script === 'ethiopic') {
        const bare = _ethiopicNorm(word_norm);
        if (bare !== word_norm && typeof c.entries[bare] === 'string') return c.entries[bare];
    }
    return null;
}

app.get('/api/source/:src/lexicon/word', production.cache(60), (req, res) => {
    const src = _requireTokenized(req, res); if (!src) return;
    try {
        const word = (req.query.word || '').trim();
        if (!word) return res.status(400).json({ error: 'word param required' });
        const nfc = word.normalize('NFC');
        const candidates = src.script === 'greek'
            ? [nfc, nfc.toLowerCase()]
            : [nfc];
        let sc = null;
        for (const c of candidates) {
            sc = src.handle.prepare(`SELECT * FROM surface_counts WHERE word_norm = ?`).get(c);
            if (sc) break;
        }
        if (!sc) return res.status(404).json({ error: 'word not in corpus', word });

        // Per-book breakdown
        const byBook = src.handle.prepare(`
            SELECT book_id, COUNT(*) AS n
            FROM tokens WHERE word_norm = ?
            GROUP BY book_id ORDER BY book_id
        `).all(sc.word_norm);

        // First 100 verse references (preview)
        const sample = src.handle.prepare(`
            SELECT t.ref_key, t.book_id, t.chapter, t.verse, t.ord, v.text
            FROM tokens t
            JOIN verses v ON v.ref_key = t.ref_key
            WHERE t.word_norm = ?
            ORDER BY t.book_id, t.chapter, t.verse, t.ord
            LIMIT 100
        `).all(sc.word_norm);

        // Other surfaces sharing the same heuristic root (lemma-family hint)
        // Cap the list — for very common roots like "the" this can be 100+
        // entries; we don't want to balloon the response payload.
        const rootSiblings = sc.word_root
            ? src.handle.prepare(`
                SELECT word_norm, word_display, word_translit, count
                FROM surface_counts
                WHERE word_root = ? AND word_norm != ?
                ORDER BY count DESC
                LIMIT 25
              `).all(sc.word_root, sc.word_norm)
            : [];

        const gloss = _lookupGloss(src.script, sc.word_norm);

        res.json({
            source:          src.id,
            script:          src.script,
            word:            sc.word_display,
            word_norm:       sc.word_norm,
            transliteration: sc.word_translit,
            root:            sc.word_root,
            gloss,
            count:           sc.count,
            book_count:      sc.book_count,
            by_book:         byBook,
            root_siblings:   rootSiblings,
            sample,
        });
    } catch (e) {
        console.error(`/api/source/${src.id}/lexicon/word failed:`, e);
        res.status(500).json({ error: e.message });
    }
});

// GET /api/source/:src/lexicon/verses?word=X[&book=N&offset=0&limit=200]
// Paginated occurrence list. Used when the user wants ALL verses with the
// word, optionally filtered to a single book.
app.get('/api/source/:src/lexicon/verses', production.cache(60), (req, res) => {
    const src = _requireTokenized(req, res); if (!src) return;
    try {
        const word = (req.query.word || '').trim();
        if (!word) return res.status(400).json({ error: 'word param required' });
        const bookId = req.query.book ? parseInt(req.query.book, 10) : null;
        const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
        const limit  = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 200));
        const nfc = word.normalize('NFC');
        const wn  = src.script === 'greek' ? nfc.toLowerCase() : nfc;
        // Always GROUP BY ref_key so multiple occurrences in one verse don't
        // duplicate the row in the list.
        const sql = bookId == null
            ? `SELECT t.ref_key, t.book_id, t.chapter, t.verse, COUNT(*) AS n_in_verse, v.text
               FROM tokens t JOIN verses v ON v.ref_key = t.ref_key
               WHERE t.word_norm = ?
               GROUP BY t.ref_key
               ORDER BY t.book_id, t.chapter, t.verse LIMIT ? OFFSET ?`
            : `SELECT t.ref_key, t.book_id, t.chapter, t.verse, COUNT(*) AS n_in_verse, v.text
               FROM tokens t JOIN verses v ON v.ref_key = t.ref_key
               WHERE t.word_norm = ? AND t.book_id = ?
               GROUP BY t.ref_key
               ORDER BY t.book_id, t.chapter, t.verse LIMIT ? OFFSET ?`;
        const verses = bookId == null
            ? src.handle.prepare(sql).all(wn, limit, offset)
            : src.handle.prepare(sql).all(wn, bookId, limit, offset);
        const totalRow = bookId == null
            ? src.handle.prepare(`SELECT COUNT(DISTINCT ref_key) AS n FROM tokens WHERE word_norm = ?`).get(wn)
            : src.handle.prepare(`SELECT COUNT(DISTINCT ref_key) AS n FROM tokens WHERE word_norm = ? AND book_id = ?`).get(wn, bookId);
        res.json({
            source: src.id,
            word,
            total: totalRow.n,
            offset, limit,
            verses,
        });
    } catch (e) {
        console.error(`/api/source/${src.id}/lexicon/verses failed:`, e);
        res.status(500).json({ error: e.message });
    }
});

// GET /api/tokens?book=1&chapter=1
// Queries the DB, parses, and returns rendered word components
// ── FAST /api/tokens PATH ──────────────────────────────────────────────────
// The original handler called parseHebrewData on every request — that's
// ~8 ms per Gen-1 chapter just for the parse.  Since surface-index.db
// already has every distinct word_raw parsed (100% coverage at build time),
// we can skip the parser entirely on the hot path and just read pre-parsed
// `components` JSON straight from the DB.  Measured: 2-3 ms per chapter,
// a 3.85× speedup, with the same response shape.
//
// The grouping rules from parseHebrewData are preserved by groupSurfaceTokens
// below: standalone particles (prep/conj/art) accumulate into "pending" then
// fold into the next non-particle token's word block — exactly what the
// original parser produces.  Non-surface-index tokens (shouldn't happen, but
// defensive) fall through to live parseHebrewData.
// LEFT JOIN (not INNER): punctuation occurrences (pos='punct') have no
// token_surfaces row at all — a mark has no morphology to parse — so an
// INNER JOIN silently dropped every one of them, leaving groupSurfaceTokens
// with zero visibility into punctuation and no way to replicate
// parseHebrewData's maqaf-driven fusion of a construct pair that shares one
// Strong's number (Deut 6:2's ben-binkha, both H1121). Select the
// OCCURRENCE's own pos/morph/strongs (not t.*) so a punct row still reports
// pos='punct' correctly even with t.* all NULL; for a matched (non-punct)
// row these are identical to t.pos/t.morph/t.strongs by the join condition.
const SURF_ROWS = surfDb.prepare(`
    SELECT o.verse, o.token_ordinal, o.word_raw,
           ${SURF_HAS_SOURCE ? 'o.source' : `'BHS' AS source`},
           t.components, o.strongs, o.pos, o.morph
    FROM   surface_occurrences o
    LEFT JOIN token_surfaces   t ON t.word_raw = o.word_raw ${OCC_SN_JOIN} ${SRC_JOIN}
    WHERE  o.book_id = ? AND o.chapter = ?${SURF_HAS_SOURCE ? '\n      AND  o.source = ?' : ''}
    ORDER BY o.verse, o.token_ordinal
`);

// Which edition should the index serve for this request? Mirrors tokenQueryFor's
// rule — an EXPLICIT source wins, otherwise the book decides — but answers from
// what the index actually contains, so a partial bake yields zero rows and drops
// to the live parser instead of quietly serving the other edition's text.
// Does /api/tokens actually have a token stream for this language and book?
// Answered from the index's own coverage, then from the token tables — never
// from a hardcoded list, so a newly baked edition lights up on its own.
// Returns the canonical source name to pass to /api/tokens, or '' for none.
function hebSourceHasTokens(lang, bookId) {
    const s = String(lang || '').toUpperCase();
    const name = (s === 'HEBREW' || s === '') ? 'BHS' : s;
    if (name !== 'BHS' && name !== 'HEB') return '';
    if (SURF_HAS_SOURCE && SURF_SOURCE_BOOKS.get(name)?.has(bookId)) return name;
    // Index not baked for this book yet — /api/tokens still live-parses from the
    // token tables, so check those before giving up on the richer render.
    try {
        const rows = tokenQueryFor(bookId, name).all(bookId, 1);
        if (rows && rows.length) return name;
    } catch { /* fall through */ }
    return '';
}

function surfaceSourceFor(bookId, source) {
    if (!SURF_HAS_SOURCE) return null;
    const s = String(source || '').toUpperCase();
    if (s === 'HEB' || s === 'BHS') return s;
    if (SURF_SOURCE_BOOKS.get('BHS')?.has(bookId)) return 'BHS';
    if (SURF_SOURCE_BOOKS.get('HEB')?.has(bookId)) return 'HEB';
    return 'BHS';
}

// Single call site for the fast path, so the extra bound parameter exists only
// when the schema does.
function surfRowsFor(bookId, chapter, source) {
    return SURF_HAS_SOURCE
        ? SURF_ROWS.all(bookId, chapter, source)
        : SURF_ROWS.all(bookId, chapter);
}

// ── ROOT EXPLORER QUERIES ──────────────────────────────────────────────────
// Surface-index based root aggregation. The pre-built `root_paleo` column on
// token_surfaces gives us a clean mapping from surface form to canonical root,
// and JOIN to surface_occurrences gives accurate per-root token counts.
//
// These statements drive the new /api/root-explorer/* endpoints which replace
// the old buildNavIndexes scheme. Benefits:
//   - Counts match the actual corpus exactly (e.g. Ab/H1 = 1236, was 48)
//   - Roots are 2-4 paleo chars by definition (we filter at the SQL layer)
//   - No 1-second startup penalty rebuilding 24k surfaces in memory

// Build the full alphabetized root list with per-root totals.
// Used by /api/root-explorer/list (the sidebar of the React Root page).
const ROOTS_LIST = surfDb.prepare(`
    SELECT t.root_paleo,
           GROUP_CONCAT(DISTINCT t.strongs) AS strongs,
           COUNT(*)                        AS occ
    FROM   token_surfaces t
    JOIN   surface_occurrences o ON o.word_raw = t.word_raw ${OCC_SN_JOIN} ${SRC_JOIN}
    WHERE  t.root_paleo IS NOT NULL AND t.root_paleo != ''
    GROUP BY t.root_paleo
`);

// Per-root: every surface form that maps to it, with its strongs and total count
const ROOT_SURFACES = surfDb.prepare(`
    SELECT t.word_raw, t.strongs, t.pos, t.morph,
           COUNT(o.word_raw) AS occ
    FROM   token_surfaces t
    JOIN   surface_occurrences o ON o.word_raw = t.word_raw ${OCC_SN_JOIN} ${SRC_JOIN}
    WHERE  t.root_paleo = ?
    GROUP BY t.word_raw, t.strongs, t.pos, t.morph
    ORDER BY occ DESC
`);

// Per-root: total tokens by book (for the "by-book breakdown" panel)
const ROOT_BY_BOOK = surfDb.prepare(`
    SELECT o.book_id, COUNT(*) AS occ
    FROM   surface_occurrences o
    JOIN   token_surfaces      t ON t.word_raw = o.word_raw ${OCC_SN_JOIN} ${SRC_JOIN}
    WHERE  t.root_paleo = ?
    GROUP BY o.book_id
    ORDER BY occ DESC, o.book_id
`);

// Per-root verse occurrences, paginated. Used to drive the BibleHub-style
// verse-list panel. Returns book/chapter/verse + the matching token_ordinal
// so the UI can highlight the exact token in its verse.
// Gloss Studio's "root-verses" drill-down, source-aware. 'HEB' is a flat
// single-source rule (fine to filter/paginate in SQL). 'BHS' means "this
// book's NATURAL edition" — a mix of BHS rows for canonical books and HEB
// rows for everything else (same rule getGlossCoverage() uses) — that mix
// can't be expressed as one o.source bind, so the BHS path fetches every
// row for the root (unbounded LIMIT is safe here: it's ONE root, not the
// whole corpus) and filters/paginates in JS instead.
const ROOT_VERSES_ALL = surfDb.prepare(`
    SELECT o.book_id, o.chapter, o.verse, o.token_ordinal, o.word_raw, o.source, t.strongs
    FROM   surface_occurrences o
    JOIN   token_surfaces      t ON t.word_raw = o.word_raw ${OCC_SN_JOIN} ${SRC_JOIN}
    WHERE  t.root_paleo = ?
    ORDER BY o.book_id, o.chapter, o.verse, o.token_ordinal
`);
const ROOT_VERSES_HEB = surfDb.prepare(`
    SELECT o.book_id, o.chapter, o.verse, o.token_ordinal, o.word_raw, t.strongs
    FROM   surface_occurrences o
    JOIN   token_surfaces      t ON t.word_raw = o.word_raw ${OCC_SN_JOIN} ${SRC_JOIN}
    WHERE  t.root_paleo = ?
      AND  o.source = 'HEB'
    ORDER BY o.book_id, o.chapter, o.verse, o.token_ordinal
    LIMIT ? OFFSET ?
`);
const ROOT_VERSES_HEB_COUNT = surfDb.prepare(`
    SELECT COUNT(*) AS n
    FROM   surface_occurrences o
    JOIN   token_surfaces      t ON t.word_raw = o.word_raw ${OCC_SN_JOIN} ${SRC_JOIN}
    WHERE  t.root_paleo = ?
      AND  o.source = 'HEB'
`);

// Per-surface (exact word_raw match) — used by the Surfaces page.
const SURFACE_BY_BOOK = surfDb.prepare(`
    SELECT book_id, COUNT(*) AS occ
    FROM   surface_occurrences
    WHERE  word_raw = ?${SRC_BHS_ONLY}
    GROUP BY book_id
    ORDER BY occ DESC, book_id
`);
const SURFACE_VERSES = surfDb.prepare(`
    SELECT book_id, chapter, verse, token_ordinal
    FROM   surface_occurrences
    WHERE  word_raw = ?${SRC_BHS_ONLY}
      AND  (? IS NULL OR book_id = ?)
    ORDER BY book_id, chapter, verse, token_ordinal
    LIMIT ? OFFSET ?
`);
const SURFACE_VERSES_COUNT = surfDb.prepare(`
    SELECT COUNT(*) AS n
    FROM   surface_occurrences
    WHERE  word_raw = ?${SRC_BHS_ONLY}
      AND  (? IS NULL OR book_id = ?)
`);
const SURFACE_INFO = surfDb.prepare(`
    SELECT word_raw, root_paleo, strongs, all_strongs, pos, morph, components
    FROM   token_surfaces
    WHERE  word_raw = ?${SRC_BHS_ONLY}
`);

// ── GLOSS STUDIO (Hebrew) ────────────────────────────────────────────────────
// Admin-only curation dashboard, deliberately the opposite of the one-shot
// batch scripts from earlier tonight: nothing here writes lexicon.json. It
// only ever READS the current file, live, so it can tell you (a) which roots
// most need a curated entry, ranked by how many times a reader will actually
// hit them, and (b) how much of each book/chapter/verse is glossed already.
// Add an entry in lexicon.json by hand and it drops off /missing and the
// coverage % ticks up on the very next request — no separate report to
// regenerate, because there IS no separate report; this recomputes from the
// live surface index + the live lexicon.json every time the underlying files
// change (mtime-keyed cache below), matching the file's existing hot-reload
// behaviour everywhere else in this server.

// One row per SURFACE OCCURRENCE (not per distinct word) — so % glossed
// reflects real reading volume, not vocabulary size.
//
// UNFILTERED BY SOURCE ON PURPOSE. surface_occurrences carries BOTH the BHS
// (Masoretic) and HEB (this project's Hebraized edition — which ALSO spans
// the OT, plus the NT and extra-canonical works like Jubilees/Jasher/Book of
// Melchizedek that BHS never covers) rows for the same OT verse. Filtering
// to one edition made the count match neither (a hardcoded "BHS-only"
// default silently hid Jubilees/Jasher entirely — the exact books
// Translation Studio's sidebar shows). Instead: fetch both editions, then in
// getGlossCoverage keep ONLY each book's NATURAL edition (BHS if BHS covers
// it, else HEB) — the same "whatever BHS covers is BHS's, the remainder is
// HEB's" rule navHebBooks() already uses. Counts each occurrence exactly
// once, and surfaces every book with Hebrew material, not just the 39
// canonical OT ones.
const GLOSS_COVERAGE_ROWS = surfDb.prepare(`
    SELECT o.book_id, o.chapter, o.verse, o.source, t.root_paleo, t.pos, t.strongs
    FROM   surface_occurrences o
    JOIN   token_surfaces      t ON t.word_raw = o.word_raw ${OCC_SN_JOIN} ${SRC_JOIN}
    WHERE  t.root_paleo IS NOT NULL AND t.root_paleo != ''
`);

// Same join, scoped to ONE verse — powers _verseMissingDirect below, which
// exists so opening a single verse in Gloss Studio never has to touch the
// whole-corpus GLOSS_COVERAGE_ROWS scan (up to ~1M rows) just to find out
// which of THIS verse's handful of words lack a curated gloss.
const GLOSS_VERSE_ROWS = surfDb.prepare(`
    SELECT t.root_paleo, t.pos, t.strongs
    FROM   surface_occurrences o
    JOIN   token_surfaces      t ON t.word_raw = o.word_raw ${OCC_SN_JOIN} ${SRC_JOIN}
    WHERE  t.root_paleo IS NOT NULL AND t.root_paleo != ''
      AND  o.book_id = ? AND o.chapter = ? AND o.verse = ? AND o.source = ?
`);

// Same join as GLOSS_COVERAGE_ROWS, but GROUP BY collapses it to one row per
// (book, chapter, verse) INSIDE SQLite before anything crosses into JS — a
// few tens of thousands of rows instead of up to ~1M. This is what makes
// book/chapter/verse NAVIGATION independent of the expensive per-token
// glossed-status pass entirely: it doesn't need to know whether any word is
// glossed, just that a verse exists and how many root-bearing words it has.
// fieldy, 2026-08-11, staring at a blank Books pane on refresh: "the books
// and chapters are not going to change so why does it take so long to
// load?" — this query is the answer: it only touches surface-index.db
// (via getGlossStructure's own stamp key below), never lexicon.json, so
// editing lexicon.json while curating never invalidates it.
const GLOSS_STRUCTURE_ROWS = surfDb.prepare(`
    SELECT o.book_id, o.chapter, o.verse, COUNT(*) AS total
    FROM   surface_occurrences o
    JOIN   token_surfaces      t ON t.word_raw = o.word_raw ${OCC_SN_JOIN} ${SRC_JOIN}
    WHERE  t.root_paleo IS NOT NULL AND t.root_paleo != '' AND o.source = ?
    GROUP BY o.book_id, o.chapter, o.verse
`);

let _glossStructureCache = null;   // { trees: {BHS,HEB}, stamp }
let _glossStructureRecomputing = false;

// Only surface-index.db's own mtime — deliberately NOT lexicon.json/
// homographs.json/hebrew-extra-lexicon.json (contrast _glossStudioStampKey
// below, which tracks all four). Which verses exist, and how many
// root-bearing words each has, doesn't change when a gloss is curated —
// only surface-index.db being REBUILT (a real redeploy) changes it. This is
// what makes the structure cache effectively permanent during normal
// operation instead of thrashing on every lexicon.json save.
function _glossStructureStampKey() {
    try { return String(fs.statSync(path.join(__dirname, 'surface-index.db')).mtimeMs); } catch { return '0'; }
}

function _buildGlossStructureTrees() {
    const bhsBooks = SURF_SOURCE_BOOKS.get('BHS') || new Set();
    // book_id -> chapter -> verse -> total
    const trees = { BHS: new Map(), HEB: new Map() };
    const bump = (tree, book_id, chapter, verse, total) => {
        let bk = tree.get(book_id); if (!bk) { bk = new Map(); tree.set(book_id, bk); }
        let ch = bk.get(chapter); if (!ch) { ch = new Map(); bk.set(chapter, ch); }
        ch.set(verse, total);
    };
    for (const source of ['BHS', 'HEB']) {
        for (const r of GLOSS_STRUCTURE_ROWS.all(source)) {
            if (source === 'HEB') bump(trees.HEB, r.book_id, r.chapter, r.verse, r.total);
            const natural = bhsBooks.has(r.book_id) ? 'BHS' : 'HEB';
            if (source === natural) bump(trees.BHS, r.book_id, r.chapter, r.verse, r.total);
        }
    }
    return trees;
}

// Same stale-while-revalidate shape as the coverage caches below, but since
// the stamp key never changes during normal curation (see above), this is,
// in practice, computed once per server process and then served forever.
function getGlossStructure() {
    const stamp = _glossStructureStampKey();
    if (_glossStructureCache) {
        if (_glossStructureCache.stamp !== stamp && !_glossStructureRecomputing) {
            _glossStructureRecomputing = true;
            setImmediate(() => {
                try {
                    _glossStructureCache = { trees: _buildGlossStructureTrees(), stamp };
                } catch (e) {
                    console.error('[gloss-studio] background structure rebuild failed:', e);
                } finally {
                    _glossStructureRecomputing = false;
                }
            });
        }
        return _glossStructureCache;
    }
    _glossStructureCache = { trees: _buildGlossStructureTrees(), stamp };
    return _glossStructureCache;
}

let _glossCoverageCache = null;   // { books, roots, stamp }

// surface-index.db content (which words exist, at all) and all THREE curated
// gloss sources (lexicon.json, homographs.json, hebrew-extra-lexicon.json)
// affect the answer — rebuild if any of the four changes. Previously only
// lexicon.json's mtime was tracked, so editing homographs.json or
// hebrew-extra-lexicon.json silently served a stale coverage tree.
function _glossStudioStampKey() {
    let a = 0, b = 0, c = 0, d = 0;
    try { a = fs.statSync(path.join(__dirname, 'surface-index.db')).mtimeMs; } catch { /* missing is fine, stamp 0 */ }
    try { b = fs.statSync(path.join(__dirname, 'lexicon', 'lexicon.json')).mtimeMs; } catch { /* same */ }
    try { c = fs.statSync(path.join(__dirname, 'lexicon', 'homographs.json')).mtimeMs; } catch { /* same */ }
    try { d = fs.statSync(path.join(__dirname, 'lexicon', 'hebrew-extra-lexicon.json')).mtimeMs; } catch { /* same */ }
    return `${a}|${b}|${c}|${d}`;
}

// Mirrors reGlossOne's (server.js, ~line 5661) live re-gloss priority chain
// EXACTLY, minus the final GRAMMAR_MAP fallback: Gloss Studio exists to track
// what's covered by the user's OWN curated sources — lexicon.json,
// homographs.json, hebrew-extra-lexicon.json — not the hardcoded built-in
// particle table. A word that only resolves via GRAMMAR_MAP renders fine in
// the reader but still counts as "missing" here, which is intentional: it's
// exactly the kind of entry the user wants surfaced so they can curate it by
// hand instead of leaning on the fallback.
//   candidates (in order): `${paleo}_H<sn>`, `${paleo}_<posLong>`, bare paleo
//   POS_STRICT (inrg): homograph candidates ONLY — no bare/lexicon fallback,
//   because the bare paleo answers a DIFFERENT part of speech (𐤄 bare =
//   article "The", not the interrogative).
const GS_POS_LONG = { prep: 'preposition', conj: 'conjunction', art: 'article', nega: 'negative', inrg: 'interrogative' };
const GS_POS_STRICT = new Set(['inrg']);

function gsIsGlossed(root_paleo, pos, strongs, lexicon, homographs, hebExtra) {
    const candidates = [];
    const ownSn = strongs ? 'H' + String(strongs).replace(/^H+/, '') : null;
    if (ownSn) candidates.push(`${root_paleo}_${ownSn}`);
    const posLong = GS_POS_LONG[pos];
    if (posLong) candidates.push(`${root_paleo}_${posLong}`);

    if (GS_POS_STRICT.has(pos)) {
        return candidates.some(k => !!homographs[k]);
    }

    candidates.push(root_paleo);
    if (candidates.some(k => !!homographs[k])) return true;
    if (lexicon[root_paleo]) return true;
    if (hebExtra[root_paleo]) return true;
    return false;
}

// Missing-gloss roots for ONE verse, computed directly from that verse's own
// rows via GLOSS_VERSE_ROWS — NOT from the whole-corpus coverage tree.
// O(words in this verse), always current against whatever's on disk right
// now (loadLexicons()' own in-memory cache is busted by the file watcher on
// every save, so this never lags). `source` here is the NATURAL-edition
// source id (see the /verse route below for how that's picked) — same rule
// _buildGlossCoverageTrees uses to decide BHS vs HEB per book.
function _verseMissingDirect(book_id, chapter, verse, source, lexicon, homographs, hebExtra) {
    const rows = GLOSS_VERSE_ROWS.all(book_id, chapter, verse, source);
    const out = [];
    for (const r of rows) {
        if (!gsIsGlossed(r.root_paleo, r.pos, r.strongs, lexicon, homographs, hebExtra)) out.push(r.root_paleo);
    }
    return out;
}

let _glossCoverageRecomputing = false;

function _buildGlossCoverageTrees() {
    const { lexicon, homographs, hebExtra } = loadLexicons();
    const bhsBooks = SURF_SOURCE_BOOKS.get('BHS') || new Set();

    // "Glossed" = covered by one of the three curated sources — lexicon.json,
    // homographs.json, hebrew-extra-lexicon.json — checked with the SAME
    // priority chain the reader's live re-gloss pass uses (gsIsGlossed,
    // mirroring reGlossOne). GRAMMAR_MAP is deliberately excluded: it's a
    // hardcoded fallback, not something the user curated, and this report
    // exists to find what still needs a real, hand-written entry.
    const isGlossed = (root_paleo, pos, strongs) =>
        gsIsGlossed(root_paleo, pos, strongs, lexicon, homographs, hebExtra);

    // Two independently selectable views, built in ONE pass over the rows:
    //   'BHS' — the Masoretic text for the 39 canonical books, HEB for
    //           everything BHS doesn't cover (Jubilees, Jasher, NT, etc.).
    //           This is "the received text as this app renders it" — same
    //           natural-edition rule navHebBooks() and the reader use.
    //   'HEB' — this project's OWN edition for every one of the 78 books it
    //           covers, INCLUDING the 39 canonical ones. A canonical book's
    //           HEB tokens can be genuinely different WORDS than its BHS
    //           tokens (this is a Hebraized re-translation, not a copy), so
    //           it needs its own, separately-audited coverage — the whole
    //           point of letting the user pick a source here.
    // book_id -> { total, glossed, chapters: Map(chapter -> { total, glossed, verses: Map(verse -> {total, glossed, missing: Set<root_paleo>}) }) }
    // root_paleo -> { occ, glossed } — drives the missing-words list
    const trees = {
        BHS: { books: new Map(), roots: new Map() },
        HEB: { books: new Map(), roots: new Map() },
    };

    const bump = (tree, r, glossed) => {
        let bk = tree.books.get(r.book_id);
        if (!bk) { bk = { total: 0, glossed: 0, chapters: new Map() }; tree.books.set(r.book_id, bk); }
        bk.total++; if (glossed) bk.glossed++;

        let ch = bk.chapters.get(r.chapter);
        if (!ch) { ch = { total: 0, glossed: 0, verses: new Map() }; bk.chapters.set(r.chapter, ch); }
        ch.total++; if (glossed) ch.glossed++;

        let vs = ch.verses.get(r.verse);
        if (!vs) { vs = { total: 0, glossed: 0, missing: new Set() }; ch.verses.set(r.verse, vs); }
        vs.total++;
        if (glossed) vs.glossed++; else vs.missing.add(r.root_paleo);

        let rt = tree.roots.get(r.root_paleo);
        if (!rt) { rt = { occ: 0, glossed }; tree.roots.set(r.root_paleo, rt); }
        rt.occ++;
        // A root can show glossed=true from one occurrence and false from
        // another only if isGlossed's inputs (pos) legitimately differ across
        // occurrences (rare); once ANY occurrence resolves it, don't let a
        // later miss re-flag it — favors "not actually missing" over noise.
        if (glossed) rt.glossed = true;
    };

    // .iterate(), NOT .all(). BHS+HEB combined is upwards of a million
    // occurrence rows — .all() materializes every one of them into a single
    // JS array before any reduction happens, which is exactly what crashed
    // production ("Statement::JS_all" in the OOM stack trace, heap limit hit
    // during a blue-green boot already under a tight startup memory cap).
    // .iterate() streams rows one at a time straight from SQLite, so peak
    // memory is just the aggregated Maps below, never a second full copy of
    // the raw row set sitting alongside them.
    for (const r of GLOSS_COVERAGE_ROWS.iterate()) {
        const glossed = isGlossed(r.root_paleo, r.pos, r.strongs);

        // BHS view: this book's natural edition only.
        const natural = bhsBooks.has(r.book_id) ? 'BHS' : 'HEB';
        if (r.source === natural) bump(trees.BHS, r, glossed);

        // HEB view: every book HEB itself has tokens for, via ITS OWN tokens
        // (independent of whichever edition is "natural" for that book).
        if (r.source === 'HEB') bump(trees.HEB, r, glossed);
    }

    return trees;
}

// Stale-while-revalidate. This tree used to be rebuilt SYNCHRONOUSLY, inline,
// on the very next request whenever lexicon.json's mtime had ticked since the
// last build — including a single verse's own /gloss-studio/verse fetch,
// which briefly depended on this function too (see that route's own comment:
// it no longer does). fieldy, 2026-08-11, watching Gloss Studio hang on
// "Loading verse…" for a plain verse open: "most important to get the
// referenced verse/token data and less important for the %s to be accurate
// in real time... the books and chapters are not going to change so why does
// it take so long for them to load?" So: once a tree exists, ALWAYS return it
// immediately — even if the underlying files have changed since — and kick a
// rebuild off in the background (setImmediate, guarded so only one rebuild
// runs at a time) so the NEXT request picks up fresh numbers instead of the
// CURRENT one paying full rebuild latency (a full iterate() over every
// Hebrew occurrence in the corpus, up to ~1M rows). Only the very first call
// after server boot (no cache yet) computes synchronously — unavoidable
// once, not on every lexicon.json save — and even that is pre-warmed at boot
// (see the setImmediate warm-up right after app.listen()) so it's normally
// already done before an admin ever opens the page.
function getGlossCoverage() {
    const stamp = _glossStudioStampKey();
    if (_glossCoverageCache) {
        if (_glossCoverageCache.stamp !== stamp && !_glossCoverageRecomputing) {
            _glossCoverageRecomputing = true;
            setImmediate(() => {
                try {
                    _glossCoverageCache = { trees: _buildGlossCoverageTrees(), stamp };
                } catch (e) {
                    console.error('[gloss-studio] background coverage rebuild failed:', e);
                } finally {
                    _glossCoverageRecomputing = false;
                }
            });
        }
        return _glossCoverageCache;
    }
    _glossCoverageCache = { trees: _buildGlossCoverageTrees(), stamp };
    return _glossCoverageCache;
}

const _glossPct = (glossed, total) => total ? Math.round((glossed / total) * 1000) / 10 : 0;

// ── GLOSS STUDIO — NON-HEBREW LANGUAGES ─────────────────────────────────────
// Deliberately NOT the Hebrew root/lemma pipeline (see
// GLOSS_STUDIO_MULTILANG_PLAN.md for why that's a much larger, separate
// undertaking). This reuses exactly what the live reader already does for
// these sources — splitTextToTokens() + _lookupGloss(script, key), the same
// generic tokenizer/gloss-overlay every /?source=SYR /?source=LXX etc. page
// already renders with — and just aggregates it into the same books ->
// chapters -> verses tree shape the Hebrew coverage endpoints use, so the
// existing browse UI needs no restructuring. "Glossed" = has a
// lexicon/<lang>-lexicon.json entry for this exact surface form. No Strong's
// numbers, no root compounding — fieldy: "just raw tokens... don't worry
// about the numbers, just enable the feature." Canonical books only
// (book_id/canon_id NOT NULL); doc-only literary works aren't in this tree.
const GENERIC_GS_SOURCES = { LXX: 'greek', GEZ: 'ethiopic', LAT: 'latin', SYR: 'syriac', COP: 'coptic' };

// Every language Gloss Studio knows about, Hebrew included — the one list
// both the per-verse status endpoint and the cross-language aggregate below
// iterate, so adding a language means updating this in one place.
const GS_LANG_LIST = [
    { id: 'heb',    label: 'Hebrew',  kind: 'heb' },
    { id: 'greek',  label: 'Greek',   kind: 'LXX' },
    { id: 'geez',   label: "Ge'ez",   kind: 'GEZ' },
    { id: 'latin',  label: 'Latin',   kind: 'LAT' },
    { id: 'syriac', label: 'Syriac',  kind: 'SYR' },
    { id: 'coptic', label: 'Coptic',  kind: 'COP' },
];

const _genericCoverageCache = {};   // source id -> { stamp, tree: { books, words } }

function _genericStampKey(srcId) {
    let a = 0, b = 0;
    try { a = fs.statSync(CORPUS_DB).mtimeMs; } catch { /* missing is fine, stamp 0 */ }
    try { const f = _glossFileFor(GENERIC_GS_SOURCES[srcId]); if (f) b = fs.statSync(f).mtimeMs; } catch { /* same */ }
    return `${a}|${b}`;
}

const _genericRecomputing = new Set();

function _buildGenericCoverageTree(srcId) {
    const src = SOURCES[srcId];
    const script = GENERIC_GS_SOURCES[srcId];
    const books = new Map();   // book_id -> { total, glossed, chapters: Map(chapter -> {...}) }
    const words = new Map();   // gloss_key -> { occ, glossed, verses: [{book_id,chapter,verse}] }

    if (src && src.available && src.handle) {
        const rows = src.handle.prepare(
            `SELECT book_id, chapter, verse, text FROM verses WHERE book_id IS NOT NULL ORDER BY book_id, chapter, verse`
        ).all();
        for (const r of rows) {
            const rawTokens = splitTextToTokens(r.text, script);
            // Match the reader's exact call shape (unfiltered tokens, so `ord`
            // stays aligned to morph-grc.db's own per-verse word index) before
            // dropping punctuation for counting purposes.
            if (srcId === 'LXX' && rawTokens.length) _attachGrcToVerse(r.book_id, r.chapter, r.verse, rawTokens);
            const tokens = rawTokens.filter(t => !t.is_punct);
            if (!tokens.length) continue;

            let bk = books.get(r.book_id);
            if (!bk) { bk = { total: 0, glossed: 0, chapters: new Map() }; books.set(r.book_id, bk); }
            let ch = bk.chapters.get(r.chapter);
            if (!ch) { ch = { total: 0, glossed: 0, verses: new Map() }; bk.chapters.set(r.chapter, ch); }
            const vs = { total: 0, glossed: 0, missing: [] };

            for (const t of tokens) {
                const key = t.gloss_key || t.word_norm || t.word;
                const glossed = !!t.gloss;
                bk.total++; ch.total++; vs.total++;
                if (glossed) { bk.glossed++; ch.glossed++; vs.glossed++; }
                else vs.missing.push(key);

                let w = words.get(key);
                if (!w) { w = { occ: 0, glossed: false, verses: [] }; words.set(key, w); }
                w.occ++;
                if (glossed) w.glossed = true;
                w.verses.push({ book_id: r.book_id, chapter: r.chapter, verse: r.verse });
            }
            ch.verses.set(r.verse, vs);
        }
    }

    return { books, words };
}

// Same stale-while-revalidate treatment as getGlossCoverage() above, keyed
// per source id (Greek/Ge'ez/Latin/Syriac/Coptic each rebuild independently,
// guarded by their own entry in _genericRecomputing) so re-tokenizing one
// language's whole corpus never blocks a request for a different one, or for
// Hebrew.
function computeGenericCoverage(srcId) {
    const stamp = _genericStampKey(srcId);
    const cached = _genericCoverageCache[srcId];
    if (cached) {
        if (cached.stamp !== stamp && !_genericRecomputing.has(srcId)) {
            _genericRecomputing.add(srcId);
            setImmediate(() => {
                try {
                    _genericCoverageCache[srcId] = { stamp, tree: _buildGenericCoverageTree(srcId) };
                } catch (e) {
                    console.error(`[gloss-studio] background ${srcId} coverage rebuild failed:`, e);
                } finally {
                    _genericRecomputing.delete(srcId);
                }
            });
        }
        return cached.tree;
    }
    const tree = _buildGenericCoverageTree(srcId);
    _genericCoverageCache[srcId] = { stamp, tree };
    return tree;
}

// Same {book_id, book_name, chapter, verse, words, english} shape the Hebrew
// verse endpoint returns, but `words` are plain reader tokens (word,
// transliteration, gloss, gloss_key, and lemma/strongs when the Greek morph
// DB has a hit) rather than paleo component chips — the frontend picks the
// right renderer per language.
function genericVerseWords(srcId, book_id, chapter, verse) {
    const src = SOURCES[srcId];
    const script = GENERIC_GS_SOURCES[srcId];
    if (!src || !src.available || !src.handle) return null;
    const row = src.handle.prepare(
        `SELECT text FROM verses WHERE book_id=? AND chapter=? AND verse=?`
    ).get(book_id, chapter, verse);
    if (!row) return null;
    const tokens = splitTextToTokens(row.text, script);
    if (srcId === 'LXX') _attachGrcToVerse(book_id, chapter, verse, tokens);
    return tokens;
}

// ── GLOSS STUDIO — CROSS-LANGUAGE AGGREGATE (drives the Books/Chapters
// panes) ─────────────────────────────────────────────────────────────────
// fieldy, 2026-08-11: "I dont expect the higher layers to be recalculated
// per language change... the verse percentages should be the overall
// glossage of it across all languages." So the Books/Chapters/verse-row
// percentages are ONE number — lexical glossed/total summed across every
// language's own coverage tree for that verse — computed independently of
// whichever language is active in the LangColumn (that's what the
// per-language colored highlights are for instead). A verse only reaches
// 100% if EVERY language's tokens are glossed AND Translation Studio has
// the verse marked 'done' — "99% for all lexical glosses for all languages
// but no done flag" — otherwise a fully-glossed-but-unreviewed verse would
// look indistinguishable from a genuinely finished one.
let _aggregateCoverageCache = null;   // { stamp, tree: { books } }

function _aggregateStampKey() {
    const parts = GS_LANG_LIST.map(l => l.kind === 'heb' ? _glossStudioStampKey() : _genericStampKey(l.kind));
    try { parts.push(fs.statSync(path.join(__dirname, 'translation.db')).mtimeMs); } catch { parts.push(0); }
    return parts.join('|');
}

let _aggregateRecomputing = false;

function _buildAggregateCoverageTree() {
    // book_id -> chapter -> verse -> { total, glossed } — raw lexical sums
    // across every language, before the 'done' adjustment.
    const acc = new Map();
    const bump = (book_id, chapter, verse, total, glossed) => {
        let bk = acc.get(book_id); if (!bk) { bk = new Map(); acc.set(book_id, bk); }
        let ch = bk.get(chapter); if (!ch) { ch = new Map(); bk.set(chapter, ch); }
        let vs = ch.get(verse); if (!vs) { vs = { total: 0, glossed: 0 }; ch.set(verse, vs); }
        vs.total += total; vs.glossed += glossed;
    };
    for (const l of GS_LANG_LIST) {
        const books = l.kind === 'heb' ? getGlossCoverage().trees.BHS.books : computeGenericCoverage(l.kind).books;
        for (const [book_id, bk] of books) {
            for (const [chapter, ch] of bk.chapters) {
                for (const [verse, vs] of ch.verses) bump(book_id, chapter, verse, vs.total, vs.glossed);
            }
        }
    }

    // Translation Studio's 'done' status, per verse — the extra requirement
    // for 100% on top of full lexical coverage.
    const doneSet = new Set();
    try {
        for (const r of translationDb.stmts.allProgress.all()) {
            if (r.status === 'done') doneSet.add(`${r.book_id}:${r.chapter}:${r.verse}`);
        }
    } catch { /* translation.db may be empty */ }

    const books = new Map();
    for (const [book_id, bk] of acc) {
        const bkOut = { total: 0, glossed: 0, chapters: new Map() };
        books.set(book_id, bkOut);
        for (const [chapter, ch] of bk) {
            const chOut = { total: 0, glossed: 0, verses: new Map() };
            bkOut.chapters.set(chapter, chOut);
            for (const [verse, vs] of ch) {
                const done = doneSet.has(`${book_id}:${chapter}:${verse}`);
                let pct = _glossPct(vs.glossed, vs.total);
                if (pct === 100 && !done) pct = 99;   // fully glossed lexically, not yet signed off
                chOut.verses.set(verse, { total: vs.total, glossed: vs.glossed, pct, missing: [], done });
                chOut.total += vs.total; chOut.glossed += vs.glossed;
            }
            bkOut.total += chOut.total; bkOut.glossed += chOut.glossed;
        }
    }

    return { books };
}

// Same stale-while-revalidate treatment as getGlossCoverage()/
// computeGenericCoverage() above — this one is the most expensive of the
// three (it loops over BOTH of them, for all six languages), so it's the one
// most worth never blocking a request on. Note it will often serve a tree
// built from sub-caches that are THEMSELVES still catching up in the
// background — that's fine, eventually consistent on the next request after
// each finishes, and matches "less important for the %s to be accurate in
// real time" exactly.
function computeAggregateCoverage() {
    const stamp = _aggregateStampKey();
    if (_aggregateCoverageCache) {
        if (_aggregateCoverageCache.stamp !== stamp && !_aggregateRecomputing) {
            _aggregateRecomputing = true;
            setImmediate(() => {
                try {
                    _aggregateCoverageCache = { stamp, tree: _buildAggregateCoverageTree() };
                } catch (e) {
                    console.error('[gloss-studio] background aggregate coverage rebuild failed:', e);
                } finally {
                    _aggregateRecomputing = false;
                }
            });
        }
        return _aggregateCoverageCache.tree;
    }
    _aggregateCoverageCache = { stamp, tree: _buildAggregateCoverageTree() };
    return _aggregateCoverageCache.tree;
}

// GET /api/admin/gloss-studio/coverage
// The WHOLE books -> chapters -> verses tree in one response (not a
// drill-down API) — computed once server-side, cached until lexicon.json or
// surface-index.db actually change, sent whole so the client fetches ONCE
// and does all book/chapter/verse navigation against the in-memory tree
// with zero further round-trips. Covers every book with Hebrew material
// (BHS's 39 + everything HEB-only: NT, Jubilees, Jasher, Book of
// Melchizedek, etc — same set Translation Studio's sidebar shows), each
// counted from its own natural edition. Each verse also carries `missing`:
// the actual root_paleo forms still needing an entry (not just a fraction).
function _renderCoverageBooks(books) {
    return [...books.entries()].map(([book_id, bk]) => ({
        book_id, name: BOOK_NAMES[book_id] || `Book ${book_id}`,
        total: bk.total, glossed: bk.glossed, pct: _glossPct(bk.glossed, bk.total),
        chapters: [...bk.chapters.entries()].map(([chapter, c]) => ({
            chapter, total: c.total, glossed: c.glossed, pct: _glossPct(c.glossed, c.total),
            verses: [...c.verses.entries()].map(([verse, v]) => ({
                verse, total: v.total, glossed: v.glossed,
                // Aggregate tree pre-computes pct itself (folds in the
                // Translation Studio 'done' cap) — use it as-is when
                // present rather than recomputing and losing that cap.
                pct: v.pct !== undefined ? v.pct : _glossPct(v.glossed, v.total),
                done: !!v.done,
                missing: [...v.missing],
            })).sort((a, b) => a.verse - b.verse),
        })).sort((a, b) => a.chapter - b.chapter),
    })).sort((a, b) => a.book_id - b.book_id);
}
app.get('/api/admin/gloss-studio/coverage', (req, res) => {
    try {
        const source = req.query.source || 'ALL';
        if (source === 'ALL') {
            const { books } = computeAggregateCoverage();
            return res.json({ books: _renderCoverageBooks(books) });
        }
        if (GENERIC_GS_SOURCES[source]) {
            const { books } = computeGenericCoverage(source);
            return res.json({ books: _renderCoverageBooks(books) });
        }
        const { books } = getGlossCoverage().trees[source === 'HEB' ? 'HEB' : 'BHS'];
        res.json({ books: _renderCoverageBooks(books) });
    } catch (err) {
        console.error('/api/admin/gloss-studio/coverage failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/gloss-studio/structure
// Book/chapter/verse NAVIGATION ONLY — book names, chapter numbers, verse
// numbers, and a total root-bearing-word count per verse. NO glossed count,
// NO pct, NO missing list. Built from getGlossStructure(), which is cheap
// (SQL-side GROUP BY, tens of thousands of rows crossing into JS instead of
// up to ~1M) and independent of lexicon.json (see its own stamp key) — so
// unlike /coverage, this never blocks on a lexicon-edit-triggered rebuild.
// The client fetches this FIRST and renders the Books/Chapters pane
// immediately; /coverage loads separately afterward and fills percentages
// in without blocking navigation. Same 'BHS'/'HEB' source convention as
// every other Gloss Studio endpoint — 'BHS' (default) is the widest view
// (this book's natural edition, so every book Gloss Studio covers appears).
app.get('/api/admin/gloss-studio/structure', (req, res) => {
    try {
        const source = req.query.source === 'HEB' ? 'HEB' : 'BHS';
        const { trees } = getGlossStructure();
        const bookTree = trees[source];
        const books = [...bookTree.entries()].map(([book_id, bk]) => {
            let total = 0;
            const chapters = [...bk.entries()].map(([chapter, ch]) => {
                let chTotal = 0;
                const verses = [...ch.entries()]
                    .map(([verse, vTotal]) => { chTotal += vTotal; return { verse, total: vTotal }; })
                    .sort((a, b) => a.verse - b.verse);
                total += chTotal;
                return { chapter, total: chTotal, verses };
            }).sort((a, b) => a.chapter - b.chapter);
            return { book_id, name: BOOK_NAMES[book_id] || `Book ${book_id}`, total, chapters };
        }).sort((a, b) => a.book_id - b.book_id);
        res.json({ books });
    } catch (err) {
        console.error('/api/admin/gloss-studio/structure failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/gloss-studio/verse-status?book=&chapter=&verse=
// Per-language glossed/total for ONE verse, across EVERY language Gloss
// Studio supports at once — powers the vertical language pane's per-verse
// badges ("which languages are lacking this verse") without the user
// clicking through each pill one at a time. Cheap: every language's
// coverage tree is already computed and cached (getGlossCoverage() /
// computeGenericCoverage()); this just looks up one book/chapter/verse in
// each, it doesn't recompute anything.
function _verseStatusFor(kind, book_id, chapter, verse) {
    // Hebrew's cross-language summary uses BHS (this book's natural
    // edition) — same "what a reader sees" view the Hebrew pill defaults to.
    const books = kind === 'heb' ? getGlossCoverage().trees.BHS.books : computeGenericCoverage(kind).books;
    const vs = books.get(book_id)?.chapters.get(chapter)?.verses.get(verse);
    if (!vs) return { total: 0, glossed: 0, pct: 0, available: false };
    return { total: vs.total, glossed: vs.glossed, pct: _glossPct(vs.glossed, vs.total), available: true };
}
app.get('/api/admin/gloss-studio/verse-status', (req, res) => {
    try {
        const book_id = parseInt(req.query.book, 10);
        const chapter = parseInt(req.query.chapter, 10);
        const verse   = parseInt(req.query.verse, 10);
        if (!book_id || !chapter || !Number.isInteger(verse)) return res.status(400).json({ error: 'book, chapter, verse required' });
        const langs = GS_LANG_LIST.map(l => ({ id: l.id, label: l.label, ..._verseStatusFor(l.kind, book_id, chapter, verse) }));
        res.json({ book_id, chapter, verse, langs });
    } catch (err) {
        console.error('/api/admin/gloss-studio/verse-status failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/gloss-studio/missing?offset=0&limit=50
// Roots with NO real gloss anywhere (lexicon.json, hebrew-extra-lexicon.json,
// or GRAMMAR_MAP), sorted by occurrence count (desc) — the highest-value
// gaps first. Add the entry, reload, it's gone from this list.
app.get('/api/admin/gloss-studio/missing', (req, res) => {
    try {
        const source = req.query.source || 'BHS';
        const roots = GENERIC_GS_SOURCES[source]
            ? computeGenericCoverage(source).words
            : getGlossCoverage().trees[source === 'HEB' ? 'HEB' : 'BHS'].roots;
        const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
        const limit  = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const all = [...roots.entries()]
            .filter(([, r]) => !r.glossed)
            .map(([root_paleo, r]) => ({ root_paleo, occ: r.occ }))
            .sort((a, b) => b.occ - a.occ);
        res.json({ total: all.length, offset, limit, rows: all.slice(offset, offset + limit) });
    } catch (err) {
        console.error('/api/admin/gloss-studio/missing failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// JSON.parse is unavoidable per token because we must access `components`
// programmatically (to renumber token_ordinal etc).  But it's still ~10× cheaper
// than running the parser, because each surface's `components` JSON is small
// (<200 bytes typical) and is already in OS page cache after first hit.
function groupSurfaceTokens(rows, lexicon, homographs, opts = {}) {
    const showUncurated = opts.showUncurated === undefined ? SHOW_UNCURATED_DEFAULT : opts.showUncurated;
    const hebExtra = opts.hebExtra || {};
    const output = [];
    let currentVerse = null;
    let wordCounter  = 1;
    let pending      = [];          // particles waiting for a non-particle to fold into
    let pendingTokenOrdinal = null; // token_ordinal of the LAST non-particle in pending
    let pendingStrongs = null;
    let pendingPos    = null;       // pos of the most recent non-particle row
    // True once `pending` holds a REAL resolved content word — mirrors
    // parseHebrewData's pendingHasRoot (server.js's live-parse reference
    // path). False while `pending` holds only an open, unresolved particle
    // chain still waiting for its host. Lets the punctuation handling below
    // tell "a real word is pending" apart from "just an open particle chain
    // is pending" — see its comment.
    let pendingHasRoot = false;
    // sourceTokens: per-source-row metadata for everything that flushed into
    // the current word block. Lets the client render a SEPARATE "surf" link
    // for each underlying token in a merged word block. Without this, the
    // client falls back to concatenating component paleos, which is the LEMMA
    // form not the actual surface in the corpus (e.g. WaShapalath = 𐤅𐤔𐤐𐤋𐤕
    // was producing a surf link to 𐤔𐤐𐤋 which is the root, not the surface).
    let pendingSources  = [];

    // ── PROCLITIC GATE (must mirror parseHebrewData) ─────────────────────────
    // A proclitic fuses into the FOLLOWING word. It is NOT simply "pos is
    // prep/conj/art":
    //   • A preposition carrying a pronominal suffix is a WHOLE WORD — אֵלַי
    //     (𐤀𐤋+𐤉 "to me"), בִּי (𐤁+𐤉 "in me"). Treating it as a proclitic made it
    //     fuse into the next token, which is what produced "AlayaH" and
    //     "BayaWaYaAmar". 13,198 prep tokens in the corpus carry a suffix.
    //   • The interrogative HE (𐤄) IS a proclitic even though pos=inrg.
    //   NOTE: STANDALONE_WORDS/isStandaloneException in parseHebrewData does
    //   NOT gate folding — it only picks the CSS class ('root' vs pos-class)
    //   for a word that reaches the full-word branch for some OTHER reason
    //   (an affix, or a non-prep/conj/art pos). A prep/conj/art word with no
    //   affix folds regardless of STANDALONE_WORDS membership. An earlier
    //   version of this comment claimed otherwise and added a
    //   STANDALONE_WORDS check here — that was wrong and inflated block
    //   counts (את appears dozens of times per chapter and does fold).
    //   Removed; do not re-add without re-reading isStandaloneException's
    //   actual use in parseHebrewData first.
    // Affix keys are the short DB forms; a value of absent/none means no morpheme.
    const HAS_AFFIX = /\b(?:prs|pfm|vbs|nme|vbe|uvf)=(?!absent\b|none\b)/;
    const isParticle = (pos, morph, wordRaw) => {
        if (pos === 'inrg' && wordRaw === '𐤄') return true;      // interrogative he
        if (pos !== 'prep' && pos !== 'conj' && pos !== 'art') return false;
        return !HAS_AFFIX.test(morph || '');                     // affix ⇒ whole word
    };
    const SUFFIX_CSS_PREFIX = ['nme-', 'prs-', 'vbe-', 'mod-suff-unk'];

    // ── LIVE RE-GLOSS PASS ──────────────────────────────────────────────────
    // The surface-index was baked against the lexicon at build time. When
    // the user edits lexicon.json or homographs.json, the pre-baked
    // translations go stale (e.g. 𐤉𐤄𐤅𐤃𐤄 still shows '[𐤉𐤄𐤅𐤃𐤄]' even after
    // adding 'Yahawadah/(Judah)' to the lexicon).
    //
    // Re-glossing is cheap because the *structural* parse (component
    // boundaries, css classes, paleo, sn) is correct in the index — only the
    // translation strings can drift. For each component, we re-look-up the
    // gloss using its OWN paleo + its OWN sn (NOT the parent word-block's sn,
    // because that would leak the root's translation into prefix/suffix
    // components — exactly what made `𐤀𐤕` show up as "Shamayam (Heavens)").
    //
    // Priority order (mirrors parseHebrewData):
    //   homographs[paleo_H<comp.sn>]
    //   homographs[paleo_<pos>]   (only meaningful for standalone particles)
    //   homographs[paleo]
    //   lexicon[paleo]
    //   existing baked translation (kept untouched if everything misses)
    const reGlossOne = (comp, pos) => {
        if (!comp || !comp.paleo || !lexicon || !homographs) return;
        // The hardened baked-modification chip (bakedModObj, produced by
        // parseHebrewData's baked-addition split — flagged bakedSplit regardless
        // of whether guessSuffixGloss named it or it fell back to mod-suff-unk)
        // carries a BARE consonant string that happens to double as a real
        // standalone root for some letters (e.g. 𐤉𐤌 is also H3220 "yam"/sea) — a
        // paleo-keyed re-gloss lookup below would silently swap its already-
        // correct grammatical label ("[Plural (masc)]") for an unrelated word's
        // gloss. Its translation was decided once, deliberately, at parse time;
        // never re-look it up.
        if (comp.bakedSplit) return;
        const paleo = comp.paleo;
        const candidates = [];
        // Component-own strongs (only set on the root component for non-
        // particle words; standalone particles have their sn on the word-block)
        const ownSn = comp.sn ? 'H' + comp.sn.replace(/^H+/, '') : null;
        if (ownSn) candidates.push(`${paleo}_${ownSn}`);
        // POS-keyed homograph (e.g. `𐤁_preposition` vs `𐤁_noun`). Use the
        // full pos word for parity with the user's lexicon convention.
        const POS_LONG = { prep: 'preposition', conj: 'conjunction', art: 'article', nega: 'negative', inrg: 'interrogative' };
        const posLong = POS_LONG[pos];
        if (posLong) candidates.push(`${paleo}_${posLong}`);

        // POS-STRICT classes: the bare form of this paleo belongs to a DIFFERENT
        // part of speech, so a bare lookup returns the wrong gloss. 𐤄 as inrg is
        // the interrogative; bare 𐤄 in the lexicon/GRAMMAR_MAP is the ARTICLE
        // ("The"). Only pos-keyed sources may answer for these — no bare fallback.
        const POS_STRICT = new Set(['inrg']);
        if (POS_STRICT.has(pos)) {
            for (const key of candidates) {
                if (homographs[key]) { comp.translation = homographs[key]; return; }
            }
            if (GRAMMAR_MAP[pos] && GRAMMAR_MAP[pos][paleo]) {
                comp.translation = GRAMMAR_MAP[pos][paleo];
            }
            return;
        }

        // Bare-paleo homograph
        candidates.push(paleo);

        for (const key of candidates) {
            if (homographs[key]) { comp.translation = homographs[key]; return; }
        }
        // Lexicon, then the curated HEB-edition lexicon (same order as the bake)
        if (lexicon[paleo])  { comp.translation = lexicon[paleo];  comp.gloss_src = 'lexicon';   return; }
        if (hebExtra[paleo]) { comp.translation = hebExtra[paleo]; comp.gloss_src = 'heb-extra'; return; }
        // GRAMMAR_MAP fallback for particles — last-resort built-in glosses
        // for the few prep/conj/art/nega particles the corpus uses but the
        // lexicon may not have an entry for (e.g. `𐤀𐤕` → "entirety/whole").
        // Mirrors the priority chain in parseHebrewData line ~1177.
        if (pos && GRAMMAR_MAP[pos] && GRAMMAR_MAP[pos][paleo]) {
            comp.translation = GRAMMAR_MAP[pos][paleo];
            return;
        }
        // ── EVERYTHING CURATED MISSED — APPLY THE PLACEHOLDER HERE ──────────
        // This runs on EVERY component the reader shows, so the placeholder is
        // decided at render time and appears in every Hebrew view at once. The
        // bake writes the same thing, but the bake is a snapshot: relying on it
        // meant /roots (live-parsed) showed the root paleo while the reader
        // (fast path, pre-baked) showed nothing. Same word, two answers, which
        // is the failure mode this whole session has been about. Deciding it
        // here also fixes an index baked before any of this existed — no
        // rebuild required to see the placeholder.
        const isBakedPlaceholder = v =>
            !v || !String(v).trim() ||
            // the legacy `[𐤀𐤋𐤄𐤉𐤌]` form: bracketed paleo was itself a fake gloss.
            /^\[[\u{10900}-\u{1091F}]+\]$/u.test(String(v).trim());

        const uncuratedKjv = !showUncurated && comp.gloss_src === 'kjv';
        if (uncuratedKjv || isBakedPlaceholder(comp.translation)) {
            // true_root is the clean dictionary lemma — the form to add to the
            // lexicon. comp.paleo is the rendered form and is the right fallback
            // for modifiers, which have no separate root.
            comp.translation = comp.true_root || comp.paleo || '';
            comp.gloss_src   = 'none';
        }
    };

    const flush = () => {
        if (!pending.length) return;
        // ── RE-TRANSLITERATE THE ASSEMBLED WORD BLOCK ───────────────────────
        // The surface-index stores each token's translit IN ISOLATION, so a
        // standalone conj like `𐤅` was baked as `W` (final form). When that
        // particle is folded into the next non-particle's block, the combined
        // word block needs its translit recomputed so that only the very last
        // letter uses the final form.
        transliterateBlock(pending);
        // Suffix components (nme/prs/vbe) render lowercase; everything else
        // gets its first character uppercased. Mirrors parseHebrewData.
        for (const c of pending) {
            if (!c.translit) continue;
            const isSuffix = SUFFIX_CSS_PREFIX.some(p => c.css && c.css.startsWith(p));
            c.translit = isSuffix
                ? c.translit.toLowerCase()
                : c.translit.charAt(0).toUpperCase() + c.translit.slice(1);
        }
        // Live re-gloss — each component re-translates against its OWN paleo
        // and source-row pos, NOT the parent word-block's pos/strongs.
        // _sourcePos was stamped at row-ingest time below.
        if (lexicon || homographs) {
            for (const c of pending) {
                reGlossOne(c, c._sourcePos || null);
            }
        }
        // Strip the internal-only annotation so it doesn't leak to the client.
        for (const c of pending) delete c._sourcePos;

        output.push({
            verse:         currentVerse,
            word:          wordCounter++,
            token_ordinal: pendingTokenOrdinal,
            strongs:       pendingStrongs,
            components:    pending,
            // sourceTokens lets the client render one "surf" badge per
            // underlying corpus token. Each entry: {token_ordinal, word_raw,
            // strongs} — the real surface form from the .bhs file.
            sourceTokens:  pendingSources,
        });
        pending = [];
        pendingTokenOrdinal = null;
        pendingStrongs = null;
        pendingPos     = null;
        pendingSources = [];
        pendingHasRoot = false;
    };

    // POS → CSS mapping for standalone particle classes. Same map the
    // original parseHebrewData uses (server.js getCssClass). The corpus is
    // the source of truth: if the .bhs file tags a token pos=preposition,
    // it MUST render as mod-prep, not root, regardless of what surface-index
    // baked at build time. This corrects pre-existing index drift for words
    // like `𐤀𐤕` which were baked as `root` despite `pos=prep`.
    const POS_TO_CSS = {
        prep: 'mod-prep',
        conj: 'mod-conj',
        art:  'mod-art',
        nega: 'mod-nega',
        inrg: 'mod-inrg',
    };

    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        const row = rows[rowIdx];
        if (row.verse !== currentVerse) {
            flush();
            currentVerse = row.verse;
            wordCounter  = 1;
        }

        // Punctuation occurrence (maqaf ־, sof-pasuq ׃, paseq ׀ …) — surface_occurrences
        // now carries these (build-surface-index.js used to filter pos != 'punct' out
        // entirely, so this path had zero visibility into punctuation and could never
        // replicate parseHebrewData's maqaf-driven fusion of a construct pair sharing
        // one Strong's number, e.g. Deut 6:2's בֶּן־בִּנְךָ "ben-binkha" both H1121).
        // No token_surfaces match exists for a mark, so row.components is null here —
        // handle it before the normal comps/isParticle logic below runs at all. Mirrors
        // parseHebrewData's punct branch in server.js; see its comment for the full
        // rationale on why marks must never force a flush of an unresolved particle.
        if (row.pos === 'punct') {
            const mark = row.word_raw || '';
            const isMaqaf = mark.includes('־');
            const markComp = {
                paleo: mark, translit: isMaqaf ? '-' : '', translation: '',
                css: isMaqaf ? 'maqaf' : 'punct-mark',
                isMark: true, isMaqaf, token_ordinal: row.token_ordinal,
            };
            if (!pendingHasRoot) {
                // Nothing resolved is pending — either `pending` is empty (the
                // previous full word already flushed, since a full word only
                // stays open across a MAQAF — see the peek below) or it holds
                // only an open particle chain still waiting for its host.
                if (pending.length === 0) {
                    if (output.length > 0) output[output.length - 1].components.push(markComp);
                    // else: verse/chapter opens with a mark — nowhere to attach it; drop it.
                } else {
                    pending.push(markComp);   // ride along with the open particle chain
                }
                continue;
            }
            // A real resolved root is pending, held open because the row that
            // produced it peeked this exact maqaf. Decide fuse-vs-split.
            pending.push(markComp);
            if (isMaqaf) {
                const nextStrongs = rows[rowIdx + 1] ? rows[rowIdx + 1].strongs : null;
                const sharesRoot = !!(pendingStrongs && nextStrongs && pendingStrongs === nextStrongs);
                if (!sharesRoot) flush();
                // else: keep the chip open — the next row is the compound's other half.
            } else {
                flush();
            }
            continue;
        }

        let comps;
        try { comps = JSON.parse(row.components); }
        catch { comps = []; }
        // Filter out legacy placeholder components left over in the
        // surface-index from before the GRAMMAR_MAP fix. Those rows have
        // components with css 'mod-suff-unk' / 'mod-pref-unk' and empty
        // paleo, with translation strings like '[?J]' or '[?K=]'. The new
        // parser doesn't emit these anymore (it returns null for unknown
        // morph values), but the index was BAKED before the fix so the
        // ghosts persist until surface-index.db is rebuilt. Drop them here
        // so the rendered output is clean regardless. We also drop any
        // empty-paleo component with a bracketed-? translation, as a
        // belt-and-suspenders check in case the css drifts.
        comps = comps.filter(c => {
            if (c.css === 'mod-suff-unk' || c.css === 'mod-pref-unk') return false;
            const trans = String(c.translation || '');
            if (!c.paleo && /^\[\?/.test(trans)) return false;
            return true;
        });
        // Stamp each component with this row's token_ordinal AND its source
        // pos. token_ordinal is for the UI (component → source-token mapping
        // for linking in Translate). _sourcePos is internal; the re-gloss
        // step reads it at flush time and strips it before returning.
        for (const c of comps) {
            c.token_ordinal = row.token_ordinal;
            c._sourcePos    = row.pos;
        }

        // Standalone-particle reclass. The check is precise: only when the
        // corpus tags this whole token as a standalone particle pos AND there
        // is exactly one component (i.e. nothing got stripped into prefix/
        // suffix), the component's css is forced to the right mod-* class.
        // Multi-component cases (a prefix attached to a root) don't qualify —
        // those are inflected forms where the root css is correct.
        const forcedCss = POS_TO_CSS[row.pos];
        if (forcedCss && comps.length === 1 && comps[0].css === 'root') {
            comps[0].css = forcedCss;
        }

        if (isParticle(row.pos, row.morph, row.word_raw)) {
            pending.push(...comps);
            pendingTokenOrdinal = row.token_ordinal;
            pendingStrongs      = row.strongs;
            if (!pendingPos) pendingPos = row.pos;
            pendingSources.push({
                token_ordinal: row.token_ordinal,
                word_raw:      row.word_raw,
                strongs:       row.strongs,
                pos:           row.pos,
            });
        } else {
            pending.push(...comps);
            pendingTokenOrdinal = row.token_ordinal;
            pendingStrongs      = row.strongs;
            pendingPos          = row.pos;
            pendingHasRoot      = true;
            pendingSources.push({
                token_ordinal: row.token_ordinal,
                word_raw:      row.word_raw,
                strongs:       row.strongs,
                pos:           row.pos,
            });
            // Hold the chip open if the very next occurrence is a maqaf, so the
            // punctuation branch above can decide whether this word fuses with
            // its other half (shared Strong's — e.g. Deut 6:2's ben-binkha) or
            // splits normally (Psalm 119:13's mishpetei-pikha). Mirrors
            // parseHebrewData's _nextIsMaqaf peek in server.js.
            const nextRow = rows[rowIdx + 1];
            const nextIsMaqaf = !!nextRow && nextRow.pos === 'punct' && (nextRow.word_raw || '').includes('־');
            if (!nextIsMaqaf) flush();
        }
    }
    flush();
    return output;
}

app.get('/api/tokens', production.cache(60), (req, res) => {
    try {
        // ── DOC-BASED (Works Library, canon_id NULL) HEB TOKENS ──────────────
        // fieldy, 2026-07-31: "let's ensure all hebrew sources get transformed into
        // descriptive tokens... this includes for the DSS stuff". Everything below
        // this block (BOOK_META, resolveChapter, surfRowsFor, the homograph guard)
        // is built entirely around canon_id/book_id — a Dead Sea Scroll or any other
        // Works Library HEB item has none, and was never baked into surface-index.db
        // (that's heb-align.js's job, and it only ever walks canonical books). So
        // doc-mode skips that whole apparatus and goes straight to the SAME
        // live-parse path the book-based route already falls back to on a cache
        // miss (rowsToLines + parseHebrewData) — proven code, just pointed at
        // tokens_nt rows keyed by `code` (build-heb-index.mjs --docs) instead of
        // book_id. Kept as its own early return so nothing below can ever be
        // reached in doc mode, and nothing here can ever affect canonical book
        // requests, which don't send a `doc` param.
        const tokenDoc = (req.query.doc || '').trim();
        if (tokenDoc) {
            const chapterQ = parseInt(req.query.chapter, 10);
            if (!Number.isFinite(chapterQ)) {
                return res.status(400).json({ error: 'chapter required' });
            }
            // tokens_nt_docs, NOT tokens_nt: tokens_nt is fully owned/recreated by
            // sync-heb-tokens.mjs on every --apply (its own CREATE TABLE declares
            // book_id INTEGER NOT NULL, so a code-only row can't live there at all),
            // so doc-based rows live in their own table build-heb-index.mjs --docs
            // writes and nothing else ever touches. See that file's header.
            const hasDocsTable = db.prepare(
                `SELECT 1 FROM sqlite_master WHERE type='table' AND name='tokens_nt_docs'`
            ).get();
            if (!hasDocsTable) {
                return res.status(503).json({
                    error: 'tokens_nt_docs does not exist yet — run: node build-heb-index.mjs --apply --docs'
                });
            }
            const docRows = db.prepare(
                `SELECT verse, token_ordinal, word_raw, pos, morph, strongs
                 FROM tokens_nt_docs WHERE code=? AND chapter=? ORDER BY verse, token_ordinal`
            ).all(tokenDoc, chapterQ);
            if (docRows.length === 0) {
                return res.status(404).json({
                    error: `No tokens found for doc ${tokenDoc} chapter ${chapterQ} — `
                         + `has build-heb-index.mjs --apply --docs been run since this work was ingested?`
                });
            }
            const rawText = rowsToLines(docRows);
            const { lexicon, homographs, surfaceOverrides } = loadLexicons();
            return res.json(parseHebrewData(rawText, lexicon, homographs, surfaceOverrides));
        }

        const bookId  = parseInt(req.query.book, 10);
        const chapter = parseInt(req.query.chapter, 10);
        if (!bookId || !chapter) {
            return res.status(400).json({ error: 'book and chapter query params are required' });
        }
        // BOOK_META is the BHS/Masoretic book table — it covers the OT only. Books that
        // exist ONLY in tokens_nt (the whole NT, and any HEB book with no BHS counterpart)
        // used to 404 here before the token query ever ran, which is why 3 John and
        // 2 Corinthians reported "Book 64/47 not found" the moment HEB started routing to
        // this viewer. Let a book through when tokens_nt actually has rows for it.
        const inBhsMeta = !!BOOK_META[bookId];
        const inNtTokens = !inBhsMeta && NT_HAS_BOOK && !!NT_HAS_BOOK.get(bookId);
        if (!inBhsMeta && !inNtTokens) {
            return res.status(404).json({ error: `Book ${bookId} not found` });
        }

        // resolveChapter applies BHS versification offsets, which only exist for books in
        // BOOK_META. For NT-only books the chapter is already canonical — pass it through
        // rather than mapping it through a table that has no entry for this book.
        const { actual_chapter, verse_offset } = inBhsMeta
            ? resolveChapter(bookId, chapter)
            : { actual_chapter: chapter, verse_offset: 0 };
        // The edition this request is about. Everything below — the fast path,
        // the integrity guards, and the live-parse fallback — must agree on it.
        const surfSource = surfaceSourceFor(bookId, req.query.source);
        let rows = surfRowsFor(bookId, actual_chapter, surfSource);
        // Location-keyed Strong's overrides — patched in before anything below
        // reads row.strongs or row.components, on ACTUAL-chapter verse numbers
        // (matches how they're keyed), same reasoning as the homograph guard.
        {
            const { locationOverrides } = loadLexicons();
            if (locationOverrides && Object.keys(locationOverrides).length) {
                rows = rows.map(r => applyLocOverrideToSurfRow({ ...r }, locationOverrides, bookId, actual_chapter));
            }
        }

        // ── HOMOGRAPH GUARD (authoritative per-occurrence SN) ──────────────
        // Computed here on ACTUAL-chapter verse numbers, before the verse_offset
        // renumber below, so it aligns with tokens_bhs. A chapter can only be
        // mis-served if it contains a flagged homograph surface, so we skip the
        // corpus.db read entirely otherwise (in-memory Set.has only). When it
        // does, we pull the authoritative per-occurrence SN from tokens_bhs and
        // compare it to the baked surface SN; any disagreement means the fast
        // path would render the wrong root/badge for that occurrence (the exact
        // reader-vs-roots-page split), so we defer the whole chapter to the live
        // parser, which resolves the true root from the per-token OSHB SN.
        //
        // BHS ONLY. The check compares the baked SN against an AUTHORITATIVE
        // per-occurrence tag, and only tokens_bhs has one: tokens_nt's SNs are
        // themselves inferred (build-heb-index.mjs alignment), so a disagreement
        // there says nothing about the bake — the two inference passes simply
        // differ. Running it on HEB sends the whole chapter to the live parser,
        // which re-parses UNTAGGED tokens_nt rows: no morphology, so no prefix
        // decomposition and the raw inferred SN on the badge. That is strictly
        // worse than the baked row, and it is what "[The]/[And] disappeared"
        // and "𐤅𐤀𐤕 badged H5315" look like from the browser.
        const normH = s => 'H' + String(s).replace(/^H+/, '');
        let homographDrift = false;
        if (surfSource !== 'HEB' && rows.some(r => r.word_raw && HOMOGRAPH_SURFACES.has(r.word_raw))) {
            const authSN = new Map();   // "verse\u0000ordinal" -> normalized H#
            for (const t of tokenQueryFor(bookId, req.query.source).all(bookId, actual_chapter)) {
                if (t.strongs) authSN.set(`${t.verse}\u0000${t.token_ordinal}`, normH(t.strongs));
            }
            homographDrift = rows.some(r => {
                if (!r.word_raw || !HOMOGRAPH_SURFACES.has(r.word_raw)) return false;
                const auth  = authSN.get(`${r.verse}\u0000${r.token_ordinal}`);
                const baked = r.strongs ? normH(r.strongs) : '';
                if (!auth || !baked) return false;      // nothing authoritative to compare
                return auth !== baked;                  // homograph served with the wrong SN
            });
        }

        // verse_offset > 0 → display chapter is a tail slice of a larger actual
        // chapter.  Filter to verses above the offset and renumber from 1.
        if (verse_offset > 0) {
            rows = rows
                .filter(r => r.verse > verse_offset)
                .map(r => ({ ...r, verse: r.verse - verse_offset }));
        }

        if (rows.length === 0) {
            // Cache miss — fall back to live parsing.  Should only happen if
            // surface-index is out of date.  Logs help spot drift.
            console.warn(`[tokens] surface-index miss for book=${bookId} chapter=${chapter}` +
                         `${surfSource ? ` source=${surfSource}` : ''}; falling back to live parse` +
                         `${surfSource === 'HEB' ? ' (HEB not baked for this book — rebuild with --heb)' : ''}`);
            const bibleRows = tokenQueryFor(bookId, req.query.source).all(bookId, actual_chapter);
            if (bibleRows.length === 0) {
                return res.status(404).json({ error: `No tokens found for book ${bookId} chapter ${chapter}` });
            }
            const mappedRows = verse_offset > 0
                ? bibleRows.filter(r => r.verse > verse_offset).map(r => ({ ...r, verse: r.verse - verse_offset }))
                : bibleRows;
            const rawText = rowsToLines(mappedRows);
            const { lexicon, homographs, surfaceOverrides } = loadLexicons();
            return res.json(parseHebrewData(rawText, lexicon, homographs, surfaceOverrides));
        }

        // ── SURFACE-INDEX SANITY CHECK ─────────────────────────────────────
        // The baked components on each row should be derivable from the
        // source word_raw — i.e. concatenated component paleos should share
        // at least the first letter with the surface (allowing for canonical-
        // root mutations like 𐤋𐤇𐤅𐤕 → 𐤋𐤅𐤇+𐤕 which still preserve the first
        // consonant). If the first letters don't match, the index was baked
        // with a wrong canonical-root substitution (build-surface-index.js
        // didn't add the first-letter safety check until commit X — older
        // indexes have rows where e.g. word_raw='𐤁𐤔𐤓𐤕𐤉' has components
        // [{paleo:'𐤑𐤃𐤒𐤄', css:root}, {paleo:'𐤕𐤉', css:vbe-1cs}] because the
        // corpus tagged the wrong Strongs (H6666 instead of H1319) and the
        // bake used H6666's canonical root verbatim).
        //
        // ALSO trigger fallback when any row's word_raw is in surfaceOverrides:
        // the cached components were structured around the corpus's SN, and
        // an override means the user has marked that SN wrong. Live parse
        // honors the override; the fast path doesn't.
        //
        // When either condition fires we fall back to live parse for the
        // whole chapter. It's slightly slower but correct. The hot path stays
        // fast for the 99.9%+ of chapters where neither applies.
        const lexCache = loadLexicons();
        const { lexicon, homographs, surfaceOverrides } = lexCache;
        // surface-strongs-overrides.json pins a corrected SN for a MASORETIC
        // mis-tagging, and the live parse that honours it reads tokens_bhs. For
        // a HEB chapter the live parse would read untagged tokens_nt instead, so
        // deferring there trades a possibly-wrong SN for a definitely-worse
        // render. Note it in the log and keep the baked row.
        const overrideHit  = rows.some(r => r.word_raw && surfaceOverrides[r.word_raw]);
        const hasOverride  = overrideHit && surfSource !== 'HEB';
        if (overrideHit && surfSource === 'HEB') {
            console.warn(`[tokens] surface-strongs override present for book=${bookId} chapter=${chapter} ` +
                         `but source=HEB; serving the baked HEB row (live parse has no morphology there)`);
        }
        const driftRow = rows.find(r => {
            if (!r.word_raw || !r.components) return false;
            let comps;
            try { comps = JSON.parse(r.components); } catch { return true; }
            if (!Array.isArray(comps) || !comps.length) return false;
            // Find the first component that has a paleo glyph. The components
            // are emitted in display order (prefixes before root before
            // suffixes), so the first non-empty paleo must share its first
            // letter with the source word_raw's first letter.
            const firstWithPaleo = comps.find(c => c && c.paleo && c.paleo.length);
            if (!firstWithPaleo) return false;
            const sourceFirst = [...r.word_raw][0];
            const compFirst   = [...firstWithPaleo.paleo][0];
            return sourceFirst !== compFirst;
        });
        // Same asymmetry as the override case: this first-letter heuristic was
        // written against the BHS bake (one morpheme per row). A HEB row is a
        // whole word COMPOSED from a BHS run, so a substituted canonical root at
        // the head can trip it without the row being wrong — and the live parse
        // it would fall back to has no morphology at all. Report the offending
        // word (probe it with `node probe-heb-word.mjs --word <paleo>`) and keep
        // serving the bake.
        const indexCorrupt = !!driftRow && surfSource !== 'HEB';
        if (driftRow && surfSource === 'HEB') {
            console.warn(`[tokens] HEB row looks drifted (word_raw=${driftRow.word_raw}) for ` +
                         `book=${bookId} chapter=${chapter}; serving it anyway — verify with probe-heb-word.mjs`);
        }

        if (indexCorrupt || hasOverride || homographDrift) {
            const reason = indexCorrupt  ? `surface-index drift (word_raw=${driftRow.word_raw})`
                         : hasOverride   ? 'surface-strongs-overrides active for chapter'
                         :                 'homograph SN disagrees with authoritative tokens_bhs';
            console.warn(`[tokens] ${reason} for book=${bookId} chapter=${chapter}; falling back to live parse for correctness`);
            const bibleRows = tokenQueryFor(bookId, req.query.source).all(bookId, actual_chapter);
            const mappedRows = verse_offset > 0
                ? bibleRows.filter(r => r.verse > verse_offset).map(r => ({ ...r, verse: r.verse - verse_offset }))
                : bibleRows;
            const rawText = rowsToLines(mappedRows);
            return res.json(parseHebrewData(rawText, lexicon, homographs, surfaceOverrides));
        }

        // Live re-gloss: pass the latest lexicon + homographs through so the
        // surface index's baked translations are refreshed on every request.
        // The lookup is cheap (in-memory Map.get) and ensures lexicon edits
        // are reflected immediately without rebuilding surface-index.db.
        res.json(groupSurfaceTokens(rows, lexicon, homographs, {
            showUncurated: wantsUncurated(req.query.glosses),
            hebExtra: lexCache.hebExtra,
        }));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});


// GET /api/raw?book=1&chapter=1
// Returns raw pipe-delimited token rows for the token viewer (no parsing)
app.get('/api/raw', production.cache(60), (req, res) => {
    try {
        const bookId  = parseInt(req.query.book,    10);
        const chapter = parseInt(req.query.chapter, 10);
        if (!bookId || !chapter) return res.status(400).json({ error: 'book and chapter required' });
        const { actual_chapter, verse_offset } = resolveChapter(bookId, chapter);
        const rows = tokenQueryFor(bookId, req.query.source).all(bookId, actual_chapter);
        const mapped = verse_offset > 0
            ? rows.filter(r => r.verse > verse_offset).map(r => ({ ...r, verse: r.verse - verse_offset }))
            : rows;
        res.json(mapped);
    } catch(e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// GET /api/search?q=𐤀𐤋𐤐&offset=0
// Ranked search across word_raw. Three tiers merged in memory, fully paginated.
//   tier 1 — exact match: word_raw = q             (the token IS the search term, bare root)
//   tier 2 — prefix/suffix: word_raw LIKE q% or %q (term at edge, likely root before affixes)
//   tier 3 — substring: word_raw LIKE %q%           (term appears anywhere inside a longer form)
// All three tiers run without row limits so the full corpus is searched.
// Deduplication keeps each verse at its highest tier. Pagination applied after merge.
// The merged result is cached per query so "load more" does not re-query the DB.

const SEARCH_EXACT  = db.prepare(`SELECT DISTINCT book_id, chapter, verse FROM tokens_bhs WHERE word_raw = ?                           ORDER BY book_id, chapter, verse`);
const SEARCH_EDGE   = db.prepare(`SELECT DISTINCT book_id, chapter, verse FROM tokens_bhs WHERE word_raw LIKE ? OR word_raw LIKE ?     ORDER BY book_id, chapter, verse`);
const SEARCH_SUBSTR = db.prepare(`SELECT DISTINCT book_id, chapter, verse FROM tokens_bhs WHERE word_raw LIKE ?                        ORDER BY book_id, chapter, verse`);

// Chronological mode: pure book/chapter/verse order, no ranking — just every verse
// where any token contains the query as a substring, ordered canonically.
const SEARCH_CHRONO = db.prepare(`SELECT DISTINCT book_id, chapter, verse FROM tokens_bhs WHERE word_raw LIKE ? ORDER BY book_id, chapter, verse`);

// In-process cache: key = query string, value = merged ranked result array
const searchCache = new Map();
const CACHE_MAX = 20; // keep last 20 distinct queries in memory

// Known verb/nominal prefixes that attach to a root in BHS tokens.
// Ordered longest-first so that multi-char prefixes (𐤅𐤉, 𐤄𐤉, etc.) get their
// own LIKE patterns before single-char overlaps.
const ROOT_PREFIXES = [
    '𐤅𐤉', '𐤅𐤕', '𐤅𐤀', '𐤅𐤍', '𐤅𐤄',   // wayyiqtol waw + person prefix
    '𐤄𐤉', '𐤄𐤕', '𐤄𐤀', '𐤄𐤍',           // hifil/hofal + person
    '𐤌𐤉', '𐤌𐤕', '𐤌𐤀', '𐤌𐤍',           // piel/pual ptca prefix mem + person
    '𐤉', '𐤕', '𐤀', '𐤍',               // imperfect person prefixes (bare)
    '𐤄',                               // hifil bare / article prefix
    '𐤌',                               // mem nominalizer / preposition
    '𐤋', '𐤁', '𐤊', '𐤅',              // preposition / conjunction prefixes
];

// Pre-build a single prepared statement for tier-2b at startup.
// Uses one OR chain across all prefix+root+% patterns.
// The ? placeholders will be filled at query time with (prefix+q+'%') for each prefix.
const TIER2B_SQL =
    'SELECT DISTINCT book_id, chapter, verse FROM tokens_bhs WHERE ' +
    ROOT_PREFIXES.map(() => 'word_raw LIKE ?').join(' OR ') +
    ' ORDER BY book_id, chapter, verse';
const SEARCH_TIER2B = db.prepare(TIER2B_SQL);

function getChronoResults(q) {
    const cacheKey = 'chrono:' + q;
    if (searchCache.has(cacheKey)) return searchCache.get(cacheKey);
    const results = SEARCH_CHRONO.all('%' + q + '%');
    if (searchCache.size >= CACHE_MAX) searchCache.delete(searchCache.keys().next().value);
    searchCache.set(cacheKey, results);
    return results;
}

function getFullResults(q) {
    if (searchCache.has(q)) return searchCache.get(q);

    const seen = new Set();
    const results = [];
    const addRows = (rows) => {
        for (const r of rows) {
            const key = r.book_id + ':' + r.chapter + ':' + r.verse;
            if (!seen.has(key)) { seen.add(key); results.push(r); }
        }
    };

    // Tier 1 — exact: the whole token IS the query (bare root, no affixes)
    addRows(SEARCH_EXACT.all(q));

    // Tier 2a — edge: root at start (root+suffix) or end (prefix+root) of token
    addRows(SEARCH_EDGE.all(q + '%', '%' + q));

    // Tier 2b — prefixed: known prefix + root + any suffix
    // e.g. 𐤉𐤀𐤌𐤓, 𐤅𐤉𐤀𐤌𐤓, 𐤄𐤀𐤌𐤓 all surface here for query 𐤀𐤌𐤓
    const tier2bParams = ROOT_PREFIXES.map(p => p + q + '%');
    addRows(SEARCH_TIER2B.all(...tier2bParams));

    // Tier 3 — substring: any remaining forms containing the query anywhere
    addRows(SEARCH_SUBSTR.all('%' + q + '%'));

    if (searchCache.size >= CACHE_MAX) {
        searchCache.delete(searchCache.keys().next().value);
    }
    searchCache.set(q, results);
    return results;
}

app.get('/api/search', (req, res) => {
    try {
        const q      = (req.query.q || '').trim();
        const offset = parseInt(req.query.offset, 10) || 0;
        const mode   = req.query.mode === 'chrono' ? 'chrono' : 'exact';
        if (!q) return res.status(400).json({ error: 'q param required' });

        const results = mode === 'chrono' ? getChronoResults(q) : getFullResults(q);
        const page = results.slice(offset, offset + 50);
        const hasMore = results.length > offset + 50;
        res.json({ results: page, hasMore, offset, total: results.length, mode });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

const PALEO_ORDER = ['𐤀','𐤁','𐤂','𐤃','𐤄','𐤅','𐤆','𐤇','𐤈','𐤉','𐤊','𐤋','𐤌','𐤍','𐤎','𐤏','𐤐','𐤑','𐤒','𐤓','𐤔','𐤕'];

function paleoSortKey(word) {
    return [...(word || '')].map(c => {
        const i = PALEO_ORDER.indexOf(c);
        return i < 0 ? '\x7f' : String.fromCharCode(i + 32);
    }).join('');
}

function normSN(v) {
    return 'H' + String(v || '').replace(/^H+/, '').trim();
}

function getParsedRoot(row, lexicon, homographs) {
    try {
        const line = [1, 1, row.word_raw || '', row.pos || '', row.morph || '', row.strongs || ''].join('\t');
        const parsed = parseHebrewData(line, lexicon, homographs, surfaceOverrides);
        const comps = parsed?.[0]?.components || [];
        const root = comps.find(c => c.css === 'root') || comps[0];
        // clean lemma for nav/grouping (root component's display paleo now carries modifications)
        return root?.true_root || root?.paleo || row.word_raw || '';
    } catch {
        return row.word_raw || '';
    }
}

// ── ROOT / SURFACE EXPLORER ROUTES ─────────────────────────────────────────
app.get('/root', (req, res) => {
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    res.redirect('/roots' + qs);
});

app.get('/roots', (req, res) => {
    // If no identifying param supplied, redirect to first root in alphabetical order
    const hasSN   = req.query.sn || req.query.sns;
    const hasRoot = req.query.root;
    if (!hasSN && !hasRoot) {
        const idx   = getRootNavIndex();
        const first = idx && idx[0];
        if (first) {
            const snPart  = first.strongs && first.strongs.length
                ? 'sns=' + first.strongs.join(',')
                : first.sn ? 'sn=' + first.sn : '';
            const rootPart = 'root=' + encodeURIComponent(first.root);
            const qs = [rootPart, snPart].filter(Boolean).join('&');
            return res.redirect('/roots?' + qs);
        }
    }
    // Serve the SPA shell — React Router takes over from there.
    // The legacy code served `root.html` but the SPA migration uses one
    // `index.html` for every page, with client-side routing mapping /roots
    // and /surfaces to the Root.jsx component.
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/surfaces', (req, res) => {
    // If no identifying param supplied, redirect to first surface alphabetically
    const hasWord = req.query.word || req.query.surface;
    if (!hasWord) {
        const idx   = getSurfNavIndex();
        const first = idx && idx[0];
        if (first) {
            const qs = 'word=' + encodeURIComponent(first.surface) + (first.sn ? '&sn=' + first.sn : '');
            return res.redirect('/surfaces?' + qs);
        }
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/root-search', (req, res) => {
    res.redirect('/roots');
});

const NAV_PALEO_ORDER = ['𐤀','𐤁','𐤂','𐤃','𐤄','𐤅','𐤆','𐤇','𐤈','𐤉','𐤊','𐤋','𐤌','𐤍','𐤎','𐤏','𐤐','𐤑','𐤒','𐤓','𐤔','𐤕'];

function navPaleoSortKey(word) {
    return [...(word || '')].map(c => {
        const i = NAV_PALEO_ORDER.indexOf(c);
        return i < 0 ? '\x7f' : String.fromCharCode(i + 32);
    }).join('');
}

function navNormSN(v) {
    return 'H' + String(v || '').replace(/^H+/, '').trim();
}

// SN → canonical Paleo-Hebrew root overrides.
// Add entries here whenever the parsing engine strips to the wrong root.
// These are checked by both the nav index builder and /api/root/by-strongs.
// Format: 'H####': '𐤐𐤀𐤋𐤄𐤅' (3- or 4-letter root form)
const STRONGS_ROOT_OVERRIDES = {
    H7646: '𐤔𐤁𐤏',   // saba = to be satisfied (was colliding with sheva)
    H6030: '𐤏𐤍𐤄',   // anah = to answer/respond (engine produces 𐤍𐤏𐤉 from wayyiqtol)
    H6031: '𐤏𐤍𐤄',   // anah = to afflict/humble (homograph of H6030, same root)
    H4929: '𐤌𐤔𐤌𐤓',  // mishmar = guard/watch
    H4931: '𐤌𐤔𐤌𐤓𐤕', // mishmeret = charge/obligation (distinct from H4929)
    H7200: '𐤓𐤀𐤄',   // raah = to see
    H1254: '𐤁𐤓𐤀',   // bara = to create
    H8034: '𐤔𐤌',    // shem = name (prevent it grouping under unrelated short roots)
    H8010: '𐤔𐤋𐤌𐤄',  // Shelomoh = Solomon
    H4428: '𐤌𐤋𐤊',   // melek = king
    H3588: '𐤊𐤉',    // ki = for/that/because
    H9000: '𐤕',     // virtual connector — unique marker so never merges with anything
    H9003: '𐤁',     // virtual preposition marker
    H9009: '𐤄',     // virtual article marker
};

function navParsedRoot(row, lexicon, homographs) {
    const normSN = row && row.strongs ? 'H' + String(row.strongs).replace(/^H+/, '') : '';
    if (STRONGS_ROOT_OVERRIDES[normSN]) return STRONGS_ROOT_OVERRIDES[normSN];

    try {
        const line = [1, 1, row.word_raw || '', row.pos || '', row.morph || '', row.strongs || ''].join('\t');
        const parsed = parseHebrewData(line, lexicon, homographs, surfaceOverrides);
        const comps = parsed?.[0]?.components || [];
        const root = comps.find(c => c.css === 'root') || comps[0];
        // clean lemma for nav/grouping (root component's display paleo now carries modifications)
        return root?.true_root || root?.paleo || row.word_raw || '';
    } catch {
        return row.word_raw || '';
    }
}

// Must be after STRONGS_ROOT_OVERRIDES and navParsedRoot
buildNavIndexes();

function getRootNavIndex()   { return _rootNavIndex   || []; }
function getSurfNavIndex()   { return _surfNavIndex   || []; }
function getSurfacesForSN(sn) { return (_wordBySn?.get(sn) || []).map(i => _surfNavIndex[i]).filter(Boolean); }
function getRootIndexBySN(sn) {
    const norm = 'H' + String(sn || '').replace(/^H+/, '');
    return _rootBySN?.get(norm) ?? -1;
}
function getRootIndexByValue(root) { return _rootByValue?.get(root) ?? -1; }
function getSurfIndexByValue(surf) { return _surfByValue?.get(surf)  ?? -1; }

app.get('/api/nav/roots', (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT strongs, word_raw, pos, morph, COUNT(*) AS cnt
            FROM tokens_bhs
            WHERE strongs IS NOT NULL AND strongs != ''
              AND word_raw IS NOT NULL AND word_raw != ''
            GROUP BY strongs, word_raw, pos, morph
        `).all();

        const { lexicon, homographs, surfaceOverrides } = loadLexicons();
        const byRoot = new Map();

        for (const r of rows) {
            const root = navParsedRoot(r, lexicon, homographs);
            if (!root) continue;

            const sn = navNormSN(r.strongs);
            const old = byRoot.get(root);

            if (!old) {
                byRoot.set(root, {
                    root,
                    paleo: root,
                    sn,
                    count: r.cnt || 0,
                    strongs: [sn]
                });
            } else {
                old.count += r.cnt || 0;
                if (!old.strongs.includes(sn)) old.strongs.push(sn);

                const oldNum = parseInt(old.sn.replace(/\D/g, ''), 10) || 999999;
                const newNum = parseInt(sn.replace(/\D/g, ''), 10) || 999999;
                if (newNum < oldNum) old.sn = sn;
            }
        }

        const entries = [...byRoot.values()].sort((a, b) => {
            const ka = navPaleoSortKey(a.root);
            const kb = navPaleoSortKey(b.root);
            if (ka !== kb) return ka < kb ? -1 : 1;
            return a.sn.localeCompare(b.sn, undefined, { numeric: true });
        });

        res.json(entries);
    } catch (err) {
        console.error('/api/nav/roots failed:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/nav/surfaces', (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT word_raw, strongs, pos, morph, COUNT(*) AS cnt
            FROM tokens_bhs
            WHERE word_raw IS NOT NULL AND word_raw != ''
            GROUP BY word_raw, strongs, pos, morph
        `).all();

        const { lexicon, homographs, surfaceOverrides } = loadLexicons();
        const bySurface = new Map();

        for (const r of rows) {
            const surface = r.word_raw;
            const root = navParsedRoot(r, lexicon, homographs);
            const sn = navNormSN(r.strongs);
            const old = bySurface.get(surface);

            if (!old) {
                bySurface.set(surface, {
                    surface,
                    paleo: surface,
                    root,
                    sn,
                    count: r.cnt || 0
                });
            } else {
                old.count += r.cnt || 0;
                if ((r.cnt || 0) > old.count) {
                    old.sn = sn;
                    old.root = root;
                }
            }
        }

        const entries = [...bySurface.values()].sort((a, b) => {
            const ka = navPaleoSortKey(a.surface);
            const kb = navPaleoSortKey(b.surface);
            if (ka !== kb) return ka < kb ? -1 : 1;
            return a.sn.localeCompare(b.sn, undefined, { numeric: true });
        });

        res.json(entries);
    } catch (err) {
        console.error('/api/nav/surfaces failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// Back-compat for older root.html builds
app.get('/api/nav-entries', (req, res) => {
    res.redirect(req.query.mode === 'surface' ? '/api/nav/surfaces' : '/api/nav/roots');
});

// Existing root-data endpoint
function getStrongNumsFromReq(req) {
    const raw = (req.query.sns || req.query.sn || '').trim();
    return raw
        .split(',')
        .map(x => String(x || '').replace(/^H+/, '').trim())
        .filter(Boolean);
}

function strongWhere(nums) {
    if (!nums.length) return null;
    // BUG FIX: previous implementation was `strongs LIKE %N%` which made H1
    // match H1, H10, H100, H1000, H1234, ... — basically every Strongs
    // containing "1". This pulled 108k tokens for what should have been ~1253.
    //
    // The corpus stores either a bare Strongs ('H1') or a compound joined by
    // '＋' (the fullwidth plus, U+FF0B, used in entries like 'H1237＋H206').
    // We must match the full code exactly OR as one element of a compound,
    // hence the '＋' boundary check. Each Strongs is normalized to H-prefix
    // form on the way in; the DB column may have either with-H or just digits.
    const clauses = [];
    const params  = [];
    for (const raw of nums) {
        const digits = String(raw).replace(/^H+/, '');
        const withH  = 'H' + digits;
        // Exact bare H-form
        clauses.push('strongs = ?');           params.push(withH);
        // Exact digits-only form (some rows store just '1')
        clauses.push('strongs = ?');           params.push(digits);
        // Inside a compound: ＋H1＋ or starting/ending with ＋
        clauses.push('strongs LIKE ?');        params.push(`${withH}＋%`);
        clauses.push('strongs LIKE ?');        params.push(`%＋${withH}`);
        clauses.push('strongs LIKE ?');        params.push(`%＋${withH}＋%`);
    }
    return {
        where: '(' + clauses.join(' OR ') + ')',
        params,
    };
}

function getRowsForRootExplorerReq(req, lexicon, homographs) {
    const rootTerm = (req.query.root || '').trim();
    const surfaceTerm = (req.query.surface || req.query.word || '').trim();
    const nums = getStrongNumsFromReq(req);

    // Fast path: exact surface page.
    if (surfaceTerm) {
        const rows = db.prepare(`
            SELECT book_id, chapter, verse, token_ordinal, word_raw, pos, morph, strongs
            FROM tokens_bhs
            WHERE word_raw = ?
            ORDER BY book_id, chapter, verse, token_ordinal
        `).all(surfaceTerm);

        return { rootTerm, surfaceTerm, nums, rows };
    }

    // Fast path: clicked Strong's badge. Do NOT convert it through root nav.
    // This prevents H7646 from being routed through the bad one-letter 𐤁 bucket.
    if (nums.length) {
        const sw = strongWhere(nums);
        const rows = db.prepare(`
            SELECT book_id, chapter, verse, token_ordinal, word_raw, pos, morph, strongs
            FROM tokens_bhs
            WHERE ${sw.where}
            ORDER BY book_id, chapter, verse, token_ordinal
        `).all(...sw.params);

        return { rootTerm, surfaceTerm, nums, rows };
    }

    // Fast path for one-letter grammar roots like 𐤁.
    // Avoid parsing the entire corpus into the 𐤁 bucket.
    if (rootTerm && [...rootTerm].length === 1) {
        const rows = db.prepare(`
            SELECT book_id, chapter, verse, token_ordinal, word_raw, pos, morph, strongs
            FROM tokens_bhs
            WHERE word_raw = ?
            ORDER BY book_id, chapter, verse, token_ordinal
        `).all(rootTerm);

        return { rootTerm, surfaceTerm, nums, rows };
    }

    // General root page. Parse candidates only after a cheap substring prefilter.
    // This keeps normal roots fast while still allowing modified forms containing the root.
    if (rootTerm) {
        const candidates = db.prepare(`
            SELECT book_id, chapter, verse, token_ordinal, word_raw, pos, morph, strongs
            FROM tokens_bhs
            WHERE word_raw LIKE ?
            ORDER BY book_id, chapter, verse, token_ordinal
        `).all(`%${rootTerm}%`);

        const rows = candidates.filter(r => navParsedRoot(r, lexicon, homographs) === rootTerm);
        return { rootTerm, surfaceTerm, nums, rows };
    }

    return { rootTerm, surfaceTerm, nums, rows: [] };
}

app.get('/api/root', (req, res) => {
    try {
        const { lexicon, homographs, surfaceOverrides } = loadLexicons();
        const { rootTerm, surfaceTerm, nums, rows } = getRowsForRootExplorerReq(req, lexicon, homographs);

        const bySurface = {};
        const bookTotals = {};
        const strongsSet = new Set();

        for (const r of rows) {
            if (r.strongs) strongsSet.add('H' + String(r.strongs).replace(/^H+/, ''));

            if (!bySurface[r.word_raw]) bySurface[r.word_raw] = { count: 0, books: {} };
            bySurface[r.word_raw].count++;

            if (!bySurface[r.word_raw].books[r.book_id]) bySurface[r.word_raw].books[r.book_id] = [];
            bySurface[r.word_raw].books[r.book_id].push({
                chapter: r.chapter,
                verse: r.verse,
                token_ordinal: r.token_ordinal
            });

            bookTotals[r.book_id] = (bookTotals[r.book_id] || 0) + 1;
        }

        const surfaces = Object.entries(bySurface)
            .map(([surface, data]) => ({ surface, ...data }))
            .sort((a, b) => b.count - a.count);

        const strongs = [...strongsSet].sort((a, b) => {
            const na = parseInt(a.replace(/\D/g, ''), 10) || 0;
            const nb = parseInt(b.replace(/\D/g, ''), 10) || 0;
            return na - nb;
        });

        res.json({
            root: rootTerm || null,
            surface: surfaceTerm || null,
            strongs,
            strongsLabel: strongs.join(', '),
            total: rows.length,
            bookTotals,
            surfaces
        });
    } catch (err) {
        console.error('/api/root failed:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/root/verses', (req, res) => {
    try {
        const bookId = req.query.book ? parseInt(req.query.book, 10) : null;
        const limit = Math.min(parseInt(req.query.limit, 10) || 25, 50);
        const offset = parseInt(req.query.offset, 10) || 0;

        const { lexicon, homographs, surfaceOverrides } = loadLexicons();
        const { rows } = getRowsForRootExplorerReq(req, lexicon, homographs);

        let hits = bookId ? rows.filter(r => r.book_id === bookId) : rows;

        const total = hits.length;
        hits = hits.slice(offset, offset + limit);

        const byVerse = new Map();
        for (const h of hits) {
            const key = `${h.book_id}:${h.chapter}:${h.verse}`;
            if (!byVerse.has(key)) {
                byVerse.set(key, {
                    book_id: h.book_id,
                    chapter: h.chapter,
                    verse: h.verse,
                    hit_ordinals: []
                });
            }
            byVerse.get(key).hit_ordinals.push(h.token_ordinal);
        }

        const verses = [...byVerse.values()].map(hit => {
            const rawTokens = db.prepare(`
                SELECT token_ordinal, word_raw, pos, morph, strongs
                FROM tokens_bhs
                WHERE book_id = ? AND chapter = ? AND verse = ?
                ORDER BY token_ordinal
            `).all(hit.book_id, hit.chapter, hit.verse);

            const lines = rawTokens.map(r =>
                [1, r.token_ordinal, r.word_raw || '', r.pos || '', r.morph || '', r.strongs || ''].join('\t')
            ).join('\n');

            const parsed = parseHebrewData(lines, lexicon, homographs, surfaceOverrides);

            const parsedByOrdinal = buildParsedByOrdinal(parsed);
            const tokens = rawTokens.map(raw => {
                const { display_root, translation, components } = enrichToken(raw, parsedByOrdinal);
                const wb = parsedByOrdinal.get(raw.token_ordinal);
                const rootComp = wb?.components?.find(c => c.css === 'root') || wb?.components?.[0];
                const translit_root = rootComp?.translit || rootComp?.lemmaTranslit || '';
                return {
                    token_ordinal: raw.token_ordinal,
                    word_raw: raw.word_raw,
                    pos: raw.pos,
                    morph: raw.morph,
                    strongs: raw.strongs,
                    display_root,
                    translation,
                    translit_root,
                    components
                };
            });

            return {
                book_id: hit.book_id,
                chapter: hit.chapter,
                verse: hit.verse,
                hit_ordinal: hit.hit_ordinals[0],
                hit_ordinals: hit.hit_ordinals,
                tokens
            };
        });

        res.json({ total, offset, verses, hasMore: total > offset + limit });
    } catch (err) {
        console.error('/api/root/verses failed:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/nav/roots', (req, res) => {
    try {
        res.json(getRootNavIndex());
    } catch (err) {
        console.error('/api/nav/roots failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// Neighbors endpoint — fast O(1) prev/next for root page
app.get('/api/nav/roots/neighbors', (req, res) => {
    try {
        const entries = getRootNavIndex();
        const sn   = (req.query.sn || '').trim();
        const root = (req.query.root || '').trim();
        // Support ?sns=H732,H733,H734 for multi-SN roots (set by navHref on alpha nav)
        const snList = (req.query.sns || '').split(',').map(s => s.trim()).filter(Boolean);

        let idx = -1;
        if (root)          idx = getRootIndexByValue(root);
        if (idx < 0 && sn) idx = getRootIndexBySN(sn);
        if (idx < 0) {
            for (const s of snList) { idx = getRootIndexBySN(s); if (idx >= 0) break; }
        }
        // No params at all → return first entry so /roots redirect works
        if (idx < 0 && !root && !sn && !snList.length && entries.length) idx = 0;

        res.json({
            index: idx,
            total: entries.length,
            current: idx >= 0 ? entries[idx] : null,
            prev:    idx > 0  ? entries[idx - 1] : null,
            next:    idx >= 0 && idx < entries.length - 1 ? entries[idx + 1] : null,
        });
    } catch (err) {
        console.error('/api/nav/roots/neighbors failed:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/nav/surfaces', (req, res) => {
    try {
        res.json(getSurfNavIndex());
    } catch (err) {
        console.error('/api/nav/surfaces failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// Neighbors endpoint — fast O(1) prev/next for surface page
app.get('/api/nav/surfaces/neighbors', (req, res) => {
    try {
        const entries = getSurfNavIndex();
        const surface = (req.query.surface || req.query.word || '').trim();
        const idx = surface ? getSurfIndexByValue(surface) : -1;

        res.json({
            index: idx,
            total: entries.length,
            current: idx >= 0 ? entries[idx] : null,
            prev:    idx > 0  ? entries[idx - 1] : null,
            next:    idx >= 0 && idx < entries.length - 1 ? entries[idx + 1] : null,
        });
    } catch (err) {
        console.error('/api/nav/surfaces/neighbors failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── ADMIN: manual rebuild trigger ────────────────────────────────────────
// POST /admin/rebuild-indexes
// Hit this any time after editing a lexicon file to force an immediate rebuild
// without waiting for the file-watcher debounce or restarting the server.
app.post('/admin/rebuild-indexes', (req, res) => {
    if (_rebuildInProgress) {
        return res.json({ ok: false, message: 'Rebuild already in progress — try again in a moment.' });
    }
    _rebuildInProgress = true;
    _lexiconCache = null;
    _rootNavIndex = null;
    _surfNavIndex = null;
    _rootByValue  = null;
    _surfByValue  = null;
    _rootBySN     = null;
    try {
        buildNavIndexes();
        _lastRebuildAt = new Date();
        console.log(`[admin] Manual rebuild complete. ${_rootNavIndex.length} roots, ${_surfNavIndex.length} surfaces.`);
        res.json({
            ok: true,
            roots: _rootNavIndex.length,
            surfaces: _surfNavIndex.length,
            rebuiltAt: _lastRebuildAt.toISOString()
        });
    } catch (err) {
        console.error('[admin] Manual rebuild failed:', err.message);
        res.status(500).json({ ok: false, message: err.message });
    } finally {
        _rebuildInProgress = false;
    }
});

// GET /admin/index-status — quick health check
app.get('/admin/index-status', (req, res) => {
    res.json({
        roots: _rootNavIndex?.length ?? 0,
        surfaces: _surfNavIndex?.length ?? 0,
        rebuildInProgress: _rebuildInProgress,
        lastRebuildAt: _lastRebuildAt?.toISOString() ?? null,
        lexiconCached: _lexiconCache !== null,
    });
});

// ── ADMIN: location-keyed Strong's # overrides ──────────────────────────────
// Lets an admin browse to one exact verse, see its tokens, and pin a
// corrected or brand-new synthetic Strong's # (e.g. H2995a) to ONE occurrence
// — book_id:chapter:verse:token_ordinal — without touching every other
// occurrence of the same spelling. See strongs-location-overrides.json /
// applyLocOverride*/locOverridesTargeting above for how this gets read back
// in at every choke point that needs it (the reader, root/surface search,
// verse-list expansion). Covered by the existing global ADMIN_KEY guard on
// /api/admin/* (see app.use around line ~222) — no extra auth here.

// GET /api/admin/verse-tokens?book=&chapter=&verse= — token list for one
// verse, for the override editor to show clickable tokens with their CURRENT
// effective Strong's # (already reflecting any override in place).
app.get('/api/admin/verse-tokens', (req, res) => {
    try {
        const book_id = parseInt(req.query.book, 10);
        const chapter = parseInt(req.query.chapter, 10);
        const verse   = parseInt(req.query.verse, 10);
        if (!book_id || !chapter || !Number.isInteger(verse)) {
            return res.status(400).json({ error: 'book, chapter, verse query params are required' });
        }
        const { lexicon, homographs, surfaceOverrides } = loadLexicons();
        const rawBlocks = bhsVerseWords(book_id, chapter, verse, lexicon, homographs, surfaceOverrides);
        // Grouped BY READER WORD, not flattened — a single displayed reader
        // word (e.g. "WaYaAmar" or, per fieldy's actual question, "Yabanaal")
        // can be folded from MULTIPLE raw source tokens (a proclitic/
        // preformative morpheme + the content root, each its own DB row with
        // its own token_ordinal). A flat list of every source token loses
        // that grouping and makes it look like a piece is "missing" when
        // it's really sitting in a sibling token of the SAME reader word.
        // Surfacing the group lets the admin see the whole fused word (as
        // rendered in the reader) and still target the exact morpheme's
        // token_ordinal underneath it for the override.
        const blocks = rawBlocks.map(b => {
            const sourceTokens = (b.sourceTokens || []).map(st => ({
                token_ordinal: st.token_ordinal,
                word_raw: st.word_raw,
                strongs: st.strongs || '',
                pos: st.pos || '',
            }));
            return {
                surface: sourceTokens.map(st => st.word_raw).join(''),
                block_strongs: b.strongs || '',
                gloss: (b.components || []).map(c => c && c.translation).filter(Boolean).join(' '),
                sourceTokens,
            };
        });
        res.json({ book_id, chapter, verse, book_name: BOOK_NAMES[book_id] || `Book ${book_id}`, is_heb: navHebBooks().has(book_id), blocks });
    } catch (err) {
        console.error('/api/admin/verse-tokens failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/strongs-overrides — every override currently active, for the
// editor's "existing overrides" list.
app.get('/api/admin/strongs-overrides', (req, res) => {
    const { locationOverrides } = loadLexicons();
    const list = Object.entries(locationOverrides || {}).map(([key, ov]) => {
        const [book_id, chapter, verse, token_ordinal] = key.split(':').map(Number);
        return {
            key, book_id, chapter, verse, token_ordinal,
            book_name: BOOK_NAMES[book_id] || `Book ${book_id}`,
            strongs: ov.strongs, word_raw: ov.word_raw || '', note: ov.note || '',
            parts: Array.isArray(ov.parts) ? ov.parts : null,
        };
    }).sort((a, b) => a.book_id - b.book_id || a.chapter - b.chapter || a.verse - b.verse || a.token_ordinal - b.token_ordinal);
    res.json({ overrides: list });
});

const LOC_OVERRIDE_PATH = path.join(__dirname, 'lexicon', 'strongs-location-overrides.json');
function _readLocOverridesRaw() {
    try {
        if (!fs.existsSync(LOC_OVERRIDE_PATH)) return {};
        return JSON.parse(fs.readFileSync(LOC_OVERRIDE_PATH, 'utf8'));
    } catch (e) {
        console.warn('[admin] failed to read strongs-location-overrides.json:', e.message);
        return {};
    }
}
function _writeLocOverridesRaw(obj) {
    fs.writeFileSync(LOC_OVERRIDE_PATH, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}
// Rebuild everything the override touches, synchronously, so the admin sees
// the effect immediately instead of waiting on the 300ms fs.watch debounce.
function _applyLocOverrideChangeNow() {
    _lexiconCache = null;
    _rootNavIndex = null; _surfNavIndex = null;
    _rootByValue = null; _surfByValue = null; _rootBySN = null; _wordBySn = null;
    buildNavIndexes();
}

// POST /api/admin/strongs-override — create or update one override.
// Body: { book_id, chapter, verse, token_ordinal, word_raw, note, ...either:
//   strongs: "H2995a"          — single corrected/synthetic SN, OR
//   parts: [{paleo,strongs,gloss}, ...] — a genuine compound (two+ REAL,
//     independently-meaningful roots fused into one written word, e.g. Ben
//     H1121 + El H410). strongs is auto-derived as the parts' SNs joined
//     with the app's existing compound-tag separator ("＋"), so every OTHER
//     place that already understands compound tags (nav index, root/surface
//     search, findWordOccurrences/hebOccForSN) picks both halves up for
//     free — see _strongsHasAtomic. }
app.post('/api/admin/strongs-override', express.json({ limit: '64kb' }), (req, res) => {
    try {
        const { book_id, chapter, verse, token_ordinal, strongs, parts, word_raw, note } = req.body || {};
        const cleanParts = Array.isArray(parts)
            ? parts.filter(p => p && String(p.paleo || '').trim() && String(p.strongs || '').trim())
                   .map(p => ({ paleo: String(p.paleo).trim(), strongs: String(p.strongs).trim(), gloss: (p.gloss || '').trim() }))
            : null;
        const derivedStrongs = cleanParts && cleanParts.length
            ? cleanParts.map(p => p.strongs).join('＋')
            : String(strongs || '').trim();
        if (!book_id || !chapter || !Number.isInteger(verse) || token_ordinal == null || !derivedStrongs) {
            return res.status(400).json({ error: 'book_id, chapter, verse, token_ordinal, and strongs (or parts) are required' });
        }
        const key = locOverrideKey(book_id, chapter, verse, token_ordinal);
        const raw = _readLocOverridesRaw();
        raw[key] = {
            strongs: derivedStrongs,
            word_raw: word_raw || '',
            note: note || '',
            ...(cleanParts && cleanParts.length ? { parts: cleanParts } : {}),
        };
        _writeLocOverridesRaw(raw);
        _applyLocOverrideChangeNow();
        res.json({ ok: true, key, override: raw[key] });
    } catch (err) {
        console.error('/api/admin/strongs-override POST failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/admin/strongs-override?key=book:chapter:verse:token_ordinal
app.delete('/api/admin/strongs-override', (req, res) => {
    try {
        const key = (req.query.key || '').trim();
        if (!key) return res.status(400).json({ error: 'key query param required' });
        const raw = _readLocOverridesRaw();
        if (!(key in raw)) return res.status(404).json({ error: 'no override at that key' });
        delete raw[key];
        _writeLocOverridesRaw(raw);
        _applyLocOverrideChangeNow();
        res.json({ ok: true });
    } catch (err) {
        console.error('/api/admin/strongs-override DELETE failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// SURFACE INDEX ROUTES — backed by prebuilt surface-index.db
// All lookups are O(1) indexed reads; no runtime corpus scanning or parsing.
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/surface?word=𐤏𐤋𐤌𐤔𐤌𐤓𐤕𐤉
// Returns parsed metadata for one surface: root_paleo, strongs, components, etc.
app.get('/api/surface', (req, res) => {
    try {
        const word = (req.query.word || '').trim();
        if (!word) return res.status(400).json({ error: 'word param required' });

        // 1. Fast path: prebuilt index. A homograph surface now has one row per
        //    reading (word_raw, strongs); return the most-frequent reading so the
        //    result is deterministic rather than an arbitrary first row.
        const row = surfDb.prepare(`
            SELECT t.*,
                   (SELECT COUNT(*) FROM surface_occurrences o
                     WHERE o.word_raw = t.word_raw ${OCC_SN_JOIN} ${SRC_JOIN}) AS _occ
            FROM   token_surfaces t
            WHERE  t.word_raw = ?${SURF_HAS_SOURCE ? " AND t.source = 'BHS'" : ''}
            ORDER BY _occ DESC
            LIMIT 1
        `).get(word);
        if (row) {
            return res.json({
                word_raw:       row.word_raw,
                rendered_paleo: row.rendered_paleo,
                root_paleo:     row.root_paleo,
                strongs:        row.strongs,
                all_strongs:    JSON.parse(row.all_strongs || '[]'),
                pos:            row.pos,
                morph:          row.morph,
                components:     JSON.parse(row.components),
            });
        }

        // 2. Fallback: live parse from bible.db — handles stale surface-index.db
        const dbRow = db.prepare(`
            SELECT word_raw, pos, morph, strongs
            FROM tokens_bhs
            WHERE word_raw = ?
            LIMIT 1
        `).get(word);

        if (!dbRow) return res.status(404).json({ error: `Surface not found: ${word}` });

        const { lexicon, homographs, surfaceOverrides } = loadLexicons();
        const line = [1, 1, dbRow.word_raw || '', dbRow.pos || '', dbRow.morph || '', dbRow.strongs || ''].join('	');
        const parsed = parseHebrewData(line, lexicon, homographs, surfaceOverrides);
        const wb = parsed?.[0] || null;
        const components = wb?.components || [];
        const rootComp   = components.find(c => c.css === 'root') || components[0];
        const root_paleo = rootComp?.true_root || rootComp?.paleo || word;
        const sn         = dbRow.strongs ? 'H' + String(dbRow.strongs).replace(/^H+/, '') : null;

        return res.json({
            word_raw:       word,
            rendered_paleo: word,
            root_paleo,
            strongs:        sn,
            all_strongs:    sn ? [sn] : [],
            pos:            dbRow.pos,
            morph:          dbRow.morph,
            components,
            _fallback:      true,
        });
    } catch (err) {
        console.error('/api/surface failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/surface/verses?word=𐤏𐤋𐤌𐤔𐤌𐤓𐤕𐤉&offset=0&limit=25&book=35
// Returns paginated verse hits for one surface. Precomputed, zero scanning.
app.get('/api/surface/verses', (req, res) => {
    try {
        const word   = (req.query.word || '').trim();
        const offset = parseInt(req.query.offset, 10) || 0;
        const limit  = Math.min(parseInt(req.query.limit, 10) || 25, 50);
        const bookId = req.query.book ? parseInt(req.query.book, 10) : null;
        if (!word) return res.status(400).json({ error: 'word param required' });

        // Pinned to BHS: these endpoints label their results as the Masoretic
        // text, and before the HEB bake that is all the index held.
        const whereBook   = (bookId ? ' AND book_id = ?' : '') + SRC_BHS_ONLY;
        const countParams = bookId ? [word, bookId] : [word];
        const listParams  = bookId ? [word, bookId, limit, offset] : [word, limit, offset];

        const total = surfDb.prepare(
            `SELECT COUNT(*) AS n FROM surface_occurrences WHERE word_raw = ?${whereBook}`
        ).get(...countParams)?.n || 0;

        const hits = surfDb.prepare(`
            SELECT book_id, chapter, verse, token_ordinal
            FROM surface_occurrences
            WHERE word_raw = ?${whereBook}
            ORDER BY book_id, chapter, verse, token_ordinal
            LIMIT ? OFFSET ?
        `).all(...listParams);

        res.json({ word, total, offset, hasMore: total > offset + limit, hits });
    } catch (err) {
        console.error('/api/surface/verses failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/surface/verses/rendered?word=𐤏𐤋𐤌𐤔𐤌𐤓𐤕𐤉&offset=0&limit=25
// Like /api/surface/verses but returns full parsed verse tokens, not just hit locations.
// Used by the surface page to render verse cards with highlighted hits.
app.get('/api/surface/verses/rendered', (req, res) => {
    try {
        const word   = (req.query.word || '').trim();
        const offset = parseInt(req.query.offset, 10) || 0;
        const limit  = Math.min(parseInt(req.query.limit, 10) || 25, 50);
        const bookId = req.query.book ? parseInt(req.query.book, 10) : null;
        if (!word) return res.status(400).json({ error: 'word param required' });

        // Pinned to BHS: these endpoints label their results as the Masoretic
        // text, and before the HEB bake that is all the index held.
        const whereBook   = (bookId ? ' AND book_id = ?' : '') + SRC_BHS_ONLY;
        const countParams = bookId ? [word, bookId] : [word];
        const listParams  = bookId ? [word, bookId, limit, offset] : [word, limit, offset];

        const total = surfDb.prepare(
            `SELECT COUNT(*) AS n FROM surface_occurrences WHERE word_raw = ?${whereBook}`
        ).get(...countParams)?.n || 0;

        const hits = surfDb.prepare(`
            SELECT book_id, chapter, verse, token_ordinal, word_raw
            FROM surface_occurrences
            WHERE word_raw = ?${whereBook}
            ORDER BY book_id, chapter, verse, token_ordinal
            LIMIT ? OFFSET ?
        `).all(...listParams);

        const { lexicon, homographs, surfaceOverrides } = loadLexicons();
        const byVerse = new Map();
        for (const h of hits) {
            const key = `${h.book_id}:${h.chapter}:${h.verse}`;
            if (!byVerse.has(key)) {
                byVerse.set(key, {
                    book_id: h.book_id, chapter: h.chapter, verse: h.verse,
                    hit_ordinals: [],
                    hit_words: [],
                });
            }
            const entry = byVerse.get(key);
            entry.hit_ordinals.push(h.token_ordinal);
            // Use the word_raw from the index row so the key exactly matches tokens_bhs
            entry.hit_words.push(`${h.token_ordinal}:${h.word_raw}`);
        }

        const verses = [...byVerse.values()].map(hit => {
            const rawTokens = db.prepare(`
                SELECT token_ordinal, word_raw, pos, morph, strongs
                FROM tokens_bhs
                WHERE book_id = ? AND chapter = ? AND verse = ?
                ORDER BY token_ordinal
            `).all(hit.book_id, hit.chapter, hit.verse);

            const lines = rawTokens.map(r =>
                [1, r.token_ordinal, r.word_raw || '', r.pos || '', r.morph || '', r.strongs || ''].join('\t')
            ).join('\n');

            const parsed = parseHebrewData(lines, lexicon, homographs, surfaceOverrides);

            const hitWordSet = new Set(hit.hit_words);

            const parsedByOrdinal = buildParsedByOrdinal(parsed);
            const tokens = rawTokens.map(raw => {
                const { display_root, translation, components } = enrichToken(raw, parsedByOrdinal);
                const isHit = hitWordSet.has(`${raw.token_ordinal}:${raw.word_raw}`);
                return {
                    token_ordinal: raw.token_ordinal,
                    word_raw:      raw.word_raw,
                    pos: raw.pos, morph: raw.morph, strongs: raw.strongs,
                    display_root, translation, components,
                    isHit,
                };
            });

            return { ...hit, tokens };
        });

        res.json({ word, total, offset, hasMore: total > offset + limit, verses });
    } catch (err) {
        console.error('/api/surface/verses/rendered failed:', err);
        res.status(500).json({ error: err.message });
    }
});


// ── TOKEN → COMPONENT MAPPER ─────────────────────────────────────────────────
// parseHebrewData groups consecutive standalone tokens (conj/prep/art) into the
// same output entry, so parsed.length ≤ rawTokens.length.  Mapping by array
// index [i] produces wrong isHit results for every verse containing particles.
// Instead: build ordinal → parsedEntry map and look up each rawToken by ordinal.
function buildParsedByOrdinal(parsed) {
    // Each parsed entry has token_ordinal set to the LAST token's ordinal when
    // multiple tokens merged.  We also need to handle multi-component entries
    // where each component has its own token_ordinal annotation (set during parse).
    // Strategy: for each parsed entry, walk its components and register the entry
    // under every token_ordinal that appears in its components.
    const map = new Map();
    for (const entry of parsed) {
        // Primary registration by entry.token_ordinal
        if (entry.token_ordinal != null) {
            if (!map.has(entry.token_ordinal)) map.set(entry.token_ordinal, entry);
        }
        // Also register under each component's token_ordinal (covers merged conj/prep/art)
        for (const comp of (entry.components || [])) {
            if (comp.token_ordinal != null && !map.has(comp.token_ordinal)) {
                map.set(comp.token_ordinal, entry);
            }
        }
    }
    return map;
}

// Enrich a rawToken row with its parsed components/translation from the ordinal map.
// Returns { display_root, translation, components } — safe to call even if not found.
function enrichToken(raw, parsedByOrdinal) {
    const wb = parsedByOrdinal.get(raw.token_ordinal) || null;
    let display_root = raw.word_raw, translation = '', components = [];
    if (wb?.components?.length) {
        components   = wb.components;
        const rc     = wb.components.find(c => c.css === 'root') || wb.components[0];
        display_root = rc.paleo || raw.word_raw;
        translation  = rc.translation || '';
    }
    return { display_root, translation, components };
}

// GET /api/root/by-strongs?sn=H4931
// Returns all surface forms for a Strong's number + canonical root_paleo.
// Replaces the old heuristic nav-index root resolution.
app.get('/api/root/by-strongs', (req, res) => {
    try {
        const raw = (req.query.sn || '').trim();
        if (!raw) return res.status(400).json({ error: 'sn param required' });
        const sn = 'H' + raw.replace(/^H+/, '');

        // Step 1: find all word_raw values for this SN from the authoritative source —
        // tokens_bhs.  The surface index stores the *most-frequent* strongs per surface,
        // which means rare SNs (e.g. H71 appearing once for a place name) won't match
        // via token_surfaces.strongs.  tokens_bhs is the ground truth.
        const bibWordRaws = db.prepare(`
            SELECT DISTINCT word_raw FROM tokens_bhs
            WHERE strongs = ? AND word_raw IS NOT NULL AND word_raw != ''
        `).all(sn).map(r => r.word_raw);

        if (!bibWordRaws.length) return res.status(404).json({ error: `No surfaces found for ${sn}` });

        // Step 2: fetch surface metadata from the index for those word_raws.
        // On the homograph-accurate index, restrict to the reading whose SN is
        // the one requested (ts.strongs = sn) and count only THAT reading's
        // occurrences — so H5148's page shows only H5148 hits, not H5183's that
        // happen to share the glyphs 𐤍𐤇𐤕. For any word_raw not in the surface
        // index we build a stub below.
        const phW = bibWordRaws.map(() => '?').join(',');
        const occSnFilter = SURF_HAS_SN ? 'AND so.strongs = ?' : '';
        const tsSnFilter  = SURF_HAS_SN ? 'AND ts.strongs = ?' : '';
        // BUG A: token_surfaces now holds one row per READING (word_raw,strongs,
        // pos,morph). This listing wants one row per distinct SPELLING, so collapse
        // to (word_raw,strongs) and let MAX(_reading_occ) pick the dominant reading
        // as the representative — otherwise every morph reading appears as a
        // duplicate surface. (Old indexes have no dupes; the GROUP BY is a no-op.)
        const tsGroup = SURF_HAS_MORPH ? 'GROUP BY ts.word_raw, ts.strongs' : '';
        const tsPick  = SURF_HAS_MORPH ? `, MAX((SELECT COUNT(*) FROM surface_occurrences so2
                        WHERE so2.word_raw = ts.word_raw AND so2.strongs = ts.strongs
                          AND so2.pos = ts.pos AND so2.morph = ts.morph
                          ${SURF_HAS_SOURCE ? "AND so2.source = 'BHS'" : ''})) AS _reading_occ` : '';
        const surfaces = surfDb.prepare(`
            SELECT ts.word_raw, ts.rendered_paleo, ts.root_paleo,
                   ts.strongs, ts.all_strongs, ts.pos, ts.morph, ts.components,
                   (SELECT COUNT(*) FROM surface_occurrences so
                    WHERE so.word_raw = ts.word_raw ${occSnFilter}${SRC_BHS_ONLY}) AS occ_count
                   ${tsPick}
            FROM token_surfaces ts
            WHERE ts.word_raw IN (${phW}) ${tsSnFilter}${SURF_HAS_SOURCE ? " AND ts.source = 'BHS'" : ''}
            ${tsGroup}
            ORDER BY occ_count DESC
        `).all(...(SURF_HAS_SN ? [sn, ...bibWordRaws, sn] : bibWordRaws));

        // If surface index is missing some word_raws entirely, build minimal stubs
        // from tokens_bhs so the root page still loads.
        const indexedSet = new Set(surfaces.map(s => s.word_raw));
        for (const wr of bibWordRaws) {
            if (!indexedSet.has(wr)) {
                const cnt = db.prepare(
                    `SELECT COUNT(*) AS n FROM tokens_bhs WHERE word_raw = ? AND strongs = ?`
                ).get(wr, sn)?.n || 0;
                surfaces.push({
                    word_raw: wr, rendered_paleo: wr, root_paleo: wr,
                    strongs: sn, all_strongs: JSON.stringify([sn]),
                    pos: '', morph: '', components: '[]', occ_count: cnt,
                });
            }
        }

        if (!surfaces.length) return res.status(404).json({ error: `No surfaces found for ${sn}` });

        // Canonical root: strongs-roots.json (ground truth) > STRONGS_ROOT_OVERRIDES
        // (manual fixes) > surface index root_paleo (parser output).
        const root_paleo = getCanonicalRoot(sn, surfaces[0].root_paleo || surfaces[0].word_raw);
        const total      = surfaces.reduce((a, s) => a + (s.occ_count || 0), 0);

        // Build bookTotals from surface_occurrences for the sidebar (this reading only)
        const wordRaws = surfaces.map(s => s.word_raw);
        const ph = wordRaws.map(() => '?').join(',');
        const bookRows = surfDb.prepare(`
            SELECT book_id, COUNT(*) AS cnt
            FROM surface_occurrences
            WHERE word_raw IN (${ph}) ${SURF_HAS_SN ? 'AND strongs = ?' : ''}${SRC_BHS_ONLY}
            GROUP BY book_id
        `).all(...(SURF_HAS_SN ? [...wordRaws, sn] : wordRaws));
        const bookTotals = {};
        for (const r of bookRows) bookTotals[r.book_id] = r.cnt;

        res.json({
            sn,
            root_paleo,
            total,
            bookTotals,
            surfaces: surfaces.map(s => ({
                word_raw:       s.word_raw,
                rendered_paleo: s.rendered_paleo,
                root_paleo:     s.root_paleo,
                strongs:        s.strongs,
                all_strongs:    JSON.parse(s.all_strongs || '[]'),
                pos:            s.pos,
                morph:          s.morph,
                count:          s.occ_count,
                components:     JSON.parse(s.components),
            })),
        });
    } catch (err) {
        console.error('/api/root/by-strongs failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/root/by-strongs/verses?sn=H4931&offset=0&limit=25&book=35
// Paginated full verse render for a Strong's number across all its surfaces.
app.get('/api/root/by-strongs/verses', (req, res) => {
    try {
        const raw    = (req.query.sn || '').trim();
        const offset = parseInt(req.query.offset, 10) || 0;
        const limit  = Math.min(parseInt(req.query.limit, 10) || 25, 50);
        const bookId = req.query.book ? parseInt(req.query.book, 10) : null;
        // surface filter: when "This surface only" is active
        const surfaceFilter = (req.query.surface || '').trim() || null;

        if (!raw) return res.status(400).json({ error: 'sn param required' });
        const sn = 'H' + raw.replace(/^H+/, '');

        // Get word_raws from tokens_bhs (ground truth) so rare SNs like H71 that
        // aren't the primary strongs in token_surfaces still resolve correctly.
        let wordRaws = db.prepare(`
            SELECT DISTINCT word_raw FROM tokens_bhs
            WHERE strongs = ? AND word_raw IS NOT NULL AND word_raw != ''
        `).all(sn).map(r => r.word_raw);

        if (!wordRaws.length) return res.status(404).json({ error: `No surfaces for ${sn}` });

        // Apply surface filter if active
        if (surfaceFilter) wordRaws = wordRaws.filter(w => w === surfaceFilter);
        if (!wordRaws.length) return res.json({ sn, total: 0, offset, hasMore: false, verses: [] });

        const ph       = wordRaws.map(() => '?').join(',');
        const bookCl   = bookId ? ' AND book_id = ?' : '';
        const snCl     = SURF_HAS_SN ? ' AND strongs = ?' : '';   // homograph reading filter
        const snArg    = SURF_HAS_SN ? [sn] : [];

        // Try surface_occurrences index first (fast). Fall back to tokens_bhs for
        // any word_raw the surface index doesn't have (e.g. rare SNs not indexed).
        const surfIndexed = surfDb.prepare(
            `SELECT DISTINCT word_raw FROM surface_occurrences WHERE word_raw IN (${ph})${snCl}`
        ).all(...wordRaws, ...snArg).map(r => r.word_raw);
        const notIndexed = wordRaws.filter(w => !surfIndexed.includes(w));

        let total = surfDb.prepare(`
            SELECT COUNT(*) AS n FROM surface_occurrences
            WHERE word_raw IN (${ph})${bookCl}${snCl}
        `).get(...wordRaws, ...(bookId ? [bookId] : []), ...snArg)?.n || 0;

        // Add counts from tokens_bhs for non-indexed surfaces
        if (notIndexed.length) {
            const phN = notIndexed.map(() => '?').join(',');
            const bibCl = bookId ? ' AND book_id = ?' : '';
            const bibCnt = db.prepare(
                `SELECT COUNT(*) AS n FROM tokens_bhs WHERE word_raw IN (${phN}) AND strongs = ?${bibCl}`
            ).get(...notIndexed, sn, ...(bookId ? [bookId] : []))?.n || 0;
            total += bibCnt;
        }

        // Paginate: surface index hits first, then tokens_bhs overflow
        const hits = surfDb.prepare(`
            SELECT book_id, chapter, verse, token_ordinal, word_raw
            FROM surface_occurrences
            WHERE word_raw IN (${ph})${bookCl}${snCl}
            ORDER BY book_id, chapter, verse, token_ordinal
            LIMIT ? OFFSET ?
        `).all(...wordRaws, ...(bookId ? [bookId] : []), ...snArg, limit, offset);

        // If surface index gave us nothing, fall back to tokens_bhs directly
        const bibHits = [];
        if (!hits.length && notIndexed.length) {
            const phN = notIndexed.map(() => '?').join(',');
            const bibCl = bookId ? ' AND book_id = ?' : '';
            const rows = db.prepare(`
                SELECT book_id, chapter, verse, token_ordinal, word_raw
                FROM tokens_bhs
                WHERE word_raw IN (${phN}) AND strongs = ?${bibCl}
                ORDER BY book_id, chapter, verse, token_ordinal
                LIMIT ? OFFSET ?
            `).all(...notIndexed, sn, ...(bookId ? [bookId] : []), limit, offset);
            bibHits.push(...rows);
        }
        const allHits = [...hits, ...bibHits];

        // Group hits by verse, tracking both ordinal AND word_raw so the client
        // can highlight the exact matching token — not just any token at that
        // ordinal position (which could be a different word in another verse).
        const { lexicon, homographs, surfaceOverrides } = loadLexicons();
        const byVerse = new Map();
        for (const h of allHits) {
            const key = `${h.book_id}:${h.chapter}:${h.verse}`;
            if (!byVerse.has(key)) {
                byVerse.set(key, {
                    book_id: h.book_id, chapter: h.chapter, verse: h.verse,
                    hit_ordinals: [],
                    hit_words: [],   // "ordinal:word_raw" pairs for precise matching
                });
            }
            const entry = byVerse.get(key);
            entry.hit_ordinals.push(h.token_ordinal);
            entry.hit_words.push(`${h.token_ordinal}:${h.word_raw}`);
        }

        const verses = [...byVerse.values()].map(hit => {
            const rawTokens = db.prepare(`
                SELECT token_ordinal, word_raw, pos, morph, strongs
                FROM tokens_bhs
                WHERE book_id = ? AND chapter = ? AND verse = ?
                ORDER BY token_ordinal
            `).all(hit.book_id, hit.chapter, hit.verse);

            const lines = rawTokens.map(r =>
                [1, r.token_ordinal, r.word_raw || '', r.pos || '', r.morph || '', r.strongs || ''].join('\t')
            ).join('\n');

            const parsed = parseHebrewData(lines, lexicon, homographs, surfaceOverrides);

            const hitWordSet = new Set(hit.hit_words);

            const parsedByOrdinal = buildParsedByOrdinal(parsed);
            const tokens = rawTokens.map(raw => {
                const { display_root, translation, components } = enrichToken(raw, parsedByOrdinal);
                const isHit = hitWordSet.has(`${raw.token_ordinal}:${raw.word_raw}`);
                return {
                    token_ordinal: raw.token_ordinal,
                    word_raw:      raw.word_raw,
                    pos: raw.pos, morph: raw.morph, strongs: raw.strongs,
                    display_root, translation, components,
                    isHit,
                };
            });

            return { ...hit, tokens };
        });

        res.json({ sn, total, offset, hasMore: total > offset + limit, verses });
    } catch (err) {
        console.error('/api/root/by-strongs/verses failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/validate-roots?limit=50
// Diagnostic: scans all Strong's numbers in the surface index and flags any whose
// computed root_paleo does not match what STRONGS_ROOT_OVERRIDES says (or what a
// human would expect). Returns entries sorted by occurrence count desc so the most
// impactful mismatches appear first.
// Usage: open http://localhost:3000/api/validate-roots in your browser.
app.get('/api/validate-roots', (req, res) => {
    try {
        const limit  = Math.min(parseInt(req.query.limit, 10) || 100, 500);
        const filter = (req.query.filter || '').trim(); // optional: ?filter=mismatch

        // Fetch all unique primary strongs from the surface index, with occurrence counts
        const rows = surfDb.prepare(`
            SELECT ts.strongs, ts.root_paleo, ts.word_raw,
                   SUM(so.occ_count) AS total_occ
            FROM (SELECT word_raw, strongs, MIN(root_paleo) AS root_paleo
                  FROM token_surfaces GROUP BY word_raw, strongs) ts
            LEFT JOIN (
                SELECT word_raw, ${SURF_HAS_SN ? 'strongs,' : ''} COUNT(*) AS occ_count
                FROM surface_occurrences
                GROUP BY word_raw${SURF_HAS_SN ? ', strongs' : ''}
            ) so ON so.word_raw = ts.word_raw ${SURF_HAS_SN ? 'AND so.strongs = ts.strongs' : ''}
            WHERE ts.strongs IS NOT NULL AND ts.strongs != ''
            GROUP BY ts.strongs
            ORDER BY total_occ DESC
            LIMIT ?
        `).all(limit);

        const results = rows.map(r => {
            const sn          = r.strongs;
            const override    = STRONGS_ROOT_OVERRIDES[sn] || null;
            const index_root  = r.root_paleo;
            const display_root = override || index_root;
            const mismatch    = override && override !== index_root;
            const no_override = !override;
            return {
                sn,
                index_root,
                override,
                display_root,
                most_freq_surface: r.word_raw,
                total_occ: r.total_occ || 0,
                mismatch,
                no_override,
                status: override
                    ? (mismatch ? 'OVERRIDE_DIFFERS' : 'OVERRIDE_MATCHES')
                    : 'NO_OVERRIDE',
            };
        });

        const filtered = filter === 'mismatch'
            ? results.filter(r => r.mismatch)
            : filter === 'no_override'
            ? results.filter(r => r.no_override)
            : results;

        res.json({
            total: filtered.length,
            filters_available: ['mismatch', 'no_override'],
            hint: 'Add entries to STRONGS_ROOT_OVERRIDES in server.js to fix wrong roots.',
            results: filtered,
        });
    } catch (err) {
        console.error('/api/validate-roots failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── ROOT EXPLORER ENDPOINTS (new, surface-index-driven) ──────────────────────
// These replace the old /api/nav/roots + /api/root + /api/root/verses chain
// for the React Root page. They're built on token_surfaces.root_paleo which
// gives accurate root→token mapping at the SQL layer (no in-memory rebuild).
//
// Design notes:
//   - Roots are aggregated from surface-index, then filtered to 2-4 paleo
//     characters. Anything outside that range is either a particle (length 1)
//     or a proper noun / compound (length 5+) and shouldn't appear in the
//     "real roots" list. The user can still hit /api/root?sn=X directly for
//     those special cases.
//   - The list is sorted in Hebrew-alphabetical order via the same paleo
//     sort key used elsewhere (navPaleoSortKey).
//   - Counts come from surface_occurrences (the per-token table) not from
//     parseHebrewData re-runs. This is what makes Ab=1236 work correctly.

// Phoenician/Paleo Hebrew Unicode block (U+10900-U+1091F). Each character
// occupies one codepoint but two UTF-16 code units (surrogate pair). We need
// codepoint counting, not String.prototype.length.
const PALEO_LO = 0x10900, PALEO_HI = 0x1091F;
function paleoCharCount(s) {
    if (!s) return 0;
    // Bounds inlined (not the PALEO_LO/HI consts) so this stays callable from
    // buildNavIndexes(), which runs at module load before those consts initialize.
    let n = 0;
    for (const cp of s) {
        const c = cp.codePointAt(0);
        if (c >= 0x10900 && c <= 0x1091F) n++;
    }
    return n;
}

// Cached at startup — the full list is ~5500 entries (1-2 MB), regenerated
// only when surface-index.db's mtime changes.
let _rootsListCache = null;
let _rootsListCacheStamp = null;

function buildRootsList() {
    const t0 = Date.now();
    const raw = ROOTS_LIST.all();
    const list = [];
    // NOTE: we used to filter to 2-4 paleo characters as a safety net against
    // inflected surface forms appearing as roots (e.g. the "Aazarak as first
    // root" regression). That filter was overzealous: it also dropped
    // legitimate length-5+ proper nouns like Yahawadah (𐤉𐤄𐤅𐤃𐤄, 821 occ) and
    // any genuine 5+letter root. The real fix for the inflection regression
    // is using token_surfaces.root_paleo as the source of truth, which
    // doesn't contain inflected forms (verified: Aazarak's root_paleo is
    // 𐤀𐤆𐤓 and it never appears AS a root_paleo). So we just drop the length
    // filter entirely and show every distinct root_paleo.
    for (const r of raw) {
        const len = paleoCharCount(r.root_paleo);
        if (len < 1) continue; // guard against empty roots only
        const sns = (r.strongs || '').split(',').filter(Boolean);
        // Skip virtual/grammar SNs (H9000+)
        const realSns = sns.filter(sn => {
            const n = parseInt(sn.replace(/\D/g, ''), 10);
            return !isNaN(n) && n < 9000;
        });
        if (realSns.length === 0) continue;
        list.push({
            root:           r.root_paleo,
            count:          r.occ,
            strongs:        realSns,
            strongs_label:  realSns.join(','),
            len,
        });
    }
    list.sort((a, b) => {
        const ka = navPaleoSortKey(a.root);
        const kb = navPaleoSortKey(b.root);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    console.log(`[roots-list] built ${list.length} entries in ${Date.now() - t0}ms`);
    return list;
}

function getRootsList() {
    // Invalidate cache when surface-index.db changes (e.g. from a rebuild)
    let stamp;
    try { stamp = fs.statSync(path.join(__dirname, 'surface-index.db')).mtimeMs; }
    catch { stamp = 0; }
    if (!_rootsListCache || _rootsListCacheStamp !== stamp) {
        _rootsListCache = buildRootsList();
        _rootsListCacheStamp = stamp;
    }
    return _rootsListCache;
}

// ── TEXT-BASED ROOT / SURFACE EXPLORER (tokens_bhs only) ─────────────────────
// Everything below is sourced ENTIRELY from tokens_bhs (the Hebrew text) + the
// in-memory nav index (also built from tokens_bhs) + the canonical Strong's→
// Paleo map (strongs-roots.json). It never reads surface-index.db, whose
// root_paleo/word_raw could drift out of sync with the text (the "H8064 →
// Labaa" class of bug). Identity is the Strong's number (exact, via
// strongWhere); the Paleo form is canonical; ordering is Paleo-alphabetical;
// occurrences/surfaces/by-book come straight from the text.

// One verse → BibleHub-style word blocks shaped exactly like groupSurfaceTokens
// (components, strongs, token_ordinal, sourceTokens) so Root.jsx renders them
// unchanged. parseHebrewData splits on REAL tab/newline (see rowsToLines), so we
// must join with real "\t"/"\n" — joining with the escaped 2-char strings made
// every line unsplittable and returned zero blocks ("No token breakdown").
function bhsVerseWords(book_id, chapter, verse, lexicon, homographs, surfaceOverrides, forceSource) {
    const { locationOverrides } = loadLexicons();
    // A verse in a book BHS does not cover has no tokens_bhs rows to parse. Render
    // it from the SAME baked HEB rows /api/tokens serves, so the roots page and
    // the reader can never show a verse two different ways.
    // forceSource='HEB' additionally opts INTO this same HEB-rendering path
    // for a book BHS *does* cover — this project's HEB edition is its own
    // Hebraized re-translation, not a copy of the Masoretic text, so a
    // canonical book's HEB tokens can be genuinely different words. Gloss
    // Studio uses this to let the words be audited separately per edition.
    if (forceSource === 'HEB' || navHebBooks().has(book_id)) {
        try {
            let rows = surfRowsFor(book_id, chapter, 'HEB').filter(r => r.verse === verse);
            if (locationOverrides && Object.keys(locationOverrides).length) {
                rows = rows.map(r => applyLocOverrideToSurfRow({ ...r }, locationOverrides, book_id, chapter));
            }
            if (rows.length) {
                return groupSurfaceTokens(rows, lexicon, homographs, {
                    hebExtra: (loadLexicons().hebExtra) || {},
                });
            }
        } catch (e) {
            console.warn(`[roots] HEB verse render failed for ${book_id} ${chapter}:${verse}: ${e.message}`);
        }
        return [];
    }
    const rawTokens = db.prepare(`
        SELECT token_ordinal, word_raw, pos, morph, strongs
        FROM tokens_bhs WHERE book_id=? AND chapter=? AND verse=?
        ORDER BY token_ordinal
    `).all(book_id, chapter, verse);
    applyLocOverridesToRawRows(rawTokens, locationOverrides, book_id, chapter, verse);
    const rawByOrd = new Map(rawTokens.map(r => [r.token_ordinal, r]));
    const lines = rawTokens.map(r =>
        [1, r.token_ordinal, r.word_raw || '', r.pos || '', r.morph || '', r.strongs || ''].join('\t')
    ).join('\n');
    const parsed = parseHebrewData(lines, lexicon, homographs, surfaceOverrides);
    return parsed.map(entry => {
        const comps   = entry.components || [];
        const ords    = [...new Set(comps.map(c => c.token_ordinal).filter(o => o != null))];
        const useOrds = ords.length ? ords : (entry.token_ordinal != null ? [entry.token_ordinal] : []);
        const sourceTokens = useOrds.map(o => {
            const rt = rawByOrd.get(o);
            return rt ? { token_ordinal: o, word_raw: rt.word_raw,
                          strongs: rt.strongs ? 'H' + String(rt.strongs).replace(/^H+/, '') : '' } : null;
        }).filter(Boolean);
        return {
            token_ordinal: entry.token_ordinal,
            strongs:       entry.strongs || entry.sn || '',
            components:    comps,
            sourceTokens,
        };
    });
}

// Group a page of tokens_bhs hit rows into rendered verses (word blocks +
// user translation). Shared by the root & surface verse endpoints.
function bhsVersePage(hitRows, lexicon, homographs, surfaceOverrides, forceSource) {
    const byVerse = new Map();
    for (const h of hitRows) {
        const k = `${h.book_id}:${h.chapter}:${h.verse}`;
        if (!byVerse.has(k)) byVerse.set(k, { book_id: h.book_id, chapter: h.chapter, verse: h.verse, hit_ordinals: [] });
        byVerse.get(k).hit_ordinals.push(h.token_ordinal);
    }
    const out = [];
    for (const v of byVerse.values()) {
        const words = bhsVerseWords(v.book_id, v.chapter, v.verse, lexicon, homographs, surfaceOverrides, forceSource);
        let translation = null;
        try {
            // translationDb is { tdb, stmts } — `.prepare` on the wrapper is
            // undefined, so this threw on EVERY verse and the catch below
            // swallowed it as "translation.db may be empty". The roots and
            // surfaces verse cards have therefore never shown a translation.
            const t = translationDb.tdb.prepare(
                `SELECT text, rich_text FROM translations WHERE book_id=? AND chapter=? AND verse=?`
            ).get(v.book_id, v.chapter, v.verse);
            if (t) translation = { text: t.text, rich_text: t.rich_text };
        } catch { /* translation.db may be empty */ }
        out.push({
            book_id: v.book_id,
            book_name: BOOK_NAMES[v.book_id] || `Book ${v.book_id}`,
            chapter: v.chapter,
            verse: v.verse,
            hit_ordinals: v.hit_ordinals,
            words,
            translation,
        });
    }
    return out;
}

// GET /api/admin/gloss-studio/verse?book=&chapter=&verse=
// One arbitrary verse — full token breakdown + English reference line, same
// shape as one entry of /root-verses. Powers the browse pane's right-hand
// detail view when you click a verse in the book/chapter tree rather than
// arriving via the missing-words list.
app.get('/api/admin/gloss-studio/verse', (req, res) => {
    try {
        const book_id = parseInt(req.query.book, 10);
        const chapter = parseInt(req.query.chapter, 10);
        const verse   = parseInt(req.query.verse, 10);
        if (!book_id || !chapter || !Number.isInteger(verse)) return res.status(400).json({ error: 'book, chapter, verse required' });
        const source = req.query.source || '';

        // Which words in THIS verse, in THIS language, still lack a curated
        // gloss — read straight off that language's already-cached coverage
        // tree (cheap, no recompute) rather than deriving it from `words`
        // client-side. Only meaningful for Hebrew's paleo-chip rendering
        // (GlossWordBlock's missingSet prop); MultiWordBlock shows "not
        // glossed" directly per-token and doesn't need this.
        let words, missing = [];
        if (GENERIC_GS_SOURCES[source]) {
            words = genericVerseWords(source, book_id, chapter, verse) || [];
        } else {
            const { lexicon, homographs, hebExtra, surfaceOverrides } = loadLexicons();
            words = bhsVerseWords(book_id, chapter, verse, lexicon, homographs, surfaceOverrides, source === 'HEB' ? 'HEB' : undefined);
            // Deliberately NOT getGlossCoverage() — that's the whole-corpus
            // tree, expensive to rebuild and now allowed to serve stale (see
            // its own comment). A single verse's missing list only needs
            // this verse's own rows, computed fresh every time regardless of
            // that tree's state. 'HEB' source picks HEB's own tokens for
            // this book; otherwise this book's natural edition (BHS if BHS
            // covers it, else HEB) — same rule the tree itself uses.
            const bhsBooks = SURF_SOURCE_BOOKS.get('BHS') || new Set();
            const naturalSource = source === 'HEB' ? 'HEB' : (bhsBooks.has(book_id) ? 'BHS' : 'HEB');
            missing = _verseMissingDirect(book_id, chapter, verse, naturalSource, lexicon, homographs, hebExtra);
        }

        let saved = null;
        try { saved = translationDb.stmts.getVerse.get(book_id, chapter, verse); } catch { /* translation.db may be empty */ }
        const savedText = (saved?.text && saved.text.trim()) ? saved.text : '';
        const isUntouchedDraft = !!saved && saved.status === 'none'
            && saved.source_origin === 'web-passthrough'
            && saved.original_text != null && saved.text === saved.original_text;
        const isUserOverride = !!savedText && !isUntouchedDraft;
        const englishText = isUserOverride ? savedText : applyLiveGloss(savedText || englishBaseline(book_id, chapter, verse));

        res.json({
            book_id, book_name: BOOK_NAMES[book_id] || `Book ${book_id}`,
            chapter, verse, words, missing,
            english: {
                text: englishText, is_baseline: !isUserOverride && !!englishText,
                // Translation Studio's own status for this verse — 'done' is
                // the extra requirement (beyond full lexical glossing, every
                // language) for the aggregate coverage tree's 100%.
                status: saved?.status || 'none',
            },
        });
    } catch (err) {
        console.error('/api/admin/gloss-studio/verse failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/gloss-studio/root-verses?root=<paleo>&offset=0&limit=20
// Every verse this root occurs in — full token breakdown (same word-block
// shape the Root Explorer's verse cards use) PLUS an English reference line,
// so a curated gloss can be written by reading context without leaving the
// page. English priority mirrors /api/parallel/verse exactly: your saved
// translation if you have one, otherwise the live-glossed MT-aligned
// baseline — never the stale pre-baked string.
app.get('/api/admin/gloss-studio/root-verses', (req, res) => {
    try {
        const root = (req.query.root || '').trim();
        if (!root) return res.status(400).json({ error: 'root param required' });
        const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
        const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

        if (GENERIC_GS_SOURCES[req.query.source]) {
            const srcId = req.query.source;
            const w = computeGenericCoverage(srcId).words.get(root);
            const occurrences = w ? w.verses : [];
            const total = occurrences.length;
            const page = occurrences.slice(offset, offset + limit);
            const seen = new Set();
            const verses = [];
            for (const o of page) {
                const k = `${o.book_id}:${o.chapter}:${o.verse}`;
                if (seen.has(k)) continue;
                seen.add(k);
                const words = genericVerseWords(srcId, o.book_id, o.chapter, o.verse) || [];
                let saved = null;
                try { saved = translationDb.stmts.getVerse.get(o.book_id, o.chapter, o.verse); } catch { /* translation.db may be empty */ }
                const savedText = (saved?.text && saved.text.trim()) ? saved.text : '';
                const isUntouchedDraft = !!saved && saved.status === 'none'
                    && saved.source_origin === 'web-passthrough'
                    && saved.original_text != null && saved.text === saved.original_text;
                const isUserOverride = !!savedText && !isUntouchedDraft;
                const englishText = isUserOverride ? savedText : applyLiveGloss(savedText || englishBaseline(o.book_id, o.chapter, o.verse));
                verses.push({
                    book_id: o.book_id, book_name: BOOK_NAMES[o.book_id] || `Book ${o.book_id}`,
                    chapter: o.chapter, verse: o.verse, words,
                    english: { text: englishText, is_baseline: !isUserOverride && !!englishText },
                });
            }
            return res.json({ root, total, offset, limit, verses });
        }

        const source = req.query.source === 'HEB' ? 'HEB' : 'BHS';
        let total, hitRows;
        if (source === 'HEB') {
            total   = ROOT_VERSES_HEB_COUNT.get(root).n;
            hitRows = ROOT_VERSES_HEB.all(root, limit, offset);
        } else {
            // "BHS" view = this book's natural edition (mixed sources) —
            // filter/paginate in JS; see ROOT_VERSES_ALL's comment above.
            const bhsBooks = SURF_SOURCE_BOOKS.get('BHS') || new Set();
            const natural = ROOT_VERSES_ALL.all(root)
                .filter(r => r.source === (bhsBooks.has(r.book_id) ? 'BHS' : 'HEB'));
            total = natural.length;
            hitRows = natural.slice(offset, offset + limit);
        }

        const { lexicon, homographs, surfaceOverrides } = loadLexicons();
        const verses = bhsVersePage(hitRows, lexicon, homographs, surfaceOverrides, source === 'HEB' ? 'HEB' : undefined);

        for (const v of verses) {
            let saved = null;
            try { saved = translationDb.stmts.getVerse.get(v.book_id, v.chapter, v.verse); } catch { /* translation.db may be empty */ }
            const savedText = (saved?.text && saved.text.trim()) ? saved.text : '';
            const isUntouchedDraft = !!saved && saved.status === 'none'
                && saved.source_origin === 'web-passthrough'
                && saved.original_text != null && saved.text === saved.original_text;
            const isUserOverride = !!savedText && !isUntouchedDraft;
            const englishText = isUserOverride ? savedText : applyLiveGloss(savedText || englishBaseline(v.book_id, v.chapter, v.verse));
            v.english = { text: englishText, is_baseline: !isUserOverride && !!englishText };
        }

        res.json({ root, total, offset, limit, verses });
    } catch (err) {
        console.error('/api/admin/gloss-studio/root-verses failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// Every tokens_bhs occurrence for a set of Strong's numbers (exact, compound-safe).
function bhsRowsForStrongs(strongsArr) {
    const nums = (strongsArr || []).map(s => String(s).replace(/^H+/, '')).filter(Boolean);
    const sw = strongWhere(nums);
    if (!sw) return [];
    return db.prepare(`
        SELECT book_id, chapter, verse, token_ordinal, word_raw, pos, strongs
        FROM tokens_bhs WHERE ${sw.where}
        ORDER BY book_id, chapter, verse, token_ordinal
    `).all(...sw.params);
}

// ── WORD-LEVEL RECONSTRUCTION (BibleHub-style surfaces) ────────────────────────
// tokens_bhs is morpheme-level: bound prefixes (conjunction ו, article ה,
// inseparable prepositions ב ל כ מ) are their OWN rows. parseHebrewData folds
// these proclitics onto the following content morpheme to form the word blocks
// the reader shows. We mirror that fold here — cheaply, without the full parse —
// so a "surface" is the actual written word (e.g. 𐤄𐤀𐤓𐤑 ha-aretz), its count is
// per-word (not per-morpheme), and its Strong's number is the content morpheme's
// (the root), never an incidental prefix. (WORD_FOLD_POS / _paleoOnly are defined
// up near the other nav helpers so they exist before buildNavIndexes() runs.)

// rows: morpheme rows of ONE verse, ordered by token_ordinal. Returns
// [{ surface, sn, ords:[token_ordinal…] }] — one entry per orthographic word.
function foldRowsToWords(rows) {
    const out = [];
    let pending = [];
    const close = () => {
        if (!pending.length) return;
        const surface = pending.map(p => _paleoOnly(p.word_raw)).join('');
        // Root SN = the last non-proclitic (content) morpheme's Strong's number.
        let snRaw = null;
        for (let i = pending.length - 1; i >= 0; i--) {
            if (!WORD_FOLD_POS.has((pending[i].pos || '').trim())) { snRaw = pending[i].strongs; break; }
        }
        if (snRaw == null) snRaw = pending[pending.length - 1].strongs;
        const sn = snRaw ? navNormSN(String(snRaw).split('＋')[0]) : '';
        if (surface) out.push({ surface, sn, ords: pending.map(p => p.token_ordinal) });
        pending = [];
    };
    for (const r of rows) {
        pending.push(r);
        if (!WORD_FOLD_POS.has((r.pos || '').trim())) close();   // content morpheme ends the word
    }
    close();   // trailing proclitics (rare) flush as their own unit
    return out;
}

// Find word occurrences across the corpus matching `match(word)`. To avoid a
// full-corpus walk we only reconstruct verses that contain `sn` (via strongWhere);
// every matching word necessarily lives in one of those. Returns occurrences in
// reading order: [{ book_id, chapter, verse, ords:[…] }].
function findWordOccurrences(sn, match, book = null) {
    const sw = strongWhere([String(sn || '').replace(/^H+/, '')]);
    if (!sw) return [];
    const vWhere = sw.where + (book != null ? ' AND book_id = ?' : '');
    const vParams = book != null ? [...sw.params, book] : sw.params;
    const verses = db.prepare(`
        SELECT DISTINCT book_id, chapter, verse FROM tokens_bhs
        WHERE ${vWhere} ORDER BY book_id, chapter, verse
    `).all(...vParams);
    const rowStmt = db.prepare(`
        SELECT token_ordinal, word_raw, pos, strongs FROM tokens_bhs
        WHERE book_id=? AND chapter=? AND verse=? ORDER BY token_ordinal
    `);
    const { locationOverrides } = loadLexicons();
    const occ = [];
    for (const v of verses) {
        const rows = rowStmt.all(v.book_id, v.chapter, v.verse);
        applyLocOverridesToRawRows(rows, locationOverrides, v.book_id, v.chapter, v.verse);
        const words = foldRowsToWords(rows);
        for (const w of words) {
            if (match(w)) occ.push({ book_id: v.book_id, chapter: v.chapter, verse: v.verse, ords: w.ords });
        }
    }
    // The HEB edition, for the books BHS does not cover. Its rows are already
    // whole words, so there is nothing to fold — each occurrence is one hit.
    // `source` rides along so a caller can label attested vs inferred without
    // re-deriving where the row came from.
    for (const r of hebOccForSN(sn, book)) {
        const w = { surface: _paleoOnly(r.word_raw), sn: navNormSN(sn), ords: [r.token_ordinal] };
        if (match(w)) {
            occ.push({ book_id: r.book_id, chapter: r.chapter, verse: r.verse,
                       ords: [r.token_ordinal], source: 'HEB' });
        }
    }
    // BHS-side addition: a synthetic SN (e.g. H2995a) that never appears as a
    // real tokens_bhs.strongs value has nothing for `strongWhere` to find via
    // SQL, so pull in any override targeting it directly by location. HEB
    // books are excluded — hebOccForSN above already reconciled those.
    const existingKeys = new Set(occ.map(o => locOverrideKey(o.book_id, o.chapter, o.verse, o.ords[0])));
    for (const add of locOverridesTargeting(locationOverrides, sn)) {
        if (navHebBooks().has(add.book_id)) continue;
        const key = locOverrideKey(add.book_id, add.chapter, add.verse, add.token_ordinal);
        if (existingKeys.has(key)) continue;
        const w = { surface: _paleoOnly(add.word_raw), sn: navNormSN(sn), ords: [add.token_ordinal] };
        if (match(w)) {
            occ.push({ book_id: add.book_id, chapter: add.chapter, verse: add.verse, ords: [add.token_ordinal] });
            existingKeys.add(key);
        }
    }
    occ.sort((a, b) => a.book_id - b.book_id || a.chapter - b.chapter || a.verse - b.verse
                     || (a.ords[0] || 0) - (b.ords[0] || 0));
    return occ;
}

// Render a page of word occurrences into verse cards (re-using bhsVersePage).
function wordOccurrencePage(occ, offset, limit, lexicon, homographs, surfaceOverrides) {
    const page = occ.slice(offset, offset + limit);
    const hitRows = page.flatMap(o => (o.ords || []).map(ord => ({
        book_id: o.book_id, chapter: o.chapter, verse: o.verse, token_ordinal: ord,
    })));
    return bhsVersePage(hitRows, lexicon, homographs, surfaceOverrides);
}

// GET /api/root-explorer/list
// Returns the full alphabetized root list. Cached after first call. The
// React Root page renders this as a sidebar with a filter input.
app.get('/api/root-explorer/list', production.cache(60), (req, res) => {
    try {
        const q  = (req.query.q || '').trim();
        const qU = q.toUpperCase();
        const all = getRootNavIndex().map(e => ({
            root: e.root,
            sn: e.sn,
            strongs: [e.sn],
            strongs_label: e.sn,
            count: e.count,
            len: paleoCharCount(e.root),
        }));
        const filtered = q ? all.filter(r => r.root.includes(q) || r.sn.includes(qU)) : all;
        res.json({ total: filtered.length, roots: filtered });
    } catch (err) {
        console.error('/api/root-explorer/list failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /sitemap-roots.xml — one <url> per Hebrew root (~8,600+ entries as of
// 2026-08-14). public/sitemap.xml is hand-curated on purpose (see its own
// comment) and deliberately excludes the long tail of individual root pages
// — but that meant Google had literally no way to discover a specific page
// like /roots?sn=H2995 except by accident (following an internal link on a
// page that happened to already be crawled). This is generated at request
// time rather than baked into public/ because, like every other DB-backed
// route here, the word data doesn't exist until the container's /data
// volume is mounted at startup — it isn't available at Docker build time.
// Cached the same way the JSON endpoints above are; the root list only
// changes on deploy. Referenced from robots.txt as a second Sitemap: line
// alongside the curated one — Search Console also lets both be submitted
// directly, which is how these got registered for bldbible.com.
app.get('/sitemap-roots.xml', production.cache(3600), (req, res) => {
    try {
        const urls = getRootNavIndex()
            .map(e => `  <url><loc>https://www.bldbible.com/roots?sn=${encodeURIComponent(e.sn)}</loc></url>`)
            .join('\n');
        res.type('application/xml').send(
            `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
        );
    } catch (err) {
        console.error('/sitemap-roots.xml failed:', err);
        res.status(500).send('');
    }
});

// GET /sitemap-chapters.xml — one <url> per real book+chapter, for BOTH
// /bible (Novel English reader) and /parallel (English-Hebrew parallel).
// 2026-08-15: added after a search for "bldbible numbers 35 33" surfaced an
// unrelated concordance entry (a Coptic word that happens to appear in a
// verse containing "35") instead of the actual Numbers 35 chapter pages —
// Google had no way to discover /bible?book=4&chapter=35 or
// /parallel?book=4&chapter=35 directly, only by crawling links from an
// already-indexed page. Both routes are already prerendered with real
// per-chapter title/description (see prerender.js's englishChapterRoute) —
// what was missing was sitemap DISCOVERY, not content.
//
// Uses the already-computed BOOKS constant (see "Preload the book list once
// at startup" above) rather than prerender.js's MAX_CHAPTER=150 ceiling —
// BOOKS is the real per-book first/last chapter range straight from
// tokens_bhs (with DISPLAY_LAST_CHAPTER's English-versification overrides
// already applied), which is the exact same data /bible and /parallel are
// backed by. Deliberately does NOT enumerate every source language, verse,
// or concordance entry — same "bounded, real identity space only" rule as
// sitemap-roots.xml, to avoid repeating the thin/broken-URL flood this app
// already fixed once (see the "bad corpus" fix).
app.get('/sitemap-chapters.xml', production.cache(3600), (req, res) => {
    try {
        const urls = [];
        for (const b of BOOKS) {
            for (let ch = b.first_chapter; ch <= b.last_chapter; ch++) {
                urls.push(`  <url><loc>https://www.bldbible.com/bible?book=${b.book_id}&amp;chapter=${ch}</loc></url>`);
                urls.push(`  <url><loc>https://www.bldbible.com/parallel?book=${b.book_id}&amp;chapter=${ch}</loc></url>`);
            }
        }
        res.type('application/xml').send(
            `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
        );
    } catch (err) {
        console.error('/sitemap-chapters.xml failed:', err);
        res.status(500).send('');
    }
});

// GET /sitemap-verses.xml — one <url> per real (book, chapter, verse), for
// /bible (Novel English Bible reader) ONLY. Phase 1 of full-corpus
// verse-level indexability (2026-08-15 request: "I want my entire corpus
// indexable and easily searchable like the other bible tools" — e.g.
// BibleHub, which indexes one page per verse). ~31,000 canonical verses —
// comfortably under Google's 50,000-URL-per-sitemap-file cap, so this is a
// single file for now; if/when other readers (Hebrew, Greek, Latin, Ge'ez)
// or the Works Library get the same treatment, this will need sharding into
// sitemap-verses-N.xml + a <sitemapindex>, the same way any site with
// 100k+ URLs has to.
//
// Deliberately does NOT cover /parallel or /translate — those two routes'
// prerendered BODY doesn't actually change per ?verse= (see
// englishChapterRoute's canonical-collapse comment in prerender.js: they
// show the whole chapter regardless), so a verse-level sitemap entry for
// them would be exactly the "thin/duplicate URL" mistake the bad-corpus fix
// and the canonical-collapse fix both existed to clean up. /bible's new
// englishVerseRoute (prerender.js) is the first route whose content is
// genuinely different per verse — that verse's own translation text plus
// its actual Hebrew tokens — which is what makes a self-referencing
// per-verse canonical honest there.
//
// Reuses the EXACT verse-listing query /api/translate/chapter already runs
// (tokens_bhs, with the English-baseline fallback for non-Hebrew-backed
// books) instead of a new one, so "what counts as a real verse" can never
// drift between this sitemap and the page it's advertising.
const VERSE_LIST_BHS = db.prepare(`SELECT DISTINCT verse FROM tokens_bhs WHERE book_id=? AND chapter=? ORDER BY verse`);
app.get('/sitemap-verses.xml', production.cache(3600), (req, res) => {
    try {
        const urls = [];
        for (const b of BOOKS) {
            for (let ch = b.first_chapter; ch <= b.last_chapter; ch++) {
                let verseRows = VERSE_LIST_BHS.all(b.book_id, ch);
                if (!verseRows.length) {
                    // Non-Hebrew-backed book/chapter (e.g. an NT book with no
                    // tokens_bhs rows) — same English-baseline fallback
                    // /api/translate/chapter uses, so the sitemap still lists
                    // every verse the reader itself would actually show.
                    try {
                        verseRows = db.prepare(`
                            SELECT DISTINCT ord_v AS verse FROM verses
                            WHERE corpus='ENG' AND canon_id=? AND ord_c=? ORDER BY ord_v
                        `).all(b.book_id, ch);
                    } catch { /* ENG baseline not loaded */ }
                }
                for (const v of verseRows) {
                    urls.push(`  <url><loc>https://www.bldbible.com/bible?book=${b.book_id}&amp;chapter=${ch}&amp;verse=${v.verse}</loc></url>`);
                }
            }
        }
        res.type('application/xml').send(
            `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
        );
    } catch (err) {
        console.error('/sitemap-verses.xml failed:', err);
        res.status(500).send('');
    }
});

// Resolve a root request (?sn=H8064 preferred, ?root=<paleo> legacy) to its
// index position. Strong's number is the exact identity; the Paleo string is a
// best-effort fallback for old bookmarks (first entry with that form).
function resolveRootIdx(req) {
    const sn   = (req.query.sn || '').trim();
    const root = (req.query.root || '').trim();
    const index = getRootNavIndex();
    if (sn)   return { index, idx: getRootIndexBySN(sn) };
    if (root) return { index, idx: getRootIndexByValue(root) };
    return { index, idx: -1 };
}

// GET /api/root-explorer/root?sn=H8064  (or legacy ?root=<paleo>)
// Returns aggregate info for one Strong's-number root: total occurrences,
// surfaces breakdown, per-book breakdown, lexicon entry, and prev/next
// neighbours for alphabetical navigation.
app.get('/api/root-explorer/root', production.cache(60), (req, res) => {
    try {
        const { index, idx } = resolveRootIdx(req);
        if (idx < 0) return res.status(404).json({ error: 'root not found', sn: req.query.sn || null, root: req.query.root || null });
        const entry = index[idx];

        // Surface forms = the orthographic words whose root is this Strong's
        // number, from the word-level index. Per-word counts, no prefix morphemes.
        const wordForms = getSurfacesForSN(entry.sn);
        const surfaces = wordForms
            .map(w => ({ word_raw: w.surface, strongs: entry.sn, pos: '', occ: w.count }))
            .sort((a, b) => b.occ - a.occ);
        const total = wordForms.reduce((s, w) => s + (w.count || 0), 0);
        const byBookMap = new Map();
        for (const w of wordForms) {
            for (const bb of (w.by_book || [])) byBookMap.set(bb.book_id, (byBookMap.get(bb.book_id) || 0) + bb.occ);
        }
        const by_book = [...byBookMap.entries()]
            .map(([book_id, occ]) => ({ book_id, name: BOOK_NAMES[book_id] || `Book ${book_id}`, occ }))
            .sort((a, b) => b.occ - a.occ || a.book_id - b.book_id);

        const prev = idx > 0 ? index[idx - 1] : null;
        const next = idx + 1 < index.length ? index[idx + 1] : null;

        const { lexicon } = loadLexicons();
        res.json({
            root: entry.root,
            sn: entry.sn,
            lemmaTranslit: getTranslit(entry.root),
            lexicon: lexicon[entry.root] || null,
            strongs: [entry.sn],
            total,
            surfaces,
            by_book,
            // Alphabetical neighbours as {sn, root} — null only at the ends (𐤀𐤁 … 𐤕𐤕𐤍𐤉).
            prev: prev ? { sn: prev.sn, root: prev.root } : null,
            next: next ? { sn: next.sn, root: next.root } : null,
        });
    } catch (err) {
        console.error('/api/root-explorer/root failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/root-explorer/verses?sn=H8064&book=N&offset=0&limit=25 (or ?root=)
// Returns paginated verses where this root appears, with the full token
// breakdown for each verse and any user translation. BibleHub-style.
app.get('/api/root-explorer/verses', production.cache(60), (req, res) => {
    try {
        const { index, idx } = resolveRootIdx(req);
        if (idx < 0) return res.status(404).json({ error: 'root not found' });
        const entry = index[idx];
        const book  = req.query.book ? parseInt(req.query.book, 10) : null;
        const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
        const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 25));

        let occ = findWordOccurrences(entry.sn, w => w.sn === entry.sn, book);

        const total    = occ.length;
        const { lexicon, homographs, surfaceOverrides } = loadLexicons();
        const verses   = wordOccurrencePage(occ, offset, limit, lexicon, homographs, surfaceOverrides);

        res.json({ total, offset, limit, verses, hasMore: offset + limit < total });
    } catch (err) {
        console.error('/api/root-explorer/verses failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── SURFACE EXPLORER ENDPOINTS ──────────────────────────────────────────────
// Same shape as the root explorer but for one specific surface form. Powers
// the Surfaces page (the second tab of /lexicon-page and the /surfaces route).

let _surfacesListCache = null;
let _surfacesListCacheStamp = null;

function buildSurfacesList() {
    const t0 = Date.now();
    // Distinct word_raw + strongs combinations — DON'T collapse same surface
    // across different Strongs (user explicitly requested separate entries).
    const raw = surfDb.prepare(`
        SELECT t.word_raw, t.strongs, t.root_paleo,
               COUNT(o.word_raw) AS occ
        FROM   token_surfaces t
        JOIN   surface_occurrences o ON o.word_raw = t.word_raw ${OCC_SN_JOIN} ${SRC_JOIN}
        WHERE  t.word_raw IS NOT NULL AND t.word_raw != ''
        GROUP BY t.word_raw, t.strongs
    `).all();
    const list = raw.map(r => ({
        surface: r.word_raw,
        strongs: r.strongs || '',
        root:    r.root_paleo,
        count:   r.occ,
    }));
    list.sort((a, b) => {
        const ka = navPaleoSortKey(a.surface);
        const kb = navPaleoSortKey(b.surface);
        if (ka !== kb) return ka < kb ? -1 : 1;
        // Tiebreak by SN numerically so H1 sorts before H10
        const na = parseInt((a.strongs || '').replace(/\D/g, ''), 10) || 0;
        const nb = parseInt((b.strongs || '').replace(/\D/g, ''), 10) || 0;
        return na - nb;
    });
    console.log(`[surfaces-list] built ${list.length} entries in ${Date.now() - t0}ms`);
    return list;
}

function getSurfacesList() {
    let stamp;
    try { stamp = fs.statSync(path.join(__dirname, 'surface-index.db')).mtimeMs; }
    catch { stamp = 0; }
    if (!_surfacesListCache || _surfacesListCacheStamp !== stamp) {
        _surfacesListCache = buildSurfacesList();
        _surfacesListCacheStamp = stamp;
    }
    return _surfacesListCache;
}

app.get('/api/surface-explorer/list', production.cache(60), (req, res) => {
    try {
        const q  = (req.query.q || '').trim();
        const qU = q.toUpperCase();
        // Paleo-sorted distinct surfaces, straight from the text.
        const all = getSurfNavIndex().map(e => ({
            surface: e.surface,
            strongs: e.sn,
            root:    e.root,
            count:   e.count,
        }));
        const filtered = q ? all.filter(s => s.surface.includes(q) || (s.strongs || '').includes(qU)) : all;
        const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
        const limit  = Math.min(50000, Math.max(1, parseInt(req.query.limit, 10) || 200));
        res.json({
            total: filtered.length,
            offset,
            limit,
            surfaces: filtered.slice(offset, offset + limit),
        });
    } catch (err) {
        console.error('/api/surface-explorer/list failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/surface-explorer/surface?word=X[&sn=H1]
app.get('/api/surface-explorer/surface', production.cache(60), (req, res) => {
    try {
        const word = (req.query.word || '').trim();
        if (!word) return res.status(400).json({ error: 'word param required' });

        // Surfaces are word-level now (orthographic words), so a merged form like
        // 𐤄𐤀𐤓𐤑 resolves directly instead of "not in text".
        const index = getSurfNavIndex();
        const idx = getSurfIndexByValue(word);
        if (idx < 0) {
            // Could be a root paleo (clicked a lemmatized root component) → redirect.
            const rootMatch = getRootNavIndex().find(r => r.root === word);
            if (rootMatch) {
                return res.status(404).json({
                    error: `${word} is a root, not a surface form`,
                    suggestion: 'root',
                    redirect_to: `/roots?sn=${encodeURIComponent(rootMatch.sn)}`,
                    root: word,
                });
            }
            return res.status(404).json({ error: `Surface ${word} not in text` });
        }
        const entry = index[idx];
        const sn = entry.sn;
        const by_book = (entry.by_book || [])
            .map(bb => ({ book_id: bb.book_id, name: BOOK_NAMES[bb.book_id] || `Book ${bb.book_id}`, occ: bb.occ }))
            .sort((a, b) => b.occ - a.occ || a.book_id - b.book_id);
        const total = entry.count;

        // Morpheme breakdown for the header: parse the first occurrence and pull
        // the matching word block's components (the merged word can't be parsed in
        // isolation without its morph, so take it from a real occurrence).
        const { lexicon, homographs, surfaceOverrides } = loadLexicons();
        let components = [];
        const first = findWordOccurrences(sn, w => w.surface === word).slice(0, 1);
        if (first.length) {
            const o = first[0];
            const blocks = bhsVerseWords(o.book_id, o.chapter, o.verse, lexicon, homographs, surfaceOverrides);
            const blk = blocks.find(b => (b.sourceTokens || []).map(t => _paleoOnly(t.word_raw)).join('') === word);
            if (blk) components = blk.components || [];
        }

        const prev = idx > 0 ? index[idx - 1] : null;
        const next = idx + 1 < index.length ? index[idx + 1] : null;
        const root = getCanonicalRoot(sn, word) || entry.root || '';

        res.json({
            surface: word,
            root,
            strongs: sn,
            all_strongs: sn ? [sn] : [],
            pos: '',
            morph: '',
            components,
            total,
            by_book,
            prev: prev ? { surface: prev.surface, strongs: prev.sn } : null,
            next: next ? { surface: next.surface, strongs: next.sn } : null,
        });
    } catch (err) {
        console.error('/api/surface-explorer/surface failed:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/surface-explorer/verses', production.cache(60), (req, res) => {
    try {
        const word = (req.query.word || '').trim();
        if (!word) return res.status(400).json({ error: 'word param required' });
        const book  = req.query.book ? parseInt(req.query.book, 10) : null;
        const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
        const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 25));

        const idx = getSurfIndexByValue(word);
        if (idx < 0) return res.status(404).json({ error: `Surface ${word} not in text` });
        const sn = getSurfNavIndex()[idx].sn;

        const occ = findWordOccurrences(sn, w => w.surface === word, book);
        const total = occ.length;
        const { lexicon, homographs, surfaceOverrides } = loadLexicons();
        const verses = wordOccurrencePage(occ, offset, limit, lexicon, homographs, surfaceOverrides);

        res.json({ total, offset, limit, verses, hasMore: offset + limit < total });
    } catch (err) {
        console.error('/api/surface-explorer/verses failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── TRANSLATION ROUTES ────────────────────────────────────────────────────────
// Bound the body size — translation rich_text payloads are small (verses are
// short).  1 MB is far above what any legitimate request needs, low enough
// that a malicious or buggy client can't OOM the process.
app.use(express.json({ limit: '1mb' }));

const TX_BOOK_NAMES = {
    1:'Genesis',2:'Exodus',3:'Leviticus',4:'Numbers',5:'Deuteronomy',
    6:'Joshua',7:'Judges',8:'Ruth',9:'1 Samuel',10:'2 Samuel',
    11:'1 Kings',12:'2 Kings',13:'1 Chronicles',14:'2 Chronicles',
    15:'Ezra',16:'Nehemiah',17:'Esther',18:'Job',19:'Psalms',
    20:'Proverbs',21:'Ecclesiastes',22:'Song of Songs',23:'Isaiah',
    24:'Jeremiah',25:'Lamentations',26:'Ezekiel',27:'Daniel',28:'Hosea',
    29:'Joel',30:'Amos',31:'Obadiah',32:'Jonah',33:'Micah',34:'Nahum',
    35:'Habakkuk',36:'Zephaniah',37:'Haggai',38:'Zechariah',39:'Malachi',
    40:'Matthew',41:'Mark',42:'Luke',43:'John',44:'Acts',45:'Romans',
    46:'1 Corinthians',47:'2 Corinthians',48:'Galatians',49:'Ephesians',50:'Philippians',
    51:'Colossians',52:'1 Thessalonians',53:'2 Thessalonians',54:'1 Timothy',55:'2 Timothy',
    56:'Titus',57:'Philemon',58:'Hebrews',59:'James',60:'1 Peter',61:'2 Peter',
    62:'1 John',63:'2 John',64:'3 John',65:'Jude',66:'Revelation',
};

app.get('/translate', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/parallel', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// GET /api/translate/progress
app.get('/api/translate/progress', (req, res) => {
    try {
        const verseCounts = db.prepare(`
            SELECT book_id, chapter, COUNT(DISTINCT verse) AS total_verses
            FROM tokens_bhs GROUP BY book_id, chapter
        `).all();
        const bMap = {};
        for (const r of verseCounts) {
            if (!bMap[r.book_id]) bMap[r.book_id] = {};
            bMap[r.book_id][r.chapter] = r.total_verses;
        }
        // Books with an English baseline but NO Hebrew tokens (NT beyond Matthew,
        // deuterocanon, works) are still translatable — you refine the pre-filled
        // English. Add them from the ENG source so the Studio lists every book,
        // matching the reader. Hebrew books keep their MT verse structure (above);
        // ENG-only books use the baseline's own chapter/verse grid.
        try {
            // Group by chapter/verse, NOT ord_c/ord_v.
            //
            // THE BUG: this is the branch that serves every book WITHOUT Hebrew
            // tokens — the whole New Testament and all the non-canonical works. It
            // grouped by ord_c, but the English baseline populates `chapter` and
            // `verse`; ord_c/ord_v are empty on those rows. So every chapter
            // collapsed into a single bucket and the Studio listed "Ch 1" and
            // nothing else, for John, Matthew, Psalms of Solomon and the rest —
            // making chapters 2..N unreachable even though the verses were all
            // there (John: 879 verses, 21 chapters, confirmed in the database).
            //
            // COALESCE keeps the old rows working: prefer the real chapter/verse,
            // fall back to ord_c/ord_v for any source that only carries those.
            // Chapters are ord_c / ord_v — the SAME definition the reader uses.
            // installScopedVerses() builds the reader's view as
            //     SELECT canon_id AS book_id, ord_c AS chapter, ord_v AS verse ...
            // and that view lists every chapter of all 145 books correctly, so this
            // matches it rather than inventing another rule. The raw chapter/verse
            // columns are deliberately NOT consulted: the reader ignores them too.
            //
            // GROUP BY names ord_c explicitly. Writing `GROUP BY book_id, chapter`
            // against an output alias called `chapter` makes SQLite group by the
            // real `verses.chapter` column instead of the aliased expression, which
            // silently collapses the list.
            const engCounts = db.prepare(`
                SELECT canon_id AS book_id,
                       ord_c    AS chapter,
                       COUNT(DISTINCT ord_v) AS total_verses
                FROM verses
                WHERE corpus='ENG' AND canon_id IS NOT NULL AND ord_c IS NOT NULL
                GROUP BY canon_id, ord_c
            `).all();
            // MERGE PER CHAPTER, NOT PER BOOK.
            //
            // This previously read `if (bMap[r.book_id]) continue;` — so a book with
            // Hebrew tokens for even ONE chapter had its entire English chapter list
            // discarded. Matthew has Hebrew, so the Studio offered only the chapters
            // that Hebrew covered; every NT book and every apocryphal writing with
            // partial Hebrew was truncated the same way, which is why some chapters
            // loaded and the rest were unreachable.
            //
            // Hebrew still wins WHERE IT EXISTS (its verse grid is authoritative for
            // those chapters); English supplies the chapters Hebrew does not reach.
            for (const r of engCounts) {
                const bk = (bMap[r.book_id] ||= {});
                if (bk[r.chapter] == null) bk[r.chapter] = r.total_verses;
            }
        } catch { /* ENG baseline not loaded yet — Hebrew-only list */ }
        const allStatus = translationDb.stmts.allProgress.all();
        const sMap = {};
        for (const r of allStatus) {
            if (!sMap[r.book_id]) sMap[r.book_id] = {};
            if (!sMap[r.book_id][r.chapter]) sMap[r.book_id][r.chapter] = {};
            sMap[r.book_id][r.chapter][r.verse] = r.status;
        }
        const books = Object.keys(bMap).map(bid => {
            bid = parseInt(bid);
            const chapters = Object.keys(bMap[bid]).map(ch => {
                ch = parseInt(ch);
                const total = bMap[bid][ch];
                const verseStatuses = sMap[bid]?.[ch] || {};
                let done = 0, in_progress = 0;
                for (const st of Object.values(verseStatuses)) {
                    if (st === 'done') done++;
                    else if (st === 'in_progress') in_progress++;
                }
                return { chapter: ch, total, done, in_progress, none: total - done - in_progress };
            }).sort((a,b) => a.chapter - b.chapter);
            const totalVerses = chapters.reduce((s,c) => s + c.total, 0);
            const totalDone   = chapters.reduce((s,c) => s + c.done, 0);
            const totalIP     = chapters.reduce((s,c) => s + c.in_progress, 0);
            return {
                book_id: bid, name: canonName(bid),
                total: totalVerses, done: totalDone, in_progress: totalIP,
                none: totalVerses - totalDone - totalIP, chapters,
            };
        }).sort((a,b) => orderKey(a.book_id) - orderKey(b.book_id) || a.book_id - b.book_id);
        res.json({ books });
    } catch(err) {
        console.error('/api/translate/progress failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/translate/chapter?book=1&chapter=1
app.get('/api/translate/chapter', (req, res) => {
    try {
        const bookId  = parseInt(req.query.book, 10);
        const chapter = parseInt(req.query.chapter, 10);
        if (!bookId || !chapter) return res.status(400).json({ error: 'book and chapter required' });

        const lang = (req.query.lang || 'BHS').toString();
        // All links for this chapter/lang in one query, grouped by verse — the
        // reader attaches them per verse and skips the per-verse links round trip.
        const linkRows = translationDb.stmts.chapterLinks.all(bookId, chapter, lang);
        const linksByVerse = {};
        for (const l of linkRows) (linksByVerse[l.verse] ||= []).push(l);

        const verseRows = db.prepare(`
            SELECT DISTINCT verse FROM tokens_bhs WHERE book_id=? AND chapter=? ORDER BY verse
        `).all(bookId, chapter);
        // Non-Hebrew books (no tokens_bhs): take the verse list from the English
        // baseline so the chapter still opens and every verse is listed.
        if (!verseRows.length) {
            try {
                const eng = db.prepare(`
                    SELECT DISTINCT ord_v AS verse FROM verses
                    WHERE corpus='ENG' AND canon_id=? AND ord_c=? ORDER BY ord_v
                `).all(bookId, chapter);
                for (const r of eng) verseRows.push(r);
            } catch { /* ENG baseline not loaded */ }
        }

        const saved = translationDb.stmts.chapterProgress.all(bookId, chapter);
        const savedMap = {};
        for (const r of saved) savedMap[r.verse] = r;

        const verses = verseRows.map(r => {
            const s = savedMap[r.verse];
            // Show your English for every verse: saved text if present, otherwise
            // the loaded baseline. Untouched verses read as the baseline draft.
            //
            // load-english-baseline.js pre-seeds EVERY verse's `text` column in
            // translations with a frozen snapshot of the baked baseline (see its
            // resetUntouched step) — so `s.text` is populated for virtually every
            // verse, and the englishBaseline() fallback below almost never actually
            // runs. That means this pre-seeded snapshot, not the live baseline, is
            // what readers see — and it embeds "root (gloss)" text that goes stale
            // the moment lexicon.json changes, exactly like the surface-index and
            // English-baseline staleness documented above. A verse counts as an
            // untouched draft (not the user's real translation) when it's still
            // status 'none', tagged 'web-passthrough', and its text still equals
            // its own original_text snapshot — same test used by /api/parallel/verse.
            // Only untouched drafts get live-reglossed; a genuine translation is
            // never rewritten.
            const savedText = (s?.text && s.text.trim()) ? s.text : '';
            const isUntouchedDraft = !!s && s.status === 'none'
                && s.source_origin === 'web-passthrough'
                && s.original_text != null && s.text === s.original_text;
            const isUserOverride = !!savedText && !isUntouchedDraft;
            const text = isUserOverride ? savedText : applyLiveGloss(savedText || englishBaseline(bookId, chapter, r.verse));
            return { verse: r.verse, status: s?.status || 'none', text, links: linksByVerse[r.verse] || [] };
        });
        const total       = verses.length;
        const done        = verses.filter(v => v.status === 'done').length;
        const in_progress = verses.filter(v => v.status === 'in_progress').length;
        res.json({ book_id: bookId, chapter, lang, verses, total, done, in_progress });
    } catch(err) {
        console.error('/api/translate/chapter failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/translate/verse?book=1&chapter=1&verse=1
app.get('/api/translate/verse', (req, res) => {
    try {
        const bookId  = parseInt(req.query.book, 10);
        const chapter = parseInt(req.query.chapter, 10);
        const verse   = parseInt(req.query.verse, 10);
        const lang    = (req.query.lang || 'BHS').toString();   // source language to link against
        if (!bookId || !chapter || !Number.isInteger(verse)) return res.status(400).json({ error: 'book, chapter, verse required' });

        const saved = translationDb.stmts.getVerse.get(bookId, chapter, verse);
        // BHS tokens kept for the existing Hebrew flow; for other languages the
        // Studio fetches source tokens from /api/source/:lang/verse (one tokenizer,
        // all languages + reading direction). Links, however, are per-language here.
        // Same table the reader would use for this book (OT: tokens_bhs,
        // canon 40-66: tokens_nt) — see txVerseQuery.
        const tokens = txVerseQuery(bookId).all(bookId, chapter, verse);
        // WHICH EDITION THOSE TOKENS ACTUALLY CAME FROM. txVerseQuery picks by
        // BOOK ID, not by `lang` — an NT book always reads tokens_nt however the
        // Studio's language picker is set. So the picker said 'BHS' (its default)
        // while the tokens on screen were HEB, and every link authored on a NT
        // verse was stored under lang='BHS'. /parallel then asked for lang='HEB'
        // and got nothing: 16,453 links in the table, only 16 tagged HEB, none in
        // Matthew.
        //
        // The client must not re-derive this. Return what was USED, the same way
        // the reader records what it fetched rather than recomputing it.
        const tokenSource = (bookId >= 40 && bookId <= 66) ? 'HEB' : 'BHS';

        const rawLinks = translationDb.stmts.getLinks.all(bookId, chapter, verse, lang);
        const links = rawLinks.map(l => ({
            ...l,
            token_ordinals:  JSON.parse(l.token_ordinals  || '[]'),
            english_indices: JSON.parse(l.english_indices || '[]'),
        }));

        // Lazy prefill: if you haven't saved anything for this verse, seed the
        // editor with the English baseline (WEB, names passed through). Your saved
        // text always wins; the baseline is never written to translation.db, so a
        // verse you never touch stays untranslated (status 'none').
        //
        // load-english-baseline.js pre-seeds `saved.text` for every verse (its
        // resetUntouched step), so the plain `saved?.text || ''` check below used
        // to treat that frozen snapshot as if it were always your own text — same
        // staleness bug as /api/translate/chapter. Distinguish an untouched draft
        // (still 'none' + 'web-passthrough' + text===original_text) and re-gloss
        // ONLY that against the current lexicon; a real translation is untouched.
        const rawSavedText = saved?.text || '';
        const isUntouchedDraft = !!saved && saved.status === 'none'
            && saved.source_origin === 'web-passthrough'
            && saved.original_text != null && saved.text === saved.original_text;
        const savedText = (rawSavedText && !isUntouchedDraft) ? rawSavedText : '';
        const baseline  = savedText ? '' : applyLiveGloss(rawSavedText || englishBaseline(bookId, chapter, verse));
        res.json({
            book_id: bookId, chapter, verse, lang,
            token_source: tokenSource,   // author links against THIS, not `lang`
            status:    saved?.status    || 'none',
            text:      savedText || baseline,
            rich_text: saved?.rich_text || '',
            prefilled: !savedText && !!baseline,        // box holds baseline, not your own text
            baseline_origin: (!savedText && baseline) ? 'WEB' : null,
            source_origin: saved?.source_origin || null,
            has_original:  saved?.original_text != null,   // can this verse be reverted?
            tokens, links,
        });
    } catch(err) {
        console.error('/api/translate/verse failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/translate/verse
app.put('/api/translate/verse', (req, res) => {
    try {
        const { book_id, chapter, verse, status, text, rich_text } = req.body;
        if (!book_id || !chapter || !Number.isInteger(verse)) return res.status(400).json({ error: 'book_id, chapter, verse required' });
        const validStatuses = ['none', 'in_progress', 'done'];
        const st = validStatuses.includes(status) ? status : 'in_progress';
        translationDb.saveVerseWithHistory(book_id, chapter, verse, st, text || '', rich_text || '');
        res.json({ ok: true, book_id, chapter, verse, status: st });
    } catch(err) {
        console.error('PUT /api/translate/verse failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/translate/history?book=&chapter=&verse=
// Every PRIOR version of a verse, newest first, captured automatically by
// saveVerseWithHistory (see translationDb above) right before each overwrite.
app.get('/api/translate/history', (req, res) => {
    try {
        const book_id = parseInt(req.query.book, 10);
        const chapter = parseInt(req.query.chapter, 10);
        const verse   = parseInt(req.query.verse, 10);
        if (!book_id || !chapter || !Number.isInteger(verse)) return res.status(400).json({ error: 'book, chapter, verse required' });
        const versions = translationDb.stmts.verseHistory.all(book_id, chapter, verse);
        res.json({ book_id, chapter, verse, versions });
    } catch (err) {
        console.error('GET /api/translate/history failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/translate/history/revert  { book_id, chapter, verse, history_id }
// Restores a past version as the CURRENT one. This is itself just another
// save (goes through saveVerseWithHistory), so it snapshots whatever it's
// replacing too — reverting can never destroy a version, the timeline only
// ever grows. 404s if history_id doesn't belong to this exact verse, so a
// stale/tampered id can't restore the wrong verse's text into this one.
app.post('/api/translate/history/revert', express.json(), (req, res) => {
    try {
        const { book_id, chapter, verse, history_id } = req.body || {};
        if (!book_id || !chapter || !Number.isInteger(verse) || !history_id) {
            return res.status(400).json({ error: 'book_id, chapter, verse, history_id required' });
        }
        const entry = translationDb.stmts.historyEntry.get(history_id, book_id, chapter, verse);
        if (!entry) return res.status(404).json({ error: 'history entry not found for this verse' });
        translationDb.saveVerseWithHistory(book_id, chapter, verse, entry.status || 'none', entry.text || '', entry.rich_text || '');
        res.json({ ok: true, book_id, chapter, verse, status: entry.status || 'none', text: entry.text || '', rich_text: entry.rich_text || '' });
    } catch (err) {
        console.error('POST /api/translate/history/revert failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/translate/history/:id?book=&chapter=&verse=
// Removes ONE past version permanently — unlike revert, this is genuinely
// destructive (no snapshot taken first), so the client should confirm with
// the user before calling this. Scoped to the exact verse via the query
// params (same WHERE-clause discipline as deleteLink above) so a stale/
// tampered id can't delete a different verse's history entry.
app.delete('/api/translate/history/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const book_id = parseInt(req.query.book, 10);
        const chapter = parseInt(req.query.chapter, 10);
        const verse   = parseInt(req.query.verse, 10);
        if (!id || !book_id || !chapter || !Number.isInteger(verse)) {
            return res.status(400).json({ error: 'id, book, chapter, verse required' });
        }
        const result = translationDb.stmts.deleteHistoryEntry.run(id, book_id, chapter, verse);
        res.json({ ok: true, deleted: result.changes > 0 });
    } catch (err) {
        console.error('DELETE /api/translate/history failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/translate/link
app.post('/api/translate/link', (req, res) => {
    try {
        const { book_id, chapter, verse, lang, english_phrase, english_indices, token_ordinals, component_hint, color_index, sort_order } = req.body;
        if (!book_id || !chapter || !Number.isInteger(verse)) return res.status(400).json({ error: 'book_id, chapter, verse required' });
        const result = translationDb.stmts.insertLink.run(
            book_id, chapter, verse, (lang || 'BHS').toString(),
            english_phrase || '',
            JSON.stringify(english_indices || []),
            JSON.stringify(token_ordinals  || []),
            component_hint || '',
            color_index    || 0,
            sort_order     || 0,
        );
        res.json({ ok: true, id: result.lastInsertRowid });
    } catch(err) {
        console.error('POST /api/translate/link failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/translate/link/:id
app.put('/api/translate/link/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        let { book_id, chapter, verse } = req.body;
        const { english_phrase, english_indices, token_ordinals, component_hint, color_index, sort_order } = req.body;
        // The id already identifies the row, so book/chapter/verse are a SCOPE
        // CHECK, not information the caller should have to supply. Requiring them
        // outright meant any caller that sent only the id got a bare 400 — which
        // is what made "add another word to an existing link" fail while creating
        // a new link worked. Fill them in from the row when absent, and only
        // reject when the row genuinely is not there.
        if (!book_id || !chapter || !Number.isInteger(verse)) {
            const row = translationDb.tdb
                .prepare('SELECT book_id, chapter, verse FROM translation_links WHERE id = ?')
                .get(id);
            if (!row) return res.status(404).json({ error: `no link ${id}` });
            book_id = book_id || row.book_id;
            chapter = chapter || row.chapter;
            verse   = Number.isInteger(verse) ? verse : row.verse;
        }
        const info = translationDb.stmts.updateLink.run(
            english_phrase || '',
            JSON.stringify(english_indices || []),
            JSON.stringify(token_ordinals  || []),
            component_hint || '',
            color_index    || 0,
            sort_order     || 0,
            id, book_id, chapter, verse,
        );
        // A silent no-op is worse than an error: it looks like the edit saved.
        if (info && info.changes === 0)
            return res.status(409).json({ error: `link ${id} did not match book ${book_id} ${chapter}:${verse}` });
        res.json({ ok: true, id });
    } catch(err) {
        console.error(`PUT /api/translate/link/${req.params.id} failed:`, err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/translate/link/:id
app.delete('/api/translate/link/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { book_id, chapter, verse } = req.query;
        translationDb.stmts.deleteLink.run(id, parseInt(book_id), parseInt(chapter), parseInt(verse));
        res.json({ ok: true });
    } catch(err) {
        console.error(`DELETE /api/translate/link/${req.params.id} failed:`, err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/translate/links?book=&chapter=&verse=&lang=
app.delete('/api/translate/links', (req, res) => {
    try {
        const { book, chapter, verse, lang } = req.query;
        translationDb.stmts.deleteAllLinks.run(parseInt(book), parseInt(chapter), parseInt(verse), (lang || 'BHS').toString());
        res.json({ ok: true });
    } catch(err) {
        console.error('DELETE /api/translate/links failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── Multi-language translation studio: supporting endpoints ─────────────────
// GET /api/translate/languages?book=&chapter=&verse=
// Which corpus sources actually contain this verse — the language filter for the
// Studio. Returns [{ id, label, script, dir }]. English is always offered as the
// translation target; the others are link sources.
app.get('/api/translate/languages', (req, res) => {
    try {
        const book = parseInt(req.query.book, 10);
        const ch   = parseInt(req.query.chapter, 10);
        const v    = parseInt(req.query.verse, 10);
        if (!book) return res.status(400).json({ error: 'book required' });
        const RTL = new Set(['paleo-hebrew', 'hebrew', 'syriac']);
        const out = [];
        for (const src of Object.values(SOURCES)) {
            if (src.worksOnly) continue;
            // English is the translation TARGET (this endpoint's own contract
            // says so). Listing it as a source meant a verse with no Hebrew
            // returned exactly one language — English — which the client picked
            // as list[0] and then rendered as "English Source", with no picker
            // (that needs langs.length > 1) to switch back to Paleo.
            if (src.id === 'ENG') continue;
            let has = false;
            try {
                if (src.id === 'BHS') {
                    // Must probe the SAME table the Studio will then read from,
                    // or an NT verse reports "no Hebrew" while tokens_nt has it.
                    has = !!txVerseQuery(book).get(book, ch || 1, v || 1);
                } else if (src.handle) {
                    has = !!src.handle.prepare(`SELECT 1 FROM verses WHERE book_id=? AND chapter=? AND verse=? LIMIT 1`).get(book, ch || 1, v || 1);
                }
            } catch { has = false; }
            if (has) out.push({ id: src.id, label: src.label, script: src.script, dir: RTL.has(src.script) ? 'rtl' : 'ltr' });
        }
        res.json({ book, chapter: ch, verse: v, languages: out });
    } catch(err) {
        console.error('/api/translate/languages failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/translate/import-original   { book_id, chapter, verse, source }
// Snapshot a corpus verse's English into the studio as the editable source of
// truth (idempotent — never clobbers an existing snapshot or your edits).
app.post('/api/translate/import-original', (req, res) => {
    try {
        const { book_id, chapter, verse, source } = req.body;
        if (!book_id || !chapter || !Number.isInteger(verse)) return res.status(400).json({ error: 'book_id, chapter, verse required' });
        const src = resolveSource(source || 'ENG');
        if (!src || !src.handle) return res.status(404).json({ error: 'source not available' });
        const row = src.handle.prepare(`SELECT text FROM verses WHERE book_id=? AND chapter=? AND verse=? LIMIT 1`).get(book_id, chapter, verse);
        if (!row) return res.status(404).json({ error: 'verse not in source' });
        translationDb.stmts.importOriginal.run(book_id, chapter, verse, row.text, src.id, row.text);
        const saved = translationDb.stmts.getVerse.get(book_id, chapter, verse);
        res.json({ ok: true, text: saved.text, source_origin: saved.source_origin, has_original: saved.original_text != null });
    } catch(err) {
        console.error('POST /api/translate/import-original failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/translate/revert   { book_id, chapter, verse }
// Restore the editable English back to the snapshotted corpus original.
app.post('/api/translate/revert', (req, res) => {
    try {
        const { book_id, chapter, verse } = req.body;
        if (!book_id || !chapter || !Number.isInteger(verse)) return res.status(400).json({ error: 'book_id, chapter, verse required' });
        const r = translationDb.stmts.revertVerse.run(book_id, chapter, verse);
        if (!r.changes) return res.status(404).json({ error: 'no original snapshot to revert to' });
        const saved = translationDb.stmts.getVerse.get(book_id, chapter, verse);
        res.json({ ok: true, text: saved.text });
    } catch(err) {
        console.error('POST /api/translate/revert failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── Parallel reader backbone ────────────────────────────────────────────────
// A verse is "readable in parallel" for a language once it has both a saved
// English translation and at least one link in that language. These endpoints
// give a parallel UI everything except the source tokens themselves, which the
// UI fetches from the SAME endpoints the Studio used (/api/source/:lang/verse
// for non-Hebrew, /api/tokens for BHS) so token ordinals always line up.

const _DIR_RTL = new Set(['paleo-hebrew', 'hebrew', 'syriac']);
const _dirFor  = (script) => _DIR_RTL.has(script) ? 'rtl' : 'ltr';

// GET /api/parallel/languages?book=&chapter=&verse=
// Which languages are actually linked (and English saved) for this verse —
// i.e. what you can open in parallel right now.
app.get('/api/parallel/languages', (req, res) => {
    try {
        const book = parseInt(req.query.book, 10);
        const ch   = parseInt(req.query.chapter, 10);
        const v    = parseInt(req.query.verse, 10);
        if (!book || !ch || !Number.isInteger(v)) return res.status(400).json({ error: 'book, chapter, verse required' });
        const eng = translationDb.stmts.getVerse.get(book, ch, v);
        const hasEnglish = !!((eng && eng.text && eng.text.trim()) || englishBaseline(book, ch, v));
        const rows = translationDb.tdb.prepare(`
            SELECT lang, COUNT(*) AS n FROM translation_links
            WHERE book_id=? AND chapter=? AND verse=? GROUP BY lang
        `).all(book, ch, v);
        const langs = rows.map(r => {
            const src = SOURCES[r.lang] || {};
            return { id: r.lang, label: src.label || r.lang, script: src.script || null, dir: _dirFor(src.script), link_count: r.n };
        });
        res.json({ book, chapter: ch, verse: v, has_english: hasEnglish, languages: langs });
    } catch(err) {
        console.error('/api/parallel/languages failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/parallel/verse?book=&chapter=&verse=&lang=
// The aligned payload: the shared English (LTR) plus the chosen language's
// metadata (with reading direction) and the links binding English word-indices
// to that language's token ordinals. Source tokens come from the source/tokens
// endpoint on the UI side, keyed by the same ordinals stored here.
app.get('/api/parallel/verse', (req, res) => {
    try {
        const book = parseInt(req.query.book, 10);
        const ch   = parseInt(req.query.chapter, 10);
        const v    = parseInt(req.query.verse, 10);
        const lang = (req.query.lang || 'BHS').toString();
        if (!book || !ch || !Number.isInteger(v)) return res.status(400).json({ error: 'book, chapter, verse required' });

        const saved = translationDb.stmts.getVerse.get(book, ch, v);
        // Reading in /parallel shows your English for EVERY verse, touched or not.
        // The English comes from (in order): your real translation → the pre-saved
        // draft in translation.db → the MT-aligned baseline in corpus.db. A verse
        // is "baseline" (untouched) when its row is still the web-passthrough draft
        // at status 'none' with text === the original snapshot; anything else is
        // your override. Either way, no per-verse Save is needed to see the text.
        const savedText = (saved?.text && saved.text.trim()) ? saved.text : '';
        const isUntouchedDraft = !!saved && saved.status === 'none'
            && saved.source_origin === 'web-passthrough'
            && saved.original_text != null && saved.text === saved.original_text;
        const isUserOverride = !!savedText && !isUntouchedDraft;
        // Same pre-seeded-snapshot staleness as /api/translate/chapter: re-gloss
        // live against the current lexicon unless this is the user's real
        // translation (never rewritten).
        const englishText = isUserOverride ? savedText : applyLiveGloss(savedText || englishBaseline(book, ch, v));
        const isBaseline  = !isUserOverride && !!englishText;
        const enWords = englishText.trim().split(/\s+/).filter(Boolean);

        const rawLinks = translationDb.stmts.getLinks.all(book, ch, v, lang);
        const links = rawLinks.map(l => ({
            id: l.id,
            english_indices: JSON.parse(l.english_indices || '[]'),
            token_ordinals:  JSON.parse(l.token_ordinals  || '[]'),
            component_hint:  l.component_hint || '',
            color_index:     l.color_index || 0,
        }));

        const src = SOURCES[lang] || {};
        // WHICH ENDPOINT SERVES THIS LANGUAGE'S TOKENS.
        // This used to read `lang === 'BHS' ? tokens : plain text`, so HEB — which
        // has a full token stream with Strong's, roots and prefix/suffix
        // components — was sent to the text endpoint and rendered as bare glyphs
        // with a one-word gloss, while BHS beside it rendered full word blocks.
        // Same script, same reader, two levels of detail, decided by a hardcoded
        // string. Ask the data instead: any edition the index (or the token
        // tables) covers for this book gets the token path, and `source` keeps
        // the two Hebrews apart exactly as it does in the main reader.
        const tokenised = hebSourceHasTokens(lang, book);
        res.json({
            book, chapter: ch, verse: v,
            english: { text: englishText, words: enWords, dir: 'ltr', is_baseline: isBaseline },
            source:  { id: lang, label: src.label || lang, script: src.script || null, dir: _dirFor(src.script),
                       // where the UI should fetch this language's tokens from:
                       tokens_url: tokenised
                         ? `/api/tokens?book=${book}&chapter=${ch}&source=${encodeURIComponent(tokenised)}`
                         : `/api/source/${encodeURIComponent(lang)}/verse?book=${book}&chapter=${ch}&verse=${v}`,
                       // The UI should branch on THIS, not on the language name —
                       // otherwise the next tokenised edition repeats the bug.
                       has_tokens: !!tokenised },
            links,
            status: saved?.status || 'none',
        });
    } catch(err) {
        console.error('/api/parallel/verse failed:', err);
        res.status(500).json({ error: err.message });
    }
});

console.log('[translation] Routes registered — /translate, /parallel, /api/translate/*');

// ─── ADMIN: BAKE GLYPHS TO SERVER ────────────────────────────────────────────
// POST /api/admin/save-glyphs  { key, js }
// Set PALEO_ADMIN_KEY env var (or hardcode below) to protect this endpoint.
const PALEO_ADMIN_KEY = process.env.PALEO_ADMIN_KEY || 'changeme';
app.post('/api/admin/save-glyphs', express.json({ limit: '4mb' }), (req, res) => {
    try {
        const { key, js } = req.body;
        if (!key || key !== PALEO_ADMIN_KEY) {
            return res.status(403).json({ error: 'Invalid admin key' });
        }
        if (!js || typeof js !== 'string' || !js.includes('paleoToSVG')) {
            return res.status(400).json({ error: 'Invalid glyph JS payload' });
        }
        const glyphPath = path.join(__dirname, 'public', 'paleo-glyphs.js');
        require('fs').writeFileSync(glyphPath, js, 'utf8');
        console.log('[admin] paleo-glyphs.js updated from glyph editor');
        res.json({ ok: true });
    } catch (err) {
        console.error('/api/admin/save-glyphs failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── PRODUCTION WIRING (end-of-file) ─────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
// MULTI-SOURCE ENDPOINTS — LXX, GNT, BETMAS_GEZ_V, BETMAS literature
// ═══════════════════════════════════════════════════════════════════════════
//
// These endpoints serve verse and chapter content from multi-source.db (built
// by scripts/ingest-multi-source.cjs from refs.txt). They are independent of
// the main bible.db pipeline — the main app continues to work even if
// multi-source.db is absent.
//
// Endpoints:
//   GET /api/multi/sources                                    — list sources + counts
//   GET /api/multi/books?source=LXX                           — list books in a source
//   GET /api/multi/chapters?source=LXX&book=1                 — list chapters
//   GET /api/multi/verses?source=LXX&book=1&chapter=1         — verses of a chapter
//   GET /api/multi/verse?source=LXX&book=1&chapter=1&verse=1  — single verse + neighbors
//   GET /api/multi/parallel?book=1&chapter=1&verse=1          — same ref across sources
//   GET /api/multi/docs?source=BETMAS_GEZ                     — list docs in a lit source
//   GET /api/multi/doc?source=BETMAS_GEZ&doc=LIT...           — full text of a doc

let multiDb = null;
try {
    const multiDbPath = path.join(__dirname, 'multi-source.db');
    if (fs.existsSync(multiDbPath)) {
        multiDb = new Database(multiDbPath, { readonly: true });
        const stats = multiDb.prepare(`SELECT source_id, n_units FROM sources ORDER BY n_units DESC`).all();
        console.log(`[multi] loaded ${stats.length} sources, total ${stats.reduce((a, s) => a + s.n_units, 0).toLocaleString()} units`);
    } else {
        console.log(`[multi] multi-source.db not present — endpoints will return 503`);
    }
} catch (e) {
    console.warn(`[multi] failed to open multi-source.db: ${e.message}`);
}

function multiGuard(req, res) {
    if (!multiDb) {
        res.status(503).json({ error: 'multi-source.db not built; run scripts/ingest-multi-source.cjs first' });
        return false;
    }
    return true;
}

// Standard Bible book ID → display name. Used to enrich responses so clients
// don't have to maintain their own copy. (For BETMAS lit-docs, doc_id is
// returned instead of a book name.)
const MULTI_BOOK_NAMES = {
    1: 'Genesis', 2: 'Exodus', 3: 'Leviticus', 4: 'Numbers', 5: 'Deuteronomy',
    6: 'Joshua', 7: 'Judges', 8: 'Ruth', 9: '1 Samuel', 10: '2 Samuel',
    11: '1 Kings', 12: '2 Kings', 13: '1 Chronicles', 14: '2 Chronicles',
    15: 'Ezra', 16: 'Nehemiah', 17: 'Esther', 18: 'Job', 19: 'Psalms',
    20: 'Proverbs', 21: 'Ecclesiastes', 22: 'Song of Songs', 23: 'Isaiah',
    24: 'Jeremiah', 25: 'Lamentations', 26: 'Ezekiel', 27: 'Daniel',
    28: 'Hosea', 29: 'Joel', 30: 'Amos', 31: 'Obadiah', 32: 'Jonah',
    33: 'Micah', 34: 'Nahum', 35: 'Habakkuk', 36: 'Zephaniah', 37: 'Haggai',
    38: 'Zechariah', 39: 'Malachi',
    40: 'Matthew', 41: 'Mark', 42: 'Luke', 43: 'John', 44: 'Acts',
    45: 'Romans', 46: '1 Corinthians', 47: '2 Corinthians', 48: 'Galatians',
    49: 'Ephesians', 50: 'Philippians', 51: 'Colossians', 52: '1 Thessalonians',
    53: '2 Thessalonians', 54: '1 Timothy', 55: '2 Timothy', 56: 'Titus',
    57: 'Philemon', 58: 'Hebrews', 59: 'James', 60: '1 Peter', 61: '2 Peter',
    62: '1 John', 63: '2 John', 64: '3 John', 65: 'Jude', 66: 'Revelation',
    // LXX-specific (deuterocanonical / apocryphal block 67-85):
    67: 'Tobit', 68: 'Judith', 69: 'Wisdom of Solomon', 70: 'Sirach',
    71: 'Baruch', 72: 'Letter of Jeremiah', 73: '1 Maccabees', 74: '2 Maccabees',
    75: '3 Maccabees', 76: '4 Maccabees', 77: 'Psalm 151', 78: 'Prayer of Manasseh',
    79: 'Susanna', 80: 'Bel and the Dragon', 81: '1 Esdras', 82: '2 Esdras',
    83: 'Odes', 84: 'Psalms of Solomon', 85: '3 Baruch',
};

app.get('/api/multi/sources', production.cache(60), (req, res) => {
    if (!multiGuard(req, res)) return;
    try {
        const rows = multiDb.prepare(`
            SELECT source_id, name, language, script, ref_kind, n_units
            FROM sources WHERE n_units > 0 ORDER BY n_units DESC
        `).all();
        res.json({ sources: rows });
    } catch (e) {
        console.error('/api/multi/sources', e); res.status(500).json({ error: e.message });
    }
});

app.get('/api/multi/books', production.cache(60), (req, res) => {
    if (!multiGuard(req, res)) return;
    try {
        const source_id = String(req.query.source || '');
        const src = multiDb.prepare(`SELECT ref_kind FROM sources WHERE source_id = ?`).get(source_id);
        if (!src) return res.status(404).json({ error: `unknown source ${source_id}` });
        if (src.ref_kind === 'literature_doc') {
            return res.json({ source: source_id, kind: 'literature_doc', books: [], message: 'use /api/multi/docs for literature sources' });
        }
        const rows = multiDb.prepare(`
            SELECT book_id, COUNT(DISTINCT chapter) AS n_chapters, COUNT(*) AS n_verses
            FROM verses WHERE source_id = ? AND book_id > 0
            GROUP BY book_id ORDER BY book_id
        `).all(source_id);
        const books = rows.map(r => ({
            book_id:    r.book_id,
            name:       MULTI_BOOK_NAMES[r.book_id] || `Book ${r.book_id}`,
            n_chapters: r.n_chapters,
            n_verses:   r.n_verses,
        }));
        res.json({ source: source_id, kind: 'bible_verse', books });
    } catch (e) {
        console.error('/api/multi/books', e); res.status(500).json({ error: e.message });
    }
});

app.get('/api/multi/chapters', production.cache(60), (req, res) => {
    if (!multiGuard(req, res)) return;
    try {
        const source_id = String(req.query.source || '');
        const book_id   = parseInt(req.query.book, 10);
        if (!Number.isFinite(book_id)) return res.status(400).json({ error: 'bad book_id' });
        const rows = multiDb.prepare(`
            SELECT chapter, COUNT(*) AS n_verses
            FROM verses WHERE source_id = ? AND book_id = ?
            GROUP BY chapter ORDER BY chapter
        `).all(source_id, book_id);
        res.json({
            source:  source_id,
            book_id,
            book_name: MULTI_BOOK_NAMES[book_id] || `Book ${book_id}`,
            chapters: rows,
        });
    } catch (e) {
        console.error('/api/multi/chapters', e); res.status(500).json({ error: e.message });
    }
});

app.get('/api/multi/verses', production.cache(60), (req, res) => {
    if (!multiGuard(req, res)) return;
    try {
        const source_id = String(req.query.source || '');
        const book_id   = parseInt(req.query.book, 10);
        const chapter   = parseInt(req.query.chapter, 10);
        if (!Number.isFinite(book_id) || !Number.isFinite(chapter)) {
            return res.status(400).json({ error: 'bad book/chapter' });
        }
        // Honor preferred_docs when the source has multiple docs sharing this
        // book code (e.g. BETMAS_GEZ_V's 1SA/2SA split).
        const pref = multiDb.prepare(`
            SELECT doc_id FROM preferred_docs WHERE source_id = ? AND book_id = ?
        `).get(source_id, book_id);
        const docFilter = pref ? `AND (doc_id IS NULL OR doc_id = ?)` : '';
        const params = pref ? [source_id, book_id, chapter, pref.doc_id] : [source_id, book_id, chapter];
        const rows = multiDb.prepare(`
            SELECT verse, ord, text_raw, doc_id, book_code
            FROM verses WHERE source_id = ? AND book_id = ? AND chapter = ? ${docFilter}
            ORDER BY verse
        `).all(...params);
        res.json({
            source:    source_id,
            book_id,
            book_name: MULTI_BOOK_NAMES[book_id] || `Book ${book_id}`,
            chapter,
            doc_id:    pref?.doc_id || null,
            verses:    rows,
        });
    } catch (e) {
        console.error('/api/multi/verses', e); res.status(500).json({ error: e.message });
    }
});

app.get('/api/multi/verse', production.cache(60), (req, res) => {
    if (!multiGuard(req, res)) return;
    try {
        const source_id = String(req.query.source || '');
        const book_id   = parseInt(req.query.book, 10);
        const chapter   = parseInt(req.query.chapter, 10);
        const verse     = parseInt(req.query.verse, 10);
        if (!Number.isFinite(book_id) || !Number.isFinite(chapter) || !Number.isFinite(verse)) {
            return res.status(400).json({ error: 'bad book/chapter/verse' });
        }
        const pref = multiDb.prepare(`
            SELECT doc_id FROM preferred_docs WHERE source_id = ? AND book_id = ?
        `).get(source_id, book_id);
        const docFilter = pref ? `AND (doc_id IS NULL OR doc_id = ?)` : '';
        const params = pref ? [source_id, book_id, chapter, verse, pref.doc_id]
                             : [source_id, book_id, chapter, verse];
        const cur = multiDb.prepare(`
            SELECT * FROM verses
            WHERE source_id = ? AND book_id = ? AND chapter = ? AND verse = ? ${docFilter}
            LIMIT 1
        `).get(...params);
        if (!cur) return res.status(404).json({ error: 'verse not found in source' });

        // Previous and next by linear ord — handles chapter and book boundaries
        // automatically, giving "click through verses continually until last".
        const prev = multiDb.prepare(`
            SELECT source_id, book_id, chapter, verse, doc_id, ord
            FROM verses WHERE source_id = ? AND ord = ?
        `).get(source_id, cur.ord - 1);
        const next = multiDb.prepare(`
            SELECT source_id, book_id, chapter, verse, doc_id, ord
            FROM verses WHERE source_id = ? AND ord = ?
        `).get(source_id, cur.ord + 1);

        res.json({
            current: { ...cur, book_name: MULTI_BOOK_NAMES[cur.book_id] || `Book ${cur.book_id}` },
            prev:    prev ? { ...prev, book_name: MULTI_BOOK_NAMES[prev.book_id] || `Book ${prev.book_id}` } : null,
            next:    next ? { ...next, book_name: MULTI_BOOK_NAMES[next.book_id] || `Book ${next.book_id}` } : null,
        });
    } catch (e) {
        console.error('/api/multi/verse', e); res.status(500).json({ error: e.message });
    }
});

app.get('/api/multi/parallel', production.cache(60), (req, res) => {
    if (!multiGuard(req, res)) return;
    try {
        const book_id = parseInt(req.query.book, 10);
        const chapter = parseInt(req.query.chapter, 10);
        const verse   = parseInt(req.query.verse, 10);
        if (!Number.isFinite(book_id) || !Number.isFinite(chapter) || !Number.isFinite(verse)) {
            return res.status(400).json({ error: 'bad book/chapter/verse' });
        }
        // For each source that has this reference, pick the preferred doc.
        // Sources without a preferred_doc just return any matching row.
        const rows = multiDb.prepare(`
            SELECT v.source_id, v.text_raw, v.doc_id, v.book_code,
                   (SELECT name FROM sources s WHERE s.source_id = v.source_id) AS source_name,
                   (SELECT language FROM sources s WHERE s.source_id = v.source_id) AS language,
                   (SELECT script FROM sources s WHERE s.source_id = v.source_id) AS script
            FROM verses v
            LEFT JOIN preferred_docs p ON p.source_id = v.source_id AND p.book_id = v.book_id
            WHERE v.book_id = ? AND v.chapter = ? AND v.verse = ?
              AND (v.doc_id IS NULL OR p.doc_id IS NULL OR v.doc_id = p.doc_id)
            ORDER BY v.source_id
        `).all(book_id, chapter, verse);
        res.json({
            book_id,
            book_name: MULTI_BOOK_NAMES[book_id] || `Book ${book_id}`,
            chapter,
            verse,
            sources: rows,
        });
    } catch (e) {
        console.error('/api/multi/parallel', e); res.status(500).json({ error: e.message });
    }
});

app.get('/api/multi/docs', production.cache(60), (req, res) => {
    if (!multiGuard(req, res)) return;
    try {
        const source_id = String(req.query.source || '');
        const rows = multiDb.prepare(`
            SELECT doc_id, COUNT(*) AS n_units, MIN(ord) AS first_ord, MAX(ord) AS last_ord
            FROM verses WHERE source_id = ? AND doc_id IS NOT NULL
            GROUP BY doc_id ORDER BY doc_id
        `).all(source_id);
        res.json({ source: source_id, docs: rows });
    } catch (e) {
        console.error('/api/multi/docs', e); res.status(500).json({ error: e.message });
    }
});

app.get('/api/multi/doc', production.cache(60), (req, res) => {
    if (!multiGuard(req, res)) return;
    try {
        const source_id = String(req.query.source || '');
        const doc_id    = String(req.query.doc || '');
        if (!doc_id) return res.status(400).json({ error: 'doc required' });
        const rows = multiDb.prepare(`
            SELECT chapter AS unit, text_raw, ord
            FROM verses WHERE source_id = ? AND doc_id = ?
            ORDER BY ord
        `).all(source_id, doc_id);
        res.json({ source: source_id, doc_id, units: rows });
    } catch (e) {
        console.error('/api/multi/doc', e); res.status(500).json({ error: e.message });
    }
});

// ── SPA CATCH-ALL ────────────────────────────────────────────────────────────
// Any GET that isn't an API call, didn't match a static file, and didn't
// match a named SPA route above falls through to here. Serve index.html so
// React Router can resolve the URL client-side. This means hard-refreshing
// any frontend route works — no "Cannot GET /<route>" 404s.
//
// We restrict it to GET only (POST/PUT/DELETE should 404 normally) and
// exclude /api/ so an unknown API path still 404s cleanly. We also exclude
// requests with a file extension other than .html so missing /assets/foo.js
// doesn't silently serve the SPA shell (which would corrupt the bundle).
app.get(/^\/(?!api\/).*/, (req, res, next) => {
    if (/\.[a-z0-9]+$/i.test(req.path) && !req.path.endsWith('.html')) return next();
    spaShell(req, res);
});

// Error handler MUST be after all routes — express recognizes 4-arg middleware
// as error handlers and routes thrown errors here.  Without this, a bug in
// any route would leak its stack to the client in default JSON.
production.install_end(app);

const server = app.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}  pid=${process.pid}`);
});

// Reasonable timeouts.  Defaults in Node are too generous for an interactive
// app: a stuck client could hold a socket indefinitely.
server.keepAliveTimeout = 65 * 1000;  // > typical LB idle timeout
server.headersTimeout   = 70 * 1000;  // must be > keepAliveTimeout
server.requestTimeout   = 30 * 1000;  // any single request > 30s is wedged

// NOTE, 2026-08-11: a boot-time warm-up of the Gloss Studio coverage caches
// (getGlossCoverage() + computeAggregateCoverage(), via setImmediate right
// here) was tried and REVERTED the same day — this app runs cluster.js with
// one worker PER CPU CORE, each independently require()-ing server.js and
// each independently hitting app.listen(), so a warm-up here runs in EVERY
// worker AT ONCE: a full iterate() over the whole Hebrew corpus (~1M rows)
// plus tokenizing every verse of all six languages (Latin alone is 416,628
// verses) simultaneously, on every core, right at boot. That's exactly the
// OOM shape CLAUDE.md already warns about elsewhere in this file ("crashed
// production... heap limit hit during a blue-green boot already under a
// tight startup memory cap") — confirmed for real: the first deploy after
// adding this failed paleo-b's health check, docker logs showing a worker
// SIGKILLed ~50s into boot (no exit code — the OOM-kill signature). The
// stale-while-revalidate caches above don't need this: the first REAL
// request for Gloss Studio after a restart pays the rebuild cost once, in
// whichever single worker happens to receive it — an admin-only page nobody
// hits in the first seconds after a deploy anyway. Do not re-add a boot-time
// warm-up without first gating it to run in exactly one process (e.g.
// cluster.isPrimary, or a dedicated one-shot script), never inside the
// worker path every core executes.

// Graceful shutdown.  Pass DB handles so they get closed cleanly on SIGTERM.
production.installShutdown(server, [db, surfDb, translationDb]);