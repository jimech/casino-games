import { Prisma, PrismaClient } from '@prisma/client';
import { AiEventRecord } from './aiEventService';
import { AiFeatureSnapshotRecord } from './aiFeatureService';
import { BonusClaimRecord } from './bonusService';
import { RiskEventRecord } from './riskService';

export const FRAUD_SCORE_VERSION = 'fraud-v1';
export type FraudRiskBand = 'low' | 'medium' | 'high' | 'critical';

export interface FraudScoreRecord {
  id: string;
  userId: string;
  version: string;
  score: number;
  band: FraudRiskBand;
  reasonCodes: string[];
  recommendedActions: string[];
  sourceFeatureSnapshotId?: string;
  sourceFeatureVersion?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface FraudService {
  score(input: {
    userId: string;
    snapshot?: AiFeatureSnapshotRecord;
    aiEvents?: AiEventRecord[];
    riskEvents?: RiskEventRecord[];
    bonusClaims?: BonusClaimRecord[];
  }): Promise<FraudScoreRecord> | FraudScoreRecord;
  latest(input: { userId: string }): Promise<FraudScoreRecord | undefined> | FraudScoreRecord | undefined;
  list(input?: { userId?: string; band?: FraudRiskBand; limit?: number }): Promise<FraudScoreRecord[]> | FraudScoreRecord[];
}

export class MemoryFraudService implements FraudService {
  private scores: FraudScoreRecord[] = [];
  private sequence = 0;

  score(input: {
    userId: string;
    snapshot?: AiFeatureSnapshotRecord;
    aiEvents?: AiEventRecord[];
    riskEvents?: RiskEventRecord[];
    bonusClaims?: BonusClaimRecord[];
  }): FraudScoreRecord {
    assertText(input.userId, 'userId');
    const score = buildFraudScore({ id: `fraud_${(++this.sequence).toString().padStart(8, '0')}`, ...input });
    this.scores.unshift(score);
    return score;
  }

  latest(input: { userId: string }): FraudScoreRecord | undefined {
    assertText(input.userId, 'userId');
    return this.scores.find(score => score.userId === input.userId);
  }

  list(input: { userId?: string; band?: FraudRiskBand; limit?: number } = {}): FraudScoreRecord[] {
    return this.scores
      .filter(score => !input.userId || score.userId === input.userId)
      .filter(score => !input.band || score.band === input.band)
      .slice(0, normalizeLimit(input.limit));
  }
}

export class PrismaFraudService implements FraudService {
  constructor(private readonly prisma: PrismaClient) {}

  async score(input: {
    userId: string;
    snapshot?: AiFeatureSnapshotRecord;
    aiEvents?: AiEventRecord[];
    riskEvents?: RiskEventRecord[];
    bonusClaims?: BonusClaimRecord[];
  }): Promise<FraudScoreRecord> {
    assertText(input.userId, 'userId');
    const draft = buildFraudScore({ id: '', ...input });
    const score = await this.prisma.fraudScore.create({
      data: {
        userId: draft.userId,
        version: draft.version,
        score: draft.score,
        band: draft.band,
        reasonCodes: draft.reasonCodes,
        recommendedActions: draft.recommendedActions,
        sourceFeatureSnapshotId: draft.sourceFeatureSnapshotId,
        sourceFeatureVersion: draft.sourceFeatureVersion,
        details: draft.details as Prisma.InputJsonObject | undefined
      }
    });
    return fraudScoreToRecord(score);
  }

  async latest(input: { userId: string }): Promise<FraudScoreRecord | undefined> {
    assertText(input.userId, 'userId');
    const score = await this.prisma.fraudScore.findFirst({
      where: { userId: input.userId },
      orderBy: { createdAt: 'desc' }
    });
    return score ? fraudScoreToRecord(score) : undefined;
  }

