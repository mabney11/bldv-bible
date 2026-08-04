// verify-nt-tokens.mjs
// Answers "where am I supposed to be verifying these NT Strong's?" — directly, without
// depending on the UI. Reads tokens_nt and shows what each word resolved to, plus the
// gloss/root it will inherit from the existing OT pipeline.
//
//   node verify-nt-tokens.mjs --out v.txt                 Matthew 1:23 (the Isaiah quote)
//   node verify-nt-tokens.mjs --canon 40 --chapter 1 --verse 1
//   node verify-nt-tokens.mjs --canon 40 --chapter 1 --verse 23 --quote 23,7,14
//        ^ compare against Isaiah 7:14 by SHARED STRONG'S — the quote-linking test
//   node verify-nt-tokens.mjs --audit                     lowest-confidence rows corpus-wide
//
// Read-only.

import Database from 'better-sqlite3';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import util from 'node:util';

const args = process.argv.slice(2);
const argv = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const CANON = Number(argv('--canon', '40'));
const CHAP = Number(argv('--chapter', '1'));
const VERSE = Number(argv('--verse', '23'));
const QUOTE = argv('--quote', '');            // "canon,chapter,verse" to compare against
const AUDIT = args.includes('--audit');

const OUTFILE = argv('--out', '');
const buf = [];
if (OUTFILE) {
  const rawLog = console.log.bind(console), rawTable = console.table.bind(console);
  const fmt = a => a.map(x => typeof x === 'string' ? x : util.inspect(x, { depth: 4, breakLength: 140 })).join(' ');
  console.log = (...a) => { buf.push(fmt(a)); rawLog(...a); };
  console.table = rows => { rawTable(rows);
    if (!Array.isArray(rows) || !rows.length) { buf.push('(no rows)'); return; }
    const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
    const w = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
    const line = c2 => '  ' + c2.map((v, i) => String(v ?? '').padEnd(w[i])).join('  ');
    buf.push(line(cols)); buf.push('  ' + w.map(n => '-'.repeat(n)).join('  '));
    for (const r of rows) buf.push(line(cols.map(c => r[c]))); };
  process.on('exit', () => { try { writeFileSync(OUTFILE, buf.join('\n') + '\n', 'utf8');
    rawLog(`\n[written to ${OUTFILE}]`); } catch (e) { rawLog(`\n[write failed: ${e.message}]`); } });
}

if (!existsSync('./corpus.db')) { console.error('corpus.db not found — run from server/'); process.exit(1); }
const db = new Database('./corpus.db', { readonly: true });
try { db.prepare('SELECT 1 FROM tokens_nt LIMIT 1').get(); }
catch { console.error('tokens_nt does not exist — run: node build-nt-tokens.mjs --apply'); process.exit(1); }

// glosses, so you can see the MEANING each inferred Strong's carries
const dictPath = ['./strongs-hebrew-expanded.json', './strongs-hebrew.json'].find(existsSync);
const DICT = dictPath ? JSON.parse(readFileSync(dictPath, 'utf8')) : {};
const lexPath = ['./lexicon/lexicon.json', './lexicon.json'].find(existsSync);
const LEX = lexPath ? JSON.parse(readFileSync(lexPath, 'utf8')) : {};
const rootsPath = ['./lexicon/strongs-roots.json', './strongs-roots.json'].find(existsSync);
const ROOTS = rootsPath ? JSON.parse(readFileSync(rootsPath, 'utf8')) : {};
const senseOf = sn => {
  if (!sn) return '';
  const e = DICT[sn] || DICT[sn.replace(/^H/, '')] || {};
  const kjv = String(e.kjv_def || '').split(/[,;.]/).map(s => s.replace(/\([^)]*\)/g, '')
    .replace(/[^A-Za-z' -]/g, ' ').replace(/\s+/g, ' ').trim())
    .find(s => s && s.length > 1 && !/^(idiom|phrase)\b/i.test(s));
  return kjv || String(e.lemma || '');
};

console.log(`tokens_nt total rows: ${db.prepare('SELECT COUNT(*) c FROM tokens_nt').get().c.toLocaleString()}`);

if (AUDIT) {
  console.log('\n=== LOWEST-CONFIDENCE INFERENCES (your audit queue) ===');
  console.log('These forms are genuinely ambiguous in the OT; the commonest Strong\'s won.');
  console.table(db.prepare(`
    SELECT word_raw, strongs, COUNT(*) occurrences, MIN(confidence) confidence,
           MIN(book_id) first_book, MIN(chapter) ch
    FROM tokens_nt WHERE strongs IS NOT NULL AND confidence < 0.6
    GROUP BY word_raw, strongs ORDER BY occurrences DESC LIMIT 30`).all()
    .map(r => ({ ...r, sense: senseOf(r.strongs).slice(0, 22) })));
  db.close(); process.exit(0);
}

// ── the verse, token by token ───────────────────────────────────────────────────────
const rows = db.prepare(`SELECT token_ordinal, word_raw, strongs, pos, match_kind, confidence
  FROM tokens_nt WHERE book_id=? AND chapter=? AND verse=? ORDER BY token_ordinal`).all(CANON, CHAP, VERSE);
console.log(`\n=== canon ${CANON} ${CHAP}:${VERSE} — ${rows.length} tokens ===`);
console.table(rows.map(r => ({
  ord: r.token_ordinal, word: r.word_raw, strongs: r.strongs || '—',
  sense: senseOf(r.strongs).slice(0, 24),
  curated: (LEX[ROOTS[r.strongs] || ''] || '').slice(0, 24),
  root: ROOTS[r.strongs] || '', how: r.match_kind || 'unresolved',
  conf: r.strongs ? r.confidence : '',
})));
const got = rows.filter(r => r.strongs).length;
console.log(`resolved ${got}/${rows.length} (${rows.length ? (got / rows.length * 100).toFixed(0) : 0}%)`);

// ── quotation cross-check: same Strong's on both sides? ─────────────────────────────
if (QUOTE) {
  const [qc, qch, qv] = QUOTE.split(',').map(Number);
  const src = db.prepare(`SELECT token_ordinal, word_raw, strongs FROM tokens_bhs
    WHERE book_id=? AND chapter=? AND verse=? ORDER BY token_ordinal`).all(qc, qch, qv);
  console.log(`\n=== QUOTE CHECK vs canon ${qc} ${qch}:${qv} (OT, attested BHS tags) ===`);
  if (!src.length) { console.log('(no BHS tokens at that reference)'); }
  else {
    const otSN = new Map();
    for (const t of src) { const sn = t.strongs && ('H' + String(t.strongs).replace(/^H+/i, ''));
      if (sn) otSN.set(sn, (otSN.get(sn) || 0) + 1); }
    const shared = rows.filter(r => r.strongs && otSN.has(r.strongs));
    console.log(`OT tokens: ${src.length} · NT tokens: ${rows.length} · SHARED Strong's: ${shared.length}`);
    console.table(shared.map(r => ({ nt_word: r.word_raw, strongs: r.strongs,
      sense: senseOf(r.strongs).slice(0, 26),
      ot_word: (src.find(t => ('H' + String(t.strongs).replace(/^H+/i, '')) === r.strongs) || {}).word_raw })));
    console.log('\nShared Strong\'s here means the inference landed on the SAME words the OT uses —');
    console.log('that is the foundation for linking a NT quotation back to its source verse.');
  }
}
db.close();
