import { describe, expect, it } from 'vitest';
import { asMoney } from '../../domain/money';
import { AiFeatureSnapshotRecord } from '../aiFeatureService';
import { GameRoundRecord } from '../casinoService';
import { MemoryResponsiblePlayService, RESPONSIBLE_PLAY_VERSION, buildResponsiblePlayIntervention } from '../responsiblePlayService';

const snapshot = (overrides: Partial<AiFeatureSnapshotRecord['features']> = {}): AiFeatureSnapshotRecord => ({
  id: 'snapshot_1',
  userId: 'user_1',
  version: 'behavior-v1',
  sourceEventCount: 8,
  createdAt: new Date().toISOString(),
  features: {
    totals: { events: 8, pageViews: 1, gameClicks: 1, roundsStarted: 6, bonusClaims: 0, adminViews: 0 },
    categoryCounts: { game: 6, page: 1, risk: 1 },
    gameSignals: {
      gameClicksByRoute: { roulette: 1 },
      roundsByGameId: { roulette: 6 },
      totalStake: 900,
      averageStake: 150,
      maxStake: 300
    },
    engagement: {
      firstEventAt: new Date(Date.now() - 130 * 60 * 1000).toISOString(),
      lastEventAt: new Date().toISOString(),
      activeSpanMinutes: 130,
      recentTabs: ['roulette']
    },
    bonusSignals: { claims: 0, totalClaimed: 0 },
    riskSignals: { highStakeRounds: 0, highStakeRatio: 0, manualRiskEvents: 1 },
    ...overrides
  }
});

const round = (id: string, stake: number, payout: number, createdAt = new Date().toISOString()): GameRoundRecord => ({
  id,
  userId: 'user_1',
  gameId: 'roulette',
  stake: asMoney(stake),
  status: 'settled',
  payout: asMoney(payout),
  lockIdempotencyKey: `lock_${id}`,
  settlementIdempotencyKey: `settle_${id}`,
  createdAt,
  settledAt: createdAt
});

describe('responsible play service', () => {
  it('returns no intervention for healthy play', () => {
    const decision = buildResponsiblePlayIntervention({
      id: 'rp_1',
      userId: 'user_1',
      triggerGameId: 'slots',
      triggerStake: 25,
      snapshot: snapshot({
        totals: { events: 4, pageViews: 1, gameClicks: 1, roundsStarted: 2, bonusClaims: 0, adminViews: 0 },
        gameSignals: {
          gameClicksByRoute: { slots: 1 },
          roundsByGameId: { slots: 2 },
          totalStake: 50,
          averageStake: 25,
          maxStake: 25
        },
        engagement: { activeSpanMinutes: 10, recentTabs: ['slots'] },
        riskSignals: { highStakeRounds: 0, highStakeRatio: 0, manualRiskEvents: 0 }
      })
    });

    expect(decision.version).toBe(RESPONSIBLE_PLAY_VERSION);
    expect(decision.level).toBe('none');
    expect(decision.reasonCodes).toContain('healthy_play_pattern');
  });

  it('requires acknowledgement for chase and escalation patterns', () => {
    const decision = buildResponsiblePlayIntervention({
      id: 'rp_2',
      userId: 'user_1',
      triggerGameId: 'roulette',
      triggerStake: 600,
      snapshot: snapshot(),
      recentRounds: [
        round('r3', 300, 0),
        round('r2', 200, 0),
        round('r1', 100, 0)
      ]
    });

    expect(decision.level).toBe('cooldown');
    expect(decision.requiresAcknowledgement).toBe(true);
    expect(decision.reasonCodes).toEqual(expect.arrayContaining(['long_session', 'bet_escalation', 'chase_behavior']));
    expect(decision.recommendedActions).toContain('surface_limits');
  });

  it('stores newest decisions first', () => {
    const service = new MemoryResponsiblePlayService();

    const first = service.evaluate({ userId: 'user_1', triggerStake: 25 });
    const second = service.evaluate({ userId: 'user_1', triggerStake: 5000 });

    expect(service.latest({ userId: 'user_1' })?.id).toBe(second.id);
    expect(service.list({ userId: 'user_1' }).map(decision => decision.id)).toEqual([second.id, first.id]);
  });
});
