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
// removing a stray .git/*.lock file (anywhere under .git except objects/ —
// see below) once it's old enough that no real git process could still be
// using it. Nothing else here is auto-fixed:
// - lexicon-watch.sh / studio-sync-watch.sh already retry on every ~15s
//   poll on their own (the .failing marker files are a STATUS flag for
//   notify.sh, not a gate that blocks retries) — there's no "stuck and not
//   retrying" state for them to be kicked out of.
// - Uncommitted local changes blocking `git pull --rebase` (today's other
//   failure mode) are NOT auto-committed — deciding what an unknown local
//   change should become is fieldy's call, not a safe/idempotent operation.
//   The widget surfaces this clearly instead, and now also offers on-demand
//   Actions (Pull/Push/Sync/Deploy/Clear Locks) for fieldy to resolve it
//   himself with one click rather than dropping to a terminal — see
//   scripts/observability-widget.ps1's Actions panel (added 2026-09-22).
//
// 2026-09-22 widening: originally this only ever checked/cleared
// .git/index.lock specifically. Found the SAME night that a stale
// .git/HEAD.lock (a different lock file, left by a different crashed git
// process — not the one index.lock covers) jammed lexicon-sync.sh's
// `git commit` step for over an hour with nothing here catching it, because
// nothing was watching for anything but that one specific filename. Widened
// to scan for ANY *.lock file under .git (excluding .git/objects — git's
// own maintenance/gc can legitimately hold a lock there for a real,
// possibly-long-running operation, which is not this rule's business) and
// auto-clear any that are stale, not just index.lock by name.
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
const GIT_DIR = path.join(REPO_ROOT, '.git');
const STATE_DIR = path.join(REPO_ROOT, 'server', '.observability');
const STATUS_FILE = path.join(STATE_DIR, 'status.json');
const STATUS_FILE_TMP = STATUS_FILE + '.tmp';

const HOST = process.env.PALEO_PROD_HOST || 'paleo-prod';
const SITE_URL = process.env.PALEO_SITE_URL || 'https://bldbible.com';
const RREPO = process.env.PALEO_PROD_REPO || '/root/paleo-studio';
const POLL_MS = Number(process.env.PALEO_OBS_INTERVAL_MS || 20000);
const LOCK_STALE_MS = 2 * 60 * 1000;
// Below this age, a lock file is far more likely to be an entirely normal,
// sub-second hold from one of this project's OWN background git operations
// (the collector's own `git fetch`, lexicon-watch.sh, studio-sync-watch.sh
// all run every 15-20s against this same checkout) than an actual stuck
// process -- reporting every one of those in status.json made the widget's
// warning line flash on and off for completely healthy activity. Found
// 2026-09-22 from fieldy noticing exactly that flash. Auto-resolve above
// still scans and can remove ANY lock once truly stale (LOCK_STALE_MS);
// this second, much shorter threshold only gates what gets REPORTED to the
// widget, so a real hang is still visible well before the 2-minute mark
// without every normal git call along the way lighting up the UI.
const LOCK_REPORT_MIN_AGE_MS = 10 * 1000;
// A file that's been sitting modified/untracked (outside server/lexicon and
// server/studio-data -- see checkOtherChanges below) longer than this is
// flagged in the widget's pending-files checklist as "stale", so it doesn't
// just sit there silently forever. fieldy, 2026-09-22: files he isn't ready
// to commit yet should stay in the list untouched (nothing here ever
// auto-commits or discards them) but should be called out if they've been
// sitting a long time. Approximated from the file's own mtime -- not a
// perfect "when did this become dirty" signal (a touch with no content
// change would reset it too), but it's cheap, already-available, and good
// enough for a reminder, not an enforcement mechanism.
const STALE_FILE_MS = Number(process.env.PALEO_OBS_STALE_FILE_MS || 24 * 60 * 60 * 1000);

const PID_FILE = path.join(STATE_DIR, 'collector.pid');

function isProcessAlive(pid) {
    if (!pid) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return e.code === 'EPERM'; // exists, just not signalable by us -- still alive
    }
}

// fieldy, 2026-09-22: found TWO copies of this script running at once
// (an old one left over from a Stop-ScheduledTask that didn't actually
// kill the underlying node process, plus a freshly-started one), both
// writing status.json on their own ~20s timer and stomping on each other
// -- the widget was flickering between an old-shaped status and a new one
// because it was just showing whichever one happened to write last. A
// simple PID file makes a second copy refuse to start instead.
function acquireSingleInstanceLock() {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    if (fs.existsSync(PID_FILE)) {
        const existingPidRaw = fs.readFileSync(PID_FILE, 'utf8').trim();
        const existingPid = Number(existingPidRaw);
        if (existingPid && existingPid !== process.pid && isProcessAlive(existingPid)) {
            log(`another observability-status.mjs is already running (pid ${existingPid}) -- exiting so it doesn't race writing status.json`);
            process.exit(0);
        }
        log(`stale pid file (pid ${existingPidRaw || '?'} not running) -- taking over`);
    }
    fs.writeFileSync(PID_FILE, String(process.pid));
}

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

