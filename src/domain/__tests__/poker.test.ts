import { describe, expect, it } from 'vitest';
import { comparePokerHands, evaluateBestTexasHoldemHand, evaluateFiveCardHand, PlayingCard } from '../poker';

const c = (rank: PlayingCard['rank'], suit: PlayingCard['suit']): PlayingCard => ({ rank, suit });

describe('poker hand math', () => {
  it('detects wheel straights with ace low', () => {
    const hand = evaluateFiveCardHand([
      c('A', 'spades'),
      c('2', 'clubs'),
      c('3', 'hearts'),
      c('4', 'diamonds'),
      c('5', 'spades')
    ]);

    expect(hand.category).toBe('Straight');
    expect(hand.tiebreakers).toEqual([5]);
  });

  it('uses kickers to break same-category ties', () => {
    const queensAce = evaluateFiveCardHand([
      c('Q', 'spades'),
      c('Q', 'clubs'),
      c('A', 'hearts'),
      c('9', 'diamonds'),
      c('3', 'spades')
    ]);
    const queensKing = evaluateFiveCardHand([
      c('Q', 'hearts'),
      c('Q', 'diamonds'),
      c('K', 'clubs'),
      c('9', 'clubs'),
      c('3', 'diamonds')
    ]);

    expect(comparePokerHands(queensAce, queensKing)).toBeGreaterThan(0);
  });

  it('evaluates the best five-card holdem hand from seven cards', () => {
    const best = evaluateBestTexasHoldemHand(
      [c('A', 'spades'), c('K', 'spades')],
      [
        c('Q', 'spades'),
        c('J', 'spades'),
        c('10', 'spades'),
        c('2', 'diamonds'),
        c('2', 'clubs')
      ]
    );

    expect(best.category).toBe('Straight Flush');
    expect(best.tiebreakers).toEqual([14]);
  });

  it('selects the strongest full house from two trips', () => {
    const best = evaluateBestTexasHoldemHand(
      [c('A', 'spades'), c('A', 'clubs')],
      [
        c('A', 'hearts'),
        c('K', 'spades'),
        c('K', 'diamonds'),
        c('K', 'clubs'),
        c('2', 'clubs')
      ]
    );

    expect(best.category).toBe('Full House');
    expect(best.tiebreakers).toEqual([14, 13]);
  });

  it('compares two-pair hands by top pair, second pair, then kicker', () => {
    const acesKingsQueen = evaluateFiveCardHand([
      c('A', 'spades'),
      c('A', 'clubs'),
      c('K', 'hearts'),
      c('K', 'diamonds'),
      c('Q', 'spades')
    ]);
    const acesKingsJack = evaluateFiveCardHand([
      c('A', 'hearts'),
      c('A', 'diamonds'),
      c('K', 'clubs'),
      c('K', 'spades'),
      c('J', 'clubs')
    ]);

    expect(comparePokerHands(acesKingsQueen, acesKingsJack)).toBeGreaterThan(0);
  });
});
