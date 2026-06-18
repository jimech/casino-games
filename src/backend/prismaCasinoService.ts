import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  AddRoundStakeInput,
  CreateUserWalletInput,
  GameRoundRecord,
  PlaceBetInput,
  RefundRoundInput,
  SettleRoundInput,
  UpdateRoundOutcomeInput
} from './casinoService';
import { LedgerEntry, WalletState } from '../domain/ledger';
import { asMoney } from '../domain/money';

type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

const SERIALIZABLE = Prisma.TransactionIsolationLevel.Serializable;

export class PrismaCasinoService {
  constructor(private readonly prisma: PrismaClient) {}

  async getWallet(userId: string): Promise<WalletState> {
    const resolvedUserId = await this.resolveUserId(userId);
    const wallet = await this.prisma.wallet.findUnique({ where: { userId: resolvedUserId } });
    if (!wallet) throw new Error(`Wallet not found for user ${userId}`);
    return walletToState(wallet);
  }

  async createUserWallet(input: CreateUserWalletInput): Promise<WalletState> {
    assertText(input.userId, 'userId');
    const balance = BigInt(asMoney(input.balance ?? Number(process.env.DEMO_WALLET_BALANCE ?? 100000)));
    const wallet = await this.prisma.wallet.upsert({
      where: { userId: input.userId },
      update: {},
      create: {
        userId: input.userId,
        available: balance,
        locked: 0
      }
    });
    return walletToState(wallet);
  }

  async getLedger(userId: string): Promise<LedgerEntry[]> {
    const resolvedUserId = await this.resolveUserId(userId);
    const entries = await this.prisma.walletLedgerEntry.findMany({
      where: { userId: resolvedUserId },
      orderBy: { createdAt: 'asc' }
    });
    return entries.map(ledgerToRecord);
  }

  async listRounds(userId?: string): Promise<GameRoundRecord[]> {
    const resolvedUserId = userId ? await this.resolveUserId(userId) : undefined;
    const rounds = await this.prisma.gameRound.findMany({
      where: resolvedUserId ? { userId: resolvedUserId } : undefined,
      orderBy: { createdAt: 'desc' }
    });
    return rounds.map(roundToRecord);
  }

  async placeBet(input: PlaceBetInput): Promise<GameRoundRecord> {
    assertText(input.userId, 'userId');
    assertText(input.gameId, 'gameId');
    assertText(input.idempotencyKey, 'idempotencyKey');
    const stake = BigInt(asMoney(input.stake));
    const userId = await this.resolveUserId(input.userId);

    return this.prisma.$transaction(async tx => {
      const existing = await tx.gameRound.findUnique({
        where: { lockIdempotencyKey: input.idempotencyKey }
      });
      if (existing) return roundToRecord(existing);

      const wallet = await requireWallet(tx, userId);
      if (wallet.available < stake) {
        throw new Error(`Insufficient funds: tried to lock ${stake.toString()} from ${wallet.available.toString()}`);
      }

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          available: wallet.available - stake,
          locked: wallet.locked + stake
        }
      });

      const round = await tx.gameRound.create({
        data: {
          userId,
          gameId: input.gameId,
          stake,
          payout: 0,
          status: 'open',
          outcome: toJson(input.initialOutcome),
          lockIdempotencyKey: input.idempotencyKey,
          events: {
            create: {
              type: 'started',
              payload: { stake: input.stake }
            }
          }
        }
      });

      await tx.walletLedgerEntry.create({
        data: {
          transactionId: randomUUID(),
          idempotencyKey: input.idempotencyKey,
          userId,
          walletId: wallet.id,
          type: 'lock',
          amount: stake,
          balanceBefore: wallet.available,
          balanceAfter: updatedWallet.available,
          lockedBefore: wallet.locked,
          lockedAfter: updatedWallet.locked,
          gameId: input.gameId,
          roundId: round.id,
          metadata: {
            userId,
            gameId: input.gameId,
            roundId: round.id
          }
        }
      });

