import { Router, Response } from 'express';
import { requireAuth, AuthedRequest } from '../middleware/authMiddleware';
import { loadAuthorizedEvent } from '../utils/eventAccess';
import { syncWebsiteEvent, syncAllWebsiteEvents } from '../services/eventSourceMonitorService';

const router = Router();
router.use(requireAuth);

router.post('/events/:id/sync-website', async (req: AuthedRequest, res: Response) => {
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);
  const result = await syncWebsiteEvent(event._id.toString());
  res.json({ success: true, data: { result } });
});

// Owner/member authenticated endpoint useful for admin dashboards and manual
// "sync now" controls. It only processes events visible to the current user.
router.post('/events/sync-websites', async (req: AuthedRequest, res: Response) => {
  const result = await syncAllWebsiteEvents(req.userId as string);
  res.json({ success: true, data: { result } });
});

export default router;
