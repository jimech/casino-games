import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { AiEventCategory } from './src/backend/aiEventService';
import { explanationsToCsv } from './src/backend/aiDecisionExplanationService';
import { extractBearerToken, AuthUser } from './src/backend/authService';
import { GameRoundRecord } from './src/backend/casinoService';
import { createServices } from './src/backend/serviceFactory';
import { RecommendationGame } from './src/backend/gameRecommendationService';
import { spinRoulette } from './src/backend/games/rouletteEngine';
import { cashoutCrashRound, startCrashRound } from './src/backend/games/crashEngine';
import { spinSlots } from './src/backend/games/slotsEngine';
import { actBlackjackRound, startBlackjackRound } from './src/backend/games/blackjackEngine';
import { actPokerRound, startPokerRound } from './src/backend/games/pokerEngine';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT ?? 3000);
const { casinoService, authService, riskService, bonusService, notificationService, aiEventService, aiDecisionExplanationService, aiFeatureService, gameRecommendationService, bonusTargetingService, churnService, fraudService, responsiblePlayService } = createServices();
const walletEventClients = new Map<string, Set<express.Response>>();
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

const RECOMMENDATION_CATALOG: RecommendationGame[] = [
  { id: 'fruit-mania', title: 'Neon Fruit Mania', category: 'slots', provider: 'Spinfuego', rtp: '96.5%', volatility: 'Low' },
  { id: 'cyber-jackpot', title: 'Cyber Jackpot 2077', category: 'slots', provider: 'HackerGames', rtp: '95.0%', volatility: 'High' },
  { id: 'ancient-gold', title: "Pharaoh's Neon Gold", category: 'slots', provider: 'GizaBits', rtp: '97.2%', volatility: 'Medium' },
  { id: 'cherry-rush', title: 'Cherry Fusion Blast', category: 'slots', provider: 'Spinfuego', rtp: '98.1%', volatility: 'Low' },
  { id: 'laser-lines', title: 'Laser Lines Wild', category: 'slots', provider: 'NexusStudio', rtp: '94.2%', volatility: 'Extreme' },
  { id: 'bj-standard', title: 'Blackjack Vegas Pro', category: 'blackjack', provider: 'Evolutionary', rtp: '99.5%', volatility: 'Medium' },
  { id: 'bj-vip', title: 'Diamond VIP Blackjack', category: 'blackjack', provider: 'Evolutionary', rtp: '99.7%', volatility: 'Low' },
  { id: 'roulette-euro', title: 'European Neon Wheel', category: 'roulette', provider: 'RND Labs', rtp: '97.3%', volatility: 'Medium' },
  { id: 'roulette-royal', title: 'Roulette Royale', category: 'roulette', provider: 'GizaBits', rtp: '97.3%', volatility: 'High' },
  { id: 'poker-holdem', title: "Hold'em Tournament AI", category: 'poker', provider: 'DealerPro', rtp: '98.9%', volatility: 'High' },
  { id: 'poker-omaha', title: 'Omaha Limit Pro', category: 'poker', provider: 'DealerPro', rtp: '97.8%', volatility: 'Medium' },
  { id: 'crash-cosmic', title: 'Cosmic Flight Rocket', category: 'crash', provider: 'NexusStudio', rtp: '96.2%', volatility: 'Extreme' },
  { id: 'crash-zeus', title: "Zeus Thunderbolt", category: 'crash', provider: 'Athenian', rtp: '96.8%', volatility: 'High' },
  { id: 'live-dealer-bj', title: 'Live Emerald Dealer BJ', category: 'live', provider: 'VegasStream', rtp: '99.5%', volatility: 'Medium' },
  { id: 'live-dealer-rt', title: 'Live Sunset Casino Wheel', category: 'live', provider: 'VegasStream', rtp: '97.3%', volatility: 'High' },
  { id: 'live-dealer-pk', title: 'Live Holdem Champions', category: 'live', provider: 'VegasStream', rtp: '98.9%', volatility: 'High' },
  { id: 'slots-cyber-reels', title: 'Retro Byte Reels', category: 'slots', provider: 'RetroCade', rtp: '96.0%', volatility: 'Low' },
  { id: 'slots-volcano', title: 'Neon Volcanic Hot', category: 'slots', provider: 'Spinfuego', rtp: '95.5%', volatility: 'High' },
  { id: 'slots-aztec', title: 'Aztec Laser Pyramid', category: 'slots', provider: 'GizaBits', rtp: '96.6%', volatility: 'Medium' },
  { id: 'slots-neon-777', title: 'Classic Wild Triple 7s', category: 'slots', provider: 'NexusStudio', rtp: '97.5%', volatility: 'Low' }
];

app.use(express.json());

