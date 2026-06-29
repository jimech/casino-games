import { Prisma, PrismaClient } from '@prisma/client';
import { AiFeatureSnapshotRecord } from './aiFeatureService';
import { GameRoundRecord } from './casinoService';
import { RiskEventRecord } from './riskService';

export const RESPONSIBLE_PLAY_VERSION = 'responsible-play-v1';
export type ResponsiblePlayLevel = 'none' | 'notice' | 'warning' | 'cooldown';

export interface ResponsiblePlayInterventionRecord {
  id: string;
  userId: string;
  version: string;
  level: ResponsiblePlayLevel;
  score: number;
  reasonCodes: string[];
  recommendedActions: string[];
  message: string;
  requiresAcknowledgement: boolean;
  acknowledgedAt?: string;
  triggerGameId?: string;
  triggerStake?: number;
  sourceFeatureSnapshotId?: string;
  sourceFeatureVersion?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface ResponsiblePlayService {
  evaluate(input: {
    userId: string;
    triggerGameId?: string;
    triggerStake?: number;
    snapshot?: AiFeatureSnapshotRecord;
    recentRounds?: GameRoundRecord[];
    riskEvents?: RiskEventRecord[];
  }): Promise<ResponsiblePlayInterventionRecord> | ResponsiblePlayInterventionRecord;
  latest(input: { userId: string }): Promise<ResponsiblePlayInterventionRecord | undefined> | ResponsiblePlayInterventionRecord | undefined;
  list(input?: { userId?: string; level?: ResponsiblePlayLevel; limit?: number }): Promise<ResponsiblePlayInterventionRecord[]> | ResponsiblePlayInterventionRecord[];
  acknowledge(input: { userId: string; interventionId: string }): Promise<ResponsiblePlayInterventionRecord> | ResponsiblePlayInterventionRecord;
}

export class MemoryResponsiblePlayService implements ResponsiblePlayService {
  private interventions: ResponsiblePlayInterventionRecord[] = [];
  private sequence = 0;

  evaluate(input: {
    userId: string;
    triggerGameId?: string;
    triggerStake?: number;
    snapshot?: AiFeatureSnapshotRecord;
    recentRounds?: GameRoundRecord[];
    riskEvents?: RiskEventRecord[];
  }): ResponsiblePlayInterventionRecord {
    assertText(input.userId, 'userId');
    const intervention = buildResponsiblePlayIntervention({
      id: `rp_${(++this.sequence).toString().padStart(8, '0')}`,
      ...input
    });
    this.interventions.unshift(intervention);
    return intervention;
  }

  latest(input: { userId: string }): ResponsiblePlayInterventionRecord | undefined {
    assertText(input.userId, 'userId');
    return this.interventions.find(intervention => intervention.userId === input.userId);
  }

  list(input: { userId?: string; level?: ResponsiblePlayLevel; limit?: number } = {}): ResponsiblePlayInterventionRecord[] {
    return this.interventions
      .filter(intervention => !input.userId || intervention.userId === input.userId)
      .filter(intervention => !input.level || intervention.level === input.level)
      .slice(0, normalizeLimit(input.limit));
  }

  acknowledge(input: { userId: string; interventionId: string }): ResponsiblePlayInterventionRecord {
    assertText(input.userId, 'userId');
    assertText(input.interventionId, 'interventionId');
    const intervention = this.interventions.find(item => item.id === input.interventionId && item.userId === input.userId);
    if (!intervention) throw new Error('Responsible play intervention not found');
    if (!intervention.requiresAcknowledgement) throw new Error('Responsible play acknowledgement is not required');
    intervention.acknowledgedAt = new Date().toISOString();
    return intervention;
  }
}

export class PrismaResponsiblePlayService implements ResponsiblePlayService {
  constructor(private readonly prisma: PrismaClient) {}

