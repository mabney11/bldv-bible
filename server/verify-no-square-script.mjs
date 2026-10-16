#!/usr/bin/env node
// verify-no-square-script.mjs — THE NO-SQUARE-SCRIPT GATE (CLAUDE.md rule zero; no exceptions).
// fieldy, 2026-10-16: "as long as no square script is available to read on my web app" / "the
// maqaf should stay the maqaf -- all punctuation should stay" / "no wiggle room ... gates in my
// deploy pipeline" / "there needs to be no conversion at the site level, the conversions should
// already be baked". The SITE converts nothing: every Hebrew string it serves is stored Paleo.
// This gate CHECKS that (exit 1 = stop the pipeline); `--fix` is the BAKE, run by the pipeline,
// never by the server. Square = Hebrew letters (U+05D0-05EA, ligatures, presentation forms) and
// points/accents; Hebrew PUNCTUATION (maqaf, paseq, sof pasuq, nun hafukha, geresh, gershayim)
// is not square and must survive. The ONE converter: no-square-script.cjs.
//
//   node verify-no-square-script.mjs [corpus.db] [translation.db] [surface-index.db] [--fix]
//     CODE     server.js converts nothing (no square letters, no converter) — the site serves
//              what is stored; src/ has no square string outside the typed-input converters.
//     STRONGS  strongs-hebrew-paleo.json (build-strongs-paleo.mjs) exists, covers the dictionary,
//              holds no square script.
//     LEXICON  no server/lexicon/*.json holds square script.
//     DATA     corpus.db HEB + ENG text, translation.db text/rich_text, surface-index.db chips hold
//              no square script. --fix BAKES: every corpus.db HEB row and machine ENG row, and every
//              machine translation row (status 'none', no rich_text); a verse fieldy SAVED fails
//              until he fixes it in the Studio.
//   node verify-no-square-script.mjs --url http://localhost:3000
//     LIVE     the running server's responses (the Hebrew-edition books that were stored square, a
//              Works Library doc, Strong's anatomy + lookup, HEB tokens, translate chapter,
//              prerendered pages) carry no square script.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { SQUARE_RE, toPaleoDisplay } = require('./no-square-script.cjs');
const SQUARE_G = new RegExp(SQUARE_RE.source, 'g');
const args = process.argv.slice(2);
const FIX = args.includes('--fix');
const urlArg = (() => { const i = args.indexOf('--url'); return i >= 0 ? args[i + 1] : null; })();
const pos = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--url');
const fails = [];
const fail = (m) => { fails.push(m); console.log('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);
const sample = (s) => { const m = String(s).match(SQUARE_RE); const i = m ? m.index : 0; return JSON.stringify(String(s).slice(Math.max(0, i - 30), i + 30)); };
const isComment = (line) => /^\s*(\/\/|\*|\/\*|#)/.test(line);
const codeSquareLines = (file) => fs.readFileSync(file, 'utf8').split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => SQUARE_RE.test(l) && !isComment(l));

if (!urlArg) {
    // ── CODE ──────────────────────────────────────────────────────────────────
    console.log('NO SQUARE SCRIPT — code (the site converts nothing)');
    const srvFile = path.join(HERE, 'server.js');
    const srv = fs.readFileSync(srvFile, 'utf8');
    const srvSq = codeSquareLines(srvFile);
    if (/no-square-script\.cjs/.test(srv)) fail('server.js loads the converter — conversion belongs in the bake, not the site');
    else if (srvSq.length) fail(`server.js has square script in code (a request-time conversion?) at line(s) ${srvSq.slice(0, 5).map(x => x[0]).join(', ')}`);
    else ok('server.js holds no converter and no square script');
    // src/: what the browser renders. The ONLY square strings allowed are the converters for
    // what a USER TYPES into a search box (input, never served data).
    const INPUT_CONVERTERS = new Set(['lib/sqToPaleo.js', 'lib/hebrewPaleo.js', 'lib/translit.js', 'pages/LexiconChips.jsx', 'pages/LexiconTable.jsx']);
    const srcDir = path.join(HERE, '..', 'src');
    if (fs.existsSync(srcDir)) {
        let bad = 0;
        const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const f = path.join(d, e.name);
            if (e.isDirectory()) { walk(f); continue; }
            if (!/\.(jsx?|mjs|cjs|json|css|html)$/.test(e.name)) continue;
            const rel = path.relative(srcDir, f).split(path.sep).join('/');
            if (INPUT_CONVERTERS.has(rel)) continue;
            const lines = /\.json$/.test(e.name) ? (SQUARE_RE.test(fs.readFileSync(f, 'utf8')) ? [[0, '(json)']] : []) : codeSquareLines(f);
            if (lines.length) { bad++; fail(`src/${rel}: square script at line(s) ${lines.slice(0, 5).map(x => x[0]).join(', ')} — bake it to Paleo`); }
        } };
        walk(srcDir);
        if (!bad) ok('src/ renders no square script (only the typed-input converters hold any)');
    } else console.log('  (src/ not present here — checked where the source is)');

    // ── STRONGS ───────────────────────────────────────────────────────────────
    console.log('NO SQUARE SCRIPT — Strong\'s dictionary the site serves');
    {
        const out = path.join(HERE, 'strongs-hebrew-paleo.json');
        const srcP = ['strongs-hebrew-expanded.json', 'strongs-hebrew.json'].map(f => path.join(HERE, f)).find(f => fs.existsSync(f));
        if (!fs.existsSync(out)) fail('strongs-hebrew-paleo.json missing — run: node build-strongs-paleo.mjs');
        else {
            const t = fs.readFileSync(out, 'utf8');
            const n = Object.keys(JSON.parse(t)).length, m = srcP ? Object.keys(JSON.parse(fs.readFileSync(srcP, 'utf8'))).length : n;
            if (SQUARE_RE.test(t)) fail('strongs-hebrew-paleo.json holds square script: ' + sample(t));
            else if (n !== m) fail(`strongs-hebrew-paleo.json is stale (${n} entries, dictionary has ${m}) — run: node build-strongs-paleo.mjs`);
            else ok(`strongs-hebrew-paleo.json: ${n} entries, all Paleo`);
        }
    }

    // ── LEXICON FILES ─────────────────────────────────────────────────────────
    console.log('NO SQUARE SCRIPT — lexicon files');
    {
        const dir = path.join(HERE, 'lexicon');
        let bad = 0;
        for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter(x => x.endsWith('.json')) : []) {
            const t = fs.readFileSync(path.join(dir, f), 'utf8');
            if (SQUARE_RE.test(t)) { bad++; fail(`lexicon/${f} holds square script: ${sample(t)}`); }
        }
        if (!bad) ok('every lexicon/*.json is Paleo');
    }

    // ── DATA ──────────────────────────────────────────────────────────────────
    console.log('NO SQUARE SCRIPT — data' + (FIX ? ' (--fix: BAKE to Paleo)' : ''));
    const Database = require('better-sqlite3');
    const [corpusP = path.join(HERE, 'corpus.db'), transP = path.join(HERE, 'translation.db'), surfP = path.join(HERE, 'surface-index.db')] = pos;
    const scan = (db, label, sql, cols, fixable) => {
        let bad = 0, fixed = 0, shown = 0;
        const upd = FIX && fixable ? db.prepare(`UPDATE ${fixable.table} SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE ${fixable.where}`) : null;
        const todo = [];
        for (const r of db.prepare(sql).iterate()) {
            if (!cols.some(c => typeof r[c] === 'string' && SQUARE_RE.test(r[c]))) continue;
            if (upd && fixable.isMachine(r)) { todo.push(r); continue; }
            bad++;
            if (shown++ < 8) console.log(`      ${r.ref}: ${sample(cols.map(c => r[c] || '').join(' | '))}`);
        }
        if (todo.length) {
            db.transaction(() => { for (const r of todo) { upd.run(...cols.map(c => toPaleoDisplay(r[c])), ...fixable.key(r)); fixed++; } })();
            console.log(`    ${label}: ${fixed} row(s) baked to Paleo`);
        }
        if (bad) fail(`${label}: ${bad} row(s) hold square script` + (!fixable ? ' (rebuild it)' : !FIX ? ' (bake with --fix)' : ' (verses fieldy saved — fix them in the Studio)'));
        else ok(`${label}: Paleo`);
    };
    if (fs.existsSync(corpusP)) {
        const db = new Database(corpusP, { readonly: !FIX });
        for (const corp of ['HEB', 'ENG'])
            scan(db, `corpus.db ${corp} text`, `SELECT id, coalesce(canon_id, code)||' '||chapter||':'||verse AS ref, text FROM verses WHERE corpus = '${corp}'`,
                 ['text'], { table: 'verses', where: 'id = ?', isMachine: () => true, key: r => [r.id] });
        db.close();
    } else fail(`missing ${corpusP}`);
    if (fs.existsSync(transP)) {
        const db = new Database(transP, { readonly: !FIX });
        scan(db, 'translation.db translations', `SELECT book_id, chapter, verse, book_id||':'||chapter||':'||verse AS ref, text, rich_text, status FROM translations`,
             ['text', 'rich_text'], { table: 'translations', where: 'book_id = ? AND chapter = ? AND verse = ?',
                                      isMachine: r => r.status === 'none' && !r.rich_text, key: r => [r.book_id, r.chapter, r.verse] });
        db.close();
    } else fail(`missing ${transP}`);
    if (fs.existsSync(surfP)) {
        const db = new Database(surfP, { readonly: true });
        scan(db, 'surface-index.db chips', `SELECT word_raw AS ref, word_raw, rendered_paleo, root_paleo, components FROM token_surfaces`,
             ['word_raw', 'rendered_paleo', 'root_paleo', 'components'], null);
        db.close();
    } else fail(`missing ${surfP}`);
}

