// expand-lexicon.mjs — grow the generic Strong's lexicon until it covers YOUR text.
//
//   node expand-lexicon.mjs
//
// Two causes of "no gloss match", and they need different treatment:
//
//  1. HYPHENS. Strong's writes "Beth-el", "Beer-shebah", "Kirjath-jearim". Splitting
//     on word characters yields "beth"+"el" and the joined form is lost, so Bethel
//     (63x), Beersheba (31x), Kiriath (34x), Mizpah (40x) all "had no gloss" when
//     they plainly do. Fixed by keeping the de-hyphenated form as well.
//
//  2. GENUINELY MISSING WORDS. "Yahweh" (4,789x) is simply not in an 1894 KJV
//     wordlist — KJV says LORD/Jehovah. Same for "offspring" (KJV: seed), "Sheol"
//     (KJV: grave/hell). These are real modern renderings, and you were right: they
//     SHOULD be glosses. So we LEARN them from your corpus, using your own rule —
//
//        A word in a verse is always in that verse.
//
//     For an unmatched word W, take every verse where it failed. In each, look only
//     at tokens NOT already claimed by some other English word in that verse. The
//     Strong's that is present in EVERY one of those verses is what W renders.
//     Intersection over thousands of verses collapses to one answer — Yahweh appears
//     in 4,789 verses, and H3068 is the only token in all 4,789. Nothing else comes
//     close, so nothing is guessed.
//
//     A word whose intersection is empty renders SEVERAL lemmas; it is left for the
//     per-verse resolver, which already handles that. A word failing only once or
//     twice is genuine context ("filler"), not a missing gloss, and is reported.
//
// OUTPUT
//   strongs-hebrew-expanded.json   the generic lexicon + the learned glosses
//   lexicon-additions.json         ONLY what was added, with the evidence:
//                                    {word, strongs, verses, paleo} — your review list.
//                                  Nothing enters your curated lexicon unread.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const argv = (f,d) => { const i = process.argv.indexOf(f); return i>=0 ? process.argv[i+1] : d; };
const DB = argv('--db','./corpus.db'), ENG = argv('--eng','./english-web-raw.jsonl');
const TERMS_F = argv('--terms','./sacred-terms.txt'), LEX_F = argv('--lexicon','./strongs-hebrew.json');
const MIN = Number(argv('--min-verses', 3));     // below this it is context, not a gloss
const die = m => { console.error('\u2717 '+m); process.exit(1); };

let Database; try { ({default:Database} = await import('better-sqlite3')); }
catch { die('better-sqlite3 not found — run from server/'); }
for (const f of [DB,ENG,LEX_F]) if (!existsSync(f)) die('not found: '+f);
const rootsPath = ['./lexicon/strongs-roots.json','./strongs-roots.json'].find(existsSync);
if (!rootsPath) die('strongs-roots.json not found');
const ROOTS = JSON.parse(readFileSync(rootsPath,'utf8'));
const LEX   = JSON.parse(readFileSync(LEX_F,'utf8'));

const norm = w => { w = w.toLowerCase().replace(/[^a-z]/g,'');
  if (/ies$/.test(w)) return w.slice(0,-3)+'y';
  if (/(sses|shes|ches|xes)$/.test(w)) return w.slice(0,-2);
  if (/s$/.test(w) && !/ss$/.test(w)) return w.slice(0,-1);
  return w; };

function expandItem(item) {
  const out = new Set();
  item = item.replace(/\[[^\]]*\]/g,' ').trim();
  const pre = [...item.matchAll(/\(([a-zA-Z]+)-\)/g)].map(m=>m[1].toLowerCase());
  const suf = [...item.matchAll(/\(-([a-zA-Z]+)\)/g)].map(m=>m[1].toLowerCase());
  const stripped = item.replace(/\([^)]*\)/g,'').replace(/[^a-zA-Z \-]/g,' ').trim();
  for (const raw of stripped.split(/\s+/).filter(w=>w.length>1)) {
    const b = raw.toLowerCase();
    // FIX 1 — keep BOTH the hyphenated pieces and the joined form: Beth-el -> bethel
    if (b.includes('-')) { out.add(b.replace(/-/g,'')); for (const p of b.split('-')) if (p.length>1) out.add(p); }
    else out.add(b);
    const base = b.replace(/-/g,'');
    for (const p of pre) out.add(p+base);
    for (const s of suf) { out.add(base+s);
      for (let k=Math.max(3,base.length-4); k<base.length; k++) out.add(base.slice(0,k)+s); }
  }
  return out;
}
const GLOSS = new Map();
for (const [sn,e] of Object.entries(LEX)) {
  const s = new Set();
  for (const src of [e.kjv_def, e.strongs_def]) { if (!src) continue;
    for (const item of String(src).split(/[,;.]/)) for (const w of expandItem(item)) s.add(norm(w)); }
  GLOSS.set(sn, s);
}

