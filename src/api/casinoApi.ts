interface WalletDto {
  available: number;
  locked: number;
}

export interface AuthUserDto {
  id: string;
  email?: string;
  username: string;
  displayName?: string;
  dateOfBirth?: string;
  ageGateAcceptedAt?: string;
  termsAcceptedAt?: string;
  privacyAcceptedAt?: string;
  createdAt: string;
}

export interface AuthSessionDto {
  token: string;
  expiresAt: string;
  user: AuthUserDto;
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

interface BonusCampaignDto {
  id: string;
  type: 'welcome' | 'daily' | 'cashback' | 'freeSpins';
  title: string;
  description?: string;
  amount: number;
  metadata?: Record<string, unknown>;
  active: boolean;
}

interface BonusClaimDto {
  id: string;
  userId: string;
  campaignId: string;
  amount: number;
  status: 'claimed' | 'rejected';
  claimKey: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface BonusClaimResponse {
  campaign: BonusCampaignDto;
  claim: BonusClaimDto;
  wallet: WalletDto;
}

interface LedgerEntryDto {
  id: string;
  idempotencyKey: string;
  type: string;
  amount: number;
  balanceBefore: WalletDto;
  balanceAfter: WalletDto;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface RiskEventDto {
  id: string;
  userId?: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'reviewed' | 'dismissed';
  score: number;
  context?: Record<string, unknown>;
  createdAt: string;
  reviewedAt?: string;
}

export interface AdminSummaryDto {
  user: AuthUserDto;
  wallet: WalletDto;
  ledger: LedgerEntryDto[];
  rounds: RoundDto[];
  riskEvents: RiskEventDto[];
  bonusCampaigns: BonusCampaignDto[];
  bonusClaims: BonusClaimDto[];
}

export const CASINO_USER_ID = 'demo';
const AUTH_TOKEN_STORAGE_KEY = 'casino.sessionToken';

export const getStoredAuthToken = (): string | null => {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
};

export const setStoredAuthToken = (token: string | null) => {
  if (typeof localStorage === 'undefined') return;
  if (token) {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  }
};

export const registerAccount = async (input: {
  email?: string;
  username: string;
  password: string;
  displayName?: string;
  dateOfBirth?: string;
  acceptAgeGate: boolean;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
}): Promise<AuthSessionDto> => {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(input)
  });
  const session = await parseJsonResponse<AuthSessionDto>(response);
  setStoredAuthToken(session.token);
  return session;
};

export const loginAccount = async (input: { login: string; password: string }): Promise<AuthSessionDto> => {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(input)
  });
  const session = await parseJsonResponse<AuthSessionDto>(response);
  setStoredAuthToken(session.token);
  return session;
};

export const fetchAuthSession = async (): Promise<AuthSessionDto> => {
  const response = await fetch('/api/auth/session', {
    headers: authHeaders()
  });
  return parseJsonResponse<AuthSessionDto>(response);
};

export const logoutAccount = async (): Promise<void> => {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    headers: authHeaders()
  });
  if (!response.ok && response.status !== 401) await parseJsonResponse(response);
  setStoredAuthToken(null);
};

export const fetchWallet = async (userId = CASINO_USER_ID): Promise<WalletDto> => {
  const response = await fetch(`/api/wallet/${encodeURIComponent(userId)}`, {
    headers: authHeaders()
  });
  return parseJsonResponse<WalletDto>(response);
};

export const createWalletEventSource = (userId: string): EventSource => {
  const token = getStoredAuthToken();
  const params = token ? `?token=${encodeURIComponent(token)}` : '';
  return new EventSource(`/api/wallet/${encodeURIComponent(userId)}/events${params}`);
};

export const claimBonus = async (input: {
  campaignId: string;
  idempotencyKey: string;
}): Promise<BonusClaimResponse> => {
  const response = await fetch(`/api/bonuses/${encodeURIComponent(input.campaignId)}/claim`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ idempotencyKey: input.idempotencyKey })
  });
  return parseJsonResponse<BonusClaimResponse>(response);
};

export const fetchAdminSummary = async (): Promise<AdminSummaryDto> => {
  const response = await fetch('/api/admin/summary', {
    headers: authHeaders()
  });
  return parseJsonResponse<AdminSummaryDto>(response);
};

export const placeBet = async (input: {
  userId?: string;
  gameId: string;
  stake: number;
  idempotencyKey: string;
}): Promise<RoundResponse> => {
  const response = await fetch('/api/bets', {
    method: 'POST',
    headers: jsonHeaders(),
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
    headers: jsonHeaders(),
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
    headers: jsonHeaders(),
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
    headers: jsonHeaders(),
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
    headers: jsonHeaders(),
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
    headers: jsonHeaders(),
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
    headers: jsonHeaders(),
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
    headers: jsonHeaders(),
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
    headers: jsonHeaders(),
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
    headers: jsonHeaders(),
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

const authHeaders = (): HeadersInit => {
  const token = getStoredAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const jsonHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  ...authHeaders()
});
