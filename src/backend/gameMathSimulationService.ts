import { crashPointFromUnitRandom, resolveCrashCashout } from '../domain/crash';
import { asMoney } from '../domain/money';
import {
  EUROPEAN_ROULETTE_SEQUENCE,
  RouletteBetSlip,
  getRouletteColor,
  resolveRoulettePayout,
  totalRouletteStake
} from '../domain/roulette';
import { SLOT_MACHINES, SlotMachineConfig, resolveSlotSpin } from '../domain/slots';

export interface GameMathSimulationReport {
  generatedAt: string;
  sampleCount: number;
  roulette: GameMathScenarioReport[];
  slots: GameMathScenarioReport[];
  crash: GameMathScenarioReport[];
  summary: {
    scenarioCount: number;
    lowestRtp: number;
    highestRtp: number;
    highestVolatilityIndex: number;
  };
}

export interface GameMathScenarioReport {
  gameId: string;
  scenarioId: string;
  description: string;
  theoreticalRtp: number;
  hitRate: number;
  volatilityIndex: number;
  sampleCount: number;
  totalStake: number;
  totalPayout: number;
  maxPayout: number;
  expectedHouseEdge: number;
  warnings: string[];
}

export const runGameMathSimulation = (input: { sampleCount?: number } = {}): GameMathSimulationReport => {
  const sampleCount = normalizeSampleCount(input.sampleCount);
  const roulette = simulateRoulette();
  const slots = SLOT_MACHINES.map(machine => simulateSlotMachine(machine));
  const crash = simulateCrash(sampleCount);
  const scenarios = [...roulette, ...slots, ...crash];
  return {
    generatedAt: new Date().toISOString(),
    sampleCount,
    roulette,
    slots,
    crash,
    summary: {
      scenarioCount: scenarios.length,
      lowestRtp: roundRatio(Math.min(...scenarios.map(scenario => scenario.theoreticalRtp))),
      highestRtp: roundRatio(Math.max(...scenarios.map(scenario => scenario.theoreticalRtp))),
      highestVolatilityIndex: roundRatio(Math.max(...scenarios.map(scenario => scenario.volatilityIndex)))
    }
  };
};

const simulateRoulette = (): GameMathScenarioReport[] => [
  rouletteScenario('roulette-red', 'European roulette red outside bet', { outside: { red: asMoney(1) }, straight: {} }),
  rouletteScenario('roulette-straight-zero', 'European roulette straight-up zero bet', { outside: {}, straight: { 0: asMoney(1) } })
];

const rouletteScenario = (
  scenarioId: string,
  description: string,
  betSlip: RouletteBetSlip
): GameMathScenarioReport => {
  const stake = totalRouletteStake(betSlip);
  const payouts = EUROPEAN_ROULETTE_SEQUENCE.map(number =>
    resolveRoulettePayout(betSlip, { number, color: getRouletteColor(number) })
  );
  return scenarioReport({
    gameId: 'roulette',
    scenarioId,
    description,
    stake,
    payouts
  });
};

const simulateSlotMachine = (machine: SlotMachineConfig): GameMathScenarioReport => {
  const stake = machine.minBet;
  const payouts: number[] = [];
  for (let first = 0; first < machine.reelStrips[0].length; first += 1) {
    for (let second = 0; second < machine.reelStrips[1].length; second += 1) {
      for (let third = 0; third < machine.reelStrips[2].length; third += 1) {
        payouts.push(resolveSlotSpin(machine, stake, [first, second, third]).payout);
      }
    }
  }
  return scenarioReport({
    gameId: 'slots',
    scenarioId: machine.id,
    description: `${machine.name} exact reel-strip enumeration`,
    stake,
    payouts,
    advertisedRtp: parseAdvertisedRtp(machine.rtp)
  });
};

const simulateCrash = (sampleCount: number): GameMathScenarioReport[] => {
  const stake = asMoney(100);
  return [1.5, 2, 5].map(multiplier => {
    const random = seededRandom(0xC451);
    const payouts = Array.from({ length: sampleCount }, () => {
      const crashPoint = crashPointFromUnitRandom(random());
      return resolveCrashCashout(stake, multiplier, crashPoint);
    });
    return scenarioReport({
      gameId: 'crash',
      scenarioId: `crash-cashout-${multiplier.toFixed(2)}`,
      description: `Crash fixed cashout at ${multiplier.toFixed(2)}x`,
      stake,
      payouts
    });
  });
};

const scenarioReport = (input: {
  gameId: string;
  scenarioId: string;
  description: string;
  stake: number;
  payouts: number[];
  advertisedRtp?: number;
}): GameMathScenarioReport => {
  const sampleCount = input.payouts.length;
  const totalStake = input.stake * sampleCount;
  const totalPayout = input.payouts.reduce((sum, payout) => sum + payout, 0);
  const meanPayout = totalPayout / sampleCount;
  const variance = input.payouts.reduce((sum, payout) => sum + Math.pow(payout - meanPayout, 2), 0) / sampleCount;
  const theoreticalRtp = totalPayout / totalStake;
  const volatilityIndex = Math.sqrt(variance) / input.stake;
  const warnings = [];
  if (input.advertisedRtp !== undefined && Math.abs(theoreticalRtp - input.advertisedRtp) > 0.03) {
    warnings.push('advertised_rtp_deviation');
  }
  if (theoreticalRtp > 1) warnings.push('positive_player_expectation');
  if (theoreticalRtp < 0.85) warnings.push('low_rtp_review_required');
  return {
    gameId: input.gameId,
    scenarioId: input.scenarioId,
    description: input.description,
    theoreticalRtp: roundRatio(theoreticalRtp),
    hitRate: roundRatio(input.payouts.filter(payout => payout > 0).length / sampleCount),
    volatilityIndex: roundRatio(volatilityIndex),
    sampleCount,
    totalStake,
    totalPayout,
    maxPayout: Math.max(...input.payouts),
    expectedHouseEdge: roundRatio(1 - theoreticalRtp),
    warnings
  };
};

const seededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const parseAdvertisedRtp = (value: string) => {
  const parsed = Number(value.replace('%', ''));
  return Number.isFinite(parsed) ? parsed / 100 : undefined;
};

const normalizeSampleCount = (sampleCount?: number) => {
  if (!Number.isFinite(sampleCount ?? 20000)) return 20000;
  return Math.max(1000, Math.min(250000, Math.floor(sampleCount ?? 20000)));
};

const roundRatio = (value: number) => Math.round(value * 10000) / 10000;
