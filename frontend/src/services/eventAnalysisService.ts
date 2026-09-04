import { api } from './api';
import { Event, Deadline, Requirement, Resource, TeamMember } from '../types';

export interface AIAnalysisResult {
  sourceUrl?: string;
  sourceType: 'url' | 'text';
  event: Omit<Event, 'id'>;
  deadlines: Omit<Deadline, 'id' | 'eventId'>[];
  requirements: Omit<Requirement, 'id' | 'eventId'>[];
  resources: Omit<Resource, 'id' | 'eventId'>[];
  teamMembers: Omit<TeamMember, 'id' | 'eventId'>[];
  confidence: {
    overall: 'high' | 'medium' | 'low';
    event: 'high' | 'medium' | 'low';
    deadlines: 'high' | 'medium' | 'low';
    requirements: 'high' | 'medium' | 'low';
    resources: 'high' | 'medium' | 'low';
  };
  warnings: string[];
}

export const eventAnalysisService = {
  analyze: async (source: string): Promise<AIAnalysisResult> => {
    const data = await api.post<{ analysis: AIAnalysisResult }>('/events/analyze', { source });
    return data.analysis;
  },
};
