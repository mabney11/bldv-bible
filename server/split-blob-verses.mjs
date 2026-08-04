// split-blob-verses.mjs — reconstruct proper verses from fragmentary blobs where the
// ingest crushed many verses into one row, leaving inline "N[" verse markers.
//
//   node split-blob-verses.mjs             PREVIEW: show how each blob splits (writes nothing)
//   node split-blob-verses.mjs --apply     rewrite those chapters as real verses
//
// WHAT IT DOES, per affected verse (only verses whose text contains inline markers):
//   1. Strip a LEADING scroll siglum/locator: "4Q400 Frag. 1 Col. 1", "Mas1k Frag. 2"
//   2. Split the body on inline verse markers "<num>[" — the number that precedes a
//      bracket is the NEXT verse's number (…Praise 2[the God… -> v1 ends, v2 begins).
//   3. KEEP [...] lacunae inside each resulting verse — they mark real manuscript gaps.
//   4. Renumber the chapter's verses sequentially from the recovered markers.
//
// It NEVER invents text: it only cuts an existing blob at markers the source itself
// placed, and drops locator strings that are manuscript apparatus, not scripture.
// Report-first so you approve the versing before it's written.

import { existsSync } from 'node:fs';
const APPLY = process.argv.includes('--apply');
const die = m => { console.error('\u2717 '+m); process.exit(1); };
let Database; try { ({ default: Database } = await import('better-sqlite3')); } catch { die('run from server/'); }
const db = new Database('./corpus.db', { readonly: !APPLY });

// leading manuscript locator: sigla like 4Q400 / 11Q17 / Mas1k, plus Frag./Col.
const LEAD_LOCATOR = /^\s*(?:\d?\d?Q\d{2,}|Mas\w+)?\s*(?:Frags?\.?\s*[\d–-]+)?\s*(?:Col\.?\s*[ivx\d]+)?\s*/i;
// inline verse marker: a number immediately followed by "[" (start of that verse's text)
const MARKER = /(\d+)\[/g;

// only ENG verses that actually contain an inline marker AFTER position 0 (a real blob)
const rows = db.prepare(`
  SELECT canon_id, code, chapter, verse, text
  FROM verses WHERE corpus='ENG' AND text LIKE '%[%'
`).all().filter(r => {
  // must have at least TWO markers (…1[…]…2[…]) to be a multi-verse blob
  const m = r.text.match(/\d+\[/g);
  return m && m.length >= 2;
});

if (!rows.length) { console.log('\u2713 no multi-verse blobs found.'); db.close(); process.exit(0); }

function splitBlob(text) {
  // strip a leading locator (only at the very start)
  let body = text.replace(LEAD_LOCATOR, '');
  // find marker positions; text before the first marker is the FIRST verse (its number
  // is the one just before the first "[" is NOT — the first chunk's number is implicit v1
  // unless the blob opens with "1["). Collect [num, startIndex].
  const marks = [];
  let m; MARKER.lastIndex = 0;
  while ((m = MARKER.exec(body))) marks.push({ num: parseInt(m[1], 10), at: m.index });
  if (!marks.length) return null;
  const verses = [];
  // leading text before first marker belongs to the verse whose number is (first marker - 1),
  // or v1 if the first marker is 1/2 at the very start.
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].at;
    const end = i + 1 < marks.length ? marks[i+1].at : body.length;
    // chunk text: drop the leading "N[" of THIS marker, keep the rest incl. its closing ]
    let chunk = body.slice(start, end).replace(/^\d+\[/, '[').trim();
    verses.push({ num: marks[i].num, text: chunk });
  }
  // the text before marks[0] is verse (marks[0].num - 1)
  const lead = body.slice(0, marks[0].at).trim();
  if (lead) verses.unshift({ num: Math.max(1, marks[0].num - 1), text: lead });
  return verses;
}

const plan = [];
for (const r of rows) {
  const v = splitBlob(r.text);
  if (v && v.length > 1) plan.push({ ...r, split: v });
}

console.log(`multi-verse blobs found: ${plan.length}\n`);
for (const r of plan.slice(0, 6)) {
  console.log(`── ${r.code} ch${r.chapter} (was 1 row) → ${r.split.length} verses ──`);
  for (const v of r.split.slice(0, 4)) console.log(`   v${v.num}: ${v.text.slice(0, 80)}`);
  if (r.split.length > 4) console.log(`   … +${r.split.length - 4} more`);
  console.log('');
}
if (plan.length > 6) console.log(`… and ${plan.length - 6} more chapters\n`);

if (!APPLY) { console.log('[preview only] re-run with --apply to write the split verses.'); db.close(); process.exit(0); }

// Apply: delete the blob row, insert the split verses. Do it per (canon,chapter,corpus).
const delRow = db.prepare('DELETE FROM verses WHERE canon_id=? AND chapter=? AND verse=? AND corpus=?');
const insRow = db.prepare(`INSERT INTO verses (canon_id, code, corpus, chapter, verse, text)
                           VALUES (?, ?, 'ENG', ?, ?, ?)`);
let rewritten = 0, newVerses = 0;
db.transaction(() => {
  for (const r of plan) {
    delRow.run(r.canon_id, r.chapter, r.verse, 'ENG');
    for (const v of r.split) { insRow.run(r.canon_id, r.code, r.chapter, v.num, v.text); newVerses++; }
    rewritten++;
  }
})();
console.log(`\u2713 rewrote ${rewritten} blob chapters into ${newVerses} verses`);
console.log('Next: node build-headings.mjs; rebuild surface index; restart.');
db.close();
