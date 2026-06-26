import { PrismaClient } from '@prisma/client';
import { GameRoundRecord } from './casinoService';
import { LedgerEntry, WalletState } from '../domain/ledger';
import { asMoney } from '../domain/money';

export type TournamentStatus = 'upcoming' | 'active' | 'ended' | 'cancelled';

export interface TournamentDefinition {
  id: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  entryFee: number;
  prizePool: number;
  status: TournamentStatus;
}

export interface TournamentEntry {
  id: string;
  tournamentId: string;
  userId: string;
  entryFee: number;
  ledgerEntryId?: string;
  idempotencyKey: string;
  enteredAt: string;
}

export interface TournamentLeaderboardRow {
  rank: number;
  userId: string;
  score: number;
  totalStake: number;
  totalPayout: number;
  roundCount: number;
  lastSettledAt?: string;
}

export interface TournamentEntryResult {
  tournament: TournamentDefinition;
  entry: TournamentEntry;
  wallet: WalletState;
}

export interface TournamentLeaderboard {
  tournament: TournamentDefinition;
  generatedAt: string;
  entries: TournamentLeaderboardRow[];
}

export interface TournamentPayoutRecord {
  id: string;
  tournamentId: string;
  settlementId: string;
  userId: string;
  rank: number;
  amount: number;
  ledgerEntryId?: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface TournamentSettlementRecord {
  id: string;
  tournamentId: string;
  prizePool: number;
  status: 'settled';
  idempotencyKey: string;
  settledAt: string;
  payouts: TournamentPayoutRecord[];
}

export interface TournamentRefundRecord {
  id: string;
  cancellationId: string;
  tournamentId: string;
  entryId: string;
  userId: string;
  amount: number;
  ledgerEntryId?: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface TournamentCancellationRecord {
  id: string;
  tournamentId: string;
  reason: string;
  idempotencyKey: string;
  cancelledAt: string;
  refunds: TournamentRefundRecord[];
}

export interface TournamentService {
  listTournaments(now?: Date): Promise<TournamentDefinition[]> | TournamentDefinition[];
  enter(input: { tournamentId: string; userId: string; idempotencyKey: string; now?: Date }): Promise<TournamentEntryResult>;
  leaderboard(input: { tournamentId: string; now?: Date }): Promise<TournamentLeaderboard>;
  getSettlement(input: { tournamentId: string; now?: Date }): Promise<TournamentSettlementRecord | undefined>;
  settle(input: { tournamentId: string; idempotencyKey: string; now?: Date }): Promise<TournamentSettlementRecord>;
  getCancellation(input: { tournamentId: string; now?: Date }): Promise<TournamentCancellationRecord | undefined>;
  cancel(input: { tournamentId: string; reason: string; idempotencyKey: string; now?: Date }): Promise<TournamentCancellationRecord>;
}

interface TournamentWallet {
  creditWallet(input: {
    userId: string;
    amount: number;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<WalletState> | WalletState;
  debitWallet(input: {
    userId: string;
    amount: number;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<WalletState> | WalletState;
  getWallet(userId: string): Promise<WalletState> | WalletState;
  getLedger(userId: string): Promise<LedgerEntry[]> | LedgerEntry[];
  listRounds(userId?: string): Promise<GameRoundRecord[]> | GameRoundRecord[];
}

const dayMs = 24 * 60 * 60 * 1000;
const relativeIso = (daysFromNow: number) => new Date(Date.now() + daysFromNow * dayMs).toISOString();

export const DEFAULT_TOURNAMENTS: Omit<TournamentDefinition, 'status'>[] = [
  {
    id: 'weekly-neon-race',
    title: 'Weekly Neon Race',
    description: 'Seven-day leaderboard scored from settled backend rounds only.',
    startAt: relativeIso(-1),
    endAt: relativeIso(6),
    entryFee: 250,
    prizePool: 5000
  },
  {
    id: 'high-roller-sprint',
    title: 'High Roller Sprint',
    description: 'Short-format prize pool for players who want higher entry pressure.',
    startAt: relativeIso(-1),
    endAt: relativeIso(2),
    entryFee: 1000,
    prizePool: 20000
  },
  {
    id: 'weekend-warmup',
    title: 'Weekend Warmup',
    description: 'Upcoming free-entry leaderboard for settled weekend play.',
    startAt: relativeIso(2),
    endAt: relativeIso(5),
    entryFee: 0,
    prizePool: 1500
  }
];

export class MemoryTournamentService implements TournamentService {
  private entries = new Map<string, TournamentEntry>();
  private settlements = new Map<string, TournamentSettlementRecord>();
  private cancellations = new Map<string, TournamentCancellationRecord>();
  private sequence = 0;
  private settlementSequence = 0;
  private payoutSequence = 0;
  private cancellationSequence = 0;
  private refundSequence = 0;

  constructor(
    private readonly wallet: TournamentWallet,
    private readonly tournaments = DEFAULT_TOURNAMENTS
  ) {}

  listTournaments(now = new Date()): TournamentDefinition[] {
    return this.tournaments.map(tournament => {
      const status = this.cancellations.has(tournament.id) ? 'cancelled' : withStatus(tournament, now).status;
      return { ...tournament, status };
    });
  }

  async enter(input: { tournamentId: string; userId: string; idempotencyKey: string; now?: Date }): Promise<TournamentEntryResult> {
    assertText(input.tournamentId, 'tournamentId');
    assertText(input.userId, 'userId');
    assertText(input.idempotencyKey, 'idempotencyKey');
    const tournament = this.requireTournament(input.tournamentId, input.now);
    if (tournament.status !== 'active') {
      throw new Error(`Tournament ${tournament.id} is not open for entry`);
    }

    const entryKey = tournamentEntryKey(input.tournamentId, input.userId);
    const existing = this.entries.get(entryKey);
    if (existing) {
      return {
        tournament,
        entry: existing,
        wallet: await this.wallet.getWallet(input.userId)
      };
    }

    const wallet = tournament.entryFee > 0
      ? await this.wallet.debitWallet({
          userId: input.userId,
          amount: tournament.entryFee,
          idempotencyKey: input.idempotencyKey,
          metadata: {
            source: 'tournament_entry',
            tournamentId: tournament.id,
            tournamentTitle: tournament.title
          }
        })
      : await this.wallet.getWallet(input.userId);
    const ledger = await this.wallet.getLedger(input.userId);
    const ledgerEntry = ledger.find(entry => entry.idempotencyKey === input.idempotencyKey);
    const entry: TournamentEntry = {
      id: `tournament_entry_${(++this.sequence).toString().padStart(8, '0')}`,
      tournamentId: tournament.id,
      userId: input.userId,
      entryFee: tournament.entryFee,
      ledgerEntryId: ledgerEntry?.id,
      idempotencyKey: input.idempotencyKey,
      enteredAt: (input.now ?? new Date()).toISOString()
    };
    this.entries.set(entryKey, entry);
    return { tournament, entry, wallet };
  }

  async leaderboard(input: { tournamentId: string; now?: Date }): Promise<TournamentLeaderboard> {
    assertText(input.tournamentId, 'tournamentId');
    const tournament = this.requireTournament(input.tournamentId, input.now);
    const entries = [...this.entries.values()].filter(entry => entry.tournamentId === tournament.id);
    const rounds = await this.wallet.listRounds();
    const rows = entries
      .map(entry => buildLeaderboardRow(entry, tournament, rounds))
      .sort(compareRows)
      .map((row, index) => ({ ...row, rank: index + 1 }));
    return {
      tournament,
      generatedAt: (input.now ?? new Date()).toISOString(),
      entries: rows
    };
  }

  async getSettlement(input: { tournamentId: string; now?: Date }): Promise<TournamentSettlementRecord | undefined> {
    assertText(input.tournamentId, 'tournamentId');
    this.requireTournament(input.tournamentId, input.now);
    return this.settlements.get(input.tournamentId);
  }

  async settle(input: { tournamentId: string; idempotencyKey: string; now?: Date }): Promise<TournamentSettlementRecord> {
    assertText(input.tournamentId, 'tournamentId');
    assertText(input.idempotencyKey, 'idempotencyKey');
    const tournament = this.requireTournament(input.tournamentId, input.now);
    if (tournament.status === 'cancelled') {
      throw new Error(`Tournament ${tournament.id} is cancelled`);
    }
    if (tournament.status !== 'ended') {
      throw new Error(`Tournament ${tournament.id} is not ready for settlement`);
    }
    const existing = this.settlements.get(tournament.id);
    if (existing) return existing;

    const leaderboard = await this.leaderboard({ tournamentId: tournament.id, now: input.now });
    const payouts = buildPrizePayouts(tournament, leaderboard.entries);
    const settlementId = `tournament_settlement_${(++this.settlementSequence).toString().padStart(8, '0')}`;
    const payoutRecords: TournamentPayoutRecord[] = [];
    for (const payout of payouts) {
      const payoutKey = `${input.idempotencyKey}-rank-${payout.rank}-${payout.userId}`;
      await this.wallet.creditWallet({
        userId: payout.userId,
        amount: payout.amount,
        idempotencyKey: payoutKey,
        metadata: {
          source: 'tournament_prize',
          tournamentId: tournament.id,
          tournamentTitle: tournament.title,
          settlementId,
          rank: payout.rank
        }
      });
      const ledger = await this.wallet.getLedger(payout.userId);
      const ledgerEntry = ledger.find(entry => entry.idempotencyKey === payoutKey);
      payoutRecords.push({
        id: `tournament_payout_${(++this.payoutSequence).toString().padStart(8, '0')}`,
        tournamentId: tournament.id,
        settlementId,
        userId: payout.userId,
        rank: payout.rank,
        amount: payout.amount,
        ledgerEntryId: ledgerEntry?.id,
        idempotencyKey: payoutKey,
        createdAt: (input.now ?? new Date()).toISOString()
      });
    }
    const settlement: TournamentSettlementRecord = {
      id: settlementId,
      tournamentId: tournament.id,
      prizePool: tournament.prizePool,
      status: 'settled',
      idempotencyKey: input.idempotencyKey,
      settledAt: (input.now ?? new Date()).toISOString(),
      payouts: payoutRecords
    };
    this.settlements.set(tournament.id, settlement);
    return settlement;
  }

  async getCancellation(input: { tournamentId: string; now?: Date }): Promise<TournamentCancellationRecord | undefined> {
    assertText(input.tournamentId, 'tournamentId');
    this.requireTournament(input.tournamentId, input.now);
    return this.cancellations.get(input.tournamentId);
  }

  async cancel(input: { tournamentId: string; reason: string; idempotencyKey: string; now?: Date }): Promise<TournamentCancellationRecord> {
    assertText(input.tournamentId, 'tournamentId');
    assertText(input.reason, 'reason');
    assertText(input.idempotencyKey, 'idempotencyKey');
    const tournament = this.requireTournament(input.tournamentId, input.now);
    const existing = this.cancellations.get(tournament.id);
    if (existing) return existing;
    if (this.settlements.has(tournament.id)) {
      throw new Error(`Tournament ${tournament.id} is already settled`);
    }

    const cancellationId = `tournament_cancellation_${(++this.cancellationSequence).toString().padStart(8, '0')}`;
    const refunds: TournamentRefundRecord[] = [];
    const entries = [...this.entries.values()].filter(entry => entry.tournamentId === tournament.id);
    for (const entry of entries) {
      if (entry.entryFee <= 0) continue;
      const refundKey = `${input.idempotencyKey}-entry-${entry.id}`;
      await this.wallet.creditWallet({
        userId: entry.userId,
        amount: entry.entryFee,
        idempotencyKey: refundKey,
        metadata: {
          source: 'tournament_entry_refund',
          tournamentId: tournament.id,
          tournamentTitle: tournament.title,
          cancellationId,
          entryId: entry.id
        }
      });
      const ledger = await this.wallet.getLedger(entry.userId);
      const ledgerEntry = ledger.find(item => item.idempotencyKey === refundKey);
      refunds.push({
        id: `tournament_refund_${(++this.refundSequence).toString().padStart(8, '0')}`,
        cancellationId,
        tournamentId: tournament.id,
        entryId: entry.id,
        userId: entry.userId,
        amount: entry.entryFee,
        ledgerEntryId: ledgerEntry?.id,
        idempotencyKey: refundKey,
        createdAt: (input.now ?? new Date()).toISOString()
      });
    }
    const cancellation: TournamentCancellationRecord = {
      id: cancellationId,
      tournamentId: tournament.id,
      reason: input.reason.trim(),
      idempotencyKey: input.idempotencyKey,
      cancelledAt: (input.now ?? new Date()).toISOString(),
      refunds
    };
    this.cancellations.set(tournament.id, cancellation);
    return cancellation;
  }

  private requireTournament(tournamentId: string, now = new Date()): TournamentDefinition {
    const tournament = this.listTournaments(now).find(candidate => candidate.id === tournamentId);
    if (!tournament) throw new Error(`Tournament not found: ${tournamentId}`);
    return tournament;
  }
}

export class PrismaTournamentService implements TournamentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly wallet: TournamentWallet,
    private readonly tournaments = DEFAULT_TOURNAMENTS
  ) {}

  async listTournaments(now = new Date()): Promise<TournamentDefinition[]> {
    const cancellations = await this.prisma.tournamentCancellation.findMany({
      select: { tournamentId: true }
    });
    const cancelledIds = new Set(cancellations.map(cancellation => cancellation.tournamentId));
    return this.tournaments.map(tournament => {
      const status = cancelledIds.has(tournament.id) ? 'cancelled' : withStatus(tournament, now).status;
      return { ...tournament, status };
    });
  }

  async enter(input: { tournamentId: string; userId: string; idempotencyKey: string; now?: Date }): Promise<TournamentEntryResult> {
    assertText(input.tournamentId, 'tournamentId');
    assertText(input.userId, 'userId');
    assertText(input.idempotencyKey, 'idempotencyKey');
    const tournament = await this.requireTournament(input.tournamentId, input.now);
    if (tournament.status !== 'active') {
      throw new Error(`Tournament ${tournament.id} is not open for entry`);
    }

    const existing = await this.prisma.tournamentEntry.findUnique({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: input.userId } }
    });
    if (existing) {
      return {
        tournament,
        entry: tournamentEntryToRecord(existing),
        wallet: await this.wallet.getWallet(input.userId)
      };
    }

    const wallet = tournament.entryFee > 0
      ? await this.wallet.debitWallet({
          userId: input.userId,
          amount: tournament.entryFee,
          idempotencyKey: input.idempotencyKey,
          metadata: {
            source: 'tournament_entry',
            tournamentId: tournament.id,
            tournamentTitle: tournament.title
          }
        })
      : await this.wallet.getWallet(input.userId);
    const ledger = await this.wallet.getLedger(input.userId);
    const ledgerEntry = ledger.find(entry => entry.idempotencyKey === input.idempotencyKey);
    const created = await this.prisma.tournamentEntry.create({
      data: {
        tournamentId: tournament.id,
        userId: input.userId,
        entryFee: BigInt(asMoney(tournament.entryFee)),
        ledgerEntryId: ledgerEntry?.id,
        idempotencyKey: input.idempotencyKey,
        enteredAt: input.now ?? new Date()
      }
    });

    return { tournament, entry: tournamentEntryToRecord(created), wallet };
  }

