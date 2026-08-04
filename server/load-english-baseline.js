#!/usr/bin/env node
/**
 * load-english-baseline.js  (v3 — aligns BOTH the reading baseline and the
 *                            pre-save to your MT verse grid)
 * ------------------------------------------------------------------
 * The passed-through English baseline (WEB; every proper noun and divine title
 * in YOUR transliteration — Yahawah, Alahayam, Yashawai) is written to TWO
 * places, both keyed by canon_id and both aligned to YOUR grid:
 *
 *   (1) corpus.db  ENG source        → what /parallel and the reader READ.
 *       /parallel now shows this baseline for EVERY verse, whether or not you've
 *       translated it; your saved translation simply overrides it. No per-verse
 *       Save needed to see your English.
 *
 *   (2) translation.db  translations → the Studio's editable draft (pre-saved as
 *       text + original_text snapshot, source_origin='web-passthrough'). Opening
 *       a verse shows the draft; editing overrides it; revert restores it; a
 *       verse you already translated is never touched.
 *
 * VERSIFICATION — both are aligned to tokens_bhs (MT), not WEB. Psalms are the
 * main case: your MT numbers the superscription as verse 1 (or 1-2), WEB doesn't.
 * Per chapter we compare verse counts and right-align, so the psalm BODY lands on
 * the right verses and the title verse is left blank for you. Malachi ch4 and
 * Joel fold to MT chapters explicitly (matching the reader's VERSIFICATION_MAP).
 * Non-Hebrew books (NT beyond Matthew, works) keep WEB's own grid.
 *
 * Usage (from the folder with corpus.db + translation.db + the jsonl):
 *     node load-english-baseline.js
 * Untouched (never hand-edited) drafts are always refreshed to match the new
 * baseline now — see the 2026-07-27 note at resetUntouched below for why this
 * used to require a --reset-baseline flag and no longer does.
 * After it finishes: restart the server.
 */
'use strict';
const fs = require('fs'), path = require('path');
const Database = require('better-sqlite3');

const args = process.argv.slice(2);
const positional = args.filter(a => !a.startsWith('--'));
const DB_PATH    = positional[0] || path.join(process.cwd(), 'corpus.db');
const JSONL_PATH = positional[1] || path.join(process.cwd(), 'english-baseline.jsonl');
const TDB_PATH   = path.join(path.dirname(DB_PATH), 'translation.db');
const SRC_TAG = 'web-passthrough';
const CODE2CANON = {"GEN":1,"EXOD":2,"LEV":3,"NUM":4,"DEUT":5,"JOSH":6,"JUDG":7,"RUTH":8,"1SAM":9,"2SAM":10,"1KGS":11,"2KGS":12,"1CHR":13,"2CHR":14,"EZRA":15,"NEH":16,"EST":17,"JOB":18,"PSA":19,"PROV":20,"ECCL":21,"SONG":22,"ISA":23,"JER":24,"LAM":25,"EZK":26,"DAN":27,"HOS":28,"JOEL":29,"AMO":30,"OBA":31,"JONAH":32,"MIC":33,"NAM":34,"HAB":35,"ZEP":36,"HAG":37,"ZEC":38,"MAL":39,"MAT":40,"MRK":41,"LUK":42,"JHN":43,"ACT":44,"ROM":45,"1CO":46,"2CO":47,"GAL":48,"EPH":49,"PHP":50,"COL":51,"1TH":52,"2TH":53,"1TI":54,"2TI":55,"TIT":56,"PHM":57,"HEB":58,"JAS":59,"1PE":60,"2PE":61,"1JN":62,"2JN":63,"3JN":64,"JUD":65,"REV":66};
const CANON2CODE = Object.fromEntries(Object.entries(CODE2CANON).map(([k,v]) => [v, k]));

function die(m){ console.error('✗ '+m); process.exit(1); }
if (!fs.existsSync(DB_PATH))    die('corpus.db not found at ' + DB_PATH);
if (!fs.existsSync(JSONL_PATH)) die('english-baseline.jsonl not found at ' + JSONL_PATH);
if (!fs.existsSync(TDB_PATH))   die('translation.db not found at ' + TDB_PATH + ' (run the app once to create it)');

// ── load WEB baseline: canon_id -> {chapter -> {verse -> text}} ───────────────
const web = {};
for (const ln of fs.readFileSync(JSONL_PATH,'utf8').split(/\r?\n/)) {
  if (!ln) continue;
  let o; try { o = JSON.parse(ln); } catch { continue; }
  const c = CODE2CANON[o.code]; if (!c) continue;
  ((web[c] ||= {})[o.chapter] ||= {})[o.verse] = String(o.text || '');
}
if (!Object.keys(web).length) die('no baseline rows parsed');

