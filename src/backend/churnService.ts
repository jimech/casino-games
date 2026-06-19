import { Prisma, PrismaClient } from '@prisma/client';
import { AiFeatureSnapshotRecord } from './aiFeatureService';

export const CHURN_SCORE_VERSION = 'churn-v1';
export type ChurnRiskBand = 'low' | 'medium' | 'high' | 'critical';

export interface ChurnScoreRecord {
  id: string;
  userId: string;
  version: string;
  score: number;
  band: ChurnRiskBand;
  reasonCodes: string[];
  recommendedActions: string[];
  sourceFeatureSnapshotId?: string;
  sourceFeatureVersion?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface ChurnService {
  score(input: { userId: string; snapshot?: AiFeatureSnapshotRecord }): Promise<ChurnScoreRecord> | ChurnScoreRecord;
  latest(input: { userId: string }): Promise<ChurnScoreRecord | undefined> | ChurnScoreRecord | undefined;
  list(input?: { userId?: string; band?: ChurnRiskBand; limit?: number }): Promise<ChurnScoreRecord[]> | ChurnScoreRecord[];
}

export class MemoryChurnService implements ChurnService {
  private scores: ChurnScoreRecord[] = [];
  private sequence = 0;

  score(input: { userId: string; snapshot?: AiFeatureSnapshotRecord }): ChurnScoreRecord {
    assertText(input.userId, 'userId');
    const draft = buildChurnScore({ id: `churn_${(++this.sequence).toString().padStart(8, '0')}`, ...input });
    this.scores.unshift(draft);
    return draft;
  }

  latest(input: { userId: string }): ChurnScoreRecord | undefined {
    assertText(input.userId, 'userId');
    return this.scores.find(score => score.userId === input.userId);
  }

  list(input: { userId?: string; band?: ChurnRiskBand; limit?: number } = {}): ChurnScoreRecord[] {
    return this.scores
      .filter(score => !input.userId || score.userId === input.userId)
      .filter(score => !input.band || score.band === input.band)
      .slice(0, normalizeLimit(input.limit));
  }
}

export class PrismaChurnService implements ChurnService {
  constructor(private readonly prisma: PrismaClient) {}

  async score(input: { userId: string; snapshot?: AiFeatureSnapshotRecord }): Promise<ChurnScoreRecord> {
    assertText(input.userId, 'userId');
    const draft = buildChurnScore({ id: '', ...input });
    const score = await this.prisma.churnScore.create({
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
    return churnScoreToRecord(score);
  }

  async latest(input: { userId: string }): Promise<ChurnScoreRecord | undefined> {
    assertText(input.userId, 'userId');
    const score = await this.prisma.churnScore.findFirst({
      where: { userId: input.userId },
      orderBy: { createdAt: 'desc' }
    });
    return score ? churnScoreToRecord(score) : undefined;
  }

  async list(input: { userId?: string; band?: ChurnRiskBand; limit?: number } = {}): Promise<ChurnScoreRecord[]> {
    const scores = await this.prisma.churnScore.findMany({
      where: {
        userId: input.userId,
        band: input.band
      },
      orderBy: { createdAt: 'desc' },
      take: normalizeLimit(input.limit)
    });
    return scores.map(churnScoreToRecord);
  }
}

export const buildChurnScore = (input: {
  id: string;
  userId: string;
  snapshot?: AiFeatureSnapshotRecord;
}): ChurnScoreRecord => {
  const reasonCodes: string[] = [];
  const recommendedActions: string[] = [];
  let score = 0;

  if (!input.snapshot || input.snapshot.sourceEventCount === 0) {
    score += 85;
    reasonCodes.push('no_recent_profile');
    recommendedActions.push('show_reactivation_offer');
    recommendedActions.push('request_profile_refresh');
    return finalizeScore(input, score, reasonCodes, recommendedActions, { inactivityDays: null });
  }

  const features = input.snapshot.features;
  const inactivityDays = resolveInactivityDays(features.engagement.lastEventAt);
  if (inactivityDays >= 14) {
    score += 55;
    reasonCodes.push('inactive_14_days');
  } else if (inactivityDays >= 7) {
    score += 35;
    reasonCodes.push('inactive_7_days');
  } else if (inactivityDays >= 3) {
    score += 20;
    reasonCodes.push('inactive_3_days');
  }

  if (features.totals.roundsStarted === 0) {
    score += 20;
    reasonCodes.push('no_rounds_started');
  }
  if (features.totals.gameClicks === 0) {
    score += 10;
    reasonCodes.push('no_game_clicks');
  }
  if (features.totals.pageViews <= 1) {
    score += 10;
    reasonCodes.push('low_page_depth');
  }
  if (input.snapshot.sourceEventCount < 3) {
    score += 15;
    reasonCodes.push('thin_behavior_history');
  }
  if (features.engagement.activeSpanMinutes < 2) {
    score += 10;
    reasonCodes.push('short_session_span');
  }
  if (features.bonusSignals.claims > 0 && features.totals.roundsStarted === 0) {
    score += 15;
    reasonCodes.push('bonus_without_play');
  }

  if (score >= 70) {
    recommendedActions.push('surface_for_retention_review');
    recommendedActions.push('show_reactivation_offer');
  } else if (score >= 40) {
    recommendedActions.push('show_retention_offer');
  } else {
    recommendedActions.push('monitor');
  }

  return finalizeScore(input, score, reasonCodes, recommendedActions, {
    inactivityDays,
    sourceEventCount: input.snapshot.sourceEventCount,
    roundsStarted: features.totals.roundsStarted,
    gameClicks: features.totals.gameClicks,
    activeSpanMinutes: features.engagement.activeSpanMinutes
  });
};

const finalizeScore = (
  input: { id: string; userId: string; snapshot?: AiFeatureSnapshotRecord },
  score: number,
  reasonCodes: string[],
  recommendedActions: string[],
  details: Record<string, unknown>
): ChurnScoreRecord => {
  const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
  return {
    id: input.id,
    userId: input.userId,
    version: CHURN_SCORE_VERSION,
    score: boundedScore,
    band: scoreToBand(boundedScore),
    reasonCodes: reasonCodes.length ? reasonCodes : ['healthy_engagement'],
    recommendedActions,
    sourceFeatureSnapshotId: input.snapshot?.id,
    sourceFeatureVersion: input.snapshot?.version,
    details,
    createdAt: new Date().toISOString()
  };
};

const scoreToBand = (score: number): ChurnRiskBand => {
  if (score >= 85) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
};

const resolveInactivityDays = (lastEventAt?: string) => {
  if (!lastEventAt) return 999;
  return Math.max(0, (Date.now() - new Date(lastEventAt).getTime()) / (24 * 60 * 60 * 1000));
};

const normalizeLimit = (limit?: number) => {
  if (!Number.isFinite(limit ?? 50)) return 50;
  return Math.max(1, Math.min(250, Math.floor(limit ?? 50)));
};

const assertText = (value: string, field: string) => {
  if (!value || typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
};

const churnScoreToRecord = (score: {
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
}): ChurnScoreRecord => ({
  id: score.id,
  userId: score.userId,
  version: score.version,
  score: score.score,
  band: score.band as ChurnRiskBand,
  reasonCodes: score.reasonCodes,
  recommendedActions: score.recommendedActions,
  sourceFeatureSnapshotId: score.sourceFeatureSnapshotId ?? undefined,
  sourceFeatureVersion: score.sourceFeatureVersion ?? undefined,
  details: isRecord(score.details) ? score.details : undefined,
  createdAt: score.createdAt.toISOString()
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

