import { Router } from 'express';
import { listMyInvitations, acceptInvitation, declineInvitation } from '../controllers/invitationController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

router.use(requireAuth);

router.get('/mine', listMyInvitations);
router.post('/:id/accept', acceptInvitation);
router.post('/:id/decline', declineInvitation);

export default router;
