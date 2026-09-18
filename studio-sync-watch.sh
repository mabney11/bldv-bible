#!/bin/bash
# studio-sync-watch.sh — near-real-time trigger for studio-sync.sh.
#
# studio-sync.sh (the full export/merge/restore round trip) used to run only
# on a 5-minute Windows Scheduled Task, so a verse translated/linked on prod
# could take up to 5 minutes to reach Gloss Studio wherever it's being viewed
# — fieldy, 2026-09-15: "gen 1:6... took a while to update to 100%... I would
# like to make things more consistent/trigger based."
#
# fieldy edits mostly ON PROD, and studio-sync only ever dials OUT from this
# machine to the box (never the reverse), so a true "fire the instant you
# save" trigger would need prod to reach back to this machine (a webhook over
# ngrok) — extra moving parts fieldy explicitly chose not to take on. Instead:
# poll a CHEAP signal often — translation.db's mtime on the box, a plain
# `stat` over the shared ssh connection, no docker run, a few hundred ms —
# and only pay for the expensive full sync (docker run export + scp + merge +
# restore) when that signal actually moved. Effectively syncs within one
# $POLL_INTERVAL of a save instead of up to 5 minutes, without exposing
# anything or touching prod's code at all.
#
# Meant to run forever in the background — see
# scripts/setup-studio-sync-watch-task.ps1 for the Windows Scheduled Task
# that starts this at logon and restarts it if it ever dies. The existing
# 5-minute "bldbible studio sync" task is left in place on purpose as a
# backstop for whenever this watcher isn't running: studio-sync.sh is a safe
# no-op when nothing changed, and now takes its own lock, so the two never
# step on each other.
set -o pipefail
cd "$(dirname "$0")"
HOST="${PALEO_PROD_HOST:-paleo-prod}"
RDATA="${PALEO_PROD_DATA_DIR:-/mnt/paleo-data}"
POLL_INTERVAL="${PALEO_WATCH_INTERVAL:-15}"   # seconds between cheap checks
STATE=server/.studio-sync
STAMP_FILE="$STATE/.last-remote-mtime"
mkdir -p "$STATE"

# ControlMaster (one shared SSH connection reused for every 15s poll) used
# to live here, but on fieldy's Windows/Git-Bash machine it produced
# intermittent "mux_client_request_session: read from master failed" /
# "Failed to connect to new control master" errors even with no other
# process contending for the socket — confirmed 2026-09-18 to be a Windows
# OpenSSH multiplexing reliability problem, not anything about the OVH box.
# Disabled outright: each poll now opens its own fresh connection. A little
# heavier per 15s tick (a full handshake instead of a reused one) but it
# actually works, which a fast unreliable poll does not beat.
SSH_OPTS="-o BatchMode=yes -o ConnectTimeout=10 -o ControlMaster=no"
LOG() { echo "$(date -u '+%F %T') $*"; }

check_mtime() {
    ssh $SSH_OPTS "$HOST" "stat -c %Y '$RDATA/translation.db' 2>/dev/null" 2>/dev/null
}

LOG "studio-sync-watch starting — polling $HOST every ${POLL_INTERVAL}s"
FAILS=0
SYNC_FAILING=0
while true; do
    MTIME="$(check_mtime)"
    if [ -z "$MTIME" ]; then
        FAILS=$((FAILS + 1))
        # Don't spam the log every 15s while the box/network is briefly down —
        # once immediately, then only every ~5 minutes until it recovers.
        if [ "$FAILS" -eq 1 ]; then
            LOG "can't reach $HOST (attempt $FAILS) — will keep retrying"
            ./notify.sh "studio sync: can't reach $HOST" "$(hostname) has lost the connection to $HOST." high warning
        elif [ $((FAILS % 20)) -eq 0 ]; then
            LOG "can't reach $HOST (attempt $FAILS) — will keep retrying"
        fi
        sleep "$POLL_INTERVAL"
        continue
    fi
    if [ "$FAILS" -gt 0 ]; then
        ./notify.sh "studio sync: reconnected" "$HOST is reachable again from $(hostname) after $FAILS failed attempt(s)." default
    fi
    FAILS=0
    LAST="$(cat "$STAMP_FILE" 2>/dev/null || echo '')"
    if [ "$MTIME" != "$LAST" ]; then
        LOG "translation.db changed on prod (${LAST:-none} -> $MTIME) — syncing"
        if ./studio-sync.sh; then
            if [ "$SYNC_FAILING" -eq 1 ]; then
                SYNC_FAILING=0
                ./notify.sh "studio sync: recovered" "studio-sync.sh is succeeding again on $(hostname)." default
            fi
            # Re-stat AFTER the sync: step 3b of studio-sync.sh just wrote to
            # prod's translation.db too (applying the merged result there), so
            # the baseline has to be the POST-sync mtime — using the mtime that
            # triggered us would make us detect our own write as "new" and
            # sync again forever.
            NEW="$(check_mtime)"
            [ -n "$NEW" ] && echo "$NEW" > "$STAMP_FILE"
        else
            LOG "studio-sync.sh failed — will retry next poll without advancing the baseline"
            if [ "$SYNC_FAILING" -eq 0 ]; then
                SYNC_FAILING=1
                ./notify.sh "studio sync: failing" "studio-sync.sh is failing on $(hostname) — see studio-sync.log." high warning
            fi
        fi
    fi
    sleep "$POLL_INTERVAL"
done
