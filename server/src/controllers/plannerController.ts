import { Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorMiddleware';
import { AuthedRequest } from '../middleware/authMiddleware';
import { loadAuthorizedEvent } from '../utils/eventAccess';
import { buildPlanner, recalculateAndPersistPlanner } from '../services/plannerService';

export const getEventPlanner = asyncHandler(async (req: AuthedRequest, res: Response) => {
  await loadAuthorizedEvent(req.params.id, req.userId as string);
  const plan = await buildPlanner(req.params.id);
  res.json({ success: true, data: { plan } });
});

export const recalculateEventPlanner = asyncHandler(async (req: AuthedRequest, res: Response) => {
  await loadAuthorizedEvent(req.params.id, req.userId as string);
  try {
    const plan = await recalculateAndPersistPlanner(req.params.id, req.userId as string);
    res.json({ success: true, data: { plan } });
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : 'Could not recalculate preparation plan', 500, 'PLANNER_ERROR');
  }
});
