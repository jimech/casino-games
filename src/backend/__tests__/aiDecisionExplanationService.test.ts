import { describe, expect, it } from 'vitest';
import { MemoryAiDecisionExplanationService, explanationsToCsv } from '../aiDecisionExplanationService';

describe('AI decision explanation service', () => {
  it('stores explanation records newest first with reason codes', () => {
    const service = new MemoryAiDecisionExplanationService();

    const first = service.record({
      userId: 'user_1',
      decisionType: 'game_recommendations',
      modelVersion: 'recommendation-v1',
      reasonCodes: ['fallback_rtp']
    });
    const second = service.record({
      userId: 'user_1',
      decisionType: 'fraud_score',
      modelVersion: 'fraud-v1',
      sourceRecordId: 'fraud_1',
      output: { score: 85, band: 'critical' },
      threshold: { critical: 85 },
      reasonCodes: ['payment_velocity']
    });

    expect(service.list({ userId: 'user_1' }).map(explanation => explanation.id)).toEqual([second.id, first.id]);
    expect(service.list({ decisionType: 'fraud_score' })[0].reasonCodes).toContain('payment_velocity');
  });

  it('exports explanations as csv for audit handoff', () => {
    const service = new MemoryAiDecisionExplanationService();
    service.record({
      userId: 'user_1',
      decisionType: 'bonus_targeting',
      modelVersion: 'bonus-targeting-v1',
      output: { offerIds: ['target-daily-retention'] },
      reasonCodes: ['high_stake_activity']
    });

    const csv = explanationsToCsv(service.list());

    expect(csv).toContain('decisionType');
    expect(csv).toContain('bonus_targeting');
    expect(csv).toContain('high_stake_activity');
  });
});
