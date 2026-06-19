import { spawn } from 'node:child_process';

const port = 4300 + Math.floor(Math.random() * 500);
const baseUrl = `http://127.0.0.1:${port}`;

const server = spawn('npm', ['run', 'dev'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    CASINO_BACKEND_DRIVER: 'memory',
    ADMIN_INVITE_CODE: 'smoke-admin',
    PORT: String(port),
    DISABLE_HMR: 'true'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverOutput = '';
let stopped = false;

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
  await waitForServerReady();

  const userSession = await register({
    username: 'quality_user',
    password: 'very-secret-pass',
    acceptAgeGate: true,
    acceptTerms: true,
    acceptPrivacy: true
  });
  assertEqual(userSession.user.role, 'user', 'regular registration role');

  const blockedAdmin = await fetch(`${baseUrl}/api/admin/summary`, {
    headers: { Authorization: `Bearer ${userSession.token}` }
  });
  assertEqual(blockedAdmin.status, 403, 'regular user admin access');

  const adminSession = await register({
    username: 'quality_admin',
    password: 'very-secret-pass',
    adminInviteCode: 'smoke-admin',
    acceptAgeGate: true,
    acceptTerms: true,
    acceptPrivacy: true
  });
  assertEqual(adminSession.user.role, 'admin', 'admin invite role');

  const adminSummary = await getJson(`${baseUrl}/api/admin/summary`, adminSession.token);
  assertArray(adminSummary.ledger, 'admin ledger array');

  const bonus = await postJson(`${baseUrl}/api/bonuses/welcome-match-500/claim`, adminSession.token, {
    idempotencyKey: 'quality-bonus-welcome'
  });
  assertEqual(bonus.wallet.available, 100500, 'bonus wallet credit');

  const notificationList = await getJson(`${baseUrl}/api/notifications`, adminSession.token);
  if (!notificationList.notifications.some((notification: { type: string }) => notification.type === 'bonus')) {
    throw new Error('Expected bonus notification to be created');
  }

  const bet = await postJson(`${baseUrl}/api/bets`, adminSession.token, {
    gameId: 'roulette',
    stake: 1500,
    idempotencyKey: 'quality-risk-bet'
  });
  assertEqual(bet.wallet.available, 99000, 'high-stake bet wallet lock');

  const risks = await getJson(`${baseUrl}/api/risk/events?status=open`, adminSession.token);
  if (!risks.events.some((event: { type: string }) => event.type === 'high_stake_round')) {
    throw new Error('Expected high-stake risk event to be created');
  }

  const streamUpdates = await collectWalletEvents(adminSession.user.id, adminSession.token);
  if (!streamUpdates.some(update => update.available === 99000 && update.locked === 1500)) {
    throw new Error('Expected wallet SSE stream to send current wallet state');
  }

  let limitedStatus = 0;
  for (let index = 0; index < 12; index += 1) {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'missing', password: 'wrong-password' })
    });
    limitedStatus = response.status;
  }
  assertEqual(limitedStatus, 429, 'login rate limit');

  console.log('API memory smoke passed');
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
      // Keep polling until the dev server finishes booting.
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

const collectWalletEvents = async (userId: string, token: string) => {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/api/wallet/${userId}/events?token=${encodeURIComponent(token)}`, {
    signal: controller.signal
  });
  if (!response.ok || !response.body) {
    throw new Error(`Wallet event stream failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const updates: Array<{ available: number; locked: number }> = [];
  let buffer = '';
  const deadline = Date.now() + 3000;

  while (Date.now() < deadline && updates.length < 1) {
    const read = await Promise.race([
      reader.read(),
      delay(500).then(() => ({ done: false, value: undefined }))
    ]);
    if (read.done) break;
    if (!read.value) continue;
    buffer += decoder.decode(read.value, { stream: true });
    for (const match of buffer.matchAll(/event: wallet\ndata: (.*?)\n\n/gs)) {
      updates.push(JSON.parse(match[1]));
    }
  }

  controller.abort();
  return updates;
};

const assertArray = (value: unknown, label: string) => {
  if (!Array.isArray(value)) throw new Error(`Expected ${label}`);
};

const assertEqual = (actual: unknown, expected: unknown, label: string) => {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

main()
  .catch(error => {
    console.error(error);
    console.error(serverOutput);
    process.exitCode = 1;
  })
  .finally(() => {
    stopServer();
  });
