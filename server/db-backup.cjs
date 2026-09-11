/**
 * db-backup.cjs — ONE way to back a SQLite file up, with a hard cap on how many
 * backups exist, so the disk never fills with stale copies.
 * fieldy, 2026-09-11: "for backups lets do things wisely so my harddisks arent
 * cluttered with them — keep it at a limit."
 *
 *   const { backupDb, pruneBackups } = require('./db-backup.cjs');
 *   backupDb('translation.db', 'pre-sync')   →  backups/translation.pre-sync.2026-09-11-04-21.db.gz
 *
 * - Snapshot = `VACUUM INTO` (consistent even while the WAL is live; a plain copy
 *   of a WAL-mode file is not) then gzip — translation.db compresses ~6×.
 * - Every backup of a database lives in server/backups/ under one naming scheme,
 *   whatever script made it. After each new backup the OLDEST beyond the cap are
 *   deleted: KEEP per database (default 3; PALEO_BACKUP_KEEP=N to change).
 * - Legacy backups lying next to the database (translation.db.pre-*-backup-*,
 *   *.db.bak…) are adopted into backups/ on the next prune and count toward the cap.
 * - Restore: gunzip the file you want and copy it over the database (server stopped).
 * ESM scripts: `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);`
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const KEEP = Math.max(1, parseInt(process.env.PALEO_BACKUP_KEEP, 10) || 3);
const stampNow = () => new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const baseOf = (dbPath) => path.basename(dbPath).replace(/\.db$/i, '');
const dirOf = (dbPath) => path.join(path.dirname(path.resolve(dbPath)), 'backups');

/** Files in backups/ that belong to this database, newest first. */
function listBackups(dbPath) {
  const dir = dirOf(dbPath), base = baseOf(dbPath);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.startsWith(base + '.') && /\.db(\.gz)?$/i.test(f))
    .map((f) => { const p = path.join(dir, f); const st = fs.statSync(p); return { file: p, name: f, mtime: st.mtimeMs, size: st.size }; })
    .sort((a, b) => b.mtime - a.mtime);
}

/** Move stray backups that sit beside the database into backups/ (one-time per file). */
function adoptLegacy(dbPath) {
  const abs = path.resolve(dbPath), dir = path.dirname(abs), name = path.basename(abs), base = baseOf(abs);
  const out = dirOf(abs);
  let moved = 0;
  for (const f of fs.readdirSync(dir)) {
    if (f === name || f === name + '-wal' || f === name + '-shm' || f === name + '.downloading') continue;
    if (!f.startsWith(name + '.') && !f.startsWith(base + '_')) continue;
    if (!/backup|\.bak/i.test(f)) continue;
    if (/-wal$|-shm$/.test(f)) { try { fs.rmSync(path.join(dir, f), { force: true }); } catch { /* ignore */ } continue; }
    fs.mkdirSync(out, { recursive: true });
    const tag = f.slice(name.length + 1).replace(/\.db$|\.gz$|\.db\.gz$/gi, '').replace(/[^A-Za-z0-9._-]+/g, '-');
    const target = path.join(out, `${base}.legacy-${tag}.db${f.endsWith('.gz') ? '.gz' : ''}`);
    try { fs.renameSync(path.join(dir, f), target); moved++; } catch (e) { console.warn(`[backup] could not move ${f}: ${e.message}`); }
  }
  return moved;
}

/** Delete the oldest backups of this database beyond KEEP. Returns what was removed. */
function pruneBackups(dbPath, keep = KEEP) {
  adoptLegacy(dbPath);
  const all = listBackups(dbPath);
  const gone = all.slice(keep);
  for (const b of gone) { try { fs.rmSync(b.file, { force: true }); } catch (e) { console.warn(`[backup] could not delete ${b.name}: ${e.message}`); } }
  if (gone.length) console.log(`[backup] ${baseOf(dbPath)}: kept the ${Math.min(keep, all.length)} newest backup(s), removed ${gone.length} older (${(gone.reduce((s, b) => s + b.size, 0) / 1048576).toFixed(0)} MB freed)`);
  return gone;
}

/**
 * Back the database up (VACUUM INTO + gzip), then prune to KEEP. Returns the path.
 * `label` names the reason ("pre-sync", "pre-restore") — it is part of the filename.
 */
function backupDb(dbPath, label = 'backup', { keep = KEEP, gzip = true } = {}) {
  const abs = path.resolve(dbPath);
  if (!fs.existsSync(abs)) return null;
  const dir = dirOf(abs);
  fs.mkdirSync(dir, { recursive: true });
  const safeLabel = String(label).replace(/[^A-Za-z0-9._-]+/g, '-');
  const raw = path.join(dir, `${baseOf(abs)}.${safeLabel}.${stampNow()}.db`);
  fs.rmSync(raw, { force: true });
  let Database;
  try { Database = require('better-sqlite3'); } catch { Database = null; }
  if (Database) {
    const db = new Database(abs, { readonly: true });
    try { db.exec(`VACUUM INTO '${raw.replace(/'/g, "''")}'`); } finally { db.close(); }
  } else {
    fs.copyFileSync(abs, raw);   // last resort (no driver): a plain copy, WAL contents not included
  }
  let out = raw;
  if (gzip) {
    out = raw + '.gz';
    const data = fs.readFileSync(raw);
    fs.writeFileSync(out, zlib.gzipSync(data, { level: 6 }));
    fs.rmSync(raw, { force: true });
  }
  const mb = (fs.statSync(out).size / 1048576).toFixed(1);
  console.log(`[backup] ${path.relative(process.cwd(), out)} (${mb} MB)`);
  pruneBackups(abs, keep);
  return out;
}

module.exports = { backupDb, pruneBackups, listBackups, KEEP };

// CLI:  node db-backup.cjs translation.db [label]      node db-backup.cjs --prune translation.db
if (require.main === module) {
  const a = process.argv.slice(2);
  if (a[0] === '--prune') { pruneBackups(a[1] || 'translation.db'); }
  else if (a[0] === '--list') { for (const b of listBackups(a[1] || 'translation.db')) console.log(`${(b.size / 1048576).toFixed(1).padStart(7)} MB  ${new Date(b.mtime).toISOString().slice(0, 16)}  ${b.name}`); }
  else backupDb(a[0] || 'translation.db', a[1] || 'manual');
}
