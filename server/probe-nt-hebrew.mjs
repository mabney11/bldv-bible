// probe-nt-hebrew.mjs
// Answers the build questions for rendering the NT from its Hebrew, with measurements
// instead of assumptions. Read-only — nothing is written.
//
//   node probe-nt-hebrew.mjs                  Matthew 1 (default)
//   node probe-nt-hebrew.mjs --book Matthew --chapter 1
//   node probe-nt-hebrew.mjs --samples 40     show more unmatched words
//
// The questions, in order:
//   1. Which corpus code holds the NT Hebrew, and does it cover the whole NT?
//   2. Is it verse TEXT only, or are there tokens (i.e. is there anything Strong's-like)?
//   3. What fraction of its words hit lexicon.json AS WRITTEN (fully-qualified forms)?
//   4. What fraction hit after stripping Hebrew PREFIXES (ו ה ב ל כ מ ש) — i.e. can we get
//      back to roots and reuse the BHS/lexicon data, as you expect?
//   5. Which words still miss? (that list is the actual work queue)

import Database from 'better-sqlite3';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import util from 'node:util';

const args = process.argv.slice(2);
const argv = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };

// ── self-writing output ─────────────────────────────────────────────────────────────
// In MINGW64 / Git Bash, `node foo.mjs > out.txt` can be intercepted by winpty, which
// writes the single line "stdout is not a tty" and drops everything else. Rather than
// fight the shell, pass --out <file> and the probe writes the report itself.
//   node probe-nt-hebrew.mjs --out probe-out.txt
const OUTFILE = argv('--out', '');
const buf = [];
if (OUTFILE) {
  const rawLog = console.log.bind(console);
  const rawTable = console.table.bind(console);
  const fmt = a => a.map(x => typeof x === 'string' ? x : util.inspect(x, { depth: 4, breakLength: 120 })).join(' ');
  console.log = (...a) => { buf.push(fmt(a)); rawLog(...a); };
  console.table = rows => {
    rawTable(rows);
    if (!Array.isArray(rows) || !rows.length) { buf.push('(no rows)'); return; }
    const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
    const w = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
    const line = (cells) => '  ' + cells.map((v, i) => String(v ?? '').padEnd(w[i])).join('  ');
    buf.push(line(cols));
    buf.push('  ' + w.map(n => '-'.repeat(n)).join('  '));
    for (const r of rows) buf.push(line(cols.map(c => r[c])));
  };
  process.on('exit', () => {
    try { writeFileSync(OUTFILE, buf.join('\n') + '\n', 'utf8');
          rawLog(`\n[report written to ${OUTFILE}]`); }
    catch (e) { rawLog(`\n[could not write ${OUTFILE}: ${e.message}]`); }
  });
}
const BOOK = argv('--book', 'Matthew');
const CHAP = Number(argv('--chapter', '1'));
const NSAMP = Number(argv('--samples', '25'));
if (!existsSync('./corpus.db')) { console.error('✗ corpus.db not found — run from server/'); process.exit(1); }
const db = new Database('./corpus.db', { readonly: true });
const show = (l, r) => { console.log('\n=== ' + l + ' ==='); r && r.length ? console.table(r) : console.log('(no rows)'); };

// ── 1. corpora present, and which ones cover NT canon ids ───────────────────────────
show('all corpora in verses', db.prepare(
  `SELECT corpus, COUNT(*) verses, COUNT(DISTINCT canon_id) books,
          MIN(canon_id) min_canon, MAX(canon_id) max_canon
   FROM verses GROUP BY corpus ORDER BY verses DESC`).all());

// find the book: by explicit --canon, else by code, else show what HEB actually covers.
// Codes are abbreviations ('MAT'), not full names, so a LIKE on "Matthew" finds nothing.
const CANON_ARG = argv('--canon', '');
const SRC_ARG = argv('--corpus', 'HEB');   // 'Hebrew (extra)' is corpus HEB (server.js L274)

console.log(`\n=== what corpus ${SRC_ARG} actually covers ===`);
const cov = db.prepare(
  `SELECT canon_id, MIN(code) code, COUNT(*) verses, COUNT(DISTINCT ord_c) chapters
   FROM verses WHERE corpus=? AND canon_id IS NOT NULL
   GROUP BY canon_id ORDER BY canon_id`).all(SRC_ARG);
console.log(`${cov.length} books. NT range (canon 40-66):`);
const nt = cov.filter(r => r.canon_id >= 40 && r.canon_id <= 66);
nt.length ? console.table(nt) : console.log('  (none — this corpus has no NT books)');
console.log('full canon_id list:', cov.map(r => `${r.canon_id}:${r.code}`).join(' '));

