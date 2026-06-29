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

  const depositKey = `prisma-api-wallet-deposit-${suffix}`;
  const deposit = await postJson(`${baseUrl}/api/wallet/deposits`, userSession.token, {
    amount: 125,
    method: 'card',
    idempotencyKey: depositKey
  });
  assertEqual(deposit.wallet.available, 100125, 'Prisma API wallet deposit credited');
  const depositReplay = await postJson(`${baseUrl}/api/wallet/deposits`, userSession.token, {
    amount: 125,
    method: 'card',
    idempotencyKey: depositKey
  });
  assertEqual(depositReplay.deposit.reference, deposit.deposit.reference, 'Prisma API wallet deposit replay reference');
  assertEqual(depositReplay.wallet.available, 100125, 'Prisma API wallet deposit replay balance');
  await postJsonExpectStatus(`${baseUrl}/api/wallet/deposits`, userSession.token, {
    amount: 126,
    method: 'card',
    idempotencyKey: depositKey
  }, 409);

  const withdrawalKey = `prisma-api-wallet-withdrawal-${suffix}`;
  const withdrawal = await postJson(`${baseUrl}/api/wallet/withdrawals`, userSession.token, {
    amount: 75,
    method: 'bank_wire',
    idempotencyKey: withdrawalKey
  });
  assertEqual(withdrawal.wallet.available, 100050, 'Prisma API wallet withdrawal debited');
  const withdrawalReplay = await postJson(`${baseUrl}/api/wallet/withdrawals`, userSession.token, {
    amount: 75,
    method: 'bank_wire',
    idempotencyKey: withdrawalKey
  });
  assertEqual(withdrawalReplay.withdrawal.reference, withdrawal.withdrawal.reference, 'Prisma API wallet withdrawal replay reference');
  assertEqual(withdrawalReplay.wallet.available, 100050, 'Prisma API wallet withdrawal replay balance');
  await postJsonExpectStatus(`${baseUrl}/api/wallet/withdrawals`, userSession.token, {
    amount: 76,
    method: 'bank_wire',
    idempotencyKey: withdrawalKey
  }, 409);

  const paymentRailLedger = await getJson(`${baseUrl}/api/wallet/${userSession.user.id}/ledger`, userSession.token);
  const depositLedgerEntries = paymentRailLedger.entries.filter((entry: { idempotencyKey: string; type: string }) =>
    entry.idempotencyKey === depositKey && entry.type === 'credit'
  );
  const withdrawalLedgerEntries = paymentRailLedger.entries.filter((entry: { idempotencyKey: string; type: string }) =>
    entry.idempotencyKey === withdrawalKey && entry.type === 'debit'
  );
  assertEqual(depositLedgerEntries.length, 1, 'Prisma API wallet deposit ledger count');
  assertEqual(withdrawalLedgerEntries.length, 1, 'Prisma API wallet withdrawal ledger count');

  await postJsonExpectStatus(`${baseUrl}/api/wallet/withdrawals`, userSession.token, {
    amount: 1500,
    method: 'bank_wire',
    idempotencyKey: `prisma-api-wallet-step-up-block-${suffix}`
  }, 403);
  const withdrawalStepUp = await postJson(`${baseUrl}/api/auth/step-up`, userSession.token, {
    password: 'very-secret-pass',
    scope: 'wallet:withdrawal'
  });
  if (typeof withdrawalStepUp.stepUpToken !== 'string' || withdrawalStepUp.stepUpToken.length < 20) {
    throw new Error('Expected Prisma API withdrawal step-up token');
  }

  const approvedHighValueWithdrawal = await postJson(`${baseUrl}/api/wallet/withdrawals`, userSession.token, {
    amount: 2500,
    method: 'bank_wire',
    idempotencyKey: `prisma-api-wallet-review-approved-${suffix}`
  }, {
    'X-Step-Up-Token': withdrawalStepUp.stepUpToken
  });
  assertEqual(approvedHighValueWithdrawal.wallet.available, 97550, 'Prisma API approved-review withdrawal holds available balance');
  assertEqual(approvedHighValueWithdrawal.wallet.locked, 2500, 'Prisma API approved-review withdrawal locks funds');
  assertEqual(approvedHighValueWithdrawal.withdrawal.status, 'pending_review', 'Prisma API approved-review withdrawal status');
  const approvedWithdrawalCases = await getJson(`${baseUrl}/api/admin/compliance/cases?subjectUserId=${encodeURIComponent(userSession.user.id)}&type=security&limit=10`, adminSession.token);
  const approvedReviewCase = approvedWithdrawalCases.cases.find((caseRecord: { evidence?: { reference?: string } }) =>
    caseRecord.evidence?.reference === approvedHighValueWithdrawal.withdrawal.reference
  );
  if (!approvedReviewCase) {
    throw new Error('Expected Prisma API approved withdrawal review case');
  }
  await postJson(`${baseUrl}/api/admin/compliance/cases/${approvedReviewCase.id}/notes`, adminSession.token, {
    note: 'Prisma smoke approved payout review.',
    action: 'closed',
    status: 'closed',
    outcome: 'approved_for_private_payout',
    evidence: {
      source: 'wallet_withdrawal_review',
      reference: approvedHighValueWithdrawal.withdrawal.reference
    }
  });
  const walletAfterApprovedReview = await getJson(`${baseUrl}/api/wallet/${userSession.user.id}`, userSession.token);
  assertEqual(walletAfterApprovedReview.available, 97550, 'Prisma API approved-review keeps available balance debited');
  assertEqual(walletAfterApprovedReview.locked, 0, 'Prisma API approved-review settles held funds');

  const rejectedHighValueWithdrawal = await postJson(`${baseUrl}/api/wallet/withdrawals`, userSession.token, {
    amount: 2600,
    method: 'bank_wire',
    idempotencyKey: `prisma-api-wallet-review-rejected-${suffix}`
  }, {
    'X-Step-Up-Token': withdrawalStepUp.stepUpToken
  });
  assertEqual(rejectedHighValueWithdrawal.wallet.available, 94950, 'Prisma API rejected-review withdrawal holds available balance');
  assertEqual(rejectedHighValueWithdrawal.wallet.locked, 2600, 'Prisma API rejected-review withdrawal locks funds');
  const rejectedWithdrawalCases = await getJson(`${baseUrl}/api/admin/compliance/cases?subjectUserId=${encodeURIComponent(userSession.user.id)}&type=security&limit=10`, adminSession.token);
  const rejectedReviewCase = rejectedWithdrawalCases.cases.find((caseRecord: { evidence?: { reference?: string } }) =>
    caseRecord.evidence?.reference === rejectedHighValueWithdrawal.withdrawal.reference
  );
  if (!rejectedReviewCase) {
    throw new Error('Expected Prisma API rejected withdrawal review case');
  }
  await postJson(`${baseUrl}/api/admin/compliance/cases/${rejectedReviewCase.id}/notes`, adminSession.token, {
    note: 'Prisma smoke rejected payout review.',
    action: 'closed',
    status: 'closed',
    outcome: 'rejected_private_payout',
    evidence: {
      source: 'wallet_withdrawal_review',
      reference: rejectedHighValueWithdrawal.withdrawal.reference
    }
  });
  const walletAfterRejectedReview = await getJson(`${baseUrl}/api/wallet/${userSession.user.id}`, userSession.token);
  assertEqual(walletAfterRejectedReview.available, 97550, 'Prisma API rejected-review returns held funds');
  assertEqual(walletAfterRejectedReview.locked, 0, 'Prisma API rejected-review clears held funds');
  const reviewedWithdrawalLedger = await getJson(`${baseUrl}/api/wallet/${userSession.user.id}/ledger`, userSession.token);
  if (!reviewedWithdrawalLedger.entries.some((entry: { type: string; metadata?: { complianceCaseId?: string; reference?: string } }) =>
    entry.type === 'settleLoss' &&
    entry.metadata?.complianceCaseId === approvedReviewCase.id &&
    entry.metadata?.reference === approvedHighValueWithdrawal.withdrawal.reference
  )) {
    throw new Error('Expected Prisma API approved withdrawal settlement ledger entry');
  }
  if (!reviewedWithdrawalLedger.entries.some((entry: { type: string; metadata?: { complianceCaseId?: string; reference?: string } }) =>
    entry.type === 'release' &&
    entry.metadata?.complianceCaseId === rejectedReviewCase.id &&
    entry.metadata?.reference === rejectedHighValueWithdrawal.withdrawal.reference
  )) {
    throw new Error('Expected Prisma API rejected withdrawal release ledger entry');
  }

  const walletBetKey = `prisma-api-wallet-bet-${suffix}`;
  const walletBet = await postJson(`${baseUrl}/api/bets`, userSession.token, {
    gameId: 'roulette',
    stake: 15,
    idempotencyKey: walletBetKey
  });
  const walletBetReplay = await postJson(`${baseUrl}/api/bets`, userSession.token, {
    gameId: 'roulette',
    stake: 15,
    idempotencyKey: walletBetKey
  });
  assertEqual(walletBetReplay.round.id, walletBet.round.id, 'Prisma API wallet bet replay round id');
  await postJsonExpectStatus(`${baseUrl}/api/bets`, userSession.token, {
    gameId: 'roulette',
    stake: 20,
    idempotencyKey: walletBetKey
  }, 409);
  await postJson(`${baseUrl}/api/rounds/${walletBet.round.id}/refund`, userSession.token, {
    idempotencyKey: `${walletBetKey}-refund`,
    reason: 'prisma-api-smoke-cleanup'
  });

  const bonusKey = `prisma-api-bonus-claim-${suffix}`;
  const bonusClaim = await postJson(`${baseUrl}/api/bonuses/welcome-match-500/claim`, userSession.token, {
    idempotencyKey: bonusKey
  });
  const bonusClaimReplay = await postJson(`${baseUrl}/api/bonuses/welcome-match-500/claim`, userSession.token, {
    idempotencyKey: bonusKey
  });
  assertEqual(bonusClaimReplay.claim.id, bonusClaim.claim.id, 'Prisma API bonus claim replay claim id');
  await postJsonExpectStatus(`${baseUrl}/api/bonuses/daily-free-credits-100/claim`, userSession.token, {
    idempotencyKey: bonusKey
  }, 409);

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
  const replayRegistryCount = await prisma.idempotencyRequest.count({
    where: {
      userId: userSession.user.id,
      scope: 'slots.spin',
      idempotencyKey: replayKey
    }
  });
  assertEqual(replayRegistryCount, 1, 'Prisma API replay registry record count');

  const rouletteKey = `prisma-api-roulette-replay-${suffix}`;
  const roulettePayload = {
    bets: {
      outside: {
        red: 10
      }
    },
    idempotencyKey: rouletteKey
  };
  const rouletteFirst = await postJson(`${baseUrl}/api/games/roulette/spin`, userSession.token, roulettePayload);
  const rouletteReplay = await postJson(`${baseUrl}/api/games/roulette/spin`, userSession.token, roulettePayload);
  assertEqual(rouletteReplay.round.id, rouletteFirst.round.id, 'Prisma API roulette replay round id');
  await postJsonExpectStatus(`${baseUrl}/api/games/roulette/spin`, userSession.token, {
    bets: {
      outside: {
        black: 10
      }
    },
    idempotencyKey: rouletteKey
  }, 409);
  const rouletteRegistryCount = await prisma.idempotencyRequest.count({
    where: {
      userId: userSession.user.id,
      scope: 'roulette.spin',
      idempotencyKey: rouletteKey
    }
  });
  assertEqual(rouletteRegistryCount, 1, 'Prisma API roulette registry record count');

  const crashKey = `prisma-api-crash-replay-${suffix}`;
  const crashFirst = await postJson(`${baseUrl}/api/games/crash/start`, userSession.token, {
    stake: 10,
    idempotencyKey: crashKey
  });
  const crashReplay = await postJson(`${baseUrl}/api/games/crash/start`, userSession.token, {
    stake: 10,
    idempotencyKey: crashKey
  });
  assertEqual(crashReplay.round.id, crashFirst.round.id, 'Prisma API crash replay round id');
  await postJsonExpectStatus(`${baseUrl}/api/games/crash/start`, userSession.token, {
    stake: 20,
    idempotencyKey: crashKey
  }, 409);
  const crashRegistryCount = await prisma.idempotencyRequest.count({
    where: {
      userId: userSession.user.id,
      scope: 'crash.start',
      idempotencyKey: crashKey
    }
  });
  assertEqual(crashRegistryCount, 1, 'Prisma API crash registry record count');
  await postJson(`${baseUrl}/api/games/crash/${crashFirst.round.id}/cashout`, userSession.token, {
    cashoutMultiplier: 1,
    idempotencyKey: `${crashKey}-cashout`
  });

  const blackjackKey = `prisma-api-blackjack-replay-${suffix}`;
  const blackjackFirst = await postJson(`${baseUrl}/api/games/blackjack/start`, userSession.token, {
    stake: 10,
    idempotencyKey: blackjackKey
  });
  const blackjackReplay = await postJson(`${baseUrl}/api/games/blackjack/start`, userSession.token, {
    stake: 10,
    idempotencyKey: blackjackKey
  });
  assertEqual(blackjackReplay.round.id, blackjackFirst.round.id, 'Prisma API blackjack replay round id');
  await postJsonExpectStatus(`${baseUrl}/api/games/blackjack/start`, userSession.token, {
    stake: 20,
    idempotencyKey: blackjackKey
  }, 409);
  const blackjackRegistryCount = await prisma.idempotencyRequest.count({
    where: {
      userId: userSession.user.id,
      scope: 'blackjack.start',
      idempotencyKey: blackjackKey
    }
  });
  assertEqual(blackjackRegistryCount, 1, 'Prisma API blackjack registry record count');
  if (blackjackFirst.round.status === 'open') {
    await postJson(`${baseUrl}/api/rounds/${blackjackFirst.round.id}/refund`, userSession.token, {
      idempotencyKey: `${blackjackKey}-refund`,
      reason: 'prisma-api-smoke-cleanup'
    });
  }

  const pokerKey = `prisma-api-poker-replay-${suffix}`;
  const pokerFirst = await postJson(`${baseUrl}/api/games/poker/start`, userSession.token, {
    ante: 10,
    idempotencyKey: pokerKey
  });
  const pokerReplay = await postJson(`${baseUrl}/api/games/poker/start`, userSession.token, {
    ante: 10,
    idempotencyKey: pokerKey
  });
  assertEqual(pokerReplay.round.id, pokerFirst.round.id, 'Prisma API poker replay round id');
  await postJsonExpectStatus(`${baseUrl}/api/games/poker/start`, userSession.token, {
    ante: 20,
    idempotencyKey: pokerKey
  }, 409);
  const pokerRegistryCount = await prisma.idempotencyRequest.count({
    where: {
      userId: userSession.user.id,
      scope: 'poker.start',
      idempotencyKey: pokerKey
    }
  });
  assertEqual(pokerRegistryCount, 1, 'Prisma API poker registry record count');
  if (pokerFirst.round.status === 'open') {
    await postJson(`${baseUrl}/api/rounds/${pokerFirst.round.id}/refund`, userSession.token, {
      idempotencyKey: `${pokerKey}-refund`,
      reason: 'prisma-api-smoke-cleanup'
    });
  }

  const blackjackActionStartKey = `prisma-api-blackjack-action-start-${suffix}`;
  let blackjackActionStart = await postJson(`${baseUrl}/api/games/blackjack/start`, userSession.token, {
    stake: 10,
    idempotencyKey: blackjackActionStartKey
  });
  for (let attempt = 1; blackjackActionStart.round.status !== 'open' && attempt <= 4; attempt += 1) {
    blackjackActionStart = await postJson(`${baseUrl}/api/games/blackjack/start`, userSession.token, {
      stake: 10,
      idempotencyKey: `${blackjackActionStartKey}-${attempt}`
    });
  }
  if (blackjackActionStart.round.status !== 'open') {
    throw new Error('Expected an open blackjack round for action idempotency smoke');
  }
  const blackjackActionKey = `prisma-api-blackjack-action-replay-${suffix}`;
  const blackjackStand = await postJson(`${baseUrl}/api/games/blackjack/${blackjackActionStart.round.id}/action`, userSession.token, {
    action: 'stand',
    idempotencyKey: blackjackActionKey
  });
  const blackjackStandReplay = await postJson(`${baseUrl}/api/games/blackjack/${blackjackActionStart.round.id}/action`, userSession.token, {
    action: 'stand',
    idempotencyKey: blackjackActionKey
  });
  assertEqual(blackjackStandReplay.round.id, blackjackStand.round.id, 'Prisma API blackjack action replay round id');
  assertEqual(blackjackStandReplay.round.status, 'settled', 'Prisma API blackjack action replay settled status');
  await postJsonExpectStatus(`${baseUrl}/api/games/blackjack/${blackjackActionStart.round.id}/action`, userSession.token, {
    action: 'hit',
    idempotencyKey: blackjackActionKey
  }, 409);
  const blackjackActionRegistryCount = await prisma.idempotencyRequest.count({
    where: {
      userId: userSession.user.id,
      scope: 'blackjack.action',
      idempotencyKey: blackjackActionKey
    }
  });
  assertEqual(blackjackActionRegistryCount, 1, 'Prisma API blackjack action registry record count');

  let blackjackHitStart: any | undefined;
  let blackjackHit: any | undefined;
  let blackjackHitKey = '';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const startKey = `prisma-api-blackjack-hit-start-${suffix}-${attempt}`;
    const candidate = await postJson(`${baseUrl}/api/games/blackjack/start`, userSession.token, {
      stake: 10,
      idempotencyKey: startKey
    });
    if (candidate.round.status !== 'open') continue;
    const hitKey = `prisma-api-blackjack-hit-replay-${suffix}-${attempt}`;
    const hit = await postJson(`${baseUrl}/api/games/blackjack/${candidate.round.id}/action`, userSession.token, {
      action: 'hit',
      idempotencyKey: hitKey
    });
    if (hit.round.status !== 'open') continue;
    blackjackHitStart = candidate;
    blackjackHit = hit;
    blackjackHitKey = hitKey;
    break;
  }
  if (!blackjackHitStart || !blackjackHit) {
    throw new Error('Expected an open blackjack hit result for stored response replay smoke');
  }
  const blackjackHitReplay = await postJson(`${baseUrl}/api/games/blackjack/${blackjackHitStart.round.id}/action`, userSession.token, {
    action: 'hit',
    idempotencyKey: blackjackHitKey
  });
  assertEqual(
    blackjackHitReplay.view.playerHand.length,
    blackjackHit.view.playerHand.length,
    'Prisma API blackjack hit replay does not draw another card'
  );
  assertEqual(blackjackHitReplay.view.playerScore, blackjackHit.view.playerScore, 'Prisma API blackjack hit replay score');
  await postJsonExpectStatus(`${baseUrl}/api/games/blackjack/${blackjackHitStart.round.id}/action`, userSession.token, {
    action: 'stand',
    idempotencyKey: blackjackHitKey
  }, 409);
  await postJson(`${baseUrl}/api/games/blackjack/${blackjackHitStart.round.id}/action`, userSession.token, {
    action: 'stand',
    idempotencyKey: `${blackjackHitKey}-cleanup`
  });

  const pokerActionStartKey = `prisma-api-poker-action-start-${suffix}`;
  const pokerActionStart = await postJson(`${baseUrl}/api/games/poker/start`, userSession.token, {
    ante: 10,
    idempotencyKey: pokerActionStartKey
  });
  const pokerActionKey = `prisma-api-poker-action-replay-${suffix}`;
  const pokerFold = await postJson(`${baseUrl}/api/games/poker/${pokerActionStart.round.id}/action`, userSession.token, {
    action: 'fold',
    idempotencyKey: pokerActionKey
  });
  const pokerFoldReplay = await postJson(`${baseUrl}/api/games/poker/${pokerActionStart.round.id}/action`, userSession.token, {
    action: 'fold',
    idempotencyKey: pokerActionKey
  });
  assertEqual(pokerFoldReplay.round.id, pokerFold.round.id, 'Prisma API poker action replay round id');
  assertEqual(pokerFoldReplay.round.status, 'settled', 'Prisma API poker action replay settled status');
  await postJsonExpectStatus(`${baseUrl}/api/games/poker/${pokerActionStart.round.id}/action`, userSession.token, {
    action: 'check',
    idempotencyKey: pokerActionKey
  }, 409);
  const pokerActionRegistryCount = await prisma.idempotencyRequest.count({
    where: {
      userId: userSession.user.id,
      scope: 'poker.action',
      idempotencyKey: pokerActionKey
    }
  });
  assertEqual(pokerActionRegistryCount, 1, 'Prisma API poker action registry record count');

  const pokerCheckStartKey = `prisma-api-poker-check-start-${suffix}`;
  const pokerCheckStart = await postJson(`${baseUrl}/api/games/poker/start`, userSession.token, {
    ante: 10,
    idempotencyKey: pokerCheckStartKey
  });
  const pokerCheckKey = `prisma-api-poker-check-replay-${suffix}`;
  const pokerCheck = await postJson(`${baseUrl}/api/games/poker/${pokerCheckStart.round.id}/action`, userSession.token, {
    action: 'check',
    idempotencyKey: pokerCheckKey
  });
  const pokerCheckReplay = await postJson(`${baseUrl}/api/games/poker/${pokerCheckStart.round.id}/action`, userSession.token, {
    action: 'check',
    idempotencyKey: pokerCheckKey
  });
  assertEqual(pokerCheckReplay.view.stage, pokerCheck.view.stage, 'Prisma API poker check replay stage');
  assertEqual(
    pokerCheckReplay.view.communityCards.length,
    pokerCheck.view.communityCards.length,
    'Prisma API poker check replay does not advance community cards'
  );
  await postJsonExpectStatus(`${baseUrl}/api/games/poker/${pokerCheckStart.round.id}/action`, userSession.token, {
    action: 'raise',
    idempotencyKey: pokerCheckKey
  }, 409);
  await postJson(`${baseUrl}/api/games/poker/${pokerCheckStart.round.id}/action`, userSession.token, {
    action: 'fold',
    idempotencyKey: `${pokerCheckKey}-cleanup`
  });

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
