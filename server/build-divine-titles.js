'use strict';
// ── BAKE: divine names & titles of Yah → surface-index.db ────────────────────
// fieldy, 2026-09-24: "this is something that'll be baked into a database/index,
// my server doesnt need to be crunching for data that doesnt change."
//
// Runs divine-titles.js's matcher over the WHOLE corpus once and writes the
// result into surface-index.db (the same baked, per-box artifact the reader
// already serves from, pushed to prod by Rebake). The server only reads:
//   divine_hits   one row per GOLD word:  (src, book_id, code, chapter, verse,
//                 token_ordinal, title_id) in the TOKENS' own numbering —
//                 /api/tokens looks up its chapter here to stamp comp.divine.
//   divine_refs   one row per (title, verse) with its count — the tab's lists.
//   divine_titles one row per title: counts, top written forms, per-book counts.
//   divine_meta   when / from what config it was baked.
// src: 'BHS' (tokens_bhs, OT, authoritative tags), 'HEB' (tokens_nt, every book
// incl. the HEB edition of the OT — inferred tags), 'DOC' (tokens_nt_docs).
// The tab lists BHS for the OT and HEB for canon > 39 (see LISTED below).
//
// Run:  node build-divine-titles.js            (re-bake just these tables — seconds)
// Also runs automatically at the end of build-surface-index.js, and rebake.sh
// re-bakes when lexicon/divine-titles.json or divine-titles.js is newer than the index.
const path = require('path');
const Database = require('better-sqlite3');
const divineTitles = require('./divine-titles');

const LISTED = (src, bookId) => src === 'DOC' || (src === 'BHS') || (src === 'HEB' && bookId > 39);

