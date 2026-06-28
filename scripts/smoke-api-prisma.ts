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

  const spin = await postJsonWithRetry(`${baseUrl}/api/games/slots/spin`, userSession.token, {
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

  console.log('API Prisma smoke passed');
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

const postJsonWithRetry = async (url: string, token: string, body: Record<string, unknown>) => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await postJson(url, token, body);
    } catch (error) {
      lastError = error;
      if (!isTransientWriteConflict(error) || attempt === 3) break;
      await delay(250 * attempt);
    }
  }

  throw lastError;
};

const isTransientWriteConflict = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('write conflict') || message.includes('deadlock');
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
