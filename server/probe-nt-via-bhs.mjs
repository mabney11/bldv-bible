// probe-nt-via-bhs.mjs
// THE decisive measurement. lexicon.json is only 285 entries, so it was never going to
// carry the NT — but tokens_bhs has 490,052 OT tokens carrying word_raw / lemma / root /
// strongs. Nearly every "missing" NT Hebrew word in Matthew 1 (David, Yosef, Yaakov,
// Yekonyahu, sefer=book, toledot=genealogy, harah=conceived) occurs many times in the OT
// WITH a Strong's. So: index the OT tokens by paleo form, look the NT words up in it, and
// the NT inherits the whole existing Strong's pipeline — names, terms, glosses — with no
// new tagging and no alignment.
//
//   node probe-nt-via-bhs.mjs --out nt-bhs.txt              Matthew 1
//   node probe-nt-via-bhs.mjs --canon 40 --chapter 1 --all  whole book
//   node probe-nt-via-bhs.mjs --canon 43 --chapter 1        John 1
//
// Read-only. Reports the resolve rate and what it would unlock.

import Database from 'better-sqlite3';
import { existsSync, writeFileSync } from 'node:fs';
import util from 'node:util';

const args = process.argv.slice(2);
const argv = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const CANON = Number(argv('--canon', '40'));
const CHAP  = Number(argv('--chapter', '1'));
const ALL   = args.includes('--all');
const NSAMP = Number(argv('--samples', '30'));

// self-writing output (winpty in MINGW64 eats shell redirection — see --out)
const OUTFILE = argv('--out', '');
const buf = [];
if (OUTFILE) {
  const rawLog = console.log.bind(console), rawTable = console.table.bind(console);
  const fmt = a => a.map(x => typeof x === 'string' ? x : util.inspect(x, { depth: 4, breakLength: 120 })).join(' ');
  console.log = (...a) => { buf.push(fmt(a)); rawLog(...a); };
  console.table = rows => { rawTable(rows);
    if (!Array.isArray(rows) || !rows.length) { buf.push('(no rows)'); return; }
    const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
    const w = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
    const line = c2 => '  ' + c2.map((v, i) => String(v ?? '').padEnd(w[i])).join('  ');
    buf.push(line(cols)); buf.push('  ' + w.map(n => '-'.repeat(n)).join('  '));
    for (const r of rows) buf.push(line(cols.map(c => r[c]))); };
  process.on('exit', () => { try { writeFileSync(OUTFILE, buf.join('\n') + '\n', 'utf8');
    rawLog(`\n[report written to ${OUTFILE}]`); } catch (e) { rawLog(`\n[write failed: ${e.message}]`); } });
}

if (!existsSync('./corpus.db')) { console.error('corpus.db not found — run from server/'); process.exit(1); }
const db = new Database('./corpus.db', { readonly: true });

// ── build the paleo -> Strong's index from the OT tokens ────────────────────────────
// Index BOTH the written form (word_raw) and the root/lemma, each with a frequency, so a
// word that occurs many ways still resolves and the commonest Strong's wins.
console.log('indexing tokens_bhs …');
const bySurface = new Map();   // paleo form -> Map(strongs -> count)
const byRoot    = new Map();
const bump = (m, k, sn) => { if (!k || !sn) return;
  const e = m.get(k) || new Map(); e.set(sn, (e.get(sn) || 0) + 1); m.set(k, e); };
for (const r of db.prepare(
    `SELECT word_raw, root, lemma, strongs FROM tokens_bhs WHERE strongs IS NOT NULL AND strongs<>''`).iterate()) {
  const sn = 'H' + String(r.strongs).replace(/^H+/i, '');
  bump(bySurface, r.word_raw, sn);
  bump(byRoot, r.root, sn);
  bump(byRoot, r.lemma, sn);
}
const top = m => { let best = null, n = 0; for (const [sn, c] of m) if (c > n) { best = sn; n = c; } return [best, n]; };
console.log(`  ${bySurface.size.toLocaleString()} distinct surfaces · ${byRoot.size.toLocaleString()} distinct roots/lemmas`);

