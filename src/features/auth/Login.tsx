import { useState, type FormEvent } from 'react';
import { HeroArt } from '../../theme/art/Art';
import { signIn } from '../../lib/pb';

export function Login({ onSignedOut }: { onSignedOut: () => Promise<void> | void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSignedOut(); // start clean in case someone else used this phone
      await signIn(email, password);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      setError(
        status === 400
          ? "That email and password don't match. Check both and try again."
          : !navigator.onLine || status === 0
            ? "Can't reach Family Hub. Check that Tailscale is on, then try again."
            : 'Something went wrong signing in. Try again in a moment.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <HeroArt />
      <header className="screen-header" style={{ paddingTop: 'calc(140px + var(--safe-top))' }}>
        <p className="eyebrow">Family Hub</p>
        <h1 className="display" style={{ fontSize: 38 }}>Welcome home</h1>
        <p className="muted small">Sign in once on this phone and it stays signed in.</p>
      </header>
      <main className="screen-main no-fab">
        <form className="glass card" onSubmit={submit} style={{ gap: 14 }}>
          <label className="field">
            Email
            <input type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            Password
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && (
            <p role="alert" style={{ margin: 0, color: 'var(--danger)', fontSize: 14 }}>
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="muted small">Forgot your password? Whoever runs the home server can reset it (README → Accounts).</p>
      </main>
    </div>
  );
}
