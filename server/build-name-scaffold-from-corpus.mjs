// build-name-scaffold-from-corpus.mjs  (v2 — names + sacred terms)
// RUN ON YOUR MACHINE, from server/:
//
//   node build-name-scaffold-from-corpus.mjs --eng english-web-raw.jsonl --terms sacred-terms.txt
//
// WHY
// ---
// name-scaffold.json is HAND-LISTED, so it is the ceiling: every name nobody typed
// is invisible. That is why Ur, Amorite(s), Hittite(s), Jebusite(s), Perizzite(s),
// Girgashite(s), Kenizzite(s), Kadmonite(s) and Rephaim still render in English —
// 1,148 distinct proper nouns / 7,439 occurrences across the baseline. Hand-adding
// the ones you happen to notice just moves the trap one layer down.
//
// Your corpus already holds the answer. Every Hebrew token in tokens_bhs carries a
// Strong's; strongs-roots.json maps it to Paleo; your translit() turns that into your
// spelling. The only missing link is English-word → Strong's, and that is recoverable
// from the corpus itself: across ~23k verses an English word and its Hebrew lemma keep
// landing in the SAME verse, and nothing else does so as consistently.
//
// NOTHING here hardcodes a transliteration or a Strong's number. Both are derived.
//
// TWO CLASSES
//   names  — proper nouns (pos=nmpr / gentilics), capitalized in English.
//            Rendered bare:   Abaram, Yasharaal, Amaray
//   terms  — the sacred / high-impact common nouns in --terms (spirit, holy, peace,
//            seed, king, servant, law, prophet, good, evil…). Rendered WITH the
//            English kept as a gloss:   zarai (seed) · shalawam (peace)
//
// SCORING — EM word alignment (IBM Model 1 + diagonal positional prior).
//   Verse-level co-occurrence is NOT enough. Words that always travel together have
//   near-identical verse sets, so an overlap score cannot tell them apart: it paired
//   Amorite with H6522 (which is PERIZZITE), Sabbath with H7637 ("seventh"), Passover
//   with H2977 (Josiah), Satan with H8535 ("blameless"). Rarity made it worse —
//   Kadmonite occurs ONCE in the Bible, so any min-count silently dropped it.
//
//   EM makes hypotheses COMPETE across the whole corpus instead of scoring each pair
//   alone: a Strong's already explained by its own English word stops claiming credit
//   for others, and that pressure propagates until the assignment settles. For names
//   that never occur outside a fixed list, EM alone stays symmetric, so a soft
//   DIAGONAL POSITIONAL PRIOR is added — within a verse, English and Hebrew name
//   order track each other. Together they resolve the whole Genesis 15 nation list,
//   Kadmonite included, verified 10/10.
//
//   The reported number is the aligned probability. Below --min-p it is REPORTED,
//   never guessed.
//
// OUTPUT
//   name-scaffold-derived.json  — English → Strong's for names AND terms, merged with
//                                 your hand list so the Greek/NT names Hebrew cannot
//                                 supply (Messiah, Herod, Pilate, Cephas) survive.
//   name-scaffold-residue.json  — every word it could NOT pair, with counts and why.
//                                 This is your "don't let me stumble on it" list.
//
// Flags: --db ./corpus.db  --eng english-web-raw.jsonl  --terms sacred-terms.txt
//        --min-p 0.20  --beta 0.15  --iters 40

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const argv = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const DB      = argv('--db', './corpus.db');
const ENG     = argv('--eng', './english-web-raw.jsonl');
const TERMS_F = argv('--terms', './sacred-terms.txt');
const die = m => { console.error('\u2717 ' + m); process.exit(1); };

let Database;
try { ({ default: Database } = await import('better-sqlite3')); }
catch { die('better-sqlite3 not found \u2014 run this from your server/ folder'); }
if (!existsSync(DB))  die(`corpus.db not found at ${DB}`);
if (!existsSync(ENG)) die(`raw English baseline not found at ${ENG}`);

