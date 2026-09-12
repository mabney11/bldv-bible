// build-precepts.mjs — "precept upon precept": find every place in the WHOLE
// corpus where one passage quotes another, and write the result to
// server/precepts.db for the Reader's precept markers and panel.
//
//   node build-precepts.mjs                       rebuild precepts.db from translation.db
//   node build-precepts.mjs --seed cross_references.txt
//                                                 also import a public 66-book cross-
//                                                 reference set (OpenBible.info format:
//                                                 "Gen.1.1<TAB>Rev.4.11<TAB>votes")
//   node build-precepts.mjs --db X --out Y         explicit paths (defaults: ./translation.db,
//                                                 ./precepts.db next to this script — or on
//                                                 $DATA_DIR when that is set, i.e. on prod)
//   node build-precepts.mjs --min 4.3              rarity-weighted score threshold (default 4.3)
//   node build-precepts.mjs --tier3                also match 3-root shingles (noisy — see Pass 1)
//
// HOW A QUOTATION IS FOUND — and why it works across 152 books
//   The reading text renders every Strong's-tagged word as the SAME bare-root
//   transliteration wherever it occurs ("Two display surfaces", CLAUDE.md), and
//   render-corpus glosses the untagged books with the same roots. So the glossed
//   words of a verse — every `Word (gloss)` pair — are a language-independent
//   fingerprint of its Hebrew roots that the OT, NT, Jubilees, Jasher, Pistis
//   Sophia and Josephus all share. This script takes just those head words
//   (lower-cased, in order), cuts each verse into overlapping 4-word shingles,
//   and links two verses in different chapters when they share at least --min
//   shingles that are RARE across the corpus (a shingle in more than MAX_DF
//   verses is formula, not quotation — "Yahawah amar to Mashah"). Each shared
//   shingle is weighted by its rarity, log2(MAX_DF+1) - log2(df): a phrase
//   found in only two verses counts ~4.4, a stock phrase found in forty counts
//   almost nothing — which is what keeps "Thus amar Yahawah of tzabaawath, the
//   Alahayam of Yashar-Al" (Jeremiah, dozens of times) from linking every
//   oracle to every other. A pair is kept when the weights sum to at least
//   --min (default 4.3: one phrase found nowhere else in the corpus, or several
//   merely uncommon ones).
//   A run of consecutive shared shingles is a verbatim quotation, scattered
//   ones are a close parallel.
//
//   Plain English words are deliberately ignored: they vary between the WEB
//   OT, the NT baseline and each apocryphal translation, the roots do not.
//
// WHAT IT WRITES — precepts.db, rebuildable, never live-edited (the same class
// as corpus.db / surface-index.db: safe to rebuild locally and copy to prod).
//   precepts(from_book, from_chapter, from_verse, to_book, to_chapter, to_verse,
//            kind, score, shared, run, source)  — one row PER DIRECTION, so
//            "everything that touches Genesis 17:19" is one indexed lookup on
//            the from_* columns. shared = shingles in common, run = longest
//            consecutive run of them (roots in common in order = run + 3).
//   kind: 'quote' (a run of >=2 consecutive shared shingles, i.e. >=5 roots in
//         the same order) | 'parallel' (shared rare shingles, not consecutive)
//         | 'xref' (imported from --seed)
//   source: 'corpus' | 'openbible'
//   meta(key, value) — built_at, verse_count, thresholds, seed file.
// Curation (confirm / reject / manual add) does NOT live here — it lives in
// translation.db's precept_reviews table, keyed by the same six numbers, so a
// rebuild of this file never loses a review and prod's live reviews are never
// overwritten by a local rebuild (see feedback-prod-data-direction).
//
// book ids are canon_id everywhere in this file (translation.db convention —
// see CLAUDE.md "book_id means two different things").

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] != null ? args[i + 1] : dflt; };
const DB_PATH  = path.resolve(opt('--db',  path.join(__dirname, 'translation.db')));
// Default output: next to this script — except on the public box, where the
// databases live on the /data volume (DATA_DIR, see entrypoint.sh) and a file
// written inside the container is lost on the next deploy (2026-09-12).
const DATA_DIR = process.env.DATA_DIR && fs.existsSync(process.env.DATA_DIR) ? process.env.DATA_DIR : null;
const OUT_PATH = path.resolve(opt('--out', path.join(DATA_DIR || __dirname, 'precepts.db')));
const SEED     = opt('--seed', null);
const MIN_SCORE = parseFloat(opt('--min', '4.3'));
const N = 4;            // shingle length in roots
const MAX_DF = 40;      // a shingle seen in more verses than this is formula, not quotation
const MAX_VERSE_PAIRS_PER_SHINGLE = 780; // C(40,2) — bounds the pair explosion for df<=MAX_DF

const t0 = Date.now();
const src = new Database(DB_PATH, { readonly: true });
const rows = src.prepare(`SELECT book_id, chapter, verse, text FROM translations WHERE text IS NOT NULL AND text != '' ORDER BY book_id, chapter, verse`).all();
console.log(`[precepts] ${rows.length} verses from ${DB_PATH}`);

