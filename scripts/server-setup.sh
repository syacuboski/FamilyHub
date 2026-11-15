#!/usr/bin/env bash
# Family Hub: one-time server setup. Run once, after cloning the repo:
#
#   cd ~/familyhub && ./scripts/server-setup.sh
#
# It walks through, pausing to explain each step:
#   1. Checks Node.js, PocketBase and Tailscale Serve
#   2. Creates /opt/pocketbase/.env.push with:
#        - a dedicated PocketBase superuser for the push worker (random password,
#          written straight to the file; you never need to see it)
#        - a fresh VAPID key pair for Web Push
#   3. Installs the familyhub-push systemd service
#   4. Runs the first deploy (backup, build, install, restart)
#   5. Runs the account setup, where each of you types your own password
# Safe to re-run: it keeps an existing .env.push and existing accounts.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PB_DIR="${PB_DIR:-/opt/pocketbase}"
ENV_FILE="$PB_DIR/.env.push"
cd "$APP_DIR"

say() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }
pause() { read -r -p "    Press Enter to continue (Ctrl+C to stop)… " _; }
die() { printf '\n\033[1;31mStopped: %s\033[0m\n' "$*" >&2; exit 1; }

say "Step 1: checking what's installed"
command -v node >/dev/null || die "Node.js is missing. Install it first (README → First-time server setup, step 1)."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 22 ] || die "Node.js $NODE_MAJOR found; version 22 or newer is needed."
echo "    Node.js $(node -v)"
[ -x "$PB_DIR/pocketbase" ] || die "PocketBase not found at $PB_DIR/pocketbase (SOP FH-3)."
echo "    $("$PB_DIR/pocketbase" --version)"
systemctl is-active --quiet pocketbase || die "The pocketbase service isn't running. Try: sudo systemctl start pocketbase"
echo "    pocketbase service: running"
tailscale serve status 2>/dev/null | grep -q 8090 && echo "    Tailscale Serve: publishing port 8090" || echo "    Note: Tailscale Serve isn't publishing 8090. Run: sudo tailscale serve --bg 8090"
command -v rsync >/dev/null || die "rsync is missing. Run: sudo apt install -y rsync"

say "Step 2: push reminder settings in $ENV_FILE"
(cd push-worker && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
if [ -f "$ENV_FILE" ]; then
  echo "    Already exists; keeping it."
else
  echo "    This creates a separate PocketBase admin account just for the reminder"
  echo "    service, with a long random password saved only in $ENV_FILE"
  echo "    (readable by you alone). You won't need to type or remember it."
  pause
  PUSH_EMAIL="push-worker@familyhub.internal"
  PUSH_PASS="$(openssl rand -base64 33 | tr -d '/+=' | cut -c1-40)"
  "$PB_DIR/pocketbase" superuser upsert "$PUSH_EMAIL" "$PUSH_PASS" --dir="$PB_DIR/pb_data" >/dev/null
  KEYS="$(node push-worker/worker.mjs --keys)"
  umask 077
  cat > "$ENV_FILE" <<EOF
# Family Hub push worker settings. Keep private (chmod 600).
PB_URL=http://127.0.0.1:8090
PB_SUPERUSER_EMAIL=$PUSH_EMAIL
PB_SUPERUSER_PASSWORD=$PUSH_PASS
$KEYS
VAPID_SUBJECT=https://familyhub.invalid
EOF
  chmod 600 "$ENV_FILE"
  unset PUSH_PASS KEYS
  echo "    Created $ENV_FILE (permissions 600)."
fi

say "Step 3: installing the familyhub-push service"
sed -e "s#__USER__#$(id -un)#" -e "s#__APP_DIR__#$APP_DIR#" push-worker/familyhub-push.service | sudo tee /etc/systemd/system/familyhub-push.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable familyhub-push >/dev/null 2>&1
echo "    Installed /etc/systemd/system/familyhub-push.service"

say "Step 4: first deploy"
"$APP_DIR/scripts/deploy.sh"

say "Step 5: accounts"
echo "    Next you'll sign in with the PocketBase superuser you made when installing"
echo "    PocketBase (password manager: \"Family Hub PocketBase\"), then create an"
echo "    account for each person. Each person types their own password; it's hidden"
echo "    as you type and isn't saved anywhere except PocketBase (hashed)."
pause
PB_URL=http://127.0.0.1:8090 node scripts/seed.mjs

printf '\n\033[1;32mSetup complete.\033[0m Open https://familyhub.<your-tailnet>.ts.net on each phone and sign in.\n'
