// restore-english.mjs — find and restore the English verses the baseline reset ate.
//
//   node restore-english.mjs                    report only, writes nothing
//   node restore-english.mjs --restore          restore from corpus.db.bak
//   node restore-english.mjs --bak <path>       use a different backup
//
// WHAT HAPPENED
//   web-strongs.jsonl was fetched WITHOUT --all, so it covers Genesis..Malachi only.
//   apply-web-strongs.mjs built english-baseline.jsonl from it, and
//   `load-english-baseline.js --reset-baseline` then replaced the WHOLE English
//   corpus with it. Everything outside the Hebrew canon — the entire New Testament,
//   plus Jasher, Jubilees, 1/2 Adam and Eve and the rest — was deleted, along with
//   the transliteration normalisation those books already carried.
//
//   That is my fault: a tool that rewrites one range of books must never be able to
//   delete the ones it does not cover. This restores what was lost and reports
//   exactly what changed, book by book, so nothing is taken on trust.

import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const argv = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const RESTORE = args.includes('--restore');
const BAK = argv('--bak', './corpus.db.bak');
const die = m => { console.error('\u2717 ' + m); process.exit(1); };

let Database;
try { ({ default: Database } = await import('better-sqlite3')); }
catch { die('better-sqlite3 not found — run from server/'); }
if (!existsSync('./corpus.db')) die('corpus.db not found');
if (!existsSync(BAK)) die(`${BAK} not found — point --bak at your most recent backup`);

const db = new Database('./corpus.db', { readonly: !RESTORE });
db.exec(`ATTACH DATABASE '${BAK.replace(/'/g, "''")}' AS bak`);

// what does the backup have that the live DB no longer does?
const missing = db.prepare(`
  SELECT b.canon_id, COUNT(*) AS n
    FROM bak.verses b
    LEFT JOIN verses v ON v.id = b.id
   WHERE b.corpus = 'ENG' AND b.text IS NOT NULL AND b.text <> ''
     AND (v.id IS NULL OR v.text IS NULL OR v.text = '')
   GROUP BY b.canon_id ORDER BY b.canon_id
`).all();

// and what does the live DB have that no longer matches (normalisation lost)?
const changed = db.prepare(`
  SELECT b.canon_id, COUNT(*) AS n
    FROM bak.verses b
    JOIN verses v ON v.id = b.id
   WHERE b.corpus = 'ENG' AND v.text <> '' AND b.text <> '' AND v.text <> b.text
   GROUP BY b.canon_id ORDER BY b.canon_id
`).all();

const totMissing = missing.reduce((s, r) => s + r.n, 0);
const totChanged = changed.reduce((s, r) => s + r.n, 0);

console.log(`ENGLISH VERSES MISSING OR BLANK (present in ${BAK}, gone from corpus.db)`);
console.log(`  total: ${totMissing.toLocaleString()} verses across ${missing.length} books`);
for (const r of missing) console.log(`     canon_id ${String(r.canon_id).padStart(3)}  ${String(r.n).padStart(5)} verses`);

console.log(`\nENGLISH VERSES THAT CHANGED (still present, but different text)`);
console.log(`  total: ${totChanged.toLocaleString()} verses across ${changed.length} books`);
for (const r of changed.slice(0, 12)) console.log(`     canon_id ${String(r.canon_id).padStart(3)}  ${String(r.n).padStart(5)} verses`);
if (changed.length > 12) console.log(`     ... and ${changed.length - 12} more books`);
console.log('  (canon_id 1-39 changing is EXPECTED — that is the new OT baseline.');
console.log('   Anything above 39 changing is NOT, and is worth a look.)');

if (!RESTORE) {
  console.log('\n[report only] nothing written. Re-run with --restore to put the missing verses back.');
  db.close();
  process.exit(0);
}

// Restore ONLY what is missing/blank. Never touch a verse that has text — the new
// OT baseline stays exactly as it is.
const ins = db.prepare(`
  INSERT INTO verses (id, corpus, canon_id, chapter, verse, text)
  SELECT b.id, b.corpus, b.canon_id, b.chapter, b.verse, b.text
    FROM bak.verses b LEFT JOIN verses v ON v.id = b.id
   WHERE b.corpus = 'ENG' AND b.text IS NOT NULL AND b.text <> '' AND v.id IS NULL
  ON CONFLICT(id) DO NOTHING
`);
const upd = db.prepare(`
  UPDATE verses SET text = (SELECT b.text FROM bak.verses b WHERE b.id = verses.id)
   WHERE corpus = 'ENG' AND (text IS NULL OR text = '')
     AND EXISTS (SELECT 1 FROM bak.verses b WHERE b.id = verses.id AND b.text <> '')
`);
let n1 = 0, n2 = 0;
db.transaction(() => { n1 = ins.run().changes; n2 = upd.run().changes; })();
console.log(`\n\u2713 reinserted ${n1.toLocaleString()} deleted verses`);
console.log(`\u2713 refilled ${n2.toLocaleString()} blanked verses`);

const left = db.prepare(`
  SELECT COUNT(*) n FROM bak.verses b LEFT JOIN verses v ON v.id = b.id
   WHERE b.corpus='ENG' AND b.text<>'' AND (v.id IS NULL OR v.text IS NULL OR v.text='')
`).get().n;
console.log(`postcondition — English verses still missing: ${left}  (must be 0)`);
if (left) { console.error('\u2717 restore incomplete'); db.close(); process.exit(1); }
console.log('\nRestart the server. The NT and the non-canonical books are back.');
db.close();
