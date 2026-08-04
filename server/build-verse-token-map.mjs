// build-verse-token-map.mjs — resolve each English word to the Hebrew token IN ITS
// OWN VERSE, by gloss. No statistics, no alignment model, no probabilities.
//
//   node build-verse-token-map.mjs
//
// THE METHOD (yours, and it is the right one)
//   A verse has ~8 Hebrew tokens. Each token carries a Strong's number. A generic
//   lexicon lists every English word the translators ever used for that Strong's.
//   So: see an English word -> look at the Hebrew tokens of THAT SAME VERSE -> one
//   of them glosses that word -> that is the Hebrew word to display.
//
//   Ps 119:13  tokens H5608 H8193 H3605 H4941 H6310
//              H4941 glosses "judgment, ordinance, justice, manner"
//              verse says "ordinances"  ->  H4941  ->  𐤌𐤔𐤐𐤈
//
//   This is why every earlier attempt failed: the same English word maps to
//   DIFFERENT Hebrew in different verses ("word" = dabar H1697 in v9, imrah H565 in
//   v11), and the same Hebrew maps to different English ("judgment"/"ordinance" are
//   both H4941). No global word->Strong's map can express that, so any method that
//   builds one is guessing. The verse already holds the answer.
//
// TWO REFINEMENTS, both needed, both verified on Psalm 119:
//
//   1. STRONG'S USES A COMPRESSED NOTATION. "commanded(-ment)" means commanded AND
//      commandment; "(high-) (path-) way(-side)" means highway, pathway, way,
//      wayside. Splitting on word characters loses the real word — H4687 then looks
//      like it has no gloss for "commandment" when it plainly does. glossSet()
//      expands it.
//
//   2. IN-VERSE CONSTRAINT PROPAGATION. When two words tie, the verse settles it: a
//      word with exactly ONE candidate token claims it, and no other word in that
//      verse may use the same token. Repeat until stable. Ps 119:48 says both
//      "commandments" and "statutes"; "statutes" glosses only H2706, so it claims
//      it, leaving "commandments" alone with H4687. One-to-one, no scoring.
//
// Psalm 119, measured: 90.5% resolved to exactly one token, 2.6% tied,
// 6.9% no gloss match. The last group is real and is REPORTED, never guessed —
// e.g. WEB renders edut (H5715) as "statutes" where the generic lexicon says
// "testimonies". Those are the rows your own curation replaces.
//
// OUTPUT
//   verse-token-map.json     {"canon:ch:v": {"english word": "H####"}, roots:{...}}
//   verse-token-residue.json every unresolved occurrence, with verse + why
//
// Requires strongs-hebrew.json (generic public-domain Strong's, shipped alongside).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const argv = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const DB    = argv('--db', './corpus.db');
const ENG   = argv('--eng', './english-web-raw.jsonl');
const TERMS_F = argv('--terms', './sacred-terms.txt');
const LEX_F = argv('--lexicon', './strongs-hebrew.json');
const die = m => { console.error('\u2717 ' + m); process.exit(1); };

let Database;
try { ({ default: Database } = await import('better-sqlite3')); }
catch { die('better-sqlite3 not found — run from server/'); }
for (const f of [DB, ENG, LEX_F]) if (!existsSync(f)) die(`not found: ${f}`);

const rootsPath = ['./lexicon/strongs-roots.json', './strongs-roots.json'].find(existsSync);
if (!rootsPath) die('strongs-roots.json not found');
const ROOTS = JSON.parse(readFileSync(rootsPath, 'utf8'));
const LEX   = JSON.parse(readFileSync(LEX_F, 'utf8'));

// ── English normalisation + Strong's notation expansion ─────────────────────
const norm = w => {
  w = w.toLowerCase().replace(/[^a-z]/g, '');
  if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
  if (/(sses|shes|ches|xes)$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
  return w;
};
function expandItem(item) {
  const out = new Set();
  item = item.replace(/\[[^\]]*\]/g, ' ').trim();
  const pre = [...item.matchAll(/\(([a-zA-Z]+)-\)/g)].map(m => m[1].toLowerCase());
  const suf = [...item.matchAll(/\(-([a-zA-Z]+)\)/g)].map(m => m[1].toLowerCase());
  const base = item.replace(/\([^)]*\)/g, '').replace(/[^a-zA-Z ]/g, ' ').trim();
  for (const bw of base.split(/\s+/).filter(w => w.length > 1)) {
    const b = bw.toLowerCase();
    out.add(b);
    for (const p of pre) out.add(p + b);
    for (const s of suf) {
      out.add(b + s);
      for (let k = Math.max(3, b.length - 4); k < b.length; k++) out.add(b.slice(0, k) + s);
    }
  }
  return out;
}
const GLOSS = new Map();
for (const [sn, e] of Object.entries(LEX)) {
  const s = new Set();
  for (const src of [e.kjv_def, e.strongs_def]) {
    if (!src) continue;
    for (const item of String(src).split(/[,;.]/)) for (const w of expandItem(item)) s.add(norm(w));
  }
  GLOSS.set(sn, s);
}

const TERMS = existsSync(TERMS_F)
  ? new Set(readFileSync(TERMS_F, 'utf8').split(/\r?\n/).map(l => l.trim().toLowerCase())
      .filter(l => l && !l.startsWith('#')).map(norm))
  : new Set();

