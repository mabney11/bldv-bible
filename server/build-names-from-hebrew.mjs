// build-names-from-hebrew.mjs  —  RUN ON YOUR MACHINE (Node ES module).
//
//   node build-names-from-hebrew.mjs
//
// Auto-locates YOUR books.js and strongs-roots.json anywhere in the project, so
// you don't set any paths. Every transliterated form is produced by YOUR
// translit() applied to the paleo root in strongs-roots.json — nothing precomputed
// off-machine. Keyed on Strong's, so Rachel H7354 (𐤓𐤇𐤋 → Rachal, Chet="ch") and the
// town Rachal H7403 (𐤓𐤊𐤋 → Rakal, Kaph="k") never collide; and it's idempotent, so
// already-correct text ("Rachal") is left alone rather than re-read into "Rakal".
//
// Needs, in the SAME folder as this script: name-scaffold.json (spellings↔Strong's
// only — no transliterations). Writes name-map-expanded.json next to this script.

import { readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const die = m => { console.error('✗ ' + m); process.exit(1); };

// ── locate a file by name anywhere under the project root ─────────────────────
function projectRoot(start) {
  // the repo root holds BOTH src/ and server/ — this skips server/'s own
  // package.json (which would trap the search inside server/, missing src/lib).
  let d = start;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(d, 'src')) && existsSync(join(d, 'server'))) return d;
    const up = dirname(d); if (up === d) break; d = up;
  }
  // fallbacks: highest ancestor with .git or a src/ folder
  d = start;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(d, '.git')) || existsSync(join(d, 'src'))) return d;
    const up = dirname(d); if (up === d) break; d = up;
  }
  return start;
}
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.vite', '.next', 'coverage', '.cache', 'out']);
function findAll(root, name, out = [], depth = 0) {
  if (depth > 7) return out;
  let ents; try { ents = readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (e.isDirectory()) { if (!SKIP.has(e.name)) findAll(join(root, e.name), name, out, depth + 1); }
    else if (e.name === name) out.push(join(root, e.name));
  }
  return out;
}
function locate(name) {
  const root = projectRoot(HERE);
  const hits = findAll(root, name);
  if (!hits.length) return null;
  const score = p => (/[\\/]src[\\/]/.test(p) ? 0 : 1) + (/[\\/](public|assets|static|dist)[\\/]/.test(p) ? 1 : 0);
  return hits.sort((a, b) => score(a) - score(b) || a.length - b.length)[0];
}

const booksPath = locate('books.js') || die('could not find books.js under the project — put this script inside the repo');
const rootsPath = locate('strongs-roots.json') || die('could not find strongs-roots.json under the project');
const scaffPath = join(HERE, 'name-scaffold.json');
if (!existsSync(scaffPath)) die('name-scaffold.json must sit in the same folder as this script');

console.log('using translit  : ' + booksPath);
console.log('using roots     : ' + rootsPath);

const { translit } = await import(pathToFileURL(booksPath).href);
if (typeof translit !== 'function') die('books.js has no translit() export — is this the app module?');
const ROOTS = JSON.parse(readFileSync(rootsPath, 'utf8'));
const SC = JSON.parse(readFileSync(scaffPath, 'utf8'));

// the ONE source of truth: your translit of the paleo root
const f = h => { const r = ROOTS[h]; return r ? translit(r) : null; };
const t = paleo => translit(paleo);

// ── theonyms: assembled from component roots via YOUR translit ────────────────
const YHWH = f(SC.theo.yhwh), EL = f(SC.theo.el), ELOHIM = f(SC.theo.elohim),
      ADONAI = f(SC.theo.adonai), SHADDAI = f(SC.theo.shaddai), ELYON = f(SC.theo.elyon),
      TZEVAOT = t('𐤑𐤁𐤀𐤅𐤕');   // attested plural צבאות, not the singular root
const theonyms = {
  'Lord Yahweh': `${ADONAI} ${YHWH}`, 'Lord GOD': `${ADONAI} ${YHWH}`,
  'Yahweh of Armies': `${YHWH} ${TZEVAOT}`, 'Yahweh of Hosts': `${YHWH} ${TZEVAOT}`,
  'God Almighty': `${EL} ${SHADDAI}`, 'Almighty God': `${EL} ${SHADDAI}`,
  'Most High': ELYON, 'Yahweh': YHWH, 'God': ELOHIM, 'Lord': ADONAI,
  'Almighty': SHADDAI, 'LORD': YHWH, 'GOD': YHWH,
};

// ── forms per spelling: translit(root) for each spelling↔Strong's pair ────────
const cand = {};
for (const [k, h, w] of SC.triples) {
  const form = f(h); if (!form) continue;
  (cand[k] ||= {})[form] = (cand[k][form] || 0) + w;
}
const single = {}, phrases = {};
for (const [k, forms] of Object.entries(cand)) {
  const best = Object.entries(forms).sort((a, b) => b[1] - a[1])[0][0];
  (/[ \-]/.test(k) ? phrases : single)[k] = best;
}
// IDEMPOTENCY: canonical forms are terminal — never re-transliterated.
for (const v of new Set(Object.values(single))) if (!/[ \-]/.test(v)) single[v] = v;
for (const v of new Set(Object.values(phrases))) if (/[ \-]/.test(v)) phrases[v] = v;
// block short/common homographs that would eat ordinary words
['On','No','Or','So','Am','Us','Are','Come','Way','Day','Ur','Uz','Og','Ai','Gate','Well',
 'East','West','North','South','Went','Also','Have','Hand','Pass','Field','Iron','Gold','Sea',
 'Hill','Rock','Oak','Red'].forEach(b => delete single[b]);

const outPath = join(HERE, 'name-map-expanded.json');
writeFileSync(outPath, JSON.stringify({ single, phrases, theonyms }));
console.log(`\n✓ wrote ${outPath}\n  single ${Object.keys(single).length}  phrases ${Object.keys(phrases).length}`);

const show = n => single[n] || phrases[n] || '(miss)';
console.log('\nprobe:');
for (const p of ['Rachel','Rachal','Rakal','Judah','Arabah','Shikkeron','Ekron','Bethlehem','Aaron','Isaac','Jacob','Israel'])
  console.log('  ' + p.padEnd(12) + '→ ' + show(p));
console.log('  theonyms: Yahweh→' + theonyms.Yahweh + '  God→' + theonyms.God +
            '  of Armies→' + theonyms['Yahweh of Armies']);
