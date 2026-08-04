/**
 * cluster.js — multi-process entry point for production.
 *
 * Usage:
 *     node cluster.js                  # one worker per CPU core
 *     WORKERS=2 node cluster.js        # exactly 2 workers
 *     node server.js                   # single-process dev mode (no cluster)
 *
 * Why cluster mode for this app
 * ─────────────────────────────
 * better-sqlite3 is synchronous.  A single Node process serves requests on
 * one core; if any request takes >5 ms of CPU, others queue behind it.
 * Cluster mode forks N workers (one per core by default), and the kernel
 * round-robins TCP accept() between them.  No extra deps, no load balancer,
 * no proxy.
 *
 * SQLite handles N readers + 1 writer just fine — WAL mode (set in server.js)
 * makes concurrent reads while a write is in flight non-blocking.  Each
 * worker opens its own handles at startup.
 *
 * Workers that die get respawned with backoff so a crash loop doesn't melt
 * the host.  SIGTERM to the master shuts everything down gracefully.
 */
'use strict';

const cluster = require('cluster');
const os = require('os');

if (cluster.isPrimary) {
    const numWorkers = parseInt(process.env.WORKERS, 10) || os.cpus().length;
    console.log(`[cluster] master pid=${process.pid}  spawning ${numWorkers} workers`);

    // Crash-loop guard.  If a worker exits within RAPID_EXIT_WINDOW_MS of
    // starting, that's a "rapid restart".  More than RAPID_EXIT_LIMIT of those
    // in a row and we exit the master — something's wrong that respawning
    // won't fix.
    const RAPID_EXIT_WINDOW_MS = 5_000;
    const RAPID_EXIT_LIMIT     = 5;
    const startTimes = new Map();           // worker id → spawn timestamp
    let consecutiveRapidExits = 0;

    function spawnOne() {
        const w = cluster.fork();
        startTimes.set(w.id, Date.now());
    }

    for (let i = 0; i < numWorkers; i++) spawnOne();

    cluster.on('exit', (worker, code, signal) => {
        const spawnedAt = startTimes.get(worker.id);
        startTimes.delete(worker.id);
        const livedFor = spawnedAt ? Date.now() - spawnedAt : 0;
        console.warn(`[cluster] worker ${worker.process.pid} exited code=${code} signal=${signal} after ${livedFor}ms`);

        if (shuttingDown) return;   // master is going down; don't respawn

        if (livedFor < RAPID_EXIT_WINDOW_MS) {
            consecutiveRapidExits++;
            if (consecutiveRapidExits >= RAPID_EXIT_LIMIT) {
                console.error(`[cluster] ${RAPID_EXIT_LIMIT} consecutive rapid worker exits — bailing`);
                process.exit(1);
            }
        } else {
            consecutiveRapidExits = 0;
        }
        // Re-fork.  Short delay if we just crashed, otherwise immediate.
        setTimeout(spawnOne, livedFor < RAPID_EXIT_WINDOW_MS ? 500 : 0);
    });

    // Graceful master shutdown: tell every worker to stop accepting + drain,
    // then exit.  Workers handle their own SIGTERM (see server.js
    // installShutdown).
    let shuttingDown = false;
    const shutdown = (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`[cluster] received ${signal}, shutting down workers`);
        for (const id in cluster.workers) {
            cluster.workers[id].kill('SIGTERM');
        }
        // Hard deadline
        setTimeout(() => {
            console.warn('[cluster] shutdown timeout — force exit');
            process.exit(1);
        }, 10_000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

} else {
    // Worker: just run the server module.  It self-registers shutdown handlers
    // that respond to the SIGTERM the master sends.
    require('./server.js');
}
