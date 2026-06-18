import { describe, expect, it } from 'vitest';
import { BlackjackCard } from '../../../domain/blackjack';
import { CasinoService } from '../../casinoService';
import { actBlackjackRound, startBlackjackRound } from '../blackjackEngine';

const c = (rank: BlackjackCard['rank'], suit: BlackjackCard['suit'] = 'spades'): BlackjackCard => ({ rank, suit });
const shoeForDeal = (cards: BlackjackCard[]) => [...cards].reverse();

describe('blackjack backend engine', () => {
  it('starts a round by locking stake and hiding dealer hole card', async () => {
    const service = new CasinoService({ user_1: 1000 });

    const result = await startBlackjackRound(
      service,
      { userId: 'user_1', stake: 100, idempotencyKey: 'bj-start-1' },
      { shoe: shoeForDeal([c('10'), c('9'), c('8'), c('7'), c('2')]) }
    );

    expect(result.round.status).toBe('open');
    expect(result.wallet.available).toBe(900);
    expect(result.wallet.locked).toBe(100);
    expect(result.view.playerHand.map(card => card.rank)).toEqual(['10', '8']);
    expect(result.view.dealerHand.map(card => card.rank)).toEqual(['9']);
    expect(result.view.dealerHoleHidden).toBe(true);
  });

  it('persists hit state without settling when player does not bust', async () => {
    const service = new CasinoService({ user_1: 1000 });
    const started = await startBlackjackRound(
      service,
      { userId: 'user_1', stake: 100, idempotencyKey: 'bj-start-2' },
      { shoe: shoeForDeal([c('7'), c('9'), c('8'), c('7'), c('2')]) }
    );

    const hit = await actBlackjackRound(service, {
      roundId: started.round.id,
      action: 'hit',
      idempotencyKey: 'bj-hit-2'
    });

    expect(hit.round.status).toBe('open');
    expect(hit.view.playerHand.map(card => card.rank)).toEqual(['7', '8', '2']);
    expect(hit.view.playerScore).toBe(17);
    expect(hit.wallet.locked).toBe(100);
  });

  it('stands, draws dealer cards, settles win, and unlocks wallet', async () => {
    const service = new CasinoService({ user_1: 1000 });
    const started = await startBlackjackRound(
      service,
      { userId: 'user_1', stake: 100, idempotencyKey: 'bj-start-3' },
      { shoe: shoeForDeal([c('10'), c('6'), c('9'), c('7'), c('10')]) }
    );

    const stood = await actBlackjackRound(service, {
      roundId: started.round.id,
      action: 'stand',
      idempotencyKey: 'bj-stand-3'
    });

    expect(stood.round.status).toBe('settled');
    expect(stood.view.dealerHand.map(card => card.rank)).toEqual(['6', '7', '10']);
    expect(stood.view.settlement?.status).toBe('win');
    expect(stood.view.settlement?.payout).toBe(200);
    expect(stood.wallet.available).toBe(1100);
    expect(stood.wallet.locked).toBe(0);
  });

  it('auto-settles natural blackjack on deal', async () => {
    const service = new CasinoService({ user_1: 1000 });

    const result = await startBlackjackRound(
      service,
      { userId: 'user_1', stake: 100, idempotencyKey: 'bj-natural-1' },
      { shoe: shoeForDeal([c('A'), c('9'), c('K'), c('7')]) }
    );

    expect(result.round.status).toBe('settled');
    expect(result.view.settlement?.status).toBe('blackjack');
    expect(result.view.settlement?.payout).toBe(250);
    expect(result.wallet.available).toBe(1150);
    expect(result.wallet.locked).toBe(0);
  });

  it('double down locks an extra stake, draws one card, and settles doubled payout', async () => {
    const service = new CasinoService({ user_1: 1000 });
    const started = await startBlackjackRound(
      service,
      { userId: 'user_1', stake: 50, idempotencyKey: 'bj-double-start' },
      { shoe: shoeForDeal([c('10'), c('6'), c('8'), c('7'), c('3'), c('10')]) }
    );

    const doubled = await actBlackjackRound(service, {
      roundId: started.round.id,
      action: 'double',
      idempotencyKey: 'bj-double-action'
    });

    expect(doubled.round.status).toBe('settled');
    expect(doubled.round.stake).toBe(100);
    expect(doubled.view.playerHand.map(card => card.rank)).toEqual(['10', '8', '3']);
    expect(doubled.view.settlement?.status).toBe('win');
    expect(doubled.view.settlement?.payout).toBe(200);
    expect(doubled.wallet.available).toBe(1100);
    expect(doubled.wallet.locked).toBe(0);
    expect(service.getLedger('user_1')).toHaveLength(3);
  });

  it('splits matching cards, plays both hands, and settles combined payout', async () => {
    const service = new CasinoService({ user_1: 1000 });
    const started = await startBlackjackRound(
      service,
      { userId: 'user_1', stake: 50, idempotencyKey: 'bj-split-start' },
      { shoe: shoeForDeal([c('8'), c('6'), c('8'), c('7'), c('2'), c('3'), c('10')]) }
    );

    const split = await actBlackjackRound(service, {
      roundId: started.round.id,
      action: 'split',
      idempotencyKey: 'bj-split-action'
    });

    expect(split.round.stake).toBe(100);
    expect(split.wallet.available).toBe(900);
    expect(split.wallet.locked).toBe(100);
    expect(split.view.playerHand.map(card => card.rank)).toEqual(['8', '2']);
    expect(split.view.splitHand?.map(card => card.rank)).toEqual(['8', '3']);
    expect(split.view.activeHandIndex).toBe(0);

    const firstStand = await actBlackjackRound(service, {
      roundId: started.round.id,
      action: 'stand',
      idempotencyKey: 'bj-split-stand-1'
    });

    expect(firstStand.round.status).toBe('open');
    expect(firstStand.view.activeHandIndex).toBe(1);
    expect(firstStand.wallet.locked).toBe(100);

    const secondStand = await actBlackjackRound(service, {
      roundId: started.round.id,
      action: 'stand',
      idempotencyKey: 'bj-split-stand-2'
    });

    expect(secondStand.round.status).toBe('settled');
    expect(secondStand.view.dealerHand.map(card => card.rank)).toEqual(['6', '7', '10']);
    expect(secondStand.view.settlement?.status).toBe('win');
    expect(secondStand.view.splitSettlement?.status).toBe('win');
    expect(secondStand.round.payout).toBe(200);
    expect(secondStand.wallet.available).toBe(1100);
    expect(secondStand.wallet.locked).toBe(0);
    expect(service.getLedger('user_1')).toHaveLength(3);
  });
});