// ── chapter-structure remap for the two books whose chapters differ from MT ───
function remapChapters(canon, chapters) {
  if (canon === 39 && chapters[4]) {                 // Malachi: Eng ch4 = MT ch3 tail
    const c3 = { ...(chapters[3]||{}) }, base = Object.keys(c3).length, c4 = chapters[4]||{};
    for (const v of Object.keys(c4).map(Number).sort((a,b)=>a-b)) c3[base+v] = c4[v];
    return { 1: chapters[1], 2: chapters[2], 3: c3 };
  }
  if (canon === 29 && chapters[2]) {                 // Joel: Eng 2:28-32 = MT ch3, Eng ch3 = MT ch4
    const c2 = chapters[2]||{}, out2 = {}, out3 = {};
    for (const v of Object.keys(c2).map(Number)) { if (v <= 27) out2[v] = c2[v]; else out3[v-27] = c2[v]; }
    return { 1: chapters[1], 2: out2, 3: out3, 4: chapters[3] };
  }
  return chapters;
}

// ── WEB->MT verse alignment within a chapter (superscription right-align) ─────
function alignChapter(mtVerses, webByVerse) {
  const webVs = Object.keys(webByVerse||{}).map(Number).sort((a,b)=>a-b);
  const M = mtVerses.length, W = webVs.length, out = new Map();
  if (!W) { for (const v of mtVerses) out.set(v, null); return out; }
  if (M === W)      mtVerses.forEach((v,i)=>out.set(v, webByVerse[webVs[i]]));
  else if (M > W) { const lead=M-W; mtVerses.forEach((v,i)=>out.set(v, i<lead?null:webByVerse[webVs[i-lead]])); }
  else              mtVerses.forEach((v,i)=>out.set(v, i<W?webByVerse[webVs[i]]:null));
  return out;
}

const db  = new Database(DB_PATH);  db.pragma('journal_mode = WAL');
const tdb = new Database(TDB_PATH); tdb.pragma('journal_mode = WAL');
for (const c of ['source_origin TEXT','original_text TEXT'])
  try { tdb.exec('ALTER TABLE translations ADD COLUMN '+c); } catch(e){}

// ── build ONE aligned baseline (canon_id, MT chapter, MT verse, text) ─────────
// used identically by the corpus ENG source (reading) and the pre-save (Studio).
const hebBooks = new Set(db.prepare('SELECT DISTINCT book_id FROM tokens_bhs').all().map(r=>r.book_id));
// tokens_bhs has one row PER TOKEN (many per verse). We need the DISTINCT verse
// list per chapter — DISTINCT in SQL plus a Set here guards against the verse
// being counted once per word (which would wreck the alignment).
const mtGridStmt = db.prepare('SELECT DISTINCT chapter, verse FROM tokens_bhs WHERE book_id=? ORDER BY chapter, verse');
const aligned = [];   // {canon, ch, v, text}
let hebBooksN=0, nonHebN=0, offsetChapters=0, titlesBlank=0;
for (const [canonStr, chaptersRaw] of Object.entries(web)) {
  const canon = +canonStr;
  if (hebBooks.has(canon)) {                          // align to MT grid
    hebBooksN++;
    const chapters = remapChapters(canon, chaptersRaw);
    const grid = {}; for (const r of mtGridStmt.all(canon)) { const c = Number(r.chapter); (grid[c] ||= new Set()).add(Number(r.verse)); }
    for (const ch of Object.keys(grid).map(Number)) {
      const mtVs = [...grid[ch]].sort((a,b)=>a-b), webCh = chapters[ch] || {};
      if (Object.keys(webCh).length && mtVs.length !== Object.keys(webCh).length) offsetChapters++;
      for (const [v, text] of alignChapter(mtVs, webCh)) {
        if (text == null) { titlesBlank++; continue; }
        aligned.push({ canon, ch, v, text });
      }
    }
  } else {                                            // non-Hebrew: WEB's own grid
    nonHebN++;
    for (const ch of Object.keys(chaptersRaw).map(Number))
      for (const v of Object.keys(chaptersRaw[ch]).map(Number))
        aligned.push({ canon, ch, v, text: chaptersRaw[ch][v] });
  }
}

