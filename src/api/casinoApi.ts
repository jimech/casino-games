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
  sessionTimeoutLimit: string;
  createdAt: string;
}

export interface AuthSessionDto {
  token: string;
  createdAt: string;
  expiresAt: string;
  user: AuthUserDto;
}

export interface StepUpAuthDto {
  stepUpToken: string;
  expiresAt: string;
  scope: string;
}

export interface RoundDto {
  id: string;
  userId: string;
  gameId: string;
  stake: number;
  status: 'open' | 'settled' | 'refunded';
  payout: number;
  outcome?: unknown;
}

interface RoundResponse {
  round: RoundDto;
  wallet: WalletDto;
  responsiblePlayIntervention?: ResponsiblePlayInterventionDto;
}

export interface WalletDepositResponseDto {
  wallet: WalletDto;
  deposit: {
    idempotencyKey: string;
    amount: number;
    method: 'card' | 'crypto' | 'bank_wire';
    reference: string;
    createdAt: string;
  };
}

export interface WalletWithdrawalResponseDto {
  wallet: WalletDto;
  withdrawal: {
    idempotencyKey: string;
    amount: number;
    method: WalletDepositResponseDto['deposit']['method'];
    reference: string;
    status: 'recorded' | 'pending_review';
    createdAt: string;
  };
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

export interface VipTierDto {
  id: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
  label: string;
  minSettledStake: number;
  cashbackRate: number;
}

export interface VipStatusDto {
  userId: string;
  tier: VipTierDto;
  nextTier?: VipTierDto;
  settledStake: number;
  netLoss: number;
  cashbackRate: number;
  availableCashback: number;
  nextTierStakeRemaining: number;
  weekKey: string;
  generatedAt: string;
}

export interface VipCashbackClaimResponseDto {
  status: VipStatusDto;
  claim?: BonusClaimDto;
  wallet: WalletDto;
}

export interface TournamentDto {
  id: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  entryFee: number;
  prizePool: number;
  status: 'upcoming' | 'active' | 'ended' | 'cancelled';
}

export interface TournamentEntryDto {
  id: string;
  tournamentId: string;
  userId: string;
  entryFee: number;
  ledgerEntryId?: string;
  idempotencyKey: string;
  enteredAt: string;
}

export interface TournamentLeaderboardRowDto {
  rank: number;
  userId: string;
  score: number;
  totalStake: number;
  totalPayout: number;
  roundCount: number;
  lastSettledAt?: string;
}

export interface TournamentEntryResponseDto {
  tournament: TournamentDto;
  entry: TournamentEntryDto;
  wallet: WalletDto;
}

export interface TournamentLeaderboardDto {
  tournament: TournamentDto;
  generatedAt: string;
  entries: TournamentLeaderboardRowDto[];
}

export interface TournamentPayoutDto {
  id: string;
  tournamentId: string;
  settlementId: string;
  userId: string;
  rank: number;
  amount: number;
  ledgerEntryId?: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface TournamentSettlementDto {
  id: string;
  tournamentId: string;
  prizePool: number;
  status: 'settled';
  idempotencyKey: string;
  settledAt: string;
  payouts: TournamentPayoutDto[];
}

export interface TournamentRefundDto {
  id: string;
  cancellationId: string;
  tournamentId: string;
  entryId: string;
  userId: string;
  amount: number;
  ledgerEntryId?: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface TournamentCancellationDto {
  id: string;
  tournamentId: string;
  reason: string;
  idempotencyKey: string;
  cancelledAt: string;
  refunds: TournamentRefundDto[];
}

export interface AdminTournamentQueueDto {
  generatedAt: string;
  filter: string;
  policy: TournamentSettlementPolicyDto;
  summary: {
    total: number;
    active: number;
    ended: number;
    cancelled: number;
    settled: number;
    disputed: number;
    unresolved: number;
    needsSettlement: number;
  };
  rows: Array<{
    tournament: TournamentDto;
    generatedAt: string;
    entryCount: number;
    scoredEntryCount: number;
    leader?: TournamentLeaderboardRowDto;
    settlement?: TournamentSettlementDto;
    cancellation?: TournamentCancellationDto;
    disputeCases: ComplianceCaseDto[];
    openDisputeCaseCount: number;
    flags: Record<string, boolean>;
    policyDecision: TournamentSettlementPolicyDecisionDto;
  }>;
}

export interface TournamentSettlementPolicyDto {
  autoSettleEnabled: boolean;
  maxPrizePool: number;
  minEntries: number;
  minScoredEntries: number;
  requireDisputeFree: boolean;
  requireNoCancellation: boolean;
}

export interface TournamentSettlementPolicyDecisionDto {
  allowed: boolean;
  reasonCodes: string[];
  checks: {
    prizePool: number;
    entryCount: number;
    scoredEntryCount: number;
    openDisputeCaseCount: number;
  };
}

export interface AdminTournamentSettlementJobReportDto {
  startedAt: string;
  completedAt: string;
  mode: 'dry_run' | 'auto_settle';
  policy: TournamentSettlementPolicyDto;
  detectedCount: number;
  alertedAdminCount: number;
  alertCount: number;
  settledCount: number;
  policyBlockedCount: number;
  rows: AdminTournamentQueueDto['rows'];
  alerts: Array<{
    userId: string;
    tournamentId: string;
    notificationId?: string;
    deliveryStatus: string;
  }>;
  policyBlocks: Array<{
    tournamentId: string;
    reasonCodes: string[];
  }>;
  settled: Array<{
    tournamentId: string;
    settlementId: string;
    payoutCount: number;
    prizePool: number;
  }>;
}

export interface ReconciliationIssueDto {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  type: string;
  userId?: string;
  roundId?: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ReconciliationReportDto {
  generatedAt: string;
  mode: 'memory' | 'prisma';
  status: 'pass' | 'warning' | 'fail';
  summary: {
    walletCount: number;
    ledgerEntryCount: number;
    roundCount: number;
    openRoundCount: number;
    settledRoundCount: number;
    refundedRoundCount: number;
    provablyFairSeedCount: number;
    issueCount: number;
    criticalIssueCount: number;
    warningIssueCount: number;
  };
  issues: ReconciliationIssueDto[];
}

export interface GameMathScenarioReportDto {
  gameId: string;
  scenarioId: string;
  description: string;
  theoreticalRtp: number;
  hitRate: number;
  volatilityIndex: number;
  sampleCount: number;
  totalStake: number;
  totalPayout: number;
  maxPayout: number;
  expectedHouseEdge: number;
  warnings: string[];
}

export interface GameMathSimulationReportDto {
  generatedAt: string;
  sampleCount: number;
  roulette: GameMathScenarioReportDto[];
  slots: GameMathScenarioReportDto[];
  crash: GameMathScenarioReportDto[];
  blackjack: GameMathScenarioReportDto[];
  poker: GameMathScenarioReportDto[];
  summary: {
    scenarioCount: number;
    lowestRtp: number;
    highestRtp: number;
    highestVolatilityIndex: number;
  };
}

export interface ProvablyFairVerificationDto {
  valid: boolean;
  expected: unknown;
  proof: unknown;
  errors: string[];
}

export interface PlayerProvablyFairEvidenceDto {
  round: RoundDto;
  provablyFair: {
    present: boolean;
    valid: boolean;
    errors: string[];
    proof?: unknown;
    expected?: unknown;
  };
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

export interface AiModelControlDto {
  id: string;
  userId?: string;
  modelKey: string;
  disabled: boolean;
  reason?: string;
  updatedAt: string;
  createdAt: string;
}

export interface AiModelHealthReportDto {
  status: 'healthy' | 'degraded' | 'disabled';
  generatedAt: string;
  metrics: Array<{
    modelKey: string;
    decisionCount: number;
    fallbackCount: number;
    staleInputCount: number;
    fallbackRatio: number;
    staleInputRatio: number;
    disabled: boolean;
    status: 'healthy' | 'degraded' | 'disabled';
    reasonCodes: string[];
  }>;
  controls: AiModelControlDto[];
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
  acknowledgedAt?: string;
  triggerGameId?: string;
  triggerStake?: number;
  sourceFeatureSnapshotId?: string;
  sourceFeatureVersion?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface ComplianceCaseNoteDto {
  id: string;
  caseId: string;
  authorId: string;
  note: string;
  action: string;
  status?: 'open' | 'in_review' | 'closed';
  outcome?: string;
  evidence?: Record<string, unknown>;
  createdAt: string;
}

export interface ComplianceCaseDto {
  id: string;
  subjectUserId: string;
  type: 'fraud' | 'responsible_play' | 'security' | 'retention' | 'general';
  status: 'open' | 'in_review' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description?: string;
  evidence?: Record<string, unknown>;
  assignedToUserId?: string;
  outcome?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  notes: ComplianceCaseNoteDto[];
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
  complianceCases: ComplianceCaseDto[];
  aiModelHealth?: AiModelHealthReportDto;
  aiFeatureSnapshot?: AiFeatureSnapshotDto;
  churnScore?: ChurnScoreDto;
  fraudScore?: FraudScoreDto;
  responsiblePlayIntervention?: ResponsiblePlayInterventionDto;
}

export interface AdminUserDetailDto {
  user: AuthUserDto;
  wallet: WalletDto;
  ledger: LedgerEntryDto[];
  rounds: RoundDto[];
  riskEvents: RiskEventDto[];
  bonusClaims: BonusClaimDto[];
  notifications: NotificationDto[];
  aiEvents: AiEventDto[];
  aiDecisionExplanations: AiDecisionExplanationDto[];
  complianceCases: ComplianceCaseDto[];
  aiFeatureSnapshot?: AiFeatureSnapshotDto;
  churnScore?: ChurnScoreDto;
  fraudScore?: FraudScoreDto;
  responsiblePlayIntervention?: ResponsiblePlayInterventionDto;
}

export interface AdminRoundEvidenceDto {
  generatedAt: string;
  replayMode: 'read_only';
  round: RoundDto;
  user: AuthUserDto;
  ledger: LedgerEntryDto[];
  riskEvents: RiskEventDto[];
  aiEvents: AiEventDto[];
  aiDecisionExplanations: AiDecisionExplanationDto[];
  complianceCases: ComplianceCaseDto[];
  provablyFair: {
    present: boolean;
    valid: boolean;
    errors: string[];
    proof?: unknown;
    expected?: unknown;
  };
  replayTimeline: Array<{
    type: string;
    at: string;
    summary: string;
    data?: Record<string, unknown>;
  }>;
  integrity: {
    ledgerEntryCount: number;
    riskEventCount: number;
    aiEventCount: number;
    aiDecisionExplanationCount: number;
    complianceCaseCount: number;
    provablyFairProofCount: number;
    provablyFairValidCount: number;
  };
}

export interface AdminTournamentEvidenceDto {
  generatedAt: string;
  replayMode: 'read_only';
  tournament: TournamentDto;
  leaderboard: TournamentLeaderboardDto;
  settlement?: TournamentSettlementDto;
  cancellation?: TournamentCancellationDto;
  disputeCases: ComplianceCaseDto[];
  participants: Array<{
    user: AuthUserDto;
    leaderboardRow?: TournamentLeaderboardRowDto;
    ledger: LedgerEntryDto[];
    rounds: RoundDto[];
    riskEvents: RiskEventDto[];
    aiEvents: AiEventDto[];
    aiDecisionExplanations: AiDecisionExplanationDto[];
    complianceCases: ComplianceCaseDto[];
  }>;
  adminAiEvents: AiEventDto[];
  integrity: {
    participantCount: number;
    leaderboardEntryCount: number;
    settlementRecorded: boolean;
    cancellationRecorded: boolean;
    payoutCount: number;
    refundCount: number;
    entryLedgerCount: number;
    payoutLedgerCount: number;
    refundLedgerCount: number;
    adminAiEventCount: number;
    roundCount: number;
    riskEventCount: number;
    complianceCaseCount: number;
    disputeCaseCount: number;
  };
}

export interface AdminRewardsReviewDto {
  generatedAt: string;
  summary: {
    accountCount: number;
    totalBonusClaimed: number;
    totalAvailableCashback: number;
    cashbackClaimsThisWeek: number;
    duplicateCashbackBlockedCount: number;
  };
  accounts: Array<{
    user: AuthUserDto;
    vipStatus: VipStatusDto;
    bonusClaims: BonusClaimDto[];
    bonusTotal: number;
    cashbackClaimedThisWeek: boolean;
    cashbackLedgerEntries: LedgerEntryDto[];
    duplicateCashbackBlocked: boolean;
  }>;
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

export interface NotificationPreferenceDto {
  userId: string;
  type: NotificationDto['type'];
  enabled: boolean;
  mandatory: boolean;
  updatedAt: string;
}

export interface NotificationDeliveryDto {
  id: string;
  userId: string;
  notificationId?: string;
  type: NotificationDto['type'];
  channel: 'in_app';
  status: 'delivered' | 'suppressed';
  reason?: string;
  preferenceSnapshot?: Record<string, unknown>;
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

export const createStepUpAuth = async (input: {
  password: string;
  scope?: string;
}): Promise<StepUpAuthDto> => {
  const response = await fetch('/api/auth/step-up', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(input)
  });
  return parseJsonResponse<StepUpAuthDto>(response);
};

export const updateConsentSettings = async (input: {
  acceptAgeGate: boolean;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
  sessionTimeoutLimit?: string;
}): Promise<AuthSessionDto> => {
  const response = await fetch('/api/auth/consent', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(input)
  });
  return parseJsonResponse<AuthSessionDto>(response);
};

export const updateProfileSettings = async (input: {
  displayName?: string;
  email?: string;
}): Promise<AuthSessionDto> => {
  const response = await fetch('/api/auth/profile', {
    method: 'PATCH',
    headers: jsonHeaders(),
    body: JSON.stringify(input)
  });
  return parseJsonResponse<AuthSessionDto>(response);
};

export const fetchWallet = async (userId = CASINO_USER_ID): Promise<WalletDto> => {
  const response = await fetch(`/api/wallet/${encodeURIComponent(userId)}`, {
    headers: authHeaders()
  });
  return parseJsonResponse<WalletDto>(response);
};

export const depositWallet = async (input: {
  amount: number;
  method: WalletDepositResponseDto['deposit']['method'];
  idempotencyKey: string;
}): Promise<WalletDepositResponseDto> => {
  const response = await fetch('/api/wallet/deposits', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(input)
  });
  return parseJsonResponse<WalletDepositResponseDto>(response);
};

export const withdrawWallet = async (input: {
  amount: number;
  method: WalletWithdrawalResponseDto['withdrawal']['method'];
  idempotencyKey: string;
  stepUpToken?: string;
}): Promise<WalletWithdrawalResponseDto> => {
  const response = await fetch('/api/wallet/withdrawals', {
    method: 'POST',
    headers: {
      ...jsonHeaders(),
      ...(input.stepUpToken ? { 'X-Step-Up-Token': input.stepUpToken } : {})
    },
    body: JSON.stringify(input)
  });
  return parseJsonResponse<WalletWithdrawalResponseDto>(response);
};

export const fetchRounds = async (): Promise<RoundDto[]> => {
  const response = await fetch('/api/rounds', {
    headers: authHeaders()
  });
  const payload = await parseJsonResponse<{ rounds: RoundDto[] }>(response);
  return payload.rounds;
};

export const fetchPlayerProvablyFairEvidence = async (roundId: string): Promise<PlayerProvablyFairEvidenceDto> => {
  const response = await fetch(`/api/rounds/${encodeURIComponent(roundId)}/provably-fair`, {
    headers: authHeaders()
  });
  return parseJsonResponse<PlayerProvablyFairEvidenceDto>(response);
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

export const fetchVipStatus = async (): Promise<VipStatusDto> => {
  const response = await fetch('/api/vip/status', {
    headers: authHeaders()
  });
  const payload = await parseJsonResponse<{ status: VipStatusDto }>(response);
  return payload.status;
};

export const claimVipCashback = async (input: {
  idempotencyKey: string;
}): Promise<VipCashbackClaimResponseDto> => {
  const response = await fetch('/api/vip/cashback/claim', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(input)
  });
  return parseJsonResponse<VipCashbackClaimResponseDto>(response);
};

export const fetchTournaments = async (): Promise<TournamentDto[]> => {
  const response = await fetch('/api/tournaments', {
    headers: authHeaders()
  });
  const payload = await parseJsonResponse<{ tournaments: TournamentDto[] }>(response);
  return payload.tournaments;
};

export const fetchAdminTournamentQueue = async (filter = 'all', now?: string): Promise<AdminTournamentQueueDto> => {
  const params = new URLSearchParams();
  params.set('filter', filter);
  if (now) params.set('now', now);
  const response = await fetch(`/api/admin/tournaments/queue?${params.toString()}`, {
    headers: authHeaders()
  });
  return parseJsonResponse<AdminTournamentQueueDto>(response);
};

export const fetchTournamentSettlementPolicy = async (): Promise<TournamentSettlementPolicyDto> => {
  const response = await fetch('/api/admin/tournaments/policy', {
    headers: authHeaders()
  });
  const payload = await parseJsonResponse<{ policy: TournamentSettlementPolicyDto }>(response);
  return payload.policy;
};

export const runTournamentSettlementJob = async (input: {
  autoSettle?: boolean;
  idempotencyKey?: string;
  now?: string;
} = {}): Promise<AdminTournamentSettlementJobReportDto> => {
  const response = await fetch('/api/admin/tournaments/jobs/settlement-scan', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      autoSettle: input.autoSettle,
      idempotencyKey: input.idempotencyKey,
      now: input.now
    })
  });
  const payload = await parseJsonResponse<{ report: AdminTournamentSettlementJobReportDto }>(response);
  return payload.report;
};

export const fetchGameMathSimulationReport = async (input: { sampleCount?: number } = {}): Promise<GameMathSimulationReportDto> => {
  const params = new URLSearchParams();
  if (input.sampleCount) params.set('sampleCount', String(input.sampleCount));
  const query = params.toString();
  const response = await fetch(`/api/admin/game-math/simulations${query ? `?${query}` : ''}`, {
    headers: authHeaders()
  });
  const payload = await parseJsonResponse<{ report: GameMathSimulationReportDto }>(response);
  return payload.report;
};

export const runIntegrityReconciliation = async (): Promise<ReconciliationReportDto> => {
  const response = await fetch('/api/admin/integrity/reconciliation', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({})
  });
  const payload = await parseJsonResponse<{ report: ReconciliationReportDto }>(response);
  return payload.report;
};

export const verifyProvablyFairProof = async (proof: unknown): Promise<ProvablyFairVerificationDto> => {
  const response = await fetch('/api/provably-fair/verify', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ proof })
  });
  const payload = await parseJsonResponse<{ verification: ProvablyFairVerificationDto }>(response);
  return payload.verification;
};

