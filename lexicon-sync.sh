#!/bin/sh
# lexicon-sync.sh — keep server/lexicon identical in git, on this box and on
# fieldy's machine. The container bind-mounts this checkout's server/lexicon (see
# deploy-blue-green.sh), so /admin/lexicon saves land HERE as uncommitted changes.
# This commits them, pulls whatever was pushed from elsewhere (rebase, so history
# stays linear), and pushes. Safe to run any time; does nothing when clean.
# A real conflict (same file edited both sides between syncs) aborts the rebase,
# keeps the local commit, and says so — resolve by hand, nothing is lost.
#
# Commit messages come from scripts/lexicon-diff-summary.mjs — a real JSON-
# value diff (added/removed/changed key names), not a generic "edits from
# <host>, <date>" line. fieldy, 2026-09-15: "systematic commit messages
# (what was added/removed)". Falls back to the old generic message if node
# isn't on PATH or the summary script produces nothing — this script has to
# stay safe to run unattended (cron on the box, lexicon-watch.sh locally)
# either way.
set -e
cd "$(dirname "$0")"
BRANCH="$(git branch --show-current)"

# Single-instance lock: this script is triggered from TWO independent places
# on the box (the 5-minute cron backstop and lexicon-pull-watch.sh's poll)
# plus lexicon-watch.sh locally — two invocations CAN legitimately land at
# the same moment right after a push, and two `git pull --rebase` calls
# racing to update the same refs/remotes/origin/* ref step on each other
# ("error: cannot lock ref ..."). studio-sync.sh already solved this exact
# problem for itself; ported here 2026-09-16 after it happened for real (a
# restarted lexicon-watch.sh and the box's cron backstop fired in the same
# window). Age-based (not pid-based) so it behaves the same on Windows/
# Git-Bash and on the box — see studio-sync.sh's own lock for the original.
STATE=server/.lexicon-watch
mkdir -p "$STATE"
LOCKDIR="$STATE/.sync-lock"
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  LOCK_MTIME="$(stat -c %Y "$LOCKDIR" 2>/dev/null || true)"
  NOW="$(date +%s)"
  if [ -n "$LOCK_MTIME" ] && [ $((NOW - LOCK_MTIME)) -gt 600 ]; then
    echo "$(date -u '+%F %T') lock is stale (>10min old — a previous run likely crashed) — clearing and taking it"
    rm -rf "$LOCKDIR"
    mkdir "$LOCKDIR" 2>/dev/null || { echo "$(date -u '+%F %T') lost the race for the lock — exiting"; exit 0; }
  else
    echo "$(date -u '+%F %T') another lexicon-sync.sh is already running — exiting"
    exit 0
  fi
fi
trap 'rm -rf "$LOCKDIR"' EXIT

git add -A server/lexicon
if ! git diff --cached --quiet; then
  CHANGED_FILES="$(git diff --cached --name-only -- server/lexicon)"
  SUMMARY=""
  if command -v node >/dev/null 2>&1 && [ -f scripts/lexicon-diff-summary.mjs ]; then
    SUMMARY="$(node scripts/lexicon-diff-summary.mjs $CHANGED_FILES 2>/dev/null || true)"
  fi
  SUBJECT_FRAGMENT="$(printf '%s\n' "$SUMMARY" | sed -n '1p')"
  if [ -n "$SUBJECT_FRAGMENT" ]; then
    BODY="$(printf '%s\n' "$SUMMARY" | tail -n +3)"
    git commit -q -m "lexicon: $SUBJECT_FRAGMENT" -m "$BODY" -m "$(hostname), $(date -u '+%Y-%m-%d %H:%M UTC')"
  else
    git commit -q -m "lexicon: edits from $(hostname), $(date -u '+%Y-%m-%d %H:%M UTC')"
  fi
  echo "$(date -u '+%F %T') committed: $(git log -1 --format=%s)"
fi

if ! git pull --rebase -q origin "$BRANCH"; then
  git rebase --abort 2>/dev/null || true
  MSG="a lexicon file was changed here and elsewhere — resolve in $(pwd) (git status) on $(hostname), then rerun"
  echo "$(date -u '+%F %T') CONFLICT: $MSG" >&2
  ./notify.sh "lexicon-sync: stuck" "$MSG" high warning
  exit 1
fi

if [ -n "$(git log "origin/$BRANCH..$BRANCH" --oneline)" ]; then
  if ! git push -q origin "$BRANCH"; then
    echo "$(date -u '+%F %T') PUSH FAILED" >&2
    ./notify.sh "lexicon-sync: push failed" "git push to origin/$BRANCH failed on $(hostname) — local lexicon commits aren't reaching the other side." high warning
    exit 1
  fi
  echo "$(date -u '+%F %T') pushed"
fi
