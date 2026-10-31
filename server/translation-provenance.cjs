'use strict';
// WHO WROTE EACH VERSION of a translation (fieldy, 2026-10-31: "I want to know which texts I clearly
// was the one who saved it").
//   translations.updated_by        'you'      — saved / restored in Translation Studio
//                                  'pipeline' — written by any script (render-all, rebake, gates …)
//                                  ''         — written before this was recorded
//   translation_history.saved_by   the same label for that past version, and saved_at = when THAT
//                                  version was written (the row's own updated_at), not when a
//                                  script later replaced it — two versions no longer share one time.
// The triggers make it automatic: any write that changes text / rich_text / status and does not set
// updated_by itself is labelled 'pipeline'. The Studio (server.js) and studio-sync set the label
// explicitly with a SECOND statement after the write (the triggers only watch text/rich_text/status).
function cols(db, t) { return db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name); }

function ensureProvenance(db) {
  const tc = cols(db, 'translations');
  if (!tc.length) return false;
  if (!tc.includes('updated_by')) db.exec(`ALTER TABLE translations ADD COLUMN updated_by TEXT NOT NULL DEFAULT ''`);
  const hc = cols(db, 'translation_history');
  if (hc.length && !hc.includes('saved_by')) db.exec(`ALTER TABLE translation_history ADD COLUMN saved_by TEXT NOT NULL DEFAULT ''`);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_translations_by_upd AFTER UPDATE OF text, rich_text, status ON translations
    WHEN NEW.updated_by IS OLD.updated_by
     AND (NEW.text IS NOT OLD.text OR NEW.rich_text IS NOT OLD.rich_text OR NEW.status IS NOT OLD.status)
    BEGIN
      UPDATE translations SET updated_by = 'pipeline'
       WHERE book_id = NEW.book_id AND chapter = NEW.chapter AND verse = NEW.verse;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_translations_by_ins AFTER INSERT ON translations
    WHEN NEW.updated_by = ''
    BEGIN
      UPDATE translations SET updated_by = 'pipeline'
       WHERE book_id = NEW.book_id AND chapter = NEW.chapter AND verse = NEW.verse;
    END;`);
  return true;
}

// A history writer for scripts: same call as before — run(book, chapter, verse, status, text, rich_text),
// made BEFORE the script's update — but the row keeps the replaced version's own time and author.
function historyWriter(db) {
  ensureProvenance(db);
  const st = db.prepare(`
    INSERT INTO translation_history (book_id, chapter, verse, status, text, rich_text, saved_at, saved_by)
    SELECT ?, ?, ?, ?, ?, ?, COALESCE(NULLIF(t.updated_at, ''), datetime('now')), COALESCE(t.updated_by, '')
      FROM (SELECT 1) one
      LEFT JOIN translations t ON t.book_id = ? AND t.chapter = ? AND t.verse = ?`);
  return { run: (b, c, v, s, tx, rt) => st.run(b, c, v, s, tx, rt, b, c, v) };
}

module.exports = { ensureProvenance, historyWriter };
