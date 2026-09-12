#!/bin/sh
# lexicon-sync.sh — keep server/lexicon identical in git, on this box and on
# fieldy's machine. The container bind-mounts this checkout's server/lexicon (see
# deploy-blue-green.sh), so /admin/lexicon saves land HERE as uncommitted changes.
# This commits them, pulls whatever was pushed from elsewhere (rebase, so history
# stays linear), and pushes. Safe to run any time; does nothing when clean.
# A real conflict (same file edited both sides between syncs) aborts the rebase,
# keeps the local commit, and says so — resolve by hand, nothing is lost.
set -e
cd "$(dirname "$0")"
BRANCH="$(git branch --show-current)"

git add -A server/lexicon
if ! git diff --cached --quiet; then
  git commit -q -m "lexicon: edits from /admin/lexicon on $(hostname), $(date -u '+%Y-%m-%d %H:%M UTC')"
  echo "$(date -u '+%F %T') committed admin edits"
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
