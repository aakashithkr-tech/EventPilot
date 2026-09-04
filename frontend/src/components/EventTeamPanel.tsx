import React, { useEffect, useState } from 'react';
import { UserPlus, Trash2, RefreshCw, Users, Mail } from 'lucide-react';
import { EventMembership } from '../types';
import { membershipService } from '../services/membershipService';
import { InviteMemberModal } from './ui/InviteMemberModal';

interface Props { eventId: string; eventName: string; onTeamChanged?: () => void; }

export const EventTeamPanel: React.FC<Props> = ({ eventId, eventName, onTeamChanged }) => {
  const [members, setMembers] = useState<EventMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = async () => {
    setLoading(true); setError(null);
    try { setMembers(await membershipService.getEventMembers(eventId)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load the event team.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [eventId]);

  const remove = async (member: EventMembership) => {
    if (member.role === 'owner') return;
    if (!window.confirm(`Remove ${member.user?.name || member.user?.email || 'this member'} from this event?`)) return;
    setBusy(member.userId); setError(null);
    const result = await membershipService.removeMembership(eventId, member.userId);
    if (!result.success) setError(result.error || 'Could not remove this member.');
    else { await load(); onTeamChanged?.(); }
    setBusy(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Event Team</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.35rem' }}>Manage the people who have access to this event. Membership is isolated per event.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => void load()} disabled={loading} style={{ gap: '0.35rem', fontSize: '0.78rem' }}><RefreshCw size={13} />Refresh</button>
          <button className="btn btn-primary" onClick={() => setInviteOpen(true)} style={{ gap: '0.35rem', fontSize: '0.78rem' }}><UserPlus size={14} />Add member</button>
        </div>
      </div>

      {error && <div style={{ padding: '0.75rem', border: '1px solid var(--status-atrisk)', borderRadius: 8, color: 'var(--status-atrisk)', fontSize: '0.78rem' }}>{error}</div>}

      <div className="premium-card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? <div style={{ padding: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Loading team…</div> : members.length === 0 ? <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}><Users size={24} style={{ marginBottom: 8 }} /><div>No members yet.</div></div> : members.map(member => {
          const name = member.user?.name || member.user?.email || 'Unknown member';
          return <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{name.charAt(0).toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}><strong style={{ display: 'block', fontSize: '0.86rem' }}>{name}</strong><span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-tertiary)', fontSize: '0.72rem', marginTop: 3 }}><Mail size={11} />{member.user?.email || '—'}</span></div>
            <span className="badge badge-info" style={{ textTransform: 'capitalize', fontSize: '0.65rem' }}>{member.role}</span>
            {member.role !== 'owner' && <button className="btn-icon" title="Remove from event" onClick={() => void remove(member)} disabled={busy === member.userId}>{busy === member.userId ? <RefreshCw size={14} /> : <Trash2 size={14} />}</button>}
          </div>;
        })}
      </div>

      <div style={{ padding: '0.8rem', borderRadius: 8, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: '0.72rem', lineHeight: 1.5 }}>
        Invite roles available: Lead, Admin, Developer, Member. Invitations are sent to an EventPilot account email; the recipient accepts from their account.
      </div>

      <InviteMemberModal isOpen={inviteOpen} onClose={() => setInviteOpen(false)} eventId={eventId} eventName={eventName} onSuccess={() => { void load(); onTeamChanged?.(); }} />
    </div>
  );
};
