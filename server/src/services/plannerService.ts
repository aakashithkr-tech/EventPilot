import { Deadline } from '../models/Deadline';
import { Event } from '../models/Event';
import { EventMembership } from '../models/EventMembership';
import { Requirement } from '../models/Requirement';
import { Task } from '../models/Task';

export type PlannerComplexity = 'low' | 'medium' | 'high';

export interface PlannerPhase {
  name: string;
  startDate: string;
  endDate: string;
  description: string;
  milestoneTitle: string;
  percentage: number;
}

export interface PlannerResult {
  eventId: string;
  generatedAt: string;
  complexity: PlannerComplexity;
  daysAvailable: number;
  metrics: {
    teamSize: number;
    requirementCount: number;
    incompleteRequirementCount: number;
    taskCount: number;
    openTaskCount: number;
    overdueTaskCount: number;
  };
  phases: PlannerPhase[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function choosePhases(eventType: string, hasBuild: boolean, complexity: PlannerComplexity) {
  if (hasBuild || eventType === 'hackathon' || eventType === 'competition') {
    const coordination = complexity === 'high' ? 0.04 : complexity === 'low' ? -0.02 : 0;
    return [
      { name: 'Research & Ideation', pct: 0.14, desc: 'Understand the event criteria, research the problem space, and lock the solution direction.', milestone: 'Research & Core Concept Finalized' },
      { name: 'Architecture & Planning', pct: 0.14, desc: 'Finalize the technical approach, ownership, deliverables, and implementation plan.', milestone: 'Architecture Plan Complete' },
      { name: 'Core Development', pct: 0.34 - coordination, desc: 'Build the core deliverable and connect the functionality required for submission.', milestone: 'First Working Prototype Ready' },
      { name: 'Integration & Review', pct: 0.16 + coordination, desc: 'Integrate team work, close requirement gaps, and review the submission against the rules.', milestone: 'Core Integration Finished' },
      { name: 'Testing & Demo Prep', pct: 0.12, desc: 'Run end-to-end checks, validate the submission package, and prepare the demo/presentation.', milestone: 'Demo & Submission Package Ready' },
      { name: 'Buffer & Final Submission', pct: 0.10, desc: 'Keep a final safety window for fixes, final review, and submission.', milestone: 'Final Submission Ready' },
    ];
  }

  return [
    { name: 'Research & Content Outline', pct: 0.20, desc: 'Read the event requirements, collect source material, and finalize the content structure.', milestone: 'Outline & Storyboard Ready' },
    { name: 'Drafting', pct: 0.30, desc: 'Create the first complete version of the required content or presentation.', milestone: 'First Draft Complete' },
    { name: 'Design & Refinement', pct: 0.22, desc: 'Improve structure, visuals, clarity, and compliance with the submission criteria.', milestone: 'Content & Design Polished' },
    { name: 'Review & Validation', pct: 0.16, desc: 'Review every requirement, incorporate feedback, and fix outstanding issues.', milestone: 'Internal Review Finished' },
    { name: 'Final Submission', pct: 0.12, desc: 'Verify file formats, links, naming, and final submission readiness.', milestone: 'Final Submission Ready' },
  ];
}

export async function buildPlanner(eventId: string): Promise<PlannerResult & { aiDeadlines: Array<{ title: string; date: string; type: 'ai-recommended'; verified: boolean }> }> {
  const event = await Event.findById(eventId);
  if (!event) throw new Error('Event not found');

  const [requirements, tasks, memberships] = await Promise.all([
    Requirement.find({ eventId: event._id }).lean(),
    Task.find({ eventId: event._id }).lean(),
    EventMembership.find({ eventId: event._id, status: 'active' }).lean(),
  ]);

  const now = new Date();
  const finalDeadline = new Date(event.finalDeadline);
  const rawDays = Math.ceil((finalDeadline.getTime() - now.getTime()) / DAY_MS);
  const daysAvailable = Math.max(1, rawDays);

  const incompleteRequirementCount = requirements.filter((r) => !r.completed).length;
  const openTaskCount = tasks.filter((t) => t.status !== 'done').length;
  const overdueTaskCount = tasks.filter((t) => t.status !== 'done' && t.dueDate && new Date(t.dueDate).getTime() < now.getTime()).length;
  const teamSize = Math.max(1, memberships.length || event.teamSize || 1);

  const hasBuild = requirements.some((r) => /demo|app|github|repository|prototype|code|deploy/i.test(r.title));
  const score = (teamSize >= 5 ? 2 : teamSize >= 3 ? 1 : 0)
    + (requirements.length >= 6 ? 2 : requirements.length >= 3 ? 1 : 0)
    + (openTaskCount >= 8 ? 2 : openTaskCount >= 4 ? 1 : 0)
    + (overdueTaskCount > 0 ? 1 : 0);

  const complexity: PlannerComplexity = score >= 5 ? 'high' : score >= 2 ? 'medium' : 'low';
  const phaseDefs = choosePhases(event.type, hasBuild, complexity);

  // A short deadline needs more buffer/review time; a long window can afford a little more build time.
  const deadlinePressure = daysAvailable <= 3 ? 0.06 : daysAvailable <= 7 ? 0.03 : 0;
  if (deadlinePressure > 0) {
    const build = phaseDefs.find((p) => p.name === 'Core Development');
    const buffer = phaseDefs.find((p) => p.name === 'Buffer & Final Submission' || p.name === 'Final Submission');
    if (build && buffer) {
      build.pct = Math.max(0.20, build.pct - deadlinePressure);
      buffer.pct += deadlinePressure;
    }
  }

  const total = phaseDefs.reduce((sum, p) => sum + p.pct, 0);
  phaseDefs.forEach((p) => { p.pct /= total; });

  const windowStart = new Date(now.getTime());
  // If a deadline is already passed, generate a recovery plan for the next 14 days rather than fake historical dates.
  const effectiveEnd = rawDays > 0 ? finalDeadline : new Date(now.getTime() + 14 * DAY_MS);
  const effectiveWindowMs = Math.max(DAY_MS, effectiveEnd.getTime() - windowStart.getTime());

  const phases: PlannerPhase[] = [];
  const aiDeadlines: Array<{ title: string; date: string; type: 'ai-recommended'; verified: boolean }> = [];
  let current = windowStart.getTime();

  phaseDefs.forEach((phase) => {
    const end = Math.min(effectiveEnd.getTime(), current + effectiveWindowMs * phase.pct);
    phases.push({
      name: phase.name,
      startDate: new Date(current).toISOString(),
      endDate: new Date(end).toISOString(),
      description: phase.desc,
      milestoneTitle: phase.milestone,
      percentage: Math.round(phase.pct * 100),
    });
    aiDeadlines.push({
      title: `AI Milestone: ${phase.milestone}`,
      date: isoDate(new Date(end)),
      type: 'ai-recommended',
      verified: true,
    });
    current = end;
  });

  return {
    eventId,
    generatedAt: now.toISOString(),
    complexity,
    daysAvailable: clamp(daysAvailable, 1, 3650),
    metrics: {
      teamSize,
      requirementCount: requirements.length,
      incompleteRequirementCount,
      taskCount: tasks.length,
      openTaskCount,
      overdueTaskCount,
    },
    phases,
    aiDeadlines,
  };
}

export async function recalculateAndPersistPlanner(eventId: string, userId: string) {
  const plan = await buildPlanner(eventId);
  const event = await Event.findById(eventId);
  if (!event) throw new Error('Event not found');

  await Deadline.deleteMany({ eventId: event._id, type: 'ai-recommended' });
  if (plan.aiDeadlines.length > 0) {
    await Deadline.insertMany(plan.aiDeadlines.map((d) => ({
      eventId: event._id,
      createdBy: userId,
      ...d,
      date: new Date(d.date),
    })));
  }

  return plan;
}
