import { Router } from 'express';
import { updateResource, deleteResource } from '../controllers/resourceController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

router.use(requireAuth);

router.patch('/:id', updateResource);
router.delete('/:id', deleteResource);

export default router;
