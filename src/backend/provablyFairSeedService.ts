import { randomBytes } from 'node:crypto';
import {
  ProvablyFairCommitment,
  ProvablyFairProof,
  ProvablyFairSeedLifecycle,
  hashServerSeed
} from '../domain/provablyFair';

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
