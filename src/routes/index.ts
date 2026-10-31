import { Router } from 'express';
import { healthRouter } from './health.routes';
import { authRouter } from '@/modules/auth/auth.routes';
import { usersRouter } from '@/modules/users/users.routes';

const rootRouter = Router();

// Root health and readiness probes
rootRouter.use('/', healthRouter);

// Authentication & Identity
rootRouter.use('/auth', authRouter);

// User Management (Admin)
rootRouter.use('/users', usersRouter);

export { rootRouter };

