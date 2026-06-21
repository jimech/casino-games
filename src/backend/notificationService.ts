import { Prisma, PrismaClient } from '@prisma/client';

export type NotificationType = 'system' | 'bonus' | 'wallet' | 'risk' | 'support' | 'admin';
export type NotificationDeliveryStatus = 'delivered' | 'suppressed';

export const NOTIFICATION_TYPES: NotificationType[] = ['system', 'bonus', 'wallet', 'risk', 'support', 'admin'];
export const MANDATORY_NOTIFICATION_TYPES: NotificationType[] = ['system', 'risk', 'admin'];

export interface NotificationRecord {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  readAt?: string;
  createdAt: string;
}

export interface NotificationPreferenceRecord {
  userId: string;
  type: NotificationType;
  enabled: boolean;
  mandatory: boolean;
  updatedAt: string;
}

export interface NotificationDeliveryRecord {
  id: string;
  userId: string;
  notificationId?: string;
  type: NotificationType;
  channel: 'in_app';
  status: NotificationDeliveryStatus;
  reason?: string;
  preferenceSnapshot?: unknown;
  createdAt: string;
}

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationCreateResult {
  notification?: NotificationRecord;
  delivery: NotificationDeliveryRecord;
}

export interface NotificationService {
  create(input: CreateNotificationInput): Promise<NotificationCreateResult> | NotificationCreateResult;
  list(input: { userId: string; unreadOnly?: boolean; limit?: number }): Promise<NotificationRecord[]> | NotificationRecord[];
  getPreferences(input: { userId: string }): Promise<NotificationPreferenceRecord[]> | NotificationPreferenceRecord[];
  updatePreference(input: { userId: string; type: NotificationType; enabled: boolean }): Promise<NotificationPreferenceRecord> | NotificationPreferenceRecord;
  listDeliveries(input: { userId?: string; status?: NotificationDeliveryStatus; limit?: number }): Promise<NotificationDeliveryRecord[]> | NotificationDeliveryRecord[];
  markRead(input: { userId: string; notificationId: string }): Promise<NotificationRecord> | NotificationRecord;
}

export class MemoryNotificationService implements NotificationService {
  private notifications: NotificationRecord[] = [];
  private preferences = new Map<string, Map<NotificationType, NotificationPreferenceRecord>>();
  private deliveries: NotificationDeliveryRecord[] = [];
  private sequence = 0;
  private deliverySequence = 0;

  create(input: CreateNotificationInput): NotificationCreateResult {
    validateInput(input);
    const preference = this.resolvePreference(input.userId, input.type);
    if (!preference.enabled && !preference.mandatory) {
      const delivery = this.recordDelivery({
        userId: input.userId,
        type: input.type,
        status: 'suppressed',
        reason: 'user_preference_disabled',
        preferenceSnapshot: preference
      });
      return { delivery };
    }
    const notification: NotificationRecord = {
      id: `notification_${(++this.sequence).toString().padStart(8, '0')}`,
      userId: input.userId,
      type: input.type,
      title: input.title.trim(),
      message: input.message.trim(),
      metadata: input.metadata,
      createdAt: new Date().toISOString()
    };
    this.notifications.unshift(notification);
    const delivery = this.recordDelivery({
      userId: input.userId,
      notificationId: notification.id,
      type: input.type,
      status: 'delivered',
      preferenceSnapshot: preference
    });
    return { notification, delivery };
  }

  list(input: { userId: string; unreadOnly?: boolean; limit?: number }): NotificationRecord[] {
    assertText(input.userId, 'userId');
    return this.notifications
      .filter(notification => notification.userId === input.userId)
      .filter(notification => !input.unreadOnly || !notification.readAt)
      .slice(0, input.limit ?? 50);
  }

  markRead(input: { userId: string; notificationId: string }): NotificationRecord {
    assertText(input.userId, 'userId');
    assertText(input.notificationId, 'notificationId');
    const notification = this.notifications.find(item => item.id === input.notificationId && item.userId === input.userId);
    if (!notification) throw new Error(`Notification not found: ${input.notificationId}`);
    notification.readAt ??= new Date().toISOString();
    return notification;
  }

  getPreferences(input: { userId: string }): NotificationPreferenceRecord[] {
    assertText(input.userId, 'userId');
    return NOTIFICATION_TYPES.map(type => this.resolvePreference(input.userId, type));
  }

