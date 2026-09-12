#!/bin/bash
# studio-sync.sh — the Translation Studio's work, one copy in git on both machines
# (DEPLOY-LIGHTSAIL.md §11). The studio's hand-made rows live as text in
# server/studio-data/ (server/studio-sync.mjs exports/merges/applies them); this
# script does the git half:
#   1. remember the last common commit (the merge BASE) and its files
#   2. bring the branch up to date (autostash keeps your uncommitted work safe;
#      a conflict confined to studio-data is resolved by taking upstream's files,
#      since ours are regenerated in the next step)
#   3. three-way merge the database against BASE and upstream, apply to the
#      database, rewrite the files
#   4. commit and push
# Runs the same on fieldy's machine (Git Bash, node on the PATH) and on the box
# (cron with STUDIO_SYNC_DOCKER=1: node runs inside the paleo-studio image with
# the data volume, since the host has no node). Safe to run any time; quiet when
# there is nothing to do.
set -e -o pipefail
cd "$(dirname "$0")"
BRANCH="$(git branch --show-current)"
DIR=server/studio-data
LOG() { echo "$(date -u '+%F %T') $*"; }

if git rev-parse -q --verify MERGE_HEAD >/dev/null || [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ]; then
  LOG "a merge/rebase is in progress in $(pwd) — finish it first" >&2; exit 1
fi

git fetch -q origin "$BRANCH"
BASE="$(git merge-base HEAD "origin/$BRANCH")"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/base" "$TMP/theirs"
for f in translations links headings; do
  git show "$BASE:$DIR/$f.jsonl" > "$TMP/base/$f.jsonl" 2>/dev/null || : > "$TMP/base/$f.jsonl"
  git show "origin/$BRANCH:$DIR/$f.jsonl" > "$TMP/theirs/$f.jsonl" 2>/dev/null || : > "$TMP/theirs/$f.jsonl"
done

# 2. up to date with upstream
if ! git pull --rebase --autostash -q origin "$BRANCH" 2>/dev/null; then
  while [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ]; do
    conflicted="$(git diff --name-only --diff-filter=U)"
    if [ -n "$conflicted" ] && ! printf '%s\n' "$conflicted" | grep -qv "^$DIR/"; then
      git checkout --ours -- "$DIR" && git add "$DIR"            # during a rebase, --ours is upstream's version
      GIT_EDITOR=true git rebase --continue >/dev/null 2>&1 || git rebase --skip >/dev/null 2>&1 || true
    else
      git rebase --abort || true
      LOG "CONFLICT outside $DIR — resolve in $(pwd) (git status), then rerun" >&2; exit 1
    fi
  done
fi

# 3. merge the database with base + upstream (node, or node inside the image on the box)
if [ -n "$STUDIO_SYNC_DOCKER" ]; then
  NODE="docker run --rm -v ${PALEO_DATA_DIR:-/mnt/paleo-data}:/data -v $(pwd)/$DIR:/app/$DIR -v $(pwd)/server/studio-sync.mjs:/app/server/studio-sync.mjs -v $TMP:$TMP -w /app paleo-studio node"
else
  NODE="node"
fi
$NODE server/studio-sync.mjs merge "$TMP/base" "$TMP/theirs" | sed "s/^/$(date -u '+%F %T') /"

# 4. commit and push
git add "$DIR"
if ! git diff --cached --quiet; then
  git commit -q -m "studio: translations from $(hostname), $(date -u '+%Y-%m-%d %H:%M UTC')"
  LOG "committed"
fi
if [ -n "$(git log "origin/$BRANCH..$BRANCH" --oneline)" ]; then
  if git push -q origin "$BRANCH"; then LOG "pushed"; else LOG "push rejected (someone pushed meanwhile) — next run retries"; fi
fi
