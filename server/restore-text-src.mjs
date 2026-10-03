// restore-text-src.mjs — give text_src back its English where a snapshot captured RENDERED text.
//
// fieldy, 2026-10-03 (Isaiah 4:1): "I want readable glosses unless it is purely contextual —
// 'WaHaChazayaqaw (and take hold)' instead of 'WaHaChazayaqaw (take [and])'." 12,108 verses
// of Josephus (217-220) and 2 Esdras (139) still read "WaYaSair (And my spirit was sore
// [and])". Not the weaving: their SOURCE. render-all reloads the OT, the NT and the
// Scrollmapper books from pristine English before `render-corpus --reset-src` snapshots
// text -> text_src; these five books are reloaded by nothing, so each full run snapshotted
// the PREVIOUS run's output — modification forms, [labels] and all — as the next run's
// "English", and every run rendered on top of the last one (",,,,," and glosses that swallowed
// half a verse followed).
//
// This puts text_src back from the newest backup of corpus.db whose copy of the verse is
// still English: no "WaYaSair (…)" form, no [label]. (A backup's "rawach (spirit)" bare-root
// pairs are fine — render-corpus unwraps those itself.) render-corpus --reset-src no longer
// overwrites an existing text_src with rendered text, so it cannot happen again.
//
//   node restore-text-src.mjs [corpus.db] [--from backup.db[,backup2.db]] [--dry]
// Without --from: every corpus.db.bak* beside corpus.db, newest first.
// Exit 1 when rendered text_src remains and no backup has that verse in English — the books
// cannot be rebuilt from it; re-ingest them (ingest_josephus_*.py) or pass --from.
import Database from 'better-sqlite3';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const pos = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--from');
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const DRY = argv.includes('--dry');
const CORPUS_DB = pos[0] || path.join(__dirname, 'corpus.db');
const die = m => { console.error('✗ ' + m); process.exit(1); };
if (!existsSync(CORPUS_DB)) die(`${CORPUS_DB} not found`);

