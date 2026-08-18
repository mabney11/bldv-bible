#!/bin/bash
# deploy.sh — zero-downtime blue/green deploy.
#
# Two containers alternate between ports 3000 and 3001. Caddy is configured
# (see WORKBOOK.md) to reverse_proxy to BOTH ports with its own active health
# check, so it only ever sends traffic to whichever one is actually healthy —
# no Caddy reload needed on every deploy, and no window where neither is up.
#
# This script builds the new image, starts it on the currently-idle port,
# and waits for ITS OWN /health to pass before touching the old container at
# all. If the new one never becomes healthy (bad code, bad data, whatever),
# the old container is never stopped — you get a failed deploy, not an
# outage. This is the exact case that bit us: a container that fails its
# startup self-check (the no-eliding gate) used to mean `docker rm -f` had
# already destroyed the working container before the replacement was known
# to be good. Not anymore.
set -e
cd ~/paleo-studio
echo "==> Pulling latest code..."
git pull

# ── DATA GATES — run against the LIVE volume, before touching anything ──────
# corpus.db / translation.db / bible.db are NOT baked into the image (see
# .dockerignore) — they live on the host volume mounted at /data inside the
# container (paleo-data below). A code deploy can't fix bad data and a data
# fix (a re-ingest, a rebuild of load-english-baseline.js's output, etc.)
# doesn't go through this script at all today — so nothing was ever gating
# "does the data on disk actually render every verse" before traffic moved.
# That gap is exactly how 100 chapters / 181 verses across the Bible went
# blank/mislabeled in prod without a failed deploy ever flagging it (see the
# 2026-08-18 fix to load-english-baseline.js's alignChapter()).
#
# PALEO_DATA_DIR: adjust if the volume isn't mounted at /mnt/paleo-data on
# this host — same path the `-v` flag below binds into the container as /data.
PALEO_DATA_DIR="${PALEO_DATA_DIR:-/mnt/paleo-data}"
echo "==> Verifying data on $PALEO_DATA_DIR before build..."
node server/verify-versification.mjs "$PALEO_DATA_DIR/corpus.db"
node server/verify-verse-completeness.mjs "$PALEO_DATA_DIR/corpus.db" "$PALEO_DATA_DIR/translation.db"

echo "==> Building image..."
docker build -t paleo-studio .

# Figure out what's currently live. Handles the one-time migration from the
# old single-container ("paleo") setup too — treat it as if it were paleo-a.
if docker ps --format '{{.Names}}' | grep -q '^paleo-b$'; then
  OLD=paleo-b; OLD_PORT=3001
  NEW=paleo-a; NEW_PORT=3000
elif docker ps --format '{{.Names}}' | grep -q '^paleo-a$'; then
  OLD=paleo-a; OLD_PORT=3000
  NEW=paleo-b; NEW_PORT=3001
elif docker ps --format '{{.Names}}' | grep -q '^paleo$'; then
  OLD=paleo; OLD_PORT=3000
  NEW=paleo-b; NEW_PORT=3001
else
  OLD=""; OLD_PORT=""
  NEW=paleo-a; NEW_PORT=3000
fi

