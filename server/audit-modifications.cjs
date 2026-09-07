#!/usr/bin/env node
// audit-modifications.cjs — SCAN THE WHOLE BHS CORPUS FOR INVISIBLE MODIFICATIONS.
//
// fieldy's rule (Sep 7 2026): "every root must show its modifications … if the
// word is not the exact root it's representing, there are modifications that
// need to be considered." This runs the REAL parseToken from
// build-surface-index.js over every distinct (word_raw, pos, morph, strongs)
// combo in tokens_bhs and checks: after peeling every chip the parser emitted
// off the surface, is what remains EXACTLY the Strong's root? Anything left over
// is a modification the reader will not see.
//
// Run BEFORE a surface-index rebuild (the rebuild is slow; this takes ~20 s):
//     node audit-modifications.cjs --out mod-audit.txt
// Then fix parseToken (and its twin in server.js), re-run, and only rebuild once
// the EXTRA-* classes are down to what you accept. Classes:
//   OK-exact              root zone == canonical root (every letter accounted for)
//   internal-matres-only  only a 𐤅/𐤉/𐤄/𐤀 mater differs — spelling, not grammar
//   root-letter-elided    surface lacks a root letter (I-nun, III-he …) — restored by design
//   root-mostly-absent    >=2 root letters absent — usually a compound name / doubtful SN
//   EXTRA-PREFIX/SUFFIX/INTERNAL/MIXED   <-- THE WORK LIST: letters outside the root with no chip
//   no-canonical-root     Strong's not in strongs-roots.json (H9xxx virtual particles mostly)
//   no-root-comp          particle path emitted no root chip at all (audited separately below)
// Output: summary, examples per class, and a ranked pattern table
// (class × pos × vs/vt/ps/gn/nu/st × tags × extra letters) — each row is one
// grammatical cell you can fix with one rule.
process.env.PALEO_PARSE_ONLY = '1';
const path = require('path');
const fs   = require('fs');
const Database = require('better-sqlite3');
const { parseToken, strongsRoots: ROOTS } = require('./build-surface-index.js');
const args = process.argv.slice(2);
const argVal = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const DB  = argVal('--db')  || path.join(__dirname, 'corpus.db');
const OUT = argVal('--out');
const lines = [];
const log = (...a) => { const t = a.join(' '); lines.push(t); if (!OUT) console.log(t); };

const db = new Database(DB, { readonly: true });
const rows = db.prepare(`SELECT word_raw w, pos, morph, strongs sn, COUNT(*) c, MIN(book_id||':'||chapter||':'||verse) ref
                         FROM tokens_bhs WHERE word_raw IS NOT NULL AND word_raw != '' AND pos != 'punct'
                         GROUP BY 1,2,3,4`).all();
