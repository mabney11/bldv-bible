#!/usr/bin/env node
/**
 * inventory.js — corpus.db inventory for the English-baseline feature.
 *
 * Reads corpus.db READ-ONLY and writes corpus-inventory.json (+ a printed
 * summary). Nothing is modified. Hand me the JSON and I can plan exactly which
 * books need English fetched, how books are keyed across corpora (book_id vs
 * canon_id vs code), and where versification diverges.
 *
 * Run from the server/ directory (where corpus.db lives):
 *     node inventory.js
 * or point it explicitly:
 *     node inventory.js --corpus C:\path\to\corpus.db
 *     node inventory.js --corpus ./corpus.db --out inv.json
 */

const Database = require('better-sqlite3');
const fs   = require('fs');
const path = require('path');

// ── args ─────────────────────────────────────────────────────────────────────
function argOf(flag, def) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const CORPUS = argOf('--corpus', process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2] : 'corpus.db');
const OUT = argOf('--out', 'corpus-inventory.json');

if (!fs.existsSync(CORPUS)) {
  console.error(`✗ corpus.db not found at: ${path.resolve(CORPUS)}`);
  console.error(`  Pass a path:  node inventory.js --corpus <path-to-corpus.db>`);
  process.exit(1);
}

const db = new Database(CORPUS, { readonly: true });
const safe = (fn, fallback = null) => { try { return fn(); } catch (e) { return { __error: e.message, ...(fallback || {}) }; } };
const rows = (sql, ...p) => { try { return db.prepare(sql).all(...p); } catch (e) { return { __error: e.message }; } };
const one  = (sql, ...p) => { try { return db.prepare(sql).get(...p); } catch (e) { return { __error: e.message }; } };

const report = { corpus_db: path.resolve(CORPUS), generated_at: new Date().toISOString() };

// ── schema: tables + views ───────────────────────────────────────────────────
report.tables = safe(() => db.prepare(
  "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name"
).all());

// full column listing for every table/view (so I see how each source is keyed)
report.schemas = {};
if (Array.isArray(report.tables)) {
  for (const t of report.tables) {
    report.schemas[t.name] = safe(() => db.prepare(`PRAGMA table_info(${t.name})`).all()
      .map(c => ({ name: c.name, type: c.type, pk: c.pk })));
  }
}

// ── the verses table (the thing all sources live in) ─────────────────────────
const versesCols = (report.schemas.verses && Array.isArray(report.schemas.verses))
  ? report.schemas.verses.map(c => c.name) : [];
const has = (c) => versesCols.includes(c);
report.verses_columns = versesCols;

// dump any book / canon / order lookup tables in full (these are small)
report.lookup_tables = {};
if (Array.isArray(report.tables)) {
  for (const t of report.tables) {
    if (/book|canon|order|title|work|meta/i.test(t.name) && t.name !== 'verses') {
      report.lookup_tables[t.name] = {
        count: safe(() => one(`SELECT COUNT(*) n FROM ${t.name}`).n),
        rows:  rows(`SELECT * FROM ${t.name} LIMIT 400`),
      };
    }
  }
}