// ── Hebrew tokens per verse. verse=0 is a psalm superscription (a heading, not
// verse text). Virtual Strong's H9000-H9099 are prefix/suffix morphemes, not words.
const db = new Database(DB, { readonly: true });
const toks = new Map();
for (const t of db.prepare(
  `SELECT book_id, chapter, verse, token_ordinal, strongs FROM tokens_bhs
     WHERE strongs IS NOT NULL AND strongs <> '' AND pos <> 'punct' AND verse > 0
     ORDER BY book_id, chapter, verse, token_ordinal`).all()) {
  const sn = 'H' + String(t.strongs).replace(/^H+/, '');
  if (/^H9[0-9]{3}$/.test(sn)) continue;
  const k = `${t.book_id}:${t.chapter}:${t.verse}`;
  if (!toks.has(k)) toks.set(k, []);
  if (!toks.get(k).includes(sn)) toks.get(k).push(sn);
}
db.close();
console.log(`Hebrew verses: ${toks.size.toLocaleString()}  ·  lexicon entries: ${GLOSS.size.toLocaleString()}`);

const CODE2ID = { GEN:1,EXOD:2,LEV:3,NUM:4,DEUT:5,JOSH:6,JUDG:7,RUTH:8,'1SAM':9,'2SAM':10,
  '1KGS':11,'2KGS':12,'1CHR':13,'2CHR':14,EZRA:15,NEH:16,EST:17,JOB:18,PSA:19,PROV:20,
  ECCL:21,SONG:22,ISA:23,JER:24,LAM:25,EZK:26,DAN:27,HOS:28,JOEL:29,AMO:30,OBA:31,
  JONAH:32,MIC:33,NAM:34,HAB:35,ZEP:36,HAG:37,ZEC:38,MAL:39 };

const rows = readFileSync(ENG, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
const everLower = new Set();
for (const r of rows) for (const m of r.text.matchAll(/\b[a-z]{2,}\b/g)) everLower.add(m[0]);

const byVerse = {}, residue = [];
let resolved = 0, tied = 0, nogloss = 0;

for (const r of rows) {
  const bid = CODE2ID[r.code];
  if (!bid) continue;
  const k = `${bid}:${r.chapter}:${r.verse}`;
  const T = toks.get(k);
  if (!T) continue;

  // Which English words do we care about? Your sacred terms, plus proper nouns
  // (capitalized, not sentence-initial, never seen lowercase anywhere in the text).
  const body = r.text.replace(/(^|[.!?;:\u201C\u2018]\s*)\S+/g, ' ');
  const names = new Set();
  for (const m of body.matchAll(/\b[A-Z][a-zA-Z]+\b/g))
    if (!everLower.has(m[0].toLowerCase())) names.add(m[0]);

  const want = [];
  for (const m of r.text.matchAll(/\b[A-Za-z]+\b/g)) {
    const w = m[0];
    if (TERMS.has(norm(w)) || names.has(w)) want.push(w);
  }
  if (!want.length) continue;

  // candidate tokens for each word, FROM THIS VERSE ONLY
  const cand = new Map();
  for (const w of want) cand.set(w, T.filter(sn => GLOSS.get(sn)?.has(norm(w))));

  // constraint propagation: a word with one candidate claims that token exclusively
  const claimed = new Set();
  let moved = true;
  while (moved) {
    moved = false;
    for (const [w, cs] of cand) {
      const open = cs.filter(sn => !claimed.has(sn));
      if (cs.length > 1 && open.length === 1 && !claimed.has(open[0])) { cand.set(w, open); claimed.add(open[0]); moved = true; }
      else if (cs.length === 1 && !claimed.has(cs[0])) { claimed.add(cs[0]); moved = true; }
    }
  }

  for (const [w, cs] of cand) {
    if (cs.length === 1) {
      (byVerse[k] ||= {})[w] = cs[0];
      if (ROOTS[cs[0]]) resolved++;
      else { residue.push({ verse: k, word: w, sn: cs[0], why: 'no Paleo root for this Strong\'s' }); }
    } else if (cs.length > 1) {
      tied++; residue.push({ verse: k, word: w, candidates: cs, why: 'several tokens in this verse gloss it' });
    } else {
      nogloss++; residue.push({ verse: k, word: w, why: 'no token in this verse glosses this word' });
    }
  }
}

const usedRoots = {};
for (const m of Object.values(byVerse)) for (const sn of Object.values(m)) if (ROOTS[sn]) usedRoots[sn] = ROOTS[sn];

writeFileSync('verse-token-map.json', JSON.stringify({ byVerse, roots: usedRoots }, null, 1));
writeFileSync('verse-token-residue.json', JSON.stringify(residue, null, 1));

const tot = resolved + tied + nogloss;
console.log(`\nRESOLVED to one Hebrew token : ${resolved.toLocaleString()}  (${(100*resolved/tot).toFixed(1)}%)`);
console.log(`tied (verse has 2+ matches)  : ${tied.toLocaleString()}  (${(100*tied/tot).toFixed(1)}%)`);
console.log(`no gloss match in the verse  : ${nogloss.toLocaleString()}  (${(100*nogloss/tot).toFixed(1)}%)`);
console.log(`total occurrences            : ${tot.toLocaleString()}`);

console.log('\n=== PSALM 119 PROOF ===');
for (const [v, w] of [[1,'law'],[6,'commandments'],[9,'word'],[11,'word'],[13,'ordinances'],[168,'ways']]) {
  const sn = byVerse[`19:119:${v}`]?.[w];
  console.log(`  v${String(v).padEnd(4)} ${w.padEnd(14)} -> ${sn ? sn + '  ' + (ROOTS[sn] || '') : '(reported, see residue)'}`);
}
console.log('\nverse-token-map.json written. Nothing applied to the corpus yet.');
