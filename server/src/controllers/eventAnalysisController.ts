import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorMiddleware';
import { analyzeEventSource } from '../services/eventAnalysisService';

export const analyzeEvent = asyncHandler(async (req: Request, res: Response) => {
  const source = typeof req.body?.source === 'string' ? req.body.source.trim() : '';
  if (!source) throw new AppError('source is required', 400, 'VALIDATION_ERROR');
  if (source.length > 20000) throw new AppError('source is too long', 400, 'VALIDATION_ERROR');

  try {
    const result = await analyzeEventSource(source);
    res.json({ success: true, data: { analysis: result } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Event analysis failed.';
    throw new AppError(message, 422, 'ANALYSIS_FAILED');
  }
});
