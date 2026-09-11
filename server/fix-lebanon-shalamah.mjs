#!/usr/bin/env node
/**
 * fix-lebanon-shalamah.mjs — one targeted repair, idempotent, safe to re-run.
 *
 * apply-web-strongs.mjs checked every WEB (English-numbered) verse against OSHB's
 * tags for the SAME chapter:verse in MT numbering. In the books where a chapter
 * boundary differs (1 Kings 4/5, 2 Chronicles 1/2, …) that is the wrong verse:
 * English 1 Kings 5:6 ("cedar trees out of Lebanon") was compared with MT 5:6
 * ("Solomon had forty thousand stalls"), found no H3844 there, and the gate's
 * "better Strong's in this verse" fallback printed "Shalamah (Lebanon)" — in
 * 1 Kings 5:20, 23, 28 (MT numbering, as translation.db keys them) and
 * 2 Chronicles 2:15. apply-web-strongs.mjs now maps to the MT verse first
 * (mtVerseKey), so the next full render-all fixes these chapters properly (and
 * gives the rest of those chapters the glosses the gate had been blocking).
 * Until then this script repairs the visible damage in place:
 *   - english-baseline.jsonl: "Shalamah (Lebanon)" -> "Labanawan (Lebanon)"
 *   - translation.db: the same, ONLY in verses never hand-edited (rich_text = '')
 * Usage (from server/):  node fix-lebanon-shalamah.mjs [--dry-run] [--trans=./translation.db] [--baseline=./english-baseline.jsonl]
 * (prod: --trans=/mnt/paleo-data/translation.db — the baseline file lives with the code)
 */
import fs from 'node:fs';
import Database from 'better-sqlite3';
const DRY = process.argv.includes('--dry-run');
const opt = (k, d) => { const a = process.argv.find((x) => x.startsWith(k + '=')); return a ? a.slice(k.length + 1) : d; };
const TRANS = opt('--trans', './translation.db'), BASE = opt('--baseline', './english-baseline.jsonl');
const BAD = 'Shalamah (Lebanon)', GOOD = 'Labanawan (Lebanon)';

// 1. the baseline file
const lines = fs.readFileSync(BASE, 'utf8').split(/\r?\n/);
let fileHits = 0;
const out = lines.map((ln) => { if (ln.includes(BAD)) { fileHits++; return ln.split(BAD).join(GOOD); } return ln; });
console.log(`english-baseline.jsonl: ${fileHits} verse(s) with "${BAD}"`);
if (fileHits && !DRY) fs.writeFileSync(BASE, out.join('\n'));

// 2. the live text — untouched drafts only
const db = new Database(TRANS);
const rows = db.prepare(`SELECT book_id, chapter, verse, text, rich_text FROM translations WHERE text LIKE ?`).all(`%${BAD}%`);
let dbHits = 0, skipped = 0;
const upd = db.prepare(`UPDATE translations SET text = ?, updated_at = datetime('now') WHERE book_id = ? AND chapter = ? AND verse = ?`);
const tx = db.transaction(() => {
  for (const r of rows) {
    if (r.rich_text && r.rich_text !== '') { skipped++; console.log(`  skip ${r.book_id}:${r.chapter}:${r.verse} — hand-edited (rich_text present)`); continue; }
    dbHits++; console.log(`  fix  ${r.book_id}:${r.chapter}:${r.verse}`);
    if (!DRY) upd.run(r.text.split(BAD).join(GOOD), r.book_id, r.chapter, r.verse);
  }
});
tx();
console.log(`translation.db: ${dbHits} fixed, ${skipped} skipped${DRY ? ' (dry run — nothing written)' : ''}`);
