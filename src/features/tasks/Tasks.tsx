// Tasks (mockup: Tasks · night): Everyone / Mine / Done, grouped Due today ·
// This week · Later · Someday. Recurring chores roll forward when ticked.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useRecords } from '../../lib/sync';
import { completeTask, reopenTask } from '../../lib/actions';
import { addDays, fmtDue, parseYmd, today, ymd, fromPB, fmtShortDate } from '../../lib/dates';
import { describeRule } from '../../lib/recurrence';
import { IconRepeat } from '../../shared/Icons';
import { ChipGroup, Loading, Screen, useMembers, useToast } from '../../shared/ui';
import { HomeTabs } from '../home/HomeTabs';
import type { Task } from '../../lib/types';
import './tasks.css';

type Filter = 'everyone' | 'mine' | 'done';

export function TasksScreen() {
  const tasks = useRecords('tasks');
  const members = useMembers();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('everyone');

  const groups = useMemo(() => {
    const t0 = ymd(today());
    const weekEnd = ymd(addDays(today(), 7));
    const all = (tasks || []).filter((t) =>
      filter === 'done' ? t.done : !t.done && (filter === 'everyone' || !t.assignee || t.assignee === members.me?.id),
    );
    if (filter === 'done') {
      return [{ name: 'Done', items: all.sort((a, b) => (b.done_at || '').localeCompare(a.done_at || '')).slice(0, 50) }];
    }
    const by = (a: Task, b: Task) => (a.due || '9999').localeCompare(b.due || '9999') || (a.due_time || '').localeCompare(b.due_time || '') || a.title.localeCompare(b.title);
    const overdue = all.filter((t) => t.due && t.due < t0).sort(by);
    const due = all.filter((t) => t.due === t0).sort(by);
    const week = all.filter((t) => t.due > t0 && t.due <= weekEnd).sort(by);
    const later = all.filter((t) => t.due > weekEnd).sort(by);
    const someday = all.filter((t) => !t.due).sort(by);
    return [
      { name: 'Overdue', items: overdue },
      { name: 'Due today', items: due },
      { name: 'This week', items: week },
      { name: 'Later', items: later },
      { name: 'Someday', items: someday },
    ].filter((g) => g.items.length);
  }, [tasks, filter, members.me]);

  if (!tasks) return <Loading />;

  async function tick(t: Task) {
    if (t.done) {
      await reopenTask(t);
      return;
    }
    const r = await completeTask(t);
    toast({
      text: r.next ? `Done · next ${fmtDue(r.next).toLowerCase() === 'tomorrow' ? 'tomorrow' : fmtShortDate(parseYmd(r.next))}` : `Done: ${t.title}`,
      action: { label: 'Undo', run: () => void r.undo() },
    });
  }

  return (
    <Screen
      header={
        <>
          <HomeTabs />
          <div className="header-row" style={{ marginTop: 6 }}>
            <h1 className="display h1">Tasks</h1>
            <Link to="/tasks/new" className="btn btn-ghost btn-sm">New task</Link>
          </div>
          <ChipGroup<Filter>
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[{ value: 'everyone', label: 'Everyone' }, { value: 'mine', label: 'Mine' }, { value: 'done', label: 'Done' }]}
          />
        </>
      }
    >
      {groups.length === 0 && <p className="empty">{filter === 'done' ? 'Nothing finished yet.' : 'All clear. Nothing to do.'}</p>}
      {groups.map((g) => (
        <section key={g.name} className="glass card task-card">
          <h2 className="label" style={g.name === 'Overdue' ? { color: 'var(--warn)' } : undefined}>{g.name}</h2>
          {g.items.map((t) => (
            <TaskRow key={t.id} t={t} who={members.name(t.assignee, 'All')} color={members.color(t.assignee)} onTick={() => tick(t)} />
          ))}
        </section>
      ))}
    </Screen>
  );
}

export function TaskRow({ t, who, color, onTick }: { t: Task; who: string; color: string; onTick: () => void }) {
  const sub = [
    t.rrule ? null : t.due && !t.done ? fmtDue(t.due) : null,
    t.done && t.done_at ? `Done ${fmtShortDate(fromPB(t.done_at)!)}` : null,
    t.notes || null,
    t.source ? `from ${t.source}` : null,
  ].filter(Boolean);
  return (
    <div className="task-row">
      <input type="checkbox" aria-label={`Done: ${t.title}`} checked={t.done} onChange={onTick} />
      <Link to={`/tasks/${t.id}`} className="grow task-text">
        <span className={t.done ? 'strike' : ''}>{t.title}</span>
        <span className="task-sub">
          {t.rrule && (
            <>
              <IconRepeat /> {describeRule(t.rrule, t.due ? parseYmd(t.due) : undefined)}
              {t.due ? ` · next ${fmtDue(t.due) === 'Today' ? 'today' : fmtShortDate(parseYmd(t.due))}` : ''}
              {sub.length ? ' · ' : ''}
            </>
          )}
          {sub.join(' · ')}
        </span>
      </Link>
      <span className="task-who" style={{ color }}>{who}</span>
    </div>
  );
}
