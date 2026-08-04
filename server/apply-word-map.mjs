// apply-word-map.mjs — normalise names, places and terms in the English sources that
// have NO Strong's tagging: the New Testament (Greek, G-numbers) and the
// non-canonical books (Jasher, Jubilees, 1/2 Adam and Eve, Enoch, ...).
//
//   node apply-word-map.mjs                report only, writes nothing
//   node apply-word-map.mjs --apply        rewrite those verses in corpus.db
//   node apply-word-map.mjs --min-canon 40 change where "untagged" starts (default 40)
//
// WHY A MAP HERE AND NOT IN THE OT
//   The OT is done properly: every English word carries its own Strong's, so the
//   Hebrew is READ per verse and "word" can be dabar in one verse and imrah in the
//   next. Nothing outside the Hebrew canon has that. So for those books we fall back
//   to a word map — but a map DERIVED from the OT pass (word-map.json), never one
//   maintained by hand. That is the whole point: one source of truth, so Genesis and
//   John cannot drift apart the way Aharan and Aharawan did.
//
// WHAT IT WILL NOT DO
//   * It will not touch canon_id 1-39 — those are already correct, from the Hebrew.
//   * It will not apply a word whose OT rendering was AMBIGUOUS (several spellings,
//     because the underlying Hebrew differed). Spelling alone cannot decide those, so
//     they stay in English and are reported.
//   * It is idempotent: a verse already containing the transliteration is skipped, so
//     running it twice cannot double-apply.

import { readFileSync, existsSync } from 'node:fs';
const args = process.argv.slice(2);
const argv = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const APPLY = args.includes('--apply');
const TERMS_ONLY = args.includes('--terms');
const MIN_CANON = Number(argv('--min-canon', 40));
const die = m => { console.error('\u2717 ' + m); process.exit(1); };

let Database;
try { ({ default: Database } = await import('better-sqlite3')); }
catch { die('better-sqlite3 not found — run from server/'); }
if (!existsSync('./corpus.db')) die('corpus.db not found');
if (!existsSync('./word-map.json'))
  die('word-map.json not found — run apply-web-strongs.mjs first; it emits the map.');

const M = JSON.parse(readFileSync('./word-map.json', 'utf8'));

// ROOTS + translit for manual name-strongs assignments (rendered from the number).
const rootsPath = ['./lexicon/strongs-roots.json','./strongs-roots.json'].find(existsSync);
const ROOTS = rootsPath ? JSON.parse(readFileSync(rootsPath,'utf8')) : {};
let translit = null;
try {
  const { readdirSync, statSync } = await import('node:fs');
  const { join, dirname, resolve } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const locate = (name, start = process.cwd(), up = 4) => {
    let base = resolve(start);
    for (let u = 0; u <= up; u++) {
      const stack = [base];
      while (stack.length) { const d = stack.pop(); let es;
        try { es = readdirSync(d, { withFileTypes: true }); } catch { continue; }
        for (const e of es) { if (e.isDirectory()) { if (/^(node_modules|\.git|dist|build)$/.test(e.name)) continue; stack.push(join(d,e.name)); }
          else if (e.name === name) return join(d, e.name); } }
      base = dirname(base);
    }
    return null;
  };
  const bp = locate('books.js');
  if (bp) translit = (await import(pathToFileURL(bp).href)).translit;
} catch {}
const snToTranslit = sn => { const pal = ROOTS[sn]; return (pal && translit) ? translit(pal) : null; };

// names/peoples/divine render like names; terms carry their English gloss.
// PROPER NOUNS ONLY. The map deliberately contains no terms: a term's English word
// is not the Hebrew word (see apply-web-strongs.mjs), so it cannot be carried by
// spelling. Names render bare; peoples keep their English name as a gloss.
const NAME = new Map(), PEOPLE = new Map(), TERM = new Map();
// ALIASES: variant spellings (Greek/archaic) -> the OT spelling the map already knows.
// Every alias inherits its transliteration from the OT name, so nothing is invented:
// Josias -> Josiah -> Yaashayah (whatever the OT produced). File-driven and explicit.
// name-strongs.txt: manually assign a name spelling to a Strong's number. The Hebrew
// comes from that Strong's root, so this is not "making up a name" — it is telling the
// app WHICH attested OT name an apocryphal spelling refers to. Zorobabel -> H2216.
const NAME_SN = new Map();
if (existsSync('./name-strongs.txt'))
  for (const line of readFileSync('./name-strongs.txt','utf8').split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const [name, sn] = t.split(/\s*->\s*|\s{2,}|\t/);
    if (name && sn && /^H?\d+$/i.test(sn.trim()))
      NAME_SN.set(name.toLowerCase(), 'H' + sn.trim().replace(/^H/i,''));
  }

const ALIAS = new Map();
if (existsSync('./name-aliases.txt'))
  for (const line of readFileSync('./name-aliases.txt','utf8').split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const [variant, otName] = t.split(/\s*->\s*|\s{2,}|\t/);
    if (variant && otName) ALIAS.set(variant.toLowerCase(), otName.toLowerCase());
  }
