import { Deadline, Requirement } from '../types';

export interface PlannerPhase {
  name: string;
  startDate: Date;
  endDate: Date;
  description: string;
  milestoneTitle: string;
  percentage: number;
}

export function generatePrepPlan(
  eventId: string,
  finalDeadlineStr: string,
  requirements: Requirement[],
  teamSize: number = 1
): { phases: PlannerPhase[]; deadlines: Deadline[]; complexity: 'low' | 'medium' | 'high' } {
  const finalDeadline = new Date(finalDeadlineStr);
  const today = new Date('2026-08-26T22:00:00Z'); // Pin to current relative date in prompt

  // Calculate total window of time (default to 14 days if deadline is in past or too close)
  let diffMs = finalDeadline.getTime() - today.getTime();
  if (diffMs <= 0) {
    diffMs = 14 * 24 * 60 * 60 * 1000; // 14 days fallback
  }

  const deliverableCount = requirements.length;
  const hasBuild = requirements.some(r => r.title.toLowerCase().includes('demo') || r.title.toLowerCase().includes('app') || r.title.toLowerCase().includes('github'));

  // Complexity is derived from team size + how many deliverables must be tracked,
  // not just guessed — bigger teams and more requirements mean more coordination
  // overhead, which shifts time away from solo "build" phases and into
  // integration/review phases below.
  let complexity: 'low' | 'medium' | 'high' = 'medium';
  const complexityScore = (teamSize >= 5 ? 2 : teamSize >= 3 ? 1 : 0) + (deliverableCount >= 6 ? 2 : deliverableCount >= 3 ? 1 : 0);
  if (complexityScore <= 1) complexity = 'low';
  else if (complexityScore >= 3) complexity = 'high';

  // Phase allocation based on complexity
  let phaseDistribution: { name: string; pct: number; desc: string; milestone: string }[] = [];

  if (hasBuild) {
    // PPT + Live Project distribution — larger/higher-complexity teams shift
    // weight from solo core development into coordination-heavy integration,
    // testing, and buffer phases (more people/parts to reconcile).
    const shift = complexity === 'high' ? 0.06 : complexity === 'low' ? -0.04 : 0;
    phaseDistribution = [
      { name: 'Research & Ideation', pct: 0.15, desc: 'Understand criteria, brainstorm solutions, explore problem space.', milestone: 'Research & Core Concept Finalized' },
      { name: 'Architecture & Tech Stack', pct: 0.15 + (complexity === 'high' ? 0.02 : 0), desc: teamSize >= 3 ? 'Define tech stack, split ownership across the team, design system architecture.' : 'Define tech stack, design system architecture, mock UI sketches.', milestone: 'Architecture Plan Complete' },
      { name: 'Core Development', pct: Math.max(0.22, 0.35 - shift), desc: 'Develop core functional features, wire up database/APIs.', milestone: 'First Working Prototype Ready' },
      { name: 'Integration & Polish', pct: 0.15 + shift * 0.5, desc: teamSize >= 3 ? 'Merge each member\u2019s components, resolve integration conflicts, refine styling.' : 'Connect components, refine styling, and construct initial PPT outline.', milestone: 'Core Integration Finished' },
      { name: 'Testing & Demo Prep', pct: 0.10 + shift * 0.3, desc: 'Perform end-to-end testing, record demo video, draft repository documentation.', milestone: 'Demo Video & Code Refined' },
      { name: 'Buffer & Final Submission', pct: 0.10 + shift * 0.2, desc: 'Final review against rules, check slide transitions, and submit files.', milestone: 'Final Submission Ready' }
    ];
  } else {
    // PPT/Presentation-only or light complexity
    const shift = complexity === 'high' ? 0.05 : complexity === 'low' ? -0.03 : 0;
    phaseDistribution = [
      { name: 'Research & Content Outlining', pct: 0.20, desc: 'Analyze submission guidelines, outline slides, gather data points.', milestone: 'Detailed Outline & Storyboard Ready' },
      { name: 'Drafting Slides', pct: Math.max(0.22, 0.30 - shift), desc: 'Draft layout, build slides, construct diagrams and visual assets.', milestone: 'Slide Draft Complete' },
      { name: 'Design and Style Polish', pct: 0.25, desc: 'Refine visual typography, align assets, design transition animations.', milestone: 'Presentation Styled & Polished' },
      { name: 'Review & Peer Feedback', pct: 0.15 + shift * 0.6, desc: teamSize >= 3 ? 'Present to the full team for peer review, refine based on criteria checklist.' : 'Present to peer reviews, refine based on criteria checklist.', milestone: 'Internal Peer Review Finished' },
      { name: 'Final Refinement & Submission', pct: 0.10 + shift * 0.4, desc: 'Verify submission formats (PDF/PPTX) and upload files.', milestone: 'Final Submission Ready' }
    ];
  }

  // Normalize percentages back to exactly 1.0 after the complexity shifts above
  // (floating point + the shift math can drift slightly).
  const totalPct = phaseDistribution.reduce((sum, p) => sum + p.pct, 0);
  phaseDistribution = phaseDistribution.map(p => ({ ...p, pct: p.pct / totalPct }));

  const phases: PlannerPhase[] = [];
  const deadlines: Deadline[] = [];
  
  let currentStartMs = finalDeadline.getTime() - diffMs;

  phaseDistribution.forEach((phaseDef, index) => {
    const durationMs = diffMs * phaseDef.pct;
    const endMs = currentStartMs + durationMs;
    
    const startDate = new Date(currentStartMs);
    const endDate = new Date(endMs);

    phases.push({
      name: phaseDef.name,
      startDate,
      endDate,
      description: phaseDef.desc,
      milestoneTitle: phaseDef.milestone,
      percentage: Math.round(phaseDef.pct * 100)
    });

    // Generate an AI milestone deadline for each phase transition
    deadlines.push({
      id: `${eventId}-ai-milestone-${index}`,
      eventId,
      title: `AI Milestone: ${phaseDef.milestone}`,
      date: endDate.toISOString().split('T')[0],
      type: 'ai-recommended',
      verified: true
    });

    currentStartMs = endMs;
  });

  return { phases, deadlines, complexity };
}