// `Word (gloss)` — the head word before a parenthetical gloss; the gloss may
// itself contain one level of parentheses ("Yashar-Al (Yashar-Al/(Israel))").
// "Yahawah ()" (empty self-gloss) counts too: the name is a root like any other.
const GLOSSED_RE = /([A-Za-z][A-Za-z\-']*)\s*\((?:[^()]|\([^()]*\))*\)/g;
function roots(text) {
  const out = [];
  GLOSSED_RE.lastIndex = 0;
  let m;
  while ((m = GLOSSED_RE.exec(text))) out.push(m[1].toLowerCase());
  return out;
}

// Pass 1: shingle every verse, index shingle -> [verse ids]. The 4-root
// shingle is the signal. An optional 3-root tier (--tier3; rarer cap, half
// weight) exists for the sparsely-glossed books — the NT baseline and much of
// the untagged corpus carry roots on only half their words — but measured
// 2026-09-12 it adds ~4,000 mostly-spurious parallels (Josephus to itself,
// "yad … shamayam") for a handful of real finds, so it is OFF by default.
// Verbatim-in-Hebrew NT quotations whose English wording diverges from the
// OT render (Matthew 4:4 / Deuteronomy 8:3: "bad (alone)" vs an unglossed
// "only") are the --seed set's job, not this matcher's.
const verses = rows.map((r, i) => ({ i, b: r.book_id, c: r.chapter, v: r.verse, toks: roots(r.text) }));
const TIERS = [{ n: 4, maxDf: MAX_DF, weight: 1.0 }];
if (args.includes('--tier3')) TIERS.push({ n: 3, maxDf: 12, weight: 0.5 });
function shingleIndex(n) {
  const index = new Map();
  for (const vs of verses) {
    if (vs.toks.length < n) continue;
    const seen = new Set();
    for (let j = 0; j + n <= vs.toks.length; j++) {
      const key = vs.toks.slice(j, j + n).join(' ');
      if (seen.has(key)) continue;
      seen.add(key);
      let lst = index.get(key);
      if (!lst) { lst = []; index.set(key, lst); }
      lst.push(vs.i);
    }
  }
  return index;
}

// Pass 2: per cross-chapter verse pair, sum the rarity weights of every shared
// shingle, remembering each 4-shingle's position in both verses so a
// consecutive run (verbatim quote) can be told from scattered overlap.
const pairs = new Map(); // "a|b" (a<b) -> { n, w, posA:[], posB:[] }
const posOf = (vs, key, n) => { for (let j = 0; j + n <= vs.toks.length; j++) if (vs.toks.slice(j, j + n).join(' ') === key) return j; return -1; };
for (const tier of TIERS) {
  const index = shingleIndex(tier.n);
  let rare = 0;
  for (const [key, lst] of index) {
    if (lst.length < 2 || lst.length > tier.maxDf) continue;
    rare++;
    const w = tier.weight * (Math.log2(tier.maxDf + 1) - Math.log2(lst.length));
    let budget = MAX_VERSE_PAIRS_PER_SHINGLE;
    for (let x = 0; x < lst.length && budget > 0; x++) {
      const A = verses[lst[x]];
      for (let y = x + 1; y < lst.length && budget > 0; y++) {
        const B = verses[lst[y]];
        if (A.b === B.b && A.c === B.c) continue; // same chapter: refrain, not a precept
        budget--;
        const k = `${A.i}|${B.i}`;
        let p = pairs.get(k);
        if (!p) { p = { n: 0, w: 0, posA: [], posB: [] }; pairs.set(k, p); }
        p.w += w;
        if (tier.n === N) { p.n++; p.posA.push(posOf(A, key, N)); p.posB.push(posOf(B, key, N)); }
      }
    }
  }
  console.log(`[precepts] ${tier.n}-root tier: ${index.size} shingles, ${rare} rare (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
console.log(`[precepts] ${pairs.size} candidate pairs`);

// A verbatim quotation: shared shingles that sit at consecutive positions in
// BOTH verses (a 5+-root run in the same order). Anything else is a parallel.
function longestRun(posA, posB) {
  const pts = posA.map((a, i) => [a, posB[i]]).sort((p, q) => p[0] - q[0]);
  let best = 1, run = 1;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] === pts[i - 1][0] + 1 && pts[i][1] === pts[i - 1][1] + 1) { run++; best = Math.max(best, run); }
    else run = 1;
  }
  return best;
}

// Write
if (fs.existsSync(OUT_PATH)) fs.unlinkSync(OUT_PATH);
for (const suf of ['-wal', '-shm']) if (fs.existsSync(OUT_PATH + suf)) fs.unlinkSync(OUT_PATH + suf);
const out = new Database(OUT_PATH);
out.pragma('journal_mode = OFF');
out.pragma('synchronous = OFF');
out.exec(`
  CREATE TABLE precepts (
    from_book INTEGER NOT NULL, from_chapter INTEGER NOT NULL, from_verse INTEGER NOT NULL,
    to_book   INTEGER NOT NULL, to_chapter   INTEGER NOT NULL, to_verse   INTEGER NOT NULL,
    kind   TEXT NOT NULL,          -- quote | parallel | xref
    score  REAL NOT NULL,          -- rarity-weighted shared shingles (corpus) or votes (seed)
    shared INTEGER NOT NULL,       -- shingles in common (corpus) / 0 (seed)
    run    INTEGER NOT NULL,       -- longest consecutive run of shared shingles
    source TEXT NOT NULL,          -- corpus | openbible
    PRIMARY KEY (from_book, from_chapter, from_verse, to_book, to_chapter, to_verse)
  ) WITHOUT ROWID;
  CREATE INDEX idx_precepts_chapter ON precepts(from_book, from_chapter);
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
`);
const ins = out.prepare(`INSERT OR REPLACE INTO precepts VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
const both = out.transaction((A, B, kind, score, shared, run, source) => {
  ins.run(A.b, A.c, A.v, B.b, B.c, B.v, kind, score, shared, run, source);
  ins.run(B.b, B.c, B.v, A.b, A.c, A.v, kind, score, shared, run, source);
});
let quotes = 0, parallels = 0;
const writeAll = out.transaction(() => {
  for (const [k, p] of pairs) {
    const [ia, ib] = k.split('|').map(Number);
    const A = verses[ia], B = verses[ib];
    // Within one book a single shared phrase is usually the author's own
    // habit (Jasher's "and X sent to all the …", Josephus chapter headings),
    // so a same-book pair has to clear a higher bar than a cross-book one.
    if (p.w < (A.b === B.b ? MIN_SCORE + 1.7 : MIN_SCORE)) continue;
    const run = p.n ? longestRun(p.posA, p.posB) : 0;
    const kind = run >= 2 ? 'quote' : 'parallel';
    if (kind === 'quote') quotes++; else parallels++;
    both(A, B, kind, Math.round(p.w * 10) / 10, p.n, run, 'corpus');
  }
});
writeAll();
console.log(`[precepts] corpus: ${quotes} quotations, ${parallels} parallels (pairs; x2 rows) (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

// Optional seed: OpenBible.info cross_references.txt (CC-BY), OSIS refs in the
// 66-book English numbering. Joel is the one book this corpus keeps in the
// Masoretic numbering (Eng 2:28-32 = 3:1-5, Eng 3 = 4), so those refs are
// shifted; everything else maps 1:1 onto canon_id 1-66.
let seeded = 0;
if (SEED) {
  const OSIS = ['Gen','Exod','Lev','Num','Deut','Josh','Judg','Ruth','1Sam','2Sam','1Kgs','2Kgs','1Chr','2Chr','Ezra','Neh','Esth','Job','Ps','Prov','Eccl','Song','Isa','Jer','Lam','Ezek','Dan','Hos','Joel','Amos','Obad','Jonah','Mic','Nah','Hab','Zeph','Hag','Zech','Mal','Matt','Mark','Luke','John','Acts','Rom','1Cor','2Cor','Gal','Eph','Phil','Col','1Thess','2Thess','1Tim','2Tim','Titus','Phlm','Heb','Jas','1Pet','2Pet','1John','2John','3John','Jude','Rev'];
  const osisId = Object.fromEntries(OSIS.map((c, i) => [c, i + 1]));
  const parseRef = (s) => {
    const m = /^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)/.exec(s.trim());
    if (!m || !osisId[m[1]]) return null;
    let b = osisId[m[1]], c = +m[2], v = +m[3];
    if (b === 29) { if (c === 2 && v > 27) { c = 3; v -= 27; } else if (c === 3) c = 4; }
    return { b, c, v };
  };
  const lines = fs.readFileSync(path.resolve(SEED), 'utf8').split(/\r?\n/);
  const seedTx = out.transaction(() => {
    for (const line of lines) {
      const [from, to, votes] = line.split('\t');
      if (!from || !to || from.startsWith('From')) continue;
      const A = parseRef(from), B = parseRef(to.split('-')[0]); // a range keeps its first verse
      if (!A || !B) continue;
      const score = Math.max(0, parseInt(votes, 10) || 0);
      if (score < 1) continue; // net-negative votes are the dataset's own "not really"
      ins.run(A.b, A.c, A.v, B.b, B.c, B.v, 'xref', score, 0, 0, 'openbible');
      seeded++;
    }
  });
  seedTx();
  console.log(`[precepts] seeded ${seeded} cross-references from ${SEED}`);
}

const setMeta = out.prepare(`INSERT OR REPLACE INTO meta VALUES (?,?)`);
setMeta.run('built_at', new Date().toISOString());
setMeta.run('verse_count', String(rows.length));
setMeta.run('shingle', String(N));
setMeta.run('max_df', String(MAX_DF));
setMeta.run('min_score', String(MIN_SCORE));
setMeta.run('seed', SEED || '');
out.close();
const total = new Database(OUT_PATH, { readonly: true }).prepare(`SELECT COUNT(*) n FROM precepts`).get().n;
console.log(`[precepts] wrote ${OUT_PATH}: ${total} rows in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