  updatePreference(input: { userId: string; type: NotificationType; enabled: boolean }): NotificationPreferenceRecord {
    assertText(input.userId, 'userId');
    assertNotificationType(input.type);
    const mandatory = isMandatoryNotificationType(input.type);
    const preference: NotificationPreferenceRecord = {
      userId: input.userId,
      type: input.type,
      enabled: mandatory ? true : Boolean(input.enabled),
      mandatory,
      updatedAt: new Date().toISOString()
    };
    const userPreferences = this.preferences.get(input.userId) ?? new Map<NotificationType, NotificationPreferenceRecord>();
    userPreferences.set(input.type, preference);
    this.preferences.set(input.userId, userPreferences);
    return preference;
  }

  listDeliveries(input: { userId?: string; status?: NotificationDeliveryStatus; limit?: number } = {}): NotificationDeliveryRecord[] {
    return this.deliveries
      .filter(delivery => !input.userId || delivery.userId === input.userId)
      .filter(delivery => !input.status || delivery.status === input.status)
      .slice(0, input.limit ?? 100);
  }

  private resolvePreference(userId: string, type: NotificationType): NotificationPreferenceRecord {
    const stored = this.preferences.get(userId)?.get(type);
    if (stored) return stored;
    return {
      userId,
      type,
      enabled: true,
      mandatory: isMandatoryNotificationType(type),
      updatedAt: new Date().toISOString()
    };
  }

  private recordDelivery(input: {
    userId: string;
    notificationId?: string;
    type: NotificationType;
    status: NotificationDeliveryStatus;
    reason?: string;
    preferenceSnapshot?: unknown;
  }): NotificationDeliveryRecord {
    const delivery: NotificationDeliveryRecord = {
      id: `notification_delivery_${(++this.deliverySequence).toString().padStart(8, '0')}`,
      userId: input.userId,
      notificationId: input.notificationId,
      type: input.type,
      channel: 'in_app',
      status: input.status,
      reason: input.reason,
      preferenceSnapshot: input.preferenceSnapshot,
      createdAt: new Date().toISOString()
    };
    this.deliveries.unshift(delivery);
    return delivery;
  }
}

