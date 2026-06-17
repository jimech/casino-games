import { Money, addMoney, asMoney, multiplyMoney } from './money';

export type RouletteColor = 'red' | 'black' | 'green';
export type OutsideBet = 'red' | 'black' | 'even' | 'odd' | 'high' | 'low';

export interface RouletteBetSlip {
  outside: Partial<Record<OutsideBet, Money>>;
  straight: Partial<Record<number, Money>>;
}

export interface RouletteOutcome {
  number: number;
  color: RouletteColor;
}

export const EUROPEAN_ROULETTE_SEQUENCE = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
] as const;

export const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36
]);

export const getRouletteColor = (number: number): RouletteColor => {
  assertRouletteNumber(number);
  if (number === 0) return 'green';
  return RED_NUMBERS.has(number) ? 'red' : 'black';
};

export const resolveRoulettePayout = (bets: RouletteBetSlip, outcome: RouletteOutcome): Money => {
  assertRouletteNumber(outcome.number);
  let payout = asMoney(0);

  for (const [betType, amount] of Object.entries(bets.outside) as [OutsideBet, Money][]) {
    if (amount && outsideBetWins(betType, outcome)) {
      payout = addMoney(payout, multiplyMoney(amount, 2));
    }
  }

  const straightAmount = bets.straight[outcome.number];
  if (straightAmount) {
    payout = addMoney(payout, multiplyMoney(straightAmount, 36));
  }

  return payout;
};

export const totalRouletteStake = (bets: RouletteBetSlip): Money => {
  const allAmounts = [
    ...Object.values(bets.outside),
    ...Object.values(bets.straight)
  ].filter((amount): amount is Money => amount !== undefined);

  return allAmounts.reduce((total, amount) => addMoney(total, amount), asMoney(0));
};

const outsideBetWins = (betType: OutsideBet, outcome: RouletteOutcome): boolean => {
  const { number, color } = outcome;
  if (number === 0) return false;

  switch (betType) {
    case 'red':
      return color === 'red';
    case 'black':
      return color === 'black';
    case 'even':
      return number % 2 === 0;
    case 'odd':
      return number % 2 !== 0;
    case 'high':
      return number >= 19 && number <= 36;
    case 'low':
      return number >= 1 && number <= 18;
  }
};

const assertRouletteNumber = (number: number) => {
  if (!Number.isInteger(number) || number < 0 || number > 36) {
    throw new Error(`Invalid roulette number ${number}`);
  }
};
