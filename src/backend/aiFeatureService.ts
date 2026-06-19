import { Prisma, PrismaClient } from '@prisma/client';
import { AiEventRecord, AiEventService } from './aiEventService';

export const AI_FEATURE_VERSION = 'behavior-v1';

export interface AiFeatureSnapshotRecord {
  id: string;
  userId: string;
  version: string;
  sourceEventCount: number;
  features: AiFeatureProfile;
  windowStartedAt?: string;
  windowEndedAt?: string;
  createdAt: string;
}

export interface AiFeatureProfile {
  totals: {
    events: number;
    pageViews: number;
    gameClicks: number;
    roundsStarted: number;
    bonusClaims: number;
    adminViews: number;
  };
  categoryCounts: Record<string, number>;
  gameSignals: {
    favoriteGameId?: string;
    favoriteRoute?: string;
    gameClicksByRoute: Record<string, number>;
    roundsByGameId: Record<string, number>;
    totalStake: number;
    averageStake: number;
    maxStake: number;
  };
  engagement: {
    firstEventAt?: string;
    lastEventAt?: string;
    activeSpanMinutes: number;
    recentTabs: string[];
  };
  bonusSignals: {
    claims: number;
    totalClaimed: number;
    lastCampaignId?: string;
  };
  riskSignals: {
    highStakeRounds: number;
    highStakeRatio: number;
    manualRiskEvents: number;
  };
}

export interface RefreshAiFeatureSnapshotInput {
  userId: string;
  since?: string;
  until?: string;
  limit?: number;
}

export interface AiFeatureService {
  refresh(input: RefreshAiFeatureSnapshotInput): Promise<AiFeatureSnapshotRecord> | AiFeatureSnapshotRecord;
  latest(input: { userId: string }): Promise<AiFeatureSnapshotRecord | undefined> | AiFeatureSnapshotRecord | undefined;
}

export class MemoryAiFeatureService implements AiFeatureService {
  private snapshots: AiFeatureSnapshotRecord[] = [];
  private sequence = 0;

  constructor(private readonly aiEventService: AiEventService) {}

  async refresh(input: RefreshAiFeatureSnapshotInput): Promise<AiFeatureSnapshotRecord> {
    validateRefreshInput(input);
    const events = await this.aiEventService.list({
      userId: input.userId,
      since: input.since,
      until: input.until,
      limit: input.limit ?? 250
    });
    const snapshot = buildSnapshot({
      id: `ai_feature_${(++this.sequence).toString().padStart(8, '0')}`,
      userId: input.userId,
      events
    });
    this.snapshots.unshift(snapshot);
    return snapshot;
  }

  latest(input: { userId: string }): AiFeatureSnapshotRecord | undefined {
    assertText(input.userId, 'userId');
    return this.snapshots.find(snapshot => snapshot.userId === input.userId);
  }
}

export class PrismaAiFeatureService implements AiFeatureService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly aiEventService: AiEventService
  ) {}

  async refresh(input: RefreshAiFeatureSnapshotInput): Promise<AiFeatureSnapshotRecord> {
    validateRefreshInput(input);
    const events = await this.aiEventService.list({
      userId: input.userId,
      since: input.since,
      until: input.until,
      limit: input.limit ?? 250
    });
    const draft = buildSnapshot({ id: '', userId: input.userId, events });
    const snapshot = await this.prisma.aiFeatureSnapshot.create({
      data: {
        userId: draft.userId,
        version: draft.version,
        sourceEventCount: draft.sourceEventCount,
        features: toInputJsonObject(draft.features),
        windowStartedAt: draft.windowStartedAt ? new Date(draft.windowStartedAt) : undefined,
        windowEndedAt: draft.windowEndedAt ? new Date(draft.windowEndedAt) : undefined
      }
    });
    return aiFeatureSnapshotToRecord(snapshot);
  }

  async latest(input: { userId: string }): Promise<AiFeatureSnapshotRecord | undefined> {
    assertText(input.userId, 'userId');
    const snapshot = await this.prisma.aiFeatureSnapshot.findFirst({
      where: { userId: input.userId },
      orderBy: { createdAt: 'desc' }
    });
    return snapshot ? aiFeatureSnapshotToRecord(snapshot) : undefined;
  }
}