const TERMS = existsSync(TERMS_F)
  ? new Set(readFileSync(TERMS_F,'utf8').split(/\r?\n/).map(l=>l.trim().toLowerCase())
      .filter(l=>l&&!l.startsWith('#')).map(norm)) : new Set();

const db = new Database(DB,{readonly:true});
const toks = new Map();
for (const t of db.prepare(`SELECT book_id,chapter,verse,strongs,pos FROM tokens_bhs
    WHERE strongs IS NOT NULL AND strongs<>'' AND pos<>'punct' AND verse>0`).all()) {
  const sn = 'H'+String(t.strongs).replace(/^H+/,'');
  if (/^H9[0-9]{3}$/.test(sn)) continue;
  const k = `${t.book_id}:${t.chapter}:${t.verse}`;
  if (!toks.has(k)) toks.set(k,[]);
  if (!toks.get(k).some(x => x.sn === sn)) toks.get(k).push({ sn, pos: t.pos });
}
db.close();

const CODE2ID = {GEN:1,EXOD:2,LEV:3,NUM:4,DEUT:5,JOSH:6,JUDG:7,RUTH:8,'1SAM':9,'2SAM':10,
 '1KGS':11,'2KGS':12,'1CHR':13,'2CHR':14,EZRA:15,NEH:16,EST:17,JOB:18,PSA:19,PROV:20,ECCL:21,
 SONG:22,ISA:23,JER:24,LAM:25,EZK:26,DAN:27,HOS:28,JOEL:29,AMO:30,OBA:31,JONAH:32,MIC:33,
 NAM:34,HAB:35,ZEP:36,HAG:37,ZEC:38,MAL:39};
const rows = readFileSync(ENG,'utf8').split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l));
const everLower = new Set();
for (const r of rows) for (const m of r.text.matchAll(/\b[a-z]{2,}\b/g)) everLower.add(m[0]);

// ── Pass 1 — CLAIM, then ELIMINATE under a PART-OF-SPEECH constraint ────────
//
// Two earlier versions of this learner were wrong, both instructively:
//
//  v1 let only your terms/names claim tokens, so ordinary Hebrew words (ben "son",
//     bo "come", lo "not") stayed in the leftover pool. In genealogies ben is in
//     EVERY verse, so it won: Elkanah -> H1121 ("son"). Nonsense.
//
//  v2 let every English word claim, but claiming was not exclusive — "Lord" glosses
//     BOTH H136 and H3068, so it claimed both, freed H3068, and left neum (H5002) as
//     the sole leftover, which then got credited to "Yahweh". Yahweh ended up
//     "learning" twenty Strong's including H929 ("beast"). Also nonsense.
//
// What both missed is a constraint already sitting in your tokens: PART OF SPEECH.
// "Yahweh" is a proper noun; it can only ever be an nmpr token. A sacred term is a
// content word; it can only be subs/verb/adjv/nmpr. Once the leftover pool is
// filtered by POS, the answer falls out with no voting at all:
//
//     Psalm 119:  Yahweh -> H3068  x19, unanimous.   (v2 gave twenty candidates)
//                 statutes -> H5713 (edah) — the very gap we set out to close.
//
// And we only LEARN for the words you care about. Function words ("your", "me",
// "according") still CLAIM their tokens — that is what makes elimination work — but
// they never vote, because they are not names and not terms.
const MIN_EV = Number(argv('--min-evidence', 2));
const CONTENT = new Set(['subs','verb','adjv','nmpr']);
// Closed-class English words that are capitalized yet are plainly not names.
const NOT_A_NAME = new Set(['I','O','A','An','The','My','Your','His','Her','Their','Our','He','She','It','We','They','You','Me','Him','Them','Us','This','That','These','Those']);

