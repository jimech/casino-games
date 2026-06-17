import { describe, expect, it } from 'vitest';
import { asMoney } from '../money';
import { getRouletteColor, resolveRoulettePayout, totalRouletteStake } from '../roulette';

describe('european roulette math', () => {
  it('classifies zero as green and loses outside bets', () => {
    const payout = resolveRoulettePayout(
      {
        outside: {
          red: asMoney(100),
          even: asMoney(100),
          low: asMoney(100)
        },
        straight: {}
      },
      { number: 0, color: getRouletteColor(0) }
    );

    expect(payout).toBe(0);
  });

  it('pays even-money bets as stake plus winnings', () => {
    const payout = resolveRoulettePayout(
      {
        outside: {
          black: asMoney(50),
          high: asMoney(25)
        },
        straight: {}
      },
      { number: 20, color: getRouletteColor(20) }
    );

    expect(payout).toBe(150);
  });

  it('pays straight-up numbers at 35:1 plus stake', () => {
    const payout = resolveRoulettePayout(
      {
        outside: {},
        straight: {
          17: asMoney(10)
        }
      },
      { number: 17, color: getRouletteColor(17) }
    );

    expect(payout).toBe(360);
  });

  it('sums total exposure across all placed bets', () => {
    expect(
      totalRouletteStake({
        outside: {
          red: asMoney(10),
          odd: asMoney(20)
        },
        straight: {
          7: asMoney(5),
          32: asMoney(5)
        }
      })
    ).toBe(40);
  });

  it('resolves layered straight and outside bets from one outcome', () => {
    const payout = resolveRoulettePayout(
      {
        outside: {
          red: asMoney(10),
          odd: asMoney(20),
          high: asMoney(30)
        },
        straight: {
          23: asMoney(5),
          24: asMoney(5)
        }
      },
      { number: 23, color: getRouletteColor(23) }
    );

    expect(payout).toBe(300);
  });
});
