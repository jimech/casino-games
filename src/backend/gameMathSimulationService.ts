import {
  BlackjackCard,
  isSoftHand,
  scoreBlackjackHand,
  settleBlackjackHand,
  shouldDealerDraw
} from '../domain/blackjack';
import { crashPointFromUnitRandom, resolveCrashCashout } from '../domain/crash';
import { Money, asMoney } from '../domain/money';
import {
  PlayingCard,
  comparePokerHands,
  evaluateBestTexasHoldemHand
} from '../domain/poker';
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
  blackjack: GameMathScenarioReport[];
  poker: GameMathScenarioReport[];
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
  const blackjack = simulateBlackjack(sampleCount);
  const poker = simulatePoker(sampleCount);
  const scenarios = [...roulette, ...slots, ...crash, ...blackjack, ...poker];
  return {
    generatedAt: new Date().toISOString(),
    sampleCount,
    roulette,
    slots,
    crash,
    blackjack,
    poker,
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

const simulateBlackjack = (sampleCount: number): GameMathScenarioReport[] => {
  const stake = asMoney(100);
  return [
    blackjackScenario({
      scenarioId: 'blackjack-stand-hard-17',
      description: 'Blackjack flat bet, hit until hard 17 or soft 18, dealer stands soft 17',
      stake,
      sampleCount,
      seed: 0xB10C17,
      shouldPlayerHit: hand => {
        const score = scoreBlackjackHand(hand);
        if (isSoftHand(hand)) return score < 18;
        return score < 17;
      }
    }),
    blackjackScenario({
      scenarioId: 'blackjack-basic-no-double',
      description: 'Blackjack flat bet, basic hit/stand approximation without double or split',
      stake,
      sampleCount,
      seed: 0xB10CBA51,
      shouldPlayerHit: (hand, dealerUpCard) => {
        const score = scoreBlackjackHand(hand);
        if (isSoftHand(hand)) return score <= 17;
        const dealerScore = scoreBlackjackHand([dealerUpCard]);
        if (score <= 11) return true;
        if (score === 12) return dealerScore < 4 || dealerScore > 6;
        if (score >= 13 && score <= 16) return dealerScore >= 7;
        return false;
      }
    })
  ];
};

const blackjackScenario = (input: {
  scenarioId: string;
  description: string;
  stake: Money;
  sampleCount: number;
  seed: number;
  shouldPlayerHit: (hand: BlackjackCard[], dealerUpCard: BlackjackCard) => boolean;
}): GameMathScenarioReport => {
  const random = seededRandom(input.seed);
  const payouts = Array.from({ length: input.sampleCount }, () => {
    const shoe = shuffleCards(createBlackjackShoe(6), random);
    const playerHand = [drawCard(shoe), drawCard(shoe)] as BlackjackCard[];
    const dealerHand = [drawCard(shoe), drawCard(shoe)] as BlackjackCard[];
    while (scoreBlackjackHand(playerHand) < 21 && input.shouldPlayerHit(playerHand, dealerHand[0])) {
      playerHand.push(drawCard(shoe));
    }
    while (scoreBlackjackHand(playerHand) <= 21 && shouldDealerDraw(dealerHand, false)) {
      dealerHand.push(drawCard(shoe));
    }
    return settleBlackjackHand(playerHand, dealerHand, input.stake).payout;
  });
  return scenarioReport({
    gameId: 'blackjack',
    scenarioId: input.scenarioId,
    description: input.description,
    stake: input.stake,
    payouts
  });
};

const simulatePoker = (sampleCount: number): GameMathScenarioReport[] => {
  const stake = asMoney(100);
  return [
    pokerScenario({
      scenarioId: 'poker-heads-up-checkdown',
      description: 'Texas Holdem heads-up showdown, equal ante, no rake',
      stake,
      sampleCount,
      seed: 0xF10D,
      rakeRate: 0
    }),
    pokerScenario({
      scenarioId: 'poker-heads-up-five-percent-rake',
      description: 'Texas Holdem heads-up showdown, equal ante, 5% winning-pot rake',
      stake,
      sampleCount,
      seed: 0xF10D,
      rakeRate: 0.05
    })
  ];
};

const pokerScenario = (input: {
  scenarioId: string;
  description: string;
  stake: number;
  sampleCount: number;
  seed: number;
  rakeRate: number;
}): GameMathScenarioReport => {
  const random = seededRandom(input.seed);
  const pot = input.stake * 2;
  const payouts = Array.from({ length: input.sampleCount }, () => {
    const deck = shuffleCards(createPokerDeck(), random);
    const playerCards = [drawCard(deck), drawCard(deck)] as [PlayingCard, PlayingCard];
    const dealerCards = [drawCard(deck), drawCard(deck)] as [PlayingCard, PlayingCard];
    const communityCards = [drawCard(deck), drawCard(deck), drawCard(deck), drawCard(deck), drawCard(deck)];
    const playerRank = evaluateBestTexasHoldemHand(playerCards, communityCards);
    const dealerRank = evaluateBestTexasHoldemHand(dealerCards, communityCards);
    const comparison = comparePokerHands(playerRank, dealerRank);
    if (comparison > 0) return asMoney(pot * (1 - input.rakeRate));
    if (comparison < 0) return 0;
    return input.stake;
  });
  return scenarioReport({
    gameId: 'poker',
    scenarioId: input.scenarioId,
    description: input.description,
    stake: input.stake,
    payouts
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

const shuffleCards = <T>(cards: T[], random: () => number) => {
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
  }
  return cards;
};

const drawCard = <T>(cards: T[]) => {
  const card = cards.pop();
  if (!card) throw new Error('Simulation deck is empty');
  return card;
};

const createBlackjackShoe = (deckCount: number): BlackjackCard[] => {
  const shoe: BlackjackCard[] = [];
  for (let deck = 0; deck < deckCount; deck += 1) {
    for (const suit of CARD_SUITS) {
      for (const rank of CARD_RANKS) {
        shoe.push({ suit, rank });
      }
    }
  }
  return shoe;
};

const createPokerDeck = (): PlayingCard[] => {
  const deck: PlayingCard[] = [];
  for (const suit of CARD_SUITS) {
    for (const rank of CARD_RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
};

const CARD_SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
const CARD_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;

const parseAdvertisedRtp = (value: string) => {
  const parsed = Number(value.replace('%', ''));
  return Number.isFinite(parsed) ? parsed / 100 : undefined;
};

const normalizeSampleCount = (sampleCount?: number) => {
  if (!Number.isFinite(sampleCount ?? 20000)) return 20000;
  return Math.max(1000, Math.min(250000, Math.floor(sampleCount ?? 20000)));
};

const roundRatio = (value: number) => Math.round(value * 10000) / 10000;