  async list(input: { userId?: string; band?: FraudRiskBand; limit?: number } = {}): Promise<FraudScoreRecord[]> {
    const scores = await this.prisma.fraudScore.findMany({
      where: {
        userId: input.userId,
        band: input.band
      },
      orderBy: { createdAt: 'desc' },
      take: normalizeLimit(input.limit)
    });
    return scores.map(fraudScoreToRecord);
  }
}

export const buildFraudScore = (input: {
  id: string;
  userId: string;
  snapshot?: AiFeatureSnapshotRecord;
  aiEvents?: AiEventRecord[];
  riskEvents?: RiskEventRecord[];
  bonusClaims?: BonusClaimRecord[];
}): FraudScoreRecord => {
  const aiEvents = input.aiEvents ?? [];
  const riskEvents = input.riskEvents ?? [];
  const bonusClaims = input.bonusClaims ?? [];
  const reasonCodes: string[] = [];
  const recommendedActions: string[] = [];
  let score = 0;

  const paymentEvents = aiEvents.filter(event => event.category === 'wallet' && event.name === 'deposit_attempt');
  const recentPaymentEvents = recentEvents(paymentEvents, 10 * 60 * 1000);
  const instrumentCount = distinctContextValues(recentPaymentEvents, 'paymentInstrumentHash').length;
  const deviceCount = distinctContextValues(aiEvents, 'deviceId').length;
  const countryCount = distinctContextValues(aiEvents, 'country').length;
  const failedLogins = riskEvents.filter(event => event.type === 'failed_login').length;
  const highStakeRiskEvents = riskEvents.filter(event => event.type === 'high_stake_round').length;
  const rapidRoundEvents = riskEvents.filter(event => event.type === 'rapid_round_activity').length;

  if (recentPaymentEvents.length >= 3) {
    score += 30;
    reasonCodes.push('payment_velocity');
  }
  if (instrumentCount >= 3) {
    score += 25;
    reasonCodes.push('payment_instrument_switching');
  }
  if (deviceCount >= 3) {
    score += 20;
    reasonCodes.push('device_switching');
  }
  if (countryCount >= 2) {
    score += 20;
    reasonCodes.push('geo_mismatch');
  }
  if (failedLogins >= 5) {
    score += 25;
    reasonCodes.push('account_takeover_signals');
  }
  if (bonusClaims.length >= 2 && (highStakeRiskEvents > 0 || (input.snapshot?.features.riskSignals.highStakeRounds ?? 0) > 0)) {
    score += 20;
    reasonCodes.push('bonus_abuse_candidate');
  }
  if (rapidRoundEvents > 0 || (input.snapshot?.features.totals.roundsStarted ?? 0) >= 10) {
    score += 15;
    reasonCodes.push('gameplay_velocity');
  }
  if ((input.snapshot?.features.riskSignals.highStakeRatio ?? 0) >= 0.75) {
    score += 15;
    reasonCodes.push('high_stake_concentration');
  }

  if (score >= 85) {
    recommendedActions.push('manual_review_required');
    recommendedActions.push('temporarily_limit_promotions');
  } else if (score >= 70) {
    recommendedActions.push('manual_review_required');
  } else if (score >= 40) {
    recommendedActions.push('monitor');
  } else {
    recommendedActions.push('no_action');
  }

  const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
  return {
    id: input.id,
    userId: input.userId,
    version: FRAUD_SCORE_VERSION,
    score: boundedScore,
    band: scoreToBand(boundedScore),
    reasonCodes: reasonCodes.length ? reasonCodes : ['no_anomaly_detected'],
    recommendedActions,
    sourceFeatureSnapshotId: input.snapshot?.id,
    sourceFeatureVersion: input.snapshot?.version,
    details: {
      paymentEventsIn10m: recentPaymentEvents.length,
      paymentInstrumentCount: instrumentCount,
      deviceCount,
      countryCount,
      failedLogins,
      highStakeRiskEvents,
      rapidRoundEvents,
      bonusClaimCount: bonusClaims.length
    },
    createdAt: new Date().toISOString()
  };
};

const scoreToBand = (score: number): FraudRiskBand => {
  if (score >= 85) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
};

const recentEvents = (events: AiEventRecord[], windowMs: number) => {
  const now = Date.now();
  return events.filter(event => now - new Date(event.createdAt).getTime() <= windowMs);
};

const distinctContextValues = (events: AiEventRecord[], field: string) => {
  const values = events
    .map(event => event.context?.[field])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  return [...new Set(values)];
};

const normalizeLimit = (limit?: number) => {
  if (!Number.isFinite(limit ?? 50)) return 50;
  return Math.max(1, Math.min(250, Math.floor(limit ?? 50)));
};

const assertText = (value: string, field: string) => {
  if (!value || typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
};

const fraudScoreToRecord = (score: {
  id: string;
  userId: string;
  version: string;
  score: number;
  band: string;
  reasonCodes: string[];
  recommendedActions: string[];
  sourceFeatureSnapshotId: string | null;
  sourceFeatureVersion: string | null;
  details: Prisma.JsonValue | null;
  createdAt: Date;
}): FraudScoreRecord => ({
  id: score.id,
  userId: score.userId,
  version: score.version,
  score: score.score,
  band: score.band as FraudRiskBand,
  reasonCodes: score.reasonCodes,
  recommendedActions: score.recommendedActions,
  sourceFeatureSnapshotId: score.sourceFeatureSnapshotId ?? undefined,
  sourceFeatureVersion: score.sourceFeatureVersion ?? undefined,
  details: isRecord(score.details) ? score.details : undefined,
  createdAt: score.createdAt.toISOString()
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
