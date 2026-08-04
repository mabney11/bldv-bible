// fetch-missing-books.mjs — fetch the 7 books not on Scrollmapper from public sources.
//
//   node fetch-missing-books.mjs --dry     preview
//   node fetch-missing-books.mjs           write to corpus.db
//
// Sources:
//   3 Maccabees, 4 Maccabees, 4 Ezra (= 2 Esdras), Letter of Jeremiah (= Baruch 6)
//     -> bible-api.com / getbible.net (public domain NRSV/WEB adjacent texts)
//   1/2/3 Meqabyan  -> LPettay Ethiopian Bible GitHub (public domain)

import { existsSync } from 'node:fs';
const DRY = process.argv.includes('--dry');
let Database; try { ({default:Database}=await import('better-sqlite3')); } catch { process.exit(1); }

// Canon IDs matching your server's BOOK_NAMES map
const CANON = {
  'LETTER_OF_JEREMIAH': 75, '3_MACCABEES': 77, '4_MACCABEES': 78,
  '4_EZRA': 139, '1_MEQABYAN': 143, '2_MEQABYAN': 87, '3_MEQABYAN': 88,
};

// Fetch from bible-api.com — supports NRSV deuterocanon
async function fetchBibleAPI(book, chapters, code, canon) {
  const rows = [];
  for (let ch = 1; ch <= chapters; ch++) {
    try {
      const url = `https://bible-api.com/${book}+${ch}?translation=nrsv`;
      const r = await fetch(url);
      if (!r.ok) { console.log(`  [skip] ${code} ch${ch}: HTTP ${r.status}`); continue; }
      const d = await r.json();
      for (const v of d.verses ?? []) {
        const t = (v.text ?? '').replace(/\s+/g,' ').trim();
        if (t) rows.push({ code, canon, ch: String(ch), v: String(v.verse), text: t });
      }
    } catch(e) { console.log(`  [skip] ${code} ch${ch}: ${e.message}`); }
  }
  return rows;
}

// Fetch Meqabyan from LPettay Ethiopian Bible (English translation)
// These exist in the lpettay/ethiopian-bible repo on GitHub
async function fetchMeqabyan(book, code, canon) {
  const slugs = { '1_MEQABYAN': 'meq1', '2_MEQABYAN': 'meq2', '3_MEQABYAN': 'meq3' };
  const slug = slugs[code];
  // Try multiple sources
  const urls = [
    `https://raw.githubusercontent.com/scrollmapper/bible_databases_deuterocanonical/master/sources/en/${book}/${book}.json`,
    `https://raw.githubusercontent.com/kavicastelo/ethiopian-bible-kjv/main/src/assets/data/${slug}.json`,
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const d = await r.json();
      const rows = [];
      // handle array-of-chapters format
      const chapters = Array.isArray(d) ? d : d.chapters ?? d.books?.[0]?.chapters ?? [];
      for (let ci = 0; ci < chapters.length; ci++) {
        const ch = chapters[ci];
        const verses = Array.isArray(ch) ? ch : ch.verses ?? [];
        for (let vi = 0; vi < verses.length; vi++) {
          const t = (typeof verses[vi]==='string'?verses[vi]:verses[vi].text??'').replace(/\s+/g,' ').trim();
          if (t) rows.push({ code, canon, ch: String(ci+1), v: String(vi+1), text: t });
        }
      }
      if (rows.length) { console.log(`  ${code}: ${rows.length} verses from ${url.split('/')[2]}`); return rows; }
    } catch(e) {}
  }
  console.log(`  [skip] ${code}: no source found`);
  return [];
}

console.log('Fetching 7 missing books...\n');
const allRows = [];

// 3 Maccabees (7 chapters), 4 Maccabees (18 chapters), 4 Ezra/2 Esdras (16 chapters)
// Letter of Jeremiah (1 chapter = Baruch 6)
for (const [book, code, chapters] of [
  ['3+Maccabees','3_MACCABEES',7], ['4+Maccabees','4_MACCABEES',18],
  ['2+Esdras','4_EZRA',16], ['Baruch+6','LETTER_OF_JEREMIAH',1],
]) {
  console.log(`Fetching ${code}...`);
  const rows = await fetchBibleAPI(book, chapters, code, CANON[code]);
  console.log(`  ${code}: ${rows.length} verses`);
  allRows.push(...rows);
}

// Meqabyan books
for (const [book, code] of [
  ['1-meqabyan','1_MEQABYAN'], ['2-meqabyan','2_MEQABYAN'], ['3-meqabyan','3_MEQABYAN']
]) {
  console.log(`Fetching ${code}...`);
  const rows = await fetchMeqabyan(book, code, CANON[code]);
  allRows.push(...rows);
}

console.log(`\nTotal: ${allRows.length} verses across ${new Set(allRows.map(r=>r.code)).size} books`);

if (DRY) { process.exit(0); }

// Write to corpus.db
const db = new Database('./corpus.db');
db.pragma('journal_mode=WAL');
const insBook = db.prepare(`INSERT OR IGNORE INTO books(corpus,code,title,category,n_verses) VALUES('ENG',?,?,?,?)`);
const insVerse = db.prepare(`INSERT OR REPLACE INTO verses(corpus,code,book_id,canon_id,chapter,verse,text) VALUES('ENG',?,?,?,?,?,?)`);
const byCode = new Map();
for (const r of allRows) { if (!byCode.has(r.code)) byCode.set(r.code,[]); byCode.get(r.code).push(r); }
db.transaction(() => {
  for (const [code, rows] of byCode) {
    db.prepare("DELETE FROM verses WHERE corpus='ENG' AND code=?").run(code);
    db.prepare("DELETE FROM books  WHERE corpus='ENG' AND code=?").run(code);
    insBook.run(code, code.replace(/_/g,' '), 'deuterocanon-en', rows.length);
    const bid = db.prepare("SELECT book_id FROM books WHERE corpus='ENG' AND code=?").get(code)?.book_id;
    for (const r of rows) insVerse.run(code, bid, r.canon, r.ch, r.v, r.text);
  }
})();
db.close();
console.log(`\u2713 written`);
