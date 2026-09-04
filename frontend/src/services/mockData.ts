import { Event, Deadline, Requirement, Resource, TeamMember, Task, Notification, EventUpdate } from '../types';

export const initialEvents: Event[] = [
  {
    id: 'e1',
    name: 'XYZ AI Hackathon',
    type: 'hackathon',
    description: 'Develop a next-generation AI agent automation layer for enterprise operations.',
    websiteUrl: 'https://technext-hackathon.ai',
    status: 'needs-attention',
    finalDeadline: '2026-09-01T12:00:00Z', // 5 days 14 hours from Aug 26, 2026 22:00
    progress: 78,
    healthScore: 78,
    teamSize: 3,
    nextAction: 'Complete live demo integration'
  },
  {
    id: 'e2',
    name: 'Ascent Business Case Study',
    type: 'competition',
    description: 'Structure a market expansion strategy for a major European green hydrogen developer.',
    websiteUrl: 'https://ascent-case-challenge.com',
    status: 'at-risk',
    finalDeadline: '2026-09-03T18:00:00Z', // 7 days 20 hours
    progress: 40,
    healthScore: 50,
    teamSize: 2,
    nextAction: 'Compile financial projection charts'
  },
  {
    id: 'e3',
    name: 'SaaS Summit 2026',
    type: 'conference',
    description: 'Keynote and panel speaking details, registration, and networking sessions.',
    websiteUrl: 'https://saas-summit-2026.org',
    status: 'on-track',
    finalDeadline: '2026-09-10T09:00:00Z', // 14 days 11 hours
    progress: 90,
    healthScore: 95,
    teamSize: 1,
    nextAction: 'Review panel discussion slides'
  },
  {
    id: 'e4',
    name: 'Rust Systems Workshop',
    type: 'workshop',
    description: 'Advanced systems programming and memory safety patterns in high-concurrency Rust systems.',
    websiteUrl: 'https://rust-systems-workshop.dev',
    status: 'on-track',
    finalDeadline: '2026-09-17T14:00:00Z',
    progress: 25,
    healthScore: 90,
    teamSize: 3,
    nextAction: 'Submit pre-work programming assignments'
  }
];

export const initialDeadlines: Deadline[] = [
  // E1 Deadlines
  { id: 'd1-1', eventId: 'e1', title: 'Official: Registration Closes', date: '2026-08-30', type: 'official', verified: true },
  { id: 'd1-2', eventId: 'e1', title: 'AI Recommendation: Start Development Phase', date: '2026-09-02', type: 'ai-recommended', verified: true },
  { id: 'd1-3', eventId: 'e1', title: 'Official: Presentation Slides Submission', date: '2026-09-05', type: 'official', verified: true },
  { id: 'd1-4', eventId: 'e1', title: 'AI Recommendation: Code Freeze & Final Testing', date: '2026-09-10', type: 'ai-recommended', verified: true },
  { id: 'd1-5', eventId: 'e1', title: 'Official: FINAL SUBMISSION DEADLINE', date: '2026-09-13', type: 'official', verified: true }, // Adjusted deadline simulation

  // E2 Deadlines
  { id: 'd2-1', eventId: 'e2', title: 'Official: Case Study Released', date: '2026-08-25', type: 'official', verified: true },
  { id: 'd2-2', eventId: 'e2', title: 'AI Recommendation: Draft Slide Outline', date: '2026-08-28', type: 'ai-recommended', verified: true },
  { id: 'd2-3', eventId: 'e2', title: 'Official: Midpoint Checkpoint Pitch', date: '2026-08-31', type: 'official', verified: true },
  { id: 'd2-4', eventId: 'e2', title: 'Official: Final Slide Deck Upload', date: '2026-09-03', type: 'official', verified: true },

  // E3 Deadlines
  { id: 'd3-1', eventId: 'e3', title: 'Official: Submit Bio and Photo', date: '2026-08-28', type: 'official', verified: true },
  { id: 'd3-2', eventId: 'e3', title: 'Official: Draft Slide Presentation Submit', date: '2026-09-04', type: 'official', verified: true },
  { id: 'd3-3', eventId: 'e3', title: 'Official: Conference Kickoff & Speaking Slot', date: '2026-09-10', type: 'official', verified: true }
];

