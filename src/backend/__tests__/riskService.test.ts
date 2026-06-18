import { describe, expect, it } from 'vitest';
import { MemoryRiskService } from '../riskService';
import { GameRoundRecord } from '../casinoService';
import { asMoney } from '../../domain/money';

const round = (overrides: Partial<GameRoundRecord>): GameRoundRecord => ({
  id: 'round_1',
  userId: 'user_1',
  gameId: 'roulette',
  stake: asMoney(10),
  status: 'open',
  payout: asMoney(0),
  lockIdempotencyKey: 'lock_1',
  createdAt: new Date().toISOString(),
  ...overrides
});

describe('risk service', () => {
  it('records high-stake round events', async () => {
    const service = new MemoryRiskService();

    const events = await service.assessRoundStarted(round({ stake: asMoney(1500) }), []);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('high_stake_round');
    expect(events[0].severity).toBe('medium');
    expect(service.listEvents({ userId: 'user_1' })).toHaveLength(1);
  });

  it('records rapid round activity', async () => {
    const service = new MemoryRiskService();
    const now = new Date('2026-06-19T00:00:00.000Z');
    const recentRounds = Array.from({ length: 5 }, (_, index) => round({
      id: `round_${index}`,
      createdAt: new Date(now.getTime() - index * 5000).toISOString()
    }));

    const events = await service.assessRoundStarted(recentRounds[0], recentRounds);

    expect(events.some(event => event.type === 'rapid_round_activity')).toBe(true);
  });

  it('records refunded and high-payout settled rounds', async () => {
    const service = new MemoryRiskService();

    const events = await service.assessRoundSettled(round({
      status: 'refunded',
      payout: asMoney(6000),
      stake: asMoney(100)
    }));

    expect(events.map(event => event.type)).toEqual(['round_refund', 'high_payout_round']);
  });
});
