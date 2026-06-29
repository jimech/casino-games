import { describe, expect, it } from 'vitest';
import { CasinoService } from '../casinoService';
import { MemoryReconciliationService } from '../reconciliationService';

describe('reconciliation service', () => {
  it('passes for a clean wallet, ledger, and round state', () => {
    const casino = new CasinoService({ user_1: 1000 });
    const round = casino.placeBet({
      userId: 'user_1',
      gameId: 'roulette',
      stake: 100,
      idempotencyKey: 'bet-1'
    });
    casino.settleRound({
      roundId: round.id,
      payout: 0,
      idempotencyKey: 'settle-1'
    });

    const report = new MemoryReconciliationService(casino).run();

    expect(report.status).toBe('pass');
    expect(report.summary.walletCount).toBe(1);
    expect(report.summary.ledgerEntryCount).toBe(2);
    expect(report.summary.settledRoundCount).toBe(1);
    expect(report.issues).toEqual([]);
  });
});
