import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';

export interface IdempotencyRequestInput {
  userId: string;
  scope: string;
  idempotencyKey: string;
  payload: unknown;
  metadata?: Record<string, unknown>;
}

export interface IdempotencyService {
  assertRequest(input: IdempotencyRequestInput): Promise<void> | void;
}

export class MemoryIdempotencyService implements IdempotencyService {
  private requests = new Map<string, string>();

  assertRequest(input: IdempotencyRequestInput): void {
    assertText(input.userId, 'userId');
    assertText(input.scope, 'scope');
    assertText(input.idempotencyKey, 'idempotencyKey');
    const key = registryKey(input);
    const fingerprint = fingerprintPayload(input.payload);
    const existing = this.requests.get(key);
    if (existing && existing !== fingerprint) throw idempotencyConflict(input.scope);
    this.requests.set(key, fingerprint);
  }
}

export class PrismaIdempotencyService implements IdempotencyService {
  constructor(private readonly prisma: PrismaClient) {}

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
      if (existing.fingerprint !== fingerprint) throw idempotencyConflict(input.scope);
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

const assertText = (value: string, field: string) => {
  if (!value || typeof value !== 'string') {
    throw new Error(`${field} is required`);
  }
};
