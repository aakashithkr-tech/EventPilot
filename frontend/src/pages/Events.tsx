import React, { useMemo, useState } from 'react';
import {
  Sparkles,
  Clock,
  ArrowRight,
  PlusCircle,
  Search,
  Users,
  Rocket,
  Trophy,
  Mic,
  GraduationCap
} from 'lucide-react';
import { useStore } from '../store/storeContext';
import { Event, EventStatus, EventType } from '../types';

interface EventsProps {
  onSelectEvent: (id: string) => void;
  onOpenSources: (id: string) => void;
  onStartOnboarding: () => void;
}

const TYPE_ICON: Record<EventType, React.ElementType> = {
  hackathon: Rocket,
  competition: Trophy,
  conference: Mic,
  workshop: GraduationCap
};

export const Events: React.FC<EventsProps> = ({ onSelectEvent, onOpenSources, onStartOnboarding }) => {
  const { events, eventsLoading, eventsError, refreshEvents, updateEvent, removeEvent } = useStore();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | EventStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | EventType>('all');
  const [sortBy, setSortBy] = useState<'deadline' | 'progress' | 'name'>('deadline');
  const [actionEventId, setActionEventId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    e.currentTarget.style.setProperty('--mouse-x', `${x}px`);
    e.currentTarget.style.setProperty('--mouse-y', `${y}px`);
  };

  const getStatusBadgeClass = (status: EventStatus) => {
    switch (status) {
      case 'on-track': return 'badge-ontrack';
      case 'needs-attention': return 'badge-attention';
      case 'at-risk': return 'badge-atrisk';
      default: return 'badge-info';
    }
  };

  const getStatusText = (status: EventStatus) => {
    switch (status) {
      case 'on-track': return 'On Track';
      case 'needs-attention': return 'Needs Attention';
      case 'at-risk': return 'At Risk';
      default: return 'Information';
    }
  };

  const renameEvent = async (ev: Event) => {
    const nextName = window.prompt('Give this event a personalized name:', ev.name)?.trim();
    if (!nextName || nextName === ev.name) return;
    setActionBusy(ev.id);
    try {
      await updateEvent(ev.id, { name: nextName });
    } finally {
      setActionBusy(null);
      setActionEventId(null);
    }
  };

  const deleteEvent = async (ev: Event) => {
    const confirmed = window.confirm(`Delete “${ev.name}” permanently? This removes its deadlines, tasks, team, invitations, resources, updates and connected sources.`);
    if (!confirmed) return;
    setActionBusy(ev.id);
    try {
      await removeEvent(ev.id);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not delete this event.');
    } finally {
      setActionBusy(null);
      setActionEventId(null);
    }
  };

  const getRemainingTimeStr = (deadlineStr: string) => {
    const finalDate = new Date(deadlineStr);
    const today = new Date('2026-08-26T22:00:00Z');
    const diffMs = finalDate.getTime() - today.getTime();

    if (diffMs <= 0) return 'Concluded';

    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (diffDays > 0) return `${diffDays}d ${diffHours}h left`;
    return `${diffHours}h left`;
  };

  const filteredEvents = useMemo(() => {
    let result = events.filter((ev: Event) => {
      const matchesQuery =
        query.trim() === '' ||
        ev.name.toLowerCase().includes(query.toLowerCase()) ||
        ev.type.toLowerCase().includes(query.toLowerCase()) ||
        ev.description.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = statusFilter === 'all' || ev.status === statusFilter;
      const matchesType = typeFilter === 'all' || ev.type === typeFilter;
      return matchesQuery && matchesStatus && matchesType;
    });

    result = [...result].sort((a, b) => {
      if (sortBy === 'deadline') {
        return new Date(a.finalDeadline).getTime() - new Date(b.finalDeadline).getTime();
      }
      if (sortBy === 'progress') {
        return b.progress - a.progress;
      }
      return a.name.localeCompare(b.name);
    });

    return result;
  }, [events, query, statusFilter, typeFilter, sortBy]);

  const statusCounts = useMemo(() => ({
    all: events.length,
    'on-track': events.filter(e => e.status === 'on-track').length,
    'needs-attention': events.filter(e => e.status === 'needs-attention').length,
    'at-risk': events.filter(e => e.status === 'at-risk').length,
  }), [events]);

  if (eventsLoading && events.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
        Loading your events…
      </div>
    );
  }

  if (eventsError && events.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center' }}>
        <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', borderRadius: '12px', marginBottom: '1.5rem' }}>
          <Sparkles size={32} />
        </div>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 600, marginBottom: '0.5rem' }}>Couldn't load your events.</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '380px', marginBottom: '1.5rem' }}>
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
        <h2 style={{ fontSize: '1.35rem', fontWeight: 600, marginBottom: '0.5rem' }}>Your command center is quiet.</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '380px', marginBottom: '1.5rem' }}>
          Add your first event and let the AI handle the rest.
        </p>
        <button onClick={onStartOnboarding} className="btn btn-primary" style={{ gap: '0.5rem' }}>
          <PlusCircle size={16} />
          <span>Add Your First Event</span>
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', maxWidth: '1100px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', fontWeight: 700, marginBottom: '0.25rem' }}>
            Events
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Every workspace EventPilot is tracking for you, in one place.
          </p>
        </div>
        <button
          onClick={onStartOnboarding}
          className="btn btn-primary"
          style={{ gap: '0.5rem', padding: '0.55rem 1rem', borderRadius: '8px' }}
        >
          <PlusCircle size={16} />
          <span>Add Event</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="premium-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', padding: '0.85rem 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.45rem 0.7rem', flex: '1 1 220px' }}>
          <Search size={15} style={{ color: 'var(--text-tertiary)' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events by name or type..."
            style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.85rem', width: '100%' }}
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'all' | EventType)}
          className="btn btn-secondary"
          style={{ fontSize: '0.8rem', padding: '0.45rem 0.6rem', borderRadius: '6px' }}
        >
          <option value="all">All Types</option>
          <option value="hackathon">Hackathon</option>
          <option value="competition">Competition</option>
          <option value="conference">Conference</option>
          <option value="workshop">Workshop</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'deadline' | 'progress' | 'name')}
          className="btn btn-secondary"
          style={{ fontSize: '0.8rem', padding: '0.45rem 0.6rem', borderRadius: '6px' }}
        >
          <option value="deadline">Sort: Nearest Deadline</option>
          <option value="progress">Sort: Progress</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>

      {/* Status Filter Pills */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {([
          { key: 'all', label: 'All' },
          { key: 'on-track', label: 'On Track' },
          { key: 'needs-attention', label: 'Needs Attention' },
          { key: 'at-risk', label: 'At Risk' },
        ] as const).map(pill => (
          <button
            key={pill.key}
            onClick={() => setStatusFilter(pill.key)}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: '999px',
              fontSize: '0.78rem',
              fontWeight: 600,
              border: `1px solid ${statusFilter === pill.key ? 'var(--border-hover)' : 'var(--border-color)'}`,
              background: statusFilter === pill.key ? 'var(--primary-glow)' : 'transparent',
              color: statusFilter === pill.key ? 'var(--primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            {pill.label} · {statusCounts[pill.key]}
          </button>
        ))}
      </div>

      {/* Results */}
      {filteredEvents.length === 0 ? (
        <div className="premium-card" style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-secondary)' }}>
          No events match your filters.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
          {filteredEvents.map(ev => {
            const TypeIcon = TYPE_ICON[ev.type] ?? Rocket;
            return (
              <div
                key={ev.id}
                onClick={() => onSelectEvent(ev.id)}
                onMouseMove={handleMouseMove}
                className="premium-card active-card glowing-card"
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
              >
                <style>{`
                  .active-card:hover { transform: translateY(-2px); }
                  .active-card:hover .action-prompt { opacity: 1 !important; transform: translateX(0) !important; }
                `}</style>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', minWidth: 0 }}>
                    <div style={{ padding: '0.5rem', borderRadius: '8px', background: 'var(--bg-tertiary)', color: 'var(--primary)', flexShrink: 0 }}>
                      <TypeIcon size={16} />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 700 }}>
                        {ev.type}
                      </span>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginTop: '0.1rem' }}>{ev.name}</h3>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
                    <span className={`badge ${getStatusBadgeClass(ev.status)}`}>
                      <span style={{
                        width: '6px', height: '6px', borderRadius: '50%',
                        backgroundColor: ev.status === 'on-track' ? 'var(--status-ontrack)' : ev.status === 'needs-attention' ? 'var(--status-attention)' : 'var(--status-atrisk)'
                      }} />
                      <span>{getStatusText(ev.status)}</span>
                    </span>
                    <button
                      type="button"
                      className="btn-icon"
                      title="Event actions"
                      onClick={(e) => { e.stopPropagation(); setActionEventId(actionEventId === ev.id ? null : ev.id); }}
                      disabled={actionBusy === ev.id}
                    >
                      ⋯
                    </button>
                    {actionEventId === ev.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 170, zIndex: 20, padding: 6, border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', boxShadow: '0 12px 35px rgba(0,0,0,.3)' }}
                      >
                        <button type="button" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 4, fontSize: '0.75rem' }} onClick={() => void renameEvent(ev)}>Rename event</button>
                        <button type="button" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 4, fontSize: '0.75rem' }} onClick={() => { onSelectEvent(ev.id); setActionEventId(null); }}>Open workspace</button>
                        <button type="button" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 4, fontSize: '0.75rem' }} onClick={() => { onOpenSources(ev.id); setActionEventId(null); }}>Connect sources</button>
                        <button type="button" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'flex-start', color: 'var(--status-atrisk)', borderColor: 'rgba(239,68,68,.35)', fontSize: '0.75rem' }} onClick={() => void deleteEvent(ev)}>Delete event</button>
                      </div>
                    )}
                  </div>
                </div>

                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {ev.description}
                </p>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <span>Progress</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ev.progress}%</span>
                </div>
                <div style={{ height: '6px', width: '100%', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${ev.progress}%`,
                    background: ev.status === 'on-track' ? 'var(--status-ontrack)' : ev.status === 'needs-attention' ? 'var(--status-attention)' : 'var(--status-atrisk)',
                    borderRadius: '4px', transition: 'width 0.5s ease-out'
                  }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Clock size={13} style={{ color: 'var(--primary)' }} />
                      {getRemainingTimeStr(ev.finalDeadline)}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Users size={13} />
                      {ev.teamSize}
                    </span>
                  </div>
                  <div
                    className="action-prompt"
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.78rem',
                      color: 'var(--primary)', opacity: 0.6, transform: 'translateX(-4px)',
                      transition: 'all 0.25s', fontWeight: 600
                    }}
                  >
                    <span>Open</span>
                    <ArrowRight size={13} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
