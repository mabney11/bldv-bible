#!/usr/bin/env bash
# rebake.sh — the widget's Rebake action, as one script with step headers so
# its log reads cleanly in the widget's log panel (fieldy, 2026-09-24).
#
#   1. node build-surface-index.js           rebuild surface-index.db from the
#                                            CURRENT local corpus.db + parser
#   2. corpus.db -> prod, ONLY if local is newer than prod's copy (it changes
#      when tokens_bhs is re-ingested — e.g. ingest-bhs-oshb.py — and the
#      surface index is only right against the corpus it was baked from).
#      ~1.4 GB, so it is skipped whenever prod already has it.
#   3. surface-index.db -> prod              (sync-corpus-to-prod.sh: WAL
#      checkpoint, prod backup, exact-size verify, atomic swap)
#   4. deploy-blue-green.sh on prod          zero-downtime swap so the running
#      containers pick up the new files
#
# Any failing step stops the rest (set -e). Run from the repo root.
set -euo pipefail
HOST="${PALEO_PROD_HOST:-paleo-prod}"
RREPO="${PALEO_PROD_REPO:-/root/paleo-studio}"
DATA="${PALEO_PROD_DATA_DIR:-/mnt/paleo-data}"
SSH="ssh -o BatchMode=yes -o ConnectTimeout=15 -o ControlMaster=no"
cd "$(dirname "${BASH_SOURCE[0]}")/.."
step() { echo; echo "=== [$(date '+%H:%M:%S')] $* ==="; }

step "1/4  Rebuilding surface-index.db locally"
(cd server && node build-surface-index.js)

step "2/4  corpus.db: comparing local vs prod"
LOCAL_M=$(stat -c %Y server/corpus.db)
PROD_M=$($SSH "$HOST" "stat -c %Y $DATA/corpus.db" 2>/dev/null || echo 0)
echo "local corpus.db mtime $(date -d @"$LOCAL_M" '+%F %T')  |  prod $( [ "$PROD_M" -gt 0 ] && date -d @"$PROD_M" '+%F %T' || echo unknown)"
if [ "$LOCAL_M" -gt "$PROD_M" ]; then
  echo "local is newer -> pushing corpus.db (large; this is the slow step)"
  DB=corpus.db bash scripts/sync-corpus-to-prod.sh widget-rebake
else
  echo "prod already has this corpus.db -> skipped"
fi

step "3/4  Pushing surface-index.db to prod"
DB=surface-index.db bash scripts/sync-corpus-to-prod.sh widget-rebake

step "4/4  Blue/green deploy on prod (containers pick up the new files)"
$SSH "$HOST" "sudo -n bash -c 'cd $RREPO && ./deploy-blue-green.sh'"

step "Rebake complete"
