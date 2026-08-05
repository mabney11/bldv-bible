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
for i in $(seq 1 20); do
  if curl -sf http://localhost:3000/health > /dev/null; then
    ok=1
    break
  fi
  sleep 2
done
if [ "$ok" = "1" ]; then
  echo "==> Deploy OK"
else
  echo "==> Health check failed after 40s — run: docker logs paleo --tail 50"
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
