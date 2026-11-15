// Small shared building blocks used by every screen.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { CornerArt } from '../theme/art/Art';
import { IconBack, IconSpark } from './Icons';
import { useRecords, useSyncStatus } from '../lib/sync';
import { currentUser } from '../lib/pb';
import type { User } from '../lib/types';

// ---------- Screen ----------
export function Screen({
  header,
  children,
  art = <CornerArt />,
  fab = true,
  compact = false,
  mainClass = '',
  label,
}: {
  header?: ReactNode;
  children: ReactNode;
  art?: ReactNode;
  fab?: boolean;
  compact?: boolean;
  mainClass?: string;
  label?: string;
}) {
  return (
    <div className="screen" aria-label={label}>
      {art}
      {header && <header className={`screen-header${compact ? ' compact' : ''}`}>{header}</header>}
      <main className={`screen-main${fab ? '' : ' no-fab'} ${mainClass}`}>{children}</main>
      {fab && <Fab />}
    </div>
  );
}

export function Fab({ to = '/add' }: { to?: string }) {
  const location = useLocation();
  return (
    <Link to={to} state={{ bg: location }} className="fab" aria-label="Quick add">
      <IconSpark />
    </Link>
  );
}

/** history.back() when there is an in-app page to return to; otherwise go to `fallback`. */
export function useGoBack(fallback = '/') {
  const nav = useNavigate();
  return useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) nav(-1);
    else nav(fallback, { replace: true });
  }, [nav, fallback]);
}

export function BackLink({ to, label = 'Back', fallback = '/' }: { to?: string; label?: string; fallback?: string }) {
  const back = useGoBack(fallback);
  if (to) {
    return (
      <Link to={to} className="back-link glass">
        <IconBack />
        {label}
      </Link>
    );
  }
  return (
    <button type="button" className="back-link glass" onClick={back}>
      <IconBack />
      {label}
    </button>
  );
}

export function Loading() {
  return <div className="loading">Loading…</div>;
}

// ---------- Sync status line ("synced just now" / "Offline · 2 waiting") ----------
export function SyncLine({ prefix }: { prefix?: string }) {
  const s = useSyncStatus();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  let text: string;
  if (!s.online) text = s.pending ? `Offline · ${s.pending} change${s.pending === 1 ? '' : 's'} waiting` : 'Offline · showing saved copy';
  else if (s.pending) text = `Syncing ${s.pending}…`;
  else if (s.lastSync) {
    const secs = Math.round((Date.now() - s.lastSync) / 1000);
    text = secs < 60 ? 'synced just now' : `synced ${Math.round(secs / 60)} min ago`;
  } else text = 'connecting…';
  return (
    <p className="sync-line" role="status">
      <span className={`sync-dot${s.online ? '' : ' off'}`} />
      {prefix ? `${prefix} · ` : ''}
      {text}
    </p>
  );
}

// ---------- household members ----------
export const FAMILY_COLOR = 'var(--teal)';

export interface Members {
  list: User[];
  me: User | null;
  byId: Record<string, User>;
  name: (id?: string, fallback?: string) => string;
  color: (id?: string) => string;
  others: User[];
}

export function useMembers(): Members {
  const users = useRecords('users');
  return useMemo(() => {
    const me = currentUser();
    const list = (users || []).filter((u) => u.role !== 'kid').sort((a, b) => a.name.localeCompare(b.name));
    if (me && !list.find((u) => u.id === me.id)) list.unshift(me);
    const byId: Record<string, User> = {};
    for (const u of list) byId[u.id] = u;
    return {
      list,
      me,
      byId,
      others: list.filter((u) => u.id !== me?.id),
      name: (id?: string, fallback = 'Family') => (id && byId[id] ? byId[id].name : fallback),
      color: (id?: string) => (id && byId[id]?.color) || FAMILY_COLOR,
    };
  }, [users]);
}

// ---------- toasts with optional Undo ----------
interface ToastMsg { id: number; text: string; action?: { label: string; run: () => void } }
const ToastCtx = createContext<(t: Omit<ToastMsg, 'id'>) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((t: Omit<ToastMsg, 'id'>) => {
    clearTimeout(timer.current);
    setMsg({ ...t, id: Date.now() });
    timer.current = setTimeout(() => setMsg(null), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="toast" role="status" key={msg.id}>
          <span className="grow">{msg.text}</span>
          {msg.action && (
            <button
              type="button"
              onClick={() => {
                msg.action!.run();
                setMsg(null);
              }}
            >
              {msg.action.label}
            </button>
          )}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ---------- chip group ----------
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  scroll = false,
}: {
  options: { value: T; label: string; dot?: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  scroll?: boolean;
}) {
  return (
    <div className={`chips${scroll ? ' scroll' : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="chip"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          style={o.value === value && o.dot ? { background: o.dot, borderColor: o.dot } : undefined}
        >
          {o.dot && <span className="chip-dot" style={{ background: o.value === value ? 'var(--accent-ink)' : o.dot }} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, label, min = 0, max = 999 }: { value: number; onChange: (n: number) => void; label: string; min?: number; max?: number }) {
  return (
    <div className="stepper">
      <button type="button" aria-label={`Fewer ${label}`} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <span className="val" aria-live="polite">{value}</span>
      <button type="button" aria-label={`More ${label}`} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}

/** Bottom sheet rendered over the current screen. */
export function Sheet({ title, onClose, children, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h1 className="display h2">{title}</h1>
          <button type="button" className="link-btn" onClick={onClose}>Cancel</button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </section>
    </div>
  );
}

export function Confirm({ text, confirmLabel = 'Delete', onConfirm, onCancel }: { text: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="glass card" role="alertdialog" aria-label={text} style={{ gap: 12 }}>
      <span>{text}</span>
      <div className="chips">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Keep</button>
        <button type="button" className="btn btn-danger btn-sm" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  );
}
