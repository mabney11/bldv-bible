#!/usr/bin/env node
/**
 * fix-name-forms.mjs — repair every verse verify-name-forms.mjs would fail:
 * "Adam (Edom)" → "Adawam (Edom)", "Yahawah (Saul)" → "Shaawal (Saul)", …
 *
 * Touches corpus.db (ENG rows) and translation.db (translations.text +
 * rich_text; a translation_history row is written for every changed verse so
 * the change is auditable and reversible). Replacements are one word for one
 * word, so translation_links' english_indices (word positions) stay valid.
 *
 * USAGE:  node fix-name-forms.mjs [corpus.db] [translation.db]   (--dry-run to preview)
 * Run it where the DBs live (prod: inside the container against /data), then
 * re-run verify-name-forms.mjs.
 */
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRules, checkText } from './name-form-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const DRY = process.argv.includes('--dry-run');
const CORPUS_DB = args[0] || path.join(__dirname, 'corpus.db');
const TRANS_DB = args[1] || path.join(__dirname, 'translation.db');
const R = loadRules();
let total = 0;

if (existsSync(CORPUS_DB)) {
  const db = new Database(CORPUS_DB, { readonly: DRY });
  const rows = db.prepare(`SELECT id, canon_id, ord_c, ord_v, text FROM verses WHERE corpus = 'ENG' AND text IS NOT NULL`).all();
  const upd = DRY ? null : db.prepare(`UPDATE verses SET text = ? WHERE id = ?`);
  let n = 0;
  const tx = db.transaction(() => {
    for (const r of rows) {
      const { violations, fixed } = checkText(r.text, R);
      if (!violations.some(v => v.fix) || fixed === r.text) continue;
      n++;
      if (n <= 12) console.log(`  corpus ${r.canon_id}:${r.ord_c}:${r.ord_v}  ${violations.filter(v => v.fix).map(v => `${v.text} → ${v.fix}`).join('; ')}`);
      if (upd) upd.run(fixed, r.id);
    }
  });
  tx();
  console.log(`corpus.db: ${n} verse(s) ${DRY ? 'would be' : ''} fixed`);
  total += n;
} else console.log(`(no corpus.db at ${CORPUS_DB})`);

if (existsSync(TRANS_DB)) {
  const db = new Database(TRANS_DB, { readonly: DRY });
  const rows = db.prepare(`SELECT book_id, chapter, verse, status, text, rich_text FROM translations`).all();
  const upd = DRY ? null : db.prepare(`UPDATE translations SET text = ?, rich_text = ?, updated_at = datetime('now') WHERE book_id = ? AND chapter = ? AND verse = ?`);
  const hist = DRY ? null : db.prepare(`INSERT INTO translation_history (book_id, chapter, verse, status, text, rich_text, saved_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`);
  let n = 0;
  const tx = db.transaction(() => {
    for (const r of rows) {
      const a = checkText(r.text || '', R);
      const b = checkText(r.rich_text || '', R);
      if (a.fixed === (r.text || '') && b.fixed === (r.rich_text || '')) continue;
      n++;
      if (n <= 12) console.log(`  translation ${r.book_id}:${r.chapter}:${r.verse}  ${a.violations.filter(v => v.fix).map(v => `${v.text} → ${v.fix}`).join('; ')}`);
      if (upd) {
        hist.run(r.book_id, r.chapter, r.verse, r.status, r.text, r.rich_text);   // the state BEFORE this fix
        upd.run(a.fixed, b.fixed, r.book_id, r.chapter, r.verse);
      }
    }
  });
  tx();
  console.log(`translation.db: ${n} verse(s) ${DRY ? 'would be' : ''} fixed (history rows written)`);
  total += n;
} else console.log(`(no translation.db at ${TRANS_DB})`);
console.log(DRY ? `[dry-run] ${total} verse(s) would change — nothing written` : `✓ ${total} verse(s) fixed — now run verify-name-forms.mjs`);
