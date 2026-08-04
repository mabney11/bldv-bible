// build-verse-name-map.mjs — DETERMINISTIC name/term resolution. No probabilities.
//
//   node build-verse-name-map.mjs
//
// THE RULE (yours): a word that is in a verse is ALWAYS in that verse.
//   So if English word W renders Hebrew lemma L, then L must appear in EVERY verse
//   where W appears. Candidates = the INTERSECTION of the lemma sets of all those
//   verses. Nothing is scored, ranked, or guessed.
//
//   |intersection| == 1  ->  settled globally.        law -> H8451
//   |intersection| == 0  ->  W renders SEVERAL lemmas (Psalm 119 alone uses eight
//                            words for the law; WEB prints "word" for both dabar
//                            H1697 and imrah H565). A global word->Strong's map
//                            CANNOT express that, which is why every earlier
//                            attempt failed. Resolve PER VERSE instead: take the
//                            minimal set of lemmas covering all of W's verses, then
//                            in each verse pick the one actually present.
//   still ambiguous      ->  REPORTED by verse, never guessed.
//
// This only works because the corpus verse numbering is now correct. It is not
// robust to an off-by-one: run ingest-bhs-oshb.py first.
//
// OUTPUT
//   verse-name-map.json   { global: {word: SN}, byVerse: {"canon:ch:v": {word: SN}},
//                           roots: {SN: paleo} }
//   verse-name-residue.json  every unresolved occurrence, with its verse
//
// It prints a PSALM 119 PROOF TABLE — the chapter you chose as the baseline — so
// you can see the method is right before it touches anything.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const argv = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const DB      = argv('--db', './corpus.db');
const ENG     = argv('--eng', './english-web-raw.jsonl');
const TERMS_F = argv('--terms', './sacred-terms.txt');
const die = m => { console.error('\u2717 ' + m); process.exit(1); };

let Database;
try { ({ default: Database } = await import('better-sqlite3')); }
catch { die('better-sqlite3 not found \u2014 run from server/'); }
for (const f of [DB, ENG]) if (!existsSync(f)) die(`not found: ${f}`);

const rootsPath = ['./lexicon/strongs-roots.json', './strongs-roots.json'].find(existsSync);
if (!rootsPath) die('strongs-roots.json not found');
const ROOTS = JSON.parse(readFileSync(rootsPath, 'utf8'));

const CODE2ID = { GEN:1,EXOD:2,LEV:3,NUM:4,DEUT:5,JOSH:6,JUDG:7,RUTH:8,'1SAM':9,'2SAM':10,
  '1KGS':11,'2KGS':12,'1CHR':13,'2CHR':14,EZRA:15,NEH:16,EST:17,JOB:18,PSA:19,PROV:20,
  ECCL:21,SONG:22,ISA:23,JER:24,LAM:25,EZK:26,DAN:27,HOS:28,JOEL:29,AMO:30,OBA:31,
  JONAH:32,MIC:33,NAM:34,HAB:35,ZEP:36,HAG:37,ZEC:38,MAL:39 };

const TERMS = existsSync(TERMS_F)
  ? new Set(readFileSync(TERMS_F,'utf8').split(/\r?\n/).map(l=>l.trim().toLowerCase())
      .filter(l=>l && !l.startsWith('#')))
  : new Set();

// ── Hebrew: lemma set per verse. Virtual Strong's (H9000-H9099) are prefix and
// suffix MORPHEMES, not words — they can never be a name or a term. verse=0 is a
// psalm superscription, not verse text, so it is excluded from verse matching.
const db = new Database(DB, { readonly: true });
const lemmas = new Map();                       // "canon:ch:v" -> Set(SN)
for (const t of db.prepare(
  `SELECT book_id, chapter, verse, strongs FROM tokens_bhs
    WHERE strongs IS NOT NULL AND strongs <> '' AND pos <> 'punct' AND verse > 0`).all()) {
  const sn = 'H' + String(t.strongs).replace(/^H+/, '');
  if (/^H9[0-9]{3}$/.test(sn)) continue;
  const k = `${t.book_id}:${t.chapter}:${t.verse}`;
  if (!lemmas.has(k)) lemmas.set(k, new Set());
  lemmas.get(k).add(sn);
}
db.close();
console.log(`Hebrew verses with lemmas: ${lemmas.size.toLocaleString()}`);

