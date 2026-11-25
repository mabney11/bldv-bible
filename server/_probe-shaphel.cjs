// Scratch probe (2026-11-24): run heb-align's buildHebSurfaces on a few books, through node:sqlite,
// and print how the 𐤔𐤇𐤓𐤓 "set free" words resolve. Usage: node _probe-shaphel.cjs <ntMin> <ntMax>
const Module = require('module');
const { DatabaseSync } = require('node:sqlite');
class DB { constructor(p) { this.d = new DatabaseSync('file:' + p + '?immutable=1', { readOnly: true }); }
  prepare(q) { const s = this.d.prepare(q); return { all: (...a) => s.all(...a), get: (...a) => s.get(...a), run: (...a) => s.run(...a), iterate: (...a) => s.iterate(...a) }; }
  pragma() { return []; } exec(q) { this.d.exec(q); } close() { this.d.close(); } }
const orig = Module._load;
Module._load = function (r, ...rest) { return r === 'better-sqlite3' ? DB : orig.call(this, r, ...rest); };
process.env.PALEO_PARSE_ONLY = '1';
const fs = require('fs');
const { parseToken } = require('./build-surface-index.js');
const { buildHebSurfaces } = require('./heb-align.js');
const J = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const roots0 = J('lexicon/strongs-roots.json'), dict = J('strongs-hebrew-expanded.json'), homo = J('lexicon/homographs.json');
const roots = new Map(), verbs = new Set(), names = new Set(), snText = new Map(), freq = new Map(), shaphel = new Set();
for (const [sn, p] of Object.entries(roots0)) { if (!p || sn.startsWith('_')) continue; if (!roots.has(p)) roots.set(p, []); roots.get(p).push(sn); }
for (const [sn, e] of Object.entries(dict)) { const def = String(e.strongs_def || '');
  if (/^(\([^)]*\)\s*)?(properly,?\s*)?to\s/i.test(def)) verbs.add(sn); if (/^[A-Z]/.test(def)) names.add(sn);
  snText.set(sn, `${e.kjv_def || ''} ${def} ${homo[(roots0[sn] || '') + '_' + sn] || ''}`); }
for (const [sn, e] of Object.entries(J('lexicon/shaphel-stems.json'))) { if (sn.startsWith('_')) continue;
  shaphel.add(sn); verbs.add(sn); snText.set(sn, (snText.get(sn) || '') + ' ' + e.en + ' ' + (homo[roots0[sn] + '_' + sn] || '')); }
const src = new DB(process.cwd() + '/corpus.db');
const [ntMin, ntMax] = process.argv.slice(2).map(Number);
const eng = new Map();
for (const r of src.prepare(`SELECT canon_id c, chapter ch, verse v, COALESCE(NULLIF(text_src,''),text) t FROM verses WHERE corpus='ENG' AND canon_id BETWEEN ? AND ?`).all(ntMin, ntMax)) eng.set(`${r.c}|${r.ch}|${r.v}`, r.t);
const englishOf = (c, ch, v) => eng.get(`${c}|${Number(ch)}|${Number(v)}`) || '';
const ov = new Map(Object.entries(J('lexicon/heb-occurrence-overrides.json')).filter(([k]) => !k.startsWith('_')));
const t0 = Date.now();
const res = buildHebSurfaces({ src, parseToken, ntMin, ntMax, occurrenceOverrides: ov, englishOf, englishSrcOf: englishOf,
  rootStrip: { roots, verbs, names, snText, freq, shaphel }, fusedParticles: ['𐤀𐤕','𐤏𐤋','𐤀𐤋','𐤁𐤉𐤍','𐤊𐤉','𐤊𐤍','𐤀𐤔𐤓','𐤌𐤍'], log: m => { if (/root-strip|suffix glosses/.test(m)) console.log(m); } });
console.log('built in', ((Date.now() - t0) / 1000).toFixed(0), 's');
const surf = res.surfaces || res.surfaceMap;
const occ = (res.occurrences || []).filter(o => o.word_raw.includes('𐤔𐤇𐤓𐤓'));
const seen = new Set();
for (const o of occ) {
  const k = o.word_raw + '|' + o.strongs; if (seen.has(k)) continue; seen.add(k);
  let rec = null; for (const [kk, r] of surf) if (r.word_raw === o.word_raw && r.strongs === o.strongs) { rec = r; break; }
  const comps = rec ? (rec.components || JSON.parse(rec.components_json || '[]')) : [];
  console.log(`${o.book_id}:${o.chapter}:${o.verse}`, o.word_raw, o.strongs || '-', rec && rec.tier, comps.map(c => `${c.paleo}${c.translation ? ' ' + c.translation : ''}(${c.css})`).join(' + '));
}
console.log('family occurrences', occ.length, 'H2715a', occ.filter(o => o.strongs === 'H2715a').length);
// side effects: root-strip readings outside the family that end in a perfect-verb chip
const side = new Map();
for (const o of res.occurrences || []) {
  if (o.word_raw.includes('𐤔𐤇𐤓𐤓') || !o.strongs) continue;
  let rec = null; for (const r of surf.values()) if (r.word_raw === o.word_raw && r.strongs === o.strongs) { rec = r; break; }
  if (!rec || !/rootstrip|context_root/.test(rec.tier || '')) continue;
  const comps = rec.components || JSON.parse(rec.components_json || '[]');
  const last = comps[comps.length - 1];
  if (!last || !/^vbe-/.test(last.css || '')) continue;
  const k = o.word_raw + ' ' + o.strongs + ' ' + comps.map(c => c.paleo + (c.css === 'root' ? '' : c.translation)).join('+');
  side.set(k, (side.get(k) || []).concat(`${o.book_id}:${o.chapter}:${o.verse}`));
}
console.log('other readings with a perfect ending:', side.size);
for (const [k, refs] of side) console.log('  ', k, refs.slice(0, 3).join(' '));
