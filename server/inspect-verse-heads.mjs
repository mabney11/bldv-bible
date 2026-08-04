// inspect-verse-heads.mjs — READ ONLY. Scan the first verses of every book/chapter
// for structural junk that leaked in from ingest: "Column N", "Fragment N", "Line N",
// "[...]" placeholders, "(cont.)", bare roman numerals, etc. — text that is layout
// metadata, not scripture.
//
//   node inspect-verse-heads.mjs            summary: which books have suspect heads
//   node inspect-verse-heads.mjs --all      every suspect verse, full text
//   node inspect-verse-heads.mjs --v0       only verse-0 rows (superscription slot)

import { existsSync } from 'node:fs';
const args = process.argv.slice(2);
const ALL = args.includes('--all');
const V0ONLY = args.includes('--v0');
const die = m => { console.error('\u2717 '+m); process.exit(1); };
let Database; try { ({ default: Database } = await import('better-sqlite3')); } catch { die('run from server/'); }
const db = new Database('./corpus.db', { readonly: true });

// Patterns that indicate STRUCTURE, not scripture. Tuned to catch the Qumran/DSS
// column & fragment markers and OCR placeholders without flagging real verse text.
const JUNK = [
  { name: 'Column N',    re: /^\s*Column\s+[\dIVXLC]+\b/i },
  { name: 'Fragment N',  re: /^\s*(Frag(ment)?|Frg)\.?\s*[\dIVXLC]+/i },
  { name: 'Line N',      re: /^\s*Line\s+\d+\b/i },
  { name: 'Col.+num',    re: /^\s*Col\.?\s*[\dIVXLC]+/i },
  { name: 'leading [...]',re: /^\s*\[?\.\.\.\]?/ },
  { name: 'roman only',  re: /^\s*[IVXLC]+\s*[.:]?\s*$/ },
  { name: '(cont.)',     re: /^\s*\(?cont(inued)?\.?\)?/i },
  { name: 'plate/frg',   re: /^\s*(Plate|Recto|Verso|Sheet)\b/i },
];

const rows = db.prepare(`
  SELECT canon_id, code, chapter, verse, text
  FROM verses WHERE corpus='ENG' AND text IS NOT NULL AND TRIM(text) <> ''
  ORDER BY canon_id, chapter, verse
`).all();

// keep only chapter-opening verses (verse 0 or 1) — that's where structural heads sit
const heads = rows.filter(r => r.verse === 0 || r.verse === 1);
db.close();

const byBook = new Map();
for (const r of (V0ONLY ? heads.filter(h => h.verse === 0) : heads)) {
  for (const j of JUNK) {
    if (j.re.test(r.text)) {
      const k = `${r.canon_id}|${r.code}`;
      if (!byBook.has(k)) byBook.set(k, []);
      byBook.get(k).push({ ...r, why: j.name });
      break;
    }
  }
}

if (!byBook.size) { console.log('\u2713 no structural junk found in any book/chapter head.'); process.exit(0); }

let total = 0;
console.log(`SUSPECT VERSE HEADS (structural markers, not scripture)\n`);
for (const [k, list] of [...byBook].sort((a,b) => b[1].length - a[1].length)) {
  const [cid, code] = k.split('|');
  console.log(`  ${code.padEnd(28)} canon ${cid.padStart(3)}   ${list.length} verse(s)`);
  total += list.length;
  const show = ALL ? list : list.slice(0, 2);
  for (const r of show) console.log(`       ch${r.chapter} v${r.verse} [${r.why}]  ${r.text.slice(0, 70)}`);
}
console.log(`\ntotal suspect: ${total} across ${byBook.size} books`);
console.log('These are chapter-opening rows whose text begins with a layout marker.');
console.log('Re-run with --all to see every one, or --v0 for just the verse-0 slot.');
