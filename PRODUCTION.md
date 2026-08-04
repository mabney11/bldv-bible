# Production deployment

This doc covers how to run `server.js` in production with the optimizations
applied this round.  None of it is required for development — `node server.js`
still works for casual local use.

## TL;DR

```bash
# 1.  Install runtime deps (one-time)
cd server/ && npm install --production

# 2.  Build the React bundle (one-time, or any time UI code changes)
#     vite.config.js writes straight into server/public/ — no dist/ folder,
#     no copy step needed.
cd ../ && npm run build

# 3.  Run cluster mode (one worker per CPU)
NODE_ENV=production node server/cluster.js
```

## What changed

### `/api/tokens` is now 4–8× faster

The original handler called `parseHebrewData` on every request — about 8 ms of
synchronous work for Genesis 1.  Since `surface-index.db` already has every
surface form pre-parsed (100% coverage at build time), the new handler reads
the pre-baked `components` JSON directly and groups it with `groupSurfaceTokens`.

Measured (real corpus, real DB):

| Chapter           | Old      | New       | Speedup |
|-------------------|----------|-----------|---------|
| Genesis 1 (374)   | 24.3 ms  | **2.9 ms** | 8.4×    |
| Genesis 50 (309)  | 11.1 ms  | **2.4 ms** | 4.7×    |
| Psalm 119 (961)   | 26.3 ms  | **6.2 ms** | 4.2×    |
| Isaiah 53 (150)   | 4.1 ms   | **1.1 ms** | 3.7×    |

The fallback path still runs `parseHebrewData` when surface-index has no
match (logs a warning); in practice the index covers everything so this
never fires.

### Startup is 7× faster on warm restarts

Nav indexes (4836 roots, 24253 surfaces) used to be rebuilt on every process
start — about 1 second of synchronous work.  They're now cached to
`server/nav-index.cache.json` keyed by an mtime stamp of every input file
(`surface-index.db` + the four lexicon JSONs).  The cache auto-invalidates
when any input changes.

| Boot              | Time   |
|-------------------|--------|
| Cold (no cache)   | ~1.5 s |
| Warm (cache hit)  | ~0.2 s |

The cache file is ~3 MB.  It's safe to delete; the next start will rebuild it.

### Everything is gzipped

`server/production.js` includes a 30-line gzip middleware (level 4) with no
external dependency.  Measured impact on `/api/tokens?book=1&chapter=1`:

- Raw response: 120 KB
- Gzipped wire: 11 KB  (10.9× reduction)
- Compression cost: 0.3 ms

Responses under 1 KB skip compression (overhead > savings).

### DB tuning

All connections now boot with:

- `mmap_size = 256 MB` (let SQLite mmap the file — costs little RSS, saves
  on disk reads when warm)
- `cache_size = -20000` (20 MB explicit page cache)
- `temp_store = MEMORY`
- `query_only = ON` on read handles
- `journal_mode = WAL` + `synchronous = NORMAL` on `translation.db`
  (writes are fast, concurrent reads are non-blocking)

### Production hardening (`production.js`)

One self-contained file, zero new npm deps, provides:

- **Gzip** middleware (see above)
- **Cache-Control** helpers — `cache(60)` for tokens, `cache(3600)` for `/api/books`,
  `Cache-Control: public, max-age=31536000, immutable` for hashed Vite assets
- **Security headers** — strips `X-Powered-By`, sets `X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`
- **Request timing** — every response carries `X-Response-Time` for quick
  troubleshooting via `curl -I`
- **Error handler** — 4-arg middleware that logs server-side and returns a
  stripped-down JSON to the client.  `NODE_ENV=production` suppresses stack traces.
- **Graceful shutdown** — `SIGTERM` stops accepting new requests, drains
  in-flight ones (8 s deadline), closes DB handles, exits cleanly.  Prevents
  the "ECONNRESET on deploy" problem.
- **Health endpoint** — `/health` returns `{pid, uptime, rss_mb, heap_mb}`.
  Use for load-balancer probes and supervisor watchdogs.

### HTTP timeouts

- `keepAliveTimeout = 65 s` (longer than typical load-balancer idle timeout,
  shorter than infinity)
