import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Clock, 
  Calendar, 
  Sparkles, 
  CheckSquare, 
  Users, 
  FileText, 
  RefreshCw, 
  Plus, 
  Bot, 
  FileDown,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  Briefcase,
  Settings,
  X
} from 'lucide-react';
import { useStore } from '../store/storeContext';
import { plannerService, PlannerResult } from '../services/plannerService';
import { Task, Requirement, EventMembership } from '../types';
import { membershipService } from '../services/membershipService';
import { ApiError } from '../services/api';
import { EventSourcesPanel } from '../components/sources/EventSourcesPanel';
import { EventSettingsPanel } from '../components/EventSettingsPanel';
import { EventTeamPanel } from '../components/EventTeamPanel';
import { DeadlineManager } from '../components/DeadlineManager';

interface EventWorkspaceProps {
  onBack: () => void;
  openAIAgent: () => void;
  initialTab?: 'overview' | 'timeline' | 'tasks' | 'requirements' | 'team' | 'resources' | 'updates' | 'sources' | 'settings';
}

export const EventWorkspace: React.FC<EventWorkspaceProps> = ({ onBack, openAIAgent, initialTab = 'overview' }) => {
  const { 
    events, 
    activeEventId, 
    deadlines, 
    requirements, 
    resources, 
    teamMembers, 
    tasks, 
    updates,
    updatesLoading,
    updatesError,
    refreshUpdates,
    toggleRequirement,
    updateTaskStatus,
    addTask,
    triggerDeadlineChangeSimulation,
    updateEvent,
    removeEvent,
    refreshDeadlines
  } = useStore();

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    e.currentTarget.style.setProperty('--mouse-x', `${x}px`);
    e.currentTarget.style.setProperty('--mouse-y', `${y}px`);
  };

  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'tasks' | 'requirements' | 'team' | 'resources' | 'updates' | 'sources' | 'settings'>(initialTab);
  const [taskView, setTaskView] = useState<'list' | 'kanban'>('kanban');
  const [prepPlan, setPrepPlan] = useState<PlannerResult | null>(null);
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [plannerError, setPlannerError] = useState<string | null>(null);

  // Interactive UI modals/drawers
  const [selectedRequirement, setSelectedRequirement] = useState<Requirement | null>(null);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<Task['priority']>('medium');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [addTaskError, setAddTaskError] = useState<string | null>(null);

  // Real event roster (EventMembership, Feature 3) — used only for the
  // Tasks tab's assignee picker/resolution. The Team tab's workload view
  // below is still the separate mock TeamMember concept (see README).
  const [realRoster, setRealRoster] = useState<EventMembership[]>([]);

  useEffect(() => {
    if (!activeEventId) return;
    let cancelled = false;
    membershipService.getEventMembers(activeEventId).then((members) => {
      if (!cancelled) setRealRoster(members);
    }).catch(() => {
      if (!cancelled) setRealRoster([]);
    });
    return () => {
      cancelled = true;
    };
  }, [activeEventId]);

  const event = events.find(e => e.id === activeEventId);

  const eventDeadlines = event ? deadlines
    .filter(d => d.eventId === event.id)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    : [];
  const eventRequirements = event ? requirements.filter(r => r.eventId === event.id) : [];
  const eventResources = event ? resources.filter(res => res.eventId === event.id) : [];
  const eventTeam = realRoster;
  const eventTasks = event ? tasks.filter(t => t.eventId === event.id) : [];
  const eventUpdates = event ? updates.filter(up => up.eventId === event.id) : [];
  const plannerRequirementsKey = eventRequirements.map(r => `${r.id}:${r.completed}`).join('|');
  const plannerTasksKey = eventTasks.map(t => `${t.id}:${t.status}:${t.dueDate || ''}:${t.priority}`).join('|');

  useEffect(() => {
    // Keep this hook unconditional. If there is no active event, simply clear the planner state.
    if (!event) {
      setPrepPlan(null);
      setPlannerLoading(false);
      setPlannerError(null);
      return;
    }

    let cancelled = false;
    setPlannerLoading(true);
    setPlannerError(null);
    plannerService.get(event.id)
      .then((plan) => { if (!cancelled) setPrepPlan(plan); })
      .catch((err) => { if (!cancelled) setPlannerError(err instanceof Error ? err.message : 'Could not load the preparation plan.'); })
      .finally(() => { if (!cancelled) setPlannerLoading(false); });
    return () => { cancelled = true; };
  }, [event?.id, event?.finalDeadline, plannerRequirementsKey, plannerTasksKey]);

  if (!event) return <div>Event not found.</div>;

  const recalculatePlanner = async () => {
    setPlannerLoading(true);
    setPlannerError(null);
    try {
      const plan = await plannerService.recalculate(event.id);
      setPrepPlan(plan);
    } catch (err) {
      setPlannerError(err instanceof Error ? err.message : 'Could not recalculate the preparation plan.');
    } finally {
      setPlannerLoading(false);
    }
  };

  // Countdown parser
  const getRemainingDaysHours = (deadlineStr: string) => {
    const finalDate = new Date(deadlineStr);
    const today = new Date('2026-08-26T22:00:00Z');
    const diffMs = finalDate.getTime() - today.getTime();
    if (diffMs <= 0) return 'Concluded';

    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${diffDays} days ${diffHours} hours`;
  };

  const handleAddTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    setIsSubmittingTask(true);
    setAddTaskError(null);

    try {
      await addTask({
        eventId: event.id,
        title: newTaskTitle,
        assigneeId: newTaskAssignee || undefined,
        dueDate: newTaskDueDate || undefined,
        priority: newTaskPriority,
        status: 'todo'
      });

      setNewTaskTitle('');
      setNewTaskAssignee('');
      setNewTaskPriority('medium');
      setNewTaskDueDate('');
      setIsAddingTask(false);
    } catch (err) {
      setAddTaskError(err instanceof ApiError ? err.message : 'Could not create this task. Please try again.');
    } finally {
      setIsSubmittingTask(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative' }}>
      
      {/* Workspace Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={onBack} className="btn-icon" title="Go back to Dashboard">
            <ArrowLeft size={16} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 700 }}>
                {event.type}
              </span>
              <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>•</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {eventTeam.length} Members
              </span>
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', marginTop: '0.15rem' }}>{event.name}</h1>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '0.4rem 0.85rem', borderRadius: '6px', fontSize: '0.8rem' }}>
            <Clock size={14} style={{ color: 'var(--primary)' }} />
            <span>{getRemainingDaysHours(event.finalDeadline)}</span>
          </div>

          <button onClick={openAIAgent} className="btn btn-primary" style={{ gap: '0.4rem', borderRadius: '6px' }}>
            <Bot size={16} />
            <span>Ask Workspace AI</span>
          </button>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="tabs-container" style={{ marginBottom: '0.5rem' }}>
        {(['overview', 'timeline', 'tasks', 'requirements', 'team', 'resources', 'updates', 'sources', 'settings'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
            style={{ textTransform: 'capitalize' }}
          >
            {tab === 'settings' ? <><Settings size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />Settings</> : tab}
          </button>
        ))}
      </div>

      {/* TAB CONTENT VIEWS */}
      
      {/* 1. OVERVIEW VIEW */}
      {activeTab === 'overview' && (
        <div className="split-grid" style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '2rem', alignItems: 'start' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Primary Countdown card */}
            <div onMouseMove={handleMouseMove} className="premium-card glowing-card" style={{ background: 'linear-gradient(to right, rgba(99,102,241,0.06), transparent)', borderLeft: '3px solid var(--primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Deadline Countdown</span>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: '2.5rem', fontWeight: 800, color: '#fff', marginTop: '0.25rem' }}>
                  {getRemainingDaysHours(event.finalDeadline)}
                </div>
              </div>
              
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Health Index</span>
                <span style={{
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: event.status === 'on-track' ? 'var(--status-ontrack)' : event.status === 'needs-attention' ? 'var(--status-attention)' : 'var(--status-atrisk)',
                  background: event.status === 'on-track' ? 'var(--status-ontrack-bg)' : event.status === 'needs-attention' ? 'var(--status-attention-bg)' : 'var(--status-atrisk-bg)',
                  padding: '0.3rem 0.6rem',
                  borderRadius: '4px'
                }}>
                  {event.healthScore}% {event.status.replace('-', ' ').toUpperCase()}
                </span>
              </div>
            </div>

            {/* Recommended Next Action */}
            <div onMouseMove={handleMouseMove} className="premium-card glowing-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>
                <Sparkles size={16} />
                <span>AI Recommended Priority Action</span>
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{event.nextAction}</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Completing this action is estimated to elevate workspace workflow progress by 12% and align with the upcoming official milestone check.
              </p>
              <div>
                <button onClick={() => setActiveTab('tasks')} className="btn btn-primary" style={{ gap: '0.35rem', borderRadius: '6px', fontSize: '0.8rem' }}>
                  <span>Open Tasks Board</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>

            {/* Upcoming Milestones in Overview */}
            <div onMouseMove={handleMouseMove} className="premium-card glowing-card">
              <h3 style={{ fontSize: '1rem', fontWeight: 600, borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                Nearest Operations Deadlines
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {eventDeadlines.slice(0, 3).map(d => (
                  <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-tertiary)', padding: '0.65rem 1rem', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Calendar size={14} style={{ color: d.type === 'official' ? 'var(--text-primary)' : 'var(--status-info)' }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{d.title}</span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Quick specs sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div onMouseMove={handleMouseMove} className="premium-card glowing-card">
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Workspace Details</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.85rem' }}>
                <div>
                  <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Event Source Description</span>
                  <p style={{ color: 'var(--text-primary)', marginTop: '0.15rem', lineHeight: '1.4' }}>{event.description}</p>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Checklist Completion</span>
                  <strong style={{ color: 'var(--text-primary)' }}>
                    {eventRequirements.filter(r => r.completed).length} / {eventRequirements.length} Deliverables Done
                  </strong>
                </div>
                {event.websiteUrl && (
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Official Guidelines</span>
                    <a href={event.websiteUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
                      Visit Event Site →
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* 2. TIMELINE VIEW (AI PREPARATION PLANNER) */}
      {activeTab === 'timeline' && (
        <div className="split-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem', alignItems: 'start' }}>
          
          <div>
            <DeadlineManager event={event} deadlines={eventDeadlines} onChanged={refreshDeadlines} onEventUpdate={async (updates) => { await updateEvent(event.id, updates); }} />
          </div>

          <div className="premium-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>AI Recalculated Preparation Plan</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Calculated start periods to avoid eleventh-hour rushes.</p>
              </div>
              <span className="badge badge-info" style={{ gap: '0.35rem' }}>
                <Sparkles size={12} />
                <span>Smart Schedule</span>
              </span>
            </div>

            {plannerLoading && !prepPlan && (
              <div style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Generating plan from your live event data…</div>
            )}
            {plannerError && (
              <div style={{ padding: '0.75rem 1rem', marginBottom: '1rem', border: '1px solid var(--status-atrisk)', borderRadius: '6px', color: 'var(--status-atrisk)', fontSize: '0.8rem' }}>
                {plannerError}
              </div>
            )}

            {/* Vertical timeline stack */}
            <div className="timeline-vertical">
              {prepPlan?.phases.map((phase, idx) => {
                const now = Date.now();
                const isCurrent = new Date(phase.startDate).getTime() <= now && now <= new Date(phase.endDate).getTime();
                return (
                  <div key={idx} className={`timeline-item ${isCurrent ? 'ai-recommended' : ''}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: isCurrent ? 'var(--status-info)' : 'var(--text-primary)' }}>
                          {phase.name}
                        </h4>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem', maxWidth: '420px' }}>
                          {phase.description}
                        </p>
                        <div style={{ display: 'inline-block', border: '1px dashed var(--border-color)', background: 'var(--bg-primary)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                          🔑 Target Milestone: <strong>{phase.milestoneTitle}</strong>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {new Date(phase.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(phase.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)' }}>
                          Allocated Weight: {phase.percentage}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Timetable sidebar details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="premium-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Planner parameters</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <div>
                  <span style={{ display: 'block', color: 'var(--text-tertiary)' }}>Live data window</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{prepPlan?.daysAvailable ?? '—'} days remaining</span>
                </div>
                <div>
                  <span style={{ display: 'block', color: 'var(--text-tertiary)' }}>Requirements</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{prepPlan?.metrics.incompleteRequirementCount ?? eventRequirements.filter(r => !r.completed).length} open / {prepPlan?.metrics.requirementCount ?? eventRequirements.length} total</span>
                </div>
                <div>
                  <span style={{ display: 'block', color: 'var(--text-tertiary)' }}>Tasks</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{prepPlan?.metrics.openTaskCount ?? eventTasks.filter(t => t.status !== 'done').length} open · {prepPlan?.metrics.overdueTaskCount ?? 0} overdue</span>
                </div>
                <div>
                  <span style={{ display: 'block', color: 'var(--text-tertiary)' }}>Planner complexity</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500, textTransform: 'capitalize' }}>{prepPlan?.complexity ?? '—'}</span>
                </div>
                <button onClick={recalculatePlanner} disabled={plannerLoading} style={{ marginTop: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.55rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', cursor: plannerLoading ? 'not-allowed' : 'pointer', opacity: plannerLoading ? 0.6 : 1 }}>
                  <RefreshCw size={13} />
                  {plannerLoading ? 'Recalculating…' : 'Recalculate Plan'}
                </button>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* 3. TASKS VIEW */}
      {activeTab === 'tasks' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--bg-tertiary)', padding: '0.25rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <button 
                onClick={() => setTaskView('kanban')}
                style={{
                  border: 'none',
                  background: taskView === 'kanban' ? 'rgba(255,255,255,0.06)' : 'transparent',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8rem',
                  borderRadius: '4px',
                  color: taskView === 'kanban' ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
              >
                Kanban Board
              </button>
              <button 
                onClick={() => setTaskView('list')}
                style={{
                  border: 'none',
                  background: taskView === 'list' ? 'rgba(255,255,255,0.06)' : 'transparent',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8rem',
                  borderRadius: '4px',
                  color: taskView === 'list' ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
              >
                Task List
              </button>
            </div>

            <button 
              onClick={() => setIsAddingTask(true)} 
              className="btn btn-primary"
              style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem', gap: '0.35rem', borderRadius: '6px' }}
            >
              <Plus size={14} />
              <span>Add Task</span>
            </button>
          </div>

          {/* Kanban columns view */}
          {taskView === 'kanban' ? (
            <div className="kanban-board">
              
              {/* Columns: Todo, In Progress, Done */}
              {(['todo', 'in-progress', 'done'] as const).map(column => {
                const columnTasks = eventTasks.filter(t => t.status === column);
                
                return (
                  <div key={column} className="kanban-col">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                        {column === 'todo' ? 'To Do' : column === 'in-progress' ? 'In Progress' : 'Completed'}
                      </span>
                      <span style={{ fontSize: '0.75rem', background: 'var(--bg-tertiary)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                        {columnTasks.length}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {columnTasks.map(task => {
                        const assigneeName = task.assignee?.name;
                        
                        return (
                          <div 
                            key={task.id} 
                            style={{ 
                              background: 'var(--bg-secondary)', 
                              border: '1px solid var(--border-color)', 
                              borderRadius: '8px', 
                              padding: '0.85rem',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.65rem'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <span style={{
                                fontSize: '0.65rem',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                color: task.priority === 'critical' ? 'var(--status-atrisk)' : task.priority === 'high' ? 'var(--status-attention)' : 'var(--text-secondary)'
                              }}>
                                {task.priority}
                              </span>
                              
                              {/* Inline status switcher buttons */}
                              <div style={{ display: 'flex', gap: '0.2rem' }}>
                                {column !== 'todo' && (
                                  <button 
                                    onClick={() => void updateTaskStatus(task.id, column === 'in-progress' ? 'todo' : 'in-progress')}
                                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '0.7rem' }}
                                    title="Move left"
                                  >
                                    ←
                                  </button>
                                )}
                                {column !== 'done' && (
                                  <button 
                                    onClick={() => void updateTaskStatus(task.id, column === 'todo' ? 'in-progress' : 'done')}
                                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '0.7rem' }}
                                    title="Move right"
                                  >
                                    →
                                  </button>
                                )}
                              </div>
                            </div>

                            <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>{task.title}</span>

                            {task.dueDate && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                <Calendar size={12} />
                                <span>Due {task.dueDate}</span>
                              </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.02)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                                Assigned to: <strong>{assigneeName || 'Unassigned'}</strong>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

            </div>
          ) : (
            /* Traditional list layout */
            <div className="premium-card">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {eventTasks.map(task => (
                  <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--bg-tertiary)', padding: '0.75rem 1rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <input
                      type="checkbox"
                      checked={task.status === 'done'}
                      onChange={() => void updateTaskStatus(task.id, task.status === 'done' ? 'todo' : 'done')}
                    />
                    <span style={{ flex: 1, fontSize: '0.85rem', textDecoration: task.status === 'done' ? 'line-through' : 'none', color: task.status === 'done' ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>
                      {task.title}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      Assignee: {task.assignee?.name || 'Unassigned'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* 4. REQUIREMENTS VIEW */}
      {activeTab === 'requirements' && (
        <div className="split-grid" style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.2fr', gap: '2rem', alignItems: 'start' }}>
          
          <div className="premium-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Official Organizer Submission Guidelines</h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {eventRequirements.filter(r => r.completed).length} / {eventRequirements.length} Completed
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {eventRequirements.map(req => (
                <div 
                  key={req.id} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    padding: '0.75rem 1rem', 
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-tertiary)'
                  }}
                >
                  <label className="custom-checkbox">
                    <input
                      type="checkbox"
                      checked={req.completed}
                      onChange={() => toggleRequirement(req.id)}
                    />
                    <span className="checkmark" />
                    <span style={{ 
                      fontSize: '0.875rem', 
                      fontWeight: 500, 
                      color: req.completed ? 'var(--text-tertiary)' : 'var(--text-primary)',
                      textDecoration: req.completed ? 'line-through' : 'none'
                    }}>
                      {req.title}
                    </span>
                  </label>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {!req.verified && (
                      <span className="badge badge-attention" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', gap: '0.15rem' }}>
                        <AlertCircle size={10} />
                        <span>Confirm Source</span>
                      </span>
                    )}

                    <button 
                      onClick={() => setSelectedRequirement(req)}
                      className="btn btn-secondary" 
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderRadius: '4px' }}
                    >
                      Audit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="premium-card">
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Checklist Auditing</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                Click "Audit" on any guideline checklist item to view references to organizer rulebooks, source URLs, and compliance requirements.
              </p>
            </div>
          </div>

        </div>
      )}

      {/* 5. TEAM VIEW */}
      {activeTab === 'team' && (
        <EventTeamPanel eventId={event.id} eventName={event.name} />
      )}

      {/* 6. RESOURCES VIEW */}
      {activeTab === 'resources' && (
        <div className="split-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr', gap: '2rem', alignItems: 'start' }}>
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1.25rem' }}>
              {eventResources.map(res => (
                <div key={res.id} onMouseMove={handleMouseMove} className="premium-card glowing-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      backgroundColor: 'rgba(255,255,255,0.04)',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      textTransform: 'uppercase',
                      color: 'var(--text-secondary)'
                    }}>
                      {res.fileType}
                    </span>
                    
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{res.source}</span>
                  </div>

                  <div>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>{res.name}</h4>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>Organized reference templates extracted from guidelines.</p>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                    <a 
                      href={res.url} 
                      className="btn btn-secondary" 
                      style={{ flex: 1, padding: '0.35rem', fontSize: '0.75rem', borderRadius: '4px', gap: '0.25rem' }}
                    >
                      <FileDown size={12} />
                      <span>Download</span>
                    </a>
                    <button 
                      onClick={() => alert(`Opening preview folder structure mock for: ${res.name}`)}
                      className="btn btn-secondary" 
                      style={{ flex: 1, padding: '0.35rem', fontSize: '0.75rem', borderRadius: '4px' }}
                    >
                      Open Preview
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div onMouseMove={handleMouseMove} className="premium-card glowing-card">
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Resource Hub</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                Templates, brief documents, and rulebooks are auto-organized from the event source upload. Verified files carry official hashes for submission safety.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 7. EVENT SETTINGS */}
      {activeTab === 'settings' && (
        <EventSettingsPanel
          event={event}
          onSave={async (updates) => { await updateEvent(event.id, updates); }}
          onDelete={async () => { await removeEvent(event.id); onBack(); }}
        />
      )}

      {/* 8. EVENT SOURCES */}
      {activeTab === 'sources' && (
        <EventSourcesPanel eventId={event.id} eventName={event.name} websiteUrl={event.websiteUrl} />
      )}

      {activeTab === 'updates' && (
        <div className="split-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr', gap: '2rem', alignItems: 'start' }}>
          
          <div className="premium-card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              Operations Update log
              {updatesLoading && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-tertiary)' }}>Loading…</span>}
            </h3>

            {updatesError && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', background: 'rgba(220,38,38,0.08)', border: '1px solid var(--status-atrisk)', padding: '0.6rem 0.85rem', borderRadius: '8px', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--status-atrisk)' }}>{updatesError}</span>
                <button onClick={refreshUpdates} className="btn btn-secondary" style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem' }}>
                  Retry
                </button>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {eventUpdates.length > 0 ? (
                eventUpdates.map(up => (
                  <div key={up.id} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <div style={{
                      backgroundColor: up.type === 'deadline-change' ? 'var(--status-attention-bg)' : 'var(--status-info-bg)',
                      color: up.type === 'deadline-change' ? 'var(--status-attention)' : 'var(--status-info)',
                      padding: '0.4rem',
                      borderRadius: '6px'
                    }}>
                      <RefreshCw size={16} />
                    </div>
                    <div>
                      <strong style={{ fontSize: '0.9rem', color: '#fff', display: 'block' }}>{up.title}</strong>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{up.description}</p>
                      
                      {up.metadata && (
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.5rem', padding: '0.35rem 0.5rem', background: 'var(--bg-primary)', borderRadius: '4px', border: '1px solid var(--border-color)', width: 'fit-content' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textDecoration: 'line-through' }}>
                            {new Date(up.metadata.oldValue!).toLocaleDateString()}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>➔</span>
                          <strong style={{ fontSize: '0.75rem', color: 'var(--status-attention)' }}>
                            {new Date(up.metadata.newValue!).toLocaleDateString()}
                          </strong>
                        </div>
                      )}
                      
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', display: 'block', marginTop: '0.5rem' }}>
                        Timestamp: {new Date(up.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
                  No updates recorded in this session.
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="premium-card">
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Simulation Trigger</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4', marginBottom: '1rem' }}>
                Simulate an organizer-level change to test the adaptation engine.
              </p>
              
              <button 
                onClick={() => triggerDeadlineChangeSimulation(event.id)} 
                className="btn btn-secondary" 
                style={{ width: '100%', gap: '0.35rem', borderRadius: '6px', fontSize: '0.8rem' }}
              >
                <RefreshCw size={14} />
                <span>Trigger +3d Extension</span>
              </button>
            </div>
          </div>

        </div>
      )}

      {/* REQUIREMENTS AUDIT PANEL DRAWER */}
      {selectedRequirement && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '380px',
          height: '100vh',
          backgroundColor: 'var(--bg-secondary)',
          borderLeft: '1px solid var(--border-color)',
          boxShadow: '-10px 0 30px rgba(0,0,0,0.3)',
          zIndex: 1050,
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Guidelines Auditor</h3>
            <button onClick={() => setSelectedRequirement(null)} className="btn-icon" style={{ border: 'none' }}>
              <X size={18} />
            </button>
          </div>

          <div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Checkpoint Title</span>
            <h4 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.2rem' }}>{selectedRequirement.title}</h4>
          </div>

          <div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Enforced By</span>
            <p style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 500, marginTop: '0.2rem' }}>{selectedRequirement.requiredBy}</p>
          </div>

          <div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Technical Details & Scope</span>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem', lineHeight: '1.4' }}>
              {selectedRequirement.description || 'Verified baseline submission deliverable scanned from primary rules PDF configuration.'}
            </p>
          </div>

          <div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Audit Reference Sources</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.4rem' }}>
              <div style={{ fontSize: '0.75rem', background: 'var(--bg-tertiary)', padding: '0.5rem', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                📍 Document: <strong>
                  {selectedRequirement.sourceLink
                    ? (() => { try { return new URL(selectedRequirement.sourceLink).hostname.replace(/^www\./, ''); } catch { return selectedRequirement.sourceLink; } })()
                    : 'Not linked — extracted from onboarding description'}
                </strong>
              </div>
              <div style={{ fontSize: '0.75rem', background: 'var(--bg-tertiary)', padding: '0.5rem', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                🔍 Scanned: <strong>NLP Verification Confidence: {selectedRequirement.verified ? '100% (High)' : '72% (Requires confirmation)'}</strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
            <button 
              onClick={() => {
                toggleRequirement(selectedRequirement.id);
                setSelectedRequirement(prev => prev ? { ...prev, completed: !prev.completed } : null);
              }}
              className="btn btn-primary" 
              style={{ flex: 1, fontSize: '0.8rem' }}
            >
              {selectedRequirement.completed ? 'Mark Incomplete' : 'Complete Step'}
            </button>
            <button 
              onClick={() => {
                if (selectedRequirement.sourceLink) {
                  window.open(selectedRequirement.sourceLink, '_blank');
                }
              }}
              disabled={!selectedRequirement.sourceLink}
              title={selectedRequirement.sourceLink ? undefined : 'No source link was captured for this requirement'}
              className="btn btn-secondary" 
              style={{
                flex: 1,
                fontSize: '0.8rem',
                opacity: selectedRequirement.sourceLink ? 1 : 0.45,
                cursor: selectedRequirement.sourceLink ? 'pointer' : 'not-allowed'
              }}
            >
              {selectedRequirement.sourceLink ? 'View Source' : 'No Source Linked'}
            </button>
          </div>
        </div>
      )}

      {/* TASK CREATION DIALOG MODAL */}
      {isAddingTask && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0,0,0,0.6)',
          zIndex: 1060,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '1.75rem',
            width: '420px',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            boxShadow: '0 15px 40px rgba(0,0,0,0.4)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Create New Task</h3>
              <button onClick={() => setIsAddingTask(false)} className="btn-icon" style={{ border: 'none' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddTaskSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>Task Name</label>
                <input
                  type="text"
                  className="input-field"
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  placeholder="e.g. Finish slide transitions"
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>Assign Teammate</label>
                <select 
                  value={newTaskAssignee}
                  onChange={e => setNewTaskAssignee(e.target.value)}
                  style={{ width: '100%', background: 'var(--bg-tertiary)', color: '#fff', border: '1px solid var(--border-color)', padding: '0.5rem', borderRadius: '6px' }}
                >
                  <option value="">Unassigned</option>
                  {realRoster.map(m => (
                    <option key={m.userId} value={m.userId}>{m.user?.name || m.user?.email || 'Teammate'}</option>
                  ))}
                </select>
              </div>

              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>Priority</label>
                  <select 
                    value={newTaskPriority}
                    onChange={e => setNewTaskPriority(e.target.value as Task['priority'])}
                    style={{ width: '100%', background: 'var(--bg-tertiary)', color: '#fff', border: '1px solid var(--border-color)', padding: '0.5rem', borderRadius: '6px' }}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>Due Date</label>
                  <input
                    type="date"
                    value={newTaskDueDate}
                    onChange={e => setNewTaskDueDate(e.target.value)}
                    style={{ width: '100%', background: 'var(--bg-tertiary)', color: '#fff', border: '1px solid var(--border-color)', padding: '0.45rem', borderRadius: '6px' }}
                  />
                </div>
              </div>

              {addTaskError && (
                <div style={{ fontSize: '0.75rem', color: 'var(--status-atrisk)', background: 'rgba(220,38,38,0.08)', border: '1px solid var(--status-atrisk)', borderRadius: '6px', padding: '0.5rem 0.75rem' }}>
                  {addTaskError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setIsAddingTask(false)} className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>
                  Cancel
                </button>
                <button type="submit" disabled={isSubmittingTask} className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', opacity: isSubmittingTask ? 0.7 : 1 }}>
                  {isSubmittingTask ? 'Creating…' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
