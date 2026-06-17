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