// API configuration endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'Casino Games Platform',
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    timestamp: new Date().toISOString()
  });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    await enforceRateLimit(req, 'auth_register', 6, 60_000);
    const session = await authService.register({
      email: typeof req.body.email === 'string' ? req.body.email : undefined,
      username: String(req.body.username ?? ''),
      password: String(req.body.password ?? ''),
      displayName: typeof req.body.displayName === 'string' ? req.body.displayName : undefined,
      dateOfBirth: typeof req.body.dateOfBirth === 'string' ? req.body.dateOfBirth : undefined,
      acceptAgeGate: Boolean(req.body.acceptAgeGate),
      acceptTerms: Boolean(req.body.acceptTerms),
      acceptPrivacy: Boolean(req.body.acceptPrivacy),
      adminInviteCode: typeof req.body.adminInviteCode === 'string' ? req.body.adminInviteCode : undefined,
      userAgent: req.get('user-agent'),
      ipAddress: req.ip
    });
    res.status(201).json(session);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    await enforceRateLimit(req, 'auth_login', 10, 60_000);
    const session = await authService.login({
      login: String(req.body.login ?? ''),
      password: String(req.body.password ?? ''),
      userAgent: req.get('user-agent'),
      ipAddress: req.ip
    });
    res.json(session);
  } catch (error) {
    await riskService.recordEvent({
      type: 'failed_login',
      severity: 'low',
      score: 10,
      context: {
        login: typeof req.body.login === 'string' ? req.body.login.slice(0, 120) : undefined,
        userAgent: req.get('user-agent'),
        ipAddress: req.ip
      }
    });
    sendApiError(res, error);
  }
});

app.get('/api/auth/session', async (req, res) => {
  try {
    res.json(await authService.getSession(extractBearerToken(req.get('authorization'))));
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    await authService.logout(extractBearerToken(req.get('authorization')));
    res.status(204).end();
  } catch (error) {
    sendApiError(res, error);
  }
});

