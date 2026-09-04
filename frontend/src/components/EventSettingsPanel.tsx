import React, { useEffect, useState } from 'react';
import { Save, Trash2, ExternalLink, ShieldCheck } from 'lucide-react';
import { Event, EventStatus, EventType } from '../types';

interface Props { event: Event; onSave: (updates: Partial<Event>) => Promise<void>; onDelete: () => Promise<void>; }

export const EventSettingsPanel: React.FC<Props> = ({ event, onSave, onDelete }) => {
  const [form, setForm] = useState({ name: event.name, type: event.type, description: event.description || '', websiteUrl: event.websiteUrl || '', finalDeadline: event.finalDeadline?.slice(0, 10) || '', teamSize: String(event.teamSize || 1), status: event.status, nextAction: event.nextAction || '' });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setForm({ name: event.name, type: event.type, description: event.description || '', websiteUrl: event.websiteUrl || '', finalDeadline: event.finalDeadline?.slice(0, 10) || '', teamSize: String(event.teamSize || 1), status: event.status, nextAction: event.nextAction || '' }), [event.id, event.name, event.description, event.websiteUrl, event.finalDeadline, event.teamSize, event.status, event.nextAction]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(null); setMessage(null);
    try {
      await onSave({ name: form.name.trim(), type: form.type, description: form.description.trim(), websiteUrl: form.websiteUrl.trim() || undefined, finalDeadline: form.finalDeadline, teamSize: Math.max(1, Number(form.teamSize) || 1), status: form.status, nextAction: form.nextAction.trim() });
      setMessage('Event details saved. The preparation planner will use the updated data.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save event details.'); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    const confirmed = window.confirm(`Delete “${event.name}” permanently? This removes its tasks, deadlines, team memberships, invitations, resources, updates and connected sources.`);
    if (!confirmed) return;
    setDeleting(true); setError(null);
    try { await onDelete(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not delete this event.'); setDeleting(false); }
  };

  return <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 820 }}>
    <div><h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Event Settings</h2><p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.35rem' }}>Extraction is only the starting point. You can correct event data manually at any time.</p></div>
    <form className="premium-card" onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.9rem' }}>
        <label style={{ fontSize: '0.78rem' }}>Event name<input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></label>
        <label style={{ fontSize: '0.78rem' }}>Type<select className="input-field" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as EventType })}><option value="hackathon">Hackathon</option><option value="competition">Competition</option><option value="conference">Conference</option><option value="workshop">Workshop</option></select></label>
      </div>
      <label style={{ fontSize: '0.78rem' }}>Description<textarea className="input-field" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4} /></label>
      <label style={{ fontSize: '0.78rem' }}>Source website<div style={{ display: 'flex', gap: 8 }}><input className="input-field" style={{ flex: 1 }} value={form.websiteUrl} onChange={e => setForm({ ...form, websiteUrl: e.target.value })} placeholder="https://…" />{form.websiteUrl && <a className="btn btn-secondary" href={form.websiteUrl} target="_blank" rel="noreferrer" title="Open source"><ExternalLink size={14} /></a>}</div></label>
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: '0.9rem' }}>
        <label style={{ fontSize: '0.78rem' }}>Final deadline<input className="input-field" type="date" value={form.finalDeadline} onChange={e => setForm({ ...form, finalDeadline: e.target.value })} required /></label>
        <label style={{ fontSize: '0.78rem' }}>Team size<input className="input-field" type="number" min={1} value={form.teamSize} onChange={e => setForm({ ...form, teamSize: e.target.value })} /></label>
        <label style={{ fontSize: '0.78rem' }}>Status<select className="input-field" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as EventStatus })}><option value="on-track">On Track</option><option value="needs-attention">Needs Attention</option><option value="at-risk">At Risk</option></select></label>
      </div>
      <label style={{ fontSize: '0.78rem' }}>Next action<input className="input-field" value={form.nextAction} onChange={e => setForm({ ...form, nextAction: e.target.value })} placeholder="e.g. Complete prototype" /></label>
      {error && <div style={{ color: 'var(--status-atrisk)', fontSize: '0.78rem' }}>{error}</div>}
      {message && <div style={{ color: 'var(--status-ontrack)', fontSize: '0.78rem' }}>{message}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn btn-primary" disabled={saving} style={{ gap: 6 }}>{saving ? 'Saving…' : <><Save size={14} />Save changes</>}</button></div>
    </form>
    <div className="premium-card" style={{ border: '1px solid rgba(239,68,68,0.25)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}><ShieldCheck size={18} /><div><h3 style={{ fontSize: '0.95rem', fontWeight: 650 }}>Danger zone</h3><p style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', lineHeight: 1.5, marginTop: 5 }}>Deleting an event permanently removes all event-scoped data. This action cannot be undone.</p><button type="button" className="btn btn-secondary" onClick={() => void remove()} disabled={deleting} style={{ marginTop: 12, gap: 6, borderColor: 'rgba(239,68,68,0.35)' }}>{deleting ? 'Deleting…' : <><Trash2 size={14} />Delete event permanently</>}</button></div></div>
    </div>
  </div>;
};