if (has('corpus')) {
  // ── corpora present ────────────────────────────────────────────────────────
  const corpora = safe(() => db.prepare('SELECT DISTINCT corpus FROM verses ORDER BY corpus').all().map(r => r.corpus));
  report.corpora = corpora;

  // ── per-corpus summary ───────────────────────────────────────────────────
  report.per_corpus = {};
  if (Array.isArray(corpora)) {
    for (const c of corpora) {
      report.per_corpus[c] = one(`
        SELECT COUNT(*)                       AS verses,
               COUNT(DISTINCT canon_id)       AS canon_books
               ${has('doc_id')  ? ', COUNT(DISTINCT doc_id)  AS docs'      : ''}
               ${has('book_id') ? ', COUNT(DISTINCT book_id) AS book_ids'  : ''}
               ${has('code')    ? ', COUNT(DISTINCT code)    AS codes'      : ''}
        FROM verses WHERE corpus = ?`, c);
    }
  }

  // ── cross-corpus book map: (canon_id, code, book_id) tuples per corpus ──────
  // Reveals whether book_id is stable across corpora or per-source, and how
  // canon_id ↔ code ↔ book_id relate. Canonical books only (doc_id NULL where present).
  const canonFilter = has('doc_id') ? 'AND (doc_id IS NULL OR doc_id = "")' : '';
  report.book_map = rows(`
    SELECT corpus,
           canon_id
           ${has('code')    ? ', code'    : ''}
           ${has('book_id') ? ', book_id' : ''},
           COUNT(*)          AS verses,
           MAX(CAST(chapter AS INTEGER)) AS max_chapter,
           MIN(CAST(chapter AS INTEGER)) AS min_chapter
    FROM verses
    WHERE canon_id IS NOT NULL ${canonFilter}
    GROUP BY corpus, canon_id ${has('code') ? ', code' : ''} ${has('book_id') ? ', book_id' : ''}
    ORDER BY canon_id, corpus`);

  // ── canonical book coverage matrix (grouped by canon_id) ────────────────────
  // For each canonical book: which corpora carry it, verse counts, max chapter,
  // and — the point of the exercise — whether ENG exists.
  const canonIds = safe(() => db.prepare(
    `SELECT DISTINCT canon_id FROM verses WHERE canon_id IS NOT NULL ${canonFilter} ORDER BY canon_id`
  ).all().map(r => r.canon_id));
  report.canon = [];
  report.eng_gap = [];
  if (Array.isArray(canonIds) && Array.isArray(corpora)) {
    for (const cid of canonIds) {
      const entry = { canon_id: cid, codes: {}, book_ids: {}, per_corpus: {} };
      for (const c of corpora) {
        const r = one(`
          SELECT COUNT(*) AS verses,
                 MAX(CAST(chapter AS INTEGER)) AS max_chapter
                 ${has('code')    ? ', MIN(code)    AS code'    : ''}
                 ${has('book_id') ? ', MIN(book_id) AS book_id' : ''}
          FROM verses WHERE corpus=? AND canon_id=? ${canonFilter}`, c, cid);
        if (r && r.verses > 0) {
          entry.per_corpus[c] = { verses: r.verses, max_chapter: r.max_chapter };
          if (r.code    != null) entry.codes[c]    = r.code;
          if (r.book_id != null) entry.book_ids[c] = r.book_id;
        }
      }
      entry.has_eng   = !!entry.per_corpus['ENG'];
      entry.present_in = Object.keys(entry.per_corpus);
      report.canon.push(entry);
      if (!entry.has_eng) {
        report.eng_gap.push({
          canon_id: cid,
          codes: entry.codes,
          book_ids: entry.book_ids,
          present_in: entry.present_in,
          verses_available: Object.fromEntries(Object.entries(entry.per_corpus).map(([k, v]) => [k, v.verses])),
        });
      }
    }
  }

  // ── literary works (doc-based, non-canonical) headline counts ───────────────
  if (has('doc_id')) {
    report.docs = {};
    for (const c of (Array.isArray(corpora) ? corpora : [])) {
      report.docs[c] = one(`
        SELECT COUNT(DISTINCT doc_id) AS works, COUNT(*) AS verses
        FROM verses WHERE corpus=? AND doc_id IS NOT NULL AND doc_id <> ''`, c);
    }
  }

  // ── samples so I can see the actual text/keys per corpus ─────────────────────
  report.samples = {};
  for (const c of (Array.isArray(corpora) ? corpora : [])) {
    report.samples[c] = rows(
      `SELECT * FROM verses WHERE corpus=? ${canonFilter} ORDER BY canon_id, CAST(chapter AS INTEGER), CAST(verse AS INTEGER) LIMIT 3`, c);
  }
} else {
  report.__note = "verses table has no `corpus` column — sources may be split into per-corpus tables/views. Full schemas above show the real layout.";
}

