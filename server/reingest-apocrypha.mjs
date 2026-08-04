// reingest-apocrypha.mjs — re-fetch pseudepigrapha/apocrypha from Scrollmapper
// and restore them CLEANLY into corpus.db, without touching the OT.
//
//   node reingest-apocrypha.mjs --dry    preview only
//   node reingest-apocrypha.mjs          fetch + restore
//
// WHAT THIS DOES:
//   1. Fetch every pseudepigrapha book from Scrollmapper GitHub (same source as
//      ingest-pseudepigrapha.py, but scoped — never touches OT rows).
//   2. DELETE existing corpus.db ENG rows for non-OT books only (canon_id > 39
//      or the known apocrypha codes).
//   3. INSERT the fresh fetched text.
//   4. Does NOT run sanitize-english (the old name-map pipeline — retired).
//   5. Does NOT run de-archaic. Run that separately after this.
//
// After this, run:
//   node de-archaic-corpus.js            (modernize archaic English)
//   node apply-word-map.mjs --apply      (apply names + terms from OT map)
//   node reseed-translations.mjs         (seed translation.db)
//   restart

import { existsSync } from 'node:fs';
const DRY = process.argv.includes('--dry');
const die = m => { console.error('\u2717 '+m); process.exit(1); };
let Database; try { ({default:Database}=await import('better-sqlite3')); } catch { die('run from server/'); }
if (!existsSync('./corpus.db')) die('corpus.db not found');

const RAW = 'https://raw.githubusercontent.com/scrollmapper/bible_databases_deuterocanonical/master/sources/en';
const SLUGS = [
  '1-adam-and-eve','2-adam-and-eve','1-enoch','2-enoch','book-of-jubilees','book-of-jasher',
  'book-of-giants','genesis-apocryphon','ladder-of-jacob','apocalypse-of-abraham',
  'apocalypse-of-elijah','apocalypse-of-peter','apocalypse-of-sedrach','ascension-of-isaiah',
  'assumption-of-moses','lives-of-the-prophets','jannes-and-jambres','history-of-the-rechabites',
  'visions-of-amram','wisdom-of-ahikar','songs-of-the-sabbath-sacrifice','five-psalms-of-david',
  'odes-of-solomon','psalms-of-solomon','prayer-of-manasseh','gad-the-seer',
  'book-of-nathan-the-prophet','apocryphon-of-joshua','balaam-inscription','azar',
  'joseph-and-asenath','gospel-of-nicodemus','epistle-of-barnabas',
  '1-hermas','2-hermas','3-hermas',
  'testament-of-abraham','testament-of-isaac','testament-of-jacob','testament-of-job',
  'testament-of-solomon','testament-of-kohath',
  'testament-of-reuben','testament-of-simeon','testament-of-levi','testament-of-judah',
  'testament-of-issachar','testament-of-zebulun','testament-of-dan','testament-of-naphtali',
  'testament-of-gad','testament-of-asher','testament-of-joseph','testament-of-benjamin',
  '1-maccabees','book-of-sirach','wisdom-of-solomon','book-of-tobit','book-of-judith',
  '1-baruch','letter-of-jeremiah','2-maccabees','3-maccabees','4-maccabees','susanna',
  'bel-and-the-dragon','1-esdras','psalms-of-solomon','4-baruch','4-ezra','2-enoch',
  '3-baruch','2-baruch','1-meqabyan','2-meqabyan','3-meqabyan','greek-esther',
  'words-of-azariah','five-psalms-of-david',
];
const CANON = {
  '1-enoch':67,'book-of-jubilees':68,'1-maccabees':69,'book-of-sirach':70,'wisdom-of-solomon':71,
  'book-of-tobit':72,'book-of-judith':73,'1-baruch':74,'letter-of-jeremiah':75,
  '2-maccabees':76,'3-maccabees':77,'4-maccabees':78,'susanna':79,'bel-and-the-dragon':80,
  '1-esdras':81,'psalms-of-solomon':83,'prayer-of-manasseh':84,'4-baruch':89,'4-ezra':139,
  '2-enoch':136,'3-baruch':137,'2-baruch':138,'greek-esther':154,
  'book-of-jasher':100,'1-adam-and-eve':101,'2-adam-and-eve':102,
  'testament-of-reuben':103,'testament-of-simeon':104,'testament-of-levi':105,
  'testament-of-judah':106,'testament-of-issachar':107,'testament-of-zebulun':108,
  'testament-of-dan':109,'testament-of-naphtali':110,'testament-of-gad':111,
  'testament-of-asher':112,'testament-of-joseph':113,'testament-of-benjamin':114,
  'joseph-and-asenath':115,'testament-of-abraham':116,'testament-of-isaac':117,
  'testament-of-jacob':118,'testament-of-job':119,'testament-of-solomon':120,
  'apocalypse-of-abraham':121,'ascension-of-isaiah':122,'apocalypse-of-elijah':123,
  'apocalypse-of-sedrach':124,'apocalypse-of-peter':125,'assumption-of-moses':126,
  'ladder-of-jacob':127,'lives-of-the-prophets':128,'jannes-and-jambres':129,
  'history-of-the-rechabites':130,'book-of-giants':131,'genesis-apocryphon':132,
  'wisdom-of-ahikar':133,'gad-the-seer':134,'odes-of-solomon':135,
  'five-psalms-of-david':141,'visions-of-amram':142,'testament-of-kohath':144,
  'book-of-nathan-the-prophet':145,'apocryphon-of-joshua':146,'balaam-inscription':147,
  'words-of-azariah':148,'gospel-of-nicodemus':149,'epistle-of-barnabas':150,
  '1-hermas':151,'2-hermas':152,'3-hermas':153,'1-meqabyan':143,
};
const codeFor = s => s.toUpperCase().replace(/-/g,'_');