export const initialRequirements: Requirement[] = [
  // E1 Requirements (Hackathon - 4/7 Completed)
  { id: 'r1-1', eventId: 'e1', title: 'Problem Statement Analysis', completed: true, requiredBy: 'Organizer Guidelines', sourceLink: 'https://docs.event.ai/guidelines', verified: true },
  { id: 'r1-2', eventId: 'e1', title: 'Proposed Solution Slide Deck', completed: true, requiredBy: 'Submission Guidelines', sourceLink: 'https://docs.event.ai/deck-requirements', verified: true },
  { id: 'r1-3', eventId: 'e1', title: 'System Architecture Diagram', completed: true, requiredBy: 'Evaluation Criteria', sourceLink: 'https://docs.event.ai/rubric', verified: true },
  { id: 'r1-4', eventId: 'e1', title: 'Tech Stack Formulation', completed: false, description: 'Specify framework versions (React 19, Vite 8, TypeScript 6).', requiredBy: 'Submission Form', verified: true },
  { id: 'r1-5', eventId: 'e1', title: 'Deployed Live Demo App URL', completed: false, description: 'A working application link hosted on Vercel, Netlify, or AWS.', requiredBy: 'Organizer Guidelines', verified: true },
  { id: 'r1-6', eventId: 'e1', title: 'Public GitHub Repository Link', completed: false, description: 'Codebase with documentation, clean commit history, and setup instructions.', requiredBy: 'Submission Rubric', verified: true },
  { id: 'r1-7', eventId: 'e1', title: '2-Minute Video Demonstration', completed: false, description: 'High-quality screen recording demonstrating the core AI agent pipeline.', requiredBy: 'Organizer Guidelines', verified: false },

  // E2 Requirements (Case Study - 2/5 Completed)
  { id: 'r2-1', eventId: 'e2', title: 'Financial Modeling & CapEx', completed: true, requiredBy: 'Rubric Criteria', verified: true },
  { id: 'r2-2', eventId: 'e2', title: 'Competitor Landscape Analysis', completed: true, requiredBy: 'Submission Rubric', verified: true },
  { id: 'r2-3', eventId: 'e2', title: 'Regulatory Compliance Framework', completed: false, description: 'Assess green hydrogen laws in Germany and France.', requiredBy: 'Rubric Criteria', verified: true },
  { id: 'r2-4', eventId: 'e2', title: 'Market Entry Timeline (Gantt)', completed: false, description: 'Map years 1-5 strategy outline.', requiredBy: 'Organizer Brief', verified: false },
  { id: 'r2-5', eventId: 'e2', title: 'Executive Summary Board PDF', completed: false, description: 'Max 3-page summary document.', requiredBy: 'Official Submission', verified: true },

  // E3 Requirements (Conference)
  { id: 'r3-1', eventId: 'e3', title: 'Speaker Agreement Signoff', completed: true, requiredBy: 'Organizer Portal', verified: true },
  { id: 'r3-2', eventId: 'e3', title: 'Interactive QA Slides', completed: true, requiredBy: 'AV Team Specs', verified: true },
  { id: 'r3-3', eventId: 'e3', title: 'Final Slidedeck (16:9 Aspect Ratio)', completed: false, description: 'Visual-focused presentation.', requiredBy: 'Main Stage AV', verified: true }
];

export const initialResources: Resource[] = [
  // E1 Resources
  { id: 'res1-1', eventId: 'e1', name: 'Official PPT Template', type: 'template', fileType: 'PPT', source: 'Official Guidelines', url: '#' },
  { id: 'res1-2', eventId: 'e1', name: 'Problem Statement Document', type: 'document', fileType: 'PDF', source: 'Brief Release', url: '#' },
  { id: 'res1-3', eventId: 'e1', name: 'Evaluation Rulebook v1.2', type: 'document', fileType: 'PDF', source: 'Competition Details', url: '#' },

  // E2 Resources
  { id: 'res2-1', eventId: 'e2', name: 'Green Hydrogen Industry Report', type: 'document', fileType: 'PDF', source: 'World Energy Council', url: '#' },
  { id: 'res2-2', eventId: 'e2', name: 'Financial Projection Worksheet', type: 'template', fileType: 'Excel', source: 'Ascent Partner Materials', url: '#' },

  // E3 Resources
  { id: 'res3-1', eventId: 'e3', name: 'SaaS Speaker Briefing Guidelines', type: 'document', fileType: 'PDF', source: 'Speaker Portal', url: '#' }
];

export const initialTeamMembers: TeamMember[] = [
  // E1 Team
  { id: 'm1-1', eventId: 'e1', userId: 'u1', name: 'Aakashi', role: 'Frontend & UI Lead', workload: 80 },
  { id: 'm1-2', eventId: 'e1', userId: 'u2', name: 'Aarish', role: 'Backend & ML Engineer', workload: 60 },
  { id: 'm1-3', eventId: 'e1', userId: 'u3', name: 'Aazim', role: 'PPT & Documentation', workload: 90 },

  // E2 Team
  { id: 'm2-1', eventId: 'e2', userId: 'u1', name: 'Aakashi', role: 'Financial Modeler', workload: 95 },
  { id: 'm2-2', eventId: 'e2', userId: 'u4', name: 'Riya', role: 'Strategic Consultant', workload: 70 },

  // E3 Team (Speaker event - individual)
  { id: 'm3-1', eventId: 'e3', userId: 'u1', name: 'Aakashi', role: 'Keynote Speaker', workload: 40 },

  // E4 Team
  { id: 'm4-1', eventId: 'e4', userId: 'u1', name: 'Aakashi', role: 'Developer', workload: 50 },
  { id: 'm4-2', eventId: 'e4', userId: 'u2', name: 'Aarish', role: 'Systems Analyst', workload: 35 },
  { id: 'm4-3', eventId: 'e4', userId: 'u3', name: 'Aazim', role: 'Team Member', workload: 20 }
];

