import { describe, expect, it } from 'vitest';
import { MemoryNotificationService } from '../notificationService';

describe('notification service', () => {
  it('creates and lists unread notifications', () => {
    const service = new MemoryNotificationService();

    service.create({
      userId: 'user_1',
      type: 'bonus',
      title: 'Bonus claimed',
      message: 'Your bonus was credited.'
    });

    expect(service.list({ userId: 'user_1' })).toHaveLength(1);
    expect(service.list({ userId: 'user_1', unreadOnly: true })).toHaveLength(1);
  });

  it('marks a notification as read', () => {
    const service = new MemoryNotificationService();
    const notification = service.create({
      userId: 'user_1',
      type: 'support',
      title: 'Support message',
      message: 'We received your request.'
    });

    const read = service.markRead({ userId: 'user_1', notificationId: notification.id });

    expect(read.readAt).toEqual(expect.any(String));
    expect(service.list({ userId: 'user_1', unreadOnly: true })).toHaveLength(0);
  });
});
