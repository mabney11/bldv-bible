// fetch-web-strongs.mjs — download the World English Bible WITH Strong's numbers.
//
//   node fetch-web-strongs.mjs            (~929 OT chapters, polite 400ms delay, ~8 min)
//   node fetch-web-strongs.mjs --all      include the NT too
//
// WHY THIS REPLACES EVERYTHING
//   The WEB text already exists with Strong's numbers attached to each English
//   phrase (CrossWord Project; the additions are public domain). So:
//
//       Ps 119:74  H3373 Those who fear  H7200 you will see  H8055 me and be glad,
//                  H3176 because I have put my hope  H1697 in your word.
//
//   "in your word" -> H1697 -> strongs-roots.json -> 𐤃𐤁𐤓. Given, not inferred.
//
//   Everything I built before this — the KJV gloss lexicon, gloss matching, the
//   elimination learner, evidence thresholds, verse-token maps — existed only to
//   RECOVER this mapping from an untagged text. None of it is needed. I should have
//   looked for a tagged WEB first; that was the mistake, and this file is the fix.
//
// OUTPUT  web-strongs.jsonl — one row per verse:
//   {"code":"PSA","chapter":119,"verse":74,
//    "segments":[{"sn":"H3373","text":"Those who fear"},
//                {"sn":"H7200","text":"you will see"}, ...],
//    "text":"Those who fear you will see me and be glad, ..."}
//
//   `text` is the plain WEB verse (identical to english-web-raw.jsonl).
//   `segments` is what you actually want: each English phrase and its Strong's.
//   A phrase with sn:null is untagged connective text — leave it in English.
//
// Resumable: already-fetched chapters are skipped, so a dropped connection is fine.

import { writeFileSync, appendFileSync, readFileSync, existsSync } from 'node:fs';

const ALL = process.argv.includes('--all');
const OUT = 'web-strongs.jsonl';
const DONE = '.web-strongs-progress';

// site book name -> your code, with chapter counts
const BOOKS = [
  ['Genesis','GEN',50],['Exodus','EXOD',40],['Leviticus','LEV',27],['Numbers','NUM',36],
  ['Deuteronomy','DEUT',34],['Joshua','JOSH',24],['Judges','JUDG',21],['Ruth','RUTH',4],
  ['1 Samuel','1SAM',31],['2 Samuel','2SAM',24],['1 Kings','1KGS',22],['2 Kings','2KGS',25],
  ['1 Chronicles','1CHR',29],['2 Chronicles','2CHR',36],['Ezra','EZRA',10],['Nehemiah','NEH',13],
  ['Esther','EST',10],['Job','JOB',42],['Psalms','PSA',150],['Proverbs','PROV',31],
  ['Ecclesiastes','ECCL',12],['Song of Songs','SONG',8],['Isaiah','ISA',66],['Jeremiah','JER',52],
  ['Lamentations','LAM',5],['Ezekiel','EZK',48],['Daniel','DAN',12],['Hosea','HOS',14],
  ['Joel','JOEL',3],['Amos','AMO',9],['Obadiah','OBA',1],['Jonah','JONAH',4],['Micah','MIC',7],
  ['Nahum','NAM',3],['Habakkuk','HAB',3],['Zephaniah','ZEP',3],['Haggai','HAG',2],
  ['Zechariah','ZEC',14],['Malachi','MAL',4],
];
const NT = [
  ['Matthew','MAT',28],['Mark','MRK',16],['Luke','LUK',24],['John','JHN',21],['Acts','ACT',28],
  ['Romans','ROM',16],['1 Corinthians','1CO',16],['2 Corinthians','2CO',13],['Galatians','GAL',6],
  ['Ephesians','EPH',6],['Philippians','PHP',4],['Colossians','COL',4],['1 Thessalonians','1TH',5],
  ['2 Thessalonians','2TH',3],['1 Timothy','1TI',6],['2 Timothy','2TI',4],['Titus','TIT',3],
  ['Philemon','PHM',1],['Hebrews','HEB',13],['James','JAS',5],['1 Peter','1PE',5],
  ['2 Peter','2PE',3],['1 John','1JN',5],['2 John','2JN',1],['3 John','3JN',1],['Jude','JUD',1],
  ['Revelation','REV',22],
];
const LIST = ALL ? [...BOOKS, ...NT] : BOOKS;

