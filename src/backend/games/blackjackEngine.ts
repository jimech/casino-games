import { randomInt, randomUUID } from 'node:crypto';
import { WalletState } from '../../domain/ledger';
import { asMoney } from '../../domain/money';
import {
  BlackjackCard,
  BlackjackSettlement,
  hiLoCountForCards,
  scoreBlackjackHand,
  settleBlackjackHand,
  shouldDealerDraw
} from '../../domain/blackjack';
import { GameRoundRecord } from '../casinoService';

type BlackjackPhase = 'player' | 'settled';
type BlackjackAction = 'hit' | 'stand' | 'double' | 'split';

interface BlackjackRoundState {
  game: 'blackjack';
  phase: BlackjackPhase;
  shoe: BlackjackCard[];
  playerHand: BlackjackCard[];
  splitHand?: BlackjackCard[];
  activeHandIndex?: 0 | 1;
  handStatuses?: ['playing' | 'stand' | 'busted', 'playing' | 'stand' | 'busted'];
  dealerHand: BlackjackCard[];
  runningCount: number;
  cardsPlayedCount: number;
  settlement?: BlackjackSettlement;
  splitSettlement?: BlackjackSettlement;
  lastAction?: BlackjackAction | 'deal';
  doubled?: boolean;
}

export interface BlackjackView {
  roundId: string;
  phase: BlackjackPhase;
  playerHand: BlackjackCard[];
  splitHand?: BlackjackCard[];
  activeHandIndex: 0 | 1;
  dealerHand: BlackjackCard[];
  dealerHoleHidden: boolean;
  playerScore: number;
  splitScore?: number;
  dealerScore?: number;
  runningCount: number;
  cardsPlayedCount: number;
  settlement?: BlackjackSettlement;
  splitSettlement?: BlackjackSettlement;
}

export interface BlackjackStartInput {
  userId: string;
  stake: number;
  idempotencyKey?: string;
}

export interface BlackjackActionInput {
  roundId: string;
  action: BlackjackAction;
  idempotencyKey?: string;
}

export interface BlackjackResult {
  round: GameRoundRecord;
  wallet: WalletState;
  view: BlackjackView;
}

interface BlackjackEngineOptions {
  shoe?: BlackjackCard[];
}

type MaybePromise<T> = T | Promise<T>;

type CasinoServiceLike = {
  placeBet(input: {
    userId: string;
    gameId: string;
    stake: number;
    idempotencyKey: string;
    initialOutcome?: unknown;
  }): MaybePromise<GameRoundRecord>;
  settleRound(input: {
    roundId: string;
    payout: number;
    idempotencyKey: string;
    outcome?: unknown;
  }): MaybePromise<GameRoundRecord>;
  addRoundStake(input: {
    roundId: string;
    amount: number;
    idempotencyKey: string;
    reason?: string;
  }): MaybePromise<GameRoundRecord>;
  updateRoundOutcome(input: {
    roundId: string;
    outcome: unknown;
    eventType?: string;
  }): MaybePromise<GameRoundRecord>;
  getWallet(userId: string): MaybePromise<WalletState>;
  listRounds(userId?: string): MaybePromise<GameRoundRecord[]>;
};

