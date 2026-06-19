import { Prisma, PrismaClient } from '@prisma/client';

export type AiEventCategory = 'page' | 'game' | 'wallet' | 'bonus' | 'risk' | 'admin' | 'session';

export interface AiEventRecord {
  id: string;
  userId: string;
  category: AiEventCategory;
  name: string;
  context?: Record<string, unknown>;
  createdAt: string;
}

export interface TrackAiEventInput {
  userId: string;
  category: AiEventCategory;
  name: string;
  context?: Record<string, unknown>;
}

export interface ListAiEventsInput {
  userId?: string;
  category?: AiEventCategory;
  since?: string;
  until?: string;
  limit?: number;
}

export interface AiEventService {
  track(input: TrackAiEventInput): Promise<AiEventRecord> | AiEventRecord;
  list(input?: ListAiEventsInput): Promise<AiEventRecord[]> | AiEventRecord[];
}

export const AI_EVENT_CATEGORIES: AiEventCategory[] = ['page', 'game', 'wallet', 'bonus', 'risk', 'admin', 'session'];

export class MemoryAiEventService implements AiEventService {
  private events: AiEventRecord[] = [];
  private sequence = 0;

  track(input: TrackAiEventInput): AiEventRecord {
    validateTrackInput(input);
    const event: AiEventRecord = {
      id: `ai_event_${(++this.sequence).toString().padStart(8, '0')}`,
      userId: input.userId,
      category: input.category,
      name: input.name.trim(),
      context: input.context,
      createdAt: new Date().toISOString()
    };
    this.events.unshift(event);
    return event;
  }

  list(input: ListAiEventsInput = {}): AiEventRecord[] {
    validateListInput(input);
    const since = input.since ? parseBoundary(input.since, 'since').getTime() : undefined;
    const until = input.until ? parseBoundary(input.until, 'until').getTime() : undefined;
    return this.events
      .filter(event => !input.userId || event.userId === input.userId)
      .filter(event => !input.category || event.category === input.category)
      .filter(event => since === undefined || new Date(event.createdAt).getTime() >= since)
      .filter(event => until === undefined || new Date(event.createdAt).getTime() <= until)
      .slice(0, normalizeLimit(input.limit));
  }
}

export class PrismaAiEventService implements AiEventService {
  constructor(private readonly prisma: PrismaClient) {}

  async track(input: TrackAiEventInput): Promise<AiEventRecord> {
    validateTrackInput(input);
    const event = await this.prisma.aiEvent.create({
      data: {
        userId: input.userId,
        category: input.category,
        name: input.name.trim(),
        context: input.context as Prisma.InputJsonObject | undefined
      }
    });
    return aiEventToRecord(event);
  }

  async list(input: ListAiEventsInput = {}): Promise<AiEventRecord[]> {
    validateListInput(input);
    const since = input.since ? parseBoundary(input.since, 'since') : undefined;
    const until = input.until ? parseBoundary(input.until, 'until') : undefined;
    const events = await this.prisma.aiEvent.findMany({
      where: {
        userId: input.userId,
        category: input.category,
        createdAt: {
          gte: since,
          lte: until
        }
      },
      orderBy: { createdAt: 'desc' },
      take: normalizeLimit(input.limit)
    });
    return events.map(aiEventToRecord);
  }
}

const validateTrackInput = (input: TrackAiEventInput) => {
  assertText(input.userId, 'userId');
  assertText(input.name, 'name');
  if (!AI_EVENT_CATEGORIES.includes(input.category)) throw new Error('category is invalid');
};

const validateListInput = (input: ListAiEventsInput) => {
  if (input.userId !== undefined) assertText(input.userId, 'userId');
  if (input.category !== undefined && !AI_EVENT_CATEGORIES.includes(input.category)) throw new Error('category is invalid');
  if (input.since !== undefined) parseBoundary(input.since, 'since');
  if (input.until !== undefined) parseBoundary(input.until, 'until');
};

const assertText = (value: string, field: string) => {
  if (!value || typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
};

const parseBoundary = (value: string, field: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${field} is invalid`);
  return parsed;
};

const normalizeLimit = (limit?: number) => {
  if (!Number.isFinite(limit ?? 50)) return 50;
  return Math.max(1, Math.min(250, Math.floor(limit ?? 50)));
};

const aiEventToRecord = (event: {
  id: string;
  userId: string;
  category: string;
  name: string;
  context: Prisma.JsonValue | null;
  createdAt: Date;
}): AiEventRecord => ({
  id: event.id,
  userId: event.userId,
  category: event.category as AiEventCategory,
  name: event.name,
  context: isRecord(event.context) ? event.context : undefined,
  createdAt: event.createdAt.toISOString()
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
