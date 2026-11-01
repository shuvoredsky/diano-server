import { Router } from 'express';
import { authenticate, requirePermission } from '@/middlewares/auth.middleware';
import { handleUploadSingle } from '@/middlewares/upload.middleware';
import { siteSettingsController } from './site-settings.controller';

const siteSettingsRouter = Router();

// Fixed file upload routes MUST be mounted before /:group param route
siteSettingsRouter.post(
  '/logo',
  authenticate,
  requirePermission('settings:update'),
  handleUploadSingle('logo'),
  siteSettingsController.uploadLogo,
);

siteSettingsRouter.post(
  '/favicon',
  authenticate,
  requirePermission('settings:update'),
  handleUploadSingle('favicon'),
  siteSettingsController.uploadFavicon,
);

// Typed group read and update
siteSettingsRouter.get(
  '/:group',
  authenticate,
  requirePermission('settings:read'),
  siteSettingsController.getGroup,
);

siteSettingsRouter.patch(
  '/:group',
  authenticate,
  requirePermission('settings:update'),
  siteSettingsController.updateGroup,
);

export { siteSettingsRouter };