  async leaderboard(input: { tournamentId: string; now?: Date }): Promise<TournamentLeaderboard> {
    assertText(input.tournamentId, 'tournamentId');
    const tournament = await this.requireTournament(input.tournamentId, input.now);
    const [entries, rounds] = await Promise.all([
      this.prisma.tournamentEntry.findMany({
        where: { tournamentId: tournament.id },
        orderBy: { enteredAt: 'asc' }
      }),
      this.wallet.listRounds()
    ]);
    const rows = entries
      .map(entry => buildLeaderboardRow(tournamentEntryToRecord(entry), tournament, rounds))
      .sort(compareRows)
      .map((row, index) => ({ ...row, rank: index + 1 }));
    return {
      tournament,
      generatedAt: (input.now ?? new Date()).toISOString(),
      entries: rows
    };
  }

  async getSettlement(input: { tournamentId: string; now?: Date }): Promise<TournamentSettlementRecord | undefined> {
    assertText(input.tournamentId, 'tournamentId');
    await this.requireTournament(input.tournamentId, input.now);
    const settlement = await this.prisma.tournamentSettlement.findUnique({
      where: { tournamentId: input.tournamentId },
      include: { payouts: { orderBy: { rank: 'asc' } } }
    });
    return settlement ? tournamentSettlementToRecord(settlement) : undefined;
  }

