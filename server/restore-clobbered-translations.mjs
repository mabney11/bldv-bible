#!/usr/bin/env node
/**
 * restore-clobbered-translations.mjs — put hand-translated verses back after a
 * baseline reseed overwrote their `text`.
 *
 * WHAT WENT WRONG (2026-09-11): render-all.mjs's last steps (load-english-baseline.js,
 * reseed-translations.mjs) refresh `text` on "untouched" rows. Since 2026-09-09 the
 * only guard was status='none' — but Translation Studio saves with the status dropdown's
 * value, which is 'none' unless you changed it, so every hand-translated verse that was
 * never marked done/in_progress was reset to the WEB baseline (62 verses locally,
 * Ezekiel 43:15 among them). The guards now also require rich_text='' — the one column
 * ONLY the Studio writes — so this cannot recur; this script repairs the damage.
 *
 * HOW: the reseed never touched rich_text, so each clobbered row still holds the
 * translation there. Studio's own save computes text = textContent(rich_text), and the
 * 2026-08-29 backup confirms text === that on every affected row. So for every row with
 * rich_text != '' whose text differs from textContent(rich_text), set text back to it.
 * The prior row is snapshotted into translation_history first (revertable in Studio).
 *
 * USAGE:  node restore-clobbered-translations.mjs [--db=/path/translation.db] [--since=YYYY-MM-DD] [--apply]
 *   default is a dry run that prints every verse it would change.
 *   --since limits to rows whose updated_at >= that date (default: no limit — the text/
 *   rich_text mismatch is the real test; the date is just a belt-and-braces scope).
 */
import Database from 'better-sqlite3';
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE  = path.dirname(fileURLToPath(import.meta.url));
const args  = process.argv.slice(2);
const opt   = (k, d) => { const a = args.find(x => x.startsWith(k + '=')); return a ? a.slice(k.length + 1) : d; };
const APPLY = args.includes('--apply');
const DB    = opt('--db', path.join(HERE, 'translation.db'));
const SINCE = opt('--since', null);

// Same conversion Translate.jsx does on save: tmp.innerHTML = rich_text; text = tmp.textContent.
// <br> and block boundaries contribute nothing to textContent, so tags simply vanish.
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function textContent(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return e.toLowerCase() in ENT ? ENT[e.toLowerCase()] : m;
    });
}

if (!existsSync(DB)) { console.error('translation.db not found at ' + DB); process.exit(1); }
const db = new Database(DB, { readonly: !APPLY });
const where = `rich_text != ''` + (SINCE ? ` AND updated_at >= '${SINCE}'` : '');
const rows = db.prepare(`SELECT book_id, chapter, verse, status, text, rich_text, updated_at FROM translations WHERE ${where} ORDER BY book_id, chapter, verse`).all();

const fixes = [];
for (const r of rows) {
  const want = textContent(r.rich_text);
  if (want === (r.text || '')) continue;
  if (!want.trim()) continue;                       // never blank a verse from an empty editor
  fixes.push({ ...r, want });
}
console.log(`${DB}\n${rows.length} rows carry rich_text; ${fixes.length} have text out of step with it${SINCE ? ` (updated since ${SINCE})` : ''}.\n`);
for (const f of fixes) {
  console.log(`${f.book_id}:${f.chapter}:${f.verse} [${f.status}, ${f.updated_at}]`);
  console.log(`   now : ${f.text.slice(0, 110)}`);
  console.log(`   back: ${f.want.slice(0, 110)}`);
}
if (!APPLY) { console.log(`\nDry run — nothing written. Re-run with --apply to restore ${fixes.length} verse(s).`); process.exit(0); }
if (!fixes.length) process.exit(0);

const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const bak = `${DB}.pre-restore-backup-${stamp}.db`;
db.exec(`VACUUM INTO '${bak.replace(/'/g, "''")}'`);   // consistent snapshot, WAL-safe (plain cp is not)
console.log(`\nbackup: ${bak}`);

const hist = db.prepare(`INSERT INTO translation_history (book_id, chapter, verse, status, text, rich_text, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
const upd  = db.prepare(`UPDATE translations SET text = ?, updated_at = datetime('now') WHERE book_id = ? AND chapter = ? AND verse = ? AND rich_text = ?`);
const n = db.transaction(() => {
  let n = 0;
  for (const f of fixes) {
    hist.run(f.book_id, f.chapter, f.verse, f.status, f.text, f.rich_text, f.updated_at);
    n += upd.run(f.want, f.book_id, f.chapter, f.verse, f.rich_text).changes;
  }
  return n;
})();
console.log(`restored ${n} verse(s). integrity: ${db.pragma('integrity_check', { simple: true })}`);