  async evaluate(input: {
    userId: string;
    triggerGameId?: string;
    triggerStake?: number;
    snapshot?: AiFeatureSnapshotRecord;
    recentRounds?: GameRoundRecord[];
    riskEvents?: RiskEventRecord[];
  }): Promise<ResponsiblePlayInterventionRecord> {
    assertText(input.userId, 'userId');
    const draft = buildResponsiblePlayIntervention({ id: '', ...input });
    const intervention = await this.prisma.responsiblePlayIntervention.create({
      data: {
        userId: draft.userId,
        version: draft.version,
        level: draft.level,
        score: draft.score,
        reasonCodes: draft.reasonCodes,
        recommendedActions: draft.recommendedActions,
        message: draft.message,
        requiresAcknowledgement: draft.requiresAcknowledgement,
        triggerGameId: draft.triggerGameId,
        triggerStake: draft.triggerStake,
        sourceFeatureSnapshotId: draft.sourceFeatureSnapshotId,
        sourceFeatureVersion: draft.sourceFeatureVersion,
        details: draft.details as Prisma.InputJsonObject | undefined
      }
    });
    return responsiblePlayInterventionToRecord(intervention);
  }

  async latest(input: { userId: string }): Promise<ResponsiblePlayInterventionRecord | undefined> {
    assertText(input.userId, 'userId');
    const intervention = await this.prisma.responsiblePlayIntervention.findFirst({
      where: { userId: input.userId },
      orderBy: { createdAt: 'desc' }
    });
    return intervention ? responsiblePlayInterventionToRecord(intervention) : undefined;
  }

  async list(input: { userId?: string; level?: ResponsiblePlayLevel; limit?: number } = {}): Promise<ResponsiblePlayInterventionRecord[]> {
    const interventions = await this.prisma.responsiblePlayIntervention.findMany({
      where: {
        userId: input.userId,
        level: input.level
      },
      orderBy: { createdAt: 'desc' },
      take: normalizeLimit(input.limit)
    });
    return interventions.map(responsiblePlayInterventionToRecord);
  }

