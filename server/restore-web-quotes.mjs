// restore-web-quotes.mjs — put the WEB's quotation marks back onto the OT
// reading text in a LIVE translation.db, in place.
//
//   node restore-web-quotes.mjs               dry run: counts + samples, nothing written
//   node restore-web-quotes.mjs --apply       write (a timestamped backup copy is made first;
//                                             --no-backup skips it, e.g. on a throwaway copy)
//   node restore-web-quotes.mjs --db X        another translation.db (default ./translation.db)
//   node restore-web-quotes.mjs --book 3      one book only (canon_id)
//   node restore-web-quotes.mjs --show 20     how many changed verses to print (default 8)
//
// WHY THIS EXISTS. The OT is rendered from web-strongs.jsonl, whose quotation
// marks are a scrape artifact — QUOTE-PROOFREAD.md (2026-09-12) found openers
// missing before speech, closers stripped at verse ends, paragraph re-openers
// gone. apply-web-strongs.mjs now repairs every verse it renders against the
// clean WEB (english-web-raw.jsonl) via web-quotes.mjs; this script applies the
// identical repair to a database that was rendered before that existed, so
// prod's text is fixed in place (data flows prod → local, never the other
// way — feedback-prod-data-direction) without a full render-all.
//
// WHAT IT TOUCHES. Rows with source_origin 'web-passthrough' and an EMPTY
// rich_text — i.e. the pipeline's own text, never typed into the Studio (the
// rich_text edit signal, see the 2026-09-11 clobber notes). `text` is rewritten
// and, when `original_text` equalled the old text, `original_text` is rewritten
// too, so an untouched draft stays an untouched draft (live regloss keeps
// applying; a future reseed sees no hand edit). Word count never changes: only
// quote glyphs at word boundaries move.
//
// NUMBERING. english-web-raw.jsonl is in English numbering; translation.db keeps
// the Masoretic numbering in the boundary-shift books (Joel 2:28 = 3:1, Exodus
// 22:1 = 21:37, …). The map below is load-english-baseline.js's
// CHAPTER_BOUNDARY_SHIFTS / apply-web-strongs.mjs's mtVerseKey() — KEEP THE
// THREE IN SYNC. A verse whose plain English words are not mostly present in
// the WEB verse is skipped as "unaligned" (a hand rewrite, or a shift this
// table does not know).

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { restoreWebQuotes } from './web-quotes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] != null ? args[i + 1] : d; };
const APPLY = args.includes('--apply');
const DB_PATH = path.resolve(opt('--db', path.join(__dirname, 'translation.db')));
const WEB_F = path.resolve(opt('--web-raw', path.join(__dirname, 'english-web-raw.jsonl')));
const ONLY_BOOK = parseInt(opt('--book', '0'), 10) || null;
const SHOW = parseInt(opt('--show', '8'), 10);

const CODE2ID = {"GEN":1,"EXOD":2,"LEV":3,"NUM":4,"DEUT":5,"JOSH":6,"JUDG":7,"RUTH":8,"1SAM":9,"2SAM":10,"1KGS":11,"2KGS":12,"1CHR":13,"2CHR":14,"EZRA":15,"NEH":16,"EST":17,"JOB":18,"PSA":19,"PROV":20,"ECCL":21,"SONG":22,"ISA":23,"JER":24,"LAM":25,"EZK":26,"DAN":27,"HOS":28,"JOEL":29,"AMO":30,"OBA":31,"JONAH":32,"MIC":33,"NAM":34,"HAB":35,"ZEP":36,"HAG":37,"ZEC":38,"MAL":39};
const CHAPTER_BOUNDARY_SHIFTS = {
  1: [[31,32,-1]], 2: [[7,8,4],[21,22,1]], 3: [[5,6,7]], 4: [[16,17,-15],[29,30,-1]], 5: [[12,13,-1],[22,23,-1],[28,29,1]],
  9: [[23,24,-1]], 10: [[18,19,-1]], 11: [[4,5,-14]], 12: [[11,12,-1]], 13: [[5,6,15]], 14: [[1,2,1],[13,14,1]],
  16: [[3,4,6],[9,10,-1]], 18: [[40,41,8]], 21: [[4,5,1]], 22: [[6,7,-1]], 23: [[8,9,1]], 24: [[8,9,1]], 26: [[20,21,-5]],
  27: [[3,4,3],[5,6,-1]], 28: [[1,2,-2],[11,12,-1],[13,14,-1]], 32: [[1,2,-1]], 33: [[4,5,1]], 34: [[1,2,-1]], 38: [[1,2,-4]],
};

