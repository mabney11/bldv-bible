// restore-nt-baseline.mjs — restore NT English to translation.db using CANON_IDs.
// translation.db book_id = canon_id (40-66 for NT), NOT the corpus book_id.
// This matches how load-english-baseline.js seeds OT (book_id = canon_id 1-39).
//
//   node restore-nt-baseline.mjs [path/to/english-nt-baseline.jsonl]

import { readFileSync, existsSync } from 'node:fs';
const die = m => { console.error('\u2717 '+m); process.exit(1); };
let Database; try{({default:Database}=await import('better-sqlite3'));}catch{die('run from server/');}

const BAK = process.argv[2] || './english-nt-baseline.jsonl';
if (!existsSync(BAK))            die(`not found: ${BAK}`);
if (!existsSync('./translation.db')) die('translation.db not found');

// NT books in canonical order — canon_id 40-66
const CANON = {
  MAT:40,MRK:41,LUK:42,JHN:43,ACT:44,ROM:45,'1CO':46,'2CO':47,GAL:48,EPH:49,
  PHP:50,COL:51,'1TH':52,'2TH':53,'1TI':54,'2TI':55,TIT:56,PHM:57,HEB:58,
  JAS:59,'1PE':60,'2PE':61,'1JN':62,'2JN':63,'3JN':64,JUD:65,REV:66
};

const rows = readFileSync(BAK,'utf8').split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l));
const ntRows = rows.filter(r => CANON[r.code]);
console.log(`NT baseline: ${ntRows.length} verses, ${new Set(ntRows.map(r=>r.code)).size} books`);
console.log('Using canon_ids:');
for (const [code, cid] of Object.entries(CANON)) {
  const n = ntRows.filter(r=>r.code===code).length;
  if (n) console.log(`  ${code} -> canon_id ${cid}: ${n} verses`);
}

const tdb = new Database('./translation.db');
tdb.pragma('journal_mode=WAL');
const cols = tdb.prepare('PRAGMA table_info(translations)').all().map(c=>c.name);
const hasOrig = cols.includes('original_text');
const hasSrc  = cols.includes('source_origin');
const hasStat = cols.includes('status');

// BUG FOUND 2026-07-27 (same class fixed the same day in reseed-translations.mjs
// and load-english-baseline.js): this used to unconditionally DELETE every NT
// row (book_id 40-66) and reinsert from the baseline file with INSERT OR
// REPLACE -- wiping out any human Studio translation saved for the NT, status
// and all, with no guard. That destructive behaviour is now gated behind
// --force (a real "wipe and restore from scratch" is sometimes exactly what
// you want from a script literally named "restore"), and by default this only
// touches rows nobody has ever edited: status='none' AND text still equals
// its own original_text. A saved 'done'/'in_progress' verse is left alone
// either way unless you explicitly pass --force.
const FORCE = process.argv.includes('--force');
let n_del = 0;
if (FORCE) {
  n_del = tdb.prepare('DELETE FROM translations WHERE book_id >= 40 AND book_id <= 66').run().changes;
  console.log(`\n--force: cleared ${n_del} existing NT rows from translation.db (including any saved edits)`);
} else {
  console.log('\n(no --force: rows a human has saved a translation for are left untouched)');
}

const colStr = `book_id,chapter,verse,status,text${hasSrc?',source_origin':''}${hasOrig?',original_text':''}`;
const valStr = `?,?,?,'none',?${hasSrc?`,'web-en'`:''}${hasOrig?',?':''}`;
const importOriginal = tdb.prepare(`
  INSERT INTO translations (${colStr}) VALUES (${valStr})
  ON CONFLICT(book_id, chapter, verse) DO UPDATE SET
    source_origin = COALESCE(translations.source_origin, excluded.source_origin),
    original_text = COALESCE(translations.original_text, excluded.original_text)
`);
const resetUntouched = tdb.prepare(`
  UPDATE translations SET text = ?, original_text = ?, updated_at = datetime('now')
  WHERE book_id = ? AND chapter = ? AND verse = ?
    AND status = 'none' AND (original_text IS NULL OR text = original_text)
`);

let n = 0;
tdb.transaction(() => {
  for (const r of ntRows) {
    const cid = CANON[r.code];
    const vals = [cid, r.chapter, r.verse, r.text];
    if (hasOrig) vals.push(r.text);
    importOriginal.run(...vals);
    resetUntouched.run(r.text, r.text, cid, r.chapter, r.verse);
    n++;
  }
})();
tdb.close();

console.log(`\u2713 wrote/refreshed ${n} NT verses in translation.db (book_id = canon_id; saved edits left untouched)`);
// Verify a sample
const tdb2 = new Database('./translation.db', {readonly:true});
const sample = tdb2.prepare('SELECT * FROM translations WHERE book_id=40 AND chapter=1 AND verse=1').get();
console.log(`\nVerify MAT 1:1 (book_id=40): ${sample ? sample.text?.slice(0,70) : 'NOT FOUND'}`);
tdb2.close();
console.log('\nRestart the server.');
