import { Router } from 'express';
import {
  getNotifications,
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
  generateNotifications,
} from '../controllers/notificationController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

router.use(requireAuth);

router.get('/', getNotifications);
router.post('/', createNotification);
router.post('/generate', generateNotifications);
router.patch('/read-all', markAllNotificationsRead);
router.patch('/:id', markNotificationRead);

export default router;
