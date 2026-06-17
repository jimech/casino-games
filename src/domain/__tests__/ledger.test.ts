import { describe, expect, it } from 'vitest';
import { applyWalletCommand, createWalletState } from '../ledger';
import { asMoney } from '../money';

describe('wallet ledger math', () => {
  it('locks funds atomically and records before/after balances', () => {
    const initial = createWalletState(1000, 0);
    const result = applyWalletCommand(initial, {
      id: 'entry-1',
      idempotencyKey: 'lock-round-1',
      type: 'lock',
      amount: asMoney(250),
      createdAt: '2026-06-17T00:00:00.000Z'
    });

    expect(result.wallet.available).toBe(750);
    expect(result.wallet.locked).toBe(250);
    expect(result.entry?.balanceBefore.available).toBe(1000);
    expect(result.entry?.balanceAfter.available).toBe(750);
  });

  it('does not apply the same idempotency key twice', () => {
    const first = applyWalletCommand(createWalletState(1000, 0), {
      id: 'entry-1',
      idempotencyKey: 'same-key',
      type: 'debit',
      amount: asMoney(100)
    });

    const second = applyWalletCommand(first.wallet, {
      id: 'entry-2',
      idempotencyKey: 'same-key',
      type: 'debit',
      amount: asMoney(100)
    });

    expect(second.wallet.available).toBe(900);
    expect(second.entry).toBeNull();
  });

  it('rejects overspending instead of allowing negative balances', () => {
    expect(() =>
      applyWalletCommand(createWalletState(50, 0), {
        id: 'entry-1',
        idempotencyKey: 'too-large',
        type: 'lock',
        amount: asMoney(75)
      })
    ).toThrow(/Insufficient funds/);
  });

  it('settles a win by releasing stake from locked funds and crediting payout', () => {
    const locked = applyWalletCommand(createWalletState(1000, 0), {
      id: 'entry-1',
      idempotencyKey: 'lock-round-1',
      type: 'lock',
      amount: asMoney(100)
    }).wallet;

    const settled = applyWalletCommand(locked, {
      id: 'entry-2',
      idempotencyKey: 'settle-round-1',
      type: 'settleWin',
      amount: asMoney(3600),
      metadata: { stake: 100 }
    });

    expect(settled.wallet.available).toBe(4500);
    expect(settled.wallet.locked).toBe(0);
  });
});
