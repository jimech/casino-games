import { Prisma, PrismaClient } from '@prisma/client';
import { CasinoService, GameRoundRecord } from './casinoService';
import { LedgerEntry, WalletState } from '../domain/ledger';
import { asMoney } from '../domain/money';

export type ReconciliationSeverity = 'info' | 'warning' | 'critical';

export interface ReconciliationIssue {
  id: string;
  severity: ReconciliationSeverity;
  type: string;
  userId?: string;
  roundId?: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ReconciliationReport {
  generatedAt: string;
  mode: 'memory' | 'prisma';
  status: 'pass' | 'warning' | 'fail';
  summary: {
    walletCount: number;
    ledgerEntryCount: number;
    roundCount: number;
    openRoundCount: number;
    settledRoundCount: number;
    refundedRoundCount: number;
    provablyFairSeedCount: number;
    issueCount: number;
    criticalIssueCount: number;
    warningIssueCount: number;
  };
  issues: ReconciliationIssue[];
}

export interface ReconciliationService {
  run(): Promise<ReconciliationReport> | ReconciliationReport;
}

interface WalletRecord extends WalletState {
  userId: string;
}

interface LedgerRecord extends LedgerEntry {
  userId: string;
  roundId?: string;
}

interface SeedRecord {
  id: string;
  userId: string;
  gameId: string;
  status: string;
  roundId?: string;
}

interface ReconciliationInput {
  mode: 'memory' | 'prisma';
  wallets: WalletRecord[];
  ledger: LedgerRecord[];
  rounds: GameRoundRecord[];
  seeds: SeedRecord[];
}

export class MemoryReconciliationService implements ReconciliationService {
  constructor(private readonly casinoService: CasinoService) {}

  run(): ReconciliationReport {
    const snapshot = this.casinoService.snapshot();
    return reconcile({
      mode: 'memory',
      wallets: Object.entries(snapshot.wallets).map(([userId, wallet]) => ({
        userId,
        ...wallet
      })),
      ledger: snapshot.ledger.map(entry => ({
        ...entry,
        userId: String(entry.metadata?.userId ?? ''),
        roundId: typeof entry.metadata?.roundId === 'string' ? entry.metadata.roundId : undefined
      })),
      rounds: snapshot.rounds,
      seeds: []
    });
  }
}

export class PrismaReconciliationService implements ReconciliationService {
  constructor(private readonly prisma: PrismaClient) {}

