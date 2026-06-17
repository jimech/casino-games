import { Money, asMoney, multiplyMoney } from './money';

export interface CrashConfig {
  houseEdgeBps: number;
  maxMultiplier?: number;
}

export const crashPointFromUnitRandom = (
  unitRandom: number,
  config: CrashConfig = { houseEdgeBps: 300, maxMultiplier: 1000 }
): number => {
  if (!Number.isFinite(unitRandom) || unitRandom < 0 || unitRandom >= 1) {
    throw new Error(`Unit random must be in [0, 1), received ${unitRandom}`);
  }
  if (!Number.isInteger(config.houseEdgeBps) || config.houseEdgeBps < 0 || config.houseEdgeBps >= 10000) {
    throw new Error(`Invalid house edge bps ${config.houseEdgeBps}`);
  }

  const rtp = (10000 - config.houseEdgeBps) / 10000;
  const rawPoint = rtp / Math.max(1e-12, 1 - unitRandom);
  const capped = Math.min(config.maxMultiplier ?? Number.POSITIVE_INFINITY, rawPoint);

  return Math.max(1, Math.floor(capped * 100) / 100);
};

export const resolveCrashCashout = (stake: Money, cashoutMultiplier: number, crashPoint: number): Money => {
  if (cashoutMultiplier < 1 || crashPoint < 1) {
    throw new Error('Crash multipliers must be at least 1');
  }
  if (cashoutMultiplier > crashPoint) {
    return asMoney(0);
  }
  return multiplyMoney(stake, cashoutMultiplier);
};

export const multiplierFromElapsedMs = (elapsedMs: number): number => {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new Error(`Elapsed milliseconds must be non-negative, received ${elapsedMs}`);
  }

  const elapsedSeconds = elapsedMs / 1000;
  return Math.floor((1 + Math.pow(elapsedSeconds, 1.5) * 0.25) * 100) / 100;
};
