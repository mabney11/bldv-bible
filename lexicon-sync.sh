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
  echo "$(date -u '+%F %T') CONFLICT: a lexicon file was changed here and elsewhere — resolve in $(pwd) (git status), then rerun" >&2
  exit 1
fi

if [ -n "$(git log "origin/$BRANCH..$BRANCH" --oneline)" ]; then
  git push -q origin "$BRANCH"
  echo "$(date -u '+%F %T') pushed"
fi