const SUITS: BlackjackCard['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: BlackjackCard['rank'][] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export const startBlackjackRound = async (
  service: CasinoServiceLike,
  input: BlackjackStartInput,
  options: BlackjackEngineOptions = {}
): Promise<BlackjackResult> => {
  assertText(input.userId, 'userId');
  const stake = asMoney(input.stake);
  if (stake <= 0) throw new Error('Blackjack stake must be greater than zero');
  const idempotencyKey = input.idempotencyKey || `blackjack-${randomUUID()}`;

  const shoe = options.shoe ? [...options.shoe] : shuffle(createShoe(6));
  if (shoe.length < 4) throw new Error('Blackjack shoe does not contain enough cards');

  const playerCard1 = draw(shoe);
  const dealerCard1 = draw(shoe);
  const playerCard2 = draw(shoe);
  const dealerCard2 = draw(shoe);
  const playerHand = [playerCard1, playerCard2];
  const dealerHand = [dealerCard1, dealerCard2];
  const visibleCards = [playerHand[0], playerHand[1], dealerHand[0]];
  const state: BlackjackRoundState = {
    game: 'blackjack',
    phase: 'player',
    shoe,
    playerHand,
    activeHandIndex: 0,
    handStatuses: ['playing', 'playing'],
    dealerHand,
    runningCount: hiLoCountForCards(visibleCards),
    cardsPlayedCount: visibleCards.length,
    lastAction: 'deal'
  };

  const round = await service.placeBet({
    userId: input.userId,
    gameId: 'blackjack',
    stake,
    idempotencyKey: `${idempotencyKey}:lock`,
    initialOutcome: state
  });

  if (round.status === 'settled') {
    return {
      round: sanitizeRound(round),
      wallet: await service.getWallet(round.userId),
      view: toView(round)
    };
  }

  const settled = maybeSettleNatural(service, round, state, `${idempotencyKey}:settle`);
  const finalRound = await settled;
  return {
    round: sanitizeRound(finalRound),
    wallet: await service.getWallet(finalRound.userId),
    view: toView(finalRound)
  };
};