// A modification form with its gloss ("WaYaSair (And …", "HaMalachamah (the war)") or a
// modification [label] inside a gloss: text the pipeline wrote, never the English source.
const FORM = /\b[A-Z][a-z]+(?:[A-Z][a-z]+)+ \((?!\))/;
const LABEL = /\([^()]*\[(?:and|the|in|from|as|to|𐤔|within him|Toward|Plural|Emphatic|My|Our|Your|His|Her|Their)[·\]\s(][^()]*\)|\([^()]*\[(?:and|the|in|from|as|to|𐤔|within him|Toward|Plural|Emphatic|My|Our|Your|His|Her|Their)\]/u;
export const isRendered = t => !!t && (FORM.test(t) || LABEL.test(t));

const db = new Database(CORPUS_DB, { readonly: DRY });
const cols = db.prepare(`PRAGMA table_info(verses)`).all().map(c => c.name);
if (!cols.includes('text_src')) { console.log('text_src: no such column yet — nothing to restore'); process.exit(0); }
// Decided per BOOK, like render-corpus --reset-src: a book whose snapshot holds modification
// forms was never reloaded, and EVERY row of it is the previous render — also the rows whose
// rendering happens to carry no such form (Hebrew word order, "Kasap (money)").
const rows = db.prepare(`SELECT id, canon_id c, code, chapter ch, verse v, text_src FROM verses WHERE corpus='ENG' AND text_src IS NOT NULL AND text_src != ''`).all();
const perBook = new Map();
for (const r of rows) { const b = perBook.get(r.code) || { n: 0, rendered: 0 }; perBook.set(r.code, b); b.n++; if (isRendered(r.text_src)) b.rendered++; }
const badBooks = new Set([...perBook].filter(([, b]) => b.rendered >= 3 && b.rendered / b.n > 0.02).map(([code]) => code));
const bad = rows.filter(r => badBooks.has(r.code) || isRendered(r.text_src));
const mustFix = bad.filter(r => isRendered(r.text_src)).length;
if (!mustFix) { console.log('✓ text_src: every snapshot is English (no rendered text captured)'); db.close(); process.exit(0); }

const dir = path.dirname(CORPUS_DB), base = path.basename(CORPUS_DB);
const backups = (val('--from', '') ? val('--from').split(',') : readdirSync(dir).filter(f => f.startsWith(base + '.bak')).map(f => path.join(dir, f)))
  .filter(f => existsSync(f) && !/-(wal|shm)$/.test(f))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
const byCanon = new Map();
for (const r of bad) byCanon.set(r.c ?? r.code, (byCanon.get(r.c ?? r.code) || 0) + 1);
console.log(`text_src holds rendered text in ${mustFix.toLocaleString()} verse(s) of ${badBooks.size} book(s) — rows of those books: ${[...byCanon].map(([c, n]) => `${c} ×${n.toLocaleString()}`).join(', ')}`);
if (!backups.length) die(`no backup to restore from (looked for ${base}.bak* in ${dir}) — pass --from <backup.db>, or re-ingest those books`);

const upd = DRY ? null : db.prepare(`UPDATE verses SET text_src = ? WHERE id = ?`);
let left = bad, restored = 0;
for (const f of backups) {
  if (!left.length) break;
  let bak; try { bak = new Database(f, { readonly: true, fileMustExist: true }); } catch (e) { console.warn(`  (skipped ${path.basename(f)}: ${e.message})`); continue; }
  let sel;
  try {
    const bcols = bak.prepare(`PRAGMA table_info(verses)`).all().map(c => c.name);
    const src = bcols.includes('text_src') ? `coalesce(nullif(text_src,''), text)` : 'text';
    // One pass over the backup per book (no index on chapter/verse there: a lookup per verse
    // would scan the table 12,000 times). Keyed by canon_id — a book's code can be renamed
    // (4 Ezra -> 2_ESDRAS) — or by code for a book that has none.
    const want = new Map();   // "canon|ch|v" / "code|ch|v" -> clean English
    const canons = [...new Set(left.filter(r => r.c != null).map(r => r.c))], codes = [...new Set(left.filter(r => r.c == null).map(r => r.code))];
    for (const c of canons) for (const b of bak.prepare(`SELECT chapter ch, verse v, ${src} t FROM verses WHERE corpus='ENG' AND canon_id = ?`).iterate(c)) want.set(`${c}|${b.ch}|${b.v}`, b.t);
    for (const c of codes) for (const b of bak.prepare(`SELECT chapter ch, verse v, ${src} t FROM verses WHERE corpus='ENG' AND canon_id IS NULL AND code = ?`).iterate(c)) want.set(`${c}|${b.ch}|${b.v}`, b.t);
    sel = { get: r => { const t = want.get(`${r.c ?? r.code}|${r.ch}|${r.v}`); return t ? { t } : null; } };
    const next = []; let n = 0;
    const run = () => { for (const r of left) {
      const b = sel.get(r);
      if (!b || !b.t || isRendered(b.t)) { if (isRendered(r.text_src)) next.push(r); continue; }   // a row that only shares the book stays as it is
      if (b.t === r.text_src) continue;
      if (upd) upd.run(b.t, r.id); n++;
    } };
    if (DRY) run(); else db.transaction(run)();
    if (n) console.log(`  ${n.toLocaleString()} verse(s) from ${path.basename(f)}`);
    restored += n; left = next;
  } catch (e) { console.warn(`  (skipped ${path.basename(f)}: ${e.message})`); }
  bak.close();
}
db.close();
console.log(`${DRY ? '(dry run) would restore' : '✓ restored'} text_src of ${restored.toLocaleString()} verse(s) to its English${DRY ? '' : ' — render-corpus --from-src now rebuilds them from it'}`);
if (left.length) {
  for (const r of left.slice(0, 12)) console.error(`  ✗ ${r.code} ${r.ch}:${r.v} — no backup has this verse in English`);
  die(`${left.length.toLocaleString()} verse(s) still have rendered text as their source and no backup to restore them from.`);
}
