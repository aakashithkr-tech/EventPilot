import { Router } from 'express';
import { updateTask, deleteTask } from '../controllers/taskController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

router.use(requireAuth);

router.patch('/:id', updateTask);
router.delete('/:id', deleteTask);

export default router;