// ── resolve the NT Hebrew ───────────────────────────────────────────────────────────
const HEBREWISH = /[\u0590-\u05FF]|[\u{10900}-\u{1091F}]/u;
const PFX = ['\u{10905}','\u{10904}','\u{10901}','\u{1090B}','\u{1090A}','\u{1090C}','\u{10911}',   // paleo w h b l k m sh
             '\u05D5','\u05D4','\u05D1','\u05DC','\u05DB','\u05DE','\u05E9'];                        // hebrew block
const SFX = ['\u{10909}\u{10904}','\u{10904}','\u{10905}','\u{10909}','\u{1090A}','\u{1090C}'];       // -yh -h -w -y -k -m
const variants = w => {
  const out = new Set([w]);
  for (const p of PFX) if (w.startsWith(p) && [...w].length > 2) {
    const s = w.slice(p.length); out.add(s);
    for (const q of PFX) if (s.startsWith(q) && [...s].length > 2) out.add(s.slice(q.length));
  }
  for (const base of [...out]) for (const s of SFX)
    if (base.endsWith(s) && [...base].length > 3) out.add(base.slice(0, -s.length));
  return out;
};

const where = ALL ? `canon_id=? AND corpus='HEB'` : `canon_id=? AND ord_c=? AND corpus='HEB'`;
const rows = ALL ? db.prepare(`SELECT ord_c, ord_v, text FROM verses WHERE ${where}`).all(CANON)
                 : db.prepare(`SELECT ord_c, ord_v, text FROM verses WHERE ${where}`).all(CANON, CHAP);
console.log(`\nNT Hebrew rows: ${rows.length} (canon ${CANON}${ALL ? ', whole book' : ', chapter ' + CHAP})`);

let total = 0, exact = 0, viaVariant = 0;
const misses = new Map(); const resolved = [];
for (const r of rows) {
  for (const w of String(r.text).split(/[\s\u05BE\u05C3\u05C0.,;:!?()"'\u2019\u201c\u201d\u05F3\u05F4]+/).filter(Boolean)) {
    if (!HEBREWISH.test(w)) continue;
    total++;
    if (bySurface.has(w)) { const [sn, n] = top(bySurface.get(w)); exact++;
      if (resolved.length < 14) resolved.push({ word: w, strongs: sn, ot_occurrences: n, via: 'surface' }); continue; }
    let hit = null;
    for (const v of variants(w)) {
      if (v !== w && bySurface.has(v)) { hit = { m: bySurface.get(v), via: 'prefix/suffix' }; break; }
      if (byRoot.has(v))               { hit = { m: byRoot.get(v),   via: 'root' };          break; }
    }
    if (hit) { const [sn, n] = top(hit.m); viaVariant++;
      if (resolved.length < 14) resolved.push({ word: w, strongs: sn, ot_occurrences: n, via: hit.via }); continue; }
    misses.set(w, (misses.get(w) || 0) + 1);
  }
}
const pct = n => total ? `${(n / total * 100).toFixed(1)}%` : '—';
console.log(`\n=== NT HEBREW RESOLVED VIA OT BHS TOKENS ===`);
console.log(`words examined         : ${total}`);
console.log(`exact surface match    : ${exact}  (${pct(exact)})`);
console.log(`via prefix/suffix/root : ${viaVariant}  (${pct(viaVariant)})`);
console.log(`TOTAL RESOLVED         : ${exact + viaVariant}  (${pct(exact + viaVariant)})   <- these inherit the full Strong's pipeline`);
console.log(`unresolved             : ${misses.size} distinct  (${pct(total - exact - viaVariant)})`);
if (resolved.length) { console.log('\nsample resolutions:'); console.table(resolved); }
if (misses.size) { console.log('\ntop unresolved (genuinely NT-only vocabulary / Greek names):');
  console.log('  ' + [...misses].sort((a, b) => b[1] - a[1]).slice(0, NSAMP).map(([w, n]) => `${w}\u00d7${n}`).join('  ')); }
db.close();
