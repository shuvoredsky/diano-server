import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyJobsSecret } from './internal-jobs.middleware';
import { internalJobsController } from './internal-jobs.controller';

const router = Router();

// Internal jobs rate limit: max 60 executions per minute per client IP
const jobsRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many internal job requests. Please slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/jobs/:name', jobsRateLimiter, verifyJobsSecret, internalJobsController.triggerJob);

export const internalJobsRouter = router;
