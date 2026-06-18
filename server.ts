import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createCasinoService } from './src/backend/serviceFactory';
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
const casinoService = createCasinoService();

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

app.get('/api/wallet/:userId', async (req, res) => {
  try {
    res.json(await casinoService.getWallet(req.params.userId));
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/wallet/:userId/ledger', async (req, res) => {
  try {
    const entries = await casinoService.getLedger(req.params.userId);
    res.json({ entries: entries.map(sanitizeLedgerEntryForApi) });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/rounds', async (req, res) => {
  const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
  const rounds = await casinoService.listRounds(userId);
  res.json({ rounds: rounds.map(sanitizeRoundForApi) });
});

app.post('/api/bets', async (req, res) => {
  try {
    const round = await casinoService.placeBet({
      userId: String(req.body.userId ?? ''),
      gameId: String(req.body.gameId ?? ''),
      stake: Number(req.body.stake),
      idempotencyKey: String(req.body.idempotencyKey ?? '')
    });
    res.status(201).json({ round, wallet: await casinoService.getWallet(round.userId) });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/rounds/:roundId/settle', async (req, res) => {
  try {
    const round = await casinoService.settleRound({
      roundId: req.params.roundId,
      payout: Number(req.body.payout),
      idempotencyKey: String(req.body.idempotencyKey ?? ''),
      outcome: req.body.outcome
    });
    res.json({ round, wallet: await casinoService.getWallet(round.userId) });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/rounds/:roundId/refund', async (req, res) => {
  try {
    const round = await casinoService.refundRound({
      roundId: req.params.roundId,
      idempotencyKey: String(req.body.idempotencyKey ?? ''),
      reason: typeof req.body.reason === 'string' ? req.body.reason : undefined
    });
    res.json({ round, wallet: await casinoService.getWallet(round.userId) });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/games/roulette/spin', async (req, res) => {
  try {
    const result = await spinRoulette(casinoService, {
      userId: String(req.body.userId ?? ''),
      bets: req.body.bets,
      idempotencyKey: typeof req.body.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined
    });
    res.status(201).json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/games/crash/start', async (req, res) => {
  try {
    const result = await startCrashRound(casinoService, {
      userId: String(req.body.userId ?? ''),
      stake: Number(req.body.stake),
      idempotencyKey: typeof req.body.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined
    });
    res.status(201).json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/games/crash/:roundId/cashout', async (req, res) => {
  try {
    const result = await cashoutCrashRound(casinoService, {
      roundId: req.params.roundId,
      cashoutMultiplier: Number(req.body.cashoutMultiplier),
      idempotencyKey: typeof req.body.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined
    });
    res.json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/games/slots/spin', async (req, res) => {
  try {
    const result = await spinSlots(casinoService, {
      userId: String(req.body.userId ?? ''),
      machineId: String(req.body.machineId ?? ''),
      bet: Number(req.body.bet),
      freeSpin: Boolean(req.body.freeSpin),
      bonusMultiplier: Number(req.body.bonusMultiplier ?? (req.body.freeSpin ? 3 : 1)),
      idempotencyKey: typeof req.body.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined
    });
    res.status(201).json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/games/blackjack/start', async (req, res) => {
  try {
    const result = await startBlackjackRound(casinoService, {
      userId: String(req.body.userId ?? ''),
      stake: Number(req.body.stake),
      idempotencyKey: typeof req.body.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined
    });
    res.status(201).json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/games/blackjack/:roundId/action', async (req, res) => {
  try {
    const result = await actBlackjackRound(casinoService, {
      roundId: req.params.roundId,
      action: req.body.action,
      idempotencyKey: typeof req.body.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined
    });
    res.json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/games/poker/start', async (req, res) => {
  try {
    const result = await startPokerRound(casinoService, {
      userId: String(req.body.userId ?? ''),
      ante: Number(req.body.ante),
      idempotencyKey: typeof req.body.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined
    });
    res.status(201).json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/games/poker/:roundId/action', async (req, res) => {
  try {
    const result = await actPokerRound(casinoService, {
      roundId: req.params.roundId,
      action: req.body.action,
      idempotencyKey: typeof req.body.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined
    });
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
  const status = /not found/i.test(message) ? 404 : /required|invalid|insufficient|already|not open/i.test(message) ? 400 : 500;
  res.status(status).json({ error: message });
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
