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
BRANCH="$(git branch --show-current)"
STATE=server/.lexicon-watch
STAMP_FILE="$STATE/.last-dirty-hash"
mkdir -p "$STATE"

LOG() { echo "$(date -u '+%F %T') $*"; }

dirty_hash() {
  { git status --porcelain -- server/lexicon; git diff -- server/lexicon; } | sha1sum | cut -d' ' -f1
}

LOG "lexicon-watch starting — polling every ${POLL_INTERVAL}s"
while true; do
  # 2026-09-16: a commit that lands WITHOUT going through this script's own
  # dirty-then-settled path below (fieldy or an agent running `git commit`
  # directly, rather than editing server/lexicon and letting this script
  # commit it) leaves the tree clean but the commit unpushed — and a clean
  # tree used to mean this loop did nothing at all, so it could sit stranded
  # forever with no trigger left to notice it. Found tonight: several real
  # commits (a lexicon fix, the notify.sh wiring, a word-map regen) sat
  # "ahead 5" of origin for ~40 minutes after being committed directly,
  # because nothing ever went dirty-then-settled to wake this loop up.
  # AHEAD is unscoped (not `-- server/lexicon`) to match lexicon-sync.sh's
  # own push step, which pushes the whole branch once triggered, not just
  # lexicon commits — so this check is "is there ANYTHING unpushed", same
  # question lexicon-sync.sh itself is about to answer.
  AHEAD="$(git log "origin/$BRANCH..HEAD" --oneline 2>/dev/null)"
  if [ -z "$(git status --porcelain -- server/lexicon)" ] && [ -n "$AHEAD" ]; then
    LOG "commits already made but not yet pushed — syncing"
    if ./lexicon-sync.sh; then
      if [ -f "$STATE/.failing" ]; then
        rm -f "$STATE/.failing"
        ./notify.sh "lexicon sync: recovered" "$(hostname) is syncing server/lexicon again." default
      fi
    else
      LOG "lexicon-sync.sh failed — will retry next poll"
      if [ ! -f "$STATE/.failing" ]; then
        touch "$STATE/.failing"
        ./notify.sh "lexicon sync: failing" "lexicon-sync.sh is failing on $(hostname) — see lexicon-sync.log." high warning
      fi
    fi
  elif git status --porcelain -- server/lexicon | grep -q .; then
    HASH="$(dirty_hash)"
    PREV="$(cat "$STAMP_FILE" 2>/dev/null || echo '')"
    if [ -n "$PREV" ] && [ "$HASH" = "$PREV" ]; then
      LOG "server/lexicon changed and settled — syncing"
      if ./lexicon-sync.sh; then
        if [ -f "$STATE/.failing" ]; then
          rm -f "$STATE/.failing"
          ./notify.sh "lexicon sync: recovered" "$(hostname) is syncing server/lexicon again." default
        fi
        rm -f "$STAMP_FILE"
      else
        LOG "lexicon-sync.sh failed — will retry next poll"
        if [ ! -f "$STATE/.failing" ]; then
          touch "$STATE/.failing"
          ./notify.sh "lexicon sync: failing" "lexicon-sync.sh is failing on $(hostname) — see lexicon-sync.log." high warning
        fi
      fi
    else
      echo "$HASH" > "$STAMP_FILE"
    fi
  else
    rm -f "$STAMP_FILE" 2>/dev/null
    # PULL what was saved on the site (Root page "set value", admin edits): the box commits
    # those to GitHub, and until 2026-10-14 this machine never took them unless it had an edit of
    # its own to push — "𐤀𐤌_H518" sat on GitHub while local renders still wrote "Am (mother)".
    # Fast-forward only, and only when the remote moved: never a merge; git refuses the ff if a
    # file it would change has local edits, and we log that.
    REMOTE="$(git ls-remote origin "refs/heads/$BRANCH" 2>/dev/null | cut -f1)"
    if [ -n "$REMOTE" ] && [ "$REMOTE" != "$(git rev-parse HEAD)" ] && ! git merge-base --is-ancestor "$REMOTE" HEAD 2>/dev/null; then
      BEFORE="$(git rev-parse HEAD)"
      if git fetch -q origin "$BRANCH" && git merge --ff-only -q "origin/$BRANCH" 2>>"$STATE/pull.err"; then
        LOG "pulled $(git rev-list --count "$BEFORE..HEAD") commit(s) from origin/$BRANCH (edits made on the site)"
      else
        LOG "could not fast-forward to origin/$BRANCH (local edits in the same files?) — see $STATE/pull.err"
      fi
    fi
    # 2026-09-24: .failing used to be cleared ONLY by a later successful
    # lexicon-sync.sh run. If the failure is resolved some other way (fieldy
    # commits + pushes by hand, as after the 14:56 pull-blocked-by-dirty-tree
    # failure), the tree is clean and nothing is ahead, so this loop never
    # calls lexicon-sync.sh again and the widget showed "STUCK" forever.
    # Clean + nothing unpushed = nothing left to sync = not failing.
    if [ -f "$STATE/.failing" ]; then
      rm -f "$STATE/.failing"
      LOG "nothing left to sync (clean, 0 ahead) — clearing stale .failing"
      ./notify.sh "lexicon sync: recovered" "$(hostname): nothing left to sync; cleared the failing flag." default
    fi
  fi
  sleep "$POLL_INTERVAL"
done
