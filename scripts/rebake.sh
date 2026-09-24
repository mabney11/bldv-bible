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
# Everything lives in main() and is only CALLED on the last line, so bash
# parses the whole file before running any of it. Without this, editing this
# file while a Rebake is running (e.g. a git pull mid-run) makes bash resume
# at a stale byte offset -- "syntax error near unexpected token" (2026-09-24).
main() {
  cd "$(dirname "${BASH_SOURCE[0]}")/.."
  step() { echo; echo "=== [$(date '+%H:%M:%S')] $* ==="; }

  step "1/4  surface-index.db: is the local bake current?"
  # Fresh = newer than both what it is baked FROM (corpus.db) and the parser
  # that bakes it (build-surface-index.js) -- same rule as the widget's Bake line.
  # Then there is nothing to rebuild; push the file as-is.
  SI_M=$(stat -c %Y server/surface-index.db 2>/dev/null || echo 0)
  CO_M=$(stat -c %Y server/corpus.db)
  BS_M=$(stat -c %Y server/build-surface-index.js)
  # Divine titles (gold chips + Divine Titles tab) are baked into the same file;
  # a newer title list / matcher only needs that quick re-bake, not the full one.
  DT_M=$(stat -c %Y server/lexicon/divine-titles.json server/divine-titles.js server/build-divine-titles.js 2>/dev/null | sort -n | tail -1)
  if [ "$SI_M" -gt "$CO_M" ] && [ "$SI_M" -gt "$BS_M" ]; then
    if [ "${DT_M:-0}" -gt "$SI_M" ]; then
      echo "local surface-index.db is current, divine titles are not -> re-baking just those"
      if ! (cd server && node build-divine-titles.js); then
        echo "!! Divine-titles bake failed (stop the local server if the error is EBUSY/locked)."
        exit 1
      fi
    else
      echo "local surface-index.db is current -> no rebuild needed"
    fi
  else
    echo "local surface-index.db is stale -> rebuilding"
    if ! (cd server && node build-surface-index.js); then
      echo
      echo "!! Rebuild failed. If the error mentions EBUSY / EPERM / 'database is locked',"
      echo "!! the local server has surface-index.db open (Windows will not replace an open"
      echo "!! file). Stop the local server (Ctrl+C in its window), click Rebake again, then"
      echo "!! restart the server."
      exit 1
    fi
  fi

  # DATA-LOSS GATE (2026-09-24): never push a corpus.db that has lost a canonical
  # book's English — that is how the whole NT went blank on prod. Every canon 1-66
  # must have ENG verses.
  if ! (cd server && node -e "
const db = new (require('better-sqlite3'))('corpus.db', { readonly: true });
const have = new Set(db.prepare(\"SELECT DISTINCT canon_id FROM verses WHERE corpus='ENG' AND canon_id BETWEEN 1 AND 66\").all().map(r => r.canon_id));
const miss = []; for (let c = 1; c <= 66; c++) if (!have.has(c)) miss.push(c);
if (miss.length) { console.error('!! corpus.db has NO English for canon ' + miss.join(',') + ' -- refusing to push it'); process.exit(1); }
console.log('corpus.db English present for all 66 canonical books');
"); then
    echo "!! Fix corpus.db first (server/restore-eng-from-backup.js), then Rebake again."
    exit 1
  fi

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
}
main "$@"