      return roundToRecord(round);
    }, { isolationLevel: SERIALIZABLE });
  }

  async settleRound(input: SettleRoundInput): Promise<GameRoundRecord> {
    assertText(input.roundId, 'roundId');
    assertText(input.idempotencyKey, 'idempotencyKey');
    const payout = BigInt(asMoney(input.payout));

    return this.prisma.$transaction(async tx => {
      const round = await requireRound(tx, input.roundId);
      const outcome = toJson(input.outcome);
      if (round.status === 'settled') {
        if (round.settlementIdempotencyKey === input.idempotencyKey) return roundToRecord(round);
        throw new Error(`Round ${round.id} is already settled`);
      }
      if (round.status !== 'open') throw new Error(`Round ${round.id} is not open`);

      const wallet = await requireWallet(tx, round.userId);
      if (wallet.locked < round.stake) {
        throw new Error(`Locked balance invariant failed for round ${round.id}`);
      }

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          available: wallet.available + payout,
          locked: wallet.locked - round.stake
        }
      });

      const settled = await tx.gameRound.update({
        where: { id: round.id },
        data: {
          status: 'settled',
          payout,
          outcome,
          settlementIdempotencyKey: input.idempotencyKey,
          settledAt: new Date(),
          events: {
            create: {
              type: 'settled',
              payload: {
                payout: input.payout,
                outcome
              }
            }
          }
        }
      });

      await tx.walletLedgerEntry.create({
        data: {
          transactionId: randomUUID(),
          idempotencyKey: input.idempotencyKey,
          userId: round.userId,
          walletId: wallet.id,
          type: payout > 0n ? 'settleWin' : 'settleLoss',
          amount: payout > 0n ? payout : round.stake,
          balanceBefore: wallet.available,
          balanceAfter: updatedWallet.available,
          lockedBefore: wallet.locked,
          lockedAfter: updatedWallet.locked,
          gameId: round.gameId,
          roundId: round.id,
          metadata: {
            userId: round.userId,
            gameId: round.gameId,
            roundId: round.id,
            stake: Number(round.stake),
            outcome
          }
        }
      });

      return roundToRecord(settled);
    }, { isolationLevel: SERIALIZABLE });
  }

  async refundRound(input: RefundRoundInput): Promise<GameRoundRecord> {
    assertText(input.roundId, 'roundId');
    assertText(input.idempotencyKey, 'idempotencyKey');

    return this.prisma.$transaction(async tx => {
      const round = await requireRound(tx, input.roundId);
      if (round.status === 'refunded') {
        if (round.settlementIdempotencyKey === input.idempotencyKey) return roundToRecord(round);
        throw new Error(`Round ${round.id} is already refunded`);
      }
      if (round.status !== 'open') throw new Error(`Round ${round.id} is not open`);

      const wallet = await requireWallet(tx, round.userId);
      if (wallet.locked < round.stake) {
        throw new Error(`Locked balance invariant failed for round ${round.id}`);
      }

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          available: wallet.available + round.stake,
          locked: wallet.locked - round.stake
        }
      });

      const refunded = await tx.gameRound.update({
        where: { id: round.id },
        data: {
          status: 'refunded',
          payout: round.stake,
          settlementIdempotencyKey: input.idempotencyKey,
          settledAt: new Date(),
          events: {
            create: {
              type: 'refunded',
              payload: { reason: input.reason }
            }
          }
        }
      });

      await tx.walletLedgerEntry.create({
        data: {
          transactionId: randomUUID(),
          idempotencyKey: input.idempotencyKey,
          userId: round.userId,
          walletId: wallet.id,
          type: 'refund',
          amount: round.stake,
          balanceBefore: wallet.available,
          balanceAfter: updatedWallet.available,
          lockedBefore: wallet.locked,
          lockedAfter: updatedWallet.locked,
          gameId: round.gameId,
          roundId: round.id,
          metadata: {
            userId: round.userId,
            gameId: round.gameId,
            roundId: round.id,
            reason: input.reason
          }
        }
      });

      return roundToRecord(refunded);
    }, { isolationLevel: SERIALIZABLE });
  }

  async updateRoundOutcome(input: UpdateRoundOutcomeInput): Promise<GameRoundRecord> {
    assertText(input.roundId, 'roundId');
    return this.prisma.$transaction(async tx => {
      const round = await requireRound(tx, input.roundId);
      if (round.status !== 'open') throw new Error(`Round ${round.id} is not open`);
      const outcome = toJson(input.outcome);
      const updated = await tx.gameRound.update({
        where: { id: round.id },
        data: {
          outcome,
          events: {
            create: {
              type: 'action',
              payload: {
                type: input.eventType ?? 'stateUpdated',
                outcome
              }
            }
          }
        }
      });
      return roundToRecord(updated);
    }, { isolationLevel: SERIALIZABLE });
  }

  async addRoundStake(input: AddRoundStakeInput): Promise<GameRoundRecord> {
    assertText(input.roundId, 'roundId');
    assertText(input.idempotencyKey, 'idempotencyKey');
    const amount = BigInt(asMoney(input.amount));

    return this.prisma.$transaction(async tx => {
      const existingLedger = await tx.walletLedgerEntry.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { round: true }
      });
      if (existingLedger?.round) return roundToRecord(existingLedger.round);

      const round = await requireRound(tx, input.roundId);
      if (round.status !== 'open') throw new Error(`Round ${round.id} is not open`);

      const wallet = await requireWallet(tx, round.userId);
      if (wallet.available < amount) {
        throw new Error(`Insufficient funds: tried to lock ${amount.toString()} from ${wallet.available.toString()}`);
      }

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          available: wallet.available - amount,
          locked: wallet.locked + amount
        }
      });

      const updatedRound = await tx.gameRound.update({
        where: { id: round.id },
        data: {
          stake: round.stake + amount,
          events: {
            create: {
              type: 'action',
              payload: {
                type: 'stakeAdded',
                amount: input.amount,
                reason: input.reason
              }
            }
          }
        }
      });

      await tx.walletLedgerEntry.create({
        data: {
          transactionId: randomUUID(),
          idempotencyKey: input.idempotencyKey,
          userId: round.userId,
          walletId: wallet.id,
          type: 'lock',
          amount,
          balanceBefore: wallet.available,
          balanceAfter: updatedWallet.available,
          lockedBefore: wallet.locked,
          lockedAfter: updatedWallet.locked,
          gameId: round.gameId,
          roundId: round.id,
          metadata: {
            userId: round.userId,
            gameId: round.gameId,
            roundId: round.id,
            reason: input.reason
          }
        }
      });

      return roundToRecord(updatedRound);
    }, { isolationLevel: SERIALIZABLE });
  }

  private async resolveUserId(userIdOrUsername: string): Promise<string> {
    assertText(userIdOrUsername, 'userId');
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { id: userIdOrUsername },
          { username: userIdOrUsername }
        ]
      },
      select: { id: true }
    });
    if (!user) throw new Error(`User not found: ${userIdOrUsername}`);
    return user.id;
  }
}

