import { describe, expect, it } from 'vitest';
import { MemoryAiEventService } from '../aiEventService';
import { AI_FEATURE_VERSION, MemoryAiFeatureService, buildAiFeatureProfile } from '../aiFeatureService';

describe('ai feature service', () => {
  it('builds deterministic feature profiles from event order and context', () => {
    const profile = buildAiFeatureProfile([
      {
        id: '3',
        userId: 'user_1',
        category: 'game',
        name: 'round_started',
        context: { gameId: 'roulette', stake: 1500 },
        createdAt: '2026-06-19T10:03:00.000Z'
      },
      {
        id: '1',
        userId: 'user_1',
        category: 'page',
        name: 'tab_viewed',
        context: { tab: 'home' },
        createdAt: '2026-06-19T10:00:00.000Z'
      },
      {
        id: '2',
        userId: 'user_1',
        category: 'game',
        name: 'game_clicked',
        context: { route: 'roulette' },
        createdAt: '2026-06-19T10:01:00.000Z'
      }
    ]);

    expect(profile.totals).toMatchObject({
      events: 3,
      pageViews: 1,
      gameClicks: 1,
      roundsStarted: 1
    });
    expect(profile.gameSignals).toMatchObject({
      favoriteGameId: 'roulette',
      favoriteRoute: 'roulette',
      totalStake: 1500,
      averageStake: 1500,
      maxStake: 1500
    });
    expect(profile.riskSignals.highStakeRounds).toBe(1);
    expect(profile.engagement.recentTabs).toEqual(['home']);
  });

  it('stores versioned snapshots from recent events', async () => {
    const eventService = new MemoryAiEventService();
    const featureService = new MemoryAiFeatureService(eventService);

    eventService.track({ userId: 'user_1', category: 'page', name: 'tab_viewed', context: { tab: 'games' } });
    eventService.track({ userId: 'user_1', category: 'bonus', name: 'bonus_claimed', context: { campaignId: 'welcome', amount: 500 } });

    const snapshot = await featureService.refresh({ userId: 'user_1' });
    const latest = featureService.latest({ userId: 'user_1' });

    expect(snapshot.version).toBe(AI_FEATURE_VERSION);
    expect(snapshot.sourceEventCount).toBe(2);
    expect(snapshot.features.bonusSignals.totalClaimed).toBe(500);
    expect(latest?.id).toBe(snapshot.id);
  });
});
