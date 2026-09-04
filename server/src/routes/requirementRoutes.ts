import { Router } from 'express';
import { updateRequirement, deleteRequirement } from '../controllers/requirementController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

router.use(requireAuth);

router.patch('/:id', updateRequirement);
router.delete('/:id', deleteRequirement);

export default router;
