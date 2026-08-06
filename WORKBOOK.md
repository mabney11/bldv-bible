# bldbible.com — Update Workbook

Your live site: **https://bldbible.com** — running on a Lightsail VPS
(`3.18.117.171`), Docker container `paleo`, built from
`~/paleo-studio` on the server (cloned from
`github.com/mabney11/bldv-bible`).

There are **three different kinds of updates**, and they don't all work the
same way. Mixing them up is the easiest way to lose work, so read the
"mental model" section once before diving in.

## The mental model

| What you're changing | Where it lives | How to update it |
|---|---|---|
| Pages, UI, routes, server code | Git repo, baked into the Docker image | **Code deploy** (§2) |
| Lexicon JSON (`lexicon.json`, `homographs.json`, overrides) | Git repo, baked into the Docker image | **Code deploy** (§2) |
| Bible/corpus/concordance `.db` files | `/mnt/paleo-data` on the server (not in git) | **Database update** (§3) |
| Book order / canon promotions / glyphs made via the `/admin` panel in your browser | Inside the *running container's* filesystem — **not** in git, **not** on the volume | Ephemeral — must be **synced back to git** before your next code deploy, or it's lost (§4) |

The single most important gotcha: anything you change through the `/admin`
web panel disappears the next time you rebuild the Docker image, unless you
copy the updated file out of the container and commit it. §4 covers exactly
how.

## 0. Connecting to the server

```powershell
ssh -i C:\Users\fieldy\.ssh\lightsail-paleo.pem ubuntu@3.18.117.171
```

Or, if you set up the SSH config alias earlier:

```powershell
ssh paleo-lightsail
```

## 1. One-time setup: a `deploy.sh` script on the server

Do this once. SSH in, then:

```bash
cat > ~/deploy.sh << 'EOF'
#!/bin/bash
set -e
cd ~/paleo-studio
echo "==> Pulling latest code..."
git pull
echo "==> Building image..."
docker build -t paleo-studio .
echo "==> Restarting container..."
docker stop paleo || true
docker rm paleo || true
docker run -d \
  --name paleo \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /mnt/paleo-data:/data \
  --env-file .env \
  -e NODE_ENV=production \
  paleo-studio
echo "==> Waiting for app to boot..."
ok=0
for i in $(seq 1 60); do
  if curl -sf http://localhost:3000/health > /dev/null; then
    ok=1
    break
  fi
  sleep 2
done
if [ "$ok" = "1" ]; then
  echo "==> Deploy OK"
else
  echo "==> Health check failed after 2m — run: docker logs paleo --tail 50"
fi
EOF
chmod +x ~/deploy.sh
```

From now on, deploying code changes is just `~/deploy.sh`.

## 2. Updating pages / adding new pages / any code change

This covers: editing existing React pages, adding new routes/pages, changing
server logic, editing lexicon JSON files (`lexicon.json`, `homographs.json`,
`surface-strongs-overrides.json`, `book-order.json`, etc.) — anything that's
a file in the git repo.

**On your machine:**

```powershell
cd C:\Users\fieldy\dev\projects\the-scriptures-app\paleo-studio
# ...make your edits...
git add .
git commit -m "describe what changed"
git push
```

**On the server:**

```bash
~/deploy.sh
```

That pulls the new code, rebuilds the image, and swaps the running
container. Takes 1-3 minutes depending on what changed (frontend-only
changes are faster since the `better-sqlite3` native build layer is cached).

**Verify:**

```bash
curl -I https://bldbible.com
docker logs paleo --tail 30
```

Or just reload the site in your browser.

### Adding a brand-new page, specifically

1. Add the React component/route under `src/` (check `Root.jsx` for how
   routes are wired — it uses `react-router-dom`)
2. If the page needs new data, add the corresponding Express route in
   `server/server.js`
3. `npm run build` locally first if you want to preview it (writes to
   `server/public/`, gitignored, safe to build and discard)
4. Commit, push, `~/deploy.sh` — same as any code change

## 3. Updating the Bible/lexicon databases (`.db` files)

This is for changes to the actual data in `corpus.db`, `translation.db`,
`bible.db`, `concordance.db`, `surface-index.db`, `morph-grc.db` — e.g. you
regenerated one locally with a build script.

**From your machine, copy the new file up:**

```powershell
scp -i C:\Users\fieldy\.ssh\lightsail-paleo.pem path\to\updated\corpus.db ubuntu@3.18.117.171:/tmp/
```

**On the server, replace it and restart the container** (the container
holds an open file handle to the old version, so a restart is required —
just overwriting the file on disk isn't enough for the running app to see
it):

```bash
sudo mv /tmp/corpus.db /mnt/paleo-data/corpus.db
sudo chown ubuntu:ubuntu /mnt/paleo-data/corpus.db
docker restart paleo
```

Check the logs afterward to confirm it loaded cleanly:

```bash
docker logs paleo --tail 30
```

## 4. Using the `/admin` panel — and syncing it back to git

Go to `https://bldbible.com/admin`, log in with your `ADMIN_KEY`. From
there you can do things like promote/demote works into the canon, reorder
books, and save baked glyphs. These writes happen **live**, directly to
files inside the running container (`book-order.json` and similar) — no
redeploy needed to see them.

**The catch:** those files are not on the `/data` volume and not in git.
The next time you run `~/deploy.sh`, the container gets rebuilt from a
fresh image and your admin-panel changes are gone.

**So, after any session in the `/admin` panel, before you next deploy code,
pull the updated file(s) out of the container and commit them:**

