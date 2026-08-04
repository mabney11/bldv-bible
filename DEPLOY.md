# Deploying to Fly.io

One-time setup to get the app live on the public internet as a managed,
low-cost host — no servers to patch or babysit. Fly runs the container,
restarts it if it crashes, and gives you one persistent disk for the
databases.

Current database footprint (checked on the live repo): `concordance.db` is
the big one at ~8 GB; `bible.db` ~1.4 GB; `corpus.db` ~1 GB;
`surface-index.db` ~360 MB; `translation.db` ~37 MB; `morph-grc.db` ~24 MB —
about **10.8 GB total**. The volume below is sized for headroom.

## 1. Install the CLI and log in

```bash
curl -L https://fly.io/install.sh | sh
fly auth login
```

## 2. Create the app

From the repo root (`paleo-studio/`, where `fly.toml` and
`Dockerfile` live):

```bash
fly apps create paleo-studio   # or your own unique name — update fly.toml to match
```

If the name is taken, pick another and edit `app = "..."` at the top of
`fly.toml` to match.

## 3. Create the volume

```bash
fly volumes create paleo_data --region iad --size 20
```

`--size` is in GB. 20 GB gives ~9 GB of headroom over the current 10.8 GB
of data for corpus growth and SQLite WAL files. Must be created in the same
region as `primary_region` in `fly.toml` (`iad` by default — change both if
you want a different region).

## 4. Set the admin password

```bash
fly secrets set ADMIN_KEY='pick a long random password here'
```

This is never committed to the repo or baked into the image — it's injected
at runtime only. Setting a secret triggers a deploy on its own the first
time there's a release to attach it to, but running it before step 5 is
fine either way.

## 5. Deploy

```bash
fly deploy
```

This builds the two-stage Docker image (frontend build → runtime), pushes
it, and starts a machine. The **databases are not in the image** — on this
first boot `entrypoint.sh` will log warnings that they're missing from
`/data`, and the app will be up but empty. That's expected; fix it in the
next step.

## 6. Upload the databases

Bare `.db` files only — never the `-wal`/`-shm` sidecars (stale WAL history
you don't want carried over) or `.bak` files. Run each of these from the
repo's `server/` directory:

```bash
fly ssh sftp shell
```

Inside the sftp shell:

```
put corpus.db /data/corpus.db
put translation.db /data/translation.db
put bible.db /data/bible.db
put concordance.db /data/concordance.db
put surface-index.db /data/surface-index.db
put morph-grc.db /data/morph-grc.db
```

`concordance.db` is ~8 GB, so this step is the slow part — expect it to
take a while depending on your upload bandwidth. You can also run these as
individual non-interactive commands instead of the shell, e.g.:

```bash
fly ssh sftp put corpus.db /data/corpus.db
```

repeated per file, if you'd rather script it or watch progress per-file.

## 7. Restart so the entrypoint picks up the files

```bash
fly apps restart paleo-studio
```

The entrypoint symlinks `/data/*.db` into `server/` on every boot, so this
restart is what makes the just-uploaded files visible to the running app.

## 8. Verify

```bash
fly status                          # machine should be "started"
curl https://paleo-studio.fly.dev/health
```

Then in a browser:

- `https://paleo-studio.fly.dev/` → should redirect to `/landing`
- Open a book/chapter → should read normally
- `/admin-login` → log in with the `ADMIN_KEY` you set in step 4 → confirm
  Translate Studio saves go straight through (no "Local editing" badge)
- Log out, open the same page in a private/incognito window → confirm
  Translate Studio now shows "📍 Local editing" and saves stay local

## Updating your own data later

Editing `corpus.db` / `translation.db` / lexicon files still happens the
same way it always has (your existing scripts), just against the copies on
the Fly Volume instead of your local disk. Two ways to push a changed `.db`
file up:

- **Re-run step 6** for just the file that changed, then `fly apps restart`.
- Or `fly ssh console` into the running machine and edit in place if your
  workflow runs scripts directly against the DB rather than producing a
  whole new file.

## Redeploying after a code change

```bash
fly deploy
```

Since the databases live on the volume (not the image), this only rebuilds
and redeploys the app code — your data is untouched.

## Cost

Rough numbers as of when this was written — check
[fly.io/docs/about/pricing](https://fly.io/docs/about/pricing/) for current
rates, since these change:

- `shared-cpu-1x` / 2 GB machine, running 24/7 (`min_machines_running = 1`
  in `fly.toml`, so it never scales to zero): a few dollars/month of compute.
- 20 GB volume: billed per GB/month.
- Bandwidth: outbound data transfer is metered past a free allowance.

This is a single always-on machine with no built-in high availability —
appropriate for a low-cost single-admin instance, not for a workload that
needs zero-downtime failover.
