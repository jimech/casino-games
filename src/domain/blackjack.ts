import { Money, asMoney, multiplyMoney } from './money';

export type BlackjackSuit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type BlackjackRank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface BlackjackCard {
  suit: BlackjackSuit;
  rank: BlackjackRank;
}

export type BlackjackHandStatus = 'win' | 'lose' | 'push' | 'blackjack';

export interface BlackjackSettlement {
  status: BlackjackHandStatus;
  payout: Money;
  playerScore: number;
  dealerScore: number;
}

const RANK_SCORE: Record<BlackjackRank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 10,
  Q: 10,
  K: 10,
  A: 11
};

const HI_LO_COUNT: Record<BlackjackRank, number> = {
  '2': 1,
  '3': 1,
  '4': 1,
  '5': 1,
  '6': 1,
  '7': 0,
  '8': 0,
  '9': 0,
  '10': -1,
  J: -1,
  Q: -1,
  K: -1,
  A: -1
};

export const scoreBlackjackHand = (hand: readonly BlackjackCard[]): number => {
  let score = hand.reduce((total, card) => total + RANK_SCORE[card.rank], 0);
  let aces = hand.filter(card => card.rank === 'A').length;

  while (score > 21 && aces > 0) {
    score -= 10;
    aces--;
  }

  return score;
};

export const isSoftHand = (hand: readonly BlackjackCard[]): boolean => {
  const hardScore = hand.reduce((total, card) => total + (card.rank === 'A' ? 1 : RANK_SCORE[card.rank]), 0);
  return hand.some(card => card.rank === 'A') && hardScore + 10 <= 21;
};

export const isNaturalBlackjack = (hand: readonly BlackjackCard[]): boolean =>
  hand.length === 2 && scoreBlackjackHand(hand) === 21;

export const canSplitBlackjackHand = (hand: readonly BlackjackCard[]): boolean =>
  hand.length === 2 && RANK_SCORE[hand[0].rank] === RANK_SCORE[hand[1].rank];

export const shouldDealerDraw = (hand: readonly BlackjackCard[], hitSoft17 = false): boolean => {
  const score = scoreBlackjackHand(hand);
  if (score < 17) return true;
  return hitSoft17 && score === 17 && isSoftHand(hand);
};

export const hiLoCountForCards = (cards: readonly BlackjackCard[]): number =>
  cards.reduce((total, card) => total + HI_LO_COUNT[card.rank], 0);

export const settleBlackjackHand = (
  playerHand: readonly BlackjackCard[],
  dealerHand: readonly BlackjackCard[],
  stake: Money,
  options: { doubled?: boolean; naturalBlackjackAllowed?: boolean } = {}
): BlackjackSettlement => {
  const settledStake = options.doubled ? multiplyMoney(stake, 2) : stake;
  const playerScore = scoreBlackjackHand(playerHand);
  const dealerScore = scoreBlackjackHand(dealerHand);
  const playerNatural = isNaturalBlackjack(playerHand);
  const dealerNatural = isNaturalBlackjack(dealerHand);

  if (playerScore > 21) {
    return settlement('lose', asMoney(0), playerScore, dealerScore);
  }
  if (dealerScore > 21) {
    return settlement('win', multiplyMoney(settledStake, 2), playerScore, dealerScore);
  }
  if (options.naturalBlackjackAllowed !== false && playerNatural && !dealerNatural) {
    return settlement('blackjack', multiplyMoney(settledStake, 2.5), playerScore, dealerScore);
  }
  if (dealerNatural && !playerNatural) {
    return settlement('lose', asMoney(0), playerScore, dealerScore);
  }
  if (playerScore > dealerScore) {
    return settlement('win', multiplyMoney(settledStake, 2), playerScore, dealerScore);
  }
  if (playerScore < dealerScore) {
    return settlement('lose', asMoney(0), playerScore, dealerScore);
  }
  return settlement('push', settledStake, playerScore, dealerScore);
};

const settlement = (
  status: BlackjackHandStatus,
  payout: Money,
  playerScore: number,
  dealerScore: number
): BlackjackSettlement => ({
  status,
  payout,
  playerScore,
  dealerScore
});