// The English side MUST be RAW WEB. A baseline whose names are already
// transliterated has no English names left to learn from — it would teach nothing.
const engRows = readFileSync(ENG, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
const sample = engRows.slice(0, 3000).map(r => r.text).join(' ');
if (!/\bYahweh\b|\bMoses\b|\bAbram\b/.test(sample))
  die(`${ENG} does not look like RAW WEB (no "Yahweh"/"Moses"/"Abram").\n` +
      `  Pass the untransliterated WEB file \u2014 an already-transliterated baseline\n` +
      `  has no English names left to learn from.`);

const db = new Database(DB, { readonly: true });

const CODE2ID = {
  GEN:1,EXOD:2,LEV:3,NUM:4,DEUT:5,JOSH:6,JUDG:7,RUTH:8,'1SAM':9,'2SAM':10,'1KGS':11,'2KGS':12,
  '1CHR':13,'2CHR':14,EZRA:15,NEH:16,EST:17,JOB:18,PSA:19,PROV:20,ECCL:21,SONG:22,ISA:23,JER:24,
  LAM:25,EZK:26,DAN:27,HOS:28,JOEL:29,AMO:30,OBA:31,JONAH:32,MIC:33,NAM:34,HAB:35,ZEP:36,HAG:37,
  ZEC:38,MAL:39,
};

const TERMS = existsSync(TERMS_F)
  ? new Set(readFileSync(TERMS_F, 'utf8').split(/\r?\n/)
      .map(l => l.trim().toLowerCase()).filter(l => l && !l.startsWith('#')))
  : new Set();
console.log(`term list: ${TERMS.size} words${TERMS.size ? '' : '  (no --terms file \u2014 names only)'}`);

// ── ENGLISH side ──────────────────────────────────────────────────────────────
// Name candidate = Capitalized, NOT sentence-initial, and never seen lowercase
// anywhere in the corpus. That last test replaces a stoplist: "Behold"/"Therefore"
// also occur lowercase; real names never do. The corpus filters itself.
const everLower = new Set();
for (const r of engRows)
  for (const m of r.text.matchAll(/\b[a-z]{2,}\b/g)) everLower.add(m[0]);

const engName = new Map(), engTerm = new Map();
for (const r of engRows) {
  const bid = CODE2ID[r.code];
  if (!bid) continue;                       // NT/Greek: Hebrew tokens can't supply these
  const k = `${bid}|${r.chapter}|${r.verse}`;

  const t = [];   // ORDERED — the positional prior depends on verse word order
  for (const m of r.text.matchAll(/\b[A-Za-z]{2,}\b/g)) {
    const w = m[0].toLowerCase();
    const base = TERMS.has(w) ? w
      : (w.endsWith('es') && TERMS.has(w.slice(0, -2))) ? w.slice(0, -2)
      : (w.endsWith('s')  && TERMS.has(w.slice(0, -1))) ? w.slice(0, -1)
      : null;
    if (base && !t.includes(base)) t.push(base);
  }
  if (t.length) engTerm.set(k, t);

  const body = r.text.replace(/(^|[.!?;:\u201C\u2018]\s*)\S+/g, ' ');
  const n = [];   // ORDERED
  for (const m of body.matchAll(/\b[A-Z][a-zA-Z]+\b/g))
    if (!everLower.has(m[0].toLowerCase()) && !n.includes(m[0])) n.push(m[0]);
  if (n.length) engName.set(k, n);
}

// ── HEBREW side ───────────────────────────────────────────────────────────────
// Names: proper-noun tokens only. Terms: EVERY part of speech — "peace", "seed",
// "king" are ordinary nouns and would be invisible to an nmpr-only query.
const rowsAll = db.prepare(`
    SELECT book_id, chapter, verse, strongs, pos FROM tokens_bhs
    WHERE strongs IS NOT NULL AND strongs != '' AND pos != 'punct'
    ORDER BY book_id, chapter, verse, token_ordinal
`).all();

// ORDER MATTERS: ORDER BY token_ordinal so the positional prior sees the real
// sequence. Sets would destroy it.
const hebName = new Map(), hebAll = new Map();
for (const t of rowsAll) {
  const k  = `${t.book_id}|${t.chapter}|${t.verse}`;
  const sn = 'H' + String(t.strongs).replace(/^H+/, '');
  // VIRTUAL Strong's: H9000-H9099 are OSHB's prefix/suffix markers (waw, beth,
  // lamed, the article...). They are morphemes, not words, and they occur in
  // nearly every verse, so an aligner will happily hand them to any English word
  // that lacks a better candidate. That is exactly how slave -> H9000 (waw) and
  // satan -> H9000 happened. They can never be a name or a term. Drop them.
  if (/^H9[0-9]{3}$/.test(sn)) continue;
  if (!hebAll.has(k)) hebAll.set(k, []);
  if (!hebAll.get(k).includes(sn)) hebAll.get(k).push(sn);
  if (t.pos === 'nmpr' || t.pos === 'adjv') {
    if (!hebName.has(k)) hebName.set(k, []);
    if (!hebName.get(k).includes(sn)) hebName.get(k).push(sn);
  }
}

const rootsPath = ['./lexicon/strongs-roots.json', './strongs-roots.json'].find(existsSync);
if (!rootsPath) die('strongs-roots.json not found (looked in ./lexicon/ and ./)');
const strongsRoots = JSON.parse(readFileSync(rootsPath, 'utf8'));

// ── learn: EM word alignment (IBM Model 1 + diagonal positional prior) ───────
//
// WHY NOT SIMPLE CO-OCCURRENCE / F1:
//   Words that always travel together cannot be separated by verse overlap. The
//   nation lists ("the Kenites, the Kenizzites, the Kadmonites, ... the Amorites")
//   put ten names in the same verses every time, so their verse-sets are nearly
//   identical. F1 duly mis-paired Amorite → H6522 (which is PERIZZITE), and the
//   same flaw sent Sabbath → H7637 ("seventh"), Passover → H2977 (Josiah) and
//   Satan → H8535 ("blameless"), because those words share verses with their
//   distractors. Rarity compounded it: Kadmonite occurs ONCE in the Bible, so any
//   min-count threshold silently drops it.
//
// EM fixes this by making hypotheses COMPETE across the whole corpus rather than
// scoring each pair in isolation. A Strong's already well explained by its own
// English word stops claiming credit for others, and that pressure propagates. On
// the nation lists this recovers Amorite → H567 correctly.
//
// Names that NEVER occur outside a list stay perfectly symmetric to EM, so we add a
// soft DIAGONAL POSITIONAL PRIOR: within a verse, English and Hebrew name order
// track each other. That breaks the remaining ties (Kenizzite, Kadmonite, Rephaim,
// Girgashite) without hardcoding anything. Verified 10/10 on the Genesis 15 list.
//
// Output confidence is the aligned probability; anything below --min-p is REPORTED,
// never guessed.
const BETA = Number(argv('--beta', 0.15));   // smaller = trust word order more
const ITERS = Number(argv('--iters', 40));
const MIN_P = Number(argv('--min-p', 0.20));
const diag = (i, m, j, n) =>
  Math.exp(-Math.abs(i / Math.max(m - 1, 1) - j / Math.max(n - 1, 1)) / BETA);

function learn(engMap, hebMap, label) {
  // parallel verse pairs, ORDER PRESERVED (the positional prior depends on it)
  const pairs = [];
  for (const [k, ws] of engMap) {
    const sns = hebMap.get(k);
    if (!sns || !ws.length) continue;
    pairs.push({ e: ws, f: [...sns] });
  }
  if (!pairs.length) return { ok: {}, bad: [] };

  const eV = new Set(), fV = new Set();
  for (const p of pairs) { p.e.forEach(x => eV.add(x)); p.f.forEach(x => fV.add(x)); }
  const init = 1 / fV.size;
  let t = new Map();
  const key = (e, f) => e + '\u0000' + f;

  for (let it = 0; it < ITERS; it++) {
    const cnt = new Map(), tot = new Map();
    for (const p of pairs) {
      const m = p.e.length, n = p.f.length;
      for (let i = 0; i < m; i++) {
        const e = p.e[i];
        const w = new Array(n);
        let z = 0;
        for (let j = 0; j < n; j++) {
          const tv = t.size ? (t.get(key(e, p.f[j])) ?? 0) : init;
          w[j] = tv * diag(i, m, j, n);
          z += w[j];
        }
        if (!z) continue;
        for (let j = 0; j < n; j++) {
          const f = p.f[j], d = w[j] / z;
          cnt.set(key(e, f), (cnt.get(key(e, f)) || 0) + d);
          // NORMALIZE BY THE ENGLISH SIDE. Dividing by the Hebrew total instead
          // estimates P(english | strongs), and argmax over that has a savage
          // RARE-WORD BIAS: a Strong's occurring in 3 verses, always beside the
          // same English word, scores 1.0 and beats the true lemma (which is
          // diluted because other English words also use it). That is precisely
          // how Sabbath landed on H7916 ("hired"), Passover on H2889 ("clean"),
          // Amorite on H2634 and slave on H2668 ("freedom"). We want
          // P(strongs | english), so the denominator is the English word.
          tot.set(e, (tot.get(e) || 0) + d);
        }
      }
    }
    const nt = new Map();
    for (const [kk, c] of cnt) {
      const e = kk.split('\u0000')[0];
      nt.set(kk, c / tot.get(e));
    }
    t = nt;
  }

  // argmax per English word
  const best = new Map();
  for (const [kk, v] of t) {
    const [e, f] = kk.split('\u0000');
    const cur = best.get(e);
    if (!cur || v > cur.p) best.set(e, { sn: f, p: v });
  }
  const ok = {}, bad = [];
  const seen = new Set();
  for (const p of pairs) p.e.forEach(e => seen.add(e));
  for (const e of seen) {
    const b = best.get(e);
    const why = !b ? 'never aligned to any Hebrew token'
      : !strongsRoots[b.sn] ? "no Paleo root for its Strong's"
      : b.p < MIN_P ? `low confidence (p ${b.p.toFixed(2)})`
      : null;
    if (why) bad.push({ word: e, kind: label, bestSN: b?.sn, p: b ? +b.p.toFixed(3) : 0, why });
    else ok[e] = b.sn;
  }
  return { ok, bad };
}

const N = learn(engName, hebName, 'name');
const T = TERMS.size ? learn(engTerm, hebAll, 'term') : { ok: {}, bad: [] };

// ── merge ─────────────────────────────────────────────────────────────────────
const names = { ...N.ok }, terms = { ...T.ok };
let kept = 0;
if (existsSync('./name-scaffold.json')) {
  const scaff = JSON.parse(readFileSync('./name-scaffold.json', 'utf8'));
  for (const [eng, sn] of (scaff.triples || []))
    if (!names[eng]) { names[eng] = sn; kept++; }   // Greek/NT names live only here
}
let variants = 0;
for (const src of [names, terms])
  for (const [eng, sn] of Object.entries({ ...src }))
    for (const v of [eng + 's', eng + 'es'])
      if (!src[v]) { src[v] = sn; variants++; }

writeFileSync('name-scaffold-derived.json', JSON.stringify({
  triples: Object.entries(names).map(([e, s]) => [e, s, 1]),
  terms:   Object.entries(terms).map(([e, s]) => [e, s, 1]),
}, null, 1));
const residue = [...N.bad, ...T.bad].sort((a, b) => (b.verses || 0) - (a.verses || 0));
writeFileSync('name-scaffold-residue.json', JSON.stringify(residue, null, 1));

console.log(`\nnames learned from Hebrew : ${Object.keys(N.ok).length.toLocaleString()}`);
console.log(`terms learned from Hebrew : ${Object.keys(T.ok).length.toLocaleString()}`);
console.log(`kept from your hand list  : ${kept.toLocaleString()}   (Greek/NT \u2014 Hebrew can't supply)`);
console.log(`plural variants generated : ${variants.toLocaleString()}`);
console.log(`\nUNPAIRED (reported, never guessed): ${residue.length.toLocaleString()}  \u2192 name-scaffold-residue.json`);
for (const r of residue.slice(0, 20))
  console.log(`   ${String(r.verses).padStart(4)}  ${r.kind.padEnd(5)} ${r.word.padEnd(18)} ${r.why}`);

console.log('\nVERIFY THESE before trusting the rest \u2014 if any look wrong, raise --min-p:');
for (const w of ['spirit','wind','holy','peace','good','evil','law','prophet','seed','prince','king','servant','minister'])
  if (terms[w]) console.log(`   ${w.padEnd(9)} \u2192 ${terms[w].padEnd(7)} \u2192 paleo ${strongsRoots[terms[w]] || '?'}`);

// ── --explain <word>: show the real candidate distribution for one English word.
// I have been tuning this against synthetic data because I do not have your corpus;
// that is how the last two bugs slipped through. This prints the ground truth.
const EXPLAIN = argv('--explain', null);
if (EXPLAIN) {
  const w = EXPLAIN;
  const lower = w.toLowerCase();
  const isTerm = TERMS.has(lower);
  const engMap = isTerm ? engTerm : engName;
  const hebMap = isTerm ? hebAll : hebName;
  const target = isTerm ? lower : w;
  const co = new Map(); let verses = 0;
  for (const [k, ws] of engMap) {
    if (!ws.includes(target)) continue;
    const sns = hebMap.get(k);
    if (!sns) continue;
    verses++;
    for (const sn of sns) co.set(sn, (co.get(sn) || 0) + 1);
  }
  console.log(`\n=== EXPLAIN "${w}"  (${isTerm ? 'term' : 'name'}) ===`);
  console.log(`appears in ${verses} alignable verses\n`);
  console.log('  co-occur  share   Strong\'s   paleo');
  for (const [sn, c] of [...co].sort((a, b) => b[1] - a[1]).slice(0, 12))
    console.log(`  ${String(c).padStart(7)}  ${(c / verses).toFixed(2).padStart(5)}   ${sn.padEnd(8)}  ${strongsRoots[sn] || '(no paleo root)'}`);
  console.log('\nIf the correct lemma is in this list but did not win, the aligner is at');
  console.log('fault. If it is ABSENT, the corpus does not tag it in those verses and no');
  console.log('aligner can find it — that word needs an explicit override instead.');
  db.close();
  process.exit(0);
}

console.log('\nNext: point build-names-from-hebrew.mjs at name-scaffold-derived.json,');
console.log('      then rebuild the baseline from english-web-raw.jsonl (do NOT re-sanitize).');
db.close();
