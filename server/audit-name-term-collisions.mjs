// audit-name-term-collisions.mjs
// Finds every name (nmpr/adjv-tagged Strong's with a Paleo root) that your renderer
// will SWALLOW into a term, the same way "Adam" (H121) became "adam (adam)": the name's
// KJV gloss contains a word that's in sacred-terms.txt, so the Strong's lands in TERM_SN,
// and apply-web-strongs (line 419) makes the term win over the name.
//
//   node audit-name-term-collisions.mjs        # report, sorted by how often it bites
//
// It mirrors apply-web-strongs's own GLOSS / TERMS / TERM_SN / NAMEY construction, so a
// collision it lists is a collision the renderer actually has. Fix each by removing the
// offending word from sacred-terms.txt (as you did with "adam"), or accept it.

import { readFileSync, existsSync } from 'node:fs';
import Database from 'better-sqlite3';

const die = m => { console.error('\u2717 ' + m); process.exit(1); };
const LEXF  = ['./strongs-hebrew-expanded.json', './strongs-hebrew.json'].find(existsSync) || die('strongs-hebrew(-expanded).json not found');
const ROOTF = ['./lexicon/strongs-roots.json', './strongs-roots.json'].find(existsSync) || die('strongs-roots.json not found');
const TERMS_F = './sacred-terms.txt';
if (!existsSync('./corpus.db')) die('corpus.db not found — run from server/');

const ROOTS = JSON.parse(readFileSync(ROOTF, 'utf8'));
const TERMS = new Set(readFileSync(TERMS_F, 'utf8').split(/\r?\n/)
  .map(l => l.trim().toLowerCase()).filter(l => l && !l.startsWith('#')));

// ── GLOSS from kjv_def — copied verbatim from apply-web-strongs.mjs ─────────────────
const normT = w => { w = w.toLowerCase().replace(/[^a-z]/g, '');
  if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
  if (/s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
  return w; };
const GLOSS = new Map();
{
  const LEX = JSON.parse(readFileSync(LEXF, 'utf8'));
  const expand = item => {
    const out = new Set();
    item = item.replace(/\[[^\]]*\]/g, ' ').trim();
    const pre = [...item.matchAll(/\(([a-zA-Z]+)-\)/g)].map(m => m[1].toLowerCase());
    const suf = [...item.matchAll(/\(-([a-zA-Z]+)\)/g)].map(m => m[1].toLowerCase());
    const st = item.replace(/\([^)]*\)/g, '').replace(/[^a-zA-Z \-]/g, ' ').trim();
    for (const raw of st.split(/\s+/).filter(w => w.length > 1)) {
      const b = raw.toLowerCase();
      if (b.includes('-')) { out.add(b.replace(/-/g, '')); for (const q of b.split('-')) if (q.length > 1) out.add(q); }
      else out.add(b);
      const base = b.replace(/-/g, '');
      for (const q of pre) out.add(q + base);
      for (const q of suf) { out.add(base + q); for (let k = Math.max(3, base.length - 4); k < base.length; k++) out.add(base.slice(0, k) + q); }
    }
    return out;
  };
  const nrm = w => { w = w.toLowerCase().replace(/[^a-z]/g, '');
    if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (/(sses|shes|ches|xes)$/.test(w)) return w.slice(0, -2);
    if (/s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w; };
  const GLOSS_STOP = new Set(['to','of','the','a','an','and','or','in','on','at','by','for',
    'with','from','as','that','which','it','is','be','was','are','were','him','his','her',
    'them','their','this','these','not','no','but','so','then','there','here','also','again',
    'moreover','very','more','most','much','many','such','same','other','any','some','one',
    'thing','things','used','use','only','even','yet','still','out','up','down','off','over',
    'under','into','upon','unto','causatively','figuratively','literally','properly','denominative']);
  for (const [sn, e] of Object.entries(LEX)) {
    const g = new Set();
    for (const it of String(e.kjv_def || '').split(/[,;.]/))
      for (const w of expand(it)) { const n = nrm(w); if (n.length > 1 && !GLOSS_STOP.has(n)) g.add(n); }
    GLOSS.set(sn, { set: g, kjv: e.kjv_def || '' });
  }
}

// TERM_SN + WHICH term words caused each (so you know what to remove) ────────────────
const TERM_SN = new Map();   // sn -> [culprit term words]
for (const [sn, { set: g }] of GLOSS) {
  const culprits = [...TERMS].filter(t => g.has(normT(t)));
  if (culprits.length) TERM_SN.set(sn, culprits);
}

// NAMEY + occurrence counts from tokens_bhs ─────────────────────────────────────────
const db = new Database('./corpus.db', { readonly: true });
const NAMEY = new Map();     // sn -> nmpr/adjv occurrence count
for (const r of db.prepare(
    "SELECT strongs, COUNT(*) n FROM tokens_bhs WHERE pos IN ('nmpr','adjv') AND strongs<>'' GROUP BY strongs").all())
  NAMEY.set(r.strongs, r.n);
db.close();

// Collisions: would-be name (NAMEY + root) that TERM_SN steals ───────────────────────
const rows = [];
for (const [sn, occ] of NAMEY) {
  if (!ROOTS[sn]) continue;                 // no root -> not swallowed (stays English)
  const culprits = TERM_SN.get(sn);
  if (!culprits) continue;                  // not a term Strong's -> renders as name, fine
  rows.push({ strongs: sn, occurrences: occ,
    name_gloss: (GLOSS.get(sn)?.kjv || '').slice(0, 40),
    swallowed_by: culprits.join(', ') });
}
rows.sort((a, b) => b.occurrences - a.occurrences);

console.log(`\nNames (nmpr/adjv + root) swallowed into terms: ${rows.length}`);
console.log('Each renders as "<term> (<gloss>)" instead of the bare name.\n');
if (rows.length) console.table(rows);
console.log('\nFix: remove the word under "swallowed_by" from sacred-terms.txt (as with "adam"),');
console.log('or accept it if you actually want that word transliterated everywhere.');
