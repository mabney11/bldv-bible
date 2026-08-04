// clean-verse-heads.mjs — delete verse-0 rows that hold layout junk ("Column N",
// "Fragment N", "Line N", etc.) rather than a real superscription. Keeps [...] lacunae.
// Report-first; --apply to delete.
//
//   node clean-verse-heads.mjs           show exactly what WOULD be deleted
//   node clean-verse-heads.mjs --apply   delete those verse-0 rows
//
// SAFETY:
//   * Only verse == 0 rows are ever touched. Verse 1+ (real scripture) is never deleted.
//   * A row is deleted only if its text STARTS with a structural marker AND has no
//     substantial scripture after it (so a real title is never removed).
//   * [...] lacunae are KEPT — they mark genuine gaps in the manuscript.
//   * Deletes across ALL corpora for that (canon,chapter,verse=0) key, since the junk
//     row exists per-corpus. Reports each.

import { existsSync } from 'node:fs';
const APPLY = process.argv.includes('--apply');
const die = m => { console.error('\u2717 '+m); process.exit(1); };
let Database; try { ({ default: Database } = await import('better-sqlite3')); } catch { die('run from server/'); }
if (!existsSync('./corpus.db')) die('corpus.db not found');
const db = new Database('./corpus.db', { readonly: !APPLY });

// Layout markers that make a verse-0 row junk. NOTE: bare [...] is NOT here — a
// lacuna is legitimate and kept.
const JUNK_HEAD = [
  /^\s*Column\s+[\dIVXLC]+\b/i,
  /^\s*(Frag(ment)?|Frg)\.?\s*[\dIVXLC]+/i,
  /^\s*Line\s+\d+\b/i,
  /^\s*Col\.?\s*[\dIVXLC]+/i,
  /^\s*(Plate|Recto|Verso|Sheet)\b/i,
  /^\s*[IVXLC]+\s*[.:]?\s*$/,      // a lone roman numeral
];
// After stripping the marker, is what remains just filler (empty / punctuation / a
// short lacuna)? If so the whole row is junk. If real words remain, we DON'T delete
// (that would lose text) — we report it for manual review instead.
const isFillerAfterMarker = (text) => {
  let t = text;
  for (const re of JUNK_HEAD) t = t.replace(re, '');
  t = t.replace(/\[?\.\.\.\]?/g, '').replace(/[\s.,;:—–-]+/g, '').trim();
  return t.length === 0;
};

const v0 = db.prepare(`
  SELECT canon_id, code, chapter, verse, text, corpus
  FROM verses WHERE verse = 0 AND text IS NOT NULL AND TRIM(text) <> ''
`).all();

// After a marker, remaining text is JUNK if it's only more fragment notation
// (Frag/Col/Plate/roman/+/parenthetical scroll refs/asterisks). It's a REAL TITLE if
// descriptive words survive that scrubbing.
const FRAG_NOTATION = /\b(Frag(ment|s)?|Frg|Col(umn)?|Plate|Recto|Verso|Sheet|cf|with)\b|[0-9]+Q[0-9]+|[+()*\[\]]|[IVXLC]+\b|[\d.,;:—–-]/gi;
const _titleAfterMarker = (text) => {
  let t = text;
  for (const re of JUNK_HEAD) t = t.replace(re, '');
  // also peel a leading "N:" left by "Fragment 1: Title"
  t = t.replace(/^\s*[:.\-]\s*/, '');
  const descriptive = t.replace(FRAG_NOTATION, ' ').replace(/\s+/g, ' ').trim();
  return descriptive.length >= 4 ? t.replace(/^[\s:.\-]+/, '').trim() : null;
};

const toDelete = [], toRetitle = [];
for (const r of v0) {
  if (!JUNK_HEAD.some(re => re.test(r.text)) && !/^\s*Fragment\s+\d+\s*:/i.test(r.text)) continue;
  if (isFillerAfterMarker(r.text)) { toDelete.push(r); continue; }
  const title = _titleAfterMarker(r.text);
  if (title) toRetitle.push({ ...r, newText: title });   // real superscription -> keep, strip prefix
  else toDelete.push(r);                                  // only more fragment notation -> junk
}

console.log(`verse-0 rows scanned: ${v0.length}`);
console.log(`\nPURE JUNK (marker only, safe to delete): ${toDelete.length}`);
for (const r of toDelete.slice(0, 40))
  console.log(`   ${r.corpus} ${String(r.code).padEnd(24)} ch${r.chapter}  "${r.text.slice(0,50)}"`);
if (toDelete.length > 40) console.log(`   ... and ${toDelete.length-40} more`);

if (toRetitle.length) {
  console.log(`\nREAL TITLE behind a marker (KEEP row, strip the prefix): ${toRetitle.length}`);
  for (const r of toRetitle)
    console.log(`   ${r.corpus} ${String(r.code).padEnd(24)} ch${r.chapter}  "${r.text.slice(0,40)}" -> "${r.newText}"`);
}

if (!APPLY) { console.log('\n[report only] re-run with --apply to delete the PURE JUNK rows.'); db.close(); process.exit(0); }

const del = db.prepare('DELETE FROM verses WHERE canon_id=? AND chapter=? AND verse=0 AND corpus=? AND text=?');
const ret = db.prepare('UPDATE verses SET text=? WHERE canon_id=? AND chapter=? AND verse=0 AND corpus=? AND text=?');
let n = 0, m = 0;
db.transaction(() => {
  for (const r of toDelete) n += del.run(r.canon_id, r.chapter, r.corpus, r.text).changes;
  for (const r of toRetitle) m += ret.run(r.newText, r.canon_id, r.chapter, r.corpus, r.text).changes;
})();
console.log(`\n\u2713 deleted ${n} junk verse-0 rows, retitled ${m} real superscriptions`);
console.log('Next: node build-headings.mjs   (so none render as false superscriptions)');
console.log('      then rebuild surface index / restart as needed.');
db.close();
