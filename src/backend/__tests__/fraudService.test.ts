import { describe, expect, it } from 'vitest';
import { AiFeatureSnapshotRecord } from '../aiFeatureService';
import { buildFraudScore, FRAUD_SCORE_VERSION, MemoryFraudService } from '../fraudService';

const snapshot: AiFeatureSnapshotRecord = {
  id: 'snapshot_1',
  userId: 'user_1',
  version: 'behavior-v1',
  sourceEventCount: 5,
  createdAt: new Date().toISOString(),
  features: {
    totals: { events: 5, pageViews: 1, gameClicks: 1, roundsStarted: 3, bonusClaims: 2, adminViews: 0 },
    categoryCounts: { game: 3, bonus: 2 },
    gameSignals: {
      gameClicksByRoute: { roulette: 1 },
      roundsByGameId: { roulette: 3 },
      totalStake: 4500,
      averageStake: 1500,
      maxStake: 1500
    },
    engagement: { activeSpanMinutes: 5, recentTabs: ['roulette'] },
    bonusSignals: { claims: 2, totalClaimed: 600 },
    riskSignals: { highStakeRounds: 3, highStakeRatio: 1, manualRiskEvents: 0 }
  }
};

describe('fraud service', () => {
  it('scores payment, device, geo, and bonus abuse signals', () => {
    const score = buildFraudScore({
      id: 'fraud_1',
      userId: 'user_1',
      snapshot,
      aiEvents: [
        { id: 'e1', userId: 'user_1', category: 'wallet', name: 'deposit_attempt', context: { paymentInstrumentHash: 'a', deviceId: 'd1', country: 'DE' }, createdAt: new Date().toISOString() },
        { id: 'e2', userId: 'user_1', category: 'wallet', name: 'deposit_attempt', context: { paymentInstrumentHash: 'b', deviceId: 'd2', country: 'DE' }, createdAt: new Date().toISOString() },
        { id: 'e3', userId: 'user_1', category: 'wallet', name: 'deposit_attempt', context: { paymentInstrumentHash: 'c', deviceId: 'd3', country: 'FR' }, createdAt: new Date().toISOString() }
      ],
      riskEvents: [{ id: 'r1', userId: 'user_1', type: 'high_stake_round', severity: 'medium', status: 'open', score: 15, createdAt: new Date().toISOString() }],
      bonusClaims: [
        { id: 'b1', userId: 'user_1', campaignId: 'welcome-match-500', amount: 500, status: 'claimed', claimKey: 'once', idempotencyKey: 'b1', createdAt: new Date().toISOString() },
        { id: 'b2', userId: 'user_1', campaignId: 'daily-free-credits-100', amount: 100, status: 'claimed', claimKey: 'today', idempotencyKey: 'b2', createdAt: new Date().toISOString() }
      ]
    });

    expect(score.version).toBe(FRAUD_SCORE_VERSION);
    expect(score.band).toBe('critical');
    expect(score.reasonCodes).toEqual(expect.arrayContaining([
      'payment_velocity',
      'payment_instrument_switching',
      'device_switching',
      'geo_mismatch',
      'bonus_abuse_candidate'
    ]));
  });

  it('stores fraud history newest first', () => {
    const service = new MemoryFraudService();

    const first = service.score({ userId: 'user_1' });
    const second = service.score({ userId: 'user_1', snapshot });

    expect(service.latest({ userId: 'user_1' })?.id).toBe(second.id);
    expect(service.list({ userId: 'user_1' }).map(score => score.id)).toEqual([second.id, first.id]);
  });
});
