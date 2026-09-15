#!/usr/bin/env bash
# lexicon-pull-watch.sh — near-real-time PULL trigger for lexicon-sync.sh,
# run ON THE LIGHTSAIL BOX (the pull-side counterpart of lexicon-watch.sh,
# which is the push-side trigger on fieldy's own machine).
#
# Before this, the box only ever ran lexicon-sync.sh on a flat 5-minute cron
# (scripts/lightsail-lexicon-sync-setup.sh) — so even once lexicon-watch.sh
# pushed a change within ~15s locally, the box could still sit on the old
# lexicon for up to 5 more minutes before its own cron happened to fire.
# fieldy, 2026-09-15, after that lag showed up as Genesis 1:10 not filling
# on bldbible.com "a little while" after the local push: "lets get prod on
# the same cadence" — same shape of fix as studio-sync-watch.sh: poll a
# cheap signal often, pay for the real round trip only when it moved.
#
# The cheap signal here is `git ls-remote` for the branch's HEAD sha — a
# single ref lookup against GitHub, no objects fetched, safe to call every
# few seconds. Only when that sha changes from what was last seen does this
# call lexicon-sync.sh, which does the actual pull (plus commits/pushes
# anything the admin page changed here first, same as it always has).
#
# The 5-minute cron stays running too, deliberately — same backstop
# philosophy as studio-sync-watch.sh: if this watcher ever dies, lexicon
# still reaches the box within 5 minutes instead of never.
#
# Meant to run forever in the background. Start it once by hand:
#   cd ~/paleo-studio && nohup ./lexicon-pull-watch.sh >> ~/lexicon-pull-watch.log 2>&1 &
# and add the @reboot cron line from DEPLOY-LIGHTSAIL.md §10a so it survives
# a real box reboot too (a container restart alone doesn't need this —
# server/lexicon is bind-mounted from this checkout either way).
set -o pipefail
cd "$(dirname "$0")"
POLL_INTERVAL="${PALEO_LEXPULLWATCH_INTERVAL:-15}"   # seconds between checks
BRANCH="$(git branch --show-current)"
STATE="server/.lexicon-watch"
STAMP_FILE="$STATE/.last-seen-remote-sha"
PID_FILE="$STATE/.pull-watch.pid"
mkdir -p "$STATE"

LOG() { echo "$(date -u '+%F %T') $*"; }

# Single-instance guard: a stray second copy (re-running this script by hand
# on top of the @reboot one, say) would just double up cheap ls-remote
# calls, which is harmless, but there's no reason to let it happen.
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  LOG "already running as pid $(cat "$PID_FILE") — exiting"
  exit 0
fi
echo $$ > "$PID_FILE"
trap 'rm -f "$PID_FILE"' EXIT

LOG "lexicon-pull-watch starting — polling origin/$BRANCH every ${POLL_INTERVAL}s"
while true; do
  REMOTE_SHA="$(git ls-remote origin "refs/heads/$BRANCH" 2>/dev/null | cut -f1)"
  if [ -n "$REMOTE_SHA" ]; then
    PREV="$(cat "$STAMP_FILE" 2>/dev/null || echo '')"
    if [ "$REMOTE_SHA" != "$PREV" ]; then
      LOG "origin/$BRANCH moved ($PREV -> $REMOTE_SHA) — syncing"
      if ./lexicon-sync.sh; then
        echo "$REMOTE_SHA" > "$STAMP_FILE"
      else
        LOG "lexicon-sync.sh failed — will retry next poll (not recording the new sha)"
      fi
    fi
  else
    LOG "ls-remote failed (network blip?) — will retry next poll"
  fi
  sleep "$POLL_INTERVAL"
done
