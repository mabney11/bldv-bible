#!/usr/bin/env bash
# lexicon-watch.sh — near-real-time LOCAL trigger for lexicon-sync.sh.
#
# lexicon-sync.sh already does the commit/pull/push round trip; on the box
# it's driven by a 5-minute cron (scripts/lightsail-lexicon-sync-setup.sh).
# Locally there was no trigger at all before this — a lexicon edit made in
# this checkout (by hand, or by an agent working in it) just sat uncommitted
# until fieldy remembered to push it himself. fieldy, 2026-09-15: "I really
# just want the lexicon files saved and automatically updated... my computer
# should do it." This is the local half of the same pattern
# studio-sync-watch.sh already established for translation.db: poll a cheap
# signal often, only pay for the real work when something actually changed.
#
# Unlike studio-sync-watch.sh there's no remote box to poll here — the
# signal is this checkout's OWN working tree, so it's plain local `git
# status`/`git diff`, no ssh round trip at all. A one-poll debounce (the
# dirty-state hash has to look IDENTICAL across two consecutive polls before
# it's synced) guards against catching server/lexicon mid-write — an
# editor's autosave, or an agent still appending entries — and shipping a
# JSON file that doesn't parse.
#
# Meant to run forever in the background — see
# scripts/setup-lexicon-watch-task.ps1 for the Windows Scheduled Task that
# starts this at logon and restarts it if it ever dies.
set -o pipefail
cd "$(dirname "$0")"
POLL_INTERVAL="${PALEO_LEXWATCH_INTERVAL:-15}"   # seconds between checks
STATE=server/.lexicon-watch
STAMP_FILE="$STATE/.last-dirty-hash"
mkdir -p "$STATE"

LOG() { echo "$(date -u '+%F %T') $*"; }

dirty_hash() {
  { git status --porcelain -- server/lexicon; git diff -- server/lexicon; } | sha1sum | cut -d' ' -f1
}

LOG "lexicon-watch starting — polling every ${POLL_INTERVAL}s"
while true; do
  if git status --porcelain -- server/lexicon | grep -q .; then
    HASH="$(dirty_hash)"
    PREV="$(cat "$STAMP_FILE" 2>/dev/null || echo '')"
    if [ -n "$PREV" ] && [ "$HASH" = "$PREV" ]; then
      LOG "server/lexicon changed and settled — syncing"
      if ./lexicon-sync.sh; then
        rm -f "$STAMP_FILE"
      else
        LOG "lexicon-sync.sh failed — will retry next poll"
      fi
    else
      echo "$HASH" > "$STAMP_FILE"
    fi
  else
    rm -f "$STAMP_FILE" 2>/dev/null
  fi
  sleep "$POLL_INTERVAL"
done
