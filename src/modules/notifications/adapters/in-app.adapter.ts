import { eventBus } from '@/events/event-bus';
import type { NotificationEntity } from '../notifications.types';

export class InAppAdapter {
  async dispatch(notification: NotificationEntity): Promise<{ success: boolean; messageId?: string }> {
    // Broadcast via internal event bus to connected Socket.IO clients
    eventBus.emitDomainEvent({
      id: notification.id,
      type: 'notification:new',
      notificationId: notification.id,
      channel: 'IN_APP',
      template: notification.template,
      summary: notification.subject || notification.template,
      userId: notification.userId,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      messageId: `in_app_${notification.id}`,
    };
  }
}

