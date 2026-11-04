import { Router } from 'express';
import { authenticate, requirePermission } from '@/middlewares/auth.middleware';
import { notificationsController } from './notifications.controller';

// ==========================================
// CUSTOMER NOTIFICATIONS ROUTER
// Mounted at: /api/v1/notifications
// ==========================================
export const customerNotificationsRouter = Router();

// Public unsubscribe route (token-based HMAC signature)
customerNotificationsRouter.get('/unsubscribe', (req, res, next) => {
  void notificationsController.unsubscribe(req, res, next);
});

// Authenticated customer routes
customerNotificationsRouter.use(authenticate);

customerNotificationsRouter.get('/', (req, res, next) => {
  void notificationsController.listUserNotifications(req, res, next);
});

customerNotificationsRouter.patch('/read-all', (req, res, next) => {
  void notificationsController.markAllAsRead(req, res, next);
});

customerNotificationsRouter.patch('/:id/read', (req, res, next) => {
  void notificationsController.markAsRead(req, res, next);
});

customerNotificationsRouter.get('/preferences', (req, res, next) => {
  void notificationsController.getPreferences(req, res, next);
});

customerNotificationsRouter.patch('/preferences', (req, res, next) => {
  void notificationsController.updatePreferences(req, res, next);
});

// ==========================================
// ADMIN NOTIFICATIONS ROUTER
// Mounted at: /api/v1/admin/notifications
// ==========================================
export const adminNotificationsRouter = Router();

adminNotificationsRouter.use(authenticate);

adminNotificationsRouter.get(
  '/',
  requirePermission('notification:manage'),
  (req, res, next) => {
    void notificationsController.listNotifications(req, res, next);
  },
);

adminNotificationsRouter.post(
  '/:id/retry',
  requirePermission('notification:manage'),
  (req, res, next) => {
    void notificationsController.retryNotification(req, res, next);
  },
);

