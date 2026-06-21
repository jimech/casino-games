import { describe, expect, it } from 'vitest';
import { MemoryNotificationService } from '../notificationService';

describe('notification service', () => {
  it('creates and lists unread notifications', () => {
    const service = new MemoryNotificationService();

    const result = service.create({
      userId: 'user_1',
      type: 'bonus',
      title: 'Bonus claimed',
      message: 'Your bonus was credited.'
    });

    expect(result.notification?.type).toBe('bonus');
    expect(result.delivery.status).toBe('delivered');
    expect(service.list({ userId: 'user_1' })).toHaveLength(1);
    expect(service.list({ userId: 'user_1', unreadOnly: true })).toHaveLength(1);
  });

  it('marks a notification as read', () => {
    const service = new MemoryNotificationService();
    const result = service.create({
      userId: 'user_1',
      type: 'support',
      title: 'Support message',
      message: 'We received your request.'
    });

    const read = service.markRead({ userId: 'user_1', notificationId: result.notification!.id });

    expect(read.readAt).toEqual(expect.any(String));
    expect(service.list({ userId: 'user_1', unreadOnly: true })).toHaveLength(0);
  });

  it('suppresses optional notifications when preferences are disabled', () => {
    const service = new MemoryNotificationService();

    const preference = service.updatePreference({ userId: 'user_1', type: 'bonus', enabled: false });
    const result = service.create({
      userId: 'user_1',
      type: 'bonus',
      title: 'Bonus claimed',
      message: 'Your bonus was credited.'
    });

    expect(preference.enabled).toBe(false);
    expect(result.notification).toBeUndefined();
    expect(result.delivery.status).toBe('suppressed');
    expect(result.delivery.reason).toBe('user_preference_disabled');
    expect(service.list({ userId: 'user_1' })).toHaveLength(0);
    expect(service.listDeliveries({ userId: 'user_1', status: 'suppressed' })).toHaveLength(1);
  });

  it('keeps mandatory notification types enabled', () => {
    const service = new MemoryNotificationService();

    const preference = service.updatePreference({ userId: 'user_1', type: 'risk', enabled: false });
    const result = service.create({
      userId: 'user_1',
      type: 'risk',
      title: 'Risk notice',
      message: 'A required risk notice was created.'
    });

    expect(preference.enabled).toBe(true);
    expect(preference.mandatory).toBe(true);
    expect(result.notification?.type).toBe('risk');
    expect(result.delivery.status).toBe('delivered');
  });
});
