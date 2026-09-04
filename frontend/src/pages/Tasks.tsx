import React from 'react';
import { CheckSquare, AlertCircle, Plus, Calendar } from 'lucide-react';
import { useStore } from '../store/storeContext';

export const Tasks: React.FC = () => {
  const { tasks, events, updateTaskStatus, tasksLoading, tasksError, refreshTasks } = useStore();

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'var(--status-atrisk)';
      case 'high': return 'var(--status-attention)';
      default: return 'var(--text-secondary)';
    }
  };

  const getEventName = (eventId: string) => {
    return events.find(e => e.id === eventId)?.name || 'Event';
  };

  const getAssigneeName = (task: (typeof tasks)[number]) => {
    return task.assignee?.name || 'Unassigned';
  };

  const pendingTasks = tasks.filter(t => t.status !== 'done');
  const completedTasks = tasks.filter(t => t.status === 'done');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '800px' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 700 }}>
          Teammate Action Tasks
        </h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Unified checklist compiling outstanding operations work.
        </p>
      </div>

      {tasksError && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', background: 'rgba(220,38,38,0.08)', border: '1px solid var(--status-atrisk)', padding: '0.75rem 1rem', borderRadius: '8px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--status-atrisk)' }}>{tasksError}</span>
          <button onClick={refreshTasks} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem' }}>
            Retry
          </button>
        </div>
      )}

      {/* Task Summary stats */}
      <div style={{ display: 'flex', gap: '1rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Pending Tasks</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.2rem' }}>{pendingTasks.length}</div>
        </div>
        <div style={{ width: '1px', backgroundColor: 'var(--border-color)' }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Completed</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.2rem', color: 'var(--status-ontrack)' }}>{completedTasks.length}</div>
        </div>
      </div>

      {/* Pending lists */}
      <div className="premium-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Active checklists ({pendingTasks.length})</h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {tasksLoading ? (
            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Loading tasks…
            </div>
          ) : pendingTasks.length > 0 ? (
            pendingTasks.map(t => (
              <div 
                key={t.id} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '1rem', 
                  background: 'var(--bg-tertiary)', 
                  padding: '0.75rem 1rem', 
                  borderRadius: '6px', 
                  border: '1px solid var(--border-color)' 
                }}
              >
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => void updateTaskStatus(t.id, 'done')}
                  style={{ cursor: 'pointer' }}
                />
                
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>{t.title}</span>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.15rem' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                      Workspace: <strong>{getEventName(t.eventId)}</strong>
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>•</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                      Assignee: <strong>{getAssigneeName(t)}</strong>
                    </span>
                  </div>
                </div>

                {t.dueDate && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    <Calendar size={12} />
                    <span>Due {t.dueDate}</span>
                  </div>
                )}

                <span style={{ 
                  fontSize: '0.65rem', 
                  fontWeight: 700, 
                  textTransform: 'uppercase', 
                  color: getPriorityColor(t.priority) 
                }}>
                  {t.priority}
                </span>
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              🎉 You're all caught up. No tasks remaining.
            </div>
          )}
        </div>
      </div>

    </div>
  );
};
