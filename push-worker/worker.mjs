#!/usr/bin/env node
// Family Hub push reminders.
//
// Every minute: find task and event reminders that are due, send each one once
// as a Web Push notification to the right people's phones, and remember it in
// the `reminder_log` collection so it is never sent twice.
//
//   node worker.mjs            run forever (systemd: familyhub-push.service)
//   node worker.mjs --once     one pass, then exit (handy for testing; add --at <local time> to pretend)
//   node worker.mjs --keys     print a new VAPID key pair for /opt/pocketbase/.env.push
//   node worker.mjs --test <email>   send a test notification to that person's phones
//
// Settings come from the environment (EnvironmentFile=/opt/pocketbase/.env.push):
//   PB_URL, PB_SUPERUSER_EMAIL, PB_SUPERUSER_PASSWORD,
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, TZ
import PocketBase from 'pocketbase';
import * as webpush from 'web-push';
import rrulePkg from 'rrule';

const { RRule } = rrulePkg;
const args = process.argv.slice(2);

if (args[0] === '--keys') {
  const k = webpush.generateVAPIDKeys();
  console.log(`VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}`);
  process.exit(0);
}

const env = (k, d) => {
  const v = process.env[k] ?? d;
  if (v === undefined || v === '') {
    console.error(`Missing ${k}. Set it in /opt/pocketbase/.env.push (README → Push reminders).`);
    process.exit(1);
  }
  return v;
};

const PB_URL = env('PB_URL', 'http://127.0.0.1:8090');
const WINDOW_MS = 5 * 60 * 1000; // send reminders up to 5 min late (missed ticks), never older
const DEFAULT_TASK_TIME = '09:00';

// Apple requires a real contact here (mailto: or https:), or it answers 403.
webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));

const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

async function auth() {
  if (pb.authStore.isValid) return;
  await pb.collection('_superusers').authWithPassword(env('PB_SUPERUSER_EMAIL'), env('PB_SUPERUSER_PASSWORD'));
}

// ---------- dates ----------
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromPB = (s) => (s ? new Date(s.replace(' ', 'T')) : null);
const toFloating = (d) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()));
const fromFloating = (f) => new Date(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate(), f.getUTCHours(), f.getUTCMinutes(), f.getUTCSeconds());
const fmtTime = (d) => `${d.getHours() % 12 || 12}:${pad(d.getMinutes())} ${d.getHours() >= 12 ? 'PM' : 'AM'}`;

/** Occurrence starts of an event between from and to (local wall-clock aware). */
function occurrences(ev, from, to) {
  const start = fromPB(ev.start);
  if (!start) return [];
  if (!ev.rrule) return start >= from && start < to ? [start] : [];
  try {
    const rule = new RRule({ ...RRule.parseString(ev.rrule), dtstart: toFloating(start) });
    const skip = new Set(ev.exdates || []);
    return rule.between(toFloating(from), toFloating(to), true).map(fromFloating).filter((d) => !skip.has(ymd(d)));
  } catch {
    return [];
  }
}

// ---------- sending ----------
async function subsFor(householdId, userId) {
  const filter = userId ? pb.filter('user = {:u}', { u: userId }) : pb.filter('household = {:h}', { h: householdId });
  return pb.collection('push_subscriptions').getFullList({ filter });
}

async function send(subs, payload) {
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        console.log(`[push] removing expired subscription ${s.id}`);
        await pb.collection('push_subscriptions').delete(s.id).catch(() => {});
      } else {
        const host = (() => { try { return new URL(s.endpoint).host; } catch { return 'push service'; } })();
        console.warn(`[push] ${host} refused (${e.statusCode || e.message})${e.body ? `: ${String(e.body).slice(0, 200)}` : ''}`);
        if (e.statusCode === 403 && /apple/.test(host)) console.warn('[push] Apple rejects the sender ID when VAPID_SUBJECT is not a real mailto: address or https: site (README → Push reminders).');
      }
    }
  }
  return sent;
}

async function already(key) {
  try {
    await pb.collection('reminder_log').getFirstListItem(pb.filter('key = {:k}', { k: key }));
    return true;
  } catch {
    return false;
  }
}

async function remember(key) {
  await pb.collection('reminder_log').create({ key }).catch(() => {});
}