// ── LIVE ──────────────────────────────────────────────────────────────────────
if (urlArg) {
    console.log(`NO SQUARE SCRIPT — live (${urlArg})`);
    const base = urlArg.replace(/\/$/, '');
    const get = async (u) => { const r = await fetch(base + u, { signal: AbortSignal.timeout(60000) }); return { status: r.status, body: await r.text() }; };
    const urls = [
        '/api/source/HEB/chapter?book=220&chapter=1',     // Antiquities — was stored square + pointed
        '/api/source/HEB/verse?book=220&chapter=1&verse=1',
        '/api/source/HEB/chapter?book=219&chapter=1',     // Jewish War
        '/api/source/HEB/chapter?book=143&chapter=1',     // 1 Meqabyan
        '/api/source/HEB/chapter?book=136&chapter=1',     // 2 Enoch
        '/api/strongs/H1004', '/api/strongs/H1035', '/api/strongs/H3478',
        '/api/strongs/lookup?he=' + encodeURIComponent('\u{10901}\u{10909}\u{10915} \u{1090B}\u{10907}\u{1090C}'),
        '/api/tokens?book=66&chapter=16&source=HEB',
        '/api/translate/chapter?book=147&chapter=2',
        '/genesis/1/1', '/parallel/revelation/16-21',
    ];
    try {
        const docs = JSON.parse((await get('/api/source/HEB/docs')).body);
        const d = Array.isArray(docs) ? docs[0] : (docs.docs || [])[0];
        const id = d && (d.doc_id || d.id || d.code);
        if (id) urls.push(`/api/source/HEB/chapter?doc=${encodeURIComponent(id)}&chapter=1`);
    } catch { /* docs list optional */ }
    for (const u of urls) {
        let r;
        try { r = await get(u); } catch (e) { fail(`${u}: ${e.message}`); continue; }
        const hits = r.body.match(SQUARE_G) || [];
        if (hits.length) fail(`${u}: ${hits.length} square character(s) — ${sample(r.body)}`);
        else ok(`${u} (${r.status})`);
    }
}

if (fails.length) { console.log(`\nNO SQUARE SCRIPT gate FAILED: ${fails.length} problem(s).`); process.exit(1); }
console.log('\nNO SQUARE SCRIPT gate passed.');
