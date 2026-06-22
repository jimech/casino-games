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

  const blockedUserSearch = await fetch(`${baseUrl}/api/admin/users`, {
    headers: { Authorization: `Bearer ${userSession.token}` }
  });
  assertEqual(blockedUserSearch.status, 403, 'regular user admin search access');
  const blockedRewardsReview = await fetch(`${baseUrl}/api/admin/rewards/review`, {
    headers: { Authorization: `Bearer ${userSession.token}` }
  });
  assertEqual(blockedRewardsReview.status, 403, 'regular user admin rewards review access');
  const adminUserSearch = await getJson(`${baseUrl}/api/admin/users?query=quality&limit=10`, adminSession.token);
  assertArray(adminUserSearch.users, 'admin user search array');
  if (!adminUserSearch.users.some((account: { id: string }) => account.id === userSession.user.id)) {
    throw new Error('Expected regular user to appear in admin search');
  }
  if (!adminUserSearch.users.some((account: { id: string }) => account.id === adminSession.user.id)) {
    throw new Error('Expected admin user to appear in admin search');
  }

  const adminUserDetail = await getJson(`${baseUrl}/api/admin/users/${userSession.user.id}`, adminSession.token);
  assertEqual(adminUserDetail.user.id, userSession.user.id, 'admin user detail id');
  assertArray(adminUserDetail.ledger, 'admin user detail ledger array');
  assertArray(adminUserDetail.riskEvents, 'admin user detail risk array');

  const bonus = await postJson(`${baseUrl}/api/bonuses/welcome-match-500/claim`, adminSession.token, {
    idempotencyKey: 'quality-bonus-welcome'
  });
  assertEqual(bonus.wallet.available, 100500, 'bonus wallet credit');

  const notificationList = await getJson(`${baseUrl}/api/notifications`, adminSession.token);
  if (!notificationList.notifications.some((notification: { type: string }) => notification.type === 'bonus')) {
    throw new Error('Expected bonus notification to be created');
  }
  const preferences = await getJson(`${baseUrl}/api/notifications/preferences`, adminSession.token);
  assertArray(preferences.preferences, 'notification preferences array');
  if (!preferences.preferences.some((preference: { type: string; mandatory: boolean }) => preference.type === 'risk' && preference.mandatory)) {
    throw new Error('Expected risk notification preference to be mandatory');
  }
  const mutedSupport = await postJson(`${baseUrl}/api/notifications/preferences/support`, adminSession.token, {
    enabled: false
  });
  assertEqual(mutedSupport.preference.enabled, false, 'support notification preference muted');
  const suppressedSupport = await postJson(`${baseUrl}/api/notifications`, adminSession.token, {
    type: 'support',
    title: 'Muted support note',
    message: 'This should be suppressed by preference.'
  });
  assertEqual(suppressedSupport.delivery.status, 'suppressed', 'support notification suppressed');
  const forcedRiskPreference = await postJson(`${baseUrl}/api/notifications/preferences/risk`, adminSession.token, {
    enabled: false
  });
  assertEqual(forcedRiskPreference.preference.enabled, true, 'mandatory risk preference forced enabled');
  const deliveredSystem = await postJson(`${baseUrl}/api/notifications`, adminSession.token, {
    type: 'system',
    title: 'Required system note',
    message: 'This required note must be delivered.'
  });
  assertEqual(deliveredSystem.delivery.status, 'delivered', 'mandatory system notification delivered');
  const notificationDeliveries = await getJson(`${baseUrl}/api/admin/notifications/deliveries?limit=20`, adminSession.token);
  if (!notificationDeliveries.deliveries.some((delivery: { status: string; type: string }) => delivery.status === 'suppressed' && delivery.type === 'support')) {
    throw new Error('Expected suppressed support delivery to appear for admin review');
  }

  const bet = await postJson(`${baseUrl}/api/bets`, adminSession.token, {
    gameId: 'roulette',
    stake: 1500,
    idempotencyKey: 'quality-risk-bet'
  });
  assertEqual(bet.wallet.available, 99000, 'high-stake bet wallet lock');

  const roundEvidence = await getJson(`${baseUrl}/api/admin/rounds/${bet.round.id}`, adminSession.token);
  assertEqual(roundEvidence.round.id, bet.round.id, 'admin round evidence id');
  assertEqual(roundEvidence.replayMode, 'read_only', 'round evidence replay mode');
  if (roundEvidence.ledger.length < 1 || roundEvidence.integrity.ledgerEntryCount < 1) {
    throw new Error('Expected round evidence to include linked ledger entries');
  }
  if (!roundEvidence.riskEvents.some((event: { type: string }) => event.type === 'high_stake_round')) {
    throw new Error('Expected round evidence to include high-stake risk event');
  }
  if (!roundEvidence.replayTimeline.some((event: { type: string }) => event.type === 'round_created')) {
    throw new Error('Expected round evidence replay timeline to include round creation');
  }

  const roundEvidenceExport = await fetch(`${baseUrl}/api/admin/rounds/${bet.round.id}/evidence-export`, {
    headers: { Authorization: `Bearer ${adminSession.token}` }
  });
  assertEqual(roundEvidenceExport.status, 200, 'round evidence export status');
  const exportedRoundEvidence = await roundEvidenceExport.json();
  assertEqual(exportedRoundEvidence.exportVersion, 'round-evidence-v1', 'round evidence export version');
  assertEqual(exportedRoundEvidence.round.id, bet.round.id, 'round evidence export round id');

  const settledVipRound = await postJson(`${baseUrl}/api/rounds/${bet.round.id}/settle`, adminSession.token, {
    payout: 0,
    idempotencyKey: 'quality-vip-settle',
    outcome: { source: 'vip-smoke-loss' }
  });
  assertEqual(settledVipRound.round.status, 'settled', 'vip smoke round settled');
  const vipStatus = await getJson(`${baseUrl}/api/vip/status`, adminSession.token);
  assertEqual(vipStatus.status.tier.id, 'silver', 'vip tier after settled stake');
  if (vipStatus.status.availableCashback <= 0) {
    throw new Error('Expected VIP cashback to be available after settled net loss');
  }
  const vipCashback = await postJson(`${baseUrl}/api/vip/cashback/claim`, adminSession.token, {
    idempotencyKey: 'quality-vip-cashback'
  });
  assertEqual(vipCashback.claim.campaignId, 'vip-weekly-cashback', 'vip cashback campaign id');
  if (vipCashback.wallet.available <= 99000) {
    throw new Error('Expected VIP cashback to credit the wallet');
  }
  const vipStatusAfterClaim = await getJson(`${baseUrl}/api/vip/status`, adminSession.token);
  assertEqual(vipStatusAfterClaim.status.availableCashback, 0, 'vip cashback only once per week');
  const rewardsReview = await getJson(`${baseUrl}/api/admin/rewards/review?query=quality&limit=10`, adminSession.token);
  if (!rewardsReview.accounts.some((account: { user: { id: string }; cashbackClaimedThisWeek: boolean }) => account.user.id === adminSession.user.id && account.cashbackClaimedThisWeek)) {
    throw new Error('Expected admin rewards review to show claimed VIP cashback');
  }

  const tournaments = await getJson(`${baseUrl}/api/tournaments`, adminSession.token);
  assertArray(tournaments.tournaments, 'tournament definitions array');
  const activeTournament = tournaments.tournaments.find((tournament: { status: string; entryFee: number }) => tournament.status === 'active' && tournament.entryFee > 0);
  if (!activeTournament) {
    throw new Error('Expected at least one active paid tournament');
  }
  const walletBeforeTournament = vipCashback.wallet.available;
  const tournamentEntry = await postJson(`${baseUrl}/api/tournaments/${activeTournament.id}/enter`, adminSession.token, {
    idempotencyKey: 'quality-tournament-entry'
  });
  assertEqual(tournamentEntry.wallet.available, walletBeforeTournament - activeTournament.entryFee, 'tournament entry fee wallet debit');
  const duplicateTournamentEntry = await postJson(`${baseUrl}/api/tournaments/${activeTournament.id}/enter`, adminSession.token, {
    idempotencyKey: 'quality-tournament-entry-duplicate'
  });
  assertEqual(duplicateTournamentEntry.wallet.available, tournamentEntry.wallet.available, 'duplicate tournament entry does not debit wallet');
  const tournamentRound = await postJson(`${baseUrl}/api/bets`, adminSession.token, {
    gameId: 'roulette',
    stake: 200,
    idempotencyKey: 'quality-tournament-round'
  });
  const tournamentRoundSettled = await postJson(`${baseUrl}/api/rounds/${tournamentRound.round.id}/settle`, adminSession.token, {
    payout: 0,
    idempotencyKey: 'quality-tournament-round-settle',
    outcome: { source: 'tournament-smoke-loss' }
  });
  const tournamentLeaderboard = await getJson(`${baseUrl}/api/tournaments/${activeTournament.id}/leaderboard`, adminSession.token);
  if (!tournamentLeaderboard.entries.some((entry: { userId: string; roundCount: number; score: number }) => entry.userId === adminSession.user.id && entry.roundCount === 1 && entry.score === -200)) {
    throw new Error('Expected tournament leaderboard to score settled rounds after entry only');
  }
  const blockedEarlySettlement = await fetch(`${baseUrl}/api/admin/tournaments/${activeTournament.id}/settle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminSession.token}`
    },
    body: JSON.stringify({ idempotencyKey: 'quality-tournament-settle-early' })
  });
  assertEqual(blockedEarlySettlement.status, 400, 'active tournament settlement blocked');
  const tournamentSettlement = await postJson(`${baseUrl}/api/admin/tournaments/${activeTournament.id}/settle`, adminSession.token, {
    idempotencyKey: 'quality-tournament-settle',
    now: new Date(new Date(activeTournament.endAt).getTime() + 1000).toISOString()
  });
  if (!tournamentSettlement.settlement.payouts.some((payout: { userId: string; amount: number; rank: number }) => payout.userId === adminSession.user.id && payout.amount === activeTournament.prizePool && payout.rank === 1)) {
    throw new Error('Expected tournament settlement to pay the ranked winner');
  }
  const duplicateTournamentSettlement = await postJson(`${baseUrl}/api/admin/tournaments/${activeTournament.id}/settle`, adminSession.token, {
    idempotencyKey: 'quality-tournament-settle-duplicate',
    now: new Date(new Date(activeTournament.endAt).getTime() + 1000).toISOString()
  });
  assertEqual(duplicateTournamentSettlement.settlement.id, tournamentSettlement.settlement.id, 'duplicate tournament settlement returns original');
  const loadedTournamentSettlement = await getJson(`${baseUrl}/api/admin/tournaments/${activeTournament.id}/settlement`, adminSession.token);
  assertEqual(loadedTournamentSettlement.settlement.id, tournamentSettlement.settlement.id, 'tournament settlement load');

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
  if (!bonusTargetAuditEvents.events.some((event: { name: string }) => event.name === 'vip_cashback_claimed')) {
    throw new Error('Expected VIP cashback claim decision to be logged');
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

  const explanations = await getJson(`${baseUrl}/api/admin/ai-decision-explanations?limit=25`, adminSession.token);
  assertArray(explanations.explanations, 'ai decision explanations array');
  for (const decisionType of ['game_recommendations', 'bonus_targeting', 'churn_score', 'fraud_score', 'responsible_play_intervention']) {
    if (!explanations.explanations.some((explanation: { decisionType: string }) => explanation.decisionType === decisionType)) {
      throw new Error(`Expected AI explanation for ${decisionType}`);
    }
  }
  const fraudExplanation = explanations.explanations.find((explanation: { decisionType: string; threshold?: unknown }) => explanation.decisionType === 'fraud_score');
  if (!fraudExplanation?.threshold) {
    throw new Error('Expected fraud explanation threshold metadata');
  }
  const explanationExport = await fetch(`${baseUrl}/api/admin/ai-decision-explanations/export?limit=25`, {
    headers: { Authorization: `Bearer ${adminSession.token}` }
  });
  const explanationCsv = await explanationExport.text();
  if (!explanationExport.ok || !explanationCsv.includes('decisionType') || !explanationCsv.includes('fraud_score')) {
    throw new Error('Expected AI decision explanation CSV export');
  }
  const blockedModelControl = await fetch(`${baseUrl}/api/admin/ai-model-controls/fraud_score`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminSession.token}`,
      'X-Request-Id': 'smoke-model-control-blocked'
    },
    body: JSON.stringify({ disabled: true })
  });
  assertEqual(blockedModelControl.status, 403, 'model control requires step-up');
  const stepUp = await postJson(`${baseUrl}/api/auth/step-up`, adminSession.token, {
    password: 'very-secret-pass',
    scope: 'admin:sensitive'
  });
  if (typeof stepUp.stepUpToken !== 'string' || stepUp.stepUpToken.length < 20) {
    throw new Error('Expected step-up token to be issued');
  }
  const modelControlRequestId = 'smoke-model-control-1';
  const modelControl = await postJson(`${baseUrl}/api/admin/ai-model-controls/fraud_score`, adminSession.token, {
    disabled: true,
    reason: 'smoke fallback verification'
  }, {
    'X-Step-Up-Token': stepUp.stepUpToken,
    'X-Request-Id': modelControlRequestId
  });
  assertEqual(modelControl.control.disabled, true, 'fraud model disabled control');
  const replayedModelControl = await fetch(`${baseUrl}/api/admin/ai-model-controls/fraud_score`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminSession.token}`,
      'X-Step-Up-Token': stepUp.stepUpToken,
      'X-Request-Id': modelControlRequestId
    },
    body: JSON.stringify({ disabled: false })
  });
  assertEqual(replayedModelControl.status, 400, 'model control replay blocked');
  await postJson(`${baseUrl}/api/risk/fraud-score/refresh`, adminSession.token, {});
  const fallbackExplanations = await getJson(`${baseUrl}/api/admin/ai-decision-explanations?decisionType=fraud_score&limit=5`, adminSession.token);
  if (!fallbackExplanations.explanations.some((explanation: { modelVersion: string }) => explanation.modelVersion === 'fraud-fallback-v1')) {
    throw new Error('Expected disabled fraud model to record fallback explanation');
  }
  const modelHealth = await getJson(`${baseUrl}/api/admin/ai-model-health`, adminSession.token);
  assertEqual(modelHealth.report.status, 'disabled', 'ai model health disabled status');
  if (!modelHealth.report.metrics.some((metric: { modelKey: string; disabled: boolean }) => metric.modelKey === 'fraud_score' && metric.disabled)) {
    throw new Error('Expected fraud model health metric to show disabled control');
  }
  const complianceCase = await postJson(`${baseUrl}/api/admin/compliance/cases`, adminSession.token, {
    subjectUserId: adminSession.user.id,
    type: 'fraud',
    priority: 'high',
    title: 'Smoke fraud anomaly review',
    description: 'Review fraud score and model health evidence.',
    evidence: {
      fraudScoreId: fraudScore.score.id,
      decisionType: 'fraud_score'
    }
  });
  assertEqual(complianceCase.case.status, 'open', 'compliance case open status');
  if (complianceCase.case.notes.length < 1 || complianceCase.case.evidence.fraudScoreId !== fraudScore.score.id) {
    throw new Error('Expected compliance case evidence and opening note');
  }
  const complianceQueue = await getJson(`${baseUrl}/api/admin/compliance/cases?status=open&limit=10`, adminSession.token);
  if (!complianceQueue.cases.some((caseRecord: { id: string }) => caseRecord.id === complianceCase.case.id)) {
    throw new Error('Expected compliance case to appear in open queue');
  }
  const complianceCaseLoaded = await getJson(`${baseUrl}/api/admin/compliance/cases/${complianceCase.case.id}`, adminSession.token);
  assertEqual(complianceCaseLoaded.case.id, complianceCase.case.id, 'compliance case detail load');
  const closedComplianceCase = await postJson(`${baseUrl}/api/admin/compliance/cases/${complianceCase.case.id}/notes`, adminSession.token, {
    note: 'Smoke review completed with no further action.',
    action: 'closed',
    status: 'closed',
    outcome: 'no_action_needed',
    evidence: {
      explanationId: fraudExplanation.id
    }
  });
  assertEqual(closedComplianceCase.case.status, 'closed', 'compliance case closed status');
  assertEqual(closedComplianceCase.case.outcome, 'no_action_needed', 'compliance case outcome');
  const complianceAuditEvents = await getJson(`${baseUrl}/api/ai/events?category=admin&limit=25`, adminSession.token);
  if (!complianceAuditEvents.events.some((event: { name: string; context?: { caseId?: string } }) => event.name === 'compliance_case_action' && event.context?.caseId === complianceCase.case.id)) {
    throw new Error('Expected compliance case actions in audit events');
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
  if (!risks.events.some((event: { type: string }) => event.type === 'ai_model_degraded')) {
    throw new Error('Expected AI model degradation risk event to be created');
  }
  if (!risks.events.some((event: { type: string }) => event.type === 'step_up_required')) {
    throw new Error('Expected missing step-up risk event to be searchable');
  }
  if (!risks.events.some((event: { type: string }) => event.type === 'replay_request_blocked')) {
    throw new Error('Expected replay request risk event to be searchable');
  }
  if (!risks.events.some((event: { type: string }) => event.type === 'compliance_case_action')) {
    throw new Error('Expected compliance case action risk event to be searchable');
  }

  const streamUpdates = await collectWalletEvents(adminSession.user.id, adminSession.token);
  const expectedTournamentWallet = tournamentRoundSettled.wallet.available + activeTournament.prizePool;
  if (!streamUpdates.some(update => update.available === expectedTournamentWallet && update.locked === 0)) {
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

const postJson = async (url: string, token: string, body: Record<string, unknown>, headers: Record<string, string> = {}) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...headers
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
