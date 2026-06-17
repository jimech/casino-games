import { describe, expect, it } from 'vitest';
import { CasinoService } from '../../casinoService';
import { parseRouletteBetSlip, spinRoulette } from '../rouletteEngine';

describe('roulette backend engine', () => {
  it('parses and validates roulette bet slips', () => {
    const bets = parseRouletteBetSlip({
      outside: { red: 10, even: 5 },
      straight: { 17: 25 }
    });

    expect(bets.outside.red).toBe(10);
    expect(bets.outside.even).toBe(5);
    expect(bets.straight[17]).toBe(25);
  });

  it('rejects invalid roulette bet slips', () => {
    expect(() => parseRouletteBetSlip({ outside: { red: 0 }, straight: {} })).toThrow(/positive integer/);
    expect(() => parseRouletteBetSlip({ outside: {}, straight: { 99: 10 } })).toThrow(/Invalid roulette/);
  });

  it('locks stake, resolves outcome, settles payout, and returns wallet', async () => {
    const service = new CasinoService({ user_1: 1000 });

    const result = await spinRoulette(
      service,
      {
        userId: 'user_1',
        bets: {
          outside: { red: 10 },
          straight: { 32: 5 }
        },
        idempotencyKey: 'spin-1'
      },
      { pickIndex: () => 1 }
    );

    expect(result.outcome).toEqual({ number: 32, color: 'red' });
    expect(result.stake).toBe(15);
    expect(result.payout).toBe(200);
    expect(result.round.status).toBe('settled');
    expect(result.wallet.available).toBe(1185);
    expect(result.wallet.locked).toBe(0);
    expect(service.getLedger('user_1')).toHaveLength(2);
  });

  it('does not double charge duplicate spin requests with the same idempotency key', async () => {
    const service = new CasinoService({ user_1: 1000 });
    const input = {
      userId: 'user_1',
      bets: {
        outside: { black: 100 },
        straight: {}
      },
      idempotencyKey: 'spin-same'
    };

    const first = await spinRoulette(service, input, { pickIndex: () => 0 });
    const second = await spinRoulette(service, input, { pickIndex: () => 0 });

    expect(second.round.id).toBe(first.round.id);
    expect(service.getWallet('user_1').available).toBe(900);
    expect(service.getWallet('user_1').locked).toBe(0);
    expect(service.getLedger('user_1')).toHaveLength(2);
  });
});