- `headersTimeout = 70 s` (must be > keepAliveTimeout per Node's contract)
- `requestTimeout = 30 s` (kills any wedged single request)

### Body size limits

`express.json({ limit: '1mb' })` on translate routes, `{ limit: '4mb' }` on the
glyph-bake admin route.  Prevents OOM via a giant POST body.

## Public deployment — one admin, everyone else read-only + local-only edits

The server can run as a single public instance where **you** keep full edit
access and **everyone else** can read everything but can't write anything to
the server — their edits (retranslating a verse, uploading a lexicon file)
are saved only in their own browser and never reach your `corpus.db` /
`translation.db` / lexicon files.

### Turning it on

```bash
READ_ONLY=1 ADMIN_KEY='a long random password' node server.js
# or, in production:
READ_ONLY=1 ADMIN_KEY='...' NODE_ENV=production node server/cluster.js
```

- **`READ_ONLY=1`** — every mutating request (`PUT`/`POST`/`DELETE`) is
  rejected with 403 *unless* it's authenticated as admin (see below). `GET`
  requests are always allowed for everyone — the whole corpus, every
  lexicon, and the reader stay fully public and fast.
- **`ADMIN_KEY`** — your password. Also doubles as the signing key for the
  admin session cookie, and (unchanged from before) as the `x-admin-key`
  header / `?key=` query param some existing `/admin` and `/api/admin`
  routes already accepted.

Nothing about this requires taking the app offline to update your own data —
you're still the one process editing `corpus.db` and the lexicon files via
the existing scripts (`render-all.mjs`, the `apply-*` scripts, etc); this
just controls who else can write through the HTTP API while it's running.

### Logging in as admin

Visit `/admin-login` (a quiet link at the bottom of `/landing`, or just
bookmark it) and enter your `ADMIN_KEY` as the password. On success the
server sets an httpOnly session cookie (`ps_admin`, 30 days) in your browser.
From then on, Translation Studio, the glyph editor, and the admin
rebuild-index endpoint all write straight through to the server from that
browser — identical to running the app locally, even though `READ_ONLY=1`
is blocking everyone else.

Logging out (from the same page) clears the cookie in your browser, but a
signed cookie is stateless — a copy of it captured before logout would still
verify until it expires. If you ever need to invalidate every outstanding
admin session immediately (e.g. you think a session leaked), **rotate
`ADMIN_KEY`** and restart the server: every previously issued cookie stops
verifying instantly, and you just log in again with the new password.

### What public visitors get

- Full read access: every book, every lexicon (`/lexicon/*.json`), the Root
  and Surface explorers, search, concordance, Parallel view — unchanged.
- **Translation Studio** works for them exactly like it does for you, except
  saves go to their browser's local storage instead of `translation.db`. A
  "📍 Local editing" badge shows in the Studio header when they're not
  logged in as admin; a per-verse "↺ Reset to published" button reverts a
  single local edit, and "↺ Pull latest" (also in the header, once they have
  any local edits) discards everything they've changed locally in one step.
- **Lexicon** has a "📤 My Lexicon" panel (top bar, non-admins only) where a
  visitor can upload a JSON file shaped like `lexicon.json` / `homographs.json`
  / `definitions.json` to patch entries for themselves — layered over your
  published lexicon, visible only in their browser.
- None of the above is visible to, or recoverable by, anyone else — it's
  plain browser storage (IndexedDB), gone if they clear site data or switch
  browsers/devices. That's the intended "only affects their machine" contract.

See `src/lib/localOverlay.js` for the storage/merge mechanism and
`server.js`'s "ADMIN AUTH" section for the server side.

### Hardening knobs (all opt-in, unrelated to READ_ONLY/ADMIN_KEY)

- `ALLOW_ORIGIN=https://your-domain` — locks CORS to one origin.
- `RATE_MAX` / `RATE_WINDOW_MS` — per-IP request cap on `/api` (default 300/min).

## Cluster mode

`server/cluster.js` is a tiny multi-process wrapper:

```bash
node cluster.js              # one worker per CPU
WORKERS=4 node cluster.js    # exactly 4
```

Why: `better-sqlite3` is synchronous, so a single Node process serves all
requests on one core.  Cluster mode forks N workers and the kernel round-robins
TCP accept between them.  SQLite handles concurrent readers natively (WAL
makes simultaneous read-while-write non-blocking).

The master watches workers and respawns crashed ones — but with a crash-loop
guard (5 rapid exits within 5 s → master exits).  `SIGTERM` to the master
gracefully stops every worker.

## Process supervisor

The server is now well-behaved for any of:

- **systemd** — `Type=notify` not needed; standard `Type=simple` works.
  `Restart=on-failure` + `KillSignal=SIGTERM`.
- **pm2** — `pm2 start cluster.js -i max --name paleo` and you get the same
  cluster as `node cluster.js` plus log management.
- **Docker** — `CMD ["node", "cluster.js"]`.  Don't forget `--init` so the
  init process forwards signals.

## Reverse proxy notes

Recommended nginx config front of this:

```nginx
upstream paleo {
    server 127.0.0.1:3000;
    keepalive 32;
}
server {
    listen 80;
    server_name paleo.example.com;

    # Compression — nginx beats node here for size/CPU on big responses.
    # If you enable this, the gzip middleware in node will detect the
    # downstream Accept-Encoding and skip; no double-compression.
    gzip on;
    gzip_types application/json text/css application/javascript;
    gzip_min_length 1024;

    # Long cache for the hashed React assets
    location /assets/ {
        proxy_pass http://paleo;
        proxy_set_header Host $host;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location / {
        proxy_pass http://paleo;
        proxy_http_version 1.1;
        proxy_set_header Connection "";          # keep-alive to upstream
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 30s;
    }

    location /health {
        access_log off;
        proxy_pass http://paleo;
    }
}
```

## Tests

Five tests guard the optimization:

```
tests/root-resolution.test.cjs           # 5 synthetic assertions
tests/surface-overrides.test.cjs         # 4 SN-override mechanism assertions
tests/index-builder-consistency.test.cjs # safety-check parity
tests/snap-test.cjs                      # lexicon UI snap fix
tests/e2e-real-data.cjs                  # 220 real tokens, real lexicons
tests/share-richtext.test.cjs            # Share's rich-text pipeline
tests/surface-tokens-parity.test.cjs     # NEW — guards the /api/tokens optimization
```

The new `surface-tokens-parity.test.cjs` runs `groupSurfaceTokens` (the fast
path) and `parseHebrewData` (the original) over 8 chapters spanning narrative,
prophecy, poetry, and torah.  It asserts that block counts match exactly, then
counts (without failing) two classes of informational diff:

- **data drift** — a surface in `surface-index.db` was parsed differently than
  the current `parseHebrewData` would parse it.  Indicates `surface-index.db`
  is stale (rebuild via `build-surface-index.js`).
- **context drift** — `parseHebrewData` uses cross-token context that the
  static surface index can't see (e.g. the `𐤀𐤋𐤄𐤉𐤌` + `𐤀𐤇𐤓𐤉𐤌` special case
  in Exodus 20:3).  Surfaced as informational so a maintainer can decide
  whether to encode that context-aware behavior at index build time.
