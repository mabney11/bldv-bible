// build-nt-tokens.mjs
// Tags the NT Hebrew (corpus HEB, canon 40-66) with Strong's numbers by looking every word
// up in an index built from the OT tokens_bhs. Measured resolve rate on Matthew 1: 97.6%
// (69.4% exact surface, 28.2% via prefix/suffix), with correct hits — H5612 sefer=book,
// H8435 toledot=genealogy, H4899 mashiach, H1121 ben, H1732 David, H85 Abraham.
//
//   node build-nt-tokens.mjs --dry --out nt-build.txt     report only, writes nothing
//   node build-nt-tokens.mjs --apply                      create/fill tokens_nt
//   node build-nt-tokens.mjs --apply --canon 40           one book
//
// WHY A SEPARATE TABLE (tokens_nt, same shape as tokens_bhs):
// Inserting these into tokens_bhs would corrupt every OT statistic that reads it — the
// nmpr/adjv dominance counts in apply-web-strongs, surface-index builds, concordance
// frequencies. The NT tags are INFERRED, not attested, so they must stay separable.
// Server wiring afterwards is one line: in the /api/tokens handler, read tokens_nt instead
// of tokens_bhs when book_id >= 40 (or UNION the two).
//
// Confidence is recorded per row so a wrong inference is findable later:
//   match_kind : 'surface' (exact OT form) | 'variant' (after prefix/suffix strip)
//   confidence : share of that form's OT occurrences carrying the winning Strong's

import Database from 'better-sqlite3';
import { existsSync, writeFileSync } from 'node:fs';
import util from 'node:util';

const args = process.argv.slice(2);
const argv = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const APPLY = args.includes('--apply');
const CANON = argv('--canon', '');
const TABLE = argv('--table', 'tokens_nt');

const OUTFILE = argv('--out', '');
const buf = [];
if (OUTFILE) {
  const rawLog = console.log.bind(console), rawTable = console.table.bind(console);
  const fmt = a => a.map(x => typeof x === 'string' ? x : util.inspect(x, { depth: 4, breakLength: 120 })).join(' ');
  console.log = (...a) => { buf.push(fmt(a)); rawLog(...a); };
  console.table = rows => { rawTable(rows);
    if (!Array.isArray(rows) || !rows.length) { buf.push('(no rows)'); return; }
    const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
    const w = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
    const line = c2 => '  ' + c2.map((v, i) => String(v ?? '').padEnd(w[i])).join('  ');
    buf.push(line(cols)); buf.push('  ' + w.map(n => '-'.repeat(n)).join('  '));
    for (const r of rows) buf.push(line(cols.map(c => r[c]))); };
  process.on('exit', () => { try { writeFileSync(OUTFILE, buf.join('\n') + '\n', 'utf8');
    rawLog(`\n[report written to ${OUTFILE}]`); } catch (e) { rawLog(`\n[write failed: ${e.message}]`); } });
}

if (!existsSync('./corpus.db')) { console.error('corpus.db not found — run from server/'); process.exit(1); }
const db = new Database('./corpus.db', { readonly: !APPLY });

// ── 1. index the OT tokens by written form ──────────────────────────────────────────
// root/lemma came back EMPTY in the probe (0 distinct), so only word_raw is usable — which
// is fine: it carried 69.4% on its own, and the variant stripper covers most of the rest.
console.log('indexing tokens_bhs by surface form …');
const bySurface = new Map();                       // form -> Map(strongs -> count)
const posOf     = new Map();                       // form -> Map(pos -> count)
for (const r of db.prepare(
    `SELECT word_raw, strongs, pos FROM tokens_bhs WHERE strongs IS NOT NULL AND strongs<>''`).iterate()) {
  if (!r.word_raw) continue;
  const sn = 'H' + String(r.strongs).replace(/^H+/i, '');
  const e = bySurface.get(r.word_raw) || new Map(); e.set(sn, (e.get(sn) || 0) + 1); bySurface.set(r.word_raw, e);
  if (r.pos) { const p = posOf.get(r.word_raw) || new Map(); p.set(r.pos, (p.get(r.pos) || 0) + 1); posOf.set(r.word_raw, p); }
}
const top = m => { let best = null, n = 0, tot = 0;
  for (const [k, c] of m) { tot += c; if (c > n) { best = k; n = c; } }
  return { key: best, n, share: tot ? n / tot : 0 }; };
console.log(`  ${bySurface.size.toLocaleString()} distinct OT surface forms`);

// ── 2. variant generation for words the OT never wrote exactly ──────────────────────
const PFX = ['\u{10905}','\u{10904}','\u{10901}','\u{1090B}','\u{1090A}','\u{1090C}','\u{10911}',
             '\u05D5','\u05D4','\u05D1','\u05DC','\u05DB','\u05DE','\u05E9'];
const SFX = ['\u{10909}\u{10904}','\u{10904}','\u{10905}','\u{10909}','\u{1090A}','\u{1090C}'];
const variants = w => {
  const out = [];
  const seen = new Set([w]);
  const push = v => { if (v && [...v].length > 1 && !seen.has(v)) { seen.add(v); out.push(v); } };
  for (const p of PFX) if (w.startsWith(p)) {
    const s = w.slice(p.length); push(s);
    for (const q of PFX) if (s.startsWith(q)) push(s.slice(q.length));
  }
  for (const base of [w, ...out]) for (const s of SFX) if (base.endsWith(s)) push(base.slice(0, -s.length));
  return out;
};

