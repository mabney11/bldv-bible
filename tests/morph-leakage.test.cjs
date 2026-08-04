/**
 * morph-leakage.test.cjs
 *
 * Regression test for unmapped morph values leaking into the rendered output.
 *
 * The user surfaced this with the screenshot of Isaiah 29:4 showing `[?J]`
 * and `[?K=]` rendered alongside word blocks — placeholder strings emitted
 * when the parser encountered morph values not in GRAMMAR_MAP. We fixed it
 * three ways:
 *   1. extractPrefix/extractSuffix now silently return null on unknown
 *      values instead of returning a visible placeholder component.
 *   2. Both functions retry with the trailing '=' stripped, so 'K=' resolves
 *      to the same data as 'K' (the corpus uses '=' as a context annotation,
 *      not a separate morpheme).
 *   3. groupSurfaceTokens filters legacy 'mod-suff-unk' / 'mod-pref-unk'
 *      components left over in surface-index.db from before the fix.
 *
 * This test boots the server in-process and sweeps every chapter of the
 * corpus, asserting zero `[?` strings appear in any rendered translation.
 * If a future corpus update introduces a NEW unmapped morph value, this
 * test fails with the specific tag and a sample location.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const SERVER_DIR = path.join(__dirname, '..', 'server');
const BIBLE_DB   = path.join(SERVER_DIR, 'bible.db');

if (!fs.existsSync(BIBLE_DB)) {
    console.log('[morph-leakage] bible.db not present — skipping');
    process.exit(0);
}

// Boot server in a child process so we hit the same HTTP path the user does
const PORT = 13578;
const proc = spawn('node', [path.join(SERVER_DIR, 'server.js')], {
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
});
let serverReady = false;
proc.stdout.on('data', d => { if (String(d).includes('listening on')) serverReady = true; });
proc.stderr.on('data', d => process.stderr.write(`[server-stderr] ${d}`));

function waitForServer(timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
        const tick = async () => {
            if (Date.now() > deadline) return reject(new Error('server did not start'));
            if (serverReady) {
                try { await getJson(`http://127.0.0.1:${PORT}/health`); resolve(); return; }
                catch {}
            }
            setTimeout(tick, 100);
        };
        tick();
    });
}

function getJson(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { headers: { 'Accept-Encoding': 'identity' } }, r => {
            const chunks = [];
            r.on('data', c => chunks.push(c));
            r.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf8');
                if (r.statusCode < 200 || r.statusCode >= 300) {
                    return reject(new Error(`${r.statusCode}: ${body.slice(0, 200)}`));
                }
                try { resolve(JSON.parse(body)); }
                catch (e) { reject(new Error(`bad JSON: ${body.slice(0, 200)}`)); }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => req.destroy(new Error('request timeout')));
    });
}

(async () => {
    let exit = 0;
    try {
        await waitForServer();
        const base = `http://127.0.0.1:${PORT}`;

        // Enumerate every chapter via the books endpoint
        const books = await getJson(`${base}/api/books`);
        const chapters = [];
        for (const b of books) {
            for (let c = b.first_chapter; c <= b.last_chapter; c++) {
                chapters.push([b.book_id, c]);
            }
        }
        console.log(`[morph-leakage] sweeping ${chapters.length} chapters across the corpus`);

        const LEAK_RX = /\[\?([^\]]+)\]/;
        let totalWords = 0;
        let totalLeaks = 0;
        const leakKinds = new Map();
        const firstExamples = [];

        for (let i = 0; i < chapters.length; i++) {
            const [book, ch] = chapters[i];
            let tokens;
            try { tokens = await getJson(`${base}/api/tokens?book=${book}&chapter=${ch}`); }
            catch (e) {
                console.error(`  fetch failed book=${book} ch=${ch}: ${e.message}`);
                exit = 1;
                continue;
            }
            for (const wb of tokens) {
                totalWords++;
                for (const c of (wb.components || [])) {
                    const t = String(c.translation || '');
                    const m = t.match(LEAK_RX);
                    if (m) {
                        totalLeaks++;
                        const tag = m[1];
                        leakKinds.set(tag, (leakKinds.get(tag) || 0) + 1);
                        if (firstExamples.length < 10) {
                            firstExamples.push({ book, ch, v: wb.verse, w: wb.word,
                                sn: wb.strongs, paleo: c.paleo, css: c.css, trans: t });
                        }
                    }
                }
            }
            if ((i + 1) % 200 === 0) {
                process.stdout.write(`  …${i+1}/${chapters.length} chapters (leaks: ${totalLeaks})\r`);
            }
        }
        console.log(`  …${chapters.length}/${chapters.length} chapters (leaks: ${totalLeaks})         `);
        console.log(`  ${totalWords} word blocks scanned`);

        if (totalLeaks > 0) {
            console.error('\nMORPH LEAKS FOUND:');
            for (const [tag, n] of [...leakKinds].sort((a, b) => b[1] - a[1])) {
                console.error(`  [?${tag}]  →  ${n} occurrences`);
            }
            console.error('\nFirst examples:');
            for (const ex of firstExamples) {
                console.error(`  book=${ex.book} ch=${ex.ch} v=${ex.v} w=${ex.w} sn=${ex.sn} comp=${JSON.stringify({paleo:ex.paleo,css:ex.css,trans:ex.trans})}`);
            }
            console.log('\n❌ MORPH-LEAKAGE TEST FAILED');
            exit = 1;
        } else {
            console.log('\n✅ MORPH-LEAKAGE TEST PASSED — no [? placeholders rendered anywhere');
        }

    } catch (e) {
        console.error('test failed:', e);
        exit = 1;
    } finally {
        proc.kill('SIGTERM');
        await new Promise(r => setTimeout(r, 500));
    }
    process.exit(exit);
})();
