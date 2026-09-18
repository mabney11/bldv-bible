#!/usr/bin/env node
// scripts/observability-status.mjs
//
// Polls the state of the whole sync/uptime picture — local <-> GitHub <->
// prod, plus the site itself — and writes it to server/.observability/
// status.json every ~20s, for scripts/observability-widget.ps1 (the desktop
// widget) to read and display.
//
// fieldy, 2026-09-18, after a lexicon-sync stall sat unnoticed for hours
// (a stale .git/index.lock, then unrelated uncommitted files, both jamming
// `git pull --rebase`) and a near-identical silent stall on 2026-09-16 (a
// day and a half, per notify.sh's own header comment): "the observability
// of my app needs to be improved" — wants to SEE the moment local/prod come
// out of line or back into line, and have safe issues fixed automatically.
//
// What "safe, idempotent" auto-resolve actually covers here, on purpose:
// ONLY removing a .git/index.lock once it's old enough (2 min — much
// shorter than studio-sync's own 10-min lock-staleness threshold, since an
// index.lock left by a crashed/interrupted git process is usually obvious
// within seconds, not a legitimately-long-running operation) that no real
// git process could still be using it. Nothing else here is auto-fixed:
// - lexicon-watch.sh / studio-sync-watch.sh already retry on every ~15s
//   poll on their own (the .failing marker files are a STATUS flag for
//   notify.sh, not a gate that blocks retries) — there's no "stuck and not
//   retrying" state for them to be kicked out of.
// - Uncommitted local changes blocking `git pull --rebase` (today's other
//   failure mode) are NOT auto-committed — deciding what an unknown local
//   change should become is fieldy's call, not a safe/idempotent operation.
//   The widget surfaces this clearly instead.
//
// Run via scripts/observability-collector-hidden.vbs (same hidden-window
// pattern as lexicon-watch-hidden.vbs / studio-sync-watch-hidden.vbs),
// registered by scripts/setup-observability-task.ps1.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');
const STATE_DIR = path.join(REPO_ROOT, 'server', '.observability');
const STATUS_FILE = path.join(STATE_DIR, 'status.json');
const STATUS_FILE_TMP = STATUS_FILE + '.tmp';

const HOST = process.env.PALEO_PROD_HOST || 'paleo-prod';
const SITE_URL = process.env.PALEO_SITE_URL || 'https://bldbible.com';
const RREPO = process.env.PALEO_PROD_REPO || '/root/paleo-studio';
const POLL_MS = Number(process.env.PALEO_OBS_INTERVAL_MS || 20000);
const INDEX_LOCK_STALE_MS = 2 * 60 * 1000;

function log(msg) {
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    console.log(`${ts} ${msg}`);
}

async function run(cmd, args) {
    try {
        const { stdout } = await execFileP(cmd, args, { cwd: REPO_ROOT, timeout: 15000, windowsHide: true });
        return { ok: true, out: stdout.trim() };
    } catch (e) {
        const msg = (e.stderr || e.message || String(e)).toString().trim();
        return { ok: false, err: msg };
    }
}

async function checkLocalGit() {
    const fetchRes = await run('git', ['fetch', 'origin', 'main', '-q']);
    const counts = await run('git', ['rev-list', '--left-right', '--count', 'origin/main...HEAD']);
    let ahead = null, behind = null;
    if (counts.ok) {
        const parts = counts.out.split(/\s+/).map(Number);
        if (parts.length === 2 && parts.every(Number.isFinite)) { behind = parts[0]; ahead = parts[1]; }
    }
    const headRes = await run('git', ['rev-parse', 'HEAD']);
    return {
        fetch_ok: fetchRes.ok,
        fetch_error: fetchRes.ok ? null : fetchRes.err,
        ahead, behind,
        head: headRes.ok ? headRes.out : null,
    };
}

function checkFlag(relPath) {
    const p = path.join(REPO_ROOT, relPath);
    try {
        const st = fs.statSync(p);
        return { present: true, since: st.mtime.toISOString(), age_s: Math.round((Date.now() - st.mtimeMs) / 1000) };
    } catch {
        return { present: false };
    }
}

function autoResolveStaleIndexLock() {
    const lockPath = path.join(REPO_ROOT, '.git', 'index.lock');
    try {
        const st = fs.statSync(lockPath);
        const age = Date.now() - st.mtimeMs;
        if (age > INDEX_LOCK_STALE_MS) {
            fs.unlinkSync(lockPath);
            log(`auto-resolve: removed stale .git/index.lock (${Math.round(age / 1000)}s old)`);
            return { action: 'removed_stale_index_lock', age_s: Math.round(age / 1000) };
        }
        return null;
    } catch {
        return null;
    }
}

