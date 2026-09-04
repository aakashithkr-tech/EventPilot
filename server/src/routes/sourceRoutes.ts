import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { listEventSources, startGmailConnect, createWhatsAppSource, syncEventSource, disconnectEventSource } from '../controllers/sourceController';

const router = Router();
router.use(requireAuth);
router.get('/events/:id/sources', listEventSources);
router.get('/events/:id/sources/gmail/connect', startGmailConnect);
router.post('/events/:id/sources/whatsapp', createWhatsAppSource);
router.post('/events/:id/sources/:sourceId/sync', syncEventSource);
router.delete('/events/:id/sources/:sourceId', disconnectEventSource);
export default router;