export const buildAiFeatureProfile = (events: AiEventRecord[]): AiFeatureProfile => {
  const sorted = [...events].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  const categoryCounts: Record<string, number> = {};
  const gameClicksByRoute: Record<string, number> = {};
  const roundsByGameId: Record<string, number> = {};
  const recentTabs: string[] = [];
  let totalStake = 0;
  let maxStake = 0;
  let bonusTotal = 0;
  let lastCampaignId: string | undefined;
  let highStakeRounds = 0;
  let manualRiskEvents = 0;

  for (const event of sorted) {
    categoryCounts[event.category] = (categoryCounts[event.category] ?? 0) + 1;
    if (event.category === 'page' && event.name === 'tab_viewed') {
      const tab = readString(event.context?.tab);
      if (tab) recentTabs.push(tab);
    }
    if (event.category === 'game' && event.name === 'game_clicked') {
      const route = readString(event.context?.route);
      if (route) gameClicksByRoute[route] = (gameClicksByRoute[route] ?? 0) + 1;
    }
    if (event.category === 'game' && event.name === 'round_started') {
      const gameId = readString(event.context?.gameId);
      const stake = readNumber(event.context?.stake);
      if (gameId) roundsByGameId[gameId] = (roundsByGameId[gameId] ?? 0) + 1;
      if (stake > 0) {
        totalStake += stake;
        maxStake = Math.max(maxStake, stake);
        if (stake >= 1000) highStakeRounds += 1;
      }
    }
    if (event.category === 'bonus' && event.name === 'bonus_claimed') {
      bonusTotal += readNumber(event.context?.amount);
      lastCampaignId = readString(event.context?.campaignId) ?? lastCampaignId;
    }
    if (event.category === 'risk') manualRiskEvents += 1;
  }

  const roundsStarted = countEvents(sorted, 'game', 'round_started');
  const firstEventAt = sorted[0]?.createdAt;
  const lastEventAt = sorted.at(-1)?.createdAt;

  return {
    totals: {
      events: sorted.length,
      pageViews: countEvents(sorted, 'page', 'tab_viewed'),
      gameClicks: countEvents(sorted, 'game', 'game_clicked'),
      roundsStarted,
      bonusClaims: countEvents(sorted, 'bonus', 'bonus_claimed'),
      adminViews: countEvents(sorted, 'admin', 'admin_summary_viewed')
    },
    categoryCounts,
    gameSignals: {
      favoriteGameId: mostFrequentKey(roundsByGameId),
      favoriteRoute: mostFrequentKey(gameClicksByRoute),
      gameClicksByRoute,
      roundsByGameId,
      totalStake,
      averageStake: roundsStarted ? roundCurrency(totalStake / roundsStarted) : 0,
      maxStake
    },
    engagement: {
      firstEventAt,
      lastEventAt,
      activeSpanMinutes: firstEventAt && lastEventAt
        ? Math.max(0, Math.round((new Date(lastEventAt).getTime() - new Date(firstEventAt).getTime()) / 60000))
        : 0,
      recentTabs: recentTabs.slice(-5).reverse()
    },
    bonusSignals: {
      claims: countEvents(sorted, 'bonus', 'bonus_claimed'),
      totalClaimed: bonusTotal,
      lastCampaignId
    },
    riskSignals: {
      highStakeRounds,
      highStakeRatio: roundsStarted ? roundCurrency(highStakeRounds / roundsStarted) : 0,
      manualRiskEvents
    }
  };
};

const buildSnapshot = (input: {
  id: string;
  userId: string;
  events: AiEventRecord[];
}): AiFeatureSnapshotRecord => {
  const sorted = [...input.events].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  return {
    id: input.id,
    userId: input.userId,
    version: AI_FEATURE_VERSION,
    sourceEventCount: sorted.length,
    features: buildAiFeatureProfile(sorted),
    windowStartedAt: sorted[0]?.createdAt,
    windowEndedAt: sorted.at(-1)?.createdAt,
    createdAt: new Date().toISOString()
  };
};

const validateRefreshInput = (input: RefreshAiFeatureSnapshotInput) => {
  assertText(input.userId, 'userId');
};

const assertText = (value: string, field: string) => {
  if (!value || typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
};

const countEvents = (events: AiEventRecord[], category: string, name: string) =>
  events.filter(event => event.category === category && event.name === name).length;

const mostFrequentKey = (counts: Record<string, number>) =>
  Object.entries(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];

const readString = (value: unknown) => typeof value === 'string' && value.trim() ? value : undefined;

const readNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

const toInputJsonObject = (value: AiFeatureProfile): Prisma.InputJsonObject =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;

const aiFeatureSnapshotToRecord = (snapshot: {
  id: string;
  userId: string;
  version: string;
  sourceEventCount: number;
  features: Prisma.JsonValue;
  windowStartedAt: Date | null;
  windowEndedAt: Date | null;
  createdAt: Date;
}): AiFeatureSnapshotRecord => ({
  id: snapshot.id,
  userId: snapshot.userId,
  version: snapshot.version,
  sourceEventCount: snapshot.sourceEventCount,
  features: snapshot.features as unknown as AiFeatureProfile,
  windowStartedAt: snapshot.windowStartedAt?.toISOString(),
  windowEndedAt: snapshot.windowEndedAt?.toISOString(),
  createdAt: snapshot.createdAt.toISOString()
});