```bash
docker cp paleo:/app/server/book-order.json ~/paleo-studio/server/book-order.json
cd ~/paleo-studio
git add server/book-order.json
git commit -m "Sync book order from admin panel"
git push
```

Swap the filename for whatever you actually changed (check `server.js`
around the `/api/admin/*` routes if you're unsure which file a given admin
action writes to). Do this **before** running `~/deploy.sh` again, or the
edit is lost.

## 5. Quick reference

| Task | Command |
|---|---|
| SSH in | `ssh paleo-lightsail` |
| Deploy latest code | `~/deploy.sh` |
| View live logs | `docker logs paleo -f` |
| Restart without rebuilding | `docker restart paleo` |
| Check health | `curl http://localhost:3000/health` |
| Check disk space on data volume | `df -h /mnt/paleo-data` |
| List current containers | `docker ps` |

## 6. If something breaks

1. `docker logs paleo --tail 100` — almost always tells you what happened
2. `curl http://localhost:3000/health` — is the app even up?
3. If a deploy went bad and you need to roll back code: on your machine,
   `git log` to find the last good commit, `git revert` or `git reset
   --hard <sha>` then `git push --force` (careful with force-push), then
   `~/deploy.sh` on the server again
4. The site being unreachable but the container running usually means
   Caddy, not the app — check `sudo systemctl status caddy` and `sudo
   journalctl -u caddy --no-pager -n 50`

## 7. Custom "site is down" page

`error-pages/down.html` in the repo is a small styled page (matches the
app's dark theme + logo mark) that Caddy shows instead of a raw browser
error whenever it can't reach the app container — e.g. mid-deploy, or if
`docker` crashes. It auto-retries every 20s and has a manual "Try again"
button.

**One-time setup on the server**, so Caddy can serve it even when the app
itself is completely down (it has to be a plain file on disk, not
something the app serves, since the app being down is exactly the case
this covers):

```bash
sudo mkdir -p /var/www/error-pages
sudo cp ~/paleo-studio/error-pages/down.html /var/www/error-pages/down.html
sudo chown -R caddy:caddy /var/www/error-pages
```

Then edit `/etc/caddy/Caddyfile` — add a `handle_errors` block inside your
existing `bldbible.com { ... }` site block, alongside the `reverse_proxy`:

```
bldbible.com {
    reverse_proxy localhost:3000

    handle_errors {
        @failed expression `{err.status_code} >= 500`
        rewrite @failed /down.html
        root * /var/www/error-pages
        file_server
    }
}
```

Reload Caddy to pick it up:

```bash
sudo systemctl reload caddy
```

**Keeping it in sync:** if you ever edit `error-pages/down.html` in the
repo, it won't update on the server automatically (it's outside the
Docker image on purpose). Re-run the two lines above (`cp` + `chown`)
after a `git pull` to push the new version live — no Caddy reload needed
for a file-only change.

**Test it** by temporarily stopping the container: `docker stop paleo`,
reload the site in your browser, then `docker start paleo` when you're
done.

## 8. Lexicon hot-fixes — no redeploy needed

Good news: the server already has live-reload built in for every lexicon
file. You do **not** need `~/deploy.sh` (git pull + rebuild + swap
container) just to fix a gloss or a Strong's-number typo. There are two
tiers, depending on which file:

**Tier A — instant, no action needed at all.** `greek-lexicon.json`,
`geez-lexicon.json`, `latin-lexicon.json`, `syriac-lexicon.json`,
`coptic-lexicon.json`, `hebrew-extra-lexicon.json` (the per-language
curated gloss files) are re-read from disk automatically the next time
anyone requests a word in that language — the server checks the file's
timestamp on every lookup, no caching lag, no trigger required.

**Tier B — auto-reloads within ~1 second of the file changing.**
`lexicon.json`, `homographs.json`, `surface-strongs-overrides.json` (the
files that drive root/surface search indexing) are watched by a file
watcher in the running server. Any write to one of them rebuilds the
search indexes automatically, debounced 300ms. You can also force it
immediately (skip the debounce, or confirm a watch-triggered rebuild
actually fired) by hitting:

```bash
curl -X POST http://localhost:3000/admin/rebuild-indexes
curl http://localhost:3000/admin/index-status   # check it landed
```

**So the fast hot-fix workflow is:**

```powershell
# on your machine — edit the file locally first so it's the same edit
# that eventually goes to git
scp -i C:\Users\fieldy\.ssh\lightsail-paleo.pem `
    path\to\lexicon\lexicon.json ubuntu@3.18.117.171:/tmp/lexicon.json
```

```bash
# on the server — copy it INTO the running container (no restart)
docker cp /tmp/lexicon.json paleo:/app/server/lexicon/lexicon.json
curl -X POST http://localhost:3000/admin/rebuild-indexes   # Tier B files only
```

Reload the site — the fix is live, no rebuild, no downtime.

**The catch (same one as §4):** `docker cp` writes into the *running
container's* filesystem, which is not on the persistent volume and not in
git. The next `~/deploy.sh` rebuilds the image from git and silently
reverts your hot-fix. So immediately after confirming the fix looks right
in production, commit the same file change on your machine and push:

```powershell
cd C:\Users\fieldy\dev\projects\the-scriptures-app\paleo-studio
git add server/lexicon/lexicon.json
git commit -m "Fix <whatever> in lexicon.json"
git push
```

You don't have to `~/deploy.sh` right away since the hot-fix already made
it live — just don't let the repo drift for long, and always push before
your *next* real deploy or the fix gets rolled back.
