// Calendar week and month views (mockups: Calendar — week / month · night).
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { addDays, addMonths, DOW_LONG, DOW_SHORT, MON_LONG, MON_SHORT, parseYmd, sameDay, startOfWeek, today, ymd } from '../../lib/dates';
import { ChipGroup, Screen, useMembers } from '../../shared/ui';
import { useAgenda, type AgendaItem } from './useAgenda';
import './calendar.css';

function useSelected() {
  const [params, setParams] = useSearchParams();
  const sel = params.get('d') ? parseYmd(params.get('d')!) : today();
  const who = params.get('who') || 'all';
  const set = (patch: { d?: Date; who?: string }) => {
    const p = new URLSearchParams(params);
    if (patch.d) p.set('d', ymd(patch.d));
    if (patch.who) patch.who === 'all' ? p.delete('who') : p.set('who', patch.who);
    setParams(p, { replace: true });
  };
  return { sel, who, set, qs: params.toString() };
}

function Header({ title, view, qs }: { title: string; view: 'week' | 'month'; qs: string }) {
  return (
    <div className="header-row end">
      <div className="stack" style={{ gap: 4 }}>
        <p className="eyebrow">Calendar</p>
        <h1 className="display h1">{title}</h1>
      </div>
      <div className="seg glass" style={{ flex: '0 0 auto' }}>
        <Link to={`/calendar?${qs}`} aria-current={view === 'week' ? 'page' : undefined} replace>Week</Link>
        <Link to={`/calendar/month?${qs}`} aria-current={view === 'month' ? 'page' : undefined} replace>Month</Link>
      </div>
    </div>
  );
}

function WhoChips({ who, onChange }: { who: string; onChange: (w: string) => void }) {
  const m = useMembers();
  return (
    <ChipGroup
      label="Filter by person"
      value={who}
      onChange={onChange}
      scroll
      options={[
        { value: 'all', label: 'Everyone' },
        ...m.list.map((u) => ({ value: u.id, label: u.name, dot: u.color })),
        { value: 'family', label: 'Family', dot: 'var(--teal)' },
      ]}
    />
  );
}

const matches = (who: string) => (it: AgendaItem) => who === 'all' || (who === 'family' ? !it.owner : it.owner === who);