const done = existsSync(DONE) ? new Set(readFileSync(DONE,'utf8').split('\n').filter(Boolean)) : new Set();
if (!existsSync(OUT)) writeFileSync(OUT, '');

const strip = h => h.replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&')
                    .replace(/&quot;/g,'"').replace(/&#8217;/g,'\u2019').replace(/&#8220;/g,'\u201C')
                    .replace(/&#8221;/g,'\u201D').replace(/\s+/g,' ').trim();

// Each verse in the chapter HTML looks like:
//   <a href=".../Psalms%20119:74">74</a> <a href=".../strongs/H3373">H3373</a> Those who fear ...
function parseChapter(html, code, chapter) {
  const rows = [];
  // split the body on the verse-number anchors
  const vRe = new RegExp('<a[^>]+href="[^"]*' + '\\d+:(\\d+)"[^>]*>\\s*\\1\\s*</a>', 'g');
  const marks = [...html.matchAll(/<a[^>]+href="[^"]*:(\d+)"[^>]*>\s*(\d+)\s*<\/a>/g)]
    .filter(m => m[1] === m[2]);
  for (let i = 0; i < marks.length; i++) {
    const verse = Number(marks[i][1]);
    const start = marks[i].index + marks[i][0].length;
    const end = i + 1 < marks.length ? marks[i+1].index : html.length;
    const chunk = html.slice(start, end);
    // split on the Strong's anchors, keeping the number
    const parts = chunk.split(/<a[^>]+href="[^"]*\/strongs\/(H\d+)"[^>]*>[^<]*<\/a>/);
    const segments = [];
    // parts = [pre, sn1, text1, sn2, text2, ...]
    const pre = strip(parts[0]);
    if (pre) segments.push({ sn: null, text: pre });
    for (let j = 1; j < parts.length; j += 2) {
      const sn = parts[j], text = strip(parts[j+1] || '');
      if (text) segments.push({ sn, text });
    }
    if (!segments.length) continue;
    rows.push({ code, chapter, verse, segments,
                text: segments.map(s => s.text).join(' ').replace(/\s+([,.;:!?])/g,'$1') });
  }
  return rows;
}

let total = 0, chapters = 0;
for (const [name, code, nCh] of LIST) {
  for (let ch = 1; ch <= nCh; ch++) {
    const key = `${code}:${ch}`;
    if (done.has(key)) continue;
    const url = `https://studybible.info/WEB_Strongs/${encodeURIComponent(name)}%20${ch}`;
    let html;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { const r = await fetch(url, { headers: { 'User-Agent': 'paleo-studio/1.0' } });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            html = await r.text(); break; }
      catch (e) { if (attempt === 2) { console.error(`  ! ${key} failed: ${e.message}`); }
                  await new Promise(r => setTimeout(r, 1500 * (attempt + 1))); }
    }
    if (!html) continue;
    const rows = parseChapter(html, code, ch);
    if (!rows.length) { console.error(`  ! ${key} parsed 0 verses — check the page`); }
    for (const r of rows) appendFileSync(OUT, JSON.stringify(r) + '\n');
    appendFileSync(DONE, key + '\n');
    total += rows.length; chapters++;
    if (chapters % 25 === 0) console.log(`  ${chapters} chapters · ${total} verses`);
    await new Promise(r => setTimeout(r, 400));      // be polite
  }
}
console.log(`\n\u2713 ${OUT} — ${chapters} chapters, ${total} verses`);

// proof: the verse we already know the answer to
const check = readFileSync(OUT,'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  .find(r => r.code === 'PSA' && r.chapter === 119 && r.verse === 74);
if (check) {
  console.log('\nPsalms 119:74 —');
  for (const s of check.segments) console.log(`   ${(s.sn||'   -  ').padEnd(7)} ${s.text}`);
  console.log('\n"in your word" should be H1697 (dabar). If it is, every English word in');
  console.log('the bible now carries its Hebrew, and no inference is needed anywhere.');
}
