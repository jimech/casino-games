import { describe, expect, it } from 'vitest';
import { CasinoService } from '../casinoService';

describe('casino backend service', () => {
  it('locks stake when placing a bet', () => {
    const service = new CasinoService({ user_1: 1000 });
    const round = service.placeBet({
      userId: 'user_1',
      gameId: 'roulette',
      stake: 100,
      idempotencyKey: 'bet-1'
    });

    expect(round.status).toBe('open');
    expect(service.getWallet('user_1').available).toBe(900);
    expect(service.getWallet('user_1').locked).toBe(100);
    expect(service.getLedger('user_1')).toHaveLength(1);
  });

  it('does not double lock duplicate place bet requests', () => {
    const service = new CasinoService({ user_1: 1000 });
    const first = service.placeBet({
      userId: 'user_1',
      gameId: 'roulette',
      stake: 100,
      idempotencyKey: 'same-bet'
    });
    const second = service.placeBet({
      userId: 'user_1',
      gameId: 'roulette',
      stake: 100,
      idempotencyKey: 'same-bet'
    });

    expect(second.id).toBe(first.id);
    expect(service.getWallet('user_1').available).toBe(900);
    expect(service.getWallet('user_1').locked).toBe(100);
    expect(service.getLedger('user_1')).toHaveLength(1);
  });

  it('settles losing rounds by consuming locked stake', () => {
    const service = new CasinoService({ user_1: 1000 });
    const round = service.placeBet({
      userId: 'user_1',
      gameId: 'crash',
      stake: 100,
      idempotencyKey: 'bet-1'
    });

    const settled = service.settleRound({
      roundId: round.id,
      payout: 0,
      idempotencyKey: 'settle-1',
      outcome: { crashPoint: 1.12 }
    });

    expect(settled.status).toBe('settled');
    expect(service.getWallet('user_1').available).toBe(900);
    expect(service.getWallet('user_1').locked).toBe(0);
    expect(service.getLedger('user_1')).toHaveLength(2);
  });

  it('settles winning rounds by releasing stake and crediting payout', () => {
    const service = new CasinoService({ user_1: 1000 });
    const round = service.placeBet({
      userId: 'user_1',
      gameId: 'roulette',
      stake: 100,
      idempotencyKey: 'bet-1'
    });

    service.settleRound({
      roundId: round.id,
      payout: 3600,
      idempotencyKey: 'settle-1',
      outcome: { number: 17 }
    });

    expect(service.getWallet('user_1').available).toBe(4500);
    expect(service.getWallet('user_1').locked).toBe(0);
  });

  it('does not double settle duplicate settlement requests', () => {
    const service = new CasinoService({ user_1: 1000 });
    const round = service.placeBet({
      userId: 'user_1',
      gameId: 'roulette',
      stake: 100,
      idempotencyKey: 'bet-1'
    });

    const first = service.settleRound({
      roundId: round.id,
      payout: 200,
      idempotencyKey: 'settle-same'
    });
    const second = service.settleRound({
      roundId: round.id,
      payout: 200,
      idempotencyKey: 'settle-same'
    });

    expect(second).toEqual(first);
    expect(service.getWallet('user_1').available).toBe(1100);
    expect(service.getWallet('user_1').locked).toBe(0);
    expect(service.getLedger('user_1')).toHaveLength(2);
  });

  it('refunds open rounds exactly once', () => {
    const service = new CasinoService({ user_1: 1000 });
    const round = service.placeBet({
      userId: 'user_1',
      gameId: 'blackjack',
      stake: 250,
      idempotencyKey: 'bet-1'
    });

    service.refundRound({
      roundId: round.id,
      idempotencyKey: 'refund-1',
      reason: 'dealer error'
    });

    expect(service.getWallet('user_1').available).toBe(1000);
    expect(service.getWallet('user_1').locked).toBe(0);
  });
});
