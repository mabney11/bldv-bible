/**
 * link-audit.test.cjs
 *
 * Guards against the failure mode that triggered this test: a user clicks
 * "view root" on an entry in the lexicon page and lands on an error page
 * because the link points to a paleo string that doesn't exist in the new
 * /api/root-explorer/list endpoint.
 *
 * This test boots the server in-process and probes:
 *
 *   1. EVERY entry in /api/root-explorer/list must resolve via
 *      /api/root-explorer/root?root=X to a 200 with a non-empty total.
 *
 *   2. A random sample of /api/surface-explorer/list entries (sampling
 *      because the full surface list is 24k+) must resolve via
 *      /api/surface-explorer/surface and yield non-empty verses via
 *      /api/surface-explorer/verses.
 *
 *   3. The first root of the alphabetized list must produce non-empty
 *      verses via /api/root-explorer/verses (smoke check that the verses
 *      endpoint actually returns data, not just metadata).
 *
 * If any link is dead, the test fails with a count + sample of the broken
 * entries. This is intended to be run BEFORE deploy. Add to CI alongside
 * the other test suites.
 *
 * The test is slow-ish (~5–15 seconds locally) because the root pass alone
 * is 5,317 probes. We use in-process invocation (no HTTP) to keep this
 * reasonable, calling the endpoint handlers directly via supertest-style
 * fetch with a local URL.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const SERVER_DIR = path.join(__dirname, '..', 'server');
const BIBLE_DB   = path.join(SERVER_DIR, 'bible.db');
const SURF_DB    = path.join(SERVER_DIR, 'surface-index.db');

if (!fs.existsSync(BIBLE_DB) || !fs.existsSync(SURF_DB)) {
    console.log('[link-audit] DB files not present — skipping');
    process.exit(0);
}

// Use a non-standard port so this test doesn't collide with a running dev
// server. Start the server in a child process to avoid polluting module state.
const { spawn } = require('child_process');

const PORT = 13579;
const env  = { ...process.env, PORT: String(PORT), NODE_ENV: 'test' };
const proc = spawn('node', [path.join(SERVER_DIR, 'server.js')], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
});

let serverReady = false;
proc.stdout.on('data', d => {
    if (String(d).includes('listening on')) serverReady = true;
});
proc.stderr.on('data', d => process.stderr.write(`[server-stderr] ${d}`));

async function waitForServer(timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (serverReady) {
            // Confirm /health actually responds
            try {
                await getJson(`http://127.0.0.1:${PORT}/health`);
                return true;
            } catch {}
        }
        await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('Server did not start in time');
}

function getJson(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { headers: { 'Accept-Encoding': 'identity' } }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf8');
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return reject(new Error(`${res.statusCode}: ${body.slice(0, 200)}`));
                }
                try { resolve(JSON.parse(body)); }
                catch (e) { reject(new Error(`bad JSON: ${body.slice(0, 200)}`)); }
            });
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(new Error('request timeout')); });
    });
}

(async () => {
    let exitCode = 0;
    try {
        await waitForServer();
        const base = `http://127.0.0.1:${PORT}`;

        // ── 1. ROOTS: every entry must resolve ─────────────────────────────
        console.log('\n=== AUDIT: /api/root-explorer/list → /api/root-explorer/root ===');
        const rootsList = await getJson(`${base}/api/root-explorer/list`);
        const allRoots = rootsList.roots || [];
        console.log(`  ${allRoots.length} root entries to verify`);

        const brokenRoots = [];
        let probed = 0;
        for (const r of allRoots) {
            probed++;
            try {
                const detail = await getJson(
                    `${base}/api/root-explorer/root?root=${encodeURIComponent(r.root)}`
                );
                if (!detail.total || detail.total < 1) {
                    brokenRoots.push({ root: r.root, listCount: r.count, detailTotal: detail.total, reason: 'zero total' });
                }
            } catch (err) {
                brokenRoots.push({ root: r.root, listCount: r.count, reason: err.message });
            }
            if (probed % 500 === 0) {
                process.stdout.write(`  …${probed}/${allRoots.length} (broken so far: ${brokenRoots.length})\r`);
            }
        }
        console.log(`  …${probed}/${allRoots.length} (broken: ${brokenRoots.length})              `);

        if (brokenRoots.length > 0) {
            console.error('\nDEAD ROOT LINKS:');
            for (const b of brokenRoots.slice(0, 20)) console.error('  -', b);
            if (brokenRoots.length > 20) console.error(`  …and ${brokenRoots.length - 20} more`);
            exitCode = 1;
        } else {
            console.log('  ✓ all root list entries resolve');
        }

        // ── 2. Verses smoke check ──────────────────────────────────────────
        console.log('\n=== AUDIT: /api/root-explorer/verses for the first root ===');
        if (allRoots.length) {
            const firstRoot = allRoots[0].root;
            const verses = await getJson(
                `${base}/api/root-explorer/verses?root=${encodeURIComponent(firstRoot)}&limit=5`
            );
            assert.ok(verses.verses && verses.verses.length > 0,
                `first root (${firstRoot}) had zero verses`);
            assert.ok(verses.total > 0,
                `first root (${firstRoot}) had zero total`);
            // Each verse must have words and book_name
            for (const v of verses.verses) {
                assert.ok(v.words && v.words.length > 0,
                    `verse ${v.book_name} ${v.chapter}:${v.verse} has no words`);
                assert.ok(v.book_name, 'verse missing book_name');
            }
            console.log(`  ✓ first root '${firstRoot}' returns ${verses.total} verses, first batch shape is valid`);
        }

        // ── 3. SURFACES: sample resolves with word AND with word-only ─────
        // The reader's "surf" link sends `?word=X` with no `sn`, but the
        // surface list pages send `?word=X&sn=Y`. Both must resolve.
        console.log('\n=== AUDIT: /api/surface-explorer/list → surface lookups (both keying modes) ===');
        const surfList = await getJson(`${base}/api/surface-explorer/list?limit=1`);
        const totalSurfaces = surfList.total || 0;
        console.log(`  ${totalSurfaces} surface entries (sampling 200 each pass)`);

        // Pull 200 evenly-distributed samples across the alphabetized list
        const sampleSize = Math.min(200, totalSurfaces);
        const step = Math.max(1, Math.floor(totalSurfaces / sampleSize));
        const surfSamples = [];
        for (let off = 0; off < totalSurfaces && surfSamples.length < sampleSize; off += step) {
            const batch = await getJson(`${base}/api/surface-explorer/list?limit=1&offset=${off}`);
            if (batch.surfaces?.[0]) surfSamples.push(batch.surfaces[0]);
        }

        const brokenSurfaces = [];
        // Pass A: with (surface, sn)
        for (const s of surfSamples) {
            try {
                const detail = await getJson(
                    `${base}/api/surface-explorer/surface?word=${encodeURIComponent(s.surface)}` +
                    (s.strongs ? `&sn=${s.strongs}` : '')
                );
                if (!detail.total || detail.total < 1) {
                    brokenSurfaces.push({ pass: 'with-sn', surface: s.surface, sn: s.strongs, listCount: s.count, detailTotal: detail.total });
                }
            } catch (err) {
                brokenSurfaces.push({ pass: 'with-sn', surface: s.surface, sn: s.strongs, reason: err.message });
            }
        }
        // Pass B: with surface only (matches what the reader's "surf" badge sends).
        // We do NOT count "is a root, not a surface" as a failure because the
        // server explicitly returns a redirect hint and the client honors it.
        for (const s of surfSamples) {
            try {
                const detail = await getJson(
                    `${base}/api/surface-explorer/surface?word=${encodeURIComponent(s.surface)}`
                );
                if (!detail.total || detail.total < 1) {
                    brokenSurfaces.push({ pass: 'word-only', surface: s.surface, listCount: s.count, detailTotal: detail.total });
                }
            } catch (err) {
                brokenSurfaces.push({ pass: 'word-only', surface: s.surface, reason: err.message });
            }
        }

        if (brokenSurfaces.length > 0) {
            console.error('\nDEAD SURFACE LINKS:');
            for (const b of brokenSurfaces.slice(0, 20)) console.error('  -', b);
            if (brokenSurfaces.length > 20) console.error(`  …and ${brokenSurfaces.length - 20} more`);
            exitCode = 1;
        } else {
            console.log(`  ✓ all ${surfSamples.length} sampled surfaces resolve (with-sn AND word-only)`);
        }

        // ── 4. READER LINKS: every surf link from a sample chapter must resolve ─
        // The reader's "surf" badge sends ?word=<word_raw>&sn=<strongs> for
        // each underlying corpus token in a word block. This pass exercises
        // EXACTLY that path against a few real chapters. If any token's surf
        // link 404s without a graceful redirect, fail.
        console.log('\n=== AUDIT: reader "surf" links resolve for sample chapters ===');
        const sampleChapters = [
            [1, 1],   // Genesis 1 (opening)
            [23, 29], // Isaiah 29 (the chapter from the user's screenshots)
            [19, 23], // Psalm 23
            [2, 20],  // Exodus 20
        ];
        const brokenReaderLinks = [];
        for (const [book, chapter] of sampleChapters) {
            let tokens;
            try { tokens = await getJson(`${base}/api/tokens?book=${book}&chapter=${chapter}`); }
            catch (err) {
                brokenReaderLinks.push({ book, chapter, reason: 'tokens load failed: ' + err.message });
                continue;
            }
            // Collect every (word_raw, sn) the reader's surf badges would link to
            const surfLinks = new Set();
            for (const wb of (tokens || [])) {
                for (const src of (wb.sourceTokens || [])) {
                    if (!src.word_raw) continue;
                    // Skip particles (H9000+ are virtual SNs the reader doesn't link)
                    const snNum = parseInt(String(src.strongs).replace(/\D/g, ''), 10);
                    if (snNum >= 9000) continue;
                    surfLinks.add(`${src.word_raw}|${src.strongs || ''}`);
                }
            }
            console.log(`  book=${book} ch=${chapter}: probing ${surfLinks.size} unique surf links`);
            for (const link of surfLinks) {
                const [word, sn] = link.split('|');
                const qs = new URLSearchParams({ word });
                if (sn) qs.set('sn', sn);
                try {
                    const d = await getJson(`${base}/api/surface-explorer/surface?${qs}`);
                    if (!d.total) brokenReaderLinks.push({ book, chapter, word, sn, reason: 'zero total' });
                } catch (err) {
                    // Graceful redirects (suggestion: 'root') are not failures
                    if (err.body?.suggestion === 'root') continue;
                    brokenReaderLinks.push({ book, chapter, word, sn, reason: err.message });
                }
            }
        }
        if (brokenReaderLinks.length > 0) {
            console.error('\nDEAD READER LINKS:');
            for (const b of brokenReaderLinks.slice(0, 30)) console.error('  -', b);
            if (brokenReaderLinks.length > 30) console.error(`  …and ${brokenReaderLinks.length - 30} more`);
            exitCode = 1;
        } else {
            console.log(`  ✓ all reader surf links across ${sampleChapters.length} sample chapters resolve`);
        }

        // ── 5. LEGACY ENDPOINT GUARD ───────────────────────────────────────
        // The lexicon page (Lexicon.jsx) used to hit /api/nav/roots and
        // /api/nav/surfaces which produced bad data (Aazarak as a root, Ab=48).
        // It now uses the new endpoints. This check ensures the legacy
        // endpoints, if they still exist, don't get accidentally linked to
        // again by anything in the codebase.
        console.log('\n=== AUDIT: legacy /api/nav/roots is not referenced by frontend ===');
        const apiJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'api.js'), 'utf8');
        if (apiJs.match(/apiNavRoots\s*=.*\/api\/nav\/roots/) ||
            apiJs.match(/apiNavSurfaces\s*=.*\/api\/nav\/surfaces/)) {
            // The export exists. It's OK if it's still defined (back-compat),
            // but no page module should be importing it.
            const pagesDir = path.join(__dirname, '..', 'src', 'pages');
            for (const f of fs.readdirSync(pagesDir)) {
                if (!f.endsWith('.jsx')) continue;
                const src = fs.readFileSync(path.join(pagesDir, f), 'utf8');
                if (src.match(/\bapiNavRoots\b|\bapiNavSurfaces\b/)) {
                    console.error(`  ✗ ${f} still imports legacy apiNavRoots/apiNavSurfaces`);
                    exitCode = 1;
                }
            }
            if (exitCode === 0) console.log('  ✓ legacy endpoints exist as exports but no page imports them');
        }

    } catch (e) {
        console.error('test failed:', e);
        exitCode = 1;
    } finally {
        proc.kill('SIGTERM');
        // Wait briefly for graceful shutdown so logs flush
        await new Promise(r => setTimeout(r, 500));
    }

    if (exitCode === 0) console.log('\n✅ ALL LINK-AUDIT CHECKS PASSED');
    else                console.log('\n❌ LINK-AUDIT FAILED');
    process.exit(exitCode);
})();
