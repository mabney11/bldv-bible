#!/bin/sh
# Symlinks the SQLite databases from the persistent Fly Volume ($DATA_DIR,
# default /data) into server/ where server.js expects to find them, then
# execs the real command (node cluster.js).
#
# The databases are never baked into the Docker image (see .dockerignore) —
# they live on the volume so redeploys don't re-upload multiple GB, and so
# admin edits made in production persist across deploys.
set -e

DATA_DIR="${DATA_DIR:-/data}"

DB_FILES="corpus.db translation.db bible.db concordance.db surface-index.db morph-grc.db"

for f in $DB_FILES; do
  src="$DATA_DIR/$f"
  dest="/app/server/$f"
  if [ -f "$src" ]; then
    ln -sf "$src" "$dest"
  else
    echo "WARNING: $src not found on volume — $f will be unavailable until uploaded." >&2
  fi
done

# headings.json (Psalm superscriptions, acrostic stanza letters) is derived from
# corpus.db, which only exists from this point on (it was just symlinked in above —
# the Docker image never has it, see the COPY comments in Dockerfile). The image's
# server/public/ already has a build-time placeholder from `npm run build`; refresh
# it now with the real data. Non-fatal: a failure here must not block the app from
# starting, it just leaves the placeholder in place.
node /app/server/build-headings.mjs || echo "WARNING: build-headings.mjs failed — headings.json not refreshed." >&2

exec "$@"
