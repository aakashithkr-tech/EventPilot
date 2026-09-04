import { Deadline } from '../types/index';
import { api } from './api';

export interface CreateDeadlinePayload {
  title: string;
  date: string;
  type?: Deadline['type'];
  verified?: boolean;
}

class DeadlineService {
  async list(eventId: string): Promise<Deadline[]> {
    const result = await api.get<{ deadlines: Deadline[] }>(`/events/${eventId}/deadlines`);
    return result.deadlines;
  }

  async create(eventId: string, payload: CreateDeadlinePayload): Promise<Deadline> {
    const result = await api.post<{ deadline: Deadline }>(`/events/${eventId}/deadlines`, payload);
    return result.deadline;
  }

  /** Creates several deadlines for an event in one call (official deadlines + AI milestones, both at event creation). */
  async bulkCreate(eventId: string, deadlines: CreateDeadlinePayload[]): Promise<Deadline[]> {
    const result = await api.post<{ deadlines: Deadline[] }>(`/events/${eventId}/deadlines/bulk`, {
      deadlines,
    });
    return result.deadlines;
  }

  async update(deadlineId: string, updates: Partial<CreateDeadlinePayload>): Promise<Deadline> {
    const result = await api.patch<{ deadline: Deadline }>(`/deadlines/${deadlineId}`, updates);
    return result.deadline;
  }

  async remove(deadlineId: string): Promise<void> {
    await api.delete(`/deadlines/${deadlineId}`);
  }

  /** Deletes every ai-recommended deadline for an event — used before writing a freshly-recalculated plan. */
  async removeAiRecommended(eventId: string): Promise<void> {
    await api.delete(`/events/${eventId}/deadlines/ai-recommended`);
  }
}

export const deadlineService = new DeadlineService();
