#!/usr/bin/env node
/**
 * hyphenate-compound-names.mjs — hyphenate CHOSEN compound proper names in the
 * reading text so each piece can be enunciated on its own:
 *
 *     Bayathalacham → Bayath-Lacham   (בית לחם, H1035 — "house of bread")
 *     Yasharaal     → Yashar-Al       (ישראל,   H3478)
 *     Abayadan      → Abay-Dan        (אבידן,   H27 — "my father is judge")
 *
 * This is an ALLOWLIST, not a blanket rule (fieldy, 2026-09-08: "I think I want
 * to only apply to specific cities"). The allowlist lives in
 * server/lexicon/compound-hyphenation.json — one entry per Strong's number —
 * and is the single source of truth for BOTH this migration and the live app
 * (server.js's /api/strongs and the Root Explorer card show the hyphenated
 * form only for numbers listed there; the parts/anatomy show for every number).
 *
 * Where a name is split is never guessed: it comes from the Strong's
 * dictionary (server/strongs-hebrew-expanded.json) — a space/maqaf in the
 * lemma, or for a fused word the place where the derivation's components
 * begin/end the spelling (a connective yod stays with the first part, and a
 * component's internal vowel letters may be absent: דין ~ דן).
 *
 * Modes:
 *   --list                 print every candidate the dictionary supports (SN, old → new), for picking
 *   --add H1035,H27,…      add numbers to the allowlist (uses the dictionary split)
 *   --seed-map             add every biblical city / nation on the Holy Land map that has a rule
 *   --remove H27           drop a number from the allowlist
 *   (no flag)              preview: the allowlisted old → new pairs that occur in name-map-expanded.json
 *   --apply                rewrite name-map-expanded.json values for the allowlisted names
 *   --corpus               ALSO rewrite already-substituted ENG verse text in corpus.db (whole word),
 *                          since sanitize-english.js is idempotent and won't revisit them. Needs
 *                          better-sqlite3 — run on your machine.
 * After --apply: node sanitize-english.js, the usual render pipeline, restart. translation.db
 * (Translation Studio's saved verses) is never touched by this script.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { transliterate } from '../src/lib/translit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const flagVal = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

const SQ = { 'א':'𐤀','ב':'𐤁','ג':'𐤂','ד':'𐤃','ה':'𐤄','ו':'𐤅','ז':'𐤆','ח':'𐤇','ט':'𐤈','י':'𐤉','כ':'𐤊','ך':'𐤊','ל':'𐤋','מ':'𐤌','ם':'𐤌','נ':'𐤍','ן':'𐤍','ס':'𐤎','ע':'𐤏','פ':'𐤐','ף':'𐤐','צ':'𐤑','ץ':'𐤑','ק':'𐤒','ר':'𐤓','ש':'𐤔','ת':'𐤕' };
const paleo = (s) => [...s].map((c) => SQ[c] ?? c).join('');
const lemmaParts = (lemma) => String(lemma || '').replace(/־/g, ' ').replace(/[֑-ׇ׳״͏]/g, '').split(/[\s-]+/).filter(Boolean);
const tr = (he) => transliterate(paleo(he));
const normSn = (sn) => 'H' + String(sn || '').replace(/^H+/i, '');

const dictPath = ['strongs-hebrew-expanded.json', 'strongs-hebrew.json'].map((f) => path.join(__dirname, f)).find((f) => fs.existsSync(f));
const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
const ALLOW_PATH = path.join(__dirname, 'lexicon', 'compound-hyphenation.json');
const allow = fs.existsSync(ALLOW_PATH) ? JSON.parse(fs.readFileSync(ALLOW_PATH, 'utf8')) : {};

// Same rule as server.js splitFusedCompound — keep the two in step.
const skel = (s) => s ? s[0] + s.slice(1).replace(/[יו]/g, '') : s;
function splitFused(he, partHes) {
  if (!he || partHes.length < 2) return null;
  const first = partHes[0], last = partHes[partHes.length - 1];
  let best = null;
  for (let k = 2; k <= he.length - 2; k++) {
    const head = he.slice(0, k), tail = he.slice(k);
    const t = tail === last ? 3 : (last && skel(tail) === skel(last)) ? 2 : 0;
    const h = head === first ? 3 : head === first + 'י' ? 2.5 : (first && skel(head) === skel(first)) ? 2 : (first && head.startsWith(first)) ? 1 : 0;
    if (!t && h < 2) continue;
    const score = t + h;
    if (!best || score > best.score) best = { score, split: [head, tail] };
  }
  return best ? best.split : null;
}
function rule(snRaw) {
  const sn = normSn(snRaw);
  const e = dict[sn] || dict[sn.slice(1)];
  if (!e) return null;
  const parts = lemmaParts(e.lemma);
  if (!parts.length) return null;
  let split = parts.length >= 2 ? parts : null;
  if (!split) {
    const comps = [...String(e.derivation || '').matchAll(/H0*(\d+[a-z]?)/g)].map((m) => 'H' + m[1]).filter((p) => p !== sn)
      .map((p) => lemmaParts((dict[p] || dict[p.slice(1)] || {}).lemma).join(''));
    split = splitFused(parts[0], comps);
  }
  if (!split) return null;
  const from = tr(parts.join('')), to = split.map(tr).join('-');
  if (from === to) return null;
  return { sn, he: split.join(' '), paleo: split.map(paleo).join('-'), from, to, meaning: (/\)\s*;\s*([^;()]+?)\s*;?\s*$/.exec(e.derivation || '') || [])[1] || null, def: e.strongs_def || null };
}

const nmPath = path.join(__dirname, 'name-map-expanded.json');
const nm = JSON.parse(fs.readFileSync(nmPath, 'utf8'));
const inUse = new Set(['single', 'phrases', 'theonyms'].flatMap((s) => Object.values(nm[s] || {})));
const saveAllow = () => { fs.writeFileSync(ALLOW_PATH, JSON.stringify(allow, null, 2) + '\n'); console.log(`allowlist saved: ${Object.keys(allow).length} numbers → ${path.relative(process.cwd(), ALLOW_PATH)}`); };
const show = (r) => `  ${r.sn.padEnd(7)} ${r.from.padEnd(22)} → ${r.to.padEnd(22)} ${r.paleo}${r.meaning ? `  "${r.meaning}"` : ''}${inUse.has(r.from) ? '' : '   (not in name map)'}`;

if (flag('--list')) {
  const all = Object.keys(dict).map(rule).filter(Boolean).sort((a, b) => a.from.localeCompare(b.from));
  console.log(`${all.length} names the dictionary can split (${all.filter((r) => inUse.has(r.from)).length} in use in name-map-expanded.json). Add with --add H####,H####`);
  for (const r of all) console.log(show(r) + (allow[r.sn] ? '   ✓ allowlisted' : ''));
  process.exit(0);
}
if (flagVal('--add')) {
  for (const sn of flagVal('--add').split(',')) { const r = rule(sn); if (r) { allow[r.sn] = r; console.log('added' + show(r)); } else console.log(`  ${sn}: no dictionary rule`); }
  saveAllow(); process.exit(0);
}
if (flagVal('--remove')) { for (const sn of flagVal('--remove').split(',')) delete allow[normSn(sn)]; saveAllow(); process.exit(0); }
if (flag('--seed-map')) {
  const m = await import('../src/lib/models/holyLand.js');
  const byHe = {}; for (const [sn, e] of Object.entries(dict)) { const k = lemmaParts(e.lemma).join(' '); if (k) (byHe[k] ||= []).push(normSn(sn)); }
  let n = 0;
  for (const c of [...m.BIBLICAL_CITIES, ...m.REGIONS]) for (const sn of byHe[c.he.replace(/[\s־-]+/g, ' ')] || []) { const r = rule(sn); if (r && !allow[r.sn]) { allow[r.sn] = r; n++; console.log('added' + show(r)); } }
  console.log(`${n} map names added`); saveAllow(); process.exit(0);
}

// Preview / apply the allowlist against the name map.
const APPLY = flag('--apply') || flag('--corpus');
const used = new Map();
for (const r of Object.values(allow)) if (inUse.has(r.from)) used.set(r.from, r);
console.log(`${Object.keys(allow).length} allowlisted numbers; ${used.size} forms present in name-map-expanded.json:`);
for (const r of [...used.values()].sort((a, b) => a.from.localeCompare(b.from))) console.log(show(r));
if (APPLY) {
  for (const sect of ['single', 'phrases', 'theonyms']) for (const [k, v] of Object.entries(nm[sect] || {})) if (used.has(v)) nm[sect][k] = used.get(v).to;
  fs.writeFileSync(nmPath, JSON.stringify(nm, null, 2) + '\n');
  console.log('name-map-expanded.json rewritten');
}
if (flag('--corpus')) {
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(path.join(__dirname, 'corpus.db'));
  const sel = db.prepare(`SELECT rowid, text FROM verses WHERE corpus='ENG' AND text LIKE ?`);
  const upd = db.prepare(`UPDATE verses SET text=? WHERE rowid=?`);
  let changed = 0;
  db.transaction(() => {
    for (const [from, { to }] of used) {
      const re = new RegExp(`\\b${from}\\b`, 'g');
      for (const r of sel.all(`%${from}%`)) { const t = r.text.replace(re, to); if (t !== r.text) changed += upd.run(t, r.rowid).changes; }
    }
  })();
  console.log(`corpus.db: ${changed} ENG verses updated (from .changes — re-query to confirm)`);
}
