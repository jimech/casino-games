import { describe, expect, it } from 'vitest';
import {
  BlackjackCard,
  canSplitBlackjackHand,
  hiLoCountForCards,
  isNaturalBlackjack,
  scoreBlackjackHand,
  settleBlackjackHand,
  shouldDealerDraw
} from '../blackjack';
import { asMoney } from '../money';

const c = (rank: BlackjackCard['rank'], suit: BlackjackCard['suit'] = 'spades'): BlackjackCard => ({ rank, suit });

describe('blackjack math', () => {
  it('scores aces as soft or hard without busting when possible', () => {
    expect(scoreBlackjackHand([c('A'), c('7')])).toBe(18);
    expect(scoreBlackjackHand([c('A'), c('7'), c('9')])).toBe(17);
    expect(scoreBlackjackHand([c('A'), c('A'), c('9')])).toBe(21);
  });

  it('detects natural blackjack and split eligibility', () => {
    expect(isNaturalBlackjack([c('A'), c('K')])).toBe(true);
    expect(canSplitBlackjackHand([c('10'), c('K')])).toBe(true);
    expect(canSplitBlackjackHand([c('9'), c('K')])).toBe(false);
  });

  it('stands on soft 17 by default and can optionally hit it', () => {
    const soft17 = [c('A'), c('6')];
    expect(shouldDealerDraw(soft17)).toBe(false);
    expect(shouldDealerDraw(soft17, true)).toBe(true);
    expect(shouldDealerDraw([c('10'), c('6')])).toBe(true);
  });

  it('computes Hi-Lo count values', () => {
    expect(hiLoCountForCards([c('2'), c('6'), c('7'), c('10'), c('A')])).toBe(0);
  });

  it('settles natural blackjack at 3:2 plus stake', () => {
    const result = settleBlackjackHand(
      [c('A'), c('Q')],
      [c('10'), c('8')],
      asMoney(100)
    );

    expect(result.status).toBe('blackjack');
    expect(result.payout).toBe(250);
  });

  it('settles double down with doubled stake', () => {
    const result = settleBlackjackHand(
      [c('10'), c('8'), c('3')],
      [c('10'), c('7')],
      asMoney(50),
      { doubled: true }
    );

    expect(result.status).toBe('win');
    expect(result.payout).toBe(200);
  });

  it('refunds stake on push and returns zero on player bust', () => {
    expect(settleBlackjackHand([c('10'), c('8')], [c('9'), c('9')], asMoney(25)).payout).toBe(25);
    expect(settleBlackjackHand([c('10'), c('8'), c('7')], [c('9'), c('7')], asMoney(25)).payout).toBe(0);
  });
});
