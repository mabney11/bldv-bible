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
# start); nothing happens when both sides already agree. Needs `ssh paleo-lightsail`
# to work from this terminal (PALEO_PROD_HOST / PALEO_PROD_DATA_DIR override).
set -e -o pipefail
cd "$(dirname "$0")"
HOST="${PALEO_PROD_HOST:-paleo-lightsail}"
RDATA="${PALEO_PROD_DATA_DIR:-/mnt/paleo-data}"
RREPO="${PALEO_PROD_REPO:-/home/ubuntu/paleo-studio}"
STATE=server/.studio-sync
LOG() { echo "$(date -u '+%F %T') $*"; }
SSH() { ssh -o BatchMode=yes -o ConnectTimeout=15 "$HOST" "$@"; }
# node inside the image, with the data volume, the script from the box's checkout and a scratch dir
RDOCKER="docker run --rm -v $RDATA:/data -v $RREPO/server/studio-sync.mjs:/app/server/studio-sync.mjs -v /tmp/studio-sync:/tmp/studio-sync -w /app"

mkdir -p "$STATE/base" "$STATE/merged"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/theirs"

# 1. prod's rows
SSH "mkdir -p /tmp/studio-sync/export && $RDOCKER paleo-studio node server/studio-sync.mjs export /tmp/studio-sync/export" | sed "s/^/$(date -u '+%F %T') prod: /"
scp -o BatchMode=yes -q "$HOST:/tmp/studio-sync/export/*.jsonl" "$TMP/theirs/"

# 2 + 3a. merge against the last sync's base, apply here, write the result to merged/
STUDIO_DATA_DIR="$STATE/merged" node server/studio-sync.mjs merge "$STATE/base" "$TMP/theirs" | sed "s/^/$(date -u '+%F %T') local: /"

# 3b. the result up to prod, applied there (files win — this is the merge of both sides, seconds old)
if ! diff -qr "$STATE/merged" "$TMP/theirs" >/dev/null 2>&1; then
  SSH "mkdir -p /tmp/studio-sync/merged"
  scp -o BatchMode=yes -q "$STATE/merged"/*.jsonl "$HOST:/tmp/studio-sync/merged/"
  SSH "$RDOCKER -e STUDIO_DATA_DIR=/tmp/studio-sync/merged paleo-studio node server/studio-sync.mjs restore" 2>&1 | sed "s/^/$(date -u '+%F %T') prod: /"
fi

# 4. next time, this is what both sides agreed on — and the log
cp "$STATE/merged"/*.jsonl "$STATE/base/"
mkdir -p server/studio-data && cp "$STATE/merged"/*.jsonl server/studio-data/
git add server/studio-data
if ! git diff --cached --quiet; then
  git commit -q -m "studio: translations as of $(date -u '+%Y-%m-%d %H:%M UTC')" -- server/studio-data && LOG "logged to git (server/studio-data)"
fi