const votes = new Map();      // "word\u0000SN" -> verses where SN was the sole POS-legal leftover
const seen  = new Map();      // word -> verses where it had no gloss at all

for (const r of rows) {
  const bid = CODE2ID[r.code]; if (!bid) continue;
  const k = `${bid}:${r.chapter}:${r.verse}`;
  const T = toks.get(k); if (!T) continue;

  const body = r.text.replace(/(^|[.!?;:\u201C\u2018]\s*)\S+/g,' ');
  const names = new Set();
  for (const m of body.matchAll(/\b[A-Z][a-zA-Z]+\b/g))
    if (!everLower.has(m[0].toLowerCase()) && !NOT_A_NAME.has(m[0]) && m[0].length > 2) names.add(m[0]);

  const allWords = [...r.text.matchAll(/\b[A-Za-z]+\b/g)].map(m => m[0]);

  // EVERY word claims whatever it glosses — including function words. This is what
  // empties the pool of the tokens that are already accounted for.
  const claimed = new Set();
  for (const w of allWords) {
    const n = norm(w);
    for (const t of T) if (GLOSS.get(t.sn)?.has(n)) claimed.add(t.sn);
  }

  // Only YOUR words vote.
  for (const w of allWords) {
    const isName = names.has(w);
    const isTerm = TERMS.has(norm(w));
    if (!isName && !isTerm) continue;
    if (T.some(t => GLOSS.get(t.sn)?.has(norm(w)))) continue;      // already glossed
    seen.set(w, (seen.get(w) || 0) + 1);

    const pool = T.filter(t => !claimed.has(t.sn) && ROOTS[t.sn] &&
                               (isName ? t.pos === 'nmpr' : CONTENT.has(t.pos)));
    if (pool.length === 1) {
      const key = w + '\u0000' + pool[0].sn;
      votes.set(key, (votes.get(key) || 0) + 1);
    }
  }
}

const learned = [], stillOpen = [];
const best = new Map();
for (const [key, n] of votes) {
  const [w, sn] = key.split('\u0000');
  if (!best.has(w)) best.set(w, []);
  best.get(w).push({ sn, n });
}
for (const [w, total] of seen) {
  const cands = (best.get(w) || []).filter(c => c.n >= MIN_EV).sort((a,b) => b.n - a.n);
  if (!cands.length) {
    stillOpen.push({ word: w, verses: total,
      why: 'never the sole part-of-speech-legal leftover in >=' + MIN_EV + ' verses' });
    continue;
  }
  for (const c of cands)
    learned.push({ word: w, strongs: c.sn, evidence: c.n, verses: total, paleo: ROOTS[c.sn] || '' });
}
learned.sort((a,b) => b.evidence - a.evidence);

// write the expanded lexicon
const OUT = JSON.parse(JSON.stringify(LEX));
for (const L of learned) {
  const e = OUT[L.strongs] ||= { kjv_def:'' };
  e.kjv_def = String(e.kjv_def||'') + (e.kjv_def ? ', ' : '') + L.word.toLowerCase();
  e.learned = [...(e.learned||[]), L.word];
}
writeFileSync('strongs-hebrew-expanded.json', JSON.stringify(OUT));
writeFileSync('lexicon-additions.json', JSON.stringify({ learned, stillOpen }, null, 1));

console.log(`words with no gloss (after the hyphen fix): ${seen.size}`);
console.log(`LEARNED from your corpus                  : ${learned.length}`);
console.log(`left open (reported, not guessed)         : ${stillOpen.length}\n`);
console.log('  evidence  of    word            -> Strong\'s  paleo');
console.log('  (evidence = verses where this token was the ONLY one left unexplained)');
for (const L of learned.slice(0,30))
  console.log(`  ${String(L.evidence).padStart(8)}  ${String(L.verses).padStart(4)}  ${L.word.padEnd(15)} -> ${L.strongs.padEnd(7)} ${L.paleo}`);
console.log('\nstrongs-hebrew-expanded.json written.');
console.log('lexicon-additions.json lists EVERY addition with its evidence — review it,');
console.log('then re-run:  node build-verse-token-map.mjs --lexicon strongs-hebrew-expanded.json');