export const actBlackjackRound = async (
  service: CasinoServiceLike,
  input: BlackjackActionInput
): Promise<BlackjackResult> => {
  assertText(input.roundId, 'roundId');
  if (input.action !== 'hit' && input.action !== 'stand' && input.action !== 'double' && input.action !== 'split') {
    throw new Error(`Unsupported blackjack action ${input.action}`);
  }

  const round = await findRound(service, input.roundId);
  if (round.gameId !== 'blackjack') throw new Error(`Round ${round.id} is not a blackjack round`);
  if (round.status === 'settled') {
    return {
      round: sanitizeRound(round),
      wallet: await service.getWallet(round.userId),
      view: toView(round)
    };
  }

  const state = readBlackjackState(round);
  const idempotencyKey = input.idempotencyKey || `blackjack-${round.id}-${input.action}-${randomUUID()}`;

  if (input.action === 'split') {
    if (state.splitHand) throw new Error('Blackjack round is already split');
    if (state.playerHand.length !== 2) throw new Error('Split is only available on the first two cards');
    if (scoreCard(state.playerHand[0]) !== scoreCard(state.playerHand[1])) {
      throw new Error('Split requires two cards with the same value');
    }

    const splitRound = await service.addRoundStake({
      roundId: round.id,
      amount: round.stake,
      idempotencyKey: `${idempotencyKey}:split-lock`,
      reason: 'blackjack-split'
    });
    const [firstCard, secondCard] = state.playerHand;
    const firstDraw = draw(state.shoe);
    const secondDraw = draw(state.shoe);
    state.playerHand = [firstCard, firstDraw];
    state.splitHand = [secondCard, secondDraw];
    state.activeHandIndex = 0;
    state.handStatuses = ['playing', 'playing'];
    state.runningCount += hiLoCountForCards([firstDraw, secondDraw]);
    state.cardsPlayedCount += 2;
    state.lastAction = 'split';

    const updated = await service.updateRoundOutcome({
      roundId: splitRound.id,
      outcome: state,
      eventType: 'split'
    });
    return {
      round: sanitizeRound(updated),
      wallet: await service.getWallet(updated.userId),
      view: toView(updated)
    };
  }

  if (input.action === 'double') {
    if (state.splitHand) throw new Error('Double after split is not supported yet');
    if (state.playerHand.length !== 2) throw new Error('Double down is only available on the first two cards');
    const doubledRound = await service.addRoundStake({
      roundId: round.id,
      amount: round.stake,
      idempotencyKey: `${idempotencyKey}:double-lock`,
      reason: 'blackjack-double'
    });
    const card = draw(state.shoe);
    state.playerHand.push(card);
    state.runningCount += hiLoCountForCards([card]);
    state.cardsPlayedCount += 1;
    state.lastAction = 'double';
    state.doubled = true;
    revealDealerHole(state);
    while (scoreBlackjackHand(state.playerHand) <= 21 && shouldDealerDraw(state.dealerHand)) {
      const dealerCard = draw(state.shoe);
      state.dealerHand.push(dealerCard);
      state.runningCount += hiLoCountForCards([dealerCard]);
      state.cardsPlayedCount += 1;
    }
    const settled = await settle(service, doubledRound, state, `${idempotencyKey}:settle`);
    return {
      round: sanitizeRound(settled),
      wallet: await service.getWallet(settled.userId),
      view: toView(settled)
    };
  }

  if (input.action === 'hit') {
    const activeHand = getActivePlayerHand(state);
    const card = draw(state.shoe);
    activeHand.push(card);
    state.runningCount += hiLoCountForCards([card]);
    state.cardsPlayedCount += 1;
    state.lastAction = 'hit';

    if (scoreBlackjackHand(activeHand) > 21) {
      markActiveHand(state, 'busted');
      if (moveToNextSplitHand(state)) {
        const updated = await service.updateRoundOutcome({
          roundId: round.id,
          outcome: state,
          eventType: 'hit'
        });
        return {
          round: sanitizeRound(updated),
          wallet: await service.getWallet(updated.userId),
          view: toView(updated)
        };
      }
      const settled = await settle(service, round, state, idempotencyKey);
      return {
        round: sanitizeRound(settled),
        wallet: await service.getWallet(settled.userId),
        view: toView(settled)
      };
    }

    const updated = await service.updateRoundOutcome({
      roundId: round.id,
      outcome: state,
      eventType: 'hit'
    });
    return {
      round: sanitizeRound(updated),
      wallet: await service.getWallet(updated.userId),
      view: toView(updated)
    };
  }

  state.lastAction = 'stand';
  markActiveHand(state, 'stand');
  if (moveToNextSplitHand(state)) {
    const updated = await service.updateRoundOutcome({
      roundId: round.id,
      outcome: state,
      eventType: 'stand'
    });
    return {
      round: sanitizeRound(updated),
      wallet: await service.getWallet(updated.userId),
      view: toView(updated)
    };
  }
  revealDealerHole(state);
  while (shouldDealerDraw(state.dealerHand)) {
    const card = draw(state.shoe);
    state.dealerHand.push(card);
    state.runningCount += hiLoCountForCards([card]);
    state.cardsPlayedCount += 1;
  }
  const settled = await settle(service, round, state, idempotencyKey);
  return {
    round: sanitizeRound(settled),
    wallet: await service.getWallet(settled.userId),
    view: toView(settled)
  };
};

const sanitizeRound = (round: GameRoundRecord): GameRoundRecord => ({
  ...round,
  outcome: undefined
});

const maybeSettleNatural = async (
  service: CasinoServiceLike,
  round: GameRoundRecord,
  state: BlackjackRoundState,
  idempotencyKey: string
): Promise<GameRoundRecord> => {
  const playerScore = scoreBlackjackHand(state.playerHand);
  const dealerScore = scoreBlackjackHand(state.dealerHand);
  if (playerScore !== 21 && dealerScore !== 21) return round;
  revealDealerHole(state);
  return settle(service, round, state, idempotencyKey);
};

const settle = async (
  service: CasinoServiceLike,
  round: GameRoundRecord,
  state: BlackjackRoundState,
  idempotencyKey: string
) => {
  state.phase = 'settled';
  const baseStake = state.splitHand ? asMoney(round.stake / 2) : state.doubled ? asMoney(round.stake / 2) : round.stake;
  state.settlement = settleBlackjackHand(state.playerHand, state.dealerHand, baseStake, {
    doubled: state.doubled,
    naturalBlackjackAllowed: !state.splitHand
  });
  if (state.splitHand) {
    state.splitSettlement = settleBlackjackHand(state.splitHand, state.dealerHand, baseStake, {
      naturalBlackjackAllowed: false
    });
  }
  const payout = state.settlement.payout + (state.splitSettlement?.payout ?? 0);
  return service.settleRound({
    roundId: round.id,
    payout,
    idempotencyKey,
    outcome: state
  });
};

