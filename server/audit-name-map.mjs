#!/usr/bin/env node
/**
 * audit-name-map.mjs — harden name-map-expanded.json against the Hebrew.
 *
 * fieldy (2026-09-09): "the name map needs to be hardened to the point it is
 * bulletproof … my transliterations better read the same as the hebrew
 * transliterations that readers will see in parallel … we use the characters of
 * the name/place to make the transliteration … all verses that have confusion
 * need to be compared with other bible sources."
 *
 * Every map value is translit(strongs-roots[sn]) — the letters of the Hebrew. So the
 * only way the map can be wrong is the SPELLING → STRONG'S link in name-scaffold.json
 * (Daniel → H1835 "Dan" was one). The second source we compare against is the
 * Strong's dictionary itself: its definition opens with the KJV spelling(s) of the
 * name ("Daniel or Danijel, the name of two Israelites"). For every spelling:
 *
 *   OK       the linked number's dictionary name IS this spelling (or contains it)
 *   FIX      the linked number is a common noun (lowercase definition) or another
 *            name, and exactly one number's dictionary name is this spelling → relink
 *   CONFIRM  several numbers carry this name (Haran the man H2039 / Haran the
 *            city H2771, Abel the son H1893 / Abel the places H59…) → listed for you
 *
 * It also re-derives every map value from the root and reports any value that is
 * not translit(root) — the "reads the same as the parallel Hebrew" guarantee.
 *
 * USAGE:  node audit-name-map.mjs            report → name-map-audit.txt (writes nothing else)
 *         node audit-name-map.mjs --apply    also relink the FIX rows in name-scaffold.json
 *                                            and rewrite their values in name-map-expanded.json
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');
const J = (f) => JSON.parse(readFileSync(path.join(__dirname, f), 'utf8'));
const dict = J('strongs-hebrew-expanded.json');
const roots = J('lexicon/strongs-roots.json');
const scaffold = J('name-scaffold.json');
const nmPath = path.join(__dirname, 'name-map-expanded.json');
const nm = JSON.parse(readFileSync(nmPath, 'utf8'));
const booksPath = ['../src/lib/books.js', './vendor/books.js'].map((p) => path.join(__dirname, p)).find(existsSync);
const { translit } = await import(pathToFileURL(booksPath).href);
const norm = (sn) => 'H' + String(sn).replace(/^H+/, '');
const entry = (sn) => dict[norm(sn)] || dict[norm(sn).slice(1)] || null;
const cleanDef = (e) => String(e?.strongs_def || '').replace(/^\{|\}$/g, '').trim();
// leading KJV name(s) of a definition: "Daniel or Danijel, the name…" → [Daniel, Danijel]
const leadNames = (e) => {
  const lead = cleanDef(e).split(/[,;(]/)[0].trim();
  if (!lead || !/^[A-Z]/.test(lead) || lead.split(' ').length > 4) return [];
  return lead.split(/ or /).map((s) => s.trim()).filter(Boolean);
};
const byName = new Map();
for (const sn of Object.keys(dict)) for (const n of leadNames(dict[sn])) (byName.get(n) || byName.set(n, []).get(n)).push(norm(sn));

// spelling → the scaffold's chosen number (highest score)
const best = new Map();
for (const [name, sn, score] of scaffold.triples) { const c = best.get(name); if (!c || score > c.score) best.set(name, { sn: norm(sn), score }); }

const HAND0 = { Daniel: 'H1840', Debir: 'H1688', Jerusalem: 'H3390', Ramah: 'H7414' };
const out = [], fixes = [], confirms = [], drift = [];
for (const [name, { sn }] of best) {
  const e = entry(sn);
  const cands = byName.get(name) || [];
  const leads = leadNames(e);
  const defHas = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(cleanDef(e));
  if (HAND0[name] && HAND0[name] !== sn && cands.includes(HAND0[name])) { /* fall through to FIX */ }
  else if (leads.includes(name) || defHas || !cands.length) {
    // value check: is the map's value the transliteration of the root?
    const want = roots[sn] ? translit(roots[sn]) : null;
    if (want && nm.single[name] && nm.single[name] !== want) drift.push({ name, sn, have: nm.single[name], want });
    continue;
  }
  const commonNoun = !leads.length;          // definition starts lowercase → not a name at all
  const row = { name, sn, curDef: cleanDef(e).slice(0, 60), cands, candDefs: cands.map((c) => cleanDef(entry(c)).slice(0, 50)), have: nm.single[name] };
  // A relink is automatic ONLY when the current number is not a name at all (a common
  // noun: Rosh "the head", Kelub "a bird-trap") or is on the hand-confirmed list below.
  // Where the current number is itself a name under a variant KJV spelling (Noach/Noah,
  // Ijob/Job, Jehonathan/Jonathan, Hebel/Abel…) the choice is fieldy's — CONFIRM.
  const HAND = { Daniel: 'H1840', Debir: 'H1688', Jerusalem: 'H3390', Ramah: 'H7414' };
  if (HAND[name] && cands.includes(HAND[name]) || (cands.length === 1 && commonNoun)) {
    row.to = HAND[name] || cands[0]; row.want = roots[row.to] ? translit(roots[row.to]) : null;
    if (row.want) fixes.push(row); else confirms.push({ ...row, note: 'candidate has no root in strongs-roots.json' });
  } else confirms.push(row);
}
// ── Verse evidence for CONFIRM rows ───────────────────────────────────────────
// web-strongs.jsonl is the WEB with the translators' own Strong's number on every
// segment — so for each ambiguous spelling we can list every verse it stands in and
// which Hebrew name the translators had in front of them (fieldy: "there will only
// be one strongs number used that should be chosen"). The map takes the number
// used in MOST verses; the minority verses are listed with /parallel links, and the
// OT render is Hebrew-driven per verse anyway.
const BOOK_ID = JSON.parse(readFileSync(path.join(__dirname, 'book-order.json'), 'utf8'));
const codeToId = (code) => { const b = Array.isArray(BOOK_ID) ? BOOK_ID.find((x) => x.code === code || x.abbr === code) : null; return b ? (b.canon_id ?? b.id) : null; };
const wsPath = path.join(__dirname, 'web-strongs.jsonl');
const evidence = new Map();   // spelling -> Map(sn -> [refs])
if (existsSync(wsPath)) {
  const want = new Set(confirms.map((r) => r.name));
  for (const ln of readFileSync(wsPath, 'utf8').split('\n')) {
    if (!ln) continue;
    let v; try { v = JSON.parse(ln); } catch { continue; }
    for (const seg of v.segments || []) {
      // some scraped verses carry site chrome after the last segment ("… Online Parallel Study Bible…"): cut it
      const segText = String(seg.text || '').replace(/\s*(Online Parallel|Parallel Bible|Compare [A-Z][a-z]+ \d).*$/s, '');
      for (const w of segText.match(/[A-Z][a-z]+/g) || []) {
        if (!want.has(w)) continue;
        const sn = norm(seg.sn);
        const e = evidence.get(w) || evidence.set(w, new Map()).get(w);
        (e.get(sn) || e.set(sn, []).get(sn)).push(`${v.code} ${v.chapter}:${v.verse}`);
      }
    }
  }
}
const line = (r) => `${r.name.padEnd(16)} ${r.sn.padEnd(6)} "${r.have || ''}"  now: ${r.curDef}\n${' '.repeat(23)}→ ${r.cands.map((c, i) => `${c} "${roots[c] ? translit(roots[c]) : '?'}" — ${r.candDefs[i]}`).join('\n' + ' '.repeat(25))}`;
out.push(`name-map audit — ${best.size} spellings; ${fixes.length} relinked, ${confirms.length} to confirm, ${drift.length} value(s) not equal to translit(root)`);
out.push('', `FIX (${APPLY ? 'applied' : 'preview — run with --apply'}): the linked number is not this name; exactly one number carries it`);
for (const r of fixes) out.push(line(r));
out.push('', 'CONFIRM: more than one Hebrew name carries this spelling. Below each: every WEB verse that uses the spelling, by the Strong\'s number the translators tagged — open /parallel on any of them to see the Hebrew. The map keeps the number used in most verses (marked ★); with --apply it is relinked to that number where it differs.');
const relinks = [];
for (const r of confirms) {
  out.push(line(r));
  const ev = evidence.get(r.name);
  if (!ev) { out.push(' '.repeat(23) + '(no WEB verse tags this spelling — NT / apocrypha only; leave as is)'); continue; }
  const ranked = [...ev.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [sn, refs] of ranked) {
    const e = entry(sn); const star = sn === ranked[0][0] ? '★' : ' ';
    out.push(`${' '.repeat(21)}${star} ${sn.padEnd(6)} "${roots[sn] ? translit(roots[sn]) : '?'}" ${cleanDef(e).slice(0, 40).padEnd(40)} ${refs.length} verse(s): ${refs.slice(0, 6).join(', ')}${refs.length > 6 ? ' …' : ''}`);
  }
  const top = ranked[0][0];
  if (top !== r.sn && roots[top]) relinks.push({ name: r.name, from: r.sn, to: top, want: translit(roots[top]), n: ranked[0][1].length });
  else if (roots[top] && nm.single[r.name] !== translit(roots[top])) drift.push({ name: r.name, sn: top, have: nm.single[r.name], want: translit(roots[top]) });
}
if (relinks.length) {
  out.push('', `RELINK BY VERSE COUNT (${APPLY ? 'applied' : 'preview'}): the WEB uses these spellings for a different number than the map links`);
  for (const r of relinks) out.push(`${r.name.padEnd(16)} ${r.from} → ${r.to} "${r.want}" (${r.n} verses)`);
}
for (const [k, v] of Object.entries(nm.single)) if (/[eouEOU]/.test(v)) drift.push({ name: k, sn: '?', have: v, want: '(not in the app\'s alphabet — no e/o/u — derive it from the Hebrew root)' });
out.push('', 'VALUE DRIFT: map value ≠ translit(root) — the map must read exactly as the Hebrew');
for (const d of drift) out.push(`${d.name.padEnd(16)} ${d.sn.padEnd(6)} have "${d.have}" want "${d.want}"`);
writeFileSync(path.join(__dirname, 'name-map-audit.txt'), out.join('\n') + '\n');
console.log(out.slice(0, 1)[0]); console.log(`→ ${path.relative(process.cwd(), path.join(__dirname, 'name-map-audit.txt'))}`);

for (const r of relinks) fixes.push({ name: r.name, to: r.to, want: r.want });
if (APPLY && (fixes.length || drift.length)) {
  const fixBy = new Map(fixes.map((r) => [r.name, r]));
  scaffold.triples = scaffold.triples.map(([name, sn, score]) => fixBy.has(name) ? [name, fixBy.get(name).to, score] : [name, sn, score]);
  writeFileSync(path.join(__dirname, 'name-scaffold.json'), JSON.stringify(scaffold));
  for (const r of fixes) nm.single[r.name] = r.want;
  for (const d of drift) nm.single[d.name] = d.want;
  writeFileSync(nmPath, JSON.stringify(nm));   // one line, as build-names-from-hebrew writes it
  console.log(`applied: ${fixes.length} relinked in name-scaffold.json, ${fixes.length + drift.length} value(s) rewritten in name-map-expanded.json`);
}