export class PrismaNotificationService implements NotificationService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateNotificationInput): Promise<NotificationCreateResult> {
    validateInput(input);
    const preference = await this.resolvePreference(input.userId, input.type);
    if (!preference.enabled && !preference.mandatory) {
      const delivery = await this.recordDelivery({
        userId: input.userId,
        type: input.type,
        status: 'suppressed',
        reason: 'user_preference_disabled',
        preferenceSnapshot: preference
      });
      return { delivery };
    }
    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title.trim(),
        message: input.message.trim(),
        metadata: input.metadata as Prisma.InputJsonValue | undefined
      }
    });
    const record = notificationToRecord(notification);
    const delivery = await this.recordDelivery({
      userId: input.userId,
      notificationId: record.id,
      type: input.type,
      status: 'delivered',
      preferenceSnapshot: preference
    });
    return { notification: record, delivery };
  }

  async list(input: { userId: string; unreadOnly?: boolean; limit?: number }): Promise<NotificationRecord[]> {
    assertText(input.userId, 'userId');
    const notifications = await this.prisma.notification.findMany({
      where: {
        userId: input.userId,
        readAt: input.unreadOnly ? null : undefined
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit ?? 50
    });
    return notifications.map(notificationToRecord);
  }

  async markRead(input: { userId: string; notificationId: string }): Promise<NotificationRecord> {
    assertText(input.userId, 'userId');
    assertText(input.notificationId, 'notificationId');
    const notification = await this.prisma.notification.findFirst({
      where: { id: input.notificationId, userId: input.userId }
    });
    if (!notification) throw new Error(`Notification not found: ${input.notificationId}`);
    if (notification.readAt) return notificationToRecord(notification);
    const updated = await this.prisma.notification.update({
      where: { id: notification.id },
      data: { readAt: new Date() }
    });
    return notificationToRecord(updated);
  }

  async getPreferences(input: { userId: string }): Promise<NotificationPreferenceRecord[]> {
    assertText(input.userId, 'userId');
    const stored = await this.prisma.notificationPreference.findMany({
      where: { userId: input.userId }
    });
    const byType = new Map(stored.map(preference => [preference.type as NotificationType, preference]));
    return NOTIFICATION_TYPES.map(type => {
      const preference = byType.get(type);
      return {
        userId: input.userId,
        type,
        enabled: isMandatoryNotificationType(type) ? true : preference?.enabled ?? true,
        mandatory: isMandatoryNotificationType(type),
        updatedAt: preference?.updatedAt.toISOString() ?? new Date().toISOString()
      };
    });
  }

  async updatePreference(input: { userId: string; type: NotificationType; enabled: boolean }): Promise<NotificationPreferenceRecord> {
    assertText(input.userId, 'userId');
    assertNotificationType(input.type);
    const mandatory = isMandatoryNotificationType(input.type);
    const preference = await this.prisma.notificationPreference.upsert({
      where: {
        userId_type: {
          userId: input.userId,
          type: input.type
        }
      },
      update: {
        enabled: mandatory ? true : Boolean(input.enabled)
      },
      create: {
        userId: input.userId,
        type: input.type,
        enabled: mandatory ? true : Boolean(input.enabled)
      }
    });
    return {
      userId: preference.userId,
      type: preference.type as NotificationType,
      enabled: mandatory ? true : preference.enabled,
      mandatory,
      updatedAt: preference.updatedAt.toISOString()
    };
  }

  async listDeliveries(input: { userId?: string; status?: NotificationDeliveryStatus; limit?: number } = {}): Promise<NotificationDeliveryRecord[]> {
    const deliveries = await this.prisma.notificationDelivery.findMany({
      where: {
        userId: input.userId,
        status: input.status
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit ?? 100
    });
    return deliveries.map(deliveryToRecord);
  }

  private async resolvePreference(userId: string, type: NotificationType): Promise<NotificationPreferenceRecord> {
    const mandatory = isMandatoryNotificationType(type);
    const preference = await this.prisma.notificationPreference.findUnique({
      where: {
        userId_type: {
          userId,
          type
        }
      }
    });
    return {
      userId,
      type,
      enabled: mandatory ? true : preference?.enabled ?? true,
      mandatory,
      updatedAt: preference?.updatedAt.toISOString() ?? new Date().toISOString()
    };
  }

  private async recordDelivery(input: {
    userId: string;
    notificationId?: string;
    type: NotificationType;
    status: NotificationDeliveryStatus;
    reason?: string;
    preferenceSnapshot?: unknown;
  }): Promise<NotificationDeliveryRecord> {
    const delivery = await this.prisma.notificationDelivery.create({
      data: {
        userId: input.userId,
        notificationId: input.notificationId,
        type: input.type,
        channel: 'in_app',
        status: input.status,
        reason: input.reason,
        preferenceSnapshot: input.preferenceSnapshot as Prisma.InputJsonValue | undefined
      }
    });
    return deliveryToRecord(delivery);
  }
}

const validateInput = (input: CreateNotificationInput) => {
  assertText(input.userId, 'userId');
  assertNotificationType(input.type);
  assertText(input.title, 'title');
  assertText(input.message, 'message');
};

export const isMandatoryNotificationType = (type: NotificationType): boolean =>
  MANDATORY_NOTIFICATION_TYPES.includes(type);

const assertNotificationType = (value: string) => {
  if (!NOTIFICATION_TYPES.includes(value as NotificationType)) throw new Error(`Unsupported notification type: ${value}`);
};

const assertText = (value: string, field: string) => {
  if (!value || typeof value !== 'string') throw new Error(`${field} is required`);
};

const notificationToRecord = (notification: {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  metadata: Prisma.JsonValue | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationRecord => ({
  id: notification.id,
  userId: notification.userId,
  type: notification.type as NotificationType,
  title: notification.title,
  message: notification.message,
  metadata: isRecord(notification.metadata) ? notification.metadata : undefined,
  readAt: notification.readAt?.toISOString(),
  createdAt: notification.createdAt.toISOString()
});

const deliveryToRecord = (delivery: {
  id: string;
  userId: string;
  notificationId: string | null;
  type: string;
  channel: string;
  status: string;
  reason: string | null;
  preferenceSnapshot: Prisma.JsonValue | null;
  createdAt: Date;
}): NotificationDeliveryRecord => ({
  id: delivery.id,
  userId: delivery.userId,
  notificationId: delivery.notificationId ?? undefined,
  type: delivery.type as NotificationType,
  channel: 'in_app',
  status: delivery.status === 'suppressed' ? 'suppressed' : 'delivered',
  reason: delivery.reason ?? undefined,
  preferenceSnapshot: delivery.preferenceSnapshot ?? undefined,
  createdAt: delivery.createdAt.toISOString()
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
