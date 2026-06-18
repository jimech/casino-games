import { describe, expect, it } from 'vitest';
import { CasinoService } from '../../casinoService';
import { spinSlots } from '../slotsEngine';

describe('slots backend engine', () => {
  it('locks, resolves, settles, and returns display symbols', async () => {
    const service = new CasinoService({ user_1: 1000 });

    const result = await spinSlots(
      service,
      {
        userId: 'user_1',
        machineId: 'fruit-mania',
        bet: 10,
        idempotencyKey: 'slots-spin-1'
      },
      { pickStops: () => [0, 1, 0] }
    );

    expect(result.outcome.displaySymbols).toEqual(['🍒', '🍒', '🍒']);
    expect(result.outcome.payout).toBe(90);
    expect(result.round.status).toBe('settled');
    expect(result.wallet.available).toBe(1080);
    expect(result.wallet.locked).toBe(0);
    expect(service.getLedger('user_1')).toHaveLength(2);
  });

  it('does not charge wallet stake for free spins but still pays winnings', async () => {
    const service = new CasinoService({ user_1: 1000 });

    const result = await spinSlots(
      service,
      {
        userId: 'user_1',
        machineId: 'ancient-gold',
        bet: 10,
        freeSpin: true,
        bonusMultiplier: 3,
        idempotencyKey: 'slots-free-1'
      },
      { pickStops: () => [0, 1, 0] }
    );

    expect(result.outcome.payout).toBe(360);
    expect(result.wallet.available).toBe(1360);
    expect(result.wallet.locked).toBe(0);
  });

  it('returns the original settled result for duplicate spin idempotency keys', async () => {
    const service = new CasinoService({ user_1: 1000 });
    const input = {
      userId: 'user_1',
      machineId: 'fruit-mania',
      bet: 10,
      idempotencyKey: 'slots-same'
    };

    const first = await spinSlots(service, input, { pickStops: () => [0, 1, 0] });
    const second = await spinSlots(service, input, { pickStops: () => [1, 0, 1] });

    expect(second.round.id).toBe(first.round.id);
    expect(second.outcome.displaySymbols).toEqual(first.outcome.displaySymbols);
    expect(service.getWallet('user_1').available).toBe(1080);
    expect(service.getLedger('user_1')).toHaveLength(2);
  });
});
