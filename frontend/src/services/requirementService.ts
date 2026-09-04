import { Requirement } from '../types/index';
import { api } from './api';

export interface CreateRequirementPayload {
  title: string;
  description?: string;
  requiredBy: string;
  sourceLink?: string;
  completed?: boolean;
  verified?: boolean;
}

class RequirementService {
  async list(eventId: string): Promise<Requirement[]> {
    const result = await api.get<{ requirements: Requirement[] }>(`/events/${eventId}/requirements`);
    return result.requirements;
  }

  async create(eventId: string, payload: CreateRequirementPayload): Promise<Requirement> {
    const result = await api.post<{ requirement: Requirement }>(`/events/${eventId}/requirements`, payload);
    return result.requirement;
  }

  /** Creates several requirements for an event in one call (e.g. the AI-analysis batch at event creation). */
  async bulkCreate(eventId: string, requirements: CreateRequirementPayload[]): Promise<Requirement[]> {
    const result = await api.post<{ requirements: Requirement[] }>(`/events/${eventId}/requirements/bulk`, {
      requirements,
    });
    return result.requirements;
  }

  async update(requirementId: string, updates: Partial<CreateRequirementPayload>): Promise<Requirement> {
    const result = await api.patch<{ requirement: Requirement }>(`/requirements/${requirementId}`, updates);
    return result.requirement;
  }

  async remove(requirementId: string): Promise<void> {
    await api.delete(`/requirements/${requirementId}`);
  }
}

export const requirementService = new RequirementService();
