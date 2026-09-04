import React from 'react';
import { 
  Sparkles, 
  AlertCircle, 
  Clock, 
  ArrowRight, 
  Calendar, 
  PlusCircle, 
  TrendingUp, 
  ShieldAlert 
} from 'lucide-react';
import { useStore } from '../store/storeContext';
import { useAuth } from '../store/authContext';
import { Event } from '../types';

interface DashboardProps {
  onSelectEvent: (id: string) => void;
  onStartOnboarding: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onSelectEvent, onStartOnboarding }) => {
  const { events, tasks, deadlines, teamMembers, eventsLoading, eventsError, refreshEvents } = useStore();
  const { currentUser } = useAuth();

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    e.currentTarget.style.setProperty('--mouse-x', `${x}px`);
    e.currentTarget.style.setProperty('--mouse-y', `${y}px`);
  };

  // Helper to format remaining time
  const getRemainingTimeStr = (deadlineStr: string) => {
    const finalDate = new Date(deadlineStr);
    const today = new Date('2026-08-26T22:00:00Z'); // Pinned relative today
    const diffMs = finalDate.getTime() - today.getTime();
    
    if (diffMs <= 0) return 'Concluded';

    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (diffDays > 0) {
      return `${diffDays}d ${diffHours}h remaining`;
    }
    return `${diffHours}h remaining`;
  };

  // 1. Gather Attention Items (High Priority incomplete tasks)
  const getAttentionItems = () => {
    const items: { id: string; text: string; severity: 'critical' | 'warning' | 'info'; eventName: string }[] = [];
    
    // Check At Risk events first
    events.forEach(e => {
      if (e.status === 'at-risk') {
        items.push({
          id: `ev-risk-${e.id}`,
          text: `Event health is critical. ${e.nextAction}`,
          severity: 'critical',
          eventName: e.name
        });
      } else if (e.status === 'needs-attention') {
        items.push({
          id: `ev-warn-${e.id}`,
          text: `${e.nextAction}`,
          severity: 'warning',
          eventName: e.name
        });
      }
    });

    // Check critical tasks
    tasks.filter(t => t.status !== 'done' && t.priority === 'critical').forEach(t => {
      const e = events.find(ev => ev.id === t.eventId);
      if (e) {
        items.push({
          id: `task-crit-${t.id}`,
          text: `Task overdue: ${t.title}`,
          severity: 'critical',
          eventName: e.name
        });
      }
    });

    return items.slice(0, 3); // Return top 3 attention items
  };

  const attentionItems = getAttentionItems();

  // 2. Upcoming Deadlines
  const upcomingDeadlines = deadlines
    .filter(d => new Date(d.date) >= new Date('2026-08-26'))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 4);

  // Status Badge Helper
  const getStatusBadgeClass = (status: Event['status']) => {
    switch (status) {
      case 'on-track': return 'badge-ontrack';
      case 'needs-attention': return 'badge-attention';
      case 'at-risk': return 'badge-atrisk';
      default: return 'badge-info';
    }
  };

  const getStatusText = (status: Event['status']) => {
    switch (status) {
      case 'on-track': return 'On Track';
      case 'needs-attention': return 'Needs Attention';
      case 'at-risk': return 'At Risk';
      default: return 'Information';
    }
  };

  if (eventsLoading && events.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
        Loading your dashboard…
      </div>
    );
  }

  if (eventsError && events.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center' }}>
        <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', borderRadius: '12px', marginBottom: '1.5rem' }}>
          <AlertCircle size={32} />
        </div>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          Couldn't load your dashboard.
        </h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', lineHeight: '1.5', marginBottom: '1.5rem' }}>
          {eventsError}
        </p>
        <button onClick={refreshEvents} className="btn btn-primary" style={{ gap: '0.5rem' }}>
          <span>Retry</span>
        </button>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center' }}>
        <div style={{ padding: '1rem', background: 'var(--primary-glow)', color: 'var(--primary)', borderRadius: '12px', marginBottom: '1.5rem' }}>
          <Sparkles size={32} />
        </div>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          Your command center is quiet.
        </h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', lineHeight: '1.5', marginBottom: '1.5rem' }}>
          Add your first event and let the AI handle the rest. Paste a URL or upload a guideline rules document.
        </p>
        <button onClick={onStartOnboarding} className="btn btn-primary" style={{ gap: '0.5rem' }}>
          <PlusCircle size={18} />
          <span>Add Your First Event</span>
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Greetings area */}
      <div>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 700, marginBottom: '0.25rem' }}>
          Good evening, {currentUser?.name || 'there'} 👋
        </h1>
        {attentionItems.length > 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            You have <span style={{ color: 'var(--status-atrisk)', fontWeight: 600 }}>{attentionItems.length} things</span> that need your attention.
          </p>
        ) : (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            🎉 You are all caught up. All systems operational.
          </p>
        )}
      </div>

      {/* Attention banner stack */}
      {attentionItems.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {attentionItems.map(item => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '1rem 1.25rem',
                borderRadius: '8px',
                border: `1px solid ${
                  item.severity === 'critical' ? 'var(--status-atrisk-border)' : 'var(--status-attention-border)'
                }`,
                backgroundColor: `${
                  item.severity === 'critical' ? 'var(--status-atrisk-bg)' : 'var(--status-attention-bg)'
                }`,
                color: item.severity === 'critical' ? '#ff9999' : '#ffcc88'
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: '0.875rem' }}>
                <strong style={{ color: '#fff' }}>[{item.eventName}]</strong>: {item.text}
              </div>
              <button 
                onClick={() => {
                  const ev = events.find(e => e.name === item.eventName);
                  if (ev) onSelectEvent(ev.id);
                }}
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  border: 'none',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '4px',
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                Resolve
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Primary Dashboard Grid: Active Workspace list + Deadlines panel */}
      <div className="split-grid" style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr', gap: '2rem', alignItems: 'start' }}>
        
        {/* Active Events List */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Active Workspace Hub</h2>
            <button 
              onClick={onStartOnboarding}
              className="btn btn-secondary" 
              style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem', gap: '0.35rem', borderRadius: '6px' }}
            >
              <PlusCircle size={14} />
              <span>Import Event</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {events.map((ev) => (
              <div
                key={ev.id}
                onClick={() => onSelectEvent(ev.id)}
                onMouseMove={handleMouseMove}
                className="premium-card active-card glowing-card"
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem'
                }}
              >
                {/* Custom styling inject for animations */}
                <style>{`
                  .active-card:hover {
                    transform: translateY(-2px);
                  }
                  .active-card:hover .action-prompt {
                    opacity: 1 !important;
                    transform: translateX(0) !important;
                  }
                  .active-card:hover .progress-fill-bar {
                    box-shadow: 0 0 10px var(--primary);
                  }
                `}</style>

                {/* Top Row: Details */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 700 }}>
                      {ev.type}
                    </span>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginTop: '0.15rem' }}>{ev.name}</h3>
                  </div>
                  
                  <span className={`badge ${getStatusBadgeClass(ev.status)}`}>
                    <span style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: ev.status === 'on-track' ? 'var(--status-ontrack)' : ev.status === 'needs-attention' ? 'var(--status-attention)' : 'var(--status-atrisk)'
                    }} />
                    <span>{getStatusText(ev.status)}</span>
                  </span>
                </div>

                {/* Middle Row: Countdown Timer & Timeline Progress */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', padding: '0.85rem 0' }}>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <Clock size={15} style={{ color: 'var(--primary)' }} />
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                      {getRemainingTimeStr(ev.finalDeadline)}
                    </span>
                  </div>

                  <div style={{ flex: 1, minWidth: '150px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                      <span>Workflow Health</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ev.progress}%</span>
                    </div>
                    <div style={{ height: '6px', width: '100%', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div 
                        className="progress-fill-bar"
                        style={{ 
                          height: '100%', 
                          width: `${ev.progress}%`, 
                          background: ev.status === 'on-track' ? 'var(--status-ontrack)' : ev.status === 'needs-attention' ? 'var(--status-attention)' : 'var(--status-atrisk)', 
                          borderRadius: '4px',
                          transition: 'width 0.5s ease-out'
                        }} 
                      />
                    </div>
                  </div>

                </div>

                {/* Footer Action prompt */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Next Priority: <strong style={{ color: 'var(--text-primary)' }}>{ev.nextAction}</strong>
                  </div>
                  <div 
                    className="action-prompt"
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.25rem', 
                      fontSize: '0.8rem', 
                      color: 'var(--primary)', 
                      opacity: 0.6,
                      transform: 'translateX(-4px)',
                      transition: 'all 0.25s',
                      fontWeight: 600
                    }}
                  >
                    <span>Open Workspace</span>
                    <ArrowRight size={14} />
                  </div>
                </div>

              </div>
            ))}
          </div>
        </div>

        {/* Side Panel: Upcoming Deadlines */}
        <div className="premium-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
            <Calendar size={18} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Upcoming Milestones</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {upcomingDeadlines.map((d) => {
              const ev = events.find(e => e.id === d.eventId);
              const daysLeft = Math.ceil((new Date(d.date).getTime() - new Date('2026-08-26').getTime()) / (1000 * 60 * 60 * 24));
              
              return (
                <div 
                  key={d.id} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'flex-start', 
                    gap: '0.75rem',
                    paddingBottom: '0.75rem',
                    borderBottom: '1px solid rgba(255,255,255,0.02)'
                  }}
                >
                  <div style={{
                    fontSize: '0.7rem',
                    background: 'var(--bg-tertiary)',
                    padding: '0.35rem 0.5rem',
                    borderRadius: '4px',
                    textAlign: 'center',
                    minWidth: '55px'
                  }}>
                    <span style={{ display: 'block', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)' }}>
                      {daysLeft <= 0 ? 'Today' : `${daysLeft} days`}
                    </span>
                  </div>

                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div 
                      style={{ 
                        fontSize: '0.8rem', 
                        fontWeight: 500, 
                        color: 'var(--text-primary)',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden'
                      }}
                      title={d.title}
                    >
                      {d.title}
                    </div>
                    {ev && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                        {ev.name}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

    </div>
  );
};
