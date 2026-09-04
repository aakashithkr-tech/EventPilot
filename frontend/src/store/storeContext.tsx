import React, { createContext, useContext, useState, useEffect } from 'react';
import { Event, Deadline, Requirement, Resource, TeamMember, Task, Notification, EventUpdate } from '../types';
import {
  initialTeamMembers
} from '../services/mockData';
import { plannerService } from '../services/plannerService';
import { eventService } from '../services/eventService';
import { taskService } from '../services/taskService';
import { requirementService, CreateRequirementPayload } from '../services/requirementService';
import { resourceService, CreateResourcePayload } from '../services/resourceService';
import { deadlineService, CreateDeadlinePayload } from '../services/deadlineService';
import { eventUpdateService } from '../services/eventUpdateService';
import { notificationService, CreateNotificationPayload } from '../services/notificationService';
import { ApiError } from '../services/api';
import { useAuth } from './authContext';

export interface DeadlineChangeToastData {
  eventName: string;
  oldDate: string;
  newDate: string;
}

interface StoreContextType {
  events: Event[];
  deadlines: Deadline[];
  requirements: Requirement[];
  resources: Resource[];
  teamMembers: TeamMember[];
  tasks: Task[];
  notifications: Notification[];
  updates: EventUpdate[];
  activeEventId: string | null;
  setActiveEventId: (id: string | null) => void;
  deadlineChangeToast: DeadlineChangeToastData | null;
  dismissDeadlineChangeToast: () => void;
  /** True while events are being fetched from the backend (initial load or refresh). */
  eventsLoading: boolean;
  /** Set when the last events fetch failed (e.g. backend unreachable). Null otherwise. */
  eventsError: string | null;
  /** Re-fetches events from the backend. Exposed so screens can offer a "retry" action. */
  refreshEvents: () => void;
  /** True while tasks are being fetched from the backend for the current events. */
  tasksLoading: boolean;
  /** Set when the last tasks fetch failed. Null otherwise. */
  tasksError: string | null;
  refreshTasks: () => void;
  /** True while requirements are being fetched from the backend for the current events. */
  requirementsLoading: boolean;
  /** Set when the last requirements fetch failed. Null otherwise. */
  requirementsError: string | null;
  refreshRequirements: () => void;
  /** True while resources are being fetched from the backend for the current events. */
  resourcesLoading: boolean;
  /** Set when the last resources fetch failed. Null otherwise. */
  resourcesError: string | null;
  refreshResources: () => void;
  /** True while deadlines are being fetched from the backend for the current events. */
  deadlinesLoading: boolean;
  /** Set when the last deadlines fetch failed. Null otherwise. */
  deadlinesError: string | null;
  refreshDeadlines: () => void;
  /** True while event updates (the audit log) are being fetched for the current events. */
  updatesLoading: boolean;
  /** Set when the last updates fetch failed. Null otherwise. */
  updatesError: string | null;
  refreshUpdates: () => void;
  /** True while notifications are being fetched from the backend. */
  notificationsLoading: boolean;
  /** Set when the last notifications fetch failed. Null otherwise. */
  notificationsError: string | null;
  refreshNotifications: () => void;
  addEvent: (
    event: Omit<Event, 'id'>, 
    deadlines: Omit<Deadline, 'id' | 'eventId'>[], 
    requirements: Omit<Requirement, 'id' | 'eventId'>[], 
    resources: Omit<Resource, 'id' | 'eventId'>[], 
    teamMembers: Omit<TeamMember, 'id' | 'eventId'>[]
  ) => Promise<string>;
  updateEvent: (id: string, updates: Partial<Event>) => Promise<void>;
  removeEvent: (id: string) => Promise<void>;
  /** Persists a real Task via the backend; throws on failure (caller decides how to surface it). */
  addTask: (task: Omit<Task, 'id'>) => Promise<void>;
  updateTaskStatus: (id: string, status: Task['status']) => Promise<void>;
  toggleRequirement: (id: string) => Promise<void>;
  addTeamMember: (member: Omit<TeamMember, 'id'>) => void;
  moveTeamMember: (memberId: string, newEventId: string) => void;
  addNotification: (notification: Omit<Notification, 'id' | 'read'> & { targetTeam?: boolean }) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  triggerDeadlineChangeSimulation: (eventId: string) => Promise<void>;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isAuthReady } = useAuth();

  // Events now live in MongoDB (Feature 2), not localStorage/mock data.
  const [events, setEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const fetchEvents = React.useCallback(async () => {
    setEventsLoading(true);
    setEventsError(null);
    try {
      const fetched = await eventService.list();
      setEvents(fetched);
    } catch (err) {
      setEventsError(err instanceof ApiError ? err.message : 'Failed to load events.');
    } finally {
      setEventsLoading(false);
    }
  }, []);

  // Load events once we know whether the user is really authenticated
  // (waiting for isAuthReady avoids firing a request with a stale/expired
  // token before the session check has finished).
  useEffect(() => {
    if (!isAuthReady) return;
    if (isAuthenticated) {
      fetchEvents();
    } else {
      setEvents([]);
      setEventsError(null);
    }
  }, [isAuthReady, isAuthenticated, fetchEvents]);

  // Deadlines now live in MongoDB (Feature 7), scoped to real events — not
  // localStorage/mock data. Same fetch-per-event-set pattern as Requirements/Resources.
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [deadlinesLoading, setDeadlinesLoading] = useState(false);
  const [deadlinesError, setDeadlinesError] = useState<string | null>(null);

  // Requirements now live in MongoDB (Feature 5), scoped to real events —
  // not localStorage/mock data. Same fetch-per-event-set pattern as Tasks.
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [requirementsLoading, setRequirementsLoading] = useState(false);
  const [requirementsError, setRequirementsError] = useState<string | null>(null);

  const [resources, setResources] = useState<Resource[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [resourcesError, setResourcesError] = useState<string | null>(null);

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() => {
    const saved = localStorage.getItem('ep_team');
    return saved ? JSON.parse(saved) : initialTeamMembers;
  });

  // Tasks now live in MongoDB (Feature 4), scoped to real events and real
  // assignees — not localStorage/mock data.
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);

  const fetchTasks = React.useCallback(async (eventList: Event[]) => {
    if (eventList.length === 0) {
      setTasks([]);
      return;
    }
    setTasksLoading(true);
    setTasksError(null);
    try {
      const results = await Promise.all(eventList.map((e) => taskService.list(e.id)));
      setTasks(results.flat());
    } catch (err) {
      setTasksError(err instanceof ApiError ? err.message : 'Failed to load tasks.');
    } finally {
      setTasksLoading(false);
    }
  }, []);

  // Re-fetch whenever the *set* of accessible events changes (not on every
  // events state update — progress/status edits shouldn't trigger a refetch).
  const eventIdsKey = events.map((e) => e.id).sort().join(',');
  useEffect(() => {
    if (!isAuthReady) return;
    if (!isAuthenticated) {
      setTasks([]);
      setTasksError(null);
      return;
    }
    fetchTasks(events);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthReady, isAuthenticated, eventIdsKey, fetchTasks]);

  const fetchRequirements = React.useCallback(async (eventList: Event[]) => {
    if (eventList.length === 0) {
      setRequirements([]);
      return;
    }
    setRequirementsLoading(true);
    setRequirementsError(null);
    try {
      const results = await Promise.all(eventList.map((e) => requirementService.list(e.id)));
      setRequirements(results.flat());
    } catch (err) {
      setRequirementsError(err instanceof ApiError ? err.message : 'Failed to load requirements.');
    } finally {
      setRequirementsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;
    if (!isAuthenticated) {
      setRequirements([]);
      setRequirementsError(null);
      return;
    }
    fetchRequirements(events);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthReady, isAuthenticated, eventIdsKey, fetchRequirements]);

  const fetchResources = React.useCallback(async (eventList: Event[]) => {
    if (eventList.length === 0) {
      setResources([]);
      return;
    }
    setResourcesLoading(true);
    setResourcesError(null);
    try {
      const results = await Promise.all(eventList.map((e) => resourceService.list(e.id)));
      setResources(results.flat());
    } catch (err) {
      setResourcesError(err instanceof ApiError ? err.message : 'Failed to load resources.');
    } finally {
      setResourcesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;
    if (!isAuthenticated) {
      setResources([]);
      setResourcesError(null);
      return;
    }
    fetchResources(events);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthReady, isAuthenticated, eventIdsKey, fetchResources]);

  const fetchDeadlines = React.useCallback(async (eventList: Event[]) => {
    if (eventList.length === 0) {
      setDeadlines([]);
      return;
    }
    setDeadlinesLoading(true);
    setDeadlinesError(null);
    try {
      const results = await Promise.all(eventList.map((e) => deadlineService.list(e.id)));
      setDeadlines(results.flat());
    } catch (err) {
      setDeadlinesError(err instanceof ApiError ? err.message : 'Failed to load deadlines.');
    } finally {
      setDeadlinesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;
    if (!isAuthenticated) {
      setDeadlines([]);
      setDeadlinesError(null);
      return;
    }
    fetchDeadlines(events);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthReady, isAuthenticated, eventIdsKey, fetchDeadlines]);

  // Notifications now live in MongoDB (Feature 9), scoped to the real
  // authenticated user — not localStorage/mock data.
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);

  const fetchNotifications = React.useCallback(async () => {
    setNotificationsLoading(true);
    setNotificationsError(null);
    try {
      const fetched = await notificationService.list();
      setNotifications(fetched);
    } catch (err) {
      setNotificationsError(err instanceof ApiError ? err.message : 'Failed to load notifications.');
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;
    if (!isAuthenticated) {
      setNotifications([]);
      setNotificationsError(null);
      return;
    }
    fetchNotifications();
  }, [isAuthReady, isAuthenticated, fetchNotifications]);

  // Event Updates now live in MongoDB (Feature 8), scoped to real events —
  // not localStorage/mock data. Same fetch-per-event-set pattern as Deadlines.
  const [updates, setUpdates] = useState<EventUpdate[]>([]);
  const [updatesLoading, setUpdatesLoading] = useState(false);
  const [updatesError, setUpdatesError] = useState<string | null>(null);

  const fetchUpdates = React.useCallback(async (eventList: Event[]) => {
    if (eventList.length === 0) {
      setUpdates([]);
      return;
    }
    setUpdatesLoading(true);
    setUpdatesError(null);
    try {
      const results = await Promise.all(eventList.map((e) => eventUpdateService.list(e.id)));
      setUpdates(results.flat());
    } catch (err) {
      setUpdatesError(err instanceof ApiError ? err.message : 'Failed to load updates.');
    } finally {
      setUpdatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;
    if (!isAuthenticated) {
      setUpdates([]);
      setUpdatesError(null);
      return;
    }
    fetchUpdates(events);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthReady, isAuthenticated, eventIdsKey, fetchUpdates]);

  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [deadlineChangeToast, setDeadlineChangeToast] = useState<DeadlineChangeToastData | null>(null);

  const dismissDeadlineChangeToast = () => setDeadlineChangeToast(null);

  // Preparation-aware smart notifications: staged at 15d / 7d / 3d / 1d / 3h,
  // based on remaining work and deduped by milestoneKey — now computed and
  // persisted server-side (Feature 9), fanned out to every real active
  // team member, not just this session. This just triggers generation
  // whenever the set of accessible events changes and merges in whatever
  // came back new for the current user; dedup itself happens in the
  // backend (unique userId+milestoneKey index), so calling this whenever
  // events change (including on every login) is always safe.
  useEffect(() => {
    if (!isAuthReady || !isAuthenticated) return;
    if (events.length === 0) return;
    (async () => {
      try {
        const created = await notificationService.generate();
        if (created.length > 0) {
          setNotifications(prev => {
            const existingIds = new Set(prev.map(n => n.id));
            const fresh = created.filter(n => !existingIds.has(n.id));
            return fresh.length > 0 ? [...fresh, ...prev] : prev;
          });
        }
      } catch {
        // Best-effort background generation — a failure here shouldn't
        // block the UI; whatever's already in the notifications list
        // (from fetchNotifications) still displays fine.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthReady, isAuthenticated, eventIdsKey]);

  // Sync to local storage (events/tasks/requirements/resources/deadlines/
  // notifications are all persisted server-side now; team members are the
  // one remaining domain still migrated as mock/local state).
  useEffect(() => {
    localStorage.setItem('ep_team', JSON.stringify(teamMembers));
  }, [teamMembers]);

  const addEvent = async (
    event: Omit<Event, 'id'>, 
    newDeadlines: Omit<Deadline, 'id' | 'eventId'>[], 
    newRequirements: Omit<Requirement, 'id' | 'eventId'>[], 
    newResources: Omit<Resource, 'id' | 'eventId'>[], 
    newTeamMembers: Omit<TeamMember, 'id' | 'eventId'>[]
  ): Promise<string> => {
    // The event itself is now a real MongoDB document. Deadlines,
    // requirements, resources and team members created alongside it are
    // still local/mock state (those features haven't been migrated yet),
    // but they're keyed off the real event id returned by the backend.
    const formattedEvent = await eventService.create({
      name: event.name,
      type: event.type,
      description: event.description,
      websiteUrl: event.websiteUrl,
      status: event.status,
      finalDeadline: event.finalDeadline,
      teamSize: event.teamSize,
      nextAction: event.nextAction,
    });

    const eventId = formattedEvent.id;

    // Requirements are now persisted for real (Feature 5) — bulk-created in
    // one call against the just-created event's real id, rather than
    // formatted into local-only objects the way team members still are
    // (that feature hasn't been migrated yet).
    const formattedRequirements: Requirement[] = newRequirements.length > 0
      ? await requirementService.bulkCreate(
          eventId,
          newRequirements.map((r): CreateRequirementPayload => ({
            title: r.title,
            description: r.description,
            requiredBy: r.requiredBy,
            sourceLink: r.sourceLink,
            completed: r.completed,
            verified: r.verified,
          }))
        )
      : [];

    const formattedResources: Resource[] = newResources.length > 0
      ? await resourceService.bulkCreate(
          eventId,
          newResources.map((res): CreateResourcePayload => ({
            name: res.name,
            type: res.type,
            fileType: res.fileType,
            source: res.source,
            url: res.url,
          }))
        )
      : [];

    const formattedTeam: TeamMember[] = newTeamMembers.map((m, index) => ({
      ...m,
      id: `m_${eventId}_${index}`,
      eventId
    }));

    const deadlinePayloads: CreateDeadlinePayload[] = newDeadlines.map((d): CreateDeadlinePayload => ({
      title: d.title, date: d.date, type: d.type, verified: d.verified
    }));
    if (deadlinePayloads.length > 0) {
      await deadlineService.bulkCreate(eventId, deadlinePayloads);
    }

    // Recalculate only after the official extracted deadlines have been
    // persisted, so the planner sees the complete event data on first load.
    await plannerService.recalculate(eventId);

    // Read back the complete persisted deadline set so planner milestones and
    // official deadlines are represented exactly once in frontend state.
    const formattedDeadlines = await deadlineService.list(eventId);

    setEvents(prev => [formattedEvent, ...prev]);
    setDeadlines(prev => [...formattedDeadlines, ...prev]);
    setRequirements(prev => [...formattedRequirements, ...prev]);
    setResources(prev => [...formattedResources, ...prev]);
    setTeamMembers(prev => [...formattedTeam, ...prev]);

    // Add notification
    addNotification({
      eventId,
      title: 'New Event Workspace Created',
      message: `Event "${event.name}" is now online. Preparation plan has been compiled.`,
      type: 'success',
      timestamp: 'Just now'
    });


    return eventId;
  };

  const updateEvent = async (id: string, fields: Partial<Event>): Promise<void> => {
    // Optimistic update so the UI feels instant, with a real persist call
    // behind it. If the backend rejects it, roll back and surface an error
    // instead of silently pretending the change stuck.
    const previous = events.find(e => e.id === id);
    setEvents(prev => prev.map(e => (e.id === id ? { ...e, ...fields } : e)));

    try {
      const saved = await eventService.update(id, fields);
      setEvents(prev => prev.map(e => (e.id === id ? saved : e)));
    } catch (err) {
      if (previous) {
        setEvents(prev => prev.map(e => (e.id === id ? previous : e)));
      }
      addNotification({
        eventId: id,
        title: 'Update failed to save',
        message: err instanceof ApiError ? err.message : 'Could not save this change. Please try again.',
        type: 'critical',
        timestamp: 'Just now'
      });
    }
  };

  const removeEvent = async (id: string): Promise<void> => {
    await eventService.remove(id);
    setEvents(prev => prev.filter(e => e.id !== id));
    setDeadlines(prev => prev.filter(d => d.eventId !== id));
    setRequirements(prev => prev.filter(r => r.eventId !== id));
    setResources(prev => prev.filter(r => r.eventId !== id));
    setTasks(prev => prev.filter(t => t.eventId !== id));
    setTeamMembers(prev => prev.filter(m => m.eventId !== id));
    setActiveEventId(current => current === id ? null : current);
  };

  const addTask = async (task: Omit<Task, 'id'>): Promise<void> => {
    // No optimistic insert here — the caller (a modal submit) awaits this
    // and decides how to react to a failure, same pattern as addEvent.
    const created = await taskService.create(task.eventId, {
      title: task.title,
      description: task.description,
      assigneeId: task.assigneeId,
      dueDate: task.dueDate,
      priority: task.priority,
      status: task.status,
      requirementId: task.requirementId,
    });
    setTasks(prev => [created, ...prev]);

    // Recalculate event progress based on completed tasks & requirements
    recalculateProgress(task.eventId);
  };

  const updateTaskStatus = async (id: string, status: Task['status']): Promise<void> => {
    // Optimistic update + rollback on failure, same pattern as updateEvent —
    // this is fired straight from checkboxes/kanban buttons, not a form.
    const previous = tasks.find(t => t.id === id);
    if (!previous) return;

    setTasks(prev => prev.map(t => (t.id === id ? { ...t, status } : t)));

    try {
      const saved = await taskService.update(id, { status });
      setTasks(prev => prev.map(t => (t.id === id ? saved : t)));
    } catch (err) {
      setTasks(prev => prev.map(t => (t.id === id ? previous : t)));
      addNotification({
        eventId: previous.eventId,
        title: 'Task update failed to save',
        message: err instanceof ApiError ? err.message : 'Could not save this change. Please try again.',
        type: 'critical',
        timestamp: 'Just now'
      });
      return;
    }

    recalculateProgress(previous.eventId);
  };

  const toggleRequirement = async (id: string): Promise<void> => {
    // Optimistic update + rollback on failure, same pattern as
    // updateTaskStatus — this fires straight from a checkbox click.
    const previous = requirements.find(r => r.id === id);
    if (!previous) return;

    setRequirements(prev => prev.map(r => (r.id === id ? { ...r, completed: !r.completed } : r)));

    try {
      const saved = await requirementService.update(id, { completed: !previous.completed });
      setRequirements(prev => prev.map(r => (r.id === id ? saved : r)));
    } catch (err) {
      setRequirements(prev => prev.map(r => (r.id === id ? previous : r)));
      addNotification({
        eventId: previous.eventId,
        title: 'Requirement update failed to save',
        message: err instanceof ApiError ? err.message : 'Could not save this change. Please try again.',
        type: 'critical',
        timestamp: 'Just now'
      });
      return;
    }

    recalculateProgress(previous.eventId);
  };

  const addTeamMember = (member: Omit<TeamMember, 'id'>) => {
    const memberId = 'm_' + Math.random().toString(36).substr(2, 9);
    const newMember: TeamMember = { ...member, id: memberId };
    setTeamMembers(prev => [...prev, newMember]);
  };

  const moveTeamMember = (memberId: string, newEventId: string) => {
    let member: TeamMember | undefined;
    let oldEventId = '';

    setTeamMembers(prev => prev.map(m => {
      if (m.id === memberId) {
        member = m;
        oldEventId = m.eventId;
        return { ...m, eventId: newEventId, workload: 10 };
      }
      return m;
    }));

    if (oldEventId) recalculateProgress(oldEventId);
    recalculateProgress(newEventId);

    const oldEvent = events.find(e => e.id === oldEventId);
    const newEvent = events.find(e => e.id === newEventId);

    if (member && newEvent) {
      addNotification({
        eventId: newEventId,
        title: 'Team Updated via AI',
        message: `${member.name} moved from "${oldEvent?.name || 'a previous event'}" to "${newEvent.name}". They will now receive notifications for this event only.`,
        type: 'success',
        timestamp: 'Just now'
      });
    }
  };

  const addNotification = (n: Omit<Notification, 'id' | 'read'> & { targetTeam?: boolean }) => {
    // Optimistic local insert so every existing fire-and-forget call site
    // across this store sees the notification immediately, same as
    // before — but it's now backed by a real persisted write. Replaced
    // with the server's copy once that resolves, and quietly dropped if
    // the save fails (the notification itself is best-effort UI feedback,
    // not something worth its own cascading error notification).
    const tempId = 'temp_' + Math.random().toString(36).substr(2, 9);
    const optimistic: Notification = { ...n, id: tempId, read: false };
    setNotifications(prev => [optimistic, ...prev]);

    void (async () => {
      try {
        const payload: CreateNotificationPayload = {
          eventId: n.eventId,
          title: n.title,
          message: n.message,
          type: n.type,
          targetTeam: n.targetTeam,
        };
        const saved = await notificationService.create(payload);
        setNotifications(prev => prev.map(existing => (existing.id === tempId ? saved : existing)));
      } catch {
        setNotifications(prev => prev.filter(existing => existing.id !== tempId));
      }
    })();
  };

  const markNotificationRead = (id: string) => {
    const previous = notifications;
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    void notificationService.markRead(id).catch(() => {
      setNotifications(previous);
    });
  };

  const clearNotifications = () => {
    const previous = notifications;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    void notificationService.markAllRead().catch(() => {
      setNotifications(previous);
    });
  };

  const triggerDeadlineChangeSimulation = async (eventId: string): Promise<void> => {
    const targetEvent = events.find(e => e.id === eventId);
    if (!targetEvent) return;

    // Simulate pushing deadline 3 days later
    const currentDeadline = new Date(targetEvent.finalDeadline);
    const newDeadlineDate = new Date(currentDeadline);
    newDeadlineDate.setDate(newDeadlineDate.getDate() + 3);
    const newDeadlineStr = newDeadlineDate.toISOString();

    // Update event final deadline (persisted to the backend)
    void updateEvent(eventId, {
      finalDeadline: newDeadlineStr,
      status: 'on-track', // Changing status to on-track because more time was given
      healthScore: Math.min(100, targetEvent.healthScore + 10)
    });

    // Update the real, persisted official "final submission" deadline (if
    // one exists for this event) instead of only mutating local state.
    const officialFinal = deadlines.find(
      d => d.eventId === eventId && d.title.toLowerCase().includes('final submission')
    );
    if (officialFinal) {
      try {
        const saved = await deadlineService.update(officialFinal.id, { date: newDeadlineStr.split('T')[0] });
        setDeadlines(prev => prev.map(d => (d.id === officialFinal.id ? saved : d)));
      } catch (err) {
        addNotification({
          eventId,
          title: 'Deadline update failed to save',
          message: err instanceof ApiError ? err.message : 'Could not save the updated deadline. Please try again.',
          type: 'critical',
          timestamp: 'Just now'
        });
      }
    }

    // Re-generate AI milestones based on the new deadline, and persist the
    // recalculated plan for real: drop the stale ai-recommended deadlines
    // in the backend, then bulk-create the fresh ones.
    try {
      // Recalculate on the backend so the planner reads the latest event,
      // requirements, tasks and active membership rows from MongoDB.
      await plannerService.recalculate(eventId);
      const refreshed = await deadlineService.list(eventId);
      setDeadlines(prev => [
        ...prev.filter(d => d.eventId !== eventId),
        ...refreshed
      ]);
    } catch (err) {
      addNotification({
        eventId,
        title: 'Preparation plan recalculation failed to save',
        message: err instanceof ApiError ? err.message : 'Could not save the recalculated milestones. Please try again.',
        type: 'critical',
        timestamp: 'Just now'
      });
    }

    // Add a real, persisted update-log entry (Feature 8) — previously this
    // was local-only state that vanished on refresh.
    try {
      const persistedUpdate = await eventUpdateService.create(eventId, {
        type: 'deadline-change',
        title: 'DEADLINE UPDATED',
        description: `Deadline extended from ${currentDeadline.toLocaleDateString()} to ${newDeadlineDate.toLocaleDateString()}. AI preparation plan has been automatically recalculated.`,
        metadata: {
          oldValue: targetEvent.finalDeadline,
          newValue: newDeadlineStr
        }
      });
      setUpdates(prev => [persistedUpdate, ...prev]);
    } catch (err) {
      addNotification({
        eventId,
        title: 'Update log entry failed to save',
        message: err instanceof ApiError ? err.message : 'Could not save the update log entry. Please try again.',
        type: 'critical',
        timestamp: 'Just now'
      });
    }

    // Send notification — fanned out to the whole team (Feature 9), since
    // a deadline change affects everyone on the event, not just whoever
    // triggered this simulation.
    addNotification({
      eventId,
      title: '🔄 DEADLINE UPDATED',
      message: `${targetEvent.name} deadline extended to ${newDeadlineDate.toLocaleDateString()}. Preparation plan recalculated.`,
      type: 'info',
      timestamp: 'Just now',
      targetTeam: true
    });

    setDeadlineChangeToast({
      eventName: targetEvent.name,
      oldDate: targetEvent.finalDeadline,
      newDate: newDeadlineStr
    });
  };

  const recalculateProgress = (eventId: string) => {
    const eventReqs = requirements.filter(r => r.eventId === eventId);
    const eventTasks = tasks.filter(t => t.eventId === eventId);

    const completedReqs = eventReqs.filter(r => r.completed).length;
    const completedTasks = eventTasks.filter(t => t.status === 'done').length;

    const totalItems = eventReqs.length + eventTasks.length;
    const completedItems = completedReqs + completedTasks;

    const progressPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    // Update status based on progress & date proximity
    const targetEvent = events.find(e => e.id === eventId);
    if (!targetEvent) return;

    let status = targetEvent.status;
    let healthScore = targetEvent.healthScore;

    const finalDate = new Date(targetEvent.finalDeadline);
    const today = new Date('2026-08-26T22:00:00Z');
    const remainingDays = (finalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);

    if (remainingDays < 2 && progressPct < 60) {
      status = 'at-risk';
      healthScore = Math.max(10, progressPct - 15);
    } else if (remainingDays < 5 && progressPct < 80) {
      status = 'needs-attention';
      healthScore = Math.max(40, progressPct + 5);
    } else {
      status = 'on-track';
      healthScore = Math.min(100, progressPct + 20);
    }

    void updateEvent(eventId, { progress: progressPct, status, healthScore });
  };

  return (
    <StoreContext.Provider
      value={{
        events,
        deadlines,
        requirements,
        resources,
        teamMembers,
        tasks,
        notifications,
        updates,
        activeEventId,
        setActiveEventId,
        deadlineChangeToast,
        dismissDeadlineChangeToast,
        eventsLoading,
        eventsError,
        refreshEvents: fetchEvents,
        tasksLoading,
        tasksError,
        refreshTasks: () => fetchTasks(events),
        requirementsLoading,
        requirementsError,
        refreshRequirements: () => fetchRequirements(events),
        resourcesLoading,
        resourcesError,
        refreshResources: () => fetchResources(events),
        deadlinesLoading,
        deadlinesError,
        refreshDeadlines: () => fetchDeadlines(events),
        updatesLoading,
        updatesError,
        refreshUpdates: () => fetchUpdates(events),
        notificationsLoading,
        notificationsError,
        refreshNotifications: fetchNotifications,
        addEvent,
        updateEvent,
        removeEvent,
        addTask,
        updateTaskStatus,
        toggleRequirement,
        addTeamMember,
        moveTeamMember,
        addNotification,
        markNotificationRead,
        clearNotifications,
        triggerDeadlineChangeSimulation
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
};
