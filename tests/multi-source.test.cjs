/**
 * multi-source.test.cjs
 *
 * Tests the LXX / GNT / Ge'ez ingestion and the source-aware API endpoints.
 * Boots the server in-process and verifies:
 *
 *   - /api/sources lists all 4 sources with availability
 *   - Each non-Hebrew source has at least one verse at its expected start
 *   - Verse navigation (next/prev) chains across chapter and book boundaries
 *   - /api/parallel-sources returns all available sources for a verse
 *   - /api/cross-lang-equivalents resolves both by key and by lemma
 *
 * Skips gracefully if the source DBs aren't present (i.e. the user hasn't
 * run scripts/ingest-refs.cjs yet).
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT       = path.join(__dirname, '..');
const SERVER_DIR = path.join(ROOT, 'server');

// Skip if no source DBs — this test only matters when refs.txt has been ingested
const lxxDb = path.join(SERVER_DIR, 'lxx.db');
const gntDb = path.join(SERVER_DIR, 'gnt.db');
const gezDb = path.join(SERVER_DIR, 'geez.db');
if (!fs.existsSync(lxxDb) || !fs.existsSync(gntDb) || !fs.existsSync(gezDb)) {
    console.log('[multi-source] source DBs not present — skipping. Run scripts/ingest-refs.cjs to populate.');
    process.exit(0);
}

const PORT = 13580;
const proc = spawn('node', [path.join(SERVER_DIR, 'server.js')], {
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
});
let serverReady = false;
proc.stdout.on('data', d => { if (String(d).includes('listening on')) serverReady = true; });
proc.stderr.on('data', () => {});

function waitForServer(timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
        const tick = async () => {
            if (Date.now() > deadline) return reject(new Error('server did not start'));
            if (serverReady) { try { await getJson(`http://127.0.0.1:${PORT}/health`); return resolve(); } catch {} }
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
                if (r.statusCode < 200 || r.statusCode >= 300) return reject(new Error(`${r.statusCode}: ${body.slice(0, 200)}`));
                try { resolve(JSON.parse(body)); } catch (e) { reject(new Error(`bad JSON: ${body.slice(0, 200)}`)); }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => req.destroy(new Error('timeout')));
    });
}

const checks = [];
function check(name, ok, info) {
    checks.push({ name, ok, info });
    console.log(`  ${ok ? '✓' : '❌'} ${name}${info ? ` — ${info}` : ''}`);
}

(async () => {
    let exit = 0;
    try {
        await waitForServer();
        const base = `http://127.0.0.1:${PORT}`;

        // 1. Source catalog
        const sources = await getJson(`${base}/api/sources`);
        check('source catalog has 4 entries', sources.length === 4, `got ${sources.length}`);
        for (const id of ['BHS', 'LXX', 'GNT', 'GEZ']) {
            const s = sources.find(x => x.id === id);
            check(`source catalog includes ${id}`, !!s);
            if (id !== 'BHS' && s) {
                check(`${id} is available`, s.available === true);
                check(`${id} has nonzero verses`, s.verse_count > 0, `${s.verse_count}`);
            }
        }

        // 2. LXX Genesis 1:1 — "ἐν ἀρχῇ ἐποίησεν…"
        const lxxGen11 = await getJson(`${base}/api/source/LXX/verse?book=1&chapter=1&verse=1`);
        check('LXX Gen 1:1 has Greek text', /ἐν ἀρχῇ/.test(lxxGen11.text), lxxGen11.text?.slice(0, 40));
        check('LXX Gen 1:1 has next pointer', lxxGen11.next?.verse === 2);
        check('LXX Gen 1:1 has no prev pointer (corpus start)',
            !lxxGen11.prev || (lxxGen11.prev.book_id <= 1 && lxxGen11.prev.chapter <= 1 && lxxGen11.prev.verse === 0));

        // 3. GNT Matthew 1:1 — "Βίβλος γενέσεως…"
        const gntMat11 = await getJson(`${base}/api/source/GNT/verse?book=40&chapter=1&verse=1`);
        // U+03AF (ί) and U+1F77 (ί) are different codepoints in Greek
        // Extended; substring-match on a base-letter slice avoids the issue.
        check('GNT Mt 1:1 has Greek text', /Β.{0,2}βλος.*γεν/.test(gntMat11.text), gntMat11.text?.slice(0, 40));
        check('GNT Mt 1:1 has next pointer', gntMat11.next?.verse === 2);

        // 4. Ge'ez Genesis 1:1 — should have Ethiopic chars and doc_id metadata
        const gezGen11 = await getJson(`${base}/api/source/GEZ/verse?book=1&chapter=1&verse=1`);
        check('Ge\'ez Gen 1:1 has Ethiopic text',
            /[\u1200-\u137F]/.test(gezGen11.text), gezGen11.text?.slice(0, 40));
        check('Ge\'ez Gen 1:1 carries doc_id', !!gezGen11.doc_id);
        check('Ge\'ez Gen 1:1 has next pointer', gezGen11.next?.verse === 2);

        // 5. Chapter-boundary navigation: last verse of LXX Gen 1 → Gen 2:1
        const lxxGen1 = await getJson(`${base}/api/source/LXX/chapter?book=1&chapter=1`);
        const lastVerse = lxxGen1.verses[lxxGen1.verses.length - 1].verse;
        const lxxGen1Last = await getJson(`${base}/api/source/LXX/verse?book=1&chapter=1&verse=${lastVerse}`);
        check('next from LXX Gen 1 last verse rolls to Gen 2:1',
            lxxGen1Last.next?.book_id === 1 && lxxGen1Last.next?.chapter === 2 && lxxGen1Last.next?.verse === 1);

        // 6. Parallel sources: Gen 1:1 should have BHS, LXX, GEZ (but not GNT)
        const par = await getJson(`${base}/api/parallel-sources?book=1&chapter=1&verse=1`);
        check('Parallel Gen 1:1 has BHS', par.sources.BHS?.available === true);
        check('Parallel Gen 1:1 has LXX', par.sources.LXX?.available === true);
        check('Parallel Gen 1:1 has GEZ', par.sources.GEZ?.available === true);
        check('Parallel Gen 1:1 has GNT = false (NT starts at Matthew)',
            par.sources.GNT?.available === false);

        // 7. Cross-lang equivalents
        const equivByKey = await getJson(`${base}/api/cross-lang-equivalents?word=iesous`);
        check('cross-lang lookup by key "iesous" returns canonical_eng',
            equivByKey.canonical_eng === 'Yahawashai');
        const equivByLemma = await getJson(`${base}/api/cross-lang-equivalents?word=${encodeURIComponent('Ἰησοῦς')}`);
        check('cross-lang lookup by Greek lemma "Ἰησοῦς" finds the entry',
            Array.isArray(equivByLemma.matches) && equivByLemma.matches.length > 0);

        // 8. /api/source/LXX/books returns book counts
        const lxxBooks = await getJson(`${base}/api/source/LXX/books`);
        check('LXX has 56 books with verse counts', lxxBooks.length === 56, `got ${lxxBooks.length}`);
        check('LXX book 1 (Genesis) has chapters and verses set',
            lxxBooks[0].chapters > 0 && lxxBooks[0].verses > 0);

        const failures = checks.filter(c => !c.ok);
        if (failures.length === 0) {
            console.log(`\n✅ ALL ${checks.length} MULTI-SOURCE CHECKS PASSED`);
        } else {
            console.log(`\n❌ ${failures.length}/${checks.length} CHECKS FAILED`);
            exit = 1;
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