// How many verses each lemma occurs in, corpus-wide. This is what lets us reject
// grammatical particles deterministically (see EXCESS below).
const snTotal = new Map();
for (const [, L] of lemmas) for (const sn of L) snTotal.set(sn, (snTotal.get(sn) || 0) + 1);

// ── English: which verses each word occurs in ────────────────────────────────
const rows = readFileSync(ENG,'utf8').split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l));
const everLower = new Set();
for (const r of rows) for (const m of r.text.matchAll(/\b[a-z]{2,}\b/g)) everLower.add(m[0]);

const versesOf = new Map();                     // word -> [verseKey]
for (const r of rows) {
  const bid = CODE2ID[r.code];
  if (!bid) continue;                           // NT: no Hebrew tokens to match against
  const k = `${bid}:${r.chapter}:${r.verse}`;
  if (!lemmas.has(k)) continue;
  const hit = new Set();
  // names: capitalized, not sentence-initial, never seen lowercase anywhere
  const body = r.text.replace(/(^|[.!?;:\u201C\u2018]\s*)\S+/g, ' ');
  for (const m of body.matchAll(/\b[A-Z][a-zA-Z]+\b/g))
    if (!everLower.has(m[0].toLowerCase())) hit.add(m[0]);
  // terms: from your list, plural-tolerant, keyed lowercase
  for (const m of r.text.matchAll(/\b[A-Za-z]{2,}\b/g)) {
    const w = m[0].toLowerCase();
    const base = TERMS.has(w) ? w
      : (w.endsWith('es') && TERMS.has(w.slice(0,-2))) ? w.slice(0,-2)
      : (w.endsWith('s')  && TERMS.has(w.slice(0,-1))) ? w.slice(0,-1) : null;
    if (base) hit.add(base);
  }
  for (const w of hit) {
    if (!versesOf.has(w)) versesOf.set(w, []);
    versesOf.get(w).push(k);
  }
}

// ── resolve ──────────────────────────────────────────────────────────────────
const global_ = {}, byVerse = {}, residue = [];
let settled = 0, perVerse = 0, unresolved = 0;

for (const [w, vs] of versesOf) {
  // INTERSECTION: the lemma must be in every verse the word appears in.
  let inter = null;
  for (const k of vs) {
    const L = lemmas.get(k);
    inter = inter === null ? new Set(L) : new Set([...inter].filter(x => L.has(x)));
    if (!inter.size) break;
  }
  const cand = [...(inter || [])].filter(sn => ROOTS[sn]);

  if (cand.length === 1) { global_[w] = cand[0]; settled++; continue; }

  // ── CANDIDACY: two set facts, no scoring ───────────────────────────────────
  //   cov(L)    = verses where W and L both appear
  //   excess(L) = verses where L appears WITHOUT W
  //
  // A lemma L is a plausible rendering of W only if  excess(L) < cov(L)  — it turns
  // up WITH the word more often than without it. That single test kills both failure
  // modes seen so far:
  //   * grammatical particles — kol H3605, lo H3808, et H853, asher H834, and
  //     Yahweh H3068 sit in nearly every verse, so their excess is enormous.
  //     (law: H8451 excess 1 vs H3605 excess 24.) The old cover was greedy by
  //     COVERAGE, which picked exactly these, and produced 51% with 30,518
  //     "both present" collisions.
  //   * hapax noise — a lemma occurring once, inside one of W's verses, has
  //     excess 0 and looked "perfectly specific" when ranking by excess alone.
  //     It covered one verse and starved the real lemma. A TERM recurs by nature,
  //     so a term's lemma must have cov >= 2; a NAME may legitimately be unique
  //     (Kadmonite occurs once in the whole bible), so cov >= 1 is allowed there.
  const isTerm = TERMS.has(w);
  const cov = sn => { let c = 0; for (const k of vs) if (lemmas.get(k).has(sn)) c++; return c; };

  const pool = new Map();
  for (const k of vs) for (const sn of lemmas.get(k)) {
    if (!ROOTS[sn] || pool.has(sn)) continue;
    const c = cov(sn), e = (snTotal.get(sn) || 0) - c;
    if (e < c && c >= (isTerm ? 2 : 1)) pool.set(sn, { cov: c, excess: e });
  }

  // Single lemma in every verse of W -> settled globally.
  if (cand.length >= 1) {
    const ok = cand.filter(sn => pool.has(sn));
    if (ok.length === 1) { global_[w] = ok[0]; settled++; continue; }
    if (ok.length > 1) {
      const rk = ok.map(sn => ({ sn, ...pool.get(sn) })).sort((a,b) => a.excess - b.excess);
      if (rk[0].excess < rk[1].excess) { global_[w] = rk[0].sn; settled++; continue; }
    }
  }

  // W renders SEVERAL lemmas (Psalm 119 prints "word" for both dabar H1697 and
  // imrah H565). Cover W's verses with the plausible lemmas, widest first.
  // NOTHING IS FORCE-COVERED: if a verse has no plausible lemma it is REPORTED.
  // Filling leftovers with whatever was handy is how junk (H1215, H1952, H7737)
  // got into the covers and was counted as "resolved" — confidently wrong is worse
  // than honestly unknown.
  const uncovered = new Set(vs);
  const cover = [];
  for (const [sn] of [...pool.entries()].sort((a,b) => b[1].cov - a[1].cov || a[1].excess - b[1].excess)) {
    if (!uncovered.size) break;
    let helps = false;
    for (const k of uncovered) if (lemmas.get(k).has(sn)) { helps = true; break; }
    if (!helps) continue;
    cover.push(sn);
    for (const k of [...uncovered]) if (lemmas.get(k).has(sn)) uncovered.delete(k);
  }

  for (const k of vs) {
    const present = cover.filter(sn => lemmas.get(k).has(sn))
      .map(sn => ({ sn, ...pool.get(sn) }))
      .sort((a, b) => b.cov - a.cov || a.excess - b.excess);
    if (present.length === 1 || (present.length > 1 && present[0].cov > present[1].cov)) {
      (byVerse[k] ||= {})[w] = present[0].sn; perVerse++;
    } else {
      residue.push({ word: w, verse: k,
                     candidates: present.map(p => p.sn),
                     why: present.length ? 'tie' : 'no plausible lemma in this verse' });
      unresolved++;
    }
  }
}

