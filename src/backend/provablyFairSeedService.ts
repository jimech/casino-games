import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  ProvablyFairCommitment,
  ProvablyFairProof,
  ProvablyFairSeedLifecycle,
  hashServerSeed
} from '../domain/provablyFair';
import { withPrismaTransactionRetry } from './db/prismaTransaction';

export type ProvablyFairGameId = ProvablyFairProof['gameId'];
export type ProvablyFairSeedStatus = 'committed' | 'revealed';

export interface ProvablyFairSeedRecord {
  id: string;
  userId: string;
  gameId: ProvablyFairGameId;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  status: ProvablyFairSeedStatus;
  commitmentKey: string;
  roundId?: string;
  committedAt: string;
  revealedAt?: string;
}

export interface PublicProvablyFairSeedRecord {
  id: string;
  userId: string;
  gameId: ProvablyFairGameId;
  serverSeedHash: string;
  serverSeed?: string;
  clientSeed: string;
  nonce: number;
  status: ProvablyFairSeedStatus;
  roundId?: string;
  committedAt: string;
  revealedAt?: string;
}

export class MemoryProvablyFairSeedService {
  private seeds = new Map<string, ProvablyFairSeedRecord>();
  private seedsByCommitmentKey = new Map<string, string>();
  private nonceByUserGame = new Map<string, number>();
  private sequence = 0;

  commit(input: {
    userId: string;
    gameId: ProvablyFairGameId;
    commitmentKey: string;
    clientSeed?: string;
  }): ProvablyFairSeedRecord {
    assertText(input.userId, 'userId');
    assertText(input.commitmentKey, 'commitmentKey');
    const existingId = this.seedsByCommitmentKey.get(input.commitmentKey);
    if (existingId) return this.seeds.get(existingId)!;

    const nonceKey = `${input.userId}:${input.gameId}`;
    const nonce = this.nonceByUserGame.get(nonceKey) ?? 0;
    this.nonceByUserGame.set(nonceKey, nonce + 1);
    const serverSeed = randomBytes(32).toString('hex');
    const record: ProvablyFairSeedRecord = {
      id: `pf_seed_${++this.sequence}`,
      userId: input.userId,
      gameId: input.gameId,
      serverSeed,
      serverSeedHash: hashServerSeed(serverSeed),
      clientSeed: input.clientSeed ?? `${input.userId}:${input.gameId}:${nonce}`,
      nonce,
      status: 'committed',
      commitmentKey: input.commitmentKey,
      committedAt: new Date().toISOString()
    };
    this.seeds.set(record.id, record);
    this.seedsByCommitmentKey.set(input.commitmentKey, record.id);
    return record;
  }

  reveal(input: { seedId: string; roundId?: string }): ProvablyFairSeedRecord {
    assertText(input.seedId, 'seedId');
    const record = this.seeds.get(input.seedId);
    if (!record) throw new Error(`Provably fair seed not found: ${input.seedId}`);
    if (record.status === 'revealed') {
      if (input.roundId && !record.roundId) {
        const updated = { ...record, roundId: input.roundId };
        this.seeds.set(updated.id, updated);
        return updated;
      }
      return record;
    }
    const revealed: ProvablyFairSeedRecord = {
      ...record,
      status: 'revealed',
      roundId: input.roundId,
      revealedAt: new Date().toISOString()
    };
    this.seeds.set(revealed.id, revealed);
    return revealed;
  }

  get(seedId: string): ProvablyFairSeedRecord | undefined {
    return this.seeds.get(seedId);
  }

  listForUser(userId: string): PublicProvablyFairSeedRecord[] {
    assertText(userId, 'userId');
    return [...this.seeds.values()]
      .filter(seed => seed.userId === userId)
      .sort((left, right) => right.committedAt.localeCompare(left.committedAt))
      .map(publicSeedRecord);
  }
}

export class PrismaProvablyFairSeedService {
  constructor(private readonly prisma: PrismaClient) {}

