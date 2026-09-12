/**
 * sync-from-prod.cjs — local translation.db is REQUIRED to match prod on every
 * server start. translation.db is prod-is-truth (verses are edited live on
 * bldbible.com through Translation Studio); local must never drift below it,
 * and after 2026-09-11 (a local copy pushed over prod, then a Studio edit made
 * on prod that local did not have) fieldy asked for this to be enforced:
 * "require that my local instance be synced up with prod on every server start".
 *
 * What it does, before server.js opens any database:
 *   1. ssh prod: checkpoint its WAL, take the md5 of /mnt/paleo-data/translation.db
 *   2. checkpoint the local file, take its md5
 *   3. same → nothing to do. Different → back the local file up
 *      (backups/translation.pre-sync.<stamp>.db.gz — capped, see db-backup.cjs), scp prod's copy down to a
 *      .downloading name, verify its md5 against prod's, then swap it in and
 *      drop the stale -wal/-shm.
 * Any failure (no ssh, no network, md5 mismatch) STOPS the server with the reason:
 * a dev server running on stale text is the bug this prevents.
 *
 * Skipped automatically where it makes no sense: in the prod container
 * (READ_ONLY / NODE_ENV=production / DATA_DIR set) and in cluster workers (the
 * primary syncs once before forking). Escape hatch for working offline:
 *     PALEO_NO_SYNC=1 node server.js        (says so loudly on start)
 * Override the host/path with PALEO_PROD_HOST (default "paleo-lightsail", the
 * ~/.ssh/config alias) and PALEO_PROD_DATA_DIR (default /mnt/paleo-data).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cluster = require('cluster');
const { spawnSync } = require('child_process');
const { backupDb, pruneBackups } = require('./db-backup.cjs');

const FILE = 'translation.db';
const HERE = __dirname;
const LOCAL = path.join(HERE, FILE);
const STAMP_FILE = path.join(HERE, '.last-prod-sync.json');

function isProdContainer() {
  const e = process.env;
  return e.READ_ONLY === '1' || e.READ_ONLY === 'true' || e.NODE_ENV === 'production' || !!e.DATA_DIR;
}
function md5File(file) {
  const h = crypto.createHash('md5');
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(1 << 20); let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  } finally { fs.closeSync(fd); }
  return h.digest('hex');
}
function run(cmd, args, timeoutMs) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
  if (r.error) throw new Error(`${cmd} failed to start: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited ${r.status}${r.stderr ? ': ' + r.stderr.trim() : ''}`);
  return r.stdout;
}
function checkpointLocal() {
  if (!fs.existsSync(LOCAL)) return;
  try {
    const Database = require('better-sqlite3');
    const db = new Database(LOCAL);
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
  } catch (e) { console.warn(`[sync] could not checkpoint local ${FILE} (${e.message}) — comparing the main file as is`); }
}

function syncFromProd() {
  if (cluster.isWorker) return;
  if (isProdContainer()) return;
  if (process.env.PALEO_NO_SYNC === '1') {
    console.warn(`[sync] PALEO_NO_SYNC=1 — ${FILE} NOT checked against prod. Local text may be stale; do not push it anywhere.`);
    return;
  }
  const host = process.env.PALEO_PROD_HOST || 'paleo-lightsail';
  const remote = `${process.env.PALEO_PROD_DATA_DIR || '/mnt/paleo-data'}/${FILE}`;
  const t0 = Date.now();
  console.log(`[sync] checking ${FILE} against prod (${host}:${remote})…`);

  let remoteMd5;
  try {
    const out = run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', host,
      `sudo sqlite3 ${remote} 'PRAGMA wal_checkpoint(TRUNCATE);' >/dev/null 2>&1; md5sum ${remote}`], 60_000);
    remoteMd5 = (out.trim().split(/\s+/)[0] || '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(remoteMd5)) throw new Error(`unexpected md5sum output: ${out.trim()}`);
  } catch (e) {
    fail(`cannot read prod's ${FILE}: ${e.message}\n        Check that \`ssh ${host}\` works from this terminal. Working offline on purpose? PALEO_NO_SYNC=1`);
  }

  checkpointLocal();
  const localMd5 = fs.existsSync(LOCAL) ? md5File(LOCAL) : null;
  if (localMd5 === remoteMd5) {
    console.log(`[sync] ${FILE} matches prod (${remoteMd5.slice(0, 8)}) — ${Date.now() - t0} ms`);
    writeStamp(remoteMd5);
    pruneBackups(LOCAL);   // keep the backups folder at its cap even on a no-op start
    return;
  }

  // Local differs. Since 2026-09-12 the Studio's hand-made rows travel through git
  // (studio-sync.sh / studio-sync.mjs, DEPLOY-LIGHTSAIL.md §11), so local edits are
  // NOT lost by this pull: they are committed and pushed here first, and put back
  // into the pulled copy below (`restore`) — prod's cron applies them on its side.
  try {
    run('bash', [path.join(HERE, '..', 'studio-sync.sh')], 5 * 60_000);
    console.log('[sync] studio edits committed to git before the pull');
  } catch (e) {
    console.warn(`[sync] WARNING: studio-sync.sh failed (${e.message.split('\n')[0]}) — local Studio edits, if any, are only in the pre-sync backup until it succeeds`);
  }
  let last = null;
  try { last = JSON.parse(fs.readFileSync(STAMP_FILE, 'utf8')); } catch { /* first run */ }
  if (localMd5) {
    const bak = backupDb(LOCAL, 'pre-sync');   // gzip snapshot in backups/, capped (db-backup.cjs)
    if (last && last.md5 && last.md5 !== localMd5) {
      console.warn(`[sync] WARNING: local ${FILE} was changed since the last pull (local Studio edits?). Prod is the source of truth — those changes are NOT on prod. Kept at ${path.basename(bak)}.`);
    } else {
      console.log(`[sync] local ${FILE} is behind prod — backed up to ${path.basename(bak)}`);
    }
  }
  const tmp = `${LOCAL}.downloading`;
  try {
    fs.rmSync(tmp, { force: true });
    run('scp', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-q', `${host}:${remote}`, tmp], 10 * 60_000);
    const got = md5File(tmp);
    if (got !== remoteMd5) throw new Error(`downloaded copy's md5 ${got.slice(0, 8)} ≠ prod's ${remoteMd5.slice(0, 8)} (prod written mid-copy?) — run again`);
    fs.renameSync(tmp, LOCAL);
    for (const s of ['-wal', '-shm']) fs.rmSync(LOCAL + s, { force: true });
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    fail(`pulling prod's ${FILE} failed: ${e.message}\n        The local file is untouched.`);
  }
  writeStamp(remoteMd5);
  console.log(`[sync] ${FILE} pulled from prod (${remoteMd5.slice(0, 8)}, ${(fs.statSync(LOCAL).size / 1048576).toFixed(1)} MB) — ${Date.now() - t0} ms`);
  // the pulled copy may predate what git holds (edits pushed from here that prod's
  // cron has not applied yet): put those back — the committed files win.
  try { process.stdout.write(run('node', [path.join(HERE, 'studio-sync.mjs'), 'restore'], 5 * 60_000)); }
  catch (e) { console.warn(`[sync] WARNING: studio-sync restore failed (${e.message.split('\n')[0]}) — run: node server/studio-sync.mjs restore`); }
}
function writeStamp(md5) {
  try { fs.writeFileSync(STAMP_FILE, JSON.stringify({ md5, at: new Date().toISOString() }) + '\n'); } catch { /* not fatal */ }
}
function fail(msg) {
  console.error(`\n[sync] ✗ ${msg}\n[sync] The server will not start on a ${FILE} that may be stale.\n`);
  process.exit(1);
}

module.exports = { syncFromProd };
if (require.main === module) syncFromProd();
