import React, { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useStore } from '../../store/storeContext';

const AUTO_DISMISS_MS = 6500;

const DeadlineChangeToast: React.FC = () => {
  const { deadlineChangeToast, dismissDeadlineChangeToast } = useStore();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!deadlineChangeToast) return;

    // Trigger enter animation on next frame
    setVisible(false);
    const enterFrame = requestAnimationFrame(() => setVisible(true));

    const timer = setTimeout(() => {
      setVisible(false);
      // Allow exit animation to play before clearing from state
      setTimeout(dismissDeadlineChangeToast, 300);
    }, AUTO_DISMISS_MS);

    return () => {
      cancelAnimationFrame(enterFrame);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlineChangeToast]);

  if (!deadlineChangeToast) return null;

  const oldDateFmt = new Date(deadlineChangeToast.oldDate).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric'
  });
  const newDateFmt = new Date(deadlineChangeToast.newDate).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric'
  });

  const handleClose = () => {
    setVisible(false);
    setTimeout(dismissDeadlineChangeToast, 300);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: visible ? '1.5rem' : '-2rem',
        left: '50%',
        transform: `translateX(-50%) scale(${visible ? 1 : 0.96})`,
        opacity: visible ? 1 : 0,
        transition: 'top 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease, transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        zIndex: 2000,
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--status-attention)',
        borderRadius: '12px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.02)',
        padding: '1rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        minWidth: '360px',
        maxWidth: '92vw'
      }}
      role="status"
    >
      <div
        style={{
          backgroundColor: 'var(--status-attention-bg)',
          color: 'var(--status-attention)',
          padding: '0.55rem',
          borderRadius: '8px',
          flexShrink: 0,
          display: 'flex',
          animation: visible ? 'spinDot 1.1s linear 1' : 'none'
        }}
      >
        <RefreshCw size={18} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.04em',
          color: 'var(--status-attention)',
          textTransform: 'uppercase',
          marginBottom: '0.2rem'
        }}>
          🔄 Deadline Updated
        </div>

        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.35rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {deadlineChangeToast.eventName}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
          <span
            style={{
              color: 'var(--text-tertiary)',
              textDecoration: 'line-through',
              animation: visible ? 'dateMorphOut 0.5s ease-out 0.2s both' : 'none'
            }}
          >
            {oldDateFmt}
          </span>
          <span style={{ color: 'var(--text-tertiary)' }}>→</span>
          <strong
            style={{
              color: 'var(--status-attention)',
              animation: visible ? 'dateMorphIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) 0.4s both' : 'none'
            }}
          >
            {newDateFmt}
          </strong>
        </div>

        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
          Your preparation plan has been automatically recalculated.
        </div>
      </div>

      <button
        onClick={handleClose}
        className="btn-icon"
        style={{ border: 'none', flexShrink: 0, alignSelf: 'flex-start' }}
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
};

export default DeadlineChangeToast;
