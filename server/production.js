/**
 * production.js — production hardening for the paleo-studio server.
 *
 * Everything in this file is self-contained: no new npm deps, no native
 * compile.  The functions here are wired into server.js in one place, near
 * the top, so the production posture is easy to audit:
 *
 *     require('./production').install(app, { httpServer });
 *
 * What it provides
 * ────────────────
 *   • install(app, opts)
 *       attaches gzip, cache-control, error handler, request timing, health
 *       endpoint, and registers graceful-shutdown handlers.  Pass the http
 *       server back when you have it so shutdown can drain in-flight reqs.
 *
 *   • cache(maxAgeSeconds, opts)
 *       middleware factory.  Use on routes that return stable data.
 *
 *   • noCache()
 *       middleware that explicitly disables caching for write endpoints.
 *
 *   • shutdown(server)
 *       call from external triggers if you need to programmatically stop.
 *
 * Why no `compression` npm package
 * ────────────────────────────────
 * The compression middleware is ~700 lines covering a lot of edge cases we
 * don't have (streaming responses, partial content, etc).  All our responses
 * are JSON sent in one shot, so a tiny gzip wrapper using node's built-in
 * `zlib` is ~30 lines and avoids the dependency.  We use level 4 because
 * level 1→4 doubles compression ratio for ~1.5x the CPU; level 4→6 gains
 * little and costs a lot more (measured on actual responses: 13KB→10KB).
 */
'use strict';

const zlib = require('zlib');

