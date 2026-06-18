import { Prisma, PrismaClient } from '@prisma/client';
import { GameRoundRecord } from './casinoService';

export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';
export type RiskEventStatus = 'open' | 'reviewed' | 'dismissed';

export interface RiskEventRecord {
  id: string;
  userId?: string;
  type: string;
  severity: RiskSeverity;
  status: RiskEventStatus;
  score: number;
  context?: Record<string, unknown>;
  createdAt: string;
  reviewedAt?: string;
}

export interface RecordRiskEventInput {
  userId?: string;
  type: string;
  severity: RiskSeverity;
  score: number;
  context?: Record<string, unknown>;
}

export interface RiskService {
  recordEvent(input: RecordRiskEventInput): Promise<RiskEventRecord> | RiskEventRecord;
  listEvents(input?: { userId?: string; status?: RiskEventStatus; limit?: number }): Promise<RiskEventRecord[]> | RiskEventRecord[];
  assessRoundStarted(round: GameRoundRecord, recentRounds: GameRoundRecord[]): Promise<RiskEventRecord[]> | RiskEventRecord[];
  assessRoundSettled(round: GameRoundRecord): Promise<RiskEventRecord[]> | RiskEventRecord[];
}

const HIGH_STAKE_THRESHOLD = 1000;
const RAPID_ROUND_COUNT = 5;
const RAPID_ROUND_WINDOW_MS = 60_000;
const HIGH_PAYOUT_THRESHOLD = 5000;

export class MemoryRiskService implements RiskService {
  private events: RiskEventRecord[] = [];
  private sequence = 0;

  recordEvent(input: RecordRiskEventInput): RiskEventRecord {
    const event: RiskEventRecord = {
      id: `risk_${(++this.sequence).toString().padStart(8, '0')}`,
      userId: input.userId,
      type: input.type,
      severity: input.severity,
      status: 'open',
      score: input.score,
      context: input.context,
      createdAt: new Date().toISOString()
    };
    this.events.unshift(event);
    return event;
  }

  listEvents(input: { userId?: string; status?: RiskEventStatus; limit?: number } = {}): RiskEventRecord[] {
    return this.events
      .filter(event => !input.userId || event.userId === input.userId)
      .filter(event => !input.status || event.status === input.status)
      .slice(0, input.limit ?? 100);
  }

  async assessRoundStarted(round: GameRoundRecord, recentRounds: GameRoundRecord[]): Promise<RiskEventRecord[]> {
    return assessRoundStartedRules(round, recentRounds, input => this.recordEvent(input));
  }

  async assessRoundSettled(round: GameRoundRecord): Promise<RiskEventRecord[]> {
    return assessRoundSettledRules(round, input => this.recordEvent(input));
  }
}

export class PrismaRiskService implements RiskService {
  constructor(private readonly prisma: PrismaClient) {}

  async recordEvent(input: RecordRiskEventInput): Promise<RiskEventRecord> {
    const event = await this.prisma.riskEvent.create({
      data: {
        userId: input.userId,
        type: input.type,
        severity: input.severity,
        score: input.score,
        context: input.context as Prisma.InputJsonObject | undefined
      }
    });
    return riskEventToRecord(event);
  }

  async listEvents(input: { userId?: string; status?: RiskEventStatus; limit?: number } = {}): Promise<RiskEventRecord[]> {
    const events = await this.prisma.riskEvent.findMany({
      where: {
        userId: input.userId,
        status: input.status
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit ?? 100
    });
    return events.map(riskEventToRecord);
  }

  async assessRoundStarted(round: GameRoundRecord, recentRounds: GameRoundRecord[]): Promise<RiskEventRecord[]> {
    return assessRoundStartedRules(round, recentRounds, input => this.recordEvent(input));
  }

  async assessRoundSettled(round: GameRoundRecord): Promise<RiskEventRecord[]> {
    return assessRoundSettledRules(round, input => this.recordEvent(input));
  }
}

const assessRoundStartedRules = async (
  round: GameRoundRecord,
  recentRounds: GameRoundRecord[],
  record: (input: RecordRiskEventInput) => Promise<RiskEventRecord> | RiskEventRecord
): Promise<RiskEventRecord[]> => {
  const events: RiskEventRecord[] = [];
  if (round.stake >= HIGH_STAKE_THRESHOLD) {
    events.push(await record({
      userId: round.userId,
      type: 'high_stake_round',
      severity: round.stake >= HIGH_STAKE_THRESHOLD * 5 ? 'high' : 'medium',
      score: Math.min(100, Math.floor(round.stake / 100)),
      context: {
        gameId: round.gameId,
        roundId: round.id,
        stake: round.stake,
        threshold: HIGH_STAKE_THRESHOLD
      }
    }));
  }

  const roundCreatedAt = new Date(round.createdAt).getTime();
  const rapidRounds = recentRounds.filter(candidate =>
    candidate.userId === round.userId &&
    roundCreatedAt - new Date(candidate.createdAt).getTime() <= RAPID_ROUND_WINDOW_MS
  );
  if (rapidRounds.length >= RAPID_ROUND_COUNT) {
    events.push(await record({
      userId: round.userId,
      type: 'rapid_round_activity',
      severity: 'medium',
      score: Math.min(100, rapidRounds.length * 10),
      context: {
        gameId: round.gameId,
        roundId: round.id,
        roundsInWindow: rapidRounds.length,
        windowSeconds: RAPID_ROUND_WINDOW_MS / 1000
      }
    }));
  }
  return events;
};

const assessRoundSettledRules = async (
  round: GameRoundRecord,
  record: (input: RecordRiskEventInput) => Promise<RiskEventRecord> | RiskEventRecord
): Promise<RiskEventRecord[]> => {
  const events: RiskEventRecord[] = [];
  if (round.status === 'refunded') {
    events.push(await record({
      userId: round.userId,
      type: 'round_refund',
      severity: 'low',
      score: 15,
      context: {
        gameId: round.gameId,
        roundId: round.id,
        stake: round.stake
      }
    }));
  }

  if (round.payout >= HIGH_PAYOUT_THRESHOLD) {
    events.push(await record({
      userId: round.userId,
      type: 'high_payout_round',
      severity: round.payout >= HIGH_PAYOUT_THRESHOLD * 5 ? 'high' : 'medium',
      score: Math.min(100, Math.floor(round.payout / 500)),
      context: {
        gameId: round.gameId,
        roundId: round.id,
        payout: round.payout,
        stake: round.stake,
        threshold: HIGH_PAYOUT_THRESHOLD
      }
    }));
  }
  return events;
};

const riskEventToRecord = (event: {
  id: string;
  userId: string | null;
  type: string;
  severity: string;
  status: string;
  score: number;
  context: Prisma.JsonValue | null;
  createdAt: Date;
  reviewedAt: Date | null;
}): RiskEventRecord => ({
  id: event.id,
  userId: event.userId ?? undefined,
  type: event.type,
  severity: event.severity as RiskSeverity,
  status: event.status as RiskEventStatus,
  score: event.score,
  context: isRecord(event.context) ? event.context : undefined,
  createdAt: event.createdAt.toISOString(),
  reviewedAt: event.reviewedAt?.toISOString()
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
