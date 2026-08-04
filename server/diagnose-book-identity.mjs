// diagnose-book-identity.mjs
// WHY whole books read "has not been translated into English yet" even though the
// English is sitting in corpus.db (de-archaic-corpus.js just modernized 125 verses of
// APOCALYPSE_OF_ABRAHAM, and verify-integration still reports 0 English chapters for it).
//
// HYPOTHESIS this script tests: the same work exists TWICE under two different
// canon_id/code pairs — the source languages (GEZ/LXX/SYR/HEB/LAT) under one, the English
// (Scrollmapper reingest) under another. The reader resolves a book slug to ONE canon_id;
// if that's the source-only row it shows "not translated" while the English hides
// elsewhere. verify-integration's "no English" list (1EN, JUB, SIR, YASHAR, APBAR…) vs the
// reingest codes (1_ENOCH, BOOK_OF_JUBILEES, BOOK_OF_SIRACH, BOOK_OF_JASHER…) is the tell.
//
//   node diagnose-book-identity.mjs            report
//   node diagnose-book-identity.mjs --all      also list books that are fine
//
// Read-only. Nothing is written. The pairing it prints is a PROPOSAL for you to confirm —
// it is matched on normalized names, never applied automatically.

import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';

const ALL = process.argv.includes('--all');
if (!existsSync('./corpus.db')) { console.error('✗ corpus.db not found — run from server/'); process.exit(1); }
const db = new Database('./corpus.db', { readonly: true });

// ── every (canon_id, code) with what corpora it actually carries ────────────────────
const rows = db.prepare(`
  SELECT canon_id, code, corpus, COUNT(*) n, COUNT(DISTINCT ord_c) chapters
  FROM verses WHERE canon_id IS NOT NULL AND code IS NOT NULL
  GROUP BY canon_id, code, corpus`).all();

const books = new Map();   // "canon|code" -> {canon_id, code, corpora:Map, eng, engCh}
for (const r of rows) {
  const k = `${r.canon_id}|${r.code}`;
  const b = books.get(k) || { canon_id: r.canon_id, code: r.code, corpora: new Map(), eng: 0, engCh: 0 };
  b.corpora.set(r.corpus, r.n);
  if (r.corpus === 'ENG') { b.eng = r.n; b.engCh = r.chapters; }
  books.set(k, b);
}

// book NAMES, if the server keeps a books table (used for the name-based pairing)
let nameOf = new Map();
for (const t of ['books', 'book_order', 'canon']) {
  try {
    for (const r of db.prepare(`SELECT * FROM ${t}`).all()) {
      const id = r.canon_id ?? r.id ?? r.book_id;
      const nm = r.name ?? r.title ?? r.book_name;
      if (id != null && nm) nameOf.set(Number(id), String(nm));
    }
    if (nameOf.size) { console.log(`book names from table: ${t} (${nameOf.size})`); break; }
  } catch { /* table absent */ }
}

// ── normalize a code/name to a comparison key ───────────────────────────────────────
// "1_ENOCH" -> "1enoch";  "1EN" -> "1en";  "BOOK_OF_JASHER" -> "jasher"
const STOP = /^(book|the|of|apocalypse|testament|epistle|wisdom|words|history|five|odes|psalms?)$/;
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  .split(/\s+/).filter(w => !STOP.test(w)).join('');
const abbrevKey = s => {                      // loose key: digits + first letters
  const t = norm(s);
  const num = (t.match(/^\d+/) || [''])[0];
  return num + t.replace(/^\d+/, '').slice(0, 3);
};

const withEng = [...books.values()].filter(b => b.eng > 0);
const noEng   = [...books.values()].filter(b => b.eng === 0);

console.log(`\ncanon_id/code pairs: ${books.size}  ·  with English: ${withEng.length}  ·  without: ${noEng.length}`);

// ── the smoking gun: same work, two canon_ids ───────────────────────────────────────
const proposals = [];
for (const b of noEng) {
  const bk = abbrevKey(nameOf.get(b.canon_id) || b.code);
  const bn = norm(nameOf.get(b.canon_id) || b.code);
  const match = withEng.find(e => {
    const ek = abbrevKey(nameOf.get(e.canon_id) || e.code);
    const en = norm(nameOf.get(e.canon_id) || e.code);
    return en === bn || ek === bk || en.startsWith(bn) || bn.startsWith(en);
  });
  if (match) proposals.push({
    source_canon: b.canon_id, source_code: b.code,
    source_langs: [...b.corpora.keys()].join(','),
    english_canon: match.canon_id, english_code: match.code,
    english_verses: match.eng, english_ch: match.engCh,
  });
}

if (proposals.length) {
  console.log(`\n=== SAME WORK, TWO canon_ids (${proposals.length}) ===`);
  console.log('The English is filed under "english_canon"; the reader is looking at "source_canon".');
  console.table(proposals);
  console.log('\nThese are PROPOSED pairings matched on normalized names — confirm each before acting.');
} else {
  console.log('\nNo name-matched duplicate pairs found — the cause is something else.');
}

// ── specifically: the book fieldy was on ────────────────────────────────────────────
console.log('\n=== books whose code mentions ABRAHAM / BARUCH / ENOCH / JASHER ===');
const probe = [...books.values()]
  .filter(b => /ABRAHAM|BARUCH|ENOCH|JASHER|JUBILEE|SIRACH/i.test(b.code + ' ' + (nameOf.get(b.canon_id) || '')))
  .map(b => ({ canon_id: b.canon_id, code: b.code, name: nameOf.get(b.canon_id) || '',
               eng_verses: b.eng, corpora: [...b.corpora.keys()].join(',') }))
  .sort((a, b) => a.canon_id - b.canon_id);
probe.length ? console.table(probe) : console.log('(none)');

if (ALL) {
  console.log('\n=== every book WITH English ===');
  console.table(withEng.map(b => ({ canon_id: b.canon_id, code: b.code, name: nameOf.get(b.canon_id) || '',
                                    eng_verses: b.eng, eng_chapters: b.engCh })).sort((a,b)=>a.canon_id-b.canon_id));
}

db.close();
