import { Event, Deadline, Requirement, Resource, TeamMember, Task } from '../types';

// AI Agent response generator
export interface AIChatResponse {
  text: string;
  suggestedAction?: {
    type: 'add-member' | 'add-task' | 'sim-deadline' | 'move-member' | 'none';
    payload: any;
  };
}

export function handleAgentChat(
  message: string,
  activeEventId: string | null,
  contextData: {
    events: Event[];
    tasks: Task[];
    teamMembers: TeamMember[];
    requirements: Requirement[];
  }
): AIChatResponse {
  const query = message.toLowerCase().trim();
  const currentEvent = contextData.events.find(e => e.id === activeEventId);
  const currentEventMembers = contextData.teamMembers.filter(m => m.eventId === activeEventId);

  // Command 1: Add a member to a team
  // Example: "add riya to xyz competition" or "add riya to this team"
  if (query.includes('add') && (query.includes('member') || query.includes('team') || query.includes('riya') || query.includes('aarish') || query.includes('aazim') || query.includes('john'))) {
    // Extract name
    let name = 'Riya';
    if (query.includes('aarish')) name = 'Aarish';
    else if (query.includes('aazim')) name = 'Aazim';
    else if (query.includes('john')) name = 'John';
    
    // Map names to user IDs
    let userId = 'u4'; // default for Riya
    if (name === 'Aarish') userId = 'u2';
    if (name === 'Aazim') userId = 'u3';
    if (name === 'John') userId = 'u-new';
    
    // Check which event
    let targetEvent = currentEvent;
    if (!targetEvent && contextData.events.length > 0) {
      targetEvent = contextData.events[0]; // fallback to first event if no active workspace
    }

    if (!targetEvent) {
      return { text: "I couldn't identify which event workspace to add the member to. Please select an active event first." };
    }

    return {
      text: `I'll add **${name}** to the team for **${targetEvent.name}**. She will receive future event notifications.`,
      suggestedAction: {
        type: 'add-member',
        payload: {
          eventId: targetEvent.id,
          userId,
          name,
          role: 'Collaborator',
          workload: 10
        }
      }
    };
  }

  // Command 2: What do I need to do today? / priorities
  if (query.includes('priorit') || query.includes('today') || query.includes('do now') || query.includes('todo')) {
    if (!activeEventId) {
      // General priorities across all events
      const atRiskEvents = contextData.events.filter(e => e.status === 'at-risk' || e.status === 'needs-attention');
      if (atRiskEvents.length === 0) {
        return {
          text: "🎉 **You are all caught up!** No active events are at risk. You can view the list of upcoming deadlines on the dashboard schedule."
        };
      }

      let priorityText = "Here are your priorities across all active workspaces today:\n\n";
      atRiskEvents.forEach(e => {
        const remainingTasks = contextData.tasks.filter(t => t.eventId === e.id && t.status !== 'done');
        priorityText += `* **[${e.name}]** Status: ${e.status === 'at-risk' ? '🔴 At Risk' : '🟡 Needs Attention'}\n`;
        if (remainingTasks.length > 0) {
          const topTask = remainingTasks[0];
          priorityText += `  ➔ Next Action: *${topTask.title}* (Assigned: ${contextData.teamMembers.find(m => m.id === topTask.assigneeId)?.name || 'Unassigned'})\n`;
        } else {
          priorityText += `  ➔ Next Action: *${e.nextAction}*\n`;
        }
      });
      return { text: priorityText };
    }

    // Event-specific priorities
    const eventTasks = contextData.tasks.filter(t => t.eventId === activeEventId && t.status !== 'done');
    const eventReqs = contextData.requirements.filter(r => r.eventId === activeEventId && !r.completed);

    if (eventTasks.length === 0 && eventReqs.length === 0) {
      return { text: `🎉 All tasks and requirements for **${currentEvent?.name}** are completed. You're on track!` };
    }

    let priorityText = `Here are your priorities for **${currentEvent?.name}** today:\n\n`;
    const criticalTasks = eventTasks.filter(t => t.priority === 'critical' || t.priority === 'high');
    
    if (criticalTasks.length > 0) {
      priorityText += `🔴 **At Risk / High Priority Tasks:**\n`;
      criticalTasks.slice(0, 3).forEach(t => {
        priorityText += `- [ ] *${t.title}* - Due ${t.dueDate || 'soon'}\n`;
      });
    }

    if (eventReqs.length > 0) {
      priorityText += `\n🟡 **Incomplete Event Submission Requirements:**\n`;
      eventReqs.slice(0, 3).forEach(r => {
        priorityText += `- [ ] *${r.title}* (Required by: ${r.requiredBy})\n`;
      });
    }

    priorityText += `\nWould you like me to assign one of these to a teammate?`;
    return { text: priorityText };
  }

  // Command 3: Which events are at risk?
  if (query.includes('at risk') || query.includes('risk') || query.includes('health') || query.includes('failing')) {
    const atRisk = contextData.events.filter(e => e.status === 'at-risk');
    const needsAttention = contextData.events.filter(e => e.status === 'needs-attention');

    if (atRisk.length === 0 && needsAttention.length === 0) {
      return { text: "✅ **All systems operational.** All active events are classified as **On Track**." };
    }

    let response = "Here is the operational status of your active events:\n\n";
    if (atRisk.length > 0) {
      response += `🚨 **At Risk (${atRisk.length}):**\n`;
      atRisk.forEach(e => {
        response += `- **${e.name}** (Progress: ${e.progress}%, Health: ${e.healthScore}%) ➔ Next Action: *${e.nextAction}*\n`;
      });
    }
    if (needsAttention.length > 0) {
      response += `\n⚠️ **Needs Attention (${needsAttention.length}):**\n`;
      needsAttention.forEach(e => {
        response += `- **${e.name}** (Progress: ${e.progress}%, Health: ${e.healthScore}%) ➔ Next Action: *${e.nextAction}*\n`;
      });
    }

    return { text: response };
  }

  // Command 4: Simulate a deadline change (demonstrate adaptation)
  if (query.includes('change deadline') || query.includes('extend deadline') || query.includes('simulate update') || query.includes('reschedule')) {
    let targetEvent = currentEvent;
    if (!targetEvent && contextData.events.length > 0) {
      targetEvent = contextData.events[0];
    }

    if (!targetEvent) {
      return { text: "Please select an active event workspace to simulate a deadline extension." };
    }

    return {
      text: `I'll simulate a deadline extension of 3 days for **${targetEvent.name}**. This will recalculate the preparation schedule and notify the team.`,
      suggestedAction: {
        type: 'sim-deadline',
        payload: { eventId: targetEvent.id }
      }
    };
  }

  // Command 5: What do we need to submit / Requirements
  if (query.includes('submit') || query.includes('requirement') || query.includes('deliverable')) {
    if (!activeEventId) {
      return { text: "Please select an event workspace to query submission requirements." };
    }
    const reqs = contextData.requirements.filter(r => r.eventId === activeEventId);
    let resp = `Here are the official submission deliverables for **${currentEvent?.name}**:\n\n`;
    reqs.forEach(r => {
      resp += `${r.completed ? '✅' : '⬜'} **${r.title}** - *Required by ${r.requiredBy}*\n`;
      if (r.description) resp += `  *Note: ${r.description}*\n`;
    });
    return { text: resp };
  }

  // Command 6: Assign a task to a teammate
  // Example: "assign the pitch deck to Aarish" or "give the demo video to Riya"
  if ((query.includes('assign') || query.includes('give') || query.includes('hand')) && (query.includes('task') || query.includes(' to '))) {
    let targetEvent = currentEvent;
    if (!targetEvent && contextData.events.length > 0) {
      targetEvent = contextData.events[0];
    }
    if (!targetEvent) {
      return { text: "Please select an active event workspace before assigning a task." };
    }

    // Match teammate name against known team members for this event first,
    // then fall back to a small set of demo names so this works even before
    // onboarding data has fully loaded.
    const eventMembers = contextData.teamMembers.filter(m => m.eventId === targetEvent!.id);
    const knownNames = eventMembers.length > 0 ? eventMembers.map(m => m.name) : ['Aarish', 'Aazim', 'Riya', 'John'];
    const matchedMember = eventMembers.find(m => query.includes(m.name.toLowerCase()))
      || knownNames.map(n => ({ name: n })).find(m => query.includes(m.name.toLowerCase()));

    if (!matchedMember) {
      return { text: `I couldn't tell who to assign this to. Try naming a teammate, e.g. "assign the pitch deck to ${knownNames[0]}".` };
    }

    // Pull the task title out of the phrase between "assign/give" and "to <name>"
    const nameLower = matchedMember.name.toLowerCase();
    let titlePart = query
      .replace(/^(assign|give|hand)\s+/, '')
      .replace(new RegExp(`\\bto\\s+${nameLower}\\b.*$`), '')
      .replace(/\bthe\b/g, '')
      .trim();
    if (!titlePart) titlePart = 'New task from AI Agent';
    const taskTitle = titlePart.charAt(0).toUpperCase() + titlePart.slice(1);

    const existingMember = eventMembers.find(m => m.name.toLowerCase() === nameLower);

    return {
      text: `I'll assign **"${taskTitle}"** to **${matchedMember.name}** on **${targetEvent.name}**.`,
      suggestedAction: {
        type: 'add-task',
        payload: {
          eventId: targetEvent.id,
          title: taskTitle,
          assigneeName: matchedMember.name,
          assigneeId: existingMember?.id
        }
      }
    };
  }

  // Command 7: Move a team member from one event workspace to another
  // Example: "move aarish to the case study event" or "move riya to conference"
  if (query.includes('move') && (query.includes(' to ') || query.includes(' into '))) {
    const allMembers = contextData.teamMembers;
    const matchedMember = allMembers.find(m => query.includes(m.name.toLowerCase()));

    if (!matchedMember) {
      return { text: `I couldn't tell which teammate to move. Try naming them, e.g. "move Aarish to the case study event".` };
    }

    // Find the destination event by matching words from its name against the query,
    // excluding the event the member is already on.
    const destinationEvent = contextData.events.find(e => {
      if (e.id === matchedMember.eventId) return false;
      const nameWords = e.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      return nameWords.some(w => query.includes(w));
    });

    if (!destinationEvent) {
      return { text: `I found **${matchedMember.name}**, but couldn't tell which event to move them to. Try naming the destination event directly.` };
    }

    const currentEventName = contextData.events.find(e => e.id === matchedMember.eventId)?.name || 'their current event';

    return {
      text: `I'll move **${matchedMember.name}** from **${currentEventName}** to **${destinationEvent.name}**. They'll stop receiving notifications for the old event.`,
      suggestedAction: {
        type: 'move-member',
        payload: {
          memberId: matchedMember.id,
          memberName: matchedMember.name,
          fromEventName: currentEventName,
          toEventId: destinationEvent.id,
          toEventName: destinationEvent.name
        }
      }
    };
  }

  // Fallback conversational responses
  return {
    text: `I'm here to help manage your event operations. I can support commands like:
* "What are my priorities today?"
* "Which events are at risk?"
* "Add Riya to this team"
* "Assign the pitch deck to Aarish"
* "Move Aarish to the case study event"
* "Simulate a deadline extension for this event"
* "What do we need to submit?"

Let me know what you need!`
  };
}
