#!/usr/bin/env node
/**
 * fix-name-forms.mjs — repair every verse verify-name-forms.mjs would fail:
 * "Adam (Edom)" → "Adawam (Edom)", "Yahawah (Saul)" → "Shaawal (Saul)", …
 *
 * Touches corpus.db (ENG rows) and translation.db (translations.text +
 * rich_text; a translation_history row is written for every changed HAND-EDITED
 * verse so the change is auditable and reversible — seeded rows get none). Replacements are one word for one
 * word, so translation_links' english_indices (word positions) stay valid.
 *
 * Bare KJV names (a verse never rendered: "when Joseph came") become "Yawasap (Joseph)"
 * through name-map-expanded.json — on seeded rows only (status 'none'); hand-edited
 * verses are never touched. translation_links english_indices are shifted for the
 * token each gloss adds. --no-names skips that pass.
 *
 * USAGE:  node fix-name-forms.mjs [corpus.db] [translation.db]   (--dry-run to preview)
 * Run it where the DBs live (prod: inside the container against /data), then
 * re-run verify-name-forms.mjs.
 */
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRules, checkText, bareNames, shiftIndices, goldMarkers } from './name-form-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const DRY = process.argv.includes('--dry-run');
const NAMES = !process.argv.includes('--no-names');   // bare KJV names → "Translit (Name)"; --no-names to skip
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
      const c = checkText(r.text, R);
      const b = NAMES ? bareNames(c.fixed, R) : { fixed: c.fixed, hits: [] };
      const changes = [...c.violations.filter(v => v.fix), ...b.hits];
      if (!changes.length || b.fixed === r.text) continue;
      n++;
      if (n <= 12) console.log(`  corpus ${r.canon_id}:${r.ord_c}:${r.ord_v}  ${changes.map(v => `${v.text} → ${v.fix}`).join('; ')}`);
      if (upd) upd.run(b.fixed, r.id);
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
  const linkSel = db.prepare(`SELECT id, english_indices FROM translation_links WHERE book_id = ? AND chapter = ? AND verse = ?`);
  const linkUpd = DRY ? null : db.prepare(`UPDATE translation_links SET english_indices = ? WHERE id = ?`);
  let n = 0, links = 0;
  const tx = db.transaction(() => {
    for (const r of rows) {
      const a = checkText(r.text || '', R);
      // Bare names only on rows fieldy has not edited by hand. status alone is not the
      // signal (the Studio saves with status 'none' by default) — rich_text is: only
      // the Studio ever writes it, every seeding script leaves it ''. (2026-09-11)
      const seeded = (r.status || 'none') === 'none' && !(r.rich_text || '');
      const ab = NAMES && seeded ? bareNames(a.fixed, R) : { fixed: a.fixed, hits: [], shifts: [] };
      const ag = seeded ? goldMarkers(ab.fixed, R) : { fixed: ab.fixed, hits: [] };
      ab.fixed = ag.fixed;
      const b = checkText(r.rich_text || '', R);
      const bb = NAMES && seeded ? bareNames(b.fixed, R) : { fixed: b.fixed, hits: [], shifts: [] };
      if (seeded) bb.fixed = goldMarkers(bb.fixed, R).fixed;
      if (ab.fixed === (r.text || '') && bb.fixed === (r.rich_text || '')) continue;
      n++;
      const changes = [...a.violations.filter(v => v.fix), ...ab.hits, ...ag.hits];
      if (n <= 12) console.log(`  translation ${r.book_id}:${r.chapter}:${r.verse}  ${changes.map(v => `${v.text} → ${v.fix}`).join('; ')}`);
      if (upd) {
        // History only for a verse someone actually edited: a seeded row's "before"
        // is just the previous render, and recording it for every touched verse of
        // every run put 280k rows / 220 MB into translation.db (2026-09-11). The
        // reader never reads history; the Studio shows it only for edited verses.
        if (!seeded) hist.run(r.book_id, r.chapter, r.verse, r.status, r.text, r.rich_text);   // the state BEFORE this fix
        upd.run(ab.fixed, bb.fixed, r.book_id, r.chapter, r.verse);
      }
      // A rendered name adds one English token ("(Joseph)"), so every link index past it moves up.
      if (ab.shifts.length) for (const l of linkSel.all(r.book_id, r.chapter, r.verse)) {
        let ix; try { ix = JSON.parse(l.english_indices || '[]'); } catch { continue; }
        const nix = shiftIndices(ix, ab.shifts);
        if (JSON.stringify(nix) !== JSON.stringify(ix)) { links++; if (linkUpd) linkUpd.run(JSON.stringify(nix), l.id); }
      }
    }
  });
  tx();
  console.log(`translation.db: ${n} verse(s) ${DRY ? 'would be' : ''} fixed (history rows written), ${links} link row(s) re-indexed`);
  total += n;
} else console.log(`(no translation.db at ${TRANS_DB})`);
console.log(DRY ? `[dry-run] ${total} verse(s) would change — nothing written` : `✓ ${total} verse(s) fixed — now run verify-name-forms.mjs`);
