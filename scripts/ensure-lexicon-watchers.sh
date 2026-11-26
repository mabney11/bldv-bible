#!/usr/bin/env bash
# ensure-lexicon-watchers.sh — ON THE BOX ONLY: keep lexicon-pull-watch.sh and lexicon-refresh-watch.sh running,
# and running the code that is checked out. Called by lexicon-sync.sh, which cron starts fresh every 5 minutes,
# so a watcher that died, or one started before its code changed (no self-restart in it yet), is replaced
# without anyone logging into the box. (2026-11-26: H8282 "Princess" reached fieldy's machine's reading text in
# under a minute but never reached bldbible.com — the box's long-running pull loop predated the refresh code.)
# Does nothing on fieldy's machine (no data volume there); lexicon-watch.sh starts his refresh watcher.
cd "$(dirname "$0")/.." || exit 0
DATA="${PALEO_PROD_DATA_DIR:-/mnt/paleo-data}"
[ -d "$DATA" ] && command -v docker >/dev/null 2>&1 || exit 0
STATE=server/.lexicon-watch; mkdir -p "$STATE"
LOG() { echo "$(date -u '+%F %T') ensure-lexicon-watchers: $*"; }
hash_of() { sha1sum < "$1" | cut -d' ' -f1; }

# $1 script  $2 pid file  $3 hash file  $4 log
ensure() {
  local script=$1 pf=$2 hf=$3 log=$4 pid=""
  [ -f "$pf" ] && pid="$(cat "$pf")"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    # A watcher that records its code's hash restarts itself when the code changes; one that never wrote a hash is older
    # than that and is replaced here. (The refresh watcher's docker run, if one is going, finishes on its own.)
    [ -f "$hf" ] && return 0
    LOG "$script (pid $pid) predates self-restart — replacing it"
    kill "$pid" 2>/dev/null; sleep 1; rm -f "$pf"
  fi
  nohup "./$script" >> "$HOME/$log" 2>&1 &
  LOG "started $script (pid $!)"
}
ensure lexicon-refresh-watch.sh "$STATE/.refresh-watch.pid" "$STATE/.refresh-watch.hash" lexicon-refresh-watch.log
ensure lexicon-pull-watch.sh    "$STATE/.pull-watch.pid"    "$STATE/.pull-watch.hash"    lexicon-pull-watch.log
exit 0