  async commit(input: {
    userId: string;
    gameId: ProvablyFairGameId;
    commitmentKey: string;
    clientSeed?: string;
  }): Promise<ProvablyFairSeedRecord> {
    assertText(input.userId, 'userId');
    assertText(input.commitmentKey, 'commitmentKey');
    return withPrismaTransactionRetry(() => this.prisma.$transaction(async tx => {
      await lockSeedNonceAllocation(tx, input.userId, input.gameId);

      const existing = await tx.provablyFairSeed.findUnique({
        where: { commitmentKey: input.commitmentKey }
      });
      if (existing) return prismaSeedRecord(existing);

      const nonceCounter = await tx.provablyFairSeedNonce.upsert({
        where: {
          userId_gameId: {
            userId: input.userId,
            gameId: input.gameId
          }
        },
        create: {
          userId: input.userId,
          gameId: input.gameId,
          nextNonce: 1
        },
        update: {
          nextNonce: {
            increment: 1
          }
        }
      });
      const nonce = nonceCounter.nextNonce - 1;
      const serverSeed = randomBytes(32).toString('hex');
      const created = await tx.provablyFairSeed.create({
        data: {
          userId: input.userId,
          gameId: input.gameId,
          serverSeed,
          serverSeedHash: hashServerSeed(serverSeed),
          clientSeed: input.clientSeed ?? `${input.userId}:${input.gameId}:${nonce}`,
          nonce,
          status: 'committed',
          commitmentKey: input.commitmentKey
        }
      });
      return prismaSeedRecord(created);
    }, { isolationLevel: 'ReadCommitted' }));
  }

  async reveal(input: { seedId: string; roundId?: string }): Promise<ProvablyFairSeedRecord> {
    assertText(input.seedId, 'seedId');
    return withPrismaTransactionRetry(() => this.prisma.$transaction(async tx => {
      const record = await tx.provablyFairSeed.findUnique({
        where: { id: input.seedId }
      });
      if (!record) throw new Error(`Provably fair seed not found: ${input.seedId}`);
      if (record.status === 'revealed') {
        if (input.roundId && !record.roundId) {
          const updated = await tx.provablyFairSeed.update({
            where: { id: record.id },
            data: { roundId: input.roundId }
          });
          return prismaSeedRecord(updated);
        }
        return prismaSeedRecord(record);
      }

      const revealed = await tx.provablyFairSeed.update({
        where: { id: record.id },
        data: {
          status: 'revealed',
          roundId: input.roundId,
          revealedAt: new Date()
        }
      });
      return prismaSeedRecord(revealed);
    }, { isolationLevel: 'Serializable' }));
  }

  async get(seedId: string): Promise<ProvablyFairSeedRecord | undefined> {
    const record = await this.prisma.provablyFairSeed.findUnique({ where: { id: seedId } });
    return record ? prismaSeedRecord(record) : undefined;
  }

  async listForUser(userId: string): Promise<PublicProvablyFairSeedRecord[]> {
    assertText(userId, 'userId');
    const records = await this.prisma.provablyFairSeed.findMany({
      where: { userId },
      orderBy: { committedAt: 'desc' }
    });
    return records.map(prismaSeedRecord).map(publicSeedRecord);
  }
}

export const seedLifecycle = (record: ProvablyFairSeedRecord): ProvablyFairSeedLifecycle => ({
  seedId: record.id,
  status: record.status,
  committedAt: record.committedAt,
  revealedAt: record.revealedAt
});

export const seedCommitment = (record: ProvablyFairSeedRecord): ProvablyFairCommitment => ({
  algorithm: 'hmac-sha256-v1',
  gameId: record.gameId,
  serverSeedHash: record.serverSeedHash,
  clientSeed: record.clientSeed,
  nonce: record.nonce,
  cursor: 0,
  lifecycle: seedLifecycle(record)
});

export const publicSeedRecord = (record: ProvablyFairSeedRecord): PublicProvablyFairSeedRecord => ({
  id: record.id,
  userId: record.userId,
  gameId: record.gameId,
  serverSeedHash: record.serverSeedHash,
  serverSeed: record.status === 'revealed' ? record.serverSeed : undefined,
  clientSeed: record.clientSeed,
  nonce: record.nonce,
  status: record.status,
  roundId: record.roundId,
  committedAt: record.committedAt,
  revealedAt: record.revealedAt
});

const assertText = (value: string, field: string) => {
  if (!value || typeof value !== 'string') {
    throw new Error(`${field} is required`);
  }
};

const lockSeedNonceAllocation = async (
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  userId: string,
  gameId: string
) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`provably-fair-seed:${userId}:${gameId}`}))`;
};

const prismaSeedRecord = (record: {
  id: string;
  userId: string;
  gameId: string;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  status: string;
  commitmentKey: string;
  roundId: string | null;
  committedAt: Date;
  revealedAt: Date | null;
}): ProvablyFairSeedRecord => ({
  id: record.id,
  userId: record.userId,
  gameId: record.gameId as ProvablyFairGameId,
  serverSeed: record.serverSeed,
  serverSeedHash: record.serverSeedHash,
  clientSeed: record.clientSeed,
  nonce: record.nonce,
  status: record.status as ProvablyFairSeedStatus,
  commitmentKey: record.commitmentKey,
  roundId: record.roundId ?? undefined,
  committedAt: record.committedAt.toISOString(),
  revealedAt: record.revealedAt?.toISOString()
});