const usedRoots = {};
for (const sn of Object.values(global_)) usedRoots[sn] = ROOTS[sn];
for (const m of Object.values(byVerse)) for (const sn of Object.values(m)) usedRoots[sn] = ROOTS[sn];

writeFileSync('verse-name-map.json', JSON.stringify({ global: global_, byVerse, roots: usedRoots }, null, 1));
writeFileSync('verse-name-residue.json', JSON.stringify(residue, null, 1));

const total = settled + perVerse + unresolved;
console.log(`\nsettled globally (one lemma, every verse) : ${settled.toLocaleString()} words`);
console.log(`resolved per verse (multi-lemma words)   : ${perVerse.toLocaleString()} occurrences`);
console.log(`UNRESOLVED (reported, never guessed)     : ${unresolved.toLocaleString()}`);
console.log(`                                           ${(100*(settled+perVerse)/total).toFixed(2)}% resolved`);

// ── PSALM 119 PROOF ──────────────────────────────────────────────────────────
console.log('\n=== PSALM 119 PROOF (your baseline chapter) ===');
const ps = ['law','statutes','precepts','commandments','ordinances','testimonies','word','words','promise'];
for (const w of ps) {
  if (global_[w]) { console.log(`  ${w.padEnd(13)} -> ${global_[w].padEnd(7)} ${ROOTS[global_[w]]||''}   (settled globally)`); continue; }
  const seen = new Map();
  for (let v = 1; v <= 176; v++) {
    const sn = byVerse[`19:119:${v}`]?.[w];
    if (sn) seen.set(sn, (seen.get(sn)||0)+1);
  }
  if (seen.size) console.log(`  ${w.padEnd(13)} -> ` +
    [...seen].map(([sn,n]) => `${sn} ${ROOTS[sn]||''} \u00d7${n}`).join('  |  ') + '   (per verse)');
}
const psAmb = residue.filter(r => r.verse.startsWith('19:119:'));
console.log(`\n  Psalm 119 unresolved occurrences: ${psAmb.length}`);
for (const r of psAmb) console.log(`     v${r.verse.split(':')[2]}  "${r.word}"  both present: ${r.candidates.join(', ')}`);
console.log('\nverse-name-map.json written. Nothing has been applied to the corpus yet.');
