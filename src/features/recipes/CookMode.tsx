// Cook mode (mockup: Cook mode · night). Keeps the screen on, scales the
// ingredients to tonight's plan, highlights what the current step uses, and
// runs real countdown timers that chime and vibrate when done.
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useRecord, useRecords } from '../../lib/sync';
import { fmtQty } from '../../lib/scale';
import { describePlan, planFromParams, planTotals } from '../../lib/headcount';
import { BackLink, Loading, useToast } from '../../shared/ui';
import { ingredientQty, stepUses } from './ingredientText';
import './recipes.css';

type Focus = 'both' | 'mise' | 'steps';
interface Timer { step: number; endsAt: number; total: number; paused?: number }

function useWakeLock() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const get = async () => {
      try {
        if (nav.wakeLock && document.visibilityState === 'visible') {
          lock = await nav.wakeLock.request('screen');
          setOn(true);
        }
      } catch {
        setOn(false);
      }
    };
    void get();
    const vis = () => document.visibilityState === 'visible' && void get();
    document.addEventListener('visibilitychange', vis);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      void lock?.release().catch(() => {});
    };
  }, []);
  return on;
}

function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.32);
    });
  } catch {
    /* no audio */
  }
  navigator.vibrate?.([300, 150, 300, 150, 300]);
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function CookMode() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const r = useRecord('recipes', id);
  const allIngs = useRecords('recipe_ingredients');
  const toast = useToast();
  const awake = useWakeLock();
  const storeKey = `fh.cook.${id}`;
  const saved = (() => {
    try { return JSON.parse(sessionStorage.getItem(storeKey) || '{}'); } catch { return {}; }
  })();
  const [step, setStep] = useState<number>(saved.step || 0);
  const [done, setDone] = useState<Record<string, boolean>>(saved.done || {});
  const [focus, setFocus] = useState<Focus>('both');
  const [timers, setTimers] = useState<Timer[]>([]);
  const [rang, setRang] = useState<Record<number, boolean>>({});
  const [now, setNow] = useState(Date.now());
  const [dx, setDx] = useState(0);
  const x0 = useRef<number | null>(null);

  useEffect(() => {
    try { sessionStorage.setItem(storeKey, JSON.stringify({ step, done })); } catch { /* ignore */ }
  }, [step, done, storeKey]);

  // tick while any timer runs; chime when one finishes
  useEffect(() => {
    if (!timers.some((t) => !t.paused)) return;
    const h = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(h);
  }, [timers]);
  useEffect(() => {
    for (const t of timers) {
      if (!t.paused && t.endsAt <= now && !rang[t.step]) {
        setRang((x) => ({ ...x, [t.step]: true }));
        chime();
        toast({ text: `Step ${t.step + 1} timer is done` });
      }
    }
  }, [now, timers, rang, toast]);

  const plan = planFromParams(params);
  const ings = useMemo(() => (allIngs || []).filter((i) => i.recipe === id).sort((a, b) => (a.sort || 0) - (b.sort || 0)), [allIngs, id]);

  if (r === undefined) return <Loading />;
  if (r === null) return <div className="screen"><BackLink to="/recipes" /><p className="empty">That recipe was deleted.</p></div>;

  const steps = r.steps && r.steps.length ? r.steps : [{ text: 'No steps written yet. Edit the recipe to add some.' }];
  const cur = steps[Math.min(step, steps.length - 1)];
  const totals = planTotals(plan, r.kid_portion ?? 0.5);
  const factor = r.servings ? totals.total / r.servings : 1;
  const readyCount = ings.filter((i) => done[i.id]).length;
  const go = (i: number) => {
    setStep(Math.max(0, Math.min(steps.length - 1, i)));
    setDx(0);
  };

  const timerFor = (s: number) => timers.find((t) => t.step === s);
  const curTimer = timerFor(step);
  const remaining = (t: Timer) => (t.paused ?? t.endsAt - now);
  function toggleTimer() {
    const minutes = cur.timer_min || 0;
    if (!minutes) return;
    if (!curTimer) {
      setTimers((ts) => [...ts, { step, endsAt: Date.now() + minutes * 60e3, total: minutes * 60e3 }]);
      setNow(Date.now());
      return;
    }
    if (rang[step]) {
      // finished: dismiss
      setTimers((ts) => ts.filter((t) => t.step !== step));
      setRang((x) => ({ ...x, [step]: false }));
      return;
    }
    setTimers((ts) => ts.map((t) => (t.step !== step ? t : t.paused !== undefined ? { ...t, endsAt: Date.now() + t.paused, paused: undefined } : { ...t, paused: t.endsAt - Date.now() })));
  }
  const otherTimers = timers.filter((t) => t.step !== step);

  const down = (e: PointerEvent) => { x0.current = e.clientX; };
  const move = (e: PointerEvent) => { if (x0.current !== null) setDx(e.clientX - x0.current); };
  const up = () => {
    if (x0.current === null) return;
    x0.current = null;
    if (dx < -60 && step < steps.length - 1) go(step + 1);
    else if (dx > 60 && step > 0) go(step - 1);
    else setDx(0);
  };
  const flex = { both: ['1', '1'], mise: ['3', '1'], steps: ['1', '3'] }[focus];
  const next = steps[step + 1];

  return (
    <div className="screen">
      <header className="screen-header compact" style={{ gap: 6 }}>
        <div className="header-row">
          <BackLink fallback={`/recipes/${r.id}`} />
          <span className="tiny" style={{ color: awake ? 'var(--teal)' : 'var(--muted)' }}>{awake ? 'Screen stays on' : 'Keep your screen awake'}</span>
        </div>
        <h1 className="display" style={{ fontSize: 26 }}>{r.title}</h1>
        <p className="small muted" style={{ margin: 0 }}>Scaled for {describePlan(plan)}{totals.prep ? ` + ${fmtQty(totals.prep)} prep` : ''} · {fmtQty(totals.total)} portions</p>
      </header>

      <main className="cook">
        <section className="cook-panel glass" aria-label="Mise en place" style={{ flex: flex[0] }}>
          <button type="button" className="panel-head" aria-expanded={focus === 'mise'} onClick={() => setFocus(focus === 'mise' ? 'both' : 'mise')}>
            <span className="label grow">Mise en place</span>
            <span className="small">{readyCount} of {ings.length} ready</span>
            <span className="tiny muted">{focus === 'mise' ? 'Show both' : 'Expand ▾'}</span>
          </button>
          <div className="progress"><div style={{ width: `${ings.length ? Math.round((readyCount / ings.length) * 100) : 0}%` }} /></div>
          <div className="panel-body">
            {ings.map((i) => {
              const isDone = !!done[i.id];
              const uses = stepUses(cur.text, i.name);
              return (
                <label key={i.id} className={`mise-row${isDone ? ' done' : ''}${uses ? ' now' : ''}`}>
                  <input type="checkbox" checked={isDone} onChange={() => setDone({ ...done, [i.id]: !isDone })} />
                  <span className="q">{ingredientQty(i, factor)}</span>
                  <span className="grow stack n" style={{ gap: 0 }}>
                    <span>{i.name}</span>
                    {i.prep && <span className="tiny muted">{i.prep}</span>}
                  </span>
                  {uses && <span className="tiny" style={{ color: 'var(--link)' }}>Step {step + 1}</span>}
                </label>
              );
            })}
          </div>
        </section>

        <section className="cook-panel glass" aria-label="Steps" style={{ flex: flex[1] }}>
          <button type="button" className="panel-head" aria-expanded={focus === 'steps'} onClick={() => setFocus(focus === 'steps' ? 'both' : 'steps')}>
            <span className="label grow">Steps</span>
            <span className="small">Step {step + 1} of {steps.length}</span>
            <span className="tiny muted">{focus === 'steps' ? 'Show both' : 'Expand ▴'}</span>
          </button>
          <div className="step-dots" aria-hidden="true">{steps.map((_, i) => <span key={i} className={i <= step ? 'on' : ''} />)}</div>
          <div className="panel-body" style={{ padding: 0 }}>
            <div
              className="step-card"
              style={{ transform: `translateX(${dx}px)`, transition: x0.current === null ? undefined : 'none' }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onPointerLeave={up}
            >
              <p className="step-text" aria-live="polite">{cur.text}</p>
              {cur.timer_min ? (
                <button type="button" className={`btn btn-ghost timer-btn${curTimer ? (rang[step] ? ' done' : ' running') : ''}`} onClick={toggleTimer}>
                  {!curTimer
                    ? `Start ${cur.timer_min}:00 timer`
                    : rang[step]
                      ? 'Time! · tap to dismiss'
                      : curTimer.paused !== undefined
                        ? `${mmss(curTimer.paused)} paused · tap to resume`
                        : `${mmss(remaining(curTimer))} left · tap to pause`}
                </button>
              ) : null}
              {otherTimers.map((t) => (
                <button key={t.step} type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => go(t.step)}>
                  ⏱ Step {t.step + 1}: {rang[t.step] ? 'done!' : `${mmss(remaining(t))} left`}
                </button>
              ))}
              {next && <p className="small muted" style={{ margin: 0 }}>Next: {next.text}</p>}
            </div>
            <div className="swipe-hints">
              <button type="button" className="link-btn" disabled={step === 0} onClick={() => go(step - 1)}>{step > 0 ? `‹ Step ${step}` : ''}</button>
              <button type="button" className="link-btn" disabled={!next} onClick={() => go(step + 1)}>{next ? `Step ${step + 2} ›` : 'Last step · enjoy!'}</button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
