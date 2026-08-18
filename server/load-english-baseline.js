#!/usr/bin/env node
/**
 * load-english-baseline.js  (v5 — extends the chapter-boundary remap that
 *                            previously only covered Malachi/Joel to every
 *                            other MT/English versification difference)
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
 * VERSIFICATION — both are aligned to tokens_bhs (MT), not WEB.
 *
 * BUG FOUND 2026-08-18 (fieldy, investigating 1 Chronicles 5 / a Strong's #
 * lookup that led back to this chapter): the v3 alignChapter() treated EVERY
 * MT-vs-WEB verse-count mismatch in a chapter as a Psalms-style leading
 * superscription and unconditionally right-aligned — blank the first `M-W`
 * MT verses (by POSITION, not by verse number), then map the rest onto WEB's
 * own verses in order. Fixed in v4: plain NUMBER alignment (MT verse N ->
 * WEB's own verse N for that SAME chapter number), because tokens_bhs already
 * gives a Psalm's superscription its own verse number, 0, so no special-casing
 * was needed for that case.
 *
 * SECOND BUG FOUND 2026-08-18, same investigation, after fieldy pushed back on
 * "genuinely missing" (correctly — see below): v4's plain per-chapter-number
 * alignment is only correct when Hebrew (MT) and English draw a book's chapter
 * boundaries in the SAME place. They frequently don't — this is a well known,
 * well documented fact about the Masoretic Text (e.g. MT Exodus 7 runs 4 verses
 * longer than English Exodus 7, because English Exodus 8:1-4 is still part of
 * MT's chapter 7; MT Isaiah 8:23 is English Isaiah 9:1, the "Galilee of the
 * nations" verse; MT 1 Chronicles 5 runs to verse 41 where English 1 Chronicles
 * 6 starts at what MT calls 5:27). None of these 109 verses flagged by
 * verify-verse-completeness.mjs were ever actually absent from the WEB source —
 * every one of them cross-checks exactly (same verse range, same verse count)
 * against the standard MT/English versification-difference table. v4's
 * same-chapter-number alignment simply never looked at the ADJACENT chapter,
 * so the overflow verses came out blank, and — worse, for chapters where the
 * boundary shifts partway through rather than just at the tail (Numbers 17,
 * Ezekiel 21, Hosea 2, Zechariah 2, several others) — the verses BEFORE the
 * blank run got silently WRONG content (the adjacent chapter's same-numbered
 * verse), which the blank-only completeness checker never caught at all.
 *
 * FIXED (v5): remapChapters() already had exactly the right mechanism for
 * this — it was just only wired up for Malachi and Joel. Generalized it with
 * shiftChapterBoundary(), a single reusable primitive that moves verses across
 * a chapter boundary by a signed offset (positive = the lower-numbered MT
 * chapter absorbs the head of the next English chapter and runs longer;
 * negative = the lower MT chapter is shorter and the next MT chapter absorbs
 * its tail instead), then wired up CHAPTER_BOUNDARY_SHIFTS with every offset
 * cross-verified against both a public versification-difference reference
 * (https://matthewbarron.org/bible-versification-compared/) AND the actual
 * 109-verse gap list from verify-verse-completeness.mjs (every shift below
 * was checked to reproduce the EXACT verse range that showed up as blank
 * under the old same-chapter-number alignment, not just "looked plausible").
 *
 * A first pass of this table over-reached twice and both were caught by
 * re-running verify-verse-completeness.mjs afterward (see the inline notes
 * at CHAPTER_BOUNDARY_SHIFTS and duplicateAcrossBoundary): a guessed
 * Numbers 25/26 shift that wasn't checked against a source first, and a
 * 1 Samuel 20/21 shift that's really a sub-verse clause split, not a
 * whole-verse move. Both are fixed now. 106 of the 109 known gaps are
 * covered. Three (1 Kings 22:54, 1 Chronicles 12:41, Numbers 25:19) are
 * single trailing verses in chapters with no adjacent-chapter shift
 * evidenced anywhere else in the gap list — they may be genuine rare
 * MT-only readings rather than a boundary shift, and are deliberately left
 * alone rather than guessed at. Re-run verify-verse-completeness.mjs after
 * this to see what (if anything) is still really missing — expect the
 * allowlist to hold at exactly those 3, no more, no fewer.
 *
 * Net rule, still the only rule for the actual verse-to-verse match once
 * chapters are correctly lined up: WEB's own verse N is MT verse N's
 * counterpart. A verse WEB doesn't have for that (correctly identified)
 * chapter is left honestly blank instead of stealing another verse's content.
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
  if (!web[c]) web[c] = {};                          // Node <15 compat: no ||= on this box
  if (!web[c][o.chapter]) web[c][o.chapter] = {};
  web[c][o.chapter][o.verse] = String(o.text || '');
}
if (!Object.keys(web).length) die('no baseline rows parsed');

// ── generic MT/English chapter-boundary shift ──────────────────────────────
// Moves verses across a chapter boundary by a signed `offset`, where offset =
// (the lower-numbered MT chapter's real length) - (that same chapter's WEB/
// English length):
//   offset > 0  MT's lower chapter is LONGER — it absorbs the first `offset`
//               verses of the English chapter that follows, and everything
//               after that in the English chapter shifts back by `offset` to
//               become the (renumbered) start of MT's next chapter.
//   offset < 0  MT's lower chapter is SHORTER by `-offset` — its own trailing
//               `-offset` verses actually belong (in MT's numbering) to the
//               START of the next MT chapter, ahead of that chapter's own verses.
// Either way, total verse count across the pair is conserved — nothing is
// invented or dropped, only relabeled to the numbering tokens_bhs actually uses.
function shiftChapterBoundary(chapters, chLow, chHigh, offset) {
  const low = chapters[chLow] || {};
  const high = chapters[chHigh] || {};
  const lowNums = Object.keys(low).map(Number);
  const highNums = Object.keys(high).map(Number);
  if (!lowNums.length && !highNums.length) return chapters;   // book doesn't reach here in this source
  const lowLen = lowNums.length ? Math.max(...lowNums) : 0;
  const outLow = {}, outHigh = {};
  if (offset > 0) {
    for (const v of lowNums) outLow[v] = low[v];
    for (const v of highNums) {
      if (v <= offset) outLow[lowLen + v] = high[v];
      else outHigh[v - offset] = high[v];
    }
  } else if (offset < 0) {
    const k = -offset;
    for (const v of lowNums) {
      if (v > lowLen - k) outHigh[v - (lowLen - k)] = low[v];
      else outLow[v] = low[v];
    }
    for (const v of highNums) outHigh[v + k] = high[v];
  } else {
    return chapters;
  }
  return { ...chapters, [chLow]: outLow, [chHigh]: outHigh };
}

// ── one-off: MT chHigh's v1 is only the LAST CLAUSE of English chLow's final
// verse (a sub-verse split — e.g. "MT 1 Samuel 21:1 = English 20:42 (last
// clause)"), not a whole-verse move. english-baseline.jsonl only has whole
// verses, so shiftChapterBoundary's clean move would wrongly BLANK chLow's
// final verse (confirmed: an earlier version of this file did exactly that —
// re-running verify-verse-completeness.mjs after the first CHAPTER_BOUNDARY_
// SHIFTS pass surfaced a brand-new "1 Samuel 20:42" blank that had never been
// in the original 109-verse gap list). Fix: keep chLow's final verse in
// place (never blank it) AND copy the same whole-verse text into chHigh's
// new v1 — an over-inclusive but genuine (never fabricated) approximation of
// the clause split, since we can't cut a single WEB verse at the clause
// boundary. chHigh's own original verses shift back by 1 to make room.
function duplicateAcrossBoundary(chapters, chLow, chHigh) {
  const low = chapters[chLow] || {};
  const high = chapters[chHigh] || {};
  const lowNums = Object.keys(low).map(Number);
  if (!lowNums.length) return chapters;
  const lowLen = Math.max(...lowNums);
  const outHigh = { 1: low[lowLen] };
  for (const v of Object.keys(high).map(Number)) outHigh[v + 1] = high[v];
  return { ...chapters, [chHigh]: outHigh };   // chLow is untouched — its final verse stays
}

// ── every known MT/English chapter-boundary difference that this corpus's
// gap list actually evidenced (canon_id -> [[chLow, chHigh, offset], ...]) ──
// Cross-checked against https://matthewbarron.org/bible-versification-compared/
// AND against verify-verse-completeness.mjs's 109-verse gap list — each row
// was verified to reproduce the EXACT verse range that showed up blank under
// the old same-chapter-number alignment. Chapters within a book never repeat
// across rows, so applying them in any order is safe.
const CHAPTER_BOUNDARY_SHIFTS = {
  1:  [[31,32,-1]],                                    // Genesis: 31:55 -> 32:1
  2:  [[7,8,4], [21,22,1]],                             // Exodus: 7:26-29=8:1-4; 21:37=22:1
  3:  [[5,6,7]],                                        // Leviticus: 5:20-26=6:1-7
  4:  [[16,17,-15], [29,30,-1]],                        // Numbers (25/26 removed — see note below)
  5:  [[12,13,-1], [22,23,-1], [28,29,1]],              // Deuteronomy
  9:  [[23,24,-1]],                                     // 1 Samuel (20/21 handled via duplicateAcrossBoundary below)
  10: [[18,19,-1]],                                     // 2 Samuel
  11: [[4,5,-14]],                                      // 1 Kings 4/5
  12: [[11,12,-1]],                                     // 2 Kings
  13: [[5,6,15]],                                       // 1 Chronicles 5/6
  14: [[1,2,1], [13,14,1]],                             // 2 Chronicles
  16: [[3,4,6], [9,10,-1]],                             // Nehemiah
  18: [[40,41,8]],                                      // Job
  21: [[4,5,1]],                                        // Ecclesiastes 4:17=5:1
  22: [[6,7,-1]],                                       // Song of Songs
  23: [[8,9,1]],                                        // Isaiah 8:23=9:1
  24: [[8,9,1]],                                        // Jeremiah 8:23=9:1
  26: [[20,21,-5]],                                     // Ezekiel
  27: [[3,4,3], [5,6,-1]],                              // Daniel
  28: [[1,2,-2], [11,12,-1], [13,14,-1]],               // Hosea
  32: [[1,2,-1]],                                       // Jonah
  33: [[4,5,1]],                                        // Micah 4:14=5:1
  34: [[1,2,-1]],                                       // Nahum
  38: [[1,2,-4]],                                       // Zechariah
};
// Numbers 25/26: an earlier version of this file guessed a [25,26,1] shift
// by pattern-matching the single "Numbers 25:19" blank, WITHOUT checking an
// authoritative source first — a mistake (evidence-first, not invented, is
// the rule everywhere else in this file). Re-running verify-verse-
// completeness.mjs after that guess surfaced a brand-new "Numbers 26:65"
// blank that had never been in the original 109-verse gap list, proving the
// guess wrong: MT Numbers 26 is NOT shorter than English's — chapter 26 needs
// no remap at all. 25:19 is left as a standalone, unresolved single verse
// (same status as 1 Kings 22:54 / 1 Chronicles 12:41 below) rather than
// guessed at again.

// ── chapter-structure remap: Malachi/Joel (whole-chapter merges/splits,
// pre-dating v5) plus every boundary shift in the table above ───────────────
function remapChapters(canon, chapters) {
  if (canon === 9) chapters = duplicateAcrossBoundary(chapters, 20, 21);   // 1 Samuel 20/21 (clause split, see above)
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
  const shifts = CHAPTER_BOUNDARY_SHIFTS[canon];
  if (shifts) {
    let out = chapters;
    for (const [lo, hi, off] of shifts) out = shiftChapterBoundary(out, lo, hi, off);
    return out;
  }
  return chapters;
}

// ── WEB->MT verse alignment within a (now correctly identified) chapter ─────
// WEB's own verse N is MT verse N's counterpart, always — no further
// book-specific exception, no position-based shifting. A verse WEB doesn't
// have is left null (honestly missing) rather than borrowing another verse's
// text. remapChapters() above is what makes "verse N" line up on both sides
// before this ever runs.
function alignChapter(mtVerses, webByVerse) {
  const out = new Map();
  for (const v of mtVerses) {
    out.set(v, Object.prototype.hasOwnProperty.call(webByVerse, v) ? webByVerse[v] : null);
  }
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
const blanked = [];   // {canon, ch, v} — MT verses with no WEB counterpart after alignment
let hebBooksN=0, nonHebN=0, offsetChapters=0, titlesBlank=0;
for (const [canonStr, chaptersRaw] of Object.entries(web)) {
  const canon = +canonStr;
  if (hebBooks.has(canon)) {                          // align to MT grid
    hebBooksN++;
    const chapters = remapChapters(canon, chaptersRaw);
    const grid = {}; for (const r of mtGridStmt.all(canon)) { const c = Number(r.chapter); if (!grid[c]) grid[c] = new Set(); grid[c].add(Number(r.verse)); }
    for (const ch of Object.keys(grid).map(Number)) {
      const mtVs = [...grid[ch]].sort((a,b)=>a-b), webCh = chapters[ch] || {};
      if (Object.keys(webCh).length && mtVs.length !== Object.keys(webCh).length) offsetChapters++;
      for (const [v, text] of alignChapter(mtVs, webCh)) {
        if (text == null) { titlesBlank++; blanked.push({ canon, ch, v }); continue; }
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

// ── STEP 3 — clear stale leftovers from a PRIOR (buggy) alignment ─────────────
// A verse that's honestly blank under the CORRECTED alignment may still hold
// real-looking text left over from a PREVIOUS run of an older alignment —
// text that actually belongs to some OTHER verse in the chapter. Left alone,
// that stale text would keep showing. Clear it, but ONLY where nobody has
// ever touched it — same safety gate as resetUntouched: tagged this
// baseline's own source_origin, status='none', and its text still equals its
// own original_text snapshot. A real human translation is never touched, at
// this step or any other.
{
  const clearStale = tdb.prepare(`
    UPDATE translations SET text='', original_text='', updated_at=datetime('now')
      WHERE book_id=? AND chapter=? AND verse=? AND source_origin='${SRC_TAG}'
        AND status='none' AND (original_text IS NULL OR text=original_text)
        AND text != ''`);
  const tx = tdb.transaction(()=>{
    let n = 0;
    for (const b of blanked) n += clearStale.run(b.canon, b.ch, b.v).changes;
    return n;
  });
  const cleared = tx();
  console.log(`[3] translation.db: cleared ${cleared} stale leftover verse(s) the corrected alignment no longer supports`);
}

console.log(`      Hebrew-grid books ${hebBooksN} · non-Hebrew books ${nonHebN} · versification-offset chapters ${offsetChapters} · title/absent verses left blank ${titlesBlank}`);
if (titlesBlank > 5) {
  console.log(`      NOTE: expected near-zero blanks beyond Psalm-title verse-0 slots and the three`);
  console.log(`      known unresolved single verses (1 Kings 22:54, 1 Chronicles 12:41, Numbers`);
  console.log(`      25:19). If this number looks high, re-run verify-verse-completeness.mjs and`);
  console.log(`      compare the reported gaps against CHAPTER_BOUNDARY_SHIFTS in this file's header.`);
}

// ── read-back proof: /parallel reads corpus ENG by (canon_id, MT ch, MT v) ─────
const rb = db.prepare("SELECT text FROM verses WHERE corpus='ENG' AND book_id=? AND chapter=? AND verse=? LIMIT 1");
for (const [c,ch,v,label] of [
  [1,1,1,'Genesis 1:1'],
  [1,1,2,'Genesis 1:2 (untouched)'],
  [1,32,33,'Genesis 32:33 (was blank — boundary shift w/ 31:55)'],
  [2,7,26,'Exodus 7:26 (was blank — boundary shift w/ Eng 8:1)'],
  [19,51,0,'Psalm 51:0 (MT title — expect blank)'],
  [19,51,1,'Psalm 51:1 (body — WEB v1)'],
  [23,8,23,'Isaiah 8:23 (was blank — = English 9:1)'],
  [40,1,1,'Matthew 1:1'],
  [13,5,1,'1 Chronicles 5:1 (was blank)'],
  [13,5,16,'1 Chronicles 5:16 (was mislabeled)'],
  [13,5,27,'1 Chronicles 5:27 (was blank — boundary shift, = English 6:1)'],
  [9,20,42,'1 Samuel 20:42 (must NOT be blank — duplicateAcrossBoundary fix)'],
  [9,21,1,'1 Samuel 21:1 (= English 20:42, clause-split approximation)'],
  [4,26,65,'Numbers 26:65 (must NOT be blank — Numbers 25/26 shift removed)'],
  [11,22,54,'1 Kings 22:54 (UNRESOLVED — expect still blank)'],
  [13,12,41,'1 Chronicles 12:41 (UNRESOLVED — expect still blank)'],
  [4,25,19,'Numbers 25:19 (UNRESOLVED — expect still blank)'],
]) {
  const r = rb.get(c,ch,v);
  console.log('  '+label.padEnd(58)+' → '+(r && r.text ? r.text.slice(0,58) : '(blank)'));
}
db.close(); tdb.close();
console.log('\n→ Restart the server. /parallel now shows your English on every verse; edits override the baseline.');
