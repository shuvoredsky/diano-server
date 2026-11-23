import { Router } from 'express';
import { sectionsController } from './sections.controller';
import { authenticate, requirePermission } from '@/middlewares/auth.middleware';

export const adminSectionsRouter = Router();

adminSectionsRouter.use(authenticate);

// Fixed & Root routes
adminSectionsRouter.get(
  '/',
  requirePermission('section:read'),
  sectionsController.getAdminSections,
);

adminSectionsRouter.post(
  '/',
  requirePermission('section:manage'),
  sectionsController.createSection,
);

adminSectionsRouter.patch(
  '/reorder',
  requirePermission('section:manage'),
  sectionsController.reorderSections,
);

// Parameterized sub-resource actions
adminSectionsRouter.patch(
  '/:id/toggle',
  requirePermission('section:manage'),
  sectionsController.toggleActive,
);

adminSectionsRouter.post(
  '/:id/products',
  requirePermission('section:manage'),
  sectionsController.assignProducts,
);

adminSectionsRouter.delete(
  '/:id/products/:productId',
  requirePermission('section:manage'),
  sectionsController.removeProduct,
);

adminSectionsRouter.put(
  '/:id/products/reorder',
  requirePermission('section:manage'),
  sectionsController.reorderProducts,
);

// CRUD on specific section
adminSectionsRouter.get(
  '/:id',
  requirePermission('section:read'),
  sectionsController.getSectionById,
);

adminSectionsRouter.patch(
  '/:id',
  requirePermission('section:manage'),
  sectionsController.updateSection,
);

adminSectionsRouter.delete(
  '/:id',
  requirePermission('section:manage'),
  sectionsController.deleteSection,
);

// ================= Public Router =================

export const publicSectionsRouter = Router();

publicSectionsRouter.get('/', sectionsController.getPublicSections);
publicSectionsRouter.get('/:slug/products', sectionsController.getPublicSectionProducts);