const requireWallet = async (tx: TransactionClient, userId: string) => {
  const wallet = await tx.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new Error(`Wallet not found for user ${userId}`);
  return wallet;
};

const requireRound = async (tx: TransactionClient, roundId: string) => {
  const round = await tx.gameRound.findUnique({ where: { id: roundId } });
  if (!round) throw new Error(`Round not found: ${roundId}`);
  return round;
};

const walletToState = (wallet: { available: bigint; locked: bigint }): WalletState => ({
  available: asMoney(toSafeNumber(wallet.available)),
  locked: asMoney(toSafeNumber(wallet.locked)),
  appliedIdempotencyKeys: []
});

const ledgerToRecord = (entry: {
  id: string;
  idempotencyKey: string;
  type: string;
  amount: bigint;
  balanceBefore: bigint;
  balanceAfter: bigint;
  lockedBefore: bigint;
  lockedAfter: bigint;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
}): LedgerEntry => ({
  id: entry.id,
  idempotencyKey: entry.idempotencyKey,
  type: entry.type as LedgerEntry['type'],
  amount: asMoney(toSafeNumber(entry.amount)),
  balanceBefore: {
    available: asMoney(toSafeNumber(entry.balanceBefore)),
    locked: asMoney(toSafeNumber(entry.lockedBefore)),
    appliedIdempotencyKeys: []
  },
  balanceAfter: {
    available: asMoney(toSafeNumber(entry.balanceAfter)),
    locked: asMoney(toSafeNumber(entry.lockedAfter)),
    appliedIdempotencyKeys: [entry.idempotencyKey]
  },
  metadata: isRecord(entry.metadata) ? entry.metadata : undefined,
  createdAt: entry.createdAt.toISOString()
});

const roundToRecord = (round: {
  id: string;
  userId: string;
  gameId: string;
  stake: bigint;
  status: string;
  payout: bigint;
  outcome: Prisma.JsonValue | null;
  lockIdempotencyKey: string;
  settlementIdempotencyKey: string | null;
  createdAt: Date;
  settledAt: Date | null;
}): GameRoundRecord => ({
  id: round.id,
  userId: round.userId,
  gameId: round.gameId,
  stake: asMoney(toSafeNumber(round.stake)),
  status: round.status as GameRoundRecord['status'],
  payout: asMoney(toSafeNumber(round.payout)),
  outcome: round.outcome,
  lockIdempotencyKey: round.lockIdempotencyKey,
  settlementIdempotencyKey: round.settlementIdempotencyKey ?? undefined,
  createdAt: round.createdAt.toISOString(),
  settledAt: round.settledAt?.toISOString()
});

const toSafeNumber = (value: bigint): number => {
  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue)) {
    throw new Error(`Database money value exceeds safe integer range: ${value.toString()}`);
  }
  return numberValue;
};

const assertText = (value: string, field: string) => {
  if (!value || typeof value !== 'string') {
    throw new Error(`${field} is required`);
  }
};

const toJson = (value: unknown): Prisma.InputJsonValue | undefined => {
  if (value === undefined) return undefined;
  return value as Prisma.InputJsonValue;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