echo "==> Currently live: ${OLD:-none} (port ${OLD_PORT:-n/a}). Starting $NEW on port $NEW_PORT..."
docker rm -f "$NEW" 2>/dev/null || true
# --cpus="1" caps $NEW to ONE core while it boots (see below for why). This
# box is 2 vCPUs / ~1.9GB RAM, and $NEW's startup (module load + in-memory
# nav-index build, once per worker) is genuinely heavy — with $OLD's own
# workers still fully live, the two together drove load average to 18-27
# during testing, locking up the host so badly even a fresh SSH session
# couldn't connect.
#
# --memory/--memory-swap were added after a SECOND lockup, once the --cpus
# cap alone turned out not to be enough: a swap file had just been added as
# a separate safety measure, and $NEW's UNCAPPED memory use apparently drove
# the box into heavy swap THRASHING instead of the cleaner OOM-kill behavior
# we'd seen before swap existed — thrashing on a virtualized disk is worse
# for responsiveness than an outright kill, and matches a second full
# connection-timeout lockup. Capping memory too, with --memory-swap equal to
# --memory (so this container gets NO extra swap headroom of its own), means
# if $NEW ever tries to exceed the cap it gets OOM-killed and cluster.js's
# existing worker-respawn-with-backoff handles it — a contained, visible
# failure instead of dragging the whole host into thrashing. 1000m leaves
# ~900MB for $OLD + OS + Caddy + sshd, based on $OLD's observed 670MB-1.1GB
# steady-state usage. Watch `docker stats` during the next deploy attempt to
# see real numbers and retune if $NEW is hitting this ceiling and failing to
# boot because of it rather than because of an actual bug.
#
# RETUNED 2026-08-12: 1000m/1000m turned out to be right at the edge — a real
# deploy failed with a worker SIGKILLed ~55s into boot (cluster.js spawns one
# worker PER CPU CORE regardless of the --cpus=1 boot-time throttle above, so
# TWO full workers, each independently opening corpus.db/concordance.db/
# surface-index.db and building the ~8,600-root nav index, were squeezed into
# 1000MB with no swap of their own at all). The host got a swap-size increase
# (2G -> 6G) the same day for an unrelated reason and has plenty of headroom
# now, so $NEW gets a little swap of its own this time too (300MB) instead of
# none — softens a transient spike into slowness rather than a hard kill,
# while still capping total memory+swap well short of the host's full 6GB so
# $OLD + OS + Caddy + sshd still have room during the overlap. Watch `docker
# stats` on the next attempt and retune again if this is still too tight.
docker run -d \
  --name "$NEW" \
  --restart unless-stopped \
  --cpus="1" \
  --memory="1400m" \
  --memory-swap="1700m" \
  -p "$NEW_PORT:3000" \
  -v /mnt/paleo-data:/data \
  --env-file .env \
  -e NODE_ENV=production \
  paleo-studio

echo "==> Waiting for $NEW to pass its own health check..."
ok=0
# RETUNED 2026-08-13: was 60 tries * 2s sleep = ~2m. A real deploy hit the exact
# failure this was designed to avoid — $NEW recovered from a boot-time worker
# SIGKILL (cluster.js respawn-with-backoff) and was confirmed healthy/stable
# moments after the script gave up (curl against /health succeeded immediately
# once checked by hand) — the container was fine, the window was just too
# short for a rocky-but-recoverable boot. 150 tries * 2s sleep = ~5m gives a
# slow-but-recovering boot enough runway without changing anything else about
# the fail-fast behavior below.
for i in $(seq 1 150); do
  # --max-time bounds EACH probe. Without it, a container that's up but too
  # CPU-starved to respond makes curl hang indefinitely on a single try —
  # the whole retry budget never gets spent, it just gets stuck on try #1.
  # This is what actually happened during testing: the loop looked "frozen"
  # on the first status line for minutes past its intended ceiling, when what
  # was really needed was to fail fast and retry.
  if curl -sf --max-time 5 "http://localhost:$NEW_PORT/health" > /dev/null; then
    ok=1
    break
  fi
  sleep 2
done

if [ "$ok" != "1" ]; then
  echo "==> $NEW FAILED health check after 5m — NOT touching $OLD. Site is still served by $OLD."
  echo "==> Check what went wrong: docker logs $NEW --tail 80"
  echo "==> ($NEW is left running so you can inspect it. Clean up with: docker rm -f $NEW)"
  exit 1
fi

echo "==> $NEW is healthy. Restoring full CPU/memory (retiring $OLD next, no more need to share)..."
docker update --cpus="2" --memory="1800m" --memory-swap="3800m" "$NEW" > /dev/null

echo "==> Giving Caddy a moment to start routing to it..."
sleep 6   # >= Caddyfile's health_interval (5s), so Caddy has already marked it up

if [ -n "$OLD" ]; then
  echo "==> Retiring $OLD..."
  docker stop "$OLD" 2>/dev/null || true
  docker rm "$OLD" 2>/dev/null || true
fi

echo "==> Deploy OK — now serving from $NEW (port $NEW_PORT)"
