import { describe, expect, it } from 'vitest';
import { AiFeatureSnapshotRecord } from '../aiFeatureService';
import { DeterministicGameRecommendationService, RecommendationGame } from '../gameRecommendationService';

const games: RecommendationGame[] = [
  { id: 'slots-low', title: 'Low Slots', category: 'slots', provider: 'A', rtp: '96.0%', volatility: 'Low' },
  { id: 'roulette-royal', title: 'Roulette Royale', category: 'roulette', provider: 'B', rtp: '97.3%', volatility: 'High' },
  { id: 'blackjack-pro', title: 'Blackjack Pro', category: 'blackjack', provider: 'C', rtp: '99.5%', volatility: 'Medium' }
];

describe('game recommendation service', () => {
  it('uses fallback ranking without a profile', () => {
    const service = new DeterministicGameRecommendationService();

    const result = service.rank({ games, limit: 2 });

    expect(result.source).toBe('fallback');
    expect(result.recommendations).toHaveLength(2);
    expect(result.recommendations[0]).toMatchObject({
      gameId: 'blackjack-pro',
      rank: 1
    });
    expect(result.recommendations[0].reasons).toContain('fallback_rtp');
  });

  it('boosts games from deterministic behavior signals', () => {
    const service = new DeterministicGameRecommendationService();
    const snapshot: AiFeatureSnapshotRecord = {
      id: 'snapshot_1',
      userId: 'user_1',
      version: 'behavior-v1',
      sourceEventCount: 4,
      createdAt: '2026-06-19T10:00:00.000Z',
      features: {
        totals: { events: 4, pageViews: 1, gameClicks: 1, roundsStarted: 2, bonusClaims: 0, adminViews: 0 },
        categoryCounts: { game: 3, page: 1 },
        gameSignals: {
          favoriteGameId: 'roulette',
          favoriteRoute: 'roulette',
          gameClicksByRoute: { roulette: 1 },
          roundsByGameId: { roulette: 2 },
          totalStake: 3000,
          averageStake: 1500,
          maxStake: 1500
        },
        engagement: {
          activeSpanMinutes: 5,
          recentTabs: ['roulette']
        },
        bonusSignals: { claims: 0, totalClaimed: 0 },
        riskSignals: { highStakeRounds: 2, highStakeRatio: 1, manualRiskEvents: 0 }
      }
    };

    const result = service.rank({ games, snapshot });

    expect(result.source).toBe('profile');
    expect(result.recommendations[0].gameId).toBe('roulette-royal');
    expect(result.recommendations[0].reasons).toEqual(expect.arrayContaining([
      'favorite_game',
      'favorite_category',
      'volatility_high_match'
    ]));
  });
});
