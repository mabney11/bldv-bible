'use strict';
// ── BAKE: divine names & titles of Yah → surface-index.db ────────────────────
// fieldy, 2026-09-24: "this is something that'll be baked into a database/index,
// my server doesnt need to be crunching for data that doesnt change."
//
// Runs divine-titles.js's matcher over the WHOLE corpus once and writes the
// result into surface-index.db (the same baked, per-box artifact the reader
// already serves from, pushed to prod by Rebake). The server only reads:
//   divine_hits   one row per title word: (src, book_id, code, chapter, verse,
//                 token_ordinal, title_id = gold title or '', forms_json) in the TOKENS' own numbering —
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
            verse INTEGER NOT NULL, token_ordinal INTEGER NOT NULL,
            title_id TEXT NOT NULL,          -- gold title ('' = listed but not gold: other gods)
            forms_json TEXT NOT NULL);       -- {title id: form} for every title this word belongs to
        CREATE TABLE divine_refs (
            title_id TEXT NOT NULL, src TEXT NOT NULL, book_id INTEGER, code TEXT,
            chapter INTEGER NOT NULL, verse INTEGER NOT NULL, n INTEGER NOT NULL,
            form TEXT NOT NULL DEFAULT '');   -- the written word(s) of this hit (paleo, space-joined for compounds)
        CREATE TABLE divine_titles (
            id TEXT PRIMARY KEY, ord INTEGER NOT NULL, kind TEXT NOT NULL, grp TEXT NOT NULL,
            en TEXT, sns_json TEXT NOT NULL, occurrences INTEGER NOT NULL, verses INTEGER NOT NULL,
            book_count INTEGER NOT NULL, forms_json TEXT NOT NULL, books_json TEXT NOT NULL);
        CREATE TABLE divine_meta (key TEXT PRIMARY KEY, value TEXT);
    `);
    const insHit = out.prepare(`INSERT INTO divine_hits VALUES (?,?,?,?,?,?,?,?)`);
    const insRef = out.prepare(`INSERT INTO divine_refs VALUES (?,?,?,?,?,?,?,?)`);

    const stats = new Map();   // title id -> { occ, verses:Set, forms:Map, books:Map(bk -> n) }
    const statOf = id => {
        if (!stats.has(id)) stats.set(id, { occ: 0, verses: new Set(), forms: new Map(), books: new Map() });
        return stats.get(id);
    };
    const refCounts = new Map(); // "id|src|book|code|ch|v|form" -> n
    // A hit's FORM is the word as the chips show it. BHS rows are segmented
    // (ETCBC-style: "elohay", my God, is stored as 𐤀𐤋𐤄 with prs=1cs), which read
    // as Aramaic "Alah" — so for BHS the form is the baked rendered word from
    // token_surfaces (𐤀𐤋𐤄𐤉𐤌𐤉 Alahayamay). HEB / DOC rows are already whole
    // written words. formRaws remembers which raw token spellings each form
    // covers, so the tab can highlight the right words in a loaded verse.
    let renderedOf = () => null;
    try {
        const q = out.prepare(`SELECT rendered_paleo, components FROM token_surfaces WHERE source='BHS' AND word_raw=? AND strongs=? AND pos=? AND morph=? LIMIT 1`);
        const q2 = out.prepare(`SELECT rendered_paleo, components FROM token_surfaces WHERE source='BHS' AND word_raw=? AND strongs=? LIMIT 1`);
        const memo = new Map();
        renderedOf = r => {
            const k = `${r.word_raw}|${r.strongs}|${r.pos}|${r.morph}`;
            if (!memo.has(k)) memo.set(k, q.get(r.word_raw, r.strongs, r.pos, r.morph) || q2.get(r.word_raw, r.strongs) || null);
            return memo.get(k);
        };
    } catch { /* token_surfaces missing — forms fall back to the raw token */ }
    const formRaws = new Map();  // "id|form" -> Set(raw)
    const formWords = new Map(); // "id|form" -> [[[paleo, isSuffix], ...] per word] — morpheme parts, for the label
    const SUF = css => /^(nme-|prs-|vbe-|uvf-|mod-suff)/.test(css || '');
    const partsOf = (srcTag, r) => {
        const hit = srcTag === 'BHS' ? renderedOf(r) : null;
        if (hit && hit.components) {
            try {
                const comps = JSON.parse(hit.components).filter(c => c && !c.isMark && c.paleo);
                if (comps.length) return comps.map(c => [c.paleo, SUF(c.css)]);
            } catch { /* fall through */ }
        }
        return divineTitles.splitProclitics(r.word_raw || '', r.strongs).map(p => [p, false]);
    };
    let hitRows = 0;

    const scan = (sql, srcTag, inferred) => {
        let key = null, rows = [];
        const flush = () => {
            if (!rows.length) return;
            const r0 = rows[0];
            const cfgRef = `${r0.book_id ?? r0.code}:${r0.chapter}:${r0.verse}`;
            const toks = rows.map(r => ({ ord: r.token_ordinal, sn: r.strongs || '', raw: r.word_raw || '', morph: r.morph || '', pos: r.pos || '', inferred }));
            const { hits, falseGods } = divineTitles.detectVerse(toks, cfgRef, cfg);
            const rawOf = new Map(rows.map(r => [r.token_ordinal, r.word_raw || '']));
            const rowOf = new Map(rows.map(r => [r.token_ordinal, r]));
            const shown = o => (srcTag === 'BHS' && (renderedOf(rowOf.get(o)) || {}).rendered_paleo) || rawOf.get(o);
            const formOf = (id, ords) => {
                const f = ords.map(shown).join(' ');
                const k = `${id}|${f}`;
                if (!formRaws.has(k)) formRaws.set(k, new Set());
                if (!formWords.has(k)) formWords.set(k, ords.map(o => partsOf(srcTag, rowOf.get(o))));
                for (const o of ords) formRaws.get(k).add(rawOf.get(o));
                return f;
            };
            // Per token: its gold title (a compound id beats the single it
            // contains) and, for EVERY title it belongs to, that title's form —
            // the tab highlights a word by {title: form}, never by respelling.
            const perTok = new Map();   // ord -> { gold, forms: {id: form} }
            const tok = o => perTok.get(o) || perTok.set(o, { gold: '', forms: {} }).get(o);
            const hitForms = hits.map(h => formOf(h.id, h.ords));
            hits.forEach((h, i) => {
                for (const o of h.ords) tok(o).forms[h.id] = hitForms[i];
                for (const o of h.gold) if (!tok(o).gold || h.kind === 'compound') tok(o).gold = h.id;
            });
            const fgForms = falseGods.map(f => formOf('other-gods', [f.ord]));
            falseGods.forEach((f, i) => { tok(f.ord).forms['other-gods'] = fgForms[i]; });
            for (const [o, t] of perTok) {
                insHit.run(srcTag, r0.book_id ?? null, r0.code ?? null, r0.chapter, r0.verse, o, t.gold, JSON.stringify(t.forms));
                if (t.gold) hitRows++;
            }
            if (LISTED(srcTag, r0.book_id)) {
                const bk = `${srcTag}|${r0.book_id ?? ''}|${r0.code ?? ''}`;
                const add = (id, form) => {
                    const s = statOf(id);
                    s.occ++; s.verses.add(`${bk}|${r0.chapter}|${r0.verse}`);
                    if (form) s.forms.set(form, (s.forms.get(form) || 0) + 1);
                    s.books.set(bk, (s.books.get(bk) || 0) + 1);
                    const rk = `${id}|${bk}|${r0.chapter}|${r0.verse}|${form || ''}`;
                    refCounts.set(rk, (refCounts.get(rk) || 0) + 1);
                };
                hits.forEach((h, i) => add(h.id, hitForms[i]));
                falseGods.forEach((f, i) => add('other-gods', fgForms[i]));
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
            const [id, s, b, code, c, v, form] = rk.split('|');
            insRef.run(id, s, b ? +b : null, code || null, +c, +v, n, form || '');
        }
        const insTitle = out.prepare(`INSERT INTO divine_titles VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
        const ser = (id, ord, kind, grp, en, sns) => {
            const s = statOf(id);
            const forms = [...s.forms.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60)
                .map(([paleo, n]) => ({ paleo, n, raws: [...(formRaws.get(`${id}|${paleo}`) || [])], words: formWords.get(`${id}|${paleo}`) || null }));
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
