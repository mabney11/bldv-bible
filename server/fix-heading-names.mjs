// fix-heading-names.mjs — repair + gate: every name in the headings table (and the seed files) is
// written the way the reading text writes it. See heading-names-lib.mjs for the rules.
//   node fix-heading-names.mjs [translation.db]            repair (each changed heading -> headings_history first)
//   node fix-heading-names.mjs [translation.db] --check    gate: exit 1 if any heading would change
//   node fix-heading-names.mjs [translation.db] --dry      list the changes, write nothing
//   --seed-files   also rewrite seed-headings-*-data.json / seed-headings-pilot.mjs (so a re-seed keeps the names)
//   --report f     write every change to f (default heading-names-report.txt)
//   prod: docker run --rm -v $DATA:/data paleo-studio node fix-heading-names.mjs /data/translation.db
import Database from 'better-sqlite3';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeHeadingFixer } from './heading-names-lib.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2), pos = argv.filter(a => !a.startsWith('--'));
const CHECK = argv.includes('--check'), DRY = argv.includes('--dry') || CHECK, SEED = argv.includes('--seed-files');
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const TRANS_DB = pos[0] || path.join(__dirname, 'translation.db');
const REPORT = val('--report', path.join(__dirname, 'heading-names-report.txt'));
if (!existsSync(TRANS_DB)) { console.error(`✗ ${TRANS_DB} not found`); process.exit(1); }

const db = new Database(TRANS_DB, { readonly: DRY });
// how often each word stands in the reading text (what the reader serves)
const counts = new Map();
for (const r of db.prepare(`SELECT text FROM translations WHERE text IS NOT NULL AND text != ''`).iterate())
  for (const w of r.text.match(/[A-Za-z][A-Za-z'\-]*/g) || []) counts.set(w, (counts.get(w) || 0) + 1);
const fix = makeHeadingFixer(counts);

const lines = [], tally = new Map();
const note = (where, from, to, hits) => {
  lines.push(`${where}\n    ${from}\n  → ${to}`);
  for (const [a, b, why] of hits) { const k = `${why}: ${a.replace(//g, "'")} → ${b.replace(//g, "'")}`; tally.set(k, (tally.get(k) || 0) + 1); }
};
const rows = db.prepare(`SELECT id, book_id, level, chapter, verse, title, subtitle FROM headings`).all();
const changes = [];
for (const h of rows) {
  const t = fix(h.title), s = fix(h.subtitle);
  if (t.text === h.title && s.text === h.subtitle) continue;
  changes.push({ h, title: t.text, subtitle: s.text });
  if (t.text !== h.title) note(`headings #${h.id} (book ${h.book_id} ${h.chapter}:${h.verse}, level ${h.level}) title`, h.title, t.text, t.hits);
  if (s.text !== h.subtitle) note(`headings #${h.id} (book ${h.book_id} ${h.chapter}:${h.verse}, level ${h.level}) subtitle`, h.subtitle, s.text, s.hits);
}
if (!DRY && changes.length) {
  db.exec(`CREATE TABLE IF NOT EXISTS headings_history (id INTEGER PRIMARY KEY AUTOINCREMENT, heading_id INTEGER, title TEXT, subtitle TEXT,
           saved_at TEXT NOT NULL DEFAULT (datetime('now')), why TEXT)`);
  const hist = db.prepare(`INSERT INTO headings_history (heading_id, title, subtitle, why) VALUES (?, ?, ?, 'fix-heading-names')`);
  const upd = db.prepare(`UPDATE headings SET title = ?, subtitle = ?, updated_at = datetime('now') WHERE id = ?`);
  db.transaction(() => { for (const c of changes) { hist.run(c.h.id, c.h.title, c.h.subtitle); upd.run(c.title, c.subtitle, c.h.id); } })();
}
db.close();

// the seed files hold the same headings: a re-seed must not bring the old names back
let seedChanged = 0;
if (SEED) {
  for (const f of readdirSync(__dirname).filter(f => /^seed-headings-.*-data\.json$/.test(f))) {
    const p = path.join(__dirname, f), data = JSON.parse(readFileSync(p, 'utf8')); let n = 0;
    for (const list of Object.values(data)) for (const h of list || []) for (const k of ['title', 'subtitle']) {
      if (!h[k]) continue; const r = fix(h[k]); if (r.text !== h[k]) { note(`${f} ${h.chapter}:${h.verse || 1} ${k}`, h[k], r.text, r.hits); h[k] = r.text; n++; }
    }
    if (n) { seedChanged += n; if (!DRY) writeFileSync(p, JSON.stringify(data)); }
  }
  const pilot = path.join(__dirname, 'seed-headings-pilot.mjs');
  if (existsSync(pilot)) {
    const src = readFileSync(pilot, 'utf8'); let n = 0;
    const out = src.replace(/(\b(?:title|subtitle):\s*)(['"])((?:\\.|(?!\2).)*)\2/g, (m, k, q, body) => {
      const r = fix(body); if (r.text === body) return m; n++; note(`seed-headings-pilot.mjs ${k.trim()}`, body, r.text, r.hits); return k + q + r.text + q; });
    if (n) { seedChanged += n; if (!DRY) writeFileSync(pilot, out); }
  }
}

const summary = [...tally].sort((a, b) => b[1] - a[1]).map(([k, n]) => `  ${String(n).padStart(4)}  ${k}`).join('\n');
writeFileSync(REPORT, `fix-heading-names ${new Date().toISOString()}${DRY ? ' (dry run)' : ''}\n` +
  `${changes.length} of ${rows.length} headings${SEED ? `, ${seedChanged} seed-file strings` : ''}\n\nBy name:\n${summary}\n\nEvery change:\n${lines.join('\n')}\n`);
console.log(`${CHECK ? 'heading names gate' : 'heading names'}: ${changes.length} of ${rows.length} headings ${DRY ? 'would change' : 'fixed'}` +
  (SEED ? `; ${seedChanged} seed-file strings` : '') + ` — ${path.basename(REPORT)}`);
if (summary) console.log(summary.split('\n').slice(0, 25).join('\n'));
if (CHECK && changes.length) { console.error('✗ headings still spell names unlike the reading text — run: node fix-heading-names.mjs'); process.exit(1); }