// Everything modified/untracked OUTSIDE server/lexicon and server/studio-data
// — i.e. everything nothing in this project already auto-commits for you.
// fieldy, 2026-09-22, after noticing his own general code edits (CLAUDE.md,
// a script fix, leftover scratch/diagnostic files from a past debugging
// session) just sitting there with no visibility: "the fact i have
// untracked changes and action items from it is the next major thing, i
// need the ability to add and commit and be informed of where things
// currently are." This is the "informed" half; the widget's new Commit box
// (observability-widget.ps1) is the "ability to add and commit" half, and
// deliberately stages/commits this SAME excluded-scope set (`git add -A --
// . ':!server/lexicon' ':!server/studio-data'`) so the status line and the
// button always agree on what "other" means.
async function checkOtherChanges() {
    const res = await run('git', ['status', '--porcelain']);
    if (!res.ok) return { ok: false, error: res.err, count: 0, files: [] };
    const IN_SCOPE = [/^server\/lexicon\//, /^server\/studio-data\//];
    const files = res.out.split('\n').filter(Boolean)
        .map((line) => ({ status: line.slice(0, 2).trim(), path: line.slice(3) }))
        .filter((f) => !IN_SCOPE.some((re) => re.test(f.path)))
        .map((f) => {
            // A renamed/deleted entry ("R  old -> new", or a plain deletion)
            // may have nothing left on disk to stat -- age just comes back
            // null in that case rather than failing the whole poll.
            const diskPath = f.path.includes(' -> ') ? f.path.split(' -> ')[1] : f.path;
            try {
                const st = fs.statSync(path.join(REPO_ROOT, diskPath));
                const age_ms = Date.now() - st.mtimeMs;
                return { ...f, since: st.mtime.toISOString(), age_s: Math.round(age_ms / 1000), stale: age_ms >= STALE_FILE_MS };
            } catch {
                return { ...f, since: null, age_s: null, stale: false };
            }
        });
    // Full list, not just a preview -- the widget's checklist needs every
    // pending file to be selectable, not a truncated sample of them.
    return { ok: true, count: files.length, files };
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

// Every *.lock file under .git, except .git/objects (git's own
// maintenance.lock and any in-progress loose-object write there can be a
// real, legitimately-long-running hold — not something a generic "stale
// lock" sweep should ever touch). Shallow-bounded (depth 4) so this stays
// cheap on every ~20s poll; every lock file this project has actually hit
// (HEAD.lock, index.lock, refs/heads/<branch>.lock) lives well within that.
function findGitLockFiles() {
    const found = [];
    function scan(dir, depth) {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (e.name === 'objects') continue;
            const p = path.join(dir, e.name);
            if (e.isFile() && e.name.endsWith('.lock')) found.push(p);
            else if (e.isDirectory() && depth < 4) scan(p, depth + 1);
        }
    }
    scan(GIT_DIR, 0);
    return found;
}

function currentGitLocks() {
    return findGitLockFiles().map((p) => {
        const rel = path.relative(REPO_ROOT, p);
        try {
            const st = fs.statSync(p);
            const age_ms = Date.now() - st.mtimeMs;
            return { path: rel, since: st.mtime.toISOString(), age_s: Math.round(age_ms / 1000), age_ms };
        } catch {
            return null;
        }
    }).filter((l) => l && l.age_ms >= LOCK_REPORT_MIN_AGE_MS)
      .map(({ age_ms, ...rest }) => rest); // age_ms was only needed for the filter above
}

function autoResolveStaleGitLocks() {
    const actions = [];
    for (const lockPath of findGitLockFiles()) {
        try {
            const st = fs.statSync(lockPath);
            const age = Date.now() - st.mtimeMs;
            if (age > LOCK_STALE_MS) {
                fs.unlinkSync(lockPath);
                const rel = path.relative(REPO_ROOT, lockPath);
                log(`auto-resolve: removed stale ${rel} (${Math.round(age / 1000)}s old)`);
                actions.push({ action: `removed_stale_lock:${rel}`, age_s: Math.round(age / 1000) });
            }
        } catch {
            // Raced with something else already clearing it (the real git
            // process finishing, or fieldy's own "Clear locks" widget
            // button) — fine, nothing to do.
        }
    }
    return actions;
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
    const autoResolved = autoResolveStaleGitLocks();

    const [localGit, otherChanges, site, prod] = await Promise.all([
        checkLocalGit(),
        checkOtherChanges(),
        checkSiteHealth(),
        checkProd(),
    ]);

    const lexiconFailing = checkFlag('server/.lexicon-watch/.failing');
    const studioFailing = checkFlag('server/.studio-sync/.failing');
    const studioLock = checkFlag('server/.studio-sync/.lock');
    const gitLocks = currentGitLocks();

    const status = {
        generated_at: new Date().toISOString(),
        local: {
            git: localGit,
            other_changes: otherChanges,
            lexicon_sync_failing: lexiconFailing,
            studio_sync_failing: studioFailing,
            studio_sync_lock: studioLock,
            git_locks: gitLocks,
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
    if (otherChanges.ok && otherChanges.count) problems.push(`${otherChanges.count} uncommitted file(s) outside lexicon/studio-data`);
    if (lexiconFailing.present) problems.push('lexicon-sync stuck');
    if (studioFailing.present) problems.push('studio-sync stuck');
    if (gitLocks.length) problems.push(`${gitLocks.length} git lock(s) present (${gitLocks.map(l => l.path).join(', ')})`);
    if (!site.reachable) problems.push('site unreachable');
    if (!prod.reachable) problems.push('prod unreachable via ssh');
    if (prod.reachable && prod.git_behind_origin) problems.push(`prod ${prod.git_behind_origin} behind origin`);

    if (problems.length) log(`ISSUES: ${problems.join('; ')}`);
    else log('all clear');

    return status;
}

async function main() {
    acquireSingleInstanceLock();
    log(`observability-status starting — polling every ${POLL_MS / 1000}s, writing ${STATUS_FILE}`);
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try { await pollOnce(); }
        catch (e) { log(`poll error: ${e && e.stack || e}`); }
        await new Promise(r => setTimeout(r, POLL_MS));
    }
}

main();