async function checkSiteHealth() {
    const start = Date.now();
    try {
        const res = await fetch(`${SITE_URL}/health`, { signal: AbortSignal.timeout(8000) });
        const latency_ms = Date.now() - start;
        if (!res.ok) return { reachable: false, http_status: res.status, latency_ms };
        const body = await res.json();
        return { reachable: true, latency_ms, ...body };
    } catch (e) {
        return { reachable: false, error: String(e && e.message || e) };
    }
}

async function checkProd() {
    const sshOpts = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ControlMaster=no'];
    const headRes = await run('ssh', [...sshOpts, HOST, `sudo -n bash -c 'cd ${RREPO} && git rev-parse HEAD'`]);
    if (!headRes.ok) {
        return { reachable: false, error: headRes.err, git_head: null, git_behind_origin: null, containers: [], lexicon_pull_watch: 'unknown' };
    }
    const behindRes = await run('ssh', [...sshOpts, HOST,
        `sudo -n bash -c 'cd ${RREPO} && git fetch origin main -q && git rev-list --count HEAD..origin/main'`]);
    const dockerRes = await run('ssh', [...sshOpts, HOST, `docker ps --format '{{.Names}}'`]);
    const pullWatchRes = await run('ssh', [...sshOpts, HOST,
        `sudo -n bash -c 'test -f ${RREPO}/server/.lexicon-watch/.pull-watch.pid && kill -0 $(cat ${RREPO}/server/.lexicon-watch/.pull-watch.pid) 2>/dev/null && echo alive || echo dead'`]);
    return {
        reachable: true,
        error: null,
        git_head: headRes.out,
        git_behind_origin: behindRes.ok ? Number(behindRes.out) : null,
        containers: dockerRes.ok ? dockerRes.out.split('\n').map(s => s.trim()).filter(Boolean) : [],
        lexicon_pull_watch: pullWatchRes.ok ? pullWatchRes.out.trim() : 'unknown',
    };
}

async function pollOnce() {
    const autoResolved = [];
    const lockAction = autoResolveStaleIndexLock();
    if (lockAction) autoResolved.push(lockAction);

    const [localGit, site, prod] = await Promise.all([
        checkLocalGit(),
        checkSiteHealth(),
        checkProd(),
    ]);

    const lexiconFailing = checkFlag('server/.lexicon-watch/.failing');
    const studioFailing = checkFlag('server/.studio-sync/.failing');
    const studioLock = checkFlag('server/.studio-sync/.lock');
    const indexLockNow = checkFlag('.git/index.lock');

    const status = {
        generated_at: new Date().toISOString(),
        local: {
            git: localGit,
            lexicon_sync_failing: lexiconFailing,
            studio_sync_failing: studioFailing,
            studio_sync_lock: studioLock,
            git_index_lock: indexLockNow,
        },
        site: { url: SITE_URL, ...site },
        prod: { host: HOST, ...prod },
        auto_resolved: autoResolved,
    };

    fs.mkdirSync(STATE_DIR, { recursive: true });
    // Write-then-rename so the widget never reads a half-written file.
    fs.writeFileSync(STATUS_FILE_TMP, JSON.stringify(status, null, 2));
    fs.renameSync(STATUS_FILE_TMP, STATUS_FILE);

    const problems = [];
    if (!localGit.fetch_ok) problems.push('local git fetch failed');
    if (localGit.behind) problems.push(`local ${localGit.behind} behind origin`);
    if (lexiconFailing.present) problems.push('lexicon-sync stuck');
    if (studioFailing.present) problems.push('studio-sync stuck');
    if (!site.reachable) problems.push('site unreachable');
    if (!prod.reachable) problems.push('prod unreachable via ssh');
    if (prod.reachable && prod.git_behind_origin) problems.push(`prod ${prod.git_behind_origin} behind origin`);

    if (problems.length) log(`ISSUES: ${problems.join('; ')}`);
    else log('all clear');

    return status;
}

async function main() {
    log(`observability-status starting — polling every ${POLL_MS / 1000}s, writing ${STATUS_FILE}`);
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try { await pollOnce(); }
        catch (e) { log(`poll error: ${e && e.stack || e}`); }
        await new Promise(r => setTimeout(r, POLL_MS));
    }
}

main();
