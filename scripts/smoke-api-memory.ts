import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const port = 4300 + Math.floor(Math.random() * 500);
const baseUrl = `http://127.0.0.1:${port}`;
const serverEntry = 'dist/server.js';

if (!existsSync(serverEntry)) {
  throw new Error('dist/server.js is missing. Run npm run build before npm run smoke:api.');
}

const server = spawn(process.execPath, [serverEntry], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    CASINO_BACKEND_DRIVER: 'memory',
    ADMIN_INVITE_CODE: 'smoke-admin',
    PORT: String(port),
    NODE_ENV: 'production',
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

  await postJson(`${baseUrl}/api/ai/events`, adminSession.token, {
    category: 'page',
    name: 'tab_viewed',
    context: { tab: 'admin' }
  });
  const aiEvents = await getJson(`${baseUrl}/api/ai/events?limit=25`, adminSession.token);
  assertArray(aiEvents.events, 'ai events array');
  if (!aiEvents.events.some((event: { category: string; name: string }) => event.category === 'bonus' && event.name === 'bonus_claimed')) {
    throw new Error('Expected bonus AI event to be captured');
  }
  if (!aiEvents.events.some((event: { category: string; name: string }) => event.category === 'game' && event.name === 'round_started')) {
    throw new Error('Expected game AI event to be captured');
  }
  if (!aiEvents.events.some((event: { category: string; name: string }) => event.category === 'page' && event.name === 'tab_viewed')) {
    throw new Error('Expected manual page AI event to be captured');
  }
  const aiProfile = await postJson(`${baseUrl}/api/ai/profile/refresh`, adminSession.token, {
    limit: 25
  });
  assertEqual(aiProfile.snapshot.version, 'behavior-v1', 'ai profile version');
  if (aiProfile.snapshot.sourceEventCount < 3) {
    throw new Error('Expected AI profile to aggregate recent events');
  }
  if (aiProfile.snapshot.features.gameSignals.favoriteGameId !== 'roulette') {
    throw new Error('Expected AI profile favorite game to be roulette');
  }
  if (aiProfile.snapshot.features.riskSignals.highStakeRounds < 1) {
    throw new Error('Expected AI profile high-stake signal');
  }
  const recommendations = await getJson(`${baseUrl}/api/recommendations/games?limit=5`, adminSession.token);
  assertEqual(recommendations.source, 'profile', 'recommendation source');
  assertArray(recommendations.recommendations, 'game recommendations array');
  if (recommendations.recommendations[0].gameId !== 'roulette-royal') {
    throw new Error('Expected roulette recommendation to rank first from behavior');
  }
  const recommendationAuditEvents = await getJson(`${baseUrl}/api/ai/events?category=game&limit=25`, adminSession.token);
  if (!recommendationAuditEvents.events.some((event: { name: string }) => event.name === 'game_recommendations_generated')) {
    throw new Error('Expected recommendation output to be logged');
  }
  const targetedBonuses = await getJson(`${baseUrl}/api/bonuses/targeted`, adminSession.token);
  assertEqual(targetedBonuses.source, 'profile', 'bonus targeting source');
  assertArray(targetedBonuses.offers, 'targeted bonus offers array');
  if (!targetedBonuses.offers.some((offer: { id: string; reasonCodes: string[] }) => offer.id === 'target-daily-retention' && offer.reasonCodes.includes('high_stake_activity'))) {
    throw new Error('Expected high-stake retention bonus target');
  }
  const repeatedTargeting = await getJson(`${baseUrl}/api/bonuses/targeted`, adminSession.token);
  if (!repeatedTargeting.suppressed.some((offer: { id: string; suppressionCodes: string[] }) => offer.id === 'target-daily-retention' && offer.suppressionCodes.includes('targeting_cooldown_active'))) {
    throw new Error('Expected repeated bonus target to be suppressed by cooldown');
  }
  const bonusTargetAuditEvents = await getJson(`${baseUrl}/api/ai/events?category=bonus&limit=25`, adminSession.token);
  if (!bonusTargetAuditEvents.events.some((event: { name: string }) => event.name === 'bonus_targets_generated')) {
    throw new Error('Expected bonus targeting decision to be logged');
  }
  const activeChurn = await postJson(`${baseUrl}/api/retention/churn-score/refresh`, adminSession.token, {});
  assertEqual(activeChurn.score.version, 'churn-v1', 'active churn score version');
  if (activeChurn.score.band === 'high' || activeChurn.score.band === 'critical') {
    throw new Error('Expected active user churn score to avoid high-risk band');
  }
  const inactiveChurn = await postJson(`${baseUrl}/api/retention/churn-score/refresh`, userSession.token, {});
  assertEqual(inactiveChurn.score.band, 'critical', 'inactive churn score band');
  const churnReview = await getJson(`${baseUrl}/api/admin/churn-scores?band=critical&limit=10`, adminSession.token);
  if (!churnReview.scores.some((score: { userId: string }) => score.userId === userSession.user.id)) {
    throw new Error('Expected critical churn score to surface for admin review');
  }
  const churnAuditEvents = await getJson(`${baseUrl}/api/ai/events?category=risk&limit=25`, userSession.token);
  if (!churnAuditEvents.events.some((event: { name: string }) => event.name === 'churn_score_generated')) {
    throw new Error('Expected churn score decision to be logged');
  }

  for (const attempt of [
    { paymentInstrumentHash: 'card-a', deviceId: 'device-a', country: 'DE' },
    { paymentInstrumentHash: 'card-b', deviceId: 'device-b', country: 'DE' },
    { paymentInstrumentHash: 'card-c', deviceId: 'device-c', country: 'FR' }
  ]) {
    await postJson(`${baseUrl}/api/ai/events`, adminSession.token, {
      category: 'wallet',
      name: 'deposit_attempt',
      context: { ...attempt, amount: 100 }
    });
  }
  const fraudScore = await postJson(`${baseUrl}/api/risk/fraud-score/refresh`, adminSession.token, {});
  assertEqual(fraudScore.score.version, 'fraud-v1', 'fraud score version');
  assertEqual(fraudScore.score.band, 'critical', 'fraud score band');
  if (!fraudScore.score.reasonCodes.includes('payment_velocity')) {
    throw new Error('Expected fraud score to include payment velocity');
  }
  const fraudReview = await getJson(`${baseUrl}/api/admin/fraud-scores?band=critical&limit=10`, adminSession.token);
  if (!fraudReview.scores.some((score: { userId: string }) => score.userId === adminSession.user.id)) {
    throw new Error('Expected critical fraud score to surface for admin review');
  }
  const fraudAuditEvents = await getJson(`${baseUrl}/api/ai/events?category=risk&limit=25`, adminSession.token);
  if (!fraudAuditEvents.events.some((event: { name: string }) => event.name === 'fraud_score_generated')) {
    throw new Error('Expected fraud score decision to be logged');
  }

  const responsiblePlay = await postJson(`${baseUrl}/api/responsible-play/interventions/evaluate`, adminSession.token, {
    gameId: 'roulette',
    stake: 5000
  });
  assertEqual(responsiblePlay.intervention.version, 'responsible-play-v1', 'responsible play version');
  if (responsiblePlay.intervention.level !== 'warning' && responsiblePlay.intervention.level !== 'cooldown') {
    throw new Error('Expected responsible play warning or cooldown intervention');
  }
  if (!responsiblePlay.intervention.requiresAcknowledgement) {
    throw new Error('Expected responsible play intervention to require acknowledgement');
  }
  const responsiblePlayReview = await getJson(`${baseUrl}/api/admin/responsible-play/interventions?limit=10`, adminSession.token);
  if (!responsiblePlayReview.interventions.some((intervention: { userId: string }) => intervention.userId === adminSession.user.id)) {
    throw new Error('Expected responsible play intervention to surface for admin review');
  }
  const responsiblePlayAuditEvents = await getJson(`${baseUrl}/api/ai/events?category=risk&limit=25`, adminSession.token);
  if (!responsiblePlayAuditEvents.events.some((event: { name: string }) => event.name === 'responsible_play_intervention')) {
    throw new Error('Expected responsible play intervention decision to be logged');
  }

  const risks = await getJson(`${baseUrl}/api/risk/events?status=open`, adminSession.token);
  if (!risks.events.some((event: { type: string }) => event.type === 'high_stake_round')) {
    throw new Error('Expected high-stake risk event to be created');
  }
  if (!risks.events.some((event: { type: string }) => event.type === 'fraud_anomaly_high')) {
    throw new Error('Expected fraud anomaly risk event to be created');
  }
  if (!risks.events.some((event: { type: string }) => event.type === 'responsible_play_intervention')) {
    throw new Error('Expected responsible play risk event to be created');
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
