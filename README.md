# Family Hub

A private planner for our household: **calendar, shopping lists, weekly menu, recipes, tasks and home inventory** in one installable phone app. It runs entirely on the home server, is reachable only over Tailscale, and keeps working in a store with no signal.

- **Look:** "Starlight". **Dark** (midnight blue and gold, with a moon) after sunset, **Light** (cream and gold, with a sun) after sunrise, or pick one in Settings.
- **Stack:** React + TypeScript PWA on [PocketBase](https://pocketbase.io) (one binary: database, sign-in, realtime, file storage, backups).
- **Planning docs:** *Family Hub App — Plan* (feature spec and roadmap) and *Family Hub — Mockups* (every screen, night and day). Server operations live in the *Home Server SOP → Family Hub* tab.

## Contents

1. [What it does](#1-what-it-does)
2. [How it fits together](#2-how-it-fits-together)
3. [Local development](#3-local-development)
4. [First-time server setup](#4-first-time-server-setup)
5. [Deploying updates](#5-deploying-updates)
6. [Installing on phones](#6-installing-on-phones)
7. [Accounts](#7-accounts)
8. [Push reminders](#8-push-reminders)
9. [Data model and access rules](#9-data-model-and-access-rules)
10. [Imports (Cozi, Google Calendar)](#10-imports-cozi-google-calendar)
11. [Backups and restore](#11-backups-and-restore)
12. [Testing](#12-testing)
13. [Troubleshooting](#13-troubleshooting)
14. [Roadmap and changelog](#14-roadmap-and-changelog)

---

## 1. What it does

| Module | What you can do | Status |
|---|---|---|
| **Today** | Greeting, today's meals and tonight's dinner, today's events, tasks due, running low and food expiring soon | Phase 2 ✓ |
| **Calendar** | Week and month views with each person's color, filter by person, repeating events (daily, weekdays, weekly, every 2 weeks, monthly, every 3 months, yearly), skip one date of a repeat, reminders, location, notes. Dated tasks and planned dinners show too. | Phase 2 ✓ |
| **Lists** | Several lists (Grocery, Costco, Hardware…), grouped by category, live check-off between phones, "Milk 2 gal" understood, offline. **Shopping trip** mode with big tap targets that learns your store's aisle order; finishing a trip restocks Inventory. | Phase 1 ✓ |
| **Tasks** | One-off and repeating chores, who it's for, due date and time, reminders. Ticking a repeating chore rolls it to its next date (with Undo). | Phase 1 ✓ |
| **Quick add** (✦ button) | Add a list item, task, event or meal from any screen. It opens on what fits the screen you are on (Calendar → event, Tasks → task, Meals → meal, a list → that list). Events understand plain words: "Soccer for Mom Sat 4 to 6pm" fills in the day, 4:00–6:00 PM and Mom. | Phase 1–2 ✓ |
| **Recipes + Meals** | Cookbook, recipe entry with photo, adult/kid portion scaler, meal prep portions, cook mode, prep labels, weekly menu, "add missing ingredients to Grocery". | Phase 3, next |
| **Inventory** | Pantry, fridge, freezer and kids' supplies, low-stock alerts, reconcile counts, diaper bag checklist. | Phase 4 |

**How the modules connect** (the reason this is custom-built):

- Menu → Lists: a recipe on the menu adds the ingredients you don't have to Grocery.
- Lists → Inventory: finishing a shopping trip restocks what you bought.
- Inventory → Lists: running-low items can be added to the list from Today and Inventory.
- Tasks ↔ Calendar: dated tasks show on the calendar.
- Everything shares one **item catalog**, so "milk" in a recipe, on a list and in the fridge is the same thing.

## 2. How it fits together

```
 Phone (installed PWA)                    Home server "familyhub" (Ubuntu)
 ┌───────────────────────────┐   Tailscale  ┌──────────────────────────────────────────┐
 │ React app                 │ ───HTTPS───▶ │ tailscale serve :443 → 127.0.0.1:8090    │
 │  • IndexedDB copy of data │              │ PocketBase  (/opt/pocketbase)            │
 │  • outbox of offline edits│ ◀─realtime── │  • pb_public/     the built app          │
 │  • service worker (offline│              │  • pb_migrations/ database schema        │
 │    shell, push messages)  │              │  • pb_hooks/      small server hooks      │
 └───────────────────────────┘              │  • pb_data/       database + backups     │
            ▲                               │ familyhub-push (Node, systemd)           │
            └────── Web Push ◀──────────────│  • sends task/event reminders            │
                                            └──────────────────────────────────────────┘
```

**Offline-first sync** (`src/lib/sync/`): every screen reads from IndexedDB on the phone, so it opens instantly and works without signal. Changes are saved locally first and queued in an **outbox**, which is sent in order as soon as there's a connection. PocketBase **realtime** pushes the other phone's changes in live. If both of you edit the same thing offline, the last one to sync wins. That's fine for a two-person household.

### Folder map

```
src/
  app/           App shell, routes, bottom nav, service-worker updates
  features/      One folder per screen group: today, calendar, lists, tasks,
                 quickadd, settings, meals, recipes, inventory, auth
  lib/           pb.ts (PocketBase client), sync/ (IndexedDB + outbox + realtime),
                 actions.ts (cross-module actions), dates, recurrence (rrule),
                 parse (Quick add), scale (portions), missing (menu → list), ics
  shared/        Shared UI (Screen, chips, sheet, toasts), icons
  theme/         Design tokens (night/day), global styles, Starlight art, theme clock
  sw.ts          Service worker: offline shell, cached photos, push notifications
pb_migrations/   PocketBase schema (collections + access rules), applied on restart
pb_hooks/        PocketBase server hooks (item names, /api/fh/health)
push-worker/     Reminder service (Node) + its systemd unit
scripts/         deploy.sh, server-setup.sh, seed.mjs, pb-dev.mjs, e2e-pb.mjs, make-icons.mjs
tests/           unit/ (Vitest), integration/ (node:test), e2e/ (Playwright)
```

## 3. Local development

You need **Node.js 22+** and **Git**. Windows, macOS or Linux all work.

1. Install packages:
   ```bash
   npm install
   (cd push-worker && npm install)
   ```
2. Get PocketBase for your computer from the [releases page](https://github.com/pocketbase/pocketbase/releases) (same version as the server is best; 0.23 or newer is required) and unzip `pocketbase` / `pocketbase.exe` into a `.pb/` folder in this repo. `.pb/` is git-ignored.
3. Create the local database, a local admin and sample data:
   ```bash
   ./.pb/pocketbase migrate up --dir=.pb/pb_data --migrationsDir=pb_migrations
   ./.pb/pocketbase superuser upsert admin@familyhub.test dev-admin-pass-123 --dir=.pb/pb_data
   npm run pb                      # leave running: http://127.0.0.1:8090 (admin at /_/)
   FH_SEED_FILE=tests/e2e/seed.dev.json npm run seed -- --sample
   ```
   That makes two test accounts, `dad@familyhub.test` / `dev-dad-pass-123` and `mom@familyhub.test` / `dev-mom-pass-123`, plus sample lists, tasks, events, recipes and inventory. These are local test values only; never use them on the server.
4. In a second terminal:
   ```bash
   npm run dev                     # http://localhost:5173 (proxies /api to PocketBase)
   ```

Useful commands:

| Command | What it does |
|---|---|
| `npm run dev` | App with hot reload |
| `npm run pb` | Local PocketBase with this repo's migrations and hooks |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm run typecheck` | TypeScript only |
| `npm test` | Unit tests (Vitest) |
| `npm run test:api` / `test:push` | Integration tests against the running local PocketBase |
| `npm run e2e` | Playwright end-to-end tests (starts its own throwaway PocketBase) |
| `npm run test:all` | Everything above, in order |
| `npm run icons` | Re-render app icons from `public/icons/icon.svg` |

**Changing the database schema:** never edit a migration that has already run on the server. Add a new file in `pb_migrations/` (`./.pb/pocketbase migrate create <name> --migrationsDir=pb_migrations` makes one), and test it with `npm run pb`. Deploying applies it automatically.

## 4. First-time server setup

PocketBase and Tailscale Serve are already set up (SOP FH-3). These steps add the real app on top. Run them over SSH on the server (`ssh <username>@familyhub`). Each step says what success looks like.

### Step 1: install Node.js, rsync and git

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs rsync git
node -v
```
✓ Prints `v24.x` (anything 22 or newer is fine).

### Step 2: give the server read-only access to the GitHub repo

```bash
ssh-keygen -t ed25519 -C "familyhub server (read-only)" -f ~/.ssh/familyhub_deploy -N ""
cat ~/.ssh/familyhub_deploy.pub
```
Copy the line it prints. On GitHub open the repo → **Settings → Deploy keys → Add deploy key**, paste it, name it "familyhub server", and leave **Allow write access unticked**.

Then tell SSH to use that key for this repo:
```bash
cat >> ~/.ssh/config <<'EOF'
Host github-familyhub
  HostName github.com
  User git
  IdentityFile ~/.ssh/familyhub_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh -T github-familyhub
```
✓ Says *"Hi …! You've successfully authenticated, but GitHub does not provide shell access."* (Type `yes` if asked to trust github.com.)

### Step 3: download the code

```bash
git clone git@github-familyhub:syacuboski/familyhub.git ~/familyhub
```
✓ A `~/familyhub` folder with this README in it.

### Step 4: run the setup script

```bash
cd ~/familyhub && ./scripts/server-setup.sh
```
It pauses before each part and explains it:

1. **Checks** Node, PocketBase (needs 0.23+; upgrade per SOP FH-4 if older), the `pocketbase` service and Tailscale Serve.
2. **Creates `/opt/pocketbase/.env.push`** (permissions 600) with a dedicated PocketBase admin account for the reminder service, whose long random password goes straight into the file so nobody has to type or see it, plus a fresh VAPID key pair for Web Push.
3. **Installs** the `familyhub-push` service.
4. **Deploys** the app (backup → build → install → restart → check).
5. **Accounts:** sign in with the PocketBase superuser from your password manager (*"Family Hub PocketBase"*), name the household, then create one account per person. **Each person types their own password** (hidden, at least 10 characters, typed twice). Passwords are stored only as hashes in PocketBase. Save each one in your password manager.

✓ Ends with *"Setup complete."* Then check:
```bash
systemctl is-active pocketbase familyhub-push && tailscale serve status
```
✓ `active`, `active`, and Serve forwarding to `127.0.0.1:8090`.

> The old tap-through mockup in `pb_public` is replaced by the real app on the first deploy.

## 5. Deploying updates

After new code is pushed to GitHub:

```bash
ssh -t <username>@familyhub 'cd ~/familyhub && ./scripts/deploy.sh'
```

`deploy.sh` (it stops at the first problem):
1. Backs up the database to `/opt/pocketbase/pb_data/backups/pre-deploy-<time>.zip`.
2. `git pull --ff-only`.
3. `npm ci` and `npm run build` (with the VAPID public key from `.env.push`).
4. Copies `dist/` → `pb_public/`, `pb_migrations/` and `pb_hooks/` into `/opt/pocketbase/`.
5. Restarts `pocketbase` (new migrations apply on start) and `familyhub-push`. You may be asked for your password for `sudo`.
6. Checks `/api/fh/health`.

Phones show **"A new version of Family Hub is ready · Reload"** the next time the app is opened.

**Rolling back:** check out the previous version and deploy it, restoring the data backup only if a migration changed data:
```bash
cd ~/familyhub && git log --oneline -5
git checkout <previous-commit> && ./scripts/deploy.sh   # deploys that commit as-is (no pull)
git checkout main                                         # when you're ready to go forward again
```
To restore data: PocketBase admin → Settings → Backups → the `pre-deploy-…` zip → Restore.

## 6. Installing on phones

Tailscale must be installed and **on** for the phone (SOP FH-2).

- **iPhone:** open `https://familyhub.<tailnet>.ts.net` in **Safari** → Share → **Add to Home Screen**. Open it from the new icon, sign in, then Settings (⚙ on Today) → **Turn on reminders** → Allow. Reminders only work from the Home Screen icon (iOS 16.4+).
- **Android:** open the address in **Chrome** → ⋮ → **Add to Home screen** (or *Install app*). Sign in, then Settings → **Turn on reminders**.

The app stays signed in for 30 days between opens. Each open renews that, so in practice you sign in once.

## 7. Accounts

- Accounts are created on the server, not in the app: `cd ~/familyhub && node scripts/seed.mjs`. Re-running is safe. It keeps existing people and lets you add new ones.
- **Reset someone's password:** PocketBase admin (`https://familyhub.<tailnet>.ts.net/_/`) → Collections → users → the person → set a new password. Or re-run `node scripts/seed.mjs` with their email and type a new one.
- **Name and calendar color:** each person changes their own in Settings.
- Kid accounts are planned for Phase 5 (`role: kid` already exists in the data model).

## 8. Push reminders

`push-worker/worker.mjs` runs as the `familyhub-push` service. Every minute it:
- sends **event reminders** at the chosen lead time (15 min, 1 hour, 1 day…) to that person's phones, or everyone's for "Family" events;
- sends **task reminders** on the due day at the task's time (9:00 AM if none) to the assignee, or everyone for "Anyone";
- records each reminder in `reminder_log` so it is never sent twice, and never sends one more than 5 minutes late (no burst of stale reminders after a reboot);
- removes phone subscriptions that have expired.

Settings are in `/opt/pocketbase/.env.push` (created by `server-setup.sh`): `PB_URL`, `PB_SUPERUSER_EMAIL`, `PB_SUPERUSER_PASSWORD`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Times use `TZ=America/New_York` (set in the service file).

Check it and send a test:
```bash
systemctl status familyhub-push
journalctl -u familyhub-push -n 30
cd ~/familyhub/push-worker && set -a && . /opt/pocketbase/.env.push && set +a && node worker.mjs --test <email>
```
✓ *"Sent to 1 device(s)"* and a notification on that phone.

> If you ever regenerate the VAPID keys, run `deploy.sh` (the public key is built into the app) and turn reminders off and on again on each phone.

## 9. Data model and access rules

Everything belongs to a **household**, so adding people later is a new account, not a redesign. Every collection's access rule is *"signed in **and** `household = @request.auth.household`"*: a person can only read or change their own household's records, and can't move a record to another household (`tests/integration/rules.test.mjs` checks this).

| Collection | Key fields | Links to |
|---|---|---|
| `households` | name, timezone | — |
| `users` (auth) | name, email, color, role (admin/adult/kid), prefs | household |
| `items` | name, name_key, default_unit, category | household: the shared catalog |
| `lists` | name, kind (store/errands/wish/other), sort, color, shared | household |
| `list_items` | name, qty, unit, category, checked, checked_by, checked_at, check_order, source | list, item |
| `stores` | name, category_order (learned aisle order) | household |
| `tasks` | title, notes, due (YYYY-MM-DD), due_time, rrule, done, done_at, last_done, remind, source | assignee user |
| `events` | title, start, end, all_day, rrule, exdates, reminder_min, location, notes, external_id | owner user (empty = Family) |
| `recipes` | title, servings, prep/cook min, steps, tags, photo, kid_portion, portion weight, protein/carbs/fat, reheat | household |
| `recipe_ingredients` | name, qty, unit, prep, sort | recipe, item |
| `tags` | name, group, show, sort | household |
| `menu_entries` | date, slot (breakfast/lunch/dinner), text, note, is_prep, adults, kids, prep portions | recipe |
| `inventory` | name, location (pantry/fridge/freezer/kids), qty, unit, low, par, expires_on | item |
| `inv_checks` | location, checked_at | household |
| `bag_items` | name, target_qty, packed, sort | inventory |
| `push_subscriptions` | endpoint, keys | user (only its owner can see it) |
| `reminder_log` | key | superuser only |

Repeats use iCalendar **RRULE** strings (`FREQ=WEEKLY`, …), expanded in local wall-clock time so "9:00 every Tuesday" stays 9:00 across daylight-saving changes. `external_id` on events holds the Google Calendar UID, which keeps re-imports from making duplicates and leaves room for two-way sync later.

## 10. Imports (Cozi, Google Calendar)

In the app: **Settings → Import**.

- **Cozi lists:** in Cozi, open a list → Share/Email list, copy the text, paste it into the box, choose the Family Hub list, Import. Each line becomes an item; "Milk 2 gal" style quantities are understood. Repeat per list.
- **Google Calendar:** on a computer, Google Calendar → Settings → Import & export → **Export**. Unzip and choose the `.ics` file for the calendar you want. Pick *Upcoming + repeating* (recommended) or *Everything*. Events come in as **Family**; open one to set who it belongs to. Importing the same file again skips events already imported.

## 11. Backups and restore

The SOP's nightly backups already cover everything (`pb_data`: database and recipe photos; SOP FH-5). On top of that, every deploy makes a `pre-deploy-<time>` backup first.

**Restore:** PocketBase admin → Settings → Backups → choose a backup → Restore. PocketBase restarts by itself; open the app and check. Phones re-download everything on their next open. Any changes still waiting in a phone's outbox are sent afterwards.

**Reset one phone's copy** (rarely needed): Settings → Sign out of this phone, then sign in again.

## 12. Testing

| Layer | Where | Covers |
|---|---|---|
| Unit (`npm test`) | `tests/unit/` | portion scaler, quarter fractions, calorie math, repeats and DST, chore roll-forward, Quick add parsing, ingredient pasting, missing-ingredient diff, `.ics` import, **sync outbox replay** (offline create/update/delete, duplicate-create recovery, refused changes, realtime echoes) |
| Integration (`npm run test:api`, `test:push`) | `tests/integration/` | household isolation rules; a real encrypted Web Push sent once to a fake push service |
| End-to-end (`npm run e2e`) | `tests/e2e/` | sign-in, Today, **live check-off between two phones**, **offline edits syncing on reconnect**, offline navigation, chore roll-forward with Undo, weekly event + skip one date, Quick add parsing, theme switch |

Integration tests need `npm run pb` running with the sample data (section 3). E2E starts its own PocketBase on :8091 with a fresh database, and Vite on :5174.

## 13. Troubleshooting

| Symptom | Check | Fix |
|---|---|---|
| App won't open on a phone | Tailscale on? | Turn it on; same tailnet account (SOP FH-6) |
| "Can't reach Family Hub" on sign-in | `tailscale serve status`, `systemctl status pocketbase` | `sudo tailscale serve --bg 8090`; `sudo systemctl restart pocketbase` |
| "Offline · N changes waiting" won't clear | Phone has signal and Tailscale? | Open Settings → Sync now. Refused changes show a message there. |
| Other phone's changes don't appear | Pull down / reopen the app | The app re-downloads on open and after reconnects; check `journalctl -u pocketbase` |
| No reminders | Settings → Reminders says "On"? `journalctl -u familyhub-push` | iPhone: must be opened from the Home Screen icon. Send a test (section 8). |
| Reminders "not set up on the server yet" | `.env.push` has `VAPID_PUBLIC_KEY`? | Run `deploy.sh` again (the key is built into the app) |
| Old version still showing | — | Tap **Reload** on the "new version" banner, or close and reopen the app |
| Deploy stopped at "PocketBase is too old" | `/opt/pocketbase/pocketbase --version` | Upgrade PocketBase (SOP FH-4), then deploy again |
| Deploy stopped at `git pull` | `git status` in `~/familyhub` | Someone edited files on the server: `git stash` or `git checkout -- .`, then deploy |
| Migration failed after deploy | `journalctl -u pocketbase -n 50` | Restore the `pre-deploy-…` backup, deploy the previous commit (section 5), then fix the migration |

## 14. Roadmap and changelog

**Roadmap** (from the Plan doc; each phase ends with a "use it for real" gate):

- **Phase 1: Foundation + Lists + Tasks.** ✓ Built. *Gate:* both of you use it instead of Cozi for two weeks.
- **Phase 2: Calendar + Today.** ✓ Built. **Checkpoint A:** add, edit and repeat a few real events on your phones. *Gate:* decide whether Google two-way sync is needed.
- **Phase 3: Recipes + Meals.** Next. **Checkpoint B:** enter one or two real recipes with photos before the menu, scaler and labels are finished.
- **Phase 4: Inventory.** Locations, low stock, reconcile, expiry alerts, diaper bag, shopping → stock.
- **Phase 5: Expand.** Google Calendar sync, kid accounts, native app (Capacitor) if push on iOS proves unreliable or widgets/barcode scanning are wanted.

**Changelog**

| Date | Version | Change |
|---|---|---|
| 2026-11-15 | 0.1.1 | From first test: ✦ button evenly spaced; Quick add opens on the current screen's type; themes renamed Light/Dark with a sun in Light; "+ New event" button on Calendar; events understand time ranges ("4 to 6pm") and names; fixed weekly chores showing a day early. |
| 2026-11-15 | 0.1.0 | Phases 1–2: sign-in, offline sync, Lists + shopping trip, Tasks, Quick add, Calendar + event editor, Today, Settings, Cozi/.ics import, push reminders, deploy and setup scripts. |
