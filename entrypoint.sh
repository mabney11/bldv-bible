#!/bin/sh
# Symlinks the SQLite databases from wherever they persist across deploys (see
# CLAUDE.md's "Production deployment" section — NOT a Fly Volume; that's stale)
# into server/ where server.js expects to find them, then execs the real
# command (node cluster.js).
#
# The databases are never baked into the Docker image (see .dockerignore) —
# they persist outside it so redeploys don't re-upload multiple GB, and so
# admin edits made in production survive across deploys.
set -e

DATA_DIR="${DATA_DIR:-/data}"

DB_FILES="corpus.db translation.db bible.db concordance.db surface-index.db morph-grc.db"

corpus_available=0
for f in $DB_FILES; do
  src="$DATA_DIR/$f"
  dest="/app/server/$f"
  if [ -f "$src" ]; then
    ln -sf "$src" "$dest"
    [ "$f" = "corpus.db" ] && corpus_available=1
  else
    echo "WARNING: $src not found on volume — $f will be unavailable until uploaded." >&2
  fi
done

# headings.json (Psalm/Habakkuk superscriptions, acrostic stanza letters — e.g. Psalm
# 119's Alap/Bayath headers) is derived from corpus.db, which only exists from this
# point on (just symlinked in above — the Docker image never has it, see .dockerignore).
# There is NO build-time placeholder despite what an earlier version of this comment
# claimed: the frontend-build stage doesn't even have server/ available to run this
# script, so this is the ONLY point headings.json is ever produced.
#
# A failure here that ISN'T simply "corpus.db genuinely hasn't been uploaded yet" is a
# real bug (2026-08-11: a missing server/vendor/books.js did exactly this) and must not
# ship silently — that's how acrostics/superscriptions 404'd in prod with zero visible
# error for who knows how long. So: non-fatal if corpus.db itself isn't available yet
# (first-time setup before upload, same as the DB_FILES loop above), but FATAL — refuse
# to start, fail the deploy's health check, let the blue/green swap keep the old
# container live instead of cutting over to a broken one — if corpus.db IS there and
# the script still fails.
if node /app/server/build-headings.mjs; then
  :
elif [ "$corpus_available" = "1" ]; then
  echo "FATAL: build-headings.mjs failed with corpus.db available — refusing to start. See logs above." >&2
  exit 1
else
  echo "WARNING: build-headings.mjs failed (corpus.db not available yet) — headings.json not refreshed." >&2
fi

exec "$@"
