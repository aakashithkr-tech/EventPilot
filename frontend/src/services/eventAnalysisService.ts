import { api } from './api';
import { Event, Deadline, Requirement, Resource, TeamMember } from '../types';

export interface AIAnalysisResult {
  sourceUrl?: string;
  sourceType: 'url' | 'text';
  event: Omit<Event, 'id'> & {
    /** Smallest team size allowed by the event's own rules (e.g. "2-4 members" → 2). */
    teamSizeMin?: number;
    /** Largest team size allowed by the event's own rules (e.g. "2-4 members" → 4). */
    teamSizeMax?: number;
    individualAllowed?: boolean;
    participationDetails?: string;
  };
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