import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash, randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
import { AiEventCategory } from './src/backend/aiEventService';
import { explanationsToCsv } from './src/backend/aiDecisionExplanationService';
import { evaluateAiModelHealth } from './src/backend/aiModelMonitoringService';
import { extractBearerToken, AuthUser } from './src/backend/authService';
import { GameRoundRecord } from './src/backend/casinoService';
import { isComplianceCasePriority, isComplianceCaseStatus, isComplianceCaseType } from './src/backend/complianceCaseService';
import { runGameMathSimulation } from './src/backend/gameMathSimulationService';
import { createServices } from './src/backend/serviceFactory';
import { RecommendationGame } from './src/backend/gameRecommendationService';
import { spinRoulette } from './src/backend/games/rouletteEngine';
import { cashoutCrashRound, startCrashRound } from './src/backend/games/crashEngine';
import { spinSlots } from './src/backend/games/slotsEngine';
import { actBlackjackRound, startBlackjackRound } from './src/backend/games/blackjackEngine';
import { actPokerRound, startPokerRound } from './src/backend/games/pokerEngine';
import { ProvablyFairCommitment, ProvablyFairProof, verifyProvablyFairProof } from './src/domain/provablyFair';
import { ProvablyFairSeedRecord, seedLifecycle } from './src/backend/provablyFairSeedService';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT ?? 3000);
const { casinoService, authService, riskService, bonusService, complianceCaseService, notificationService, aiEventService, aiDecisionExplanationService, aiModelMonitoringService, aiFeatureService, gameRecommendationService, bonusTargetingService, churnService, fraudService, responsiblePlayService, vipService, tournamentService, provablyFairSeedService, idempotencyService, reconciliationService } = createServices();
const walletEventClients = new Map<string, Set<express.Response>>();
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
const stepUpSessions = new Map<string, { userId: string; expiresAt: number; scope: string }>();
const replayKeys = new Map<string, number>();
const STEP_UP_TTL_MS = 10 * 60 * 1000;
const REPLAY_WINDOW_MS = 10 * 60 * 1000;

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
      acceptPrivacy: Boolean(req.body.acceptPrivacy),
      sessionTimeoutLimit: typeof req.body.sessionTimeoutLimit === 'string' ? req.body.sessionTimeoutLimit : undefined
    }));
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/auth/step-up', async (req, res) => {
  try {
    await enforceRateLimit(req, 'auth_step_up', 8, 60_000);
    const user = await requireAuth(req);
    const password = String(req.body.password ?? '');
    const scope = typeof req.body.scope === 'string' ? req.body.scope : 'admin:sensitive';
    const valid = await authService.verifyPassword({ userId: user.id, password });
    if (!valid) {
      await riskService.recordEvent({
        userId: user.id,
        type: 'step_up_failed',
        severity: 'medium',
        score: 50,
        context: { scope, path: req.path, ipAddress: req.ip }
      });
      throw new Error('Invalid step-up credentials');
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + STEP_UP_TTL_MS;
    stepUpSessions.set(hashSecurityToken(token), { userId: user.id, expiresAt, scope });
    await trackAiEventSafely({
      userId: user.id,
      category: 'admin',
      name: 'step_up_authenticated',
      context: { scope, expiresAt: new Date(expiresAt).toISOString() }
    });
    res.status(201).json({
      stepUpToken: token,
      expiresAt: new Date(expiresAt).toISOString(),
      scope
    });
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

app.post('/api/wallet/deposits', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const amount = Number(req.body.amount);
    const method = parseDepositMethod(req.body.method);
    const idempotencyKey = String(req.body.idempotencyKey ?? '');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Deposit amount must be positive');
    if (amount > 5000) throw new Error('Deposit amount exceeds private rail limit');

    const idempotentResult = await idempotencyService.runWithResponse({
      userId: user.id,
      scope: 'wallet.deposit',
      idempotencyKey,
      payload: walletDepositIdempotencyPayload(req.body),
      metadata: { route: '/api/wallet/deposits', method }
    }, async () => {
      const wallet = await casinoService.creditWallet({
        userId: user.id,
        amount,
        idempotencyKey,
        metadata: {
          source: 'private_payment_rail',
          method
        }
      });
      return {
        wallet,
        deposit: {
          idempotencyKey,
          amount,
          method,
          reference: `dep_${createHash('sha256').update(`${user.id}:${idempotencyKey}`).digest('hex').slice(0, 16)}`,
          createdAt: new Date().toISOString()
        }
      };
    });

    const result = idempotentResult.body;
    if (!idempotentResult.replayed) {
      broadcastWallet(user.id, result.wallet);
      await notificationService.create({
        userId: user.id,
        type: 'wallet',
        title: 'Deposit credited',
        message: `${depositMethodLabel(method)} private deposit credited: +$${result.deposit.amount}`,
        metadata: {
          amount: result.deposit.amount,
          method,
          reference: result.deposit.reference,
          idempotencyKey
        }
      });
      await trackAiEventSafely({
        userId: user.id,
        category: 'wallet',
        name: 'deposit_credited',
        context: {
          amount: result.deposit.amount,
          method,
          reference: result.deposit.reference
        }
      });
    }

    res.status(idempotentResult.replayed ? 200 : 201).json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/wallet/withdrawals', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const amount = Number(req.body.amount);
    const method = parseDepositMethod(req.body.method ?? 'bank_wire');
    const idempotencyKey = String(req.body.idempotencyKey ?? '');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Withdrawal amount must be positive');
    if (amount > 5000) throw new Error('Withdrawal amount exceeds private rail limit');

    const idempotentResult = await idempotencyService.runWithResponse({
      userId: user.id,
      scope: 'wallet.withdrawal',
      idempotencyKey,
      payload: walletWithdrawalIdempotencyPayload(req.body),
      metadata: { route: '/api/wallet/withdrawals', method }
    }, async () => {
      const wallet = await casinoService.debitWallet({
        userId: user.id,
        amount,
        idempotencyKey,
        metadata: {
          source: 'private_payment_rail',
          method,
          direction: 'withdrawal'
        }
      });
      return {
        wallet,
        withdrawal: {
          idempotencyKey,
          amount,
          method,
          reference: `wd_${createHash('sha256').update(`${user.id}:${idempotencyKey}`).digest('hex').slice(0, 16)}`,
          createdAt: new Date().toISOString()
        }
      };
    });

    const result = idempotentResult.body;
    if (!idempotentResult.replayed) {
      broadcastWallet(user.id, result.wallet);
      await notificationService.create({
        userId: user.id,
        type: 'wallet',
        title: 'Withdrawal recorded',
        message: `${depositMethodLabel(method)} private withdrawal recorded: -$${result.withdrawal.amount}`,
        metadata: {
          amount: result.withdrawal.amount,
          method,
          reference: result.withdrawal.reference,
          idempotencyKey
        }
      });
      await trackAiEventSafely({
        userId: user.id,
        category: 'wallet',
        name: 'withdrawal_recorded',
        context: {
          amount: result.withdrawal.amount,
          method,
          reference: result.withdrawal.reference
        }
      });
    }

    res.status(idempotentResult.replayed ? 200 : 201).json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/tournaments', async (req, res) => {
  try {
    await requireAuth(req);
    res.json({ tournaments: await tournamentService.listTournaments() });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/tournaments/:id/enter', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const idempotencyKey = String(req.body.idempotencyKey ?? '');
    const idempotentResult = await idempotencyService.runWithResponse({
      userId: user.id,
      scope: 'tournament.enter',
      idempotencyKey,
      payload: tournamentEnterIdempotencyPayload(req.params.id),
      metadata: { route: '/api/tournaments/:id/enter', tournamentId: req.params.id }
    }, () => tournamentService.enter({
        tournamentId: req.params.id,
        userId: user.id,
        idempotencyKey
      })
    );
    const result = idempotentResult.body;
    if (!idempotentResult.replayed) {
      broadcastWallet(user.id, result.wallet);
      await trackAiEventSafely({
        userId: user.id,
        category: 'game',
        name: 'tournament_entered',
        context: {
          tournamentId: result.tournament.id,
          entryId: result.entry.id,
          entryFee: result.entry.entryFee,
          ledgerEntryId: result.entry.ledgerEntryId
        }
      });
    }
    res.status(201).json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/tournaments/:id/leaderboard', async (req, res) => {
  try {
    await requireAuth(req);
    res.json(await tournamentService.leaderboard({ tournamentId: req.params.id }));
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/admin/tournaments/queue', async (req, res) => {
  try {
    await requireAdmin(req);
    const filter = typeof req.query.filter === 'string' ? req.query.filter : 'all';
    const now = typeof req.query.now === 'string' ? new Date(req.query.now) : undefined;
    const queue = await buildAdminTournamentQueue(filter, now);
    res.json(queue);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/admin/tournaments/policy', async (req, res) => {
  try {
    await requireAdmin(req);
    res.json({ policy: tournamentSettlementPolicy() });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/admin/game-math/simulations', async (req, res) => {
  try {
    await requireAdmin(req);
    const sampleCount = typeof req.query.sampleCount === 'string' ? Number(req.query.sampleCount) : undefined;
    res.json({ report: runGameMathSimulation({ sampleCount }) });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/admin/integrity/reconciliation', async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    const report = await reconciliationService.run();
    await trackAiEventSafely({
      userId: admin.id,
      category: 'admin',
      name: 'integrity_reconciliation_run',
      context: {
        status: report.status,
        mode: report.mode,
        issueCount: report.summary.issueCount,
        criticalIssueCount: report.summary.criticalIssueCount,
        warningIssueCount: report.summary.warningIssueCount
      }
    });
    res.status(report.status === 'fail' ? 409 : 200).json({ report });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/provably-fair/verify', async (req, res) => {
  try {
    const proof = parseProvablyFairProof(req.body.proof ?? req.body);
    res.json({ verification: verifyProvablyFairProof(proof) });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/provably-fair/seeds', async (req, res) => {
  try {
    const user = await requireAuth(req);
    res.json({ seeds: await provablyFairSeedService.listForUser(user.id) });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/admin/tournaments/jobs/settlement-scan', async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    const idempotencyKey = String(req.body.idempotencyKey ?? '');
    const idempotentResult = await idempotencyService.runWithResponse({
      userId: admin.id,
      scope: 'admin.tournament.settlement-scan',
      idempotencyKey,
      payload: tournamentSettlementJobIdempotencyPayload(req.body),
      metadata: { route: '/api/admin/tournaments/jobs/settlement-scan' }
    }, async () => ({
        report: await runTournamentSettlementJob({
          adminUserId: admin.id,
          autoSettle: Boolean(req.body.autoSettle),
          idempotencyKey,
          now: typeof req.body.now === 'string' ? new Date(req.body.now) : undefined
        })
      })
    );
    res.status(201).json(idempotentResult.body);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/admin/tournaments/:id/settlement', async (req, res) => {
  try {
    await requireAdmin(req);
    const settlement = await tournamentService.getSettlement({ tournamentId: req.params.id });
    res.json({ settlement });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/admin/tournaments/:id/cancellation', async (req, res) => {
  try {
    await requireAdmin(req);
    const cancellation = await tournamentService.getCancellation({ tournamentId: req.params.id });
    res.json({ cancellation });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/admin/tournaments/:id/evidence', async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    res.json(await buildAdminTournamentEvidence(req.params.id, admin.id));
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/admin/tournaments/:id/evidence-export', async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    const evidence = await buildAdminTournamentEvidence(req.params.id, admin.id);
    const packet = {
      exportedAt: new Date().toISOString(),
      exportVersion: 'tournament-evidence-v1',
      ...evidence
    };
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tournament-evidence-${evidence.tournament.id}.json"`);
    res.send(JSON.stringify(packet, null, 2));
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/admin/tournaments/:id/cancel', async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    const idempotencyKey = String(req.body.idempotencyKey ?? '');
    const idempotentResult = await idempotencyService.runWithResponse({
      userId: admin.id,
      scope: 'admin.tournament.cancel',
      idempotencyKey,
      payload: tournamentCancelIdempotencyPayload(req.params.id, req.body),
      metadata: { route: '/api/admin/tournaments/:id/cancel', tournamentId: req.params.id }
    }, async () => ({
        cancellation: await tournamentService.cancel({
          tournamentId: req.params.id,
          reason: String(req.body.reason ?? ''),
          idempotencyKey,
          now: typeof req.body.now === 'string' ? new Date(req.body.now) : undefined
        })
      })
    );
    const { cancellation } = idempotentResult.body;
    if (!idempotentResult.replayed) {
      await Promise.all(cancellation.refunds.map(async refund => {
        broadcastWallet(refund.userId, await casinoService.getWallet(refund.userId));
        await notificationService.create({
          userId: refund.userId,
          type: 'wallet',
          title: 'Tournament entry refunded',
          message: `Tournament cancellation refund credited: +$${refund.amount}`,
          metadata: {
            tournamentId: cancellation.tournamentId,
            cancellationId: cancellation.id,
            refundId: refund.id,
            entryId: refund.entryId
          }
        });
      }));
      await trackAiEventSafely({
        userId: admin.id,
        category: 'admin',
        name: 'tournament_cancelled',
        context: {
          tournamentId: cancellation.tournamentId,
          cancellationId: cancellation.id,
          refundCount: cancellation.refunds.length,
          refundTotal: cancellation.refunds.reduce((sum, refund) => sum + refund.amount, 0),
          reason: cancellation.reason
        }
      });
    }
    res.status(201).json(idempotentResult.body);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/admin/tournaments/:id/disputes', async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    const evidence = await buildAdminTournamentEvidence(req.params.id, admin.id);
    const requestedSubjectUserId = typeof req.body.subjectUserId === 'string' ? req.body.subjectUserId : undefined;
    const subjectUserId = requestedSubjectUserId && evidence.participants.some(participant => participant.user?.id === requestedSubjectUserId)
      ? requestedSubjectUserId
      : evidence.participants[0]?.user?.id ?? admin.id;
    const disputeType = typeof req.body.disputeType === 'string' ? req.body.disputeType : 'tournament_review';
    const caseRecord = await complianceCaseService.create({
      subjectUserId,
      authorId: admin.id,
      type: 'general',
      priority: isComplianceCasePriority(req.body.priority) ? req.body.priority : evidence.cancellation ? 'high' : 'medium',
      title: typeof req.body.title === 'string' && req.body.title.trim()
        ? req.body.title
        : `Tournament dispute: ${evidence.tournament.title}`,
      description: typeof req.body.description === 'string'
        ? req.body.description
        : `Dispute opened for ${evidence.tournament.title} (${evidence.tournament.id}).`,
      evidence: {
        source: 'tournament_dispute',
        disputeType,
        tournamentId: evidence.tournament.id,
        tournamentTitle: evidence.tournament.title,
        tournamentStatus: evidence.tournament.status,
        settlementId: evidence.settlement?.id,
        cancellationId: evidence.cancellation?.id,
        payoutCount: evidence.integrity.payoutCount,
        refundCount: evidence.integrity.refundCount,
        entryLedgerCount: evidence.integrity.entryLedgerCount,
        payoutLedgerCount: evidence.integrity.payoutLedgerCount,
        refundLedgerCount: evidence.integrity.refundLedgerCount,
        participantCount: evidence.integrity.participantCount,
        evidenceGeneratedAt: evidence.generatedAt,
        requestedSubjectUserId
      }
    });
    await auditComplianceCaseAction(admin.id, caseRecord.subjectUserId, caseRecord.id, 'tournament_dispute_opened', {
      tournamentId: evidence.tournament.id,
      settlementId: evidence.settlement?.id,
      cancellationId: evidence.cancellation?.id,
      disputeType,
      evidence: caseRecord.evidence
    });
    res.status(201).json({ case: caseRecord });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/admin/tournaments/:id/settle', async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    const idempotencyKey = String(req.body.idempotencyKey ?? '');
    const idempotentResult = await idempotencyService.runWithResponse({
      userId: admin.id,
      scope: 'admin.tournament.settle',
      idempotencyKey,
      payload: tournamentSettleIdempotencyPayload(req.params.id, req.body),
      metadata: { route: '/api/admin/tournaments/:id/settle', tournamentId: req.params.id }
    }, async () => ({
        settlement: await tournamentService.settle({
          tournamentId: req.params.id,
          idempotencyKey,
          now: typeof req.body.now === 'string' ? new Date(req.body.now) : undefined
        })
      })
    );
    const { settlement } = idempotentResult.body;
    if (!idempotentResult.replayed) {
      await Promise.all(settlement.payouts.map(async payout => {
        broadcastWallet(payout.userId, await casinoService.getWallet(payout.userId));
        await notificationService.create({
          userId: payout.userId,
          type: 'bonus',
          title: 'Tournament prize credited',
          message: `Rank #${payout.rank} prize credited: +$${payout.amount}`,
          metadata: {
            tournamentId: settlement.tournamentId,
            settlementId: settlement.id,
            payoutId: payout.id,
            rank: payout.rank
          }
        });
      }));
      await trackAiEventSafely({
        userId: admin.id,
        category: 'admin',
        name: 'tournament_settled',
        context: {
          tournamentId: settlement.tournamentId,
          settlementId: settlement.id,
          payoutCount: settlement.payouts.length,
          prizePool: settlement.prizePool
        }
      });
    }
    res.status(201).json(idempotentResult.body);
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

app.get('/api/rounds/:roundId/provably-fair', async (req, res) => {
  try {
    const user = await requireAuth(req);
    await assertRoundOwner(req.params.roundId, user.id);
    const round = await casinoService.getRoundById(req.params.roundId);
    if (!round) throw new Error(`Round not found: ${req.params.roundId}`);
    res.json({
      round: sanitizeRoundForApi(round),
      provablyFair: buildRoundProvablyFairEvidence(round)
    });
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
      modelVersion: await monitoredModelVersion('game_recommendations', result.profileVersion ?? 'recommendation-v1', 'recommendation-fallback-v1'),
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
      modelVersion: await monitoredModelVersion('bonus_targeting', result.profileVersion ?? 'bonus-targeting-v1', 'bonus-targeting-fallback-v1'),
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

app.get('/api/admin/ai-model-health', async (req, res) => {
  try {
    const user = await requireAdmin(req);
    const report = await buildAiModelHealthReport();
    await alertOnAiModelHealth(user.id, report);
    res.json({ report });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/admin/ai-model-controls/:modelKey', async (req, res) => {
  try {
    const user = await requireAdmin(req);
    await requireRequestId(req, user.id, 'ai_model_control');
    await requireStepUp(req, user, 'admin:sensitive');
    const control = await aiModelMonitoringService.setControl({
      userId: user.id,
      modelKey: req.params.modelKey,
      disabled: Boolean(req.body.disabled),
      reason: typeof req.body.reason === 'string' ? req.body.reason : undefined
    });
    await trackAiEventSafely({
      userId: user.id,
      category: 'admin',
      name: 'ai_model_control_updated',
      context: {
        modelKey: control.modelKey,
        disabled: control.disabled,
        reason: control.reason
      }
    });
    res.status(201).json({ control });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/admin/compliance/cases', async (req, res) => {
  try {
    await requireAdmin(req);
    const subjectUserId = typeof req.query.subjectUserId === 'string' ? req.query.subjectUserId : undefined;
    const status = isComplianceCaseStatus(req.query.status) ? req.query.status : undefined;
    const type = isComplianceCaseType(req.query.type) ? req.query.type : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    res.json({ cases: await complianceCaseService.list({ subjectUserId, status, type, limit }) });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/admin/compliance/cases', async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    const caseRecord = await complianceCaseService.create({
      subjectUserId: String(req.body.subjectUserId ?? ''),
      authorId: admin.id,
      type: isComplianceCaseType(req.body.type) ? req.body.type : 'general',
      priority: isComplianceCasePriority(req.body.priority) ? req.body.priority : 'medium',
      title: String(req.body.title ?? ''),
      description: typeof req.body.description === 'string' ? req.body.description : undefined,
      assignedToUserId: typeof req.body.assignedToUserId === 'string' ? req.body.assignedToUserId : undefined,
      evidence: isRecord(req.body.evidence) ? req.body.evidence : undefined
    });
    await auditComplianceCaseAction(admin.id, caseRecord.subjectUserId, caseRecord.id, 'created', {
      type: caseRecord.type,
      priority: caseRecord.priority,
      evidence: caseRecord.evidence
    });
    res.status(201).json({ case: caseRecord });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/admin/compliance/cases/:caseId', async (req, res) => {
  try {
    await requireAdmin(req);
    const caseRecord = await complianceCaseService.get({ caseId: req.params.caseId });
    if (!caseRecord) throw new Error('Compliance case not found');
    res.json({ case: caseRecord });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/admin/compliance/cases/:caseId/notes', async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    const caseRecord = await complianceCaseService.addNote({
      caseId: req.params.caseId,
      authorId: admin.id,
      note: String(req.body.note ?? ''),
      action: typeof req.body.action === 'string' ? req.body.action : undefined,
      status: isComplianceCaseStatus(req.body.status) ? req.body.status : undefined,
      assignedToUserId: typeof req.body.assignedToUserId === 'string' ? req.body.assignedToUserId : undefined,
      outcome: typeof req.body.outcome === 'string' ? req.body.outcome : undefined,
      evidence: isRecord(req.body.evidence) ? req.body.evidence : undefined
    });
    await auditComplianceCaseAction(admin.id, caseRecord.subjectUserId, caseRecord.id, caseRecord.notes[0]?.action ?? 'note_added', {
      status: caseRecord.status,
      outcome: caseRecord.outcome,
      evidence: caseRecord.notes[0]?.evidence
    });
    res.status(201).json({ case: caseRecord });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/admin/summary', async (req, res) => {
  try {
    const user = await requireAdmin(req);
    const [wallet, ledger, rounds, riskEvents, campaigns, claims, aiEvents, aiDecisionExplanations, complianceCases, churnScore, fraudScore, responsiblePlayIntervention, aiModelControls] = await Promise.all([
      casinoService.getWallet(user.id),
      casinoService.getLedger(user.id),
      casinoService.listRounds(user.id),
      riskService.listEvents({ userId: user.id, limit: 25 }),
      bonusService.listCampaigns(),
      bonusService.listClaims(user.id),
      aiEventService.list({ userId: user.id, limit: 25 }),
      aiDecisionExplanationService.list({ userId: user.id, limit: 25 }),
      complianceCaseService.list({ limit: 25 }),
      churnService.latest({ userId: user.id }),
      fraudService.latest({ userId: user.id }),
      responsiblePlayService.latest({ userId: user.id }),
      aiModelMonitoringService.listControls()
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
    const aiModelHealth = evaluateAiModelHealth({
      explanations: aiDecisionExplanations,
      controls: aiModelControls
    });

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
      complianceCases,
      aiModelHealth,
      aiFeatureSnapshot,
      churnScore,
      fraudScore,
      responsiblePlayIntervention
    });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    const query = typeof req.query.query === 'string' ? req.query.query : undefined;
    const role = req.query.role === 'user' || req.query.role === 'admin' ? req.query.role : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const users = await authService.searchUsers({ query, role, limit });

    await trackAiEventSafely({
      userId: admin.id,
      category: 'admin',
      name: 'admin_user_search_performed',
      context: {
        query: query?.slice(0, 120),
        role,
        resultCount: users.length
      }
    });

    res.json({ users });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/admin/users/:userId', async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    const reviewedUser = await authService.getUserById({ userId: req.params.userId });
    if (!reviewedUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const [wallet, ledger, rounds, riskEvents, bonusClaims, notifications, aiEvents, aiDecisionExplanations, complianceCases, aiFeatureSnapshot, churnScore, fraudScore, responsiblePlayIntervention] = await Promise.all([
      casinoService.getWallet(reviewedUser.id),
      casinoService.getLedger(reviewedUser.id),
      casinoService.listRounds(reviewedUser.id),
      riskService.listEvents({ userId: reviewedUser.id, limit: 50 }),
      bonusService.listClaims(reviewedUser.id),
      notificationService.list({ userId: reviewedUser.id, limit: 50 }),
      aiEventService.list({ userId: reviewedUser.id, limit: 50 }),
      aiDecisionExplanationService.list({ userId: reviewedUser.id, limit: 50 }),
      complianceCaseService.list({ subjectUserId: reviewedUser.id, limit: 50 }),
      aiFeatureService.latest({ userId: reviewedUser.id }),
      churnService.latest({ userId: reviewedUser.id }),
      fraudService.latest({ userId: reviewedUser.id }),
      responsiblePlayService.latest({ userId: reviewedUser.id })
    ]);

    await trackAiEventSafely({
      userId: admin.id,
      category: 'admin',
      name: 'admin_user_detail_viewed',
      context: {
        subjectUserId: reviewedUser.id,
        roundCount: rounds.length,
        riskEventCount: riskEvents.length,
        complianceCaseCount: complianceCases.length
      }
    });

    res.json({
      user: reviewedUser,
      wallet,
      ledger: ledger.map(sanitizeLedgerEntryForApi).slice(-50).reverse(),
      rounds: rounds.map(sanitizeRoundForApi).slice(0, 50),
      riskEvents,
      bonusClaims,
      notifications,
      aiEvents,
      aiDecisionExplanations,
      complianceCases,
      aiFeatureSnapshot,
      churnScore,
      fraudScore,
      responsiblePlayIntervention
    });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/admin/rounds/:roundId', async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    const evidence = await buildAdminRoundEvidence(req.params.roundId, admin.id);
    res.json(evidence);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/admin/rounds/:roundId/evidence-export', async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    const evidence = await buildAdminRoundEvidence(req.params.roundId, admin.id);
    const generatedAt = new Date().toISOString();
    const packet = {
      exportedAt: generatedAt,
      exportVersion: 'round-evidence-v1',
      ...evidence
    };
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="round-evidence-${evidence.round.id}.json"`);
    res.send(JSON.stringify(packet, null, 2));
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/admin/rewards/review', async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    const query = typeof req.query.query === 'string' ? req.query.query : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 12;
    const users = await authService.searchUsers({ query, limit });
    const accounts = await Promise.all(users.map(async account => {
      const [vipStatus, bonusClaims, ledger] = await Promise.all([
        vipService.getStatus({ userId: account.id }),
        bonusService.listClaims(account.id),
        casinoService.getLedger(account.id)
      ]);
      const cashbackLedgerEntries = ledger
        .filter(entry => entry.metadata?.source === 'vip_cashback' && entry.metadata?.weekKey === vipStatus.weekKey)
        .map(sanitizeLedgerEntryForApi)
        .reverse();
      const cashbackClaimsThisWeek = bonusClaims.filter(claim =>
        claim.campaignId === 'vip-weekly-cashback' &&
        claim.claimKey === vipStatus.weekKey &&
        claim.status === 'claimed'
      );
      return {
        user: account,
        vipStatus,
        bonusClaims,
        bonusTotal: bonusClaims.reduce((sum, claim) => sum + claim.amount, 0),
        cashbackClaimedThisWeek: cashbackClaimsThisWeek.length > 0,
        cashbackLedgerEntries,
        duplicateCashbackBlocked: cashbackClaimsThisWeek.length <= 1 && cashbackLedgerEntries.length <= 1
      };
    }));
    const summary = {
      accountCount: accounts.length,
      totalBonusClaimed: accounts.reduce((sum, account) => sum + account.bonusTotal, 0),
      totalAvailableCashback: accounts.reduce((sum, account) => sum + account.vipStatus.availableCashback, 0),
      cashbackClaimsThisWeek: accounts.filter(account => account.cashbackClaimedThisWeek).length,
      duplicateCashbackBlockedCount: accounts.filter(account => account.duplicateCashbackBlocked).length
    };

    await trackAiEventSafely({
      userId: admin.id,
      category: 'admin',
      name: 'admin_rewards_review_viewed',
      context: {
        query: query?.slice(0, 120),
        accountCount: accounts.length,
        totalAvailableCashback: summary.totalAvailableCashback,
        cashbackClaimsThisWeek: summary.cashbackClaimsThisWeek
      }
    });

    res.json({
      generatedAt: new Date().toISOString(),
      summary,
      accounts
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

app.get('/api/notifications/preferences', async (req, res) => {
  try {
    const user = await requireAuth(req);
    res.json({ preferences: await notificationService.getPreferences({ userId: user.id }) });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/notifications/preferences/:type', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const type = parseNotificationType(req.params.type);
    const preference = await notificationService.updatePreference({
      userId: user.id,
      type,
      enabled: Boolean(req.body.enabled)
    });
    res.json({ preference });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/admin/notifications/deliveries', async (req, res) => {
  try {
    await requireAdmin(req);
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const status = req.query.status === 'delivered' || req.query.status === 'suppressed' ? req.query.status : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    res.json({ deliveries: await notificationService.listDeliveries({ userId, status, limit }) });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/notifications', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const result = await notificationService.create({
      userId: user.id,
      type: req.body.type === 'support' || req.body.type === 'admin' ? req.body.type : 'system',
      title: String(req.body.title ?? ''),
      message: String(req.body.message ?? ''),
      metadata: isRecord(req.body.metadata) ? req.body.metadata : undefined
    });
    res.status(result.notification ? 201 : 202).json(result);
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
    const idempotencyKey = String(req.body.idempotencyKey ?? '');
    const idempotentResult = await idempotencyService.runWithResponse({
      userId: user.id,
      scope: 'bonus.claim',
      idempotencyKey,
      payload: bonusClaimIdempotencyPayload(req.params.campaignId),
      metadata: { route: '/api/bonuses/:campaignId/claim', campaignId: req.params.campaignId }
    }, () => bonusService.claimBonus({
        userId: user.id,
        campaignId: req.params.campaignId,
        idempotencyKey
      })
    );
    const result = idempotentResult.body;
    if (!idempotentResult.replayed) {
      broadcastWallet(user.id, result.wallet);
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
    }
    res.status(201).json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/api/vip/status', async (req, res) => {
  try {
    const user = await requireAuth(req);
    res.json({ status: await vipService.getStatus({ userId: user.id }) });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/vip/cashback/claim', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const idempotencyKey = String(req.body.idempotencyKey ?? '');
    const idempotentResult = await idempotencyService.runWithResponse({
      userId: user.id,
      scope: 'vip.cashback.claim',
      idempotencyKey,
      payload: vipCashbackIdempotencyPayload(),
      metadata: { route: '/api/vip/cashback/claim' }
    }, () => vipService.claimCashback({
        userId: user.id,
        idempotencyKey
      })
    );
    const result = idempotentResult.body;
    if (!idempotentResult.replayed) {
      broadcastWallet(user.id, result.wallet);
    }
    if (!idempotentResult.replayed && result.claim) {
      await notificationService.create({
        userId: user.id,
        type: 'bonus',
        title: 'VIP cashback credited',
        message: `${result.status.tier.label} cashback credited: +$${result.claim.amount}`,
        metadata: {
          claimId: result.claim.id,
          claimKey: result.claim.claimKey,
          vipTier: result.status.tier.id,
          cashbackRate: result.status.cashbackRate
        }
      });
      await trackAiEventSafely({
        userId: user.id,
        category: 'bonus',
        name: 'vip_cashback_claimed',
        context: {
          claimId: result.claim.id,
          amount: result.claim.amount,
          tier: result.status.tier.id,
          weekKey: result.status.weekKey
        }
      });
    }
    res.status(result.claim ? 201 : 200).json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/bets', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const idempotencyKey = String(req.body.idempotencyKey ?? '');
    const idempotentResult = await idempotencyService.runWithResponse({
      userId: user.id,
      scope: 'wallet.bet',
      idempotencyKey,
      payload: betIdempotencyPayload(req.body),
      metadata: { route: '/api/bets' }
    }, async () => {
      const intervention = await evaluateResponsiblePlay({
        userId: user.id,
        triggerGameId: String(req.body.gameId ?? ''),
        triggerStake: Number(req.body.stake)
      });
      const round = await casinoService.placeBet({
        userId: user.id,
        gameId: String(req.body.gameId ?? ''),
        stake: Number(req.body.stake),
        idempotencyKey
      });
      const wallet = await casinoService.getWallet(round.userId);
      return withResponsiblePlay({ round, wallet }, intervention);
    });
    const result = idempotentResult.body;
    if (!idempotentResult.replayed) {
      broadcastWallet(result.round.userId, result.wallet);
      await assessRoundStarted(result.round);
    }
    res.status(201).json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/rounds/:roundId/settle', async (req, res) => {
  try {
    const user = await requireAuth(req);
    await assertRoundOwner(req.params.roundId, user.id);
    const idempotencyKey = String(req.body.idempotencyKey ?? '');
    const idempotentResult = await idempotencyService.runWithResponse({
      userId: user.id,
      scope: 'wallet.round.settle',
      idempotencyKey,
      payload: roundSettleIdempotencyPayload(req.params.roundId, req.body),
      metadata: { route: '/api/rounds/:roundId/settle', roundId: req.params.roundId }
    }, async () => {
      const round = await casinoService.settleRound({
        roundId: req.params.roundId,
        payout: Number(req.body.payout),
        idempotencyKey,
        outcome: req.body.outcome
      });
      const wallet = await casinoService.getWallet(round.userId);
      return { round, wallet };
    });
    const result = idempotentResult.body;
    if (!idempotentResult.replayed) {
      broadcastWallet(result.round.userId, result.wallet);
      await riskService.assessRoundSettled(result.round);
    }
    res.json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/rounds/:roundId/refund', async (req, res) => {
  try {
    const user = await requireAuth(req);
    await assertRoundOwner(req.params.roundId, user.id);
    const idempotencyKey = String(req.body.idempotencyKey ?? '');
    const idempotentResult = await idempotencyService.runWithResponse({
      userId: user.id,
      scope: 'wallet.round.refund',
      idempotencyKey,
      payload: roundRefundIdempotencyPayload(req.params.roundId, req.body),
      metadata: { route: '/api/rounds/:roundId/refund', roundId: req.params.roundId }
    }, async () => {
      const round = await casinoService.refundRound({
        roundId: req.params.roundId,
        idempotencyKey,
        reason: typeof req.body.reason === 'string' ? req.body.reason : undefined
      });
      const wallet = await casinoService.getWallet(round.userId);
      return { round, wallet };
    });
    const result = idempotentResult.body;
    if (!idempotentResult.replayed) {
      broadcastWallet(result.round.userId, result.wallet);
      await riskService.assessRoundSettled(result.round);
    }
    res.json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/games/roulette/spin', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const idempotencyKey = requestIdempotencyKey(req.body.idempotencyKey, 'roulette');
    await idempotencyService.assertRequest({
      userId: user.id,
      scope: 'roulette.spin',
      idempotencyKey,
      payload: rouletteSpinIdempotencyPayload(req.body),
      metadata: { route: '/api/games/roulette/spin' }
    });
    const seed = await revealProvablyFairSeed(
      await commitProvablyFairSeed(user.id, 'roulette', idempotencyKey, req.body.clientSeed)
    );
    const result = await spinRoulette(casinoService, {
      userId: user.id,
      bets: req.body.bets,
      idempotencyKey
    }, {
      provablyFair: {
        serverSeed: seed.serverSeed,
        clientSeed: seed.clientSeed,
        nonce: seed.nonce,
        lifecycle: seedLifecycle(seed)
      }
    });
    await revealProvablyFairSeed(seed, result.round.id);
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
    const idempotencyKey = requestIdempotencyKey(req.body.idempotencyKey, 'crash');
    await idempotencyService.assertRequest({
      userId: user.id,
      scope: 'crash.start',
      idempotencyKey,
      payload: crashStartIdempotencyPayload(req.body),
      metadata: { route: '/api/games/crash/start' }
    });
    const seed = await commitProvablyFairSeed(user.id, 'crash', idempotencyKey, req.body.clientSeed);
    const intervention = await evaluateResponsiblePlay({
      userId: user.id,
      triggerGameId: 'crash',
      triggerStake: Number(req.body.stake)
    });
    const result = await startCrashRound(casinoService, {
      userId: user.id,
      stake: Number(req.body.stake),
      idempotencyKey
    }, {
      provablyFair: {
        serverSeed: seed.serverSeed,
        clientSeed: seed.clientSeed,
        nonce: seed.nonce,
        lifecycle: seedLifecycle(seed)
      },
      deferProvablyFairReveal: true
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
    const round = await casinoService.getRoundById(req.params.roundId);
    const seed = round ? await revealProvablyFairSeedForRound(round, req.params.roundId) : undefined;
    const result = await cashoutCrashRound(casinoService, {
      roundId: req.params.roundId,
      cashoutMultiplier: Number(req.body.cashoutMultiplier),
      idempotencyKey: typeof req.body.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined
    }, seed ? {
      provablyFair: {
        serverSeed: seed.serverSeed,
        clientSeed: seed.clientSeed,
        nonce: seed.nonce,
        lifecycle: seedLifecycle(seed)
      }
    } : undefined);
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
    const idempotencyKey = requestIdempotencyKey(req.body.idempotencyKey, 'slots');
    await idempotencyService.assertRequest({
      userId: user.id,
      scope: 'slots.spin',
      idempotencyKey,
      payload: slotsSpinIdempotencyPayload(req.body),
      metadata: { route: '/api/games/slots/spin' }
    });
    const seed = await revealProvablyFairSeed(
      await commitProvablyFairSeed(user.id, 'slots', idempotencyKey, req.body.clientSeed)
    );
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
      idempotencyKey
    }, {
      provablyFair: {
        serverSeed: seed.serverSeed,
        clientSeed: seed.clientSeed,
        nonce: seed.nonce,
        lifecycle: seedLifecycle(seed)
      }
    });
    await revealProvablyFairSeed(seed, result.round.id);
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
    const idempotencyKey = requestIdempotencyKey(req.body.idempotencyKey, 'blackjack');
    await idempotencyService.assertRequest({
      userId: user.id,
      scope: 'blackjack.start',
      idempotencyKey,
      payload: blackjackStartIdempotencyPayload(req.body),
      metadata: { route: '/api/games/blackjack/start' }
    });
    const intervention = await evaluateResponsiblePlay({
      userId: user.id,
      triggerGameId: 'blackjack',
      triggerStake: Number(req.body.stake)
    });
    const result = await startBlackjackRound(casinoService, {
      userId: user.id,
      stake: Number(req.body.stake),
      idempotencyKey
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
    const idempotencyKey = requestIdempotencyKey(req.body.idempotencyKey, `blackjack-${req.params.roundId}`);
    const idempotentResult = await idempotencyService.runWithResponse({
      userId: user.id,
      scope: 'blackjack.action',
      idempotencyKey,
      payload: roundActionIdempotencyPayload(req.params.roundId, req.body.action),
      metadata: { route: '/api/games/blackjack/:roundId/action', roundId: req.params.roundId }
    }, () => actBlackjackRound(casinoService, {
        roundId: req.params.roundId,
        action: req.body.action,
        idempotencyKey
      })
    );
    const result = idempotentResult.body;
    if (!idempotentResult.replayed) {
      broadcastWallet(result.round.userId, result.wallet);
      if (result.round.status !== 'open') await riskService.assessRoundSettled(result.round);
    }
    res.json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/api/games/poker/start', async (req, res) => {
  try {
    const user = await requireAuth(req);
    const idempotencyKey = requestIdempotencyKey(req.body.idempotencyKey, 'poker');
    await idempotencyService.assertRequest({
      userId: user.id,
      scope: 'poker.start',
      idempotencyKey,
      payload: pokerStartIdempotencyPayload(req.body),
      metadata: { route: '/api/games/poker/start' }
    });
    const intervention = await evaluateResponsiblePlay({
      userId: user.id,
      triggerGameId: 'poker',
      triggerStake: Number(req.body.ante)
    });
    const result = await startPokerRound(casinoService, {
      userId: user.id,
      ante: Number(req.body.ante),
      idempotencyKey
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
    const idempotencyKey = requestIdempotencyKey(req.body.idempotencyKey, `poker-${req.params.roundId}`);
    const idempotentResult = await idempotencyService.runWithResponse({
      userId: user.id,
      scope: 'poker.action',
      idempotencyKey,
      payload: roundActionIdempotencyPayload(req.params.roundId, req.body.action),
      metadata: { route: '/api/games/poker/:roundId/action', roundId: req.params.roundId }
    }, () => actPokerRound(casinoService, {
        roundId: req.params.roundId,
        action: req.body.action,
        idempotencyKey
      })
    );
    const result = idempotentResult.body;
    if (!idempotentResult.replayed) {
      broadcastWallet(result.round.userId, result.wallet);
      if (result.round.status !== 'open') await riskService.assessRoundSettled(result.round);
    }
    res.json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

// Production VS Development serving logic
if (process.env.NODE_ENV === 'production') {
  const clientDistPath = __dirname;
  app.use(express.static(clientDistPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
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
  const status = /too many requests/i.test(message) ? 429 : /unauthorized/i.test(message) ? 401 : /forbidden|step-up/i.test(message) ? 403 : /not found/i.test(message) ? 404 : /idempotency conflict/i.test(message) ? 409 : /required|invalid|insufficient|already|not open|not ready|consent|replay/i.test(message) ? 400 : 500;
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

async function requireStepUp(req: express.Request, user: AuthUser, scope: string): Promise<void> {
  const token = req.get('x-step-up-token');
  const session = token ? stepUpSessions.get(hashSecurityToken(token)) : undefined;
  if (!session || session.userId !== user.id || session.scope !== scope || session.expiresAt <= Date.now()) {
    await riskService.recordEvent({
      userId: user.id,
      type: 'step_up_required',
      severity: 'medium',
      score: 55,
      context: { scope, path: req.path, method: req.method }
    });
    throw new Error('Step-up authentication required');
  }
}

async function requireRequestId(req: express.Request, userId: string, scope: string): Promise<void> {
  const requestId = req.get('x-request-id');
  if (!requestId || requestId.length < 8 || requestId.length > 120) {
    await riskService.recordEvent({
      userId,
      type: 'request_id_required',
      severity: 'low',
      score: 25,
      context: { scope, path: req.path, method: req.method }
    });
    throw new Error('X-Request-Id is required');
  }
  const now = Date.now();
  for (const [key, expiresAt] of replayKeys.entries()) {
    if (expiresAt <= now) replayKeys.delete(key);
  }
  const replayKey = `${userId}:${scope}:${requestId}`;
  if (replayKeys.has(replayKey)) {
    await riskService.recordEvent({
      userId,
      type: 'replay_request_blocked',
      severity: 'high',
      score: 80,
      context: { scope, requestId, path: req.path, method: req.method }
    });
    throw new Error('Replay request blocked');
  }
  replayKeys.set(replayKey, now + REPLAY_WINDOW_MS);
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

function parseNotificationType(value: unknown) {
  if (
    value === 'system' ||
    value === 'bonus' ||
    value === 'wallet' ||
    value === 'risk' ||
    value === 'support' ||
    value === 'admin'
  ) {
    return value;
  }
  throw new Error('Unsupported notification type');
}

function parseDepositMethod(value: unknown): 'card' | 'crypto' | 'bank_wire' {
  if (value === 'card' || value === 'crypto' || value === 'bank_wire') return value;
  throw new Error('Invalid deposit method');
}

function depositMethodLabel(method: 'card' | 'crypto' | 'bank_wire') {
  if (method === 'card') return 'Card';
  if (method === 'crypto') return 'Crypto';
  return 'Bank wire';
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

async function monitoredModelVersion(modelKey: string, primaryVersion: string, fallbackVersion: string) {
  return await aiModelMonitoringService.isDisabled(modelKey) ? fallbackVersion : primaryVersion;
}

async function buildAiModelHealthReport() {
  const [explanations, controls] = await Promise.all([
    aiDecisionExplanationService.list({ limit: 500 }),
    aiModelMonitoringService.listControls()
  ]);
  return evaluateAiModelHealth({ explanations, controls });
}

async function alertOnAiModelHealth(userId: string, report: Awaited<ReturnType<typeof buildAiModelHealthReport>>) {
  if (report.status === 'healthy') return;
  const openModelAlerts = await riskService.listEvents({ status: 'open', limit: 100 });
  if (openModelAlerts.some(event => event.type === 'ai_model_degraded')) return;
  await riskService.recordEvent({
    userId,
    type: 'ai_model_degraded',
    severity: report.status === 'disabled' ? 'high' : 'medium',
    score: report.status === 'disabled' ? 80 : 60,
    context: {
      status: report.status,
      modelKeys: report.metrics.filter(metric => metric.status !== 'healthy').map(metric => metric.modelKey),
      generatedAt: report.generatedAt
    }
  });
  await notificationService.create({
    userId,
    type: 'admin',
    title: 'AI model health alert',
    message: `AI model health is ${report.status}. Review monitoring before relying on model-assisted decisions.`,
    metadata: {
      status: report.status,
      generatedAt: report.generatedAt
    }
  });
}

async function auditComplianceCaseAction(adminUserId: string, subjectUserId: string, caseId: string, action: string, context: Record<string, unknown>) {
  await trackAiEventSafely({
    userId: adminUserId,
    category: 'admin',
    name: 'compliance_case_action',
    context: {
      caseId,
      subjectUserId,
      action,
      ...context
    }
  });
  await riskService.recordEvent({
    userId: subjectUserId,
    type: 'compliance_case_action',
    severity: action === 'closed' ? 'low' : 'medium',
    score: action === 'closed' ? 20 : 45,
    context: {
      caseId,
      adminUserId,
      action,
      ...context
    }
  });
}

async function buildAdminRoundEvidence(roundId: string, adminUserId: string) {
  const round = await casinoService.getRoundById(roundId);
  if (!round) throw new Error(`Round not found: ${roundId}`);
  const [user, ledger, riskEvents, aiEvents, aiDecisionExplanations, complianceCases] = await Promise.all([
    authService.getUserById({ userId: round.userId }),
    casinoService.getLedger(round.userId),
    riskService.listEvents({ userId: round.userId, limit: 200 }),
    aiEventService.list({ userId: round.userId, limit: 200 }),
    aiDecisionExplanationService.list({ userId: round.userId, limit: 200 }),
    complianceCaseService.list({ subjectUserId: round.userId, limit: 100 })
  ]);

  if (!user) throw new Error(`User not found: ${round.userId}`);
  const linkedLedger = ledger
    .filter(entry => recordReferencesRound(entry.metadata, round.id))
    .map(sanitizeLedgerEntryForApi);
  const linkedRiskEvents = riskEvents.filter(event => recordReferencesRound(event.context, round.id));
  const linkedAiEvents = aiEvents.filter(event => recordReferencesRound(event.context, round.id));
  const linkedAiDecisionExplanations = aiDecisionExplanations.filter(explanation =>
    explanation.sourceRecordId === round.id ||
    recordReferencesRound(explanation.inputFeatures, round.id) ||
    recordReferencesRound(explanation.output, round.id)
  );
  const linkedComplianceCases = complianceCases.filter(caseRecord =>
    recordReferencesRound(caseRecord.evidence, round.id) ||
    caseRecord.notes.some(note => recordReferencesRound(note.evidence, round.id))
  );
  const provablyFair = buildRoundProvablyFairEvidence(round);
  const replayTimeline = buildRoundReplayTimeline(round, linkedLedger, linkedRiskEvents, linkedAiEvents);

  await trackAiEventSafely({
    userId: adminUserId,
    category: 'admin',
    name: 'admin_round_evidence_viewed',
    context: {
      roundId: round.id,
      subjectUserId: round.userId,
      gameId: round.gameId,
      status: round.status,
      ledgerCount: linkedLedger.length,
      riskEventCount: linkedRiskEvents.length,
      complianceCaseCount: linkedComplianceCases.length
    }
  });

  return {
    generatedAt: new Date().toISOString(),
    replayMode: 'read_only' as const,
    round,
    user,
    ledger: linkedLedger,
    riskEvents: linkedRiskEvents,
    aiEvents: linkedAiEvents,
    aiDecisionExplanations: linkedAiDecisionExplanations,
    complianceCases: linkedComplianceCases,
    provablyFair,
    replayTimeline,
    integrity: {
      ledgerEntryCount: linkedLedger.length,
      riskEventCount: linkedRiskEvents.length,
      aiEventCount: linkedAiEvents.length,
      aiDecisionExplanationCount: linkedAiDecisionExplanations.length,
      complianceCaseCount: linkedComplianceCases.length,
      provablyFairProofCount: provablyFair.present ? 1 : 0,
      provablyFairValidCount: provablyFair.valid ? 1 : 0
    }
  };
}

async function buildAdminTournamentEvidence(tournamentId: string, adminUserId: string) {
  const leaderboard = await tournamentService.leaderboard({ tournamentId });
  const settlement = await tournamentService.getSettlement({ tournamentId });
  const cancellation = await tournamentService.getCancellation({ tournamentId });
  const subjectUserIds = [...new Set([
    ...leaderboard.entries.map(entry => entry.userId),
    ...(settlement?.payouts.map(payout => payout.userId) ?? []),
    ...(cancellation?.refunds.map(refund => refund.userId) ?? [])
  ])];

  const [users, participantEvidence, adminAiEvents] = await Promise.all([
    Promise.all(subjectUserIds.map(userId => authService.getUserById({ userId }))),
    Promise.all(subjectUserIds.map(async userId => {
      const [ledger, rounds, riskEvents, aiEvents, aiDecisionExplanations, complianceCases] = await Promise.all([
        casinoService.getLedger(userId),
        casinoService.listRounds(userId),
        riskService.listEvents({ userId, limit: 200 }),
        aiEventService.list({ userId, limit: 200 }),
        aiDecisionExplanationService.list({ userId, limit: 200 }),
        complianceCaseService.list({ subjectUserId: userId, limit: 100 })
      ]);
      return {
        userId,
        ledger: ledger.filter(entry => recordReferencesTournament(entry.metadata, tournamentId)).map(sanitizeLedgerEntryForApi),
        rounds: rounds.filter(round => roundMatchesTournamentWindow(round, leaderboard.tournament)).map(sanitizeRoundForApi),
        riskEvents: riskEvents.filter(event => recordReferencesTournament(event.context, tournamentId)),
        aiEvents: aiEvents.filter(event => recordReferencesTournament(event.context, tournamentId)),
        aiDecisionExplanations: aiDecisionExplanations.filter(explanation =>
          recordReferencesTournament(explanation.inputFeatures, tournamentId) ||
          recordReferencesTournament(explanation.output, tournamentId)
        ),
        complianceCases: complianceCases.filter(caseRecord =>
          recordReferencesTournament(caseRecord.evidence, tournamentId) ||
          caseRecord.notes.some(note => recordReferencesTournament(note.evidence, tournamentId))
        )
      };
    })),
    aiEventService.list({ category: 'admin', limit: 200 })
  ]);

  const participants = participantEvidence.map(evidence => ({
    user: users.find(user => user?.id === evidence.userId),
    leaderboardRow: leaderboard.entries.find(entry => entry.userId === evidence.userId),
    ledger: evidence.ledger,
    rounds: evidence.rounds,
    riskEvents: evidence.riskEvents,
    aiEvents: evidence.aiEvents,
    aiDecisionExplanations: evidence.aiDecisionExplanations,
    complianceCases: evidence.complianceCases
  })).filter(participant => participant.user);
  const disputeCases = uniqueCases(participants
    .flatMap(participant => participant.complianceCases)
    .filter(caseRecord => recordReferencesTournament(caseRecord.evidence, tournamentId) ||
      caseRecord.notes.some(note => recordReferencesTournament(note.evidence, tournamentId))));
  const linkedAdminAiEvents = adminAiEvents.filter(event => recordReferencesTournament(event.context, tournamentId));
  const payoutLedgerEntryIds = new Set(settlement?.payouts.map(payout => payout.ledgerEntryId).filter(Boolean) ?? []);
  const refundLedgerEntryIds = new Set(cancellation?.refunds.map(refund => refund.ledgerEntryId).filter(Boolean) ?? []);
  const entryLedgerCount = participants.reduce((sum, participant) =>
    sum + participant.ledger.filter(entry => entry.metadata?.source === 'tournament_entry').length, 0);
  const payoutLedgerCount = participants.reduce((sum, participant) =>
    sum + participant.ledger.filter(entry => payoutLedgerEntryIds.has(entry.id) || entry.metadata?.source === 'tournament_prize').length, 0);
  const refundLedgerCount = participants.reduce((sum, participant) =>
    sum + participant.ledger.filter(entry => refundLedgerEntryIds.has(entry.id) || entry.metadata?.source === 'tournament_entry_refund').length, 0);

  await trackAiEventSafely({
    userId: adminUserId,
    category: 'admin',
    name: 'admin_tournament_evidence_viewed',
    context: {
      tournamentId,
      settlementId: settlement?.id,
      cancellationId: cancellation?.id,
      participantCount: participants.length,
      leaderboardEntryCount: leaderboard.entries.length,
      payoutCount: settlement?.payouts.length ?? 0,
      refundCount: cancellation?.refunds.length ?? 0,
      ledgerEntryCount: entryLedgerCount + payoutLedgerCount + refundLedgerCount
    }
  });

  return {
    generatedAt: new Date().toISOString(),
    replayMode: 'read_only' as const,
    tournament: leaderboard.tournament,
    leaderboard,
    settlement,
    cancellation,
    disputeCases,
    participants,
    adminAiEvents: linkedAdminAiEvents,
    integrity: {
      participantCount: participants.length,
      leaderboardEntryCount: leaderboard.entries.length,
      settlementRecorded: Boolean(settlement),
      cancellationRecorded: Boolean(cancellation),
      payoutCount: settlement?.payouts.length ?? 0,
      refundCount: cancellation?.refunds.length ?? 0,
      entryLedgerCount,
      payoutLedgerCount,
      refundLedgerCount,
      adminAiEventCount: linkedAdminAiEvents.length,
      roundCount: participants.reduce((sum, participant) => sum + participant.rounds.length, 0),
      riskEventCount: participants.reduce((sum, participant) => sum + participant.riskEvents.length, 0),
      complianceCaseCount: participants.reduce((sum, participant) => sum + participant.complianceCases.length, 0),
      disputeCaseCount: disputeCases.length
    }
  };
}

async function buildAdminTournamentQueue(filter: string, now?: Date) {
  const tournaments = await tournamentService.listTournaments(now);
  const allCases = await complianceCaseService.list({ limit: 250 });
  const policy = tournamentSettlementPolicy();
  const rows = await Promise.all(tournaments.map(async tournament => {
    const [leaderboard, settlement, cancellation] = await Promise.all([
      tournamentService.leaderboard({ tournamentId: tournament.id, now }),
      tournamentService.getSettlement({ tournamentId: tournament.id, now }),
      tournamentService.getCancellation({ tournamentId: tournament.id, now })
    ]);
    const disputeCases = allCases.filter(caseRecord =>
      recordReferencesTournament(caseRecord.evidence, tournament.id) ||
      caseRecord.notes.some(note => recordReferencesTournament(note.evidence, tournament.id))
    );
    const openDisputeCases = disputeCases.filter(caseRecord => caseRecord.status !== 'closed');
    const flags = {
      upcoming: tournament.status === 'upcoming',
      active: tournament.status === 'active',
      ended: tournament.status === 'ended',
      cancelled: tournament.status === 'cancelled',
      settled: Boolean(settlement),
      disputed: disputeCases.length > 0,
      unresolved: openDisputeCases.length > 0,
      needsSettlement: tournament.status === 'ended' && !settlement && !cancellation
    };
    const row = {
      tournament,
      generatedAt: leaderboard.generatedAt,
      entryCount: leaderboard.entries.length,
      scoredEntryCount: leaderboard.entries.filter(entry => entry.roundCount > 0).length,
      leader: leaderboard.entries[0],
      settlement,
      cancellation,
      disputeCases,
      openDisputeCaseCount: openDisputeCases.length,
      flags
    };
    return {
      ...row,
      policyDecision: evaluateTournamentSettlementPolicy(row, policy)
    };
  }));
  const filteredRows = rows.filter(row => tournamentQueueFilterMatches(row.flags, filter));
  return {
    generatedAt: new Date().toISOString(),
    filter,
    policy,
    summary: {
      total: rows.length,
      active: rows.filter(row => row.flags.active).length,
      ended: rows.filter(row => row.flags.ended).length,
      cancelled: rows.filter(row => row.flags.cancelled).length,
      settled: rows.filter(row => row.flags.settled).length,
      disputed: rows.filter(row => row.flags.disputed).length,
      unresolved: rows.filter(row => row.flags.unresolved).length,
      needsSettlement: rows.filter(row => row.flags.needsSettlement).length
    },
    rows: filteredRows
  };
}

async function runTournamentSettlementJob(input: {
  adminUserId: string;
  autoSettle: boolean;
  idempotencyKey?: string;
  now?: Date;
}) {
  const startedAt = (input.now ?? new Date()).toISOString();
  const queue = await buildAdminTournamentQueue('needsSettlement', input.now);
  const policy = queue.policy;
  const adminUsers = await authService.searchUsers({ role: 'admin', limit: 50 });
  const rows = queue.rows;
  const settled = [];
  const alerts = [];
  const policyBlocks = [];
  for (const row of rows) {
    for (const admin of adminUsers) {
      const result = await notificationService.create({
        userId: admin.id,
        type: 'admin',
        title: 'Tournament settlement required',
        message: `${row.tournament.title} has ended and needs settlement review.`,
        metadata: {
          source: 'tournament_settlement_job',
          tournamentId: row.tournament.id,
          entryCount: row.entryCount,
          scoredEntryCount: row.scoredEntryCount,
          leaderUserId: row.leader?.userId,
          autoSettle: input.autoSettle,
          startedAt
        }
      });
      alerts.push({
        userId: admin.id,
        tournamentId: row.tournament.id,
        notificationId: result.notification?.id,
        deliveryStatus: result.delivery.status
      });
    }

    if (!input.autoSettle) continue;
    if (!row.policyDecision.allowed) {
      policyBlocks.push({
        tournamentId: row.tournament.id,
        reasonCodes: row.policyDecision.reasonCodes
      });
      continue;
    }
    const settlement = await tournamentService.settle({
      tournamentId: row.tournament.id,
      idempotencyKey: `${input.idempotencyKey ?? `tournament-job-${startedAt}`}-${row.tournament.id}`,
      now: input.now
    });
    await Promise.all(settlement.payouts.map(async payout => {
      broadcastWallet(payout.userId, await casinoService.getWallet(payout.userId));
      await notificationService.create({
        userId: payout.userId,
        type: 'bonus',
        title: 'Tournament prize credited',
        message: `Automated settlement credited rank #${payout.rank}: +$${payout.amount}`,
        metadata: {
          source: 'tournament_settlement_job',
          tournamentId: settlement.tournamentId,
          settlementId: settlement.id,
          payoutId: payout.id,
          rank: payout.rank
        }
      });
    }));
    settled.push({
      tournamentId: row.tournament.id,
      settlementId: settlement.id,
      payoutCount: settlement.payouts.length,
      prizePool: settlement.prizePool
    });
  }

  const report = {
    startedAt,
    completedAt: new Date().toISOString(),
    mode: input.autoSettle ? 'auto_settle' : 'dry_run',
    policy,
    detectedCount: rows.length,
    alertedAdminCount: adminUsers.length,
    alertCount: alerts.length,
    settledCount: settled.length,
    policyBlockedCount: policyBlocks.length,
    rows,
    alerts,
    policyBlocks,
    settled
  };
  await trackAiEventSafely({
    userId: input.adminUserId,
    category: 'admin',
    name: 'tournament_settlement_job_ran',
    context: {
      mode: report.mode,
      detectedCount: report.detectedCount,
      alertCount: report.alertCount,
      settledCount: report.settledCount,
      policyBlockedCount: report.policyBlockedCount,
      tournamentIds: rows.map(row => row.tournament.id)
    }
  });
  return report;
}

function tournamentSettlementPolicy() {
  return {
    autoSettleEnabled: parseBooleanEnv('TOURNAMENT_AUTO_SETTLE_ENABLED', true),
    maxPrizePool: parseNumberEnv('TOURNAMENT_AUTO_SETTLE_MAX_PRIZE_POOL', 10000),
    minEntries: parseNumberEnv('TOURNAMENT_AUTO_SETTLE_MIN_ENTRIES', 1),
    minScoredEntries: parseNumberEnv('TOURNAMENT_AUTO_SETTLE_MIN_SCORED_ENTRIES', 1),
    requireDisputeFree: parseBooleanEnv('TOURNAMENT_AUTO_SETTLE_REQUIRE_DISPUTE_FREE', true),
    requireNoCancellation: true
  };
}

function evaluateTournamentSettlementPolicy(
  row: {
    tournament: { prizePool: number };
    entryCount: number;
    scoredEntryCount: number;
    openDisputeCaseCount: number;
    cancellation?: unknown;
    flags: Record<string, boolean>;
  },
  policy: ReturnType<typeof tournamentSettlementPolicy>
) {
  const reasonCodes = [];
  if (!row.flags.needsSettlement) reasonCodes.push('not_needs_settlement');
  if (!policy.autoSettleEnabled) reasonCodes.push('auto_settle_disabled');
  if (row.tournament.prizePool > policy.maxPrizePool) reasonCodes.push('prize_pool_exceeds_policy');
  if (row.entryCount < policy.minEntries) reasonCodes.push('insufficient_entries');
  if (row.scoredEntryCount < policy.minScoredEntries) reasonCodes.push('insufficient_scored_entries');
  if (policy.requireDisputeFree && row.openDisputeCaseCount > 0) reasonCodes.push('open_disputes_present');
  if (policy.requireNoCancellation && row.cancellation) reasonCodes.push('cancelled_tournament');
  return {
    allowed: reasonCodes.length === 0,
    reasonCodes,
    checks: {
      prizePool: row.tournament.prizePool,
      entryCount: row.entryCount,
      scoredEntryCount: row.scoredEntryCount,
      openDisputeCaseCount: row.openDisputeCaseCount
    }
  };
}

function parseBooleanEnv(key: string, fallback: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

function parseNumberEnv(key: string, fallback: number): number {
  const value = Number(process.env[key]);
  return Number.isFinite(value) ? value : fallback;
}

function tournamentQueueFilterMatches(flags: Record<string, boolean>, filter: string): boolean {
  if (filter === 'all') return true;
  return Boolean(flags[filter]);
}

function uniqueCases<T extends { id: string }>(cases: T[]): T[] {
  const seen = new Set<string>();
  return cases.filter(caseRecord => {
    if (seen.has(caseRecord.id)) return false;
    seen.add(caseRecord.id);
    return true;
  });
}

function buildRoundReplayTimeline(
  round: GameRoundRecord,
  ledger: Array<{ type: string; amount: number; createdAt: string; idempotencyKey: string }>,
  riskEvents: Array<{ type: string; severity: string; score: number; createdAt: string }>,
  aiEvents: Array<{ category: string; name: string; createdAt: string }>
) {
  const provablyFair = buildRoundProvablyFairEvidence(round);
  return [
    {
      type: 'round_created',
      at: round.createdAt,
      summary: `${round.gameId} round opened with stake ${round.stake}`,
      data: {
        roundId: round.id,
        status: round.status,
        lockIdempotencyKey: round.lockIdempotencyKey
      }
    },
    ...ledger.map(entry => ({
      type: `ledger_${entry.type}`,
      at: entry.createdAt,
      summary: `${entry.type} ${entry.amount}`,
      data: {
        idempotencyKey: entry.idempotencyKey,
        amount: entry.amount
      }
    })),
    ...riskEvents.map(event => ({
      type: `risk_${event.type}`,
      at: event.createdAt,
      summary: `${event.severity} risk score ${event.score}`,
      data: {
        riskType: event.type,
        severity: event.severity,
        score: event.score
      }
    })),
    ...aiEvents.map(event => ({
      type: `ai_${event.category}_${event.name}`,
      at: event.createdAt,
      summary: `${event.category} / ${event.name}`,
      data: {
        category: event.category,
        name: event.name
      }
    })),
    ...(provablyFair.present ? [{
      type: 'provably_fair_verified',
      at: round.settledAt ?? round.createdAt,
      summary: provablyFair.valid ? 'Provably fair proof verified' : `Provably fair proof invalid: ${provablyFair.errors.join(', ')}`,
      data: {
        valid: provablyFair.valid,
        errors: provablyFair.errors,
        serverSeedHash: provablyFair.proof?.serverSeedHash
      }
    }] : []),
    ...(round.settledAt ? [{
      type: 'round_closed',
      at: round.settledAt,
      summary: `${round.status} with payout ${round.payout}`,
      data: {
        status: round.status,
        payout: round.payout,
        settlementIdempotencyKey: round.settlementIdempotencyKey
      }
    }] : [])
  ].sort((first, second) => new Date(first.at).getTime() - new Date(second.at).getTime());
}

function buildRoundProvablyFairEvidence(round: GameRoundRecord) {
  const proof = extractRoundProvablyFairProof(round);
  if (!proof) {
    return {
      present: false,
      valid: false,
      errors: ['proof_not_available'],
      proof: undefined,
      expected: undefined
    };
  }
  const verification = verifyProvablyFairProof(proof);
  return {
    present: true,
    valid: verification.valid,
    errors: verification.errors,
    proof: verification.proof,
    expected: verification.expected
  };
}

function requestIdempotencyKey(value: unknown, prefix: string): string {
  return typeof value === 'string' && value ? value : `${prefix}-${randomBytes(16).toString('hex')}`;
}

function tournamentEnterIdempotencyPayload(tournamentId: string) {
  return {
    tournamentId
  };
}

function tournamentSettlementJobIdempotencyPayload(body: unknown) {
  const record = isRecord(body) ? body : {};
  return {
    autoSettle: Boolean(record.autoSettle),
    now: typeof record.now === 'string' ? record.now : undefined
  };
}

function tournamentCancelIdempotencyPayload(tournamentId: string, body: unknown) {
  const record = isRecord(body) ? body : {};
  return {
    tournamentId,
    reason: String(record.reason ?? ''),
    now: typeof record.now === 'string' ? record.now : undefined
  };
}

function tournamentSettleIdempotencyPayload(tournamentId: string, body: unknown) {
  const record = isRecord(body) ? body : {};
  return {
    tournamentId,
    now: typeof record.now === 'string' ? record.now : undefined
  };
}

function bonusClaimIdempotencyPayload(campaignId: string) {
  return {
    campaignId
  };
}

function vipCashbackIdempotencyPayload() {
  return {
    claim: 'weekly-cashback'
  };
}

function walletDepositIdempotencyPayload(body: unknown) {
  const record = isRecord(body) ? body : {};
  return {
    amount: Number(record.amount),
    method: parseDepositMethod(record.method)
  };
}

function walletWithdrawalIdempotencyPayload(body: unknown) {
  const record = isRecord(body) ? body : {};
  return {
    amount: Number(record.amount),
    method: parseDepositMethod(record.method ?? 'bank_wire')
  };
}

function betIdempotencyPayload(body: unknown) {
  const record = isRecord(body) ? body : {};
  return {
    gameId: String(record.gameId ?? ''),
    stake: Number(record.stake)
  };
}

function roundSettleIdempotencyPayload(roundId: string, body: unknown) {
  const record = isRecord(body) ? body : {};
  return {
    roundId,
    payout: Number(record.payout),
    outcome: normalizeJson(record.outcome)
  };
}

function roundRefundIdempotencyPayload(roundId: string, body: unknown) {
  const record = isRecord(body) ? body : {};
  return {
    roundId,
    reason: typeof record.reason === 'string' ? record.reason : undefined
  };
}

function slotsSpinIdempotencyPayload(body: unknown) {
  const record = isRecord(body) ? body : {};
  const freeSpin = Boolean(record.freeSpin);
  return {
    machineId: String(record.machineId ?? ''),
    bet: Number(record.bet),
    freeSpin,
    bonusMultiplier: Number(record.bonusMultiplier ?? (freeSpin ? 3 : 1))
  };
}

function rouletteSpinIdempotencyPayload(body: unknown) {
  const record = isRecord(body) ? body : {};
  return {
    bets: normalizeJson(record.bets)
  };
}

function crashStartIdempotencyPayload(body: unknown) {
  const record = isRecord(body) ? body : {};
  return {
    stake: Number(record.stake)
  };
}

function blackjackStartIdempotencyPayload(body: unknown) {
  const record = isRecord(body) ? body : {};
  return {
    stake: Number(record.stake)
  };
}

function pokerStartIdempotencyPayload(body: unknown) {
  const record = isRecord(body) ? body : {};
  return {
    ante: Number(record.ante)
  };
}

function roundActionIdempotencyPayload(roundId: string, action: unknown) {
  return {
    roundId,
    action: String(action ?? '')
  };
}

function normalizeJson(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(normalizeJson);
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(record).sort().map(key => [key, normalizeJson(record[key])]));
}

async function commitProvablyFairSeed(
  userId: string,
  gameId: ProvablyFairProof['gameId'],
  idempotencyKey: string,
  clientSeed: unknown
): Promise<ProvablyFairSeedRecord> {
  return provablyFairSeedService.commit({
    userId,
    gameId,
    commitmentKey: `${gameId}:${idempotencyKey}`,
    clientSeed: typeof clientSeed === 'string' && clientSeed ? clientSeed : `${userId}:${idempotencyKey}`
  });
}

async function revealProvablyFairSeed(seed: ProvablyFairSeedRecord, roundId?: string): Promise<ProvablyFairSeedRecord> {
  return provablyFairSeedService.reveal({ seedId: seed.id, roundId });
}

async function revealProvablyFairSeedForRound(round: GameRoundRecord, roundId: string): Promise<ProvablyFairSeedRecord | undefined> {
  const commitment = extractRoundProvablyFairCommitment(round);
  if (!commitment?.lifecycle?.seedId) return undefined;
  return provablyFairSeedService.reveal({ seedId: commitment.lifecycle.seedId, roundId });
}

function extractRoundProvablyFairProof(round: GameRoundRecord): ProvablyFairProof | undefined {
  if (!isRecord(round.outcome) || !isRecord(round.outcome.provablyFair)) return undefined;
  return round.outcome.provablyFair as unknown as ProvablyFairProof;
}

function extractRoundProvablyFairCommitment(round: GameRoundRecord) {
  if (!isRecord(round.outcome) || !isRecord(round.outcome.provablyFairCommitment)) return undefined;
  return round.outcome.provablyFairCommitment as unknown as ProvablyFairCommitment;
}

function recordReferencesRound(value: unknown, roundId: string): boolean {
  if (value === roundId) return true;
  if (Array.isArray(value)) return value.some(item => recordReferencesRound(item, roundId));
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, nested]) =>
    (key === 'roundId' && nested === roundId) ||
    recordReferencesRound(nested, roundId)
  );
}

function recordReferencesTournament(value: unknown, tournamentId: string): boolean {
  if (value === tournamentId) return true;
  if (Array.isArray(value)) return value.some(item => recordReferencesTournament(item, tournamentId));
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, nested]) =>
    (key === 'tournamentId' && nested === tournamentId) ||
    recordReferencesTournament(nested, tournamentId)
  );
}

function roundMatchesTournamentWindow(
  round: GameRoundRecord,
  tournament: { startAt: string; endAt: string }
): boolean {
  if (round.status !== 'settled' || !round.settledAt) return false;
  const settledAt = new Date(round.settledAt).getTime();
  return settledAt >= new Date(tournament.startAt).getTime() && settledAt <= new Date(tournament.endAt).getTime();
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
    modelVersion: await monitoredModelVersion('churn_score', score.version, 'churn-fallback-v1'),
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
    modelVersion: await monitoredModelVersion('fraud_score', score.version, 'fraud-fallback-v1'),
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
    modelVersion: await monitoredModelVersion('responsible_play_intervention', intervention.version, 'responsible-play-fallback-v1'),
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

function hashSecurityToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
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

function parseProvablyFairProof(value: unknown): ProvablyFairProof {
  if (!isRecord(value)) throw new Error('Provably fair proof is required');
  if (value.algorithm !== 'hmac-sha256-v1') throw new Error('Unsupported provably fair algorithm');
  if (value.gameId !== 'roulette' && value.gameId !== 'slots' && value.gameId !== 'crash') {
    throw new Error('Unsupported provably fair game id');
  }
  if (typeof value.serverSeedHash !== 'string' || typeof value.serverSeed !== 'string' || typeof value.clientSeed !== 'string') {
    throw new Error('Provably fair seed fields are required');
  }
  if (
    typeof value.nonce !== 'number' ||
    typeof value.cursor !== 'number' ||
    !Number.isInteger(value.nonce) ||
    value.nonce < 0 ||
    !Number.isInteger(value.cursor) ||
    value.cursor < 0
  ) {
    throw new Error('Provably fair nonce and cursor must be non-negative integers');
  }
  if (!isRecord(value.result) || typeof value.result.kind !== 'string') {
    throw new Error('Provably fair result is required');
  }
  return value as unknown as ProvablyFairProof;
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