  async acknowledge(input: { userId: string; interventionId: string }): Promise<ResponsiblePlayInterventionRecord> {
    assertText(input.userId, 'userId');
    assertText(input.interventionId, 'interventionId');
    const intervention = await this.prisma.responsiblePlayIntervention.findFirst({
      where: { id: input.interventionId, userId: input.userId }
    });
    if (!intervention) throw new Error('Responsible play intervention not found');
    if (!intervention.requiresAcknowledgement) throw new Error('Responsible play acknowledgement is not required');
    const acknowledged = await this.prisma.responsiblePlayIntervention.update({
      where: { id: intervention.id },
      data: { acknowledgedAt: new Date() }
    });
    return responsiblePlayInterventionToRecord(acknowledged);
  }
}

export const buildResponsiblePlayIntervention = (input: {
  id: string;
  userId: string;
  triggerGameId?: string;
  triggerStake?: number;
  snapshot?: AiFeatureSnapshotRecord;
  recentRounds?: GameRoundRecord[];
  riskEvents?: RiskEventRecord[];
}): ResponsiblePlayInterventionRecord => {
  const recentRounds = [...(input.recentRounds ?? [])].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const riskEvents = input.riskEvents ?? [];
  const reasonCodes: string[] = [];
  let score = 0;

  const triggerStake = normalizeMoney(input.triggerStake);
  const activeSpanMinutes = input.snapshot?.features.engagement.activeSpanMinutes ?? 0;
  const averageStake = input.snapshot?.features.gameSignals.averageStake ?? averageRecentStake(recentRounds);
  const highStakeRatio = input.snapshot?.features.riskSignals.highStakeRatio ?? 0;
  const rapidRiskEvents = riskEvents.filter(event => event.type === 'rapid_round_activity').length;
  const roundsInFiveMinutes = countRecentRounds(recentRounds, 5 * 60 * 1000);
  const latestSettled = recentRounds.filter(round => round.status === 'settled' || round.status === 'refunded').slice(0, 5);
  const recentLosses = latestSettled.filter(round => round.payout < round.stake).length;

  if (activeSpanMinutes >= 120) {
    score += 35;
    reasonCodes.push('long_session');
  } else if (activeSpanMinutes >= 60) {
    score += 20;
    reasonCodes.push('extended_session');
  }
  if (rapidRiskEvents > 0 || roundsInFiveMinutes >= 8) {
    score += 30;
    reasonCodes.push('rapid_play');
  }
  if (triggerStake >= 500 && averageStake > 0 && triggerStake >= averageStake * 2) {
    score += 30;
    reasonCodes.push('bet_escalation');
  }
  if (recentLosses >= 3 && triggerStake >= Math.max(averageStake, 100)) {
    score += 35;
    reasonCodes.push('chase_behavior');
  }
  if (highStakeRatio >= 0.75) {
    score += 20;
    reasonCodes.push('high_stake_concentration');
  }
  if (triggerStake >= 5000) {
    score += 25;
    reasonCodes.push('self_limit_conflict');
  }

  const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
  const level = scoreToLevel(boundedScore);
  const recommendedActions = actionsForLevel(level);

  return {
    id: input.id,
    userId: input.userId,
    version: RESPONSIBLE_PLAY_VERSION,
    level,
    score: boundedScore,
    reasonCodes: reasonCodes.length ? reasonCodes : ['healthy_play_pattern'],
    recommendedActions,
    message: messageForLevel(level),
    requiresAcknowledgement: level === 'warning' || level === 'cooldown',
    triggerGameId: input.triggerGameId,
    triggerStake: triggerStake || undefined,
    sourceFeatureSnapshotId: input.snapshot?.id,
    sourceFeatureVersion: input.snapshot?.version,
    details: {
      activeSpanMinutes,
      averageStake,
      highStakeRatio,
      rapidRiskEvents,
      roundsInFiveMinutes,
      recentLosses
    },
    createdAt: new Date().toISOString()
  };
};

const scoreToLevel = (score: number): ResponsiblePlayLevel => {
  if (score >= 80) return 'cooldown';
  if (score >= 55) return 'warning';
  if (score >= 30) return 'notice';
  return 'none';
};

const actionsForLevel = (level: ResponsiblePlayLevel) => {
  if (level === 'cooldown') return ['show_cooldown_prompt', 'require_acknowledgement', 'surface_limits'];
  if (level === 'warning') return ['show_warning', 'require_acknowledgement'];
  if (level === 'notice') return ['show_notice'];
  return ['no_action'];
};

const messageForLevel = (level: ResponsiblePlayLevel) => {
  if (level === 'cooldown') return 'Play pattern suggests a cooldown check before continuing.';
  if (level === 'warning') return 'Play pattern changed quickly. Please review your pace before continuing.';
  if (level === 'notice') return 'Responsible play notice triggered from recent activity.';
  return 'No responsible play intervention needed.';
};

const countRecentRounds = (rounds: GameRoundRecord[], windowMs: number) => {
  const now = Date.now();
  return rounds.filter(round => now - new Date(round.createdAt).getTime() <= windowMs).length;
};

const averageRecentStake = (rounds: GameRoundRecord[]) => {
  if (!rounds.length) return 0;
  return rounds.reduce((total, round) => total + round.stake, 0) / rounds.length;
};

const normalizeMoney = (value?: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

const normalizeLimit = (limit?: number) => {
  if (!Number.isFinite(limit ?? 50)) return 50;
  return Math.max(1, Math.min(250, Math.floor(limit ?? 50)));
};

const assertText = (value: string, field: string) => {
  if (!value || typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
};

const responsiblePlayInterventionToRecord = (intervention: {
  id: string;
  userId: string;
  version: string;
  level: string;
  score: number;
  reasonCodes: string[];
  recommendedActions: string[];
  message: string;
  requiresAcknowledgement: boolean;
  acknowledgedAt: Date | null;
  triggerGameId: string | null;
  triggerStake: bigint | number | null;
  sourceFeatureSnapshotId: string | null;
  sourceFeatureVersion: string | null;
  details: Prisma.JsonValue | null;
  createdAt: Date;
}): ResponsiblePlayInterventionRecord => ({
  id: intervention.id,
  userId: intervention.userId,
  version: intervention.version,
  level: intervention.level as ResponsiblePlayLevel,
  score: intervention.score,
  reasonCodes: intervention.reasonCodes,
  recommendedActions: intervention.recommendedActions,
  message: intervention.message,
  requiresAcknowledgement: intervention.requiresAcknowledgement,
  acknowledgedAt: intervention.acknowledgedAt?.toISOString(),
  triggerGameId: intervention.triggerGameId ?? undefined,
  triggerStake: intervention.triggerStake === null ? undefined : Number(intervention.triggerStake),
  sourceFeatureSnapshotId: intervention.sourceFeatureSnapshotId ?? undefined,
  sourceFeatureVersion: intervention.sourceFeatureVersion ?? undefined,
  details: isRecord(intervention.details) ? intervention.details : undefined,
  createdAt: intervention.createdAt.toISOString()
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