// ── STEP 1 — corpus.db ENG source (what /parallel + reader READ) ──────────────
{
  const cols = db.prepare('PRAGMA table_info(verses)').all().map(c=>c.name);
  for (const need of ['corpus','code','chapter','verse','ord_c','ord_v','text','category','src','canon_id','ref_key','book_id'])
    if (!cols.includes(need)) die('verses table missing column: '+need);
  const del = db.prepare("DELETE FROM verses WHERE corpus='ENG' AND src=?");
  const ins = db.prepare(`INSERT INTO verses (ref_key,book_id,corpus,code,chapter,verse,ord_c,ord_v,text,category,src,canon_id)
    VALUES (@ref,@bid,'ENG',@code,@ch,@v,@ch,@v,@text,'scripture',@src,@canon)`);
  const tx = db.transaction(()=>{
    const removed = del.run(SRC_TAG).changes;
    for (const a of aligned) {
      const code = CANON2CODE[a.canon] || String(a.canon);
      ins.run({ref:`ENG:${code}:${a.ch}:${a.v}`,bid:a.canon,code,ch:a.ch,v:a.v,text:a.text,src:SRC_TAG,canon:a.canon});
    }
    return removed;
  });
  const removed = tx();
  console.log(`[1] corpus.db ENG (reading): removed ${removed}, inserted ${aligned.length} verses — MT-aligned`);
}

// ── STEP 2 — pre-save into translation.db (Studio editable draft) ─────────────
{
  const importOriginal = tdb.prepare(`
    INSERT INTO translations(book_id,chapter,verse,status,text,rich_text,source_origin,original_text,updated_at)
    VALUES(?,?,?, 'none', ?, '', '${SRC_TAG}', ?, datetime('now'))
    ON CONFLICT(book_id,chapter,verse) DO UPDATE SET
      source_origin = COALESCE(translations.source_origin, excluded.source_origin),
      original_text = COALESCE(translations.original_text, excluded.original_text)`);
  const resetUntouched = tdb.prepare(`UPDATE translations SET text=?, original_text=?, updated_at=datetime('now')
      WHERE book_id=? AND chapter=? AND verse=? AND source_origin='${SRC_TAG}'
        AND status='none' AND (original_text IS NULL OR text=original_text)`);
  // BUG FOUND 2026-07-27: resetUntouched (the only statement that refreshes an
  // ALREADY-SEEDED verse's `text` column) used to run ONLY behind --reset-baseline
  // — a flag this OT-only baseline was never supposed to use (see the "OT-ONLY"
  // warning below), because some OTHER part of a full --all run treats it as
  // license to touch books outside the file. Net effect: every OT verse's
  // translation.db `text` froze at whatever it was the FIRST time it was ever
  // seeded, and no fix to the render pipeline since then ever reached the reader
  // — /api/translate/chapter serves saved.text over the fresh baseline whenever
  // saved.text is non-empty, with no check of freshness. term-forms.txt pins,
  // the man/mankind fix, the Yod-suffix fix — none of it was ever visible.
  // resetUntouched is already scoped to rows NO ONE has touched (status='none'
  // AND text still equals its own original_text) and tagged to THIS baseline's
  // own source_origin, so refreshing it is safe unconditionally — it can never
  // clobber a human edit or a different baseline's rows. Run it every time.
  const tx = tdb.transaction(()=>{
    for (const a of aligned) {
      importOriginal.run(a.canon, a.ch, a.v, a.text, a.text);
      resetUntouched.run(a.text, a.text, a.canon, a.ch, a.v);
    }
  });
  tx();
  console.log(`[2] translation.db pre-save: ${aligned.length} verses pre-filled + untouched drafts refreshed to the new baseline (edits still override)`);
}

console.log(`      Hebrew-grid books ${hebBooksN} · non-Hebrew books ${nonHebN} · versification-offset chapters ${offsetChapters} · title verses left blank ${titlesBlank}`);

// ── read-back proof: /parallel reads corpus ENG by (canon_id, MT ch, MT v) ─────
const rb = db.prepare("SELECT text FROM verses WHERE corpus='ENG' AND book_id=? AND chapter=? AND verse=? LIMIT 1");
for (const [c,ch,v,label] of [[1,1,1,'Genesis 1:1'],[1,1,2,'Genesis 1:2 (untouched)'],[19,23,1,'Psalm 23:1'],[19,51,1,'Psalm 51:1 (MT title)'],[19,51,3,'Psalm 51:3 (body)'],[40,1,1,'Matthew 1:1']]) {
  const r = rb.get(c,ch,v);
  console.log('  '+label.padEnd(26)+' → '+(r && r.text ? r.text.slice(0,58) : '(blank — title verse, you render it)'));
}
db.close(); tdb.close();
console.log('\n→ Restart the server. /parallel now shows your English on every verse; edits override the baseline.');