let canon = CANON_ARG ? Number(CANON_ARG) : null;
if (!canon) {
  const byCode = db.prepare(
    `SELECT DISTINCT canon_id, code FROM verses
     WHERE corpus=? AND canon_id IS NOT NULL AND (UPPER(code) LIKE ? OR UPPER(code)=?)`)
    .all(SRC_ARG, BOOK.slice(0,3).toUpperCase() + '%', BOOK.toUpperCase());
  if (byCode.length) canon = byCode[0].canon_id;
}
if (!canon) {
  console.log(`\nCould not resolve "${BOOK}" in ${SRC_ARG}. Re-run with --canon <id> from the list above,`);
  console.log('e.g.  node probe-nt-hebrew.mjs --canon 40 --chapter 1');
  db.close(); process.exit(0);
}
console.log(`\nusing canon_id ${canon}, corpus ${SRC_ARG}, chapter ${CHAP}`);

// ── 2. the Hebrew text for this chapter, per corpus ─────────────────────────────────
const heb = db.prepare(
  `SELECT corpus, ord_v, substr(text,1,90) sample, length(text) len
   FROM verses WHERE canon_id=? AND ord_c=? AND corpus<>'ENG'
   ORDER BY corpus, ord_v LIMIT 12`).all(canon, CHAP);
show(`canon ${canon} ch ${CHAP} — non-English sources`, heb);

const HEBREWISH = /[\u0590-\u05FF]|[\u{10900}-\u{1091F}]/u;
const SRC = SRC_ARG;

// ── 3. is there a TOKEN table covering the NT? ───────────────────────────────────────
const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(t => t.name);
console.log('\ntables:', tables.join(', '));
for (const t of tables.filter(n => /token|morph|word/i.test(n))) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
    const n = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
    let covers = 'n/a';
    if (cols.includes('book_id')) {
      const r = db.prepare(`SELECT COUNT(*) c FROM ${t} WHERE book_id=?`).get(canon);
      covers = `${r.c} rows for canon_id ${canon}`;
    }
    console.log(`  ${t}: ${n.toLocaleString()} rows · cols[${cols.join(',')}] · ${covers}`);
  } catch (e) { console.log(`  ${t}: ${e.message}`); }
}

// ── 4/5. lexicon hit rate, as-written vs after prefix stripping ─────────────────────
const LEXP = ['./lexicon/lexicon.json', './lexicon.json'].find(existsSync);
if (!LEXP) { console.log('\n! lexicon.json not found — skipping hit-rate test'); db.close(); process.exit(0); }
const LEX = JSON.parse(readFileSync(LEXP, 'utf8'));
const keys = Object.keys(LEX);
console.log(`\nlexicon: ${LEXP} · ${keys.length.toLocaleString()} entries`);
console.log('sample keys:', keys.slice(0, 6).map(k => `${k}=${String(LEX[k]).slice(0,18)}`).join(' | '));

// Prefixes that attach to a Hebrew word. Paleo plane first, then the Hebrew block, so this
// works whichever script the corpus is stored in.
const PFX_PALEO = ['\u{10905}','\u{10904}','\u{10901}','\u{1090B}','\u{1090A}','\u{1090C}','\u{10911}'];  // w h b l k m sh
const PFX_HEB   = ['\u05D5','\u05D4','\u05D1','\u05DC','\u05DB','\u05DE','\u05E9'];
const strip = w => {
  const out = new Set([w]);
  for (const P of [PFX_PALEO, PFX_HEB]) {
    for (const p of P) if (w.startsWith(p) && [...w].length > 2) {
      const s = w.slice(p.length); out.add(s);
      for (const q of P) if (s.startsWith(q) && [...s].length > 2) out.add(s.slice(q.length));
    }
  }
  return out;
};

const verses = db.prepare(
  `SELECT ord_v, text FROM verses WHERE canon_id=? AND ord_c=? AND corpus=? ORDER BY ord_v`).all(canon, CHAP, SRC);
let total = 0, exact = 0, viaPrefix = 0;
const misses = new Map();
for (const v of verses) {
  for (const w of String(v.text).split(/[\s\u05BE\u05C3\u05C0.,;:!?()"'\u2019\u201c\u201d]+/).filter(Boolean)) {
    if (!HEBREWISH.test(w)) continue;
    total++;
    if (LEX[w] != null) { exact++; continue; }
    const hit = [...strip(w)].find(f => f !== w && LEX[f] != null);
    if (hit) { viaPrefix++; continue; }
    misses.set(w, (misses.get(w) || 0) + 1);
  }
}
const pct = n => total ? `${(n / total * 100).toFixed(1)}%` : '—';
console.log(`\n=== LEXICON COVERAGE · ${BOOK} ${CHAP} (${SRC}) ===`);
console.log(`words examined            : ${total}`);
console.log(`hit AS WRITTEN            : ${exact}  (${pct(exact)})   <- fully-qualified forms already in the lexicon`);
console.log(`hit after PREFIX STRIP    : ${viaPrefix}  (${pct(viaPrefix)})   <- proves roots are recoverable`);
console.log(`still MISSING             : ${misses.size} distinct  (${pct(total - exact - viaPrefix)} of tokens)`);
if (misses.size) {
  console.log('\ntop misses (the actual work queue):');
  console.log('  ' + [...misses].sort((a, b) => b[1] - a[1]).slice(0, NSAMP)
    .map(([w, n]) => `${w}\u00d7${n}`).join('  '));
}
db.close();