// ---------- one pass ----------
export async function tick(now = new Date()) {
  await auth();
  const windowStart = new Date(now.getTime() - WINDOW_MS);
  let count = 0;

  // Events: reminder_min before each occurrence
  const events = await pb.collection('events').getFullList({ filter: 'reminder_min >= 0 && all_day = false' });
  for (const ev of events) {
    const lead = (ev.reminder_min || 0) * 60e3;
    // occurrences whose reminder time falls inside the window
    for (const start of occurrences(ev, new Date(windowStart.getTime() + lead), new Date(now.getTime() + lead + 1))) {
      const key = `ev:${ev.id}:${ymd(start)}:${ev.reminder_min}`;
      if (await already(key)) continue;
      const when = ev.reminder_min === 0 ? 'now' : ev.reminder_min >= 1440 ? `tomorrow at ${fmtTime(start)}` : `at ${fmtTime(start)}`;
      const n = await send(await subsFor(ev.household, ev.owner), {
        title: ev.title,
        body: `${when === 'now' ? 'Starting now' : `Starts ${when}`}${ev.location ? ` · ${ev.location}` : ''}`,
        url: `/calendar?d=${ymd(start)}`,
        tag: key,
      });
      await remember(key);
      count += n;
    }
  }

  // Tasks: on the due day at due_time (or 9:00 AM)
  const today = ymd(now);
  const tasks = await pb.collection('tasks').getFullList({ filter: pb.filter('done = false && remind = true && due != "" && due <= {:t}', { t: today }) });
  for (const t of tasks) {
    const [y, m, d] = t.due.split('-').map(Number);
    const [hh, mm] = (t.due_time || DEFAULT_TASK_TIME).split(':').map(Number);
    const at = new Date(y, m - 1, d, hh, mm);
    if (at > now || at < windowStart) continue;
    const key = `task:${t.id}:${t.due}`;
    if (await already(key)) continue;
    const n = await send(await subsFor(t.household, t.assignee), { title: t.title, body: t.notes || 'Due today', url: '/home/tasks', tag: key });
    await remember(key);
    count += n;
  }
  // Food to use up: one note per household at 9:00 AM for anything expiring today or tomorrow
  const [y9, m9, d9] = today.split('-').map(Number);
  const nineAm = new Date(y9, m9 - 1, d9, 9, 0);
  if (nineAm <= now && nineAm >= windowStart) {
    const tomorrow = ymd(new Date(y9, m9 - 1, d9 + 1));
    const expiring = await pb.collection('inventory').getFullList({ filter: pb.filter('qty > 0 && expires_on != "" && expires_on <= {:t}', { t: tomorrow }) });
    const byHouse = new Map();
    for (const i of expiring) {
      if (!byHouse.has(i.household)) byHouse.set(i.household, []);
      byHouse.get(i.household).push(`${i.name} (${i.expires_on < today ? 'expired' : i.expires_on === today ? 'today' : 'tomorrow'})`);
    }
    for (const [household, names] of byHouse) {
      const key = `exp:${household}:${today}`;
      if (await already(key)) continue;
      const n = await send(await subsFor(household, ''), {
        title: names.length === 1 ? 'Use it up' : `Use up ${names.length} things`,
        body: names.slice(0, 5).join(', ') + (names.length > 5 ? '…' : ''),
        url: '/home/inventory?loc=fridge',
        tag: key,
      });
      await remember(key);
      count += n;
    }
  }
  return count;
}

// ---------- entry ----------
if (args[0] === '--test') {
  await auth();
  const email = args[1];
  const user = email ? await pb.collection('users').getFirstListItem(pb.filter('email = {:e}', { e: email })) : null;
  if (!user) {
    console.error('Usage: node worker.mjs --test <email of a family member>');
    process.exit(1);
  }
  const devices = await subsFor(user.household, user.id);
  if (!devices.length) {
    console.log(`No devices for ${email}. Turn on reminders in Settings on their phone first.`);
    process.exit(0);
  }
  const n = await send(devices, { title: 'Family Hub', body: 'Test reminder: notifications work on this phone.', url: '/' });
  console.log(n === devices.length ? `Sent to ${n} device(s).` : `Sent to ${n} of ${devices.length} device(s); see the refusal above.`);
  process.exit(0);
}

if (args[0] === '--once') {
  // --once --at 2026-11-16T09:01  runs the pass as if it were that local time (for testing)
  const at = args.indexOf('--at') > 0 ? new Date(args[args.indexOf('--at') + 1]) : new Date();
  const n = await tick(at);
  console.log(`[push] sent ${n}`);
  process.exit(0);
}

console.log(`[push] Family Hub reminders running against ${PB_URL} (TZ=${process.env.TZ || 'system'})`);
const loop = async () => {
  try {
    const n = await tick();
    if (n) console.log(`[push] sent ${n} notification(s)`);
  } catch (e) {
    console.error('[push] tick failed:', e.message || e);
    pb.authStore.clear();
  }
};
await loop();
setInterval(loop, 60_000);
