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
  await assertProductionClientServed();

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

  const consentSession = await postJson(`${baseUrl}/api/auth/consent`, userSession.token, {
    acceptAgeGate: true,
    acceptTerms: true,
    acceptPrivacy: true,
    sessionTimeoutLimit: '15 mins'
  });
  if (!consentSession.user.ageGateAcceptedAt || !consentSession.user.termsAcceptedAt || !consentSession.user.privacyAcceptedAt) {
    throw new Error('Expected settings consent save to return updated consent timestamps');
  }
  assertEqual(consentSession.user.sessionTimeoutLimit, '15 mins', 'settings session timeout update');
  await postJsonExpectStatus(`${baseUrl}/api/auth/consent`, userSession.token, {
    acceptAgeGate: true,
    acceptTerms: true,
    acceptPrivacy: true,
    sessionTimeoutLimit: 'forever'
  }, 400);
  await postJsonExpectStatus(`${baseUrl}/api/games/slots/spin`, userSession.token, {
    machineId: 'fruit-mania',
    bet: 10,
    idempotencyKey: 'quality-session-timeout-block'
  }, 403, { 'x-smoke-session-age-minutes': '16' });
  const profileSession = await patchJson(`${baseUrl}/api/auth/profile`, userSession.token, {
    displayName: 'Quality Profile',
    email: 'quality-profile@example.test'
  });
  assertEqual(profileSession.user.displayName, 'Quality Profile', 'profile display name update');
  assertEqual(profileSession.user.email, 'quality-profile@example.test', 'profile email update');
  const restoredProfileSession = await getJson(`${baseUrl}/api/auth/session`, userSession.token);
  assertEqual(restoredProfileSession.user.displayName, 'Quality Profile', 'restored profile display name');
  assertEqual(restoredProfileSession.user.email, 'quality-profile@example.test', 'restored profile email');
  assertEqual(restoredProfileSession.user.sessionTimeoutLimit, '15 mins', 'restored session timeout');

  const adminSession = await register({
    username: 'quality_admin',
    password: 'very-secret-pass',
    adminInviteCode: 'smoke-admin',
    acceptAgeGate: true,
    acceptTerms: true,
    acceptPrivacy: true
  });
  assertEqual(adminSession.user.role, 'admin', 'admin invite role');
  const timeoutRiskEvents = await getJson(`${baseUrl}/api/risk/events?userId=${encodeURIComponent(userSession.user.id)}&limit=20`, adminSession.token);
  if (!timeoutRiskEvents.events.some((event: { type: string }) => event.type === 'responsible_play_session_timeout')) {
    throw new Error('Expected responsible play session timeout risk event to be created');
  }

  const depositSession = await register({
    username: 'quality_deposit',
    password: 'very-secret-pass',
    acceptAgeGate: true,
    acceptTerms: true,
    acceptPrivacy: true
  });

  const depositKey = 'quality-wallet-deposit';
  const deposit = await postJson(`${baseUrl}/api/wallet/deposits`, depositSession.token, {
    amount: 125,
    method: 'card',
    idempotencyKey: depositKey
  });
  assertEqual(deposit.wallet.available, 100125, 'wallet deposit credited');
  const depositReplay = await postJson(`${baseUrl}/api/wallet/deposits`, depositSession.token, {
    amount: 125,
    method: 'card',
    idempotencyKey: depositKey
  });
  assertEqual(depositReplay.deposit.reference, deposit.deposit.reference, 'wallet deposit replay reference');
  assertEqual(depositReplay.wallet.available, 100125, 'wallet deposit replay balance');
  await postJsonExpectStatus(`${baseUrl}/api/wallet/deposits`, depositSession.token, {
    amount: 126,
    method: 'card',
    idempotencyKey: depositKey
  }, 409);
  const depositLedger = await getJson(`${baseUrl}/api/wallet/${depositSession.user.id}/ledger`, depositSession.token);
  const depositLedgerEntries = depositLedger.entries.filter((entry: { idempotencyKey: string; type: string }) =>
    entry.idempotencyKey === depositKey && entry.type === 'credit'
  );
  assertEqual(depositLedgerEntries.length, 1, 'wallet deposit ledger count');
  const depositNotifications = await getJson(`${baseUrl}/api/notifications`, depositSession.token);
  if (!depositNotifications.notifications.some((notification: { type: string; metadata?: { reference?: string } }) =>
    notification.type === 'wallet' && notification.metadata?.reference === deposit.deposit.reference
  )) {
    throw new Error('Expected wallet deposit notification to be created');
  }

  const withdrawalKey = 'quality-wallet-withdrawal';
  const withdrawal = await postJson(`${baseUrl}/api/wallet/withdrawals`, depositSession.token, {
    amount: 75,
    method: 'bank_wire',
    idempotencyKey: withdrawalKey
  });
  assertEqual(withdrawal.wallet.available, 100050, 'wallet withdrawal debited');
  const withdrawalReplay = await postJson(`${baseUrl}/api/wallet/withdrawals`, depositSession.token, {
    amount: 75,
    method: 'bank_wire',
    idempotencyKey: withdrawalKey
  });
  assertEqual(withdrawalReplay.withdrawal.reference, withdrawal.withdrawal.reference, 'wallet withdrawal replay reference');
  assertEqual(withdrawalReplay.wallet.available, 100050, 'wallet withdrawal replay balance');
  await postJsonExpectStatus(`${baseUrl}/api/wallet/withdrawals`, depositSession.token, {
    amount: 76,
    method: 'bank_wire',
    idempotencyKey: withdrawalKey
  }, 409);
  const withdrawalLedger = await getJson(`${baseUrl}/api/wallet/${depositSession.user.id}/ledger`, depositSession.token);
  const withdrawalLedgerEntries = withdrawalLedger.entries.filter((entry: { idempotencyKey: string; type: string }) =>
    entry.idempotencyKey === withdrawalKey && entry.type === 'debit'
  );
  assertEqual(withdrawalLedgerEntries.length, 1, 'wallet withdrawal ledger count');
  const withdrawalNotifications = await getJson(`${baseUrl}/api/notifications`, depositSession.token);
  if (!withdrawalNotifications.notifications.some((notification: { type: string; metadata?: { reference?: string } }) =>
    notification.type === 'wallet' && notification.metadata?.reference === withdrawal.withdrawal.reference
  )) {
    throw new Error('Expected wallet withdrawal notification to be created');
  }
  await postJsonExpectStatus(`${baseUrl}/api/wallet/withdrawals`, depositSession.token, {
    amount: 1500,
    method: 'bank_wire',
    idempotencyKey: 'quality-wallet-withdrawal-step-up-block'
  }, 403);
  const withdrawalStepUp = await postJson(`${baseUrl}/api/auth/step-up`, depositSession.token, {
    password: 'very-secret-pass',
    scope: 'wallet:withdrawal'
  });
  if (typeof withdrawalStepUp.stepUpToken !== 'string' || withdrawalStepUp.stepUpToken.length < 20) {
    throw new Error('Expected withdrawal step-up token to be issued');
  }
  const steppedUpWithdrawal = await postJson(`${baseUrl}/api/wallet/withdrawals`, depositSession.token, {
    amount: 2500,
    method: 'bank_wire',
    idempotencyKey: 'quality-wallet-withdrawal-step-up'
  }, {
    'X-Step-Up-Token': withdrawalStepUp.stepUpToken
  });
  assertEqual(steppedUpWithdrawal.wallet.available, 97550, 'step-up withdrawal debited');
  assertEqual(steppedUpWithdrawal.wallet.locked, 2500, 'high-value withdrawal held for review');
  assertEqual(steppedUpWithdrawal.withdrawal.status, 'pending_review', 'high-value withdrawal pending review status');
  if (typeof steppedUpWithdrawal.withdrawal.id !== 'string' || steppedUpWithdrawal.withdrawal.userId !== depositSession.user.id) {
    throw new Error('Expected high-value withdrawal response to include operational withdrawal record');
  }
  const steppedUpWithdrawalReplay = await postJson(`${baseUrl}/api/wallet/withdrawals`, depositSession.token, {
    amount: 2500,
    method: 'bank_wire',
    idempotencyKey: 'quality-wallet-withdrawal-step-up'
  }, {
    'X-Step-Up-Token': withdrawalStepUp.stepUpToken
  });
  assertEqual(steppedUpWithdrawalReplay.withdrawal.reference, steppedUpWithdrawal.withdrawal.reference, 'step-up withdrawal replay reference');
  assertEqual(steppedUpWithdrawalReplay.wallet.locked, 2500, 'step-up withdrawal replay keeps held funds stable');
  const withdrawalReviewCases = await getJson(`${baseUrl}/api/admin/compliance/cases?subjectUserId=${encodeURIComponent(depositSession.user.id)}&type=security&limit=10`, adminSession.token);
  const highValueWithdrawalCases = withdrawalReviewCases.cases.filter((caseRecord: { evidence?: { reference?: string } }) =>
    caseRecord.evidence?.reference === steppedUpWithdrawal.withdrawal.reference
  );
  assertEqual(highValueWithdrawalCases.length, 1, 'high-value withdrawal review case count');
  const withdrawalReviewCase = highValueWithdrawalCases[0];
  const pendingWithdrawalRecords = await getJson(`${baseUrl}/api/wallet/withdrawals?status=pending_review&limit=10`, depositSession.token);
  if (!pendingWithdrawalRecords.withdrawals.some((withdrawal: { reference?: string; complianceCaseId?: string }) =>
    withdrawal.reference === steppedUpWithdrawal.withdrawal.reference &&
    withdrawal.complianceCaseId === withdrawalReviewCase.id
  )) {
    throw new Error('Expected pending withdrawal record to link review case');
  }
  const blockedAdminWithdrawals = await fetch(`${baseUrl}/api/admin/withdrawals?limit=5`, {
    headers: { Authorization: `Bearer ${depositSession.token}` }
  });
  assertEqual(blockedAdminWithdrawals.status, 403, 'regular user admin withdrawal queue access');
  const adminPendingWithdrawals = await getJson(`${baseUrl}/api/admin/withdrawals?status=pending_review&limit=10`, adminSession.token);
  if (!adminPendingWithdrawals.withdrawals.some((withdrawal: { reference?: string; userId?: string; complianceCaseId?: string }) =>
    withdrawal.reference === steppedUpWithdrawal.withdrawal.reference &&
    withdrawal.userId === depositSession.user.id &&
    withdrawal.complianceCaseId === withdrawalReviewCase.id
  )) {
    throw new Error('Expected admin withdrawal queue to include pending review withdrawal');
  }
  const playerWithdrawalReviewCases = await getJson(`${baseUrl}/api/compliance/cases?status=open&type=security&limit=5`, depositSession.token);
  if (!playerWithdrawalReviewCases.cases.some((caseRecord: { evidence?: { reference?: string } }) =>
    caseRecord.evidence?.reference === steppedUpWithdrawal.withdrawal.reference
  )) {
    throw new Error('Expected player compliance case endpoint to expose own withdrawal review');
  }
  const postReviewNotifications = await getJson(`${baseUrl}/api/notifications`, depositSession.token);
  if (!postReviewNotifications.notifications.some((notification: { type: string; metadata?: { reference?: string } }) =>
    notification.type === 'risk' && notification.metadata?.reference === steppedUpWithdrawal.withdrawal.reference
  )) {
    throw new Error('Expected high-value withdrawal review notification');
  }
  const closedWithdrawalReview = await postJson(`${baseUrl}/api/admin/compliance/cases/${withdrawalReviewCase.id}/notes`, adminSession.token, {
    note: 'Smoke high-value withdrawal review completed.',
    action: 'closed',
    status: 'closed',
    outcome: 'approved_for_private_payout',
    evidence: {
      source: 'wallet_withdrawal_review',
      reference: steppedUpWithdrawal.withdrawal.reference
    }
  });
  assertEqual(closedWithdrawalReview.case.status, 'closed', 'high-value withdrawal review closed');
  assertEqual(closedWithdrawalReview.case.outcome, 'approved_for_private_payout', 'high-value withdrawal review outcome');
  const walletAfterWithdrawalApproval = await getJson(`${baseUrl}/api/wallet/${depositSession.user.id}`, depositSession.token);
  assertEqual(walletAfterWithdrawalApproval.available, 97550, 'approved withdrawal keeps available balance debited');
  assertEqual(walletAfterWithdrawalApproval.locked, 0, 'approved withdrawal settles held funds');
  await postJsonExpectStatus(`${baseUrl}/api/admin/compliance/cases/${withdrawalReviewCase.id}/notes`, adminSession.token, {
    note: 'Smoke attempt to rewrite approved payout review.',
    action: 'closed',
    status: 'closed',
    outcome: 'rejected_private_payout',
    evidence: {
      source: 'wallet_withdrawal_review',
      reference: steppedUpWithdrawal.withdrawal.reference
    }
  }, 400);
  const walletAfterBlockedRewrite = await getJson(`${baseUrl}/api/wallet/${depositSession.user.id}`, depositSession.token);
  assertEqual(walletAfterBlockedRewrite.available, 97550, 'blocked review rewrite keeps available balance stable');
  assertEqual(walletAfterBlockedRewrite.locked, 0, 'blocked review rewrite keeps locked balance stable');
  const closedCaseFollowUpNote = await postJson(`${baseUrl}/api/admin/compliance/cases/${withdrawalReviewCase.id}/notes`, adminSession.token, {
    note: 'Smoke follow-up note after payout review resolution.',
    action: 'follow_up_note'
  });
  assertEqual(closedCaseFollowUpNote.case.status, 'closed', 'closed case follow-up note keeps status');
  assertEqual(closedCaseFollowUpNote.case.outcome, 'approved_for_private_payout', 'closed case follow-up note keeps outcome');
  const approvedWithdrawalRecords = await getJson(`${baseUrl}/api/wallet/withdrawals?status=approved&limit=10`, depositSession.token);
  if (!approvedWithdrawalRecords.withdrawals.some((withdrawal: { reference?: string; complianceCaseId?: string; resolvedAt?: string }) =>
    withdrawal.reference === steppedUpWithdrawal.withdrawal.reference &&
    withdrawal.complianceCaseId === withdrawalReviewCase.id &&
    typeof withdrawal.resolvedAt === 'string'
  )) {
    throw new Error('Expected approved withdrawal record to resolve with review case');
  }
  const adminApprovedWithdrawals = await getJson(`${baseUrl}/api/admin/withdrawals?status=approved&limit=10`, adminSession.token);
  if (!adminApprovedWithdrawals.withdrawals.some((withdrawal: { reference?: string; userId?: string; complianceCaseId?: string }) =>
    withdrawal.reference === steppedUpWithdrawal.withdrawal.reference &&
    withdrawal.userId === depositSession.user.id &&
    withdrawal.complianceCaseId === withdrawalReviewCase.id
  )) {
    throw new Error('Expected admin withdrawal queue to include approved withdrawal');
  }
  const approvedWithdrawalLedger = await getJson(`${baseUrl}/api/wallet/${depositSession.user.id}/ledger`, depositSession.token);
  if (!approvedWithdrawalLedger.entries.some((entry: { type: string; metadata?: { reference?: string } }) =>
    entry.type === 'lock' && entry.metadata?.reference === steppedUpWithdrawal.withdrawal.reference
  )) {
    throw new Error('Expected high-value withdrawal hold ledger entry');
  }
  if (!approvedWithdrawalLedger.entries.some((entry: { type: string; metadata?: { complianceCaseId?: string; reference?: string } }) =>
    entry.type === 'settleLoss' &&
    entry.metadata?.complianceCaseId === withdrawalReviewCase.id &&
    entry.metadata?.reference === steppedUpWithdrawal.withdrawal.reference
  )) {
    throw new Error('Expected approved withdrawal settlement ledger entry');
  }
  const openWithdrawalReviewsAfterClose = await getJson(`${baseUrl}/api/compliance/cases?status=open&type=security&limit=5`, depositSession.token);
  if (openWithdrawalReviewsAfterClose.cases.some((caseRecord: { evidence?: { reference?: string } }) =>
    caseRecord.evidence?.reference === steppedUpWithdrawal.withdrawal.reference
  )) {
    throw new Error('Expected closed withdrawal review to leave player open review queue');
  }
  const closedPlayerWithdrawalReviews = await getJson(`${baseUrl}/api/compliance/cases?status=closed&type=security&limit=5`, depositSession.token);
  if (!closedPlayerWithdrawalReviews.cases.some((caseRecord: { evidence?: { reference?: string }; outcome?: string }) =>
    caseRecord.evidence?.reference === steppedUpWithdrawal.withdrawal.reference &&
    caseRecord.outcome === 'approved_for_private_payout'
  )) {
    throw new Error('Expected player closed review queue to include withdrawal outcome');
  }
  const closedReviewNotifications = await getJson(`${baseUrl}/api/notifications`, depositSession.token);
  if (!closedReviewNotifications.notifications.some((notification: { type: string; metadata?: { caseId?: string; status?: string; outcome?: string } }) =>
    notification.type === 'risk' &&
    notification.metadata?.caseId === withdrawalReviewCase.id &&
    notification.metadata?.status === 'closed' &&
    notification.metadata?.outcome === 'approved_for_private_payout'
  )) {
    throw new Error('Expected compliance review closure notification');
  }
  const rejectedWithdrawal = await postJson(`${baseUrl}/api/wallet/withdrawals`, depositSession.token, {
    amount: 2600,
    method: 'bank_wire',
    idempotencyKey: 'quality-wallet-withdrawal-rejected-review'
  }, {
    'X-Step-Up-Token': withdrawalStepUp.stepUpToken
  });
  assertEqual(rejectedWithdrawal.wallet.available, 94950, 'rejected-review withdrawal hold debits available balance');
  assertEqual(rejectedWithdrawal.wallet.locked, 2600, 'rejected-review withdrawal funds held');
  const rejectedWithdrawalCases = await getJson(`${baseUrl}/api/admin/compliance/cases?subjectUserId=${encodeURIComponent(depositSession.user.id)}&type=security&limit=10`, adminSession.token);
  const rejectedReviewCase = rejectedWithdrawalCases.cases.find((caseRecord: { evidence?: { reference?: string } }) =>
    caseRecord.evidence?.reference === rejectedWithdrawal.withdrawal.reference
  );
  if (!rejectedReviewCase) {
    throw new Error('Expected rejected withdrawal review case');
  }
  const rejectedWithdrawalReview = await postJson(`${baseUrl}/api/admin/compliance/cases/${rejectedReviewCase.id}/notes`, adminSession.token, {
    note: 'Smoke high-value withdrawal review rejected.',
    action: 'closed',
    status: 'closed',
    outcome: 'rejected_private_payout',
    evidence: {
      source: 'wallet_withdrawal_review',
      reference: rejectedWithdrawal.withdrawal.reference
    }
  });
  assertEqual(rejectedWithdrawalReview.case.status, 'closed', 'rejected withdrawal review closed');
  assertEqual(rejectedWithdrawalReview.case.outcome, 'rejected_private_payout', 'rejected withdrawal review outcome');
  const walletAfterWithdrawalRejection = await getJson(`${baseUrl}/api/wallet/${depositSession.user.id}`, depositSession.token);
  assertEqual(walletAfterWithdrawalRejection.available, 97550, 'rejected withdrawal returns held funds');
  assertEqual(walletAfterWithdrawalRejection.locked, 0, 'rejected withdrawal clears held funds');
  const rejectedWithdrawalRecords = await getJson(`${baseUrl}/api/wallet/withdrawals?status=rejected&limit=10`, depositSession.token);
  if (!rejectedWithdrawalRecords.withdrawals.some((withdrawal: { reference?: string; complianceCaseId?: string; resolvedAt?: string }) =>
    withdrawal.reference === rejectedWithdrawal.withdrawal.reference &&
    withdrawal.complianceCaseId === rejectedReviewCase.id &&
    typeof withdrawal.resolvedAt === 'string'
  )) {
    throw new Error('Expected rejected withdrawal record to resolve with review case');
  }
  const adminRejectedWithdrawals = await getJson(`${baseUrl}/api/admin/withdrawals?status=rejected&limit=10`, adminSession.token);
  if (!adminRejectedWithdrawals.withdrawals.some((withdrawal: { reference?: string; userId?: string; complianceCaseId?: string }) =>
    withdrawal.reference === rejectedWithdrawal.withdrawal.reference &&
    withdrawal.userId === depositSession.user.id &&
    withdrawal.complianceCaseId === rejectedReviewCase.id
  )) {
    throw new Error('Expected admin withdrawal queue to include rejected withdrawal');
  }
  const rejectedWithdrawalLedger = await getJson(`${baseUrl}/api/wallet/${depositSession.user.id}/ledger`, depositSession.token);
  if (!rejectedWithdrawalLedger.entries.some((entry: { type: string; metadata?: { complianceCaseId?: string; reference?: string } }) =>
    entry.type === 'release' &&
    entry.metadata?.complianceCaseId === rejectedReviewCase.id &&
    entry.metadata?.reference === rejectedWithdrawal.withdrawal.reference
  )) {
    throw new Error('Expected rejected withdrawal release ledger entry');
  }
  const rejectionNotifications = await getJson(`${baseUrl}/api/notifications`, depositSession.token);
  if (!rejectionNotifications.notifications.some((notification: { type: string; metadata?: { caseId?: string; status?: string } }) =>
    notification.type === 'wallet' &&
    notification.metadata?.caseId === rejectedReviewCase.id &&
    notification.metadata?.status === 'rejected_private_payout'
  )) {
    throw new Error('Expected rejected withdrawal release notification');
  }
  const accountClosureRequest = await postJson(`${baseUrl}/api/notifications`, depositSession.token, {
    type: 'support',
    title: 'Account closure review requested',
    message: 'Player requested private account closure review from settings.',
    metadata: {
      requestType: 'account_closure',
      userId: depositSession.user.id
    }
  });
  assertEqual(accountClosureRequest.delivery.status, 'delivered', 'account closure request delivery');
  assertEqual(accountClosureRequest.notification.metadata.requestType, 'account_closure', 'account closure metadata');

  const proofSession = await register({
    username: 'quality_proof',
    password: 'very-secret-pass',
    acceptAgeGate: true,
    acceptTerms: true,
    acceptPrivacy: true
  });

  const adminSummary = await getJson(`${baseUrl}/api/admin/summary`, adminSession.token);
  assertArray(adminSummary.ledger, 'admin ledger array');

  const provablyFairSlots = await postJson(`${baseUrl}/api/games/slots/spin`, proofSession.token, {
    machineId: 'fruit-mania',
    bet: 10,
    idempotencyKey: 'quality-provably-fair-slots'
  });
  const provablyFairProof = provablyFairSlots.round?.outcome?.provablyFair;
  if (!provablyFairProof) {
    throw new Error('Expected slots spin to include provably fair proof');
  }
  const provablyFairVerification = await postJson(`${baseUrl}/api/provably-fair/verify`, proofSession.token, {
    proof: provablyFairProof
  });
  assertEqual(provablyFairVerification.verification.valid, true, 'provably fair slots verification');
  const playerProvablyFairEvidence = await getJson(`${baseUrl}/api/rounds/${provablyFairSlots.round.id}/provably-fair`, proofSession.token);
  assertEqual(playerProvablyFairEvidence.provablyFair.present, true, 'player proof inspector proof present');
  assertEqual(playerProvablyFairEvidence.provablyFair.valid, true, 'player proof inspector proof valid');
  const provablyFairSeeds = await getJson(`${baseUrl}/api/provably-fair/seeds`, proofSession.token);
  if (!provablyFairSeeds.seeds.some((seed: { status: string; roundId?: string; serverSeed?: string }) =>
    seed.status === 'revealed' && seed.roundId === provablyFairSlots.round.id && typeof seed.serverSeed === 'string'
  )) {
    throw new Error('Expected provably fair seed lifecycle list to expose revealed round seed');
  }
  const provablyFairEvidence = await getJson(`${baseUrl}/api/admin/rounds/${provablyFairSlots.round.id}`, adminSession.token);
  assertEqual(provablyFairEvidence.provablyFair.present, true, 'round evidence provably fair proof present');
  assertEqual(provablyFairEvidence.provablyFair.valid, true, 'round evidence provably fair proof valid');
  assertEqual(provablyFairEvidence.integrity.provablyFairProofCount, 1, 'round evidence proof integrity count');
  if (!provablyFairEvidence.replayTimeline.some((event: { type: string }) => event.type === 'provably_fair_verified')) {
    throw new Error('Expected round evidence timeline to include provably fair verification');
  }

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
  await postJsonExpectStatus(`${baseUrl}/api/bonuses/daily-free-credits-100/claim`, adminSession.token, {
    idempotencyKey: 'quality-bonus-welcome'
  }, 409);

  const notificationList = await getJson(`${baseUrl}/api/notifications`, adminSession.token);
  if (!notificationList.notifications.some((notification: { type: string }) => notification.type === 'bonus')) {
    throw new Error('Expected bonus notification to be created');
  }
  const preferences = await getJson(`${baseUrl}/api/notifications/preferences`, adminSession.token);
  assertArray(preferences.preferences, 'notification preferences array');
  if (!preferences.preferences.some((preference: { type: string; mandatory: boolean }) => preference.type === 'risk' && preference.mandatory)) {
    throw new Error('Expected risk notification preference to be mandatory');
  }
  const deliveredSupport = await postJson(`${baseUrl}/api/notifications`, adminSession.token, {
    type: 'support',
    title: 'Support request received',
    message: 'Quality smoke support request',
    metadata: {
      name: 'Quality Admin',
      email: 'quality@example.test'
    }
  });
  assertEqual(deliveredSupport.delivery.status, 'delivered', 'support notification delivered');
  if (!deliveredSupport.notification?.metadata || deliveredSupport.notification.metadata.name !== 'Quality Admin') {
    throw new Error('Expected delivered support notification metadata to be preserved');
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
  await postJsonExpectStatus(`${baseUrl}/api/bets`, adminSession.token, {
    gameId: 'roulette',
    stake: 500,
    idempotencyKey: 'quality-risk-bet'
  }, 409);

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
  await postJsonExpectStatus(`${baseUrl}/api/rounds/${bet.round.id}/settle`, adminSession.token, {
    payout: 100,
    idempotencyKey: 'quality-vip-settle',
    outcome: { source: 'vip-smoke-loss' }
  }, 409);
  const vipStatus = await getJson(`${baseUrl}/api/vip/status`, adminSession.token);
  assertEqual(vipStatus.status.tier.id, 'silver', 'vip tier after settled stake');
  if (vipStatus.status.availableCashback <= 0) {
    throw new Error('Expected VIP cashback to be available after settled net loss');
  }
  const vipCashback = await postJson(`${baseUrl}/api/vip/cashback/claim`, adminSession.token, {
    idempotencyKey: 'quality-vip-cashback'
  });
  assertEqual(vipCashback.claim.campaignId, 'vip-weekly-cashback', 'vip cashback campaign id');
  const vipCashbackReplay = await postJson(`${baseUrl}/api/vip/cashback/claim`, adminSession.token, {
    idempotencyKey: 'quality-vip-cashback'
  });
  assertEqual(vipCashbackReplay.claim.id, vipCashback.claim.id, 'vip cashback exact replay claim id');
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
  const cancellableTournament = tournaments.tournaments.find((tournament: { id: string; status: string; entryFee: number }) =>
    tournament.id !== activeTournament.id && tournament.status === 'active' && tournament.entryFee > 0
  );
  if (!cancellableTournament) {
    throw new Error('Expected a second active paid tournament for cancellation smoke');
  }
  const walletBeforeTournament = vipCashback.wallet.available;
  const tournamentEntry = await postJson(`${baseUrl}/api/tournaments/${activeTournament.id}/enter`, adminSession.token, {
    idempotencyKey: 'quality-tournament-entry'
  });
  assertEqual(tournamentEntry.wallet.available, walletBeforeTournament - activeTournament.entryFee, 'tournament entry fee wallet debit');
  await postJsonExpectStatus(`${baseUrl}/api/tournaments/${cancellableTournament.id}/enter`, adminSession.token, {
    idempotencyKey: 'quality-tournament-entry'
  }, 409);
  const duplicateTournamentEntry = await postJson(`${baseUrl}/api/tournaments/${activeTournament.id}/enter`, adminSession.token, {
    idempotencyKey: 'quality-tournament-entry-duplicate'
  });
  assertEqual(duplicateTournamentEntry.wallet.available, tournamentEntry.wallet.available, 'duplicate tournament entry does not debit wallet');
  const cancellationEntry = await postJson(`${baseUrl}/api/tournaments/${cancellableTournament.id}/enter`, adminSession.token, {
    idempotencyKey: 'quality-tournament-cancel-entry'
  });
  assertEqual(cancellationEntry.wallet.available, duplicateTournamentEntry.wallet.available - cancellableTournament.entryFee, 'cancellation tournament entry fee debit');
  const tournamentCancellation = await postJson(`${baseUrl}/api/admin/tournaments/${cancellableTournament.id}/cancel`, adminSession.token, {
    reason: 'Smoke test cancellation',
    idempotencyKey: 'quality-tournament-cancel'
  });
  if (!tournamentCancellation.cancellation.refunds.some((refund: { userId: string; amount: number }) => refund.userId === adminSession.user.id && refund.amount === cancellableTournament.entryFee)) {
    throw new Error('Expected tournament cancellation to refund the entry fee');
  }
  await postJsonExpectStatus(`${baseUrl}/api/admin/tournaments/${cancellableTournament.id}/cancel`, adminSession.token, {
    reason: 'Changed cancellation reason',
    idempotencyKey: 'quality-tournament-cancel'
  }, 409);
  const duplicateTournamentCancellation = await postJson(`${baseUrl}/api/admin/tournaments/${cancellableTournament.id}/cancel`, adminSession.token, {
    reason: 'Duplicate cancellation',
    idempotencyKey: 'quality-tournament-cancel-duplicate'
  });
  assertEqual(duplicateTournamentCancellation.cancellation.id, tournamentCancellation.cancellation.id, 'duplicate tournament cancellation returns original');
  const loadedTournamentCancellation = await getJson(`${baseUrl}/api/admin/tournaments/${cancellableTournament.id}/cancellation`, adminSession.token);
  assertEqual(loadedTournamentCancellation.cancellation.id, tournamentCancellation.cancellation.id, 'tournament cancellation load');
  const cancelledTournaments = await getJson(`${baseUrl}/api/tournaments`, adminSession.token);
  if (!cancelledTournaments.tournaments.some((tournament: { id: string; status: string }) => tournament.id === cancellableTournament.id && tournament.status === 'cancelled')) {
    throw new Error('Expected cancelled tournament to surface in tournament list');
  }
  const cancelledTournamentEvidence = await getJson(`${baseUrl}/api/admin/tournaments/${cancellableTournament.id}/evidence`, adminSession.token);
  assertEqual(cancelledTournamentEvidence.cancellation.id, tournamentCancellation.cancellation.id, 'cancelled tournament evidence cancellation id');
  if (cancelledTournamentEvidence.integrity.refundLedgerCount < 1) {
    throw new Error('Expected cancelled tournament evidence to include refund ledger proof');
  }
  const tournamentDispute = await postJson(`${baseUrl}/api/admin/tournaments/${cancellableTournament.id}/disputes`, adminSession.token, {
    subjectUserId: adminSession.user.id,
    disputeType: 'cancellation_refund_review',
    priority: 'high'
  });
  assertEqual(tournamentDispute.case.evidence.tournamentId, cancellableTournament.id, 'tournament dispute evidence id');
  assertEqual(tournamentDispute.case.evidence.cancellationId, tournamentCancellation.cancellation.id, 'tournament dispute cancellation evidence');
  const disputedTournamentEvidence = await getJson(`${baseUrl}/api/admin/tournaments/${cancellableTournament.id}/evidence`, adminSession.token);
  if (!disputedTournamentEvidence.disputeCases.some((caseRecord: { id: string }) => caseRecord.id === tournamentDispute.case.id)) {
    throw new Error('Expected tournament evidence to include linked dispute case');
  }
  const tournamentQueue = await getJson(`${baseUrl}/api/admin/tournaments/queue?filter=all`, adminSession.token);
  if (!tournamentQueue.policy || typeof tournamentQueue.policy.maxPrizePool !== 'number') {
    throw new Error('Expected tournament queue to include settlement policy');
  }
  if (!tournamentQueue.rows.some((row: { tournament: { id: string }; flags: { cancelled: boolean; disputed: boolean; unresolved: boolean } }) =>
    row.tournament.id === cancellableTournament.id && row.flags.cancelled && row.flags.disputed && row.flags.unresolved
  )) {
    throw new Error('Expected tournament queue to flag cancelled unresolved dispute');
  }
  const unresolvedTournamentQueue = await getJson(`${baseUrl}/api/admin/tournaments/queue?filter=unresolved`, adminSession.token);
  if (!unresolvedTournamentQueue.rows.some((row: { tournament: { id: string } }) => row.tournament.id === cancellableTournament.id)) {
    throw new Error('Expected unresolved tournament queue filter to include disputed tournament');
  }
  const tournamentPolicy = await getJson(`${baseUrl}/api/admin/tournaments/policy`, adminSession.token);
  assertEqual(tournamentPolicy.policy.requireDisputeFree, true, 'tournament auto-settle dispute-free policy');
  const mathReport = await getJson(`${baseUrl}/api/admin/game-math/simulations?sampleCount=5000`, adminSession.token);
  if (
    mathReport.report.summary.scenarioCount < 12 ||
    mathReport.report.roulette.length < 2 ||
    mathReport.report.slots.length < 3 ||
    mathReport.report.crash.length < 3 ||
    mathReport.report.blackjack.length < 2 ||
    mathReport.report.poker.length < 2
  ) {
    throw new Error('Expected game math simulation report to include roulette, slots, crash, blackjack, and poker scenarios');
  }
  if (!mathReport.report.roulette.every((scenario: { theoreticalRtp: number }) => scenario.theoreticalRtp > 0.96 && scenario.theoreticalRtp < 0.98)) {
    throw new Error('Expected roulette simulation RTP to match European roulette house edge');
  }
  const settlementJob = await postJson(`${baseUrl}/api/admin/tournaments/jobs/settlement-scan`, adminSession.token, {
    autoSettle: false,
    idempotencyKey: 'quality-tournament-job-dry-run',
    now: new Date(new Date(activeTournament.endAt).getTime() + 1000).toISOString()
  });
  assertEqual(settlementJob.report.mode, 'dry_run', 'tournament settlement job dry-run mode');
  await postJsonExpectStatus(`${baseUrl}/api/admin/tournaments/jobs/settlement-scan`, adminSession.token, {
    autoSettle: true,
    idempotencyKey: 'quality-tournament-job-dry-run',
    now: new Date(new Date(activeTournament.endAt).getTime() + 1000).toISOString()
  }, 409);
  if (!settlementJob.report.rows.some((row: { tournament: { id: string }; flags: { needsSettlement: boolean } }) => row.tournament.id === activeTournament.id && row.flags.needsSettlement)) {
    throw new Error('Expected tournament settlement job to detect ended unsettled tournament');
  }
  if (!settlementJob.report.rows.some((row: { tournament: { id: string }; policyDecision: { allowed: boolean; reasonCodes: string[] } }) =>
    row.tournament.id === activeTournament.id && !row.policyDecision.allowed && row.policyDecision.reasonCodes.includes('insufficient_scored_entries')
  )) {
    throw new Error('Expected tournament settlement job to expose policy block reasons before scored rounds');
  }
  if (settlementJob.report.alertCount < 1) {
    throw new Error('Expected tournament settlement job to alert admins');
  }
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
  await postJsonExpectStatus(`${baseUrl}/api/admin/tournaments/${activeTournament.id}/settle`, adminSession.token, {
    idempotencyKey: 'quality-tournament-settle',
    now: new Date(new Date(activeTournament.endAt).getTime() + 2000).toISOString()
  }, 409);
  const duplicateTournamentSettlement = await postJson(`${baseUrl}/api/admin/tournaments/${activeTournament.id}/settle`, adminSession.token, {
    idempotencyKey: 'quality-tournament-settle-duplicate',
    now: new Date(new Date(activeTournament.endAt).getTime() + 1000).toISOString()
  });
  assertEqual(duplicateTournamentSettlement.settlement.id, tournamentSettlement.settlement.id, 'duplicate tournament settlement returns original');
  const loadedTournamentSettlement = await getJson(`${baseUrl}/api/admin/tournaments/${activeTournament.id}/settlement`, adminSession.token);
  assertEqual(loadedTournamentSettlement.settlement.id, tournamentSettlement.settlement.id, 'tournament settlement load');
  const tournamentEvidence = await getJson(`${baseUrl}/api/admin/tournaments/${activeTournament.id}/evidence`, adminSession.token);
  assertEqual(tournamentEvidence.replayMode, 'read_only', 'tournament evidence replay mode');
  assertEqual(tournamentEvidence.settlement.id, tournamentSettlement.settlement.id, 'tournament evidence settlement id');
  if (tournamentEvidence.integrity.entryLedgerCount < 1 || tournamentEvidence.integrity.payoutLedgerCount < 1) {
    throw new Error('Expected tournament evidence to include entry and payout ledger proof');
  }
  if (!tournamentEvidence.participants.some((participant: { user: { id: string }; leaderboardRow?: { rank: number } }) => participant.user.id === adminSession.user.id && participant.leaderboardRow?.rank === 1)) {
    throw new Error('Expected tournament evidence to include ranked participant detail');
  }
  const tournamentEvidenceExport = await fetch(`${baseUrl}/api/admin/tournaments/${activeTournament.id}/evidence-export`, {
    headers: { Authorization: `Bearer ${adminSession.token}` }
  });
  assertEqual(tournamentEvidenceExport.status, 200, 'tournament evidence export status');
  const exportedTournamentEvidence = await tournamentEvidenceExport.json();
  assertEqual(exportedTournamentEvidence.exportVersion, 'tournament-evidence-v1', 'tournament evidence export version');
  assertEqual(exportedTournamentEvidence.tournament.id, activeTournament.id, 'tournament evidence export id');

  const reconciliation = await postJson(`${baseUrl}/api/admin/integrity/reconciliation`, adminSession.token, {});
  assertEqual(reconciliation.report.status, 'pass', 'integrity reconciliation status');
  if (reconciliation.report.summary.criticalIssueCount !== 0 || reconciliation.report.summary.roundCount < 1) {
    throw new Error('Expected reconciliation report to pass with settled smoke rounds');
  }

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
  await postJsonExpectStatus(`${baseUrl}/api/games/slots/spin`, adminSession.token, {
    machineId: 'fruit-mania',
    bet: 10,
    idempotencyKey: 'quality-responsible-play-ack-block'
  }, 403);
  const acknowledgedResponsiblePlay = await postJson(`${baseUrl}/api/responsible-play/interventions/${responsiblePlay.intervention.id}/acknowledge`, adminSession.token, {});
  if (!acknowledgedResponsiblePlay.intervention.acknowledgedAt) {
    throw new Error('Expected responsible play acknowledgement timestamp');
  }
  const responsiblePlayReview = await getJson(`${baseUrl}/api/admin/responsible-play/interventions?limit=10`, adminSession.token);
  if (!responsiblePlayReview.interventions.some((intervention: { userId: string; acknowledgedAt?: string }) =>
    intervention.userId === adminSession.user.id && typeof intervention.acknowledgedAt === 'string'
  )) {
    throw new Error('Expected acknowledged responsible play intervention to surface for admin review');
  }
  const responsiblePlayAuditEvents = await getJson(`${baseUrl}/api/ai/events?category=risk&limit=25`, adminSession.token);
  if (!responsiblePlayAuditEvents.events.some((event: { name: string }) => event.name === 'responsible_play_intervention')) {
    throw new Error('Expected responsible play intervention decision to be logged');
  }
  if (!responsiblePlayAuditEvents.events.some((event: { name: string }) => event.name === 'responsible_play_acknowledged')) {
    throw new Error('Expected responsible play acknowledgement to be logged');
  }
  const responsiblePlayRisks = await getJson(`${baseUrl}/api/risk/events?userId=${encodeURIComponent(adminSession.user.id)}&limit=50`, adminSession.token);
  if (!responsiblePlayRisks.events.some((event: { type: string }) => event.type === 'responsible_play_acknowledgement_required')) {
    throw new Error('Expected responsible play acknowledgement guard risk event');
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

  const risks = await getJson(`${baseUrl}/api/risk/events?status=open&limit=300`, adminSession.token);
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
  if (!risks.events.some((event: { type: string; context?: { scope?: string } }) =>
    event.type === 'idempotency_replay' && event.context?.scope === 'vip.cashback.claim'
  )) {
    throw new Error('Expected idempotency replay audit event to be searchable');
  }
  if (!risks.events.some((event: { type: string; context?: { scope?: string } }) =>
    event.type === 'idempotency_conflict' && event.context?.scope === 'bonus.claim'
  )) {
    throw new Error('Expected idempotency conflict audit event to be searchable');
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

const assertProductionClientServed = async () => {
  const response = await fetch(`${baseUrl}/`);
  const html = await response.text();
  if (!response.ok) {
    throw new Error(`Production client root failed: ${response.status}`);
  }
  if (html.includes('/src/main.tsx')) {
    throw new Error('Production client served development index.html with /src/main.tsx');
  }

  const scriptMatch = html.match(/<script[^>]+src="([^"]*\/assets\/[^"]+\.js)"/);
  const styleMatch = html.match(/<link[^>]+href="([^"]*\/assets\/[^"]+\.css)"/);
  if (!scriptMatch?.[1]) {
    throw new Error('Production client index is missing built JavaScript asset');
  }
  if (!styleMatch?.[1]) {
    throw new Error('Production client index is missing built CSS asset');
  }

  await assertStaticAsset(scriptMatch[1], 'JavaScript');
  await assertStaticAsset(styleMatch[1], 'CSS');

  const spaFallback = await fetch(`${baseUrl}/admin/audit`);
  const fallbackHtml = await spaFallback.text();
  if (!spaFallback.ok || !fallbackHtml.includes(scriptMatch[1])) {
    throw new Error(`Production SPA fallback failed: ${spaFallback.status}`);
  }
};

const assertStaticAsset = async (assetPath: string, label: string) => {
  const response = await fetch(`${baseUrl}${assetPath}`);
  const body = await response.text();
  if (!response.ok || body.length === 0) {
    throw new Error(`Production ${label} asset failed: ${response.status} ${assetPath}`);
  }
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

const patchJson = async (url: string, token: string, body: Record<string, unknown>) => {
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`PATCH ${url} failed: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
};

const postJsonExpectStatus = async (
  url: string,
  token: string,
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string> = {}
) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...headers
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status !== status) {
    throw new Error(`POST ${url} expected ${status}, received ${response.status}: ${JSON.stringify(payload)}`);
  }
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
