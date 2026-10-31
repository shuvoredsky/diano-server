import { Router } from 'express';
import { productsController } from './products.controller';
import { authenticate, requirePermission } from '@/middlewares/auth.middleware';
import { handleUploadMultiple, handleUploadSingle } from '@/middlewares/upload.middleware';

export const productsRouter = Router();

// ================= Public Endpoints =================
// Note: /featured and /admin/* must be declared before /:slug to avoid route collision
productsRouter.get('/', productsController.getPublicProducts);
productsRouter.get('/featured', productsController.getPublicFeatured);

// ================= Admin Endpoints =================
productsRouter.get(
  '/admin/form-options',
  authenticate,
  requirePermission('product:read'),
  productsController.getAdminFormOptions,
);

productsRouter.get(
  '/admin/all',
  authenticate,
  requirePermission('product:read'),
  productsController.getAdminProducts,
);

productsRouter.get(
  '/admin/:id',
  authenticate,
  requirePermission('product:read'),
  productsController.getAdminProductById,
);

productsRouter.post(
  '/',
  authenticate,
  requirePermission('product:create'),
  productsController.createProduct,
);

productsRouter.patch(
  '/:id',
  authenticate,
  requirePermission('product:update'),
  productsController.updateProduct,
);

productsRouter.delete(
  '/:id',
  authenticate,
  requirePermission('product:delete'),
  productsController.deleteProduct,
);

productsRouter.patch(
  '/:id/status',
  authenticate,
  requirePermission('product:publish'),
  productsController.updateStatus,
);

productsRouter.patch(
  '/:id/featured',
  authenticate,
  requirePermission('product:update'),
  productsController.toggleFeatured,
);

// Variant Management
productsRouter.post(
  '/:id/variants',
  authenticate,
  requirePermission('product:create'),
  productsController.addVariant,
);

productsRouter.patch(
  '/:id/variants/:variantId',
  authenticate,
  requirePermission('product:update'),
  productsController.updateVariant,
);

productsRouter.delete(
  '/:id/variants/:variantId',
  authenticate,
  requirePermission('product:delete'),
  productsController.deleteVariant,
);

// Image Gallery Management
// Note: Fixed sub-paths must precede parameter routes /:imageId
productsRouter.put(
  '/:id/images/reorder',
  authenticate,
  requirePermission('product:update'),
  productsController.reorderImages,
);

productsRouter.post(
  '/:id/images/thumbnail',
  authenticate,
  requirePermission('product:update'),
  handleUploadSingle('image'),
  productsController.uploadThumbnail,
);

productsRouter.post(
  '/:id/images/backview',
  authenticate,
  requirePermission('product:update'),
  handleUploadSingle('image'),
  productsController.uploadBackview,
);

productsRouter.post(
  '/:id/images/gallery',
  authenticate,
  requirePermission('product:update'),
  handleUploadSingle('image'),
  productsController.uploadGallery,
);

productsRouter.post(
  '/:id/images',
  authenticate,
  requirePermission('product:update'),
  handleUploadMultiple('images', 10),
  productsController.uploadImages,
);

productsRouter.patch(
  '/:id/images/:imageId',
  authenticate,
  requirePermission('product:update'),
  productsController.updateImage,
);

productsRouter.delete(
  '/:id/images/:imageId',
  authenticate,
  requirePermission('product:delete'),
  productsController.deleteImage,
);

// Public Slug endpoints (placed after specific static segments)
productsRouter.get('/:slug', productsController.getPublicBySlug);
productsRouter.get('/:slug/related', productsController.getPublicRelated);
