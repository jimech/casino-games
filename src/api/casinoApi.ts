interface WalletDto {
  available: number;
  locked: number;
}

interface RoundDto {
  id: string;
  userId: string;
  gameId: string;
  stake: number;
  status: 'open' | 'settled' | 'refunded';
  payout: number;
}

interface RoundResponse {
  round: RoundDto;
  wallet: WalletDto;
}

interface RouletteBetSlipDto {
  outside: Partial<Record<'red' | 'black' | 'even' | 'odd' | 'high' | 'low', number>>;
  straight: Record<string, number>;
}

interface RouletteSpinResponse extends RoundResponse {
  outcome: {
    number: number;
    color: 'red' | 'black' | 'green';
  };
  stake: number;
  payout: number;
}

interface CrashStartResponse extends RoundResponse {
  crashPoint: number;
}

interface CrashCashoutResponse extends RoundResponse {
  crashPoint: number;
  cashoutMultiplier: number;
  payout: number;
}

interface SlotsSpinResponse extends RoundResponse {
  outcome: {
    machineId: string;
    stops: [number, number, number];
    symbols: [string, string, string];
    displaySymbols: [string, string, string];
    payout: number;
    bonusSpinsAwarded: number;
    bonusMultiplier: number;
  };
}

interface BlackjackCardDto {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
}

interface BlackjackViewDto {
  roundId: string;
  phase: 'player' | 'settled';
  playerHand: BlackjackCardDto[];
  splitHand?: BlackjackCardDto[];
  activeHandIndex: 0 | 1;
  dealerHand: BlackjackCardDto[];
  dealerHoleHidden: boolean;
  playerScore: number;
  splitScore?: number;
  dealerScore?: number;
  runningCount: number;
  cardsPlayedCount: number;
  settlement?: {
    status: 'win' | 'lose' | 'push' | 'blackjack';
    payout: number;
    playerScore: number;
    dealerScore: number;
  };
  splitSettlement?: {
    status: 'win' | 'lose' | 'push' | 'blackjack';
    payout: number;
    playerScore: number;
    dealerScore: number;
  };
}

interface BlackjackResponse extends RoundResponse {
  view: BlackjackViewDto;
}

interface PokerCardDto {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
}

interface PokerRankDto {
  category: string;
  categoryValue: number;
  tiebreakers: number[];
  cards: PokerCardDto[];
}

interface PokerViewDto {
  roundId: string;
  stage: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'folded';
  playerCards: [PokerCardDto, PokerCardDto];
  dealerCards: PokerCardDto[];
  dealerCardsHidden: boolean;
  communityCards: PokerCardDto[];
  pot: number;
  playerContribution: number;
  dealerContribution: number;
  dealerActionStatus: string;
  playerRank?: PokerRankDto;
  dealerRank?: PokerRankDto;
  winner?: 'player' | 'dealer' | 'push';
  payout?: number;
}

interface PokerResponse extends RoundResponse {
  view: PokerViewDto;
}

export const CASINO_USER_ID = 'demo';

export const fetchWallet = async (userId = CASINO_USER_ID): Promise<WalletDto> => {
  const response = await fetch(`/api/wallet/${encodeURIComponent(userId)}`);
  return parseJsonResponse<WalletDto>(response);
};

export const placeBet = async (input: {
  userId?: string;
  gameId: string;
  stake: number;
  idempotencyKey: string;
}): Promise<RoundResponse> => {
  const response = await fetch('/api/bets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: input.userId ?? CASINO_USER_ID,
      gameId: input.gameId,
      stake: input.stake,
      idempotencyKey: input.idempotencyKey
    })
  });
  return parseJsonResponse<RoundResponse>(response);
};

