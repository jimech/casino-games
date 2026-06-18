import { describe, expect, it } from 'vitest';
import { asMoney } from '../money';
import { getSlotMachine, resolveSlotSpin, symbolIdsToChars } from '../slots';

describe('slots math', () => {
  it('resolves three-of-a-kind payouts from reel stops', () => {
    const machine = getSlotMachine('fruit-mania');
    const outcome = resolveSlotSpin(machine, asMoney(10), [0, 1, 0]);

    expect(outcome.symbols).toEqual(['cherry', 'cherry', 'cherry']);
    expect(symbolIdsToChars(machine, outcome.symbols)).toEqual(['🍒', '🍒', '🍒']);
    expect(outcome.payout).toBe(90);
    expect(outcome.bonusSpinsAwarded).toBe(0);
  });

  it('resolves scatter bonus awards independently from line payout', () => {
    const machine = getSlotMachine('fruit-mania');
    const outcome = resolveSlotSpin(machine, asMoney(10), [12, 12, 12]);

    expect(outcome.symbols).toEqual(['star', 'star', 'star']);
    expect(outcome.payout).toBe(1200);
    expect(outcome.bonusSpinsAwarded).toBe(12);
  });

  it('applies bonus multipliers to free-spin payout math', () => {
    const machine = getSlotMachine('ancient-gold');
    const outcome = resolveSlotSpin(machine, asMoney(10), [0, 1, 0], 3);

    expect(outcome.symbols).toEqual(['urn', 'urn', 'urn']);
    expect(outcome.payout).toBe(360);
    expect(outcome.bonusMultiplier).toBe(3);
  });
});
