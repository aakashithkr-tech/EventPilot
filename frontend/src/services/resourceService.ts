import { Resource } from '../types/index';
import { api } from './api';

export interface CreateResourcePayload {
  name: string;
  type: Resource['type'];
  fileType: string;
  source: string;
  url: string;
}

class ResourceService {
  async list(eventId: string): Promise<Resource[]> {
    const result = await api.get<{ resources: Resource[] }>(`/events/${eventId}/resources`);
    return result.resources;
  }

  async create(eventId: string, payload: CreateResourcePayload): Promise<Resource> {
    const result = await api.post<{ resource: Resource }>(`/events/${eventId}/resources`, payload);
    return result.resource;
  }

  /** Creates several resources for an event in one call (e.g. the AI-analysis batch at event creation). */
  async bulkCreate(eventId: string, resources: CreateResourcePayload[]): Promise<Resource[]> {
    const result = await api.post<{ resources: Resource[] }>(`/events/${eventId}/resources/bulk`, {
      resources,
    });
    return result.resources;
  }

  async update(resourceId: string, updates: Partial<CreateResourcePayload>): Promise<Resource> {
    const result = await api.patch<{ resource: Resource }>(`/resources/${resourceId}`, updates);
    return result.resource;
  }

  async remove(resourceId: string): Promise<void> {
    await api.delete(`/resources/${resourceId}`);
  }
}

export const resourceService = new ResourceService();
