import type { Request, Response, NextFunction } from 'express';
import { notificationsService } from './notifications.service';
import { AppError } from '@/utils/app-error';
import type { NotificationChannel, NotificationStatus } from './notifications.types';

export class NotificationsController {
  async listUserNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw AppError.unauthorized('Authentication required');
      }

      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;

      const result = await notificationsService.listUserInApp(req.user.userId, page, limit);

      res.status(200).json({
        success: true,
        data: result.notifications,
        pagination: {
          page,
          limit,
          total: result.total,
          unreadCount: result.unreadCount,
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw AppError.unauthorized('Authentication required');
      }

      const id = req.params.id as string;
      const updated = await notificationsService.markAsRead(id, req.user.userId);

      res.status(200).json({
        success: true,
        message: 'Notification marked as read',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  async markAllAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw AppError.unauthorized('Authentication required');
      }

      const count = await notificationsService.markAllAsRead(req.user.userId);

      res.status(200).json({
        success: true,
        message: `${count} notifications marked as read`,
        count,
      });
    } catch (err) {
      next(err);
    }
  }

  async getPreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw AppError.unauthorized('Authentication required');
      }

      const preferences = await notificationsService.getPreferences(req.user.userId);

      res.status(200).json({
        success: true,
        data: preferences,
      });
    } catch (err) {
      next(err);
    }
  }

  async updatePreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw AppError.unauthorized('Authentication required');
      }

      const { emailMarketing, smsMarketing, promotionalPush, smsRecovery } = req.body;

      const updated = await notificationsService.updatePreferences(req.user.userId, {
        emailMarketing,
        smsMarketing,
        promotionalPush,
        smsRecovery,
      });

      res.status(200).json({
        success: true,
        message: 'Preferences updated successfully',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  async unsubscribe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = (req.query.token as string) || (req.body.token as string);
      if (!token) {
        throw AppError.badRequest('Unsubscribe token is required');
      }

      const result = await notificationsService.unsubscribeByToken(token);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (err) {
      next(err);
    }
  }

  // Admin Endpoints
  async listNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const channel = req.query.channel as NotificationChannel | undefined;
      const status = req.query.status as NotificationStatus | undefined;
      const template = req.query.template as string | undefined;
      const recipient = req.query.recipient as string | undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

      const result = await notificationsService.listNotifications({
        page,
        limit,
        channel,
        status,
        template,
        recipient,
        startDate,
        endDate,
      });

      res.status(200).json({
        success: true,
        data: result.notifications,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / result.limit),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async retryNotification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const retried = await notificationsService.retryNotification(id);

      res.status(200).json({
        success: true,
        message: 'Notification queued for retry',
        data: retried,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const notificationsController = new NotificationsController();

