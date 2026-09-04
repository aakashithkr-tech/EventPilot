import React, { useMemo, useState } from 'react';
import { Filter, ChevronLeft, ChevronRight, Clock, CalendarDays } from 'lucide-react';
import { useStore } from '../store/storeContext';

type ViewMode = 'month' | 'week' | 'day';
type FilterMode = 'all' | 'official' | 'ai' | 'tasks';

interface CalendarItem {
  id: string;
  title: string;
  type: 'official' | 'ai' | 'task';
  color: string;
  eventName: string;
}

const toDateKey = (d: Date) => {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// "Today" is pinned to align with the rest of the app's simulated timeline.
const TODAY = new Date(2026, 7, 26); // August 26, 2026

export const Schedule: React.FC = () => {
  const { deadlines, tasks, events, deadlinesLoading, deadlinesError, refreshDeadlines } = useStore();
  const [view, setView] = useState<ViewMode>('month');
  const [filterType, setFilterType] = useState<FilterMode>('all');
  const [cursor, setCursor] = useState<Date>(new Date(2026, 8, 1)); // September 1, 2026 — where most data lives

  const getItemsForDate = (dateKey: string): CalendarItem[] => {
    const items: CalendarItem[] = [];

    deadlines.forEach(d => {
      if (d.date === dateKey) {
        const ev = events.find(e => e.id === d.eventId);
        const isOfficial = d.type === 'official';
        if (filterType === 'all' || (filterType === 'official' && isOfficial) || (filterType === 'ai' && !isOfficial)) {
          items.push({
            id: d.id,
            title: d.title,
            type: isOfficial ? 'official' : 'ai',
            color: isOfficial ? 'var(--status-atrisk)' : 'var(--status-info)',
            eventName: ev?.name || 'Event'
          });
        }
      }
    });

    tasks.forEach(t => {
      if (t.dueDate === dateKey && t.status !== 'done') {
        const ev = events.find(e => e.id === t.eventId);
        if (filterType === 'all' || filterType === 'tasks') {
          items.push({
            id: t.id,
            title: `Task: ${t.title}`,
            type: 'task',
            color: 'var(--status-ontrack)',
            eventName: ev?.name || 'Event'
          });
        }
      }
    });

    return items;
  };

  // ---- MONTH VIEW DATA ----
  const monthGrid = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDayOffset = new Date(year, month, 1).getDay(); // 0 = Sunday
    return {
      daysInMonth,
      blankDays: Array.from({ length: startDayOffset }, (_, i) => i),
      calendarDays: Array.from({ length: daysInMonth }, (_, i) => i + 1)
    };
  }, [cursor]);

  // ---- WEEK VIEW DATA ----
  const weekDays = useMemo(() => {
    const start = new Date(cursor);
    start.setDate(start.getDate() - start.getDay()); // rewind to Sunday
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  // ---- NAVIGATION ----
  const goPrev = () => {
    const next = new Date(cursor);
    if (view === 'month') next.setMonth(next.getMonth() - 1);
    else if (view === 'week') next.setDate(next.getDate() - 7);
    else next.setDate(next.getDate() - 1);
    setCursor(next);
  };

  const goNext = () => {
    const next = new Date(cursor);
    if (view === 'month') next.setMonth(next.getMonth() + 1);
    else if (view === 'week') next.setDate(next.getDate() + 7);
    else next.setDate(next.getDate() + 1);
    setCursor(next);
  };

  const goToday = () => setCursor(new Date(TODAY));

  const headerLabel = useMemo(() => {
    if (view === 'month') return `${MONTH_LABELS[cursor.getMonth()]} ${cursor.getFullYear()}`;
    if (view === 'week') {
      const start = weekDays[0];
      const end = weekDays[6];
      const sameMonth = start.getMonth() === end.getMonth();
      return sameMonth
        ? `${MONTH_LABELS[start.getMonth()]} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`
        : `${MONTH_LABELS[start.getMonth()]} ${start.getDate()} – ${MONTH_LABELS[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
    }
    return `${WEEKDAY_LABELS[cursor.getDay()]}, ${MONTH_LABELS[cursor.getMonth()]} ${cursor.getDate()}, ${cursor.getFullYear()}`;
  }, [view, cursor, weekDays]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Calendar Header Control Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 700 }}>
            Unified Calendar Operations
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Track official milestones aligned alongside AI prep sequences.
            {deadlinesLoading && <span style={{ marginLeft: '0.5rem', color: 'var(--text-tertiary)' }}>Loading…</span>}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Filter dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <Filter size={14} />
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value as FilterMode)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none', cursor: 'pointer' }}
            >
              <option value="all">All Items</option>
              <option value="official">Official Deadlines Only</option>
              <option value="ai">AI Recommendations Only</option>
              <option value="tasks">Teammate Tasks Only</option>
            </select>
          </div>

          {/* View Toggles */}
          <div style={{ display: 'flex', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.2rem' }}>
            {(['month', 'week', 'day'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: '0.3rem 0.6rem',
                  fontSize: '0.75rem',
                  borderRadius: '4px',
                  border: 'none',
                  background: view === v ? 'rgba(255,255,255,0.06)' : 'transparent',
                  color: view === v ? 'var(--text-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  textTransform: 'capitalize'
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {deadlinesError && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', background: 'rgba(220,38,38,0.08)', border: '1px solid var(--status-atrisk)', padding: '0.75rem 1rem', borderRadius: '8px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--status-atrisk)' }}>{deadlinesError}</span>
          <button onClick={refreshDeadlines} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem' }}>
            Retry
          </button>
        </div>
      )}

      {/* Legends indicator bar */}
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '0.75rem 1.25rem', borderRadius: '8px', fontSize: '0.8rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--status-atrisk)' }} />
          <span style={{ color: 'var(--text-secondary)' }}>Official Deadline</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--status-info)' }} />
          <span style={{ color: 'var(--text-secondary)' }}>AI Recommended Preparation Milestone</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--status-ontrack)' }} />
          <span style={{ color: 'var(--text-secondary)' }}>Teammate Task Due</span>
        </div>
      </div>

      {/* Date Navigation Row (shared across views) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>{headerLabel}</h3>
        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
          <button onClick={goToday} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem', borderRadius: '6px' }}>
            Today
          </button>
          <button onClick={goPrev} className="btn-icon" style={{ padding: '0.3rem' }}><ChevronLeft size={16} /></button>
          <button onClick={goNext} className="btn-icon" style={{ padding: '0.3rem' }}><ChevronRight size={16} /></button>
        </div>
      </div>

      {/* MONTH VIEW GRID */}
      {view === 'month' && (
        <div className="premium-card" style={{ padding: '1rem', overflowX: 'auto' }}>
          <div style={{ minWidth: '640px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '0.5rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            {WEEKDAY_LABELS.map(d => <span key={d}>{d}</span>)}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '0.5rem', minHeight: '400px' }}>
            {monthGrid.blankDays.map(bd => (
              <div key={`blank-${bd}`} style={{ background: 'rgba(255,255,255,0.01)', borderRadius: '4px', border: '1px solid transparent' }} />
            ))}

            {monthGrid.calendarDays.map(dayNum => {
              const dateObj = new Date(cursor.getFullYear(), cursor.getMonth(), dayNum);
              const dateKey = toDateKey(dateObj);
              const dateItems = getItemsForDate(dateKey);
              const isToday = toDateKey(dateObj) === toDateKey(TODAY);

              return (
                <div
                  key={`day-${dayNum}`}
                  onClick={() => { setCursor(dateObj); setView('day'); }}
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: isToday ? '1px solid var(--border-hover)' : '1px solid var(--border-color)',
                    borderRadius: '6px',
                    padding: '0.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: '80px',
                    minWidth: 0,
                    gap: '0.25rem',
                    cursor: 'pointer'
                  }}
                >
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: isToday ? 'var(--primary)' : 'var(--text-secondary)',
                    alignSelf: 'flex-start',
                    background: isToday ? 'var(--primary-glow)' : 'transparent',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {dayNum}
                  </span>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', overflow: 'hidden' }}>
                    {dateItems.map(item => (
                      <div
                        key={item.id}
                        style={{
                          fontSize: '0.65rem',
                          background: `${item.color}15`,
                          borderLeft: `2.5px solid ${item.color}`,
                          padding: '0.15rem 0.35rem',
                          borderRadius: '2px',
                          color: 'var(--text-primary)',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden'
                        }}
                        title={`${item.eventName}: ${item.title}`}
                      >
                        {item.title}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        </div>
      )}

      {/* WEEK VIEW */}
      {view === 'week' && (
        <div className="premium-card" style={{ padding: '1rem', overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '0.6rem', minWidth: '640px' }}>
            {weekDays.map(d => {
              const dateKey = toDateKey(d);
              const dateItems = getItemsForDate(dateKey);
              const isToday = dateKey === toDateKey(TODAY);
              return (
                <div key={dateKey} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: '260px', minWidth: 0 }}>
                  <div
                    onClick={() => { setCursor(d); setView('day'); }}
                    style={{
                      textAlign: 'center',
                      padding: '0.4rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      background: isToday ? 'var(--primary-glow)' : 'var(--bg-tertiary)',
                      border: isToday ? '1px solid var(--border-hover)' : '1px solid var(--border-color)'
                    }}
                  >
                    <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      {WEEKDAY_LABELS[d.getDay()]}
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: isToday ? 'var(--primary)' : 'var(--text-primary)' }}>
                      {d.getDate()}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1 }}>
                    {dateItems.length === 0 ? (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textAlign: 'center', paddingTop: '0.5rem' }}>—</div>
                    ) : dateItems.map(item => (
                      <div
                        key={item.id}
                        style={{
                          fontSize: '0.68rem',
                          background: `${item.color}15`,
                          borderLeft: `2.5px solid ${item.color}`,
                          padding: '0.3rem 0.4rem',
                          borderRadius: '4px',
                          color: 'var(--text-primary)',
                          lineHeight: 1.3
                        }}
                        title={`${item.eventName}: ${item.title}`}
                      >
                        {item.title}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* DAY VIEW */}
      {view === 'day' && (
        <div className="premium-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {(() => {
            const dateKey = toDateKey(cursor);
            const dateItems = getItemsForDate(dateKey);
            const isToday = dateKey === toDateKey(TODAY);

            if (dateItems.length === 0) {
              return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <CalendarDays size={28} style={{ color: 'var(--text-tertiary)' }} />
                  <p style={{ fontSize: '0.9rem' }}>Nothing scheduled for this day.</p>
                  {isToday && <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>You're all caught up — enjoy the quiet.</p>}
                </div>
              );
            }

            return dateItems.map(item => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.85rem',
                  padding: '0.85rem 1rem',
                  borderRadius: '8px',
                  background: `${item.color}0d`,
                  border: `1px solid ${item.color}33`
                }}
              >
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: item.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{item.title}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.eventName}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>
                  <Clock size={12} />
                  {item.type === 'official' ? 'Deadline' : item.type === 'ai' ? 'AI Milestone' : 'Task'}
                </div>
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
};
