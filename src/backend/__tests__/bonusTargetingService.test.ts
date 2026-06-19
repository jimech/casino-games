import { describe, expect, it } from 'vitest';
import { AiFeatureSnapshotRecord } from '../aiFeatureService';
import { BonusCampaignRecord } from '../bonusService';
import { DeterministicBonusTargetingService } from '../bonusTargetingService';

const campaigns: BonusCampaignRecord[] = [
  {
    id: 'welcome-match-500',
    type: 'welcome',
    title: 'Welcome Match Credits',
    amount: 500,
    active: true
  },
  {
    id: 'daily-free-credits-100',
    type: 'daily',
    title: 'Daily Free Credits',
    amount: 100,
    active: true
  }
];

const snapshot: AiFeatureSnapshotRecord = {
  id: 'snapshot_1',
  userId: 'user_1',
  version: 'behavior-v1',
  sourceEventCount: 4,
  createdAt: '2026-06-19T10:00:00.000Z',
  features: {
    totals: { events: 4, pageViews: 1, gameClicks: 1, roundsStarted: 2, bonusClaims: 1, adminViews: 0 },
    categoryCounts: { game: 3, bonus: 1 },
    gameSignals: {
      favoriteGameId: 'roulette',
      favoriteRoute: 'roulette',
      gameClicksByRoute: { roulette: 1 },
      roundsByGameId: { roulette: 2 },
      totalStake: 3000,
      averageStake: 1500,
      maxStake: 1500
    },
    engagement: { activeSpanMinutes: 3, lastEventAt: new Date().toISOString(), recentTabs: ['roulette'] },
    bonusSignals: { claims: 1, totalClaimed: 500, lastCampaignId: 'welcome-match-500' },
    riskSignals: { highStakeRounds: 2, highStakeRatio: 1, manualRiskEvents: 0 }
  }
};

describe('bonus targeting service', () => {
  it('targets retention offers from high-stake profile signals', () => {
    const service = new DeterministicBonusTargetingService();

    const result = service.target({
      campaigns,
      claims: [],
      snapshot
    });

    expect(result.source).toBe('profile');
    expect(result.offers[0]).toMatchObject({
      id: 'target-daily-retention',
      segment: 'retention'
    });
    expect(result.offers[0].reasonCodes).toContain('high_stake_activity');
  });

  it('suppresses claimed welcome and recently targeted duplicates', () => {
    const service = new DeterministicBonusTargetingService();

    const result = service.target({
      campaigns,
      claims: [{
        id: 'claim_1',
        userId: 'user_1',
        campaignId: 'welcome-match-500',
        amount: 500,
        status: 'claimed',
        claimKey: 'once',
        idempotencyKey: 'bonus-1',
        createdAt: new Date().toISOString()
      }],
      snapshot,
      recentTargetingEvents: [{
        id: 'event_1',
        userId: 'user_1',
        category: 'bonus',
        name: 'bonus_targets_generated',
        context: { offerIds: ['target-daily-retention'] },
        createdAt: new Date().toISOString()
      }]
    });

    expect(result.suppressed.find(offer => offer.id === 'target-welcome-match')?.suppressionCodes).toContain('campaign_already_claimed');
    expect(result.suppressed.find(offer => offer.id === 'target-daily-retention')?.suppressionCodes).toContain('targeting_cooldown_active');
  });
});
