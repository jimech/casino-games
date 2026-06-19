import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { extractBearerToken, AuthUser } from './src/backend/authService';
import { GameRoundRecord } from './src/backend/casinoService';
import { createServices } from './src/backend/serviceFactory';
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
const { casinoService, authService, riskService, bonusService } = createServices();
const walletEventClients = new Map<string, Set<express.Response>>();

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
    const session = await authService.register({
      email: typeof req.body.email === 'string' ? req.body.email : undefined,
      username: String(req.body.username ?? ''),
      password: String(req.body.password ?? ''),
      displayName: typeof req.body.displayName === 'string' ? req.body.displayName : undefined,
      dateOfBirth: typeof req.body.dateOfBirth === 'string' ? req.body.dateOfBirth : undefined,
      acceptAgeGate: Boolean(req.body.acceptAgeGate),
      acceptTerms: Boolean(req.body.acceptTerms),
      acceptPrivacy: Boolean(req.body.acceptPrivacy),
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
    await requireAuth(req);
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const status = isRiskStatus(req.query.status) ? req.query.status : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    res.json({ events: await riskService.listEvents({ userId, status, limit }) });
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

app.post('/api/bonuses/:campaignId/claim', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const result = await bonusService.claimBonus({
      userId: user.id,
      campaignId: req.params.campaignId,
      idempotencyKey: String(req.body.idempotencyKey ?? '')
    });
    broadcastWallet(user.id, result.wallet);
    res.status(201).json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/bets', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const round = await casinoService.placeBet({
      userId: user.id,
      gameId: String(req.body.gameId ?? ''),
      stake: Number(req.body.stake),
      idempotencyKey: String(req.body.idempotencyKey ?? '')
    });
    const wallet = await casinoService.getWallet(round.userId);
    broadcastWallet(round.userId, wallet);
    await assessRoundStarted(round);
    res.status(201).json({ round, wallet });
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
    broadcastWallet(result.round.userId, result.wallet);
    await assessRoundStarted(result.round);
    await riskService.assessRoundSettled(result.round);
    res.status(201).json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/games/crash/start', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const result = await startCrashRound(casinoService, {
      userId: user.id,
      stake: Number(req.body.stake),
      idempotencyKey: typeof req.body.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined
    });
    broadcastWallet(result.round.userId, result.wallet);
    await assessRoundStarted(result.round);
    res.status(201).json(result);
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
    res.status(201).json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/games/blackjack/start', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const result = await startBlackjackRound(casinoService, {
      userId: user.id,
      stake: Number(req.body.stake),
      idempotencyKey: typeof req.body.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined
    });
    broadcastWallet(result.round.userId, result.wallet);
    await assessRoundStarted(result.round);
    if (result.round.status !== 'open') await riskService.assessRoundSettled(result.round);
    res.status(201).json(result);
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
    const result = await startPokerRound(casinoService, {
      userId: user.id,
      ante: Number(req.body.ante),
      idempotencyKey: typeof req.body.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined
    });
    broadcastWallet(result.round.userId, result.wallet);
    await assessRoundStarted(result.round);
    res.status(201).json(result);
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
  const status = /unauthorized/i.test(message) ? 401 : /forbidden/i.test(message) ? 403 : /not found/i.test(message) ? 404 : /required|invalid|insufficient|already|not open|consent/i.test(message) ? 400 : 500;
  res.status(status).json({ error: message });
}

async function requireAuth(req: express.Request): Promise<AuthUser> {
  const session = await authService.getSession(extractRequestToken(req));
  return session.user;
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
  await riskService.assessRoundStarted(round, recentRounds);
}

function isRiskStatus(value: unknown): value is 'open' | 'reviewed' | 'dismissed' {
  return value === 'open' || value === 'reviewed' || value === 'dismissed';
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
