#!/bin/bash
# lightsail-lexicon-sync-setup.sh — one-time setup ON THE LIGHTSAIL BOX so the
# lexicon stays one copy in git (see DEPLOY-LIGHTSAIL.md §10):
#   1. a deploy key the box can PUSH with (it has only ever pulled over https)
#   2. the repo's remote switched to ssh so that key is used
#   3. a git identity for the commits lexicon-sync.sh makes
#   4. a first sync run, to prove push access works
#   5. the cron line, every 5 minutes
# Run:  cd ~/paleo-studio && git pull && bash scripts/lightsail-lexicon-sync-setup.sh
# Then redeploy (./deploy-blue-green.sh) so the container mounts server/lexicon
# from this checkout. Safe to rerun; every step skips what is already done.
set -e
REPO="${REPO:-$HOME/paleo-studio}"
KEY="$HOME/.ssh/bldbible_deploy"
GH_REPO="mabney11/bldv-bible"
cd "$REPO"

echo "==> 1. deploy key"
mkdir -p ~/.ssh && chmod 700 ~/.ssh
if [ ! -f "$KEY" ]; then
  ssh-keygen -t ed25519 -C "bldbible lightsail lexicon-sync" -f "$KEY" -N ""
fi
if ! grep -q "IdentityFile $KEY" ~/.ssh/config 2>/dev/null; then
  printf '\nHost github.com\n  IdentityFile %s\n  IdentitiesOnly yes\n' "$KEY" >> ~/.ssh/config
  chmod 600 ~/.ssh/config
fi
ssh-keyscan -t ed25519 github.com 2>/dev/null >> ~/.ssh/known_hosts
echo
echo "    Add this key on GitHub — https://github.com/$GH_REPO/settings/keys → Add deploy key,"
echo "    title 'bldbible lightsail', and TICK 'Allow write access':"
echo
echo "    $(cat "$KEY.pub")"
echo
if ssh -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
  echo "    (GitHub already accepts this key)"
else
  read -r -p "    Press Enter once the key is added on GitHub... " _
  ssh -T git@github.com 2>&1 | grep -q "successfully authenticated" || { echo "    GitHub does not accept the key yet — add it, then rerun this script." >&2; exit 1; }
fi

echo "==> 2. remote over ssh"
git remote set-url origin "git@github.com:$GH_REPO.git"
git remote -v | head -1

echo "==> 3. git identity for the sync commits"
git config user.name  >/dev/null 2>&1 || git config user.name  "bldbible server"
git config user.email >/dev/null 2>&1 || git config user.email "server@bldbible.com"

echo "==> 4. first sync (proves push access)"
chmod +x lexicon-sync.sh
./lexicon-sync.sh
git push --dry-run origin "$(git branch --show-current)" >/dev/null 2>&1 && echo "    push access OK"

echo "==> 5. cron, every 5 minutes"
LINE="*/5 * * * * $REPO/lexicon-sync.sh >> \$HOME/lexicon-sync.log 2>&1"
{ crontab -l 2>/dev/null | grep -v 'lexicon-sync.sh' || true; echo "$LINE"; } | crontab -   # `|| true`: grep finds nothing on a fresh box, and set -e must not stop the line being added
crontab -l | grep lexicon-sync

echo "==> 6. studio sync (translations), every 5 minutes, node inside the image"
chmod +x studio-sync.sh 2>/dev/null || true
SLINE="*/5 * * * * STUDIO_SYNC_DOCKER=1 $REPO/studio-sync.sh >> \$HOME/studio-sync.log 2>&1"
{ crontab -l 2>/dev/null | grep -v 'studio-sync.sh' || true; echo "$SLINE"; } | crontab -
crontab -l | grep studio-sync

echo
echo "Done. Now redeploy so the container mounts server/lexicon from this checkout:"
echo "    ./deploy-blue-green.sh"
echo "Watch the sync with:  tail -f ~/lexicon-sync.log"
