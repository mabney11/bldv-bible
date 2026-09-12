#!/usr/bin/env node
/**
 * studio-sync.mjs — the Translation Studio's HAND-MADE work as text, so the
 * studio can be used on bldbible.com and on fieldy's machine and both end up
 * with the same translation (2026-09-12: "I just want consistency from my
 * computer and the server" — no git involved; studio-sync.sh carries the files
 * over ssh and keeps the last agreed snapshot in server/.studio-sync/).
 *
 * translation.db itself (395 MB, every verse of every book seeded from the
 * corpus) stays where it is; a database can't be merged as a file. What IS the
 * studio's own work is small and row-shaped, and that is what is exported:
 *   translations.jsonl — verses with rich_text != '' or status != 'none'
 *                        (status 'none' is NOT an edit signal; rich_text is —
 *                        see the 2026-09-11 clobber note)
 *   links.jsonl        — translation_links for the hand languages (BHS, HEB,
 *                        GEZ, LAT, LXX, SYR…), one line per verse+lang, ids dropped
 *                        (HEB-auto links are script output on both sides: not synced)
 *   headings.jsonl     — the headings table (Part/Section/Chapter/Pericope)
 * One JSON object per line, sorted by key, so a diff reads as "these verses".
 *
 * Commands (translation.db = ./translation.db beside this file, or $TRANSLATION_DB;
 * the files dir = $STUDIO_DATA_DIR, default server/.studio-sync/merged):
 *   export            write the three files from the database
 *   status            how the database differs from the committed files (exit 0)
 *   merge BASE THEIRS three-way merge per key — BASE = the files as of the last
 *                     common commit, THEIRS = the other side's files, OURS = the
 *                     database — then APPLY the result to the database (each
 *                     changed verse goes through the same history snapshot as a
 *                     Studio save, so it can be reverted in the UI) and write it
 *                     to the files dir. --dry prints the plan only.
 *                     Both sides changed the same verse differently → the newer
 *                     updated_at wins and the loser is listed.
 *   restore           the database has just been REPLACED wholesale (local dev
 *                     pulls prod's translation.db at start): put back whatever the
 *                     files have that the database lacks — files win.
 * studio-sync.sh drives this over ssh; sync-from-prod.cjs runs it at server start.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.TRANSLATION_DB || path.join(HERE, 'translation.db');
const DATA_DIR = process.env.STUDIO_DATA_DIR || path.join(HERE, '.studio-sync', 'merged');
const FILES = { translations: 'translations.jsonl', links: 'links.jsonl', headings: 'headings.jsonl' };
const AUTO_LANGS = new Set(['HEB-auto']);

// ── snapshots: { translations: Map, links: Map, headings: Map } ─────────────
function emptySnap() { return { translations: new Map(), links: new Map(), headings: new Map() }; }
function readSnap(dir) {
  const snap = emptySnap();
  for (const [kind, file] of Object.entries(FILES)) {
    const p = path.join(dir, file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const { k, ...v } = JSON.parse(line);
      snap[kind].set(k, kind === 'links' ? v.links : v);
    }
  }
  return snap;
}
function writeSnap(dir, snap) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [kind, file] of Object.entries(FILES)) {
    const keys = [...snap[kind].keys()].sort(keyOrder);
    const lines = keys.map((k) => JSON.stringify(kind === 'links' ? { k, links: snap[kind].get(k) } : { k, ...snap[kind].get(k) }));
    const p = path.join(dir, file), tmp = p + '.tmp';
    fs.writeFileSync(tmp, lines.join('\n') + (lines.length ? '\n' : ''), { encoding: 'utf8', mode: 0o666 });
    fs.renameSync(tmp, p);
  }
}
// keys are "book:chapter:verse[:lang]" / "book:level:chapter:verse:sort" — sort numerically field by field
function keyOrder(a, b) {
  const A = a.split(':'), B = b.split(':');
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const x = A[i] ?? '', y = B[i] ?? '';
    const nx = Number(x), ny = Number(y);
    const c = (Number.isFinite(nx) && Number.isFinite(ny) && x !== '' && y !== '') ? nx - ny : String(x).localeCompare(String(y));
    if (c) return c;
  }
  return 0;
}
function exportDb(db) {
  const snap = emptySnap();
  for (const r of db.prepare(`SELECT book_id, chapter, verse, status, text, rich_text, updated_at FROM translations WHERE rich_text != '' OR status != 'none' ORDER BY book_id, chapter, verse`).iterate()) {
    snap.translations.set(`${r.book_id}:${r.chapter}:${r.verse}`, { status: r.status, text: r.text ?? '', rich_text: r.rich_text ?? '', updated_at: r.updated_at ?? '' });
  }
  for (const r of db.prepare(`SELECT book_id, chapter, verse, lang, english_phrase, english_indices, token_ordinals, component_hint, color_index, sort_order FROM translation_links ORDER BY book_id, chapter, verse, lang, sort_order, id`).iterate()) {
    if (AUTO_LANGS.has(r.lang)) continue;
    const k = `${r.book_id}:${r.chapter}:${r.verse}:${r.lang}`;
    if (!snap.links.has(k)) snap.links.set(k, []);
    snap.links.get(k).push({ english_phrase: r.english_phrase, english_indices: r.english_indices, token_ordinals: r.token_ordinals, component_hint: r.component_hint, color_index: r.color_index, sort_order: r.sort_order });
  }
  for (const r of db.prepare(`SELECT book_id, level, chapter, verse, end_chapter, end_verse, title, subtitle, sort_order, updated_at FROM headings ORDER BY book_id, level, chapter, verse, sort_order, id`).iterate()) {
    snap.headings.set(`${r.book_id}:${r.level}:${r.chapter}:${r.verse}:${r.sort_order}`, { end_chapter: r.end_chapter, end_verse: r.end_verse, title: r.title, subtitle: r.subtitle, updated_at: r.updated_at });
  }
  return snap;
}

// ── the merge ───────────────────────────────────────────────────────────────
const bare = (v) => { if (v == null) return null; if (Array.isArray(v)) return JSON.stringify(v); const { updated_at, ...rest } = v; return JSON.stringify(rest); };
const same = (a, b) => bare(a) === bare(b);
const stamp = (v) => (v && !Array.isArray(v) && v.updated_at) || '';
function merge3(base, ours, theirs) {
  const out = emptySnap(), conflicts = [], took = { ours: 0, theirs: 0 };
  for (const kind of Object.keys(FILES)) {
    const keys = new Set([...base[kind].keys(), ...ours[kind].keys(), ...theirs[kind].keys()]);
    for (const k of keys) {
      const b = base[kind].get(k), o = ours[kind].get(k), t = theirs[kind].get(k);
      let pick;
      if (same(o, t)) pick = o;                                   // agreed (or both absent)
      else if (same(b, o)) { pick = t; took.theirs++; }           // only they changed it
      else if (same(b, t)) { pick = o; took.ours++; }             // only we changed it
      else {                                                      // both changed it: the newer save wins
        const newerIsOurs = stamp(o) >= stamp(t);
        pick = newerIsOurs ? o : t;
        conflicts.push({ kind, k, kept: newerIsOurs ? 'ours' : 'theirs', ours: stamp(o), theirs: stamp(t) });
      }
      if (pick !== undefined) out[kind].set(k, pick);
    }
  }
  return { merged: out, conflicts, took };
}

// ── applying a merged snapshot to the database ─────────────────────────────
function apply(db, merged, ours, dry) {
  const plan = { translations: [], links: [], headings: [] };
  for (const kind of Object.keys(FILES)) {
    const keys = new Set([...merged[kind].keys(), ...ours[kind].keys()]);
    for (const k of keys) if (!same(merged[kind].get(k), ours[kind].get(k))) plan[kind].push(k);
  }
  const n = plan.translations.length + plan.links.length + plan.headings.length;
  if (dry || !n) return plan;
  const getVerse = db.prepare(`SELECT status, text, rich_text, updated_at, original_text FROM translations WHERE book_id=? AND chapter=? AND verse=?`);
  const history = db.prepare(`INSERT INTO translation_history(book_id, chapter, verse, status, text, rich_text, saved_at) VALUES(?,?,?,?,?,?,?)`);
  const upsert = db.prepare(`INSERT INTO translations(book_id, chapter, verse, status, text, rich_text, updated_at) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(book_id,chapter,verse) DO UPDATE SET status=excluded.status, text=excluded.text, rich_text=excluded.rich_text, updated_at=excluded.updated_at`);
  const delLinks = db.prepare(`DELETE FROM translation_links WHERE book_id=? AND chapter=? AND verse=? AND lang=?`);
  const insLink = db.prepare(`INSERT INTO translation_links(book_id, chapter, verse, lang, english_phrase, english_indices, token_ordinals, component_hint, color_index, sort_order) VALUES(?,?,?,?,?,?,?,?,?,?)`);
  const getHeading = db.prepare(`SELECT id FROM headings WHERE book_id=? AND level=? AND chapter=? AND verse=? AND sort_order=? ORDER BY id LIMIT 1`);
  const updHeading = db.prepare(`UPDATE headings SET end_chapter=?, end_verse=?, title=?, subtitle=?, updated_at=? WHERE id=?`);
  const insHeading = db.prepare(`INSERT INTO headings(book_id, level, chapter, verse, end_chapter, end_verse, title, subtitle, sort_order, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`);
  const delHeading = db.prepare(`DELETE FROM headings WHERE id=?`);
  const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
  db.transaction(() => {
    for (const k of plan.translations) {
      const [b, c, v] = k.split(':').map(Number), m = merged.translations.get(k);
      const cur = getVerse.get(b, c, v);
      if (cur && (cur.rich_text !== '' || cur.status !== 'none')) history.run(b, c, v, cur.status, cur.text, cur.rich_text, cur.updated_at || now());   // the same snapshot a Studio save takes
      if (m) upsert.run(b, c, v, m.status, m.text, m.rich_text, m.updated_at || now());
      else if (cur) upsert.run(b, c, v, 'none', cur.original_text ?? cur.text, '', now());   // un-edited on the other side: back to the corpus text (the history row keeps the old one)
    }
    for (const k of plan.links) {
      const [b, c, v, lang] = k.split(':'); const m = merged.links.get(k) || [];
      delLinks.run(+b, +c, +v, lang);
      for (const l of m) insLink.run(+b, +c, +v, lang, l.english_phrase, l.english_indices, l.token_ordinals, l.component_hint, l.color_index, l.sort_order);
    }
    for (const k of plan.headings) {
      const [b, level, c, v, sort] = k.split(':').map(Number), m = merged.headings.get(k);
      const row = getHeading.get(b, level, c, v, sort);
      if (!m) { if (row) delHeading.run(row.id); }
      else if (row) updHeading.run(m.end_chapter, m.end_verse, m.title, m.subtitle, m.updated_at || now(), row.id);
      else insHeading.run(b, level, c, v, m.end_chapter, m.end_verse, m.title, m.subtitle, sort, m.updated_at || now());
    }
  })();
  return plan;
}

// ── commands ────────────────────────────────────────────────────────────────
const [cmd, ...args] = process.argv.slice(2);
const dry = args.includes('--dry'); const pos = args.filter((a) => !a.startsWith('--'));
const say = (s) => console.log(`[studio-sync] ${s}`);
const counts = (s) => `${s.translations.size} verses, ${s.links.size} linked verses, ${s.headings.size} headings`;
if (!fs.existsSync(DB_PATH)) { console.error(`[studio-sync] no database at ${DB_PATH}`); process.exit(2); }
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

if (cmd === 'export') {
  const snap = exportDb(db); writeSnap(pos[0] || DATA_DIR, snap); say(`exported ${counts(snap)} → ${pos[0] || DATA_DIR}`);
} else if (cmd === 'status') {
  const ours = exportDb(db), files = readSnap(DATA_DIR);
  const diff = apply(db, files, ours, true);
  const n = diff.translations.length + diff.links.length + diff.headings.length;
  say(n ? `database differs from the last sync in ${diff.translations.length} verses, ${diff.links.length} link sets, ${diff.headings.length} headings` : `database matches the last sync`);
  process.exitCode = 0;
} else if (cmd === 'merge') {
  const [baseDir, theirsDir] = pos;
  if (!baseDir || !theirsDir) { console.error('usage: studio-sync.mjs merge BASE_DIR THEIRS_DIR [--dry]'); process.exit(2); }
  const base = readSnap(baseDir), theirs = readSnap(theirsDir), ours = exportDb(db);
  const { merged, conflicts, took } = merge3(base, ours, theirs);
  const plan = apply(db, merged, ours, dry);
  if (!dry) writeSnap(DATA_DIR, merged);
  say(`${dry ? 'would take' : 'took'} ${took.theirs} from the other side, ${took.ours} of ours; ${dry ? 'would change' : 'changed'} ${plan.translations.length} verses, ${plan.links.length} link sets, ${plan.headings.length} headings in the database; now ${counts(merged)}`);
  for (const c of conflicts) say(`both sides edited ${c.kind} ${c.k}: kept ${c.kept} (ours ${c.ours || '—'} vs theirs ${c.theirs || '—'}); the other version is in the history`);
  if (dry) for (const kind of Object.keys(plan)) for (const k of plan[kind]) say(`  would change ${kind} ${k}`);
} else if (cmd === 'restore') {
  const ours = exportDb(db), files = readSnap(DATA_DIR);
  const { merged } = merge3(ours, ours, files);   // base = ours → the files win wherever they differ
  const plan = apply(db, merged, ours, dry);
  say(`${dry ? 'would restore' : 'restored'} ${plan.translations.length} verses, ${plan.links.length} link sets, ${plan.headings.length} headings from ${path.relative(process.cwd(), DATA_DIR)}`);
} else {
  console.error('usage: studio-sync.mjs export [DIR] | status | merge BASE_DIR THEIRS_DIR [--dry] | restore [--dry]');
  process.exit(2);
}
db.close();