export const initialTasks: Task[] = [
  // E1 Tasks
  { id: 't1-1', eventId: 'e1', title: 'Implement live demo web application UI', description: 'Design premium pages and mock connections.', assigneeId: 'm1-1', dueDate: '2026-08-28', priority: 'critical', status: 'in-progress', requirementId: 'r1-5' },
  { id: 't1-2', eventId: 'e1', title: 'Complete AI agent API wrapper endpoints', description: 'Ensure prompt orchestrator structures output JSON models.', assigneeId: 'm1-2', dueDate: '2026-08-29', priority: 'high', status: 'todo', requirementId: 'r1-4' },
  { id: 't1-3', eventId: 'e1', title: 'Structure problem slides in Pitch deck', description: 'Write background history, target user, and core value props.', assigneeId: 'm1-3', dueDate: '2026-08-30', priority: 'medium', status: 'done', requirementId: 'r1-2' },
  { id: 't1-4', eventId: 'e1', title: 'Draft system architecture nodes', description: 'Illustrate data flow from Event PDF upload to parsed calendar dates.', assigneeId: 'm1-1', dueDate: '2026-08-27', priority: 'medium', status: 'done', requirementId: 'r1-3' },
  { id: 't1-5', eventId: 'e1', title: 'Record 2-min demo walkthrough', description: 'Focus on highlighting the responsive layouts and the AI Agent cmd+k commands.', assigneeId: 'm1-3', dueDate: '2026-08-31', priority: 'high', status: 'todo', requirementId: 'r1-7' },

  // E2 Tasks
  { id: 't2-1', eventId: 'e2', title: 'Calculate green hydrogen CapEx & OpEx model', description: 'Need detailed cash flow forecasts for years 1-5.', assigneeId: 'm2-1', dueDate: '2026-08-29', priority: 'critical', status: 'in-progress', requirementId: 'r2-1' },
  { id: 't2-2', eventId: 'e2', title: 'Draft regulatory compliance slide', description: 'Define EU RED III compliance pathways.', assigneeId: 'm2-2', dueDate: '2026-08-31', priority: 'medium', status: 'todo', requirementId: 'r2-3' },
  { id: 't2-3', eventId: 'e2', title: 'Compile competitor research document', description: 'Complete market profiles of main green utility operators.', assigneeId: 'm2-2', dueDate: '2026-08-26', priority: 'low', status: 'done', requirementId: 'r2-2' }
];

export const initialNotifications: Notification[] = [
  {
    id: 'n1',
    eventId: 'e1',
    title: 'Final Deadline Recalculated',
    message: 'The XYZ AI Hackathon submission deadline changed: Sep 10 ➔ Sep 13. Your preparation planner has automatically adjusted.',
    type: 'info',
    timestamp: '2h ago',
    read: false
  },
  {
    id: 'n2',
    eventId: 'e2',
    title: 'Milestone Warning: Action Required',
    message: 'The Ascent Case Midpoint Checkpoint is in 4 days. Financial projections slide is still incomplete.',
    type: 'critical',
    timestamp: '4h ago',
    read: false
  },
  {
    id: 'n3',
    eventId: 'e1',
    title: 'Requirement Update',
    message: 'Your XYZ slide deck is missing the System Architecture diagram. AI recommends attaching it today.',
    type: 'warning',
    timestamp: '1d ago',
    read: true
  },
  {
    id: 'n4',
    eventId: 'e1',
    title: 'Task Completed',
    message: 'Aarish completed Backend API wrappers for the AI Orchestrator service.',
    type: 'success',
    timestamp: '2d ago',
    read: true
  }
];

export const initialUpdates: EventUpdate[] = [
  {
    id: 'up1',
    eventId: 'e1',
    type: 'deadline-change',
    title: 'Official deadline extended by organizers',
    description: 'The final submission window is extended to accommodate system outages. Plan timelines recalculated.',
    timestamp: '2026-08-26T15:30:00Z',
    metadata: {
      oldValue: '2026-09-10T12:00:00Z',
      newValue: '2026-09-13T12:00:00Z'
    }
  },
  {
    id: 'up2',
    eventId: 'e1',
    type: 'requirement-added',
    title: 'New requirement: 2-minute video demo',
    description: 'Organizers now require a video walkthrough uploaded along with the GitHub link.',
    timestamp: '2026-08-25T10:15:00Z'
  }
];