const MATRES = new Set(['𐤅','𐤉','𐤄','𐤀']);
const attrs = m => { const o = {}; for (const kv of (m || '').split('|')) { const i = kv.indexOf('='); if (i > 0) o[kv.slice(0, i)] = kv.slice(i + 1); } return o; };
const isSubseq = (sub, full) => { let i = 0; for (const ch of full) { if (i < sub.length && sub[i] === ch) i++; } return i === sub.length; };
const stats = {}, examples = {}, patterns = {};
const bucket = (key, r, extra) => { stats[key] = (stats[key] || 0) + r.c; (examples[key] ||= []); if (examples[key].length < 8) examples[key].push(`${r.w} | ${r.sn} | ${r.pos} | ${r.morph.replace(/sp=\w+\|pdp=\w+\|?/, '')} | x${r.c} @${r.ref} | ${extra || ''}`); };
let total = 0, occ = 0;
for (const r of rows) {
    total++; occ += r.c;
    let p; try { p = parseToken(r.w, r.pos, r.morph, r.sn); } catch (e) { bucket('PARSE-ERROR', r, e.message); continue; }
    const comps = p.components || [];
    const ri = comps.findIndex(x => x && Object.prototype.hasOwnProperty.call(x, 'sn'));
    const a = attrs(r.morph);
    const snN = r.sn ? 'H' + r.sn.replace(/^H+/, '') : '';
    const canon = ROOTS[snN];
    if (ri < 0) {   // particle path: whole word should be root, or root + chips
        const surf = comps.map(x => x.paleo || '').join('');
        if (!canon) { bucket('no-root-comp', r, ''); continue; }
        if (comps.length > 1 || r.w === canon) { bucket('OK-exact', r, ''); continue; }
        bucket('PARTICLE-UNSPLIT', r, `${r.w} vs ${canon}`); continue;
    }
    let s = [...r.w];
    for (let i = 0; i < ri; i++) {
        const q = [...(comps[i].paleo || '')]; if (!q.length) continue;
        if (comps[i].infixed) { if (q[0] === '𐤄' && s[0] === '𐤄') s.splice(0, 1); if (s[1] === q[q.length - 1]) s.splice(1, 1); else bucket('infix-chip-mismatch', r, comps[i].paleo); continue; }
        if (q.every((ch, k) => s[k] === ch)) s.splice(0, q.length); else bucket('prefix-chip-not-at-front', r, comps[i].paleo);
    }
    for (let i = comps.length - 1; i > ri; i--) {
        const q = [...(comps[i].paleo || '')]; if (!q.length || comps[i].reconstructed) continue;
        if (q.every((ch, k) => s[s.length - q.length + k] === ch)) s.splice(s.length - q.length, q.length);
    }
    const zone = s.join('');
    if (!canon) { bucket(r.sn ? 'no-canonical-root' : 'no-strongs', r, zone); continue; }
    const C = [...canon];
    if (zone === canon) { bucket('OK-exact', r, ''); continue; }
    if (!isSubseq(C, s)) { const missing = C.filter(ch => !s.includes(ch)).length; bucket(missing >= 2 ? 'root-mostly-absent(SN?)' : 'root-letter-elided', r, `${zone} vs ${canon}`); continue; }
    let i = 0, first = -1, last = -1;
    for (let k = 0; k < s.length; k++) if (i < C.length && s[k] === C[i]) { if (first < 0) first = k; last = k; i++; }
    const lead = s.slice(0, first).join(''), trail = s.slice(last + 1).join('');
    const inner = []; i = 0; for (let k = first; k <= last; k++) { if (i < C.length && s[k] === C[i]) i++; else inner.push(s[k]); }
    const innerHard = inner.filter(ch => !MATRES.has(ch));
    let cls;
    if (lead && !trail && !inner.length) cls = 'EXTRA-PREFIX';
    else if (trail && !lead && !inner.length) cls = 'EXTRA-SUFFIX';
    else if (!lead && !trail && inner.length && !innerHard.length) cls = 'internal-matres-only';
    else if (!lead && !trail) cls = 'EXTRA-INTERNAL';
    else cls = 'EXTRA-MIXED';
    bucket(cls, r, `lead=${lead} inner=${inner.join('')} trail=${trail} zone=${zone} canon=${canon}`);
    if (cls.startsWith('EXTRA')) {
        const key = [cls, r.pos, a.vs || '-', a.vt || '-', a.ps || '-', a.gn || '-', a.nu || '-', a.st || '-', 'pfm=' + (a.pfm || '-'), 'vbs=' + (a.vbs || '-'), 'prs=' + (a.prs || '-'), 'nme=' + (a.nme || '-'), 'lead=' + lead, 'trail=' + trail, 'inner=' + inner.join('')].join(' ');
        patterns[key] ||= { occ: 0, forms: 0, ex: [] }; patterns[key].occ += r.c; patterns[key].forms++;
        if (patterns[key].ex.length < 4) patterns[key].ex.push(`${r.w}/${snN}@${r.ref}`);
    }
}
log(`=== MODIFICATION AUDIT === distinct combos ${total.toLocaleString()}, occurrences ${occ.toLocaleString()}`);
for (const [k, v] of Object.entries(stats).sort((a, b) => b[1] - a[1])) log(String(v).padStart(8), k);
const work = Object.entries(stats).filter(([k]) => k.startsWith('EXTRA') || k === 'PARTICLE-UNSPLIT' || k === 'PARSE-ERROR').reduce((n, [, v]) => n + v, 0);
log(`\nWORK LIST (letters with no chip): ${work.toLocaleString()} occurrences`);
log('\n=== EXAMPLES ===');
for (const [k, v] of Object.entries(examples)) { if (k.startsWith('OK')) continue; log(`\n# ${k}`); for (const e of v) log('  ' + e); }
const P = Object.entries(patterns).sort((a, b) => b[1].occ - a[1].occ);
log(`\n=== EXTRA-LETTER PATTERNS (${P.length} cells, worst first) ===`);
log('occ\tforms\tpattern\texamples');
for (const [k, v] of P) log(`${v.occ}\t${v.forms}\t${k}\t${v.ex.join(' ')}`);
if (OUT) { fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8'); console.log(`wrote ${OUT}  (work list: ${work.toLocaleString()} occurrences)`); }
