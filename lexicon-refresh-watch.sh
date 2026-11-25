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
#   the box: PALEO_REFRESH_CMD set by scripts/setup-lexicon-refresh-watch-box.sh to a
#       `docker run … paleo-studio node refresh-lexicon-glosses.mjs /data/…` against the data volume,
#       with this checkout's server/lexicon mounted (the same mount the live container has).
# Log: ~/lexicon-refresh-watch.log (set by the starter). State: server/.lexicon-watch/ (gitignored).
set -o pipefail
cd "$(dirname "$0")"
POLL_INTERVAL="${PALEO_REFRESH_INTERVAL:-20}"
STATE=server/.lexicon-watch
mkdir -p "$STATE"
SEEN="$STATE/.refresh-seen-hash" DONE="$STATE/.refresh-done-hash" PID_FILE="$STATE/.refresh-watch.pid"
LOG() { echo "$(date -u '+%F %T') $*"; }

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then LOG "already running as pid $(cat "$PID_FILE") — exiting"; exit 0; fi
echo $$ > "$PID_FILE"; trap 'rm -f "$PID_FILE"' EXIT

NICE=""; command -v nice >/dev/null 2>&1 && NICE="nice -n 10"
CMD="${PALEO_REFRESH_CMD:-$NICE node server/refresh-lexicon-glosses.mjs --register}"
FILES="server/lexicon/lexicon.json server/lexicon/homographs.json server/lexicon/hebrew-extra-lexicon.json
       server/lexicon/baseline-gloss-labels.json server/lexicon/name-form-rules.json server/lexicon/compound-hyphenation.json
       server/lexicon/reading-form-rules.json server/lexicon/strongs-location-overrides.json server/lexicon/strongs-renumber.json
       server/name-map-expanded.json"
content_hash() { cat $FILES 2>/dev/null | sha1sum | cut -d' ' -f1; }

LOG "lexicon-refresh-watch starting — every ${POLL_INTERVAL}s; command: $CMD"
RUN_PID=""
while true; do
  H="$(content_hash)"
  if [ -n "$RUN_PID" ] && ! kill -0 "$RUN_PID" 2>/dev/null; then
    if wait "$RUN_PID"; then echo "$RUN_H" > "$DONE"; LOG "refresh finished"; rm -f "$STATE/.refresh-failing"
    else LOG "refresh FAILED — will try again in 10 minutes"
         [ -f "$STATE/.refresh-failing" ] || { touch "$STATE/.refresh-failing"; ./notify.sh "lexicon refresh: failing" "refresh-lexicon-glosses.mjs failed on $(hostname) — see lexicon-refresh-watch.log." high warning 2>/dev/null; }
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
  sleep "$POLL_INTERVAL"
done
