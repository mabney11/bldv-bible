#!/usr/bin/env bash
# sync-corpus-to-prod.sh — push a locally-updated corpus.db to the Lightsail box.
#
# RUN THIS FROM YOUR OWN MACHINE (Git Bash / MINGW64 terminal — the one where
# `ssh paleo-lightsail` already works). Works from anywhere in the repo; it
# finds server/corpus.db relative to its own location. It will NOT work from
# Claude's device-bridge VM — that VM has no network route to the Lightsail
# box at all (confirmed repeatedly this project).
#
# Safe for corpus.db specifically: it's batch-script-sourced, never live-edited
# through the running app, so pushing local -> prod is the accepted direction
# for it (see the "prod-data-direction" project note). Never do this for
# translation.db — that one is prod-is-truth, always pull down, never push up
# (see sync-prod-data.ps1 next to this file for that direction).
#
# What it does: checkpoints both copies' WAL, backs up prod's current file,
# compresses + uploads yours, verifies the byte size matches EXACTLY before
# touching anything live, then atomically swaps it in. Keeps only the
# $KEEP_BACKUPS most recent prod backups afterward, so re-running this
# repeatedly doesn't slowly fill /mnt/paleo-data with multi-gigabyte
# snapshots that all get superseded within a day or two anyway.
#
# Usage:
#   bash scripts/sync-corpus-to-prod.sh [label]
#   [label] is an optional short tag for the backup filename (e.g.
#   "1esdras-merge") so a future `ls` on prod says what each backup was for.
#   Defaults to "manual-sync" if omitted.

set -euo pipefail

REMOTE_HOST="paleo-lightsail"
REMOTE_PATH="/mnt/paleo-data/corpus.db"
KEEP_BACKUPS=2

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_DB="$SCRIPT_DIR/../server/corpus.db"
LABEL="${1:-manual-sync}"
TS="$(date +%Y%m%d%H%M%S)"
REMOTE_BACKUP="${REMOTE_PATH}.bak-${LABEL}-${TS}"

if [ ! -f "$LOCAL_DB" ]; then
  echo "Can't find corpus.db at $LOCAL_DB" >&2
  exit 1
fi

echo "== 1/7  Checkpointing local corpus.db (flush WAL) =="
sqlite3 "$LOCAL_DB" "PRAGMA wal_checkpoint(TRUNCATE);"

echo "== 2/7  Checkpointing prod's corpus.db (flush WAL) =="
ssh "$REMOTE_HOST" "sqlite3 $REMOTE_PATH 'PRAGMA wal_checkpoint(TRUNCATE);'"

echo "== 3/7  Backing up prod's current corpus.db =="
ssh "$REMOTE_HOST" "sudo cp $REMOTE_PATH $REMOTE_BACKUP && ls -la $REMOTE_BACKUP"

echo "== 4/7  Compressing local copy and uploading =="
gzip -k -f -1 "$LOCAL_DB"
LOCAL_SIZE="$(wc -c < "$LOCAL_DB")"
echo "local corpus.db is $LOCAL_SIZE bytes"
scp "${LOCAL_DB}.gz" "${REMOTE_HOST}:/tmp/corpus.db.gz"
rm -f "${LOCAL_DB}.gz"

echo "== 5/7  Unpacking on prod and verifying size BEFORE touching the live file =="
ssh "$REMOTE_HOST" "gunzip -f /tmp/corpus.db.gz"
REMOTE_NEW_SIZE="$(ssh "$REMOTE_HOST" "wc -c < /tmp/corpus.db")"
echo "prod's uploaded copy is $REMOTE_NEW_SIZE bytes (expecting $LOCAL_SIZE)"
if [ "$REMOTE_NEW_SIZE" != "$LOCAL_SIZE" ]; then
  echo "SIZE MISMATCH — STOPPING. The live corpus.db was NOT touched." >&2
  echo "(the bad upload is sitting harmlessly at /tmp/corpus.db on prod — just re-run this script)" >&2
  exit 1
fi
echo "sizes match."

echo "== 6/7  Swapping the verified copy into place =="
ssh "$REMOTE_HOST" "sudo mv /tmp/corpus.db $REMOTE_PATH && \
  sudo rm -f ${REMOTE_PATH}-wal ${REMOTE_PATH}-shm && \
  sudo chown ubuntu:ubuntu $REMOTE_PATH && \
  ls -la $REMOTE_PATH"

echo "== 7/7  Pruning old prod backups (keeping the $KEEP_BACKUPS most recent) =="
ssh "$REMOTE_HOST" "cd /mnt/paleo-data && ls -t corpus.db.bak-* 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r sudo rm -f -- ; ls -la corpus.db.bak-* 2>/dev/null || echo '(no backups remain)'"

echo
echo "Done. corpus.db is live on prod's disk at $REMOTE_PATH."
echo "Backup of the previous copy: $REMOTE_BACKUP  (only the $KEEP_BACKUPS most recent backups are ever kept)"
echo
echo "NEXT STEPS (not part of this script):"
echo "  1. git push origin main   (if you haven't already — deploy.sh pulls from GitHub)"
echo "  2. ssh $REMOTE_HOST"
echo "  3. cd ~/paleo-studio && ./deploy.sh"
echo "     (watch for: verify-versification 0 NEW, other gates clean, blue/green swap OK)"
