import React, { useState } from 'react';
import { Calendar, Pencil, Plus, Trash2, X, Check, RefreshCw } from 'lucide-react';
import { Deadline, Event } from '../types';
import { deadlineService } from '../services/deadlineService';
import { plannerService } from '../services/plannerService';

interface Props { event: Event; deadlines: Deadline[]; onChanged: () => Promise<void> | void; onEventUpdate: (updates: Partial<Event>) => Promise<void>; }

const finalLike = (title: string) => /final|submission|submit|deadline|closing|registration closes/i.test(title);

export const DeadlineManager: React.FC<Props> = ({ event, deadlines, onChanged, onEventUpdate }) => {
  const [editing, setEditing] = useState<Deadline | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = (d: Deadline) => { setEditing(d); setTitle(d.title); setDate(d.date.slice(0, 10)); setAdding(false); setError(null); };
  const startAdd = () => { setEditing(null); setTitle(''); setDate(''); setAdding(true); setError(null); };
  const close = () => { setEditing(null); setAdding(false); setError(null); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!title.trim() || !date) return;
    setBusy(true); setError(null);
    try {
      if (editing) await deadlineService.update(editing.id, { title: title.trim(), date });
      else await deadlineService.create(event.id, { title: title.trim(), date, type: 'official', verified: true });
      if (finalLike(title)) await onEventUpdate({ finalDeadline: date });
      await onChanged();
      await plannerService.recalculate(event.id);
      close();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save deadline.'); }
    finally { setBusy(false); }
  };

  const remove = async (d: Deadline) => {
    if (!window.confirm(`Delete “${d.title}”?`)) return;
    setBusy(true); setError(null);
    try { await deadlineService.remove(d.id); await onChanged(); await plannerService.recalculate(event.id); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not delete deadline.'); }
    finally { setBusy(false); }
  };

  return <div className="premium-card" style={{ marginBottom: '1.5rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <div><h3 style={{ fontSize: '1rem', fontWeight: 650 }}>Official event deadlines</h3><p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: 3 }}>Edit extracted dates or add a missing milestone manually. Changes immediately feed the planner.</p></div>
      <button className="btn btn-primary" onClick={startAdd} style={{ gap: 5, fontSize: '0.75rem' }}><Plus size={13} />Add deadline</button>
    </div>
    {error && <div style={{ padding: '0.65rem', marginBottom: 10, border: '1px solid var(--status-atrisk)', borderRadius: 7, color: 'var(--status-atrisk)', fontSize: '0.75rem' }}>{error}</div>}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {deadlines.length === 0 ? <div style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem', padding: '0.8rem' }}>No deadlines extracted yet.</div> : deadlines.map(d => <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.7rem 0.8rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 7 }}>
        <Calendar size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} /><div style={{ flex: 1 }}><strong style={{ fontSize: '0.8rem', display: 'block' }}>{d.title}</strong><span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>{new Date(d.date).toLocaleDateString()}</span></div><span className="badge badge-info" style={{ fontSize: '0.6rem' }}>{d.type}</span><button className="btn-icon" title="Edit deadline" onClick={() => startEdit(d)} disabled={busy}><Pencil size={13} /></button><button className="btn-icon" title="Delete deadline" onClick={() => void remove(d)} disabled={busy}><Trash2 size={13} /></button>
      </div>)}
    </div>
    {(editing || adding) && <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)' }}>
      <form onSubmit={save} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr auto auto', gap: 8, alignItems: 'end' }}>
        <label style={{ fontSize: '0.7rem' }}>Title<input className="input-field" value={title} onChange={e => setTitle(e.target.value)} required /></label>
        <label style={{ fontSize: '0.7rem' }}>Date<input className="input-field" type="date" value={date} onChange={e => setDate(e.target.value)} required /></label>
        <button className="btn btn-primary" disabled={busy} style={{ gap: 5 }}>{busy ? <RefreshCw size={13} /> : <Check size={13} />}Save</button><button type="button" className="btn btn-secondary" onClick={close} disabled={busy}><X size={13} /></button>
      </form>
    </div>}
  </div>;
};