  async settle(input: { tournamentId: string; idempotencyKey: string; now?: Date }): Promise<TournamentSettlementRecord> {
    assertText(input.tournamentId, 'tournamentId');
    assertText(input.idempotencyKey, 'idempotencyKey');
    const tournament = await this.requireTournament(input.tournamentId, input.now);
    if (tournament.status === 'cancelled') {
      throw new Error(`Tournament ${tournament.id} is cancelled`);
    }
    if (tournament.status !== 'ended') {
      throw new Error(`Tournament ${tournament.id} is not ready for settlement`);
    }
    const existing = await this.prisma.tournamentSettlement.findUnique({
      where: { tournamentId: tournament.id },
      include: { payouts: { orderBy: { rank: 'asc' } } }
    });
    if (existing) return tournamentSettlementToRecord(existing);

    const leaderboard = await this.leaderboard({ tournamentId: tournament.id, now: input.now });
    const payouts = buildPrizePayouts(tournament, leaderboard.entries);
    const settlement = await this.prisma.tournamentSettlement.create({
      data: {
        tournamentId: tournament.id,
        prizePool: BigInt(asMoney(tournament.prizePool)),
        idempotencyKey: input.idempotencyKey,
        settledAt: input.now ?? new Date()
      },
      include: { payouts: true }
    });

    const createdPayouts = [];
    for (const payout of payouts) {
      const payoutKey = `${input.idempotencyKey}-rank-${payout.rank}-${payout.userId}`;
      await this.wallet.creditWallet({
        userId: payout.userId,
        amount: payout.amount,
        idempotencyKey: payoutKey,
        metadata: {
          source: 'tournament_prize',
          tournamentId: tournament.id,
          tournamentTitle: tournament.title,
          settlementId: settlement.id,
          rank: payout.rank
        }
      });
      const ledger = await this.wallet.getLedger(payout.userId);
      const ledgerEntry = ledger.find(entry => entry.idempotencyKey === payoutKey);
      const created = await this.prisma.tournamentPayout.create({
        data: {
          settlementId: settlement.id,
          tournamentId: tournament.id,
          userId: payout.userId,
          rank: payout.rank,
          amount: BigInt(asMoney(payout.amount)),
          ledgerEntryId: ledgerEntry?.id,
          idempotencyKey: payoutKey
        }
      });
      createdPayouts.push(created);
    }

    return tournamentSettlementToRecord({ ...settlement, payouts: createdPayouts });
  }

