import { Router } from 'express';
import { authenticate, requirePermission } from '@/middlewares/auth.middleware';
import { bannersController } from './banners.controller';

const bannersRouter = Router();

// Administrative routes - require banner:manage permission
bannersRouter.use(authenticate, requirePermission('banner:manage'));

// List banners
bannersRouter.get('/', bannersController.listBanners);

// Reorder banners (fixed path before /:id)
bannersRouter.put('/reorder', bannersController.reorderBanners);

// Create banner
bannersRouter.post('/', bannersController.createBanner);

// Single banner operations
bannersRouter.get('/:id', bannersController.getBannerById);
bannersRouter.put('/:id', bannersController.updateBanner);
bannersRouter.patch('/:id/toggle', bannersController.toggleActive);
bannersRouter.delete('/:id', bannersController.deleteBanner);

// Public router
const publicBannersRouter = Router();
publicBannersRouter.get('/', bannersController.getPublicBanners);

export { bannersRouter, publicBannersRouter };
