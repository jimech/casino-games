export type CardSuit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type CardRank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface PlayingCard {
  suit: CardSuit;
  rank: CardRank;
}

export type PokerCategory =
  | 'High Card'
  | 'One Pair'
  | 'Two Pair'
  | 'Three of a Kind'
  | 'Straight'
  | 'Flush'
  | 'Full House'
  | 'Four of a Kind'
  | 'Straight Flush';

export interface PokerHandRank {
  category: PokerCategory;
  categoryValue: number;
  tiebreakers: number[];
  cards: PlayingCard[];
}

const RANK_VALUES: Record<CardRank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14
};

export const evaluateBestTexasHoldemHand = (
  holeCards: readonly PlayingCard[],
  communityCards: readonly PlayingCard[]
): PokerHandRank => {
  const cards = [...holeCards, ...communityCards];
  if (holeCards.length !== 2 || communityCards.length !== 5 || cards.length !== 7) {
    throw new Error('Texas Holdem evaluation requires exactly 2 hole cards and 5 community cards');
  }

  return combinations(cards, 5)
    .map(evaluateFiveCardHand)
    .sort(comparePokerHands)
    .at(-1)!;
};

export const comparePokerHands = (left: PokerHandRank, right: PokerHandRank): number => {
  if (left.categoryValue !== right.categoryValue) {
    return left.categoryValue - right.categoryValue;
  }

  const maxLength = Math.max(left.tiebreakers.length, right.tiebreakers.length);
  for (let i = 0; i < maxLength; i++) {
    const diff = (left.tiebreakers[i] ?? 0) - (right.tiebreakers[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

export const evaluateFiveCardHand = (cards: readonly PlayingCard[]): PokerHandRank => {
  if (cards.length !== 5) {
    throw new Error('Poker hand evaluation requires exactly 5 cards');
  }

  const rankValues = cards.map(cardValue).sort(desc);
  const groups = groupedRanks(rankValues);
  const flush = cards.every(card => card.suit === cards[0].suit);
  const straightHigh = getStraightHigh(rankValues);

  if (flush && straightHigh) {
    return rank('Straight Flush', 9, [straightHigh], cards);
  }

  const four = groups.find(group => group.count === 4);
  if (four) {
    return rank('Four of a Kind', 8, [four.value, ...groups.filter(group => group.value !== four.value).map(group => group.value)], cards);
  }

  const three = groups.find(group => group.count === 3);
  const pair = groups.find(group => group.count === 2);
  if (three && pair) {
    return rank('Full House', 7, [three.value, pair.value], cards);
  }

  if (flush) {
    return rank('Flush', 6, rankValues, cards);
  }

  if (straightHigh) {
    return rank('Straight', 5, [straightHigh], cards);
  }

  if (three) {
    return rank('Three of a Kind', 4, [three.value, ...groups.filter(group => group.value !== three.value).map(group => group.value)], cards);
  }

  const pairs = groups.filter(group => group.count === 2);
  if (pairs.length === 2) {
    return rank('Two Pair', 3, [...pairs.map(group => group.value), groups.find(group => group.count === 1)!.value], cards);
  }

  if (pairs.length === 1) {
    return rank('One Pair', 2, [pairs[0].value, ...groups.filter(group => group.value !== pairs[0].value).map(group => group.value)], cards);
  }

  return rank('High Card', 1, rankValues, cards);
};

const cardValue = (card: PlayingCard): number => RANK_VALUES[card.rank];

const groupedRanks = (rankValues: readonly number[]) => {
  const counts = new Map<number, number>();
  for (const value of rankValues) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || b.value - a.value);
};

const getStraightHigh = (rankValues: readonly number[]): number | null => {
  const unique = [...new Set(rankValues)].sort(desc);
  if (unique.includes(14)) unique.push(1);

  for (let i = 0; i <= unique.length - 5; i++) {
    const run = unique.slice(i, i + 5);
    if (run[0] - run[4] === 4) {
      return run[0];
    }
  }
  return null;
};

const combinations = <T>(items: readonly T[], size: number): T[][] => {
  if (size === 0) return [[]];
  if (items.length < size) return [];

  const [head, ...tail] = items;
  return [
    ...combinations(tail, size - 1).map(combo => [head, ...combo]),
    ...combinations(tail, size)
  ];
};

const rank = (
  category: PokerCategory,
  categoryValue: number,
  tiebreakers: number[],
  cards: readonly PlayingCard[]
): PokerHandRank => ({
  category,
  categoryValue,
  tiebreakers,
  cards: [...cards]
});

const desc = (a: number, b: number) => b - a;