app.patch('/api/auth/profile', async (req, res) => {
  try {
    res.json(await authService.updateProfile({
      token: extractBearerToken(req.get('authorization')),
      displayName: typeof req.body.displayName === 'string' ? req.body.displayName : undefined,
      email: typeof req.body.email === 'string' ? req.body.email : undefined
    }));
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/auth/consent', async (req, res) => {
  try {
    res.json(await authService.updateConsent({
      token: extractBearerToken(req.get('authorization')),
      acceptAgeGate: Boolean(req.body.acceptAgeGate),
      acceptTerms: Boolean(req.body.acceptTerms),
      acceptPrivacy: Boolean(req.body.acceptPrivacy)
    }));
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/wallet/:userId', async (req, res) => {
  try {
    await requireOwnUser(req, req.params.userId);
    res.json(await casinoService.getWallet(req.params.userId));
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/wallet/:userId/ledger', async (req, res) => {
  try {
    await requireOwnUser(req, req.params.userId);
    const entries = await casinoService.getLedger(req.params.userId);
    res.json({ entries: entries.map(sanitizeLedgerEntryForApi) });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/wallet/:userId/events', async (req, res) => {
  try {
    const user = await requireOwnUser(req, req.params.userId);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    addWalletClient(user.id, res);
    sendWalletEvent(res, 'wallet', await casinoService.getWallet(user.id));

    const heartbeat = setInterval(() => {
      sendSseEvent(res, 'heartbeat', { timestamp: new Date().toISOString() });
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      removeWalletClient(user.id, res);
    });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/rounds', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const requestedUserId = typeof req.query.userId === 'string' ? req.query.userId : user.id;
    await assertOwnUser(user, requestedUserId);
    const rounds = await casinoService.listRounds(user.id);
    res.json({ rounds: rounds.map(sanitizeRoundForApi) });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/risk/events', async (req, res) => {
  try {
    await requireAdmin(req);
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const status = isRiskStatus(req.query.status) ? req.query.status : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    res.json({ events: await riskService.listEvents({ userId, status, limit }) });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/ai/events', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const requestedUserId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const category = isAiEventCategory(req.query.category) ? req.query.category : undefined;
    const since = typeof req.query.since === 'string' ? req.query.since : undefined;
    const until = typeof req.query.until === 'string' ? req.query.until : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const userId = requestedUserId ?? (user.role === 'admin' ? undefined : user.id);

    if (requestedUserId && requestedUserId !== user.id) await requireAdmin(req);

    res.json({
      events: await aiEventService.list({ userId, category, since, until, limit })
    });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/ai/events', async (req, res) => {
  try {
    const user = await requireAuth(req);
    if (!isAiEventCategory(req.body.category)) throw new Error('category is invalid');
    const event = await aiEventService.track({
      userId: user.id,
      category: req.body.category,
      name: String(req.body.name ?? ''),
      context: isRecord(req.body.context) ? req.body.context : undefined
    });
    const snapshot = await aiFeatureService.refresh({ userId: user.id });
    res.status(201).json({ event, snapshot });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/ai/profile', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const userId = await resolveAiProfileUserId(req, user);
    const snapshot = await aiFeatureService.latest({ userId }) ?? await aiFeatureService.refresh({ userId });
    res.json({ snapshot });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/ai/profile/refresh', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const userId = await resolveAiProfileUserId(req, user);
    const snapshot = await aiFeatureService.refresh({
      userId,
      since: typeof req.body.since === 'string' ? req.body.since : undefined,
      until: typeof req.body.until === 'string' ? req.body.until : undefined,
      limit: typeof req.body.limit === 'number' ? req.body.limit : undefined
    });
    res.status(201).json({ snapshot });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/recommendations/games', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const snapshot = await aiFeatureService.latest({ userId: user.id });
    const result = gameRecommendationService.rank({
      games: RECOMMENDATION_CATALOG,
      snapshot,
      limit
    });
    const explanation = await explainDecision({
      userId: user.id,
      decisionType: 'game_recommendations',
      modelVersion: result.profileVersion ?? 'recommendation-fallback-v1',
      sourceFeatureSnapshotId: snapshot?.id,
      sourceFeatureVersion: snapshot?.version,
      inputFeatures: {
        requestedLimit: limit ?? null,
        sourceEventCount: snapshot?.sourceEventCount ?? 0,
        favoriteGameId: snapshot?.features.gameSignals.favoriteGameId,
        favoriteRoute: snapshot?.features.gameSignals.favoriteRoute
      },
      output: {
        source: result.source,
        topGameIds: result.recommendations.slice(0, 5).map(item => item.gameId),
        scores: result.recommendations.slice(0, 5).map(item => ({ gameId: item.gameId, score: item.score }))
      },
      threshold: { returnedLimit: result.recommendations.length },
      reasonCodes: result.recommendations.flatMap(item => item.reasons).slice(0, 25)
    });
    await trackAiEventSafely({
      userId: user.id,
      category: 'game',
      name: 'game_recommendations_generated',
      context: {
        explanationId: explanation?.id,
        source: result.source,
        profileVersion: result.profileVersion,
        topGameIds: result.recommendations.slice(0, 5).map(item => item.gameId),
        scores: result.recommendations.slice(0, 5).map(item => ({ gameId: item.gameId, score: item.score, reasons: item.reasons }))
      }
    });
    res.json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/bonuses', async (req, res) => {
  try {
    const user = await requireAuth(req);
    res.json({
      campaigns: await bonusService.listCampaigns(),
      claims: await bonusService.listClaims(user.id)
    });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/bonuses/targeted', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const [campaigns, claims, snapshot, recentTargetingEvents] = await Promise.all([
      bonusService.listCampaigns(),
      bonusService.listClaims(user.id),
      aiFeatureService.latest({ userId: user.id }),
      aiEventService.list({ userId: user.id, category: 'bonus', limit: 25 })
    ]);
    const result = bonusTargetingService.target({
      campaigns,
      claims,
      snapshot,
      recentTargetingEvents
    });
    const explanation = await explainDecision({
      userId: user.id,
      decisionType: 'bonus_targeting',
      modelVersion: result.profileVersion ?? 'bonus-targeting-fallback-v1',
      sourceFeatureSnapshotId: snapshot?.id,
      sourceFeatureVersion: snapshot?.version,
      inputFeatures: {
        campaignCount: campaigns.length,
        claimCount: claims.length,
        targetingEventCount: recentTargetingEvents.length,
        highStakeRatio: snapshot?.features.riskSignals.highStakeRatio ?? 0,
        bonusClaims: snapshot?.features.bonusSignals.claims ?? 0
      },
      output: {
        source: result.source,
        offerIds: result.offers.map(offer => offer.id),
        suppressedOfferIds: result.suppressed.map(offer => offer.id)
      },
      threshold: { cooldownHours: 24, minimumOfferScore: 40 },
      reasonCodes: [
        ...result.offers.flatMap(offer => offer.reasonCodes),
        ...result.suppressed.flatMap(offer => offer.suppressionCodes)
      ].slice(0, 25)
    });
    await trackAiEventSafely({
      userId: user.id,
      category: 'bonus',
      name: 'bonus_targets_generated',
      context: {
        explanationId: explanation?.id,
        source: result.source,
        profileVersion: result.profileVersion,
        offerIds: result.offers.map(offer => offer.id),
        suppressedOfferIds: result.suppressed.map(offer => offer.id),
        reasons: result.offers.map(offer => ({ offerId: offer.id, reasonCodes: offer.reasonCodes })),
        suppressions: result.suppressed.map(offer => ({ offerId: offer.id, suppressionCodes: offer.suppressionCodes }))
      }
    });
    res.json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/retention/churn-score', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const userId = await resolveModelUserId(req, user);
    const score = await churnService.latest({ userId }) ?? await refreshChurnScore(userId);
    res.json({ score });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/retention/churn-score/refresh', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const userId = await resolveModelUserId(req, user);
    const score = await refreshChurnScore(userId);
    res.status(201).json({ score });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/admin/churn-scores', async (req, res) => {
  try {
    await requireAdmin(req);
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const band = isChurnBand(req.query.band) ? req.query.band : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    res.json({ scores: await churnService.list({ userId, band, limit }) });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/risk/fraud-score', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const userId = await resolveModelUserId(req, user);
    const score = await fraudService.latest({ userId }) ?? await refreshFraudScore(userId);
    res.json({ score });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/risk/fraud-score/refresh', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const userId = await resolveModelUserId(req, user);
    const score = await refreshFraudScore(userId);
    res.status(201).json({ score });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/admin/fraud-scores', async (req, res) => {
  try {
    await requireAdmin(req);
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const band = isFraudBand(req.query.band) ? req.query.band : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    res.json({ scores: await fraudService.list({ userId, band, limit }) });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/responsible-play/interventions', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const userId = await resolveModelUserId(req, user);
    const level = isResponsiblePlayLevel(req.query.level) ? req.query.level : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    res.json({ interventions: await responsiblePlayService.list({ userId, level, limit }) });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/responsible-play/interventions/evaluate', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const userId = await resolveModelUserId(req, user);
    const intervention = await evaluateResponsiblePlay({
      userId,
      triggerGameId: typeof req.body.gameId === 'string' ? req.body.gameId : undefined,
      triggerStake: Number(req.body.stake ?? 0)
    });
    res.status(201).json({ intervention });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/admin/responsible-play/interventions', async (req, res) => {
  try {
    await requireAdmin(req);
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const level = isResponsiblePlayLevel(req.query.level) ? req.query.level : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    res.json({ interventions: await responsiblePlayService.list({ userId, level, limit }) });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/admin/ai-decision-explanations', async (req, res) => {
  try {
    await requireAdmin(req);
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const decisionType = typeof req.query.decisionType === 'string' ? req.query.decisionType : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    res.json({ explanations: await aiDecisionExplanationService.list({ userId, decisionType, limit }) });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/admin/ai-decision-explanations/export', async (req, res) => {
  try {
    await requireAdmin(req);
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const decisionType = typeof req.query.decisionType === 'string' ? req.query.decisionType : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 500;
    const explanations = await aiDecisionExplanationService.list({ userId, decisionType, limit });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ai-decision-explanations.csv"');
    res.send(explanationsToCsv(explanations));
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/admin/summary', async (req, res) => {
  try {
    const user = await requireAdmin(req);
    const [wallet, ledger, rounds, riskEvents, campaigns, claims, aiEvents, aiDecisionExplanations, churnScore, fraudScore, responsiblePlayIntervention] = await Promise.all([
      casinoService.getWallet(user.id),
      casinoService.getLedger(user.id),
      casinoService.listRounds(user.id),
      riskService.listEvents({ userId: user.id, limit: 25 }),
      bonusService.listCampaigns(),
      bonusService.listClaims(user.id),
      aiEventService.list({ userId: user.id, limit: 25 }),
      aiDecisionExplanationService.list({ userId: user.id, limit: 25 }),
      churnService.latest({ userId: user.id }),
      fraudService.latest({ userId: user.id }),
      responsiblePlayService.latest({ userId: user.id })
    ]);

    await trackAiEventSafely({
      userId: user.id,
      category: 'admin',
      name: 'admin_summary_viewed',
      context: {
        ledgerCount: ledger.length,
        roundCount: rounds.length,
        openRiskCount: riskEvents.filter(event => event.status === 'open').length,
        bonusClaimCount: claims.length
      }
    });
    const aiFeatureSnapshot = await aiFeatureService.latest({ userId: user.id });

    res.json({
      user,
      wallet,
      ledger: ledger.map(sanitizeLedgerEntryForApi).slice(-25).reverse(),
      rounds: rounds.map(sanitizeRoundForApi).slice(0, 25),
      riskEvents,
      bonusCampaigns: campaigns,
      bonusClaims: claims,
      aiEvents,
      aiDecisionExplanations,
      aiFeatureSnapshot,
      churnScore,
      fraudScore,
      responsiblePlayIntervention
    });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/notifications', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const unreadOnly = req.query.unreadOnly === 'true';
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    res.json({ notifications: await notificationService.list({ userId: user.id, unreadOnly, limit }) });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/notifications', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const notification = await notificationService.create({
      userId: user.id,
      type: req.body.type === 'support' || req.body.type === 'admin' ? req.body.type : 'system',
      title: String(req.body.title ?? ''),
      message: String(req.body.message ?? ''),
      metadata: isRecord(req.body.metadata) ? req.body.metadata : undefined
    });
    res.status(201).json({ notification });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/notifications/:notificationId/read', async (req, res) => {
  try {
    const user = await requireAuth(req);
    res.json({
      notification: await notificationService.markRead({
        userId: user.id,
        notificationId: req.params.notificationId
      })
    });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/bonuses/:campaignId/claim', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const result = await bonusService.claimBonus({
      userId: user.id,
      campaignId: req.params.campaignId,
      idempotencyKey: String(req.body.idempotencyKey ?? '')
    });
    broadcastWallet(user.id, result.wallet);
    if (result.claim.idempotencyKey === String(req.body.idempotencyKey ?? '')) {
      await notificationService.create({
        userId: user.id,
        type: 'bonus',
        title: 'Bonus credited',
        message: `${result.campaign.title}: +$${result.claim.amount}`,
        metadata: {
          campaignId: result.campaign.id,
          claimId: result.claim.id,
          claimKey: result.claim.claimKey
        }
      });
    }
    await trackAiEventSafely({
      userId: user.id,
      category: 'bonus',
      name: 'bonus_claimed',
      context: {
        campaignId: result.campaign.id,
        claimId: result.claim.id,
        claimKey: result.claim.claimKey,
        amount: result.claim.amount
      }
    });
    res.status(201).json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/bets', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const intervention = await evaluateResponsiblePlay({
      userId: user.id,
      triggerGameId: String(req.body.gameId ?? ''),
      triggerStake: Number(req.body.stake)
    });
    const round = await casinoService.placeBet({
      userId: user.id,
      gameId: String(req.body.gameId ?? ''),
      stake: Number(req.body.stake),
      idempotencyKey: String(req.body.idempotencyKey ?? '')
    });
    const wallet = await casinoService.getWallet(round.userId);
    broadcastWallet(round.userId, wallet);
    await assessRoundStarted(round);
    res.status(201).json(withResponsiblePlay({ round, wallet }, intervention));
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/rounds/:roundId/settle', async (req, res) => {
  try {
    const user = await requireAuth(req);
    await assertRoundOwner(req.params.roundId, user.id);
    const round = await casinoService.settleRound({
      roundId: req.params.roundId,
      payout: Number(req.body.payout),
      idempotencyKey: String(req.body.idempotencyKey ?? ''),
      outcome: req.body.outcome
    });
    const wallet = await casinoService.getWallet(round.userId);
    broadcastWallet(round.userId, wallet);
    await riskService.assessRoundSettled(round);
    res.json({ round, wallet });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/rounds/:roundId/refund', async (req, res) => {
  try {
    const user = await requireAuth(req);
    await assertRoundOwner(req.params.roundId, user.id);
    const round = await casinoService.refundRound({
      roundId: req.params.roundId,
      idempotencyKey: String(req.body.idempotencyKey ?? ''),
      reason: typeof req.body.reason === 'string' ? req.body.reason : undefined
    });
    const wallet = await casinoService.getWallet(round.userId);
    broadcastWallet(round.userId, wallet);
    await riskService.assessRoundSettled(round);
    res.json({ round, wallet });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/games/roulette/spin', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const result = await spinRoulette(casinoService, {
      userId: user.id,
      bets: req.body.bets,
      idempotencyKey: typeof req.body.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined
    });
    const intervention = await evaluateResponsiblePlay({
      userId: user.id,
      triggerGameId: 'roulette',
      triggerStake: result.stake
    });
    broadcastWallet(result.round.userId, result.wallet);
    await assessRoundStarted(result.round);
    await riskService.assessRoundSettled(result.round);
    res.status(201).json(withResponsiblePlay(result, intervention));
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/games/crash/start', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const intervention = await evaluateResponsiblePlay({
      userId: user.id,
      triggerGameId: 'crash',
      triggerStake: Number(req.body.stake)
    });
    const result = await startCrashRound(casinoService, {
      userId: user.id,
      stake: Number(req.body.stake),
      idempotencyKey: typeof req.body.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined
    });
    broadcastWallet(result.round.userId, result.wallet);
    await assessRoundStarted(result.round);
    res.status(201).json(withResponsiblePlay(result, intervention));
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/games/crash/:roundId/cashout', async (req, res) => {
  try {
    const user = await requireAuth(req);
    await assertRoundOwner(req.params.roundId, user.id);
    const result = await cashoutCrashRound(casinoService, {
      roundId: req.params.roundId,
      cashoutMultiplier: Number(req.body.cashoutMultiplier),
      idempotencyKey: typeof req.body.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined
    });
    broadcastWallet(result.round.userId, result.wallet);
    await riskService.assessRoundSettled(result.round);
    res.json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/games/slots/spin', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const intervention = await evaluateResponsiblePlay({
      userId: user.id,
      triggerGameId: 'slots',
      triggerStake: Boolean(req.body.freeSpin) ? 0 : Number(req.body.bet)
    });
    const result = await spinSlots(casinoService, {
      userId: user.id,
      machineId: String(req.body.machineId ?? ''),
      bet: Number(req.body.bet),
      freeSpin: Boolean(req.body.freeSpin),
      bonusMultiplier: Number(req.body.bonusMultiplier ?? (req.body.freeSpin ? 3 : 1)),
      idempotencyKey: typeof req.body.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined
    });
    broadcastWallet(result.round.userId, result.wallet);
    await assessRoundStarted(result.round);
    await riskService.assessRoundSettled(result.round);
    res.status(201).json(withResponsiblePlay(result, intervention));
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/games/blackjack/start', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const intervention = await evaluateResponsiblePlay({
      userId: user.id,
      triggerGameId: 'blackjack',
      triggerStake: Number(req.body.stake)
    });
    const result = await startBlackjackRound(casinoService, {
      userId: user.id,
      stake: Number(req.body.stake),
      idempotencyKey: typeof req.body.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined
    });
    broadcastWallet(result.round.userId, result.wallet);
    await assessRoundStarted(result.round);
    if (result.round.status !== 'open') await riskService.assessRoundSettled(result.round);
    res.status(201).json(withResponsiblePlay(result, intervention));
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/games/blackjack/:roundId/action', async (req, res) => {
  try {
    const user = await requireAuth(req);
    await assertRoundOwner(req.params.roundId, user.id);
    const result = await actBlackjackRound(casinoService, {
      roundId: req.params.roundId,
      action: req.body.action,
      idempotencyKey: typeof req.body.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined
    });
    broadcastWallet(result.round.userId, result.wallet);
    if (result.round.status !== 'open') await riskService.assessRoundSettled(result.round);
    res.json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/games/poker/start', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const intervention = await evaluateResponsiblePlay({
      userId: user.id,
      triggerGameId: 'poker',
      triggerStake: Number(req.body.ante)
    });
    const result = await startPokerRound(casinoService, {
      userId: user.id,
      ante: Number(req.body.ante),
      idempotencyKey: typeof req.body.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined
    });
    broadcastWallet(result.round.userId, result.wallet);
    await assessRoundStarted(result.round);
    res.status(201).json(withResponsiblePlay(result, intervention));
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/games/poker/:roundId/action', async (req, res) => {
  try {
    const user = await requireAuth(req);
    await assertRoundOwner(req.params.roundId, user.id);
    const result = await actPokerRound(casinoService, {
      roundId: req.params.roundId,
      action: req.body.action,
      idempotencyKey: typeof req.body.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined
    });
    broadcastWallet(result.round.userId, result.wallet);
    if (result.round.status !== 'open') await riskService.assessRoundSettled(result.round);
    res.json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

// Production VS Development serving logic
if (process.env.NODE_ENV === 'production') {
  // CJS output is bundled to dist/server.cjs; target static files from ../
  app.use(express.static(path.join(__dirname, '..')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
  });
} else {
  // Spin up Vite in middleware mode
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
    appType: 'spa'
  });
  app.use(vite.middlewares);
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Casino Server running dynamically on http://0.0.0.0:${port}`);
});

function sendApiError(res: express.Response, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown server error';
  const status = /too many requests/i.test(message) ? 429 : /unauthorized/i.test(message) ? 401 : /forbidden/i.test(message) ? 403 : /not found/i.test(message) ? 404 : /required|invalid|insufficient|already|not open|consent/i.test(message) ? 400 : 500;
  res.status(status).json({ error: message });
}

async function requireAuth(req: express.Request): Promise<AuthUser> {
  const session = await authService.getSession(extractRequestToken(req));
  return session.user;
}

async function requireAdmin(req: express.Request): Promise<AuthUser> {
  const user = await requireAuth(req);
  if (user.role !== 'admin') {
    await riskService.recordEvent({
      userId: user.id,
      type: 'forbidden_admin_access',
      severity: 'high',
      score: 80,
      context: { path: req.path, method: req.method }
    });
    throw new Error('Forbidden admin access');
  }
  return user;
}

async function requireOwnUser(req: express.Request, userId: string): Promise<AuthUser> {
  const user = await requireAuth(req);
  await assertOwnUser(user, userId);
  return user;
}

async function assertOwnUser(user: AuthUser, userIdOrUsername: string): Promise<void> {
  if (userIdOrUsername === user.id || userIdOrUsername === user.username) return;
  await riskService.recordEvent({
    userId: user.id,
    type: 'forbidden_user_access',
    severity: 'high',
    score: 70,
    context: { requestedUser: userIdOrUsername }
  });
  throw new Error('Forbidden user access');
}

async function assertRoundOwner(roundId: string, userId: string): Promise<void> {
  const rounds = await casinoService.listRounds(userId);
  if (!rounds.some(round => round.id === roundId)) {
    await riskService.recordEvent({
      userId,
      type: 'forbidden_round_access',
      severity: 'high',
      score: 75,
      context: { roundId }
    });
    throw new Error('Forbidden round access');
  }
}

async function assessRoundStarted(round: GameRoundRecord) {
  const recentRounds = await casinoService.listRounds(round.userId);
  await trackAiEventSafely({
    userId: round.userId,
    category: 'game',
    name: 'round_started',
    context: {
      roundId: round.id,
      gameId: round.gameId,
      stake: round.stake,
      status: round.status
    }
  });
  await riskService.assessRoundStarted(round, recentRounds);
}

function isRiskStatus(value: unknown): value is 'open' | 'reviewed' | 'dismissed' {
  return value === 'open' || value === 'reviewed' || value === 'dismissed';
}

function isAiEventCategory(value: unknown): value is AiEventCategory {
  return value === 'page' ||
    value === 'game' ||
    value === 'wallet' ||
    value === 'bonus' ||
    value === 'risk' ||
    value === 'admin' ||
    value === 'session';
}

function isChurnBand(value: unknown): value is 'low' | 'medium' | 'high' | 'critical' {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical';
}

function isFraudBand(value: unknown): value is 'low' | 'medium' | 'high' | 'critical' {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical';
}

function isResponsiblePlayLevel(value: unknown): value is 'none' | 'notice' | 'warning' | 'cooldown' {
  return value === 'none' || value === 'notice' || value === 'warning' || value === 'cooldown';
}

async function trackAiEventSafely(input: {
  userId: string;
  category: AiEventCategory;
  name: string;
  context?: Record<string, unknown>;
}) {
  try {
    const event = await aiEventService.track(input);
    await aiFeatureService.refresh({ userId: input.userId });
    return event;
  } catch (error) {
    console.warn('AI event capture failed', error);
    return undefined;
  }
}

async function explainDecision(input: {
  userId: string;
  decisionType: string;
  modelVersion: string;
  sourceRecordId?: string;
  sourceFeatureSnapshotId?: string;
  sourceFeatureVersion?: string;
  inputFeatures?: Record<string, unknown>;
  output?: Record<string, unknown>;
  threshold?: Record<string, unknown>;
  reasonCodes?: string[];
}) {
  try {
    return await aiDecisionExplanationService.record(input);
  } catch (error) {
    console.warn('AI decision explanation failed', error);
    return undefined;
  }
}

async function resolveAiProfileUserId(req: express.Request, user: AuthUser): Promise<string> {
  return resolveModelUserId(req, user);
}

async function resolveModelUserId(req: express.Request, user: AuthUser): Promise<string> {
  const requestedUserId = typeof req.query.userId === 'string'
    ? req.query.userId
    : typeof req.body?.userId === 'string'
      ? req.body.userId
      : undefined;
  if (!requestedUserId || requestedUserId === user.id) return user.id;
  await requireAdmin(req);
  return requestedUserId;
}

async function refreshChurnScore(userId: string) {
  const snapshot = await aiFeatureService.latest({ userId }) ?? await aiFeatureService.refresh({ userId });
  const score = await churnService.score({ userId, snapshot });
  const explanation = await explainDecision({
    userId,
    decisionType: 'churn_score',
    modelVersion: score.version,
    sourceRecordId: score.id,
    sourceFeatureSnapshotId: score.sourceFeatureSnapshotId,
    sourceFeatureVersion: score.sourceFeatureVersion,
    inputFeatures: {
      sourceEventCount: snapshot.sourceEventCount,
      roundsStarted: snapshot.features.totals.roundsStarted,
      activeSpanMinutes: snapshot.features.engagement.activeSpanMinutes,
      bonusClaims: snapshot.features.bonusSignals.claims
    },
    output: {
      score: score.score,
      band: score.band,
      recommendedActions: score.recommendedActions
    },
    threshold: { medium: 40, high: 70, critical: 85 },
    reasonCodes: score.reasonCodes
  });
  await trackAiEventSafely({
    userId,
    category: 'risk',
    name: 'churn_score_generated',
    context: {
      explanationId: explanation?.id,
      score: score.score,
      band: score.band,
      reasonCodes: score.reasonCodes,
      recommendedActions: score.recommendedActions,
      version: score.version
    }
  });
  if (score.band === 'high' || score.band === 'critical') {
    await riskService.recordEvent({
      userId,
      type: 'churn_risk_high',
      severity: score.band === 'critical' ? 'high' : 'medium',
      score: score.score,
      context: {
        explanationId: explanation?.id,
        churnScoreId: score.id,
        band: score.band,
        reasonCodes: score.reasonCodes,
        recommendedActions: score.recommendedActions
      }
    });
  }
  return score;
}

async function refreshFraudScore(userId: string) {
  const snapshot = await aiFeatureService.latest({ userId }) ?? await aiFeatureService.refresh({ userId });
  const [aiEvents, riskEvents, bonusClaims] = await Promise.all([
    aiEventService.list({ userId, limit: 250 }),
    riskService.listEvents({ userId, limit: 100 }),
    bonusService.listClaims(userId)
  ]);
  const score = await fraudService.score({
    userId,
    snapshot,
    aiEvents,
    riskEvents,
    bonusClaims
  });
  const explanation = await explainDecision({
    userId,
    decisionType: 'fraud_score',
    modelVersion: score.version,
    sourceRecordId: score.id,
    sourceFeatureSnapshotId: score.sourceFeatureSnapshotId,
    sourceFeatureVersion: score.sourceFeatureVersion,
    inputFeatures: score.details,
    output: {
      score: score.score,
      band: score.band,
      recommendedActions: score.recommendedActions
    },
    threshold: { medium: 40, high: 70, critical: 85 },
    reasonCodes: score.reasonCodes
  });
  await trackAiEventSafely({
    userId,
    category: 'risk',
    name: 'fraud_score_generated',
    context: {
      explanationId: explanation?.id,
      score: score.score,
      band: score.band,
      reasonCodes: score.reasonCodes,
      recommendedActions: score.recommendedActions,
      version: score.version
    }
  });
  if (score.band === 'high' || score.band === 'critical') {
    await riskService.recordEvent({
      userId,
      type: 'fraud_anomaly_high',
      severity: score.band === 'critical' ? 'critical' : 'high',
      score: score.score,
      context: {
        explanationId: explanation?.id,
        fraudScoreId: score.id,
        band: score.band,
        reasonCodes: score.reasonCodes,
        recommendedActions: score.recommendedActions
      }
    });
  }
  return score;
}

async function evaluateResponsiblePlay(input: {
  userId: string;
  triggerGameId?: string;
  triggerStake?: number;
}) {
  const [snapshot, recentRounds, riskEvents] = await Promise.all([
    aiFeatureService.latest({ userId: input.userId }),
    casinoService.listRounds(input.userId),
    riskService.listEvents({ userId: input.userId, limit: 100 })
  ]);
  const intervention = await responsiblePlayService.evaluate({
    ...input,
    snapshot,
    recentRounds,
    riskEvents
  });
  const explanation = await explainDecision({
    userId: input.userId,
    decisionType: 'responsible_play_intervention',
    modelVersion: intervention.version,
    sourceRecordId: intervention.id,
    sourceFeatureSnapshotId: intervention.sourceFeatureSnapshotId,
    sourceFeatureVersion: intervention.sourceFeatureVersion,
    inputFeatures: intervention.details,
    output: {
      level: intervention.level,
      score: intervention.score,
      requiresAcknowledgement: intervention.requiresAcknowledgement,
      recommendedActions: intervention.recommendedActions
    },
    threshold: { notice: 30, warning: 55, cooldown: 80 },
    reasonCodes: intervention.reasonCodes
  });
  if (intervention.level !== 'none') {
    await trackAiEventSafely({
      userId: input.userId,
      category: 'risk',
      name: 'responsible_play_intervention',
      context: {
        explanationId: explanation?.id,
        level: intervention.level,
        score: intervention.score,
        reasonCodes: intervention.reasonCodes,
        recommendedActions: intervention.recommendedActions,
        requiresAcknowledgement: intervention.requiresAcknowledgement,
        version: intervention.version
      }
    });
    await riskService.recordEvent({
      userId: input.userId,
      type: 'responsible_play_intervention',
      severity: intervention.level === 'cooldown' ? 'high' : intervention.level === 'warning' ? 'medium' : 'low',
      score: intervention.score,
      context: {
        explanationId: explanation?.id,
        interventionId: intervention.id,
        level: intervention.level,
        reasonCodes: intervention.reasonCodes,
        recommendedActions: intervention.recommendedActions
      }
    });
  }
  return intervention;
}

function withResponsiblePlay<T extends object>(payload: T, intervention: Awaited<ReturnType<typeof evaluateResponsiblePlay>>): T & { responsiblePlayIntervention?: typeof intervention } {
  if (intervention.level === 'none') return payload;
  return {
    ...payload,
    responsiblePlayIntervention: intervention
  };
}

function extractRequestToken(req: express.Request): string {
  if (typeof req.query.token === 'string' && req.query.token) return req.query.token;
  return extractBearerToken(req.get('authorization'));
}

function addWalletClient(userId: string, res: express.Response) {
  const clients = walletEventClients.get(userId) ?? new Set<express.Response>();
  clients.add(res);
  walletEventClients.set(userId, clients);
}

function removeWalletClient(userId: string, res: express.Response) {
  const clients = walletEventClients.get(userId);
  if (!clients) return;
  clients.delete(res);
  if (clients.size === 0) walletEventClients.delete(userId);
}

function broadcastWallet(userId: string, wallet: { available: number; locked: number }) {
  const clients = walletEventClients.get(userId);
  if (!clients?.size) return;
  for (const client of clients) {
    sendWalletEvent(client, 'wallet', wallet);
  }
}

function sendWalletEvent(res: express.Response, event: string, wallet: { available: number; locked: number }) {
  sendSseEvent(res, event, {
    available: wallet.available,
    locked: wallet.locked,
    timestamp: new Date().toISOString()
  });
}

function sendSseEvent(res: express.Response, event: string, payload: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function sanitizeRoundForApi<T extends { gameId?: string; outcome?: unknown }>(round: T): T {
  if (round.gameId !== 'blackjack' && round.gameId !== 'poker') return round;
  return {
    ...round,
    outcome: undefined
  };
}

function sanitizeLedgerEntryForApi<T extends { metadata?: Record<string, unknown> }>(entry: T): T {
  if (entry.metadata?.gameId !== 'blackjack' && entry.metadata?.gameId !== 'poker') return entry;
  return {
    ...entry,
    metadata: {
      ...entry.metadata,
      outcome: undefined
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function enforceRateLimit(req: express.Request, scope: string, limit: number, windowMs: number) {
  const key = `${scope}:${req.ip}`;
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    await riskService.recordEvent({
      type: 'rate_limit_exceeded',
      severity: 'medium',
      score: 50,
      context: { scope, ipAddress: req.ip, path: req.path }
    });
    throw new Error('Too many requests');
  }
}