function bake({ corpusPath = path.join(__dirname, 'corpus.db'), outPath = path.join(__dirname, 'surface-index.db'), log = console.log } = {}) {
    const t0 = Date.now();
    const cfg = divineTitles.loadConfig();
    const src = new Database(corpusPath, { readonly: true, fileMustExist: true });
    const out = new Database(outPath, { fileMustExist: true });
    if (process.platform !== 'win32') out.pragma('locking_mode = EXCLUSIVE'); // device-bridge workaround, as build-surface-index.js

    out.exec(`
        DROP TABLE IF EXISTS divine_hits;
        DROP TABLE IF EXISTS divine_refs;
        DROP TABLE IF EXISTS divine_titles;
        DROP TABLE IF EXISTS divine_meta;
        CREATE TABLE divine_hits (
            src TEXT NOT NULL, book_id INTEGER, code TEXT, chapter INTEGER NOT NULL,
            verse INTEGER NOT NULL, token_ordinal INTEGER NOT NULL, title_id TEXT NOT NULL);
        CREATE TABLE divine_refs (
            title_id TEXT NOT NULL, src TEXT NOT NULL, book_id INTEGER, code TEXT,
            chapter INTEGER NOT NULL, verse INTEGER NOT NULL, n INTEGER NOT NULL);
        CREATE TABLE divine_titles (
            id TEXT PRIMARY KEY, ord INTEGER NOT NULL, kind TEXT NOT NULL, grp TEXT NOT NULL,
            en TEXT, sns_json TEXT NOT NULL, occurrences INTEGER NOT NULL, verses INTEGER NOT NULL,
            book_count INTEGER NOT NULL, forms_json TEXT NOT NULL, books_json TEXT NOT NULL);
        CREATE TABLE divine_meta (key TEXT PRIMARY KEY, value TEXT);
    `);
    const insHit = out.prepare(`INSERT INTO divine_hits VALUES (?,?,?,?,?,?,?)`);
    const insRef = out.prepare(`INSERT INTO divine_refs VALUES (?,?,?,?,?,?,?)`);

    const stats = new Map();   // title id -> { occ, verses:Set, forms:Map, books:Map(bk -> n) }
    const statOf = id => {
        if (!stats.has(id)) stats.set(id, { occ: 0, verses: new Set(), forms: new Map(), books: new Map() });
        return stats.get(id);
    };
    const refCounts = new Map(); // "id|src|book|code|ch|v" -> n
    let hitRows = 0;

    const scan = (sql, srcTag, inferred) => {
        let key = null, rows = [];
        const flush = () => {
            if (!rows.length) return;
            const r0 = rows[0];
            const cfgRef = `${r0.book_id ?? r0.code}:${r0.chapter}:${r0.verse}`;
            const toks = rows.map(r => ({ ord: r.token_ordinal, sn: r.strongs || '', raw: r.word_raw || '', morph: r.morph || '', pos: r.pos || '', inferred }));
            const { hits, falseGods } = divineTitles.detectVerse(toks, cfgRef, cfg);
            // Gold marks — a compound id beats the single it contains.
            const gold = new Map();
            for (const h of hits) for (const o of h.gold) if (!gold.has(o) || h.kind === 'compound') gold.set(o, h.id);
            for (const [o, id] of gold) { insHit.run(srcTag, r0.book_id ?? null, r0.code ?? null, r0.chapter, r0.verse, o, id); hitRows++; }
            if (LISTED(srcTag, r0.book_id)) {
                const rawOf = new Map(rows.map(r => [r.token_ordinal, r.word_raw || '']));
                const bk = `${srcTag}|${r0.book_id ?? ''}|${r0.code ?? ''}`;
                const add = (id, form) => {
                    const s = statOf(id);
                    s.occ++; s.verses.add(`${bk}|${r0.chapter}|${r0.verse}`);
                    if (form) s.forms.set(form, (s.forms.get(form) || 0) + 1);
                    s.books.set(bk, (s.books.get(bk) || 0) + 1);
                    const rk = `${id}|${bk}|${r0.chapter}|${r0.verse}`;
                    refCounts.set(rk, (refCounts.get(rk) || 0) + 1);
                };
                for (const h of hits) add(h.id, h.ords.map(o => rawOf.get(o)).join(' '));
                for (const f of falseGods) add('other-gods', rawOf.get(f.ord));
            }
            rows = [];
        };
        for (const r of src.prepare(sql).iterate()) {
            const k = `${r.book_id ?? r.code}|${r.chapter}|${r.verse}`;
            if (k !== key) { flush(); key = k; }
            rows.push(r);
        }
        flush();
    };
    const has = t => !!src.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(t);
    const COLS = 'chapter, verse, token_ordinal, word_raw, pos, morph, strongs';

    out.transaction(() => {
        scan(`SELECT book_id, ${COLS} FROM tokens_bhs ORDER BY book_id, chapter, verse, token_ordinal`, 'BHS', false);
        if (has('tokens_nt'))      scan(`SELECT book_id, ${COLS} FROM tokens_nt ORDER BY book_id, chapter, verse, token_ordinal`, 'HEB', true);
        if (has('tokens_nt_docs')) scan(`SELECT code, ${COLS} FROM tokens_nt_docs ORDER BY code, chapter, verse, token_ordinal`, 'DOC', true);

        for (const [rk, n] of refCounts) {
            const [id, s, b, code, c, v] = rk.split('|');
            insRef.run(id, s, b ? +b : null, code || null, +c, +v, n);
        }
        const insTitle = out.prepare(`INSERT INTO divine_titles VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
        const ser = (id, ord, kind, grp, en, sns) => {
            const s = statOf(id);
            const forms = [...s.forms.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([paleo, n]) => ({ paleo, n }));
            const books = [...s.books.entries()].map(([bk, n]) => { const [src, b, code] = bk.split('|'); return { src, book_id: b ? +b : null, code: code || null, n }; });
            insTitle.run(id, ord, kind, grp, en || '', JSON.stringify(sns), s.occ, s.verses.size, s.books.size, JSON.stringify(forms), JSON.stringify(books));
        };
        let ord = 0;
        for (const t of cfg.raw.singles || [])   ser(t.id, ord++, 'single', t.group || 'title', t.en, t.sns || []);
        for (const c of cfg.raw.compounds || []) ser(c.id, ord++, 'compound', 'compound', c.en, (c.seq || []).map(m => m));
        ser('other-gods', ord++, 'other', 'other', 'the same words naming other gods — not gold', []);
        out.prepare(`INSERT INTO divine_meta VALUES ('built_at', ?)`).run(new Date().toISOString());
        out.prepare(`INSERT INTO divine_meta VALUES ('config_mtime', ?)`).run(String(divineTitles.configMtime()));
    })();
    out.exec(`
        CREATE INDEX divine_hits_book ON divine_hits(src, book_id, chapter);
        CREATE INDEX divine_hits_doc  ON divine_hits(src, code, chapter);
        CREATE INDEX divine_refs_title ON divine_refs(title_id);
    `);
    out.close(); src.close();
    log(`✓ divine titles baked: ${stats.size} titles, ${refCounts.size.toLocaleString()} title-verses, ${hitRows.toLocaleString()} gold words (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

module.exports = { bake };
if (require.main === module) {
    const args = process.argv.slice(2);
    const val = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
    bake({ corpusPath: val('--db') || undefined, outPath: val('--out') || undefined });
}
