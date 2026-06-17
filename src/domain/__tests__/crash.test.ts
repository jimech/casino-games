import { describe, expect, it } from 'vitest';
import { crashPointFromUnitRandom, multiplierFromElapsedMs, resolveCrashCashout } from '../crash';
import { asMoney } from '../money';

describe('crash math', () => {
  it('creates deterministic crash points from unit random values', () => {
    expect(crashPointFromUnitRandom(0, { houseEdgeBps: 300 })).toBe(1);
    expect(crashPointFromUnitRandom(0.5, { houseEdgeBps: 300 })).toBe(1.94);
    expect(crashPointFromUnitRandom(0.9, { houseEdgeBps: 300 })).toBe(9.7);
  });

  it('pays only when cashout is at or below the crash point', () => {
    expect(resolveCrashCashout(asMoney(100), 2.5, 3)).toBe(250);
    expect(resolveCrashCashout(asMoney(100), 3.01, 3)).toBe(0);
  });

  it('maps elapsed time to the visible multiplier curve deterministically', () => {
    expect(multiplierFromElapsedMs(0)).toBe(1);
    expect(multiplierFromElapsedMs(1000)).toBe(1.25);
    expect(multiplierFromElapsedMs(4000)).toBe(3);
  });
});