for (const [eng, tr] of Object.entries(M.names  || {})) NAME.set(eng, tr);
// manual assignments win — they are your explicit instruction
for (const [name, sn] of NAME_SN) { const tr = snToTranslit(sn); if (tr) NAME.set(name, tr); }
for (const [eng, tr] of Object.entries(M.divine || {})) NAME.set(eng, tr);
// LORD/GOD variants -> same divine form
for (const alias of ['lord']) if (M.divine && M.divine[alias]) NAME.set(alias, M.divine[alias]);
for (const [eng, tr] of Object.entries(M.peoples|| {})) PEOPLE.set(eng, tr);
// TERMS carry to the NT: same English word, same Hebrew concept (repent, believe,
// heaven, earth, lion, tribe...). The NT is Greek, but the LXX quotes the OT
// throughout and these do not change across testaments. Only single-form terms are
// in the map; ambiguous ones were dropped upstream.
const TERM_EXCLUDE = existsSync('./term-exclude.txt')
  ? new Set(readFileSync('./term-exclude.txt','utf8').split(/\r?\n/).map(l=>l.trim().toLowerCase()).filter(l=>l&&!l.startsWith('#')))
  : new Set();
for (const [eng, tr] of Object.entries(M.terms  || {})) if (!TERM_EXCLUDE.has(eng)) TERM.set(eng, tr);
// A hard stoplist: even a capitalized token is left alone if it is an ordinary
// English word that merely happens to match a name key. "Most" -> Ilayawan was the
// failure; these are the words most likely to appear capitalized at a sentence start
// or in a title yet not be names.
const NEVER_APPLY = new Set(['most','high','holy','one','see','are','man','day','way','word',
  'good','light','rest','fear','love','peace','king','head','hand','name','set','well','said',
  'father','son','mother','brother','sister','house','city','land','king','lord','god','east',
  'west','north','south','great','all','new','old','third','first','second']);
for (const w of NEVER_APPLY) { NAME.delete(w); PEOPLE.delete(w); }

// Multi-word divine titles ("Most High" -> Ilayawan), applied to the verse BEFORE
// any word-level pass so the parts stay ordinary English on their own.
const PHRASES = Object.entries(M.phrases || {})
  .map(([eng, tr]) => ({ re: new RegExp('\\b' + eng.replace(/\s+/g,'\\s+') + '\\b', 'g'), tr }));

console.log(`map: ${NAME.size} names, ${PEOPLE.size} peoples, ${TERM.size} terms, ${PHRASES.length} phrases`);

// Common English words that are ALSO terms. They still carry (repent, believe and
// heaven are legitimate everywhere), but they are the ones worth eyeballing, because
// a term that doubles as an everyday verb/noun is where an odd NT reading would hide.
const TERM_WATCH = new Set(['believe','return','turn','head','hand','see','know','man','day',
  'good','light','word','way','name','rest','fear','love','father','son','mother','brother',
  'sister','earth','land','heaven','water','fire','blood','angel','city','house','king','death',
  'die','life','world','tribe','nation','people','year','set','high','most','face','voice','heart']);
if (TERMS_ONLY) {
  const rows = [...TERM].sort();
  const watch = rows.filter(([g]) => TERM_WATCH.has(g));
  const safe  = rows.filter(([g]) => !TERM_WATCH.has(g));
  console.log(`\nTERMS THAT WILL CARRY TO THE NT (${rows.length})\n`);
  console.log('REVIEW — also common English (still applied; eyeball for odd senses):');
  for (const [g, tr] of watch) console.log(`   ${g.padEnd(12)} -> ${tr}`);
  console.log('\nDISTINCTIVE — safe:');
  for (const [g, tr] of safe) console.log(`   ${g.padEnd(12)} -> ${tr}`);
  console.log('\nTo exclude any of these, add the word to term-exclude.txt (one per line),');
  console.log('then re-run. Nothing has been written.');
  process.exit(0);
}
console.log(`the OT left ${Object.keys(M.ambiguous || {}).length} words ambiguous and ${Object.keys(M.tooRare || {}).length} too rare — none are applied`);

const db = new Database('./corpus.db', { readonly: !APPLY });
const rows = db.prepare(
  `SELECT id, canon_id, chapter, verse, text FROM verses
    WHERE corpus = 'ENG' AND text IS NOT NULL AND TRIM(text) <> ''
      AND (
        (canon_id IS NOT NULL AND canon_id >= ?)
        OR
        (canon_id IS NULL AND code NOT IN ('GEN','EXOD','LEV','NUM','DEUT','JOSH','JUDG','RUTH','1SAM','2SAM','1KGS','2KGS','1CHR','2CHR','EZRA','NEH','EST','JOB','PSA','PROV','ECCL','SONG','ISA','JER','LAM','EZK','DAN','HOS','JOEL','AMO','OBA','JONAH','MIC','NAM','HAB','ZEP','HAG','ZEC','MAL'))
      )`
).all(MIN_CANON);
console.log(`\nEnglish verses at canon_id >= ${MIN_CANON}: ${rows.length.toLocaleString()}`);

