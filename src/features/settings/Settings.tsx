// Settings: your profile, theme, notifications, sync, imports, sign out.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { pb, currentUser, signOut } from '../../lib/pb';
import { sync, stopSync, useSyncStatus } from '../../lib/sync';
import { resetLocal } from '../../lib/sync/db';
import { disablePush, enablePush, pushState, type PushState } from '../../lib/push';
import { getSunLocation, setMode, setSunLocation, useTheme, type ThemeMode } from '../../theme/theme';
import { BackLink, ChipGroup, Screen, useMembers, useToast } from '../../shared/ui';

const COLORS = ['#D9B36C', '#9C8BD6', '#7FC4C9', '#E9A27C', '#F2B5A4', '#8FB98A'];

export function Settings() {
  const me = currentUser();
  const members = useMembers();
  const { mode } = useTheme();
  const status = useSyncStatus();
  const toast = useToast();
  const [push, setPush] = useState<PushState>('off');
  const [name, setName] = useState(me?.name || '');
  const [color, setColor] = useState(me?.color || COLORS[0]);
  const [sun, setSun] = useState(getSunLocation());

  useEffect(() => {
    void pushState().then(setPush);
  }, []);

  async function saveProfile(patch: { name?: string; color?: string }) {
    if (!me) return;
    try {
      await pb.collection('users').update(me.id, patch);
      await sync.pull('users');
      toast({ text: 'Saved' });
    } catch {
      toast({ text: "Couldn't save. You need to be online to change your profile." });
    }
  }

  function shareLocation() {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        // rounded to ~10 km: enough for sunrise/sunset, and kept only on this phone
        const loc = { lat: Math.round(p.coords.latitude * 10) / 10, lng: Math.round(p.coords.longitude * 10) / 10 };
        setSunLocation(loc);
        setSun(loc);
      },
      () => toast({ text: 'Location not allowed. Auto will switch at 7 AM and 7 PM.' }),
    );
  }

  async function togglePush() {
    try {
      setPush(push === 'on' ? await disablePush() : await enablePush());
    } catch (e) {
      toast({ text: `Couldn't change notifications: ${(e as Error).message}` });
    }
  }

  async function out() {
    await stopSync();
    try { await disablePush(); } catch { /* ignore */ }
    signOut();
    await resetLocal();
  }

  const pushText: Record<PushState, string> = {
    on: 'On for this phone. Reminders arrive for your tasks and events.',
    off: 'Off for this phone.',
    denied: 'Blocked. Allow notifications for this site in your phone settings, then come back.',
    unsupported: "This browser can't receive reminders.",
    'needs-install': 'On iPhone, first add Family Hub to your Home Screen (Share → Add to Home Screen), then open it from the icon.',
    'not-configured': 'Reminders are not set up on the server yet (README → Push reminders).',
  };

  return (
    <Screen fab={false} header={<><BackLink to="/" /><h1 className="display h1">Settings</h1></>}>
      <section className="glass card" style={{ gap: 12 }}>
        <h2 className="label">You</h2>
        <label className="field">
          Name shown to the family
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== me?.name && saveProfile({ name: name.trim() })} />
        </label>
        <div className="field">
          <span>Your color on the calendar</span>
          <div className="chips">
            {COLORS.map((c) => (
              <button key={c} type="button" className="chip" aria-label={`Color ${c}`} aria-pressed={c === color} style={{ width: 40, padding: 0, background: c, borderColor: c === color ? 'var(--text)' : c }} onClick={() => { setColor(c); void saveProfile({ color: c }); }} />
            ))}
          </div>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Signed in as {me?.email}</p>
      </section>

      <section className="glass card" style={{ gap: 12 }}>
        <h2 className="label">Look</h2>
        <ChipGroup<ThemeMode> label="Theme" value={mode} onChange={setMode} options={[{ value: 'auto', label: 'Auto' }, { value: 'day', label: 'Light' }, { value: 'night', label: 'Dark' }]} />
        <p className="small muted" style={{ margin: 0 }}>
          Auto switches to Dark after sunset and Light after sunrise
          {sun ? ' for your area.' : ', using 7 AM and 7 PM until you share your location.'}
        </p>
        {mode === 'auto' && (
          sun
            ? <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => { setSunLocation(null); setSun(null); }}>Forget my location</button>
            : <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={shareLocation}>Use my location for sunset</button>
        )}
      </section>

      <section className="glass card" style={{ gap: 12 }}>
        <h2 className="label">Reminders</h2>
        <p className="small" style={{ margin: 0 }}>{pushText[push]}</p>
        {(push === 'on' || push === 'off') && (
          <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={togglePush}>
            {push === 'on' ? 'Turn off on this phone' : 'Turn on reminders'}
          </button>
        )}
      </section>

      <section className="glass card" style={{ gap: 10 }}>
        <h2 className="label">Household</h2>
        {members.list.map((u) => (
          <div key={u.id} className="row" style={{ minHeight: 36 }}>
            <span className="chip-dot" style={{ background: u.color }} />
            <span className="grow">{u.name}</span>
            <span className="small muted">{u.id === me?.id ? 'you' : u.role}</span>
          </div>
        ))}
        <p className="small muted" style={{ margin: 0 }}>New people are added on the server with the seed script (README → Accounts).</p>
      </section>

      <section className="glass card" style={{ gap: 10 }}>
        <h2 className="label">Sync</h2>
        <p className="small" style={{ margin: 0 }}>
          {status.online ? 'Online' : 'Offline'} · {status.pending} change{status.pending === 1 ? '' : 's'} waiting
          {status.lastSync ? ` · last synced ${new Date(status.lastSync).toLocaleTimeString()}` : ''}
        </p>
        {status.error && <p className="small" style={{ margin: 0, color: 'var(--warn)' }}>{status.error}</p>}
        <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => sync.setOnline(navigator.onLine)}>Sync now</button>
      </section>

      <section className="glass card" style={{ gap: 10 }}>
        <h2 className="label">Bring things over</h2>
        <Link to="/settings/import">Import Cozi lists or a Google Calendar file ›</Link>
      </section>

      <button type="button" className="btn btn-danger" onClick={out}>Sign out of this phone</button>
      <p className="tiny faint" style={{ textAlign: 'center' }}>Family Hub {__APP_VERSION__}</p>
    </Screen>
  );
}
