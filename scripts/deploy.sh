#!/usr/bin/env bash
# Family Hub: publish the latest code from GitHub to this server.
#
#   cd ~/familyhub && ./scripts/deploy.sh
#
# What it does, in order (stops at the first problem):
#   1. Backs up the PocketBase database (Settings → Backups in the admin page)
#   2. Pulls the latest code from GitHub (fast-forward only)
#   3. Installs packages and builds the app
#   4. Copies the app, database migrations and server hooks into /opt/pocketbase
#   5. Restarts PocketBase (which applies any new migrations) and the push worker
#   6. Checks the app answers
# Your data in /opt/pocketbase/pb_data is never overwritten.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PB_DIR="${PB_DIR:-/opt/pocketbase}"
ENV_FILE="$PB_DIR/.env.push"
cd "$APP_DIR"

say() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mStopped: %s\033[0m\n' "$*" >&2; exit 1; }

command -v node >/dev/null || die "Node.js is not installed (README → First-time server setup, step 1)."
[ -x "$PB_DIR/pocketbase" ] || die "PocketBase not found at $PB_DIR/pocketbase."

# PocketBase 0.23+ is required for the migration format this app uses.
PB_VER="$("$PB_DIR/pocketbase" --version | awk '{print $NF}')"
case "$PB_VER" in 0.1*|0.2[0-2]*) die "PocketBase $PB_VER is too old; upgrade to 0.23 or newer (SOP FH-4, Upgrade PocketBase).";; esac

if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
fi

say "1/6 Backing up the database"
if [ -n "${PB_SUPERUSER_EMAIL:-}" ] && [ -n "${PB_SUPERUSER_PASSWORD:-}" ]; then
  NAME="pre-deploy-$(date +%Y%m%d-%H%M%S).zip"
  node --input-type=module -e "
    import PocketBase from '$APP_DIR/push-worker/node_modules/pocketbase/dist/pocketbase.es.mjs';
    const pb = new PocketBase('http://127.0.0.1:8090');
    await pb.collection('_superusers').authWithPassword(process.env.PB_SUPERUSER_EMAIL, process.env.PB_SUPERUSER_PASSWORD);
    await pb.backups.create('$NAME');
    console.log('   saved $PB_DIR/pb_data/backups/$NAME');
  " 2>/dev/null || {
    echo "   API backup failed; copying the data folder instead"
    mkdir -p "$PB_DIR/pb_data/backups"
    tar -czf "$PB_DIR/pb_data/backups/${NAME%.zip}.tgz" -C "$PB_DIR" --exclude=pb_data/backups pb_data
  }
else
  echo "   (no superuser in $ENV_FILE yet; copying the data folder)"
  mkdir -p "$PB_DIR/pb_data/backups"
  tar -czf "$PB_DIR/pb_data/backups/pre-deploy-$(date +%Y%m%d-%H%M%S).tgz" -C "$PB_DIR" --exclude=pb_data/backups pb_data
fi

say "2/6 Getting the latest code"
BEFORE="$(git rev-parse --short HEAD)"
if git symbolic-ref -q HEAD >/dev/null; then
  git pull --ff-only
else
  echo "   On a specific commit (rollback): deploying it as-is, no pull."
fi
AFTER="$(git rev-parse --short HEAD)"
echo "   $BEFORE → $AFTER"

say "3/6 Building the app"
npm ci --no-audit --no-fund --loglevel=error
(cd push-worker && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
VITE_VAPID_PUBLIC_KEY="${VAPID_PUBLIC_KEY:-}" npm run build --silent

say "4/6 Installing into $PB_DIR"
rsync -a --delete dist/ "$PB_DIR/pb_public/"
rsync -a --delete pb_migrations/ "$PB_DIR/pb_migrations/"
rsync -a --delete pb_hooks/ "$PB_DIR/pb_hooks/"

say "5/6 Restarting services (you may be asked for your password)"
sudo systemctl restart pocketbase
if systemctl list-unit-files familyhub-push.service >/dev/null 2>&1 && systemctl is-enabled --quiet familyhub-push 2>/dev/null; then
  sudo systemctl restart familyhub-push
fi

say "6/6 Checking"
for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8090/api/fh/health >/dev/null 2>&1; then
    echo "   PocketBase is up and the app answers."
    systemctl is-active --quiet familyhub-push 2>/dev/null && echo "   Push reminders are running." || echo "   Push reminders are not running yet (README → Push reminders)."
    printf '\n\033[1;32mDeployed %s.\033[0m Phones pick it up next time the app is opened.\n' "$AFTER"
    exit 0
  fi
  sleep 1
done
die "PocketBase didn't come back. Run: journalctl -u pocketbase -n 50"