  async getCancellation(input: { tournamentId: string; now?: Date }): Promise<TournamentCancellationRecord | undefined> {
    assertText(input.tournamentId, 'tournamentId');
    await this.requireTournament(input.tournamentId, input.now);
    const cancellation = await this.prisma.tournamentCancellation.findUnique({
      where: { tournamentId: input.tournamentId },
      include: { refunds: { orderBy: { createdAt: 'asc' } } }
    });
    return cancellation ? tournamentCancellationToRecord(cancellation) : undefined;
  }

  async cancel(input: { tournamentId: string; reason: string; idempotencyKey: string; now?: Date }): Promise<TournamentCancellationRecord> {
    assertText(input.tournamentId, 'tournamentId');
    assertText(input.reason, 'reason');
    assertText(input.idempotencyKey, 'idempotencyKey');
    const tournament = await this.requireTournament(input.tournamentId, input.now);
    const existing = await this.prisma.tournamentCancellation.findUnique({
      where: { tournamentId: tournament.id },
      include: { refunds: { orderBy: { createdAt: 'asc' } } }
    });
    if (existing) return tournamentCancellationToRecord(existing);
    const settlement = await this.prisma.tournamentSettlement.findUnique({ where: { tournamentId: tournament.id } });
    if (settlement) throw new Error(`Tournament ${tournament.id} is already settled`);

    const cancellation = await this.prisma.tournamentCancellation.create({
      data: {
        tournamentId: tournament.id,
        reason: input.reason.trim(),
        idempotencyKey: input.idempotencyKey,
        cancelledAt: input.now ?? new Date()
      },
      include: { refunds: true }
    });
    const entries = await this.prisma.tournamentEntry.findMany({
      where: { tournamentId: tournament.id },
      orderBy: { enteredAt: 'asc' }
    });
    const createdRefunds = [];
    for (const entry of entries) {
      const amount = toSafeNumber(entry.entryFee);
      if (amount <= 0) continue;
      const refundKey = `${input.idempotencyKey}-entry-${entry.id}`;
      await this.wallet.creditWallet({
        userId: entry.userId,
        amount,
        idempotencyKey: refundKey,
        metadata: {
          source: 'tournament_entry_refund',
          tournamentId: tournament.id,
          tournamentTitle: tournament.title,
          cancellationId: cancellation.id,
          entryId: entry.id
        }
      });
      const ledger = await this.wallet.getLedger(entry.userId);
      const ledgerEntry = ledger.find(item => item.idempotencyKey === refundKey);
      const created = await this.prisma.tournamentRefund.create({
        data: {
          cancellationId: cancellation.id,
          tournamentId: tournament.id,
          entryId: entry.id,
          userId: entry.userId,
          amount: entry.entryFee,
          ledgerEntryId: ledgerEntry?.id,
          idempotencyKey: refundKey
        }
      });
      createdRefunds.push(created);
    }

    return tournamentCancellationToRecord({ ...cancellation, refunds: createdRefunds });
  }

