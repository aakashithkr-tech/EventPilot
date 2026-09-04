import { Router } from 'express';
import { createEvent, getEvents, getEvent, updateEvent, deleteEvent } from '../controllers/eventController';
import { getEventTeam, addTeamMember, removeTeamMember } from '../controllers/teamController';
import { createInvitation, listEventInvitations } from '../controllers/invitationController';
import { getEventTasks, createTask } from '../controllers/taskController';
import { getEventRequirements, createRequirement, bulkCreateRequirements } from '../controllers/requirementController';
import { getEventResources, createResource, bulkCreateResources } from '../controllers/resourceController';
import { getEventDeadlines, createDeadline, bulkCreateDeadlines, deleteAiRecommendedDeadlines } from '../controllers/deadlineController';
import { getEventUpdates, createEventUpdate } from '../controllers/eventUpdateController';
import { requireAuth } from '../middleware/authMiddleware';
import { getEventPlanner, recalculateEventPlanner } from '../controllers/plannerController';
import { analyzeEvent } from '../controllers/eventAnalysisController';

const router = Router();

router.use(requireAuth);

router.get('/', getEvents);
router.post('/', createEvent);
router.post('/analyze', analyzeEvent);
router.get('/:id', getEvent);
router.patch('/:id', updateEvent);
router.delete('/:id', deleteEvent);

router.get('/:id/team', getEventTeam);
router.post('/:id/team', addTeamMember);
router.delete('/:id/team/:userId', removeTeamMember);

router.post('/:id/invitations', createInvitation);
router.get('/:id/invitations', listEventInvitations);

router.get('/:id/tasks', getEventTasks);
router.post('/:id/tasks', createTask);

router.get('/:id/requirements', getEventRequirements);
router.post('/:id/requirements', createRequirement);
router.post('/:id/requirements/bulk', bulkCreateRequirements);

router.get('/:id/resources', getEventResources);
router.post('/:id/resources', createResource);
router.post('/:id/resources/bulk', bulkCreateResources);

router.get('/:id/deadlines', getEventDeadlines);
router.post('/:id/deadlines', createDeadline);
router.post('/:id/deadlines/bulk', bulkCreateDeadlines);
router.delete('/:id/deadlines/ai-recommended', deleteAiRecommendedDeadlines);

router.get('/:id/updates', getEventUpdates);

router.get('/:id/planner', getEventPlanner);
router.post('/:id/planner/recalculate', recalculateEventPlanner);
router.post('/:id/updates', createEventUpdate);

export default router;
