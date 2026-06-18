import { describe, expect, it } from 'vitest';
import { PlayingCard } from '../../../domain/poker';
import { CasinoService } from '../../casinoService';
import { actPokerRound, startPokerRound } from '../pokerEngine';

const c = (rank: PlayingCard['rank'], suit: PlayingCard['suit'] = 'spades'): PlayingCard => ({ rank, suit });
const deckForDeal = (cards: PlayingCard[]) => [...cards].reverse();

describe('poker backend engine', () => {
  it('starts a holdem round by locking ante and hiding dealer cards', async () => {
    const service = new CasinoService({ user_1: 1000 });

    const result = await startPokerRound(
      service,
      { userId: 'user_1', ante: 10, idempotencyKey: 'poker-start-1' },
      { deck: deckForDeal([c('A'), c('2'), c('K'), c('3'), c('4'), c('5'), c('6'), c('7'), c('8')]) }
    );

    expect(result.round.status).toBe('open');
    expect(result.wallet.available).toBe(990);
    expect(result.wallet.locked).toBe(10);
    expect(result.view.pot).toBe(20);
    expect(result.view.playerCards.map(card => card.rank)).toEqual(['A', 'K']);
    expect(result.view.dealerCards).toEqual([]);
    expect(result.view.dealerCardsHidden).toBe(true);
  });

  it('progresses community cards through flop, turn, river, and showdown', async () => {
    const service = new CasinoService({ user_1: 1000 });
    const started = await startPokerRound(
      service,
      { userId: 'user_1', ante: 10, idempotencyKey: 'poker-start-2' },
      {
        deck: deckForDeal([
          c('A', 'spades'), c('2', 'clubs'), c('K', 'spades'), c('3', 'clubs'),
          c('4', 'diamonds'), c('Q', 'spades'), c('J', 'spades'), c('10', 'spades'),
          c('5', 'diamonds'), c('9', 'hearts'), c('6', 'diamonds'), c('8', 'diamonds')
        ])
      }
    );

    const flop = await actPokerRound(service, {
      roundId: started.round.id,
      action: 'check',
      idempotencyKey: 'poker-flop-2'
    });
    expect(flop.view.stage).toBe('flop');
    expect(flop.view.communityCards.map(card => card.rank)).toEqual(['Q', 'J', '10']);

    const turn = await actPokerRound(service, {
      roundId: started.round.id,
      action: 'check',
      idempotencyKey: 'poker-turn-2'
    });
    expect(turn.view.stage).toBe('turn');
    expect(turn.view.communityCards.map(card => card.rank)).toEqual(['Q', 'J', '10', '9']);

    const river = await actPokerRound(service, {
      roundId: started.round.id,
      action: 'check',
      idempotencyKey: 'poker-river-2'
    });
    expect(river.view.stage).toBe('river');
    expect(river.view.communityCards.map(card => card.rank)).toEqual(['Q', 'J', '10', '9', '8']);

    const showdown = await actPokerRound(service, {
      roundId: started.round.id,
      action: 'check',
      idempotencyKey: 'poker-showdown-2'
    });
    expect(showdown.round.status).toBe('settled');
    expect(showdown.view.winner).toBe('player');
    expect(showdown.view.playerRank?.category).toBe('Straight Flush');
    expect(showdown.view.payout).toBe(20);
    expect(showdown.wallet.available).toBe(1010);
    expect(showdown.wallet.locked).toBe(0);
  });

  it('raise locks extra stake and dealer matches into the pot', async () => {
    const service = new CasinoService({ user_1: 1000 });
    const started = await startPokerRound(
      service,
      { userId: 'user_1', ante: 10, idempotencyKey: 'poker-start-3' },
      { deck: deckForDeal([c('A'), c('2'), c('K'), c('3'), c('4'), c('5'), c('6'), c('7'), c('8')]) }
    );

    const raised = await actPokerRound(service, {
      roundId: started.round.id,
      action: 'raise',
      idempotencyKey: 'poker-raise-3'
    });

    expect(raised.round.stake).toBe(30);
    expect(raised.wallet.available).toBe(970);
    expect(raised.wallet.locked).toBe(30);
    expect(raised.view.pot).toBe(60);
    expect(service.getLedger('user_1')).toHaveLength(2);
  });

  it('fold settles the round as a loss', async () => {
    const service = new CasinoService({ user_1: 1000 });
    const started = await startPokerRound(
      service,
      { userId: 'user_1', ante: 10, idempotencyKey: 'poker-start-4' },
      { deck: deckForDeal([c('A'), c('2'), c('K'), c('3'), c('4'), c('5'), c('6'), c('7'), c('8')]) }
    );

    const folded = await actPokerRound(service, {
      roundId: started.round.id,
      action: 'fold',
      idempotencyKey: 'poker-fold-4'
    });

    expect(folded.round.status).toBe('settled');
    expect(folded.view.stage).toBe('folded');
    expect(folded.view.winner).toBe('dealer');
    expect(folded.wallet.available).toBe(990);
    expect(folded.wallet.locked).toBe(0);
  });
});