export const enterTournament = async (input: {
  tournamentId: string;
  idempotencyKey: string;
}): Promise<TournamentEntryResponseDto> => {
  const response = await fetch(`/api/tournaments/${encodeURIComponent(input.tournamentId)}/enter`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ idempotencyKey: input.idempotencyKey })
  });
  return parseJsonResponse<TournamentEntryResponseDto>(response);
};

export const fetchTournamentLeaderboard = async (tournamentId: string): Promise<TournamentLeaderboardDto> => {
  const response = await fetch(`/api/tournaments/${encodeURIComponent(tournamentId)}/leaderboard`, {
    headers: authHeaders()
  });
  return parseJsonResponse<TournamentLeaderboardDto>(response);
};

export const fetchTournamentSettlement = async (tournamentId: string): Promise<TournamentSettlementDto | undefined> => {
  const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournamentId)}/settlement`, {
    headers: authHeaders()
  });
  const payload = await parseJsonResponse<{ settlement?: TournamentSettlementDto }>(response);
  return payload.settlement;
};

export const fetchTournamentCancellation = async (tournamentId: string): Promise<TournamentCancellationDto | undefined> => {
  const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournamentId)}/cancellation`, {
    headers: authHeaders()
  });
  const payload = await parseJsonResponse<{ cancellation?: TournamentCancellationDto }>(response);
  return payload.cancellation;
};