// ── proper-noun name harvest (for the name-passthrough dictionary) ───────────
// Every Hebrew proper noun carries a Strong's number; your getTranslit turns its
// paleo into your rendering (𐤌𐤔𐤄 → Mashah). Harvesting {strongs → representative
// surface + count} here lets me reproduce your exact names and build the
// English→your-name map that rewrites the fetched baseline before import.
report.names = safe(() => {
  const tk = (report.tables || []).find(t => /token/i.test(t.name));
  if (!tk) return { __note: 'no tokens table found' };
  const tname = tk.name;
  const tcols = (report.schemas[tname] || []).map(c => c.name);
  const posCol = tcols.includes('pos') ? 'pos' : (tcols.includes('part_of_speech') ? 'part_of_speech' : null);
  const wcol   = tcols.includes('word_raw') ? 'word_raw' : (tcols.includes('surface') ? 'surface' : null);
  const scol   = tcols.includes('strongs') ? 'strongs' : null;
  if (!posCol || !wcol || !scol) return { __note: `tokens table ${tname} missing pos/word_raw/strongs`, columns: tcols };

  // What POS codes exist (so I can see the proper-noun tag scheme)
  const posValues = rows(`SELECT ${posCol} AS pos, COUNT(*) n FROM ${tname} GROUP BY ${posCol} ORDER BY n DESC`);

  // Proper-noun rows: match common encodings (nmpr / proper_noun / Np …)
  const proper = rows(`
    SELECT ${scol} AS strongs, ${wcol} AS surface, COUNT(*) AS n
    FROM ${tname}
    WHERE ${scol} IS NOT NULL AND ${scol} <> ''
      AND (${posCol} LIKE '%nmpr%' OR ${posCol} LIKE '%proper%' OR ${posCol}='Np' OR ${posCol} LIKE '%name%')
    GROUP BY ${scol}, ${wcol}
    ORDER BY n DESC
    LIMIT 6000`);

  return { tokens_table: tname, pos_column: posCol, pos_values: posValues,
           proper_noun_count: Array.isArray(proper) ? proper.length : 0, proper_nouns: proper };
});

// ── write + summarize ────────────────────────────────────────────────────────
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

console.log('\n════════ corpus inventory ════════');
console.log('corpus.db :', report.corpus_db);
console.log('tables    :', (report.tables || []).map(t => `${t.name}${t.type === 'view' ? '(view)' : ''}`).join(', '));
if (report.corpora) console.log('corpora   :', report.corpora.join(', '));
if (report.per_corpus) {
  console.log('\nper corpus:');
  for (const [c, v] of Object.entries(report.per_corpus)) {
    console.log(`  ${c.padEnd(4)} verses=${String(v.verses ?? '?').padStart(7)}  canon_books=${String(v.canon_books ?? '?').padStart(3)}` +
      (v.docs != null ? `  works=${v.docs}` : '') + (v.book_ids != null ? `  book_ids=${v.book_ids}` : ''));
  }
}
if (report.canon) {
  const withEng = report.canon.filter(e => e.has_eng).length;
  console.log(`\ncanonical books: ${report.canon.length} total · ${withEng} have ENG · ${report.eng_gap.length} MISSING ENG`);
  if (report.eng_gap.length) {
    console.log('missing-ENG (first 60), by canon_id [codes seen] present-in:');
    for (const g of report.eng_gap.slice(0, 60)) {
      const code = Object.values(g.codes || {})[0] || '?';
      console.log(`  canon ${String(g.canon_id).padStart(3)}  ${String(code).padEnd(8)} present:[${g.present_in.join(',')}]`);
    }
    if (report.eng_gap.length > 60) console.log(`  … and ${report.eng_gap.length - 60} more (see JSON)`);
  }
}
if (report.names && report.names.proper_noun_count != null) {
  console.log(`\nproper-noun renderings harvested: ${report.names.proper_noun_count} (strongs×surface) from ${report.names.tokens_table}`);
}
console.log(`\n✓ wrote ${OUT}  (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB) — upload/paste this to me`);
db.close();
