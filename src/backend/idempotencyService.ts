import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';

export interface IdempotencyRequestInput {
  userId: string;
  scope: string;
  idempotencyKey: string;
  payload: unknown;
  metadata?: Record<string, unknown>;
}

export interface IdempotentResponse<T> {
  body: T;
  replayed: boolean;
}

export type IdempotencyAuditDecision = 'replay' | 'conflict' | 'in_progress_replay';

export interface IdempotencyAuditEvent {
  userId: string;
  scope: string;
  idempotencyKey: string;
  fingerprint: string;
  decision: IdempotencyAuditDecision;
  metadata?: Record<string, unknown>;
}

export type IdempotencyAuditSink = (event: IdempotencyAuditEvent) => Promise<void> | void;

export interface IdempotencyService {
  assertRequest(input: IdempotencyRequestInput): Promise<void> | void;
  runWithResponse<T>(
    input: IdempotencyRequestInput,
    handler: () => Promise<T> | T
  ): Promise<IdempotentResponse<T>>;
}

export class MemoryIdempotencyService implements IdempotencyService {
  private requests = new Map<string, MemoryIdempotencyRecord>();

  constructor(private readonly audit?: IdempotencyAuditSink) {}

  async assertRequest(input: IdempotencyRequestInput): Promise<void> {
    assertText(input.userId, 'userId');
    assertText(input.scope, 'scope');
    assertText(input.idempotencyKey, 'idempotencyKey');
    const key = registryKey(input);
    const fingerprint = fingerprintPayload(input.payload);
    const existing = this.requests.get(key);
    if (existing && existing.fingerprint !== fingerprint) {
      await this.recordAudit(input, fingerprint, 'conflict');
      throw idempotencyConflict(input.scope);
    }
    if (existing) {
      await this.recordAudit(input, fingerprint, 'replay');
    }
    if (!existing) {
      this.requests.set(key, {
        fingerprint,
        metadata: input.metadata
      });
    }
  }

  async runWithResponse<T>(
    input: IdempotencyRequestInput,
    handler: () => Promise<T> | T
  ): Promise<IdempotentResponse<T>> {
    assertText(input.userId, 'userId');
    assertText(input.scope, 'scope');
    assertText(input.idempotencyKey, 'idempotencyKey');
    const key = registryKey(input);
    const fingerprint = fingerprintPayload(input.payload);
    const existing = this.requests.get(key);

    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        await this.recordAudit(input, fingerprint, 'conflict');
        throw idempotencyConflict(input.scope);
      }
      if (existing.response !== undefined) {
        await this.recordAudit(input, fingerprint, 'replay');
        return { body: existing.response as T, replayed: true };
      }
      if (existing.pending) {
        await this.recordAudit(input, fingerprint, 'in_progress_replay');
        return { body: await existing.pending as T, replayed: true };
      }
    }

    const pending = Promise.resolve().then(handler);
    this.requests.set(key, {
      fingerprint,
      metadata: input.metadata,
      pending
    });

    try {
      const body = await pending;
      const record = this.requests.get(key);
      if (record) {
        record.response = body;
        record.pending = undefined;
      }
      return { body, replayed: false };
    } catch (error) {
      const record = this.requests.get(key);
      if (record?.pending === pending) this.requests.delete(key);
      throw error;
    }
  }

  private async recordAudit(
    input: IdempotencyRequestInput,
    fingerprint: string,
    decision: IdempotencyAuditDecision
  ) {
    await this.audit?.({
      userId: input.userId,
      scope: input.scope,
      idempotencyKey: input.idempotencyKey,
      fingerprint,
      decision,
      metadata: input.metadata
    });
  }
}

