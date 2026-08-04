// tests/source-lexicon.test.cjs
//
// Verifies the per-language lexicon endpoints (added in the multi-source
// integration turn). Boots the server on a random high port, runs a handful
// of curl-style checks against it via http.request, then exits with a
// summary. Skips gracefully if the source DBs aren't tokenized (so this test
// doesn't break the existing test suite when run on a fresh checkout).

const http  = require('http');
const path  = require('path');
const fs    = require('fs');
const { spawn } = require('child_process');

const PORT = 13581;
const BASE = `http://127.0.0.1:${PORT}`;

function get(p) {
    return new Promise((resolve, reject) => {
        http.get(`${BASE}${p}`, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                try {
                    const body = Buffer.concat(chunks).toString('utf8');
                    resolve({ status: res.statusCode, body, json: () => JSON.parse(body) });
                } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function check(label, cond, detail = '') {
    const ok = !!cond;
    console.log(`${ok ? '✓' : '✗'} ${label}${detail ? '  — ' + detail : ''}`);
    return ok;
}

async function main() {
    // Gate: do the source DBs even have tokens? If not, skip — this is the
    // honest behavior, not a failure. CI rebuilds may not run the tokenizer.
    const lxxPath = path.join(__dirname, '..', 'server', 'lxx.db');
    if (!fs.existsSync(lxxPath)) {
        console.log('⏭  source DBs not present — skipping source-lexicon tests');
        console.log('   (run: node scripts/ingest-refs.cjs && node scripts/tokenize-multilang.cjs)');
        process.exit(0);
    }

    const serverPath = path.join(__dirname, '..', 'server', 'server.js');
    const server = spawn(process.execPath, [serverPath], {
        env:   { ...process.env, PORT: String(PORT) },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.on('data', () => {});
    server.stderr.on('data', () => {});

    // Wait until server responds on /health (give it up to 10s)
    let up = false;
    for (let i = 0; i < 100; i++) {
        await new Promise(r => setTimeout(r, 100));
        try { await get('/health'); up = true; break; } catch {}
    }
    if (!up) {
        server.kill('SIGKILL');
        console.error('server failed to start');
        process.exit(1);
    }

    let passed = 0, failed = 0;
    const expect = (label, cond, detail) => { (check(label, cond, detail) ? passed++ : failed++); };

    try {
        // ── /api/sources reports tokenization status ─────────────────────────
        let r = await get('/api/sources');
        expect('sources catalog returns 200', r.status === 200);
        const sources = r.json();
        expect('sources includes BHS/LXX/GNT/GEZ', sources.length === 4 && sources.every(s => ['BHS','LXX','GNT','GEZ'].includes(s.id)));
        const lxx = sources.find(s => s.id === 'LXX');
        expect('LXX is tokenized (has_tokens=true)', lxx?.has_tokens === true);
        expect('LXX has surface_count > 1000', lxx?.surface_count > 1000, `got ${lxx?.surface_count}`);

        // ── lexicon list ─────────────────────────────────────────────────────
        r = await get('/api/source/LXX/lexicon/list?limit=10');
        expect('LXX lexicon/list returns 200', r.status === 200);
        const list = r.json();
        expect('LXX lexicon has > 10000 surfaces', list.total > 10000, `total=${list.total}`);
        expect('LXX lexicon returns 10 entries', list.surfaces.length === 10);
        expect('lexicon entry has surface + count + book_count', list.surfaces[0].surface && list.surfaces[0].count && list.surfaces[0].book_count != null);
        expect('lexicon list rows carry transliteration field', 'transliteration' in list.surfaces[0]);
        expect('lexicon list rows carry curated flag', 'curated' in list.surfaces[0]);

        // ── word detail ──────────────────────────────────────────────────────
        // Use a high-frequency Greek word to make sure detail loads.
        r = await get(`/api/source/GNT/lexicon/word?word=${encodeURIComponent('ἰησοῦς')}`);
        expect('GNT word detail (Ἰησοῦς) returns 200', r.status === 200);
        const det = r.json();
        expect('Ἰησοῦς count > 200 in GNT', det.count > 200, `count=${det.count}`);
        expect('Ἰησοῦς first sample is from a Gospel (book 40-44)', det.sample[0].book_id >= 40 && det.sample[0].book_id <= 44);
        expect('by_book breakdown is non-empty', det.by_book.length > 0);
        expect('Ἰησοῦς has transliteration "iēsous"', det.transliteration === 'iēsous', `got ${det.transliteration}`);
        expect('Ἰησοῦς has curated gloss', det.gloss && det.gloss.toLowerCase().includes('jesus'));
        expect('Ἰησοῦς has root field populated', det.root && det.root.length > 0);

        // ── verse endpoint returns per-token data ───────────────────────────
        r = await get('/api/source/LXX/verse?book=1&chapter=1&verse=1');
        expect('LXX Gen 1:1 verse returns 200', r.status === 200);
        const v11 = r.json();
        expect('LXX Gen 1:1 has tokens array', Array.isArray(v11.tokens) && v11.tokens.length > 0, `got ${v11.tokens?.length}`);
        expect('LXX Gen 1:1 tokens carry transliteration', v11.tokens.every(t => t.transliteration !== undefined));
        // Grave-accent normalization: θεὸς should pick up the gloss for θεός
        const theos = v11.tokens.find(t => t.word.startsWith('θε'));
        expect('θεὸς (grave) resolves to curated gloss via grave→acute fallback',
            theos?.gloss && theos.gloss.toLowerCase().includes('god'),
            `got gloss="${theos?.gloss}"`);

        // ── chapter endpoint returns per-verse tokens ───────────────────────
        r = await get('/api/source/LXX/chapter?book=1&chapter=1');
        const ch1 = r.json();
        expect('LXX Gen 1 chapter returns tokens per verse', ch1.verses[0].tokens?.length > 0);

        // ── verse list with book filter ──────────────────────────────────────
        r = await get(`/api/source/GNT/lexicon/verses?word=${encodeURIComponent('ἰησοῦς')}&book=40&limit=5`);
        expect('GNT verses (Matthew) returns 200', r.status === 200);
        const verses = r.json();
        expect('Matthew has > 50 verses containing Ἰησοῦς', verses.total > 50, `got ${verses.total}`);
        expect('returned verses all in Matthew', verses.verses.every(v => v.book_id === 40));

        // ── 404 on unknown source ────────────────────────────────────────────
        r = await get('/api/source/UNKNOWN/lexicon/list');
        expect('unknown source returns 404', r.status === 404);

        // ── 400 on missing word param ────────────────────────────────────────
        r = await get('/api/source/LXX/lexicon/word');
        expect('missing word param returns 400', r.status === 400);

        // ── cross-lang resolves by key ───────────────────────────────────────
        r = await get('/api/cross-lang-equivalents?word=iesous');
        const direct = r.json();
        expect('cross-lang resolves by key "iesous"',
            direct.hebrew_lemma === 'יהושע',
            `got hebrew=${direct.hebrew_lemma}`);

        // ── cross-lang resolves by greek lemma ───────────────────────────────
        r = await get(`/api/cross-lang-equivalents?word=${encodeURIComponent('Ἰησοῦς')}`);
        const byLemma = r.json();
        // Could come back as direct entry OR as matches[]; either path is valid.
        const hebHit = byLemma.hebrew_lemma || (byLemma.matches?.[0]?.hebrew_lemma);
        expect('cross-lang resolves Greek lemma to Hebrew',
            hebHit === 'יהושע', `got hebrew=${hebHit}`);

        // ── Ethiopic Ge'ez lexicon list ──────────────────────────────────────
        r = await get('/api/source/GEZ/lexicon/list?limit=5');
        expect('GEZ lexicon/list returns 200', r.status === 200);
        const gezList = r.json();
        expect('GEZ has > 10000 surfaces', gezList.total > 10000, `total=${gezList.total}`);
        // Each surface contains an Ethiopic character
        const ethRe = /[\u1200-\u137F]/;
        expect('GEZ surfaces are Ethiopic',
            gezList.surfaces.every(s => ethRe.test(s.surface)),
            'expected Ethiopic block characters in every surface');
    } finally {
        server.kill('SIGKILL');
    }

    console.log('');
    console.log(`${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