// ── 3. tokenize the NT Hebrew and resolve ───────────────────────────────────────────
const HEBREWISH = /[\u0590-\u05FF]|[\u{10900}-\u{1091F}]/u;
const SPLIT = /([\s\u05BE\u05C3\u05C0.,;:!?()"'\u2019\u201c\u201d\u05F3\u05F4]+)/;
const verses = CANON
  ? db.prepare(`SELECT canon_id, ord_c, ord_v, text FROM verses WHERE corpus='HEB' AND canon_id=? AND ord_c IS NOT NULL ORDER BY canon_id, ord_c, ord_v`).all(Number(CANON))
  : db.prepare(`SELECT canon_id, ord_c, ord_v, text FROM verses WHERE corpus='HEB' AND canon_id BETWEEN 40 AND 66 AND ord_c IS NOT NULL ORDER BY canon_id, ord_c, ord_v`).all();
console.log(`\nNT Hebrew verses: ${verses.length.toLocaleString()}`);

const out = [];
let total = 0, exact = 0, viaVar = 0, unres = 0;
const misses = new Map(); const perBook = new Map();
for (const v of verses) {
  let ord = 0;
  for (const raw of String(v.text).split(SPLIT)) {
    if (!raw || !HEBREWISH.test(raw)) continue;
    const w = raw.trim(); if (!w) continue;
    ord++; total++;
    let sn = null, share = 0, kind = null, pos = null;
    if (bySurface.has(w)) {
      const t = top(bySurface.get(w)); sn = t.key; share = t.share; kind = 'surface'; exact++;
      if (posOf.has(w)) pos = top(posOf.get(w)).key;
    } else {
      for (const cand of variants(w)) if (bySurface.has(cand)) {
        const t = top(bySurface.get(cand)); sn = t.key; share = t.share; kind = 'variant'; viaVar++;
        if (posOf.has(cand)) pos = top(posOf.get(cand)).key;
        break;
      }
    }
    if (!sn) { unres++; misses.set(w, (misses.get(w) || 0) + 1); }
    const b = perBook.get(v.canon_id) || { canon_id: v.canon_id, tokens: 0, resolved: 0 };
    b.tokens++; if (sn) b.resolved++; perBook.set(v.canon_id, b);
    out.push({ book_id: v.canon_id, chapter: v.ord_c, verse: v.ord_v, token_ordinal: ord,
               word_raw: w, strongs: sn, pos, match_kind: kind, confidence: sn ? Number(share.toFixed(3)) : 0 });
  }
}
const pct = n => total ? `${(n / total * 100).toFixed(1)}%` : '—';
console.log(`\n=== RESOLUTION ===`);
console.log(`tokens         : ${total.toLocaleString()}`);
console.log(`exact surface  : ${exact.toLocaleString()} (${pct(exact)})`);
console.log(`via variant    : ${viaVar.toLocaleString()} (${pct(viaVar)})`);
console.log(`RESOLVED       : ${(exact + viaVar).toLocaleString()} (${pct(exact + viaVar)})`);
console.log(`unresolved     : ${unres.toLocaleString()} (${pct(unres)}) · ${misses.size} distinct forms`);
console.table([...perBook.values()].map(b => ({ ...b, rate: `${(b.resolved / b.tokens * 100).toFixed(1)}%` })).slice(0, 30));
const lowConf = out.filter(r => r.strongs && r.confidence < 0.6).length;
console.log(`\nrows with confidence < 0.6 (the form is genuinely ambiguous in the OT): ${lowConf.toLocaleString()}`);
if (misses.size) { console.log('\ntop unresolved forms (NT-only vocabulary / Greek-derived names):');
  console.log('  ' + [...misses].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([w, n]) => `${w}\u00d7${n}`).join('  ')); }

if (!APPLY) { console.log('\n[dry run] nothing written. Re-run with --apply to build ' + TABLE + '.'); db.close(); process.exit(0); }

// ── 4. write the table ──────────────────────────────────────────────────────────────
db.exec(`CREATE TABLE IF NOT EXISTS ${TABLE} (
  source_id TEXT, book_id INTEGER, chapter INTEGER, verse INTEGER, token_ordinal INTEGER,
  word_raw TEXT, lemma TEXT, root TEXT, pos TEXT, morph TEXT, strongs TEXT,
  match_kind TEXT, confidence REAL)`);
db.exec(`CREATE INDEX IF NOT EXISTS ${TABLE}_ref ON ${TABLE}(book_id, chapter, verse, token_ordinal)`);
const del = CANON ? db.prepare(`DELETE FROM ${TABLE} WHERE book_id=?`) : db.prepare(`DELETE FROM ${TABLE}`);
CANON ? del.run(Number(CANON)) : del.run();
const ins = db.prepare(`INSERT INTO ${TABLE}
  (source_id, book_id, chapter, verse, token_ordinal, word_raw, pos, strongs, match_kind, confidence)
  VALUES ('HEB-NT', ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
db.transaction(rows => { for (const r of rows)
  ins.run(r.book_id, r.chapter, r.verse, r.token_ordinal, r.word_raw, r.pos, r.strongs, r.match_kind, r.confidence); })(out);
console.log(`\n\u2713 wrote ${out.length.toLocaleString()} rows into ${TABLE}.`);
console.log('Next: in the /api/tokens handler, read ' + TABLE + ' when book_id >= 40 so the');
console.log('Parallel viewer and the transliteration reader can see the NT.');
db.close();
