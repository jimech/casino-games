import { describe, expect, it } from 'vitest';
import { asMoney } from '../../domain/money';
import { MemoryBonusService } from '../bonusService';
import { CasinoService } from '../casinoService';
import { DeterministicVipService, buildVipStatus } from '../vipService';

describe('vip service', () => {
  it('computes tier, weekly net loss, and cashback from settled rounds', () => {
    const status = buildVipStatus({
      userId: 'user_1',
      now: new Date('2026-06-22T12:00:00.000Z'),
      claims: [],
      rounds: [
        {
          id: 'round_1',
          userId: 'user_1',
          gameId: 'roulette',
          stake: asMoney(1000),
          status: 'settled',
          payout: asMoney(200),
          lockIdempotencyKey: 'bet-1',
          settlementIdempotencyKey: 'settle-1',
          createdAt: '2026-06-22T11:00:00.000Z',
          settledAt: '2026-06-22T11:01:00.000Z'
        }
      ]
    });

    expect(status.tier.id).toBe('silver');
    expect(status.nextTier?.id).toBe('gold');
    expect(status.settledStake).toBe(1000);
    expect(status.netLoss).toBe(800);
    expect(status.availableCashback).toBe(24);
    expect(status.weekKey).toBe('2026-W26');
  });

  it('credits cashback once per week and records the bonus claim', async () => {
    const casino = new CasinoService({ user_1: 1000 });
    const bonuses = new MemoryBonusService(casino);
    const vip = new DeterministicVipService(casino, bonuses);
    const round = casino.placeBet({
      userId: 'user_1',
      gameId: 'roulette',
      stake: 600,
      idempotencyKey: 'vip-bet-1'
    });
    casino.settleRound({
      roundId: round.id,
      payout: 100,
      idempotencyKey: 'vip-settle-1'
    });

    const first = await vip.claimCashback({
      userId: 'user_1',
      idempotencyKey: 'vip-cashback-1'
    });
    const duplicate = await vip.claimCashback({
      userId: 'user_1',
      idempotencyKey: 'vip-cashback-2'
    });

    expect(first.claim?.campaignId).toBe('vip-weekly-cashback');
    expect(first.claim?.amount).toBe(15);
    expect(first.wallet.available).toBe(515);
    expect(first.status.availableCashback).toBe(0);
    expect(duplicate.claim).toBeUndefined();
    expect(duplicate.wallet.available).toBe(515);
    expect(bonuses.listClaims('user_1')).toHaveLength(1);
  });
});