export function CalendarWeek() {
  const { sel, who, set, qs } = useSelected();
  const weekStart = useMemo(() => startOfWeek(sel, 0), [sel]);
  const { byDay } = useAgenda(weekStart, 7);
  const t = today();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const items = (byDay.get(ymd(sel)) || []).filter(matches(who));
  const m = useMembers();
  const title = `${MON_LONG[sel.getMonth()]} ${sel.getFullYear()}`;

  return (
    <Screen
      header={
        <>
          <Header title={title} view="week" qs={qs} />
          <div className="week-nav">
            <button type="button" className="chip" aria-label="Previous week" onClick={() => set({ d: addDays(sel, -7) })}>‹</button>
            <div className="week-strip" role="group" aria-label={`Week of ${MON_SHORT[weekStart.getMonth()]} ${weekStart.getDate()}`}>
              {days.map((d) => {
                const list = (byDay.get(ymd(d)) || []).filter(matches(who));
                const on = sameDay(d, sel);
                return (
                  <button
                    key={ymd(d)}
                    type="button"
                    className={`day-chip glass${on ? ' on' : ''}${sameDay(d, t) && !on ? ' today' : ''}`}
                    aria-pressed={on}
                    aria-label={`${DOW_LONG[d.getDay()]}, ${MON_LONG[d.getMonth()]} ${d.getDate()}, ${list.length} items`}
                    onClick={() => set({ d })}
                  >
                    <span className="dow">{DOW_SHORT[d.getDay()]}</span>
                    <span className="num">{d.getDate()}</span>
                    <span className="dots">{list.slice(0, 3).map((it) => <span key={it.key} style={{ background: on ? 'var(--accent-ink)' : it.color }} />)}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" className="chip" aria-label="Next week" onClick={() => set({ d: addDays(sel, 7) })}>›</button>
          </div>
          <WhoChips who={who} onChange={(w) => set({ who: w })} />
        </>
      }
    >
      <div className="spread" style={{ marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h2 className="display h2">{DOW_LONG[sel.getDay()]}, {MON_SHORT[sel.getMonth()]} {sel.getDate()}</h2>
          {sameDay(sel, t) ? <span className="small" style={{ color: 'var(--accent-hi)' }}>Today</span> : <button type="button" className="link-btn" onClick={() => set({ d: t })}>Today</button>}
        </div>
        <Link to={`/calendar/new?date=${ymd(sel)}`} className="link-btn">+ Event</Link>
      </div>
      {items.map((it) => (
        <Link key={it.key} to={it.to} className={`agenda-card${it.kind !== 'event' ? ' dashed' : ''}`} style={{ borderLeftColor: it.color }}>
          <div className="agenda-time">{it.timeBlock}</div>
          <div className="stack" style={{ gap: 2 }}>
            <span className="agenda-title">{it.title}</span>
            <span className="agenda-sub">{it.sub}</span>
          </div>
        </Link>
      ))}
      {items.length === 0 && <p className="empty">{who !== 'all' ? `Nothing for ${who === 'family' ? 'the family' : m.name(who)} this day.` : 'Nothing scheduled this day.'}</p>}
    </Screen>
  );
}

export function CalendarMonth() {
  const { sel, who, set, qs } = useSelected();
  const monthStart = new Date(sel.getFullYear(), sel.getMonth(), 1);
  const gridStart = startOfWeek(monthStart, 0);
  const nextMonth = addMonths(monthStart, 1);
  const cellsCount = Math.ceil((nextMonth.getTime() - gridStart.getTime()) / 864e5 / 7) * 7;
  const { byDay } = useAgenda(gridStart, cellsCount);
  const t = today();
  const cells = Array.from({ length: cellsCount }, (_, i) => addDays(gridStart, i));
  const agenda = (byDay.get(ymd(sel)) || []).filter(matches(who));
  const m = useMembers();

  return (
    <Screen
      header={
        <>
          <Header title={`${MON_LONG[sel.getMonth()]} ${sel.getFullYear()}`} view="month" qs={qs} />
          <WhoChips who={who} onChange={(w) => set({ who: w })} />
        </>
      }
      mainClass="month-main"
    >
      <div className="month-nav">
        <button type="button" className="chip" aria-label="Previous month" onClick={() => set({ d: addMonths(monthStart, -1) })}>‹ {MON_SHORT[addMonths(monthStart, -1).getMonth()]}</button>
        <button type="button" className="link-btn" onClick={() => set({ d: t })}>Today</button>
        <button type="button" className="chip" aria-label="Next month" onClick={() => set({ d: nextMonth })}>{MON_SHORT[nextMonth.getMonth()]} ›</button>
      </div>
      <div className="month-grid head" aria-hidden="true">{DOW_SHORT.map((d) => <span key={d}>{d}</span>)}</div>
      <div className="month-grid">
        {cells.map((d) => {
          const inMonth = d.getMonth() === sel.getMonth();
          const on = sameDay(d, sel);
          const list = (byDay.get(ymd(d)) || []).filter(matches(who));
          return (
            <button
              key={ymd(d)}
              type="button"
              className={`month-cell${inMonth ? ' glass' : ' out'}${on ? ' on' : ''}${sameDay(d, t) && !on ? ' today' : ''}`}
              aria-pressed={on}
              aria-label={`${MON_LONG[d.getMonth()]} ${d.getDate()}${list.length ? `, ${list.length} items` : ''}`}
              onClick={() => set({ d })}
            >
              <span>{d.getDate()}</span>
              <span className="dots">{list.slice(0, 3).map((it) => <span key={it.key} style={{ background: on ? 'var(--accent-ink)' : it.color }} />)}</span>
            </button>
          );
        })}
      </div>
      <div className="month-agenda">
        <div className="spread" style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h2 className="display" style={{ fontSize: 21 }}>{DOW_LONG[sel.getDay()]}, {MON_SHORT[sel.getMonth()]} {sel.getDate()}</h2>
            {sameDay(sel, t) && <span className="small" style={{ color: 'var(--accent-hi)' }}>Today</span>}
          </div>
          <Link to={`/calendar/new?date=${ymd(sel)}`} className="link-btn">+ Event</Link>
        </div>
        {agenda.map((it) => (
          <Link key={it.key} to={it.to} className="agenda-line">
            <span className="t">{it.time}</span>
            <span className="chip-dot" style={{ background: it.color }} />
            <span className="grow">{it.title}</span>
            <span className="small muted">{it.kind === 'meal' ? '' : m.name(it.owner, it.kind === 'task' ? 'Anyone' : 'Family')}</span>
          </Link>
        ))}
        {agenda.length === 0 && <p className="empty">{who !== 'all' ? 'Nothing for them this day.' : 'Nothing scheduled this day.'}</p>}
      </div>
    </Screen>
  );
}
