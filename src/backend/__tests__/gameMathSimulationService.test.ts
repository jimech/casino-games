import { describe, expect, it } from 'vitest';
import { runGameMathSimulation } from '../gameMathSimulationService';

describe('game math simulation service', () => {
  it('reports exact roulette RTP for outside and straight bets', () => {
    const report = runGameMathSimulation({ sampleCount: 1000 });

    expect(report.roulette).toHaveLength(2);
    for (const scenario of report.roulette) {
      expect(scenario.theoreticalRtp).toBeCloseTo(36 / 37, 4);
      expect(scenario.expectedHouseEdge).toBeCloseTo(1 / 37, 4);
      expect(scenario.warnings).toEqual([]);
    }
  });

  it('enumerates slot machines and warns when advertised RTP drifts from configured strips', () => {
    const report = runGameMathSimulation({ sampleCount: 1000 });

    expect(report.slots.map(scenario => scenario.scenarioId)).toEqual([
      'fruit-mania',
      'cyber-jackpot',
      'ancient-gold'
    ]);
    expect(report.slots.every(scenario => scenario.sampleCount > 3000)).toBe(true);
    expect(report.slots.some(scenario => scenario.warnings.includes('advertised_rtp_deviation'))).toBe(true);
  });

  it('samples crash deterministically for repeatable audit reports', () => {
    const first = runGameMathSimulation({ sampleCount: 2000 }).crash;
    const second = runGameMathSimulation({ sampleCount: 2000 }).crash;

    expect(first).toEqual(second);
    expect(first.every(scenario => scenario.theoreticalRtp > 0.9 && scenario.theoreticalRtp < 1.05)).toBe(true);
  });

  it('samples blackjack strategy scenarios deterministically', () => {
    const first = runGameMathSimulation({ sampleCount: 2000 }).blackjack;
    const second = runGameMathSimulation({ sampleCount: 2000 }).blackjack;

    expect(first.map(scenario => scenario.scenarioId)).toEqual([
      'blackjack-stand-hard-17',
      'blackjack-basic-no-double'
    ]);
    expect(first).toEqual(second);
    expect(first.every(scenario => scenario.theoreticalRtp > 0.9 && scenario.theoreticalRtp < 1)).toBe(true);
  });

  it('samples poker showdown scenarios with explicit rake assumptions', () => {
    const poker = runGameMathSimulation({ sampleCount: 2000 }).poker;

    expect(poker.map(scenario => scenario.scenarioId)).toEqual([
      'poker-heads-up-checkdown',
      'poker-heads-up-five-percent-rake'
    ]);
    expect(poker[0].theoreticalRtp).toBeGreaterThan(0.96);
    expect(poker[0].theoreticalRtp).toBeLessThan(1.04);
    expect(poker[1].theoreticalRtp).toBeLessThan(poker[0].theoreticalRtp);
  });
});
