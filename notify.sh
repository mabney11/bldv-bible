#!/usr/bin/env bash
# notify.sh — one push notification via ntfy.sh (https://ntfy.sh), the shared
# "stop failing silently" primitive for the whole sync family: lexicon-sync.sh,
# lexicon-watch.sh, lexicon-pull-watch.sh, studio-sync.sh, studio-sync-watch.sh.
#
# fieldy, 2026-09-16: lexicon-sync.sh silently failed the exact same way for
# about a day and a half (server/word-map.json sitting unstaged locally,
# blocking every `git pull --rebase`) with nothing surfacing it until a live
# debugging session found it by hand: "there should be some kind of
# acknowledgement in syncing, i dont like silent failures."
#
# ntfy.sh needs no account or API key — POSTing to a topic URL IS the whole
# API, and subscribing (the ntfy phone app, or just opening
# https://ntfy.sh/<topic> in a browser) is how a notification is received.
# The topic name is the only thing standing in for auth, so — like ADMIN_KEY
# in .env — it is kept OUT of git: read from $PALEO_NTFY_TOPIC if set,
# otherwise from server/.ntfy-topic (gitignored, one line, same value on
# every machine that should receive these). Deliberately a no-op (exit 0,
# NOT a failure) when neither is configured, so a missing topic can't become
# a second, silent failure mode layered on top of the first — but it still
# prints a clear reminder so that stays visible on stderr/in the caller's log.
#
# Usage: ./notify.sh "<title>" "<message>" ["<priority>"] ["<tags>"]
#   priority: min|low|default|high|urgent   (default: "default")
#   tags: comma-separated ntfy emoji-shortcodes, e.g. "warning,x"  (optional)
set -o pipefail
cd "$(dirname "$0")"

TOPIC="${PALEO_NTFY_TOPIC:-}"
if [ -z "$TOPIC" ] && [ -f server/.ntfy-topic ]; then
  TOPIC="$(tr -d ' \t\r\n' < server/.ntfy-topic)"
fi

TITLE="${1:?notify.sh: title required}"
MESSAGE="${2:?notify.sh: message required}"
PRIORITY="${3:-default}"
TAGS="${4:-}"

if [ -z "$TOPIC" ]; then
  echo "$(date -u '+%F %T') notify.sh: no PALEO_NTFY_TOPIC / server/.ntfy-topic configured on $(hostname) — NOT sent: [$TITLE] $MESSAGE" >&2
  exit 0
fi

TAG_ARGS=()
[ -n "$TAGS" ] && TAG_ARGS=(-H "Tags: $TAGS")

if curl -fsS -m 10 \
     -H "Title: $TITLE" \
     -H "Priority: $PRIORITY" \
     "${TAG_ARGS[@]}" \
     -d "$MESSAGE" \
     "https://ntfy.sh/$TOPIC" >/dev/null 2>&1; then
  echo "$(date -u '+%F %T') notify.sh: sent \"$TITLE\""
else
  echo "$(date -u '+%F %T') notify.sh: FAILED to reach ntfy.sh from $(hostname) — [$TITLE] $MESSAGE" >&2
fi
