import { describe, expect, it } from 'vitest';
import { AiFeatureSnapshotRecord } from '../aiFeatureService';
import { CHURN_SCORE_VERSION, MemoryChurnService, buildChurnScore } from '../churnService';

const baseSnapshot = (overrides: Partial<AiFeatureSnapshotRecord['features']> = {}): AiFeatureSnapshotRecord => ({
  id: 'snapshot_1',
  userId: 'user_1',
  version: 'behavior-v1',
  sourceEventCount: 4,
  createdAt: new Date().toISOString(),
  features: {
    totals: { events: 4, pageViews: 2, gameClicks: 1, roundsStarted: 1, bonusClaims: 0, adminViews: 0 },
    categoryCounts: { game: 2, page: 2 },
    gameSignals: {
      gameClicksByRoute: { roulette: 1 },
      roundsByGameId: { roulette: 1 },
      totalStake: 100,
      averageStake: 100,
      maxStake: 100
    },
    engagement: {
      lastEventAt: new Date().toISOString(),
      activeSpanMinutes: 8,
      recentTabs: ['roulette']
    },
    bonusSignals: { claims: 0, totalClaimed: 0 },
    riskSignals: { highStakeRounds: 0, highStakeRatio: 0, manualRiskEvents: 0 },
    ...overrides
  }
});

describe('churn service', () => {
  it('scores missing profiles as critical and explainable', () => {
    const score = buildChurnScore({ id: 'score_1', userId: 'user_1' });

    expect(score.version).toBe(CHURN_SCORE_VERSION);
    expect(score.band).toBe('critical');
    expect(score.reasonCodes).toContain('no_recent_profile');
    expect(score.recommendedActions).toContain('show_reactivation_offer');
  });

  it('scores healthy engagement as low risk', () => {
    const score = buildChurnScore({ id: 'score_1', userId: 'user_1', snapshot: baseSnapshot() });

    expect(score.band).toBe('low');
    expect(score.reasonCodes).toContain('healthy_engagement');
  });

  it('stores score history newest first', () => {
    const service = new MemoryChurnService();

    const first = service.score({ userId: 'user_1', snapshot: baseSnapshot() });
    const second = service.score({
      userId: 'user_1',
      snapshot: baseSnapshot({
        totals: { events: 1, pageViews: 1, gameClicks: 0, roundsStarted: 0, bonusClaims: 1, adminViews: 0 },
        engagement: { activeSpanMinutes: 0, recentTabs: [] },
        bonusSignals: { claims: 1, totalClaimed: 500 }
      })
    });

    expect(service.latest({ userId: 'user_1' })?.id).toBe(second.id);
    expect(service.list({ userId: 'user_1' }).map(score => score.id)).toEqual([second.id, first.id]);
  });
});