  async run(): Promise<ReconciliationReport> {
    const [wallets, ledger, rounds, seeds] = await Promise.all([
      this.prisma.wallet.findMany(),
      this.prisma.walletLedgerEntry.findMany({ orderBy: { createdAt: 'asc' } }),
      this.prisma.gameRound.findMany(),
      this.prisma.provablyFairSeed.findMany()
    ]);

    return reconcile({
      mode: 'prisma',
      wallets: wallets.map(wallet => ({
        userId: wallet.userId,
        available: asMoney(toSafeNumber(wallet.available)),
        locked: asMoney(toSafeNumber(wallet.locked)),
        appliedIdempotencyKeys: []
      })),
      ledger: ledger.map(entry => ({
        id: entry.id,
        idempotencyKey: entry.idempotencyKey,
        type: entry.type,
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
        createdAt: entry.createdAt.toISOString(),
        userId: entry.userId,
        roundId: entry.roundId ?? undefined
      })),
      rounds: rounds.map(round => ({
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
      })),
      seeds: seeds.map(seed => ({
        id: seed.id,
        userId: seed.userId,
        gameId: seed.gameId,
        status: seed.status,
        roundId: seed.roundId ?? undefined
      }))
    });
  }
}

const reconcile = (input: ReconciliationInput): ReconciliationReport => {
  const issues: ReconciliationIssue[] = [];
  const walletByUser = new Map(input.wallets.map(wallet => [wallet.userId, wallet]));
  const ledgerByUser = groupBy(input.ledger, entry => entry.userId);
  const ledgerByRound = groupBy(input.ledger.filter(entry => entry.roundId), entry => entry.roundId ?? '');
  const roundById = new Map(input.rounds.map(round => [round.id, round]));
  const seedsByRound = groupBy(input.seeds.filter(seed => seed.roundId), seed => seed.roundId ?? '');

  for (const wallet of input.wallets) {
    const entries = ledgerByUser.get(wallet.userId) ?? [];
    if (entries.length > 0) {
      const lastEntry = entries[entries.length - 1];
      if (lastEntry.balanceAfter.available !== wallet.available || lastEntry.balanceAfter.locked !== wallet.locked) {
        issues.push(issue({
          severity: 'critical',
          type: 'wallet_balance_mismatch',
          userId: wallet.userId,
          message: `Wallet ${wallet.userId} does not match latest ledger balance`,
          details: {
            wallet,
            ledgerBalanceAfter: lastEntry.balanceAfter,
            ledgerEntryId: lastEntry.id
          }
        }));
      }
    }

    const openStake = input.rounds
      .filter(round => round.userId === wallet.userId && round.status === 'open')
      .reduce((sum, round) => sum + round.stake, 0);
    if (openStake !== wallet.locked) {
      issues.push(issue({
        severity: 'critical',
        type: 'open_round_locked_mismatch',
        userId: wallet.userId,
        message: `Wallet ${wallet.userId} locked balance does not match open round stake`,
        details: {
          walletLocked: wallet.locked,
          openRoundStake: openStake
        }
      }));
    }
  }

  for (const entry of input.ledger) {
    const wallet = walletByUser.get(entry.userId);
    if (!wallet) {
      issues.push(issue({
        severity: 'critical',
        type: 'ledger_wallet_missing',
        userId: entry.userId,
        message: `Ledger entry ${entry.id} references a missing wallet`
      }));
    }
    if (entry.roundId && !roundById.has(entry.roundId)) {
      issues.push(issue({
        severity: 'critical',
        type: 'ledger_round_missing',
        userId: entry.userId,
        roundId: entry.roundId,
        message: `Ledger entry ${entry.id} references a missing round`
      }));
    }
  }

  for (const round of input.rounds) {
    const entries = ledgerByRound.get(round.id) ?? [];
    const lockEntries = entries.filter(entry => entry.type === 'lock');
    if (lockEntries.length < 1) {
      issues.push(issue({
        severity: 'critical',
        type: 'round_lock_missing',
        userId: round.userId,
        roundId: round.id,
        message: `Round ${round.id} has no linked lock ledger entry`
      }));
    }

    const lockedTotal = lockEntries.reduce((sum, entry) => sum + entry.amount, 0);
    if (lockedTotal !== round.stake) {
      issues.push(issue({
        severity: 'critical',
        type: 'round_stake_lock_mismatch',
        userId: round.userId,
        roundId: round.id,
        message: `Round ${round.id} stake does not match locked ledger total`,
        details: {
          roundStake: round.stake,
          lockedTotal
        }
      }));
    }

    if (round.status === 'open' && round.settlementIdempotencyKey) {
      issues.push(issue({
        severity: 'warning',
        type: 'open_round_has_settlement_key',
        userId: round.userId,
        roundId: round.id,
        message: `Open round ${round.id} unexpectedly has a settlement idempotency key`
      }));
    }

    if (round.status !== 'open') {
      const closeEntries = entries.filter(entry =>
        entry.type === 'settleWin' || entry.type === 'settleLoss' || entry.type === 'refund'
      );
      if (closeEntries.length < 1) {
        issues.push(issue({
          severity: 'critical',
          type: 'closed_round_settlement_missing',
          userId: round.userId,
          roundId: round.id,
          message: `Closed round ${round.id} has no settlement/refund ledger entry`
        }));
      }
      if (!round.settlementIdempotencyKey) {
        issues.push(issue({
          severity: 'critical',
          type: 'closed_round_settlement_key_missing',
          userId: round.userId,
          roundId: round.id,
          message: `Closed round ${round.id} is missing a settlement idempotency key`
        }));
      }
      if (!round.settledAt) {
        issues.push(issue({
          severity: 'warning',
          type: 'closed_round_settled_at_missing',
          userId: round.userId,
          roundId: round.id,
          message: `Closed round ${round.id} is missing settledAt`
        }));
      }
    }

    if (input.mode === 'prisma') {
      const roundSeeds = seedsByRound.get(round.id) ?? [];
      const needsSeed = round.gameId === 'roulette' || round.gameId === 'slots' || round.gameId === 'crash';
      if (needsSeed && round.status !== 'open' && roundSeeds.length < 1) {
        issues.push(issue({
          severity: 'warning',
          type: 'settled_round_seed_missing',
          userId: round.userId,
          roundId: round.id,
          message: `Settled ${round.gameId} round ${round.id} has no linked provably fair seed`
        }));
      }
    }
  }

  for (const seed of input.seeds) {
    if (seed.roundId && !roundById.has(seed.roundId)) {
      issues.push(issue({
        severity: 'critical',
        type: 'seed_round_missing',
        userId: seed.userId,
        roundId: seed.roundId,
        message: `Provably fair seed ${seed.id} references a missing round`
      }));
    }
    if (seed.status === 'revealed' && !seed.roundId) {
      issues.push(issue({
        severity: 'warning',
        type: 'revealed_seed_round_missing',
        userId: seed.userId,
        message: `Revealed provably fair seed ${seed.id} is not linked to a round`,
        details: {
          gameId: seed.gameId
        }
      }));
    }
  }

  const criticalIssueCount = issues.filter(item => item.severity === 'critical').length;
  const warningIssueCount = issues.filter(item => item.severity === 'warning').length;

  return {
    generatedAt: new Date().toISOString(),
    mode: input.mode,
    status: criticalIssueCount > 0 ? 'fail' : warningIssueCount > 0 ? 'warning' : 'pass',
    summary: {
      walletCount: input.wallets.length,
      ledgerEntryCount: input.ledger.length,
      roundCount: input.rounds.length,
      openRoundCount: input.rounds.filter(round => round.status === 'open').length,
      settledRoundCount: input.rounds.filter(round => round.status === 'settled').length,
      refundedRoundCount: input.rounds.filter(round => round.status === 'refunded').length,
      provablyFairSeedCount: input.seeds.length,
      issueCount: issues.length,
      criticalIssueCount,
      warningIssueCount
    },
    issues
  };
};

const groupBy = <T>(items: T[], keyFor: (item: T) => string) => {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
};

const issue = (input: Omit<ReconciliationIssue, 'id'>): ReconciliationIssue => ({
  id: `${input.type}:${input.userId ?? 'system'}:${input.roundId ?? 'global'}`,
  ...input
});

const toSafeNumber = (value: bigint): number => {
  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue)) {
    throw new Error(`Database money value exceeds safe integer range: ${value.toString()}`);
  }
  return numberValue;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
