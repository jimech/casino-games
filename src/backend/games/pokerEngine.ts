import { randomInt, randomUUID } from 'node:crypto';
import { WalletState } from '../../domain/ledger';
import { asMoney } from '../../domain/money';
import {
  PlayingCard,
  PokerHandRank,
  comparePokerHands,
  evaluateBestTexasHoldemHand
} from '../../domain/poker';
import { GameRoundRecord } from '../casinoService';

type PokerStage = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'folded';
type PokerAction = 'check' | 'call' | 'raise' | 'fold';

interface PokerRoundState {
  game: 'poker';
  stage: PokerStage;
  deck: PlayingCard[];
  playerCards: [PlayingCard, PlayingCard];
  dealerCards: [PlayingCard, PlayingCard];
  communityCards: PlayingCard[];
  pot: number;
  playerContribution: number;
  dealerContribution: number;
  dealerActionStatus: string;
  playerRank?: PokerHandRank;
  dealerRank?: PokerHandRank;
  winner?: 'player' | 'dealer' | 'push';
  payout?: number;
}

export interface PokerView {
  roundId: string;
  stage: PokerStage;
  playerCards: [PlayingCard, PlayingCard];
  dealerCards: PlayingCard[];
  dealerCardsHidden: boolean;
  communityCards: PlayingCard[];
  pot: number;
  playerContribution: number;
  dealerContribution: number;
  dealerActionStatus: string;
  playerRank?: PokerHandRank;
  dealerRank?: PokerHandRank;
  winner?: 'player' | 'dealer' | 'push';
  payout?: number;
}

export interface PokerStartInput {
  userId: string;
  ante: number;
  idempotencyKey?: string;
}

export interface PokerActionInput {
  roundId: string;
  action: PokerAction;
  idempotencyKey?: string;
}

export interface PokerResult {
  round: GameRoundRecord;
  wallet: WalletState;
  view: PokerView;
}

interface PokerEngineOptions {
  deck?: PlayingCard[];
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
  getWallet(userId: string): MaybePromise<WalletState>;
  updateRoundOutcome(input: {
    roundId: string;
    outcome: unknown;
    eventType?: string;
  }): MaybePromise<GameRoundRecord>;
  listRounds(userId?: string): MaybePromise<GameRoundRecord[]>;
};

