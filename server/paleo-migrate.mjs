// paleo-migrate.mjs — RUN ON YOUR MACHINE (Node ES module), from server/.
//
//   node paleo-migrate.mjs --dry-run   preview counts + samples, write nothing
//   node paleo-migrate.mjs             apply
//
// Adds a paleo DISPLAY column (text_paleo) to corpus.db for the extra-Hebrew
// source, converting the stored square Hebrew via YOUR PALEO_LETTERS (books.js).
// The square text stays in `text` as the MATCH/verification field — exactly as
// you described: modern only for matching, paleo for display. Additive and
// non-destructive; nothing that reads `text` changes.

import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';

const HERE = dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes('--dry-run');
const die = m => { console.error('✗ ' + m); process.exit(1); };

// locate books.js (repo root holds src/ and server/)
function projectRoot(start) {
  let d = start;
  for (let i = 0; i < 12; i++) { if (existsSync(join(d, 'src')) && existsSync(join(d, 'server'))) return d; const u = dirname(d); if (u === d) break; d = u; }
  d = start;
  for (let i = 0; i < 12; i++) { if (existsSync(join(d, '.git')) || existsSync(join(d, 'src'))) return d; const u = dirname(d); if (u === d) break; d = u; }
  return start;
}
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.vite', '.next', 'coverage', 'out']);
function findAll(root, name, out = [], depth = 0) {
  if (depth > 7) return out;
  let ents; try { ents = readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) { if (e.isDirectory()) { if (!SKIP.has(e.name)) findAll(join(root, e.name), name, out, depth + 1); } else if (e.name === name) out.push(join(root, e.name)); }
  return out;
}
const hits = findAll(projectRoot(HERE), 'books.js');
const booksPath = hits.sort((a, b) => (/[\\/]src[\\/]/.test(b) ? 1 : 0) - (/[\\/]src[\\/]/.test(a) ? 1 : 0) || a.length - b.length)[0] || die('books.js not found');
const { PALEO_LETTERS } = await import(pathToFileURL(booksPath).href);
console.log('using PALEO_LETTERS from: ' + booksPath);

// square → paleo, on YOUR letter order
const SQUARE = ['א','ב','ג','ד','ה','ו','ז','ח','ט','י','כ','ל','מ','נ','ס','ע','פ','צ','ק','ר','ש','ת'];
const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const MAP = {}; SQUARE.forEach((s, i) => { MAP[s] = PALEO_LETTERS[i]; });
const sqToPaleo = t => { if (!t) return t; let o = ''; for (const ch of t.normalize('NFC')) { if (ch >= '\u0591' && ch <= '\u05C7') continue; o += MAP[FINALS[ch] || ch] || ch; } return o; };

const CORPUS = join(HERE, 'corpus.db');
if (!existsSync(CORPUS)) die('corpus.db not found next to this script (' + CORPUS + ')');
const db = new Database(CORPUS, { readonly: DRY });

// add the display column if missing
const hasCol = db.prepare("SELECT 1 FROM pragma_table_info('verses') WHERE name='text_paleo'").get();
if (!hasCol) { if (DRY) console.log("[dry-run] would add column verses.text_paleo"); else db.exec("ALTER TABLE verses ADD COLUMN text_paleo TEXT"); }

const rows = db.prepare("SELECT id, code, text FROM verses WHERE corpus='HEB' AND text IS NOT NULL AND text <> ''").all();
const upd = DRY ? null : db.prepare("UPDATE verses SET text_paleo=? WHERE id=?");
let changed = 0; const sample = [];
const run = db.transaction(() => {
  for (const r of rows) {
    const p = sqToPaleo(r.text);
    if (p === r.text) continue;            // already paleo / nothing to convert
    changed++;
    if (sample.length < 8) sample.push({ code: r.code, sq: r.text.slice(0, 46), pa: p.slice(0, 46) });
    if (!DRY) upd.run(p, r.id);
  }
});
if (!hasCol && DRY) console.log(`[dry-run] (column text_paleo would be created first)`);
run();

console.log(`${DRY ? '[dry-run] would convert' : 'converted'} ${changed} / ${rows.length} extra-Hebrew verses to paleo (display).`);
console.log('square text kept in `text` as the match field.');
console.log('\nsample:');
for (const s of sample) console.log(`  [${s.code}]\n    square: ${s.sq}\n    paleo : ${s.pa}`);
console.log(DRY ? '\nNo changes written (--dry-run).' : '\nDone. (Server can now SELECT text_paleo for display; the client already renders paleo either way.)');
db.close();