export class PrismaIdempotencyService implements IdempotencyService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit?: IdempotencyAuditSink
  ) {}

  async assertRequest(input: IdempotencyRequestInput): Promise<void> {
    assertText(input.userId, 'userId');
    assertText(input.scope, 'scope');
    assertText(input.idempotencyKey, 'idempotencyKey');
    const fingerprint = fingerprintPayload(input.payload);

    const existing = await this.prisma.idempotencyRequest.findUnique({
      where: {
        userId_scope_idempotencyKey: {
          userId: input.userId,
          scope: input.scope,
          idempotencyKey: input.idempotencyKey
        }
      }
    });
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        await this.recordAudit(input, fingerprint, 'conflict');
        throw idempotencyConflict(input.scope);
      }
      await this.recordAudit(input, fingerprint, 'replay');
      return;
    }

    try {
      await this.prisma.idempotencyRequest.create({
        data: {
          userId: input.userId,
          scope: input.scope,
          idempotencyKey: input.idempotencyKey,
          fingerprint,
          metadata: toJson(input.metadata)
        }
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      await this.assertRequest(input);
    }
  }

  async runWithResponse<T>(
    input: IdempotencyRequestInput,
    handler: () => Promise<T> | T
  ): Promise<IdempotentResponse<T>> {
    assertText(input.userId, 'userId');
    assertText(input.scope, 'scope');
    assertText(input.idempotencyKey, 'idempotencyKey');
    const fingerprint = fingerprintPayload(input.payload);
    const uniqueKey = {
      userId: input.userId,
      scope: input.scope,
      idempotencyKey: input.idempotencyKey
    };

    const existing = await this.prisma.idempotencyRequest.findUnique({
      where: { userId_scope_idempotencyKey: uniqueKey }
    });
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        await this.recordAudit(input, fingerprint, 'conflict');
        throw idempotencyConflict(input.scope);
      }
      const response = replayResponseFromMetadata<T>(existing.metadata);
      if (response.found) {
        await this.recordAudit(input, fingerprint, 'replay');
        return { body: response.body, replayed: true };
      }
      await this.recordAudit(input, fingerprint, 'in_progress_replay');
      return {
        body: await this.waitForStoredResponse<T>(uniqueKey),
        replayed: true
      };
    }

    try {
      await this.prisma.idempotencyRequest.create({
        data: {
          ...uniqueKey,
          fingerprint,
          metadata: toJson(input.metadata)
        }
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      return this.runWithResponse(input, handler);
    }

    try {
      const body = await handler();
      await this.prisma.idempotencyRequest.update({
        where: { userId_scope_idempotencyKey: uniqueKey },
        data: {
          metadata: toJson({
            ...(input.metadata ?? {}),
            replayResponse: {
              body,
              storedAt: new Date().toISOString()
            }
          })
        }
      });
      return { body, replayed: false };
    } catch (error) {
      await this.prisma.idempotencyRequest.delete({
        where: { userId_scope_idempotencyKey: uniqueKey }
      }).catch(() => undefined);
      throw error;
    }
  }

  private async recordAudit(
    input: IdempotencyRequestInput,
    fingerprint: string,
    decision: IdempotencyAuditDecision
  ) {
    await this.audit?.({
      userId: input.userId,
      scope: input.scope,
      idempotencyKey: input.idempotencyKey,
      fingerprint,
      decision,
      metadata: input.metadata
    });
  }

  private async waitForStoredResponse<T>(
    uniqueKey: { userId: string; scope: string; idempotencyKey: string }
  ): Promise<T> {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      await sleep(50);
      const current = await this.prisma.idempotencyRequest.findUnique({
        where: { userId_scope_idempotencyKey: uniqueKey }
      });
      const response = replayResponseFromMetadata<T>(current?.metadata);
      if (response.found) return response.body;
    }
    throw new Error('Idempotency replay is still processing');
  }
}

export const fingerprintPayload = (payload: unknown): string =>
  createHash('sha256').update(stableStringify(payload)).digest('hex');

const registryKey = (input: IdempotencyRequestInput) =>
  `${input.userId}:${input.scope}:${input.idempotencyKey}`;

const idempotencyConflict = (scope: string) =>
  new Error(`Idempotency conflict: key was replayed with different ${scope} parameters`);

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
};

const toJson = (value: unknown): Prisma.InputJsonValue | undefined => {
  if (value === undefined) return undefined;
  return value as Prisma.InputJsonValue;
};

interface MemoryIdempotencyRecord {
  fingerprint: string;
  metadata?: Record<string, unknown>;
  response?: unknown;
  pending?: Promise<unknown>;
}

const replayResponseFromMetadata = <T>(metadata: Prisma.JsonValue | null | undefined): {
  found: true;
  body: T;
} | {
  found: false;
} => {
  if (!isRecord(metadata)) return { found: false };
  const replayResponse = metadata.replayResponse;
  if (!isRecord(replayResponse) || !Object.prototype.hasOwnProperty.call(replayResponse, 'body')) {
    return { found: false };
  }
  return {
    found: true,
    body: replayResponse.body as T
  };
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const assertText = (value: string, field: string) => {
  if (!value || typeof value !== 'string') {
    throw new Error(`${field} is required`);
  }
};
