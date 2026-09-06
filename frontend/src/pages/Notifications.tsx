import React from 'react';
import { Bell, Check, X, ShieldAlert, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../store/storeContext';
import { membershipService } from '../services/membershipService';

export const Notifications: React.FC = () => {
  const { notifications, events, markNotificationRead, clearNotifications, refreshNotifications, notificationsLoading, notificationsError, refreshEvents, refreshPendingInvitations } = useStore();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleInvitation = async (notificationId: string, invitationId: string, action: 'accept' | 'decline') => {
    setActionLoading(notificationId);
    setActionError(null);
    try {
      const result = action === 'accept'
        ? await membershipService.acceptInvitation(invitationId)
        : await membershipService.declineInvitation(invitationId);

      if (!result.success) {
        setActionError(result.error || 'Could not update the team request.');
        return;
      }

      markNotificationRead(notificationId);
      await refreshNotifications();
      // Accepting adds this event to the roster; declining removes it from
      // the pending-requests list — refresh both so the change is visible
      // immediately wherever it's shown (Notifications tab + Events page).
      refreshPendingInvitations();
      if (action === 'accept') refreshEvents();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update the team request.');
    } finally {
      setActionLoading(null);
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'critical': return <ShieldAlert size={16} color="var(--status-atrisk)" />;
      case 'warning': return <AlertTriangle size={16} color="var(--status-attention)" />;
      case 'success': return <CheckCircle2 size={16} color="var(--status-ontrack)" />;
      default: return <Info size={16} color="var(--status-info)" />;
    }
  };

  const getAlertBgColor = (type: string) => {
    switch (type) {
      case 'critical': return 'var(--status-atrisk-bg)';
      case 'warning': return 'var(--status-attention-bg)';
      case 'success': return 'var(--status-ontrack-bg)';
      default: return 'var(--status-info-bg)';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '800px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 700 }}>
            Intelligent Activity Stream
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Inbox alerts grouped by priority and deadline status changes.
          </p>
        </div>

        {notifications.some(n => !n.read) && (
          <button 
            onClick={clearNotifications}
            className="btn btn-secondary" 
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem', gap: '0.35rem', borderRadius: '6px' }}
          >
            <Check size={14} />
            <span>Mark All Read</span>
          </button>
        )}
      </div>

      {notificationsLoading && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Loading notifications…</div>
      )}
      {(notificationsError || actionError) && (
        <div style={{
          padding: '10px 14px',
          borderRadius: '8px',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          background: 'rgba(239, 68, 68, 0.08)',
          color: '#ef4444',
          fontSize: '0.8rem'
        }}>
          {actionError || notificationsError}
        </div>
      )}

      {/* Feed list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {notifications.length > 0 ? (
          notifications.map(n => {
            const ev = events.find(e => e.id === n.eventId);
            
            return (
              <div
                key={n.id}
                style={{
                  display: 'flex',
                  gap: '1rem',
                  padding: '1.15rem 1.25rem',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: n.read ? 'transparent' : 'rgba(255, 255, 255, 0.01)',
                  position: 'relative',
                  transition: 'all 0.2s',
                  opacity: n.read ? 0.65 : 1
                }}
              >
                {/* Visual Unread dot indicator */}
                {!n.read && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '1.25rem',
                      left: '8px',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--primary)'
                    }}
                  />
                )}

                {/* Left icon box */}
                <div style={{
                  padding: '0.45rem',
                  borderRadius: '6px',
                  backgroundColor: getAlertBgColor(n.type),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  height: '32px',
                  width: '32px'
                }}>
                  {getAlertIcon(n.type)}
                </div>

                {/* Message body */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {ev && (
                      <span style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        backgroundColor: 'var(--bg-tertiary)',
                        color: 'var(--text-secondary)',
                        padding: '0.15rem 0.4rem',
                        borderRadius: '4px',
                        textTransform: 'uppercase'
                      }}>
                        {ev.name}
                      </span>
                    )}
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{n.timestamp}</span>
                  </div>
                  
                  <strong style={{ display: 'block', fontSize: '0.9rem', color: '#fff', marginTop: '0.35rem' }}>
                    {n.title}
                  </strong>
                  
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.15rem', lineHeight: '1.4' }}>
                    {n.message}
                  </p>

                  {n.invitationId && !n.read && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleInvitation(n.id, n.invitationId!, 'accept')}
                        disabled={actionLoading === n.id}
                        className="btn btn-primary"
                        style={{ padding: '7px 14px', fontSize: '12px', borderRadius: '7px' }}
                      >
                        {actionLoading === n.id ? 'Updating…' : 'Accept'}
                      </button>
                      <button
                        onClick={() => handleInvitation(n.id, n.invitationId!, 'decline')}
                        disabled={actionLoading === n.id}
                        className="btn btn-secondary"
                        style={{ padding: '7px 14px', fontSize: '12px', borderRadius: '7px' }}
                      >
                        Decline
                      </button>
                    </div>
                  )}
                </div>

                {/* Mark read button control */}
                {!n.read && (
                  <button
                    onClick={() => markNotificationRead(n.id)}
                    className="btn-icon"
                    style={{ padding: '0.25rem', border: 'none', background: 'transparent', alignSelf: 'flex-start' }}
                    title="Mark as read"
                  >
                    <Check size={16} />
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Bell size={24} style={{ color: 'var(--text-tertiary)', margin: '0 auto' }} />
            <span>No notifications</span>
            <span style={{ fontSize: '0.75rem' }}>Nothing needs your attention right now.</span>
          </div>
        )}
      </div>

    </div>
  );
};
