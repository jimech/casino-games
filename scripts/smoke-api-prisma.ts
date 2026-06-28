import 'dotenv/config';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { prisma } from '../src/backend/db/prisma';

const port = 5000 + Math.floor(Math.random() * 500);
const baseUrl = `http://127.0.0.1:${port}`;
const serverEntry = 'dist/server.js';
const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
const smokeUserPrefix = 'prisma_api_user_';
const smokeAdminPrefix = 'prisma_api_admin_';

if (!existsSync(serverEntry)) {
  throw new Error('dist/server.js is missing. Run npm run build before npm run smoke:api:prisma.');
}

const server = spawn(process.execPath, [serverEntry], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    CASINO_BACKEND_DRIVER: 'prisma',
    ADMIN_INVITE_CODE: `prisma-smoke-admin-${suffix}`,
    PORT: String(port),
    NODE_ENV: 'production',
    DISABLE_HMR: 'true'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverOutput = '';
let stopped = false;
const createdUserIds: string[] = [];

const stopServer = () => {
  if (stopped) return;
  stopped = true;
  server.kill('SIGINT');
};

server.stdout.on('data', chunk => {
  serverOutput += chunk.toString();
});

server.stderr.on('data', chunk => {
  serverOutput += chunk.toString();
});

process.on('exit', stopServer);
process.on('SIGINT', () => {
  stopServer();
  process.exit(130);
});

const main = async () => {
  await cleanupSmokeUsers();
  await waitForServerReady();

  const userSession = await register({
    username: `${smokeUserPrefix}${suffix}`,
    password: 'very-secret-pass',
    acceptAgeGate: true,
    acceptTerms: true,
    acceptPrivacy: true
  });
  createdUserIds.push(userSession.user.id);
  const adminSession = await register({
    username: `${smokeAdminPrefix}${suffix}`,
    password: 'very-secret-pass',
    adminInviteCode: `prisma-smoke-admin-${suffix}`,
    acceptAgeGate: true,
    acceptTerms: true,
    acceptPrivacy: true
  });
  createdUserIds.push(adminSession.user.id);

  assertEqual(userSession.user.role, 'user', 'regular registration role');
  assertEqual(adminSession.user.role, 'admin', 'admin registration role');

  const wallet = await getJson(`${baseUrl}/api/wallet/${userSession.user.id}`, userSession.token);
  assertEqual(wallet.available, 100000, 'initial Prisma wallet balance');

  const spin = await postJson(`${baseUrl}/api/games/slots/spin`, userSession.token, {
    machineId: 'fruit-mania',
    bet: 10,
    idempotencyKey: `prisma-api-slots-${suffix}`
  });
  const proof = spin.round?.outcome?.provablyFair;
  if (!proof) throw new Error('Expected Prisma API slots spin to include provably fair proof');

  const verification = await postJson(`${baseUrl}/api/provably-fair/verify`, userSession.token, { proof });
  assertEqual(verification.verification.valid, true, 'Prisma API proof verification');

  const playerEvidence = await getJson(`${baseUrl}/api/rounds/${spin.round.id}/provably-fair`, userSession.token);
  assertEqual(playerEvidence.provablyFair.present, true, 'Prisma player proof present');
  assertEqual(playerEvidence.provablyFair.valid, true, 'Prisma player proof valid');

  const seeds = await getJson(`${baseUrl}/api/provably-fair/seeds`, userSession.token);
  if (!seeds.seeds.some((seed: { status: string; roundId?: string; serverSeed?: string }) =>
    seed.status === 'revealed' && seed.roundId === spin.round.id && typeof seed.serverSeed === 'string'
  )) {
    throw new Error('Expected Prisma API seed list to include revealed seed for slots round');
  }

  const adminEvidence = await getJson(`${baseUrl}/api/admin/rounds/${spin.round.id}`, adminSession.token);
  assertEqual(adminEvidence.provablyFair.valid, true, 'Prisma admin evidence proof valid');
  assertEqual(adminEvidence.integrity.provablyFairProofCount, 1, 'Prisma admin evidence proof count');

  const walletBeforeReplay = await getJson(`${baseUrl}/api/wallet/${userSession.user.id}`, userSession.token);
  const replayBet = 10;
  const replayKey = `prisma-api-replay-slots-${suffix}`;
  const [firstReplay, secondReplay] = await Promise.all([
    postJson(`${baseUrl}/api/games/slots/spin`, userSession.token, {
      machineId: 'fruit-mania',
      bet: replayBet,
      idempotencyKey: replayKey
    }),
    postJson(`${baseUrl}/api/games/slots/spin`, userSession.token, {
      machineId: 'fruit-mania',
      bet: replayBet,
      idempotencyKey: replayKey
    })
  ]);
  assertEqual(secondReplay.round.id, firstReplay.round.id, 'Prisma API replay round id');
  assertEqual(secondReplay.round.payout, firstReplay.round.payout, 'Prisma API replay payout');

  const walletAfterReplay = await getJson(`${baseUrl}/api/wallet/${userSession.user.id}`, userSession.token);
  const expectedReplayAvailable = walletBeforeReplay.available - replayBet + Number(firstReplay.round.payout ?? 0);
  assertEqual(walletAfterReplay.available, expectedReplayAvailable, 'Prisma API replay wallet available');
  assertEqual(walletAfterReplay.locked, 0, 'Prisma API replay wallet locked');

  const replayLedger = await getJson(`${baseUrl}/api/wallet/${userSession.user.id}/ledger`, userSession.token);
  const replayLocks = replayLedger.entries.filter((entry: { idempotencyKey: string; type: string }) =>
    entry.idempotencyKey === `${replayKey}:lock` && entry.type === 'lock'
  );
  const replaySettlements = replayLedger.entries.filter((entry: { idempotencyKey: string; type: string }) =>
    entry.idempotencyKey === `${replayKey}:settle` && (entry.type === 'settleWin' || entry.type === 'settleLoss')
  );
  assertEqual(replayLocks.length, 1, 'Prisma API replay lock ledger count');
  assertEqual(replaySettlements.length, 1, 'Prisma API replay settlement ledger count');

  const replaySeeds = await getJson(`${baseUrl}/api/provably-fair/seeds`, userSession.token);
  const replaySeedMatches = replaySeeds.seeds.filter((seed: { status: string; roundId?: string; serverSeed?: string }) =>
    seed.status === 'revealed' && seed.roundId === firstReplay.round.id && typeof seed.serverSeed === 'string'
  );
  assertEqual(replaySeedMatches.length, 1, 'Prisma API replay seed record count');

  const conflict = await postJsonExpectStatus(`${baseUrl}/api/games/slots/spin`, userSession.token, {
    machineId: 'fruit-mania',
    bet: replayBet * 2,
    idempotencyKey: replayKey
  }, 409);
  if (!String(conflict.error ?? '').includes('Idempotency conflict')) {
    throw new Error(`Expected idempotency conflict error, received ${JSON.stringify(conflict)}`);
  }
  const walletAfterConflict = await getJson(`${baseUrl}/api/wallet/${userSession.user.id}`, userSession.token);
  assertEqual(walletAfterConflict.available, walletAfterReplay.available, 'Prisma API conflict wallet available unchanged');
  assertEqual(walletAfterConflict.locked, walletAfterReplay.locked, 'Prisma API conflict wallet locked unchanged');

  const conflictLedger = await getJson(`${baseUrl}/api/wallet/${userSession.user.id}/ledger`, userSession.token);
  const conflictReplayLocks = conflictLedger.entries.filter((entry: { idempotencyKey: string; type: string }) =>
    entry.idempotencyKey === `${replayKey}:lock` && entry.type === 'lock'
  );
  const conflictReplaySettlements = conflictLedger.entries.filter((entry: { idempotencyKey: string; type: string }) =>
    entry.idempotencyKey === `${replayKey}:settle` && (entry.type === 'settleWin' || entry.type === 'settleLoss')
  );
  assertEqual(conflictReplayLocks.length, 1, 'Prisma API conflict lock ledger count unchanged');
  assertEqual(conflictReplaySettlements.length, 1, 'Prisma API conflict settlement ledger count unchanged');

  const conflictSeeds = await getJson(`${baseUrl}/api/provably-fair/seeds`, userSession.token);
  const conflictSeedMatches = conflictSeeds.seeds.filter((seed: { status: string; roundId?: string; serverSeed?: string }) =>
    seed.status === 'revealed' && seed.roundId === firstReplay.round.id && typeof seed.serverSeed === 'string'
  );
  assertEqual(conflictSeedMatches.length, 1, 'Prisma API conflict seed record count unchanged');

  const walletBeforeStress = await getJson(`${baseUrl}/api/wallet/${userSession.user.id}`, userSession.token);
  const stressBet = 10;
  const stressSpins = await Promise.all(
    Array.from({ length: 6 }, (_, index) =>
      postJson(`${baseUrl}/api/games/slots/spin`, userSession.token, {
        machineId: 'fruit-mania',
        bet: stressBet,
        idempotencyKey: `prisma-api-stress-slots-${suffix}-${index}`
      })
    )
  );
  const walletAfterStress = await getJson(`${baseUrl}/api/wallet/${userSession.user.id}`, userSession.token);
  const stressPayout = stressSpins.reduce((sum, result) => sum + Number(result.round?.payout ?? 0), 0);
  const expectedAvailable = walletBeforeStress.available - (stressBet * stressSpins.length) + stressPayout;
  assertEqual(walletAfterStress.available, expectedAvailable, 'Prisma API concurrent slots wallet available');
  assertEqual(walletAfterStress.locked, 0, 'Prisma API concurrent slots wallet locked');

  const stressLedger = await getJson(`${baseUrl}/api/wallet/${userSession.user.id}/ledger`, userSession.token);
  const stressLedgerEntries = stressLedger.entries.filter((entry: {
    idempotencyKey: string;
    type: string;
    metadata?: { gameId?: string };
  }) => entry.idempotencyKey.startsWith(`prisma-api-stress-slots-${suffix}-`) && entry.metadata?.gameId === 'slots');
  const stressLocks = stressLedgerEntries.filter((entry: { type: string }) => entry.type === 'lock');
  const stressSettlements = stressLedgerEntries.filter((entry: { type: string }) =>
    entry.type === 'settleWin' || entry.type === 'settleLoss'
  );
  assertEqual(stressLocks.length, stressSpins.length, 'Prisma API concurrent slots lock ledger count');
  assertEqual(stressSettlements.length, stressSpins.length, 'Prisma API concurrent slots settlement ledger count');

  const stressRounds = await getJson(`${baseUrl}/api/rounds`, userSession.token);
  const stressRoundIds = new Set(stressSpins.map(result => result.round.id));
  const persistedStressRounds = stressRounds.rounds.filter((round: { id: string; status: string }) =>
    stressRoundIds.has(round.id)
  );
  assertEqual(persistedStressRounds.length, stressSpins.length, 'Prisma API concurrent slots round count');
  if (!persistedStressRounds.every((round: { status: string }) => round.status === 'settled')) {
    throw new Error('Expected all Prisma API stress slot rounds to be settled');
  }

  console.log('API Prisma smoke passed', {
    replayRoundId: firstReplay.round.id,
    stressSpins: stressSpins.length,
    stressPayout,
    walletAfterStress
  });
};

const waitForServerReady = async () => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Server exited early with code ${server.exitCode}\n${serverOutput}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Keep polling until the bundled server finishes booting.
    }
    await delay(250);
  }
  throw new Error(`Server did not become ready\n${serverOutput}`);
};

const register = async (body: Record<string, unknown>) => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`Register failed: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
};

const getJson = async (url: string, token: string) => {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`GET ${url} failed: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
};

const postJson = async (url: string, token: string, body: Record<string, unknown>) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`POST ${url} failed: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
};

const postJsonExpectStatus = async (url: string, token: string, body: Record<string, unknown>, status: number) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (response.status !== status) {
    throw new Error(`POST ${url} expected ${status}, received ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
};

const assertEqual = (actual: unknown, expected: unknown, label: string) => {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const cleanup = async () => {
  stopServer();
  await delay(250);

  await cleanupSmokeUsers();
  await prisma.$disconnect();
};

const cleanupSmokeUsers = async () => {
  await prisma.user.deleteMany({
    where: {
      OR: [
        ...(createdUserIds.length > 0 ? [{
          id: {
            in: createdUserIds
          }
        }] : []),
        {
          username: {
            startsWith: smokeUserPrefix
          }
        },
        {
          username: {
            startsWith: smokeAdminPrefix
          }
        }
      ]
    }
  });
};

main()
  .catch(error => {
    console.error(error);
    console.error(serverOutput);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
  });
