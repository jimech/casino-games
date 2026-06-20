interface WalletDto {
  available: number;
  locked: number;
}

export interface AuthUserDto {
  id: string;
  email?: string;
  username: string;
  role: 'user' | 'admin';
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
  responsiblePlayIntervention?: ResponsiblePlayInterventionDto;
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

export interface TargetedBonusOfferDto {
  id: string;
  campaignId: string;
  segment: 'welcome' | 'retention' | 'reactivation';
  title: string;
  description: string;
  score: number;
  amount: number;
  reasonCodes: string[];
  suppressionCodes: string[];
  cooldownUntil?: string;
}

export interface BonusTargetingResponseDto {
  generatedAt: string;
  source: 'profile' | 'fallback';
  profileVersion?: string;
  offers: TargetedBonusOfferDto[];
  suppressed: TargetedBonusOfferDto[];
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

export interface AiEventDto {
  id: string;
  userId: string;
  category: 'page' | 'game' | 'wallet' | 'bonus' | 'risk' | 'admin' | 'session';
  name: string;
  context?: Record<string, unknown>;
  createdAt: string;
}

export interface AiDecisionExplanationDto {
  id: string;
  userId: string;
  decisionType: string;
  modelVersion: string;
  sourceRecordId?: string;
  sourceFeatureSnapshotId?: string;
  sourceFeatureVersion?: string;
  inputFeatures?: Record<string, unknown>;
  output?: Record<string, unknown>;
  threshold?: Record<string, unknown>;
  reasonCodes: string[];
  createdAt: string;
}

export interface AiFeatureSnapshotDto {
  id: string;
  userId: string;
  version: string;
  sourceEventCount: number;
  features: {
    totals: {
      events: number;
      pageViews: number;
      gameClicks: number;
      roundsStarted: number;
      bonusClaims: number;
      adminViews: number;
    };
    categoryCounts: Record<string, number>;
    gameSignals: {
      favoriteGameId?: string;
      favoriteRoute?: string;
      gameClicksByRoute: Record<string, number>;
      roundsByGameId: Record<string, number>;
      totalStake: number;
      averageStake: number;
      maxStake: number;
    };
    engagement: {
      firstEventAt?: string;
      lastEventAt?: string;
      activeSpanMinutes: number;
      recentTabs: string[];
    };
    bonusSignals: {
      claims: number;
      totalClaimed: number;
      lastCampaignId?: string;
    };
    riskSignals: {
      highStakeRounds: number;
      highStakeRatio: number;
      manualRiskEvents: number;
    };
  };
  windowStartedAt?: string;
  windowEndedAt?: string;
  createdAt: string;
}

export interface GameRecommendationDto {
  gameId: string;
  rank: number;
  score: number;
  reasons: string[];
}

export interface GameRecommendationResponseDto {
  generatedAt: string;
  source: 'profile' | 'fallback';
  profileVersion?: string;
  recommendations: GameRecommendationDto[];
}

export interface ChurnScoreDto {
  id: string;
  userId: string;
  version: string;
  score: number;
  band: 'low' | 'medium' | 'high' | 'critical';
  reasonCodes: string[];
  recommendedActions: string[];
  sourceFeatureSnapshotId?: string;
  sourceFeatureVersion?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface FraudScoreDto {
  id: string;
  userId: string;
  version: string;
  score: number;
  band: 'low' | 'medium' | 'high' | 'critical';
  reasonCodes: string[];
  recommendedActions: string[];
  sourceFeatureSnapshotId?: string;
  sourceFeatureVersion?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface ResponsiblePlayInterventionDto {
  id: string;
  userId: string;
  version: string;
  level: 'none' | 'notice' | 'warning' | 'cooldown';
  score: number;
  reasonCodes: string[];
  recommendedActions: string[];
  message: string;
  requiresAcknowledgement: boolean;
  triggerGameId?: string;
  triggerStake?: number;
  sourceFeatureSnapshotId?: string;
  sourceFeatureVersion?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface AdminSummaryDto {
  user: AuthUserDto;
  wallet: WalletDto;
  ledger: LedgerEntryDto[];
  rounds: RoundDto[];
  riskEvents: RiskEventDto[];
  bonusCampaigns: BonusCampaignDto[];
  bonusClaims: BonusClaimDto[];
  aiEvents: AiEventDto[];
  aiDecisionExplanations: AiDecisionExplanationDto[];
  aiFeatureSnapshot?: AiFeatureSnapshotDto;
  churnScore?: ChurnScoreDto;
  fraudScore?: FraudScoreDto;
  responsiblePlayIntervention?: ResponsiblePlayInterventionDto;
}

export interface NotificationDto {
  id: string;
  userId: string;
  type: 'system' | 'bonus' | 'wallet' | 'risk' | 'support' | 'admin';
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  readAt?: string;
  createdAt: string;
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
  adminInviteCode?: string;
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

export const fetchTargetedBonuses = async (): Promise<BonusTargetingResponseDto> => {
  const response = await fetch('/api/bonuses/targeted', {
    headers: authHeaders()
  });
  return parseJsonResponse<BonusTargetingResponseDto>(response);
};

export const fetchChurnScore = async (input: { userId?: string } = {}): Promise<ChurnScoreDto> => {
  const params = new URLSearchParams();
  if (input.userId) params.set('userId', input.userId);
  const query = params.toString();
  const response = await fetch(`/api/retention/churn-score${query ? `?${query}` : ''}`, {
    headers: authHeaders()
  });
  const payload = await parseJsonResponse<{ score: ChurnScoreDto }>(response);
  return payload.score;
};

export const refreshChurnScore = async (input: { userId?: string } = {}): Promise<ChurnScoreDto> => {
  const response = await fetch('/api/retention/churn-score/refresh', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(input)
  });
  const payload = await parseJsonResponse<{ score: ChurnScoreDto }>(response);
  return payload.score;
};

export const fetchFraudScore = async (input: { userId?: string } = {}): Promise<FraudScoreDto> => {
  const params = new URLSearchParams();
  if (input.userId) params.set('userId', input.userId);
  const query = params.toString();
  const response = await fetch(`/api/risk/fraud-score${query ? `?${query}` : ''}`, {
    headers: authHeaders()
  });
  const payload = await parseJsonResponse<{ score: FraudScoreDto }>(response);
  return payload.score;
};

export const refreshFraudScore = async (input: { userId?: string } = {}): Promise<FraudScoreDto> => {
  const response = await fetch('/api/risk/fraud-score/refresh', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(input)
  });
  const payload = await parseJsonResponse<{ score: FraudScoreDto }>(response);
  return payload.score;
};

export const fetchResponsiblePlayInterventions = async (input: {
  userId?: string;
  level?: ResponsiblePlayInterventionDto['level'];
  limit?: number;
} = {}): Promise<ResponsiblePlayInterventionDto[]> => {
  const params = new URLSearchParams();
  if (input.userId) params.set('userId', input.userId);
  if (input.level) params.set('level', input.level);
  if (input.limit) params.set('limit', String(input.limit));
  const query = params.toString();
  const response = await fetch(`/api/responsible-play/interventions${query ? `?${query}` : ''}`, {
    headers: authHeaders()
  });
  const payload = await parseJsonResponse<{ interventions: ResponsiblePlayInterventionDto[] }>(response);
  return payload.interventions;
};

export const evaluateResponsiblePlay = async (input: {
  userId?: string;
  gameId?: string;
  stake?: number;
} = {}): Promise<ResponsiblePlayInterventionDto> => {
  const response = await fetch('/api/responsible-play/interventions/evaluate', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(input)
  });
  const payload = await parseJsonResponse<{ intervention: ResponsiblePlayInterventionDto }>(response);
  return payload.intervention;
};

export const fetchAdminSummary = async (): Promise<AdminSummaryDto> => {
  const response = await fetch('/api/admin/summary', {
    headers: authHeaders()
  });
  return parseJsonResponse<AdminSummaryDto>(response);
};

export const fetchAiEvents = async (input: {
  userId?: string;
  category?: AiEventDto['category'];
  since?: string;
  until?: string;
  limit?: number;
} = {}): Promise<AiEventDto[]> => {
  const params = new URLSearchParams();
  if (input.userId) params.set('userId', input.userId);
  if (input.category) params.set('category', input.category);
  if (input.since) params.set('since', input.since);
  if (input.until) params.set('until', input.until);
  if (input.limit) params.set('limit', String(input.limit));
  const query = params.toString();
  const response = await fetch(`/api/ai/events${query ? `?${query}` : ''}`, {
    headers: authHeaders()
  });
  const payload = await parseJsonResponse<{ events: AiEventDto[] }>(response);
  return payload.events;
};

export const fetchAiDecisionExplanations = async (input: {
  userId?: string;
  decisionType?: string;
  limit?: number;
} = {}): Promise<AiDecisionExplanationDto[]> => {
  const params = new URLSearchParams();
  if (input.userId) params.set('userId', input.userId);
  if (input.decisionType) params.set('decisionType', input.decisionType);
  if (input.limit) params.set('limit', String(input.limit));
  const query = params.toString();
  const response = await fetch(`/api/admin/ai-decision-explanations${query ? `?${query}` : ''}`, {
    headers: authHeaders()
  });
  const payload = await parseJsonResponse<{ explanations: AiDecisionExplanationDto[] }>(response);
  return payload.explanations;
};

export const trackAiEvent = async (input: {
  category: AiEventDto['category'];
  name: string;
  context?: Record<string, unknown>;
}): Promise<AiEventDto> => {
  const response = await fetch('/api/ai/events', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(input)
  });
  const payload = await parseJsonResponse<{ event: AiEventDto; snapshot: AiFeatureSnapshotDto }>(response);
  return payload.event;
};

export const fetchAiFeatureProfile = async (input: { userId?: string } = {}): Promise<AiFeatureSnapshotDto> => {
  const params = new URLSearchParams();
  if (input.userId) params.set('userId', input.userId);
  const query = params.toString();
  const response = await fetch(`/api/ai/profile${query ? `?${query}` : ''}`, {
    headers: authHeaders()
  });
  const payload = await parseJsonResponse<{ snapshot: AiFeatureSnapshotDto }>(response);
  return payload.snapshot;
};

export const refreshAiFeatureProfile = async (input: {
  userId?: string;
  since?: string;
  until?: string;
  limit?: number;
} = {}): Promise<AiFeatureSnapshotDto> => {
  const response = await fetch('/api/ai/profile/refresh', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(input)
  });
  const payload = await parseJsonResponse<{ snapshot: AiFeatureSnapshotDto }>(response);
  return payload.snapshot;
};

export const fetchGameRecommendations = async (input: { limit?: number } = {}): Promise<GameRecommendationResponseDto> => {
  const params = new URLSearchParams();
  if (input.limit) params.set('limit', String(input.limit));
  const query = params.toString();
  const response = await fetch(`/api/recommendations/games${query ? `?${query}` : ''}`, {
    headers: authHeaders()
  });
  return parseJsonResponse<GameRecommendationResponseDto>(response);
};

export const fetchNotifications = async (input: { unreadOnly?: boolean; limit?: number } = {}): Promise<NotificationDto[]> => {
  const params = new URLSearchParams();
  if (input.unreadOnly) params.set('unreadOnly', 'true');
  if (input.limit) params.set('limit', String(input.limit));
  const query = params.toString();
  const response = await fetch(`/api/notifications${query ? `?${query}` : ''}`, {
    headers: authHeaders()
  });
  const payload = await parseJsonResponse<{ notifications: NotificationDto[] }>(response);
  return payload.notifications;
};

export const createNotification = async (input: {
  type: 'support' | 'admin' | 'system';
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<NotificationDto> => {
  const response = await fetch('/api/notifications', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(input)
  });
  const payload = await parseJsonResponse<{ notification: NotificationDto }>(response);
  return payload.notification;
};

export const markNotificationRead = async (notificationId: string): Promise<NotificationDto> => {
  const response = await fetch(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'POST',
    headers: authHeaders()
  });
  const payload = await parseJsonResponse<{ notification: NotificationDto }>(response);
  return payload.notification;
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