export const settleTournament = async (input: {
  tournamentId: string;
  idempotencyKey: string;
  now?: string;
}): Promise<TournamentSettlementDto> => {
  const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(input.tournamentId)}/settle`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      idempotencyKey: input.idempotencyKey,
      now: input.now
    })
  });
  const payload = await parseJsonResponse<{ settlement: TournamentSettlementDto }>(response);
  return payload.settlement;
};

export const cancelTournament = async (input: {
  tournamentId: string;
  reason: string;
  idempotencyKey: string;
  now?: string;
}): Promise<TournamentCancellationDto> => {
  const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(input.tournamentId)}/cancel`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      now: input.now
    })
  });
  const payload = await parseJsonResponse<{ cancellation: TournamentCancellationDto }>(response);
  return payload.cancellation;
};

export const openTournamentDispute = async (input: {
  tournamentId: string;
  subjectUserId?: string;
  disputeType?: string;
  priority?: ComplianceCaseDto['priority'];
  title?: string;
  description?: string;
}): Promise<ComplianceCaseDto> => {
  const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(input.tournamentId)}/disputes`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      subjectUserId: input.subjectUserId,
      disputeType: input.disputeType,
      priority: input.priority,
      title: input.title,
      description: input.description
    })
  });
  const payload = await parseJsonResponse<{ case: ComplianceCaseDto }>(response);
  return payload.case;
};

export const fetchAdminTournamentEvidence = async (tournamentId: string): Promise<AdminTournamentEvidenceDto> => {
  const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournamentId)}/evidence`, {
    headers: authHeaders()
  });
  return parseJsonResponse<AdminTournamentEvidenceDto>(response);
};