const revealDealerHole = (state: BlackjackRoundState) => {
  if (state.cardsPlayedCount < 4) {
    state.runningCount += hiLoCountForCards([state.dealerHand[1]]);
    state.cardsPlayedCount += 1;
  }
};

const toView = (round: GameRoundRecord): BlackjackView => {
  const state = readBlackjackState(round);
  const settled = round.status === 'settled' || state.phase === 'settled';
  return {
    roundId: round.id,
    phase: settled ? 'settled' : 'player',
    playerHand: state.playerHand,
    splitHand: state.splitHand,
    activeHandIndex: state.activeHandIndex ?? 0,
    dealerHand: settled ? state.dealerHand : [state.dealerHand[0]],
    dealerHoleHidden: !settled,
    playerScore: scoreBlackjackHand(state.playerHand),
    splitScore: state.splitHand ? scoreBlackjackHand(state.splitHand) : undefined,
    dealerScore: settled ? scoreBlackjackHand(state.dealerHand) : scoreBlackjackHand([state.dealerHand[0]]),
    runningCount: state.runningCount,
    cardsPlayedCount: state.cardsPlayedCount,
    settlement: state.settlement,
    splitSettlement: state.splitSettlement
  };
};

const getActivePlayerHand = (state: BlackjackRoundState) => (
  state.splitHand && state.activeHandIndex === 1 ? state.splitHand : state.playerHand
);

const markActiveHand = (state: BlackjackRoundState, status: 'stand' | 'busted') => {
  if (!state.splitHand) return;
  const statuses = state.handStatuses ?? ['playing', 'playing'];
  statuses[state.activeHandIndex ?? 0] = status;
  state.handStatuses = statuses;
};

const moveToNextSplitHand = (state: BlackjackRoundState) => {
  if (!state.splitHand) return false;
  if ((state.activeHandIndex ?? 0) === 0) {
    state.activeHandIndex = 1;
    return true;
  }
  return false;
};

const scoreCard = (card: BlackjackCard) => {
  if (card.rank === 'A') return 11;
  if (['10', 'J', 'Q', 'K'].includes(card.rank)) return 10;
  return Number(card.rank);
};

const findRound = async (service: CasinoServiceLike, roundId: string) => {
  const rounds = await service.listRounds();
  const round = rounds.find(candidate => candidate.id === roundId);
  if (!round) throw new Error(`Round not found: ${roundId}`);
  return round;
};

const readBlackjackState = (round: GameRoundRecord): BlackjackRoundState => {
  if (!isRecord(round.outcome) || round.outcome.game !== 'blackjack') {
    throw new Error(`Blackjack round ${round.id} is missing state`);
  }
  return round.outcome as unknown as BlackjackRoundState;
};

const createShoe = (deckCount: number): BlackjackCard[] => {
  const shoe: BlackjackCard[] = [];
  for (let deck = 0; deck < deckCount; deck++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        shoe.push({ suit, rank });
      }
    }
  }
  return shoe;
};

const shuffle = (cards: BlackjackCard[]) => {
  for (let index = cards.length - 1; index > 0; index--) {
    const swapIndex = randomInt(index + 1);
    [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
  }
  return cards;
};

const draw = (shoe: BlackjackCard[]) => {
  const card = shoe.pop();
  if (!card) throw new Error('Blackjack shoe is empty');
  return card;
};

const assertText = (value: string, field: string) => {
  if (!value || typeof value !== 'string') {
    throw new Error(`${field} is required`);
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);