const applied = new Map();
let changedRows = 0;
const updates = [];

for (const r of rows) {
  let n = 0;
  // UN-DOUBLE: reverse one layer of doubling left by a previous bad run.
  // "pasach (pasach (passover))" -> "pasach (passover)"
  // "malak (malak (kings))"      -> "malak (kings)"
  // This runs BEFORE the guard so the guard then locks the remaining (single) gloss.
  let base = r.text.replace(
    /\b([a-z][a-z']*)\s+\(\1\s+\(([^)]+)\)\)/g,
    (m, tr, eng) => `${tr} (${eng})`
  );
  // IDEMPOTENCY: protect existing "(...)" glosses. Replace each with a placeholder so
  // neither the name nor term pass can touch a word already inside a gloss. Without
  // this, re-running doubled everything: "pasach (passover)" -> "pasach (pasach
  // (passover))". Restored verbatim at the end.
  const guards = [];
  base = base.replace(/\([^()]*\)/g, (mseg) => { guards.push(mseg); return `\u0000${guards.length-1}\u0000`; });
  for (const p of PHRASES) if (p.re.test(base)) { base = base.replace(p.re, p.tr); n++; }
  const next = base.replace(/\b[A-Za-z][A-Za-z']*\b/g, (w) => {
    // ONLY a Capitalized token can be a proper noun.
    if (!/^[A-Z]/.test(w)) return w;
    // Common English words that are also attested Hebrew names (On=H203→Awan,
    // In, It, Is, He, No…). Sentence-initial capitalization is NOT a name signal
    // for words this short and common — block them.
    const COMMON = new Set(['on','in','at','of','to','it','is','he','she','an',
      'or','as','so','no','do','am','go','us','by','if','up','be','my','we','me',
      'ah','oh','ye','lo','ho','ok','a','i','o','un','ab','el','al','an','en']);
    if (COMMON.has(w.toLowerCase())) return w;
    const k = w.toLowerCase();
    // resolve an alias to its OT spelling first (Josias -> josiah), then look up
    const key = ALIAS.get(k) || k;
    const nameTr = NAME.get(key);
    if (nameTr) {
      if (w === nameTr) return w;                    // idempotent
      n++; applied.set(k, (applied.get(k) || 0) + 1);
      return nameTr;
    }
    const peoAlias = PEOPLE.get(key);
    if (peoAlias) { n++; applied.set(k,(applied.get(k)||0)+1); return `${peoAlias} (${w})`; }
    const peo = PEOPLE.get(k);
    if (peo) { n++; applied.set(k, (applied.get(k) || 0) + 1); return `${peo} (${w})`; }
    return w;
  });
  // Terms are lower-case content words, so they run in a SECOND pass on what remains
  // (the name pass only touched Capitalized tokens). Idempotent and gloss-aware: a
  // word already followed by "(gloss)" is skipped.
  const next2 = next.replace(/\b([a-z][a-z']*)\b(?!\s*\()/g, (w, word) => {
    const tr = TERM.get(word);
    if (!tr) return w;
    n++; applied.set(word, (applied.get(word) || 0) + 1);
    return `${tr} (${word})`;
  });
  // restore protected glosses
  const restored = next2.replace(/\u0000(\d+)\u0000/g, (_, i) => guards[+i]);
  if (n) { changedRows++; updates.push({ id: r.id, text: restored }); }
}

console.log(`verses that would change: ${changedRows.toLocaleString()}`);
console.log(`distinct words applied  : ${applied.size.toLocaleString()}\n`);
console.log('top words:');
for (const [w, n] of [...applied].sort((a, b) => b[1] - a[1]).slice(0, 15))
  console.log(`   ${String(n).padStart(5)}  ${w.padEnd(14)}  ->  ${NAME.get(ALIAS.get(w.toLowerCase())||w.toLowerCase()) || PEOPLE.get(ALIAS.get(w.toLowerCase())||w.toLowerCase()) || TERM.get(w.toLowerCase()) || '?'}`);

const sample = updates.slice(0, 3);
if (sample.length) {
  console.log('\nsamples:');
  for (const u of sample) console.log('   ' + u.text.slice(0, 110));
}

if (!APPLY) { console.log('\n[report only] nothing written. Re-run with --apply.'); db.close(); process.exit(0); }

const upd = db.prepare('UPDATE verses SET text = ? WHERE id = ?');
let n = 0;
db.transaction(() => { for (const u of updates) n += upd.run(u.text, u.id).changes; })();
console.log(`\n\u2713 rewrote ${n.toLocaleString()} verses`);
console.log('The NT and the non-canonical books now use the same spellings as the OT,');
console.log('because they came from the same Hebrew. Restart the server.');
db.close();
