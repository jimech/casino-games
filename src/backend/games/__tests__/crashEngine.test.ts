import { describe, expect, it } from 'vitest';
import { CasinoService } from '../../casinoService';
import { cashoutCrashRound, startCrashRound } from '../crashEngine';

describe('crash backend engine', () => {
  it('starts a crash round by locking stake and storing the crash point', async () => {
    const launchTime = new Date('2026-06-18T00:00:00.000Z');
    const service = new CasinoService({ user_1: 1000 });

    const result = await startCrashRound(
      service,
      { userId: 'user_1', stake: 100, idempotencyKey: 'crash-start-1' },
      { unitRandom: () => 0.5, now: () => launchTime }
    );

    expect(result.crashPoint).toBe(1.94);
    expect(result.round.status).toBe('open');
    expect(result.wallet.available).toBe(900);
    expect(result.wallet.locked).toBe(100);
    expect(result.round.outcome).toMatchObject({
      game: 'crash',
      crashPoint: 1.94,
      launchTime: launchTime.toISOString()
    });
  });

  it('settles a cashout using server elapsed time', async () => {
    const launchTime = new Date('2026-06-18T00:00:00.000Z');
    const service = new CasinoService({ user_1: 1000 });
    const started = await startCrashRound(
      service,
      { userId: 'user_1', stake: 100, idempotencyKey: 'crash-start-2' },
      { unitRandom: () => 0.9, now: () => launchTime }
    );

    const result = await cashoutCrashRound(
      service,
      {
        roundId: started.round.id,
        cashoutMultiplier: 2,
        idempotencyKey: 'crash-cashout-2'
      },
      { now: () => new Date('2026-06-18T00:00:04.000Z') }
    );

    expect(result.crashPoint).toBe(9.7);
    expect(result.cashoutMultiplier).toBe(2);
    expect(result.payout).toBe(200);
    expect(result.wallet.available).toBe(1100);
    expect(result.wallet.locked).toBe(0);
  });

  it('settles late cashout as a loss once server time has passed the crash point', async () => {
    const service = new CasinoService({ user_1: 1000 });
    const started = await startCrashRound(
      service,
      { userId: 'user_1', stake: 100, idempotencyKey: 'crash-start-3' },
      { unitRandom: () => 0.5, now: () => new Date('2026-06-18T00:00:00.000Z') }
    );

    const result = await cashoutCrashRound(
      service,
      {
        roundId: started.round.id,
        cashoutMultiplier: 1.5,
        idempotencyKey: 'crash-cashout-3'
      },
      { now: () => new Date('2026-06-18T00:00:03.000Z') }
    );

    expect(result.crashPoint).toBe(1.94);
    expect(result.payout).toBe(0);
    expect(result.wallet.available).toBe(900);
    expect(result.wallet.locked).toBe(0);
  });
});
