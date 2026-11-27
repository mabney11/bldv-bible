#!/usr/bin/env bash
# lexicon-refresh-watch.sh — the reader corrects itself after a lexicon edit (fieldy, 2026-11-22:
# "i should only have to modify the details and the reader correct itself over time").
#
# Polls the gloss + rule files in server/lexicon (and server/name-map-expanded.json) every
# PALEO_REFRESH_INTERVAL seconds (default 20). When their content changed and has SETTLED (same
# hash two polls running — never mid-write, and a burst of edits makes one run), it runs
# server/refresh-lexicon-glosses.mjs in the background at low priority: the changed words'
# verses are written again from their Hebrew words with his new gloss, the reader's untouched
# rows take the text, saved verses are never touched (see that script's header).
#
# The SAME script runs on both machines; only the command differs:
#   fieldy's machine (default):  node server/refresh-lexicon-glosses.mjs --register
#       (--register: blank keys for every Strong's root with no lexicon entry yet — his worklist;
#        lexicon-watch.sh commits them. Only here: two machines adding keys would collide in git.)
#   the box (data volume + docker present, chosen below; PALEO_REFRESH_CMD still overrides): a
#       `docker run … paleo-studio refresh-lexicon-glosses.mjs /data/…` against the data volume,
#       with this checkout's server/lexicon mounted (the same mount the live container has).
# Log: ~/lexicon-refresh-watch.log (set by the starter). State: server/.lexicon-watch/ (gitignored).
set -o pipefail
cd "$(dirname "$0")"
POLL_INTERVAL="${PALEO_REFRESH_INTERVAL:-2}"   # cheap: a stat per file; content is hashed only when a stat moved
STATE=server/.lexicon-watch
mkdir -p "$STATE"
SEEN="$STATE/.refresh-seen-hash" DONE="$STATE/.refresh-done-hash" PID_FILE="$STATE/.refresh-watch.pid"
LOG() { echo "$(date -u '+%F %T') $*"; }

# A re-exec (below) keeps the same pid, so the pid file holding $$ is this same watcher, not another copy.
if [ -f "$PID_FILE" ] && [ "$(cat "$PID_FILE")" != "$$" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then LOG "already running as pid $(cat "$PID_FILE") — exiting"; exit 0; fi
echo $$ > "$PID_FILE"; trap 'rm -f "$PID_FILE"' EXIT
SELF="$(pwd)/$(basename "$0")"; SELF_HASH="$(sha1sum < "$SELF" | cut -d' ' -f1)"
echo "$SELF_HASH" > "$STATE/.refresh-watch.hash"   # scripts/ensure-lexicon-watchers.sh restarts a watcher whose code is older

NICE=""; command -v nice >/dev/null 2>&1 && NICE="nice -n 10"
# 2026-11-26: the box command lives HERE (was exported by lexicon-pull-watch.sh, so it only reached the box if that loop
# had been restarted by hand after 2026-11-22 — Judges 5:29 kept its 𐤔𐤓𐤄 placeholder on bldbible.com while fieldy's
# machine had "Princess" within a minute). The box = the data volume exists and docker is here.
DATA="${PALEO_PROD_DATA_DIR:-/mnt/paleo-data}"
if [ -z "${PALEO_REFRESH_CMD:-}" ] && [ -d "$DATA" ] && command -v docker >/dev/null 2>&1; then
  # --entrypoint node: skip entrypoint.sh (it rebuilds headings.json from corpus.db and copies the site's assets into the
  # archive on EVERY start — seconds a refresh never needed). WORKDIR is /app/server; the DBs are passed as /data paths.
  PALEO_REFRESH_CMD="$NICE docker run --rm --entrypoint node --cpus=2 --memory=4g -v $DATA:/data \
-v $(pwd)/server/lexicon:/app/server/lexicon -v $(pwd)/server/name-map-expanded.json:/app/server/name-map-expanded.json \
paleo-studio refresh-lexicon-glosses.mjs /data/corpus.db /data/translation.db /data/surface-index.db --state /data/.lexicon-refresh-state.json"
fi
CMD="${PALEO_REFRESH_CMD:-$NICE node server/refresh-lexicon-glosses.mjs --register}"
FILES="server/lexicon/lexicon.json server/lexicon/homographs.json server/lexicon/hebrew-extra-lexicon.json
       server/lexicon/baseline-gloss-labels.json server/lexicon/name-form-rules.json server/lexicon/compound-hyphenation.json
       server/lexicon/reading-form-rules.json server/lexicon/strongs-location-overrides.json server/lexicon/strongs-renumber.json
       server/name-map-expanded.json"
content_hash() { cat $FILES 2>/dev/null | sha1sum | cut -d' ' -f1; }
stat_sig() { stat -c '%n %s %Y' $FILES 2>/dev/null | sha1sum | cut -d' ' -f1; }   # changes when any file is rewritten

LOG "lexicon-refresh-watch starting — every ${POLL_INTERVAL}s; command: $CMD"
RUN_PID=""
SIG=""; H=""
while true; do
  S="$(stat_sig)"; if [ "$S" != "$SIG" ] || [ -z "$H" ]; then SIG="$S"; H="$(content_hash)"; fi
  if [ -n "$RUN_PID" ] && ! kill -0 "$RUN_PID" 2>/dev/null; then
    wait "$RUN_PID"; RC=$?
    if [ "$RC" = 0 ]; then echo "$RUN_H" > "$DONE"; LOG "refresh finished"; rm -f "$STATE/.refresh-failing"
    elif [ "$RC" = 75 ]; then LOG "a lexicon file is not valid JSON yet — trying again"; rm -f "$SEEN"
    else LOG "refresh FAILED — will try again in 10 minutes"
         [ -f "$STATE/.refresh-failing" ] || { touch "$STATE/.refresh-failing"; bash ./notify.sh "lexicon refresh: failing" "refresh-lexicon-glosses.mjs failed on $(hostname) — see lexicon-refresh-watch.log." high warning 2>/dev/null; }
    fi
    RUN_PID=""
  fi
  if [ -z "$RUN_PID" ] && [ "$H" != "$(cat "$DONE" 2>/dev/null)" ]; then
    FAIL_AGE=0; [ -f "$STATE/.refresh-failing" ] && FAIL_AGE=$(( $(date +%s) - $(date -r "$STATE/.refresh-failing" +%s 2>/dev/null || echo 0) ))
    if [ "$H" = "$(cat "$SEEN" 2>/dev/null)" ] && { [ ! -f "$STATE/.refresh-failing" ] || [ "$FAIL_AGE" -ge 600 ]; }; then
      LOG "lexicon changed and settled — refreshing the reading text"
      [ -f "$STATE/.refresh-failing" ] && touch "$STATE/.refresh-failing"
      RUN_H="$H"; bash -c "$CMD" & RUN_PID=$!
    fi
  fi
  echo "$H" > "$SEEN"
  # New code arrived with a git pull: start over as it, but never in the middle of a refresh.
  if [ -z "$RUN_PID" ] && [ "$(sha1sum < "$SELF" 2>/dev/null | cut -d' ' -f1)" != "$SELF_HASH" ]; then
    LOG "lexicon-refresh-watch.sh changed — restarting as the new version"; trap - EXIT; exec bash "$SELF"
  fi
  sleep "$POLL_INTERVAL"
done
