import { Router } from 'express';
import { authenticate, requirePermission } from '@/middlewares/auth.middleware';
import { pagesController } from './pages.controller';

const pagesRouter = Router();

// Admin operations - requires page:manage
pagesRouter.use(authenticate, requirePermission('page:manage'));

pagesRouter.get('/', pagesController.listPages);
pagesRouter.post('/', pagesController.createPage);

pagesRouter.get('/:id', pagesController.getPageById);
pagesRouter.put('/:id', pagesController.updatePage);
pagesRouter.delete('/:id', pagesController.deletePage);

pagesRouter.post('/:id/publish', pagesController.publishPage);
pagesRouter.post('/:id/unpublish', pagesController.unpublishPage);

pagesRouter.get('/:id/revisions', pagesController.listRevisions);
pagesRouter.post('/:id/revisions/:version/restore', pagesController.restoreRevision);

// Public pages router
const publicPagesRouter = Router();

// Nav list must be before /:slug if mounted at same level, or GET / and GET /:slug
publicPagesRouter.get('/', pagesController.getPublicNavList);
publicPagesRouter.get('/:slug', pagesController.getPublicPageBySlug);

export { pagesRouter, publicPagesRouter };
