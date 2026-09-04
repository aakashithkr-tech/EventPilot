import { Router } from 'express';
import { updateDeadline, deleteDeadline } from '../controllers/deadlineController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

router.use(requireAuth);

router.patch('/:id', updateDeadline);
router.delete('/:id', deleteDeadline);

export default router;