// english-web-raw -> Map "canon:mtChapter:mtVerse" -> WEB text
const web = new Map();
const engLen = new Map();
const raw = [];
for (const line of fs.readFileSync(WEB_F, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const r = JSON.parse(line);
  const canon = CODE2ID[String(r.code).toUpperCase()];
  if (!canon) continue;
  raw.push({ canon, chapter: r.chapter, verse: r.verse, text: r.text });
  const k = `${canon}:${r.chapter}`;
  if ((engLen.get(k) || 0) < r.verse) engLen.set(k, r.verse);
}
function mtKey(canon, chapter, verse) {
  let ch = chapter, v = verse;
  if (canon === 39 && ch === 4) { ch = 3; v = (engLen.get('39:3') || 18) + v; }
  else if (canon === 29) { if (ch === 2 && v > 27) { ch = 3; v -= 27; } else if (ch === 3) ch = 4; }
  else for (const [lo, hi, off] of CHAPTER_BOUNDARY_SHIFTS[canon] || []) {
    const lowLen = engLen.get(`${canon}:${lo}`) || 0;
    if (off > 0) { if (ch === hi) { if (v <= off) { ch = lo; v = lowLen + v; } else v -= off; } }
    else if (off < 0) { const k = -off; if (ch === lo && v > lowLen - k) { ch = hi; v -= (lowLen - k); } else if (ch === hi) v += k; }
  }
  return `${canon}:${ch}:${v}`;
}
for (const r of raw) web.set(mtKey(r.canon, r.chapter, r.verse), r.text);
console.log(`[quotes] ${web.size} WEB verses (${WEB_F})`);

const db = new Database(DB_PATH, { readonly: !APPLY });
const rows = db.prepare(`SELECT book_id, chapter, verse, text, original_text, rich_text, source_origin FROM translations
                         WHERE book_id <= 39 AND text IS NOT NULL AND text != '' ${ONLY_BOOK ? 'AND book_id=' + ONLY_BOOK : ''}
                         ORDER BY book_id, chapter, verse`).all();
const stats = { rows: rows.length, noWeb: 0, handEdited: 0, otherOrigin: 0, unaligned: 0, unchanged: 0, changed: 0 };
const changes = [];
for (const r of rows) {
  const w = web.get(`${r.book_id}:${r.chapter}:${r.verse}`);
  if (!w) { stats.noWeb++; continue; }
  if (r.rich_text && r.rich_text !== '') { stats.handEdited++; continue; }
  if (r.source_origin !== 'web-passthrough') { stats.otherOrigin++; continue; }
  const q = restoreWebQuotes(r.text, w);
  if (!q.aligned) { stats.unaligned++; continue; }
  if (!q.changed) { stats.unchanged++; continue; }
  const wc = t => t.trim().split(/\s+/).length;
  if (wc(q.text) !== wc(r.text)) { console.warn(`[quotes] word count changed — skipped ${r.book_id}:${r.chapter}:${r.verse}`); continue; }
  stats.changed++;
  changes.push({ r, text: q.text, web: w });
}
console.log('[quotes]', JSON.stringify(stats));
for (const c of changes.slice(0, SHOW)) {
  console.log(`\n${c.r.book_id}:${c.r.chapter}:${c.r.verse}\n  WEB: ${c.web}\n  OLD: ${c.r.text}\n  NEW: ${c.text}`);
}
if (!APPLY) { console.log(`\n[quotes] dry run — ${changes.length} verses would change. Re-run with --apply.`); process.exit(0); }

if (!args.includes('--no-backup')) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  // beside the REAL file (on prod translation.db is a symlink into /data —
  // a backup next to the symlink would live inside the container and vanish
  // with the next deploy)
  const real = fs.realpathSync(DB_PATH);
  const bak = `${real}.pre-quotes-${stamp}`;
  fs.copyFileSync(real, bak);
  console.log(`[quotes] backup: ${bak}`);
}
const upd = db.prepare(`UPDATE translations SET text=?, original_text=CASE WHEN original_text=? THEN ? ELSE original_text END, updated_at=datetime('now')
                        WHERE book_id=? AND chapter=? AND verse=?`);
const tx = db.transaction(() => { for (const c of changes) upd.run(c.text, c.r.text, c.text, c.r.book_id, c.r.chapter, c.r.verse); });
tx();
console.log(`[quotes] applied to ${changes.length} verses in ${DB_PATH}`);
