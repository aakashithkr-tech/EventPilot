import React, { useEffect, useMemo, useState } from 'react';
import { Mail, MessageCircle, RefreshCw, ShieldCheck, Trash2, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';
import { ConnectedSource, sourceService, WhatsAppIntegrationStatus } from '../../services/sourceService';

interface Props { eventId: string; eventName: string; websiteUrl?: string; }

export const EventSourcesPanel: React.FC<Props> = ({ eventId, eventName, websiteUrl }) => {
  const [sources, setSources] = useState<ConnectedSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [whatsappKeywords, setWhatsappKeywords] = useState(eventName);
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppIntegrationStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const load = async () => {
    setLoading(true); setError(null);
    try { setSources(await sourceService.list(eventId)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load connected sources.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [eventId]);
  useEffect(() => {
    let cancelled = false;
    setStatusLoading(true);
    sourceService.whatsappStatus()
      .then(status => { if (!cancelled) setWhatsappStatus(status); })
      .catch(() => { if (!cancelled) setWhatsappStatus(null); })
      .finally(() => { if (!cancelled) setStatusLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const whatsappSource = useMemo(() => sources.find(source => source.type === 'whatsapp' && source.status === 'active'), [sources]);

  const connectGmail = async () => {
    setBusy('gmail'); setError(null); setMessage(null);
    try { await sourceService.beginGmailConnect(eventId); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not start Gmail connection.'); setBusy(null); }
  };

  const connectWhatsApp = async () => {
    const keywords = whatsappKeywords.split(',').map(v => v.trim()).filter(Boolean);
    if (!keywords.length) { setError('Add at least one event keyword.'); return; }
    setBusy('whatsapp'); setError(null); setMessage(null);
    try {
      const source = await sourceService.connectWhatsApp(eventId, keywords);
      setSources(prev => [source, ...prev.filter(s => s.id !== source.id)]);
      setMessage('WhatsApp Business channel is now bound to this event.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not connect WhatsApp Business source.'); }
    finally { setBusy(null); }
  };

  const sync = async (source: ConnectedSource) => {
    setBusy(source.id); setError(null); setMessage(null);
    try {
      const result = await sourceService.sync(eventId, source.id);
      setMessage(result.changes > 0 ? `Synced ${result.matched} matching email(s) and applied ${result.changes} change(s).` : `Synced ${result.messagesChecked} email(s); no verified event changes were found.`);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Source sync failed.'); }
    finally { setBusy(null); }
  };

  const disconnect = async (source: ConnectedSource) => {
    setBusy(source.id); setError(null); setMessage(null);
    try { await sourceService.disconnect(eventId, source.id); setSources(prev => prev.filter(s => s.id !== source.id)); setMessage('Source disconnected.'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not disconnect source.'); }
    finally { setBusy(null); }
  };

  const webhookReady = whatsappStatus?.configured === true;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Connected Event Sources</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.35rem', lineHeight: 1.5 }}>
            EventPilot only processes messages that match this event. A source is bound to one event and cannot update another event's deadlines.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--status-ontrack)', fontSize: '0.75rem' }}><ShieldCheck size={15} /> Event-scoped access</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '0.75rem' }}>
        <div className="premium-card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.45rem' }}><Mail size={17} /><strong style={{ fontSize: '0.88rem' }}>Gmail</strong></div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', lineHeight: 1.45, minHeight: 44 }}>Read-only OAuth. EventPilot searches mail using this event's name/domain and verifies event matches before changing deadlines.</p>
          <button className="btn btn-primary" onClick={connectGmail} disabled={busy === 'gmail'} style={{ marginTop: '0.8rem', fontSize: '0.76rem' }}>{busy === 'gmail' ? 'Opening Google…' : 'Connect Gmail securely'}</button>
        </div>

        <div className="premium-card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.45rem' }}><MessageCircle size={17} /><strong style={{ fontSize: '0.88rem' }}>WhatsApp Business</strong></div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', lineHeight: 1.45 }}>
            Official WhatsApp Business/Cloud webhook. Personal WhatsApp and private-group scraping are not used.
          </p>

          <div style={{ marginTop: '0.65rem', padding: '0.65rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', fontSize: '0.72rem', lineHeight: 1.45 }}>
            {statusLoading ? 'Checking WhatsApp integration…' : webhookReady ? (
              <span style={{ color: 'var(--status-ontrack)', display: 'flex', gap: '0.35rem', alignItems: 'center' }}><CheckCircle2 size={13} /> Webhook configuration ready</span>
            ) : (
              <span style={{ color: 'var(--status-attention)', display: 'flex', gap: '0.35rem', alignItems: 'flex-start' }}><AlertTriangle size={13} style={{ marginTop: 2, flexShrink: 0 }} /> Server configuration is incomplete. Add the WhatsApp environment values before binding this event.</span>
            )}
          </div>

          <input className="input-field" value={whatsappKeywords} onChange={e => setWhatsappKeywords(e.target.value)} placeholder="Event name, comma-separated keywords" style={{ marginTop: '0.65rem', fontSize: '0.75rem' }} />
          <button className="btn btn-secondary" onClick={connectWhatsApp} disabled={!webhookReady || busy === 'whatsapp'} style={{ marginTop: '0.55rem', fontSize: '0.76rem' }}>{busy === 'whatsapp' ? 'Binding…' : whatsappSource ? 'Update event matching keywords' : 'Bind WhatsApp Business channel'}</button>
        </div>
      </div>

      {webhookReady && (
        <div style={{ padding: '0.85rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', fontSize: '0.73rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          <strong style={{ color: 'var(--text-primary)' }}>How the WhatsApp flow works</strong>
          <div style={{ marginTop: '0.35rem' }}>Incoming message → event keyword matching → ambiguous matches are rejected → deadline extraction → official deadline update → audit + team notification → planner recalculation.</div>
          <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.3rem', alignItems: 'center' }}><ExternalLink size={12} /> Webhook endpoint: <code>/api/whatsapp/webhook</code></div>
        </div>
      )}

      {websiteUrl && <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>Website source: {websiteUrl}</div>}
      {error && <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.7rem', borderRadius: 8, border: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.76rem' }}><AlertTriangle size={14} />{error}</div>}
      {message && <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.7rem', borderRadius: 8, border: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.76rem' }}><CheckCircle2 size={14} />{message}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
        {loading ? <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Loading sources…</div> : sources.length === 0 ? <div style={{ padding: '1rem', border: '1px dashed var(--border-color)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>No email or WhatsApp source is connected yet.</div> : sources.map(source => (
          <div key={source.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)' }}>
            {source.type === 'gmail' ? <Mail size={16} /> : <MessageCircle size={16} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{source.displayName}</div>
              <div style={{ color: 'var(--text-tertiary)', fontSize: '0.7rem' }}>{source.status === 'active' ? 'Active · event-scoped' : source.status}</div>
              {source.type === 'whatsapp' && source.matchKeywords.length > 0 && <div style={{ color: 'var(--text-tertiary)', fontSize: '0.68rem', marginTop: 2 }}>Matches: {source.matchKeywords.join(', ')}</div>}
              {source.lastMessageAt && source.type === 'whatsapp' && <div style={{ color: 'var(--text-tertiary)', fontSize: '0.68rem', marginTop: 2 }}>Last message processed: {new Date(source.lastMessageAt).toLocaleString()}</div>}
              {source.lastError && <div style={{ color: 'var(--status-atrisk)', fontSize: '0.68rem', marginTop: 2 }}>{source.lastError}</div>}
            </div>
            {source.status === 'active' && source.type === 'gmail' && <button className="btn-icon" title="Sync now" onClick={() => sync(source)} disabled={busy === source.id}><RefreshCw size={14} /></button>}
            <button className="btn-icon" title="Disconnect" onClick={() => disconnect(source)} disabled={busy === source.id}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.8rem', borderRadius: 8, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: '0.72rem', lineHeight: 1.5 }}><CheckCircle2 size={14} style={{ marginTop: 2, color: 'var(--status-ontrack)', flexShrink: 0 }} /><span>Only verified event matches can change official deadlines. Ambiguous messages are ignored rather than risking a cross-event update.</span></div>
    </div>
  );
};
