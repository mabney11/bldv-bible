#!/bin/bash
# studio-sync.sh — keep the Translation Studio's work the same on this machine
# and on bldbible.com, directly over ssh (no git involved; DEPLOY-LIGHTSAIL.md §11).
# translation.db can't be merged as a file, so the studio's hand-made rows are
# exported as text on each side and merged per verse (server/studio-sync.mjs):
#   1. export prod's rows (node inside the image on the box) and copy them down
#   2. three-way merge them with this database, against the snapshot of the last
#      sync (server/.studio-sync/base) — a verse changed on one side is taken; a
#      verse changed on both keeps the newer save and puts the other into that
#      verse's history in the studio
#   3. apply the result here, send it up, apply it on prod
#   4. remember the result as the next sync's base, and commit it to
#      server/studio-data/ as a log — git merges nothing here, it just records,
#      so `git log -p server/studio-data/translations.jsonl` shows a verse's
#      wording improving over time (fieldy: "it'll show my better translations")
# Run it whenever you like (sync-from-prod.cjs runs it at every local server
# start; studio-sync-watch.sh — see that file — runs it within seconds of a
# real change on prod instead of waiting on the 5-minute scheduled task);
# nothing happens when both sides already agree. Needs `ssh paleo-lightsail`
# to work from this terminal (PALEO_PROD_HOST / PALEO_PROD_DATA_DIR override).
set -e -o pipefail
cd "$(dirname "$0")"
HOST="${PALEO_PROD_HOST:-paleo-lightsail}"
RDATA="${PALEO_PROD_DATA_DIR:-/mnt/paleo-data}"
RREPO="${PALEO_PROD_REPO:-/home/ubuntu/paleo-studio}"
STATE=server/.studio-sync
LOG() { echo "$(date -u '+%F %T') $*"; }

# ── single-instance lock ─────────────────────────────────────────────────
# studio-sync-watch.sh (frequent, change-triggered) and the 5-minute
# scheduled task (kept as a backstop) can both call this script, so two
# copies CAN land at the same moment. A second exporter racing the first
# onto prod's rows mid-merge is exactly the kind of thing the three-way
# merge isn't designed to referee against itself, so: first one in wins,
# the other exits quietly. mkdir is atomic. Age-based (not pid-based) so
# it behaves the same on Windows/Git-Bash and on the box: a lock older
# than 10 minutes (far longer than a real sync ever takes) is assumed to
# be left over from a crashed run and is safe to reclaim.
mkdir -p "$STATE"
LOCKDIR="$STATE/.lock"
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  LOCK_MTIME="$(stat -c %Y "$LOCKDIR" 2>/dev/null || true)"
  NOW="$(date +%s)"
  if [ -n "$LOCK_MTIME" ] && [ $((NOW - LOCK_MTIME)) -gt 600 ]; then
    LOG "lock is stale (>10min old — a previous run likely crashed) — clearing and taking it"
    rm -rf "$LOCKDIR"
    mkdir "$LOCKDIR" 2>/dev/null || { LOG "lost the race for the lock — exiting"; exit 0; }
  else
    LOG "another studio-sync.sh is already running — exiting"
    exit 0
  fi
fi
trap 'rm -rf "$LOCKDIR"' EXIT

BRANCH="$(git branch --show-current)"

# ControlMaster keeps one real SSH connection open and reuses it for every
# ssh/scp call below, AND for studio-sync-watch.sh's frequent cheap mtime
# checks — a fresh TCP+auth handshake was most of the latency standing
# between "prod changed" and "synced", which is the whole point of the
# watcher. ControlPath lives under ~/.ssh so both scripts share it.
SSH_OPTS="-o BatchMode=yes -o ConnectTimeout=15 -o ControlMaster=auto -o ControlPersist=120s -o ControlPath=$HOME/.ssh/cm-studio-%r@%h:%p"

# Same stale-socket guard as studio-sync-watch.sh (see its comment) - this
# script can also be killed mid-run (a machine sleep/reboot during the
# 5-minute backstop task), so check before trusting a leftover control
# socket instead of letting every ssh/scp call below silently degrade.
if ! ssh -o ControlPath="$HOME/.ssh/cm-studio-%r@%h:%p" -O check "$HOST" >/dev/null 2>&1; then
    rm -f "$HOME"/.ssh/cm-studio-*
fi

SSH() { ssh $SSH_OPTS "$HOST" "$@"; }
SCP_OPTS="-o BatchMode=yes -o ControlPath=$HOME/.ssh/cm-studio-%r@%h:%p"
# node inside the image, with the data volume, the script from the box's checkout and a scratch dir
RDOCKER="docker run --rm -e PALEO_SKIP_HEADINGS=1 -v $RDATA:/data -v $RREPO/server/studio-sync.mjs:/app/server/studio-sync.mjs -v /tmp/studio-sync:/tmp/studio-sync -w /app"

# the box must have the script (docker would otherwise mount an empty DIRECTORY in its place)
if ! SSH "test -f $RREPO/server/studio-sync.mjs"; then
  LOG "prod has no $RREPO/server/studio-sync.mjs yet — push, then \`git pull\` in $RREPO on the box (if a folder of that name is in the way: sudo rmdir it first)" >&2; exit 1
fi

mkdir -p "$STATE/base" "$STATE/merged"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP" "$LOCKDIR"' EXIT
mkdir -p "$TMP/theirs"

# 1. prod's rows
SSH "mkdir -p /tmp/studio-sync/export && $RDOCKER paleo-studio node server/studio-sync.mjs export /tmp/studio-sync/export" | sed "s/^/$(date -u '+%F %T') prod: /"
scp $SCP_OPTS -q "$HOST:/tmp/studio-sync/export/*.jsonl" "$TMP/theirs/"

# 2 + 3a. merge against the last sync's base, apply here, write the result to merged/
STUDIO_DATA_DIR="$STATE/merged" node server/studio-sync.mjs merge "$STATE/base" "$TMP/theirs" | sed "s/^/$(date -u '+%F %T') local: /"

# 3b. the result up to prod, applied there (files win — this is the merge of both sides, seconds old)
if ! diff -qr "$STATE/merged" "$TMP/theirs" >/dev/null 2>&1; then
  SSH "mkdir -p /tmp/studio-sync/merged"
  scp $SCP_OPTS -q "$STATE/merged"/*.jsonl "$HOST:/tmp/studio-sync/merged/"
  SSH "$RDOCKER -e STUDIO_DATA_DIR=/tmp/studio-sync/merged paleo-studio node server/studio-sync.mjs restore" 2>&1 | sed "s/^/$(date -u '+%F %T') prod: /"
fi

# 4. next time, this is what both sides agreed on — and the log
cp "$STATE/merged"/*.jsonl "$STATE/base/"
mkdir -p server/studio-data && cp "$STATE/merged"/*.jsonl server/studio-data/
git add server/studio-data
if ! git diff --cached --quiet; then
  git commit -q -m "studio: translations as of $(date -u '+%Y-%m-%d %H:%M UTC')" -- server/studio-data && LOG "logged to git (server/studio-data)"
fi
