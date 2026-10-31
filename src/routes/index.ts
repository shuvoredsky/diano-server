import { Router } from 'express';
import { healthRouter } from './health.routes';

const rootRouter = Router();

// Root health and readiness probes
rootRouter.use('/', healthRouter);

export { rootRouter };