export const exportAdminTournamentEvidence = async (tournamentId: string): Promise<string> => {
  const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournamentId)}/evidence-export`, {
    headers: authHeaders()
  });
  if (!response.ok) await parseJsonResponse(response);
  return response.text();
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

export const acknowledgeResponsiblePlayIntervention = async (interventionId: string): Promise<ResponsiblePlayInterventionDto> => {
  const response = await fetch(`/api/responsible-play/interventions/${encodeURIComponent(interventionId)}/acknowledge`, {
    method: 'POST',
    headers: jsonHeaders()
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

export const searchAdminUsers = async (input: {
  query?: string;
  role?: AuthUserDto['role'];
  limit?: number;
} = {}): Promise<AuthUserDto[]> => {
  const params = new URLSearchParams();
  if (input.query) params.set('query', input.query);
  if (input.role) params.set('role', input.role);
  if (input.limit) params.set('limit', String(input.limit));
  const query = params.toString();
  const response = await fetch(`/api/admin/users${query ? `?${query}` : ''}`, {
    headers: authHeaders()
  });
  const payload = await parseJsonResponse<{ users: AuthUserDto[] }>(response);
  return payload.users;
};

export const fetchAdminUserDetail = async (userId: string): Promise<AdminUserDetailDto> => {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    headers: authHeaders()
  });
  return parseJsonResponse<AdminUserDetailDto>(response);
};

export const fetchAdminRoundEvidence = async (roundId: string): Promise<AdminRoundEvidenceDto> => {
  const response = await fetch(`/api/admin/rounds/${encodeURIComponent(roundId)}`, {
    headers: authHeaders()
  });
  return parseJsonResponse<AdminRoundEvidenceDto>(response);
};

export const fetchAdminRewardsReview = async (input: {
  query?: string;
  limit?: number;
} = {}): Promise<AdminRewardsReviewDto> => {
  const params = new URLSearchParams();
  if (input.query) params.set('query', input.query);
  if (input.limit) params.set('limit', String(input.limit));
  const query = params.toString();
  const response = await fetch(`/api/admin/rewards/review${query ? `?${query}` : ''}`, {
    headers: authHeaders()
  });
  return parseJsonResponse<AdminRewardsReviewDto>(response);
};

export const exportAdminRoundEvidence = async (roundId: string): Promise<string> => {
  const response = await fetch(`/api/admin/rounds/${encodeURIComponent(roundId)}/evidence-export`, {
    headers: authHeaders()
  });
  if (!response.ok) await parseJsonResponse(response);
  return response.text();
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

export const fetchAiModelHealth = async (): Promise<AiModelHealthReportDto> => {
  const response = await fetch('/api/admin/ai-model-health', {
    headers: authHeaders()
  });
  const payload = await parseJsonResponse<{ report: AiModelHealthReportDto }>(response);
  return payload.report;
};

export const updateAiModelControl = async (input: {
  modelKey: string;
  disabled: boolean;
  reason?: string;
  stepUpToken?: string;
  requestId?: string;
}): Promise<AiModelControlDto> => {
  const response = await fetch(`/api/admin/ai-model-controls/${encodeURIComponent(input.modelKey)}`, {
    method: 'POST',
    headers: {
      ...jsonHeaders(),
      'X-Request-Id': input.requestId ?? crypto.randomUUID(),
      ...(input.stepUpToken ? { 'X-Step-Up-Token': input.stepUpToken } : {})
    },
    body: JSON.stringify({
      disabled: input.disabled,
      reason: input.reason
    })
  });
  const payload = await parseJsonResponse<{ control: AiModelControlDto }>(response);
  return payload.control;
};

export const fetchComplianceCases = async (input: {
  subjectUserId?: string;
  status?: ComplianceCaseDto['status'];
  type?: ComplianceCaseDto['type'];
  limit?: number;
} = {}): Promise<ComplianceCaseDto[]> => {
  const params = new URLSearchParams();
  if (input.subjectUserId) params.set('subjectUserId', input.subjectUserId);
  if (input.status) params.set('status', input.status);
  if (input.type) params.set('type', input.type);
  if (input.limit) params.set('limit', String(input.limit));
  const query = params.toString();
  const response = await fetch(`/api/admin/compliance/cases${query ? `?${query}` : ''}`, {
    headers: authHeaders()
  });
  const payload = await parseJsonResponse<{ cases: ComplianceCaseDto[] }>(response);
  return payload.cases;
};

export const fetchMyComplianceCases = async (input: {
  status?: ComplianceCaseDto['status'];
  type?: ComplianceCaseDto['type'];
  limit?: number;
} = {}): Promise<ComplianceCaseDto[]> => {
  const params = new URLSearchParams();
  if (input.status) params.set('status', input.status);
  if (input.type) params.set('type', input.type);
  if (input.limit) params.set('limit', String(input.limit));
  const query = params.toString();
  const response = await fetch(`/api/compliance/cases${query ? `?${query}` : ''}`, {
    headers: authHeaders()
  });
  const payload = await parseJsonResponse<{ cases: ComplianceCaseDto[] }>(response);
  return payload.cases;
};

export const createComplianceCase = async (input: {
  subjectUserId: string;
  type: ComplianceCaseDto['type'];
  priority?: ComplianceCaseDto['priority'];
  title: string;
  description?: string;
  evidence?: Record<string, unknown>;
  assignedToUserId?: string;
}): Promise<ComplianceCaseDto> => {
  const response = await fetch('/api/admin/compliance/cases', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(input)
  });
  const payload = await parseJsonResponse<{ case: ComplianceCaseDto }>(response);
  return payload.case;
};

export const addComplianceCaseNote = async (input: {
  caseId: string;
  note: string;
  action?: string;
  status?: ComplianceCaseDto['status'];
  assignedToUserId?: string;
  outcome?: string;
  evidence?: Record<string, unknown>;
}): Promise<ComplianceCaseDto> => {
  const response = await fetch(`/api/admin/compliance/cases/${encodeURIComponent(input.caseId)}/notes`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      note: input.note,
      action: input.action,
      status: input.status,
      assignedToUserId: input.assignedToUserId,
      outcome: input.outcome,
      evidence: input.evidence
    })
  });
  const payload = await parseJsonResponse<{ case: ComplianceCaseDto }>(response);
  return payload.case;
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

export const fetchNotificationPreferences = async (): Promise<NotificationPreferenceDto[]> => {
  const response = await fetch('/api/notifications/preferences', {
    headers: authHeaders()
  });
  const payload = await parseJsonResponse<{ preferences: NotificationPreferenceDto[] }>(response);
  return payload.preferences;
};

export const updateNotificationPreference = async (input: {
  type: NotificationDto['type'];
  enabled: boolean;
}): Promise<NotificationPreferenceDto> => {
  const response = await fetch(`/api/notifications/preferences/${encodeURIComponent(input.type)}`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ enabled: input.enabled })
  });
  const payload = await parseJsonResponse<{ preference: NotificationPreferenceDto }>(response);
  return payload.preference;
};

export const fetchAdminNotificationDeliveries = async (input: {
  userId?: string;
  status?: NotificationDeliveryDto['status'];
  limit?: number;
} = {}): Promise<NotificationDeliveryDto[]> => {
  const params = new URLSearchParams();
  if (input.userId) params.set('userId', input.userId);
  if (input.status) params.set('status', input.status);
  if (input.limit) params.set('limit', String(input.limit));
  const query = params.toString();
  const response = await fetch(`/api/admin/notifications/deliveries${query ? `?${query}` : ''}`, {
    headers: authHeaders()
  });
  const payload = await parseJsonResponse<{ deliveries: NotificationDeliveryDto[] }>(response);
  return payload.deliveries;
};

export const createNotification = async (input: {
  type: 'support' | 'admin' | 'system';
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<{ notification?: NotificationDto; delivery: NotificationDeliveryDto }> => {
  const response = await fetch('/api/notifications', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(input)
  });
  return parseJsonResponse<{ notification?: NotificationDto; delivery: NotificationDeliveryDto }>(response);
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