export const settleRound = async (input: {
  roundId: string;
  payout: number;
  idempotencyKey: string;
  outcome?: unknown;
}): Promise<RoundResponse> => {
  const response = await fetch(`/api/rounds/${encodeURIComponent(input.roundId)}/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payout: input.payout,
      idempotencyKey: input.idempotencyKey,
      outcome: input.outcome
    })
  });
  return parseJsonResponse<RoundResponse>(response);
};

export const spinRoulette = async (input: {
  userId?: string;
  bets: RouletteBetSlipDto;
  idempotencyKey: string;
}): Promise<RouletteSpinResponse> => {
  const response = await fetch('/api/games/roulette/spin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: input.userId ?? CASINO_USER_ID,
      bets: input.bets,
      idempotencyKey: input.idempotencyKey
    })
  });
  return parseJsonResponse<RouletteSpinResponse>(response);
};

export const startCrashRound = async (input: {
  userId?: string;
  stake: number;
  idempotencyKey: string;
}): Promise<CrashStartResponse> => {
  const response = await fetch('/api/games/crash/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: input.userId ?? CASINO_USER_ID,
      stake: input.stake,
      idempotencyKey: input.idempotencyKey
    })
  });
  return parseJsonResponse<CrashStartResponse>(response);
};

export const cashoutCrashRound = async (input: {
  roundId: string;
  cashoutMultiplier: number;
  idempotencyKey: string;
}): Promise<CrashCashoutResponse> => {
  const response = await fetch(`/api/games/crash/${encodeURIComponent(input.roundId)}/cashout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cashoutMultiplier: input.cashoutMultiplier,
      idempotencyKey: input.idempotencyKey
    })
  });
  return parseJsonResponse<CrashCashoutResponse>(response);
};

export const spinSlots = async (input: {
  userId?: string;
  machineId: string;
  bet: number;
  freeSpin: boolean;
  bonusMultiplier: number;
  idempotencyKey: string;
}): Promise<SlotsSpinResponse> => {
  const response = await fetch('/api/games/slots/spin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: input.userId ?? CASINO_USER_ID,
      machineId: input.machineId,
      bet: input.bet,
      freeSpin: input.freeSpin,
      bonusMultiplier: input.bonusMultiplier,
      idempotencyKey: input.idempotencyKey
    })
  });
  return parseJsonResponse<SlotsSpinResponse>(response);
};

export const startBlackjackRound = async (input: {
  userId?: string;
  stake: number;
  idempotencyKey: string;
}): Promise<BlackjackResponse> => {
  const response = await fetch('/api/games/blackjack/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: input.userId ?? CASINO_USER_ID,
      stake: input.stake,
      idempotencyKey: input.idempotencyKey
    })
  });
  return parseJsonResponse<BlackjackResponse>(response);
};

export const actBlackjackRound = async (input: {
  roundId: string;
  action: 'hit' | 'stand' | 'double' | 'split';
  idempotencyKey: string;
}): Promise<BlackjackResponse> => {
  const response = await fetch(`/api/games/blackjack/${encodeURIComponent(input.roundId)}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: input.action,
      idempotencyKey: input.idempotencyKey
    })
  });
  return parseJsonResponse<BlackjackResponse>(response);
};

export const startPokerRound = async (input: {
  userId?: string;
  ante: number;
  idempotencyKey: string;
}): Promise<PokerResponse> => {
  const response = await fetch('/api/games/poker/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: input.userId ?? CASINO_USER_ID,
      ante: input.ante,
      idempotencyKey: input.idempotencyKey
    })
  });
  return parseJsonResponse<PokerResponse>(response);
};

export const actPokerRound = async (input: {
  roundId: string;
  action: 'check' | 'call' | 'raise' | 'fold';
  idempotencyKey: string;
}): Promise<PokerResponse> => {
  const response = await fetch(`/api/games/poker/${encodeURIComponent(input.roundId)}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: input.action,
      idempotencyKey: input.idempotencyKey
    })
  });
  return parseJsonResponse<PokerResponse>(response);
};

const parseJsonResponse = async <T>(response: Response): Promise<T> => {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload.error === 'string'
      ? payload.error
      : `Request failed with ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
};