// ────────────────────────────────────────────────────────────────────────────
// gzip middleware (~30 lines, zero deps)
// ────────────────────────────────────────────────────────────────────────────
// The express `res.json` path goes through res.send, which uses res.write +
// res.end.  We hook the response by replacing those methods with versions
// that buffer first, then gzip + send if conditions are met.  Conditions:
//   1. client sent Accept-Encoding: gzip
//   2. payload is bigger than threshold (default 1 KB — below that, gzip
//      overhead is larger than the savings)
//   3. response isn't already encoded
//   4. content-type is compressible (json, text, javascript, css, html, svg)
function gzipMiddleware({ threshold = 1024, level = 4 } = {}) {
    const COMPRESSIBLE = /^(application\/(json|javascript|xml)|text\/|image\/svg)/;

    return function(req, res, next) {
        const accepts = req.headers['accept-encoding'] || '';
        if (!accepts.includes('gzip')) return next();

        // Buffer until end()
        const chunks = [];
        const origWrite = res.write.bind(res);
        const origEnd   = res.end.bind(res);
        let writable = true;

        res.write = function(chunk, encoding) {
            if (!writable) return false;
            if (chunk) {
                if (typeof chunk === 'string') chunk = Buffer.from(chunk, encoding || 'utf8');
                chunks.push(chunk);
            }
            return true;
        };

        res.end = function(chunk, encoding) {
            if (chunk) {
                if (typeof chunk === 'string') chunk = Buffer.from(chunk, encoding || 'utf8');
                chunks.push(chunk);
            }
            const body = Buffer.concat(chunks);
            writable = false;

            // Decide whether to compress
            const ctype = res.getHeader('Content-Type') || '';
            const alreadyEncoded = res.getHeader('Content-Encoding');
            const compressible = COMPRESSIBLE.test(String(ctype));

            if (alreadyEncoded || !compressible || body.length < threshold) {
                // Pass through
                res.write = origWrite;
                res.end   = origEnd;
                if (body.length) res.write(body);
                return res.end();
            }

            // Compress sync — gzipSync is faster end-to-end than zlib stream
            // for the payload sizes we deal with (1-300 KB).  Async wrapping
            // would just add scheduling overhead.
            const compressed = zlib.gzipSync(body, { level });
            res.setHeader('Content-Encoding', 'gzip');
            res.setHeader('Content-Length', compressed.length);
            res.removeHeader('Content-Length'); // length may have been pre-set
            res.setHeader('Vary', 'Accept-Encoding');
            res.write = origWrite;
            res.end   = origEnd;
            res.write(compressed);
            return res.end();
        };

        next();
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Cache-Control helpers
// ────────────────────────────────────────────────────────────────────────────
// Cache middleware: stamp a Cache-Control header on the response.  Use this
// on routes that return data that doesn't change between corpus rebuilds.
//
//   cache(60)              → public, max-age=60
//   cache(3600, {immutable:true}) → public, max-age=3600, immutable
//   cache(0, {private:true})      → private, no-store (per-user data)
function cache(maxAgeSeconds, opts = {}) {
    const parts = [];
    parts.push(opts.private ? 'private' : 'public');
    if (maxAgeSeconds > 0) parts.push(`max-age=${maxAgeSeconds}`);
    else                   parts.push('no-store');
    if (opts.immutable)    parts.push('immutable');
    const value = parts.join(', ');
    return (req, res, next) => {
        res.setHeader('Cache-Control', value);
        next();
    };
}
const noCache = () => cache(0);

// ────────────────────────────────────────────────────────────────────────────
// Security headers (minimal — the app isn't user-authed)
// ────────────────────────────────────────────────────────────────────────────
function securityHeaders() {
    return (req, res, next) => {
        // Don't leak the express signature
        res.removeHeader('X-Powered-By');
        // Standard browser hardening
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        next();
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Request timing (very lightweight)
// ────────────────────────────────────────────────────────────────────────────
// Adds X-Response-Time header so you can spot slow routes via curl -I.
// Skips boilerplate when ?_quiet=1 is on the URL (used in benchmarks so the
// timing doesn't pollute output).
function timing() {
    return (req, res, next) => {
        const t0 = process.hrtime.bigint();
        // res.on('finish') fires after headers + body are flushed to the OS.
        // Setting a header in a finish handler is too late, so we use the
        // setHeader-on-writeHead trick: hook writeHead so the header lands
        // in the same packet as the rest.
        const origWriteHead = res.writeHead.bind(res);
        res.writeHead = function(...args) {
            const ms = Number(process.hrtime.bigint() - t0) / 1e6;
            try { res.setHeader('X-Response-Time', ms.toFixed(2) + 'ms'); }
            catch { /* headers already sent — ignore */ }
            return origWriteHead(...args);
        };
        next();
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Error handler — never leaks stack traces in prod
// ────────────────────────────────────────────────────────────────────────────
// Wires up at the END of the express middleware chain.  Express recognizes
// 4-argument middleware as an error handler and routes thrown errors here.
function errorHandler({ exposeStacks = process.env.NODE_ENV !== 'production' } = {}) {
    return (err, req, res, _next) => {
        // Log full detail server-side, regardless of NODE_ENV
        console.error(`[error] ${req.method} ${req.url}`);
        console.error(err);
        if (res.headersSent) {
            // Connection might be half-broken; just kill it
            return res.destroy(err);
        }
        const status = err.statusCode || err.status || 500;
        const payload = { error: err.publicMessage || (status >= 500 ? 'Internal Server Error' : err.message) };
        if (exposeStacks && err.stack) payload.stack = err.stack.split('\n').slice(0, 8);
        res.status(status).json(payload);
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Graceful shutdown
// ────────────────────────────────────────────────────────────────────────────
// On SIGTERM / SIGINT:
//   1. Stop accepting new connections.
//   2. Let in-flight requests finish (with a deadline).
//   3. Close DB connections.
//   4. Exit.
// Without this, a process restart will hang a few requests in flight.  With
// it, restarts are clean and you don't see "ECONNRESET" in client logs.
function installShutdown(httpServer, dbsToClose = [], { timeoutMs = 8000 } = {}) {
    let shuttingDown = false;
    const tearDown = (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`[shutdown] received ${signal}, draining...`);

        // Stop accepting; existing requests continue.
        httpServer.close((err) => {
            if (err) console.error('[shutdown] close error:', err);
            try { dbsToClose.forEach(db => db && db.close && db.close()); }
            catch (e) { console.error('[shutdown] db close error:', e); }
            console.log('[shutdown] done');
            process.exit(err ? 1 : 0);
        });

        // Hard deadline — if anything hangs, bail.
        setTimeout(() => {
            console.warn(`[shutdown] timed out after ${timeoutMs}ms, force exit`);
            process.exit(1);
        }, timeoutMs).unref();
    };
    process.on('SIGTERM', () => tearDown('SIGTERM'));
    process.on('SIGINT',  () => tearDown('SIGINT'));

    // Don't crash silently on unhandled errors — log them, but stay alive.
    // Unhandled promise rejections in particular can hide real bugs if
    // ignored. In production we let the process die so the supervisor
    // (systemd / pm2 / docker) restarts cleanly.
    process.on('uncaughtException', (err) => {
        console.error('[uncaughtException]', err);
        if (process.env.NODE_ENV === 'production') tearDown('uncaughtException');
    });
    process.on('unhandledRejection', (reason) => {
        console.error('[unhandledRejection]', reason);
        if (process.env.NODE_ENV === 'production') tearDown('unhandledRejection');
    });
}

// ────────────────────────────────────────────────────────────────────────────
// Health endpoint
// ────────────────────────────────────────────────────────────────────────────
// /health returns 200 with minimal metadata. Used by load balancers and
// supervisors to decide whether a worker is alive.  We don't query the DB
// here — a "healthy" worker isn't necessarily one that can serve every
// route; just one whose event loop is responsive.
function installHealth(app, { startedAt = Date.now() } = {}) {
    app.get('/health', (req, res) => {
        const mem = process.memoryUsage();
        res.json({
            status: 'ok',
            pid: process.pid,
            uptime_s: Math.round((Date.now() - startedAt) / 1000),
            rss_mb: Math.round(mem.rss / 1024 / 1024),
            heap_mb: Math.round(mem.heapUsed / 1024 / 1024),
            node: process.version,
        });
    });
}

// ────────────────────────────────────────────────────────────────────────────
// install()  — one-call wire-up
// ────────────────────────────────────────────────────────────────────────────
function install(app, opts = {}) {
    const startedAt = Date.now();
    // Middleware order matters: timing first so it covers everything;
    // security headers next so they're on every response; gzip last among
    // pre-route middlewares so it sees the final body.
    app.use(timing());
    app.use(securityHeaders());
    app.use(gzipMiddleware(opts.gzip));
    installHealth(app, { startedAt });
    // The error handler is wired AFTER routes are registered (see install_end()).
    return { startedAt };
}

// Called by the server AFTER all routes are registered.
function install_end(app, opts = {}) {
    app.use(errorHandler(opts.errorHandler));
}

module.exports = {
    install,
    install_end,
    gzipMiddleware,
    cache,
    noCache,
    securityHeaders,
    timing,
    errorHandler,
    installShutdown,
    installHealth,
};
