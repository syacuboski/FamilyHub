// Everything that shows on the calendar for a date range: events (with repeats
// expanded), dated tasks (dashed), and planned dinners from the menu.
import { useMemo } from 'react';
import { useRecords } from '../../lib/sync';
import { addDays, fmtTime, fmtTimeShort, fromPB, parseYmd, startOfDay, ymd } from '../../lib/dates';
import { describeRule, expand, occursOn } from '../../lib/recurrence';
import { useMembers } from '../../shared/ui';

export interface AgendaItem {
  key: string;
  kind: 'event' | 'task' | 'meal';
  title: string;
  sub: string;
  /** "3:30 PM" */
  time: string;
  /** "3:30\n4:30" for week cards */
  timeBlock: string;
  sort: number;
  color: string;
  owner: string; // member id or '' (Family)
  to: string;
  start: Date;
}

export function useAgenda(from: Date, days: number) {
  const events = useRecords('events');
  const tasks = useRecords('tasks');
  const menu = useRecords('menu_entries');
  const recipes = useRecords('recipes');
  const members = useMembers();

  return useMemo(() => {
    const byDay = new Map<string, AgendaItem[]>();
    const push = (d: string, it: AgendaItem) => {
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d)!.push(it);
    };
    const to = addDays(from, days);
    const evs = (events || [])
      .map((e) => ({ ...e, startD: fromPB(e.start)!, endD: fromPB(e.end) || fromPB(e.start)! }))
      .filter((e) => e.startD);
    const occ = expand(evs.map((e) => ({ ...e, start: e.startD, end: e.endD })), from, to);
    for (const o of occ) {
      const e = o.source;
      // all-day / multi-day events appear on each day they cover
      const first = startOfDay(o.start);
      const span = e.all_day ? Math.max(1, Math.round((startOfDay(o.end).getTime() - first.getTime()) / 864e5)) : 1;
      for (let i = 0; i < span; i++) {
        const day = addDays(first, i);
        if (day < from || day >= to) continue;
        const who = members.name(e.owner);
        const subBits = [who];
        if (e.rrule) subBits.push(describeRule(e.rrule, e.startD).replace(/^Every /, 'every ').replace(/^Repeats /, 'repeats '));
        if (e.reminder_min && e.reminder_min > 0) subBits.push(`reminder ${e.reminder_min >= 1440 ? '1 day' : e.reminder_min >= 60 ? `${e.reminder_min / 60} hr` : `${e.reminder_min} min`} before`);
        if (e.location) subBits.push(e.location);
        push(ymd(day), {
          key: `${e.id}:${o.key}:${i}`,
          kind: 'event',
          title: e.title,
          sub: subBits.join(' · '),
          time: e.all_day ? 'All day' : fmtTime(o.start),
          timeBlock: e.all_day ? 'All day' : `${fmtTimeShort(o.start)}\n${fmtTimeShort(o.end)}`,
          sort: e.all_day ? -1 : o.start.getHours() * 60 + o.start.getMinutes(),
          color: members.color(e.owner),
          owner: e.owner || '',
          to: `/calendar/event/${e.id}?on=${o.key}`,
          start: o.start,
        });
      }
    }
    for (const t of tasks || []) {
      if (t.done || !t.due) continue;
      for (let i = 0; i < days; i++) {
        const day = addDays(from, i);
        // recurring chores show on their future slots too
        if (t.due === ymd(day) || (t.rrule && ymd(day) > t.due && occursOn(t.due, t.rrule, day))) {
          push(ymd(day), {
            key: `task:${t.id}:${ymd(day)}`,
            kind: 'task',
            title: t.title,
            sub: [members.name(t.assignee, 'Anyone'), t.rrule ? describeRule(t.rrule, parseYmd(t.due)) : t.due_time ? '' : 'due today'].filter(Boolean).join(' · '),
            time: t.due_time ? fmtTime(new Date(`2000-01-01T${t.due_time}`)) : 'Task',
            timeBlock: 'Task',
            sort: t.due_time ? Number(t.due_time.slice(0, 2)) * 60 + Number(t.due_time.slice(3)) : 24 * 60,
            color: members.color(t.assignee),
            owner: t.assignee || '',
            to: `/tasks/${t.id}`,
            start: day,
          });
        }
      }
    }
    const recipeName = (id?: string) => (recipes || []).find((r) => r.id === id)?.title;
    for (const m of menu || []) {
      if (m.slot !== 'dinner') continue;
      const d = parseYmd(m.date);
      if (d < from || d >= to) continue;
      const title = recipeName(m.recipe) || m.text || '';
      if (!title) continue;
      push(m.date, {
        key: `meal:${m.id}`,
        kind: 'meal',
        title: `Dinner: ${title}`,
        sub: m.note || 'from the menu',
        time: 'Dinner',
        timeBlock: 'Dinner',
        sort: 18 * 60 - 1,
        color: 'var(--teal)',
        owner: '',
        to: m.recipe ? `/recipes/${m.recipe}` : '/meals',
        start: d,
      });
    }
    for (const list of byDay.values()) list.sort((a, b) => a.sort - b.sort);
    return { byDay, ready: !!events && !!tasks };
  }, [events, tasks, menu, recipes, members, from, days]);
}
