# Deploying to AWS Lightsail

This replaces the Fly.io deployment described in `fly.toml`. Same Dockerfile,
same app — different host. Target: the **$12/mo VPS bundle** (2GB RAM, 2 vCPU,
60GB SSD, 3TB transfer), flat price, no surprises.

Unlike Fly, Lightsail doesn't manage TLS, health-check-based restarts, or
volumes for you automatically — this guide sets up the minimum to match what
your Fly config already does (persistent SQLite storage, HTTPS, auto-restart).

## 1. Create the instance

1. AWS Console → Lightsail → **Create instance**
2. Platform: **Linux/Unix**
3. Blueprint: **OS Only → Ubuntu 22.04 LTS** (not an app blueprint — you're
   bringing your own Docker setup)
4. Instance plan: **$12/mo** (2GB RAM, 2 vCPUs, 60GB SSD, 3TB transfer)
5. Choose a region close to your users (Fly's `fly.toml` uses `iad` —
   `us-east-1` is the closest AWS equivalent)
6. Name it (e.g. `paleo-studio`) → **Create instance**
7. On first boot, download or note the SSH key pair Lightsail generates (or
   upload your own public key under Account → SSH keys)

## 2. Networking

1. Instance → **Networking** tab
2. Attach a **static IP** (free as long as it's attached to a running
   instance) — without this your IP changes if you ever stop/start the box
3. Firewall rules: allow **SSH (22)**, **HTTP (80)**, **HTTPS (443)**.
   SSH is open by default; add 80 and 443.

## 3. Add persistent storage for the SQLite databases

Your Fly setup keeps `corpus.db`, `translation.db`, `bible.db`,
`concordance.db`, `surface-index.db`, and `morph-grc.db` on a volume mounted
at `/data`, symlinked into `server/` by `entrypoint.sh` at boot
(`entrypoint.sh` already reads `DATA_DIR`, default `/data` — no code changes
needed).

1. Lightsail → **Storage** → **Create disk**
2. Size: **8GB** (~$0.80/mo — plenty for a Bible-corpus SQLite dataset;
   resize later if needed)
3. Same region/availability zone as the instance → attach it to
   `paleo-studio`
4. SSH into the instance and mount it:

   ```bash
   lsblk                              # find the new disk, e.g. /dev/xvdf
   sudo mkfs -t ext4 /dev/xvdf        # first time only — formats the disk
   sudo mkdir -p /mnt/paleo-data
   sudo mount /dev/xvdf /mnt/paleo-data
   echo '/dev/xvdf /mnt/paleo-data ext4 defaults,nofail 0 2' | sudo tee -a /etc/fstab
   ```

5. Copy your existing `.db` files onto it (from wherever they currently live
   — locally or from a Fly volume export):

   ```bash
   scp -i your-key.pem *.db ubuntu@<static-ip>:/tmp/
   ssh -i your-key.pem ubuntu@<static-ip> 'sudo mv /tmp/*.db /mnt/paleo-data/'
   ```

## 4. Install Docker on the instance

```bash
ssh -i your-key.pem ubuntu@<static-ip>
sudo apt-get update
sudo apt-get install -y docker.io
sudo systemctl enable --now docker
sudo usermod -aG docker $USER    # log out/in after this to use docker without sudo
```

## 5. Get your code onto the box and build

```bash
git clone <your-repo-url> paleo-studio   # or scp the paleo-studio/ folder up
cd paleo-studio
docker build -t paleo-studio .
```

## 6. Set the ADMIN_KEY secret

Fly used `fly secrets set ADMIN_KEY=...`. On Lightsail, pass it as an
environment variable at `docker run` time (or put it in a `.env` file with
`chmod 600` and reference it with `--env-file`):

```bash
echo "ADMIN_KEY=your-long-random-password" > .env
chmod 600 .env
```

## 7. Run the container

```bash
docker run -d \
  --name paleo \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /mnt/paleo-data:/data \
  --env-file .env \
  -e NODE_ENV=production \
  paleo-studio
```

`--restart unless-stopped` replaces Fly's health-check-triggered restarts —
Docker will bring the container back up if it crashes or the instance
reboots.

Verify: `curl http://localhost:3000/health` should return the `{pid, uptime,
rss_mb, heap_mb}` JSON your `production.js` already serves.

## 8. HTTPS (the one thing Fly did for you automatically)

Fly's `force_https = true` and managed certs don't have a Lightsail
equivalent for plain VPS instances. The simplest fix: run **Caddy** as a
reverse proxy in front of your app — it gets and renews Let's Encrypt certs
automatically, no config beyond a domain name.

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```

Edit `/etc/caddy/Caddyfile`:

```
paleo.yourdomain.com {
    reverse_proxy localhost:3000
}
```

```bash
sudo systemctl reload caddy
```

Point your domain's DNS **A record** at the static IP (in your registrar, or
in Lightsail's DNS zone if you move DNS there). Caddy handles the cert the
first time it sees traffic on port 443.

## 9. Redeploying after code changes

No `fly deploy` one-liner here — the equivalent is:

```bash
cd paleo-studio && git pull
docker build -t paleo-studio .
docker stop paleo && docker rm paleo
docker run -d --name paleo --restart unless-stopped -p 3000:3000 \
  -v /mnt/paleo-data:/data --env-file .env -e NODE_ENV=production paleo-studio
```

Worth wrapping in a `deploy.sh` script on the box once you've done it
manually a couple of times.

## Cost recap

| Item | Cost |
|---|---|
| VPS instance (2GB/2vCPU/60GB/3TB) | $12.00/mo |
| Block storage (8GB) | $0.80/mo |
| Static IP | Free while attached |
| **Total** | **~$12.80/mo flat** |

This is genuinely fixed — it won't move with traffic, unlike the Fly bill.
The only thing that costs extra is exceeding 3TB of transfer in a month,
which is very unlikely for this app.
