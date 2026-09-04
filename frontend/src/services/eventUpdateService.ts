import { EventUpdate } from '../types/index';
import { api } from './api';

export interface CreateEventUpdatePayload {
  type: EventUpdate['type'];
  title: string;
  description: string;
  metadata?: {
    oldValue?: string;
    newValue?: string;
  };
}

class EventUpdateService {
  async list(eventId: string): Promise<EventUpdate[]> {
    const result = await api.get<{ updates: EventUpdate[] }>(`/events/${eventId}/updates`);
    return result.updates;
  }

  async create(eventId: string, payload: CreateEventUpdatePayload): Promise<EventUpdate> {
    const result = await api.post<{ update: EventUpdate }>(`/events/${eventId}/updates`, payload);
    return result.update;
  }
}

export const eventUpdateService = new EventUpdateService();
