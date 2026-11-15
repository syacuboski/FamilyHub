// Create or edit a task: title, who, due date/time, repeats, reminder, notes.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { add, patch, remove, useRecord } from '../../lib/sync';
import { REPEATS, repeatIdFor, type RepeatId } from '../../lib/recurrence';
import { ymd, today } from '../../lib/dates';
import { BackLink, ChipGroup, Confirm, Screen, useGoBack, useMembers } from '../../shared/ui';
import type { Task } from '../../lib/types';

export function TaskEditor() {
  const { id } = useParams();
  const goBack = useGoBack('/home/tasks');
  const existing = useRecord('tasks', id);
  const members = useMembers();
  const [f, setF] = useState({ title: '', assignee: '', due: ymd(today()), due_time: '', repeat: 'never' as RepeatId, remind: true, notes: '' });
  const [loaded, setLoaded] = useState(!id);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (existing && !loaded) {
      setF({
        title: existing.title, assignee: existing.assignee || '', due: existing.due || '', due_time: existing.due_time || '',
        repeat: repeatIdFor(existing.rrule), remind: existing.remind !== false, notes: existing.notes || '',
      });
      setLoaded(true);
    }
  }, [existing, loaded]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    if (!f.title.trim()) return;
    const data: Partial<Task> = {
      title: f.title.trim(), assignee: f.assignee, due: f.due, due_time: f.due_time,
      rrule: REPEATS.find((r) => r.id === f.repeat)!.rule, remind: f.remind, notes: f.notes.trim(),
    };
    if (id) await patch('tasks', id, data);
    else await add('tasks', { ...data, done: false } as Omit<Task, 'id' | 'household'>);
    goBack();
  }

  if (id && existing === null) return <Screen fab={false} header={<BackLink />}><p className="empty">That task was deleted.</p></Screen>;

  const whoOpts = [...members.list.map((u) => ({ value: u.id, label: u.name, dot: u.color })), { value: '', label: 'Anyone', dot: 'var(--teal)' }];

  return (
    <Screen
      fab={false}
      header={
        <>
          <div className="header-row">
            <BackLink />
            <button type="button" className="btn btn-primary btn-sm" disabled={!f.title.trim()} onClick={save}>Save</button>
          </div>
          <h1 className="display h1">{id ? 'Edit task' : 'New task'}</h1>
        </>
      }
    >
      <div className="glass card" style={{ gap: 14 }}>
        <label className="field">
          Task
          <input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Schedule furnace service" autoFocus={!id} />
        </label>
        <div className="field">
          <span>Who</span>
          <ChipGroup label="Who" value={f.assignee} onChange={(v) => set('assignee', v)} options={whoOpts} />
        </div>
        <div className="field-row">
          <label className="field">
            Due
            <input type="date" value={f.due} onChange={(e) => set('due', e.target.value)} />
          </label>
          <label className="field">
            Time (optional)
            <input type="time" value={f.due_time} onChange={(e) => set('due_time', e.target.value)} />
          </label>
        </div>
        <div className="chips">
          <button type="button" className="chip" onClick={() => set('due', ymd(today()))}>Today</button>
          <button type="button" className="chip" onClick={() => set('due', ymd(new Date(Date.now() + 864e5)))}>Tomorrow</button>
          <button type="button" className="chip" onClick={() => set('due', '')}>Someday</button>
        </div>
        <label className="field">
          Repeats
          <select value={f.repeat} onChange={(e) => set('repeat', e.target.value as RepeatId)}>
            {REPEATS.filter((r) => r.id !== 'weekdays').map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
        {f.repeat !== 'never' && !f.due && <p className="small" style={{ margin: 0, color: 'var(--warn)' }}>Pick a first due date so the repeat knows where to start.</p>}
        <label className="row" style={{ borderBottom: 'none', minHeight: 36 }}>
          <input type="checkbox" checked={f.remind} onChange={(e) => set('remind', e.target.checked)} />
          Remind {f.assignee ? members.name(f.assignee) : 'everyone'} {f.due_time ? 'at that time' : 'at 9:00 AM'} on the due day
        </label>
        <label className="field">
          Notes
          <textarea rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </label>
      </div>
      {id && !confirm && <button type="button" className="btn btn-danger" onClick={() => setConfirm(true)}>Delete task</button>}
      {id && confirm && <Confirm text="Delete this task?" onCancel={() => setConfirm(false)} onConfirm={async () => { await remove('tasks', id); goBack(); }} />}
    </Screen>
  );
}