  private async requireTournament(tournamentId: string, now = new Date()): Promise<TournamentDefinition> {
    const tournament = (await this.listTournaments(now)).find(candidate => candidate.id === tournamentId);
    if (!tournament) throw new Error(`Tournament not found: ${tournamentId}`);
    return tournament;
  }
}

export const buildLeaderboardRow = (
  entry: Pick<TournamentEntry, 'userId' | 'enteredAt'>,
  tournament: Pick<TournamentDefinition, 'startAt' | 'endAt'>,
  rounds: GameRoundRecord[]
): Omit<TournamentLeaderboardRow, 'rank'> => {
  const start = Math.max(new Date(tournament.startAt).getTime(), new Date(entry.enteredAt).getTime());
  const end = new Date(tournament.endAt).getTime();
  const settledRounds = rounds.filter(round => {
    if (round.userId !== entry.userId || round.status !== 'settled' || !round.settledAt) return false;
    const settledAt = new Date(round.settledAt).getTime();
    return settledAt >= start && settledAt <= end;
  });
  const totalStake = asMoney(settledRounds.reduce((sum, round) => sum + round.stake, 0));
  const totalPayout = asMoney(settledRounds.reduce((sum, round) => sum + round.payout, 0));
  const lastSettledAt = settledRounds
    .map(round => round.settledAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  return {
    userId: entry.userId,
    score: totalPayout - totalStake,
    totalStake,
    totalPayout,
    roundCount: settledRounds.length,
    lastSettledAt
  };
};

export const PRIZE_SHARES = [0.5, 0.3, 0.2] as const;

export const buildPrizePayouts = (
  tournament: Pick<TournamentDefinition, 'id' | 'prizePool'>,
  rows: TournamentLeaderboardRow[]
): Array<{ userId: string; rank: number; amount: number }> => {
  const winners = rows.filter(row => row.roundCount > 0).slice(0, PRIZE_SHARES.length);
  if (!winners.length || tournament.prizePool <= 0) return [];
  const activeShares = PRIZE_SHARES.slice(0, winners.length);
  const shareTotal = activeShares.reduce((sum, share) => sum + share, 0);
  let allocated = 0;
  return winners.map((winner, index) => {
    const amount = index === winners.length - 1
      ? asMoney(tournament.prizePool - allocated)
      : asMoney(Math.floor((tournament.prizePool * activeShares[index]) / shareTotal));
    allocated += amount;
    return {
      userId: winner.userId,
      rank: winner.rank,
      amount
    };
  });
};

export const compareRows = (
  first: Omit<TournamentLeaderboardRow, 'rank'>,
  second: Omit<TournamentLeaderboardRow, 'rank'>
) => {
  if (second.score !== first.score) return second.score - first.score;
  if (second.totalPayout !== first.totalPayout) return second.totalPayout - first.totalPayout;
  if (second.roundCount !== first.roundCount) return second.roundCount - first.roundCount;
  const firstSettled = first.lastSettledAt ?? '9999-12-31T23:59:59.999Z';
  const secondSettled = second.lastSettledAt ?? '9999-12-31T23:59:59.999Z';
  if (firstSettled !== secondSettled) return firstSettled.localeCompare(secondSettled);
  return first.userId.localeCompare(second.userId);
};

const withStatus = (tournament: Omit<TournamentDefinition, 'status'>, now: Date): TournamentDefinition => {
  const timestamp = now.getTime();
  if (timestamp < new Date(tournament.startAt).getTime()) return { ...tournament, status: 'upcoming' };
  if (timestamp > new Date(tournament.endAt).getTime()) return { ...tournament, status: 'ended' };
  return { ...tournament, status: 'active' };
};

const tournamentEntryKey = (tournamentId: string, userId: string) => `${tournamentId}:${userId}`;

const tournamentEntryToRecord = (entry: {
  id: string;
  tournamentId: string;
  userId: string;
  entryFee: bigint;
  ledgerEntryId: string | null;
  idempotencyKey: string;
  enteredAt: Date;
}): TournamentEntry => ({
  id: entry.id,
  tournamentId: entry.tournamentId,
  userId: entry.userId,
  entryFee: toSafeNumber(entry.entryFee),
  ledgerEntryId: entry.ledgerEntryId ?? undefined,
  idempotencyKey: entry.idempotencyKey,
  enteredAt: entry.enteredAt.toISOString()
});

const tournamentSettlementToRecord = (settlement: {
  id: string;
  tournamentId: string;
  prizePool: bigint;
  status: string;
  idempotencyKey: string;
  settledAt: Date;
  payouts: Array<{
    id: string;
    tournamentId: string;
    settlementId: string;
    userId: string;
    rank: number;
    amount: bigint;
    ledgerEntryId: string | null;
    idempotencyKey: string;
    createdAt: Date;
  }>;
}): TournamentSettlementRecord => ({
  id: settlement.id,
  tournamentId: settlement.tournamentId,
  prizePool: toSafeNumber(settlement.prizePool),
  status: 'settled',
  idempotencyKey: settlement.idempotencyKey,
  settledAt: settlement.settledAt.toISOString(),
  payouts: settlement.payouts
    .map(payout => ({
      id: payout.id,
      tournamentId: payout.tournamentId,
      settlementId: payout.settlementId,
      userId: payout.userId,
      rank: payout.rank,
      amount: toSafeNumber(payout.amount),
      ledgerEntryId: payout.ledgerEntryId ?? undefined,
      idempotencyKey: payout.idempotencyKey,
      createdAt: payout.createdAt.toISOString()
    }))
    .sort((left, right) => left.rank - right.rank)
});

const tournamentCancellationToRecord = (cancellation: {
  id: string;
  tournamentId: string;
  reason: string;
  idempotencyKey: string;
  cancelledAt: Date;
  refunds: Array<{
    id: string;
    cancellationId: string;
    tournamentId: string;
    entryId: string;
    userId: string;
    amount: bigint;
    ledgerEntryId: string | null;
    idempotencyKey: string;
    createdAt: Date;
  }>;
}): TournamentCancellationRecord => ({
  id: cancellation.id,
  tournamentId: cancellation.tournamentId,
  reason: cancellation.reason,
  idempotencyKey: cancellation.idempotencyKey,
  cancelledAt: cancellation.cancelledAt.toISOString(),
  refunds: cancellation.refunds
    .map(refund => ({
      id: refund.id,
      cancellationId: refund.cancellationId,
      tournamentId: refund.tournamentId,
      entryId: refund.entryId,
      userId: refund.userId,
      amount: toSafeNumber(refund.amount),
      ledgerEntryId: refund.ledgerEntryId ?? undefined,
      idempotencyKey: refund.idempotencyKey,
      createdAt: refund.createdAt.toISOString()
    }))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
});

const toSafeNumber = (value: bigint): number => {
  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue)) {
    throw new Error(`Database money value exceeds safe integer range: ${value.toString()}`);
  }
  return numberValue;
};

const assertText = (value: string, field: string) => {
  if (!value || typeof value !== 'string') throw new Error(`${field} is required`);
};
