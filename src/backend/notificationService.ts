import { Prisma, PrismaClient } from '@prisma/client';

export type NotificationType = 'system' | 'bonus' | 'wallet' | 'risk' | 'support' | 'admin';

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

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationService {
  create(input: CreateNotificationInput): Promise<NotificationRecord> | NotificationRecord;
  list(input: { userId: string; unreadOnly?: boolean; limit?: number }): Promise<NotificationRecord[]> | NotificationRecord[];
  markRead(input: { userId: string; notificationId: string }): Promise<NotificationRecord> | NotificationRecord;
}

export class MemoryNotificationService implements NotificationService {
  private notifications: NotificationRecord[] = [];
  private sequence = 0;

  create(input: CreateNotificationInput): NotificationRecord {
    validateInput(input);
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
    return notification;
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
}

export class PrismaNotificationService implements NotificationService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateNotificationInput): Promise<NotificationRecord> {
    validateInput(input);
    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title.trim(),
        message: input.message.trim(),
        metadata: input.metadata as Prisma.InputJsonValue | undefined
      }
    });
    return notificationToRecord(notification);
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
}

const validateInput = (input: CreateNotificationInput) => {
  assertText(input.userId, 'userId');
  assertText(input.title, 'title');
  assertText(input.message, 'message');
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
