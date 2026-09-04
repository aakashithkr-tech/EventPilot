import { api } from './api';

export type PlannerComplexity = 'low' | 'medium' | 'high';

export interface PlannerPhase {
  name: string;
  startDate: string;
  endDate: string;
  description: string;
  milestoneTitle: string;
  percentage: number;
}

export interface PlannerMetrics {
  teamSize: number;
  requirementCount: number;
  incompleteRequirementCount: number;
  taskCount: number;
  openTaskCount: number;
  overdueTaskCount: number;
}

export interface PlannerResult {
  eventId: string;
  generatedAt: string;
  complexity: PlannerComplexity;
  daysAvailable: number;
  metrics: PlannerMetrics;
  phases: PlannerPhase[];
  aiDeadlines?: Array<{ title: string; date: string; type: 'ai-recommended'; verified: boolean }>;
}

class PlannerService {
  async get(eventId: string): Promise<PlannerResult> {
    const result = await api.get<{ plan: PlannerResult }>(`/events/${eventId}/planner`);
    return result.plan;
  }

  async recalculate(eventId: string): Promise<PlannerResult> {
    const result = await api.post<{ plan: PlannerResult }>(`/events/${eventId}/planner/recalculate`);
    return result.plan;
  }
}

export const plannerService = new PlannerService();
