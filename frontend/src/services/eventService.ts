import { Event } from '../types/index';
import { api } from './api';

export interface CreateEventPayload {
  name: string;
  type: Event['type'];
  description: string;
  websiteUrl?: string;
  status: Event['status'];
  finalDeadline: string;
  teamSize: number;
  nextAction: string;
}

class EventService {
  async list(): Promise<Event[]> {
    const result = await api.get<{ events: Event[] }>('/events');
    return result.events;
  }

  async get(id: string): Promise<Event> {
    const result = await api.get<{ event: Event }>(`/events/${id}`);
    return result.event;
  }

  async create(payload: CreateEventPayload): Promise<Event> {
    const result = await api.post<{ event: Event }>('/events', payload);
    return result.event;
  }

  async update(id: string, updates: Partial<Event>): Promise<Event> {
    const result = await api.patch<{ event: Event }>(`/events/${id}`, updates);
    return result.event;
  }

  async remove(id: string): Promise<void> {
    await api.delete(`/events/${id}`);
  }
}

export const eventService = new EventService();
