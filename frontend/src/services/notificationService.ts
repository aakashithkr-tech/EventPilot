import { Notification } from '../types/index';
import { api } from './api';

export interface CreateNotificationPayload {
  eventId?: string;
  title: string;
  message: string;
  type: Notification['type'];
  /** Fans the notification out to every active member of `eventId`, not just the caller — requires eventId. */
  targetTeam?: boolean;
}

class NotificationService {
  async list(): Promise<Notification[]> {
    const result = await api.get<{ notifications: Notification[] }>('/notifications');
    return result.notifications;
  }

  async create(payload: CreateNotificationPayload): Promise<Notification> {
    const result = await api.post<{ notification: Notification }>('/notifications', payload);
    return result.notification;
  }

  async markRead(id: string): Promise<Notification> {
    const result = await api.patch<{ notification: Notification }>(`/notifications/${id}`, { read: true });
    return result.notification;
  }

  async markAllRead(): Promise<void> {
    await api.patch(`/notifications/read-all`);
  }

  /**
   * Runs the backend's preparation-aware smart-notification engine
   * (staged at 15d/7d/3d/1d/3h, deduped by milestoneKey) for every event
   * the current user can see, and fans results out to every real active
   * team member — not just this session. Returns only the notifications
   * newly created for the current user, so the caller can merge them
   * straight into local state without a second fetch.
   */
  async generate(): Promise<Notification[]> {
    const result = await api.post<{ notifications: Notification[] }>('/notifications/generate');
    return result.notifications;
  }
}

export const notificationService = new NotificationService();