async function fetchSlug(slug) {
  const url = `${RAW}/${slug}/${slug}.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) { console.log(`  [skip] ${slug}: HTTP ${res.status}`); return null; }
    return await res.json();
  } catch(e) { console.log(`  [skip] ${slug}: ${e.message}`); return null; }
}

console.log(`Fetching ${SLUGS.length} books from Scrollmapper GitHub...`);
const rows = [];
let fetched = 0;
for (const slug of [...new Set(SLUGS)]) {
  const d = await fetchSlug(slug);
  if (!d) continue; fetched++;
  const cid = CANON[slug] ?? null;
  const code = codeFor(slug);
  for (const bk of d.books ?? []) {
    for (const ch of bk.chapters ?? []) {
      const cn = ch.chapter ?? 1;
      for (const v of ch.verses ?? []) {
        const t = (v.text ?? '').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
        if (t) rows.push({ cid, code, title: bk.name ?? slug, cn: String(cn), vn: String(v.verse ?? 1), text: t });
      }
    }
  }
}
const byCode = new Map();
for (const r of rows) { if (!byCode.has(r.code)) byCode.set(r.code, []); byCode.get(r.code).push(r); }
console.log(`\nFetched ${fetched} books, ${rows.length} verses across ${byCode.size} codes`);

// Show samples
for (const [code, rs] of [...byCode].slice(0, 3))
  console.log(`  ${code}: ${rs.length} verses, e.g. "${rs[0].text.slice(0,60)}"`);

if (DRY) {
  // preview what --bak would restore
  if (process.argv.includes('--bak') && existsSync('./corpus.db.bak')) {
    console.log('\n--bak preview (from corpus.db.bak):');
    const bak = new Database('./corpus.db.bak', { readonly: true });
    const missingCodes = ['LETTER_OF_JEREMIAH','3_MACCABEES','4_MACCABEES','4_EZRA',
                          '1_MEQABYAN','2_MEQABYAN','3_MEQABYAN','WORDS_OF_AZARIAH','AZAR'];
    for (const code of missingCodes) {
      const r = bak.prepare("SELECT COUNT(*) n, MIN(text) t FROM verses WHERE corpus='ENG' AND code=?").get(code);
      if (r && r.n > 0) console.log(`  ✓ ${code}: ${r.n} verses — "${r.t?.slice(0,55)}"`);
      else console.log(`  ✗ ${code}: not in backup`);
    }
    bak.close();
  }
  console.log('\n[dry] nothing written.'); process.exit(0);
}

const db = new Database('./corpus.db');
db.pragma('journal_mode=WAL'); db.pragma('foreign_keys=OFF');

// Delete ONLY non-OT ENG rows (codes we're about to re-insert)
const codes = [...byCode.keys()];
const placeholders = codes.map(()=>'?').join(',');
const delV = db.prepare(`DELETE FROM verses WHERE corpus='ENG' AND code IN (${placeholders})`);
const delB = db.prepare(`DELETE FROM books  WHERE corpus='ENG' AND code IN (${placeholders})`);

let dv=0, db2=0;
db.transaction(()=>{
  dv = delV.run(...codes).changes;
  db2 = delB.run(...codes).changes;
})();
console.log(`\nDeleted ${dv} old verse rows, ${db2} old book rows`);

// Re-insert books
const insBook = db.prepare(`INSERT INTO books(corpus,code,title,category,n_verses) VALUES('ENG',?,?,?,?)`);
const bid = new Map();
for (const [code, rs] of byCode) {
  const cid = rs[0].cid; const title = rs[0].title;
  const cat = (cid && cid < 82) ? 'deuterocanon-en' : 'pseudepigrapha-en';
  const b = insBook.run(code, title, cat, rs.length);
  bid.set(code, b.lastInsertRowid);
}

// Re-insert verses
const insVerse = db.prepare(`INSERT INTO verses(corpus,code,book_id,canon_id,chapter,verse,text) VALUES('ENG',?,?,?,?,?,?)`);
let nv=0;
db.transaction(()=>{
  for (const r of rows) {
    insVerse.run(r.code, bid.get(r.code), r.cid, r.cn, r.vn, r.text);
    nv++;
  }
})();
db.pragma('foreign_keys=ON');
db.close();
console.log(`\u2713 inserted ${nv} verses across ${byCode.size} books`);
// If --bak is passed, also restore the 8 missing books from corpus.db.bak
if (!DRY && process.argv.includes('--bak') && existsSync('./corpus.db.bak')) {
  console.log('\nRestoring missing books from corpus.db.bak...');
  const bak = new Database('./corpus.db.bak', { readonly: true });
  const missingCodes = ['LETTER_OF_JEREMIAH','3_MACCABEES','4_MACCABEES','4_EZRA',
                        '1_MEQABYAN','2_MEQABYAN','3_MEQABYAN','WORDS_OF_AZARIAH','AZAR'];
  const main = new Database('./corpus.db');
  main.pragma('journal_mode=WAL');
  // also fetch their book rows
  const insB2 = main.prepare(`INSERT OR IGNORE INTO books(corpus,code,title,category,n_verses) VALUES('ENG',?,?,?,?)`);
  const insV2 = main.prepare(`INSERT OR IGNORE INTO verses(corpus,code,book_id,canon_id,chapter,verse,text) VALUES('ENG',?,?,?,?,?,?)`);
  let restored=0;
  for (const code of missingCodes) {
    const bakBook = bak.prepare("SELECT * FROM books WHERE corpus='ENG' AND code=?").get(code);
    const bakVerses = bak.prepare("SELECT * FROM verses WHERE corpus='ENG' AND code=?").all(code);
    if (!bakVerses.length) { console.log(`  [skip] ${code}: not in backup`); continue; }
    main.transaction(() => {
      // delete any current corrupted rows first
      main.prepare("DELETE FROM verses WHERE corpus='ENG' AND code=?").run(code);
      main.prepare("DELETE FROM books  WHERE corpus='ENG' AND code=?").run(code);
      if (bakBook) insB2.run(bakBook.code, bakBook.title||code, bakBook.category||'pseudepigrapha-en', bakVerses.length);
      const bookId = main.prepare("SELECT book_id FROM books WHERE corpus='ENG' AND code=?").get(code)?.book_id;
      for (const v of bakVerses) insV2.run(code, bookId, v.canon_id, v.chapter, v.verse, v.text);
    })();
    console.log(`  \u2713 ${code}: ${bakVerses.length} verses restored from backup`);
    restored += bakVerses.length;
  }
  bak.close(); main.close();
  console.log(`Restored ${restored} verses from backup`);
}

console.log('\nNext steps:');
console.log('  node de-archaic-corpus.js          # modernize archaic English');
console.log('  node apply-word-map.mjs --apply    # apply names + terms');
console.log('  node reseed-translations.mjs       # seed translation.db');
console.log('  restart');
