/**
 * surface-reconstitution.test.cjs
 *
 * Regression test for "wrong glyphs render" — the failure mode the user
 * surfaced with Psalms 40:10, where the rendered word block showed
 * 𐤑𐤃𐤒𐤄𐤕𐤉 (Tzadaqahathay) but the corpus token was actually 𐤁𐤔𐤓𐤕𐤉
 * (I-have-proclaimed-tidings). Two corpus letters at the front of the
 * surface were swapped for the canonical root of the (wrongly-tagged)
 * Strongs entry H6666.
 *
 * INVARIANT under test:
 *   For every word block returned by /api/tokens, the first letter of the
 *   first non-empty-paleo component must match the first letter of one of
 *   the source corpus tokens contributing to that block.
 *
 * This is the weakest correctness check that still catches the failure
 * mode above. It allows legitimate canonical-root mutations (e.g.
 * 𐤋𐤇𐤅𐤕 → 𐤋𐤅𐤇+𐤕 where the canonical root restores an eaten consonant)
 * because those preserve the first letter — but rejects the case where
 * the bake substituted a wholly unrelated canonical root.
 *
 * The test sweeps every chapter of the corpus via the HTTP API (so it
 * exercises the exact path the user hits) and asserts the invariant
 * for every rendered word block.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const SERVER_DIR = path.join(__dirname, '..', 'server');
const BIBLE_DB   = path.join(SERVER_DIR, 'bible.db');

if (!fs.existsSync(BIBLE_DB)) {
    console.log('[surface-reconstitution] bible.db not present — skipping');
    process.exit(0);
}

const PORT = 13577;
const proc = spawn('node', [path.join(SERVER_DIR, 'server.js')], {
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
});
let serverReady = false;
proc.stdout.on('data', d => { if (String(d).includes('listening on')) serverReady = true; });
proc.stderr.on('data', d => { /* server warns about drift — that's the point */ });

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

        const books = await getJson(`${base}/api/books`);
        const chapters = [];
        for (const b of books) {
            for (let c = b.first_chapter; c <= b.last_chapter; c++) {
                chapters.push([b.book_id, b.name || `Book ${b.book_id}`, c]);
            }
        }
        console.log(`[surface-reconstitution] sweeping ${chapters.length} chapters across the corpus`);

        let totalWords = 0;
        const violations = [];

        for (let i = 0; i < chapters.length; i++) {
            const [book, bookName, ch] = chapters[i];
            let tokens;
            try { tokens = await getJson(`${base}/api/tokens?book=${book}&chapter=${ch}`); }
            catch (e) {
                console.error(`  fetch failed book=${book} ch=${ch}: ${e.message}`);
                exit = 1;
                continue;
            }
            for (const wb of tokens) {
                totalWords++;
                const sources = wb.sourceTokens || [];
                if (!sources.length || !wb.components || !wb.components.length) continue;

                // The first component with a non-empty paleo must share its
                // first letter with one of the source-token word_raws.
                const firstComp = wb.components.find(c => c && c.paleo && c.paleo.length);
                if (!firstComp) continue;
                const compFirst = [...firstComp.paleo][0];

                // Collect the set of valid first letters from contributing
                // source tokens. A merged block (e.g. prep + noun) has two
                // sources whose word_raws each contribute their first letter.
                const validFirsts = new Set();
                for (const src of sources) {
                    if (src.word_raw) validFirsts.add([...src.word_raw][0]);
                }

                if (!validFirsts.has(compFirst)) {
                    violations.push({
                        book, bookName, ch,
                        verse: wb.verse, word: wb.word,
                        strongs: wb.strongs,
                        rendered_first: compFirst,
                        rendered_paleo: firstComp.paleo,
                        source_word_raws: [...sources.map(s => s.word_raw)],
                        rendered_components: wb.components.map(c => c.paleo).join('|'),
                    });
                }
            }
            if ((i + 1) % 200 === 0) {
                process.stdout.write(`  …${i+1}/${chapters.length} chapters (violations: ${violations.length})\r`);
            }
        }
        console.log(`  …${chapters.length}/${chapters.length} chapters (violations: ${violations.length})         `);
        console.log(`  ${totalWords} word blocks checked`);

        if (violations.length > 0) {
            console.error('\nSURFACE-RECONSTITUTION VIOLATIONS:');
            for (const v of violations.slice(0, 20)) {
                console.error(`  ${v.bookName} ${v.ch}:${v.verse} word ${v.word} sn=${v.strongs}`);
                console.error(`    rendered:    ${v.rendered_components}`);
                console.error(`    source(s):   ${v.source_word_raws.join(' + ')}`);
                console.error(`    first '${v.rendered_first}' not in source firsts`);
            }
            if (violations.length > 20) console.error(`  …and ${violations.length - 20} more`);
            console.log('\n❌ SURFACE-RECONSTITUTION TEST FAILED');
            exit = 1;
        } else {
            console.log('\n✅ SURFACE-RECONSTITUTION TEST PASSED — every rendered block starts with a corpus letter');
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