const SUITS: PlayingCard['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: PlayingCard['rank'][] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RAISE_AMOUNT = 20;

export const startPokerRound = async (
  service: CasinoServiceLike,
  input: PokerStartInput,
  options: PokerEngineOptions = {}
): Promise<PokerResult> => {
  assertText(input.userId, 'userId');
  const ante = asMoney(input.ante);
  if (ante <= 0) throw new Error('Poker ante must be greater than zero');
  const idempotencyKey = input.idempotencyKey || `poker-${randomUUID()}`;
  const deck = options.deck ? [...options.deck] : shuffle(createDeck());
  if (deck.length < 9) throw new Error('Poker deck does not contain enough cards');

  const playerCard1 = draw(deck);
  const dealerCard1 = draw(deck);
  const playerCard2 = draw(deck);
  const dealerCard2 = draw(deck);
  const state: PokerRoundState = {
    game: 'poker',
    stage: 'preflop',
    deck,
    playerCards: [playerCard1, playerCard2],
    dealerCards: [dealerCard1, dealerCard2],
    communityCards: [],
    pot: ante * 2,
    playerContribution: ante,
    dealerContribution: ante,
    dealerActionStatus: 'Checked standard blind'
  };

  const round = await service.placeBet({
    userId: input.userId,
    gameId: 'poker',
    stake: ante,
    idempotencyKey: `${idempotencyKey}:lock`,
    initialOutcome: state
  });

  return {
    round: sanitizeRound(round),
    wallet: await service.getWallet(round.userId),
    view: toView(round)
  };
};

export const actPokerRound = async (
  service: CasinoServiceLike,
  input: PokerActionInput
): Promise<PokerResult> => {
  assertText(input.roundId, 'roundId');
  if (!['check', 'call', 'raise', 'fold'].includes(input.action)) {
    throw new Error(`Unsupported poker action ${input.action}`);
  }

  const round = await findRound(service, input.roundId);
  if (round.gameId !== 'poker') throw new Error(`Round ${round.id} is not a poker round`);
  if (round.status === 'settled') {
    return {
      round: sanitizeRound(round),
      wallet: await service.getWallet(round.userId),
      view: toView(round)
    };
  }

  const state = readPokerState(round);
  const idempotencyKey = input.idempotencyKey || `poker-${round.id}-${input.action}-${randomUUID()}`;

  if (input.action === 'fold') {
    state.stage = 'folded';
    state.winner = 'dealer';
    state.payout = 0;
    state.dealerActionStatus = 'Dealer takes pot after fold';
    const settled = await service.settleRound({
      roundId: round.id,
      payout: 0,
      idempotencyKey,
      outcome: state
    });
    return result(service, settled);
  }

  let activeRound = round;
  if (input.action === 'raise') {
    activeRound = await service.addRoundStake({
      roundId: round.id,
      amount: RAISE_AMOUNT,
      idempotencyKey: `${idempotencyKey}:raise-lock`,
      reason: 'poker-raise'
    });
    state.playerContribution += RAISE_AMOUNT;
    state.dealerContribution += RAISE_AMOUNT;
    state.pot += RAISE_AMOUNT * 2;
    state.dealerActionStatus = 'Dealer matched raise';
  } else if (input.action === 'call') {
    state.dealerActionStatus = 'Dealer checked call';
  } else {
    state.dealerActionStatus = 'Dealer checks';
  }

  progressBoard(state);
  if (state.stage === 'showdown') {
    settleShowdown(state);
    const settled = await service.settleRound({
      roundId: activeRound.id,
      payout: state.payout ?? 0,
      idempotencyKey,
      outcome: state
    });
    return result(service, settled);
  }

  const updated = await service.updateRoundOutcome({
    roundId: activeRound.id,
    outcome: state,
    eventType: input.action
  });
  return result(service, updated);
};

const progressBoard = (state: PokerRoundState) => {
  if (state.stage === 'preflop') {
    burn(state.deck);
    state.communityCards.push(draw(state.deck), draw(state.deck), draw(state.deck));
    state.stage = 'flop';
    return;
  }
  if (state.stage === 'flop') {
    burn(state.deck);
    state.communityCards.push(draw(state.deck));
    state.stage = 'turn';
    return;
  }
  if (state.stage === 'turn') {
    burn(state.deck);
    state.communityCards.push(draw(state.deck));
    state.stage = 'river';
    return;
  }
  if (state.stage === 'river') {
    state.stage = 'showdown';
  }
};

const settleShowdown = (state: PokerRoundState) => {
  state.playerRank = evaluateBestTexasHoldemHand(state.playerCards, state.communityCards);
  state.dealerRank = evaluateBestTexasHoldemHand(state.dealerCards, state.communityCards);
  const comparison = comparePokerHands(state.playerRank, state.dealerRank);
  if (comparison > 0) {
    state.winner = 'player';
    state.payout = state.pot;
  } else if (comparison < 0) {
    state.winner = 'dealer';
    state.payout = 0;
  } else {
    state.winner = 'push';
    state.payout = Math.floor(state.pot / 2);
  }
  state.dealerActionStatus = 'Showdown complete';
};

const result = async (service: CasinoServiceLike, round: GameRoundRecord): Promise<PokerResult> => ({
  round: sanitizeRound(round),
  wallet: await service.getWallet(round.userId),
  view: toView(round)
});

const toView = (round: GameRoundRecord): PokerView => {
  const state = readPokerState(round);
  const revealDealer = round.status === 'settled' || state.stage === 'showdown' || state.stage === 'folded';
  return {
    roundId: round.id,
    stage: state.stage,
    playerCards: state.playerCards,
    dealerCards: revealDealer ? state.dealerCards : [],
    dealerCardsHidden: !revealDealer,
    communityCards: state.communityCards,
    pot: state.pot,
    playerContribution: state.playerContribution,
    dealerContribution: state.dealerContribution,
    dealerActionStatus: state.dealerActionStatus,
    playerRank: state.playerRank,
    dealerRank: revealDealer ? state.dealerRank : undefined,
    winner: state.winner,
    payout: state.payout
  };
};

const sanitizeRound = (round: GameRoundRecord): GameRoundRecord => ({
  ...round,
  outcome: undefined
});

const findRound = async (service: CasinoServiceLike, roundId: string) => {
  const rounds = await service.listRounds();
  const round = rounds.find(candidate => candidate.id === roundId);
  if (!round) throw new Error(`Round not found: ${roundId}`);
  return round;
};

const readPokerState = (round: GameRoundRecord): PokerRoundState => {
  if (!isRecord(round.outcome) || round.outcome.game !== 'poker') {
    throw new Error(`Poker round ${round.id} is missing state`);
  }
  return round.outcome as unknown as PokerRoundState;
};

const createDeck = (): PlayingCard[] => {
  const deck: PlayingCard[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
};

const shuffle = (cards: PlayingCard[]) => {
  for (let index = cards.length - 1; index > 0; index--) {
    const swapIndex = randomInt(index + 1);
    [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
  }
  return cards;
};

const draw = (deck: PlayingCard[]) => {
  const card = deck.pop();
  if (!card) throw new Error('Poker deck is empty');
  return card;
};

const burn = (deck: PlayingCard[]) => {
  draw(deck);
};

const assertText = (value: string, field: string) => {
  if (!value || typeof value !== 'string') {
    throw new Error(`${field} is required`);
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);
