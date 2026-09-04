import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { getWhatsAppIntegrationStatus, verifyWhatsAppWebhook, receiveWhatsAppWebhook } from '../controllers/whatsappController';

const router = Router();

// Public Meta webhook endpoints.
router.get('/webhook', verifyWhatsAppWebhook);
router.post('/webhook', receiveWhatsAppWebhook);

// Safe, authenticated configuration status for the EventPilot UI.
router.get('/status', requireAuth, getWhatsAppIntegrationStatus);

export default router;
