import { Router } from 'express';
import { categoriesController } from './categories.controller';
import { authenticate, requirePermission } from '@/middlewares/auth.middleware';
import { handleUploadSingle } from '@/middlewares/upload.middleware';

export const categoriesRouter = Router();

// ================= Public Endpoints =================
categoriesRouter.get('/', categoriesController.getPublicTree);
categoriesRouter.get('/:slug', categoriesController.getPublicBySlug);

// ================= Admin Endpoints =================
categoriesRouter.get(
  '/admin/all',
  authenticate,
  requirePermission('category:read'),
  categoriesController.getAdminCategories,
);

categoriesRouter.get(
  '/admin/:id',
  authenticate,
  requirePermission('category:read'),
  categoriesController.getCategoryById,
);

categoriesRouter.post(
  '/',
  authenticate,
  requirePermission('category:create'),
  categoriesController.createCategory,
);

categoriesRouter.patch(
  '/:id',
  authenticate,
  requirePermission('category:update'),
  categoriesController.updateCategory,
);

categoriesRouter.delete(
  '/:id',
  authenticate,
  requirePermission('category:delete'),
  categoriesController.deleteCategory,
);

categoriesRouter.patch(
  '/:id/status',
  authenticate,
  requirePermission('category:update'),
  categoriesController.updateStatus,
);

categoriesRouter.patch(
  '/:id/image',
  authenticate,
  requirePermission('category:update'),
  categoriesController.updateImage,
);

categoriesRouter.post(
  '/:id/image',
  authenticate,
  requirePermission('category:update'),
  handleUploadSingle('image'),
  categoriesController.uploadImage,
);

categoriesRouter.put(
  '/reorder',
  authenticate,
  requirePermission('category:update'),
  categoriesController.reorderCategories,
);
